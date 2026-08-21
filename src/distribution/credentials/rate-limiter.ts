export interface MachineRateLimitPolicy {
  readonly maximumRequests: number;
  readonly windowMilliseconds: number;
  readonly maximumEntries: number;
}

export interface MachineRateLimitDecision {
  readonly outcome: 'allowed' | 'rate_limited';
  readonly retryAfterSeconds: number | undefined;
}

export interface MachineRateLimitClock {
  now(): number;
}

interface MachineRateLimitBucket {
  readonly windowStartedAt: number;
  readonly requests: number;
}

/**
 * A deliberately small, process-local fixed-window limiter. New keys are
 * rejected once its bounded store is full; they are never evicted early.
 */
export class BoundedMachineRateLimiter {
  readonly #buckets = new Map<string, MachineRateLimitBucket>();
  #lastObservedNow: number | undefined;
  readonly policy: Readonly<MachineRateLimitPolicy>;
  private readonly clock: MachineRateLimitClock;

  constructor(
    policy: Readonly<MachineRateLimitPolicy>,
    clock: MachineRateLimitClock = { now: () => Date.now() },
  ) {
    validatePolicy(policy);
    this.policy = policy;
    this.clock = clock;
  }

  peek(key: string): Readonly<MachineRateLimitDecision> {
    const now = this.safeNow();
    if (now === undefined || !isSafeKey(key)) return rateLimited(1);
    this.cleanup(now);
    const bucket = this.#buckets.get(key);
    if (bucket === undefined) {
      return this.#buckets.size >= this.policy.maximumEntries
        ? rateLimited(secondsUntilNextCleanup(this.#buckets, now, this.policy))
        : allowed();
    }
    return bucket.requests >= this.policy.maximumRequests
      ? rateLimited(secondsUntilWindowEnd(bucket, now, this.policy))
      : allowed();
  }

  consume(key: string): Readonly<MachineRateLimitDecision> {
    const now = this.safeNow();
    if (now === undefined || !isSafeKey(key)) return rateLimited(1);
    this.cleanup(now);
    const bucket = this.#buckets.get(key);
    if (bucket === undefined) {
      if (this.#buckets.size >= this.policy.maximumEntries) {
        return rateLimited(
          secondsUntilNextCleanup(this.#buckets, now, this.policy),
        );
      }
      this.#buckets.set(key, { windowStartedAt: now, requests: 1 });
      return allowed();
    }
    if (bucket.requests >= this.policy.maximumRequests) {
      return rateLimited(secondsUntilWindowEnd(bucket, now, this.policy));
    }
    this.#buckets.set(key, {
      windowStartedAt: bucket.windowStartedAt,
      requests: bucket.requests + 1,
    });
    return allowed();
  }

  get retainedEntryCount(): number {
    return this.#buckets.size;
  }

  private safeNow(): number | undefined {
    const now = this.clock.now();
    if (
      !Number.isSafeInteger(now) ||
      now < 0 ||
      (this.#lastObservedNow !== undefined && now < this.#lastObservedNow)
    ) {
      return undefined;
    }
    this.#lastObservedNow = now;
    return now;
  }

  private cleanup(now: number): void {
    for (const [key, bucket] of this.#buckets) {
      if (windowExpired(bucket, now, this.policy)) this.#buckets.delete(key);
    }
  }
}

export function validateMachineRateLimitPolicy(
  policy: unknown,
): asserts policy is Readonly<MachineRateLimitPolicy> {
  validatePolicy(policy);
}

function validatePolicy(
  policy: unknown,
): asserts policy is MachineRateLimitPolicy {
  if (
    typeof policy !== 'object' ||
    policy === null ||
    !isPositiveSafeInteger(Reflect.get(policy, 'maximumRequests')) ||
    !isPositiveSafeInteger(Reflect.get(policy, 'windowMilliseconds')) ||
    !isPositiveSafeInteger(Reflect.get(policy, 'maximumEntries'))
  ) {
    throw new Error('Machine rate-limit policy is invalid.');
  }
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isSafeKey(key: string): boolean {
  return key.length > 0 && key.length <= 200;
}

function windowExpired(
  bucket: MachineRateLimitBucket,
  now: number,
  policy: MachineRateLimitPolicy,
): boolean {
  return now - bucket.windowStartedAt >= policy.windowMilliseconds;
}

function secondsUntilWindowEnd(
  bucket: MachineRateLimitBucket,
  now: number,
  policy: MachineRateLimitPolicy,
): number {
  return Math.max(
    1,
    Math.ceil(
      (bucket.windowStartedAt + policy.windowMilliseconds - now) / 1000,
    ),
  );
}

function secondsUntilNextCleanup(
  buckets: ReadonlyMap<string, MachineRateLimitBucket>,
  now: number,
  policy: MachineRateLimitPolicy,
): number {
  let minimum = policy.windowMilliseconds;
  for (const bucket of buckets.values()) {
    minimum = Math.min(
      minimum,
      bucket.windowStartedAt + policy.windowMilliseconds - now,
    );
  }
  return Math.max(1, Math.ceil(minimum / 1000));
}

function allowed(): Readonly<MachineRateLimitDecision> {
  return Object.freeze({ outcome: 'allowed', retryAfterSeconds: undefined });
}

function rateLimited(
  retryAfterSeconds: number,
): Readonly<MachineRateLimitDecision> {
  return Object.freeze({ outcome: 'rate_limited', retryAfterSeconds });
}
