import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

import {
  createDatabase,
  type QueryExecutor,
} from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  finalizeCollectionRun,
  startCollectionRun,
} from '../../src/collection/runs/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const IDS = Object.freeze({
  sourceOne: '10000000-0000-4000-8000-000000000001',
  sourceTwo: '10000000-0000-4000-8000-000000000002',
  endpointOne: '20000000-0000-4000-8000-000000000001',
  endpointTwo: '20000000-0000-4000-8000-000000000002',
  runOne: '30000000-0000-4000-8000-000000000001',
  runTwo: '30000000-0000-4000-8000-000000000002',
  articleOne: '40000000-0000-4000-8000-000000000001',
  articleTwo: '40000000-0000-4000-8000-000000000002',
  articleThree: '40000000-0000-4000-8000-000000000003',
});
const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

test('migration from zero creates and reruns the complete duplicate foundation', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    assert.deepEqual(await migrateDatabase({ connectionString: databaseUrl }), [
      '0001_initial_schema.sql',
      '0002_endpoint_runtime_and_run_transport_telemetry.sql',
      '0003_endpoint_collection_jobs.sql',
      '0004_canonical_scheduled_execution.sql',
      '0005_categories_and_relevance.sql',
      '0006_mutable_relevance_rule_history.sql',
      '0007_public_feed_discovery_indexes.sql',
      '0008_publication_presentation.sql',
      '0009_source_administration_foundation.sql',
      '0010_endpoint_collection_job_trigger_kind.sql',
      '0011_publication_presentation_timezone.sql',
      '0012_duplicate_persistence_foundation.sql',
    ]);
    assert.deepEqual(
      await migrateDatabase({ connectionString: databaseUrl }),
      [],
    );

    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      const objects = await client.query<{ name: string | null }>(
        `SELECT name
         FROM unnest($1::text[]) AS requested(name)
         WHERE to_regclass(requested.name) IS NOT NULL
         ORDER BY name`,
        [
          [
            'duplicate_review_candidates',
            'duplicate_review_signals',
            'duplicate_groups',
            'duplicate_group_memberships',
          ],
        ],
      );
      assert.deepEqual(objects.rows, [
        { name: 'duplicate_group_memberships' },
        { name: 'duplicate_groups' },
        { name: 'duplicate_review_candidates' },
        { name: 'duplicate_review_signals' },
      ]);
      const indexes = await client.query<{ indexname: string }>(
        `SELECT indexname
         FROM pg_indexes
         WHERE indexname IN (
           'articles_canonical_identity_global_digest_lookup',
           'articles_normalized_title_digest_lookup'
         )
         ORDER BY indexname`,
      );
      assert.deepEqual(indexes.rows, [
        { indexname: 'articles_canonical_identity_global_digest_lookup' },
        { indexname: 'articles_normalized_title_digest_lookup' },
      ]);
    } finally {
      await client.end();
    }
  });
});

test('review pairs and ordered signals enforce canonical bounded persistence', async () => {
  await withFoundationDatabase(async (client) => {
    await insertReviewCandidate(client, {
      id: randomUUID(),
      low: IDS.articleOne,
      high: IDS.articleTwo,
    });

    for (const values of [
      [randomUUID(), IDS.articleOne, IDS.articleOne],
      [randomUUID(), IDS.articleTwo, IDS.articleOne],
    ]) {
      await assert.rejects(() =>
        client.query(
          `INSERT INTO duplicate_review_candidates
             (id, article_low_id, article_high_id, state, origin, confidence, evidence_fingerprint)
           VALUES ($1, $2, $3, 'pending', 'automatic', 50, $4)`,
          [...values, 'a'.repeat(64)],
        ),
      );
    }

    await assert.rejects(() =>
      insertReviewCandidate(client, {
        id: randomUUID(),
        low: IDS.articleOne,
        high: IDS.articleTwo,
      }),
    );
    for (const statement of [
      `UPDATE duplicate_review_candidates SET state = 'unknown'`,
      `UPDATE duplicate_review_candidates SET origin = 'system'`,
      `UPDATE duplicate_review_candidates SET confidence = 101`,
      `UPDATE duplicate_review_candidates SET evidence_fingerprint = 'bad'`,
      `INSERT INTO duplicate_review_signals
         (candidate_id, signal_order, reason_code, signal_strength)
       SELECT id, 0, 'canonical_url_exact', 'strong'
       FROM duplicate_review_candidates LIMIT 1`,
    ]) {
      await assert.rejects(() => client.query(statement));
    }

    const candidate = await client.query<{ id: string }>(
      'SELECT id FROM duplicate_review_candidates LIMIT 1',
    );
    const candidateId = candidate.rows[0]!.id;
    await client.query(
      `INSERT INTO duplicate_review_signals
         (candidate_id, signal_order, reason_code, signal_strength)
       VALUES ($1, 1, 'canonical_url_exact', 'strong'),
              ($1, 2, 'normalized_title_equal', 'weak')`,
      [candidateId],
    );
    const signals = await client.query<{
      signal_order: number;
      reason_code: string;
      signal_strength: string;
    }>(
      `SELECT signal_order, reason_code, signal_strength
       FROM duplicate_review_signals
       WHERE candidate_id = $1
       ORDER BY signal_order`,
      [candidateId],
    );
    assert.deepEqual(signals.rows, [
      {
        signal_order: 1,
        reason_code: 'canonical_url_exact',
        signal_strength: 'strong',
      },
      {
        signal_order: 2,
        reason_code: 'normalized_title_equal',
        signal_strength: 'weak',
      },
    ]);
    await assert.rejects(() =>
      client.query(
        `INSERT INTO duplicate_review_signals
           (candidate_id, signal_order, reason_code, signal_strength)
         VALUES ($1, 2, 'duplicate_order', 'weak')`,
        [candidateId],
      ),
    );
  });
});

test('group topology enforces one membership per Article and deferred Primary membership', async () => {
  await withFoundationDatabase(async (client) => {
    const invalidGroupId = randomUUID();
    await assert.rejects(() =>
      client.query(
        `INSERT INTO duplicate_groups (id, primary_article_id)
         VALUES ($1, $2)`,
        [invalidGroupId, IDS.articleOne],
      ),
    );

    const groupId = randomUUID();
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO duplicate_groups (id, primary_article_id)
       VALUES ($1, $2)`,
      [groupId, IDS.articleOne],
    );
    await client.query(
      `INSERT INTO duplicate_group_memberships (group_id, article_id)
       VALUES ($1, $2), ($1, $3)`,
      [groupId, IDS.articleOne, IDS.articleTwo],
    );
    await client.query('COMMIT');

    await client.query(
      `UPDATE duplicate_groups
       SET primary_article_id = $2
       WHERE id = $1`,
      [groupId, IDS.articleTwo],
    );
    await assert.rejects(() =>
      client.query(
        `UPDATE duplicate_groups
         SET primary_article_id = $2
         WHERE id = $1`,
        [groupId, IDS.articleThree],
      ),
    );

    const secondGroupId = randomUUID();
    await assert.rejects(() =>
      client.query(
        `INSERT INTO duplicate_groups (id, primary_article_id)
         VALUES ($1, $2);
         INSERT INTO duplicate_group_memberships (group_id, article_id)
         VALUES ($1, $2)`,
        [secondGroupId, IDS.articleOne],
      ),
    );

    const beforeDelete = await client.query<{
      articles: string;
      observations: string;
    }>(
      `SELECT
         (SELECT count(*) FROM articles) AS articles,
         (SELECT count(*) FROM article_observations) AS observations`,
    );
    await client.query('DELETE FROM duplicate_groups WHERE id = $1', [groupId]);
    const afterDelete = await client.query<{
      articles: string;
      observations: string;
    }>(
      `SELECT
         (SELECT count(*) FROM articles) AS articles,
         (SELECT count(*) FROM article_observations) AS observations`,
    );
    assert.deepEqual(afterDelete.rows, beforeDelete.rows);
    await assert.rejects(() =>
      client.query('DELETE FROM articles WHERE id = $1', [IDS.articleOne]),
    );
  });
});

test('Collection-run duplicate effects default to zero and remain orthogonal', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await insertCollectionFixture(database);
      const running = await startCollectionRun(database, {
        sourceEndpointId: IDS.endpointOne,
        executionId: 'duplicate_effects_zero',
      });
      assert.equal(running.duplicateReviewCreatedCount, 0);
      assert.equal(running.duplicateGroupedCount, 0);
      const finalized = await finalizeCollectionRun(database, running.id, {
        runStatus: 'succeeded',
        transportStatus: 'succeeded',
        parserStatus: 'succeeded',
        normalizationStatus: 'succeeded',
        processingStatus: 'succeeded',
        rawItemCount: 2,
        sourceItemFilteredCount: 0,
        normalizedCandidateCount: 2,
        normalizationFailureCount: 0,
        articleLinkRejectionCount: 0,
        createdCount: 1,
        updatedCount: 1,
        unchangedCount: 0,
        rejectedCount: 0,
        excludedCount: 0,
        failedCount: 0,
        duplicateReviewCreatedCount: 2,
        duplicateGroupedCount: 1,
      });
      assert.equal(finalized.duplicateReviewCreatedCount, 2);
      assert.equal(finalized.duplicateGroupedCount, 1);
      await assert.rejects(() =>
        database.query(
          'UPDATE collection_runs SET duplicate_grouped_count = -1 WHERE id = $1',
          [running.id],
        ),
      );
    } finally {
      await database.close();
    }
  });
});

async function withFoundationDatabase(
  callback: (client: Client) => Promise<void>,
): Promise<void> {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await insertCollectionFixture(client);
      await callback(client);
    } finally {
      await client.end();
    }
  });
}

async function insertCollectionFixture(executor: QueryExecutor): Promise<void> {
  await executor.query(
    `INSERT INTO sources
       (id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state)
     VALUES ($1, 'duplicate_source_one', 'Duplicate Source One', 'https://one.example', 'approved', 'active', 'enabled'),
            ($2, 'duplicate_source_two', 'Duplicate Source Two', 'https://two.example', 'approved', 'active', 'enabled')`,
    [IDS.sourceOne, IDS.sourceTwo],
  );
  await executor.query(
    `INSERT INTO source_endpoints
       (id, source_id, config_key, endpoint_url, endpoint_type, approval_state, lifecycle_state, operational_state, poll_interval_seconds)
     VALUES ($1, $3, 'duplicate_feed_one', 'https://one.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300),
            ($2, $4, 'duplicate_feed_two', 'https://two.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300)`,
    [IDS.endpointOne, IDS.endpointTwo, IDS.sourceOne, IDS.sourceTwo],
  );
  await executor.query(
    `INSERT INTO collection_runs
       (id, source_endpoint_id, execution_id, run_status, transport_status, parser_status)
     VALUES ($1, $3, 'duplicate_fixture_one', 'running', 'not_run', 'not_run'),
            ($2, $4, 'duplicate_fixture_two', 'running', 'not_run', 'not_run')`,
    [IDS.runOne, IDS.runTwo, IDS.endpointOne, IDS.endpointTwo],
  );
  await executor.query(
    `INSERT INTO articles
       (id, source_id, original_url, canonical_identity_url, display_title,
        normalized_title, published_at_status, source_updated_at_status,
        first_seen_at, last_seen_at)
     VALUES
       ($1, $4, 'https://one.example/a', 'https://publisher.example/item', 'Item One', 'item one', 'missing', 'missing', now(), now()),
       ($2, $5, 'https://two.example/a', 'https://publisher.example/item', 'Item Two', 'item two', 'missing', 'missing', now(), now()),
       ($3, $4, 'https://one.example/b', 'https://publisher.example/other', 'Item Three', 'item three', 'missing', 'missing', now(), now())`,
    [
      IDS.articleOne,
      IDS.articleTwo,
      IDS.articleThree,
      IDS.sourceOne,
      IDS.sourceTwo,
    ],
  );
  await executor.query(
    `INSERT INTO article_observations
       (id, source_id, source_endpoint_id, collection_run_id, article_id,
        processing_outcome, observed_canonical_identity_url)
     VALUES ($1, $4, $6, $8, $10, 'created', 'https://publisher.example/item'),
            ($2, $5, $7, $9, $11, 'created', 'https://publisher.example/item'),
            ($3, $4, $6, $8, $12, 'created', 'https://publisher.example/other')`,
    [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      IDS.sourceOne,
      IDS.sourceTwo,
      IDS.endpointOne,
      IDS.endpointTwo,
      IDS.runOne,
      IDS.runTwo,
      IDS.articleOne,
      IDS.articleTwo,
      IDS.articleThree,
    ],
  );
}

async function insertReviewCandidate(
  executor: QueryExecutor,
  input: { readonly id: string; readonly low: string; readonly high: string },
): Promise<void> {
  await executor.query(
    `INSERT INTO duplicate_review_candidates
       (id, article_low_id, article_high_id, state, origin, confidence, evidence_fingerprint)
     VALUES ($1, $2, $3, 'pending', 'automatic', 80, $4)`,
    [input.id, input.low, input.high, 'a'.repeat(64)],
  );
}
