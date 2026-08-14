import { randomUUID } from 'node:crypto';

import type { Database } from '../../database/database.ts';
import { createDatabaseDependency } from '../../database/readiness.ts';
import {
  runSchedulerPass,
  type SchedulerPassResult,
} from '../../collection/scheduler/scheduler-pass.ts';
import type { EndpointCollectionServiceDependencies } from '../../collection/endpoint-collection-service.ts';
import {
  executeClaimedEndpointCollectionJob,
  reconcileExpiredEndpointCollectionJob,
  type EndpointCollectionJobExecutionResult,
  type ExpiredJobReconciliationResult,
} from '../../jobs/execute-endpoint-collection-job.ts';
import {
  finalizeEndpointCollectionJobExecution,
  type FinalizedEndpointCollectionJobResult,
} from '../../jobs/finalize-endpoint-collection-job.ts';
import {
  claimNextEndpointCollectionJob,
  listExpiredRunningEndpointCollectionJobs,
  renewEndpointCollectionJobLease,
  type PersistedEndpointCollectionJob,
} from '../../jobs/endpoint-collection-job-repository.ts';
import type { RuntimeConfig } from '../../shared/runtime-config.ts';
import {
  validateWorkerRuntimeTiming,
  WORKER_RUNTIME_TIMING,
  type WorkerRuntimeTiming,
} from './runtime-timing.ts';

export type WorkerDiagnosticValue = string | number | boolean;
export type WorkerDiagnostic = Readonly<Record<string, WorkerDiagnosticValue>>;

export interface WorkerRuntimeDependencies {
  checkReady(): Promise<boolean>;
  close(): Promise<void>;
  schedulerPass(now: Date, random: () => number): Promise<SchedulerPassResult>;
  claimNext(input: {
    readonly workerId: string;
    readonly claimedAt: Date;
    readonly leaseExpiresAt: Date;
  }): Promise<PersistedEndpointCollectionJob | undefined>;
  renewLease(
    jobId: string,
    claimToken: string,
    renewedAt: Date,
    leaseExpiresAt: Date,
  ): Promise<PersistedEndpointCollectionJob | undefined>;
  execute(
    jobId: string,
    claimToken: string,
    now: Date,
  ): Promise<EndpointCollectionJobExecutionResult>;
  finalize(
    result: EndpointCollectionJobExecutionResult,
    terminalAt: Date,
    random: () => number,
  ): Promise<FinalizedEndpointCollectionJobResult>;
  listExpired(
    expiredAt: Date,
    limit: number,
  ): Promise<readonly PersistedEndpointCollectionJob[]>;
  reconcileExpired(
    jobId: string,
    input: {
      readonly workerId: string;
      readonly expiredAt: Date;
      readonly recoveredAt: Date;
      readonly leaseExpiresAt: Date;
      readonly availableAt: Date;
    },
  ): Promise<ExpiredJobReconciliationResult>;
  readonly workerId: string;
  now(): Date;
  random(): number;
  wait(milliseconds: number, signal: AbortSignal): Promise<void>;
  emit(event: WorkerDiagnostic): void;
}

export interface WorkerRuntimeOptions {
  readonly timing?: WorkerRuntimeTiming;
}

export interface WorkerRuntime {
  readonly config: Readonly<RuntimeConfig>;
  readonly state: 'ready' | 'stopping' | 'stopped';
  readonly stopped: Promise<void>;
  shutdown(): Promise<void>;
}

export interface WorkerRuntimeDependencyOptions {
  readonly workerId?: string;
  readonly now?: () => Date;
  readonly random?: () => number;
  readonly wait?: WorkerRuntimeDependencies['wait'];
  readonly emit?: WorkerRuntimeDependencies['emit'];
  readonly serviceDependencies?: Partial<EndpointCollectionServiceDependencies>;
}

export function createWorkerRuntimeDependencies(
  database: Database,
  options: WorkerRuntimeDependencyOptions = {},
): WorkerRuntimeDependencies {
  const readiness = createDatabaseDependency(database);
  const random = options.random ?? Math.random;
  const dependencies: WorkerRuntimeDependencies = {
    checkReady: () => readiness.checkReady(),
    close: () => database.close(),
    schedulerPass: (now: Date, randomSource: () => number) =>
      runSchedulerPass(database, { now, random: randomSource }),
    claimNext: (input) => claimNextEndpointCollectionJob(database, input),
    renewLease: (jobId, claimToken, renewedAt, leaseExpiresAt) =>
      renewEndpointCollectionJobLease(
        database,
        jobId,
        claimToken,
        renewedAt,
        leaseExpiresAt,
      ),
    execute: (jobId, claimToken, now) =>
      executeClaimedEndpointCollectionJob(database, {
        jobId,
        claimToken,
        now,
        ...(options.serviceDependencies === undefined
          ? {}
          : { serviceDependencies: options.serviceDependencies }),
      }),
    finalize: (result, terminalAt, randomSource) =>
      finalizeEndpointCollectionJobExecution(database, {
        result,
        terminalAt,
        random: randomSource,
      }),
    listExpired: (expiredAt, limit) =>
      listExpiredRunningEndpointCollectionJobs(database, expiredAt, limit),
    reconcileExpired: (jobId, input) =>
      reconcileExpiredEndpointCollectionJob(database, { jobId, ...input }),
    workerId: options.workerId ?? `worker-${process.pid}-${randomUUID()}`,
    now: options.now ?? (() => new Date()),
    random,
    wait: options.wait ?? abortableWait,
    emit: options.emit ?? (() => undefined),
  };
  return Object.freeze(dependencies);
}

export async function startWorkerRuntime(
  config: Readonly<RuntimeConfig>,
  dependencies: WorkerRuntimeDependencies,
  options: WorkerRuntimeOptions = {},
): Promise<WorkerRuntime> {
  let timing: Readonly<WorkerRuntimeTiming>;
  try {
    timing = validateWorkerRuntimeTiming(
      options.timing ?? WORKER_RUNTIME_TIMING,
    );
    if (!(await dependencies.checkReady()))
      throw new Error('Database not ready');
  } catch (error) {
    await dependencies.close().catch(() => undefined);
    throw error;
  }

  let state: WorkerRuntime['state'] = 'ready';
  let resolveStopped!: () => void;
  const stopped = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });
  const stopping = new AbortController();
  const inFlight = new Set<Promise<void>>();
  let shutdownPromise: Promise<void> | undefined;

  emit(dependencies, 'worker.ready');
  const schedulerLoop = runSchedulerLoop(dependencies, timing, stopping.signal);
  const dispatcherLoop = runDispatcherLoop(
    dependencies,
    timing,
    stopping.signal,
    inFlight,
  );
  const recoveryLoop = runRecoveryLoop(dependencies, timing, stopping.signal);

  return {
    config,
    get state() {
      return state;
    },
    stopped,
    shutdown() {
      shutdownPromise ??= (async () => {
        state = 'stopping';
        emit(dependencies, 'worker.shutdown_begin');
        stopping.abort();
        try {
          await Promise.allSettled([
            schedulerLoop,
            dispatcherLoop,
            recoveryLoop,
          ]);
          await Promise.allSettled([...inFlight]);
          await dependencies.close();
        } finally {
          state = 'stopped';
          emit(dependencies, 'worker.shutdown_complete');
          resolveStopped();
        }
      })();
      return shutdownPromise;
    },
  };
}

async function runSchedulerLoop(
  dependencies: WorkerRuntimeDependencies,
  timing: Readonly<WorkerRuntimeTiming>,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      const result = await dependencies.schedulerPass(
        requiredNow(dependencies),
        dependencies.random,
      );
      emit(dependencies, 'worker.scheduler_pass_completed', {
        considered: result.considered,
        enqueued: result.enqueued,
        alreadyOutstanding: result.alreadyOutstanding,
      });
    } catch {
      emit(dependencies, 'worker.scheduler_pass_failed');
    }
    if (signal.aborted) return;
    await dependencies.wait(timing.schedulerPassIntervalMilliseconds, signal);
  }
}

async function runDispatcherLoop(
  dependencies: WorkerRuntimeDependencies,
  timing: Readonly<WorkerRuntimeTiming>,
  signal: AbortSignal,
  inFlight: Set<Promise<void>>,
): Promise<void> {
  while (!signal.aborted) {
    if (inFlight.size >= timing.localExecutionLimit) {
      await Promise.race(inFlight);
      continue;
    }

    let job: PersistedEndpointCollectionJob | undefined;
    const claimedAt = requiredNow(dependencies);
    try {
      job = await dependencies.claimNext({
        workerId: dependencies.workerId,
        claimedAt,
        leaseExpiresAt: addMilliseconds(
          claimedAt,
          timing.jobLeaseDurationMilliseconds,
        ),
      });
    } catch {
      emit(dependencies, 'worker.job_claim_failed');
      if (!signal.aborted) {
        await dependencies.wait(timing.idleJobPollIntervalMilliseconds, signal);
      }
      continue;
    }

    if (job === undefined) {
      if (!signal.aborted) {
        await dependencies.wait(timing.idleJobPollIntervalMilliseconds, signal);
      }
      continue;
    }

    emit(dependencies, 'worker.job_claimed', jobFields(job));
    const task = runClaimedJob(dependencies, timing, job).catch(() => {
      emit(dependencies, 'worker.job_task_failed', jobFields(job));
    });
    inFlight.add(task);
    void task.finally(() => inFlight.delete(task));
  }
}

async function runClaimedJob(
  dependencies: WorkerRuntimeDependencies,
  timing: Readonly<WorkerRuntimeTiming>,
  job: PersistedEndpointCollectionJob,
): Promise<void> {
  const claimToken = job.claimToken;
  if (claimToken === undefined) {
    emit(dependencies, 'worker.job_invalid_claim', jobFields(job));
    return;
  }
  emit(dependencies, 'worker.job_started', jobFields(job));

  const workFinished = new AbortController();
  let ownershipLost = false;
  const renewal = renewLeaseWhileInFlight(
    dependencies,
    timing,
    job,
    claimToken,
    workFinished.signal,
    () => {
      ownershipLost = true;
    },
  );

  let execution: EndpointCollectionJobExecutionResult | undefined;
  try {
    execution = await dependencies.execute(
      job.id,
      claimToken,
      requiredNow(dependencies),
    );
  } catch {
    emit(dependencies, 'worker.job_execution_failed', jobFields(job));
  } finally {
    workFinished.abort();
    await renewal;
  }

  if (execution === undefined || ownershipLost) {
    if (ownershipLost) {
      emit(dependencies, 'worker.job_finalization_suppressed', jobFields(job));
    }
    return;
  }

  try {
    const finalized = await dependencies.finalize(
      execution,
      requiredNow(dependencies),
      dependencies.random,
    );
    emitFinalizedJob(dependencies, finalized);
  } catch {
    emit(dependencies, 'worker.job_finalization_failed', jobFields(job));
  }
}

async function renewLeaseWhileInFlight(
  dependencies: WorkerRuntimeDependencies,
  timing: Readonly<WorkerRuntimeTiming>,
  job: PersistedEndpointCollectionJob,
  claimToken: string,
  signal: AbortSignal,
  ownershipLost: () => void,
): Promise<void> {
  while (!signal.aborted) {
    await dependencies.wait(timing.leaseRenewalIntervalMilliseconds, signal);
    if (signal.aborted) return;
    const renewedAt = requiredNow(dependencies);
    try {
      const renewed = await dependencies.renewLease(
        job.id,
        claimToken,
        renewedAt,
        addMilliseconds(renewedAt, timing.jobLeaseDurationMilliseconds),
      );
      if (renewed !== undefined) continue;
    } catch {
      // Ownership uncertainty and database failures use the same fail-closed path.
    }
    ownershipLost();
    emit(dependencies, 'worker.job_lease_ownership_lost', jobFields(job));
    return;
  }
}

async function runRecoveryLoop(
  dependencies: WorkerRuntimeDependencies,
  timing: Readonly<WorkerRuntimeTiming>,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    await dependencies.wait(
      timing.staleRecoveryPassIntervalMilliseconds,
      signal,
    );
    if (signal.aborted) return;
    const expiredAt = requiredNow(dependencies);
    let jobs: readonly PersistedEndpointCollectionJob[];
    try {
      jobs = await dependencies.listExpired(
        expiredAt,
        timing.staleRecoveryBatchLimit,
      );
    } catch {
      emit(dependencies, 'worker.stale_recovery_pass_failed');
      continue;
    }

    for (const job of jobs) {
      if (signal.aborted) return;
      try {
        const recoveredAt = requiredNow(dependencies);
        const result = await dependencies.reconcileExpired(job.id, {
          workerId: dependencies.workerId,
          expiredAt,
          recoveredAt,
          leaseExpiresAt: addMilliseconds(
            recoveredAt,
            timing.jobLeaseDurationMilliseconds,
          ),
          availableAt: recoveredAt,
        });
        if (result.status === 'requeued') {
          emit(
            dependencies,
            'worker.stale_job_requeued',
            jobFields(result.job),
          );
          continue;
        }
        const finalized = await dependencies.finalize(
          result.result,
          requiredNow(dependencies),
          dependencies.random,
        );
        emit(dependencies, 'worker.stale_job_recovered', jobFields(job));
        emitFinalizedJob(dependencies, finalized);
      } catch {
        emit(dependencies, 'worker.stale_job_recovery_failed', jobFields(job));
      }
    }
  }
}

function emitFinalizedJob(
  dependencies: WorkerRuntimeDependencies,
  result: FinalizedEndpointCollectionJobResult,
): void {
  const fields = jobFields(result.job);
  switch (result.disposition) {
    case 'terminal':
      emit(dependencies, `worker.job_${result.job.status}`, fields);
      break;
    case 'deferred':
      emit(dependencies, 'worker.job_deferred', {
        ...fields,
        reason: result.reason,
      });
      break;
    case 'retry_enqueued':
      emit(dependencies, 'worker.job_retry_enqueued', {
        ...fields,
        successorJobId: result.successor.id,
        successorAttemptNumber: result.successor.attemptNumber,
      });
      break;
  }
}

function jobFields(
  job: PersistedEndpointCollectionJob,
): Readonly<Record<string, WorkerDiagnosticValue>> {
  return Object.freeze({
    jobId: job.id,
    endpointId: job.sourceEndpointId,
    triggerKind: job.triggerKind,
    attemptNumber: job.attemptNumber,
    ...(job.collectionRunId === undefined
      ? {}
      : { collectionRunId: job.collectionRunId }),
  });
}

function emit(
  dependencies: WorkerRuntimeDependencies,
  event: string,
  fields: Readonly<Record<string, WorkerDiagnosticValue>> = {},
): void {
  try {
    dependencies.emit(Object.freeze({ event, role: 'worker', ...fields }));
  } catch {
    // Diagnostics must never become runtime authority or stop durable work.
  }
}

function requiredNow(dependencies: WorkerRuntimeDependencies): Date {
  const now = dependencies.now();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError('Worker runtime clock returned an invalid timestamp.');
  }
  return now;
}

function addMilliseconds(value: Date, milliseconds: number): Date {
  return new Date(value.getTime() + milliseconds);
}

function abortableWait(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    }
  });
}
