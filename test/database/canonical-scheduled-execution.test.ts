import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { executeEndpointCollection } from '../../src/collection/endpoint-collection-service.ts';
import type {
  HttpFetcher,
  HttpFetcherRequest,
  HttpFetcherResult,
} from '../../src/collection/fetchers/http-fetcher.ts';
import {
  findCollectionRunById,
  startCollectionRun,
} from '../../src/collection/runs/repository.ts';
import { createDatabase, type Database } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  executeClaimedEndpointCollectionJob,
  reconcileExpiredEndpointCollectionJob,
} from '../../src/jobs/execute-endpoint-collection-job.ts';
import {
  attachCollectionRunToEndpointCollectionJob,
  claimNextEndpointCollectionJob,
  enqueueEndpointCollectionJob,
  findEndpointCollectionJobById,
  terminalizeEndpointCollectionJob,
} from '../../src/jobs/endpoint-collection-job-repository.ts';
import {
  bootstrapPublicationTree,
  parseBootstrapDocument,
} from '../../src/publication/bootstrap.ts';
import {
  applyTerminalCollectionRunToEndpointRuntime,
  findSourceByConfigKey,
  findSourceEndpointBySourceAndConfigKey,
  updateEndpointRuntimeState,
  type PersistedSourceEndpoint,
} from '../../src/sources/repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const fixtureUrl = new URL(
  '../fixtures/generic-bootstrap.json',
  import.meta.url,
);
const T1000 = new Date('2026-08-11T10:00:00.000Z');
const T1001 = new Date('2026-08-11T10:01:00.000Z');
const T1002 = new Date('2026-08-11T10:02:00.000Z');
const T1003 = new Date('2026-08-11T10:03:00.000Z');
const T1005 = new Date('2026-08-11T10:05:00.000Z');
const T1010 = new Date('2026-08-11T10:10:00.000Z');

test('canonical execution commits conditional validators only after successful outcomes', async () => {
  await withEndpoint(async (database, endpoint) => {
    const oldLastModified = 'Mon, 10 Aug 2026 12:00:00 GMT';
    await updateEndpointRuntimeState(database, endpoint.id, {
      validators: {
        mode: 'replace',
        values: { etag: '"old"', lastModified: oldLastModified },
      },
    });

    const contentRequest: HttpFetcherRequest[] = [];
    const content = await executeEndpointCollection(
      database,
      {
        triggerKind: 'manual',
        sourceConfigKey: 'circuit_journal',
        endpointConfigKey: 'main_feed',
        executionId: 'manual-content-success',
      },
      {
        createFetcher: () => fetcher(contentResult('"fresh"'), contentRequest),
      },
    );
    assert.equal(content.status, 'resolved');
    assert.deepEqual(contentRequest[0]?.validators, {
      etag: '"old"',
      lastModified: oldLastModified,
    });
    let state = await loadEndpoint(database);
    assert.equal(state.etag, '"fresh"');
    assert.equal(state.lastModified, undefined);
    assert.ok(state.lastAttemptAt);
    assert.ok(state.lastSuccessAt);
    assert.equal(state.consecutiveFailureCount, 0);
    assert.ok(state.nextDueAt);

    await updateEndpointRuntimeState(database, endpoint.id, {
      validators: {
        mode: 'replace',
        values: { etag: '"before-304"', lastModified: oldLastModified },
      },
    });
    const beforeArticleCount = await articleCount(database);
    const notModified = await executeEndpointCollection(
      database,
      {
        triggerKind: 'manual',
        sourceConfigKey: 'circuit_journal',
        endpointConfigKey: 'main_feed',
        executionId: 'manual-not-modified',
      },
      { createFetcher: () => fetcher(notModifiedResult('"after-304"')) },
    );
    assert.equal(notModified.status, 'resolved');
    if (notModified.status === 'resolved') {
      assert.equal(notModified.collection.status, 'succeeded');
      if (notModified.collection.status === 'succeeded') {
        assert.equal(notModified.collection.outcome, 'not_modified');
      }
    }
    state = await loadEndpoint(database);
    assert.equal(state.etag, '"after-304"');
    assert.equal(state.lastModified, oldLastModified);
    assert.equal(await articleCount(database), beforeArticleCount);

    const preserved = { etag: state.etag, lastModified: state.lastModified };
    const parserFailure = await executeEndpointCollection(
      database,
      {
        triggerKind: 'manual',
        sourceConfigKey: 'circuit_journal',
        endpointConfigKey: 'main_feed',
        executionId: 'manual-parser-failure',
      },
      { createFetcher: () => fetcher(malformedContentResult()) },
    );
    assert.equal(parserFailure.status, 'resolved');
    if (parserFailure.status === 'resolved') {
      assert.equal(parserFailure.collection.status, 'failed');
      if (parserFailure.collection.status === 'failed') {
        assert.equal(parserFailure.collection.retryClassification, 'permanent');
      }
    }
    state = await loadEndpoint(database);
    assert.deepEqual(
      { etag: state.etag, lastModified: state.lastModified },
      preserved,
    );
    assert.equal(state.consecutiveFailureCount, 1);

    const transportFailure = await executeEndpointCollection(
      database,
      {
        triggerKind: 'manual',
        sourceConfigKey: 'circuit_journal',
        endpointConfigKey: 'main_feed',
        executionId: 'manual-transport-failure',
      },
      { createFetcher: () => fetcher(failedResult()) },
    );
    assert.equal(transportFailure.status, 'resolved');
    if (transportFailure.status === 'resolved') {
      assert.equal(transportFailure.collection.status, 'failed');
      if (transportFailure.collection.status === 'failed') {
        assert.equal(
          transportFailure.collection.retryClassification,
          'transient',
        );
      }
    }
    state = await loadEndpoint(database);
    assert.deepEqual(
      { etag: state.etag, lastModified: state.lastModified },
      preserved,
    );
    assert.equal(state.consecutiveFailureCount, 2);
  });
});

test('scheduled execution atomically correlates one job and run and updates endpoint state', async () => {
  await withEndpoint(async (database, endpoint) => {
    const enqueued = await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpoint.id,
      availableAt: T1000,
      attemptNumber: 1,
    });
    const claimed = await claimNextEndpointCollectionJob(database, {
      workerId: 'scheduled-worker',
      claimedAt: T1001,
      leaseExpiresAt: T1010,
    });
    assert.ok(claimed?.claimToken);
    const execution = await executeClaimedEndpointCollectionJob(database, {
      jobId: enqueued.job.id,
      claimToken: claimed.claimToken,
      now: T1002,
      serviceDependencies: {
        createFetcher: () => fetcher(contentResult('"scheduled"')),
      },
    });
    assert.equal(execution.category, 'succeeded');
    assert.equal(execution.collectionRunOccurred, true);
    assert.ok(execution.collectionRunId);

    const job = await findEndpointCollectionJobById(database, enqueued.job.id);
    assert.equal(job?.collectionRunId, execution.collectionRunId);
    const run = await findCollectionRunById(
      database,
      execution.collectionRunId,
    );
    assert.equal(run?.triggerKind, 'scheduled');
    assert.equal(run?.executionId, enqueued.job.id);
    assert.equal(run?.retryClassification, undefined);
    const state = await loadEndpoint(database);
    assert.equal(state.etag, '"scheduled"');
    assert.ok(state.lastSuccessAt);

    const duplicate = await executeClaimedEndpointCollectionJob(database, {
      jobId: enqueued.job.id,
      claimToken: claimed.claimToken,
      now: T1003,
      serviceDependencies: {
        createFetcher: () => fetcher(contentResult('"duplicate"')),
      },
    });
    assert.equal(duplicate.category, 'blocked');
    assert.equal(duplicate.reason, 'no_longer_due');
    const count = await database.query<{ count: string }>(
      'SELECT count(*) AS count FROM collection_runs WHERE execution_id = $1',
      [enqueued.job.id],
    );
    assert.equal(Number(count.rows[0]?.count), 1);
  });
});

test('failed scheduled execution persists retry class and failure state without validator mutation', async () => {
  await withEndpoint(async (database, endpoint) => {
    await updateEndpointRuntimeState(database, endpoint.id, {
      validators: { mode: 'replace', values: { etag: '"preserved"' } },
    });
    const enqueued = await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpoint.id,
      availableAt: T1000,
      attemptNumber: 1,
    });
    const claimed = await claimNextEndpointCollectionJob(database, {
      workerId: 'scheduled-worker',
      claimedAt: T1001,
      leaseExpiresAt: T1010,
    });
    assert.ok(claimed?.claimToken);
    const execution = await executeClaimedEndpointCollectionJob(database, {
      jobId: enqueued.job.id,
      claimToken: claimed.claimToken,
      now: T1002,
      serviceDependencies: { createFetcher: () => fetcher(failedResult()) },
    });
    assert.equal(execution.category, 'failed');
    assert.equal(execution.retryClassification, 'transient');
    assert.ok(execution.collectionRunId);
    const run = await findCollectionRunById(
      database,
      execution.collectionRunId,
    );
    assert.equal(run?.retryClassification, 'transient');
    const state = await loadEndpoint(database);
    assert.equal(state.etag, '"preserved"');
    assert.equal(state.consecutiveFailureCount, 1);
    assert.ok(state.lastFailureAt);
  });
});

test('expired jobs requeue before start and reconcile terminal or interrupted runs without replay', async () => {
  await withEndpoint(async (database, endpoint) => {
    const unstarted = await claimedJob(
      database,
      endpoint.id,
      'unstarted-worker',
    );
    const requeued = await reconcileExpiredEndpointCollectionJob(database, {
      jobId: unstarted.id,
      workerId: 'recovery-worker',
      expiredAt: T1002,
      recoveredAt: T1003,
      leaseExpiresAt: T1010,
      availableAt: T1003,
    });
    assert.equal(requeued.status, 'requeued');
    const reclaimed = await claimNextEndpointCollectionJob(database, {
      workerId: 'cleanup-worker',
      claimedAt: T1003,
      leaseExpiresAt: T1010,
    });
    assert.ok(reclaimed?.claimToken);
    await terminalizeEndpointCollectionJob(
      database,
      reclaimed.id,
      reclaimed.claimToken,
      {
        status: 'skipped',
        terminalAt: T1005,
        outcomeCode: 'recovered_unstarted',
      },
    );

    const terminalJob = await claimedJob(
      database,
      endpoint.id,
      'terminal-worker',
    );
    assert.ok(terminalJob.claimToken);
    const terminalRun = await startCollectionRun(database, {
      sourceEndpointId: endpoint.id,
      executionId: terminalJob.id,
      triggerKind: 'scheduled',
    });
    await attachCollectionRunToEndpointCollectionJob(
      database,
      terminalJob.id,
      terminalJob.claimToken,
      terminalRun.id,
      T1000,
    );
    await makeTerminalRun(database, terminalRun.id, 'succeeded', T1002);
    const terminalRecovered = await reconcileExpiredEndpointCollectionJob(
      database,
      {
        jobId: terminalJob.id,
        workerId: 'recovery-worker',
        expiredAt: T1002,
        recoveredAt: T1003,
        leaseExpiresAt: T1010,
        availableAt: T1003,
      },
    );
    assert.equal(terminalRecovered.status, 'reconciled');
    if (terminalRecovered.status === 'reconciled') {
      assert.equal(terminalRecovered.result.category, 'succeeded');
      assert.notEqual(
        terminalRecovered.result.claimToken,
        terminalJob.claimToken,
      );
    }
    assert.equal(
      await terminalizeEndpointCollectionJob(
        database,
        terminalJob.id,
        terminalJob.claimToken,
        { status: 'succeeded', terminalAt: T1005, outcomeCode: 'content' },
      ),
      undefined,
    );

    await terminalizeRecoveredJob(database, terminalRecovered);
    const interruptedJob = await claimedJob(
      database,
      endpoint.id,
      'interrupted-worker',
    );
    assert.ok(interruptedJob.claimToken);
    const interruptedRun = await startCollectionRun(database, {
      sourceEndpointId: endpoint.id,
      executionId: interruptedJob.id,
      triggerKind: 'scheduled',
    });
    await database.query(
      'UPDATE collection_runs SET started_at = $2 WHERE id = $1',
      [interruptedRun.id, T1000],
    );
    await attachCollectionRunToEndpointCollectionJob(
      database,
      interruptedJob.id,
      interruptedJob.claimToken,
      interruptedRun.id,
      T1000,
    );
    const interruptedRecovered = await reconcileExpiredEndpointCollectionJob(
      database,
      {
        jobId: interruptedJob.id,
        workerId: 'recovery-worker',
        expiredAt: T1002,
        recoveredAt: T1003,
        leaseExpiresAt: T1010,
        availableAt: T1003,
      },
    );
    assert.equal(interruptedRecovered.status, 'reconciled');
    if (interruptedRecovered.status === 'reconciled') {
      assert.equal(interruptedRecovered.result.category, 'failed');
      assert.equal(interruptedRecovered.result.reason, 'worker_interrupted');
      assert.equal(
        interruptedRecovered.result.retryClassification,
        'transient',
      );
    }
    const reconciledRun = await findCollectionRunById(
      database,
      interruptedRun.id,
    );
    assert.equal(reconciledRun?.runStatus, 'failed');
    assert.equal(reconciledRun?.outcomeCode, 'worker_interrupted');
    assert.equal(reconciledRun?.retryClassification, 'transient');
  });
});

test('terminal run state application is idempotent and older runs cannot overwrite newer timing', async () => {
  await withEndpoint(async (database, endpoint) => {
    const older = await startCollectionRun(database, {
      sourceEndpointId: endpoint.id,
      executionId: 'older-failure',
    });
    await makeTerminalRun(database, older.id, 'failed', T1001);
    const newer = await startCollectionRun(database, {
      sourceEndpointId: endpoint.id,
      executionId: 'newer-success',
    });
    await makeTerminalRun(database, newer.id, 'succeeded', T1003);

    await applyTerminalCollectionRunToEndpointRuntime(database, older.id);
    await applyTerminalCollectionRunToEndpointRuntime(database, older.id);
    let state = await loadEndpoint(database);
    assert.equal(state.consecutiveFailureCount, 1);
    await applyTerminalCollectionRunToEndpointRuntime(database, newer.id);
    state = await loadEndpoint(database);
    assert.equal(state.lastAttemptAt?.toISOString(), T1003.toISOString());
    assert.equal(state.consecutiveFailureCount, 0);
    await applyTerminalCollectionRunToEndpointRuntime(database, older.id);
    state = await loadEndpoint(database);
    assert.equal(state.lastAttemptAt?.toISOString(), T1003.toISOString());
    assert.equal(state.consecutiveFailureCount, 0);
  });
});

function fetcher(
  result: HttpFetcherResult,
  requests: HttpFetcherRequest[] = [],
): HttpFetcher {
  return {
    async fetch(request) {
      requests.push(request);
      return result;
    },
  };
}

function metrics(httpStatus: number) {
  return Object.freeze({
    elapsedMilliseconds: 5,
    hopCount: 1,
    wireBytes: 100,
    decompressedBytes: 200,
    hops: Object.freeze([
      Object.freeze({
        elapsedMilliseconds: 5,
        httpStatus,
        wireBytes: 100,
        decompressedBytes: 200,
        selectedAddress: '8.8.8.8',
        selectedAddressFamily: 4 as const,
      }),
    ]),
  });
}

function contentResult(etag: string): HttpFetcherResult {
  return Object.freeze({
    outcome: 'content' as const,
    content: Buffer.from(
      '<rss><channel><item><guid>one</guid><title>One</title><link>https://feeds.circuit.example/article-one</link></item></channel></rss>',
    ),
    mediaType: 'application/rss+xml',
    response: Object.freeze({ etag }),
    finalUrl: 'https://feeds.circuit.example/news.xml',
    redirectCount: 0,
    metrics: metrics(200),
  });
}

function malformedContentResult(): HttpFetcherResult {
  return Object.freeze({
    outcome: 'content' as const,
    content: Buffer.from('<not-a-feed/>'),
    mediaType: 'application/xml',
    response: Object.freeze({
      etag: '"must-not-commit"',
      lastModified: 'Tue, 11 Aug 2026 12:00:00 GMT',
    }),
    finalUrl: 'https://feeds.circuit.example/news.xml',
    redirectCount: 0,
    metrics: metrics(200),
  });
}

function notModifiedResult(etag: string): HttpFetcherResult {
  return Object.freeze({
    outcome: 'not_modified' as const,
    response: Object.freeze({ etag }),
    finalUrl: 'https://feeds.circuit.example/news.xml',
    redirectCount: 0,
    metrics: metrics(304),
  });
}

function failedResult(): HttpFetcherResult {
  return Object.freeze({
    outcome: 'failure' as const,
    reason: 'total_timeout' as const,
    retry: 'transient' as const,
    detail: 'Timed out.',
    response: Object.freeze({ etag: '"must-not-commit"' }),
    finalUrl: 'https://feeds.circuit.example/news.xml',
    redirectCount: 0,
    metrics: metrics(504),
  });
}

async function claimedJob(
  database: Database,
  endpointId: string,
  workerId: string,
) {
  const enqueued = await enqueueEndpointCollectionJob(database, {
    sourceEndpointId: endpointId,
    availableAt: T1000,
    attemptNumber: 1,
  });
  const claimed = await claimNextEndpointCollectionJob(database, {
    workerId,
    claimedAt: T1000,
    leaseExpiresAt: T1001,
  });
  assert.equal(claimed?.id, enqueued.job.id);
  assert.ok(claimed);
  return claimed;
}

async function makeTerminalRun(
  database: Database,
  runId: string,
  status: 'succeeded' | 'failed',
  finishedAt: Date,
): Promise<void> {
  await database.query(
    `UPDATE collection_runs
     SET started_at = $2::timestamptz - interval '1 second',
         finished_at = $2,
         run_status = $3,
         transport_status = CASE WHEN $3 = 'succeeded' THEN 'succeeded' ELSE 'failed' END,
         outcome_code = CASE WHEN $3 = 'succeeded' THEN 'content' ELSE 'fetch_failed' END,
         retry_classification = CASE WHEN $3 = 'failed' THEN 'transient' ELSE NULL END,
         error_code = CASE WHEN $3 = 'failed' THEN 'network_error' ELSE NULL END,
         error_detail = CASE WHEN $3 = 'failed' THEN 'Synthetic failure.' ELSE NULL END
     WHERE id = $1`,
    [runId, finishedAt, status],
  );
}

async function terminalizeRecoveredJob(
  database: Database,
  recovery: Awaited<ReturnType<typeof reconcileExpiredEndpointCollectionJob>>,
): Promise<void> {
  if (recovery.status !== 'reconciled') return;
  await terminalizeEndpointCollectionJob(
    database,
    recovery.result.jobId,
    recovery.result.claimToken,
    { status: 'succeeded', terminalAt: T1005, outcomeCode: 'content' },
  );
}

async function articleCount(database: Database): Promise<number> {
  const result = await database.query<{ count: string }>(
    'SELECT count(*) AS count FROM articles',
  );
  return Number(result.rows[0]?.count);
}

async function loadEndpoint(
  database: Database,
): Promise<PersistedSourceEndpoint> {
  const source = await findSourceByConfigKey(database, 'circuit_journal');
  assert.ok(source);
  const endpoint = await findSourceEndpointBySourceAndConfigKey(
    database,
    source.id,
    'main_feed',
  );
  assert.ok(endpoint);
  return endpoint;
}

async function withEndpoint(
  work: (
    database: Database,
    endpoint: PersistedSourceEndpoint,
  ) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const document = parseBootstrapDocument(
        await readFile(fixtureUrl, 'utf8'),
      );
      await bootstrapPublicationTree(database, document);
      await work(database, await loadEndpoint(database));
    } finally {
      await database.close();
    }
  });
}
