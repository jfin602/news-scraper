import type { Database, QueryExecutor } from '../database/database.ts';
import { applyCooldownFromFinalCollectionFailure } from '../sources/repository.ts';
import type { EndpointCollectionJobExecutionResult } from './execute-endpoint-collection-job.ts';
import {
  deferClaimedEndpointCollectionJob,
  enqueueEndpointCollectionJob,
  findEndpointCollectionJobById,
  terminalizeEndpointCollectionJob,
  type EndpointCollectionJobTerminalStatus,
  type PersistedEndpointCollectionJob,
} from './endpoint-collection-job-repository.ts';
import {
  calculateContentionDeferralMilliseconds,
  calculateRetryDelayMilliseconds,
  COOLDOWN_FAILURE_THRESHOLD,
  decideEndpointCollectionJobDisposition,
  MINIMUM_COOLDOWN_MILLISECONDS,
} from './endpoint-collection-job-policy.ts';

export type ContentionDeferralReason =
  'endpoint_locked' | 'collection_capacity_limited';

export type FinalizedEndpointCollectionJobResult =
  | Readonly<{
      disposition: 'terminal';
      job: PersistedEndpointCollectionJob;
      cooldownUntil?: Date;
    }>
  | Readonly<{
      disposition: 'retry_enqueued';
      job: PersistedEndpointCollectionJob;
      successor: PersistedEndpointCollectionJob;
    }>
  | Readonly<{
      disposition: 'deferred';
      reason: ContentionDeferralReason;
      job: PersistedEndpointCollectionJob;
    }>;

export interface FinalizeEndpointCollectionJobExecutionInput {
  readonly result: EndpointCollectionJobExecutionResult;
  readonly terminalAt: Date;
  readonly random?: () => number;
}

export interface DeferClaimedEndpointCollectionJobInput {
  readonly jobId: string;
  readonly claimToken: string;
  readonly deferredAt: Date;
  readonly reason: ContentionDeferralReason;
  readonly random?: () => number;
}

export class EndpointCollectionJobFinalizationError extends Error {
  constructor(reason: string, options?: ErrorOptions) {
    super(`Endpoint collection job finalization failed: ${reason}`, options);
    this.name = 'EndpointCollectionJobFinalizationError';
  }
}

export async function finalizeEndpointCollectionJobExecution(
  database: Database,
  input: FinalizeEndpointCollectionJobExecutionInput,
): Promise<FinalizedEndpointCollectionJobResult> {
  const terminalAt = requiredTimestamp(input.terminalAt);
  const disposition = decideEndpointCollectionJobDisposition(input.result);
  if (disposition.kind === 'defer') {
    return deferClaimedEndpointCollectionJobExecution(database, {
      jobId: input.result.jobId,
      claimToken: input.result.claimToken,
      deferredAt: terminalAt,
      reason: disposition.reason,
      ...(input.random === undefined ? {} : { random: input.random }),
    });
  }

  if (disposition.kind === 'retry') {
    const delay = calculateRetryDelayMilliseconds(
      input.result.attemptNumber,
      randomValue(input.random),
    );
    const availableAt = new Date(terminalAt.getTime() + delay);
    return database.transaction(async (transaction) => {
      await requireMatchingCurrentJob(transaction, input.result);
      const terminal = await terminalizeEndpointCollectionJob(
        transaction,
        input.result.jobId,
        input.result.claimToken,
        terminalInput(input.result, terminalAt, failureStatus(input.result)),
      );
      if (terminal === undefined) throw ownershipLost();
      const successor = await enqueueEndpointCollectionJob(transaction, {
        sourceEndpointId: terminal.sourceEndpointId,
        triggerKind: terminal.triggerKind,
        availableAt,
        attemptNumber: terminal.attemptNumber + 1,
        previousJobId: terminal.id,
      });
      if (!successor.created) {
        throw new EndpointCollectionJobFinalizationError(
          'retry successor could not acquire the endpoint job slot',
        );
      }
      return Object.freeze({
        disposition: 'retry_enqueued' as const,
        job: terminal,
        successor: successor.job,
      });
    });
  }

  return database.transaction(async (transaction) => {
    await requireMatchingCurrentJob(transaction, input.result);
    const terminal = await terminalizeEndpointCollectionJob(
      transaction,
      input.result.jobId,
      input.result.claimToken,
      terminalInput(input.result, terminalAt, disposition.status),
    );
    if (terminal === undefined) throw ownershipLost();

    let cooldownUntil: Date | undefined;
    if (
      input.result.category === 'failed' &&
      input.result.collectionRunOccurred &&
      input.result.collectionRunId !== undefined
    ) {
      const endpoint = await applyCooldownFromFinalCollectionFailure(
        transaction,
        input.result.collectionRunId,
        MINIMUM_COOLDOWN_MILLISECONDS / 1_000,
        COOLDOWN_FAILURE_THRESHOLD,
      );
      cooldownUntil = endpoint?.cooldownUntil;
    }
    return Object.freeze({
      disposition: 'terminal' as const,
      job: terminal,
      ...(cooldownUntil === undefined ? {} : { cooldownUntil }),
    });
  });
}

export async function deferClaimedEndpointCollectionJobExecution(
  database: Database,
  input: DeferClaimedEndpointCollectionJobInput,
): Promise<FinalizedEndpointCollectionJobResult> {
  const deferredAt = requiredTimestamp(input.deferredAt);
  const delay = calculateContentionDeferralMilliseconds(
    randomValue(input.random),
  );
  const job = await deferClaimedEndpointCollectionJob(
    database,
    input.jobId,
    input.claimToken,
    deferredAt,
    new Date(deferredAt.getTime() + delay),
  );
  if (job === undefined) throw ownershipLost();
  return Object.freeze({
    disposition: 'deferred' as const,
    reason: input.reason,
    job,
  });
}

async function requireMatchingCurrentJob(
  executor: QueryExecutor,
  result: EndpointCollectionJobExecutionResult,
): Promise<void> {
  const job = await findEndpointCollectionJobById(executor, result.jobId);
  if (
    job === undefined ||
    job.status !== 'running' ||
    job.claimToken !== result.claimToken ||
    job.sourceEndpointId !== result.endpointId ||
    job.triggerKind !== result.triggerKind ||
    job.attemptNumber !== result.attemptNumber ||
    job.collectionRunId !== result.collectionRunId
  ) {
    throw ownershipLost();
  }
  if (
    (result.collectionRunOccurred && result.collectionRunId === undefined) ||
    (!result.collectionRunOccurred && result.collectionRunId !== undefined) ||
    (result.category === 'failed' && !result.collectionRunOccurred)
  ) {
    throw new EndpointCollectionJobFinalizationError(
      'execution result has inconsistent Collection run state',
    );
  }
}

function terminalInput(
  result: EndpointCollectionJobExecutionResult,
  terminalAt: Date,
  status: EndpointCollectionJobTerminalStatus,
) {
  return Object.freeze({
    status,
    terminalAt,
    outcomeCode: result.outcome,
    ...(result.reason === undefined ? {} : { reasonCode: result.reason }),
  });
}

function failureStatus(
  result: EndpointCollectionJobExecutionResult,
): 'failed' | 'abandoned' {
  return result.outcome === 'worker_interrupted' ? 'abandoned' : 'failed';
}

function randomValue(random: (() => number) | undefined): number {
  try {
    return (random ?? Math.random)();
  } catch (error) {
    throw new EndpointCollectionJobFinalizationError('random source failed', {
      cause: error,
    });
  }
}

function requiredTimestamp(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new EndpointCollectionJobFinalizationError(
      'transition time is invalid',
    );
  }
  return value;
}

function ownershipLost(): EndpointCollectionJobFinalizationError {
  return new EndpointCollectionJobFinalizationError(
    'current job claim ownership was not verified',
  );
}
