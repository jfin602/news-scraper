import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { after, test } from 'node:test';

import {
  lockModeratedArticle,
  readModeratedArticle,
  readModeratedArticles,
} from '../../src/articles/moderation-repository.ts';
import {
  createDatabase,
  type QueryExecutor,
} from '../../src/database/database.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const scope = createDatabaseTestScope('migrated');

after(async () => scope.dispose());

test('hydrates Category bundles in a constant number of queries and preserves effective values', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await insertFixture(database);
      const small = await readPage(database, 1);
      const large = await readPage(database, 100);

      assert.equal(small.result.articles.length, 1);
      assert.equal(large.result.articles.length, 100);
      assert.equal(small.queryCount, 2);
      assert.equal(large.queryCount, small.queryCount);
      const manual = large.result.articles.find(
        (article) => article.articleId === articleId(1),
      );
      const emptyManual = large.result.articles.find(
        (article) => article.articleId === articleId(2),
      );
      const automatic = large.result.articles.find(
        (article) => article.articleId === articleId(3),
      );
      assert.deepEqual(
        manual?.automaticCategories.map((category) => category.configKey),
        ['automatic_two'],
      );
      assert.deepEqual(
        manual?.effectiveCategories.map((category) => category.configKey),
        ['manual_one'],
      );
      assert.equal(emptyManual?.manualCategoryOverride.active, true);
      assert.deepEqual(emptyManual?.effectiveCategories, []);
      assert.deepEqual(
        automatic?.effectiveCategories.map((category) => category.configKey),
        ['automatic_two'],
      );
      console.info(
        `moderation Category hydration: ${large.queryCount} queries in ${large.elapsedMilliseconds.toFixed(2)} ms for 100 Articles`,
      );

      const detail = await readModeratedArticle(database, articleId(2));
      assert.equal(detail?.manualCategoryOverride.active, true);
      assert.deepEqual(detail?.effectiveCategories, []);
      const locked = await database.transaction((transaction) =>
        lockModeratedArticle(transaction, articleId(2)),
      );
      assert.equal(locked?.manualCategoryOverride.active, true);
      assert.deepEqual(locked?.effectiveCategories, []);
    } finally {
      await database.close();
    }
  });
});

async function readPage(database: QueryExecutor, pageSize: number) {
  const executor = new CountingExecutor(database);
  const startedAt = performance.now();
  const result = await readModeratedArticles(executor, {
    criteria: { pageSize },
  });
  return {
    result,
    queryCount: executor.queryCount,
    elapsedMilliseconds: performance.now() - startedAt,
  };
}

class CountingExecutor implements QueryExecutor {
  queryCount = 0;
  private readonly delegate: QueryExecutor;

  constructor(delegate: QueryExecutor) {
    this.delegate = delegate;
  }

  query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ) {
    this.queryCount += 1;
    return this.delegate.query<Row>(text, values);
  }
}

async function insertFixture(executor: QueryExecutor): Promise<void> {
  await executor.query(
    `INSERT INTO sources
       (id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state)
     VALUES
       ('81000000-0000-4000-8000-000000000001', 'hydration_source', 'Hydration Source',
        'https://hydration.example', 'approved', 'active', 'enabled')`,
  );
  await executor.query(
    `INSERT INTO categories (id, config_key, display_name)
     VALUES
       ('83000000-0000-4000-8000-000000000001', 'automatic_one', 'Automatic one'),
       ('83000000-0000-4000-8000-000000000002', 'manual_one', 'Manual one'),
       ('83000000-0000-4000-8000-000000000003', 'automatic_two', 'Automatic two')`,
  );
  await executor.query(
    `INSERT INTO articles
       (id, source_id, original_url, canonical_identity_url, display_title, normalized_title,
        published_at_status, source_updated_at_status, first_seen_at, last_seen_at, visibility_state)
     SELECT
       format('82000000-0000-4000-8000-%s', lpad(to_hex(article_number), 12, '0'))::uuid,
       '81000000-0000-4000-8000-000000000001'::uuid,
       format('https://hydration.example/articles/%s', article_number),
       format('https://hydration.example/articles/%s', article_number),
       format('Hydration Article %s', article_number),
       format('hydration article %s', article_number),
       'missing', 'missing',
       timestamp '2026-08-15T00:00:00Z' + article_number * interval '1 second',
       timestamp '2026-08-15T00:00:00Z' + article_number * interval '1 second',
       'visible'
     FROM generate_series(1, 100) AS article_number`,
  );
  await executor.query(
    `INSERT INTO article_categories (article_id, category_id)
     SELECT
       format('82000000-0000-4000-8000-%s', lpad(to_hex(article_number), 12, '0'))::uuid,
       CASE WHEN article_number % 2 = 0
            THEN '83000000-0000-4000-8000-000000000001'::uuid
            ELSE '83000000-0000-4000-8000-000000000003'::uuid
       END
     FROM generate_series(1, 100) AS article_number`,
  );
  await executor.query(
    `INSERT INTO article_category_overrides (article_id)
     SELECT format('82000000-0000-4000-8000-%s', lpad(to_hex(article_number), 12, '0'))::uuid
     FROM generate_series(1, 100) AS article_number
     WHERE article_number % 4 IN (1, 2)`,
  );
  await executor.query(
    `INSERT INTO article_category_override_memberships (article_id, category_id)
     SELECT
       format('82000000-0000-4000-8000-%s', lpad(to_hex(article_number), 12, '0'))::uuid,
       '83000000-0000-4000-8000-000000000002'::uuid
     FROM generate_series(1, 100) AS article_number
     WHERE article_number % 4 = 1`,
  );
}

function articleId(articleNumber: number): string {
  return `82000000-0000-4000-8000-${articleNumber.toString(16).padStart(12, '0')}`;
}
