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
import type {
  Database,
  DatabaseSession,
  QueryExecutor,
} from '../../src/database/database.ts';
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

test(
  'Source unapproval serializes a draft Profile activation at the Source-validity boundary',
  { timeout: 10_000 },
  async () => {
    await scope.use(async ({ databaseUrl }) => {
      const sourceDatabase = createDatabase({ connectionString: databaseUrl });
      const activationDatabase = createDatabase({
        connectionString: databaseUrl,
      });
      const sourceValidityGuardAcquired = deferred();
      const emptyActiveProfileDiscovery = deferred();
      const releaseInvalidation = deferred();
      const activationLockAttempted = deferred();
      const activationLockPassed = deferred();
      const guardedSourceDatabase = new CheckpointDatabase(sourceDatabase, {
        afterQuery: async (text) => {
          if (isSourceValidityLock(text)) sourceValidityGuardAcquired.resolve();
          if (isActiveProfileDiscovery(text)) {
            emptyActiveProfileDiscovery.resolve();
            await releaseInvalidation.promise;
          }
        },
      });
      const guardedActivationDatabase = new CheckpointDatabase(
        activationDatabase,
        {
          beforeQuery: (text) => {
            if (isSourceValidityLock(text)) activationLockAttempted.resolve();
          },
          afterQuery: (text) => {
            if (isSourceValidityLock(text)) activationLockPassed.resolve();
          },
        },
      );
      try {
        await seedSource(sourceDatabase, 'alpha');
        const profiles =
          createDistributionProfileAdministrationService(activationDatabase);
        const guardedProfiles = createDistributionProfileAdministrationService(
          guardedActivationDatabase,
        );
        const sources = createSourceAdministrationService(
          guardedSourceDatabase,
        );
        await profiles.createProfile({
          configKey: 'racing_draft',
          displayName: 'Racing draft',
        });
        await profiles.replaceSourceAssociation('racing_draft', 'alpha', {});

        const unapproval = sources.setSourceApproval('alpha', {
          approvalState: 'unapproved',
        });
        await within(
          sourceValidityGuardAcquired.promise,
          'Source validity guard',
        );
        await within(
          emptyActiveProfileDiscovery.promise,
          'empty active Profile discovery',
        );

        const activation = guardedProfiles.setProfileLifecycle('racing_draft', {
          lifecycleState: 'active',
        });
        await within(
          activationLockAttempted.promise,
          'activation lock attempt',
        );
        assert.equal(activationLockPassed.resolved, false);

        releaseInvalidation.resolve();
        assert.equal((await unapproval).approvalState, 'unapproved');
        await within(activationLockPassed.promise, 'activation lock release');
        await assertProfileError(activation, 'profile_requires_usable_source');
        assert.equal(
          (await profiles.getProfile('racing_draft')).lifecycleState,
          'draft',
        );
        await assertNoInvalidActiveProfile(sourceDatabase);
        await assertProfileAuditActions(sourceDatabase, [
          'distribution_profile_created',
          'distribution_profile_source_association_created',
        ]);
      } finally {
        await Promise.all([sourceDatabase.close(), activationDatabase.close()]);
      }
    });
  },
);

test(
  'active association removal and other Source archival terminate without a reversed lock cycle',
  { timeout: 10_000 },
  async () => {
    await scope.use(async ({ databaseUrl }) => {
      const removalDatabase = createDatabase({ connectionString: databaseUrl });
      const archivalDatabase = createDatabase({
        connectionString: databaseUrl,
      });
      const removalSourcesLocked = deferred();
      const releaseRemoval = deferred();
      const archivalGuardAcquired = deferred();
      const archivalProfileLockAttempted = deferred();
      const guardedRemovalDatabase = new CheckpointDatabase(removalDatabase, {
        afterQuery: async (text) => {
          if (isProfileSourceLock(text)) {
            removalSourcesLocked.resolve();
            await releaseRemoval.promise;
          }
        },
      });
      const guardedArchivalDatabase = new CheckpointDatabase(archivalDatabase, {
        afterQuery: (text) => {
          if (isSourceValidityLock(text)) archivalGuardAcquired.resolve();
        },
        beforeQuery: (text) => {
          if (isActiveProfileDiscovery(text))
            archivalProfileLockAttempted.resolve();
        },
      });
      try {
        await seedSource(removalDatabase, 'alpha');
        await seedSource(removalDatabase, 'beta');
        const profiles =
          createDistributionProfileAdministrationService(removalDatabase);
        const guardedProfiles = createDistributionProfileAdministrationService(
          guardedRemovalDatabase,
        );
        const sources = createSourceAdministrationService(
          guardedArchivalDatabase,
        );
        await profiles.createProfile({
          configKey: 'racing_active',
          displayName: 'Racing active',
        });
        await profiles.replaceSourceAssociation('racing_active', 'alpha', {});
        await profiles.replaceSourceAssociation('racing_active', 'beta', {});
        await profiles.setProfileLifecycle('racing_active', {
          lifecycleState: 'active',
        });

        const removal = guardedProfiles.removeSourceAssociation(
          'racing_active',
          'alpha',
        );
        await within(
          removalSourcesLocked.promise,
          'association-removal Source locks',
        );
        const archival = sources.setSourceLifecycle('beta', {
          lifecycleState: 'archived',
        });
        await within(
          archivalGuardAcquired.promise,
          'archival Source validity guard',
        );
        await within(
          archivalProfileLockAttempted.promise,
          'archival active Profile lock attempt',
        );

        releaseRemoval.resolve();
        assert.equal((await removal).sources.length, 1);
        await assertSourceError(archival, 'source_required_by_active_profile');
        const profile = await profiles.getProfile('racing_active');
        assert.equal(profile.lifecycleState, 'active');
        assert.deepEqual(
          profile.sources.map((source) => source.configKey),
          ['beta'],
        );
        await assertNoInvalidActiveProfile(removalDatabase);
        await assertProfileAuditActions(removalDatabase, [
          'distribution_profile_created',
          'distribution_profile_source_association_created',
          'distribution_profile_source_association_created',
          'distribution_profile_activated',
          'distribution_profile_source_association_removed',
        ]);
      } finally {
        await Promise.all([removalDatabase.close(), archivalDatabase.close()]);
      }
    });
  },
);

test(
  'overlapping Profile activations acquire shared Source-validity guards without deadlock',
  { timeout: 10_000 },
  async () => {
    await scope.use(async ({ databaseUrl }) => {
      const firstDatabase = createDatabase({ connectionString: databaseUrl });
      const secondDatabase = createDatabase({ connectionString: databaseUrl });
      const firstGuardAcquired = deferred();
      const releaseFirstActivation = deferred();
      let firstGuard = true;
      const guardedFirstDatabase = new CheckpointDatabase(firstDatabase, {
        afterQuery: async (text) => {
          if (firstGuard && isSourceValidityLock(text)) {
            firstGuard = false;
            firstGuardAcquired.resolve();
            await releaseFirstActivation.promise;
          }
        },
      });
      try {
        await seedSource(firstDatabase, 'alpha');
        await seedSource(firstDatabase, 'beta');
        const setup =
          createDistributionProfileAdministrationService(firstDatabase);
        const firstProfiles =
          createDistributionProfileAdministrationService(guardedFirstDatabase);
        const secondProfiles =
          createDistributionProfileAdministrationService(secondDatabase);
        for (const configKey of ['first', 'second']) {
          await setup.createProfile({ configKey, displayName: configKey });
          await setup.replaceSourceAssociation(configKey, 'alpha', {});
          await setup.replaceSourceAssociation(configKey, 'beta', {});
        }

        const firstActivation = firstProfiles.setProfileLifecycle('first', {
          lifecycleState: 'active',
        });
        await within(
          firstGuardAcquired.promise,
          'first activation Source guard',
        );
        const secondActivation = secondProfiles.setProfileLifecycle('second', {
          lifecycleState: 'active',
        });
        releaseFirstActivation.resolve();
        await Promise.all([firstActivation, secondActivation]);
        assert.equal(
          (await setup.getProfile('first')).lifecycleState,
          'active',
        );
        assert.equal(
          (await setup.getProfile('second')).lifecycleState,
          'active',
        );
        await assertNoInvalidActiveProfile(firstDatabase);
      } finally {
        await Promise.all([firstDatabase.close(), secondDatabase.close()]);
      }
    });
  },
);

test(
  'two Source invalidations touching one active Profile allow at most one final-Source loss',
  { timeout: 10_000 },
  async () => {
    await scope.use(async ({ databaseUrl }) => {
      const setupDatabase = createDatabase({ connectionString: databaseUrl });
      const firstDatabase = createDatabase({ connectionString: databaseUrl });
      const secondDatabase = createDatabase({ connectionString: databaseUrl });
      try {
        await seedSource(setupDatabase, 'alpha');
        await seedSource(setupDatabase, 'beta');
        const profiles =
          createDistributionProfileAdministrationService(setupDatabase);
        await profiles.createProfile({
          configKey: 'active_profile',
          displayName: 'Active Profile',
        });
        await profiles.replaceSourceAssociation('active_profile', 'alpha', {});
        await profiles.replaceSourceAssociation('active_profile', 'beta', {});
        await profiles.setProfileLifecycle('active_profile', {
          lifecycleState: 'active',
        });
        const firstSources = createSourceAdministrationService(firstDatabase);
        const secondSources = createSourceAdministrationService(secondDatabase);

        const results = await Promise.allSettled([
          firstSources.setSourceApproval('alpha', {
            approvalState: 'unapproved',
          }),
          secondSources.setSourceLifecycle('beta', {
            lifecycleState: 'archived',
          }),
        ]);
        assert.equal(
          results.filter((result) => result.status === 'fulfilled').length,
          1,
        );
        const rejected = results.find(
          (result): result is PromiseRejectedResult =>
            result.status === 'rejected',
        );
        assert.ok(rejected?.reason instanceof SourceAdministrationError);
        assert.equal(rejected.reason.code, 'source_required_by_active_profile');
        await assertNoInvalidActiveProfile(setupDatabase);
      } finally {
        await Promise.all([
          setupDatabase.close(),
          firstDatabase.close(),
          secondDatabase.close(),
        ]);
      }
    });
  },
);

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

async function assertProfileAuditActions(
  database: ReturnType<typeof createDatabase>,
  actions: readonly string[],
): Promise<void> {
  const result = await database.query<{ readonly action: string }>(
    `SELECT action FROM audit_events WHERE target_type = 'distribution_profile'
     ORDER BY occurred_at ASC, id ASC`,
  );
  assert.deepEqual(
    result.rows.map((row) => row.action),
    actions,
  );
}

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolved: boolean;
  resolve(): void;
}

function deferred(): Deferred {
  let resolvePromise!: () => void;
  let resolved = false;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    get resolved() {
      return resolved;
    },
    resolve() {
      if (!resolved) {
        resolved = true;
        resolvePromise();
      }
    },
  };
}

async function within<T>(promise: Promise<T>, operation: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Timed out waiting for ${operation}.`));
        }, 5_000);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function isSourceValidityLock(text: string): boolean {
  return text.includes('pg_advisory_xact_lock');
}

function isActiveProfileDiscovery(text: string): boolean {
  return (
    text.includes('FROM distribution_profiles profile') &&
    text.includes('association.source_id = $1') &&
    text.includes("profile.lifecycle = 'active'") &&
    text.includes('FOR UPDATE OF profile')
  );
}

function isProfileSourceLock(text: string): boolean {
  return (
    text.includes('FROM distribution_profile_sources ps') &&
    text.includes('WHERE ps.profile_id = $1') &&
    text.includes('FOR UPDATE OF s')
  );
}

interface QueryCheckpoint {
  readonly beforeQuery?: (text: string) => void | Promise<void>;
  readonly afterQuery?: (text: string) => void | Promise<void>;
}

class CheckpointDatabase implements Database {
  readonly #database: Database;
  readonly #checkpoint: QueryCheckpoint;

  constructor(database: Database, checkpoint: QueryCheckpoint) {
    this.#database = database;
    this.#checkpoint = checkpoint;
  }

  query<Row extends import('pg').QueryResultRow = import('pg').QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ) {
    return this.#database.query<Row>(text, values);
  }

  ping(): Promise<void> {
    return this.#database.ping();
  }

  transaction<T>(work: (transaction: QueryExecutor) => Promise<T>): Promise<T> {
    return this.#database.transaction((transaction) =>
      work({
        query: async <
          Row extends import('pg').QueryResultRow = import('pg').QueryResultRow,
        >(
          text: string,
          values?: readonly unknown[],
        ) => {
          await this.#checkpoint.beforeQuery?.(text);
          const result = await transaction.query<Row>(text, values);
          await this.#checkpoint.afterQuery?.(text);
          return result;
        },
      }),
    );
  }

  withSession<T>(work: (session: DatabaseSession) => Promise<T>): Promise<T> {
    return this.#database.withSession(work);
  }

  close(): Promise<void> {
    return this.#database.close();
  }
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
