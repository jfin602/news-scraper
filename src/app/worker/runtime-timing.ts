import { COLLECTION_CAPACITY_LIMITS } from '../../collection/concurrency/collection-capacity.ts';

export const WORKER_RUNTIME_TIMING = Object.freeze({
  schedulerPassIntervalMilliseconds: 15_000,
  idleJobPollIntervalMilliseconds: 1_000,
  jobLeaseDurationMilliseconds: 120_000,
  leaseRenewalIntervalMilliseconds: 30_000,
  staleRecoveryPassIntervalMilliseconds: 30_000,
  staleRecoveryBatchLimit: 25,
  localExecutionLimit: COLLECTION_CAPACITY_LIMITS.global,
});

export interface WorkerRuntimeTiming {
  readonly schedulerPassIntervalMilliseconds: number;
  readonly idleJobPollIntervalMilliseconds: number;
  readonly jobLeaseDurationMilliseconds: number;
  readonly leaseRenewalIntervalMilliseconds: number;
  readonly staleRecoveryPassIntervalMilliseconds: number;
  readonly staleRecoveryBatchLimit: number;
  readonly localExecutionLimit: number;
}

export function validateWorkerRuntimeTiming(
  input: WorkerRuntimeTiming,
): Readonly<WorkerRuntimeTiming> {
  for (const [field, value] of Object.entries(input)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(
        `Worker runtime ${field} must be a positive integer.`,
      );
    }
  }
  if (
    input.leaseRenewalIntervalMilliseconds >= input.jobLeaseDurationMilliseconds
  ) {
    throw new TypeError(
      'Worker runtime lease renewal interval must be shorter than the lease duration.',
    );
  }
  if (input.localExecutionLimit > COLLECTION_CAPACITY_LIMITS.global) {
    throw new TypeError(
      'Worker runtime local execution limit cannot exceed global collection capacity.',
    );
  }
  if (input.staleRecoveryBatchLimit > 100) {
    throw new TypeError(
      'Worker runtime stale recovery batch limit exceeds repository bounds.',
    );
  }
  return Object.freeze({ ...input });
}
