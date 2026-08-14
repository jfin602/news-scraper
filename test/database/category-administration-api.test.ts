import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { createEditorialAdministrationService } from '../../src/admin/editorial-administration.ts';
import { createWebApp } from '../../src/app/web/create-app.ts';
import {
  ADMIN_REQUEST_HEADER,
  ADMIN_REQUEST_HEADER_VALUE,
} from '../../src/app/web/admin-router.ts';
import { registerEditorialAdministrationRoutes } from '../../src/app/web/editorial-administration-router.ts';
import { registerSourceAdministrationRoutes } from '../../src/app/web/source-administration-router.ts';
import { startWebServer } from '../../src/app/web/server.ts';
import {
  createCategory,
  createRelevanceRule,
} from '../../src/collection/relevance/repository.ts';
import { createDatabase } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  insertSource,
  insertSourceEndpoint,
} from '../../src/sources/repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

test('Category admin API owns the compatible list and CRUD boundary', async () => {
  await withCategoryAdmin(async ({ database, baseUrl }) => {
    const missingIntegrity = await fetch(`${baseUrl}/api/admin/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configKey: 'blocked', displayName: 'Blocked' }),
    });
    assert.equal(missingIntegrity.status, 403);

    const invalid = await fetch(`${baseUrl}/api/admin/categories`, {
      method: 'POST',
      headers: adminJsonHeaders(),
      body: JSON.stringify({
        configKey: 'Invalid Key',
        displayName: 'Invalid',
        futureField: true,
      }),
    });
    assert.deepEqual(await invalid.json(), { error: 'invalid_request' });
    assert.equal(invalid.status, 400);

    const created = await fetch(`${baseUrl}/api/admin/categories`, {
      method: 'POST',
      headers: adminJsonHeaders(),
      body: JSON.stringify({
        configKey: 'industry_news',
        displayName: 'Industry News',
      }),
    });
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), {
      category: { configKey: 'industry_news', displayName: 'Industry News' },
    });

    const duplicate = await fetch(`${baseUrl}/api/admin/categories`, {
      method: 'POST',
      headers: adminJsonHeaders(),
      body: JSON.stringify({
        configKey: 'industry_news',
        displayName: 'Another label',
      }),
    });
    assert.equal(duplicate.status, 409);
    assert.deepEqual(await duplicate.json(), {
      error: 'category_config_key_conflict',
    });

    const list = await fetch(`${baseUrl}/api/admin/categories`);
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), {
      categories: [
        { configKey: 'industry_news', displayName: 'Industry News' },
      ],
    });

    const detail = await fetch(`${baseUrl}/api/admin/categories/industry_news`);
    assert.equal(detail.status, 200);
    assert.deepEqual(await detail.json(), {
      category: { configKey: 'industry_news', displayName: 'Industry News' },
    });

    const updated = await fetch(
      `${baseUrl}/api/admin/categories/industry_news`,
      {
        method: 'PUT',
        headers: adminJsonHeaders(),
        body: JSON.stringify({ displayName: 'Publishing Industry' }),
      },
    );
    assert.equal(updated.status, 200);
    assert.deepEqual(await updated.json(), {
      category: {
        configKey: 'industry_news',
        displayName: 'Publishing Industry',
      },
    });

    const immutable = await fetch(
      `${baseUrl}/api/admin/categories/industry_news`,
      {
        method: 'PUT',
        headers: adminJsonHeaders(),
        body: JSON.stringify({
          configKey: 'renamed',
          displayName: 'Should not change',
        }),
      },
    );
    assert.equal(immutable.status, 400);
    assert.deepEqual(await immutable.json(), { error: 'invalid_request' });

    const missing = await fetch(`${baseUrl}/api/admin/categories/missing`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'category_not_found' });

    const missingDelete = await fetch(
      `${baseUrl}/api/admin/categories/missing`,
      { method: 'DELETE', headers: adminJsonHeaders(), body: '{}' },
    );
    assert.equal(missingDelete.status, 404);
    assert.deepEqual(await missingDelete.json(), {
      error: 'category_not_found',
    });

    assert.equal(
      (await database.query('SELECT count(*)::int AS count FROM categories'))
        .rows[0]?.count,
      1,
    );
  });
});

test('Category removal is guarded by every retained relationship and rolls back', async () => {
  await withCategoryAdmin(async ({ database, baseUrl }) => {
    const category = await createCategory(database, {
      configKey: 'guarded_category',
      displayName: 'Guarded Category',
    });
    await createCategory(database, {
      configKey: 'unrelated_category',
      displayName: 'Unrelated Category',
    });
    const source = await insertSource(database, sourceInput());
    const endpoint = await insertSourceEndpoint(database, source.id, {
      configKey: 'main_feed',
      endpointUrl: 'https://publisher.example/feed.xml',
      endpointType: 'rss_atom',
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
      pollIntervalSeconds: 300,
    });
    const retained = await seedRetainedObservation(
      database,
      source.id,
      endpoint.id,
    );

    const rule = await createRelevanceRule(database, {
      configKey: 'guarded_rule',
      predicateType: 'title_contains',
      pattern: 'literal',
      action: 'categorize',
      categoryConfigKey: category.configKey,
      priority: 10,
      enabled: true,
      reason: 'Guard category',
    });
    await assertCategoryInUse(baseUrl);
    assert.equal(await categoryCount(database, category.configKey), 1);
    assert.equal(
      (
        await database.query(
          'SELECT count(*)::int AS count FROM relevance_rules',
        )
      ).rows[0]?.count,
      1,
    );
    await database.query('DELETE FROM relevance_rules WHERE id = $1', [
      rule.id,
    ]);

    await database.query(
      'UPDATE sources SET default_category_id = $1 WHERE id = $2',
      [category.id, source.id],
    );
    await assertCategoryInUse(baseUrl);
    assert.equal(
      (
        await database.query(
          'SELECT default_category_id FROM sources WHERE id = $1',
          [source.id],
        )
      ).rows[0]?.default_category_id,
      category.id,
    );
    await database.query(
      'UPDATE sources SET default_category_id = NULL WHERE id = $1',
      [source.id],
    );

    await database.query(
      'UPDATE source_endpoints SET default_category_id = $1 WHERE id = $2',
      [category.id, endpoint.id],
    );
    await assertCategoryInUse(baseUrl);
    assert.equal(
      (
        await database.query(
          'SELECT default_category_id FROM source_endpoints WHERE id = $1',
          [endpoint.id],
        )
      ).rows[0]?.default_category_id,
      category.id,
    );
    await database.query(
      'UPDATE source_endpoints SET default_category_id = NULL WHERE id = $1',
      [endpoint.id],
    );

    await database.query(
      'INSERT INTO article_categories (article_id, category_id) VALUES ($1, $2)',
      [retained.articleId, category.id],
    );
    await assertCategoryInUse(baseUrl);
    assert.equal(
      (
        await database.query(
          'SELECT count(*)::int AS count FROM article_categories WHERE category_id = $1',
          [category.id],
        )
      ).rows[0]?.count,
      1,
    );
    await database.query(
      'DELETE FROM article_categories WHERE article_id = $1 AND category_id = $2',
      [retained.articleId, category.id],
    );

    await database.query(
      `INSERT INTO article_observation_category_reasons (
         article_observation_id, category_id, reason_position, reason_kind, reason_detail
       ) VALUES ($1, $2, 1, 'source_default', 'Retained source default')`,
      [retained.observationId, category.id],
    );
    await assertCategoryInUse(baseUrl);
    assert.equal(
      (
        await database.query(
          'SELECT count(*)::int AS count FROM article_observation_category_reasons WHERE category_id = $1',
          [category.id],
        )
      ).rows[0]?.count,
      1,
    );

    const rejected = await fetch(
      `${baseUrl}/api/admin/categories/guarded_category`,
      { method: 'DELETE', headers: adminJsonHeaders(), body: '{}' },
    );
    assert.equal(rejected.status, 409);
    assert.deepEqual(await rejected.json(), { error: 'category_in_use' });
    await database.query(
      'DELETE FROM article_observation_category_reasons WHERE article_observation_id = $1',
      [retained.observationId],
    );

    const deleted = await fetch(
      `${baseUrl}/api/admin/categories/guarded_category`,
      { method: 'DELETE', headers: adminJsonHeaders(), body: '{}' },
    );
    assert.equal(deleted.status, 204);
    assert.equal(await categoryCount(database, category.configKey), 0);
    assert.equal(await categoryCount(database, 'unrelated_category'), 1);
    assert.equal(
      (await database.query('SELECT count(*)::int AS count FROM articles'))
        .rows[0]?.count,
      1,
    );
    assert.equal(
      (
        await database.query(
          'SELECT count(*)::int AS count FROM article_observations',
        )
      ).rows[0]?.count,
      1,
    );
  });
});

async function withCategoryAdmin(
  work: (context: {
    database: ReturnType<typeof createDatabase>;
    baseUrl: string;
  }) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    const editorialRoutes = registerEditorialAdministrationRoutes(
      createEditorialAdministrationService(database),
    );
    const sourceRoutes = registerSourceAdministrationRoutes(
      // Source/endpoint tests retain their existing service boundary; Category
      // list ownership is supplied by the editorial registrar below.
      {
        listSources: async () => [],
        getSource: async () => {
          throw new Error('not used');
        },
        createSource: async () => {
          throw new Error('not used');
        },
        replaceSourceConfiguration: async () => {
          throw new Error('not used');
        },
        setSourceApproval: async () => {
          throw new Error('not used');
        },
        setSourceOperationalState: async () => {
          throw new Error('not used');
        },
        setSourceLifecycle: async () => {
          throw new Error('not used');
        },
      },
    );
    const server = await startWebServer(
      createWebApp(
        {
          readiness: { checkReady: async () => true },
          publicFeed: { read: async () => undefined },
        },
        {
          adminEnabled: true,
          registerAdminApiRoutes: (router) => {
            sourceRoutes(router);
            editorialRoutes(router);
          },
        },
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

async function assertCategoryInUse(baseUrl: string): Promise<void> {
  const response = await fetch(
    `${baseUrl}/api/admin/categories/guarded_category`,
    { method: 'DELETE', headers: adminJsonHeaders(), body: '{}' },
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'category_in_use' });
}

async function categoryCount(
  database: ReturnType<typeof createDatabase>,
  configKey: string,
): Promise<number> {
  const result = await database.query<{ readonly count: number }>(
    'SELECT count(*)::int AS count FROM categories WHERE config_key = $1',
    [configKey],
  );
  return result.rows[0]?.count ?? 0;
}

function sourceInput() {
  return {
    configKey: 'publisher',
    displayName: 'Publisher',
    siteUrl: 'https://publisher.example/about',
    approvalState: 'approved' as const,
    lifecycleState: 'active' as const,
    operationalState: 'enabled' as const,
    domainRules: [{ hostname: 'publisher.example' }],
  };
}

async function seedRetainedObservation(
  database: ReturnType<typeof createDatabase>,
  sourceId: string,
  endpointId: string,
): Promise<{ articleId: string; observationId: string }> {
  const runId = randomUUID();
  const articleId = randomUUID();
  const observationId = randomUUID();
  await database.query(
    `INSERT INTO collection_runs (
       id, source_endpoint_id, execution_id, finished_at,
       run_status, transport_status, parser_status
     ) VALUES ($1, $2, 'category-admin-test', now(), 'succeeded', 'succeeded', 'succeeded')`,
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
  return { articleId, observationId };
}

function adminJsonHeaders(): Record<string, string> {
  return {
    [ADMIN_REQUEST_HEADER]: ADMIN_REQUEST_HEADER_VALUE,
    'Content-Type': 'application/json',
  };
}
