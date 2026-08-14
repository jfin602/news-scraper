import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { EndpointCollectionJobExecutionResult } from '../../src/jobs/execute-endpoint-collection-job.ts';
import {
  calculateContentionDeferralMilliseconds,
  calculateCooldownUntil,
  calculateRetryDelayMilliseconds,
  decideEndpointCollectionJobDisposition,
  MAX_ENDPOINT_COLLECTION_JOB_ATTEMPTS,
  MAX_RETRY_DELAY_MILLISECONDS,
} from '../../src/jobs/endpoint-collection-job-policy.ts';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const ENDPOINT_ID = '22222222-2222-4222-8222-222222222222';
const CLAIM_TOKEN = '33333333-3333-4333-8333-333333333333';
const RUN_ID = '44444444-4444-4444-8444-444444444444';

test('only transient actual failures below the maximum attempt are retried', () => {
  for (const attemptNumber of [1, 2]) {
    assert.deepEqual(
      decideEndpointCollectionJobDisposition(
        failure(attemptNumber, 'transient'),
      ),
      { kind: 'retry' },
    );
  }
  assert.equal(MAX_ENDPOINT_COLLECTION_JOB_ATTEMPTS, 3);
  assert.deepEqual(
    decideEndpointCollectionJobDisposition(failure(3, 'transient')),
    {
      kind: 'terminal',
      status: 'failed',
    },
  );
  assert.deepEqual(
    decideEndpointCollectionJobDisposition(failure(1, 'permanent')),
    {
      kind: 'terminal',
      status: 'failed',
    },
  );
  assert.deepEqual(decideEndpointCollectionJobDisposition(success()), {
    kind: 'terminal',
    status: 'succeeded',
  });
  assert.deepEqual(
    decideEndpointCollectionJobDisposition(blocked('no_longer_due')),
    {
      kind: 'terminal',
      status: 'skipped',
    },
  );
  assert.deepEqual(
    decideEndpointCollectionJobDisposition(blocked('endpoint_locked')),
    {
      kind: 'defer',
      reason: 'endpoint_locked',
    },
  );
  assert.deepEqual(
    decideEndpointCollectionJobDisposition(
      blocked('collection_capacity_limited'),
    ),
    {
      kind: 'defer',
      reason: 'collection_capacity_limited',
    },
  );
});

test('worker interruption preserves abandoned status and remains retryable when bounded', () => {
  assert.deepEqual(
    decideEndpointCollectionJobDisposition(
      failure(2, 'transient', 'worker_interrupted'),
    ),
    { kind: 'retry' },
  );
  assert.deepEqual(
    decideEndpointCollectionJobDisposition(
      failure(3, 'transient', 'worker_interrupted'),
    ),
    { kind: 'terminal', status: 'abandoned' },
  );
});

test('retry equal jitter has exact bounds and capped monotonic nominals', () => {
  assert.equal(calculateRetryDelayMilliseconds(1, 0), 15_000);
  assert.equal(calculateRetryDelayMilliseconds(1, 1), 30_000);
  assert.equal(calculateRetryDelayMilliseconds(2, 0), 30_000);
  assert.equal(calculateRetryDelayMilliseconds(2, 1), 60_000);
  assert.equal(calculateRetryDelayMilliseconds(3, 1), 120_000);
  assert.equal(calculateRetryDelayMilliseconds(99, 1), 300_000);
  assert.equal(MAX_RETRY_DELAY_MILLISECONDS, 300_000);
  assert.throws(() => calculateRetryDelayMilliseconds(1, -0.01));
  assert.throws(() => calculateRetryDelayMilliseconds(0, 0.5));
});

test('contention deferral is short, positive, bounded, and deterministic', () => {
  assert.equal(calculateContentionDeferralMilliseconds(0), 2_500);
  assert.equal(calculateContentionDeferralMilliseconds(1), 5_000);
  assert.equal(calculateContentionDeferralMilliseconds(0.5), 3_750);
});

test('cooldown begins at three failures and uses the greater of poll interval and five minutes', () => {
  const finishedAt = new Date('2026-08-11T10:00:00.000Z');
  assert.equal(calculateCooldownUntil(finishedAt, 60, 2), undefined);
  assert.equal(
    calculateCooldownUntil(finishedAt, 60, 3)?.toISOString(),
    '2026-08-11T10:05:00.000Z',
  );
  assert.equal(
    calculateCooldownUntil(finishedAt, 600, 4)?.toISOString(),
    '2026-08-11T10:10:00.000Z',
  );
});

function failure(
  attemptNumber: number,
  retryClassification: 'transient' | 'permanent',
  outcome = 'fetch_failed',
): EndpointCollectionJobExecutionResult {
  return Object.freeze({
    jobId: JOB_ID,
    attemptNumber,
    endpointId: ENDPOINT_ID,
    triggerKind: 'manual',
    claimToken: CLAIM_TOKEN,
    collectionRunOccurred: true,
    collectionRunId: RUN_ID,
    category: 'failed' as const,
    outcome,
    reason: outcome === 'worker_interrupted' ? outcome : 'network_error',
    retryClassification,
  });
}

function success(): EndpointCollectionJobExecutionResult {
  return Object.freeze({
    jobId: JOB_ID,
    attemptNumber: 1,
    endpointId: ENDPOINT_ID,
    triggerKind: 'scheduled',
    claimToken: CLAIM_TOKEN,
    collectionRunOccurred: true,
    collectionRunId: RUN_ID,
    category: 'succeeded' as const,
    outcome: 'content',
  });
}

function blocked(reason: string): EndpointCollectionJobExecutionResult {
  return Object.freeze({
    jobId: JOB_ID,
    attemptNumber: 1,
    endpointId: ENDPOINT_ID,
    triggerKind: 'manual',
    claimToken: CLAIM_TOKEN,
    collectionRunOccurred: false,
    category: 'blocked' as const,
    outcome: reason,
    reason,
  });
}
