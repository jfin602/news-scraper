import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  calculateSchedulingJitterMilliseconds,
  MAX_SCHEDULING_JITTER_MILLISECONDS,
  SchedulingJitterError,
} from '../../src/collection/scheduler/jitter.ts';

test('bounds scheduler jitter to ten percent for small poll intervals', () => {
  assert.equal(calculateSchedulingJitterMilliseconds(60, 0), 0);
  assert.equal(calculateSchedulingJitterMilliseconds(60, 1), 6000);
  assert.equal(calculateSchedulingJitterMilliseconds(60, 0.5), 3000);
});

test('caps scheduler jitter for large poll intervals', () => {
  assert.equal(
    calculateSchedulingJitterMilliseconds(900, 1),
    MAX_SCHEDULING_JITTER_MILLISECONDS,
  );
  assert.equal(calculateSchedulingJitterMilliseconds(900, 0), 0);
});

test('rejects invalid scheduler jitter inputs', () => {
  const invalidInputs: readonly (readonly [number, number])[] = [
    [0, 0],
    [60.5, 0],
    [60, -0.01],
    [60, 1.01],
    [60, Number.NaN],
  ];
  for (const [pollIntervalSeconds, randomValue] of invalidInputs) {
    assert.throws(
      () =>
        calculateSchedulingJitterMilliseconds(pollIntervalSeconds, randomValue),
      SchedulingJitterError,
    );
  }
});
