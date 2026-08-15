import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  startWorkerRuntime,
  type WorkerDiagnostic,
  type WorkerRuntimeDependencies,
} from '../../src/app/worker/runtime.ts';
import type { WorkerRuntimeTiming } from '../../src/app/worker/runtime-timing.ts';
import {
  validateWorkerRuntimeTiming,
  WORKER_RUNTIME_TIMING,
} from '../../src/app/worker/runtime-timing.ts';
import type { EndpointCollectionJobExecutionResult } from '../../src/jobs/execute-endpoint-collection-job.ts';
import type {
  EndpointCollectionJobStatus,
  PersistedEndpointCollectionJob,
} from '../../src/jobs/endpoint-collection-job-repository.ts';
import { parseRuntimeConfig } from '../../src/shared/runtime-config.ts';

const NOW = new Date('2026-08-11T10:00:00.000Z');
const TIMING: WorkerRuntimeTiming = Object.freeze({
  schedulerPassIntervalMilliseconds: 10,
  idleJobPollIntervalMilliseconds: 20,
  jobLeaseDurationMilliseconds: 100,
  leaseRenewalIntervalMilliseconds: 30,
  staleRecoveryPassIntervalMilliseconds: 40,
  staleRecoveryBatchLimit: 5,
  localExecutionLimit: 2,
});

describe('Worker runtime orchestration', () => {
  it('keeps the selected timing policy inside scheduler, health, and lease safety margins', () => {
    assert.deepEqual(WORKER_RUNTIME_TIMING, {
      schedulerPassIntervalMilliseconds: 15_000,
      idleJobPollIntervalMilliseconds: 1_000,
      jobLeaseDurationMilliseconds: 120_000,
      leaseRenewalIntervalMilliseconds: 30_000,
      staleRecoveryPassIntervalMilliseconds: 30_000,
      staleRecoveryBatchLimit: 25,
      localExecutionLimit: 4,
    });
    assert.doesNotThrow(() =>
      validateWorkerRuntimeTiming(WORKER_RUNTIME_TIMING),
    );
    assert.throws(
      () =>
        validateWorkerRuntimeTiming({
          ...WORKER_RUNTIME_TIMING,
          leaseRenewalIntervalMilliseconds: 61_000,
        }),
      /additional renewal window/u,
    );
    assert.throws(
      () =>
        validateWorkerRuntimeTiming({
          ...WORKER_RUNTIME_TIMING,
          schedulerPassIntervalMilliseconds: 60_000,
          idleJobPollIntervalMilliseconds: 1,
        }),
      /minimum endpoint poll interval/u,
    );
  });

  it('becomes ready after dependency validation and closes exactly once on repeated shutdown', async () => {
    const harness = runtimeHarness();
    const runtime = await startWorkerRuntime(
      parseRuntimeConfig({ NODE_ENV: 'test' }),
      harness.dependencies,
      { timing: TIMING },
    );

    assert.equal(runtime.state, 'ready');
    assert.equal(harness.schedulerCalls, 1);
    assert.equal(harness.events[0]?.event, 'worker.ready');
    const first = runtime.shutdown();
    const second = runtime.shutdown();
    assert.equal(first, second);
    await Promise.all([first, second, runtime.stopped]);
    assert.equal(runtime.state, 'stopped');
    assert.equal(harness.closeCalls, 1);
    assert.deepEqual(eventNames(harness.events).slice(-2), [
      'worker.shutdown_begin',
      'worker.shutdown_complete',
    ]);
  });

  it('runs scheduler passes promptly and at cadence without overlap, surviving a pass failure', async () => {
    const harness = runtimeHarness();
    const firstPass = deferred<void>();
    let active = 0;
    let maximumActive = 0;
    harness.dependencies.schedulerPass = async () => {
      harness.schedulerCalls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      try {
        if (harness.schedulerCalls === 1) await firstPass.promise;
        if (harness.schedulerCalls === 2)
          throw new Error('synthetic pass failure');
        return { considered: 1, enqueued: 1, alreadyOutstanding: 0 };
      } finally {
        active -= 1;
      }
    };
    const runtime = await startWorkerRuntime(
      parseRuntimeConfig({}),
      harness.dependencies,
      { timing: TIMING },
    );

    await until(() => harness.schedulerCalls === 1);
    await tick();
    assert.equal(harness.schedulerCalls, 1);
    firstPass.resolve();
    await until(() => harness.waiter.count(10) === 1);
    harness.waiter.release(10);
    await until(() => harness.schedulerCalls === 2);
    await until(() => harness.waiter.count(10) === 1);
    harness.waiter.release(10);
    await until(() => harness.schedulerCalls === 3);
    assert.equal(maximumActive, 1);
    assert.ok(
      eventNames(harness.events).includes('worker.scheduler_pass_failed'),
    );
    await runtime.shutdown();
  });

  it('waits when no job is available instead of spinning', async () => {
    const harness = runtimeHarness();
    const runtime = await startWorkerRuntime(
      parseRuntimeConfig({}),
      harness.dependencies,
      { timing: TIMING },
    );
    await until(() => harness.claimCalls === 1);
    await tick();
    assert.equal(harness.claimCalls, 1);
    assert.equal(harness.waiter.count(20), 1);
    await runtime.shutdown();
  });

  it('bounds local dispatch and continues after an isolated job failure', async () => {
    const harness = runtimeHarness();
    const jobs = [job(1), job(2), job(3)];
    const gates = [
      deferred<EndpointCollectionJobExecutionResult>(),
      deferred<EndpointCollectionJobExecutionResult>(),
    ];
    let active = 0;
    let maximumActive = 0;
    harness.dependencies.claimNext = async () => {
      harness.claimCalls += 1;
      return jobs.shift();
    };
    harness.dependencies.execute = async (jobId, claimToken) => {
      harness.executeCalls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      try {
        if (jobId === idFor(1)) return await gates[0]!.promise;
        if (jobId === idFor(2)) throw new Error('isolated execution failure');
        return successfulExecution(job(3), claimToken);
      } finally {
        active -= 1;
      }
    };
    const runtime = await startWorkerRuntime(
      parseRuntimeConfig({}),
      harness.dependencies,
      { timing: TIMING },
    );

    await until(() => harness.executeCalls >= 2);
    assert.equal(maximumActive, 2);
    gates[0]!.resolve(successfulExecution(job(1), tokenFor(1)));
    await until(() => harness.executeCalls === 3);
    assert.equal(maximumActive, 2);
    assert.ok(
      eventNames(harness.events).includes('worker.job_execution_failed'),
    );
    await runtime.shutdown();
  });

  it('renews a long-running claim before expiry and finalizes after work settles', async () => {
    const harness = runtimeHarness();
    const claimed = job(1);
    const execution = deferred<EndpointCollectionJobExecutionResult>();
    let returned = false;
    harness.dependencies.claimNext = async () => {
      harness.claimCalls += 1;
      if (returned) return undefined;
      returned = true;
      return claimed;
    };
    harness.dependencies.execute = async () => {
      harness.executeCalls += 1;
      return execution.promise;
    };
    const runtime = await startWorkerRuntime(
      parseRuntimeConfig({}),
      harness.dependencies,
      { timing: TIMING },
    );

    await until(() => harness.waiter.count(30) === 1);
    harness.waiter.release(30);
    await until(() => harness.renewCalls === 1);
    assert.equal(harness.lastLeaseExpiration?.getTime(), NOW.getTime() + 100);
    execution.resolve(successfulExecution(claimed, claimed.claimToken!));
    await until(() => harness.finalizeCalls === 1);
    await runtime.shutdown();
  });

  it('suppresses stale-token finalization after lease ownership is lost', async () => {
    const harness = runtimeHarness();
    const claimed = job(1);
    const execution = deferred<EndpointCollectionJobExecutionResult>();
    let returned = false;
    harness.dependencies.claimNext = async () => {
      harness.claimCalls += 1;
      if (returned) return undefined;
      returned = true;
      return claimed;
    };
    harness.dependencies.execute = async () => {
      harness.executeCalls += 1;
      return execution.promise;
    };
    harness.dependencies.renewLease = async () => {
      harness.renewCalls += 1;
      return undefined;
    };
    const runtime = await startWorkerRuntime(
      parseRuntimeConfig({}),
      harness.dependencies,
      { timing: TIMING },
    );

    await until(() => harness.waiter.count(30) === 1);
    harness.waiter.release(30);
    await until(() => harness.renewCalls === 1);
    execution.resolve(successfulExecution(claimed, claimed.claimToken!));
    await until(() =>
      eventNames(harness.events).includes('worker.job_finalization_suppressed'),
    );
    assert.equal(harness.finalizeCalls, 0);
    assert.ok(
      eventNames(harness.events).includes('worker.job_lease_ownership_lost'),
    );
    await runtime.shutdown();
  });

  it('stops new work on shutdown, waits for in-flight work, then closes and resolves stopped', async () => {
    const harness = runtimeHarness();
    const claimed = job(1);
    const execution = deferred<EndpointCollectionJobExecutionResult>();
    let returned = false;
    harness.dependencies.claimNext = async () => {
      harness.claimCalls += 1;
      if (returned) return undefined;
      returned = true;
      return claimed;
    };
    harness.dependencies.execute = async () => {
      harness.executeCalls += 1;
      return execution.promise;
    };
    const runtime = await startWorkerRuntime(
      parseRuntimeConfig({}),
      harness.dependencies,
      { timing: TIMING },
    );
    await until(() => harness.executeCalls === 1);
    const schedulerCalls = harness.schedulerCalls;
    const claimCalls = harness.claimCalls;
    let stopped = false;
    void runtime.stopped.then(() => {
      stopped = true;
    });
    const shutdown = runtime.shutdown();
    await tick();
    assert.equal(runtime.state, 'stopping');
    assert.equal(stopped, false);
    assert.equal(harness.closeCalls, 0);
    assert.equal(harness.schedulerCalls, schedulerCalls);
    assert.equal(harness.claimCalls, claimCalls);
    execution.resolve(successfulExecution(claimed, claimed.claimToken!));
    await shutdown;
    assert.equal(stopped, true);
    assert.equal(harness.closeCalls, 1);
  });

  it('awaits an active scheduler pass before closing the database', async () => {
    const harness = runtimeHarness();
    const scheduler = deferred<void>();
    harness.dependencies.schedulerPass = async () => {
      harness.schedulerCalls += 1;
      await scheduler.promise;
      return { considered: 0, enqueued: 0, alreadyOutstanding: 0 };
    };
    const runtime = await startWorkerRuntime(
      parseRuntimeConfig({}),
      harness.dependencies,
      { timing: TIMING },
    );
    const shutdown = runtime.shutdown();
    await tick();
    assert.equal(harness.closeCalls, 0);
    scheduler.resolve();
    await shutdown;
    assert.equal(harness.closeCalls, 1);
  });

  it('isolates stale recovery failures and continues later jobs in the same pass', async () => {
    const harness = runtimeHarness();
    const expired = [job(1), job(2)];
    harness.dependencies.listExpired = async () => expired;
    harness.dependencies.reconcileExpired = async (jobId) => {
      if (jobId === idFor(1)) throw new Error('malformed stale job');
      return { status: 'requeued', job: queuedJob(2) };
    };
    const runtime = await startWorkerRuntime(
      parseRuntimeConfig({}),
      harness.dependencies,
      { timing: TIMING },
    );

    await until(() => harness.waiter.count(40) === 1);
    harness.waiter.release(40);
    await until(() =>
      eventNames(harness.events).includes('worker.stale_job_requeued'),
    );
    assert.ok(
      eventNames(harness.events).includes('worker.stale_job_recovery_failed'),
    );
    await runtime.shutdown();
  });

  it('closes the dependency and does not create a runtime when readiness fails', async () => {
    const harness = runtimeHarness(false);
    await assert.rejects(
      startWorkerRuntime(parseRuntimeConfig({}), harness.dependencies, {
        timing: TIMING,
      }),
    );
    assert.equal(harness.closeCalls, 1);
    assert.equal(harness.schedulerCalls, 0);
  });

  it('rejects invalid timing before loops begin and closes the dependency', async () => {
    const harness = runtimeHarness();
    await assert.rejects(
      startWorkerRuntime(parseRuntimeConfig({}), harness.dependencies, {
        timing: {
          ...TIMING,
          leaseRenewalIntervalMilliseconds: TIMING.jobLeaseDurationMilliseconds,
        },
      }),
      /lease renewal interval/u,
    );
    assert.equal(harness.closeCalls, 1);
    assert.equal(harness.schedulerCalls, 0);
    assert.equal(harness.claimCalls, 0);
  });
});

function runtimeHarness(ready = true) {
  const waiter = new ControlledWaiter();
  const events: WorkerDiagnostic[] = [];
  const harness = {
    closeCalls: 0,
    schedulerCalls: 0,
    claimCalls: 0,
    renewCalls: 0,
    executeCalls: 0,
    finalizeCalls: 0,
    lastLeaseExpiration: undefined as Date | undefined,
    waiter,
    events,
    dependencies: undefined as unknown as WorkerRuntimeDependencies,
  };
  harness.dependencies = {
    async checkReady() {
      return ready;
    },
    async close() {
      harness.closeCalls += 1;
    },
    async schedulerPass() {
      harness.schedulerCalls += 1;
      return { considered: 0, enqueued: 0, alreadyOutstanding: 0 };
    },
    async claimNext() {
      harness.claimCalls += 1;
      return undefined;
    },
    async renewLease(jobId, claimToken, _renewedAt, leaseExpiresAt) {
      harness.renewCalls += 1;
      harness.lastLeaseExpiration = leaseExpiresAt;
      const number = Number(jobId.slice(-1));
      return job(number, claimToken);
    },
    async execute(jobId, claimToken) {
      harness.executeCalls += 1;
      const number = Number(jobId.slice(-1));
      return successfulExecution(job(number, claimToken), claimToken);
    },
    async finalize(result, terminalAt) {
      harness.finalizeCalls += 1;
      return {
        disposition: 'terminal',
        job: terminalJob(
          Number(result.jobId.slice(-1)),
          result.category === 'succeeded' ? 'succeeded' : 'skipped',
          terminalAt,
        ),
      };
    },
    async listExpired() {
      return [];
    },
    async reconcileExpired() {
      throw new Error('unexpected recovery');
    },
    workerId: 'worker-runtime-test',
    now: () => new Date(NOW),
    random: () => 0,
    wait: (milliseconds, signal) => waiter.wait(milliseconds, signal),
    emit: (event) => events.push(event),
  };
  return harness;
}

interface ControlledWaitEntry {
  readonly milliseconds: number;
  resolve(): void;
  cleanup(): void;
}

class ControlledWaiter {
  readonly #entries: ControlledWaitEntry[] = [];

  wait(milliseconds: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const entry = {
        milliseconds,
        resolve,
        cleanup: () => signal.removeEventListener('abort', onAbort),
      };
      const onAbort = () => {
        this.#remove(entry);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
      this.#entries.push(entry);
    });
  }

  count(milliseconds: number): number {
    return this.#entries.filter((entry) => entry.milliseconds === milliseconds)
      .length;
  }

  release(milliseconds: number): void {
    const entry = this.#entries.find(
      (candidate) => candidate.milliseconds === milliseconds,
    );
    assert.ok(entry, `No controlled ${milliseconds}ms wait was pending.`);
    this.#remove(entry);
    entry.resolve();
  }

  #remove(entry: ControlledWaitEntry): void {
    const index = this.#entries.indexOf(entry);
    if (index >= 0) this.#entries.splice(index, 1);
    entry.cleanup();
  }
}

function job(number: number, claimToken = tokenFor(number)) {
  return persistedJob(number, 'running', claimToken);
}

function queuedJob(number: number) {
  return persistedJob(number, 'queued');
}

function terminalJob(
  number: number,
  status: Extract<EndpointCollectionJobStatus, 'succeeded' | 'skipped'>,
  terminalAt: Date,
) {
  return persistedJob(number, status, undefined, terminalAt);
}

function persistedJob(
  number: number,
  status: EndpointCollectionJobStatus,
  claimToken?: string,
  terminalAt?: Date,
): PersistedEndpointCollectionJob {
  return Object.freeze({
    id: idFor(number),
    sourceEndpointId: endpointIdFor(number),
    triggerKind: number % 2 === 0 ? 'manual' : 'scheduled',
    status,
    enqueuedAt: NOW,
    availableAt: NOW,
    attemptNumber: 1,
    previousJobId: undefined,
    claimWorkerId: status === 'running' ? 'worker-runtime-test' : undefined,
    claimToken: status === 'running' ? claimToken : undefined,
    claimedAt: status === 'running' ? NOW : undefined,
    leaseExpiresAt:
      status === 'running' ? new Date(NOW.getTime() + 100) : undefined,
    collectionRunId: undefined,
    terminalAt,
    outcomeCode: terminalAt === undefined ? undefined : status,
    reasonCode: undefined,
    errorCode: undefined,
    errorDetail: undefined,
    updatedAt: terminalAt ?? NOW,
  });
}

function successfulExecution(
  claimed: PersistedEndpointCollectionJob,
  claimToken: string,
): EndpointCollectionJobExecutionResult {
  return Object.freeze({
    jobId: claimed.id,
    attemptNumber: claimed.attemptNumber,
    endpointId: claimed.sourceEndpointId,
    triggerKind: claimed.triggerKind,
    claimToken,
    collectionRunOccurred: false,
    category: 'blocked' as const,
    outcome: 'no_longer_due',
    reason: 'no_longer_due',
  });
}

function idFor(number: number): string {
  return `00000000-0000-4000-8000-00000000000${number}`;
}

function endpointIdFor(number: number): string {
  return `10000000-0000-4000-8000-00000000000${number}`;
}

function tokenFor(number: number): string {
  return `20000000-0000-4000-8000-00000000000${number}`;
}

function eventNames(events: readonly WorkerDiagnostic[]): string[] {
  return events.map((event) => String(event.event));
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail('Timed out waiting for controlled Worker runtime state.');
}
