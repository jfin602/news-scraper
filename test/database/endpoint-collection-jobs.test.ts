import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { startCollectionRun } from '../../src/collection/runs/repository.ts';
import { createDatabase, type Database } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  attachCollectionRunToEndpointCollectionJob,
  claimNextEndpointCollectionJob,
  deferClaimedEndpointCollectionJob,
  EndpointCollectionJobPersistenceError,
  enqueueEndpointCollectionJob,
  findEndpointCollectionJobById,
  listExpiredRunningEndpointCollectionJobs,
  renewEndpointCollectionJobLease,
  requeueExpiredUnstartedEndpointCollectionJob,
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
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const fixtureUrl = new URL(
  '../fixtures/generic-bootstrap.json',
  import.meta.url,
);
const T1000 = new Date('2026-08-11T10:00:00.000Z');
const T1001 = new Date('2026-08-11T10:01:00.000Z');
const T1002 = new Date('2026-08-11T10:02:00.000Z');
const T1005 = new Date('2026-08-11T10:05:00.000Z');
const T1006 = new Date('2026-08-11T10:06:00.000Z');
const T1010 = new Date('2026-08-11T10:10:00.000Z');

test('enqueues at most one outstanding job per real endpoint under concurrency', async () => {
  await withJobDatabase(async (database, [endpointA, endpointB]) => {
    const first = await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpointA.id,
      availableAt: T1000,
      attemptNumber: 1,
    });
    assert.equal(first.created, true);
    assert.equal(first.job.status, 'queued');
    assert.equal(first.job.sourceEndpointId, endpointA.id);
    assert.equal(first.job.availableAt.toISOString(), T1000.toISOString());
    assert.equal(first.job.attemptNumber, 1);

    const duplicate = await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpointA.id,
      availableAt: T1001,
      attemptNumber: 1,
    });
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.job.id, first.job.id);

    const racing = await Promise.all(
      Array.from({ length: 8 }, () =>
        enqueueEndpointCollectionJob(database, {
          sourceEndpointId: endpointB.id,
          availableAt: T1000,
          attemptNumber: 1,
        }),
      ),
    );
    assert.equal(racing.filter((result) => result.created).length, 1);
    assert.equal(new Set(racing.map((result) => result.job.id)).size, 1);

    const counts = await database.query<{
      source_endpoint_id: string;
      outstanding_count: string;
    }>(
      `SELECT source_endpoint_id, count(*) AS outstanding_count
       FROM endpoint_collection_jobs
       WHERE status IN ('queued', 'running')
       GROUP BY source_endpoint_id
       ORDER BY source_endpoint_id`,
    );
    assert.equal(counts.rows.length, 2);
    assert.deepEqual(
      counts.rows.map((row) => Number(row.outstanding_count)),
      [1, 1],
    );

    await assert.rejects(
      enqueueEndpointCollectionJob(database, {
        sourceEndpointId: randomUUID(),
        availableAt: T1000,
        attemptNumber: 1,
      }),
      EndpointCollectionJobPersistenceError,
    );
    await assert.rejects(
      enqueueEndpointCollectionJob(database, {
        sourceEndpointId: endpointA.id,
        availableAt: new Date('invalid'),
        attemptNumber: 1,
      }),
      EndpointCollectionJobPersistenceError,
    );
  });
});

test('claims due jobs deterministically and prevents duplicate concurrent ownership', async () => {
  await withJobDatabase(async (database, [endpointA, endpointB]) => {
    const earlier = await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpointA.id,
      availableAt: T1000,
      attemptNumber: 1,
    });
    await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpointB.id,
      availableAt: T1010,
      attemptNumber: 1,
    });

    const claims = await Promise.all([
      claimNextEndpointCollectionJob(database, {
        workerId: 'worker_a',
        claimedAt: T1001,
        leaseExpiresAt: T1005,
      }),
      claimNextEndpointCollectionJob(database, {
        workerId: 'worker_b',
        claimedAt: T1001,
        leaseExpiresAt: T1005,
      }),
    ]);
    const claimed = claims.filter((job) => job !== undefined);
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0]?.id, earlier.job.id);
    assert.equal(new Set(claimed.map((job) => job.claimToken)).size, 1);
    assert.equal(
      await claimNextEndpointCollectionJob(database, {
        workerId: 'worker_c',
        claimedAt: T1002,
        leaseExpiresAt: T1006,
      }),
      undefined,
    );

    const terminal = await terminalizeEndpointCollectionJob(
      database,
      claimed[0]!.id,
      claimed[0]!.claimToken!,
      {
        status: 'skipped',
        terminalAt: T1002,
        outcomeCode: 'eligibility_blocked',
        reasonCode: 'endpoint_paused',
      },
    );
    assert.equal(terminal?.status, 'skipped');

    const successor = await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpointA.id,
      availableAt: T1010,
      attemptNumber: 2,
      previousJobId: earlier.job.id,
    });
    assert.equal(successor.created, true);
    const unrelatedClaims = await Promise.all([
      claimNextEndpointCollectionJob(database, {
        workerId: 'worker_b',
        claimedAt: T1010,
        leaseExpiresAt: new Date('2026-08-11T10:15:00.000Z'),
      }),
      claimNextEndpointCollectionJob(database, {
        workerId: 'worker_c',
        claimedAt: T1010,
        leaseExpiresAt: new Date('2026-08-11T10:15:00.000Z'),
      }),
    ]);
    assert.equal(unrelatedClaims.filter((job) => job !== undefined).length, 2);
    assert.deepEqual(
      new Set(unrelatedClaims.map((job) => job?.sourceEndpointId)),
      new Set([endpointA.id, endpointB.id]),
    );
    assert.equal(
      new Set(unrelatedClaims.map((job) => job?.claimToken)).size,
      2,
    );
  });
});

test('guards lease, run attachment, terminalization, deferral, and successors by claim token', async () => {
  await withJobDatabase(async (database, [endpointA, endpointB]) => {
    const enqueued = await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpointA.id,
      availableAt: T1000,
      attemptNumber: 1,
    });
    const claimed = await claimNextEndpointCollectionJob(database, {
      workerId: 'worker_owner',
      claimedAt: T1000,
      leaseExpiresAt: T1005,
    });
    assert.ok(claimed);
    const staleToken = randomUUID();

    assert.equal(
      await renewEndpointCollectionJobLease(
        database,
        claimed.id,
        staleToken,
        T1001,
        T1010,
      ),
      undefined,
    );
    const renewed = await renewEndpointCollectionJobLease(
      database,
      claimed.id,
      claimed.claimToken!,
      T1001,
      T1010,
    );
    assert.equal(renewed?.leaseExpiresAt?.toISOString(), T1010.toISOString());

    const wrongEndpointRun = await startCollectionRun(database, {
      sourceEndpointId: endpointB.id,
      executionId: 'wrong-endpoint-run',
    });
    assert.equal(
      await attachCollectionRunToEndpointCollectionJob(
        database,
        claimed.id,
        claimed.claimToken!,
        wrongEndpointRun.id,
        T1002,
      ),
      undefined,
    );
    const run = await startCollectionRun(database, {
      sourceEndpointId: endpointA.id,
      executionId: claimed.id,
      triggerKind: 'scheduled',
    });
    assert.equal(
      await attachCollectionRunToEndpointCollectionJob(
        database,
        claimed.id,
        staleToken,
        run.id,
        T1002,
      ),
      undefined,
    );
    const attached = await attachCollectionRunToEndpointCollectionJob(
      database,
      claimed.id,
      claimed.claimToken!,
      run.id,
      T1002,
    );
    assert.equal(attached?.collectionRunId, run.id);
    assert.equal(
      await deferClaimedEndpointCollectionJob(
        database,
        claimed.id,
        claimed.claimToken!,
        T1002,
        T1005,
      ),
      undefined,
    );
    assert.equal(
      await terminalizeEndpointCollectionJob(database, claimed.id, staleToken, {
        status: 'succeeded',
        terminalAt: T1002,
        outcomeCode: 'collected',
      }),
      undefined,
    );

    const terminal = await terminalizeEndpointCollectionJob(
      database,
      claimed.id,
      claimed.claimToken!,
      {
        status: 'succeeded',
        terminalAt: T1002,
        outcomeCode: 'collected',
      },
    );
    assert.equal(terminal?.status, 'succeeded');
    assert.equal(terminal?.claimToken, undefined);
    assert.equal(terminal?.leaseExpiresAt, undefined);
    assert.equal(terminal?.claimWorkerId, 'worker_owner');
    assert.equal(terminal?.collectionRunId, run.id);

    const successor = await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpointA.id,
      availableAt: T1005,
      attemptNumber: 2,
      previousJobId: enqueued.job.id,
    });
    assert.equal(successor.created, true);
    assert.equal(successor.job.previousJobId, enqueued.job.id);
    assert.equal(successor.job.attemptNumber, 2);

    await assert.rejects(
      enqueueEndpointCollectionJob(database, {
        sourceEndpointId: endpointB.id,
        availableAt: T1005,
        attemptNumber: 2,
        previousJobId: enqueued.job.id,
      }),
    );
    for (const invalid of [
      { attemptNumber: 0 },
      { attemptNumber: 1, previousJobId: enqueued.job.id },
      { attemptNumber: 2 },
    ]) {
      await assert.rejects(
        enqueueEndpointCollectionJob(database, {
          sourceEndpointId: endpointB.id,
          availableAt: T1005,
          ...invalid,
        }),
        EndpointCollectionJobPersistenceError,
      );
    }
  });
});

test('recovers only expired unstarted claims and rejects the former owner', async () => {
  await withJobDatabase(async (database, [endpointA, endpointB]) => {
    await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpointA.id,
      availableAt: T1000,
      attemptNumber: 1,
    });
    const unstarted = await claimNextEndpointCollectionJob(database, {
      workerId: 'stale_worker',
      claimedAt: T1000,
      leaseExpiresAt: T1005,
    });
    assert.ok(unstarted);

    await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpointB.id,
      availableAt: T1000,
      attemptNumber: 1,
    });
    const started = await claimNextEndpointCollectionJob(database, {
      workerId: 'started_worker',
      claimedAt: T1000,
      leaseExpiresAt: T1005,
    });
    assert.ok(started);
    const run = await startCollectionRun(database, {
      sourceEndpointId: endpointB.id,
      executionId: started.id,
      triggerKind: 'scheduled',
    });
    assert.equal(
      (
        await attachCollectionRunToEndpointCollectionJob(
          database,
          started.id,
          started.claimToken!,
          run.id,
          T1001,
        )
      )?.collectionRunId,
      run.id,
    );

    const firstExpired = await listExpiredRunningEndpointCollectionJobs(
      database,
      T1006,
      1,
    );
    assert.equal(firstExpired.length, 1);
    assert.equal(firstExpired[0]?.id, [unstarted.id, started.id].toSorted()[0]);
    const expired = await listExpiredRunningEndpointCollectionJobs(
      database,
      T1006,
      10,
    );
    assert.deepEqual(
      new Set(expired.map((job) => job.id)),
      new Set([unstarted.id, started.id]),
    );
    assert.equal(
      expired.find((job) => job.id === started.id)?.collectionRunId,
      run.id,
    );

    const recovered = await requeueExpiredUnstartedEndpointCollectionJob(
      database,
      unstarted.id,
      T1006,
      T1006,
    );
    assert.equal(recovered?.status, 'queued');
    assert.equal(recovered?.claimToken, undefined);
    assert.equal(
      await requeueExpiredUnstartedEndpointCollectionJob(
        database,
        started.id,
        T1006,
        T1006,
      ),
      undefined,
    );
    assert.equal(
      (await findEndpointCollectionJobById(database, started.id))?.status,
      'running',
    );

    assert.equal(
      await renewEndpointCollectionJobLease(
        database,
        unstarted.id,
        unstarted.claimToken!,
        T1006,
        T1010,
      ),
      undefined,
    );
    assert.equal(
      await terminalizeEndpointCollectionJob(
        database,
        unstarted.id,
        unstarted.claimToken!,
        {
          status: 'abandoned',
          terminalAt: T1006,
          outcomeCode: 'worker_interrupted',
        },
      ),
      undefined,
    );
    const reassigned = await claimNextEndpointCollectionJob(database, {
      workerId: 'replacement_worker',
      claimedAt: T1006,
      leaseExpiresAt: T1010,
    });
    assert.equal(reassigned?.id, unstarted.id);
    assert.notEqual(reassigned?.claimToken, unstarted.claimToken);
  });
});

test('defers an active unstarted claim without changing attempt identity', async () => {
  await withJobDatabase(async (database, [endpointA]) => {
    const enqueued = await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpointA.id,
      availableAt: T1000,
      attemptNumber: 1,
    });
    const claimed = await claimNextEndpointCollectionJob(database, {
      workerId: 'worker_a',
      claimedAt: T1000,
      leaseExpiresAt: T1005,
    });
    assert.ok(claimed);
    const deferred = await deferClaimedEndpointCollectionJob(
      database,
      claimed.id,
      claimed.claimToken!,
      T1001,
      T1010,
    );
    assert.equal(deferred?.id, enqueued.job.id);
    assert.equal(deferred?.status, 'queued');
    assert.equal(deferred?.attemptNumber, 1);
    assert.equal(deferred?.availableAt.toISOString(), T1010.toISOString());
    assert.equal(deferred?.claimWorkerId, undefined);
  });
});

test('rolls back enqueue atomically and enforces bounded diagnostics in PostgreSQL', async () => {
  await withJobDatabase(async (database, [endpointA]) => {
    const rollback = new Error('synthetic rollback');
    await assert.rejects(
      database.transaction(async (transaction) => {
        await enqueueEndpointCollectionJob(transaction, {
          sourceEndpointId: endpointA.id,
          availableAt: T1000,
          attemptNumber: 1,
        });
        throw rollback;
      }),
      rollback,
    );
    assert.equal(
      (
        await database.query(
          'SELECT 1 FROM endpoint_collection_jobs WHERE source_endpoint_id = $1',
          [endpointA.id],
        )
      ).rowCount,
      0,
    );

    await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpointA.id,
      availableAt: T1000,
      attemptNumber: 1,
    });
    const claimed = await claimNextEndpointCollectionJob(database, {
      workerId: 'worker_a',
      claimedAt: T1000,
      leaseExpiresAt: T1005,
    });
    assert.ok(claimed);
    await assert.rejects(
      terminalizeEndpointCollectionJob(
        database,
        claimed.id,
        claimed.claimToken!,
        {
          status: 'failed',
          terminalAt: T1001,
          outcomeCode: 'unsafe-code',
        },
      ),
      EndpointCollectionJobPersistenceError,
    );
    await assert.rejects(
      terminalizeEndpointCollectionJob(
        database,
        claimed.id,
        claimed.claimToken!,
        {
          status: 'failed',
          terminalAt: T1001,
          outcomeCode: 'transport_failed',
          error: { code: 'timeout', detail: 'x'.repeat(2001) },
        },
      ),
      EndpointCollectionJobPersistenceError,
    );
    await assert.rejects(
      database.query(
        `UPDATE endpoint_collection_jobs
         SET status = 'failed', claim_token = NULL, lease_expires_at = NULL,
             terminal_at = $2, outcome_code = 'transport_failed',
             error_detail = $3
         WHERE id = $1`,
        [claimed.id, T1001, 'x'.repeat(2001)],
      ),
    );

    const selfId = randomUUID();
    await assert.rejects(
      database.query(
        `INSERT INTO endpoint_collection_jobs (
           id, source_endpoint_id, status, available_at, attempt_number,
           previous_job_id
         ) VALUES ($1, $2, 'queued', $3, 2, $1)`,
        [selfId, endpointA.id, T1000],
      ),
    );
  });
});

async function withJobDatabase(
  work: (
    database: Database,
    endpoints: readonly [PersistedSourceEndpoint, PersistedSourceEndpoint],
  ) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
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
