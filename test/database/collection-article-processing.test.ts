import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  persistIncludedArticle,
  type ArticlePersistenceResult,
} from '../../src/articles/repository.ts';
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
import { evaluateRelevance } from '../../src/collection/relevance/evaluator.ts';
import { findCollectionRunById } from '../../src/collection/runs/repository.ts';
import { createDatabase, type Database } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import { insertPublicationSettings } from '../../src/publication/repository.ts';
import {
  findEndpointConfigurationByKeys,
  insertSource,
  insertSourceEndpoint,
  type EndpointConfigurationAggregate,
} from '../../src/sources/repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const FIRST_OBSERVATION = new Date('2026-08-10T12:00:00.000Z');
const SECOND_OBSERVATION = new Date('2026-08-10T13:00:00.000Z');

test('canonical collection persists idempotent Articles and isolated outcomes with real PostgreSQL', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
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
          persistArticle(candidate, observationTime) {
            return candidate.displayTitle === 'Expected conflict'
              ? Promise.resolve(
                  Object.freeze({
                    outcome: 'failed' as const,
                    reason: 'identity_conflict' as const,
                  }),
                )
              : persistIncludedArticle(database, candidate, observationTime);
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
          async persistArticle(candidate, observationTime) {
            stagePersistenceCalls += 1;
            if (stagePersistenceCalls === 2) {
              throw new Error('SYNTHETIC_DATABASE_SECRET');
            }
            return persistIncludedArticle(database, candidate, observationTime);
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
    ) => Promise<ArticlePersistenceResult>;
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
    evaluateRelevance,
    persistArticle:
      options.persistArticle ??
      ((candidate, observationTime) =>
        persistIncludedArticle(database, candidate, observationTime)),
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

function item(externalId: string, title: string, url: string): RawItem {
  return Object.freeze({ externalId, title, url });
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

async function createConfiguration(database: Database) {
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
