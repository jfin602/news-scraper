import type { ScheduledJobExecutionResult } from './execute-endpoint-collection-job.ts';

export const MAX_SCHEDULED_COLLECTION_ATTEMPTS = 3;
export const INITIAL_RETRY_DELAY_MILLISECONDS = 30_000;
export const MAX_RETRY_DELAY_MILLISECONDS = 300_000;
export const CONTENTION_DEFERRAL_NOMINAL_MILLISECONDS = 5_000;
export const COOLDOWN_FAILURE_THRESHOLD = 3;
export const MINIMUM_COOLDOWN_MILLISECONDS = 300_000;

export type ScheduledJobDisposition =
  | Readonly<{ kind: 'retry' }>
  | Readonly<{ kind: 'defer'; reason: 'endpoint_locked' }>
  | Readonly<{
      kind: 'terminal';
      status: 'succeeded' | 'failed' | 'skipped' | 'abandoned';
    }>;

export class ScheduledJobPolicyError extends Error {
  constructor(reason: string) {
    super(`Scheduled job policy failed: ${reason}`);
    this.name = 'ScheduledJobPolicyError';
  }
}

export function decideScheduledJobDisposition(
  result: ScheduledJobExecutionResult,
): ScheduledJobDisposition {
  if (result.category === 'succeeded') {
    return Object.freeze({ kind: 'terminal', status: 'succeeded' });
  }
  if (result.category === 'blocked') {
    if (result.reason === 'endpoint_locked') {
      return Object.freeze({ kind: 'defer', reason: 'endpoint_locked' });
    }
    return Object.freeze({ kind: 'terminal', status: 'skipped' });
  }
  if (
    result.collectionRunOccurred &&
    result.retryClassification === 'transient' &&
    result.attemptNumber < MAX_SCHEDULED_COLLECTION_ATTEMPTS
  ) {
    return Object.freeze({ kind: 'retry' });
  }
  return Object.freeze({
    kind: 'terminal',
    status: result.outcome === 'worker_interrupted' ? 'abandoned' : 'failed',
  });
}

/** Equal-jitter retry delay: 50%-100% of a capped exponential nominal delay. */
export function calculateRetryDelayMilliseconds(
  failedAttemptNumber: number,
  randomValue: number,
): number {
  requiredPositiveInteger(failedAttemptNumber, 'failed attempt number');
  const exponent = Math.min(failedAttemptNumber - 1, 30);
  const nominal = Math.min(
    INITIAL_RETRY_DELAY_MILLISECONDS * 2 ** exponent,
    MAX_RETRY_DELAY_MILLISECONDS,
  );
  return calculateEqualJitterDelay(nominal, randomValue);
}

/** A short same-job deferral used for lock/capacity contention, not a retry. */
export function calculateContentionDeferralMilliseconds(
  randomValue: number,
): number {
  return calculateEqualJitterDelay(
    CONTENTION_DEFERRAL_NOMINAL_MILLISECONDS,
    randomValue,
  );
}

export function calculateCooldownUntil(
  terminalRunFinishedAt: Date,
  pollIntervalSeconds: number,
  consecutiveFailureCount: number,
): Date | undefined {
  const finishedAt = requiredTimestamp(terminalRunFinishedAt);
  requiredPositiveInteger(pollIntervalSeconds, 'poll interval');
  requiredNonnegativeInteger(
    consecutiveFailureCount,
    'consecutive failure count',
  );
  if (consecutiveFailureCount < COOLDOWN_FAILURE_THRESHOLD) return undefined;
  const duration = Math.max(
    pollIntervalSeconds * 1_000,
    MINIMUM_COOLDOWN_MILLISECONDS,
  );
  return new Date(finishedAt.getTime() + duration);
}

function calculateEqualJitterDelay(
  nominalMilliseconds: number,
  randomValue: number,
): number {
  if (
    typeof randomValue !== 'number' ||
    !Number.isFinite(randomValue) ||
    randomValue < 0 ||
    randomValue > 1
  ) {
    throw new ScheduledJobPolicyError(
      'random value must be between zero and one',
    );
  }
  const lowerBound = Math.ceil(nominalMilliseconds / 2);
  if (randomValue === 1) return nominalMilliseconds;
  return (
    lowerBound +
    Math.floor(randomValue * (nominalMilliseconds - lowerBound + 1))
  );
}

function requiredTimestamp(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new ScheduledJobPolicyError('terminal run finish time is invalid');
  }
  return value;
}

function requiredPositiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ScheduledJobPolicyError(`${field} must be a positive integer`);
  }
  return value as number;
}

function requiredNonnegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ScheduledJobPolicyError(`${field} must be a nonnegative integer`);
  }
  return value as number;
}
