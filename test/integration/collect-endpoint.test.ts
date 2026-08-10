import assert from 'node:assert/strict';
import { request as requestHttp } from 'node:http';
import { describe, it } from 'node:test';

import {
  collectEndpoint,
  CollectionRunFinalizationError,
  type CollectionRunStore,
} from '../../src/collection/collect-endpoint.ts';
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
            title: 'Fixture item',
            categories: ['News'],
            diagnostics: { fixture: 'yes' },
          },
        ],
      }),
      executionId: () => EXECUTION_ID,
    });

    assert.deepEqual(events, [
      'eligibility',
      'lock',
      'run.start',
      'fetch',
      'parse',
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
    assert.equal(result.rawItemCount, 1);
    assert.equal(result.httpStatusCode, 200);
    assert.equal(result.wireByteCount, 321);
    assert.equal(result.decompressedByteCount, 654);
    assert.equal(result.redirectCount, 1);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.rawItems));
    assert.ok(Object.isFrozen(result.rawItems?.[0]));
    assert.ok(Object.isFrozen(result.rawItems?.[0]?.categories));
    assert.ok(Object.isFrozen(result.rawItems?.[0]?.diagnostics));
    assert.deepEqual(runs.finalizations, [
      {
        runStatus: 'succeeded',
        transportStatus: 'succeeded',
        parserStatus: 'succeeded',
        httpStatusCode: 200,
        wireByteCount: 321,
        decompressedByteCount: 654,
        rawItemCount: 1,
        normalizationStatus: 'not_run',
        normalizedCandidateCount: 0,
        normalizationFailureCount: 0,
        articleLinkRejectionCount: 0,
      },
    ]);
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
        normalizationStatus: 'not_run',
        normalizedCandidateCount: 0,
        normalizationFailureCount: 0,
        articleLinkRejectionCount: 0,
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
      const result = await executeWith(
        events,
        runStore(events),
        testCase.fetchResult,
        testCase.parserResult,
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
      assert.equal(result.rawItemCount, 0);
    }
  });

  it('surfaces finalization failure with the attempted outcome and releases the lock', async () => {
    const events: string[] = [];
    const persistenceFailure = new Error('synthetic finalization failure');
    const runs = runStore(events, { finalizationFailure: persistenceFailure });

    await assert.rejects(
      collectEndpoint(aggregate(), {
        lockRunner: acquiredLock(events),
        runs,
        fetcher: fetcher(events, failureResult()),
        rssAtomParser: parser(events, parserSuccess()),
        executionId: () => EXECUTION_ID,
      }),
      (error: unknown) => {
        assert.ok(error instanceof CollectionRunFinalizationError);
        assert.equal(error.cause, persistenceFailure);
        assert.equal(error.attemptedResult.status, 'failed');
        assert.equal(error.attemptedResult.reason, 'connect_timeout');
        return true;
      },
    );
    assert.deepEqual(events, [
      'lock',
      'run.start',
      'fetch',
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
        executionId: () => EXECUTION_ID,
      }),
      (error: unknown) => {
        assert.ok(error instanceof CollectionRunFinalizationError);
        assert.match(String(error.cause), /inconsistent state/u);
        return true;
      },
    );
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
        executionId: () => EXECUTION_ID,
      });

      assert.equal(result.status, 'succeeded');
      if (result.status !== 'succeeded') return;
      assert.equal(result.outcome, 'content');
      assert.equal(result.redirectCount, 1);
      assert.equal(result.rawItemCount, 1);
      assert.equal(result.rawItems?.[0]?.title, 'Canonical fixture item');
      assert.deepEqual(
        server.requests.map((request) => request.url),
        ['/redirect-rss-items', '/rss-items'],
      );
    } finally {
      await server.close();
    }
  });
});

async function executeWith(
  events: string[],
  runs: ReturnType<typeof runStore>,
  fetchResult: HttpFetcherResult,
  parserResult: ParserResult,
) {
  return collectEndpoint(aggregate(), {
    lockRunner: acquiredLock(events),
    runs,
    fetcher: fetcher(events, fetchResult),
    rssAtomParser: parser(events, parserResult),
    executionId: () => EXECUTION_ID,
  });
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
      return options.contradictNormalization
        ? Object.freeze({ ...persisted, normalizedCandidateCount: 1 })
        : persisted;
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
    startedAt: new Date('2026-08-08T12:00:00.000Z'),
    finishedAt:
      finalization === undefined
        ? undefined
        : new Date('2026-08-08T12:00:01.000Z'),
    runStatus: finalization?.runStatus ?? 'running',
    transportStatus: finalization?.transportStatus ?? 'not_run',
    parserStatus: finalization?.parserStatus ?? 'not_run',
    normalizationStatus: finalization?.normalizationStatus ?? 'not_run',
    httpStatusCode: finalization?.httpStatusCode,
    wireByteCount: finalization?.wireByteCount,
    decompressedByteCount: finalization?.decompressedByteCount,
    rawItemCount: finalization?.rawItemCount ?? 0,
    normalizedCandidateCount: finalization?.normalizedCandidateCount ?? 0,
    normalizationFailureCount: finalization?.normalizationFailureCount ?? 0,
    articleLinkRejectionCount: finalization?.articleLinkRejectionCount ?? 0,
    errorCode: finalization?.error?.code,
    errorDetail: finalization?.error?.detail,
  });
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
}

function aggregate(
  overrides: AggregateOverrides = {},
): EndpointConfigurationAggregate {
  const timestamp = new Date('2026-08-08T00:00:00.000Z');
  return {
    publication: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Generic news',
      slug: 'generic-news',
      activeForCollection: overrides.publicationActive ?? true,
      publicStatus: 'private',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    source: {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      publicationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      configKey: 'generic_source',
      displayName: 'Generic source',
      siteUrl: { value: 'https://example.test/', hostname: 'example.test' },
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
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
