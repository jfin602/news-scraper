import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import { applyArticleLinkPolicy } from '../../src/collection/article-links/policy.ts';
import type { IncludedArticleProcessingResult } from '../../src/collection/included-article-processing.ts';
import {
  collectEndpoint,
  createCollectionRunStore,
} from '../../src/collection/collect-endpoint.ts';
import { createEndpointExecutionLockRunner } from '../../src/collection/execution.ts';
import type {
  HttpFetcher,
  HttpFetcherResult,
} from '../../src/collection/fetchers/http-fetcher.ts';
import { normalizeArticleCandidate } from '../../src/collection/normalization/normalizer.ts';
import { evaluateRelevance } from '../../src/collection/relevance/evaluator.ts';
import type { CollectionParser } from '../../src/collection/parsers/parser.ts';
import { findCollectionRunById } from '../../src/collection/runs/repository.ts';
import { createDatabase } from '../../src/database/database.ts';
import { insertPublicationSettings } from '../../src/publication/repository.ts';
import {
  findEndpointConfigurationByKeys,
  insertSource,
  insertSourceEndpoint,
} from '../../src/sources/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

test('canonical normalization persists truthful accounting and real run provenance', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const configuration = await createConfiguration(database);
      const successful = await collectEndpoint(configuration, {
        lockRunner: createEndpointExecutionLockRunner(database),
        runs: createCollectionRunStore(database),
        fetcher: contentFetcher(),
        rssAtomParser: parser([
          { title: 'Accepted', url: '../articles/accepted' },
          { url: '../articles/missing-title' },
          { title: 'Outside policy', url: 'https://outside.example/article' },
        ]),
        normalizeArticleCandidate,
        applyArticleLinkPolicy,
        ...processingDependencies,
        executionId: () => 'phase-6-accounting-success',
      });

      assert.equal(successful.status, 'succeeded');
      if (successful.status !== 'succeeded') return;
      assert.deepEqual(
        [
          successful.normalizationStatus,
          successful.rawItemCount,
          successful.normalizedCandidateCount,
          successful.normalizationFailureCount,
          successful.articleLinkRejectionCount,
          successful.candidates?.length,
        ],
        ['succeeded', 3, 2, 1, 1, 1],
      );
      assert.deepEqual(successful.candidates?.[0]?.provenance, {
        sourceId: configuration.source.id,
        sourceEndpointId: configuration.endpoint.id,
        collectionRunId: successful.collectionRunId,
      });
      assert.equal(
        successful.candidates?.[0]?.originalUrl,
        'https://feeds.example.test/articles/accepted',
      );

      const persistedSuccess = await findCollectionRunById(
        database,
        successful.collectionRunId,
      );
      assert.ok(persistedSuccess);
      assert.deepEqual(
        [
          persistedSuccess.runStatus,
          persistedSuccess.transportStatus,
          persistedSuccess.parserStatus,
          persistedSuccess.normalizationStatus,
          persistedSuccess.rawItemCount,
          persistedSuccess.normalizedCandidateCount,
          persistedSuccess.normalizationFailureCount,
          persistedSuccess.articleLinkRejectionCount,
        ],
        [
          successful.runStatus,
          successful.transportStatus,
          successful.parserStatus,
          successful.normalizationStatus,
          successful.rawItemCount,
          successful.normalizedCandidateCount,
          successful.normalizationFailureCount,
          successful.articleLinkRejectionCount,
        ],
      );

      const failed = await collectEndpoint(configuration, {
        lockRunner: createEndpointExecutionLockRunner(database),
        runs: createCollectionRunStore(database),
        fetcher: contentFetcher(),
        rssAtomParser: parser([
          { title: 'Fatal stage item', url: '../articles/fatal' },
        ]),
        normalizeArticleCandidate() {
          throw new Error('SYNTHETIC_UNTRUSTED_SOURCE_SECRET');
        },
        applyArticleLinkPolicy,
        ...processingDependencies,
        executionId: () => 'phase-6-accounting-failure',
      });
      assert.equal(failed.status, 'failed');
      if (failed.status !== 'failed') return;
      assert.equal(failed.reason, 'normalization_execution_failed');
      const persistedFailure = await findCollectionRunById(
        database,
        failed.collectionRunId,
      );
      assert.ok(persistedFailure);
      assert.deepEqual(
        [
          persistedFailure.runStatus,
          persistedFailure.transportStatus,
          persistedFailure.parserStatus,
          persistedFailure.normalizationStatus,
          persistedFailure.rawItemCount,
          persistedFailure.normalizedCandidateCount,
          persistedFailure.normalizationFailureCount,
          persistedFailure.articleLinkRejectionCount,
          persistedFailure.errorCode,
        ],
        [
          'failed',
          'succeeded',
          'succeeded',
          'failed',
          1,
          0,
          0,
          0,
          'normalization_execution_failed',
        ],
      );

      const articleSchema = await database.query<{ relation: string | null }>(
        "SELECT to_regclass('public.articles')::text AS relation",
      );
      assert.equal(articleSchema.rows[0]?.relation, 'articles');
      const articleCount = await database.query<{ count: string }>(
        'SELECT count(*) FROM articles',
      );
      assert.equal(Number(articleCount.rows[0]?.count), 0);
      const runCount = await database.query<{ count: string }>(
        'SELECT count(*) FROM collection_runs',
      );
      assert.equal(Number(runCount.rows[0]?.count), 2);
    } finally {
      await database.close();
    }
  });
});

const processingDependencies = Object.freeze({
  async loadRelevanceConfiguration() {
    return { rules: [] };
  },
  evaluateRelevance,
  async processIncludedArticle() {
    return {
      outcome: 'created',
      duplicateReviewCreatedCount: 0,
      duplicateGroupedCount: 0,
    } as IncludedArticleProcessingResult;
  },
  async persistExcludedArticle() {
    throw new Error('default-include fixture cannot be excluded');
  },
  observationTime: () => new Date('2026-08-10T12:00:00.000Z'),
});

function contentFetcher(): HttpFetcher {
  return Object.freeze({
    async fetch(): Promise<HttpFetcherResult> {
      const content = Buffer.from('<controlled-parser-input/>');
      return Object.freeze({
        outcome: 'content',
        content,
        mediaType: 'application/rss+xml',
        response: Object.freeze({ contentType: 'application/rss+xml' }),
        finalUrl: 'https://feeds.example.test/redirected/final.xml',
        redirectCount: 1,
        metrics: Object.freeze({
          elapsedMilliseconds: 5,
          hopCount: 2,
          wireBytes: content.byteLength,
          decompressedBytes: content.byteLength,
          hops: Object.freeze([
            Object.freeze({
              elapsedMilliseconds: 2,
              httpStatus: 302,
              wireBytes: 0,
              decompressedBytes: 0,
              selectedAddress: '8.8.8.8',
              selectedAddressFamily: 4 as const,
            }),
            Object.freeze({
              elapsedMilliseconds: 3,
              httpStatus: 200,
              wireBytes: content.byteLength,
              decompressedBytes: content.byteLength,
              selectedAddress: '8.8.4.4',
              selectedAddressFamily: 4 as const,
            }),
          ]),
        }),
      });
    },
  });
}

function parser(
  items: readonly { readonly title?: string; readonly url?: string }[],
): CollectionParser {
  return Object.freeze({
    parse() {
      return Object.freeze({
        ok: true,
        dialect: 'rss',
        items: Object.freeze(items.map((item) => Object.freeze({ ...item }))),
      });
    },
  });
}

async function createConfiguration(
  database: ReturnType<typeof createDatabase>,
) {
  await insertPublicationSettings(database, {
    name: 'Normalization accounting',
    activeForCollection: true,
    publicStatus: 'private',
  });
  const source = await insertSource(database, {
    configKey: 'accounting_source',
    displayName: 'Accounting Source',
    siteUrl: 'https://feeds.example.test/',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    domainRules: [{ hostname: 'feeds.example.test', includeSubdomains: false }],
  });
  await insertSourceEndpoint(database, source.id, {
    configKey: 'accounting_feed',
    endpointUrl: 'https://feeds.example.test/configured/feed.xml',
    endpointType: 'rss_atom',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    pollIntervalSeconds: 300,
  });
  const configuration = await findEndpointConfigurationByKeys(
    database,
    source.configKey,
    'accounting_feed',
  );
  assert.ok(configuration);
  return configuration;
}
