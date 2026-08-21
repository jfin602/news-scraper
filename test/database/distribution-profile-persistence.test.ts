import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { createDatabase } from '../../src/database/database.ts';
import {
  createDistributionProfile,
  findDistributionProfileByConfigKey,
  removeDistributionProfileSourceAssociation,
  replaceDistributionProfileSourceAssociation,
} from '../../src/distribution/profiles/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const scope = createDatabaseTestScope('migrated');

after(async () => scope.dispose());

test('Distribution Profiles persist complete ordered Source/filter aggregates with retained peer resources', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const firstSourceId = randomUUID();
      const secondSourceId = randomUUID();
      const firstCategoryId = randomUUID();
      const secondCategoryId = randomUUID();
      await seedSource(database, firstSourceId, 'alpha_source');
      await seedSource(database, secondSourceId, 'beta_source');
      await seedCategory(database, firstCategoryId, 'industry');
      await seedCategory(database, secondCategoryId, 'fiction');

      const first = await createDistributionProfile(database, {
        configKey: 'publisher_news',
        displayName: ' Publisher news ',
        lifecycle: 'draft',
        resultLimit: 250,
      });
      const second = await createDistributionProfile(database, {
        configKey: 'second_profile',
        displayName: 'Second profile',
        lifecycle: 'disabled',
      });
      await database.transaction(async (transaction) => {
        await replaceDistributionProfileSourceAssociation(
          transaction,
          first.configKey,
          'beta_source',
          {
            includeAnyPhrases: ['First include', 'Second include'],
            excludeAnyPhrases: ['Exclude this'],
            categoryConfigKeys: ['fiction', 'industry'],
          },
        );
        await replaceDistributionProfileSourceAssociation(
          transaction,
          first.configKey,
          'alpha_source',
          {},
        );
        await replaceDistributionProfileSourceAssociation(
          transaction,
          second.configKey,
          'beta_source',
          {},
        );
      });

      const reloaded = await findDistributionProfileByConfigKey(
        database,
        first.configKey,
      );
      assert.deepEqual(reloaded?.sources, [
        {
          sourceId: firstSourceId,
          sourceConfigKey: 'alpha_source',
          sourceDisplayName: 'Alpha Source',
          sourceApprovalState: 'approved',
          sourceLifecycleState: 'active',
          includeAnyPhrases: [],
          excludeAnyPhrases: [],
          categoryConfigKeys: [],
        },
        {
          sourceId: secondSourceId,
          sourceConfigKey: 'beta_source',
          sourceDisplayName: 'Beta Source',
          sourceApprovalState: 'approved',
          sourceLifecycleState: 'active',
          includeAnyPhrases: ['First include', 'Second include'],
          excludeAnyPhrases: ['Exclude this'],
          categoryConfigKeys: ['fiction', 'industry'],
        },
      ]);
      assert.ok(Object.isFrozen(reloaded));
      assert.ok(Object.isFrozen(reloaded?.sources));
      assert.ok(Object.isFrozen(reloaded?.sources[1]?.includeAnyPhrases));
      assert.equal(
        (await findDistributionProfileByConfigKey(database, second.configKey))
          ?.sources[0]?.sourceId,
        secondSourceId,
      );

      await assert.rejects(
        database.query(
          `UPDATE distribution_profiles SET config_key = 'changed_key' WHERE id = $1`,
          [first.id],
        ),
      );
      await assert.rejects(
        database.query(
          `INSERT INTO distribution_profile_sources (profile_id, source_id)
           VALUES ($1, $2)`,
          [first.id, firstSourceId],
        ),
      );
      await assert.rejects(
        database.query(
          `INSERT INTO distribution_profile_sources (profile_id, source_id)
           VALUES ($1, $2)`,
          [first.id, randomUUID()],
        ),
      );
      await assert.rejects(
        database.query(
          `INSERT INTO distribution_profile_source_categories
             (profile_id, source_id, category_id, position)
           VALUES ($1, $2, $3, 0)`,
          [first.id, firstSourceId, randomUUID()],
        ),
      );
      await assert.rejects(
        database.query('DELETE FROM categories WHERE id = $1', [
          firstCategoryId,
        ]),
      );
      await assert.rejects(
        database.query(
          `INSERT INTO distribution_profile_source_phrases
             (profile_id, source_id, phrase_kind, position, phrase)
           VALUES ($1, $2, 'include', 64, 'invalid')`,
          [first.id, firstSourceId],
        ),
      );

      const before = await findDistributionProfileByConfigKey(
        database,
        first.configKey,
      );
      await assert.rejects(
        database.transaction(async (transaction) => {
          await replaceDistributionProfileSourceAssociation(
            transaction,
            first.configKey,
            'beta_source',
            {
              includeAnyPhrases: ['replacement'],
              categoryConfigKeys: ['missing_category'],
            },
          );
        }),
      );
      assert.deepEqual(
        await findDistributionProfileByConfigKey(database, first.configKey),
        before,
      );
      assert.equal(
        await removeDistributionProfileSourceAssociation(
          database,
          first.configKey,
          'alpha_source',
        ),
        true,
      );
      assert.equal(
        (await findDistributionProfileByConfigKey(database, first.configKey))
          ?.sources.length,
        1,
      );
    } finally {
      await database.close();
    }
  });
});

async function seedSource(
  database: ReturnType<typeof createDatabase>,
  id: string,
  configKey: string,
): Promise<void> {
  await database.query(
    `INSERT INTO sources (
       id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state
     ) VALUES ($1, $2, $3, 'https://example.test/', 'approved', 'active', 'enabled')`,
    [
      id,
      configKey,
      configKey === 'alpha_source' ? 'Alpha Source' : 'Beta Source',
    ],
  );
}

async function seedCategory(
  database: ReturnType<typeof createDatabase>,
  id: string,
  configKey: string,
): Promise<void> {
  await database.query(
    `INSERT INTO categories (id, config_key, display_name) VALUES ($1, $2, $3)`,
    [id, configKey, configKey === 'industry' ? 'Industry' : 'Fiction'],
  );
}
