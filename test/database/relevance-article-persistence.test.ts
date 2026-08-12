import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { Client, type QueryResultRow } from 'pg';

import {
  ArticlePersistenceError,
  persistExcludedArticleObservation,
  persistIncludedArticle,
  type ArticlePersistenceResult,
  type ArticlePersistenceSuccess,
} from '../../src/articles/repository.ts';
import type { ArticleCandidate } from '../../src/collection/normalization/article-candidate.ts';
import {
  evaluateRelevance,
  type EffectiveRelevanceConfiguration,
  type RelevanceRuleForEvaluation,
} from '../../src/collection/relevance/evaluator.ts';
import {
  createDatabase,
  type Database,
  type QueryExecutor,
} from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

interface Fixture {
  readonly sourceId: string;
  readonly endpointId: string;
  readonly runId: string;
}

const FIRST_OBSERVED_AT = new Date('2026-08-12T10:00:00.000Z');

test('included persistence keeps Source outcomes separate from current Category reconciliation and historical reasons', async () => {
  await withPersistenceDatabase(async ({ database, inspector, fixture }) => {
    const categoryA = await seedCategory(inspector, 'category_a', 'Category A');
    const categoryB = await seedCategory(inspector, 'category_b', 'Category B');
    const includeRule = await seedRule(inspector, {
      configKey: 'include_match',
      action: 'include',
      reason: 'Included by the matching rule',
    });
    const firstCategoryRule = await seedRule(inspector, {
      configKey: 'category_a_first',
      action: 'categorize',
      categoryId: categoryA.id,
      priority: 20,
      reason: 'First Category A reason',
    });
    const secondCategoryRule = await seedRule(inspector, {
      configKey: 'category_a_second',
      action: 'categorize',
      categoryId: categoryA.id,
      priority: 10,
      reason: 'Second Category A reason',
    });
    const categoryBRule = await seedRule(inspector, {
      configKey: 'category_b_rule',
      action: 'categorize',
      categoryId: categoryB.id,
      reason: 'Category B reason',
    });
    const input = candidate(fixture);

    const created = await persistIncludedArticle(
      database,
      input,
      FIRST_OBSERVED_AT,
      evaluateRelevance(
        input,
        configuration([
          evaluationRule(includeRule),
          evaluationRule(firstCategoryRule, categoryA),
          evaluationRule(secondCategoryRule, categoryA),
        ]),
      ),
    );
    assertSuccess(created, 'created');
    assert.equal(created.observation.reasonCode, 'relevance_rule_include');
    assert.equal(created.observation.relevanceRuleId, includeRule.id);
    assert.equal(created.observation.detail, includeRule.reason);
    assert.deepEqual(await memberships(inspector, created.article.id), [
      'category_a',
    ]);
    assert.deepEqual(await categoryReasons(inspector, created.observation.id), [
      {
        reason_position: 1,
        reason_kind: 'rule',
        category_config_key: 'category_a',
        rule_config_key: 'category_a_first',
        reason_detail: 'First Category A reason',
      },
      {
        reason_position: 2,
        reason_kind: 'rule',
        category_config_key: 'category_a',
        rule_config_key: 'category_a_second',
        reason_detail: 'Second Category A reason',
      },
    ]);

    const changed = candidate(fixture, {
      displayTitle: 'Materially updated match title',
      normalizedTitle: 'materially updated match title',
    });
    const updated = await persistIncludedArticle(
      database,
      changed,
      new Date('2026-08-12T11:00:00.000Z'),
      evaluateRelevance(
        changed,
        configuration([
          evaluationRule(includeRule),
          evaluationRule(categoryBRule, categoryB),
        ]),
      ),
    );
    assertSuccess(updated, 'updated');
    assert.equal(updated.article.id, created.article.id);
    assert.deepEqual(await memberships(inspector, created.article.id), [
      'category_b',
    ]);

    const categoryOnlyChange = await persistIncludedArticle(
      database,
      changed,
      new Date('2026-08-12T12:00:00.000Z'),
      evaluateRelevance(
        changed,
        configuration([
          evaluationRule(includeRule),
          evaluationRule(firstCategoryRule, categoryA),
          evaluationRule(secondCategoryRule, categoryA),
        ]),
      ),
    );
    assertSuccess(categoryOnlyChange, 'unchanged');
    assert.deepEqual(await memberships(inspector, created.article.id), [
      'category_a',
    ]);
    assert.equal(
      (await categoryReasons(inspector, categoryOnlyChange.observation.id))
        .length,
      2,
    );

    const cleared = await persistIncludedArticle(
      database,
      changed,
      new Date('2026-08-12T13:00:00.000Z'),
      evaluateRelevance(changed, configuration([evaluationRule(includeRule)])),
    );
    assertSuccess(cleared, 'unchanged');
    assert.deepEqual(await memberships(inspector, created.article.id), []);
    assert.deepEqual(await counts(inspector), {
      articles: 1,
      observations: 4,
      memberships: 0,
      categoryReasons: 5,
    });
  });
});

test('default include and endpoint versus Source fallback reasons persist distinctly', async () => {
  await withPersistenceDatabase(async ({ database, inspector, fixture }) => {
    const endpointCategory = await seedCategory(
      inspector,
      'endpoint_default',
      'Endpoint default',
    );
    const sourceCategory = await seedCategory(
      inspector,
      'source_default',
      'Source default',
    );
    await inspector.query(
      'UPDATE sources SET default_category_id = $2 WHERE id = $1',
      [fixture.sourceId, sourceCategory.id],
    );
    await inspector.query(
      'UPDATE source_endpoints SET default_category_id = $2 WHERE id = $1',
      [fixture.endpointId, endpointCategory.id],
    );
    const input = candidate(fixture);
    const endpointDecision = evaluateRelevance(
      input,
      configuration([], {
        sourceDefaultCategory: categoryIdentity(sourceCategory),
        endpointDefaultCategory: categoryIdentity(endpointCategory),
      }),
    );
    const first = await persistIncludedArticle(
      database,
      input,
      FIRST_OBSERVED_AT,
      endpointDecision,
    );
    assertSuccess(first, 'created');
    assert.equal(first.observation.reasonCode, 'default_include');
    assert.equal(first.observation.relevanceRuleId, undefined);
    assert.equal(first.observation.detail, undefined);
    assert.deepEqual(await categoryReasons(inspector, first.observation.id), [
      {
        reason_position: 1,
        reason_kind: 'endpoint_default',
        category_config_key: 'endpoint_default',
        rule_config_key: null,
        reason_detail: 'Endpoint default',
      },
    ]);

    await inspector.query(
      'UPDATE source_endpoints SET default_category_id = NULL WHERE id = $1',
      [fixture.endpointId],
    );
    const sourceDecision = evaluateRelevance(
      input,
      configuration([], {
        sourceDefaultCategory: categoryIdentity(sourceCategory),
      }),
    );
    const second = await persistIncludedArticle(
      database,
      input,
      new Date('2026-08-12T11:00:00.000Z'),
      sourceDecision,
    );
    assertSuccess(second, 'unchanged');
    assert.deepEqual(await categoryReasons(inspector, second.observation.id), [
      {
        reason_position: 1,
        reason_kind: 'source_default',
        category_config_key: 'source_default',
        rule_config_key: null,
        reason_detail: 'Source default',
      },
    ]);
  });
});

test('observation, membership, and Category-reason failures each roll back the whole included candidate', async () => {
  await withPersistenceDatabase(async ({ database, inspector, fixture }) => {
    const category = await seedCategory(inspector, 'rollback', 'Rollback');
    const categoryRule = await seedRule(inspector, {
      configKey: 'rollback_category',
      action: 'categorize',
      categoryId: category.id,
      reason: 'Rollback reason',
    });
    const input = candidate(fixture);
    const decision = evaluateRelevance(
      input,
      configuration([evaluationRule(categoryRule, category)]),
    );

    for (const target of [
      'article_observations',
      'article_categories',
      'article_observation_category_reasons',
    ] as const) {
      await installFailingInsertTrigger(inspector, target);
      await assert.rejects(
        persistIncludedArticle(database, input, FIRST_OBSERVED_AT, decision),
        boundedTransactionFailure,
      );
      assert.deepEqual(await counts(inspector), {
        articles: 0,
        observations: 0,
        memberships: 0,
        categoryReasons: 0,
      });
      await removeFailingInsertTrigger(inspector, target);
    }
  });
});

test('an observation insertion failure rolls back an unchanged Article touch', async () => {
  await withPersistenceDatabase(async ({ database, inspector, fixture }) => {
    const input = candidate(fixture);
    const created = await persistIncludedArticle(
      database,
      input,
      FIRST_OBSERVED_AT,
      evaluateRelevance(input),
    );
    assertSuccess(created, 'created');
    await installFailingInsertTrigger(inspector, 'article_observations');
    await assert.rejects(
      persistIncludedArticle(
        database,
        input,
        new Date('2026-08-12T11:00:00.000Z'),
        evaluateRelevance(input),
      ),
      boundedTransactionFailure,
    );
    const state = await inspector.query<{ last_seen_at: Date }>(
      'SELECT last_seen_at FROM articles WHERE id = $1',
      [created.article.id],
    );
    assert.equal(
      state.rows[0]?.last_seen_at.toISOString(),
      FIRST_OBSERVED_AT.toISOString(),
    );
    assert.deepEqual(await counts(inspector), {
      articles: 1,
      observations: 1,
      memberships: 0,
      categoryReasons: 0,
    });
  });
});

test('prospective include, recategorize, exclude, and include preserves one Article and exclusion never touches identity', async () => {
  await withPersistenceDatabase(async ({ database, inspector, fixture }) => {
    const categoryA = await seedCategory(inspector, 'category_a', 'Category A');
    const categoryB = await seedCategory(inspector, 'category_b', 'Category B');
    const includeRule = await seedRule(inspector, {
      configKey: 'include_match',
      action: 'include',
      reason: 'Included',
    });
    const excludeRule = await seedRule(inspector, {
      configKey: 'exclude_match',
      action: 'exclude',
      priority: 100,
      reason: 'Excluded prospectively',
    });
    const categoryARule = await seedRule(inspector, {
      configKey: 'category_a_rule',
      action: 'categorize',
      categoryId: categoryA.id,
      reason: 'Category A reason',
    });
    const categoryASecondRule = await seedRule(inspector, {
      configKey: 'category_a_second_rule',
      action: 'categorize',
      categoryId: categoryA.id,
      priority: -1,
      reason: 'Second Category A reason',
    });
    const categoryBRule = await seedRule(inspector, {
      configKey: 'category_b_rule',
      action: 'categorize',
      categoryId: categoryB.id,
      reason: 'Category B reason',
    });
    const input = candidate(fixture);

    const first = await persistIncludedArticle(
      database,
      input,
      FIRST_OBSERVED_AT,
      evaluateRelevance(
        input,
        configuration([
          evaluationRule(includeRule),
          evaluationRule(categoryARule, categoryA),
        ]),
      ),
    );
    assertSuccess(first, 'created');
    const recategorized = await persistIncludedArticle(
      database,
      input,
      new Date('2026-08-12T11:00:00.000Z'),
      evaluateRelevance(
        input,
        configuration([
          evaluationRule(includeRule),
          evaluationRule(categoryBRule, categoryB),
        ]),
      ),
    );
    assertSuccess(recategorized, 'unchanged');
    assert.equal(recategorized.article.id, first.article.id);
    assert.deepEqual(await memberships(inspector, first.article.id), [
      'category_b',
    ]);
    const articleBeforeExclusion = await articleState(inspector);

    const observedQueries: string[] = [];
    const observableDatabase = observeTransactionQueries(
      database,
      observedQueries,
    );
    const exclusionDecision = evaluateRelevance(
      input,
      configuration([
        evaluationRule(excludeRule),
        evaluationRule(categoryARule, categoryA),
        evaluationRule(categoryASecondRule, categoryA),
      ]),
    );
    assert.equal(exclusionDecision.included, false);
    const excluded = await persistExcludedArticleObservation(
      observableDatabase,
      input,
      new Date('2026-08-12T12:00:00.000Z'),
      exclusionDecision,
    );
    assert.equal(excluded.outcome, 'excluded');
    if (excluded.outcome !== 'excluded') return;
    assert.equal(excluded.observation.articleId, undefined);
    assert.equal(excluded.observation.relevanceRuleId, excludeRule.id);
    assert.equal(excluded.observation.reasonCode, 'relevance_rule_exclude');
    assert.deepEqual(await articleState(inspector), articleBeforeExclusion);
    assert.deepEqual(await memberships(inspector, first.article.id), [
      'category_b',
    ]);
    assert.deepEqual(
      await categoryReasons(inspector, excluded.observation.id),
      [
        {
          reason_position: 1,
          reason_kind: 'rule',
          category_config_key: 'category_a',
          rule_config_key: 'category_a_rule',
          reason_detail: 'Category A reason',
        },
        {
          reason_position: 2,
          reason_kind: 'rule',
          category_config_key: 'category_a',
          rule_config_key: 'category_a_second_rule',
          reason_detail: 'Second Category A reason',
        },
      ],
    );
    const forbiddenIdentityQuery = observedQueries.find((sql) =>
      /pg_advisory_xact_lock|\bFROM\s+articles\b|\bINSERT\s+INTO\s+articles\b|\bUPDATE\s+articles\b|article_categories/iu.test(
        sql,
      ),
    );
    assert.equal(forbiddenIdentityQuery, undefined);

    const observationsBeforeMismatch = (await counts(inspector)).observations;
    const badCandidate = candidate(fixture, {
      provenance: { ...input.provenance, collectionRunId: randomUUID() },
    });
    const badDecision = evaluateRelevance(
      badCandidate,
      configuration([evaluationRule(excludeRule)]),
    );
    assert.deepEqual(
      await persistExcludedArticleObservation(
        database,
        badCandidate,
        new Date('2026-08-12T12:30:00.000Z'),
        badDecision,
      ),
      { outcome: 'failed', reason: 'provenance_mismatch' },
    );
    assert.equal(
      (await counts(inspector)).observations,
      observationsBeforeMismatch,
    );

    const includedAgain = await persistIncludedArticle(
      database,
      input,
      new Date('2026-08-12T13:00:00.000Z'),
      evaluateRelevance(
        input,
        configuration([
          evaluationRule(includeRule),
          evaluationRule(categoryARule, categoryA),
        ]),
      ),
    );
    assertSuccess(includedAgain, 'unchanged');
    assert.equal(includedAgain.article.id, first.article.id);
    assert.deepEqual(await memberships(inspector, first.article.id), [
      'category_a',
    ]);
    assert.deepEqual(await counts(inspector), {
      articles: 1,
      observations: 4,
      memberships: 1,
      categoryReasons: 5,
    });
    assert.deepEqual(await categoryReasons(inspector, first.observation.id), [
      {
        reason_position: 1,
        reason_kind: 'rule',
        category_config_key: 'category_a',
        rule_config_key: 'category_a_rule',
        reason_detail: 'Category A reason',
      },
    ]);
  });
});

test('impossible rule provenance rejects and rolls back an otherwise valid candidate', async () => {
  await withPersistenceDatabase(async ({ database, inspector, fixture }) => {
    const input = candidate(fixture);
    const decision = evaluateRelevance(
      input,
      configuration([
        {
          configKey: 'missing_rule',
          predicateType: 'title_contains',
          pattern: 'match',
          action: 'include',
          priority: 0,
          enabled: true,
          reason: 'Missing persisted rule',
        },
      ]),
    );
    await assert.rejects(
      persistIncludedArticle(database, input, FIRST_OBSERVED_AT, decision),
      (error: unknown) => {
        assert.ok(error instanceof ArticlePersistenceError);
        assert.equal(error.reason, 'invalid_relevance_decision');
        return true;
      },
    );
    assert.deepEqual(await counts(inspector), {
      articles: 0,
      observations: 0,
      memberships: 0,
      categoryReasons: 0,
    });
  });
});

interface PersistenceContext {
  readonly database: Database;
  readonly inspector: Client;
  readonly fixture: Fixture;
}

async function withPersistenceDatabase(
  work: (context: PersistenceContext) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    const inspector = new Client({ connectionString: databaseUrl });
    try {
      await inspector.connect();
      const fixture = await createFixture(inspector);
      await work({ database, inspector, fixture });
    } finally {
      await Promise.all([database.close(), inspector.end()]);
    }
  });
}

async function createFixture(client: Client): Promise<Fixture> {
  const fixture = Object.freeze({
    sourceId: randomUUID(),
    endpointId: randomUUID(),
    runId: randomUUID(),
  });
  await client.query(
    `INSERT INTO sources (
       id, config_key, display_name, site_url,
       approval_state, lifecycle_state, operational_state
     ) VALUES ($1, 'source_one', 'Source One', 'https://one.example',
               'approved', 'active', 'enabled')`,
    [fixture.sourceId],
  );
  await client.query(
    `INSERT INTO source_endpoints (
       id, source_id, config_key, endpoint_url, endpoint_type,
       approval_state, lifecycle_state, operational_state, poll_interval_seconds
     ) VALUES ($1, $2, 'feed_one', 'https://one.example/feed', 'rss_atom',
               'approved', 'active', 'enabled', 300)`,
    [fixture.endpointId, fixture.sourceId],
  );
  await client.query(
    `INSERT INTO collection_runs (
       id, source_endpoint_id, execution_id, started_at, finished_at,
       run_status, transport_status, parser_status
     ) VALUES ($1, $2, 'run-one', now(), now(),
               'succeeded', 'not_modified', 'not_run')`,
    [fixture.runId, fixture.endpointId],
  );
  return fixture;
}

interface SeededCategory {
  readonly id: string;
  readonly configKey: string;
  readonly displayName: string;
}

async function seedCategory(
  client: Client,
  configKey: string,
  displayName: string,
): Promise<SeededCategory> {
  const category = Object.freeze({ id: randomUUID(), configKey, displayName });
  await client.query(
    'INSERT INTO categories (id, config_key, display_name) VALUES ($1, $2, $3)',
    [category.id, category.configKey, category.displayName],
  );
  return category;
}

interface SeededRule {
  readonly id: string;
  readonly configKey: string;
  readonly action: 'include' | 'exclude' | 'categorize';
  readonly categoryId: string | undefined;
  readonly priority: number;
  readonly reason: string;
}

async function seedRule(
  client: Client,
  input: Readonly<{
    configKey: string;
    action: SeededRule['action'];
    categoryId?: string;
    priority?: number;
    reason: string;
  }>,
): Promise<SeededRule> {
  const rule = Object.freeze({
    id: randomUUID(),
    configKey: input.configKey,
    action: input.action,
    categoryId: input.categoryId,
    priority: input.priority ?? 0,
    reason: input.reason,
  });
  await client.query(
    `INSERT INTO relevance_rules (
       id, config_key, predicate_type, pattern, action,
       category_id, priority, enabled, reason
     ) VALUES ($1, $2, 'title_contains', 'match', $3, $4, $5, true, $6)`,
    [
      rule.id,
      rule.configKey,
      rule.action,
      rule.categoryId ?? null,
      rule.priority,
      rule.reason,
    ],
  );
  return rule;
}

function evaluationRule(
  rule: SeededRule,
  category?: SeededCategory,
): RelevanceRuleForEvaluation {
  return Object.freeze({
    configKey: rule.configKey,
    predicateType: 'title_contains',
    pattern: 'match',
    action: rule.action,
    priority: rule.priority,
    enabled: true,
    reason: rule.reason,
    ...(category === undefined
      ? {}
      : { categoryTarget: categoryIdentity(category) }),
  });
}

function categoryIdentity(category: SeededCategory) {
  return Object.freeze({
    configKey: category.configKey,
    displayName: category.displayName,
  });
}

function configuration(
  rules: readonly RelevanceRuleForEvaluation[],
  defaults: Omit<EffectiveRelevanceConfiguration, 'rules'> = {},
): EffectiveRelevanceConfiguration {
  return Object.freeze({ rules: Object.freeze([...rules]), ...defaults });
}

function candidate(
  fixture: Fixture,
  overrides: Readonly<{
    displayTitle?: string;
    normalizedTitle?: string;
    provenance?: ArticleCandidate['provenance'];
  }> = {},
): ArticleCandidate {
  return Object.freeze({
    externalId: 'article-one',
    displayTitle: overrides.displayTitle ?? 'Match title',
    normalizedTitle: overrides.normalizedTitle ?? 'match title',
    originalUrl: 'https://one.example/article-one',
    canonicalIdentityUrl: 'https://one.example/article-one',
    author: 'Author',
    summary: 'Summary',
    language: 'en',
    publishedAt: Object.freeze({
      status: 'missing' as const,
      fallback: 'first_seen' as const,
    }),
    updatedAt: Object.freeze({ status: 'missing' as const }),
    provenance:
      overrides.provenance ??
      Object.freeze({
        sourceId: fixture.sourceId,
        sourceEndpointId: fixture.endpointId,
        collectionRunId: fixture.runId,
      }),
  });
}

async function memberships(
  client: Client,
  articleId: string,
): Promise<string[]> {
  const result = await client.query<{ config_key: string }>(
    `SELECT category.config_key
     FROM article_categories membership
     JOIN categories category ON category.id = membership.category_id
     WHERE membership.article_id = $1
     ORDER BY category.config_key`,
    [articleId],
  );
  return result.rows.map((row) => row.config_key);
}

interface CategoryReasonRow {
  readonly reason_position: number;
  readonly reason_kind: string;
  readonly category_config_key: string;
  readonly rule_config_key: string | null;
  readonly reason_detail: string;
}

async function categoryReasons(
  client: Client,
  observationId: string,
): Promise<CategoryReasonRow[]> {
  const result = await client.query<CategoryReasonRow>(
    `SELECT reason.reason_position, reason.reason_kind,
            category.config_key AS category_config_key,
            rule.config_key AS rule_config_key,
            reason.reason_detail
     FROM article_observation_category_reasons reason
     JOIN categories category ON category.id = reason.category_id
     LEFT JOIN relevance_rules rule ON rule.id = reason.relevance_rule_id
     WHERE reason.article_observation_id = $1
     ORDER BY reason.reason_position`,
    [observationId],
  );
  return result.rows;
}

async function counts(client: Client): Promise<{
  articles: number;
  observations: number;
  memberships: number;
  categoryReasons: number;
}> {
  const result = await client.query<{
    articles: string;
    observations: string;
    memberships: string;
    category_reasons: string;
  }>(
    `SELECT (SELECT count(*) FROM articles) AS articles,
            (SELECT count(*) FROM article_observations) AS observations,
            (SELECT count(*) FROM article_categories) AS memberships,
            (SELECT count(*) FROM article_observation_category_reasons) AS category_reasons`,
  );
  const row = result.rows[0]!;
  return {
    articles: Number(row.articles),
    observations: Number(row.observations),
    memberships: Number(row.memberships),
    categoryReasons: Number(row.category_reasons),
  };
}

async function articleState(client: Client): Promise<readonly unknown[]> {
  const result = await client.query(
    `SELECT id, source_id, external_id, original_url, canonical_identity_url,
            display_title, normalized_title, author, summary, image_url,
            language, published_at_status, published_at,
            source_updated_at_status, source_updated_at, visibility_state,
            first_seen_at, last_seen_at, created_at, updated_at
     FROM articles
     ORDER BY id`,
  );
  return result.rows;
}

function observeTransactionQueries(
  database: Pick<Database, 'transaction'>,
  queries: string[],
): Pick<Database, 'transaction'> {
  return {
    transaction: <T>(work: (executor: QueryExecutor) => Promise<T>) =>
      database.transaction((executor) =>
        work({
          query: async <Row extends QueryResultRow = QueryResultRow>(
            sql: string,
            values?: readonly unknown[],
          ) => {
            queries.push(sql);
            return executor.query<Row>(sql, values);
          },
        }),
      ),
  };
}

async function installFailingInsertTrigger(
  client: Client,
  table: string,
): Promise<void> {
  await client.query(
    `CREATE OR REPLACE FUNCTION fail_p5_insert()
     RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN
       RAISE EXCEPTION 'synthetic P5 insert failure';
     END;
     $$;
     CREATE TRIGGER fail_p5_insert
     BEFORE INSERT ON ${table}
     FOR EACH ROW EXECUTE FUNCTION fail_p5_insert()`,
  );
}

async function removeFailingInsertTrigger(
  client: Client,
  table: string,
): Promise<void> {
  await client.query(
    `DROP TRIGGER fail_p5_insert ON ${table};
     DROP FUNCTION fail_p5_insert()`,
  );
}

function boundedTransactionFailure(error: unknown): boolean {
  assert.ok(error instanceof ArticlePersistenceError);
  assert.equal(error.reason, 'transaction_failed');
  assert.equal(
    error.message,
    'Article persistence failed: transaction_failed.',
  );
  return true;
}

function assertSuccess(
  result: ArticlePersistenceResult,
  outcome: 'created' | 'updated' | 'unchanged',
): asserts result is ArticlePersistenceSuccess {
  assert.equal(result.outcome, outcome);
}
