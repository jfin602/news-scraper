import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  calculateDigestScheduledSlot,
  createDigestSchedulerFromDependencies,
  MAXIMUM_DIGEST_SCHEDULER_CONCURRENCY,
  type DigestScheduledEvaluator,
} from '../../src/distribution/digests/scheduler.ts';
import type { DigestEvaluationResult } from '../../src/distribution/digests/lifecycle.ts';

test('digest scheduler derives exactly the UTC midnight and noon slots', () => {
  const cases: readonly [string, string][] = [
    ['2026-08-28T00:00:00.000Z', '2026-08-28T00:00:00.000Z'],
    ['2026-08-28T11:59:59.999Z', '2026-08-28T00:00:00.000Z'],
    ['2026-08-28T12:00:00.000Z', '2026-08-28T12:00:00.000Z'],
    ['2026-08-28T23:59:59.999Z', '2026-08-28T12:00:00.000Z'],
    ['2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z'],
  ];
  assert.deepEqual(
    cases.map(([now]) =>
      calculateDigestScheduledSlot(new Date(now)).toISOString(),
    ),
    cases.map(([, slot]) => slot),
  );
  assert.throws(
    () => calculateDigestScheduledSlot(new Date('not a timestamp')),
    TypeError,
  );
});

test('digest scheduler evaluates only active Profiles and aggregates every bounded lifecycle outcome', async () => {
  const calls: [unknown, Date][] = [];
  const scheduler = createDigestSchedulerFromDependencies({
    listProfiles: async () => [
      profile('books', 'active'),
      profile('film', 'active'),
      profile('opportunities', 'active'),
      profile('drafts', 'draft'),
      profile('disabled', 'disabled'),
      profile('running', 'active'),
      profile('previous_slot', 'active'),
      profile('removed', 'active'),
      profile('no_input', 'active'),
    ],
    lifecycle: lifecycle(async (profileConfigKey, scheduledSlot) => {
      calls.push([profileConfigKey, new Date(scheduledSlot.getTime())]);
      switch (profileConfigKey) {
        case 'books':
          return evaluation('generated', true);
        case 'film':
          return evaluation('failed', true);
        case 'opportunities':
          return evaluation('skipped_unchanged', true);
        case 'running':
          return evaluation('already_running', false);
        case 'previous_slot':
          return evaluation('scheduled_slot_claimed', false);
        case 'removed':
          return evaluation('not_found', false);
        case 'no_input':
          return evaluation('skipped_no_input', true);
        default:
          return evaluation('skipped_disabled', true);
      }
    }),
  });

  const result = await scheduler.pass(new Date('2026-08-28T13:45:00.000Z'));

  assert.deepEqual(result, {
    scheduledSlot: new Date('2026-08-28T12:00:00.000Z'),
    profilesConsidered: 7,
    attemptsClaimed: 4,
    attemptsSucceeded: 1,
    attemptsFailed: 1,
    attemptsSkipped: 5,
  });
  assert.deepEqual(
    calls.map(([profileConfigKey]) => profileConfigKey),
    [
      'books',
      'film',
      'opportunities',
      'running',
      'previous_slot',
      'removed',
      'no_input',
    ],
  );
  assert.ok(
    calls.every(
      ([, scheduledSlot]) =>
        scheduledSlot.toISOString() === '2026-08-28T12:00:00.000Z',
    ),
  );
});

test('repeated polls defer duplicate scheduled slots to the lifecycle claim boundary', async () => {
  const claimedSlots = new Set<string>();
  const scheduler = createDigestSchedulerFromDependencies({
    listProfiles: async () => [profile('books', 'active')],
    lifecycle: lifecycle(async (_profileConfigKey, scheduledSlot) => {
      const slot = scheduledSlot.toISOString();
      if (claimedSlots.has(slot))
        return evaluation('scheduled_slot_claimed', false);
      claimedSlots.add(slot);
      return evaluation('generated', true);
    }),
  });

  const first = await scheduler.pass(new Date('2026-08-28T00:00:00.000Z'));
  const second = await scheduler.pass(new Date('2026-08-28T11:59:59.999Z'));

  assert.deepEqual(first, {
    scheduledSlot: new Date('2026-08-28T00:00:00.000Z'),
    profilesConsidered: 1,
    attemptsClaimed: 1,
    attemptsSucceeded: 1,
    attemptsFailed: 0,
    attemptsSkipped: 0,
  });
  assert.deepEqual(second, {
    scheduledSlot: new Date('2026-08-28T00:00:00.000Z'),
    profilesConsidered: 1,
    attemptsClaimed: 0,
    attemptsSucceeded: 0,
    attemptsFailed: 0,
    attemptsSkipped: 1,
  });
});

test('digest scheduler bounds Profile evaluation concurrency without blocking the next Profile after completion', async () => {
  const firstTwoStarted = deferred<void>();
  const thirdStarted = deferred<void>();
  const releases = new Map<string, () => void>();
  const started: string[] = [];
  let active = 0;
  let maximumActive = 0;
  const scheduler = createDigestSchedulerFromDependencies({
    concurrency: 2,
    listProfiles: async () => [
      profile('books', 'active'),
      profile('film', 'active'),
      profile('opportunities', 'active'),
    ],
    lifecycle: lifecycle(async (profileConfigKey) => {
      const key = String(profileConfigKey);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      started.push(key);
      if (started.length === 2) firstTwoStarted.resolve();
      if (started.length === 3) thirdStarted.resolve();
      await new Promise<void>((resolve) => releases.set(key, resolve));
      active -= 1;
      return evaluation('generated', true);
    }),
  });

  const pass = scheduler.pass(new Date('2026-08-28T12:00:00.000Z'));
  await firstTwoStarted.promise;
  assert.deepEqual(started, ['books', 'film']);
  assert.equal(maximumActive, 2);

  releases.get('books')!();
  await thirdStarted.promise;
  assert.deepEqual(started, ['books', 'film', 'opportunities']);
  assert.equal(maximumActive, 2);

  releases.get('film')!();
  releases.get('opportunities')!();
  assert.deepEqual(await pass, {
    scheduledSlot: new Date('2026-08-28T12:00:00.000Z'),
    profilesConsidered: 3,
    attemptsClaimed: 3,
    attemptsSucceeded: 3,
    attemptsFailed: 0,
    attemptsSkipped: 0,
  });
});

test('one Profile evaluation exception is isolated and does not expose its error text', async () => {
  const evaluated: unknown[] = [];
  const scheduler = createDigestSchedulerFromDependencies({
    listProfiles: async () => [
      profile('fails', 'active'),
      profile('continues', 'active'),
    ],
    lifecycle: lifecycle(async (profileConfigKey) => {
      evaluated.push(profileConfigKey);
      if (profileConfigKey === 'fails')
        throw new Error('private provider payload must not escape');
      return evaluation('generated', true);
    }),
  });

  const result = await scheduler.pass(new Date('2026-08-28T00:00:00.000Z'));

  assert.deepEqual(evaluated, ['fails', 'continues']);
  assert.deepEqual(result, {
    scheduledSlot: new Date('2026-08-28T00:00:00.000Z'),
    profilesConsidered: 2,
    attemptsClaimed: 1,
    attemptsSucceeded: 1,
    attemptsFailed: 1,
    attemptsSkipped: 0,
  });
  assert.doesNotMatch(JSON.stringify(result), /private provider payload/);
});

test('digest scheduler rejects an unsafe concurrency configuration', () => {
  for (const concurrency of [
    0,
    1.5,
    MAXIMUM_DIGEST_SCHEDULER_CONCURRENCY + 1,
  ]) {
    assert.throws(
      () =>
        createDigestSchedulerFromDependencies({
          concurrency,
          listProfiles: async () => [],
          lifecycle: lifecycle(async () => evaluation('not_found', false)),
        }),
      TypeError,
    );
  }
});

function profile(
  configKey: string,
  lifecycleState: 'active' | 'draft' | 'disabled',
) {
  return { configKey, lifecycle: lifecycleState };
}

function lifecycle(
  evaluateScheduled: DigestScheduledEvaluator['evaluateScheduled'],
): DigestScheduledEvaluator {
  return { evaluateScheduled };
}

function evaluation(
  kind: DigestEvaluationResult['kind'],
  claimed: boolean,
): DigestEvaluationResult {
  return Object.freeze({ kind, claimed }) as DigestEvaluationResult;
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
