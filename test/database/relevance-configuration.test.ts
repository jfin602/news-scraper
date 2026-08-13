import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDatabase } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  createCategory,
  createRelevanceRule,
  findCategoryByConfigKey,
  findRelevanceRuleByConfigKey,
  listCategories,
  listRelevanceRules,
  loadEffectiveRelevanceConfiguration,
  setEndpointDefaultCategory,
  setRelevanceRuleEnabled,
  setSourceDefaultCategory,
  updateCategory,
  updateRelevanceRule,
} from '../../src/collection/relevance/repository.ts';
import {
  insertSource,
  insertSourceEndpoint,
} from '../../src/sources/repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

test('persists immutable Category and Relevance-rule config identities through mutable edits', async () => {
  await withMigratedDatabase(async (database) => {
    const source = await createSource(database, 'primary_source');
    const category = await createCategory(database, {
      configKey: 'industry_news',
      displayName: 'Industry news',
    });
    const updatedCategory = await updateCategory(database, 'industry_news', {
      displayName: 'Publishing industry',
    });
    assert.equal(updatedCategory.id, category.id);
    assert.equal(updatedCategory.configKey, 'industry_news');
    assert.equal(
      (await findCategoryByConfigKey(database, 'industry_news'))?.displayName,
      'Publishing industry',
    );

    const rule = await createRelevanceRule(
      database,
      ruleInput({
        sourceConfigKey: source.configKey,
        action: 'categorize',
        categoryConfigKey: category.configKey,
      }),
    );
    const updatedRule = await updateRelevanceRule(database, rule.configKey, {
      predicateType: 'summary_contains',
      pattern: 'publishing',
      action: 'exclude',
      priority: 20,
      enabled: false,
      reason: 'Excluded summary',
    });
    assert.equal(updatedRule.id, rule.id);
    assert.equal(updatedRule.configKey, rule.configKey);
    assert.equal(updatedRule.scope, 'installation');
    assert.equal(updatedRule.categoryTarget, undefined);
    assert.equal(
      (await findRelevanceRuleByConfigKey(database, rule.configKey))?.enabled,
      false,
    );
    await assert.rejects(() =>
      createRelevanceRule(
        database,
        ruleInput({
          configKey: 'missing_source_rule',
          sourceConfigKey: 'missing_source',
        }),
      ),
    );
  });
});

test('loads a deterministic effective snapshot with only installation and matching Source rules', async () => {
  await withMigratedDatabase(async (database) => {
    const firstSource = await createSource(database, 'first_source');
    const secondSource = await createSource(database, 'second_source');
    const firstEndpoint = await createEndpoint(
      database,
      firstSource.id,
      'first_feed',
    );
    const category = await createCategory(database, {
      configKey: 'industry_news',
      displayName: 'Industry news',
    });
    await createRelevanceRule(database, ruleInput({ configKey: 'z_global' }));
    await createRelevanceRule(
      database,
      ruleInput({
        configKey: 'a_first_source',
        sourceConfigKey: firstSource.configKey,
        action: 'categorize',
        categoryConfigKey: category.configKey,
      }),
    );
    await createRelevanceRule(
      database,
      ruleInput({
        configKey: 'second_source_only',
        sourceConfigKey: secondSource.configKey,
      }),
    );
    await createRelevanceRule(
      database,
      ruleInput({
        configKey: 'disabled_global',
        enabled: false,
      }),
    );
    await setSourceDefaultCategory(
      database,
      firstSource.id,
      category.configKey,
    );
    await setEndpointDefaultCategory(
      database,
      firstEndpoint.id,
      category.configKey,
    );

    const first = await loadEffectiveRelevanceConfiguration(
      database,
      firstSource.id,
      firstEndpoint.id,
    );
    const second = await loadEffectiveRelevanceConfiguration(
      database,
      firstSource.id,
      firstEndpoint.id,
    );
    assert.deepEqual(first, second);
    assert.deepEqual(
      first?.rules.map((rule) => rule.configKey),
      ['a_first_source', 'z_global'],
    );
    assert.equal(first?.rules[0]?.scope, 'source');
    assert.deepEqual(first?.sourceDefaultCategory, {
      configKey: 'industry_news',
      displayName: 'Industry news',
    });
    assert.deepEqual(first?.endpointDefaultCategory, {
      configKey: 'industry_news',
      displayName: 'Industry news',
    });
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first?.rules), true);
    assert.equal(Object.isFrozen(first?.rules[0] as object), true);
    assert.equal(
      await loadEffectiveRelevanceConfiguration(
        database,
        secondSource.id,
        firstEndpoint.id,
      ),
      undefined,
    );
  });
});

test('sets, replaces, and clears real Source and endpoint default Category references', async () => {
  await withMigratedDatabase(async (database) => {
    const source = await createSource(database, 'primary_source');
    const endpoint = await createEndpoint(database, source.id, 'main_feed');
    await createCategory(database, {
      configKey: 'first',
      displayName: 'First',
    });
    await createCategory(database, {
      configKey: 'second',
      displayName: 'Second',
    });
    await setSourceDefaultCategory(database, source.id, 'first');
    await setSourceDefaultCategory(database, source.id, 'second');
    await setEndpointDefaultCategory(database, endpoint.id, 'first');
    await setEndpointDefaultCategory(database, endpoint.id, 'second');
    let snapshot = await loadEffectiveRelevanceConfiguration(
      database,
      source.id,
      endpoint.id,
    );
    assert.equal(snapshot?.sourceDefaultCategory?.configKey, 'second');
    assert.equal(snapshot?.endpointDefaultCategory?.configKey, 'second');
    await setSourceDefaultCategory(database, source.id, undefined);
    await setEndpointDefaultCategory(database, endpoint.id, undefined);
    snapshot = await loadEffectiveRelevanceConfiguration(
      database,
      source.id,
      endpoint.id,
    );
    assert.equal(snapshot?.sourceDefaultCategory, undefined);
    assert.equal(snapshot?.endpointDefaultCategory, undefined);
    await assert.rejects(() =>
      setSourceDefaultCategory(database, source.id, 'missing'),
    );
    await assert.rejects(() =>
      setEndpointDefaultCategory(
        database,
        '00000000-0000-0000-0000-000000000099',
        'first',
      ),
    );
  });
});

test('uses caller-owned transactions so all P2 writes roll back together', async () => {
  await withMigratedDatabase(async (database) => {
    await assert.rejects(
      database.transaction(async (transaction) => {
        const source = await createSource(transaction, 'primary_source');
        const endpoint = await createEndpoint(
          transaction,
          source.id,
          'main_feed',
        );
        const category = await createCategory(transaction, {
          configKey: 'industry_news',
          displayName: 'Industry news',
        });
        await createRelevanceRule(
          transaction,
          ruleInput({
            action: 'categorize',
            categoryConfigKey: category.configKey,
          }),
        );
        await setSourceDefaultCategory(
          transaction,
          source.id,
          category.configKey,
        );
        await setEndpointDefaultCategory(
          transaction,
          endpoint.id,
          category.configKey,
        );
        throw new Error('rollback');
      }),
    );
    assert.equal((await listCategories(database)).length, 0);
    assert.equal((await listRelevanceRules(database)).length, 0);
    assert.equal((await database.query('SELECT * FROM sources')).rowCount, 0);
  });
});

test('enables and disables rules without a Publication selector or tenant scope', async () => {
  await withMigratedDatabase(async (database) => {
    const source = await createSource(database, 'primary_source');
    const endpoint = await createEndpoint(database, source.id, 'main_feed');
    const rule = await createRelevanceRule(database, ruleInput());
    await setRelevanceRuleEnabled(database, rule.configKey, false);
    assert.deepEqual(
      (
        await loadEffectiveRelevanceConfiguration(
          database,
          source.id,
          endpoint.id,
        )
      )?.rules,
      [],
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
    endpointUrl: 'https://feeds.example.com/feed.xml',
    endpointType: 'rss_atom',
    approvalState: 'unapproved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    pollIntervalSeconds: 300,
  });
}

function ruleInput(overrides: Record<string, unknown> = {}) {
  return {
    configKey: 'global_rule',
    predicateType: 'title_contains',
    pattern: 'literal',
    action: 'include',
    priority: 10,
    enabled: true,
    reason: 'Literal rule',
    ...overrides,
  };
}
