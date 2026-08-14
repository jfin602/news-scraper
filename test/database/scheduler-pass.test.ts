import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, test } from 'node:test';

import {
  listDueEndpoints,
  type DueEndpoint,
} from '../../src/collection/scheduler/due-endpoint-repository.ts';
import { runSchedulerPass } from '../../src/collection/scheduler/scheduler-pass.ts';
import {
  createDatabase,
  type Database,
  type QueryExecutor,
} from '../../src/database/database.ts';
import {
  claimNextEndpointCollectionJob,
  enqueueEndpointCollectionJob,
  terminalizeEndpointCollectionJob,
} from '../../src/jobs/endpoint-collection-job-repository.ts';
import {
  bootstrapPublicationTree,
  parseBootstrapDocument,
} from '../../src/publication/bootstrap.ts';
import {
  findSourceByConfigKey,
  findSourceEndpointBySourceAndConfigKey,
  type PersistedSourceEndpoint,
} from '../../src/sources/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const fixtureUrl = new URL(
  '../fixtures/generic-bootstrap.json',
  import.meta.url,
);
const NOW = new Date('2026-08-11T12:00:00.000Z');
const FUTURE = new Date('2026-08-11T12:10:00.000Z');
const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

test('scheduler selects singleton-eligible initial and elapsed due endpoints without advancing due state', async () => {
  await withSchedulerDatabase(async (database, [endpointA, endpointB]) => {
    const summary = await runSchedulerPass(database, {
      now: NOW,
      random: () => 0,
    });
    assert.deepEqual(summary, {
      considered: 2,
      enqueued: 2,
      alreadyOutstanding: 0,
    });
    const jobs = await database.query<{
      source_endpoint_id: string;
      trigger_kind: string;
      available_at: Date;
    }>(
      `SELECT source_endpoint_id, trigger_kind, available_at
       FROM endpoint_collection_jobs
       ORDER BY source_endpoint_id`,
    );
    assert.deepEqual(
      new Set(jobs.rows.map((row) => row.source_endpoint_id)),
      new Set([endpointA.id, endpointB.id]),
    );
    assert.deepEqual(
      jobs.rows.map((row) => row.available_at.toISOString()),
      [NOW.toISOString(), NOW.toISOString()],
    );
    assert.deepEqual(
      jobs.rows.map((row) => row.trigger_kind),
      ['scheduled', 'scheduled'],
    );
    const runtime = await database.query<{
      id: string;
      next_due_at: Date | null;
    }>('SELECT id, next_due_at FROM source_endpoints ORDER BY id');
    assert.deepEqual(
      runtime.rows.map((row) => row.next_due_at),
      [null, null],
    );
  });
});

test('scheduler stops all work when singleton collection is inactive or absent', async () => {
  await withSchedulerDatabase(async (database) => {
    await database.query(
      'UPDATE publication_settings SET active_for_collection = FALSE',
    );
    assert.deepEqual(
      await runSchedulerPass(database, { now: NOW, random: () => 0 }),
      { considered: 0, enqueued: 0, alreadyOutstanding: 0 },
    );
    await database.query('DELETE FROM publication_settings');
    assert.deepEqual(
      await runSchedulerPass(database, { now: NOW, random: () => 0 }),
      { considered: 0, enqueued: 0, alreadyOutstanding: 0 },
    );
  });
});

test('scheduler observes elapsed due times and cooldown boundaries', async () => {
  await withSchedulerDatabase(async (database, [endpointA, endpointB]) => {
    await database.query(
      'UPDATE source_endpoints SET next_due_at = $1 WHERE id = $2',
      [NOW, endpointA.id],
    );
    await database.query(
      'UPDATE source_endpoints SET next_due_at = $1 WHERE id = $2',
      [FUTURE, endpointB.id],
    );
    assert.deepEqual(
      await runSchedulerPass(database, { now: NOW, random: () => 0 }),
      { considered: 1, enqueued: 1, alreadyOutstanding: 0 },
    );

    await database.query('DELETE FROM endpoint_collection_jobs');
    await database.query(
      `UPDATE source_endpoints
       SET next_due_at = $1, cooldown_until = $2
       WHERE id = $3`,
      [NOW, FUTURE, endpointA.id],
    );
    await database.query(
      'UPDATE source_endpoints SET next_due_at = $1 WHERE id = $2',
      [new Date('2026-08-11T12:20:00.000Z'), endpointB.id],
    );
    assert.deepEqual(
      await runSchedulerPass(database, { now: NOW, random: () => 0 }),
      { considered: 0, enqueued: 0, alreadyOutstanding: 0 },
    );
    assert.deepEqual(
      await runSchedulerPass(database, { now: FUTURE, random: () => 0 }),
      { considered: 1, enqueued: 1, alreadyOutstanding: 0 },
    );
  });
});

test('scheduler excludes every non-collectable Source and endpoint state', async () => {
  await withSchedulerDatabase(async (database, [endpointA, endpointB]) => {
    const sourceA = await findSourceByConfigKey(database, 'circuit_journal');
    assert.ok(sourceA);
    await database.query(
      'UPDATE source_endpoints SET next_due_at = $1 WHERE id = $2',
      [FUTURE, endpointB.id],
    );
    const exclusions = [
      ['sources', 'approval_state', 'unapproved'],
      ['sources', 'lifecycle_state', 'archived'],
      ['sources', 'operational_state', 'paused'],
      ['sources', 'operational_state', 'disabled'],
      ['source_endpoints', 'approval_state', 'unapproved'],
      ['source_endpoints', 'lifecycle_state', 'archived'],
      ['source_endpoints', 'operational_state', 'paused'],
      ['source_endpoints', 'operational_state', 'disabled'],
    ] as const;

    for (const [table, column, value] of exclusions) {
      await database.query(
        `UPDATE sources
         SET approval_state = 'approved', lifecycle_state = 'active', operational_state = 'enabled'
         WHERE id = $1`,
        [sourceA.id],
      );
      await database.query(
        `UPDATE source_endpoints
         SET approval_state = 'approved', lifecycle_state = 'active', operational_state = 'enabled'
         WHERE id = $1`,
        [endpointA.id],
      );
      const targetId = table === 'sources' ? sourceA.id : endpointA.id;
      await database.query(`UPDATE ${table} SET ${column} = $1 WHERE id = $2`, [
        value,
        targetId,
      ]);
      assert.deepEqual(
        await runSchedulerPass(database, { now: NOW, random: () => 0 }),
        { considered: 0, enqueued: 0, alreadyOutstanding: 0 },
        `${table}.${column}=${value} must not schedule`,
      );
    }
  });
});

test('scheduler uses null-first oldest-due ordering with a bounded batch and endpoint-id tie break', async () => {
  await withSchedulerDatabase(async (database, [endpointA, endpointB]) => {
    const sourceA = await findSourceByConfigKey(database, 'circuit_journal');
    assert.ok(sourceA);
    const endpointC = await addEligibleEndpoint(
      database,
      sourceA.id,
      'late_feed',
    );
    const endpointD = await addEligibleEndpoint(
      database,
      sourceA.id,
      'tie_feed',
    );
    const oldest = new Date('2026-08-11T11:50:00.000Z');
    const tie = new Date('2026-08-11T11:55:00.000Z');
    await database.query(
      'UPDATE source_endpoints SET next_due_at = $1 WHERE id = $2',
      [tie, endpointB.id],
    );
    await database.query(
      'UPDATE source_endpoints SET next_due_at = $1 WHERE id = $2',
      [oldest, endpointC.id],
    );
    await database.query(
      'UPDATE source_endpoints SET next_due_at = $1 WHERE id = $2',
      [tie, endpointD.id],
    );
    const batch = await listDueEndpoints(database, NOW, 2);
    assert.deepEqual(
      batch.map((endpoint) => endpoint.id),
      [endpointA.id, endpointC.id],
    );
    const allDue = await listDueEndpoints(database, NOW, 10);
    assert.deepEqual(
      allDue.slice(2).map((endpoint) => endpoint.id),
      [endpointB.id, endpointD.id].toSorted(),
    );
  });
});

test('queued and running jobs suppress scheduling while terminal jobs allow a new due job', async () => {
  await withSchedulerDatabase(async (database, [endpointA, endpointB]) => {
    await database.query(
      'UPDATE source_endpoints SET next_due_at = $1 WHERE id = $2',
      [FUTURE, endpointB.id],
    );
    const queued = await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpointA.id,
      triggerKind: 'manual',
      availableAt: NOW,
      attemptNumber: 1,
    });
    assert.deepEqual(
      await runSchedulerPass(database, { now: NOW, random: () => 0 }),
      { considered: 0, enqueued: 0, alreadyOutstanding: 0 },
    );
    const running = await claimNextEndpointCollectionJob(database, {
      workerId: 'scheduler_state_test',
      claimedAt: NOW,
      leaseExpiresAt: FUTURE,
    });
    assert.equal(running?.id, queued.job.id);
    assert.equal(running?.triggerKind, 'manual');
    assert.deepEqual(
      await runSchedulerPass(database, { now: NOW, random: () => 0 }),
      { considered: 0, enqueued: 0, alreadyOutstanding: 0 },
    );
    await terminalizeEndpointCollectionJob(
      database,
      running!.id,
      running!.claimToken!,
      { status: 'succeeded', terminalAt: NOW, outcomeCode: 'collected' },
    );
    assert.deepEqual(
      await runSchedulerPass(database, { now: NOW, random: () => 0 }),
      { considered: 1, enqueued: 1, alreadyOutstanding: 0 },
    );
    const replacement = await database.query<{ trigger_kind: string }>(
      `SELECT trigger_kind
       FROM endpoint_collection_jobs
       WHERE source_endpoint_id = $1 AND status = 'queued'`,
      [endpointA.id],
    );
    assert.equal(replacement.rows[0]?.trigger_kind, 'scheduled');
  });
});

test('competing scheduler passes converge on one outstanding job per endpoint and continue unrelated work', async () => {
  await withSchedulerDatabase(async (database, [, endpointB]) => {
    const barrier = twoPartyInsertBarrier();
    const results = await Promise.all([
      runSchedulerPass(barrier.executor(database), {
        now: NOW,
        random: () => 0,
      }),
      runSchedulerPass(barrier.executor(database), {
        now: NOW,
        random: () => 0,
      }),
    ]);
    assert.equal(
      results.reduce((total, result) => total + result.enqueued, 0),
      2,
    );
    assert.equal(
      results.reduce((total, result) => total + result.alreadyOutstanding, 0),
      2,
    );
    const jobs = await database.query<{
      source_endpoint_id: string;
      count: string;
    }>(
      `SELECT source_endpoint_id, count(*)
       FROM endpoint_collection_jobs
       WHERE status IN ('queued', 'running')
       GROUP BY source_endpoint_id`,
    );
    assert.equal(jobs.rows.length, 2);
    assert.ok(jobs.rows.some((row) => row.source_endpoint_id === endpointB.id));
    assert.deepEqual(
      jobs.rows.map((row) => Number(row.count)),
      [1, 1],
    );
  });
});

async function withSchedulerDatabase(
  work: (
    database: Database,
    endpoints: readonly [PersistedSourceEndpoint, PersistedSourceEndpoint],
  ) => Promise<void>,
): Promise<void> {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const document = parseBootstrapDocument(
        await readFile(fixtureUrl, 'utf8'),
      );
      await bootstrapPublicationTree(database, document);
      const sourceA = await findSourceByConfigKey(database, 'circuit_journal');
      const sourceB = await findSourceByConfigKey(database, 'research_wire');
      assert.ok(sourceA);
      assert.ok(sourceB);
      const endpointA = await findSourceEndpointBySourceAndConfigKey(
        database,
        sourceA.id,
        'main_feed',
      );
      const endpointB = await findSourceEndpointBySourceAndConfigKey(
        database,
        sourceB.id,
        'updates_feed',
      );
      assert.ok(endpointA);
      assert.ok(endpointB);
      await work(database, [endpointA, endpointB]);
    } finally {
      await database.close();
    }
  });
}

async function addEligibleEndpoint(
  database: Database,
  sourceId: string,
  configKey: string,
): Promise<DueEndpoint> {
  const id = randomUUID();
  const result = await database.query<{
    id: string;
    poll_interval_seconds: number;
    next_due_at: Date | null;
  }>(
    `INSERT INTO source_endpoints (
       id, source_id, config_key, endpoint_url, endpoint_type,
       approval_state, lifecycle_state, operational_state, poll_interval_seconds
     ) VALUES ($1, $2, $3, $4, 'rss_atom', 'approved', 'active', 'enabled', 300)
     RETURNING id, poll_interval_seconds, next_due_at`,
    [id, sourceId, configKey, `https://${configKey}.circuit.example/feed.xml`],
  );
  const row = result.rows[0];
  assert.ok(row);
  return {
    id: row.id,
    pollIntervalSeconds: row.poll_interval_seconds,
    nextDueAt: row.next_due_at ?? undefined,
  };
}

function twoPartyInsertBarrier(): {
  executor(database: Database): QueryExecutor;
} {
  let arrivals = 0;
  let release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    executor(database) {
      return {
        async query(text, values) {
          if (
            arrivals < 2 &&
            text.includes('INSERT INTO endpoint_collection_jobs')
          ) {
            arrivals += 1;
            if (arrivals === 2) release!();
            await ready;
          }
          return database.query(text, values);
        },
      };
    },
  };
}
