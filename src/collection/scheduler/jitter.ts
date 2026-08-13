export const MAX_SCHEDULING_JITTER_MILLISECONDS = 30_000;

export class SchedulingJitterError extends Error {
  constructor(reason: string) {
    super(`Scheduling jitter failed: ${reason}`);
    this.name = 'SchedulingJitterError';
  }
}

/**
 * Returns an inclusive, bounded delay. Callers supply randomness so scheduler
 * passes are deterministic under test and do not own a second poll cadence.
 */
export function calculateSchedulingJitterMilliseconds(
  pollIntervalSeconds: number,
  randomValue: number,
): number {
  if (!Number.isSafeInteger(pollIntervalSeconds) || pollIntervalSeconds <= 0) {
    throw new SchedulingJitterError('poll interval must be a positive integer');
  }
  if (
    typeof randomValue !== 'number' ||
    !Number.isFinite(randomValue) ||
    randomValue < 0 ||
    randomValue > 1
  ) {
    throw new SchedulingJitterError(
      'random value must be between zero and one',
    );
  }

  const maximumMilliseconds = Math.min(
    MAX_SCHEDULING_JITTER_MILLISECONDS,
    pollIntervalSeconds * 100,
  );
  if (randomValue === 1) return maximumMilliseconds;
  return Math.floor(randomValue * (maximumMilliseconds + 1));
}
