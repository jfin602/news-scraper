import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  COLLECTION_CAPACITY_LIMITS,
  withCollectionCapacity,
  type CollectionCapacityResult,
} from '../../src/collection/concurrency/collection-capacity.ts';
import type {
  HttpFetcher,
  HttpFetcherRequest,
} from '../../src/collection/fetchers/http-fetcher.ts';
import { runSchedulerPass } from '../../src/collection/scheduler/scheduler-pass.ts';
import {
  startCollectionRun,
  type PersistedCollectionRun,
} from '../../src/collection/runs/repository.ts';
import { createDatabase, type Database } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  finalizeScheduledJobExecution,
  ScheduledJobFinalizationError,
} from '../../src/jobs/finalize-endpoint-collection-job.ts';
import {
  executeClaimedEndpointCollectionJob,
  reconcileExpiredEndpointCollectionJob,
  type ScheduledJobExecutionResult,
} from '../../src/jobs/execute-endpoint-collection-job.ts';
import {
  attachCollectionRunToEndpointCollectionJob,
  claimNextEndpointCollectionJob,
  enqueueEndpointCollectionJob,
  findEndpointCollectionJobById,
  terminalizeEndpointCollectionJob,
  type PersistedEndpointCollectionJob,
} from '../../src/jobs/endpoint-collection-job-repository.ts';
import {
  bootstrapPublicationTree,
  parseBootstrapDocument,
} from '../../src/publication/bootstrap.ts';
import { readEndpointHealth } from '../../src/sources/endpoint-health.ts';
import {
  applyTerminalCollectionRunToEndpointRuntime,
  findSourceByConfigKey,
  findSourceEndpointBySourceAndConfigKey,
  type PersistedSourceEndpoint,
} from '../../src/sources/repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const fixtureUrl = new URL(
  '../fixtures/generic-bootstrap.json',
  import.meta.url,
);
const T0959 = new Date('2026-08-11T09:59:00.000Z');
const T1000 = new Date('2026-08-11T10:00:00.000Z');
const T1001 = new Date('2026-08-11T10:01:00.000Z');
const T1002 = new Date('2026-08-11T10:02:00.000Z');
const T1003 = new Date('2026-08-11T10:03:00.000Z');
const T1004 = new Date('2026-08-11T10:04:00.000Z');
const T1007 = new Date('2026-08-11T10:07:00.000Z');
const T1008 = new Date('2026-08-11T10:08:00.000Z');
const T1100 = new Date('2026-08-11T11:00:00.000Z');

test('transient finalization creates one atomic bounded retry chain while permanent and attempt three stop', async () => {
  await withPolicyDatabase(async (database, [endpointA, endpointB]) => {
    await database.query(
      'UPDATE source_endpoints SET next_due_at = $1 WHERE id = $2',
      [T1100, endpointB.id],
    );
    let attempt = await createFailedClaimedAttempt(
      database,
      endpointA,
      1,
      undefined,
      T1000,
      'transient',
    );
    const [first, competingScheduler] = await Promise.all([
      finalizeScheduledJobExecution(database, {
        result: attempt.result,
        terminalAt: T1001,
        random: () => 0,
      }),
      runSchedulerPass(database, { now: T1001, random: () => 0 }),
    ]);
    assert.equal(first.disposition, 'retry_scheduled');
    assert.deepEqual(competingScheduler, {
      considered: 0,
      enqueued: 0,
      alreadyOutstanding: 0,
    });
    if (first.disposition !== 'retry_scheduled') return;
    assert.equal(first.job.status, 'failed');
    assert.equal(first.successor.attemptNumber, 2);
    assert.equal(first.successor.previousJobId, first.job.id);
    assert.equal(
      first.successor.availableAt.toISOString(),
      new Date(T1001.getTime() + 15_000).toISOString(),
    );

    attempt = await failExistingQueuedAttempt(
      database,
      endpointA,
      first.successor,
      T1002,
      'transient',
    );
    const second = await finalizeScheduledJobExecution(database, {
      result: attempt.result,
      terminalAt: T1003,
      random: () => 1,
    });
    assert.equal(second.disposition, 'retry_scheduled');
    if (second.disposition !== 'retry_scheduled') return;
    assert.equal(second.successor.attemptNumber, 3);
    assert.equal(second.successor.previousJobId, second.job.id);
    assert.equal(
      second.successor.availableAt.toISOString(),
      new Date(T1003.getTime() + 60_000).toISOString(),
    );

    attempt = await failExistingQueuedAttempt(
      database,
      endpointA,
      second.successor,
      T1004,
      'transient',
    );
    const exhausted = await finalizeScheduledJobExecution(database, {
      result: attempt.result,
      terminalAt: new Date(T1004.getTime() + 1_000),
    });
    assert.equal(exhausted.disposition, 'terminal');
    assert.equal(exhausted.job.status, 'failed');
    assert.equal(await outstandingCount(database, endpointA.id), 0);

    const permanent = await createFailedClaimedAttempt(
      database,
      endpointB,
      1,
      undefined,
      T1002,
      'permanent',
    );
    const stopped = await finalizeScheduledJobExecution(database, {
      result: permanent.result,
      terminalAt: T1003,
    });
    assert.equal(stopped.disposition, 'terminal');
    assert.equal(stopped.job.status, 'failed');
    assert.equal(await outstandingCount(database, endpointB.id), 0);
  });
});

test('successful and superseded jobs terminalize once without successors', async () => {
  await withPolicyDatabase(async (database, [endpointA, endpointB]) => {
    const succeededJob = await createClaimedJob(database, endpointA.id, 1);
    assert.ok(succeededJob.claimToken);
    const run = await startCollectionRun(database, {
      sourceEndpointId: endpointA.id,
      executionId: succeededJob.id,
      triggerKind: 'scheduled',
    });
    await attachCollectionRunToEndpointCollectionJob(
      database,
      succeededJob.id,
      succeededJob.claimToken,
      run.id,
      T0959,
    );
    await makeTerminalRun(database, run.id, 'succeeded', T1000);
    await applyTerminalCollectionRunToEndpointRuntime(database, run.id);
    const succeeded = await finalizeScheduledJobExecution(database, {
      result: successfulResult(succeededJob, run),
      terminalAt: T1001,
    });
    assert.equal(succeeded.disposition, 'terminal');
    assert.equal(succeeded.job.status, 'succeeded');
    assert.equal(await outstandingCount(database, endpointA.id), 0);

    const supersededJob = await createClaimedJob(database, endpointB.id, 1);
    const superseded = await finalizeScheduledJobExecution(database, {
      result: blockedResult(supersededJob, 'no_longer_due'),
      terminalAt: T1001,
    });
    assert.equal(superseded.disposition, 'terminal');
    assert.equal(superseded.job.status, 'skipped');
    assert.equal(superseded.job.reasonCode, 'no_longer_due');
    assert.equal(await outstandingCount(database, endpointB.id), 0);
  });
});

test('unexpected retry successor failure rolls back terminalization', async () => {
  await withPolicyDatabase(async (database, [endpoint]) => {
    const attempt = await createFailedClaimedAttempt(
      database,
      endpoint,
      1,
      undefined,
      T1000,
      'transient',
    );
    await database.query(`
      CREATE FUNCTION reject_retry_successor() RETURNS trigger AS $$
      BEGIN
        IF NEW.attempt_number > 1 THEN
          RAISE EXCEPTION 'synthetic retry insertion rejection';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_retry_successor_trigger
      BEFORE INSERT ON endpoint_collection_jobs
      FOR EACH ROW EXECUTE FUNCTION reject_retry_successor();
    `);
    await assert.rejects(
      finalizeScheduledJobExecution(database, {
        result: attempt.result,
        terminalAt: T1001,
        random: () => 0,
      }),
    );
    const current = await findEndpointCollectionJobById(
      database,
      attempt.job.id,
    );
    assert.equal(current?.status, 'running');
    assert.equal(current?.claimToken, attempt.job.claimToken);
    assert.equal(await outstandingCount(database, endpoint.id), 1);
  });
});

test('lock deferral requeues the same attempt, rejects the former owner, and waiting retry does not block another endpoint', async () => {
  await withPolicyDatabase(async (database, [endpointA, endpointB]) => {
    const claimed = await createClaimedJob(database, endpointA.id, 1);
    assert.ok(claimed.claimToken);
    const deferred = await finalizeScheduledJobExecution(database, {
      result: blockedResult(claimed, 'endpoint_locked'),
      terminalAt: T1001,
      random: () => 1,
    });
    assert.equal(deferred.disposition, 'deferred');
    assert.equal(deferred.job.id, claimed.id);
    assert.equal(deferred.job.attemptNumber, 1);
    assert.equal(deferred.job.status, 'queued');
    assert.equal(
      deferred.job.availableAt.toISOString(),
      new Date(T1001.getTime() + 5_000).toISOString(),
    );
    assert.equal(
      await terminalizeEndpointCollectionJob(
        database,
        claimed.id,
        claimed.claimToken,
        { status: 'skipped', terminalAt: T1002, outcomeCode: 'stale_owner' },
      ),
      undefined,
    );

    const reclaimed = await claimNextEndpointCollectionJob(database, {
      workerId: 'reclaimed-worker',
      claimedAt: new Date(T1001.getTime() + 5_000),
      leaseExpiresAt: T1100,
    });
    assert.equal(reclaimed?.id, claimed.id);
    assert.notEqual(reclaimed?.claimToken, claimed.claimToken);
    assert.ok(reclaimed?.claimToken);
    await terminalizeEndpointCollectionJob(
      database,
      reclaimed.id,
      reclaimed.claimToken,
      { status: 'skipped', terminalAt: T1002, outcomeCode: 'lock_cleared' },
    );

    const retrying = await createFailedClaimedAttempt(
      database,
      endpointA,
      1,
      undefined,
      T1002,
      'transient',
    );
    const retried = await finalizeScheduledJobExecution(database, {
      result: retrying.result,
      terminalAt: T1003,
      random: () => 1,
    });
    assert.equal(retried.disposition, 'retry_scheduled');
    await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpointB.id,
      availableAt: T1003,
      attemptNumber: 1,
    });
    const other = await claimNextEndpointCollectionJob(database, {
      workerId: 'fair-worker',
      claimedAt: T1003,
      leaseExpiresAt: T1100,
    });
    assert.equal(other?.sourceEndpointId, endpointB.id);
  });
});

test('capacity contention requeues the same linked attempt without a run while unrelated work remains executable', async () => {
  await withPolicyDatabase(
    async (database, [endpointA, endpointB], databaseUrl) => {
      const saturation = await saturateSourceCapacity(
        databaseUrl,
        endpointA.sourceId,
      );
      try {
        const previous = await createClaimedJob(
          database,
          endpointA.id,
          1,
          undefined,
          T0959,
          T1100,
        );
        assert.ok(previous.claimToken);
        const terminalPrevious = await terminalizeEndpointCollectionJob(
          database,
          previous.id,
          previous.claimToken,
          {
            status: 'failed',
            terminalAt: T1000,
            outcomeCode: 'synthetic_previous_failure',
          },
        );
        assert.equal(terminalPrevious?.status, 'failed');

        const claimed = await createClaimedJob(
          database,
          endpointA.id,
          2,
          previous.id,
          T1000,
          T1100,
        );
        assert.ok(claimed.claimToken);
        const otherEnqueued = await enqueueEndpointCollectionJob(database, {
          sourceEndpointId: endpointB.id,
          availableAt: T1001,
          attemptNumber: 1,
        });
        assert.equal(otherEnqueued.created, true);

        const execution = await executeClaimedEndpointCollectionJob(database, {
          jobId: claimed.id,
          claimToken: claimed.claimToken,
          now: T1001,
          serviceDependencies: {
            async collect() {
              throw new Error('capacity-blocked work must not collect');
            },
          },
        });
        assert.deepEqual(execution, {
          jobId: claimed.id,
          attemptNumber: 2,
          endpointId: endpointA.id,
          claimToken: claimed.claimToken,
          collectionRunOccurred: false,
          category: 'blocked',
          outcome: 'collection_capacity_limited',
          reason: 'collection_capacity_limited',
          limitingScope: 'source',
        });

        const deferred = await finalizeScheduledJobExecution(database, {
          result: execution,
          terminalAt: T1001,
          random: () => 1,
        });
        assert.equal(deferred.disposition, 'deferred');
        assert.equal(deferred.reason, 'collection_capacity_limited');
        assert.equal(deferred.job.id, claimed.id);
        assert.equal(deferred.job.attemptNumber, 2);
        assert.equal(deferred.job.previousJobId, previous.id);
        assert.equal(deferred.job.status, 'queued');
        assert.equal(deferred.job.claimWorkerId, undefined);
        assert.equal(deferred.job.claimToken, undefined);
        assert.equal(deferred.job.claimedAt, undefined);
        assert.equal(deferred.job.leaseExpiresAt, undefined);
        assert.equal(deferred.job.collectionRunId, undefined);
        assert.equal(
          deferred.job.availableAt.toISOString(),
          new Date(T1001.getTime() + 5_000).toISOString(),
        );

        const runs = await database.query<{ count: string }>(
          'SELECT count(*) AS count FROM collection_runs WHERE execution_id = $1',
          [claimed.id],
        );
        assert.equal(Number(runs.rows[0]?.count), 0);
        const successors = await database.query<{ count: string }>(
          'SELECT count(*) AS count FROM endpoint_collection_jobs WHERE previous_job_id = $1',
          [claimed.id],
        );
        assert.equal(Number(successors.rows[0]?.count), 0);
        const runtimeAfterDeferral =
          await findSourceEndpointBySourceAndConfigKey(
            database,
            endpointA.sourceId,
            endpointA.configKey,
          );
        assert.equal(runtimeAfterDeferral?.lastAttemptAt, undefined);
        assert.equal(runtimeAfterDeferral?.lastFailureAt, undefined);
        assert.equal(runtimeAfterDeferral?.consecutiveFailureCount, 0);

        const other = await claimNextEndpointCollectionJob(database, {
          workerId: 'unrelated-worker',
          claimedAt: T1001,
          leaseExpiresAt: T1100,
        });
        assert.equal(other?.id, otherEnqueued.job.id);
        assert.equal(other?.sourceEndpointId, endpointB.id);
        assert.ok(other?.claimToken);

        const unrelatedExecution = await executeClaimedEndpointCollectionJob(
          database,
          {
            jobId: other.id,
            claimToken: other.claimToken,
            now: T1001,
            serviceDependencies: {
              createFetcher: controlledNotModifiedFetcher,
            },
          },
        );
        assert.equal(unrelatedExecution.endpointId, endpointB.id);
        assert.equal(unrelatedExecution.collectionRunOccurred, true);
        assert.equal(unrelatedExecution.category, 'succeeded');
        assert.equal(unrelatedExecution.outcome, 'not_modified');
        assert.ok(unrelatedExecution.collectionRunId);

        const unrelatedFinalized = await finalizeScheduledJobExecution(
          database,
          {
            result: unrelatedExecution,
            terminalAt: T1002,
          },
        );
        assert.equal(unrelatedFinalized.disposition, 'terminal');
        assert.equal(unrelatedFinalized.job.status, 'succeeded');
      } finally {
        await saturation.stop();
      }
    },
  );
});

test('final repeated failure applies scheduler cooldown and later success clears failure health', async () => {
  await withPolicyDatabase(async (database, [endpoint, otherEndpoint]) => {
    await database.query(
      'UPDATE source_endpoints SET next_due_at = $1 WHERE id = $2',
      [T1100, otherEndpoint.id],
    );
    for (const [index, finishedAt] of [T1000, T1001].entries()) {
      const run = await startCollectionRun(database, {
        sourceEndpointId: endpoint.id,
        executionId: `manual-failure-${index}`,
        triggerKind: 'manual',
      });
      await makeTerminalRun(
        database,
        run.id,
        'failed',
        finishedAt,
        'permanent',
      );
      await applyTerminalCollectionRunToEndpointRuntime(database, run.id);
    }
    const third = await createFailedClaimedAttempt(
      database,
      endpoint,
      1,
      undefined,
      T1002,
      'permanent',
    );
    const terminal = await finalizeScheduledJobExecution(database, {
      result: third.result,
      terminalAt: T1003,
    });
    assert.equal(terminal.disposition, 'terminal');
    assert.equal(terminal.cooldownUntil?.toISOString(), T1007.toISOString());
    let health = await readEndpointHealth(database, endpoint.id, T1003);
    assert.equal(health?.health, 'unhealthy');
    assert.equal(health?.runtime.consecutiveFailureCount, 3);
    assert.equal(health?.configuration.endpointOperationalState, 'enabled');

    await database.query(
      'UPDATE source_endpoints SET next_due_at = $1 WHERE id = $2',
      [T1000, endpoint.id],
    );
    assert.deepEqual(
      await runSchedulerPass(database, { now: T1004, random: () => 0 }),
      { considered: 0, enqueued: 0, alreadyOutstanding: 0 },
    );
    assert.equal(
      (await runSchedulerPass(database, { now: T1007, random: () => 0 }))
        .enqueued,
      1,
    );
    const scheduled = await claimNextEndpointCollectionJob(database, {
      workerId: 'cooldown-cleanup',
      claimedAt: T1007,
      leaseExpiresAt: T1100,
    });
    assert.ok(scheduled?.claimToken);
    await terminalizeEndpointCollectionJob(
      database,
      scheduled.id,
      scheduled.claimToken,
      { status: 'skipped', terminalAt: T1008, outcomeCode: 'test_cleanup' },
    );

    const success = await startCollectionRun(database, {
      sourceEndpointId: endpoint.id,
      executionId: 'manual-success',
      triggerKind: 'manual',
    });
    await makeTerminalRun(database, success.id, 'succeeded', T1008);
    await applyTerminalCollectionRunToEndpointRuntime(database, success.id);
    health = await readEndpointHealth(
      database,
      endpoint.id,
      new Date(T1008.getTime() + endpoint.pollIntervalSeconds * 1_000),
    );
    assert.equal(health?.runtime.cooldownUntil, undefined);
    assert.equal(health?.runtime.consecutiveFailureCount, 0);
    assert.equal(health?.health, 'healthy');
  });
});

test('interrupted P4 recovery feeds the retry policy once without duplicating its run', async () => {
  await withPolicyDatabase(async (database, [endpoint]) => {
    const claimed = await createClaimedJob(
      database,
      endpoint.id,
      1,
      undefined,
      T0959,
      T1000,
    );
    assert.ok(claimed.claimToken);
    const run = await startCollectionRun(database, {
      sourceEndpointId: endpoint.id,
      executionId: claimed.id,
      triggerKind: 'scheduled',
    });
    await database.query(
      'UPDATE collection_runs SET started_at = $2 WHERE id = $1',
      [run.id, T0959],
    );
    await attachCollectionRunToEndpointCollectionJob(
      database,
      claimed.id,
      claimed.claimToken,
      run.id,
      T0959,
    );
    const recovery = await reconcileExpiredEndpointCollectionJob(database, {
      jobId: claimed.id,
      workerId: 'recovery-worker',
      expiredAt: T1000,
      recoveredAt: T1001,
      leaseExpiresAt: T1100,
      availableAt: T1001,
    });
    assert.equal(recovery.status, 'reconciled');
    if (recovery.status !== 'reconciled') return;
    const final = await finalizeScheduledJobExecution(database, {
      result: recovery.result,
      terminalAt: T1002,
      random: () => 0,
    });
    assert.equal(final.disposition, 'retry_scheduled');
    if (final.disposition !== 'retry_scheduled') return;
    assert.equal(final.job.status, 'abandoned');
    assert.equal(final.successor.attemptNumber, 2);
    assert.equal(final.successor.previousJobId, claimed.id);
    const runs = await database.query<{ count: string }>(
      'SELECT count(*) AS count FROM collection_runs WHERE execution_id = $1',
      [claimed.id],
    );
    assert.equal(Number(runs.rows[0]?.count), 1);
    await assert.rejects(
      finalizeScheduledJobExecution(database, {
        result: recovery.result,
        terminalAt: T1003,
        random: () => 0,
      }),
      ScheduledJobFinalizationError,
    );
  });
});

async function createFailedClaimedAttempt(
  database: Database,
  endpoint: PersistedSourceEndpoint,
  attemptNumber: number,
  previousJobId: string | undefined,
  finishedAt: Date,
  retryClassification: 'transient' | 'permanent',
) {
  const claimed = await createClaimedJob(
    database,
    endpoint.id,
    attemptNumber,
    previousJobId,
    new Date(finishedAt.getTime() - 30_000),
  );
  return failClaimedAttempt(
    database,
    endpoint,
    claimed,
    finishedAt,
    retryClassification,
  );
}

async function failExistingQueuedAttempt(
  database: Database,
  endpoint: PersistedSourceEndpoint,
  queued: PersistedEndpointCollectionJob,
  finishedAt: Date,
  retryClassification: 'transient' | 'permanent',
) {
  const claimed = await claimNextEndpointCollectionJob(database, {
    workerId: `worker-${queued.attemptNumber}`,
    claimedAt: queued.availableAt,
    leaseExpiresAt: T1100,
  });
  assert.equal(claimed?.id, queued.id);
  assert.ok(claimed);
  return failClaimedAttempt(
    database,
    endpoint,
    claimed,
    finishedAt,
    retryClassification,
  );
}

async function failClaimedAttempt(
  database: Database,
  endpoint: PersistedSourceEndpoint,
  job: PersistedEndpointCollectionJob,
  finishedAt: Date,
  retryClassification: 'transient' | 'permanent',
) {
  assert.ok(job.claimToken);
  const run = await startCollectionRun(database, {
    sourceEndpointId: endpoint.id,
    executionId: job.id,
    triggerKind: 'scheduled',
  });
  await database.query(
    'UPDATE collection_runs SET started_at = $2 WHERE id = $1',
    [run.id, new Date(finishedAt.getTime() - 1_000)],
  );
  await attachCollectionRunToEndpointCollectionJob(
    database,
    job.id,
    job.claimToken,
    run.id,
    new Date(finishedAt.getTime() - 1_000),
  );
  await makeTerminalRun(
    database,
    run.id,
    'failed',
    finishedAt,
    retryClassification,
  );
  await applyTerminalCollectionRunToEndpointRuntime(database, run.id);
  return Object.freeze({
    job,
    run,
    result: failedResult(job, run, retryClassification),
  });
}

async function createClaimedJob(
  database: Database,
  endpointId: string,
  attemptNumber: number,
  previousJobId?: string,
  claimedAt: Date = T0959,
  leaseExpiresAt: Date = T1100,
): Promise<PersistedEndpointCollectionJob> {
  const enqueued = await enqueueEndpointCollectionJob(database, {
    sourceEndpointId: endpointId,
    availableAt: claimedAt,
    attemptNumber,
    ...(previousJobId === undefined ? {} : { previousJobId }),
  });
  assert.equal(enqueued.created, true);
  const claimed = await claimNextEndpointCollectionJob(database, {
    workerId: `worker-${attemptNumber}`,
    claimedAt,
    leaseExpiresAt,
  });
  assert.equal(claimed?.id, enqueued.job.id);
  assert.ok(claimed);
  return claimed;
}

function failedResult(
  job: PersistedEndpointCollectionJob,
  run: PersistedCollectionRun,
  retryClassification: 'transient' | 'permanent',
): ScheduledJobExecutionResult {
  assert.ok(job.claimToken);
  return Object.freeze({
    jobId: job.id,
    attemptNumber: job.attemptNumber,
    endpointId: job.sourceEndpointId,
    claimToken: job.claimToken,
    collectionRunOccurred: true,
    collectionRunId: run.id,
    category: 'failed' as const,
    outcome: 'fetch_failed',
    reason: 'network_error',
    retryClassification,
  });
}

function successfulResult(
  job: PersistedEndpointCollectionJob,
  run: PersistedCollectionRun,
): ScheduledJobExecutionResult {
  assert.ok(job.claimToken);
  return Object.freeze({
    jobId: job.id,
    attemptNumber: job.attemptNumber,
    endpointId: job.sourceEndpointId,
    claimToken: job.claimToken,
    collectionRunOccurred: true,
    collectionRunId: run.id,
    category: 'succeeded' as const,
    outcome: 'content',
  });
}

function blockedResult(
  job: PersistedEndpointCollectionJob,
  reason: string,
): ScheduledJobExecutionResult {
  assert.ok(job.claimToken);
  return Object.freeze({
    jobId: job.id,
    attemptNumber: job.attemptNumber,
    endpointId: job.sourceEndpointId,
    claimToken: job.claimToken,
    collectionRunOccurred: false,
    category: 'blocked' as const,
    outcome: reason,
    reason,
  });
}

async function makeTerminalRun(
  database: Database,
  runId: string,
  status: 'succeeded' | 'failed',
  finishedAt: Date,
  retryClassification: 'transient' | 'permanent' = 'transient',
): Promise<void> {
  await database.query(
    `UPDATE collection_runs
     SET started_at = LEAST(started_at, $2::timestamptz - interval '1 second'),
         finished_at = $2,
         run_status = $3,
         transport_status = CASE WHEN $3 = 'succeeded' THEN 'succeeded' ELSE 'failed' END,
         outcome_code = CASE WHEN $3 = 'succeeded' THEN 'content' ELSE 'fetch_failed' END,
         retry_classification = CASE WHEN $3 = 'failed' THEN $4 ELSE NULL END,
         error_code = CASE WHEN $3 = 'failed' THEN 'network_error' ELSE NULL END,
         error_detail = CASE WHEN $3 = 'failed' THEN 'Synthetic failure.' ELSE NULL END
     WHERE id = $1`,
    [runId, finishedAt, status, retryClassification],
  );
}

async function outstandingCount(
  database: Database,
  endpointId: string,
): Promise<number> {
  const result = await database.query<{ count: string }>(
    `SELECT count(*) AS count
     FROM endpoint_collection_jobs
     WHERE source_endpoint_id = $1 AND status IN ('queued', 'running')`,
    [endpointId],
  );
  return Number(result.rows[0]?.count);
}

interface SourceCapacitySaturation {
  stop(): Promise<void>;
}

interface DeferredSignal {
  readonly promise: Promise<void>;
  resolve(): void;
}

async function saturateSourceCapacity(
  databaseUrl: string,
  sourceId: string,
): Promise<SourceCapacitySaturation> {
  const actors = Array.from({ length: COLLECTION_CAPACITY_LIMITS.source }, () =>
    createDatabase({ connectionString: databaseUrl }),
  );
  const entered = actors.map(() => deferredSignal());
  const release = actors.map(() => deferredSignal());
  const operations = actors.map((actor, index) =>
    withCollectionCapacity(
      actor,
      {
        sourceId,
        destinationHost: `source-capacity-holder-${index}.example`,
      },
      async () => {
        entered[index]!.resolve();
        await release[index]!.promise;
        return index;
      },
    ),
  );

  try {
    await Promise.all(
      entered.map((signal, index) =>
        waitForSignalOrFailure(signal.promise, operations[index]!),
      ),
    );
  } catch (error) {
    for (const signal of release) signal.resolve();
    await Promise.allSettled(operations);
    await Promise.all(actors.map(async (actor) => actor.close()));
    throw error;
  }

  let stopped = false;
  return Object.freeze({
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      for (const signal of release) signal.resolve();
      try {
        const results = await Promise.all(operations);
        for (const result of results) assert.equal(result.status, 'acquired');
      } finally {
        await Promise.all(actors.map(async (actor) => actor.close()));
      }
    },
  });
}

function controlledNotModifiedFetcher(): HttpFetcher {
  return Object.freeze({
    async fetch(request: HttpFetcherRequest) {
      return Object.freeze({
        outcome: 'not_modified' as const,
        response: Object.freeze({ etag: '"capacity-fairness"' }),
        finalUrl: request.configuration.endpoint.endpointUrl.value,
        redirectCount: 0,
        metrics: Object.freeze({
          elapsedMilliseconds: 1,
          hopCount: 1,
          wireBytes: 0,
          decompressedBytes: 0,
          hops: Object.freeze([
            Object.freeze({
              elapsedMilliseconds: 1,
              httpStatus: 304,
              wireBytes: 0,
              decompressedBytes: 0,
              selectedAddress: '203.0.113.10',
              selectedAddressFamily: 4 as const,
            }),
          ]),
        }),
      });
    },
  });
}

function deferredSignal(): DeferredSignal {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function waitForSignalOrFailure<T>(
  signal: Promise<void>,
  operation: Promise<CollectionCapacityResult<T>>,
): Promise<void> {
  return Promise.race([
    signal,
    operation.then(() => {
      throw new Error(
        'Capacity holder exited before reaching its test barrier.',
      );
    }),
  ]);
}

async function withPolicyDatabase(
  work: (
    database: Database,
    endpoints: readonly [PersistedSourceEndpoint, PersistedSourceEndpoint],
    databaseUrl: string,
  ) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await bootstrapPublicationTree(
        database,
        parseBootstrapDocument(await readFile(fixtureUrl, 'utf8')),
      );
      const firstSource = await findSourceByConfigKey(
        database,
        'circuit_journal',
      );
      const secondSource = await findSourceByConfigKey(
        database,
        'research_wire',
      );
      assert.ok(firstSource);
      assert.ok(secondSource);
      const first = await findSourceEndpointBySourceAndConfigKey(
        database,
        firstSource.id,
        'main_feed',
      );
      const second = await findSourceEndpointBySourceAndConfigKey(
        database,
        secondSource.id,
        'updates_feed',
      );
      assert.ok(first);
      assert.ok(second);
      await work(database, [first, second], databaseUrl);
    } finally {
      await database.close();
    }
  });
}
