import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { createDatabase } from '../../src/database/database.ts';
import {
  activateSuccessfulDigestGeneration,
  claimDigestAttempt,
  createSuccessfulDigestGeneration,
  readProfileAiSettings,
  recoverStaleRunningAttemptAndClaim,
  updateProfileAiSettings,
} from '../../src/distribution/digests/repository.ts';
import { createDistributionProfile } from '../../src/distribution/profiles/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const scope = createDatabaseTestScope('migrated');
after(async () => scope.dispose());

test('Profile AI settings default disabled, validate in application and database, and cascade with their Profile', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const profile = await createProfile(database, 'ai_defaults');
      assert.deepEqual(
        await readProfileAiSettings(database, profile.configKey),
        {
          profileId: profile.id,
          profileConfigKey: profile.configKey,
          digestEnabled: false,
          digestLookbackDays: 7,
          digestMaxArticleCount: 20,
          createdAt: (await readProfileAiSettings(database, profile.configKey))!
            .createdAt,
          updatedAt: (await readProfileAiSettings(database, profile.configKey))!
            .updatedAt,
        },
      );
      await assert.rejects(() =>
        updateProfileAiSettings(database, profile.configKey, {
          digestEnabled: true,
          digestLookbackDays: 0,
          digestMaxArticleCount: 20,
        }),
      );
      await assert.rejects(
        database.query(
          'UPDATE distribution_profile_ai_settings SET digest_lookback_days = 31 WHERE profile_id = $1',
          [profile.id],
        ),
      );
      await database.query('DELETE FROM distribution_profiles WHERE id = $1', [
        profile.id,
      ]);
      const remaining = await database.query<{ readonly count: string }>(
        'SELECT count(*)::text AS count FROM distribution_profile_ai_settings WHERE profile_id = $1',
        [profile.id],
      );
      assert.equal(remaining.rows[0]?.count, '0');
    } finally {
      await database.close();
    }
  });
});

test('successful digest records preserve ordered Article provenance, reject cross-Profile activation, and cannot be rewritten', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const first = await createProfile(database, 'digest_first');
      const second = await createProfile(database, 'digest_second');
      const [firstArticle, secondArticle] = await seedArticles(
        database,
        'digest_source',
      );
      const digest = await database.transaction((transaction) =>
        createSuccessfulDigestGeneration(transaction, {
          profileConfigKey: first.configKey,
          digestInputIdentity: 'a'.repeat(64),
          generatedAt: new Date('2026-08-28T12:00:00.000Z'),
          provider: 'gemini',
          model: 'model',
          inputArticleIds: [firstArticle, secondArticle],
          overview: 'Overview',
          highlights: [
            {
              title: 'Highlight',
              explanation: 'Explanation',
              supportingArticleIds: [secondArticle],
            },
          ],
        }),
      );
      assert.deepEqual(digest.inputArticleIds, [firstArticle, secondArticle]);
      await database.transaction((transaction) =>
        activateSuccessfulDigestGeneration(
          transaction,
          first.configKey,
          digest.id,
          new Date('2026-08-28T12:01:00.000Z'),
        ),
      );
      await assert.rejects(
        database.query(
          'INSERT INTO distribution_profile_active_digests (profile_id, generation_id) VALUES ($1, $2)',
          [second.id, digest.id],
        ),
      );
      await assert.rejects(
        database.query(
          'UPDATE distribution_profile_digest_generations SET overview = $2 WHERE id = $1',
          [digest.id, 'Changed'],
        ),
      );
      await assert.rejects(
        database.transaction((transaction) =>
          createSuccessfulDigestGeneration(transaction, {
            profileConfigKey: first.configKey,
            digestInputIdentity: 'b'.repeat(64),
            generatedAt: new Date(),
            provider: 'gemini',
            model: 'model',
            inputArticleIds: [firstArticle],
            overview: 'Overview',
            highlights: [
              {
                title: 'Bad support',
                explanation: 'Explanation',
                supportingArticleIds: [secondArticle],
              },
            ],
          }),
        ),
      );
    } finally {
      await database.close();
    }
  });
});

test('shared attempt claim and stale recovery enforce one running attempt per Profile while allowing independent Profiles', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const firstDatabase = createDatabase({ connectionString: databaseUrl });
    const secondDatabase = createDatabase({ connectionString: databaseUrl });
    try {
      const first = await createProfile(firstDatabase, 'attempt_first');
      const second = await createProfile(firstDatabase, 'attempt_second');
      const startedAt = new Date('2026-08-28T12:00:00.000Z');
      const [scheduled, manual] = await Promise.all([
        claimDigestAttempt(firstDatabase, {
          profileConfigKey: first.configKey,
          triggerKind: 'scheduled',
          scheduledSlot: startedAt,
          startedAt,
        }),
        claimDigestAttempt(secondDatabase, {
          profileConfigKey: first.configKey,
          triggerKind: 'manual',
          startedAt,
        }),
      ]);
      assert.equal(
        [scheduled, manual].filter((outcome) => outcome.kind === 'claimed')
          .length,
        1,
      );
      const winner = [scheduled, manual].find(
        (outcome) => outcome.kind === 'claimed',
      );
      assert.ok(winner !== undefined && winner.kind === 'claimed');
      const independent = await claimDigestAttempt(secondDatabase, {
        profileConfigKey: second.configKey,
        triggerKind: 'manual',
        startedAt,
      });
      assert.equal(independent.kind, 'claimed');
      const recovery = await recoverStaleRunningAttemptAndClaim(firstDatabase, {
        profileConfigKey: first.configKey,
        triggerKind: 'manual',
        startedAt: new Date('2026-08-28T13:00:00.000Z'),
        staleAttemptId: winner.attempt.id,
        staleBefore: new Date('2026-08-28T12:30:00.000Z'),
        recoveredAt: new Date('2026-08-28T13:00:00.000Z'),
      });
      assert.equal(recovery.kind, 'recovered_and_claimed');
      const attempts = await firstDatabase.query<{
        readonly state: string;
        readonly terminal_outcome: string | null;
      }>(
        'SELECT state, terminal_outcome FROM distribution_profile_digest_attempts WHERE profile_id = $1 ORDER BY started_at',
        [first.id],
      );
      assert.deepEqual(attempts.rows, [
        { state: 'completed', terminal_outcome: 'abandoned' },
        { state: 'running', terminal_outcome: null },
      ]);
    } finally {
      await Promise.all([firstDatabase.close(), secondDatabase.close()]);
    }
  });
});

async function createProfile(
  database: ReturnType<typeof createDatabase>,
  configKey: string,
) {
  return createDistributionProfile(database, {
    configKey,
    displayName: configKey,
    lifecycle: 'draft',
    resultLimit: 20,
  });
}

async function seedArticles(
  database: ReturnType<typeof createDatabase>,
  sourceKey: string,
): Promise<readonly [string, string]> {
  const sourceId = randomUUID();
  const first = randomUUID(),
    second = randomUUID();
  await database.query(
    `INSERT INTO sources (id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state)
     VALUES ($1, $2, 'Digest Source', 'https://digest.example/', 'approved', 'active', 'enabled')`,
    [sourceId, sourceKey],
  );
  await database.query(
    `INSERT INTO articles (id, source_id, original_url, canonical_identity_url, display_title, normalized_title, published_at_status, source_updated_at_status, first_seen_at, last_seen_at)
     VALUES ($1, $3, 'https://digest.example/one', 'https://digest.example/one', 'One', 'one', 'missing', 'missing', now(), now()),
            ($2, $3, 'https://digest.example/two', 'https://digest.example/two', 'Two', 'two', 'missing', 'missing', now(), now())`,
    [first, second, sourceId],
  );
  return [first, second];
}
