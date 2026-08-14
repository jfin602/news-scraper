import assert from 'node:assert/strict';
import { request as requestHttp } from 'node:http';
import { test } from 'node:test';

import { applyArticleLinkPolicy } from '../../src/collection/article-links/policy.ts';
import type { ArticlePersistenceResult } from '../../src/articles/repository.ts';
import {
  collectEndpoint,
  type CollectionRunStore,
  type EndpointCollectionAttemptResult,
} from '../../src/collection/collect-endpoint.ts';
import type { EndpointExecutionLockRunner } from '../../src/collection/execution.ts';
import { createHttpFetcher } from '../../src/collection/fetchers/http-fetcher.ts';
import { createHttpTransport } from '../../src/collection/fetchers/http-transport.ts';
import type { EndpointRunLockResult } from '../../src/collection/locks/endpoint-run-lock.ts';
import { normalizeArticleCandidate } from '../../src/collection/normalization/normalizer.ts';
import { evaluateRelevance } from '../../src/collection/relevance/evaluator.ts';
import { RssAtomParser } from '../../src/collection/parsers/rss-atom-parser.ts';
import type {
  FinalizeCollectionRunInput,
  PersistedCollectionRun,
} from '../../src/collection/runs/repository.ts';
import type { EndpointConfigurationAggregate } from '../../src/sources/repository.ts';
import { startHttpFixtureServer } from '../support/collection/http-fixture-server.ts';

const RUN_ID = '61616161-6161-4616-8616-616161616161';
const EXECUTION_ID = '62626262-6262-4626-8626-626262626262';

test('canonical collection normalizes deterministic RSS, Atom, redirect, and isolation fixtures', async () => {
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
    const fetcher = createHttpFetcher({
      resolver: {
        async resolve() {
          return [{ address: '8.8.8.8', family: 4 }];
        },
      },
      transport,
    });

    const rss = await collect('/phase6/rss', fetcher);
    assertContentAccounting(rss, [5, 0, 4, 1, 1, 3]);
    const [markup, missingDate, invalidDate] = rss.candidates ?? [];
    assert.equal(markup?.displayTitle, 'Safe Title & Entities');
    assert.equal(
      markup?.originalUrl,
      'https://feeds.example.test/articles/one?utm_source=fixture&edition=pro#section',
    );
    assert.equal(
      markup?.canonicalIdentityUrl,
      'https://feeds.example.test/articles/one?edition=pro',
    );
    assert.equal(markup?.summary, 'Hello & world');
    assert.deepEqual(markup?.publishedAt, {
      status: 'parsed',
      value: '2026-08-10T12:00:00.000Z',
      fallback: 'first_seen',
    });
    assert.deepEqual(missingDate?.publishedAt, {
      status: 'missing',
      fallback: 'first_seen',
    });
    assert.deepEqual(invalidDate?.publishedAt, {
      status: 'invalid',
      fallback: 'first_seen',
    });

    const atom = await collect('/phase6/atom', fetcher);
    assertContentAccounting(atom, [1, 0, 1, 0, 0, 1]);
    assert.deepEqual(atom.candidates?.[0]?.publishedAt, {
      status: 'parsed',
      value: '2026-08-10T17:30:00.000Z',
      fallback: 'first_seen',
    });

    const redirected = await collect('/phase6/redirect', fetcher);
    assertContentAccounting(redirected, [1, 0, 1, 0, 0, 1]);
    assert.equal(redirected.redirectCount, 1);
    assert.equal(
      redirected.candidates?.[0]?.originalUrl,
      'https://feeds.example.test/phase6/articles/redirected?utm_medium=fixture&edition=semantic#fragment',
    );
    assert.equal(
      redirected.candidates?.[0]?.canonicalIdentityUrl,
      'https://feeds.example.test/phase6/articles/redirected?edition=semantic',
    );

    const zero = await collect('/phase6/zero', fetcher);
    assertContentAccounting(zero, [0, 0, 0, 0, 0, 0]);

    const filteredRss = await collect('/phase6/rss', fetcher, [
      'hello & world',
    ]);
    assertContentAccounting(filteredRss, [5, 4, 1, 0, 0, 1]);
    assert.equal(
      filteredRss.candidates?.[0]?.displayTitle,
      'Safe Title & Entities',
    );

    const filteredAtom = await collect('/phase6/atom', fetcher, [
      'phrase absent from atom fixture',
    ]);
    assertContentAccounting(filteredAtom, [1, 1, 0, 0, 0, 0]);

    const rerun = await collect('/phase6/rss', fetcher);
    assert.equal(rerun.status, 'succeeded');
    if (rerun.status === 'succeeded') {
      assert.deepEqual(rerun.candidates, rss.candidates);
    }
  } finally {
    await server.close();
  }
});

async function collect(
  path: string,
  fetcher: ReturnType<typeof createHttpFetcher>,
  admissionPhrases: readonly string[] = [],
) {
  return collectEndpoint(aggregate(path, admissionPhrases), {
    lockRunner: acquiredLock(),
    runs: runStore(),
    fetcher,
    rssAtomParser: new RssAtomParser(),
    normalizeArticleCandidate,
    applyArticleLinkPolicy,
    async loadRelevanceConfiguration() {
      return { rules: [] };
    },
    evaluateRelevance,
    async persistArticle() {
      return { outcome: 'created' } as ArticlePersistenceResult;
    },
    async persistExcludedArticle() {
      throw new Error('default-include fixture cannot be excluded');
    },
    observationTime: () => new Date('2026-08-10T12:00:00.000Z'),
    executionId: () => EXECUTION_ID,
  });
}

function assertContentAccounting(
  result: Awaited<ReturnType<typeof collect>>,
  expected: readonly [number, number, number, number, number, number],
): asserts result is EndpointCollectionAttemptResult & { status: 'succeeded' } {
  assert.equal(result.status, 'succeeded');
  if (result.status !== 'succeeded') return;
  assert.equal(result.outcome, 'content');
  assert.equal(result.transportStatus, 'succeeded');
  assert.equal(result.parserStatus, 'succeeded');
  assert.equal(result.normalizationStatus, 'succeeded');
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
    ['succeeded', expected[5], 0, 0, expected[4], 0, 0],
  );
  assert.deepEqual(
    [
      result.rawItemCount,
      result.sourceItemFilteredCount,
      result.normalizedCandidateCount,
      result.normalizationFailureCount,
      result.articleLinkRejectionCount,
      result.candidates?.length,
    ],
    expected,
  );
  assert.ok(Object.isFrozen(result.candidates));
}

function acquiredLock(): EndpointExecutionLockRunner {
  return Object.freeze({
    async run<T>(
      _endpointId: string,
      work: () => Promise<T>,
    ): Promise<EndpointRunLockResult<T>> {
      return { status: 'acquired', value: await work() };
    },
  });
}

function runStore(): CollectionRunStore {
  let endpointId = '';
  return Object.freeze({
    async start(input: {
      readonly sourceEndpointId: string;
      readonly executionId: string;
    }) {
      endpointId = input.sourceEndpointId;
      return persistedRun(endpointId, input.executionId);
    },
    async finalize(
      _collectionRunId: string,
      finalization: FinalizeCollectionRunInput,
    ) {
      return persistedRun(endpointId, EXECUTION_ID, finalization);
    },
  });
}

function persistedRun(
  endpointId: string,
  executionId: string,
  finalization?: FinalizeCollectionRunInput,
): PersistedCollectionRun {
  return Object.freeze({
    id: RUN_ID,
    sourceEndpointId: endpointId,
    executionId,
    triggerKind: 'manual',
    startedAt: new Date('2026-08-10T12:00:00.000Z'),
    finishedAt:
      finalization === undefined
        ? undefined
        : new Date('2026-08-10T12:00:01.000Z'),
    runStatus: finalization?.runStatus ?? 'running',
    transportStatus: finalization?.transportStatus ?? 'not_run',
    parserStatus: finalization?.parserStatus ?? 'not_run',
    normalizationStatus: finalization?.normalizationStatus ?? 'not_run',
    processingStatus: finalization?.processingStatus ?? 'not_run',
    httpStatusCode: finalization?.httpStatusCode,
    wireByteCount: finalization?.wireByteCount,
    decompressedByteCount: finalization?.decompressedByteCount,
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
    errorCode: finalization?.error?.code,
    errorDetail: finalization?.error?.detail,
  });
}

function aggregate(
  path: string,
  admissionPhrases: readonly string[],
): EndpointConfigurationAggregate {
  const timestamp = new Date('2026-08-10T00:00:00.000Z');
  return Object.freeze({
    publication: Object.freeze({
      name: 'Fixture publication',
      activeForCollection: true,
      publicStatus: 'private',
      description: null,
      logoPath: null,
      accentColor: null,
      presentationTimezone: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    source: Object.freeze({
      id: '64646464-6464-4646-8646-646464646464',
      configKey: 'fixture_source',
      displayName: 'Fixture Source',
      siteUrl: Object.freeze({
        value: 'https://feeds.example.test/',
        hostname: 'feeds.example.test',
      }),
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
      priority: 0,
      rssAtomAdmissionPhrases: Object.freeze([...admissionPhrases]),
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    sourceDomainRules: Object.freeze([
      Object.freeze({
        hostname: 'feeds.example.test',
        includeSubdomains: false,
      }),
    ]),
    endpoint: Object.freeze({
      id: '65656565-6565-4656-8656-656565656565',
      sourceId: '64646464-6464-4646-8646-646464646464',
      configKey: 'fixture_feed',
      endpointUrl: Object.freeze({
        value: `https://feeds.example.test${path}`,
        hostname: 'feeds.example.test',
      }),
      endpointType: 'rss_atom',
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
      pollIntervalSeconds: 300,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    endpointDomainRules: Object.freeze([
      Object.freeze({
        hostname: 'feeds.example.test',
        includeSubdomains: false,
      }),
    ]),
  });
}
