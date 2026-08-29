import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import {
  createProfileAiAdministrationService,
  ProfileAiAdministrationError,
} from '../../src/admin/profile-ai-administration.ts';
import { createDatabase } from '../../src/database/database.ts';
import type { DigestLifecycleService } from '../../src/distribution/digests/lifecycle.ts';
import type { PersistedDigestAttempt } from '../../src/distribution/digests/repository.ts';
import { createDistributionProfile } from '../../src/distribution/profiles/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const scope = createDatabaseTestScope('migrated');
after(async () => scope.dispose());

test('Profile AI administration persists bounded configuration, audits once, and maps producer status without secret data', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await createDistributionProfile(database, {
        configKey: 'film_news',
        displayName: 'Film news',
        lifecycle: 'draft',
        resultLimit: 25,
      });
      let forceCalls = 0;
      const service = createProfileAiAdministrationService(
        database,
        lifecycle(async () => {
          forceCalls += 1;
          return Object.freeze({
            kind: 'failed' as const,
            claimed: true,
            recoveredStaleAttempt: false,
            failureCategory: 'provider_unconfigured' as const,
          });
        }),
      );

      assert.deepEqual(await service.getProfileAi('film_news'), {
        profileKey: 'film_news',
        configuration: {
          digestEnabled: false,
          lookbackDays: 7,
          maxArticles: 20,
          digestStyleGuidance: null,
        },
        cadence: { kind: 'twice_daily', slots: ['00:00Z', '12:00Z'] },
        activeDigest: null,
        latestAttempt: null,
      });
      const updated = await service.updateProfileAiConfiguration('film_news', {
        digestEnabled: true,
        lookbackDays: 14,
        maxArticles: 10,
        digestStyleGuidance: '  Write for working filmmakers.  ',
      });
      assert.deepEqual(updated.configuration, {
        digestEnabled: true,
        lookbackDays: 14,
        maxArticles: 10,
        digestStyleGuidance: 'Write for working filmmakers.',
      });
      assert.equal(forceCalls, 0);
      const audit = await database.query<{
        readonly action: string;
        readonly prior_state: unknown;
        readonly new_state: unknown;
      }>(
        `SELECT action, prior_state, new_state FROM audit_events
          WHERE action = 'distribution_profile_ai_configuration_changed'`,
      );
      assert.deepEqual(audit.rows, [
        {
          action: 'distribution_profile_ai_configuration_changed',
          prior_state: {
            digestEnabled: false,
            lookbackDays: 7,
            maxArticles: 20,
            digestStyleGuidance: null,
          },
          new_state: {
            digestEnabled: true,
            lookbackDays: 14,
            maxArticles: 10,
            digestStyleGuidance: 'Write for working filmmakers.',
          },
        },
      ]);

      await assertProfileAiError(
        service.updateProfileAiConfiguration('film_news', {
          digestEnabled: true,
          lookbackDays: '14',
          maxArticles: 10,
          unexpected: true,
        }),
        'invalid_request',
      );
      const count = await database.query<{ readonly count: string }>(
        `SELECT count(*)::text AS count FROM audit_events
          WHERE action = 'distribution_profile_ai_configuration_changed'`,
      );
      assert.equal(count.rows[0]?.count, '1');

      const preserved = await service.updateProfileAiConfiguration(
        'film_news',
        {
          digestEnabled: true,
          lookbackDays: 14,
          maxArticles: 10,
        },
      );
      assert.equal(
        preserved.configuration.digestStyleGuidance,
        'Write for working filmmakers.',
      );
      assert.equal(
        (
          await database.query<{ readonly count: string }>(
            `SELECT count(*)::text AS count FROM audit_events
              WHERE action = 'distribution_profile_ai_configuration_changed'`,
          )
        ).rows[0]?.count,
        '1',
      );
      await service.updateProfileAiConfiguration('film_news', {
        digestEnabled: true,
        lookbackDays: 14,
        maxArticles: 10,
        digestStyleGuidance: ' \n ',
      });
      assert.equal(
        (await service.getProfileAi('film_news')).configuration
          .digestStyleGuidance,
        null,
      );
      await assertProfileAiError(
        service.updateProfileAiConfiguration('film_news', {
          digestEnabled: true,
          lookbackDays: 14,
          maxArticles: 10,
          digestStyleGuidance: '🙂'.repeat(501),
        }),
        'invalid_request',
      );
      assert.equal(forceCalls, 0);

      const generated = await service.forceGenerateProfileDigest('film_news');
      assert.equal(generated.result, 'completed_unsuccessfully');
      assert.equal(forceCalls, 1);
      assert.doesNotMatch(
        JSON.stringify(generated),
        /apiKey|prompt|raw|secret/iu,
      );
    } finally {
      await database.close();
    }
  });
});

function lifecycle(
  force: DigestLifecycleService['forceGenerate'],
): DigestLifecycleService {
  return {
    forceGenerate: force,
    evaluateScheduled: async () =>
      Object.freeze({
        kind: 'scheduled_slot_claimed' as const,
        claimed: false,
        recoveredStaleAttempt: false,
      }),
    readActiveDigest: async () => null,
    readStatus: async () =>
      Object.freeze({
        digest: null,
        latestAttempt: null as PersistedDigestAttempt | null,
      }),
  };
}

async function assertProfileAiError(
  promise: Promise<unknown>,
  code: ProfileAiAdministrationError['code'],
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ProfileAiAdministrationError);
    assert.equal(error.code, code);
    return true;
  });
}
