import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { createDatabase } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  applyEditorialConfiguration,
  normalizeEditorialConfigurationDocument,
} from '../../src/collection/relevance/operator-configuration.ts';
import {
  findCategoryByConfigKey,
  findRelevanceRuleByConfigKey,
  listCategories,
  listRelevanceRules,
  loadEffectiveRelevanceConfiguration,
} from '../../src/collection/relevance/repository.ts';
import {
  insertSource,
  insertSourceEndpoint,
} from '../../src/sources/repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const execFileAsync = promisify(execFile);

test('explicit operator command applies the canonical document against PostgreSQL', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const result = await execFileAsync(
      process.execPath,
      ['scripts/apply-editorial-configuration.ts', 'config/editorial.json'],
      {
        cwd: process.cwd(),
        env: { ...process.env, NEWS_SCRAPER_DATABASE_URL: databaseUrl },
      },
    );
    assert.match(result.stdout, /categories_created=9/u);
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      assert.equal((await listCategories(database)).length, 9);
    } finally {
      await database.close();
    }
  });
});

test('transactionally creates, updates, and idempotently reapplies editorial configuration', async () => {
  await withMigratedDatabase(async (database) => {
    const source = await createSource(database, 'primary_source');
    const endpoint = await createEndpoint(database, source.id, 'main_feed');
    const document = editorialDocument();
    assert.deepEqual(await applyEditorialConfiguration(database, document), {
      categoriesCreated: 2,
      categoriesUpdated: 0,
      rulesCreated: 1,
      rulesUpdated: 0,
      sourceDefaultsEdited: 1,
      endpointDefaultsEdited: 1,
    });
    const categoryId = (
      await findCategoryByConfigKey(database, 'industry_news')
    )?.id;
    const ruleId = (
      await findRelevanceRuleByConfigKey(database, 'publisher_titles')
    )?.id;
    assert.ok(categoryId);
    assert.ok(ruleId);
    assert.deepEqual(await applyEditorialConfiguration(database, document), {
      categoriesCreated: 0,
      categoriesUpdated: 0,
      rulesCreated: 0,
      rulesUpdated: 0,
      sourceDefaultsEdited: 1,
      endpointDefaultsEdited: 1,
    });
    assert.equal(
      (await findCategoryByConfigKey(database, 'industry_news'))?.id,
      categoryId,
    );
    assert.equal(
      (await findRelevanceRuleByConfigKey(database, 'publisher_titles'))?.id,
      ruleId,
    );

    const edited = normalizeEditorialConfigurationDocument({
      categories: [
        { configKey: 'industry_news', displayName: 'Publishing industry' },
        { configKey: 'marketing', displayName: 'Marketing' },
      ],
      rules: [
        ruleInput({
          pattern: 'publisher news',
          enabled: false,
          priority: 20,
          reason: 'Disabled publisher rule',
        }),
      ],
      sourceDefaults: [
        { sourceConfigKey: 'primary_source', categoryConfigKey: 'marketing' },
      ],
      endpointDefaults: [
        {
          sourceConfigKey: 'primary_source',
          endpointConfigKey: 'main_feed',
          categoryConfigKey: null,
        },
      ],
    });
    assert.deepEqual(await applyEditorialConfiguration(database, edited), {
      categoriesCreated: 0,
      categoriesUpdated: 1,
      rulesCreated: 0,
      rulesUpdated: 1,
      sourceDefaultsEdited: 1,
      endpointDefaultsEdited: 1,
    });
    assert.equal(
      (await findCategoryByConfigKey(database, 'industry_news'))?.id,
      categoryId,
    );
    assert.equal(
      (await findCategoryByConfigKey(database, 'industry_news'))?.displayName,
      'Publishing industry',
    );
    assert.equal(
      (await findRelevanceRuleByConfigKey(database, 'publisher_titles'))?.id,
      ruleId,
    );
    assert.equal(
      (await findRelevanceRuleByConfigKey(database, 'publisher_titles'))
        ?.enabled,
      false,
    );
    const snapshot = await loadEffectiveRelevanceConfiguration(
      database,
      source.id,
      endpoint.id,
    );
    assert.equal(snapshot?.sourceDefaultCategory?.configKey, 'marketing');
    assert.equal(snapshot?.endpointDefaultCategory, undefined);
  });
});

test('validates real relationships before commit and leaves all requested edits rolled back', async () => {
  await withMigratedDatabase(async (database) => {
    const first = await createSource(database, 'first_source');
    await createEndpoint(database, first.id, 'first_feed');
    const second = await createSource(database, 'second_source');
    await createEndpoint(database, second.id, 'second_feed');
    await assert.rejects(() =>
      applyEditorialConfiguration(
        database,
        normalizeEditorialConfigurationDocument({
          categories: [
            { configKey: 'new_category', displayName: 'New category' },
          ],
          rules: [
            ruleInput({
              categoryConfigKey: 'missing_category',
              action: 'categorize',
            }),
          ],
          sourceDefaults: [],
          endpointDefaults: [
            {
              sourceConfigKey: 'first_source',
              endpointConfigKey: 'second_feed',
              categoryConfigKey: 'new_category',
            },
          ],
        }),
      ),
    );
    assert.equal((await listCategories(database)).length, 0);
    assert.equal((await listRelevanceRules(database)).length, 0);
    await assert.rejects(() =>
      applyEditorialConfiguration(
        database,
        normalizeEditorialConfigurationDocument({
          categories: [
            { configKey: 'new_category', displayName: 'New category' },
          ],
          rules: [
            ruleInput({
              sourceConfigKey: 'missing_source',
              action: 'categorize',
              categoryConfigKey: 'new_category',
            }),
          ],
          sourceDefaults: [],
          endpointDefaults: [],
        }),
      ),
    );
    assert.equal((await listCategories(database)).length, 0);
    assert.equal((await listRelevanceRules(database)).length, 0);
  });
});

test('leaves omitted editorial state and Articles untouched without historical reprocessing', async () => {
  await withMigratedDatabase(async (database) => {
    const source = await createSource(database, 'primary_source');
    await createEndpoint(database, source.id, 'main_feed');
    await database.query(
      `INSERT INTO articles (
         id, source_id, external_id, canonical_identity_url, original_url,
         display_title, normalized_title, published_at_status,
         source_updated_at_status, first_seen_at, last_seen_at, visibility_state
       ) VALUES (
         '00000000-0000-0000-0000-000000000001', $1, 'one',
         'https://publisher.example/article', 'https://publisher.example/article',
         'Existing', 'existing', 'missing', 'missing', now(), now(), 'visible'
       )`,
      [source.id],
    );
    await applyEditorialConfiguration(database, editorialDocument());
    await applyEditorialConfiguration(
      database,
      normalizeEditorialConfigurationDocument({
        categories: [],
        rules: [],
        sourceDefaults: [],
        endpointDefaults: [],
      }),
    );
    assert.equal((await listCategories(database)).length, 2);
    assert.equal((await listRelevanceRules(database)).length, 1);
    assert.equal((await database.query('SELECT * FROM articles')).rowCount, 1);
    assert.equal(
      (await database.query('SELECT * FROM article_observations')).rowCount,
      0,
    );
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

async function createSource(
  database: Parameters<typeof insertSource>[0],
  configKey: string,
) {
  return insertSource(database, {
    configKey,
    displayName: configKey,
    siteUrl: 'https://publisher.example/about',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    domainRules: [{ hostname: 'publisher.example' }],
  });
}

async function createEndpoint(
  database: Parameters<typeof insertSourceEndpoint>[0],
  sourceId: string,
  configKey: string,
) {
  return insertSourceEndpoint(database, sourceId, {
    configKey,
    endpointUrl: 'https://publisher.example/feed.xml',
    endpointType: 'rss_atom',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    pollIntervalSeconds: 300,
  });
}

function editorialDocument() {
  return normalizeEditorialConfigurationDocument({
    categories: [
      { configKey: 'industry_news', displayName: 'Industry news' },
      { configKey: 'marketing', displayName: 'Marketing' },
    ],
    rules: [
      ruleInput({ action: 'categorize', categoryConfigKey: 'industry_news' }),
    ],
    sourceDefaults: [
      { sourceConfigKey: 'primary_source', categoryConfigKey: 'marketing' },
    ],
    endpointDefaults: [
      {
        sourceConfigKey: 'primary_source',
        endpointConfigKey: 'main_feed',
        categoryConfigKey: 'industry_news',
      },
    ],
  });
}

function ruleInput(overrides: Record<string, unknown> = {}) {
  return {
    configKey: 'publisher_titles',
    predicateType: 'title_contains',
    pattern: 'publisher',
    action: 'include',
    priority: 10,
    enabled: true,
    reason: 'Publisher rule',
    ...overrides,
  };
}
