import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import {
  createArticleAdministrationService,
  ArticleAdministrationError,
  decodeArticleModerationCursor,
} from '../../src/admin/article-administration.ts';
import { createDatabase, type Database } from '../../src/database/database.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const IDS = {
  source: '61000000-0000-4000-8000-000000000001',
  endpoint: '62000000-0000-4000-8000-000000000001',
  run: '63000000-0000-4000-8000-000000000001',
  articleOne: '64000000-0000-4000-8000-000000000001',
  articleTwo: '64000000-0000-4000-8000-000000000002',
  articleThree: '64000000-0000-4000-8000-000000000003',
  categoryOne: '65000000-0000-4000-8000-000000000001',
  categoryTwo: '65000000-0000-4000-8000-000000000002',
  categoryThree: '65000000-0000-4000-8000-000000000003',
  group: '66000000-0000-4000-8000-000000000001',
  review: '67000000-0000-4000-8000-000000000001',
  observation: '68000000-0000-4000-8000-000000000001',
} as const;

const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

test('Article administration searches stored states and preserves bounded cursor order', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await insertFixture(database);
      const service = createArticleAdministrationService(database);

      const first = await service.search({ pageSize: 2 });
      assert.deepEqual(
        first.articles.map((article) => article.articleId),
        [IDS.articleThree, IDS.articleTwo],
      );
      assert.ok(first.nextCursor);
      const second = await service.search({
        pageSize: 2,
        cursor: first.nextCursor,
      });
      assert.deepEqual(
        second.articles.map((article) => article.articleId),
        [IDS.articleOne],
      );
      assert.equal(second.nextCursor, null);

      assert.deepEqual(
        (await service.search({ duplicateRole: 'non_primary' })).articles.map(
          (article) => article.articleId,
        ),
        [IDS.articleThree],
      );
      assert.deepEqual(
        (await service.search({ visibilityState: 'hidden' })).articles.map(
          (article) => article.articleId,
        ),
        [IDS.articleTwo],
      );
      assert.deepEqual(
        (await service.search({ visibilityState: 'archived' })).articles.map(
          (article) => article.articleId,
        ),
        [IDS.articleThree],
      );
      assert.deepEqual(
        (
          await service.search({ duplicateReviewState: 'pending' })
        ).articles.map((article) => article.articleId),
        [IDS.articleThree, IDS.articleOne],
      );

      await assert.rejects(
        service.search({ q: 'x', unknown: true }),
        (error: unknown) =>
          error instanceof ArticleAdministrationError &&
          error.code === 'invalid_request',
      );
      await assert.rejects(
        service.search({ pageSize: 101 }),
        (error: unknown) =>
          error instanceof ArticleAdministrationError &&
          error.code === 'invalid_request',
      );
      assert.throws(
        () =>
          decodeArticleModerationCursor(first.nextCursor, {
            pageSize: 2,
            visibilityState: 'visible',
          }),
        (error: unknown) =>
          error instanceof ArticleAdministrationError &&
          error.code === 'invalid_request',
      );
    } finally {
      await database.close();
    }
  });
});

test('Article administration provides provenance and reversible orthogonal mutations', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await insertFixture(database);
      const service = createArticleAdministrationService(database);

      const detail = await service.getArticle(IDS.articleOne);
      assert.equal(detail.sourceDerivedDisplayTitle, 'Source title');
      assert.equal(detail.displayTitle, 'Source title');
      assert.equal(detail.observations.length, 1);
      assert.equal(detail.observations[0]?.endpoint.configKey, 'feed');
      assert.equal(detail.observations[0]?.collectionRun.executionId, 'run-1');
      assert.equal(
        detail.observations[0]?.relevance.reasonCode,
        'default_include',
      );
      assert.deepEqual(
        detail.observations[0]?.categoryReasons.map(
          (reason) => reason.category.configKey,
        ),
        ['automatic_one'],
      );
      assert.equal(
        detail.duplicateReviews[0]?.signals[0]?.reasonCode,
        'canonical_identity_url_equal',
      );

      const override = await service.setDisplayTitleOverride(IDS.articleOne, {
        displayTitleOverride: 'Manual title',
        reason: 'Operator review',
      });
      assert.equal(override.changed, true);
      await database.query(
        `UPDATE articles SET display_title = 'Latest Source title' WHERE id = $1`,
        [IDS.articleOne],
      );
      assert.equal(
        (await service.getArticle(IDS.articleOne)).displayTitle,
        'Manual title',
      );
      const clearedTitle = await service.clearDisplayTitleOverride(
        IDS.articleOne,
      );
      assert.equal(clearedTitle.article.displayTitle, 'Latest Source title');
      assert.equal(
        (await service.clearDisplayTitleOverride(IDS.articleOne)).changed,
        false,
      );

      const categoryOverride = await service.setCategoryOverride(
        IDS.articleOne,
        {
          categoryConfigKeys: ['automatic_two'],
        },
      );
      assert.equal(
        categoryOverride.article.effectiveCategories[0]?.configKey,
        'automatic_two',
      );
      await database.query(
        `DELETE FROM article_categories WHERE article_id = $1`,
        [IDS.articleOne],
      );
      await database.query(
        `INSERT INTO article_categories (article_id, category_id) VALUES ($1, $2)`,
        [IDS.articleOne, IDS.categoryThree],
      );
      const retained = await service.getArticle(IDS.articleOne);
      assert.equal(retained.manualCategoryOverride.active, true);
      assert.deepEqual(
        retained.effectiveCategories.map((category) => category.configKey),
        ['automatic_two'],
      );
      assert.deepEqual(
        retained.automaticCategories.map((category) => category.configKey),
        ['automatic_three'],
      );

      const empty = await service.setCategoryOverride(IDS.articleOne, {
        categoryConfigKeys: [],
      });
      assert.equal(empty.article.manualCategoryOverride.active, true);
      assert.deepEqual(empty.article.effectiveCategories, []);
      const restoredCategories = await service.clearCategoryOverride(
        IDS.articleOne,
      );
      assert.deepEqual(
        restoredCategories.article.effectiveCategories.map(
          (category) => category.configKey,
        ),
        ['automatic_three'],
      );
      await assert.rejects(
        service.setCategoryOverride(IDS.articleOne, {
          categoryConfigKeys: ['missing_category'],
        }),
        (error: unknown) =>
          error instanceof ArticleAdministrationError &&
          error.code === 'category_not_found',
      );

      assert.equal((await service.hideArticle(IDS.articleOne)).changed, true);
      assert.equal(
        (await service.restoreArticle(IDS.articleOne)).changed,
        true,
      );
      const unchanged = await service.restoreArticle(IDS.articleOne);
      assert.equal(unchanged.changed, false);
      await assert.rejects(
        service.restoreArticle(IDS.articleThree),
        (error: unknown) =>
          error instanceof ArticleAdministrationError &&
          error.code === 'article_visibility_conflict',
      );

      const history = await service.listHistory(IDS.articleOne);
      assert.equal(history.events.length, 7);
      assert.equal(
        history.events.some((event) => event.action === 'article_hidden'),
        true,
      );
      assert.equal(
        history.events.some((event) => event.action === 'article_restored'),
        true,
      );
      const provenanceCount = await database.query<{ count: string }>(
        'SELECT count(*) FROM article_observations WHERE article_id = $1',
        [IDS.articleOne],
      );
      assert.equal(provenanceCount.rows[0]?.count, '1');
    } finally {
      await database.close();
    }
  });
});

test('failed audit insertion rolls back the moderation mutation', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await insertFixture(database);
      const failingDatabase: Database = {
        query: database.query.bind(database),
        ping: database.ping.bind(database),
        close: database.close.bind(database),
        withSession: database.withSession.bind(database),
        transaction: (work) =>
          database.transaction((transaction) =>
            work({
              query: async (text, values) => {
                if (text.includes('INSERT INTO audit_events')) {
                  throw new Error('injected audit failure');
                }
                return transaction.query(text, values);
              },
            }),
          ),
      };
      const service = createArticleAdministrationService(failingDatabase);
      await assert.rejects(service.hideArticle(IDS.articleOne));
      const state = await database.query<{
        visibility_state: string;
        count: string;
      }>(
        `SELECT visibility_state,
                (SELECT count(*) FROM audit_events WHERE target_id = $1) AS count
         FROM articles WHERE id = $1`,
        [IDS.articleOne],
      );
      assert.deepEqual(state.rows, [
        { visibility_state: 'visible', count: '0' },
      ]);
    } finally {
      await database.close();
    }
  });
});

test('cross-connection Worker-like Article updates converge with moderation state', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const moderationDatabase = createDatabase({
      connectionString: databaseUrl,
    });
    const workerDatabase = createDatabase({ connectionString: databaseUrl });
    try {
      await insertFixture(moderationDatabase);
      const service = createArticleAdministrationService(moderationDatabase);
      await Promise.all([
        service.setDisplayTitleOverride(IDS.articleOne, {
          displayTitleOverride: 'Concurrent manual title',
        }),
        workerDatabase.transaction(async (transaction) => {
          await transaction.query(
            `UPDATE articles SET display_title = 'Concurrent Source title' WHERE id = $1`,
            [IDS.articleOne],
          );
          await transaction.query('SELECT pg_sleep(0.02)');
          await transaction.query(
            `DELETE FROM article_categories WHERE article_id = $1`,
            [IDS.articleOne],
          );
          await transaction.query(
            `INSERT INTO article_categories (article_id, category_id) VALUES ($1, $2)`,
            [IDS.articleOne, IDS.categoryThree],
          );
        }),
      ]);
      await service.setCategoryOverride(IDS.articleOne, {
        categoryConfigKeys: ['automatic_two'],
      });
      const detail = await service.getArticle(IDS.articleOne);
      assert.equal(detail.sourceDerivedDisplayTitle, 'Concurrent Source title');
      assert.equal(detail.displayTitle, 'Concurrent manual title');
      assert.deepEqual(
        detail.effectiveCategories.map((category) => category.configKey),
        ['automatic_two'],
      );
      assert.equal(detail.observations.length, 1);
    } finally {
      await Promise.all([moderationDatabase.close(), workerDatabase.close()]);
    }
  });
});

async function insertFixture(database: Database): Promise<void> {
  await database.query(
    `INSERT INTO sources (id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state)
     VALUES ($1, 'moderation_source', 'Moderation Source', 'https://moderation.example', 'approved', 'active', 'enabled')`,
    [IDS.source],
  );
  await database.query(
    `INSERT INTO source_endpoints (id, source_id, config_key, endpoint_url, endpoint_type, approval_state, lifecycle_state, operational_state, poll_interval_seconds)
     VALUES ($1, $2, 'feed', 'https://moderation.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300)`,
    [IDS.endpoint, IDS.source],
  );
  await database.query(
    `INSERT INTO collection_runs (id, source_endpoint_id, execution_id, started_at, finished_at, run_status, transport_status, parser_status)
     VALUES ($1, $2, 'run-1', '2026-08-14T00:00:00Z', '2026-08-14T00:01:00Z', 'succeeded', 'succeeded', 'succeeded')`,
    [IDS.run, IDS.endpoint],
  );
  await database.query(
    `INSERT INTO categories (id, config_key, display_name)
     VALUES ($1, 'automatic_one', 'Automatic One'),
            ($2, 'automatic_two', 'Automatic Two'),
            ($3, 'automatic_three', 'Automatic Three')`,
    [IDS.categoryOne, IDS.categoryTwo, IDS.categoryThree],
  );
  await database.query(
    `INSERT INTO articles
       (id, source_id, original_url, canonical_identity_url, display_title,
        normalized_title, author, summary, published_at_status,
        source_updated_at_status, first_seen_at, last_seen_at, visibility_state)
     VALUES
       ($1, $4, 'https://moderation.example/one', 'https://moderation.example/one', 'Source title', 'source title', 'Author', 'Summary', 'missing', 'missing', '2026-08-14T00:00:01Z', '2026-08-14T00:00:01Z', 'visible'),
       ($2, $4, 'https://moderation.example/two', 'https://moderation.example/two', 'Hidden title', 'hidden title', NULL, NULL, 'missing', 'missing', '2026-08-14T00:00:02Z', '2026-08-14T00:00:02Z', 'hidden'),
       ($3, $4, 'https://moderation.example/three', 'https://moderation.example/three', 'Archived title', 'archived title', NULL, NULL, 'missing', 'missing', '2026-08-14T00:00:03Z', '2026-08-14T00:00:03Z', 'archived')`,
    [IDS.articleOne, IDS.articleTwo, IDS.articleThree, IDS.source],
  );
  await database.query(
    `INSERT INTO article_categories (article_id, category_id) VALUES ($1, $2)`,
    [IDS.articleOne, IDS.categoryOne],
  );
  await database.query(
    `INSERT INTO article_observations
       (id, source_id, source_endpoint_id, collection_run_id, article_id,
        observed_at, processing_outcome, observed_external_id,
        observed_canonical_identity_url, reason_code, detail)
     VALUES ($1, $2, $3, $4, $5, '2026-08-14T00:00:01Z', 'created', 'guid-1',
             'https://moderation.example/one', 'default_include', 'Default include')`,
    [IDS.observation, IDS.source, IDS.endpoint, IDS.run, IDS.articleOne],
  );
  await database.query(
    `INSERT INTO article_observation_category_reasons
       (article_observation_id, category_id, reason_position, reason_kind, reason_detail)
     VALUES ($1, $2, 1, 'source_default', 'Source default')`,
    [IDS.observation, IDS.categoryOne],
  );
  await database.transaction(async (transaction) => {
    await transaction.query(
      `INSERT INTO duplicate_groups (id, primary_article_id) VALUES ($1, $2)`,
      [IDS.group, IDS.articleOne],
    );
    await transaction.query(
      `INSERT INTO duplicate_group_memberships (group_id, article_id) VALUES ($1, $2), ($1, $3)`,
      [IDS.group, IDS.articleOne, IDS.articleThree],
    );
  });
  await database.query(
    `INSERT INTO duplicate_review_candidates
       (id, article_low_id, article_high_id, state, origin, confidence, evidence_fingerprint)
     VALUES ($1, $2, $3, 'pending', 'automatic', 100, repeat('a', 64))`,
    [IDS.review, IDS.articleOne, IDS.articleThree],
  );
  await database.query(
    `INSERT INTO duplicate_review_signals
       (candidate_id, signal_order, reason_code, signal_strength)
     VALUES ($1, 1, 'canonical_identity_url_equal', 'strong')`,
    [IDS.review],
  );
}
