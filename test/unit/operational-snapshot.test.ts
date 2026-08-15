import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildOperationalSnapshot,
  OPERATIONAL_SNAPSHOT_ACTIONABLE_ENDPOINT_LIMIT,
  readOperationalSnapshot,
  type ExpiredRunningJob,
  type OperationalEndpoint,
} from '../../src/observability/operational-snapshot.ts';
import { COLLECTION_DATABASE_POOL_POLICY } from '../../src/collection/concurrency/collection-capacity.ts';

const NOW = new Date('2026-08-15T12:00:00.000Z');

test('operational snapshot derives endpoint health through the canonical health boundary', async () => {
  const snapshot = await readOperationalSnapshot(
    queryExecutor([
      endpointRow({
        endpoint_config_key: 'late',
        next_due_at: new Date('2026-08-15T11:50:00.000Z'),
        last_attempt_at: new Date('2026-08-15T11:00:00.000Z'),
      }),
      endpointRow({
        endpoint_config_key: 'paused',
        endpoint_operational_state: 'paused',
        next_due_at: new Date('2026-08-15T11:50:00.000Z'),
        last_attempt_at: new Date('2026-08-15T11:00:00.000Z'),
      }),
      endpointRow({
        endpoint_config_key: 'broken',
        consecutive_failure_count: 3,
      }),
    ]),
    NOW,
  );

  assert.deepEqual(snapshot.endpointHealthCounts, {
    unknown: 0,
    healthy: 1,
    delayed: 1,
    degraded: 0,
    unhealthy: 1,
  });
  assert.deepEqual(
    snapshot.actionableEndpoints.map((endpoint) => endpoint.endpointConfigKey),
    ['broken', 'late'],
  );
  assert.equal(snapshot.status, 'critical');
});

test('operational snapshot distinguishes ready, future, running, and expired durable work without recovery mutation', () => {
  const expired: ExpiredRunningJob = {
    jobId: 'job-expired',
    sourceConfigKey: 'journal',
    endpointConfigKey: 'rss',
    claimedAt: new Date('2026-08-15T11:00:00.000Z'),
    leaseExpiresAt: new Date('2026-08-15T11:59:00.000Z'),
  };
  const snapshot = buildOperationalSnapshot(
    [endpoint('healthy')],
    {
      queuedCount: 2,
      runningCount: 1,
      readyQueuedCount: 1,
      futureQueuedCount: 1,
      oldestReadyQueuedAt: new Date('2026-08-15T11:58:30.000Z'),
      expiredRunningCount: 1,
    },
    [expired],
    NOW,
  );

  assert.equal(snapshot.jobs.queuedCount, 2);
  assert.equal(snapshot.jobs.runningCount, 1);
  assert.equal(snapshot.jobs.readyQueuedCount, 1);
  assert.equal(snapshot.jobs.futureQueuedCount, 1);
  assert.equal(snapshot.jobs.oldestReadyAgeMilliseconds, 90_000);
  assert.deepEqual(snapshot.jobs.expiredRunningJobs, [expired]);
  assert.equal(snapshot.status, 'critical');
  assert.deepEqual(
    snapshot.alerts.map((alert) => alert.code),
    ['expired_running_job', 'ready_queued_work'],
  );
});

test('empty and unknown operational states remain useful and omit oldest-ready timing', () => {
  const empty = buildOperationalSnapshot(
    [],
    {
      queuedCount: 0,
      runningCount: 0,
      readyQueuedCount: 0,
      futureQueuedCount: 0,
      oldestReadyQueuedAt: null,
      expiredRunningCount: 0,
    },
    [],
    NOW,
  );
  assert.equal(empty.status, 'unknown');
  assert.equal(empty.jobs.oldestReadyQueuedAt, null);
  assert.equal(empty.jobs.oldestReadyAgeMilliseconds, null);
  assert.deepEqual(empty.alerts, []);
});

test('operational snapshot exposes the selected capacity and database-pool policy', () => {
  const snapshot = buildOperationalSnapshot(
    [],
    {
      queuedCount: 0,
      runningCount: 0,
      readyQueuedCount: 0,
      futureQueuedCount: 0,
      oldestReadyQueuedAt: null,
      expiredRunningCount: 0,
    },
    [],
    NOW,
  );

  assert.deepEqual(snapshot.capacity, {
    global: 4,
    source: 2,
    host: 2,
    databasePool: COLLECTION_DATABASE_POOL_POLICY,
  });
});

test('inactive endpoint failure evidence remains counted but is not an outage alert', () => {
  const pausedFailure = {
    ...endpoint('unhealthy'),
    collectionEligible: false,
  };
  const snapshot = buildOperationalSnapshot(
    [pausedFailure],
    {
      queuedCount: 0,
      runningCount: 0,
      readyQueuedCount: 0,
      futureQueuedCount: 0,
      oldestReadyQueuedAt: null,
      expiredRunningCount: 0,
    },
    [],
    NOW,
  );
  assert.equal(snapshot.endpointHealthCounts.unhealthy, 1);
  assert.deepEqual(snapshot.actionableEndpoints, []);
  assert.deepEqual(snapshot.alerts, []);
  assert.equal(snapshot.status, 'unknown');
});

test('operational alerts and actionable rows use bounded deterministic severity ordering', () => {
  const endpoints = Array.from(
    { length: OPERATIONAL_SNAPSHOT_ACTIONABLE_ENDPOINT_LIMIT + 1 },
    (_, index) => ({
      ...endpoint(index === 0 ? 'unhealthy' : 'delayed'),
      sourceConfigKey: `source_${String(index).padStart(3, '0')}`,
      endpointConfigKey: `endpoint_${String(index).padStart(3, '0')}`,
    }),
  );
  const snapshot = buildOperationalSnapshot(
    endpoints,
    {
      queuedCount: 0,
      runningCount: 0,
      readyQueuedCount: 0,
      futureQueuedCount: 0,
      oldestReadyQueuedAt: null,
      expiredRunningCount: 0,
    },
    [],
    NOW,
  );
  assert.equal(
    snapshot.actionableEndpoints.length,
    OPERATIONAL_SNAPSHOT_ACTIONABLE_ENDPOINT_LIMIT,
  );
  assert.equal(snapshot.actionableEndpointsTruncated, true);
  assert.equal(snapshot.actionableEndpoints[0]?.health, 'unhealthy');
  assert.equal(snapshot.alerts[0]?.code, 'endpoint_unhealthy');
  assert.equal(snapshot.alertsTruncated, true);
});

function endpoint(health: OperationalEndpoint['health']): OperationalEndpoint {
  return Object.freeze({
    sourceConfigKey: 'journal',
    sourceDisplayName: 'Journal',
    endpointConfigKey: health,
    collectionEligible: true,
    health,
    lastAttemptAt: NOW,
    lastSuccessAt: NOW,
    lastFailureAt: null,
    nextDueAt: NOW,
    cooldownUntil: null,
    consecutiveFailureCount: health === 'unhealthy' ? 3 : 0,
    pollIntervalSeconds: 300,
  });
}

function endpointRow(overrides: Record<string, unknown> = {}) {
  return {
    source_config_key: 'journal',
    source_display_name: 'Journal',
    endpoint_config_key: 'rss',
    publication_active_for_collection: true,
    source_approval_state: 'approved',
    source_lifecycle_state: 'active',
    source_operational_state: 'enabled',
    endpoint_approval_state: 'approved',
    endpoint_lifecycle_state: 'active',
    endpoint_operational_state: 'enabled',
    poll_interval_seconds: 300,
    next_due_at: new Date('2026-08-15T12:05:00.000Z'),
    last_attempt_at: new Date('2026-08-15T12:00:00.000Z'),
    last_success_at: new Date('2026-08-15T12:00:00.000Z'),
    last_failure_at: null,
    cooldown_until: null,
    consecutive_failure_count: 0,
    ...overrides,
  };
}

function queryExecutor(endpointRows: readonly Record<string, unknown>[]) {
  let call = 0;
  return {
    async query() {
      call += 1;
      if (call === 1) return { rows: endpointRows };
      if (call === 2) {
        return {
          rows: [
            {
              queued_count: 0,
              running_count: 0,
              ready_queued_count: 0,
              future_queued_count: 0,
              oldest_ready_queued_at: null,
              expired_running_count: 0,
            },
          ],
        };
      }
      return { rows: [] };
    },
  } as never;
}
