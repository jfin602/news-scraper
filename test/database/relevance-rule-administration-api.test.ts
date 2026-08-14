import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { createEditorialAdministrationService } from '../../src/admin/editorial-administration.ts';
import { createWebApp } from '../../src/app/web/create-app.ts';
import {
  ADMIN_REQUEST_HEADER,
  ADMIN_REQUEST_HEADER_VALUE,
} from '../../src/app/web/admin-router.ts';
import { registerEditorialAdministrationRoutes } from '../../src/app/web/editorial-administration-router.ts';
import { startWebServer } from '../../src/app/web/server.ts';
import {
  createCategory,
  createRelevanceRule,
} from '../../src/collection/relevance/repository.ts';
import { createDatabase } from '../../src/database/database.ts';
import {
  insertSource,
  insertSourceEndpoint,
} from '../../src/sources/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

test('Relevance-rule admin API exposes the bounded rule model and mutations', async () => {
  await withRuleAdmin(async ({ baseUrl, database }) => {
    const category = await createCategory(database, {
      configKey: 'industry_news',
      displayName: 'Industry News',
    });
    await insertSource(database, sourceInput('publisher'));

    const missingIntegrity = await fetch(
      `${baseUrl}/api/admin/relevance-rules`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleInput()),
      },
    );
    assert.equal(missingIntegrity.status, 403);

    const invalid = await postRule(baseUrl, {
      ...ruleInput(),
      configKey: 'invalid_rule',
      futureField: true,
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: 'invalid_request' });

    const created = await postRule(baseUrl, {
      ...ruleInput(),
      configKey: 'source_category_rule',
      predicateType: 'source_category_equals',
      pattern: 'industry',
      action: 'categorize',
      sourceConfigKey: 'publisher',
      categoryConfigKey: category.configKey,
    });
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), {
      relevanceRule: {
        configKey: 'source_category_rule',
        predicateType: 'source_category_equals',
        pattern: 'industry',
        action: 'categorize',
        priority: 10,
        enabled: true,
        reason: 'Rule reason',
        sourceConfigKey: 'publisher',
        categoryConfigKey: 'industry_news',
      },
    });

    for (const [configKey, predicateType, action] of [
      ['title_rule', 'title_contains', 'include'],
      ['summary_rule', 'summary_contains', 'exclude'],
    ] as const) {
      const response = await postRule(baseUrl, {
        ...ruleInput(),
        configKey,
        predicateType,
        action,
      });
      assert.equal(response.status, 201);
    }

    const duplicate = await postRule(baseUrl, {
      ...ruleInput(),
      configKey: 'title_rule',
    });
    assert.equal(duplicate.status, 409);
    assert.deepEqual(await duplicate.json(), {
      error: 'relevance_rule_config_key_conflict',
    });

    const list = await fetch(`${baseUrl}/api/admin/relevance-rules`);
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), {
      relevanceRules: [
        {
          configKey: 'source_category_rule',
          predicateType: 'source_category_equals',
          pattern: 'industry',
          action: 'categorize',
          priority: 10,
          enabled: true,
          reason: 'Rule reason',
          sourceConfigKey: 'publisher',
          categoryConfigKey: 'industry_news',
        },
        {
          configKey: 'summary_rule',
          predicateType: 'summary_contains',
          pattern: 'literal',
          action: 'exclude',
          priority: 10,
          enabled: true,
          reason: 'Rule reason',
        },
        {
          configKey: 'title_rule',
          predicateType: 'title_contains',
          pattern: 'literal',
          action: 'include',
          priority: 10,
          enabled: true,
          reason: 'Rule reason',
        },
      ],
    });

    const detail = await fetch(
      `${baseUrl}/api/admin/relevance-rules/title_rule`,
    );
    assert.equal(detail.status, 200);
    assert.deepEqual(await detail.json(), {
      relevanceRule: {
        configKey: 'title_rule',
        predicateType: 'title_contains',
        pattern: 'literal',
        action: 'include',
        priority: 10,
        enabled: true,
        reason: 'Rule reason',
      },
    });

    const immutable = await putRule(baseUrl, 'title_rule', {
      ...ruleInput(),
      configKey: 'renamed',
    });
    assert.equal(immutable.status, 400);
    assert.deepEqual(await immutable.json(), { error: 'invalid_request' });

    const updated = await putRule(baseUrl, 'title_rule', {
      predicateType: 'summary_contains',
      pattern: 'updated',
      action: 'exclude',
      priority: 20,
      enabled: true,
      reason: 'Updated reason',
    });
    assert.equal(updated.status, 200);
    assert.deepEqual(await updated.json(), {
      relevanceRule: {
        configKey: 'title_rule',
        predicateType: 'summary_contains',
        pattern: 'updated',
        action: 'exclude',
        priority: 20,
        enabled: true,
        reason: 'Updated reason',
      },
    });

    const disabled = await fetch(
      `${baseUrl}/api/admin/relevance-rules/title_rule/enabled`,
      {
        method: 'PUT',
        headers: adminJsonHeaders(),
        body: JSON.stringify({ enabled: false }),
      },
    );
    assert.equal(disabled.status, 200);
    assert.equal((await disabled.json()).relevanceRule.enabled, false);

    const invalidEnabled = await fetch(
      `${baseUrl}/api/admin/relevance-rules/title_rule/enabled`,
      {
        method: 'PUT',
        headers: adminJsonHeaders(),
        body: JSON.stringify({ enabled: false, extra: true }),
      },
    );
    assert.equal(invalidEnabled.status, 400);
    assert.deepEqual(await invalidEnabled.json(), {
      error: 'invalid_request',
    });

    const unknown = await fetch(
      `${baseUrl}/api/admin/relevance-rules/missing_rule`,
    );
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), {
      error: 'relevance_rule_not_found',
    });

    const deleted = await fetch(
      `${baseUrl}/api/admin/relevance-rules/title_rule`,
      { method: 'DELETE', headers: adminJsonHeaders(), body: '{}' },
    );
    assert.equal(deleted.status, 204);
    assert.equal(
      (
        await database.query(
          'SELECT count(*)::int AS count FROM relevance_rules WHERE config_key = $1',
          ['title_rule'],
        )
      ).rows[0]?.count,
      0,
    );
  });
});

test('Relevance-rule admin validates real Source and Category relationships and rolls back', async () => {
  await withRuleAdmin(async ({ baseUrl, database }) => {
    await insertSource(database, sourceInput('publisher'));
    for (const [input, error] of [
      [
        {
          ...ruleInput(),
          configKey: 'missing_source_rule',
          sourceConfigKey: 'missing_source',
        },
        'relevance_rule_source_not_found',
      ],
      [
        {
          ...ruleInput(),
          configKey: 'missing_category_rule',
          action: 'categorize',
          categoryConfigKey: 'missing_category',
        },
        'relevance_rule_category_not_found',
      ],
      [
        {
          ...ruleInput(),
          configKey: 'missing_target_rule',
          action: 'categorize',
        },
        'relevance_rule_action_target_incompatible',
      ],
      [
        {
          ...ruleInput(),
          configKey: 'unexpected_target_rule',
          categoryConfigKey: 'missing_category',
        },
        'relevance_rule_action_target_incompatible',
      ],
    ] as const) {
      const response = await postRule(baseUrl, input);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error });
    }
    assert.equal(
      (
        await database.query(
          'SELECT count(*)::int AS count FROM relevance_rules',
        )
      ).rows[0]?.count,
      0,
    );
  });
});

test('Relevance-rule removal rejects retained winning and categorization provenance without rewriting it', async () => {
  await withRuleAdmin(async ({ baseUrl, database }) => {
    const source = await insertSource(database, sourceInput('publisher'));
    const endpoint = await insertSourceEndpoint(database, source.id, {
      configKey: 'main_feed',
      endpointUrl: 'https://publisher.example/feed.xml',
      endpointType: 'rss_atom',
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
      pollIntervalSeconds: 300,
    });
    const category = await createCategory(database, {
      configKey: 'industry_news',
      displayName: 'Industry News',
    });
    const retained = await seedRetainedObservation(
      database,
      source.id,
      endpoint.id,
    );

    const winningRule = await createRelevanceRule(database, {
      ...ruleInput({
        configKey: 'winning_rule',
        action: 'exclude',
      }),
    });
    await database.query(
      'UPDATE article_observations SET relevance_rule_id = $1 WHERE id = $2',
      [winningRule.id, retained.observationId],
    );
    await assertRuleInUse(baseUrl, 'winning_rule');
    assert.equal(
      (
        await database.query(
          'SELECT relevance_rule_id FROM article_observations WHERE id = $1',
          [retained.observationId],
        )
      ).rows[0]?.relevance_rule_id,
      winningRule.id,
    );
    await database.query(
      'UPDATE article_observations SET relevance_rule_id = NULL WHERE id = $1',
      [retained.observationId],
    );

    const categoryRule = await createRelevanceRule(database, {
      ...ruleInput({
        configKey: 'category_rule',
        action: 'categorize',
        categoryConfigKey: category.configKey,
      }),
    });
    await database.query(
      `INSERT INTO article_observation_category_reasons (
         article_observation_id, category_id, relevance_rule_id,
         reason_position, reason_kind, reason_detail
       ) VALUES ($1, $2, $3, 1, 'rule', 'Retained rule reason')`,
      [retained.observationId, category.id, categoryRule.id],
    );
    await assertRuleInUse(baseUrl, 'category_rule');
    assert.equal(
      (
        await database.query(
          'SELECT count(*)::int AS count FROM article_observation_category_reasons WHERE relevance_rule_id = $1',
          [categoryRule.id],
        )
      ).rows[0]?.count,
      1,
    );
    await database.query(
      'DELETE FROM article_observation_category_reasons WHERE article_observation_id = $1',
      [retained.observationId],
    );

    const deleted = await fetch(
      `${baseUrl}/api/admin/relevance-rules/category_rule`,
      { method: 'DELETE', headers: adminJsonHeaders(), body: '{}' },
    );
    assert.equal(deleted.status, 204);
    assert.equal(
      (
        await database.query(
          'SELECT count(*)::int AS count FROM relevance_rules WHERE id = $1',
          [categoryRule.id],
        )
      ).rows[0]?.count,
      0,
    );
    assert.equal(
      (
        await database.query(
          'SELECT count(*)::int AS count FROM article_observations WHERE id = $1',
          [retained.observationId],
        )
      ).rows[0]?.count,
      1,
    );
  });
});

async function withRuleAdmin(
  work: (context: {
    database: ReturnType<typeof createDatabase>;
    baseUrl: string;
  }) => Promise<void>,
): Promise<void> {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    const routes = registerEditorialAdministrationRoutes(
      createEditorialAdministrationService(database),
    );
    const server = await startWebServer(
      createWebApp(
        {
          readiness: { checkReady: async () => true },
          publicFeed: { read: async () => undefined },
        },
        { adminEnabled: true, registerAdminApiRoutes: routes },
      ),
      { host: '127.0.0.1', port: 0 },
    );
    try {
      await work({
        database,
        baseUrl: `http://${server.host}:${String(server.port)}`,
      });
    } finally {
      await server.close();
      await database.close();
    }
  });
}

async function postRule(baseUrl: string, input: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/admin/relevance-rules`, {
    method: 'POST',
    headers: adminJsonHeaders(),
    body: JSON.stringify(input),
  });
}

async function putRule(
  baseUrl: string,
  configKey: string,
  input: Record<string, unknown>,
) {
  return fetch(
    `${baseUrl}/api/admin/relevance-rules/${configKey}/configuration`,
    {
      method: 'PUT',
      headers: adminJsonHeaders(),
      body: JSON.stringify(input),
    },
  );
}

async function assertRuleInUse(
  baseUrl: string,
  configKey: string,
): Promise<void> {
  const response = await fetch(
    `${baseUrl}/api/admin/relevance-rules/${configKey}`,
    { method: 'DELETE', headers: adminJsonHeaders(), body: '{}' },
  );
  assert.equal(response.status, 409);
  const body = await response.text();
  assert.equal(body, JSON.stringify({ error: 'relevance_rule_in_use' }));
  assert.doesNotMatch(body, /constraint|foreign|SELECT|uuid/iu);
}

function adminJsonHeaders(): Record<string, string> {
  return {
    [ADMIN_REQUEST_HEADER]: ADMIN_REQUEST_HEADER_VALUE,
    'Content-Type': 'application/json',
  };
}

function sourceInput(configKey: string) {
  return {
    configKey,
    displayName: 'Publisher',
    siteUrl: 'https://publisher.example/about',
    approvalState: 'approved' as const,
    lifecycleState: 'active' as const,
    operationalState: 'enabled' as const,
    domainRules: [{ hostname: 'publisher.example' }],
  };
}

function ruleInput(overrides: Record<string, unknown> = {}) {
  return {
    configKey: 'literal_rule',
    predicateType: 'title_contains',
    pattern: 'literal',
    action: 'include',
    priority: 10,
    enabled: true,
    reason: 'Rule reason',
    ...overrides,
  };
}

async function seedRetainedObservation(
  database: ReturnType<typeof createDatabase>,
  sourceId: string,
  endpointId: string,
): Promise<{ observationId: string }> {
  const runId = randomUUID();
  const articleId = randomUUID();
  const observationId = randomUUID();
  await database.query(
    `INSERT INTO collection_runs (
       id, source_endpoint_id, execution_id, finished_at,
       run_status, transport_status, parser_status
     ) VALUES ($1, $2, 'relevance-admin-test', now(), 'succeeded', 'succeeded', 'succeeded')`,
    [runId, endpointId],
  );
  await database.query(
    `INSERT INTO articles (
       id, source_id, original_url, canonical_identity_url,
       display_title, normalized_title, published_at_status,
       source_updated_at_status, first_seen_at, last_seen_at
     ) VALUES ($1, $2, 'https://publisher.example/article',
       'https://publisher.example/article', 'Article', 'article',
       'missing', 'missing', now(), now())`,
    [articleId, sourceId],
  );
  await database.query(
    `INSERT INTO article_observations (
       id, source_id, source_endpoint_id, collection_run_id, article_id,
       processing_outcome, observed_canonical_identity_url
     ) VALUES ($1, $2, $3, $4, $5, 'created',
       'https://publisher.example/article')`,
    [observationId, sourceId, endpointId, runId, articleId],
  );
  return { observationId };
}
