import type { Database } from '../../database/database.ts';
import {
  listDistributionProfiles,
  type PersistedDistributionProfile,
} from '../profiles/repository.ts';
import type {
  DigestEvaluationResult,
  DigestLifecycleService,
} from './lifecycle.ts';

export const DEFAULT_DIGEST_SCHEDULER_CONCURRENCY = 2;
export const MAXIMUM_DIGEST_SCHEDULER_CONCURRENCY = 4;

/** The scheduler requires only the lifecycle-owned scheduled evaluation seam. */
export type DigestScheduledEvaluator = Pick<
  DigestLifecycleService,
  'evaluateScheduled'
>;

export interface DigestSchedulerPassResult {
  readonly scheduledSlot: Date;
  readonly profilesConsidered: number;
  readonly attemptsClaimed: number;
  readonly attemptsSucceeded: number;
  readonly attemptsFailed: number;
  readonly attemptsSkipped: number;
}

export interface DigestScheduler {
  pass(now: Date): Promise<DigestSchedulerPassResult>;
}

export interface DigestSchedulerOptions {
  /**
   * Limits concurrently evaluated Profiles, not provider calls directly. The
   * lifecycle service remains the exclusive authority for claims and calls.
   */
  readonly concurrency?: number;
}

export interface DigestSchedulerFactoryDependencies extends DigestSchedulerOptions {
  readonly database: Database;
  readonly lifecycle: DigestScheduledEvaluator;
}

export interface DigestSchedulerDependencies extends DigestSchedulerOptions {
  readonly listProfiles: () => Promise<
    readonly Pick<PersistedDistributionProfile, 'configKey' | 'lifecycle'>[]
  >;
  readonly lifecycle: DigestScheduledEvaluator;
}

/**
 * The deterministic scheduled-attempt identity. It is deliberately UTC-only:
 * one slot starts at midnight and one at noon on every UTC calendar day.
 */
export function calculateDigestScheduledSlot(now: Date): Date {
  const timestamp = requiredTimestamp(now);
  const hour = timestamp.getUTCHours();
  return new Date(
    Date.UTC(
      timestamp.getUTCFullYear(),
      timestamp.getUTCMonth(),
      timestamp.getUTCDate(),
      hour < 12 ? 0 : 12,
    ),
  );
}

/**
 * Production composition intentionally lists Profiles through their existing
 * repository. Digest scheduling has no collection job, endpoint, or raw AI
 * table ownership.
 */
export function createDigestScheduler(
  dependencies: DigestSchedulerFactoryDependencies,
): DigestScheduler {
  return createDigestSchedulerFromDependencies({
    listProfiles: () => listDistributionProfiles(dependencies.database),
    lifecycle: dependencies.lifecycle,
    ...(dependencies.concurrency === undefined
      ? {}
      : { concurrency: dependencies.concurrency }),
  });
}

/** Exported for deterministic scheduler tests and Worker composition tests. */
export function createDigestSchedulerFromDependencies(
  dependencies: DigestSchedulerDependencies,
): DigestScheduler {
  const concurrency = validConcurrency(dependencies.concurrency);
  return Object.freeze({
    async pass(now: Date): Promise<DigestSchedulerPassResult> {
      const scheduledSlot = calculateDigestScheduledSlot(now);
      const profileConfigKeys = activeProfileConfigKeys(
        await dependencies.listProfiles(),
      );
      const counts = await evaluateProfiles(
        profileConfigKeys,
        scheduledSlot,
        dependencies.lifecycle,
        concurrency,
      );
      return Object.freeze({
        scheduledSlot: new Date(scheduledSlot.getTime()),
        profilesConsidered: profileConfigKeys.length,
        ...counts,
      });
    },
  });
}

function activeProfileConfigKeys(
  profiles: readonly Pick<
    PersistedDistributionProfile,
    'configKey' | 'lifecycle'
  >[],
): readonly string[] {
  const active = new Set<string>();
  for (const profile of profiles) {
    if (profile.lifecycle === 'active') active.add(profile.configKey);
  }
  return Object.freeze([...active]);
}

async function evaluateProfiles(
  profileConfigKeys: readonly string[],
  scheduledSlot: Date,
  lifecycle: DigestScheduledEvaluator,
  concurrency: number,
): Promise<
  Omit<DigestSchedulerPassResult, 'scheduledSlot' | 'profilesConsidered'>
> {
  const counts: MutableDigestSchedulerCounts = {
    attemptsClaimed: 0,
    attemptsSucceeded: 0,
    attemptsFailed: 0,
    attemptsSkipped: 0,
  };
  let nextProfile = 0;
  const workerCount = Math.min(concurrency, profileConfigKeys.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const profileConfigKey = profileConfigKeys[nextProfile];
        nextProfile += 1;
        if (profileConfigKey === undefined) return;
        try {
          const result = await lifecycle.evaluateScheduled(
            profileConfigKey,
            new Date(scheduledSlot.getTime()),
          );
          applyEvaluationResult(counts, result);
        } catch {
          // A malformed/infrastructure failure for one Profile cannot stop
          // unrelated Profile evaluations or the endpoint worker loops.
          counts.attemptsFailed += 1;
        }
      }
    }),
  );
  return Object.freeze({ ...counts });
}

function applyEvaluationResult(
  counts: MutableDigestSchedulerCounts,
  result: DigestEvaluationResult,
): void {
  if (result.claimed) counts.attemptsClaimed += 1;
  switch (result.kind) {
    case 'generated':
      counts.attemptsSucceeded += 1;
      return;
    case 'failed':
      counts.attemptsFailed += 1;
      return;
    case 'skipped_disabled':
    case 'skipped_no_input':
    case 'skipped_unchanged':
    case 'already_running':
    case 'scheduled_slot_claimed':
    case 'not_found':
      counts.attemptsSkipped += 1;
      return;
  }
}

interface MutableDigestSchedulerCounts {
  attemptsClaimed: number;
  attemptsSucceeded: number;
  attemptsFailed: number;
  attemptsSkipped: number;
}

function requiredTimestamp(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError(
      'Digest scheduler clock returned an invalid timestamp.',
    );
  }
  return new Date(value.getTime());
}

function validConcurrency(value: number | undefined): number {
  if (value === undefined) return DEFAULT_DIGEST_SCHEDULER_CONCURRENCY;
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAXIMUM_DIGEST_SCHEDULER_CONCURRENCY
  ) {
    throw new TypeError(
      `Digest scheduler concurrency must be an integer from 1 through ${MAXIMUM_DIGEST_SCHEDULER_CONCURRENCY}.`,
    );
  }
  return value;
}
