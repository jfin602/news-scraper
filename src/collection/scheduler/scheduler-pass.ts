import type { QueryExecutor } from '../../database/database.ts';
import { enqueueEndpointCollectionJob } from '../../jobs/endpoint-collection-job-repository.ts';
import {
  calculateSchedulingJitterMilliseconds,
  SchedulingJitterError,
} from './jitter.ts';
import { listDueEndpoints } from './due-endpoint-repository.ts';

export const DEFAULT_SCHEDULER_BATCH_LIMIT = 25;

export interface SchedulerPassInput {
  readonly now: Date;
  readonly random?: () => number;
  readonly limit?: number;
}

export interface SchedulerPassResult {
  readonly considered: number;
  readonly enqueued: number;
  readonly alreadyOutstanding: number;
}

export class SchedulerPassError extends Error {
  constructor(reason: string, options?: ErrorOptions) {
    super(`Scheduler pass failed: ${reason}`, options);
    this.name = 'SchedulerPassError';
  }
}

/**
 * Schedules one bounded batch. Endpoint execution rechecks eligibility, and
 * only execution outcome processing may advance next_due_at.
 */
export async function runSchedulerPass(
  executor: QueryExecutor,
  input: SchedulerPassInput,
): Promise<SchedulerPassResult> {
  const now = requiredTimestamp(input.now);
  const random = input.random ?? Math.random;
  const limit = input.limit ?? DEFAULT_SCHEDULER_BATCH_LIMIT;
  const dueEndpoints = await listDueEndpoints(executor, now, limit);
  let enqueued = 0;
  let alreadyOutstanding = 0;

  for (const endpoint of dueEndpoints) {
    let randomValue: number;
    try {
      randomValue = random();
    } catch (error) {
      throw new SchedulerPassError('random source failed', { cause: error });
    }
    let availableAt: Date;
    try {
      availableAt = new Date(
        now.getTime() +
          calculateSchedulingJitterMilliseconds(
            endpoint.pollIntervalSeconds,
            randomValue,
          ),
      );
    } catch (error) {
      if (error instanceof SchedulingJitterError) {
        throw new SchedulerPassError('jitter calculation failed', {
          cause: error,
        });
      }
      throw error;
    }
    const result = await enqueueEndpointCollectionJob(executor, {
      sourceEndpointId: endpoint.id,
      triggerKind: 'scheduled',
      availableAt,
      attemptNumber: 1,
    });
    if (result.created) enqueued += 1;
    else alreadyOutstanding += 1;
  }

  return Object.freeze({
    considered: dueEndpoints.length,
    enqueued,
    alreadyOutstanding,
  });
}

function requiredTimestamp(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new SchedulerPassError('scheduler time is invalid');
  }
  return value;
}
