import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  EndpointCollectionJobPersistenceError,
  type EndpointCollectionJobRow,
  mapEndpointCollectionJobRow,
} from '../../src/jobs/endpoint-collection-job-repository.ts';

test('maps immutable queued, running, and terminal endpoint collection jobs', () => {
  const queued = mapEndpointCollectionJobRow(validRow());
  assert.equal(queued.status, 'queued');
  assert.equal(queued.attemptNumber, 1);
  assert.equal(queued.claimToken, undefined);
  assert.equal(Object.isFrozen(queued), true);

  const claimedAt = new Date('2026-08-11T12:00:00.000Z');
  const running = mapEndpointCollectionJobRow(
    validRow({
      status: 'running',
      claim_worker_id: 'worker_a',
      claim_token: randomUUID(),
      claimed_at: claimedAt,
      lease_expires_at: new Date('2026-08-11T12:05:00.000Z'),
    }),
  );
  assert.equal(running.claimWorkerId, 'worker_a');

  const terminal = mapEndpointCollectionJobRow(
    validRow({
      status: 'failed',
      claim_worker_id: 'worker_a',
      claimed_at: claimedAt,
      terminal_at: new Date('2026-08-11T12:02:00.000Z'),
      outcome_code: 'transport_failed',
      error_code: 'connection_timeout',
      error_detail: 'The bounded request deadline elapsed.',
    }),
  );
  assert.equal(terminal.status, 'failed');
  assert.equal(terminal.errorCode, 'connection_timeout');
});

test('rejects malformed retry, ownership, lease, and terminal row shapes', () => {
  const claimedAt = new Date('2026-08-11T12:00:00.000Z');
  for (const row of [
    validRow({ attempt_number: 0 }),
    validRow({ attempt_number: 2 }),
    validRow({ previous_job_id: randomUUID() }),
    validRow({ status: 'running' }),
    validRow({
      status: 'running',
      claim_worker_id: 'worker_a',
      claim_token: randomUUID(),
      claimed_at: claimedAt,
      lease_expires_at: claimedAt,
    }),
    validRow({
      status: 'succeeded',
      claim_worker_id: 'worker_a',
      claimed_at: claimedAt,
      terminal_at: new Date('2026-08-11T12:01:00.000Z'),
    }),
    validRow({ claim_worker_id: 'unsafe\nworker' }),
  ]) {
    assert.throws(
      () => mapEndpointCollectionJobRow(row),
      EndpointCollectionJobPersistenceError,
    );
  }
});

function validRow(
  overrides: Partial<EndpointCollectionJobRow> = {},
): EndpointCollectionJobRow {
  return {
    id: randomUUID(),
    source_endpoint_id: randomUUID(),
    status: 'queued',
    enqueued_at: new Date('2026-08-11T11:59:00.000Z'),
    available_at: new Date('2026-08-11T12:00:00.000Z'),
    attempt_number: 1,
    previous_job_id: null,
    claim_worker_id: null,
    claim_token: null,
    claimed_at: null,
    lease_expires_at: null,
    collection_run_id: null,
    terminal_at: null,
    outcome_code: null,
    reason_code: null,
    error_code: null,
    error_detail: null,
    updated_at: new Date('2026-08-11T11:59:00.000Z'),
    ...overrides,
  };
}
