import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, test } from 'node:test';

import { createDatabase, type Database } from '../../src/database/database.ts';
import {
  claimNextEndpointCollectionJob,
  enqueueEndpointCollectionJob,
} from '../../src/jobs/endpoint-collection-job-repository.ts';
import { readOperationalSnapshot } from '../../src/observability/operational-snapshot.ts';
import {
  bootstrapPublicationTree,
  parseBootstrapDocument,
} from '../../src/publication/bootstrap.ts';
import {
  findSourceByConfigKey,
  findSourceEndpointBySourceAndConfigKey,
} from '../../src/sources/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const fixtureUrl = new URL(
  '../fixtures/generic-bootstrap.json',
  import.meta.url,
);
const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

test('real PostgreSQL operational snapshot composes endpoint health and durable job facts without mutation', async () => {
  await withDatabase(async (database) => {
    const now = new Date();
    const circuit = await endpoint(database, 'circuit_journal', 'main_feed');
    const research = await endpoint(database, 'research_wire', 'updates_feed');
    await database.query(
      `UPDATE source_endpoints
       SET last_attempt_at = $2, last_failure_at = $2, consecutive_failure_count = 3
       WHERE id = $1`,
      [circuit, new Date(now.getTime() - 60_000)],
    );
    await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: circuit,
      triggerKind: 'scheduled',
      availableAt: new Date(now.getTime() - 30_000),
      attemptNumber: 1,
    });
    await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: research,
      triggerKind: 'manual',
      availableAt: new Date(now.getTime() - 30_000),
      attemptNumber: 1,
    });
    const running = await claimNextEndpointCollectionJob(database, {
      workerId: 'operational-snapshot-test',
      claimedAt: new Date(now.getTime() - 20_000),
      leaseExpiresAt: new Date(now.getTime() - 10_000),
    });
    assert.ok(running);

    const before = await database.query<{
      status: string;
      lease_expires_at: Date | null;
    }>(
      'SELECT status, lease_expires_at FROM endpoint_collection_jobs ORDER BY id',
    );
    const snapshot = await readOperationalSnapshot(database, now);
    const after = await database.query<{
      status: string;
      lease_expires_at: Date | null;
    }>(
      'SELECT status, lease_expires_at FROM endpoint_collection_jobs ORDER BY id',
    );

    assert.equal(snapshot.endpointHealthCounts.unhealthy, 1);
    assert.equal(snapshot.jobs.queuedCount, 1);
    assert.equal(snapshot.jobs.runningCount, 1);
    assert.equal(snapshot.jobs.readyQueuedCount, 1);
    assert.equal(snapshot.jobs.futureQueuedCount, 0);
    assert.ok(snapshot.jobs.oldestReadyQueuedAt);
    assert.equal(snapshot.jobs.expiredRunningCount, 1);
    assert.equal(snapshot.jobs.expiredRunningJobs.length, 1);
    assert.equal(snapshot.status, 'critical');
    assert.ok(
      snapshot.alerts.some((alert) => alert.code === 'endpoint_unhealthy'),
    );
    assert.ok(
      snapshot.alerts.some((alert) => alert.code === 'expired_running_job'),
    );
    assert.deepEqual(after.rows, before.rows);
  });
});

async function endpoint(
  database: Database,
  sourceConfigKey: string,
  endpointConfigKey: string,
): Promise<string> {
  const source = await findSourceByConfigKey(database, sourceConfigKey);
  assert.ok(source);
  const found = await findSourceEndpointBySourceAndConfigKey(
    database,
    source.id,
    endpointConfigKey,
  );
  assert.ok(found);
  return found.id;
}

async function withDatabase(work: (database: Database) => Promise<void>) {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const document = parseBootstrapDocument(
        await readFile(fixtureUrl, 'utf8'),
      );
      await bootstrapPublicationTree(database, document);
      await work(database);
    } finally {
      await database.close();
    }
  });
}
