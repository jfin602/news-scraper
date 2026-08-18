import assert from 'node:assert/strict';
import { request as requestHttp } from 'node:http';
import { describe, it } from 'node:test';

import {
  collectEndpoint,
  CollectionRunFinalizationError,
  type CollectEndpointDependencies,
  type CollectionRunStore,
} from '../../src/collection/collect-endpoint.ts';
import { applyArticleLinkPolicy } from '../../src/collection/article-links/policy.ts';
import type { ExcludedArticlePersistenceResult } from '../../src/articles/repository.ts';
import type { EndpointExecutionLockRunner } from '../../src/collection/execution.ts';
import type {
  HttpFetcher,
  HttpFetcherResult,
} from '../../src/collection/fetchers/http-fetcher.ts';
import { createHttpFetcher } from '../../src/collection/fetchers/http-fetcher.ts';
import { createHttpTransport } from '../../src/collection/fetchers/http-transport.ts';
import type { EndpointRunLockResult } from '../../src/collection/locks/endpoint-run-lock.ts';
import type {
  FeedParser,
  ParserResult,
} from '../../src/collection/parsers/parser.ts';
import { RssAtomParser } from '../../src/collection/parsers/rss-atom-parser.ts';
import { normalizeHtmlListingProfile } from '../../src/collection/parsers/html-listing-profile.ts';
import type { IncludedArticleProcessingResult } from '../../src/collection/included-article-processing.ts';
import { normalizeArticleCandidate } from '../../src/collection/normalization/normalizer.ts';
import { evaluateRelevance } from '../../src/collection/relevance/evaluator.ts';
import type { ArticleNormalizationContext } from '../../src/collection/normalization/article-candidate.ts';
import type {
  FinalizeCollectionRunInput,
  PersistedCollectionRun,
} from '../../src/collection/runs/repository.ts';
import type { EndpointConfigurationAggregate } from '../../src/sources/repository.ts';
import { startHttpFixtureServer } from '../support/collection/http-fixture-server.ts';

const RUN_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const EXECUTION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

describe('canonical endpoint collection service', () => {
  it('orders eligibility, lock, run, fetch, parse, finalization, and release', async () => {
    const events: string[] = [];
    const runs = runStore(events);
    const result = await collectEndpoint(observedAggregate(events), {
      lockRunner: acquiredLock(events),
      runs,
      fetcher: fetcher(events, contentResult()),
      rssAtomParser: parser(events, {
        ok: true,
        dialect: 'rss',
        items: [
          {
            title: 'Fixture item one',
            url: 'https://feeds.example.test/articles/fixture-item-1',
            categories: ['News'],
            diagnostics: { fixture: 'yes' },
          },
          {
            title: 'Fixture item two',
            url: 'https://feeds.example.test/articles/fixture-item-2',
          },
        ],
      }),
      normalizeArticleCandidate(rawItem, context) {
        events.push('normalize');
        return normalizeArticleCandidate(rawItem, context);
      },
      applyArticleLinkPolicy(candidate, context) {
        events.push('article-link policy');
        return applyArticleLinkPolicy(candidate, context);
      },
      async loadRelevanceConfiguration() {
        events.push('relevance snapshot');
        return EMPTY_RELEVANCE_CONFIGURATION;
      },
      evaluateRelevance(candidate, configuration) {
        events.push('relevance');
        return evaluateRelevance(candidate, configuration);
      },
      async processIncludedArticle() {
        events.push('persist');
        return includedProcessingSuccess('created');
      },
      async persistExcludedArticle() {
        events.push('persist excluded');
        return excludedPersistenceSuccess();
      },
      observationTime() {
        events.push('observation clock');
        return new Date('2026-08-08T12:00:00.000Z');
      },
      executionId: () => EXECUTION_ID,
    });

    assert.deepEqual(events, [
      'eligibility',
      'lock',
      'run.start',
      'fetch',
      'parse',
      'normalize',
      'normalize',
      'article-link policy',
      'article-link policy',
      'relevance snapshot',
      'relevance',
      'observation clock',
      'persist',
      'relevance',
      'observation clock',
      'persist',
      'run.finalize',
      'release',
    ]);
    assert.equal(result.status, 'succeeded');
    if (result.status !== 'succeeded') return;
    assert.equal(result.outcome, 'content');
    assert.equal(result.collectionRunId, RUN_ID);
    assert.equal(result.executionId, EXECUTION_ID);
    assert.equal(result.transportStatus, 'succeeded');
    assert.equal(result.parserStatus, 'succeeded');
    assert.equal(result.rawItemCount, 2);
    assert.equal(result.httpStatusCode, 200);
    assert.equal(result.wireByteCount, 321);
    assert.equal(result.decompressedByteCount, 654);
    assert.equal(result.redirectCount, 1);
    assert.ok(Object.isFrozen(result));
    assert.equal(result.normalizationStatus, 'succeeded');
    assert.equal(result.normalizedCandidateCount, 2);
    assert.equal(result.normalizationFailureCount, 0);
    assert.equal(result.articleLinkRejectionCount, 0);
    assert.deepEqual(processingTuple(result), ['succeeded', 2, 0, 0, 0, 0, 0]);
    assert.ok(Object.isFrozen(result.candidates));
    assert.ok(Object.isFrozen(result.candidates?.[0]));
    assert.ok(Object.isFrozen(result.candidates?.[0]?.sourceCategories));
    assert.ok(Object.isFrozen(result.candidates?.[0]?.provenance));
    assert.deepEqual(runs.finalizations, [
      {
        runStatus: 'succeeded',
        transportStatus: 'succeeded',
        parserStatus: 'succeeded',
        httpStatusCode: 200,
        wireByteCount: 321,
        decompressedByteCount: 654,
        redirectCount: 1,
        transportElapsedMilliseconds: 12,
        outcomeCode: 'content',
        rawItemCount: 2,
        sourceItemFilteredCount: 0,
        normalizationStatus: 'succeeded',
        normalizedCandidateCount: 2,
        normalizationFailureCount: 0,
        articleLinkRejectionCount: 0,
        processingStatus: 'succeeded',
        createdCount: 2,
        updatedCount: 0,
        unchangedCount: 0,
        rejectedCount: 0,
        excludedCount: 0,
        failedCount: 0,
        duplicateReviewCreatedCount: 0,
        duplicateGroupedCount: 0,
      },
    ]);
  });

  it('accumulates committed included duplicate effects without changing Article outcome arithmetic', async () => {
    const events: string[] = [];
    const runs = runStore(events);
    const result = await collectEndpoint(observedAggregate(events), {
      lockRunner: acquiredLock(events),
      runs,
      fetcher: fetcher(events, contentResult()),
      rssAtomParser: parser(events, {
        ok: true,
        dialect: 'rss',
        items: [
          {
            title: 'Strong fixture',
            url: 'https://feeds.example.test/strong',
          },
          {
            title: 'Weak fixture',
            url: 'https://feeds.example.test/weak',
          },
        ],
      }),
      normalizeArticleCandidate,
      applyArticleLinkPolicy,
      async loadRelevanceConfiguration() {
        return EMPTY_RELEVANCE_CONFIGURATION;
      },
      evaluateRelevance,
      async processIncludedArticle(candidate) {
        events.push(`included:${candidate.displayTitle}`);
        return {
          outcome: 'created',
          duplicateReviewCreatedCount:
            candidate.displayTitle === 'Strong fixture' ? 1 : 2,
          duplicateGroupedCount:
            candidate.displayTitle === 'Strong fixture' ? 1 : 0,
        } as never;
      },
      async persistExcludedArticle() {
        return excludedPersistenceSuccess();
      },
      observationTime: () => new Date('2026-08-08T12:00:00.000Z'),
      executionId: () => EXECUTION_ID,
    });

    assert.equal(result.status, 'succeeded');
    if (result.status !== 'succeeded') return;
    assert.deepEqual(processingTuple(result), ['succeeded', 2, 0, 0, 0, 0, 0]);
    assert.equal(result.duplicateReviewCreatedCount, 3);
    assert.equal(result.duplicateGroupedCount, 1);
    assert.deepEqual(
      events.filter((event) => event.startsWith('included:')),
      ['included:Strong fixture', 'included:Weak fixture'],
    );
    assert.ok(
      events.indexOf('included:Strong fixture') <
        events.indexOf('included:Weak fixture'),
    );
    assert.ok(
      events.indexOf('included:Weak fixture') < events.indexOf('run.finalize'),
    );
    assert.equal(runs.finalizations[0]?.duplicateReviewCreatedCount, 3);
    assert.equal(runs.finalizations[0]?.duplicateGroupedCount, 1);
  });

  it('rejects included processing successes that omit a required duplicate effect', async () => {
    const events: string[] = [];
    const runs = runStore(events);
    const result = await collectEndpoint(aggregate(), {
      lockRunner: acquiredLock(events),
      runs,
      fetcher: fetcher(events, contentResult()),
      rssAtomParser: parser(events, {
        ok: true,
        dialect: 'rss',
        items: [
          {
            title: 'Invalid effect fixture',
            url: 'https://feeds.example.test/invalid-effect',
          },
        ],
      }),
      ...phase6Dependencies,
      ...phase7Dependencies,
      async processIncludedArticle() {
        return {
          outcome: 'created',
          duplicateReviewCreatedCount: 0,
        } as never;
      },
      executionId: () => EXECUTION_ID,
    });

    assert.equal(result.status, 'failed');
    if (result.status !== 'failed') return;
    assert.equal(result.reason, 'included_article_processing_result_invalid');
    assert.equal(result.failedCount, 1);
    assert.equal(result.duplicateReviewCreatedCount, 0);
    assert.equal(result.duplicateGroupedCount, 0);
  });

  it('filters mismatching Raw items before normalization and all candidate work', async () => {
    const events: string[] = [];
    const runs = runStore(events);
    const result = await collectEndpoint(
      aggregate({ admissionPhrases: ['admitted category'] }),
      {
        lockRunner: acquiredLock(events),
        runs,
        fetcher: fetcher(events, contentResult()),
        rssAtomParser: parser(events, {
          ok: true,
          dialect: 'rss',
          items: [
            {
              title: 'Filtered item',
              url: 'https://outside.test/would-have-been-rejected',
            },
            {
              title: 'Accepted item',
              url: 'https://feeds.example.test/accepted',
              categories: ['Admitted Category'],
            },
          ],
        }),
        normalizeArticleCandidate(rawItem, context) {
          events.push(`normalize:${rawItem.title}`);
          return normalizeArticleCandidate(rawItem, context);
        },
        applyArticleLinkPolicy(candidate, context) {
          events.push(`policy:${candidate.displayTitle}`);
          return applyArticleLinkPolicy(candidate, context);
        },
        async loadRelevanceConfiguration() {
          events.push('relevance snapshot');
          return EMPTY_RELEVANCE_CONFIGURATION;
        },
        evaluateRelevance(candidate, configuration) {
          events.push(`relevance:${candidate.displayTitle}`);
          return evaluateRelevance(candidate, configuration);
        },
        async processIncludedArticle(candidate) {
          events.push(`persist:${candidate.displayTitle}`);
          return includedProcessingSuccess('created');
        },
        async persistExcludedArticle() {
          events.push('persist excluded');
          return excludedPersistenceSuccess();
        },
        observationTime: () => new Date('2026-08-08T12:00:00.000Z'),
        executionId: () => EXECUTION_ID,
      },
    );

    assert.equal(result.status, 'succeeded');
    if (result.status !== 'succeeded') return;
    assert.deepEqual(
      [
        result.rawItemCount,
        result.sourceItemFilteredCount,
        result.normalizedCandidateCount,
        result.normalizationFailureCount,
        result.articleLinkRejectionCount,
      ],
      [2, 1, 1, 0, 0],
    );
    assert.deepEqual(processingTuple(result), ['succeeded', 1, 0, 0, 0, 0, 0]);
    assert.equal(result.candidates?.[0]?.displayTitle, 'Accepted item');
    assert.equal(events.includes('normalize:Filtered item'), false);
    assert.equal(events.includes('policy:Filtered item'), false);
    assert.equal(events.includes('relevance:Filtered item'), false);
    assert.equal(events.includes('persist:Filtered item'), false);
    assert.equal(events.includes('persist excluded'), false);
    assert.equal(runs.finalizations[0]?.sourceItemFilteredCount, 1);
  });

  it('treats an all-items-filtered batch as successful without candidate, Relevance, or persistence work', async () => {
    const events: string[] = [];
    const runs = runStore(events);
    let downstreamCalls = 0;
    const unreachable = () => {
      downstreamCalls += 1;
      throw new Error('filtered batches must not enter candidate processing');
    };
    const result = await collectEndpoint(
      aggregate({ admissionPhrases: ['configured phrase'] }),
      {
        lockRunner: acquiredLock(events),
        runs,
        fetcher: fetcher(events, contentResult()),
        rssAtomParser: parser(events, {
          ok: true,
          dialect: 'atom',
          items: [
            {
              title: 'First mismatch',
              url: 'https://feeds.example.test/first',
            },
            {
              content: '<p>Second mismatch</p>',
              url: 'https://feeds.example.test/second',
            },
          ],
        }),
        normalizeArticleCandidate: unreachable,
        applyArticleLinkPolicy: unreachable,
        async loadRelevanceConfiguration() {
          return unreachable();
        },
        evaluateRelevance: unreachable,
        async processIncludedArticle() {
          return unreachable();
        },
        async persistExcludedArticle() {
          return unreachable();
        },
        observationTime: unreachable,
        executionId: () => EXECUTION_ID,
      },
    );

    assert.equal(result.status, 'succeeded');
    if (result.status !== 'succeeded') return;
    assert.equal(result.outcome, 'content');
    assert.deepEqual(
      [
        result.parserStatus,
        result.normalizationStatus,
        result.processingStatus,
        result.rawItemCount,
        result.sourceItemFilteredCount,
        result.normalizedCandidateCount,
        result.normalizationFailureCount,
        result.articleLinkRejectionCount,
        result.createdCount,
        result.updatedCount,
        result.unchangedCount,
        result.rejectedCount,
        result.excludedCount,
        result.failedCount,
        result.candidates?.length,
      ],
      [
        'succeeded',
        'succeeded',
        'succeeded',
        2,
        2,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      ],
    );
    assert.equal(downstreamCalls, 0);
    assert.equal(result.duplicateReviewCreatedCount, 0);
    assert.equal(result.duplicateGroupedCount, 0);
    assert.deepEqual(runs.finalizations[0], {
      runStatus: 'succeeded',
      transportStatus: 'succeeded',
      parserStatus: 'succeeded',
      normalizationStatus: 'succeeded',
      httpStatusCode: 200,
      wireByteCount: 321,
      decompressedByteCount: 654,
      redirectCount: 1,
      transportElapsedMilliseconds: 12,
      outcomeCode: 'content',
      rawItemCount: 2,
      sourceItemFilteredCount: 2,
      normalizedCandidateCount: 0,
      normalizationFailureCount: 0,
      articleLinkRejectionCount: 0,
      processingStatus: 'succeeded',
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      rejectedCount: 0,
      excludedCount: 0,
      failedCount: 0,
      duplicateReviewCreatedCount: 0,
      duplicateGroupedCount: 0,
    });
  });

  it('isolates ordinary normalization failures and Article-link rejections with exact batch accounting', async () => {
    const cases = [
      {
        name: 'zero Raw items',
        items: [],
        expected: [0, 0, 0, 0, 0],
      },
      {
        name: 'mixed normalization results',
        items: [
          { title: 'Accepted', url: 'https://feeds.example.test/accepted' },
          { url: 'https://feeds.example.test/missing-title' },
        ],
        expected: [2, 1, 1, 0, 1],
      },
      {
        name: 'all ordinary normalization failures',
        items: [{ title: 'Missing URL' }, { url: '/missing-title' }],
        expected: [2, 0, 2, 0, 0],
      },
      {
        name: 'mixed Article-link decisions',
        items: [
          { title: 'Accepted', url: 'https://feeds.example.test/accepted' },
          { title: 'Rejected', url: 'https://outside.test/rejected' },
        ],
        expected: [2, 2, 0, 1, 1],
      },
      {
        name: 'all Article links rejected',
        items: [
          { title: 'Rejected one', url: 'https://outside.test/one' },
          { title: 'Rejected two', url: 'https://outside.test/two' },
        ],
        expected: [2, 2, 0, 2, 0],
      },
    ] as const;

    for (const testCase of cases) {
      const events: string[] = [];
      const runs = runStore(events);
      const result = await executeWith(
        events,
        runs,
        contentResult(),
        Object.freeze({
          ok: true,
          dialect: 'rss',
          items: Object.freeze(testCase.items),
        }),
      );
      assert.equal(result.status, 'succeeded', testCase.name);
      if (result.status !== 'succeeded') continue;
      assert.equal(result.normalizationStatus, 'succeeded', testCase.name);
      assert.deepEqual(
        [
          result.rawItemCount,
          result.normalizedCandidateCount,
          result.normalizationFailureCount,
          result.articleLinkRejectionCount,
          result.candidates?.length,
        ],
        testCase.expected,
        testCase.name,
      );
      assert.equal(
        result.candidates?.length,
        result.normalizedCandidateCount - result.articleLinkRejectionCount,
      );
      const processing = {
        processingStatus: 'succeeded' as const,
        createdCount: testCase.expected[4],
        updatedCount: 0,
        unchangedCount: 0,
        rejectedCount: testCase.expected[3],
        excludedCount: 0,
        failedCount: 0,
        duplicateReviewCreatedCount: 0,
        duplicateGroupedCount: 0,
      };
      assert.deepEqual(processingTuple(result), processingTuple(processing));
      assert.deepEqual(runs.finalizations[0], {
        runStatus: 'succeeded',
        transportStatus: 'succeeded',
        parserStatus: 'succeeded',
        normalizationStatus: 'succeeded',
        httpStatusCode: 200,
        wireByteCount: 321,
        decompressedByteCount: 654,
        redirectCount: 1,
        transportElapsedMilliseconds: 12,
        outcomeCode: 'content',
        rawItemCount: testCase.expected[0],
        sourceItemFilteredCount: 0,
        normalizedCandidateCount: testCase.expected[1],
        normalizationFailureCount: testCase.expected[2],
        articleLinkRejectionCount: testCase.expected[3],
        ...processing,
      });
    }
  });

  it('maps Relevance and persistence outcomes in canonical order with item isolation', async () => {
    const events: string[] = [];
    const snapshot = Object.freeze({
      rules: Object.freeze([
        Object.freeze({
          configKey: 'exclude_item',
          predicateType: 'title_contains' as const,
          pattern: 'Excluded',
          action: 'exclude' as const,
          priority: 1,
          enabled: true,
          reason: 'Excluded fixture item.',
        }),
      ]),
    });
    const receivedSnapshots: unknown[] = [];
    const result = await collectEndpoint(aggregate(), {
      lockRunner: acquiredLock(events),
      runs: runStore(events),
      fetcher: fetcher(events, contentResult()),
      rssAtomParser: parser(events, {
        ok: true,
        dialect: 'rss',
        items: [
          { title: 'Rejected', url: 'https://outside.test/rejected' },
          { title: 'Created', url: 'https://feeds.example.test/created' },
          { title: 'Expected failure', url: 'https://feeds.example.test/fail' },
          { title: 'Updated', url: 'https://feeds.example.test/updated' },
          { title: 'Unchanged', url: 'https://feeds.example.test/unchanged' },
          { title: 'Excluded', url: 'https://feeds.example.test/excluded' },
        ],
      }),
      normalizeArticleCandidate,
      applyArticleLinkPolicy(candidate, context) {
        events.push(`policy:${candidate.displayTitle}`);
        return applyArticleLinkPolicy(candidate, context);
      },
      async loadRelevanceConfiguration() {
        events.push('relevance snapshot');
        return snapshot;
      },
      evaluateRelevance(candidate, configuration) {
        events.push(`relevance:${candidate.displayTitle}`);
        receivedSnapshots.push(configuration);
        return evaluateRelevance(candidate, configuration);
      },
      async processIncludedArticle(candidate) {
        events.push(`persist:${candidate.displayTitle}`);
        if (candidate.displayTitle === 'Expected failure') {
          return Object.freeze({
            outcome: 'failed' as const,
            reason: 'identity_conflict' as const,
          });
        }
        return includedProcessingSuccess(
          candidate.displayTitle.toLowerCase() as
            'created' | 'updated' | 'unchanged',
        );
      },
      async persistExcludedArticle(candidate) {
        events.push(`persist excluded:${candidate.displayTitle}`);
        return excludedPersistenceSuccess();
      },
      observationTime() {
        events.push('clock');
        return new Date('2026-08-08T12:00:00.000Z');
      },
      executionId: () => EXECUTION_ID,
    });

    assert.equal(result.status, 'succeeded');
    if (result.status !== 'succeeded') return;
    assert.deepEqual(processingTuple(result), ['succeeded', 1, 1, 1, 1, 1, 1]);
    assert.equal(
      events.filter((event) => event === 'relevance snapshot').length,
      1,
    );
    assert.equal(receivedSnapshots.length, 5);
    assert.ok(receivedSnapshots.every((value) => value === snapshot));
    assert.equal(
      events.some((event) => event === 'relevance:Rejected'),
      false,
    );
    assert.equal(
      events.some((event) => event === 'persist:Rejected'),
      false,
    );
    assert.equal(
      events.some((event) => event === 'persist:Excluded'),
      false,
    );
    assert.equal(
      events.filter((event) => event === 'persist excluded:Excluded').length,
      1,
    );
    assert.ok(
      events.indexOf('relevance:Created') < events.indexOf('persist:Created'),
    );
    assert.ok(
      events.lastIndexOf('policy:Excluded') <
        events.indexOf('relevance:Created'),
    );
    assert.ok(events.indexOf('persist:Expected failure') >= 0);
    assert.ok(events.indexOf('persist:Updated') >= 0);
  });

  it('bounds snapshot, evaluator, excluded-clock, and exclusion-persistence failures with exact accounting', async () => {
    const stages = [
      'relevance_configuration_load_execution_failed',
      'relevance_execution_failed',
      'observation_clock_execution_failed',
      'relevance_exclusion_persistence_execution_failed',
    ] as const;

    for (const stage of stages) {
      const events: string[] = [];
      const runs = runStore(events);
      let relevanceCalls = 0;
      let clockCalls = 0;
      let excludedPersistenceCalls = 0;
      const exclusionSnapshot = Object.freeze({
        rules: Object.freeze([
          Object.freeze({
            configKey: 'exclude_all',
            predicateType: 'title_contains' as const,
            pattern: 'Item',
            action: 'exclude' as const,
            priority: 1,
            enabled: true,
            reason: 'Excluded by fixture.',
          }),
        ]),
      });
      const result = await collectEndpoint(aggregate(), {
        lockRunner: acquiredLock(events),
        runs,
        fetcher: fetcher(events, contentResult()),
        rssAtomParser: parser(events, {
          ok: true,
          dialect: 'rss',
          items: [
            { title: 'Item one', url: 'https://feeds.example.test/one' },
            { title: 'Item two', url: 'https://feeds.example.test/two' },
            { title: 'Rejected', url: 'https://outside.test/rejected' },
          ],
        }),
        ...phase6Dependencies,
        async loadRelevanceConfiguration() {
          if (stage === 'relevance_configuration_load_execution_failed') {
            throw new Error('SYNTHETIC_CONFIGURATION_SECRET');
          }
          return exclusionSnapshot;
        },
        evaluateRelevance(candidate, configuration) {
          relevanceCalls += 1;
          if (stage === 'relevance_execution_failed') {
            throw new Error('SYNTHETIC_EVALUATOR_SECRET');
          }
          return evaluateRelevance(candidate, configuration);
        },
        observationTime() {
          clockCalls += 1;
          if (stage === 'observation_clock_execution_failed') {
            throw new Error('SYNTHETIC_CLOCK_SECRET');
          }
          return new Date('2026-08-08T12:00:00.000Z');
        },
        async processIncludedArticle() {
          throw new Error(
            'excluded candidates must not use Article persistence',
          );
        },
        async persistExcludedArticle() {
          excludedPersistenceCalls += 1;
          if (stage === 'relevance_exclusion_persistence_execution_failed') {
            throw new Error('SYNTHETIC_DATABASE_SECRET');
          }
          return excludedPersistenceSuccess();
        },
        executionId: () => EXECUTION_ID,
      });

      assert.equal(result.status, 'failed', stage);
      if (result.status !== 'failed') continue;
      assert.equal(result.reason, stage);
      assert.equal(result.detail?.includes('SECRET'), false);
      assert.deepEqual(processingTuple(result), ['failed', 0, 0, 0, 1, 0, 2]);
      assert.equal(runs.finalizations[0]?.error?.code, stage);
      if (stage === 'relevance_configuration_load_execution_failed') {
        assert.equal(relevanceCalls, 0);
      }
      if (stage === 'observation_clock_execution_failed') {
        assert.equal(excludedPersistenceCalls, 0);
      }
      if (stage === 'relevance_exclusion_persistence_execution_failed') {
        assert.equal(clockCalls, 1);
        assert.equal(excludedPersistenceCalls, 1);
      }
    }
  });

  it('fully accounts a fatal processing stage and stops remaining persistence', async () => {
    const stages = [
      'relevance_execution_failed',
      'observation_clock_execution_failed',
      'article_persistence_execution_failed',
    ] as const;

    for (const stage of stages) {
      const events: string[] = [];
      let relevanceCalls = 0;
      let clockCalls = 0;
      let persistenceCalls = 0;
      const runs = runStore(events);
      const result = await collectEndpoint(aggregate(), {
        lockRunner: acquiredLock(events),
        runs,
        fetcher: fetcher(events, contentResult()),
        rssAtomParser: parser(events, {
          ok: true,
          dialect: 'rss',
          items: [
            { title: 'Committed', url: 'https://feeds.example.test/one' },
            { title: 'Fatal', url: 'https://feeds.example.test/two' },
            { title: 'Unattempted', url: 'https://feeds.example.test/three' },
            { title: 'Rejected', url: 'https://outside.test/rejected' },
          ],
        }),
        ...phase6Dependencies,
        ...phase7Dependencies,
        evaluateRelevance(candidate) {
          relevanceCalls += 1;
          if (stage === 'relevance_execution_failed' && relevanceCalls === 2) {
            throw new Error('SYNTHETIC_RELEVANCE_SECRET');
          }
          return evaluateRelevance(candidate);
        },
        observationTime() {
          clockCalls += 1;
          if (
            stage === 'observation_clock_execution_failed' &&
            clockCalls === 2
          ) {
            throw new Error('SYNTHETIC_CLOCK_SECRET');
          }
          return new Date('2026-08-08T12:00:00.000Z');
        },
        async processIncludedArticle() {
          persistenceCalls += 1;
          if (
            stage === 'article_persistence_execution_failed' &&
            persistenceCalls === 2
          ) {
            throw new Error('SYNTHETIC_DATABASE_SECRET');
          }
          return includedProcessingSuccess('created');
        },
        executionId: () => EXECUTION_ID,
      });

      assert.equal(result.status, 'failed', stage);
      if (result.status !== 'failed') continue;
      assert.equal(result.outcome, 'processing_failed');
      assert.equal(result.reason, stage);
      assert.equal(result.detail?.includes('SECRET'), false);
      assert.deepEqual(processingTuple(result), ['failed', 1, 0, 0, 1, 0, 2]);
      assert.equal(runs.finalizations[0]?.error?.code, stage);
      assert.equal(
        persistenceCalls,
        stage === 'article_persistence_execution_failed' ? 2 : 1,
      );
    }
  });

  it('supplies the persisted run identity and redirected terminal feed URL to every normalization call', async () => {
    const contexts: ArticleNormalizationContext[] = [];
    const events: string[] = [];
    const result = await collectEndpoint(aggregate(), {
      lockRunner: acquiredLock(events),
      runs: runStore(events),
      fetcher: fetcher(events, contentResult()),
      rssAtomParser: parser(events, {
        ok: true,
        dialect: 'rss',
        items: [
          { title: 'Relative one', url: '../articles/one' },
          { title: 'Relative two', url: '../articles/two' },
        ],
      }),
      normalizeArticleCandidate(rawItem, context) {
        contexts.push(context);
        return normalizeArticleCandidate(rawItem, context);
      },
      applyArticleLinkPolicy,
      ...phase7Dependencies,
      executionId: () => EXECUTION_ID,
    });

    assert.equal(result.status, 'succeeded');
    assert.equal(contexts.length, 2);
    for (const context of contexts) {
      assert.deepEqual(context, {
        sourceId: aggregate().source.id,
        sourceEndpointId: aggregate().endpoint.id,
        collectionRunId: RUN_ID,
        terminalFeedUrl: 'https://feeds.example.test/final.xml',
      });
    }
    if (result.status === 'succeeded') {
      assert.equal(
        result.candidates?.[0]?.originalUrl,
        'https://feeds.example.test/articles/one',
      );
    }
  });

  it('maps fatal normalizer execution to a bounded failed stage and skips Article-link policy', async () => {
    const secret = 'SYNTHETIC_RAW_ITEM_SECRET';
    const events: string[] = [];
    let policyCalls = 0;
    const runs = runStore(events);
    const result = await collectEndpoint(
      aggregate({ admissionPhrases: ['admit me'] }),
      {
        lockRunner: acquiredLock(events),
        runs,
        fetcher: fetcher(events, contentResult()),
        rssAtomParser: parser(events, {
          ok: true,
          dialect: 'rss',
          items: [
            { title: 'Filtered', url: 'https://feeds.example.test/filtered' },
            { title: 'Admit me', url: 'https://feeds.example.test/item' },
          ],
        }),
        normalizeArticleCandidate() {
          throw new Error(secret);
        },
        applyArticleLinkPolicy() {
          policyCalls += 1;
          throw new Error('unreachable');
        },
        ...phase7Dependencies,
        executionId: () => EXECUTION_ID,
      },
    );

    assert.equal(result.status, 'failed');
    if (result.status !== 'failed') return;
    assert.equal(result.outcome, 'normalization_failed');
    assert.equal(result.reason, 'normalization_execution_failed');
    assert.equal(result.transportStatus, 'succeeded');
    assert.equal(result.parserStatus, 'succeeded');
    assert.equal(result.normalizationStatus, 'failed');
    assertProcessingNotRun(result);
    assert.equal(result.rawItemCount, 2);
    assert.equal(result.sourceItemFilteredCount, 1);
    assert.equal(result.normalizedCandidateCount, 0);
    assert.equal(result.normalizationFailureCount, 0);
    assert.equal(policyCalls, 0);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(secret, 'u'));
    assert.deepEqual(events.slice(-2), ['run.finalize', 'release']);
  });

  it('keeps completed normalization accounting when Article-link policy execution fails', async () => {
    const events: string[] = [];
    const runs = runStore(events);
    const result = await collectEndpoint(
      aggregate({ admissionPhrases: ['valid'] }),
      {
        lockRunner: acquiredLock(events),
        runs,
        fetcher: fetcher(events, contentResult()),
        rssAtomParser: parser(events, {
          ok: true,
          dialect: 'rss',
          items: [
            { title: 'Valid', url: 'https://feeds.example.test/valid' },
            {
              content: 'valid editorial text',
              url: 'https://feeds.example.test/missing-title',
            },
            { title: 'Filtered', url: 'https://feeds.example.test/filtered' },
          ],
        }),
        normalizeArticleCandidate,
        applyArticleLinkPolicy() {
          throw new Error('SYNTHETIC_POLICY_SECRET');
        },
        ...phase7Dependencies,
        executionId: () => EXECUTION_ID,
      },
    );

    assert.equal(result.status, 'failed');
    if (result.status !== 'failed') return;
    assert.equal(result.outcome, 'article_link_policy_failed');
    assert.equal(result.reason, 'article_link_policy_execution_failed');
    assert.equal(result.normalizationStatus, 'succeeded');
    assert.equal(result.rawItemCount, 3);
    assert.equal(result.sourceItemFilteredCount, 1);
    assert.equal(result.normalizedCandidateCount, 1);
    assert.equal(result.normalizationFailureCount, 1);
    assert.equal(result.articleLinkRejectionCount, 0);
    assertProcessingNotRun(result);
    assert.equal(result.candidates, undefined);
    assert.deepEqual(runs.finalizations[0], {
      runStatus: 'failed',
      transportStatus: 'succeeded',
      parserStatus: 'succeeded',
      normalizationStatus: 'succeeded',
      httpStatusCode: 200,
      wireByteCount: 321,
      decompressedByteCount: 654,
      redirectCount: 1,
      transportElapsedMilliseconds: 12,
      outcomeCode: 'article_link_policy_failed',
      retryClassification: 'permanent',
      rawItemCount: 3,
      sourceItemFilteredCount: 1,
      normalizedCandidateCount: 1,
      normalizationFailureCount: 1,
      articleLinkRejectionCount: 0,
      ...processingNotRun,
      error: {
        code: 'article_link_policy_execution_failed',
        detail:
          'Article-link policy failed outside its bounded decision contract.',
      },
    });
  });

  it('blocks ineligible and contended endpoints without run, fetch, or parser work', async () => {
    for (const testCase of [
      {
        configuration: aggregate({ publicationActive: false }),
        lockRunner: acquiredLock([]),
        expected: {
          status: 'blocked',
          stage: 'eligibility',
          reason: 'publication_inactive',
        },
      },
      {
        configuration: aggregate(),
        lockRunner: contendedLock(),
        expected: {
          status: 'blocked',
          stage: 'lock',
          reason: 'endpoint_locked',
        },
      },
    ] as const) {
      const events: string[] = [];
      const result = await collectEndpoint(testCase.configuration, {
        lockRunner: testCase.lockRunner,
        runs: runStore(events),
        fetcher: fetcher(events, contentResult()),
        rssAtomParser: parser(events, parserSuccess()),
        ...phase6Dependencies,
        ...phase7Dependencies,
        executionId: () => EXECUTION_ID,
      });
      assert.deepEqual(result, testCase.expected);
      assert.deepEqual(events, []);
    }
  });

  it('releases the lock and performs no network/parser work when run creation fails', async () => {
    const events: string[] = [];
    const expected = new Error('synthetic run start failure');
    const runs = runStore(events, { startFailure: expected });

    await assert.rejects(
      collectEndpoint(aggregate(), {
        lockRunner: acquiredLock(events),
        runs,
        fetcher: fetcher(events, contentResult()),
        rssAtomParser: parser(events, parserSuccess()),
        ...phase6Dependencies,
        ...phase7Dependencies,
        executionId: () => EXECUTION_ID,
      }),
      expected,
    );
    assert.deepEqual(events, ['lock', 'run.start', 'release']);
  });

  it('records a network-safety block after run creation without transport or parser', async () => {
    const events: string[] = [];
    const runs = runStore(events);
    const result = await executeWith(
      events,
      runs,
      Object.freeze({
        status: 'blocked',
        stage: 'network_safety',
        context: 'redirect',
        reason: 'domain_not_approved',
      }),
      parserSuccess(),
    );

    assert.equal(result.status, 'failed');
    if (result.status !== 'failed') return;
    assert.equal(result.outcome, 'network_safety_blocked');
    assert.equal(result.transportStatus, 'not_run');
    assert.equal(result.parserStatus, 'not_run');
    assert.equal(result.safetyContext, 'redirect');
    assert.equal(result.reason, 'domain_not_approved');
    assert.deepEqual(runs.finalizations, [
      {
        runStatus: 'failed',
        transportStatus: 'not_run',
        parserStatus: 'not_run',
        rawItemCount: 0,
        sourceItemFilteredCount: 0,
        normalizationStatus: 'not_run',
        normalizedCandidateCount: 0,
        normalizationFailureCount: 0,
        articleLinkRejectionCount: 0,
        ...processingNotRun,
        outcomeCode: 'network_safety_blocked',
        retryClassification: 'permanent',
        error: {
          code: 'domain_not_approved',
          detail:
            'Destination safety rejected the collection request (domain_not_approved).',
        },
      },
    ]);
    assert.doesNotMatch(events.join(','), /parse/u);
  });

  it('maps fetch failure, 304, and parser failure to truthful stage accounting', async () => {
    const cases: readonly {
      fetchResult: HttpFetcherResult;
      parserResult: ParserResult;
      expected: readonly [
        string,
        'succeeded' | 'failed',
        'not_run' | 'succeeded' | 'not_modified' | 'failed',
        'not_run' | 'succeeded' | 'failed',
        string | undefined,
      ];
      parserCalled: boolean;
    }[] = [
      {
        fetchResult: failureResult(),
        parserResult: parserSuccess(),
        expected: [
          'fetch_failed',
          'failed',
          'failed',
          'not_run',
          'connect_timeout',
        ],
        parserCalled: false,
      },
      {
        fetchResult: notModifiedResult(),
        parserResult: parserSuccess(),
        expected: [
          'not_modified',
          'succeeded',
          'not_modified',
          'not_run',
          undefined,
        ],
        parserCalled: false,
      },
      {
        fetchResult: contentResult(),
        parserResult: {
          ok: false,
          reason: 'malformed_xml',
          detail: 'Feed content is not well-formed XML.',
        },
        expected: [
          'parser_failed',
          'failed',
          'succeeded',
          'failed',
          'malformed_xml',
        ],
        parserCalled: true,
      },
    ];

    for (const testCase of cases) {
      const events: string[] = [];
      let phase6Calls = 0;
      const result = await executeWith(
        events,
        runStore(events),
        testCase.fetchResult,
        testCase.parserResult,
        {
          normalizeArticleCandidate() {
            phase6Calls += 1;
            throw new Error('unreachable');
          },
          applyArticleLinkPolicy() {
            phase6Calls += 1;
            throw new Error('unreachable');
          },
        },
      );
      assert.notEqual(result.status, 'blocked');
      if (result.status === 'blocked') continue;
      assert.deepEqual(
        [
          result.outcome,
          result.runStatus,
          result.transportStatus,
          result.parserStatus,
          result.reason,
        ],
        testCase.expected,
      );
      assert.equal(events.includes('parse'), testCase.parserCalled);
      assert.equal(phase6Calls, 0);
      assert.equal(result.rawItemCount, 0);
      assertProcessingNotRun(result);
    }
  });

  it('surfaces finalization failure with the attempted Phase 6 outcome and releases the lock', async () => {
    const events: string[] = [];
    const persistenceFailure = new Error('synthetic finalization failure');
    const runs = runStore(events, { finalizationFailure: persistenceFailure });

    await assert.rejects(
      collectEndpoint(aggregate(), {
        lockRunner: acquiredLock(events),
        runs,
        fetcher: fetcher(events, contentResult()),
        rssAtomParser: parser(events, {
          ok: true,
          dialect: 'rss',
          items: [
            { title: 'Accepted', url: 'https://feeds.example.test/accepted' },
          ],
        }),
        ...phase6Dependencies,
        ...phase7Dependencies,
        executionId: () => EXECUTION_ID,
      }),
      (error: unknown) => {
        assert.ok(error instanceof CollectionRunFinalizationError);
        assert.equal(error.cause, persistenceFailure);
        assert.equal(error.attemptedResult.status, 'succeeded');
        assert.equal(error.attemptedResult.outcome, 'content');
        assert.equal(error.attemptedResult.normalizationStatus, 'succeeded');
        assert.equal(error.attemptedResult.normalizedCandidateCount, 1);
        assert.deepEqual(processingTuple(error.attemptedResult), [
          'succeeded',
          1,
          0,
          0,
          0,
          0,
          0,
        ]);
        assert.equal(error.attemptedResult.candidates?.length, 1);
        return true;
      },
    );
    assert.deepEqual(events, [
      'lock',
      'run.start',
      'fetch',
      'parse',
      'run.finalize',
      'release',
    ]);
  });

  it('rejects persisted normalization accounting that contradicts the attempted result', async () => {
    const events: string[] = [];
    await assert.rejects(
      collectEndpoint(aggregate(), {
        lockRunner: acquiredLock(events),
        runs: runStore(events, { contradictNormalization: true }),
        fetcher: fetcher(events, contentResult()),
        rssAtomParser: parser(events, parserSuccess()),
        ...phase6Dependencies,
        ...phase7Dependencies,
        executionId: () => EXECUTION_ID,
      }),
      (error: unknown) => {
        assert.ok(error instanceof CollectionRunFinalizationError);
        assert.match(String(error.cause), /inconsistent state/u);
        return true;
      },
    );
  });

  it('rejects persisted processing accounting that contradicts the attempted result', async () => {
    const events: string[] = [];
    await assert.rejects(
      collectEndpoint(aggregate(), {
        lockRunner: acquiredLock(events),
        runs: runStore(events, { contradictProcessing: true }),
        fetcher: fetcher(events, contentResult()),
        rssAtomParser: parser(events, parserSuccess()),
        ...phase6Dependencies,
        ...phase7Dependencies,
        executionId: () => EXECUTION_ID,
      }),
      (error: unknown) => {
        assert.ok(error instanceof CollectionRunFinalizationError);
        assert.match(String(error.cause), /inconsistent state/u);
        return true;
      },
    );
  });

  it('rejects persisted transport and parser state that contradicts the attempted result', async () => {
    for (const options of [
      { contradictTransport: true },
      { contradictParserDiagnostics: true },
    ] as const) {
      const events: string[] = [];
      await assert.rejects(
        collectEndpoint(aggregate(), {
          lockRunner: acquiredLock(events),
          runs: runStore(events, options),
          fetcher: fetcher(events, contentResult()),
          rssAtomParser: parser(events, parserSuccess()),
          ...phase6Dependencies,
          ...phase7Dependencies,
          executionId: () => EXECUTION_ID,
        }),
        (error: unknown) => {
          assert.ok(error instanceof CollectionRunFinalizationError);
          assert.match(String(error.cause), /inconsistent state/u);
          return true;
        },
      );
    }
  });

  it('fails predictably when corrupted mapped state contains an unsupported endpoint type', async () => {
    const events: string[] = [];
    const configuration = aggregate() as EndpointConfigurationAggregate & {
      endpoint: { endpointType: string };
    };
    const corrupted = {
      ...configuration,
      endpoint: { ...configuration.endpoint, endpointType: 'untrusted_type' },
    } as unknown as EndpointConfigurationAggregate;
    const result = await collectEndpoint(corrupted, {
      lockRunner: acquiredLock(events),
      runs: runStore(events),
      fetcher: fetcher(events, contentResult()),
      rssAtomParser: parser(events, parserSuccess()),
      ...phase6Dependencies,
      ...phase7Dependencies,
      executionId: () => EXECUTION_ID,
    });

    assert.equal(result.status, 'failed');
    if (result.status !== 'failed') return;
    assert.equal(result.reason, 'unsupported_endpoint_type');
    assert.equal(result.transportStatus, 'succeeded');
    assert.equal(result.parserStatus, 'failed');
    assert.equal(events.includes('parse'), false);
  });

  it('isolates a failed attempt so a later independent endpoint can execute', async () => {
    const events: string[] = [];
    const first = await executeWith(
      events,
      runStore(events),
      failureResult(),
      parserSuccess(),
    );
    const second = await collectEndpoint(
      aggregate({ endpointId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }),
      {
        lockRunner: acquiredLock(events),
        runs: runStore(events, {
          runId: '99999999-9999-4999-8999-999999999999',
        }),
        fetcher: fetcher(events, contentResult()),
        rssAtomParser: parser(events, parserSuccess()),
        ...phase6Dependencies,
        ...phase7Dependencies,
        executionId: () => '88888888-8888-4888-8888-888888888888',
      },
    );

    assert.equal(first.status, 'failed');
    assert.equal(second.status, 'succeeded');
  });

  it('collects a redirected RSS fixture through safety, real HTTP transport, and the production parser', async () => {
    const server = await startHttpFixtureServer();
    try {
      const transport = createHttpTransport({
        request(_protocol, options, listener) {
          // The production safety gate validates the synthetic public address;
          // this test-only connector then maps that approved transport hop to
          // the controlled loopback fixture without adding a safety bypass.
          return requestHttp(
            {
              ...options,
              protocol: 'http:',
              hostname: server.address,
              port: server.port,
              lookup: undefined,
              family: undefined,
            },
            listener,
          );
        },
      });
      const configuration = aggregateWithPath('/redirect-rss-items');
      const events: string[] = [];
      const result = await collectEndpoint(configuration, {
        lockRunner: acquiredLock(events),
        runs: runStore(events),
        fetcher: createHttpFetcher({
          resolver: {
            async resolve() {
              return [{ address: '8.8.8.8', family: 4 }];
            },
          },
          transport,
        }),
        rssAtomParser: new RssAtomParser(),
        ...phase6Dependencies,
        ...phase7Dependencies,
        executionId: () => EXECUTION_ID,
      });

      assert.equal(result.status, 'succeeded');
      if (result.status !== 'succeeded') return;
      assert.equal(result.outcome, 'content');
      assert.equal(result.redirectCount, 1);
      assert.equal(result.rawItemCount, 1);
      assert.equal(
        result.candidates?.[0]?.displayTitle,
        'Canonical fixture item',
      );
      assert.deepEqual(
        server.requests.map((request) => request.url),
        ['/redirect-rss-items', '/rss-items'],
      );
    } finally {
      await server.close();
    }
  });

  it('collects HTML through the shared pipeline with terminal URL normalization and no discovered requests', async () => {
    const server = await startHttpFixtureServer();
    try {
      const transport = createHttpTransport({
        request(_protocol, options, listener) {
          return requestHttp(
            {
              ...options,
              protocol: 'http:',
              hostname: server.address,
              port: server.port,
              lookup: undefined,
              family: undefined,
            },
            listener,
          );
        },
      });
      const events: string[] = [];
      const runs = runStore(events);
      const result = await collectEndpoint(
        htmlAggregate('/redirect-html-listing', ['only RSS items match this']),
        {
          lockRunner: acquiredLock(events),
          runs,
          fetcher: createHttpFetcher({
            resolver: {
              async resolve() {
                return [{ address: '8.8.8.8', family: 4 }];
              },
            },
            transport,
          }),
          rssAtomParser: parser(events, parserSuccess()),
          ...phase6Dependencies,
          ...phase7Dependencies,
          async processIncludedArticle() {
            events.push('persist');
            return includedProcessingSuccess('created');
          },
          executionId: () => EXECUTION_ID,
        },
      );

      assert.equal(result.status, 'succeeded');
      if (result.status !== 'succeeded') return;
      assert.equal(result.rawItemCount, 1);
      assert.equal(result.sourceItemFilteredCount, 0);
      assert.equal(result.createdCount, 1);
      assert.equal(
        result.candidates?.[0]?.originalUrl,
        'https://feeds.example.test/lists/articles/static?utm_source=fixture',
      );
      assert.deepEqual(runs.finalizations[0]?.parserDiagnostics, {
        kind: 'html_listing',
        version: '1',
        htmlListingProfileRevision: 7,
        itemFailureCount: 1,
        code: 'required_field_missing',
        detail: 'A matched item is missing a required extracted value.',
      });
      assert.deepEqual(
        server.requests.map((request) => request.url),
        ['/redirect-html-listing', '/lists/current/index.html'],
      );
      assert.equal(events.includes('parse'), false);
      assert.equal(events.includes('html parse adapter'), false);
    } finally {
      await server.close();
    }
  });

  it('records bounded HTML parser failure diagnostics without entering downstream stages', async () => {
    const events: string[] = [];
    const runs = runStore(events);
    const result = await collectEndpoint(htmlAggregate('/listing'), {
      lockRunner: acquiredLock(events),
      runs,
      fetcher: fetcher(
        events,
        Object.freeze({
          outcome: 'content' as const,
          content: Buffer.from('<main></main>'),
          mediaType: 'text/html',
          response: Object.freeze({ contentType: 'text/html' }),
          finalUrl: 'https://feeds.example.test/listing',
          redirectCount: 0,
          metrics: fetchMetrics(200),
        }),
      ),
      rssAtomParser: parser(events, parserSuccess()),
      ...phase6Dependencies,
      ...phase7Dependencies,
      executionId: () => EXECUTION_ID,
    });

    assert.equal(result.status, 'failed');
    if (result.status !== 'failed') return;
    assert.equal(result.outcome, 'parser_failed');
    assert.equal(result.reason, 'no_matching_items');
    assert.equal(events.includes('normalize'), false);
    assert.deepEqual(runs.finalizations[0]?.parserDiagnostics, {
      kind: 'html_listing',
      version: '1',
      htmlListingProfileRevision: 7,
      code: 'no_matching_items',
      detail: 'HTML profile matched no listing items.',
    });
  });
});

async function executeWith(
  events: string[],
  runs: ReturnType<typeof runStore>,
  fetchResult: HttpFetcherResult,
  parserResult: ParserResult,
  phase6: Pick<
    CollectEndpointDependencies,
    'normalizeArticleCandidate' | 'applyArticleLinkPolicy'
  > = phase6Dependencies,
) {
  return collectEndpoint(aggregate(), {
    lockRunner: acquiredLock(events),
    runs,
    fetcher: fetcher(events, fetchResult),
    rssAtomParser: parser(events, parserResult),
    ...phase6,
    ...phase7Dependencies,
    executionId: () => EXECUTION_ID,
  });
}

const phase6Dependencies = Object.freeze({
  normalizeArticleCandidate,
  applyArticleLinkPolicy,
});

const phase7Dependencies = Object.freeze({
  async loadRelevanceConfiguration() {
    return EMPTY_RELEVANCE_CONFIGURATION;
  },
  evaluateRelevance,
  async processIncludedArticle() {
    return includedProcessingSuccess('created');
  },
  async persistExcludedArticle() {
    return excludedPersistenceSuccess();
  },
  observationTime: () => new Date('2026-08-08T12:00:00.000Z'),
});

const EMPTY_RELEVANCE_CONFIGURATION = Object.freeze({
  rules: Object.freeze([]),
});

function includedProcessingSuccess(
  outcome: 'created' | 'updated' | 'unchanged',
): IncludedArticleProcessingResult {
  return {
    outcome,
    duplicateReviewCreatedCount: 0,
    duplicateGroupedCount: 0,
  } as IncludedArticleProcessingResult;
}

function excludedPersistenceSuccess(): ExcludedArticlePersistenceResult {
  return { outcome: 'excluded' } as ExcludedArticlePersistenceResult;
}

function acquiredLock(events: string[]): EndpointExecutionLockRunner {
  return {
    async run<T>(
      _endpointId: string,
      work: () => Promise<T>,
    ): Promise<EndpointRunLockResult<T>> {
      events.push('lock');
      try {
        return { status: 'acquired', value: await work() };
      } finally {
        events.push('release');
      }
    },
  };
}

function contendedLock(): EndpointExecutionLockRunner {
  return {
    async run<T>(): Promise<EndpointRunLockResult<T>> {
      return { status: 'blocked', stage: 'lock', reason: 'endpoint_locked' };
    },
  };
}

function runStore(
  events: string[],
  options: {
    readonly startFailure?: Error;
    readonly finalizationFailure?: Error;
    readonly runId?: string;
    readonly contradictNormalization?: boolean;
    readonly contradictProcessing?: boolean;
    readonly contradictTransport?: boolean;
    readonly contradictParserDiagnostics?: boolean;
  } = {},
): CollectionRunStore & {
  readonly finalizations: FinalizeCollectionRunInput[];
} {
  const finalizations: FinalizeCollectionRunInput[] = [];
  const runId = options.runId ?? RUN_ID;
  let endpointId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  let executionId = EXECUTION_ID;
  return {
    finalizations,
    async start(input) {
      events.push('run.start');
      if (options.startFailure !== undefined) throw options.startFailure;
      endpointId = input.sourceEndpointId;
      executionId = input.executionId;
      return persistedRun({
        id: runId,
        endpointId,
        executionId,
      });
    },
    async finalize(_collectionRunId, input) {
      events.push('run.finalize');
      finalizations.push(input);
      if (options.finalizationFailure !== undefined)
        throw options.finalizationFailure;
      const persisted = persistedRun({
        id: runId,
        endpointId,
        executionId,
        finalization: input,
      });
      if (options.contradictNormalization) {
        return Object.freeze({ ...persisted, normalizedCandidateCount: 1 });
      }
      if (options.contradictProcessing) {
        return Object.freeze({ ...persisted, createdCount: 1 });
      }
      if (options.contradictTransport) {
        return Object.freeze({ ...persisted, redirectCount: 99 });
      }
      if (options.contradictParserDiagnostics) {
        return Object.freeze({ ...persisted, parserKind: 'rss_atom' as const });
      }
      return persisted;
    },
  };
}

function fetcher(events: string[], result: HttpFetcherResult): HttpFetcher {
  return {
    async fetch() {
      events.push('fetch');
      return result;
    },
  };
}

function parser(events: string[], result: ParserResult): FeedParser {
  return {
    parse() {
      events.push('parse');
      return result;
    },
  };
}

function persistedRun(input: {
  readonly id: string;
  readonly endpointId: string;
  readonly executionId: string;
  readonly finalization?: FinalizeCollectionRunInput;
}): PersistedCollectionRun {
  const finalization = input.finalization;
  return Object.freeze({
    id: input.id,
    sourceEndpointId: input.endpointId,
    executionId: input.executionId,
    triggerKind: 'manual',
    startedAt: new Date('2026-08-08T12:00:00.000Z'),
    finishedAt:
      finalization === undefined
        ? undefined
        : new Date('2026-08-08T12:00:01.000Z'),
    runStatus: finalization?.runStatus ?? 'running',
    transportStatus: finalization?.transportStatus ?? 'not_run',
    parserStatus: finalization?.parserStatus ?? 'not_run',
    parserKind: finalization?.parserDiagnostics?.kind,
    parserVersion: finalization?.parserDiagnostics?.version,
    htmlListingProfileRevision:
      finalization?.parserDiagnostics?.htmlListingProfileRevision,
    parserItemFailureCount:
      finalization?.parserDiagnostics?.itemFailureCount ?? 0,
    parserDiagnosticCode: finalization?.parserDiagnostics?.code,
    parserDiagnosticDetail: finalization?.parserDiagnostics?.detail,
    normalizationStatus: finalization?.normalizationStatus ?? 'not_run',
    processingStatus: finalization?.processingStatus ?? 'not_run',
    httpStatusCode: finalization?.httpStatusCode,
    wireByteCount: finalization?.wireByteCount,
    decompressedByteCount: finalization?.decompressedByteCount,
    redirectCount: finalization?.redirectCount,
    transportElapsedMilliseconds: finalization?.transportElapsedMilliseconds,
    retryClassification: finalization?.retryClassification,
    outcomeCode: finalization?.outcomeCode,
    responseEtag: finalization?.responseValidators?.etag,
    responseLastModified: finalization?.responseValidators?.lastModified,
    rawItemCount: finalization?.rawItemCount ?? 0,
    sourceItemFilteredCount: finalization?.sourceItemFilteredCount ?? 0,
    normalizedCandidateCount: finalization?.normalizedCandidateCount ?? 0,
    normalizationFailureCount: finalization?.normalizationFailureCount ?? 0,
    articleLinkRejectionCount: finalization?.articleLinkRejectionCount ?? 0,
    createdCount: finalization?.createdCount ?? 0,
    updatedCount: finalization?.updatedCount ?? 0,
    unchangedCount: finalization?.unchangedCount ?? 0,
    rejectedCount: finalization?.rejectedCount ?? 0,
    excludedCount: finalization?.excludedCount ?? 0,
    failedCount: finalization?.failedCount ?? 0,
    duplicateReviewCreatedCount: finalization?.duplicateReviewCreatedCount ?? 0,
    duplicateGroupedCount: finalization?.duplicateGroupedCount ?? 0,
    errorCode: finalization?.error?.code,
    errorDetail: finalization?.error?.detail,
  });
}

const processingNotRun = {
  processingStatus: 'not_run',
  createdCount: 0,
  updatedCount: 0,
  unchangedCount: 0,
  rejectedCount: 0,
  excludedCount: 0,
  failedCount: 0,
  duplicateReviewCreatedCount: 0,
  duplicateGroupedCount: 0,
} as const;

function assertProcessingNotRun(result: {
  readonly processingStatus: string;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly rejectedCount: number;
  readonly excludedCount: number;
  readonly failedCount: number;
}): void {
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
    ['not_run', 0, 0, 0, 0, 0, 0],
  );
}

function processingTuple(result: {
  readonly processingStatus: string;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly rejectedCount: number;
  readonly excludedCount: number;
  readonly failedCount: number;
}): readonly [string, number, number, number, number, number, number] {
  return [
    result.processingStatus,
    result.createdCount,
    result.updatedCount,
    result.unchangedCount,
    result.rejectedCount,
    result.excludedCount,
    result.failedCount,
  ];
}

function parserSuccess(): ParserResult {
  return Object.freeze({
    ok: true,
    dialect: 'rss',
    items: Object.freeze([]),
  });
}

function contentResult(): HttpFetcherResult {
  return Object.freeze({
    outcome: 'content',
    content: Buffer.from('<rss><channel/></rss>'),
    mediaType: 'application/rss+xml',
    response: Object.freeze({ contentType: 'application/rss+xml' }),
    finalUrl: 'https://feeds.example.test/final.xml',
    redirectCount: 1,
    metrics: fetchMetrics(200),
  });
}

function notModifiedResult(): HttpFetcherResult {
  return Object.freeze({
    outcome: 'not_modified',
    response: Object.freeze({ etag: '"fixture"' }),
    finalUrl: 'https://feeds.example.test/feed.xml',
    redirectCount: 0,
    metrics: fetchMetrics(304),
  });
}

function failureResult(): HttpFetcherResult {
  return Object.freeze({
    outcome: 'failure',
    reason: 'connect_timeout',
    retry: 'transient',
    detail: 'Connection establishment exceeded the configured timeout.',
    finalUrl: 'https://feeds.example.test/feed.xml',
    redirectCount: 0,
    metrics: fetchMetrics(undefined),
  });
}

function fetchMetrics(httpStatus: number | undefined) {
  return Object.freeze({
    elapsedMilliseconds: 12,
    hopCount: 1,
    wireBytes: 321,
    decompressedBytes: 654,
    hops: Object.freeze([
      Object.freeze({
        elapsedMilliseconds: 12,
        ...(httpStatus === undefined ? {} : { httpStatus }),
        wireBytes: 321,
        decompressedBytes: 654,
        selectedAddress: '8.8.8.8',
        selectedAddressFamily: 4 as const,
      }),
    ]),
  });
}

interface AggregateOverrides {
  readonly publicationActive?: boolean;
  readonly endpointId?: string;
  readonly admissionPhrases?: readonly string[];
}

function aggregate(
  overrides: AggregateOverrides = {},
): EndpointConfigurationAggregate {
  const timestamp = new Date('2026-08-08T00:00:00.000Z');
  return {
    publication: {
      name: 'Generic news',
      activeForCollection: overrides.publicationActive ?? true,
      publicStatus: 'private',
      description: null,
      logoPath: null,
      accentColor: null,
      presentationTimezone: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    source: {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      configKey: 'generic_source',
      displayName: 'Generic source',
      siteUrl: { value: 'https://example.test/', hostname: 'example.test' },
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
      priority: 0,
      rssAtomAdmissionPhrases: overrides.admissionPhrases ?? [],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    sourceDomainRules: [{ hostname: 'example.test', includeSubdomains: true }],
    endpoint: {
      id: overrides.endpointId ?? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      sourceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      configKey: 'main_feed',
      endpointUrl: {
        value: 'https://feeds.example.test/feed.xml',
        hostname: 'feeds.example.test',
      },
      endpointType: 'rss_atom',
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
      pollIntervalSeconds: 300,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    endpointDomainRules: [
      { hostname: 'feeds.example.test', includeSubdomains: false },
    ],
  };
}

function aggregateWithPath(path: string): EndpointConfigurationAggregate {
  const configuration = aggregate();
  return {
    ...configuration,
    endpoint: {
      ...configuration.endpoint,
      endpointUrl: {
        value: `https://feeds.example.test${path}`,
        hostname: 'feeds.example.test',
      },
    },
  };
}

function htmlAggregate(
  path: string,
  admissionPhrases: readonly string[] = [],
): EndpointConfigurationAggregate {
  const configuration = aggregate({ admissionPhrases });
  return {
    ...configuration,
    endpoint: {
      ...configuration.endpoint,
      endpointUrl: {
        value: `https://feeds.example.test${path}`,
        hostname: 'feeds.example.test',
      },
      endpointType: 'html_listing',
      htmlListingProfile: normalizeHtmlListingProfile({
        itemSelector: '.item',
        title: { selector: '.title' },
        articleLink: { selector: '.article' },
      }),
      htmlListingProfileRevision: 7,
    },
  };
}

function observedAggregate(events: string[]): EndpointConfigurationAggregate {
  const configuration = aggregate();
  return {
    ...configuration,
    publication: {
      ...configuration.publication,
      get activeForCollection() {
        events.push('eligibility');
        return true;
      },
    },
  };
}
