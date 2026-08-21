import assert from 'node:assert/strict';
import test from 'node:test';

import { BoundedMachineRateLimiter } from '../../src/distribution/credentials/rate-limiter.ts';

test('fixed-window limiter isolates keys and resumes exactly at its boundary', () => {
  let now = 0;
  const limiter = new BoundedMachineRateLimiter(
    { maximumRequests: 2, windowMilliseconds: 1_000, maximumEntries: 2 },
    { now: () => now },
  );
  assert.equal(limiter.consume('credential-a').outcome, 'allowed');
  assert.equal(limiter.consume('credential-b').outcome, 'allowed');
  assert.equal(limiter.consume('credential-a').outcome, 'allowed');
  assert.deepEqual(limiter.consume('credential-a'), {
    outcome: 'rate_limited',
    retryAfterSeconds: 1,
  });
  now = 1_000;
  assert.deepEqual(limiter.consume('credential-a'), {
    outcome: 'allowed',
    retryAfterSeconds: undefined,
  });
});

test('bounded state fails closed for new keys instead of early eviction bypasses', () => {
  let now = 0;
  const limiter = new BoundedMachineRateLimiter(
    { maximumRequests: 1, windowMilliseconds: 10_000, maximumEntries: 2 },
    { now: () => now },
  );
  assert.equal(limiter.consume('network-a').outcome, 'allowed');
  assert.equal(limiter.consume('network-b').outcome, 'allowed');
  assert.equal(limiter.retainedEntryCount, 2);
  assert.deepEqual(limiter.consume('network-c'), {
    outcome: 'rate_limited',
    retryAfterSeconds: 10,
  });
  assert.equal(limiter.retainedEntryCount, 2);
  now = 10_000;
  assert.equal(limiter.consume('network-c').outcome, 'allowed');
  assert.equal(limiter.retainedEntryCount, 1);
});

test('invalid policy, keys, and clock values fail safely', () => {
  assert.throws(
    () =>
      new BoundedMachineRateLimiter({
        maximumRequests: 0,
        windowMilliseconds: 1,
        maximumEntries: 1,
      }),
  );
  const limiter = new BoundedMachineRateLimiter(
    { maximumRequests: 1, windowMilliseconds: 1, maximumEntries: 1 },
    { now: () => Number.NaN },
  );
  assert.deepEqual(limiter.consume('credential'), {
    outcome: 'rate_limited',
    retryAfterSeconds: 1,
  });

  let now = 10;
  const backwardsClockLimiter = new BoundedMachineRateLimiter(
    { maximumRequests: 1, windowMilliseconds: 1, maximumEntries: 1 },
    { now: () => now },
  );
  assert.equal(backwardsClockLimiter.consume('credential').outcome, 'allowed');
  now = 9;
  assert.deepEqual(backwardsClockLimiter.consume('credential'), {
    outcome: 'rate_limited',
    retryAfterSeconds: 1,
  });
});
