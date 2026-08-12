import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { Client } from 'pg';

import { migrateDatabase } from '../../src/database/migrations.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

test('Phase 11 Category and Relevance schema enforces canonical configuration and provenance relationships', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      const fixture = await createFixture(client);

      const categoryOne = await insertCategory(client, 'industry_news');
      const categoryTwo = await insertCategory(client, 'author_business');
      await rejects(client, () => insertCategory(client, 'industry_news'));
      await rejects(client, () => insertCategory(client, 'Uppercase'));
      await rejects(client, () => insertCategory(client, 'a'.repeat(101)));
      await rejects(client, () =>
        client.query(
          `UPDATE categories SET config_key = 'renamed' WHERE id = $1`,
          [categoryOne],
        ),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE categories SET display_name = ' Invalid ' WHERE id = $1`,
          [categoryOne],
        ),
      );
      await rejects(client, () =>
        client.query(`UPDATE categories SET display_name = $1 WHERE id = $2`, [
          'a'.repeat(201),
          categoryOne,
        ]),
      );

      const categorizeRuleOne = await insertRule(client, {
        configKey: 'industry_category',
        action: 'categorize',
        categoryId: categoryOne,
      });
      const categorizeRuleTwo = await insertRule(client, {
        configKey: 'second_industry_category',
        action: 'categorize',
        categoryId: categoryOne,
        priority: 20,
      });
      await insertRule(client, {
        configKey: 'include_title',
        action: 'include',
        predicateType: 'title_contains',
      });
      await insertRule(client, {
        configKey: 'exclude_summary',
        action: 'exclude',
        predicateType: 'summary_contains',
        sourceId: fixture.sourceId,
      });
      await insertRule(client, {
        configKey: 'source_category',
        action: 'include',
        predicateType: 'source_category_equals',
      });

      await rejects(client, () =>
        insertRule(client, {
          configKey: 'industry_category',
          action: 'include',
        }),
      );
      await rejects(client, () =>
        insertRule(client, { configKey: 'Uppercase', action: 'include' }),
      );
      await rejects(client, () =>
        insertRule(client, {
          configKey: 'bad_predicate',
          action: 'include',
          predicateType: 'regex',
        }),
      );
      await rejects(client, () =>
        insertRule(client, { configKey: 'bad_action', action: 'boost' }),
      );
      await rejects(client, () =>
        insertRule(client, {
          configKey: 'blank_pattern',
          action: 'include',
          pattern: ' ',
        }),
      );
      await rejects(client, () =>
        insertRule(client, {
          configKey: 'padded_pattern',
          action: 'include',
          pattern: ' literal ',
        }),
      );
      await rejects(client, () =>
        insertRule(client, {
          configKey: 'long_pattern',
          action: 'include',
          pattern: 'a'.repeat(2001),
        }),
      );
      await rejects(client, () =>
        insertRule(client, {
          configKey: 'blank_reason',
          action: 'include',
          reason: ' ',
        }),
      );
      await rejects(client, () =>
        insertRule(client, {
          configKey: 'padded_reason',
          action: 'include',
          reason: ' Reason ',
        }),
      );
      await rejects(client, () =>
        insertRule(client, {
          configKey: 'long_reason',
          action: 'include',
          reason: 'a'.repeat(161),
        }),
      );
      await rejects(client, () =>
        insertRule(client, {
          configKey: 'missing_category',
          action: 'categorize',
        }),
      );
      await rejects(client, () =>
        insertRule(client, {
          configKey: 'include_category',
          action: 'include',
          categoryId: categoryOne,
        }),
      );
      await rejects(client, () =>
        insertRule(client, {
          configKey: 'exclude_category',
          action: 'exclude',
          categoryId: categoryOne,
        }),
      );
      await rejects(client, () =>
        insertRule(client, {
          configKey: 'orphan_source',
          action: 'include',
          sourceId: randomUUID(),
        }),
      );
      await rejects(client, () =>
        insertRule(client, {
          configKey: 'orphan_category',
          action: 'categorize',
          categoryId: randomUUID(),
        }),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE relevance_rules SET config_key = 'renamed' WHERE id = $1`,
          [categorizeRuleOne],
        ),
      );

      await client.query(
        'UPDATE sources SET default_category_id = $1 WHERE id = $2',
        [categoryOne, fixture.sourceId],
      );
      await client.query(
        'UPDATE source_endpoints SET default_category_id = $1 WHERE id = $2',
        [categoryTwo, fixture.endpointId],
      );
      await rejects(client, () =>
        client.query(
          'UPDATE sources SET default_category_id = $1 WHERE id = $2',
          [randomUUID(), fixture.sourceId],
        ),
      );
      await rejects(client, () =>
        client.query(
          'UPDATE source_endpoints SET default_category_id = $1 WHERE id = $2',
          [randomUUID(), fixture.endpointId],
        ),
      );

      await client.query(
        'INSERT INTO article_categories (article_id, category_id) VALUES ($1, $2)',
        [fixture.articleId, categoryOne],
      );
      await rejects(client, () =>
        client.query(
          'INSERT INTO article_categories (article_id, category_id) VALUES ($1, $2)',
          [fixture.articleId, categoryOne],
        ),
      );
      await rejects(client, () =>
        client.query(
          'INSERT INTO article_categories (article_id, category_id) VALUES ($1, $2)',
          [randomUUID(), categoryOne],
        ),
      );
      await rejects(client, () =>
        client.query(
          'INSERT INTO article_categories (article_id, category_id) VALUES ($1, $2)',
          [fixture.articleId, randomUUID()],
        ),
      );

      await client.query(
        `UPDATE article_observations
         SET relevance_rule_id = $1
         WHERE id = $2`,
        [categorizeRuleOne, fixture.observationId],
      );
      await rejects(client, () =>
        client.query(
          `UPDATE article_observations
           SET relevance_rule_id = $1
           WHERE id = $2`,
          [randomUUID(), fixture.observationId],
        ),
      );

      await insertCategoryReason(client, {
        observationId: fixture.observationId,
        categoryId: categoryOne,
        relevanceRuleId: categorizeRuleOne,
        position: 1,
        kind: 'rule',
      });
      await insertCategoryReason(client, {
        observationId: fixture.observationId,
        categoryId: categoryOne,
        relevanceRuleId: categorizeRuleTwo,
        position: 2,
        kind: 'rule',
      });
      await insertCategoryReason(client, {
        observationId: fixture.observationId,
        categoryId: categoryTwo,
        position: 3,
        kind: 'endpoint_default',
      });
      await client.query(
        `UPDATE relevance_rules
         SET category_id = $1, updated_at = now()
         WHERE id = $2`,
        [categoryTwo, categorizeRuleOne],
      );
      const historicalReason = await client.query<{
        category_id: string;
        relevance_rule_id: string;
      }>(
        `SELECT category_id, relevance_rule_id
         FROM article_observation_category_reasons
         WHERE article_observation_id = $1 AND reason_position = 1`,
        [fixture.observationId],
      );
      assert.deepEqual(historicalReason.rows, [
        { category_id: categoryOne, relevance_rule_id: categorizeRuleOne },
      ]);
      await rejects(client, () =>
        insertCategoryReason(client, {
          observationId: fixture.observationId,
          categoryId: categoryOne,
          relevanceRuleId: categorizeRuleTwo,
          position: 1,
          kind: 'rule',
        }),
      );
      await rejects(client, () =>
        insertCategoryReason(client, {
          observationId: randomUUID(),
          categoryId: categoryOne,
          position: 4,
          kind: 'source_default',
        }),
      );
      await rejects(client, () =>
        insertCategoryReason(client, {
          observationId: fixture.observationId,
          categoryId: randomUUID(),
          position: 4,
          kind: 'source_default',
        }),
      );
      await rejects(client, () =>
        insertCategoryReason(client, {
          observationId: fixture.observationId,
          categoryId: categoryOne,
          relevanceRuleId: randomUUID(),
          position: 4,
          kind: 'rule',
        }),
      );
      await rejects(client, () =>
        insertCategoryReason(client, {
          observationId: fixture.observationId,
          categoryId: categoryOne,
          relevanceRuleId: categorizeRuleOne,
          position: 4,
          kind: 'rule',
        }),
      );
      await rejects(client, () =>
        insertCategoryReason(client, {
          observationId: fixture.observationId,
          categoryId: categoryTwo,
          position: 0,
          kind: 'source_default',
        }),
      );
    } finally {
      await client.end();
    }
  });
});

async function createFixture(client: Client): Promise<Fixture> {
  const fixture: Fixture = {
    sourceId: randomUUID(),
    endpointId: randomUUID(),
    runId: randomUUID(),
    articleId: randomUUID(),
    observationId: randomUUID(),
  };
  await client.query(
    `INSERT INTO sources (
       id, config_key, display_name, site_url,
       approval_state, lifecycle_state, operational_state
     ) VALUES ($1, 'fixture_source', 'Fixture Source', 'https://fixture.example', 'approved', 'active', 'enabled')`,
    [fixture.sourceId],
  );
  await client.query(
    `INSERT INTO source_endpoints (
       id, source_id, config_key, endpoint_url, endpoint_type,
       approval_state, lifecycle_state, operational_state, poll_interval_seconds
     ) VALUES ($1, $2, 'fixture_feed', 'https://fixture.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300)`,
    [fixture.endpointId, fixture.sourceId],
  );
  await client.query(
    `INSERT INTO collection_runs (
       id, source_endpoint_id, execution_id, started_at, finished_at,
       run_status, transport_status, parser_status
     ) VALUES ($1, $2, 'fixture-run', now(), now(), 'succeeded', 'not_modified', 'not_run')`,
    [fixture.runId, fixture.endpointId],
  );
  await client.query(
    `INSERT INTO articles (
       id, source_id, original_url, canonical_identity_url,
       display_title, normalized_title, published_at_status,
       source_updated_at_status, first_seen_at, last_seen_at
     ) VALUES ($1, $2, 'https://fixture.example/articles/one', 'https://fixture.example/articles/one', 'Fixture Article', 'fixture article', 'missing', 'missing', now(), now())`,
    [fixture.articleId, fixture.sourceId],
  );
  await client.query(
    `INSERT INTO article_observations (
       id, source_id, source_endpoint_id, collection_run_id,
       article_id, processing_outcome
     ) VALUES ($1, $2, $3, $4, $5, 'created')`,
    [
      fixture.observationId,
      fixture.sourceId,
      fixture.endpointId,
      fixture.runId,
      fixture.articleId,
    ],
  );
  return fixture;
}

async function insertCategory(
  client: Client,
  configKey: string,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO categories (id, config_key, display_name)
     VALUES ($1, $2, 'Category Name')`,
    [id, configKey],
  );
  return id;
}

async function insertRule(
  client: Client,
  options: {
    configKey: string;
    action: string;
    predicateType?: string;
    pattern?: string;
    reason?: string;
    sourceId?: string;
    categoryId?: string;
    priority?: number;
  },
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO relevance_rules (
       id, config_key, source_id, predicate_type, pattern,
       action, category_id, priority, reason
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      options.configKey,
      options.sourceId ?? null,
      options.predicateType ?? 'title_contains',
      options.pattern ?? 'literal',
      options.action,
      options.categoryId ?? null,
      options.priority ?? 10,
      options.reason ?? 'Rule reason',
    ],
  );
  return id;
}

async function insertCategoryReason(
  client: Client,
  options: {
    observationId: string;
    categoryId: string;
    relevanceRuleId?: string;
    position: number;
    kind: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO article_observation_category_reasons (
       article_observation_id, category_id, relevance_rule_id,
       reason_position, reason_kind, reason_detail
     ) VALUES ($1, $2, $3, $4, $5, 'Category reason')`,
    [
      options.observationId,
      options.categoryId,
      options.relevanceRuleId ?? null,
      options.position,
      options.kind,
    ],
  );
}

async function rejects(
  client: Client,
  operation: () => Promise<unknown>,
): Promise<void> {
  await assert.rejects(operation);
  await client.query('SELECT 1');
}

interface Fixture {
  readonly sourceId: string;
  readonly endpointId: string;
  readonly runId: string;
  readonly articleId: string;
  readonly observationId: string;
}
