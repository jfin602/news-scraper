import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDatabase } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  CollectionRunPersistenceError,
  finalizeCollectionRun,
  findCollectionRunById,
  startCollectionRun,
} from '../../src/collection/runs/repository.ts';
import { insertPublication } from '../../src/publications/repository.ts';
import {
  insertSource,
  insertSourceEndpoint,
} from '../../src/sources/repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

test('starts, finds, and finalizes a successful collection run exactly once', async () => {
  await withMigratedDatabase(async (database) => {
    const endpoint = await createEndpoint(database);
    const run = await startCollectionRun(database, {
      sourceEndpointId: endpoint.id,
      executionId: 'worker_execution_001',
    });

    assert.equal(run.sourceEndpointId, endpoint.id);
    assert.equal(run.executionId, 'worker_execution_001');
    assert.equal(run.runStatus, 'running');
    assert.equal(run.transportStatus, 'not_run');
    assert.equal(run.parserStatus, 'not_run');
    assert.equal(run.normalizationStatus, 'not_run');
    assert.equal(run.rawItemCount, 0);
    assert.equal(run.normalizedCandidateCount, 0);
    assert.equal(run.normalizationFailureCount, 0);
    assert.equal(run.articleLinkRejectionCount, 0);
    assert.equal(run.finishedAt, undefined);
    assert.ok(run.startedAt instanceof Date);
    assert.ok(Object.isFrozen(run));
    assert.deepEqual(await findCollectionRunById(database, run.id), run);

    const successfulFinalization = {
      runStatus: 'succeeded',
      transportStatus: 'succeeded',
      parserStatus: 'succeeded',
      normalizationStatus: 'succeeded',
      httpStatusCode: 200,
      wireByteCount: 1234,
      decompressedByteCount: 4321,
      rawItemCount: 2,
      normalizedCandidateCount: 1,
      normalizationFailureCount: 1,
      articleLinkRejectionCount: 1,
    } as const;
    const finalized = await finalizeCollectionRun(
      database,
      run.id,
      successfulFinalization,
    );
    assert.equal(finalized.runStatus, 'succeeded');
    assert.equal(finalized.transportStatus, 'succeeded');
    assert.equal(finalized.parserStatus, 'succeeded');
    assert.equal(finalized.httpStatusCode, 200);
    assert.equal(finalized.wireByteCount, 1234);
    assert.equal(finalized.decompressedByteCount, 4321);
    assert.equal(finalized.rawItemCount, 2);
    assert.equal(finalized.normalizationStatus, 'succeeded');
    assert.equal(finalized.normalizedCandidateCount, 1);
    assert.equal(finalized.normalizationFailureCount, 1);
    assert.equal(finalized.articleLinkRejectionCount, 1);
    assert.ok(finalized.finishedAt instanceof Date);
    assert.ok(finalized.finishedAt.getTime() >= finalized.startedAt.getTime());

    await assert.rejects(
      finalizeCollectionRun(database, run.id, successfulFinalization),
      /already terminal/u,
    );
    assert.deepEqual(await findCollectionRunById(database, run.id), finalized);
  });
});

test('persists truthful no-change and failed collection-run stage outcomes', async () => {
  await withMigratedDatabase(async (database) => {
    const endpoint = await createEndpoint(database);
    const noChangeRun = await startCollectionRun(database, {
      sourceEndpointId: endpoint.id,
      executionId: 'worker_execution_no_change',
    });
    const noChange = await finalizeCollectionRun(database, noChangeRun.id, {
      runStatus: 'succeeded',
      transportStatus: 'not_modified',
      parserStatus: 'not_run',
      httpStatusCode: 304,
      rawItemCount: 0,
      ...normalizationNotRun,
    });
    assert.equal(noChange.transportStatus, 'not_modified');
    assert.equal(noChange.parserStatus, 'not_run');
    assert.equal(noChange.rawItemCount, 0);

    const failedRun = await startCollectionRun(database, {
      sourceEndpointId: endpoint.id,
      executionId: 'worker_execution_failure',
    });
    const failed = await finalizeCollectionRun(database, failedRun.id, {
      runStatus: 'failed',
      transportStatus: 'failed',
      parserStatus: 'not_run',
      rawItemCount: 0,
      ...normalizationNotRun,
      error: {
        code: 'transport_timeout',
        detail: 'The approved endpoint did not respond before the deadline.',
      },
    });
    assert.equal(failed.runStatus, 'failed');
    assert.equal(failed.errorCode, 'transport_timeout');
    assert.equal(
      failed.errorDetail,
      'The approved endpoint did not respond before the deadline.',
    );
  });
});

test('persists valid zero and mixed completed normalization batches', async () => {
  await withMigratedDatabase(async (database) => {
    const endpoint = await createEndpoint(database);
    for (const [
      executionId,
      rawItemCount,
      normalizedCandidateCount,
      normalizationFailureCount,
      articleLinkRejectionCount,
    ] of [
      ['zero_batch', 0, 0, 0, 0],
      ['mixed_batch', 5, 3, 2, 1],
    ] as const) {
      const run = await startCollectionRun(database, {
        sourceEndpointId: endpoint.id,
        executionId,
      });
      const finalized = await finalizeCollectionRun(database, run.id, {
        runStatus: 'succeeded',
        transportStatus: 'succeeded',
        parserStatus: 'succeeded',
        normalizationStatus: 'succeeded',
        rawItemCount,
        normalizedCandidateCount,
        normalizationFailureCount,
        articleLinkRejectionCount,
      });
      assert.deepEqual(
        [
          finalized.normalizationStatus,
          finalized.rawItemCount,
          finalized.normalizedCandidateCount,
          finalized.normalizationFailureCount,
          finalized.articleLinkRejectionCount,
        ],
        [
          'succeeded',
          rawItemCount,
          normalizedCandidateCount,
          normalizationFailureCount,
          articleLinkRejectionCount,
        ],
      );
    }
  });
});

const normalizationNotRun = {
  normalizationStatus: 'not_run',
  normalizedCandidateCount: 0,
  normalizationFailureCount: 0,
  articleLinkRejectionCount: 0,
} as const;

test('rejects invalid collection-run repository inputs and nonexistent endpoint ownership', async () => {
  await withMigratedDatabase(async (database) => {
    await assert.rejects(
      startCollectionRun(database, {
        sourceEndpointId: '00000000-0000-0000-0000-000000000099',
        executionId: 'missing_endpoint',
      }),
    );
    const endpoint = await createEndpoint(database);
    await assert.rejects(
      startCollectionRun(database, {
        sourceEndpointId: endpoint.id,
        executionId: ' ',
      }),
      CollectionRunPersistenceError,
    );
    await assert.rejects(
      startCollectionRun(database, {
        sourceEndpointId: endpoint.id,
        executionId: 'x'.repeat(201),
      }),
      CollectionRunPersistenceError,
    );

    const run = await startCollectionRun(database, {
      sourceEndpointId: endpoint.id,
      executionId: 'repository_validation',
    });
    const invalidInputs: readonly unknown[] = [
      {
        runStatus: 'succeeded',
        transportStatus: 'succeeded',
        parserStatus: 'succeeded',
        rawItemCount: -1,
      },
      {
        runStatus: 'succeeded',
        transportStatus: 'invalid',
        parserStatus: 'succeeded',
        rawItemCount: 0,
      },
      {
        runStatus: 'succeeded',
        transportStatus: 'succeeded',
        parserStatus: 'succeeded',
        httpStatusCode: 99,
        rawItemCount: 0,
      },
      {
        runStatus: 'failed',
        transportStatus: 'failed',
        parserStatus: 'not_run',
        rawItemCount: 0,
        error: { code: 'x'.repeat(101), detail: 'bounded detail' },
      },
      {
        runStatus: 'failed',
        transportStatus: 'failed',
        parserStatus: 'not_run',
        rawItemCount: 0,
        error: { code: 'transport_failure', detail: 'x'.repeat(2001) },
      },
    ];
    for (const input of invalidInputs) {
      await assert.rejects(
        finalizeCollectionRun(
          database,
          run.id,
          input as Parameters<typeof finalizeCollectionRun>[2],
        ),
        CollectionRunPersistenceError,
      );
    }
    assert.equal(
      (await findCollectionRunById(database, run.id))?.runStatus,
      'running',
    );
  });
});

test('database constraints preserve collection-run lifecycle and caller transactions', async () => {
  await withMigratedDatabase(async (database) => {
    const endpoint = await createEndpoint(database);
    const run = await startCollectionRun(database, {
      sourceEndpointId: endpoint.id,
      executionId: 'direct_constraint_checks',
    });

    await assert.rejects(
      database.query(
        'UPDATE collection_runs SET finished_at = now() WHERE id = $1',
        [run.id],
      ),
    );
    await assert.rejects(
      database.query(
        "UPDATE collection_runs SET transport_status = 'invalid' WHERE id = $1",
        [run.id],
      ),
    );
    await assert.rejects(
      database.query(
        'UPDATE collection_runs SET wire_byte_count = -1 WHERE id = $1',
        [run.id],
      ),
    );
    for (const statement of [
      'UPDATE collection_runs SET normalized_candidate_count = -1 WHERE id = $1',
      'UPDATE collection_runs SET normalization_failure_count = -1 WHERE id = $1',
      'UPDATE collection_runs SET article_link_rejection_count = -1 WHERE id = $1',
      'UPDATE collection_runs SET normalized_candidate_count = 1, article_link_rejection_count = 2 WHERE id = $1',
      'UPDATE collection_runs SET normalized_candidate_count = 1 WHERE id = $1',
      "UPDATE collection_runs SET normalization_status = 'succeeded', parser_status = 'succeeded', raw_item_count = 1 WHERE id = $1",
      "UPDATE collection_runs SET normalization_status = 'succeeded' WHERE id = $1",
      "UPDATE collection_runs SET normalization_status = 'failed', parser_status = 'succeeded', run_status = 'succeeded', finished_at = now() WHERE id = $1",
    ]) {
      await assert.rejects(database.query(statement, [run.id]));
    }
    await assert.rejects(
      database.query('DELETE FROM source_endpoints WHERE id = $1', [
        endpoint.id,
      ]),
    );
    await assert.rejects(
      database.query(
        `INSERT INTO collection_runs (
           id, source_endpoint_id, execution_id, started_at, finished_at,
           run_status, transport_status, parser_status, raw_item_count
         ) VALUES (
           '00000000-0000-0000-0000-000000000099', $1, 'finish_before_start',
           now(), now() - interval '1 second', 'succeeded', 'succeeded', 'succeeded', 0
         )`,
        [endpoint.id],
      ),
    );

    const before = await database.query<{ count: string }>(
      'SELECT count(*) FROM collection_runs',
    );
    const expectedFailure = new Error('synthetic transaction failure');
    await assert.rejects(
      database.transaction(async (transaction) => {
        await startCollectionRun(transaction, {
          sourceEndpointId: endpoint.id,
          executionId: 'rolled_back_run',
        });
        throw expectedFailure;
      }),
      expectedFailure,
    );
    const after = await database.query<{ count: string }>(
      'SELECT count(*) FROM collection_runs',
    );
    assert.equal(after.rows[0]?.count, before.rows[0]?.count);
  });
});

async function withMigratedDatabase(
  work: (database: ReturnType<typeof createDatabase>) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await work(database);
    } finally {
      await database.close();
    }
  });
}

async function createEndpoint(database: ReturnType<typeof createDatabase>) {
  const publication = await insertPublication(database, {
    name: 'Collection run publication',
    slug: 'collection-run-publication',
    activeForCollection: true,
    publicStatus: 'private',
  });
  const source = await insertSource(database, publication.id, {
    configKey: 'collection_run_source',
    displayName: 'Collection Run Source',
    siteUrl: 'https://www.example.com/',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    domainRules: [{ hostname: 'example.com', includeSubdomains: true }],
  });
  return insertSourceEndpoint(database, source.id, {
    configKey: 'collection_run_feed',
    endpointUrl: 'https://feeds.example.com/feed.xml',
    endpointType: 'rss_atom',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    pollIntervalSeconds: 300,
  });
}
