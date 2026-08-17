import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createWebApp } from '../../src/app/web/create-app.ts';
import { startWebServer } from '../../src/app/web/server.ts';
import { registerOperationalSnapshotRoutes } from '../../src/app/web/operational-snapshot-router.ts';
import {
  OperationalSnapshotError,
  type OperationalSnapshot,
  type OperationalSnapshotService,
} from '../../src/observability/operational-snapshot.ts';

test('operational snapshot is a protected read-only admin route with stable JSON', async () => {
  const snapshot = testSnapshot();
  await withServer({ readSnapshot: async () => snapshot }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/admin/api/operations/snapshot`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      snapshot: {
        ...snapshot,
        observedAt: '2026-08-15T12:00:00.000Z',
        jobs: {
          ...snapshot.jobs,
          oldestReadyQueuedAt: '2026-08-15T11:59:00.000Z',
          expiredRunningJobs: [
            {
              ...snapshot.jobs.expiredRunningJobs[0],
              claimedAt: '2026-08-15T11:58:00.000Z',
              leaseExpiresAt: '2026-08-15T11:59:30.000Z',
            },
          ],
        },
      },
    });
    const mutation = await fetch(`${baseUrl}/admin/api/operations/snapshot`, {
      method: 'POST',
    });
    assert.equal(mutation.status, 403);
  });
});

test('operational snapshot hides dependency failures rather than returning stale state', async () => {
  await withServer(
    {
      readSnapshot: async () => {
        throw new OperationalSnapshotError('query credentials secret');
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/admin/api/operations/snapshot`);
      assert.equal(response.status, 503);
      const body = await response.text();
      assert.deepEqual(JSON.parse(body), { error: 'service_unavailable' });
      assert.doesNotMatch(body, /credentials|secret|query/u);
    },
  );
});

async function withServer(
  service: OperationalSnapshotService,
  work: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = await startWebServer(
    createWebApp(
      {
        readiness: { checkReady: async () => true },
        publicFeed: { read: async () => undefined },
      },
      {
        adminEnabled: true,
        registerAdminApiRoutes: registerOperationalSnapshotRoutes(service),
      },
    ),
    { host: '127.0.0.1', port: 0 },
  );
  try {
    await work(`http://${server.host}:${String(server.port)}`);
  } finally {
    await server.close();
  }
}

function testSnapshot(): OperationalSnapshot {
  return {
    observedAt: new Date('2026-08-15T12:00:00.000Z'),
    status: 'critical',
    endpointHealthCounts: {
      unknown: 0,
      healthy: 0,
      delayed: 0,
      degraded: 0,
      unhealthy: 1,
    },
    actionableEndpoints: [],
    actionableEndpointsTruncated: false,
    jobs: {
      queuedCount: 1,
      runningCount: 1,
      readyQueuedCount: 1,
      futureQueuedCount: 0,
      oldestReadyQueuedAt: new Date('2026-08-15T11:59:00.000Z'),
      oldestReadyAgeMilliseconds: 60_000,
      expiredRunningCount: 1,
      expiredRunningJobs: [
        {
          jobId: 'job-1',
          sourceConfigKey: 'journal',
          endpointConfigKey: 'rss',
          claimedAt: new Date('2026-08-15T11:58:00.000Z'),
          leaseExpiresAt: new Date('2026-08-15T11:59:30.000Z'),
        },
      ],
      expiredRunningJobsTruncated: false,
    },
    capacity: {
      global: 4,
      source: 2,
      host: 2,
      databasePool: {
        maxConnections: 10,
        pinnedSessionsPerExecution: 2,
        minimumHeadroomConnections: 1,
        pinnedConnectionsAtGlobalLimit: 8,
        availableConnectionsAtGlobalLimit: 2,
      },
    },
    workerTiming: {
      schedulerPassIntervalMilliseconds: 15_000,
      idleJobPollIntervalMilliseconds: 1_000,
      jobLeaseDurationMilliseconds: 120_000,
      leaseRenewalIntervalMilliseconds: 30_000,
      staleRecoveryPassIntervalMilliseconds: 30_000,
      staleRecoveryBatchLimit: 25,
      localExecutionLimit: 4,
    },
    alerts: [],
    alertsTruncated: false,
  };
}
