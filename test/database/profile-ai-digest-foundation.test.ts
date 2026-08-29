import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { createDatabase } from '../../src/database/database.ts';
import { createDigestLifecycleService } from '../../src/distribution/digests/lifecycle.ts';
import type { DigestInputService } from '../../src/distribution/digests/input.ts';
import type { DigestGenerationResult } from '../../src/distribution/digests/provider.ts';
import {
  activateSuccessfulDigestGeneration,
  claimDigestAttempt,
  completeDigestAttempt,
  completeDigestAttemptInTransaction,
  createSuccessfulDigestGeneration,
  findActiveDigest,
  findLatestDigestAttempt,
  findRunningDigestAttempt,
  readProfileAiSettings,
  recoverStaleRunningAttemptAndClaim,
  suppressActiveDigestInTransaction,
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

test('digest lifecycle keeps a running default-budget attempt owned until its stale margin expires', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const profile = await createProfile(database, 'lifecycle_timeout_budget');
      const startedAt = new Date('2026-08-28T12:00:00.000Z');
      let now = new Date(startedAt.getTime());
      const input = lifecycleInput(profile.id, profile.configKey, startedAt);
      const inputService: DigestInputService = {
        async read() {
          return { kind: 'active' as const, input };
        },
        async readForLifecycle() {
          return {
            kind: 'active' as const,
            input,
            canonicalArticles: [],
          };
        },
      };
      const firstProviderStarted = deferred<void>();
      const firstProviderResult = deferred<DigestGenerationResult>();
      const failure: DigestGenerationResult = Object.freeze({
        kind: 'failure',
        category: 'provider_transport_failure',
      });
      let providerCalls = 0;
      const lifecycle = createDigestLifecycleService({
        database,
        input: inputService,
        now: () => new Date(now.getTime()),
        provider: {
          async generate() {
            providerCalls += 1;
            if (providerCalls === 1) {
              firstProviderStarted.resolve();
              return firstProviderResult.promise;
            }
            return failure;
          },
        },
      });

      const firstEvaluation = lifecycle.forceGenerate(profile.configKey);
      await firstProviderStarted.promise;

      now = new Date(startedAt.getTime() + 30_001);
      const stillOwned = await lifecycle.forceGenerate(profile.configKey);
      assert.equal(stillOwned.kind, 'already_running');
      assert.equal(stillOwned.recoveredStaleAttempt, false);

      now = new Date(startedAt.getTime() + 305_001);
      const recovered = await lifecycle.forceGenerate(profile.configKey);
      assert.equal(recovered.kind, 'failed');
      if (recovered.kind !== 'failed') return;
      assert.equal(recovered.failureCategory, 'provider_transport_failure');
      assert.equal(recovered.claimed, true);
      assert.equal(recovered.recoveredStaleAttempt, true);
      assert.match(recovered.attemptId ?? '', /^[0-9a-f-]{36}$/u);

      firstProviderResult.resolve(failure);
      const firstResult = await firstEvaluation;
      assert.equal(firstResult.kind, 'failed');
      assert.equal(providerCalls, 2);
    } finally {
      await database.close();
    }
  });
});

test('digest lifecycle repository exposes bounded attempt reads and exact truthful completion', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const first = await createProfile(database, 'lifecycle_first');
      const second = await createProfile(database, 'lifecycle_second');
      assert.equal(
        await findRunningDigestAttempt(database, first.configKey),
        undefined,
      );
      const claim = await claimDigestAttempt(database, {
        profileConfigKey: first.configKey,
        triggerKind: 'manual',
        startedAt: new Date('2026-08-28T12:00:00.000Z'),
      });
      assert.equal(claim.kind, 'claimed');
      if (claim.kind !== 'claimed') return;
      assert.equal(
        (await findRunningDigestAttempt(database, first.configKey))?.id,
        claim.attempt.id,
      );
      await assert.rejects(
        database.transaction(async (transaction) => {
          await transaction.query(
            'DROP INDEX distribution_profile_digest_attempts_one_running_per_profile',
          );
          await transaction.query(
            `INSERT INTO distribution_profile_digest_attempts
               (id, profile_id, trigger_kind, state, started_at)
             VALUES ($1, $2, 'manual', 'running', $3)`,
            [randomUUID(), first.id, new Date('2026-08-28T12:00:01.000Z')],
          );
          await findRunningDigestAttempt(transaction, first.configKey);
        }),
        /running-attempt state is invalid/u,
      );
      assert.equal(
        await findRunningDigestAttempt(database, second.configKey),
        undefined,
      );
      await assert.rejects(() =>
        completeDigestAttempt(database, {
          profileConfigKey: second.configKey,
          attemptId: claim.attempt.id,
          terminalOutcome: 'skipped_disabled',
          completedAt: new Date('2026-08-28T12:01:00.000Z'),
        }),
      );
      await assert.rejects(() =>
        completeDigestAttempt(database, {
          profileConfigKey: first.configKey,
          attemptId: claim.attempt.id,
          terminalOutcome: 'skipped_disabled',
          completedAt: new Date('2026-08-28T12:01:00.000Z'),
          provider: 'gemini',
        }),
      );
      const completed = await completeDigestAttempt(database, {
        profileConfigKey: first.configKey,
        attemptId: claim.attempt.id,
        terminalOutcome: 'skipped_disabled',
        completedAt: new Date('2026-08-28T12:01:00.000Z'),
      });
      assert.equal(completed.terminalOutcome, 'skipped_disabled');
      assert.equal(
        await findRunningDigestAttempt(database, first.configKey),
        undefined,
      );
      await assert.rejects(() =>
        completeDigestAttempt(database, {
          profileConfigKey: first.configKey,
          attemptId: claim.attempt.id,
          terminalOutcome: 'skipped_disabled',
          completedAt: new Date('2026-08-28T12:02:00.000Z'),
        }),
      );
      const replacement = await claimDigestAttempt(database, {
        profileConfigKey: first.configKey,
        triggerKind: 'manual',
        startedAt: new Date('2026-08-28T12:03:00.000Z'),
      });
      assert.equal(replacement.kind, 'claimed');
      if (replacement.kind !== 'claimed') return;
      const latest = await findLatestDigestAttempt(database, first.configKey);
      assert.equal(latest?.id, replacement.attempt.id);
      const terminalInputs = [
        {
          terminalOutcome: 'skipped_no_input' as const,
          inputArticleCount: 0,
        },
        {
          terminalOutcome: 'skipped_unchanged' as const,
          digestInputIdentity: 'a'.repeat(64),
          inputArticleCount: 1,
        },
        {
          terminalOutcome: 'failed' as const,
          failureCategory: 'timeout' as const,
          provider: 'gemini',
          model: 'model',
          urlContextSucceededCount: 1,
        },
      ];
      let runningAttempt = replacement.attempt;
      for (const [index, input] of terminalInputs.entries()) {
        await completeDigestAttempt(database, {
          profileConfigKey: first.configKey,
          attemptId: runningAttempt.id,
          completedAt: new Date(
            `2026-08-28T12:${String(4 + index * 10).padStart(2, '0')}:00.000Z`,
          ),
          ...input,
        });
        if (index < terminalInputs.length - 1) {
          const next = await claimDigestAttempt(database, {
            profileConfigKey: first.configKey,
            triggerKind: 'manual',
            startedAt: new Date(
              `2026-08-28T12:${String(10 + index * 10).padStart(2, '0')}:00.000Z`,
            ),
          });
          assert.equal(next.kind, 'claimed');
          if (next.kind !== 'claimed') return;
          runningAttempt = next.attempt;
        }
      }
      assert.equal(
        (await findLatestDigestAttempt(database, first.configKey))?.id,
        runningAttempt.id,
      );
      const scheduledSlot = new Date('2026-08-28T14:00:00.000Z');
      const scheduled = await claimDigestAttempt(database, {
        profileConfigKey: first.configKey,
        triggerKind: 'scheduled',
        scheduledSlot,
        startedAt: scheduledSlot,
      });
      assert.equal(scheduled.kind, 'claimed');
      if (scheduled.kind !== 'claimed') return;
      await completeDigestAttempt(database, {
        profileConfigKey: first.configKey,
        attemptId: scheduled.attempt.id,
        terminalOutcome: 'failed',
        completedAt: new Date('2026-08-28T14:01:00.000Z'),
        failureCategory: 'dependency_failure',
      });
      assert.deepEqual(
        await claimDigestAttempt(database, {
          profileConfigKey: first.configKey,
          triggerKind: 'scheduled',
          scheduledSlot,
          startedAt: new Date('2026-08-28T14:02:00.000Z'),
        }),
        { kind: 'scheduled_slot_claimed' },
      );
    } finally {
      await database.close();
    }
  });
});

test('digest lifecycle transaction composition rolls back coherently and serializes recovery with completion', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const primary = createDatabase({ connectionString: databaseUrl });
    const contender = createDatabase({ connectionString: databaseUrl });
    try {
      const first = await createProfile(primary, 'composition_first');
      const second = await createProfile(primary, 'composition_second');
      const [article] = await seedArticles(primary, 'composition_source');
      const firstClaim = await claimDigestAttempt(primary, {
        profileConfigKey: first.configKey,
        triggerKind: 'scheduled',
        scheduledSlot: new Date('2026-08-28T12:00:00.000Z'),
        startedAt: new Date('2026-08-28T12:00:00.000Z'),
      });
      assert.equal(firstClaim.kind, 'claimed');
      if (firstClaim.kind !== 'claimed') return;
      await assert.rejects(
        primary.transaction(async (transaction) => {
          const digest = await createSuccessfulDigestGeneration(transaction, {
            profileConfigKey: first.configKey,
            digestInputIdentity: 'b'.repeat(64),
            generatedAt: new Date('2026-08-28T12:01:00.000Z'),
            provider: 'gemini',
            model: 'model',
            inputArticleIds: [article],
            overview: 'Overview',
            highlights: [],
          });
          await activateSuccessfulDigestGeneration(
            transaction,
            first.configKey,
            digest.id,
            new Date('2026-08-28T12:01:00.000Z'),
          );
          await completeDigestAttemptInTransaction(transaction, {
            profileConfigKey: first.configKey,
            attemptId: firstClaim.attempt.id,
            terminalOutcome: 'success',
            completedAt: new Date('2026-08-28T12:01:00.000Z'),
            digestInputIdentity: 'b'.repeat(64),
            inputArticleCount: 1,
            provider: 'gemini',
            model: 'model',
          });
          throw new Error('force rollback');
        }),
      );
      assert.equal(await findActiveDigest(primary, first.configKey), undefined);
      assert.equal(
        (await findRunningDigestAttempt(primary, first.configKey))?.id,
        firstClaim.attempt.id,
      );
      await primary.transaction(async (transaction) => {
        const digest = await createSuccessfulDigestGeneration(transaction, {
          profileConfigKey: first.configKey,
          digestInputIdentity: 'c'.repeat(64),
          generatedAt: new Date('2026-08-28T12:02:00.000Z'),
          provider: 'gemini',
          model: 'model',
          inputArticleIds: [article],
          overview: 'Overview',
          highlights: [],
        });
        await activateSuccessfulDigestGeneration(
          transaction,
          first.configKey,
          digest.id,
          new Date('2026-08-28T12:02:00.000Z'),
        );
        await completeDigestAttemptInTransaction(transaction, {
          profileConfigKey: first.configKey,
          attemptId: firstClaim.attempt.id,
          terminalOutcome: 'success',
          completedAt: new Date('2026-08-28T12:02:00.000Z'),
          digestInputIdentity: 'c'.repeat(64),
          inputArticleCount: 1,
          provider: 'gemini',
          model: 'model',
        });
      });
      const priorActive = await findActiveDigest(primary, first.configKey);
      assert.ok(priorActive);
      const generationsBeforeRejectedCompletion = await primary.query<{
        readonly count: string;
      }>(
        `SELECT count(*)::text AS count
             FROM distribution_profile_digest_generations
            WHERE profile_id = $1`,
        [first.id],
      );
      await assert.rejects(
        primary.transaction(async (transaction) => {
          const digest = await createSuccessfulDigestGeneration(transaction, {
            profileConfigKey: first.configKey,
            digestInputIdentity: 'd'.repeat(64),
            generatedAt: new Date('2026-08-28T12:02:30.000Z'),
            provider: 'gemini',
            model: 'model',
            inputArticleIds: [article],
            overview: 'Rejected completion',
            highlights: [],
          });
          await activateSuccessfulDigestGeneration(
            transaction,
            first.configKey,
            digest.id,
            new Date('2026-08-28T12:02:30.000Z'),
          );
          await completeDigestAttemptInTransaction(transaction, {
            profileConfigKey: first.configKey,
            attemptId: randomUUID(),
            terminalOutcome: 'success',
            completedAt: new Date('2026-08-28T12:02:30.000Z'),
            digestInputIdentity: 'd'.repeat(64),
            inputArticleCount: 1,
            provider: 'gemini',
            model: 'model',
          });
        }),
      );
      assert.equal(
        (await findActiveDigest(primary, first.configKey))?.id,
        priorActive.id,
      );
      assert.equal(
        (
          await primary.query<{ readonly count: string }>(
            `SELECT count(*)::text AS count
               FROM distribution_profile_digest_generations
              WHERE profile_id = $1`,
            [first.id],
          )
        ).rows[0]?.count,
        generationsBeforeRejectedCompletion.rows[0]?.count,
      );
      const suppressionClaim = await claimDigestAttempt(primary, {
        profileConfigKey: first.configKey,
        triggerKind: 'manual',
        startedAt: new Date('2026-08-28T12:03:00.000Z'),
      });
      assert.equal(suppressionClaim.kind, 'claimed');
      if (suppressionClaim.kind !== 'claimed') return;
      await assert.rejects(
        primary.transaction(async (transaction) => {
          assert.equal(
            await suppressActiveDigestInTransaction(
              transaction,
              first.configKey,
            ),
            true,
          );
          await completeDigestAttemptInTransaction(transaction, {
            profileConfigKey: first.configKey,
            attemptId: suppressionClaim.attempt.id,
            terminalOutcome: 'skipped_disabled',
            completedAt: new Date('2026-08-28T12:04:00.000Z'),
          });
          throw new Error('force rollback');
        }),
      );
      assert.ok(await findActiveDigest(primary, first.configKey));
      assert.equal(
        (await findRunningDigestAttempt(primary, first.configKey))?.id,
        suppressionClaim.attempt.id,
      );
      await primary.transaction(async (transaction) => {
        await suppressActiveDigestInTransaction(transaction, first.configKey);
        await completeDigestAttemptInTransaction(transaction, {
          profileConfigKey: first.configKey,
          attemptId: suppressionClaim.attempt.id,
          terminalOutcome: 'skipped_disabled',
          completedAt: new Date('2026-08-28T12:04:00.000Z'),
        });
      });
      assert.equal(await findActiveDigest(primary, first.configKey), undefined);
      assert.equal(
        await primary.transaction((transaction) =>
          suppressActiveDigestInTransaction(transaction, first.configKey),
        ),
        false,
      );

      const raceClaim = await claimDigestAttempt(primary, {
        profileConfigKey: first.configKey,
        triggerKind: 'manual',
        startedAt: new Date('2026-08-28T12:05:00.000Z'),
      });
      assert.equal(raceClaim.kind, 'claimed');
      if (raceClaim.kind !== 'claimed') return;
      const [recovery, completion] = await Promise.allSettled([
        recoverStaleRunningAttemptAndClaim(contender, {
          profileConfigKey: first.configKey,
          triggerKind: 'manual',
          startedAt: new Date('2026-08-28T13:00:00.000Z'),
          staleAttemptId: raceClaim.attempt.id,
          staleBefore: new Date('2026-08-28T12:30:00.000Z'),
          recoveredAt: new Date('2026-08-28T13:00:00.000Z'),
        }),
        completeDigestAttempt(primary, {
          profileConfigKey: first.configKey,
          attemptId: raceClaim.attempt.id,
          terminalOutcome: 'failed',
          completedAt: new Date('2026-08-28T13:00:00.000Z'),
          failureCategory: 'timeout',
        }),
      ]);
      const recovered =
        recovery.status === 'fulfilled' &&
        recovery.value.kind === 'recovered_and_claimed';
      assert.equal(recovered, completion.status === 'rejected');
      const raceHistory = await primary.query<{
        readonly state: string;
        readonly terminal_outcome: string | null;
      }>(
        `SELECT state, terminal_outcome
           FROM distribution_profile_digest_attempts
          WHERE id = $1 OR profile_id = $2 AND state = 'running'
          ORDER BY started_at ASC`,
        [raceClaim.attempt.id, first.id],
      );
      assert.equal(raceHistory.rows[0]?.state, 'completed');
      assert.ok(
        raceHistory.rows[0]?.terminal_outcome === 'abandoned' ||
          raceHistory.rows[0]?.terminal_outcome === 'failed',
      );
      assert.ok(raceHistory.rows.length <= 2);
      const independent = await claimDigestAttempt(contender, {
        profileConfigKey: second.configKey,
        triggerKind: 'manual',
        startedAt: new Date('2026-08-28T13:00:00.000Z'),
      });
      assert.equal(independent.kind, 'claimed');
    } finally {
      await Promise.all([primary.close(), contender.close()]);
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

function lifecycleInput(
  profileId: string,
  profileConfigKey: string,
  resolvedAt: Date,
) {
  return Object.freeze({
    profile: Object.freeze({
      configKey: profileConfigKey,
      displayName: profileConfigKey,
    }),
    settings: Object.freeze({
      profileId,
      profileConfigKey,
      digestEnabled: true,
      digestLookbackDays: 7,
      digestMaxArticleCount: 20,
      createdAt: new Date(resolvedAt.getTime()),
      updatedAt: new Date(resolvedAt.getTime()),
    }),
    resolvedAt: new Date(resolvedAt.getTime()),
    articles: Object.freeze([
      Object.freeze({
        articleId: 'lifecycle-timeout-article',
        headline: 'Lifecycle timeout test',
        sourceDisplayName: 'Lifecycle test source',
        effectiveFeedDate: new Date(resolvedAt.getTime()),
        publishedAt: null,
        author: null,
        summary: 'Bounded test summary.',
        categories: Object.freeze([]),
        originalUrl: 'https://lifecycle.example/article',
      }),
    ]),
    digestInputIdentity: 'a'.repeat(64),
  });
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
