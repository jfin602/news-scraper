import type { Database } from '../database/database.ts';
import type { CollectionCapacityScope } from '../collection/concurrency/collection-capacity.ts';
import {
  executeEndpointCollection,
  type EndpointCollectionServiceDependencies,
} from '../collection/endpoint-collection-service.ts';
import type { RetryClassification } from '../collection/fetchers/fetcher.ts';
import {
  findCollectionRunById,
  reconcileInterruptedCollectionRun,
  type PersistedCollectionRun,
} from '../collection/runs/repository.ts';
import { applyTerminalCollectionRunToEndpointRuntime } from '../sources/repository.ts';
import {
  findEndpointCollectionJobById,
  recoverExpiredStartedEndpointCollectionJob,
  requeueExpiredUnstartedEndpointCollectionJob,
  type EndpointCollectionJobTriggerKind,
  type PersistedEndpointCollectionJob,
} from './endpoint-collection-job-repository.ts';

export interface EndpointCollectionJobExecutionResult {
  readonly jobId: string;
  readonly attemptNumber: number;
  readonly endpointId: string;
  readonly triggerKind: EndpointCollectionJobTriggerKind;
  readonly claimToken: string;
  readonly collectionRunOccurred: boolean;
  readonly collectionRunId?: string;
  readonly category: 'succeeded' | 'failed' | 'blocked';
  readonly outcome: string;
  readonly reason?: string;
  readonly retryClassification?: RetryClassification;
  readonly limitingScope?: CollectionCapacityScope;
}

export interface ExecuteClaimedEndpointCollectionJobInput {
  readonly jobId: string;
  readonly claimToken: string;
  readonly now: Date;
  readonly serviceDependencies?: Partial<EndpointCollectionServiceDependencies>;
}

export async function executeClaimedEndpointCollectionJob(
  database: Database,
  input: ExecuteClaimedEndpointCollectionJobInput,
): Promise<EndpointCollectionJobExecutionResult> {
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) {
    throw new TypeError('Endpoint collection job execution time is invalid.');
  }
  const job = await requireCurrentClaim(
    database,
    input.jobId,
    input.claimToken,
    input.now,
  );
  const result = await executeEndpointCollection(
    database,
    {
      executionKind: 'durable_job',
      triggerKind: job.triggerKind,
      sourceEndpointId: job.sourceEndpointId,
      jobId: job.id,
      claimToken: input.claimToken,
      attemptNumber: job.attemptNumber,
      now: input.now,
    },
    input.serviceDependencies,
  );

  if (result.status === 'not_found') {
    return blockedResult(job, input.claimToken, 'endpoint_not_found');
  }
  if (result.status === 'skipped') {
    return blockedResult(job, input.claimToken, result.reason);
  }
  if (result.status === 'capacity_blocked') {
    return blockedResult(
      job,
      input.claimToken,
      result.reason,
      result.limitingScope,
    );
  }
  const collection = result.collection;
  if (collection.status === 'blocked') {
    return blockedResult(job, input.claimToken, collection.reason);
  }
  return Object.freeze({
    jobId: job.id,
    attemptNumber: job.attemptNumber,
    endpointId: job.sourceEndpointId,
    triggerKind: job.triggerKind,
    claimToken: input.claimToken,
    collectionRunOccurred: true,
    collectionRunId: collection.collectionRunId,
    category: collection.status,
    outcome: collection.outcome,
    ...(collection.reason === undefined ? {} : { reason: collection.reason }),
    ...(collection.retryClassification === undefined
      ? {}
      : { retryClassification: collection.retryClassification }),
  });
}

export type ExpiredJobReconciliationResult =
  | Readonly<{
      status: 'requeued';
      job: PersistedEndpointCollectionJob;
    }>
  | Readonly<{
      status: 'reconciled';
      result: EndpointCollectionJobExecutionResult;
    }>;

export interface ReconcileExpiredEndpointCollectionJobInput {
  readonly jobId: string;
  readonly workerId: string;
  readonly expiredAt: Date;
  readonly recoveredAt: Date;
  readonly leaseExpiresAt: Date;
  readonly availableAt: Date;
}

export async function reconcileExpiredEndpointCollectionJob(
  database: Database,
  input: ReconcileExpiredEndpointCollectionJobInput,
): Promise<ExpiredJobReconciliationResult> {
  return database.transaction(async (transaction) => {
    const current = await findEndpointCollectionJobById(
      transaction,
      input.jobId,
    );
    if (
      current === undefined ||
      current.status !== 'running' ||
      current.leaseExpiresAt === undefined ||
      current.leaseExpiresAt > input.expiredAt
    ) {
      throw new Error('Endpoint collection job is not recoverably expired.');
    }

    if (current.collectionRunId === undefined) {
      const requeued = await requeueExpiredUnstartedEndpointCollectionJob(
        transaction,
        current.id,
        input.expiredAt,
        input.availableAt,
      );
      if (requeued === undefined) {
        throw new Error('Expired unstarted job recovery lost ownership.');
      }
      return Object.freeze({ status: 'requeued' as const, job: requeued });
    }

    const existingRun = await findCollectionRunById(
      transaction,
      current.collectionRunId,
    );
    if (
      existingRun === undefined ||
      existingRun.sourceEndpointId !== current.sourceEndpointId ||
      existingRun.executionId !== current.id ||
      existingRun.triggerKind !== current.triggerKind
    ) {
      throw new Error('Expired job Collection run ownership is invalid.');
    }

    const recovered = await recoverExpiredStartedEndpointCollectionJob(
      transaction,
      current.id,
      input,
    );
    if (recovered?.claimToken === undefined) {
      throw new Error('Expired started job recovery lost ownership.');
    }
    const run =
      existingRun.runStatus === 'running'
        ? await reconcileInterruptedCollectionRun(
            transaction,
            existingRun.id,
            input.recoveredAt,
          )
        : existingRun;
    await applyTerminalCollectionRunToEndpointRuntime(transaction, run.id);
    return Object.freeze({
      status: 'reconciled' as const,
      result: resultFromPersistedRun(recovered, run),
    });
  });
}

function resultFromPersistedRun(
  job: PersistedEndpointCollectionJob,
  run: PersistedCollectionRun,
): EndpointCollectionJobExecutionResult {
  if (job.claimToken === undefined || run.runStatus === 'running') {
    throw new Error('Recovered job/run state is not terminalizable.');
  }
  return Object.freeze({
    jobId: job.id,
    attemptNumber: job.attemptNumber,
    endpointId: job.sourceEndpointId,
    triggerKind: job.triggerKind,
    claimToken: job.claimToken,
    collectionRunOccurred: true,
    collectionRunId: run.id,
    category: run.runStatus,
    outcome: run.outcomeCode ?? inferOutcome(run),
    ...(run.errorCode === undefined ? {} : { reason: run.errorCode }),
    ...(run.retryClassification === undefined
      ? {}
      : { retryClassification: run.retryClassification }),
  });
}

function inferOutcome(run: PersistedCollectionRun): string {
  if (run.runStatus === 'succeeded') {
    return run.transportStatus === 'not_modified' ? 'not_modified' : 'content';
  }
  if (run.parserStatus === 'failed') return 'parser_failed';
  if (run.normalizationStatus === 'failed') return 'normalization_failed';
  if (run.processingStatus === 'failed') return 'processing_failed';
  return 'fetch_failed';
}

async function requireCurrentClaim(
  database: Database,
  jobId: string,
  claimToken: string,
  now: Date,
): Promise<PersistedEndpointCollectionJob> {
  const job = await findEndpointCollectionJobById(database, jobId);
  if (
    job === undefined ||
    job.status !== 'running' ||
    job.claimToken !== claimToken ||
    job.leaseExpiresAt === undefined ||
    job.leaseExpiresAt <= now
  ) {
    throw new Error('Endpoint collection job claim is not current.');
  }
  return job;
}

function blockedResult(
  job: PersistedEndpointCollectionJob,
  claimToken: string,
  reason: string,
  limitingScope?: CollectionCapacityScope,
): EndpointCollectionJobExecutionResult {
  return Object.freeze({
    jobId: job.id,
    attemptNumber: job.attemptNumber,
    endpointId: job.sourceEndpointId,
    triggerKind: job.triggerKind,
    claimToken,
    collectionRunOccurred: false,
    category: 'blocked' as const,
    outcome: reason,
    reason,
    ...(limitingScope === undefined ? {} : { limitingScope }),
  });
}
