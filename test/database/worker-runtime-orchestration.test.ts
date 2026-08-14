import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createEndpointAdministrationService } from '../../src/admin/endpoint-administration.ts';
import {
  createWorkerRuntimeDependencies,
  startWorkerRuntime,
  type WorkerDiagnostic,
} from '../../src/app/worker/runtime.ts';
import type { WorkerRuntimeTiming } from '../../src/app/worker/runtime-timing.ts';
import { createEndpointExecutionLockRunner } from '../../src/collection/execution.ts';
import {
  createHttpFetcher,
  type HttpFetcher,
  type HttpFetcherRequest,
  type HttpFetcherResult,
} from '../../src/collection/fetchers/http-fetcher.ts';
import {
  findCollectionRunById,
  startCollectionRun,
} from '../../src/collection/runs/repository.ts';
import { createDatabase } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  attachCollectionRunToEndpointCollectionJob,
  claimNextEndpointCollectionJob,
  enqueueEndpointCollectionJob,
  listRecentEndpointCollectionJobs,
} from '../../src/jobs/endpoint-collection-job-repository.ts';
import {
  bootstrapPublicationTree,
  parseBootstrapDocument,
} from '../../src/publication/bootstrap.ts';
import { readEndpointHealth } from '../../src/sources/endpoint-health.ts';
import {
  findSourceByConfigKey,
  findSourceEndpointBySourceAndConfigKey,
} from '../../src/sources/repository.ts';
import { parseRuntimeConfig } from '../../src/shared/runtime-config.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const fixtureUrl = new URL(
  '../fixtures/generic-bootstrap.json',
  import.meta.url,
);
const TEST_TIMING: WorkerRuntimeTiming = Object.freeze({
  schedulerPassIntervalMilliseconds: 50,
  idleJobPollIntervalMilliseconds: 5,
  jobLeaseDurationMilliseconds: 2_000,
  leaseRenewalIntervalMilliseconds: 500,
  staleRecoveryPassIntervalMilliseconds: 50,
  staleRecoveryBatchLimit: 10,
  localExecutionLimit: 2,
});

test('real Worker runtime schedules, isolates endpoint failure, and leaves durable diagnostics', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    await bootstrapFixture(database);
    const events = eventCollector();
    const runtime = await startWorkerRuntime(
      parseRuntimeConfig({ NODE_ENV: 'test' }),
      createWorkerRuntimeDependencies(database, {
        workerId: 'postgres-orchestration-worker',
        random: () => 0,
        emit: events.emit,
        serviceDependencies: {
          createFetcher: () => mixedOutcomeFetcher(),
        },
      }),
      { timing: TEST_TIMING },
    );

    await events.waitFor('worker.job_retry_enqueued');
    await events.waitFor('worker.job_succeeded');
    await runtime.shutdown();

    const inspection = createDatabase({ connectionString: databaseUrl });
    try {
      const jobs = await listRecentEndpointCollectionJobs(inspection, 10);
      assert.equal(jobs.length, 3);
      assert.deepEqual([...jobs].map((job) => job.status).sort(), [
        'failed',
        'queued',
        'succeeded',
      ]);
      const failed = jobs.find((job) => job.status === 'failed');
      const retry = jobs.find((job) => job.status === 'queued');
      const succeeded = jobs.find((job) => job.status === 'succeeded');
      assert.ok(failed?.collectionRunId);
      assert.equal(failed.outcomeCode, 'fetch_failed');
      assert.equal(failed.reasonCode, 'total_timeout');
      assert.equal(failed.triggerKind, 'scheduled');
      assert.equal(retry?.previousJobId, failed.id);
      assert.equal(retry?.attemptNumber, 2);
      assert.equal(retry?.triggerKind, 'scheduled');
      assert.ok(succeeded?.collectionRunId);
      assert.equal(succeeded.triggerKind, 'scheduled');

      const failedRun = await findCollectionRunById(
        inspection,
        failed.collectionRunId,
      );
      const succeededRun = await findCollectionRunById(
        inspection,
        succeeded.collectionRunId,
      );
      assert.equal(failedRun?.runStatus, 'failed');
      assert.equal(failedRun?.retryClassification, 'transient');
      assert.equal(succeededRun?.runStatus, 'succeeded');
      assert.equal(succeededRun?.transportStatus, 'not_modified');

      const failedHealth = await readEndpointHealth(
        inspection,
        failed.sourceEndpointId,
        new Date(),
      );
      const succeededHealth = await readEndpointHealth(
        inspection,
        succeeded.sourceEndpointId,
        new Date(),
      );
      assert.equal(failedHealth?.runtime.consecutiveFailureCount, 1);
      assert.equal(failedHealth?.health, 'degraded');
      assert.equal(succeededHealth?.runtime.consecutiveFailureCount, 0);
      assert.ok(succeededHealth?.runtime.lastSuccessAt);
    } finally {
      await inspection.close();
    }
  });
});

test('real Worker executes a durable manual job and shutdown waits for its in-flight collection', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    await bootstrapFixture(database);
    const circuit = await findSourceByConfigKey(database, 'circuit_journal');
    const research = await findSourceByConfigKey(database, 'research_wire');
    assert.ok(circuit);
    assert.ok(research);
    const circuitEndpoint = await findSourceEndpointBySourceAndConfigKey(
      database,
      circuit.id,
      'main_feed',
    );
    const researchEndpoint = await findSourceEndpointBySourceAndConfigKey(
      database,
      research.id,
      'updates_feed',
    );
    assert.ok(circuitEndpoint);
    assert.ok(researchEndpoint);
    const futureDueAt = new Date(Date.now() + 60_000);
    await database.query('UPDATE source_endpoints SET next_due_at = $1', [
      futureDueAt,
    ]);
    const manualJob = await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: circuitEndpoint.id,
      triggerKind: 'manual',
      availableAt: new Date(),
      attemptNumber: 1,
    });
    assert.equal(manualJob.created, true);

    const fetchEntered = deferred<void>();
    const releaseFetch = deferred<void>();
    const runtime = await startWorkerRuntime(
      parseRuntimeConfig({ NODE_ENV: 'test' }),
      createWorkerRuntimeDependencies(database, {
        workerId: 'postgres-shutdown-worker',
        random: () => 0,
        serviceDependencies: {
          createFetcher: () => controlledFetcher(fetchEntered, releaseFetch),
        },
      }),
      { timing: TEST_TIMING },
    );
    await fetchEntered.promise;
    let stopped = false;
    const shutdown = runtime.shutdown().then(() => {
      stopped = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(runtime.state, 'stopping');
    assert.equal(stopped, false);
    releaseFetch.resolve();
    await shutdown;
    assert.equal(runtime.state, 'stopped');

    const inspection = createDatabase({ connectionString: databaseUrl });
    try {
      const jobs = await listRecentEndpointCollectionJobs(inspection, 5);
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0]?.id, manualJob.job.id);
      assert.equal(jobs[0]?.triggerKind, 'manual');
      assert.equal(jobs[0]?.status, 'succeeded');
      assert.ok(jobs[0]?.collectionRunId);
      const run = await findCollectionRunById(
        inspection,
        jobs[0]!.collectionRunId!,
      );
      assert.equal(run?.triggerKind, 'manual');
      assert.equal(run?.runStatus, 'succeeded');
      assert.equal(run?.transportStatus, 'not_modified');
    } finally {
      await inspection.close();
    }
  });
});

test('admin check-now eligibility is rechecked by real Worker claim, execution, and finalization', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    await bootstrapFixture(database);
    const source = await findSourceByConfigKey(database, 'circuit_journal');
    assert.ok(source);
    const endpoint = await findSourceEndpointBySourceAndConfigKey(
      database,
      source.id,
      'main_feed',
    );
    assert.ok(endpoint);

    const requestedAt = new Date();
    await database.query('UPDATE source_endpoints SET next_due_at = $1', [
      new Date(requestedAt.getTime() + 3_600_000),
    ]);
    const admin = createEndpointAdministrationService(database, {
      now: () => requestedAt,
    });
    const checkNow = await admin.checkNow('circuit_journal', 'main_feed');
    assert.equal(checkNow.disposition, 'queued');
    assert.equal(checkNow.job.triggerKind, 'manual');

    await database.query(
      `UPDATE source_endpoints
       SET operational_state = 'paused', updated_at = now()
       WHERE id = $1`,
      [endpoint.id],
    );

    let fetcherCalls = 0;
    const events = eventCollector();
    let runtime: Awaited<ReturnType<typeof startWorkerRuntime>> | undefined;
    try {
      runtime = await startWorkerRuntime(
        parseRuntimeConfig({ NODE_ENV: 'test' }),
        createWorkerRuntimeDependencies(database, {
          workerId: 'postgres-admin-race-worker',
          random: () => 0,
          emit: events.emit,
          serviceDependencies: {
            createFetcher() {
              fetcherCalls += 1;
              throw new Error('Eligibility-blocked work must not fetch.');
            },
          },
        }),
        { timing: TEST_TIMING },
      );
      await events.waitFor('worker.job_skipped');
    } finally {
      await runtime?.shutdown();
    }
    assert.equal(fetcherCalls, 0);

    const inspection = createDatabase({ connectionString: databaseUrl });
    try {
      const jobs = await listRecentEndpointCollectionJobs(inspection, 5);
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0]?.id, checkNow.job.id);
      assert.equal(jobs[0]?.triggerKind, 'manual');
      assert.equal(jobs[0]?.status, 'skipped');
      assert.equal(jobs[0]?.outcomeCode, 'endpoint_paused');
      assert.equal(jobs[0]?.reasonCode, 'endpoint_paused');
      assert.equal(jobs[0]?.collectionRunId, undefined);
      const runCount = await inspection.query<{ readonly count: string }>(
        'SELECT count(*) AS count FROM collection_runs WHERE source_endpoint_id = $1',
        [endpoint.id],
      );
      assert.equal(Number(runCount.rows[0]?.count), 0);
    } finally {
      await inspection.close();
    }
  });
});

test('durable manual work shares the endpoint lock and network-safety boundary', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const lockOwner = createDatabase({ connectionString: databaseUrl });
    const workerDatabase = createDatabase({ connectionString: databaseUrl });
    const releaseLock = deferred<void>();
    let lockOwnerPromise:
      | ReturnType<ReturnType<typeof createEndpointExecutionLockRunner>['run']>
      | undefined;
    try {
      await bootstrapFixture(lockOwner);
      const source = await findSourceByConfigKey(lockOwner, 'circuit_journal');
      assert.ok(source);
      const endpoint = await findSourceEndpointBySourceAndConfigKey(
        lockOwner,
        source.id,
        'main_feed',
      );
      assert.ok(endpoint);

      const requestedAt = new Date();
      const admin = createEndpointAdministrationService(lockOwner, {
        now: () => requestedAt,
      });
      const checkNow = await admin.checkNow('circuit_journal', 'main_feed');
      assert.equal(checkNow.disposition, 'queued');
      assert.equal(checkNow.job.triggerKind, 'manual');

      let resolverCalls = 0;
      let transportCalls = 0;
      const worker = createWorkerRuntimeDependencies(workerDatabase, {
        workerId: 'postgres-manual-boundaries-worker',
        random: () => 0,
        serviceDependencies: {
          createFetcher: () =>
            createHttpFetcher({
              resolver: {
                async resolve() {
                  resolverCalls += 1;
                  return [{ address: '127.0.0.1', family: 4 }];
                },
              },
              transport: {
                async fetch() {
                  transportCalls += 1;
                  throw new Error(
                    'Unsafe destinations must not reach transport.',
                  );
                },
              },
            }),
        },
      });

      const lockEntered = deferred<void>();
      lockOwnerPromise = createEndpointExecutionLockRunner(lockOwner).run(
        endpoint.id,
        async () => {
          lockEntered.resolve();
          await releaseLock.promise;
        },
      );
      await lockEntered.promise;

      const firstClaimedAt = new Date(requestedAt.getTime() + 1);
      const firstClaim = await worker.claimNext({
        workerId: worker.workerId,
        claimedAt: firstClaimedAt,
        leaseExpiresAt: new Date(firstClaimedAt.getTime() + 60_000),
      });
      assert.ok(firstClaim?.claimToken);
      assert.equal(firstClaim.id, checkNow.job.id);
      assert.equal(firstClaim.triggerKind, 'manual');
      const contended = await worker.execute(
        firstClaim.id,
        firstClaim.claimToken,
        new Date(firstClaimedAt.getTime() + 1),
      );
      assert.deepEqual(contended, {
        jobId: firstClaim.id,
        attemptNumber: 1,
        endpointId: endpoint.id,
        triggerKind: 'manual',
        claimToken: firstClaim.claimToken,
        collectionRunOccurred: false,
        category: 'blocked',
        outcome: 'endpoint_locked',
        reason: 'endpoint_locked',
      });
      const deferral = await worker.finalize(
        contended,
        new Date(firstClaimedAt.getTime() + 2),
        () => 0,
      );
      assert.equal(deferral.disposition, 'deferred');
      assert.equal(deferral.job.id, firstClaim.id);
      assert.equal(deferral.job.triggerKind, 'manual');
      assert.equal(deferral.job.attemptNumber, 1);
      assert.equal(deferral.job.status, 'queued');
      assert.equal(deferral.job.collectionRunId, undefined);
      assert.equal(resolverCalls, 0);
      assert.equal(transportCalls, 0);

      releaseLock.resolve();
      assert.equal((await lockOwnerPromise).status, 'acquired');
      lockOwnerPromise = undefined;

      const secondClaimedAt = new Date(requestedAt.getTime() + 10_000);
      const secondClaim = await worker.claimNext({
        workerId: worker.workerId,
        claimedAt: secondClaimedAt,
        leaseExpiresAt: new Date(secondClaimedAt.getTime() + 60_000),
      });
      assert.ok(secondClaim?.claimToken);
      assert.equal(secondClaim.id, firstClaim.id);
      assert.equal(secondClaim.triggerKind, 'manual');
      assert.equal(secondClaim.attemptNumber, 1);
      const unsafe = await worker.execute(
        secondClaim.id,
        secondClaim.claimToken,
        new Date(secondClaimedAt.getTime() + 1),
      );
      assert.equal(unsafe.category, 'failed');
      assert.equal(unsafe.outcome, 'network_safety_blocked');
      assert.equal(unsafe.reason, 'unsafe_resolved_address');
      assert.equal(unsafe.retryClassification, 'permanent');
      assert.equal(unsafe.triggerKind, 'manual');
      assert.equal(unsafe.collectionRunOccurred, true);
      assert.ok(unsafe.collectionRunId);
      const terminal = await worker.finalize(
        unsafe,
        new Date(secondClaimedAt.getTime() + 2),
        () => 0,
      );
      assert.equal(terminal.disposition, 'terminal');
      assert.equal(terminal.job.id, firstClaim.id);
      assert.equal(terminal.job.status, 'failed');
      assert.equal(terminal.job.triggerKind, 'manual');
      assert.equal(terminal.job.attemptNumber, 1);
      assert.equal(resolverCalls, 1);
      assert.equal(transportCalls, 0);

      const run = await findCollectionRunById(
        workerDatabase,
        unsafe.collectionRunId,
      );
      assert.equal(run?.sourceEndpointId, endpoint.id);
      assert.equal(run?.executionId, firstClaim.id);
      assert.equal(run?.triggerKind, 'manual');
      assert.equal(run?.runStatus, 'failed');
      assert.equal(run?.outcomeCode, 'network_safety_blocked');
      assert.equal(run?.errorCode, 'unsafe_resolved_address');
    } finally {
      releaseLock.resolve();
      await lockOwnerPromise?.catch(() => undefined);
      await Promise.all([lockOwner.close(), workerDatabase.close()]);
    }
  });
});

test('periodic real Worker recovery reconciles an expired started run without replay', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    await bootstrapFixture(database);
    const source = await findSourceByConfigKey(database, 'circuit_journal');
    assert.ok(source);
    const endpoint = await findSourceEndpointBySourceAndConfigKey(
      database,
      source.id,
      'main_feed',
    );
    assert.ok(endpoint);

    const claimedAt = new Date(Date.now() - 120_000);
    const leaseExpiresAt = new Date(Date.now() + 60_000);
    const enqueued = await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpoint.id,
      triggerKind: 'manual',
      availableAt: claimedAt,
      attemptNumber: 1,
    });
    const claimed = await claimNextEndpointCollectionJob(database, {
      workerId: 'dead-worker',
      claimedAt,
      leaseExpiresAt,
    });
    assert.equal(claimed?.id, enqueued.job.id);
    assert.ok(claimed?.claimToken);
    const run = await startCollectionRun(database, {
      sourceEndpointId: endpoint.id,
      executionId: claimed.id,
      triggerKind: 'manual',
    });
    const attached = await attachCollectionRunToEndpointCollectionJob(
      database,
      claimed.id,
      claimed.claimToken,
      run.id,
    );
    assert.equal(attached?.collectionRunId, run.id);
    await database.query(
      `UPDATE endpoint_collection_jobs
       SET lease_expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [claimed.id],
    );
    await database.query(
      'UPDATE publication_settings SET active_for_collection = FALSE',
    );

    const events = eventCollector();
    const runtime = await startWorkerRuntime(
      parseRuntimeConfig({ NODE_ENV: 'test' }),
      createWorkerRuntimeDependencies(database, {
        workerId: 'postgres-recovery-worker',
        random: () => 0,
        emit: events.emit,
        serviceDependencies: {
          createFetcher() {
            throw new Error('Recovery must not replay collection.');
          },
        },
      }),
      {
        timing: {
          ...TEST_TIMING,
          staleRecoveryPassIntervalMilliseconds: 5,
        },
      },
    );
    await events.waitFor('worker.stale_job_recovered');
    await events.waitFor('worker.job_retry_enqueued');
    await runtime.shutdown();

    const inspection = createDatabase({ connectionString: databaseUrl });
    try {
      const jobs = await listRecentEndpointCollectionJobs(inspection, 5);
      assert.equal(jobs.length, 2);
      const recovered = jobs.find((job) => job.id === claimed.id);
      const retry = jobs.find((job) => job.previousJobId === claimed.id);
      assert.equal(recovered?.status, 'abandoned');
      assert.equal(recovered?.outcomeCode, 'worker_interrupted');
      assert.equal(recovered?.triggerKind, 'manual');
      assert.equal(retry?.status, 'queued');
      assert.equal(retry?.attemptNumber, 2);
      assert.equal(retry?.triggerKind, 'manual');
      const persistedRun = await findCollectionRunById(inspection, run.id);
      assert.equal(persistedRun?.triggerKind, 'manual');
      assert.equal(persistedRun?.runStatus, 'failed');
      assert.equal(persistedRun?.retryClassification, 'transient');
      const runCount = await inspection.query<{ count: string }>(
        'SELECT count(*) AS count FROM collection_runs WHERE execution_id = $1',
        [claimed.id],
      );
      assert.equal(Number(runCount.rows[0]?.count), 1);
    } finally {
      await inspection.close();
    }
  });
});

async function bootstrapFixture(
  database: Parameters<typeof bootstrapPublicationTree>[0],
): Promise<void> {
  await bootstrapPublicationTree(
    database,
    parseBootstrapDocument(await readFile(fixtureUrl, 'utf8')),
  );
}

function mixedOutcomeFetcher(): HttpFetcher {
  return Object.freeze({
    async fetch(request: HttpFetcherRequest): Promise<HttpFetcherResult> {
      return request.configuration.endpoint.endpointUrl.hostname ===
        'feeds.circuit.example'
        ? failureResult(request)
        : notModifiedResult(request);
    },
  });
}

function controlledFetcher(
  entered: ReturnType<typeof deferred<void>>,
  release: ReturnType<typeof deferred<void>>,
): HttpFetcher {
  return Object.freeze({
    async fetch(request: HttpFetcherRequest): Promise<HttpFetcherResult> {
      entered.resolve();
      await release.promise;
      return notModifiedResult(request);
    },
  });
}

function notModifiedResult(request: HttpFetcherRequest): HttpFetcherResult {
  return Object.freeze({
    outcome: 'not_modified' as const,
    response: Object.freeze({ etag: '"worker-runtime"' }),
    finalUrl: request.configuration.endpoint.endpointUrl.value,
    redirectCount: 0,
    metrics: metrics(304),
  });
}

function failureResult(request: HttpFetcherRequest): HttpFetcherResult {
  return Object.freeze({
    outcome: 'failure' as const,
    reason: 'total_timeout' as const,
    retry: 'transient' as const,
    detail: 'Controlled timeout.',
    response: Object.freeze({}),
    finalUrl: request.configuration.endpoint.endpointUrl.value,
    redirectCount: 0,
    metrics: metrics(504),
  });
}

function metrics(httpStatus: number) {
  return Object.freeze({
    elapsedMilliseconds: 1,
    hopCount: 1,
    wireBytes: 0,
    decompressedBytes: 0,
    hops: Object.freeze([
      Object.freeze({
        elapsedMilliseconds: 1,
        httpStatus,
        wireBytes: 0,
        decompressedBytes: 0,
        selectedAddress: '203.0.113.10',
        selectedAddressFamily: 4 as const,
      }),
    ]),
  });
}

function eventCollector() {
  const events: WorkerDiagnostic[] = [];
  const waiters = new Map<string, Array<() => void>>();
  return Object.freeze({
    emit(event: WorkerDiagnostic) {
      events.push(event);
      const eventName = String(event.event);
      for (const resolve of waiters.get(eventName) ?? []) resolve();
      waiters.delete(eventName);
    },
    async waitFor(eventName: string): Promise<void> {
      if (events.some((event) => event.event === eventName)) return;
      await Promise.race([
        new Promise<void>((resolve) => {
          const current = waiters.get(eventName) ?? [];
          current.push(resolve);
          waiters.set(eventName, current);
        }),
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () => reject(new Error(`Timed out waiting for ${eventName}.`)),
            10_000,
          ).unref();
        }),
      ]);
    },
  });
}

function deferred<T>() {
  let resolve!: (value?: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise as typeof resolve;
  });
  return { promise, resolve };
}
