import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import {
  createDistributionProfileAdministrationService,
  DistributionProfileAdministrationError,
} from '../../src/admin/distribution-profile-administration.ts';
import {
  createSourceAdministrationService,
  SourceAdministrationError,
} from '../../src/admin/source-administration.ts';
import { createCategory } from '../../src/collection/relevance/repository.ts';
import { createDatabase } from '../../src/database/database.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const scope = createDatabaseTestScope('migrated');

after(async () => scope.dispose());

test('Distribution Profile administration owns immutable draft creation, configuration, filters, lifecycle, and audit history', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await seedSource(database, 'usable');
      await seedSource(database, 'unapproved', 'unapproved');
      await seedSource(database, 'archived', 'approved', 'archived');
      await createCategory(database, {
        configKey: 'industry',
        displayName: 'Industry',
      });
      const service = createDistributionProfileAdministrationService(database);
      const created = await service.createProfile({
        configKey: 'publisher_news',
        displayName: 'Publisher News',
      });
      assert.deepEqual(created, {
        configKey: 'publisher_news',
        displayName: 'Publisher News',
        lifecycleState: 'draft',
        resultLimit: 100,
        sources: [],
      });
      await assertProfileError(
        service.setProfileLifecycle('publisher_news', {
          lifecycleState: 'active',
        }),
        'profile_requires_usable_source',
      );
      await assertProfileError(
        service.createProfile({
          configKey: 'second',
          displayName: 'Second',
          unexpected: true,
        }),
        'invalid_request',
      );
      await assertProfileError(
        service.replaceProfileConfiguration('publisher_news', {
          displayName: 'Missing limit',
        }),
        'invalid_request',
      );
      const configured = await service.replaceProfileConfiguration(
        'publisher_news',
        { displayName: 'Configured News', resultLimit: 25 },
      );
      assert.equal(configured.lifecycleState, 'draft');
      assert.equal(configured.resultLimit, 25);

      await service.replaceSourceAssociation(
        'publisher_news',
        'unapproved',
        {},
      );
      await assertProfileError(
        service.setProfileLifecycle('publisher_news', {
          lifecycleState: 'active',
        }),
        'profile_requires_usable_source',
      );
      await service.replaceSourceAssociation('publisher_news', 'usable', {
        includeAnyPhrases: [' Books '],
        excludeAnyPhrases: ['Rumor'],
        categoryConfigKeys: ['industry'],
      });
      await service.replaceSourceAssociation('publisher_news', 'usable', {
        includeAnyPhrases: ['Updated include'],
        excludeAnyPhrases: ['Updated exclude'],
        categoryConfigKeys: ['industry'],
      });
      await assertProfileError(
        service.replaceSourceAssociation('publisher_news', 'missing', {}),
        'source_not_found',
      );
      await assertProfileError(
        service.replaceSourceAssociation('publisher_news', 'usable', {
          categoryConfigKeys: ['missing'],
        }),
        'category_not_found',
      );
      const active = await service.setProfileLifecycle('publisher_news', {
        lifecycleState: 'active',
      });
      assert.equal(active.lifecycleState, 'active');
      assert.deepEqual(active.sources[0], {
        configKey: 'unapproved',
        displayName: 'Unapproved',
        approvalState: 'unapproved',
        lifecycleState: 'active',
        includeAnyPhrases: [],
        excludeAnyPhrases: [],
        categoryConfigKeys: [],
      });
      assert.deepEqual(active.sources[1]?.includeAnyPhrases, [
        'Updated include',
      ]);
      await assertProfileError(
        service.removeSourceAssociation('publisher_news', 'usable'),
        'profile_requires_usable_source',
      );
      await service.removeSourceAssociation('publisher_news', 'unapproved');
      await assertProfileError(
        service.removeSourceAssociation('publisher_news', 'unapproved'),
        'profile_association_not_found',
      );
      await assertProfileError(
        service.setProfileLifecycle('publisher_news', {
          lifecycleState: 'active',
        }),
        'profile_invalid_lifecycle_transition',
      );
      await service.setProfileLifecycle('publisher_news', {
        lifecycleState: 'disabled',
      });
      await service.removeSourceAssociation('publisher_news', 'usable');
      await assertProfileError(
        service.setProfileLifecycle('publisher_news', {
          lifecycleState: 'active',
        }),
        'profile_requires_usable_source',
      );
      await service.createProfile({
        configKey: 'archived_only',
        displayName: 'Archived only',
      });
      await service.replaceSourceAssociation('archived_only', 'archived', {});
      await assertProfileError(
        service.setProfileLifecycle('archived_only', {
          lifecycleState: 'active',
        }),
        'profile_requires_usable_source',
      );

      const audits = await database.query<{ readonly action: string }>(
        `SELECT action FROM audit_events WHERE target_type = 'distribution_profile'
         ORDER BY occurred_at ASC, id ASC`,
      );
      assert.deepEqual(
        audits.rows.map((row) => row.action),
        [
          'distribution_profile_created',
          'distribution_profile_configuration_changed',
          'distribution_profile_source_association_created',
          'distribution_profile_source_association_created',
          'distribution_profile_source_association_changed',
          'distribution_profile_activated',
          'distribution_profile_source_association_removed',
          'distribution_profile_disabled',
          'distribution_profile_source_association_removed',
          'distribution_profile_created',
          'distribution_profile_source_association_created',
        ],
      );
    } finally {
      await database.close();
    }
  });
});

test('Source approval and lifecycle guards preserve active Profile usability while operational state remains orthogonal', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await seedSource(database, 'alpha');
      await seedSource(database, 'beta');
      const profiles = createDistributionProfileAdministrationService(database);
      const sources = createSourceAdministrationService(database);
      await profiles.createProfile({
        configKey: 'active_profile',
        displayName: 'Active',
      });
      await profiles.replaceSourceAssociation('active_profile', 'alpha', {});
      await profiles.setProfileLifecycle('active_profile', {
        lifecycleState: 'active',
      });
      await assertSourceError(
        sources.setSourceApproval('alpha', { approvalState: 'unapproved' }),
        'source_required_by_active_profile',
      );
      await assertSourceError(
        sources.setSourceLifecycle('alpha', { lifecycleState: 'archived' }),
        'source_required_by_active_profile',
      );
      await profiles.replaceSourceAssociation('active_profile', 'beta', {});
      assert.equal(
        (
          await sources.setSourceApproval('alpha', {
            approvalState: 'unapproved',
          })
        ).approvalState,
        'unapproved',
      );
      assert.equal(
        (
          await sources.setSourceOperationalState('beta', {
            operationalState: 'paused',
          })
        ).operationalState,
        'paused',
      );
      await profiles.setProfileLifecycle('active_profile', {
        lifecycleState: 'disabled',
      });
      await profiles.createProfile({
        configKey: 'draft_profile',
        displayName: 'Draft',
      });
      await profiles.replaceSourceAssociation('draft_profile', 'beta', {});
      assert.equal(
        (
          await sources.setSourceLifecycle('beta', {
            lifecycleState: 'archived',
          })
        ).lifecycleState,
        'archived',
      );
      assert.equal(
        (await profiles.getProfile('active_profile')).lifecycleState,
        'disabled',
      );
    } finally {
      await database.close();
    }
  });
});

test('concurrent Profile activation or membership removal and Source invalidation terminate without an invalid active Profile', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const firstDatabase = createDatabase({ connectionString: databaseUrl });
    const secondDatabase = createDatabase({ connectionString: databaseUrl });
    try {
      await seedSource(firstDatabase, 'alpha');
      await seedSource(firstDatabase, 'beta');
      const profiles =
        createDistributionProfileAdministrationService(firstDatabase);
      const otherProfiles =
        createDistributionProfileAdministrationService(secondDatabase);
      const sources = createSourceAdministrationService(secondDatabase);
      await profiles.createProfile({
        configKey: 'racing_draft',
        displayName: 'Racing draft',
      });
      await profiles.replaceSourceAssociation('racing_draft', 'alpha', {});
      const activationRace = await Promise.allSettled([
        profiles.setProfileLifecycle('racing_draft', {
          lifecycleState: 'active',
        }),
        sources.setSourceApproval('alpha', { approvalState: 'unapproved' }),
      ]);
      assert.equal(activationRace.length, 2);
      await assertNoInvalidActiveProfile(firstDatabase);

      await sources.setSourceApproval('alpha', { approvalState: 'approved' });
      await profiles.createProfile({
        configKey: 'racing_active',
        displayName: 'Racing active',
      });
      await profiles.replaceSourceAssociation('racing_active', 'alpha', {});
      await profiles.replaceSourceAssociation('racing_active', 'beta', {});
      await profiles.setProfileLifecycle('racing_active', {
        lifecycleState: 'active',
      });
      const membershipRace = await Promise.allSettled([
        otherProfiles.removeSourceAssociation('racing_active', 'alpha'),
        sources.setSourceLifecycle('beta', { lifecycleState: 'archived' }),
      ]);
      assert.equal(membershipRace.length, 2);
      await assertNoInvalidActiveProfile(firstDatabase);
    } finally {
      await Promise.all([firstDatabase.close(), secondDatabase.close()]);
    }
  });
});

async function seedSource(
  database: ReturnType<typeof createDatabase>,
  configKey: string,
  approvalState: 'approved' | 'unapproved' = 'approved',
  lifecycleState: 'active' | 'archived' = 'active',
): Promise<void> {
  await database.query(
    `INSERT INTO sources (
       id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state
     ) VALUES ($1, $2, $3, 'https://example.test/', $4, $5, 'enabled')`,
    [
      randomUUID(),
      configKey,
      configKey[0]?.toUpperCase() + configKey.slice(1),
      approvalState,
      lifecycleState,
    ],
  );
}

async function assertNoInvalidActiveProfile(
  database: ReturnType<typeof createDatabase>,
): Promise<void> {
  const result = await database.query<{ readonly count: number }>(
    `SELECT count(*)::integer AS count
       FROM distribution_profiles profile
      WHERE profile.lifecycle = 'active'
        AND NOT EXISTS (
          SELECT 1
            FROM distribution_profile_sources association
            JOIN sources source ON source.id = association.source_id
           WHERE association.profile_id = profile.id
             AND source.approval_state = 'approved'
             AND source.lifecycle_state = 'active'
        )`,
  );
  assert.equal(result.rows[0]?.count, 0);
}

async function assertProfileError(
  promise: Promise<unknown>,
  code: DistributionProfileAdministrationError['code'],
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof DistributionProfileAdministrationError);
    assert.equal(error.code, code);
    return true;
  });
}

async function assertSourceError(
  promise: Promise<unknown>,
  code: SourceAdministrationError['code'],
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof SourceAdministrationError);
    assert.equal(error.code, code);
    return true;
  });
}
