import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import {
  persistExcludedArticleObservation,
  persistIncludedArticle,
  type ArticlePersistenceResult,
} from '../../src/articles/repository.ts';
import { processIncludedArticle } from '../../src/collection/included-article-processing.ts';
import { detectDuplicateReviewsInTransaction } from '../../src/deduplication/repository.ts';
import { applyArticleLinkPolicy } from '../../src/collection/article-links/policy.ts';
import {
  collectEndpoint,
  CollectionRunFinalizationError,
  createCollectionRunStore,
  type CollectionRunStore,
} from '../../src/collection/collect-endpoint.ts';
import { createEndpointExecutionLockRunner } from '../../src/collection/execution.ts';
import type {
  HttpFetcher,
  HttpFetcherResult,
} from '../../src/collection/fetchers/http-fetcher.ts';
import { normalizeArticleCandidate } from '../../src/collection/normalization/normalizer.ts';
import type { FeedParser } from '../../src/collection/parsers/parser.ts';
import type { RawItem } from '../../src/collection/raw-item.ts';
import {
  evaluateRelevance,
  type EffectiveRelevanceConfiguration,
  type RelevanceDecision,
} from '../../src/collection/relevance/evaluator.ts';
import { loadEffectiveRelevanceConfiguration } from '../../src/collection/relevance/repository.ts';
import {
  createCategory,
  createRelevanceRule,
  updateRelevanceRule,
} from '../../src/collection/relevance/repository.ts';
import {
  finalizeCollectionRun,
  findCollectionRunById,
  startCollectionRun,
  type FinalizeCollectionRunInput,
} from '../../src/collection/runs/repository.ts';
import { createDatabase, type Database } from '../../src/database/database.ts';
import { insertPublicationSettings } from '../../src/publication/repository.ts';
import {
  findEndpointConfigurationByKeys,
  insertSource,
  insertSourceEndpoint,
  type EndpointConfigurationAggregate,
} from '../../src/sources/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const FIRST_OBSERVATION = new Date('2026-08-10T12:00:00.000Z');
const SECOND_OBSERVATION = new Date('2026-08-10T13:00:00.000Z');
const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

test('canonical collection persists idempotent Articles and isolated outcomes with real PostgreSQL', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const configuration = await createConfiguration(database);
      const baseItems = [
        item('publisher-one', 'One', '../articles/one'),
        item('publisher-two', 'Two', '../articles/two'),
      ];

      const first = await execute(
        database,
        configuration,
        'p5-first',
        baseItems,
        {
          observationTime: () => FIRST_OBSERVATION,
        },
      );
      assertAttempt(first, ['succeeded', 2, 0, 0, 0, 0, 0]);
      assert.deepEqual(await cardinality(database), {
        articles: 2,
        observations: 2,
      });
      await assertRunMatches(database, first);

      const second = await execute(
        database,
        configuration,
        'p5-second',
        baseItems,
        { observationTime: () => SECOND_OBSERVATION },
      );
      assertAttempt(second, ['succeeded', 0, 0, 2, 0, 0, 0]);
      assert.deepEqual(await cardinality(database), {
        articles: 2,
        observations: 4,
      });
      const seen = await database.query<{
        first_seen_at: Date;
        last_seen_at: Date;
      }>(
        'SELECT first_seen_at, last_seen_at FROM articles ORDER BY external_id',
      );
      assert.equal(
        seen.rows[0]?.first_seen_at.toISOString(),
        FIRST_OBSERVATION.toISOString(),
      );
      assert.equal(
        seen.rows[0]?.last_seen_at.toISOString(),
        SECOND_OBSERVATION.toISOString(),
      );
      await assertRunMatches(database, second);

      const mixed = await execute(
        database,
        configuration,
        'p5-mixed',
        [
          item('publisher-one', 'One', '../articles/one'),
          item('publisher-three', 'Three', '../articles/three'),
          item(
            'publisher-conflict',
            'Expected conflict',
            '../articles/conflict',
          ),
          item(
            'publisher-rejected',
            'Rejected',
            'https://outside.example/article',
          ),
        ],
        {
          observationTime: () => new Date('2026-08-10T14:00:00.000Z'),
          persistArticle(candidate, observationTime, decision) {
            return candidate.displayTitle === 'Expected conflict'
              ? Promise.resolve(
                  Object.freeze({
                    outcome: 'failed' as const,
                    reason: 'identity_conflict' as const,
                  }),
                )
              : persistIncludedArticle(
                  database,
                  candidate,
                  observationTime,
                  decision,
                );
          },
        },
      );
      assertAttempt(mixed, ['succeeded', 1, 0, 1, 1, 0, 1]);
      assert.equal(mixed.rejectedCount, mixed.articleLinkRejectionCount);
      assert.equal(mixed.excludedCount, 0);
      assert.deepEqual(await cardinality(database), {
        articles: 3,
        observations: 6,
      });
      await assertRunMatches(database, mixed);

      let stagePersistenceCalls = 0;
      const stageFailure = await execute(
        database,
        configuration,
        'p5-stage-failure',
        [
          item('publisher-four', 'Four', '../articles/four'),
          item('publisher-fatal', 'Fatal', '../articles/fatal'),
          item(
            'publisher-unattempted',
            'Unattempted',
            '../articles/unattempted',
          ),
        ],
        {
          observationTime: () => new Date('2026-08-10T15:00:00.000Z'),
          async persistArticle(candidate, observationTime, decision) {
            stagePersistenceCalls += 1;
            if (stagePersistenceCalls === 2) {
              throw new Error('SYNTHETIC_DATABASE_SECRET');
            }
            return persistIncludedArticle(
              database,
              candidate,
              observationTime,
              decision,
            );
          },
        },
      );
      assertAttempt(stageFailure, ['failed', 1, 0, 0, 0, 0, 2]);
      assert.equal(stageFailure.status, 'failed');
      assert.equal(stageFailure.reason, 'article_persistence_execution_failed');
      assert.equal(stageFailure.detail?.includes('SECRET'), false);
      assert.equal(stagePersistenceCalls, 2);
      assert.deepEqual(await cardinality(database), {
        articles: 4,
        observations: 7,
      });
      await assertRunMatches(database, stageFailure);

      const realRuns = createCollectionRunStore(database);
      const failingRuns: CollectionRunStore = Object.freeze({
        start: realRuns.start,
        async finalize() {
          throw new Error('SYNTHETIC_FINALIZATION_SECRET');
        },
      });
      await assert.rejects(
        execute(
          database,
          configuration,
          'p5-finalization-failure',
          [item('publisher-five', 'Five', '../articles/five')],
          {
            observationTime: () => new Date('2026-08-10T16:00:00.000Z'),
            runs: failingRuns,
          },
        ),
        (error: unknown) => {
          assert.ok(error instanceof CollectionRunFinalizationError);
          assertAttempt(error.attemptedResult, ['succeeded', 1, 0, 0, 0, 0, 0]);
          return true;
        },
      );
      assert.deepEqual(await cardinality(database), {
        articles: 5,
        observations: 8,
      });

      const afterFailure = await execute(
        database,
        configuration,
        'p5-after-finalization-failure',
        [item('publisher-five', 'Five', '../articles/five')],
        { observationTime: () => new Date('2026-08-10T17:00:00.000Z') },
      );
      assertAttempt(afterFailure, ['succeeded', 0, 0, 1, 0, 0, 0]);
      assert.deepEqual(await cardinality(database), {
        articles: 5,
        observations: 9,
      });
    } finally {
      await database.close();
    }
  });
});

test('included Article processing commits duplicate effects atomically and accounts them independently', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const firstConfiguration = await createConfiguration(database);
      const initial = await execute(
        database,
        firstConfiguration,
        'duplicate-first',
        [item('duplicate-first', 'Shared story', '../articles/shared')],
        { observationTime: () => FIRST_OBSERVATION },
      );
      assertAttempt(initial, ['succeeded', 1, 0, 0, 0, 0, 0]);

      const second = await createAdditionalSource(database, 'duplicate_second');
      const secondRun = await startCollectionRun(database, {
        sourceEndpointId: second.endpointId,
        executionId: 'duplicate-second-run',
      });
      const secondCandidate = normalizedCandidate(
        second.sourceId,
        second.endpointId,
        secondRun.id,
        'Shared story',
        'https://feeds.example.test/articles/shared',
      );
      const included = evaluateRelevance(
        secondCandidate,
        emptyRelevanceConfiguration(second.sourceId, second.endpointId),
      );
      assert.equal(included.included, true);
      if (!included.included) return;

      const firstProcessing = await processIncludedArticle(
        database,
        secondCandidate,
        SECOND_OBSERVATION,
        included,
      );
      assert.equal(firstProcessing.outcome, 'created');
      assert.equal(firstProcessing.duplicateReviewCreatedCount, 1);
      assert.equal(firstProcessing.duplicateGroupedCount, 1);
      await finalizeCollectionRun(
        database,
        secondRun.id,
        finalization({
          createdCount: 1,
          duplicateReviewCreatedCount: 1,
          duplicateGroupedCount: 1,
        }),
      );
      const persistedSecondRun = await findCollectionRunById(
        database,
        secondRun.id,
      );
      assert.equal(persistedSecondRun?.duplicateReviewCreatedCount, 1);
      assert.equal(persistedSecondRun?.duplicateGroupedCount, 1);

      const repeatRun = await startCollectionRun(database, {
        sourceEndpointId: second.endpointId,
        executionId: 'duplicate-repeat-run',
      });
      const repeatCandidate = normalizedCandidate(
        second.sourceId,
        second.endpointId,
        repeatRun.id,
        'Shared story',
        'https://feeds.example.test/articles/shared',
      );
      const repeatDecision = evaluateRelevance(
        repeatCandidate,
        emptyRelevanceConfiguration(second.sourceId, second.endpointId),
      );
      assert.equal(repeatDecision.included, true);
      if (!repeatDecision.included) return;
      const repeated = await processIncludedArticle(
        database,
        repeatCandidate,
        new Date('2026-08-10T14:00:00.000Z'),
        repeatDecision,
      );
      assert.equal(repeated.outcome, 'unchanged');
      assert.equal(repeated.duplicateReviewCreatedCount, 0);
      assert.equal(repeated.duplicateGroupedCount, 0);

      const third = await createAdditionalSource(database, 'duplicate_third');
      const thirdRun = await startCollectionRun(database, {
        sourceEndpointId: third.endpointId,
        executionId: 'duplicate-third-run',
      });
      const weakCandidate = normalizedCandidate(
        third.sourceId,
        third.endpointId,
        thirdRun.id,
        'Shared story',
        'https://feeds.example.test/articles/related',
      );
      const weakDecision = evaluateRelevance(
        weakCandidate,
        emptyRelevanceConfiguration(third.sourceId, third.endpointId),
      );
      assert.equal(weakDecision.included, true);
      if (!weakDecision.included) return;
      const weak = await processIncludedArticle(
        database,
        weakCandidate,
        new Date('2026-08-10T15:00:00.000Z'),
        weakDecision,
      );
      assert.equal(weak.outcome, 'created');
      assert.equal(weak.duplicateReviewCreatedCount, 2);
      assert.equal(weak.duplicateGroupedCount, 0);

      const counts = await database.query<{
        articles: string;
        observations: string;
      }>(
        `SELECT (SELECT count(*) FROM articles) AS articles,
                (SELECT count(*) FROM article_observations) AS observations`,
      );
      assert.deepEqual(counts.rows[0], { articles: '3', observations: '4' });
    } finally {
      await database.close();
    }
  });
});

test('duplicate failure rolls back the current Article and observation transaction', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const firstConfiguration = await createConfiguration(database);
      const initial = await execute(
        database,
        firstConfiguration,
        'duplicate-rollback-first',
        [item('rollback-first', 'Rollback story', '../articles/rollback')],
        { observationTime: () => FIRST_OBSERVATION },
      );
      assertAttempt(initial, ['succeeded', 1, 0, 0, 0, 0, 0]);
      const second = await createAdditionalSource(database, 'rollback_second');
      const run = await startCollectionRun(database, {
        sourceEndpointId: second.endpointId,
        executionId: 'duplicate-rollback-run',
      });
      const candidate = normalizedCandidate(
        second.sourceId,
        second.endpointId,
        run.id,
        'Rollback story',
        'https://feeds.example.test/articles/rollback',
      );
      const decision = evaluateRelevance(
        candidate,
        emptyRelevanceConfiguration(second.sourceId, second.endpointId),
      );
      assert.equal(decision.included, true);
      if (!decision.included) return;

      await assert.rejects(
        processIncludedArticle(
          database,
          candidate,
          SECOND_OBSERVATION,
          decision,
          {
            detectDuplicateReviews: async () => {
              throw new Error('synthetic P3 failure');
            },
            groupStrongDuplicateCandidate: async () => {
              throw new Error('not reached');
            },
          },
        ),
      );
      await assert.rejects(
        processIncludedArticle(
          database,
          candidate,
          SECOND_OBSERVATION,
          decision,
          {
            detectDuplicateReviews: detectDuplicateReviewsInTransaction,
            groupStrongDuplicateCandidate: async () => {
              throw new Error('synthetic P4 failure');
            },
          },
        ),
      );
      const counts = await database.query<{
        articles: string;
        observations: string;
        reviews: string;
      }>(
        `SELECT (SELECT count(*) FROM articles) AS articles,
                (SELECT count(*) FROM article_observations) AS observations,
                (SELECT count(*) FROM duplicate_review_candidates) AS reviews`,
      );
      assert.deepEqual(counts.rows[0], {
        articles: '1',
        observations: '1',
        reviews: '0',
      });
    } finally {
      await database.close();
    }
  });
});

test('Source admission persists filtered run accounting without Article observations or historical mutation', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const configuration = await createConfiguration(database, ['admit']);
      assert.deepEqual(configuration.source.rssAtomAdmissionPhrases, ['admit']);
      let relevanceSnapshotLoads = 0;
      const admitted = await execute(
        database,
        configuration,
        'p14-admission-mixed',
        [
          item('admitted-item', 'Admit this item', '../articles/admitted'),
          item('filtered-item', 'Ignore this item', '../articles/filtered'),
        ],
        {
          observationTime: () => FIRST_OBSERVATION,
          async loadRelevanceConfiguration() {
            relevanceSnapshotLoads += 1;
            const snapshot = await loadEffectiveRelevanceConfiguration(
              database,
              configuration.source.id,
              configuration.endpoint.id,
            );
            assert.ok(snapshot);
            return snapshot;
          },
        },
      );
      assertAttempt(admitted, ['succeeded', 1, 0, 0, 0, 0, 0]);
      assert.deepEqual(
        [
          admitted.rawItemCount,
          admitted.sourceItemFilteredCount,
          admitted.normalizedCandidateCount,
          admitted.normalizationFailureCount,
        ],
        [2, 1, 1, 0],
      );
      assert.equal(relevanceSnapshotLoads, 1);
      assert.deepEqual(await cardinality(database), {
        articles: 1,
        observations: 1,
      });
      await assertRunMatches(database, admitted);

      const priorArticleState = await articleState(database);
      const allFiltered = await execute(
        database,
        configuration,
        'p14-admission-all-filtered',
        [item('filtered-again', 'Still ignored', '../articles/ignored')],
        {
          observationTime: () => SECOND_OBSERVATION,
          async loadRelevanceConfiguration() {
            relevanceSnapshotLoads += 1;
            throw new Error('all-filtered batch must not load Relevance');
          },
        },
      );
      assertAttempt(allFiltered, ['succeeded', 0, 0, 0, 0, 0, 0]);
      assert.deepEqual(
        [
          allFiltered.runStatus,
          allFiltered.parserStatus,
          allFiltered.normalizationStatus,
          allFiltered.rawItemCount,
          allFiltered.sourceItemFilteredCount,
          allFiltered.normalizedCandidateCount,
          allFiltered.normalizationFailureCount,
          allFiltered.articleLinkRejectionCount,
        ],
        ['succeeded', 'succeeded', 'succeeded', 1, 1, 0, 0, 0],
      );
      assert.equal(relevanceSnapshotLoads, 1);
      assert.deepEqual(await cardinality(database), {
        articles: 1,
        observations: 1,
      });
      assert.deepEqual(await articleState(database), priorArticleState);
      await assertRunMatches(database, allFiltered);
    } finally {
      await database.close();
    }
  });
});

test('persisted Relevance configuration drives durable prospective collection outcomes', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const configuration = await createConfiguration(database);
      const otherSource = await insertSource(database, {
        configKey: 'other_source',
        displayName: 'Other Source',
        siteUrl: 'https://other.example/',
        approvalState: 'approved',
        lifecycleState: 'active',
        operationalState: 'enabled',
        domainRules: [{ hostname: 'other.example', includeSubdomains: false }],
      });
      await createCategory(database, {
        configKey: 'category_a',
        displayName: 'Category A',
      });
      await createCategory(database, {
        configKey: 'category_b',
        displayName: 'Category B',
      });
      await createRelevanceRule(database, {
        configKey: 'global_story_decision',
        predicateType: 'title_contains',
        pattern: 'Story',
        action: 'include',
        priority: 10,
        enabled: true,
        reason: 'Stories are included.',
      });
      await createRelevanceRule(database, {
        configKey: 'global_story_category',
        predicateType: 'title_contains',
        pattern: 'Story',
        action: 'categorize',
        categoryConfigKey: 'category_a',
        priority: 5,
        enabled: true,
        reason: 'Stories start in Category A.',
      });
      await createRelevanceRule(database, {
        configKey: 'source_blocked_story',
        sourceConfigKey: configuration.source.configKey,
        predicateType: 'title_contains',
        pattern: 'Blocked Story',
        action: 'exclude',
        priority: 10,
        enabled: true,
        reason: 'This Source excludes blocked stories.',
      });
      await createRelevanceRule(database, {
        configKey: 'other_source_story_exclusion',
        sourceConfigKey: otherSource.configKey,
        predicateType: 'title_contains',
        pattern: 'Story',
        action: 'exclude',
        priority: 100,
        enabled: true,
        reason: 'Other Source rules must not leak.',
      });

      let snapshotLoads = 0;
      const first = await execute(
        database,
        configuration,
        'p6-persisted-first',
        [
          item('included-story', 'Included Story', '../articles/included'),
          item('blocked-story', 'Blocked Story', '../articles/blocked'),
        ],
        {
          observationTime: () => FIRST_OBSERVATION,
          async loadRelevanceConfiguration() {
            snapshotLoads += 1;
            const snapshot = await loadEffectiveRelevanceConfiguration(
              database,
              configuration.source.id,
              configuration.endpoint.id,
            );
            assert.ok(snapshot);
            assert.equal(
              snapshot.rules.some(
                (rule) => rule.configKey === 'other_source_story_exclusion',
              ),
              false,
            );
            return snapshot;
          },
        },
      );
      assertAttempt(first, ['succeeded', 1, 0, 0, 0, 1, 0]);
      assert.equal(snapshotLoads, 1);
      await assertRunMatches(database, first);
      assert.deepEqual(await cardinality(database), {
        articles: 1,
        observations: 2,
      });
      assert.deepEqual(await currentCategoryKeys(database), ['category_a']);
      const firstReasons = await database.query<{
        reason_code: string;
        category_reason_count: string;
      }>(
        `SELECT observation.reason_code,
                count(category_reason.*)::text AS category_reason_count
         FROM article_observations observation
         LEFT JOIN article_observation_category_reasons category_reason
           ON category_reason.article_observation_id = observation.id
         WHERE observation.processing_outcome = 'created'
         GROUP BY observation.id, observation.reason_code`,
      );
      assert.deepEqual(firstReasons.rows, [
        {
          reason_code: 'relevance_rule_include',
          category_reason_count: '1',
        },
      ]);
      const firstExclusion = await database.query<{
        article_id: string | null;
        reason_code: string;
      }>(
        `SELECT article_id, reason_code
         FROM article_observations
         WHERE processing_outcome = 'excluded'`,
      );
      assert.deepEqual(firstExclusion.rows, [
        { article_id: null, reason_code: 'relevance_rule_exclude' },
      ]);

      await updateRelevanceRule(database, 'global_story_category', {
        predicateType: 'title_contains',
        pattern: 'Story',
        action: 'categorize',
        categoryConfigKey: 'category_b',
        priority: 5,
        enabled: true,
        reason: 'Stories now use Category B.',
      });
      const recategorized = await execute(
        database,
        configuration,
        'p6-category-only',
        [item('included-story', 'Included Story', '../articles/included')],
        { observationTime: () => SECOND_OBSERVATION },
      );
      assertAttempt(recategorized, ['succeeded', 0, 0, 1, 0, 0, 0]);
      await assertRunMatches(database, recategorized);
      assert.deepEqual(await currentCategoryKeys(database), ['category_b']);

      const beforeExclusion = await articleState(database);
      await updateRelevanceRule(database, 'global_story_decision', {
        predicateType: 'title_contains',
        pattern: 'Story',
        action: 'exclude',
        priority: 10,
        enabled: true,
        reason: 'Stories are prospectively excluded.',
      });
      const excluded = await execute(
        database,
        configuration,
        'p6-prospective-exclusion',
        [item('included-story', 'Included Story', '../articles/included')],
        { observationTime: () => new Date('2026-08-10T14:00:00.000Z') },
      );
      assertAttempt(excluded, ['succeeded', 0, 0, 0, 0, 1, 0]);
      await assertRunMatches(database, excluded);
      assert.deepEqual(await articleState(database), beforeExclusion);
      assert.deepEqual(await currentCategoryKeys(database), ['category_b']);
      assert.equal((await cardinality(database)).articles, 1);
      const prospectiveObservation = await database.query<{
        article_id: string | null;
      }>(
        `SELECT article_id
         FROM article_observations
         WHERE collection_run_id = $1 AND processing_outcome = 'excluded'`,
        [excluded.collectionRunId],
      );
      assert.deepEqual(prospectiveObservation.rows, [{ article_id: null }]);

      await updateRelevanceRule(database, 'global_story_decision', {
        predicateType: 'title_contains',
        pattern: 'Story',
        action: 'include',
        priority: 10,
        enabled: true,
        reason: 'Stories are included again.',
      });
      await updateRelevanceRule(database, 'global_story_category', {
        predicateType: 'title_contains',
        pattern: 'Story',
        action: 'categorize',
        categoryConfigKey: 'category_a',
        priority: 5,
        enabled: true,
        reason: 'Stories return to Category A.',
      });
      const includedAgain = await execute(
        database,
        configuration,
        'p6-included-again',
        [item('included-story', 'Included Story', '../articles/included')],
        { observationTime: () => new Date('2026-08-10T15:00:00.000Z') },
      );
      assertAttempt(includedAgain, ['succeeded', 0, 0, 1, 0, 0, 0]);
      await assertRunMatches(database, includedAgain);
      assert.deepEqual(await currentCategoryKeys(database), ['category_a']);
      assert.equal((await cardinality(database)).articles, 1);
    } finally {
      await database.close();
    }
  });
});

async function execute(
  database: Database,
  configuration: EndpointConfigurationAggregate,
  executionId: string,
  items: readonly RawItem[],
  options: Readonly<{
    observationTime: () => Date;
    persistArticle?: (
      candidate: Parameters<typeof persistIncludedArticle>[1],
      observationTime: Date,
      decision: Extract<RelevanceDecision, { readonly included: true }>,
    ) => Promise<ArticlePersistenceResult>;
    loadRelevanceConfiguration?: () => Promise<EffectiveRelevanceConfiguration>;
    runs?: CollectionRunStore;
  }>,
) {
  return collectEndpoint(configuration, {
    lockRunner: createEndpointExecutionLockRunner(database),
    runs: options.runs ?? createCollectionRunStore(database),
    fetcher: contentFetcher(),
    rssAtomParser: parser(items),
    normalizeArticleCandidate,
    applyArticleLinkPolicy,
    loadRelevanceConfiguration:
      options.loadRelevanceConfiguration ??
      (async () => {
        const snapshot = await loadEffectiveRelevanceConfiguration(
          database,
          configuration.source.id,
          configuration.endpoint.id,
        );
        assert.ok(snapshot);
        return snapshot;
      }),
    evaluateRelevance,
    persistArticle:
      options.persistArticle ??
      ((candidate, observationTime, decision) =>
        persistIncludedArticle(database, candidate, observationTime, decision)),
    persistExcludedArticle: (candidate, observationTime, decision) =>
      persistExcludedArticleObservation(
        database,
        candidate,
        observationTime,
        decision,
      ),
    observationTime: options.observationTime,
    executionId: () => executionId,
  });
}

function assertAttempt(
  result: Awaited<ReturnType<typeof execute>>,
  expected: readonly [string, number, number, number, number, number, number],
): asserts result is Exclude<
  Awaited<ReturnType<typeof execute>>,
  { status: 'blocked' }
> {
  assert.notEqual(result.status, 'blocked');
  if (result.status === 'blocked') return;
  assert.deepEqual(
    [
      result.processingStatus,
      result.createdCount,
      result.updatedCount,
      result.unchangedCount,
      result.rejectedCount,
      result.excludedCount,
      result.failedCount,
    ],
    expected,
  );
  assert.equal(
    result.createdCount +
      result.updatedCount +
      result.unchangedCount +
      result.rejectedCount +
      result.excludedCount +
      result.failedCount,
    result.normalizedCandidateCount,
  );
}

async function assertRunMatches(
  database: Database,
  result: Exclude<Awaited<ReturnType<typeof execute>>, { status: 'blocked' }>,
): Promise<void> {
  const run = await findCollectionRunById(database, result.collectionRunId);
  assert.ok(run);
  assert.deepEqual(
    [
      run.runStatus,
      run.parserStatus,
      run.normalizationStatus,
      run.rawItemCount,
      run.sourceItemFilteredCount,
      run.normalizedCandidateCount,
      run.normalizationFailureCount,
      run.articleLinkRejectionCount,
      run.processingStatus,
      run.createdCount,
      run.updatedCount,
      run.unchangedCount,
      run.rejectedCount,
      run.excludedCount,
      run.failedCount,
    ],
    [
      result.runStatus,
      result.parserStatus,
      result.normalizationStatus,
      result.rawItemCount,
      result.sourceItemFilteredCount,
      result.normalizedCandidateCount,
      result.normalizationFailureCount,
      result.articleLinkRejectionCount,
      result.processingStatus,
      result.createdCount,
      result.updatedCount,
      result.unchangedCount,
      result.rejectedCount,
      result.excludedCount,
      result.failedCount,
    ],
  );
}

async function cardinality(database: Database): Promise<{
  articles: number;
  observations: number;
}> {
  const result = await database.query<{
    articles: string;
    observations: string;
  }>(
    `SELECT (SELECT count(*) FROM articles) AS articles,
            (SELECT count(*) FROM article_observations) AS observations`,
  );
  return {
    articles: Number(result.rows[0]?.articles),
    observations: Number(result.rows[0]?.observations),
  };
}

async function currentCategoryKeys(database: Database): Promise<string[]> {
  const result = await database.query<{ config_key: string }>(
    `SELECT category.config_key
     FROM article_categories membership
     JOIN categories category ON category.id = membership.category_id
     ORDER BY category.config_key`,
  );
  return result.rows.map((row) => row.config_key);
}

async function articleState(database: Database): Promise<unknown> {
  const result = await database.query<{
    id: string;
    visibility_state: string;
    first_seen_at: Date;
    last_seen_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, visibility_state, first_seen_at, last_seen_at, updated_at
     FROM articles`,
  );
  return result.rows;
}

function item(externalId: string, title: string, url: string): RawItem {
  return Object.freeze({ externalId, title, url });
}

async function createAdditionalSource(
  database: Database,
  configKey: string,
): Promise<{ sourceId: string; endpointId: string }> {
  const source = await insertSource(database, {
    configKey,
    displayName: configKey,
    siteUrl: 'https://feeds.example.test/',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    domainRules: [{ hostname: 'feeds.example.test', includeSubdomains: false }],
  });
  const endpoint = await insertSourceEndpoint(database, source.id, {
    configKey: `${configKey}_feed`,
    endpointUrl: 'https://feeds.example.test/feed.xml',
    endpointType: 'rss_atom',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    pollIntervalSeconds: 300,
  });
  return { sourceId: source.id, endpointId: endpoint.id };
}

function normalizedCandidate(
  sourceId: string,
  sourceEndpointId: string,
  collectionRunId: string,
  title: string,
  url: string,
): Parameters<typeof processIncludedArticle>[1] {
  const normalized = normalizeArticleCandidate(
    { title, url },
    { sourceId, sourceEndpointId, collectionRunId, terminalFeedUrl: url },
  );
  assert.equal(normalized.ok, true);
  if (!normalized.ok) throw new Error('fixture candidate did not normalize');
  return normalized.candidate;
}

function emptyRelevanceConfiguration(
  sourceId: string,
  sourceEndpointId: string,
): EffectiveRelevanceConfiguration {
  return Object.freeze({
    sourceId,
    sourceEndpointId,
    rules: Object.freeze([]),
  });
}

function finalization(
  overrides: Readonly<{
    readonly createdCount: number;
    readonly duplicateReviewCreatedCount: number;
    readonly duplicateGroupedCount: number;
  }>,
): FinalizeCollectionRunInput {
  return {
    runStatus: 'succeeded',
    transportStatus: 'succeeded',
    parserStatus: 'succeeded',
    normalizationStatus: 'succeeded',
    processingStatus: 'succeeded',
    rawItemCount: 1,
    sourceItemFilteredCount: 0,
    normalizedCandidateCount: 1,
    normalizationFailureCount: 0,
    articleLinkRejectionCount: 0,
    createdCount: overrides.createdCount,
    updatedCount: 0,
    unchangedCount: 0,
    rejectedCount: 0,
    excludedCount: 0,
    failedCount: 0,
    duplicateReviewCreatedCount: overrides.duplicateReviewCreatedCount,
    duplicateGroupedCount: overrides.duplicateGroupedCount,
    outcomeCode: 'content',
  };
}

function parser(items: readonly RawItem[]): FeedParser {
  return Object.freeze({
    parse() {
      return Object.freeze({
        ok: true as const,
        dialect: 'rss' as const,
        items: Object.freeze(items),
      });
    },
  });
}

function contentFetcher(): HttpFetcher {
  return Object.freeze({
    async fetch(): Promise<HttpFetcherResult> {
      const content = Buffer.from('<controlled-parser-input/>');
      return Object.freeze({
        outcome: 'content' as const,
        content,
        mediaType: 'application/rss+xml',
        response: Object.freeze({ contentType: 'application/rss+xml' }),
        finalUrl: 'https://feeds.example.test/redirected/feed.xml',
        redirectCount: 0,
        metrics: Object.freeze({
          elapsedMilliseconds: 1,
          hopCount: 1,
          wireBytes: content.byteLength,
          decompressedBytes: content.byteLength,
          hops: Object.freeze([
            Object.freeze({
              elapsedMilliseconds: 1,
              httpStatus: 200,
              wireBytes: content.byteLength,
              decompressedBytes: content.byteLength,
              selectedAddress: '8.8.8.8',
              selectedAddressFamily: 4 as const,
            }),
          ]),
        }),
      });
    },
  });
}

async function createConfiguration(
  database: Database,
  rssAtomAdmissionPhrases: readonly string[] = [],
) {
  await insertPublicationSettings(database, {
    name: 'Phase 7 processing',
    activeForCollection: true,
    publicStatus: 'private',
  });
  const source = await insertSource(database, {
    configKey: 'processing_source',
    displayName: 'Processing Source',
    siteUrl: 'https://feeds.example.test/',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    ...(rssAtomAdmissionPhrases.length === 0
      ? {}
      : { rssAtomAdmissionPhrases }),
    domainRules: [{ hostname: 'feeds.example.test', includeSubdomains: false }],
  });
  await insertSourceEndpoint(database, source.id, {
    configKey: 'processing_feed',
    endpointUrl: 'https://feeds.example.test/feed.xml',
    endpointType: 'rss_atom',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    pollIntervalSeconds: 300,
  });
  const configuration = await findEndpointConfigurationByKeys(
    database,
    source.configKey,
    'processing_feed',
  );
  assert.ok(configuration);
  return configuration;
}
