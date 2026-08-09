import assert from 'node:assert/strict';
import { request as requestHttp } from 'node:http';
import { describe, it } from 'node:test';

import {
  createHttpFetcher,
  type HttpFetcherRequest,
  type HttpFetcherResult,
} from '../../src/collection/fetchers/http-fetcher.ts';
import { createHttpTransport } from '../../src/collection/fetchers/http-transport.ts';
import type {
  Fetcher,
  FetchRequest,
  FetchResult,
  TransportMetrics,
} from '../../src/collection/fetchers/fetcher.ts';
import type { DestinationResolver } from '../../src/collection/safety/resolver.ts';
import type { EndpointConfigurationAggregate } from '../../src/sources/repository.ts';
import { startHttpFixtureServer } from '../support/collection/http-fixture-server.ts';

describe('redirect-aware HTTP fetcher', () => {
  it('blocks the initial destination before transport and preserves the Phase 4 decision', async () => {
    const requests: FetchRequest[] = [];
    const fetcher = createHttpFetcher({
      resolver: resolverSequence([[{ address: '127.0.0.1', family: 4 }]]),
      transport: recordingTransport(requests, () => content()),
    });

    const result = await fetcher.fetch(requestFor('/xml'));

    assert.deepEqual(result, {
      status: 'blocked',
      stage: 'network_safety',
      context: 'initial',
      reason: 'unsafe_resolved_address',
    });
    assert.deepEqual(requests, []);
  });

  it('hands the exact newly validated initial address set to one-hop transport', async () => {
    const requests: FetchRequest[] = [];
    const answers = Object.freeze([
      Object.freeze({ address: '8.8.8.8', family: 4 as const }),
      Object.freeze({ address: '2606:4700:4700::1111', family: 6 as const }),
    ]);
    const fetcher = createHttpFetcher({
      resolver: resolverSequence([answers]),
      transport: recordingTransport(requests, () => content()),
      now: () => 10,
    });

    const result = await fetcher.fetch(requestFor('/xml'));

    assertTerminal(result);
    assert.equal(result.outcome, 'content');
    if (result.outcome !== 'content') return;
    assert.equal(result.finalUrl, 'https://feeds.example.test/xml');
    assert.equal(result.redirectCount, 0);
    assert.equal(result.metrics.hopCount, 1);
    assert.deepEqual(requests[0]!.destination.addresses, answers);
    assert.notEqual(requests[0]!.destination.addresses, answers);
  });

  it('resolves relative and allowed absolute redirects through fresh safety decisions', async () => {
    const hostnames: string[] = [];
    const requests: FetchRequest[] = [];
    const resolver: DestinationResolver = {
      async resolve(hostname) {
        hostnames.push(hostname);
        return [
          {
            address: hostnames.length === 1 ? '8.8.8.8' : '1.1.1.1',
            family: 4,
          },
        ];
      },
    };
    const fetcher = createHttpFetcher({
      resolver,
      transport: recordingTransport(requests, (_request, index) => {
        if (index === 0) return redirect('../archive.xml');
        if (index === 1)
          return redirect('https://feeds.example.test/final.xml');
        return content();
      }),
    });

    const result = await fetcher.fetch(requestFor('/news/current.xml'));

    assertTerminal(result);
    assert.equal(result.outcome, 'content');
    if (result.outcome !== 'content') return;
    assert.equal(result.finalUrl, 'https://feeds.example.test/final.xml');
    assert.equal(result.redirectCount, 2);
    assert.deepEqual(hostnames, [
      'feeds.example.test',
      'feeds.example.test',
      'feeds.example.test',
    ]);
    assert.deepEqual(
      requests.map((request) => request.destination.requestUrl),
      [
        'https://feeds.example.test/news/current.xml',
        'https://feeds.example.test/archive.xml',
        'https://feeds.example.test/final.xml',
      ],
    );
    assert.deepEqual(requests[0]!.destination.addresses, [
      { address: '8.8.8.8', family: 4 },
    ]);
    assert.deepEqual(requests[1]!.destination.addresses, [
      { address: '1.1.1.1', family: 4 },
    ]);
  });

  it('blocks malformed, unapproved, credential-bearing, non-default-port, and unsupported-scheme redirects before target transport', async () => {
    const cases = [
      ['http://[malformed', 'invalid_destination_url'],
      ['https://outside.test/feed.xml', 'domain_not_approved'],
      [
        'https://user:secret@feeds.example.test/feed.xml',
        'invalid_destination_url',
      ],
      ['https://feeds.example.test:8443/feed.xml', 'port_not_allowed'],
      ['ftp://feeds.example.test/feed.xml', 'unsupported_scheme'],
    ] as const;

    for (const [location, reason] of cases) {
      const requests: FetchRequest[] = [];
      const resolverCalls: string[] = [];
      const fetcher = createHttpFetcher({
        resolver: resolverSequence(
          [[{ address: '8.8.8.8', family: 4 }]],
          resolverCalls,
        ),
        transport: recordingTransport(requests, () => redirect(location)),
      });
      const result = await fetcher.fetch(requestFor('/xml'));

      assert.deepEqual(result, {
        status: 'blocked',
        stage: 'network_safety',
        context: 'redirect',
        reason,
      });
      assert.equal(requests.length, 1, location);
      assert.deepEqual(resolverCalls, ['feeds.example.test'], location);
    }
  });

  it('blocks redirect DNS failures and mixed unsafe answers without contacting the target', async () => {
    const cases = [
      [[], 'dns_resolution_failed'],
      [
        [
          { address: '1.1.1.1', family: 4 },
          { address: '169.254.169.254', family: 4 },
        ],
        'unsafe_resolved_address',
      ],
    ] as const;

    for (const [redirectAnswers, reason] of cases) {
      const requests: FetchRequest[] = [];
      const fetcher = createHttpFetcher({
        resolver: resolverSequence([
          [{ address: '8.8.8.8', family: 4 }],
          redirectAnswers,
        ]),
        transport: recordingTransport(requests, () => redirect('/next.xml')),
      });
      const result = await fetcher.fetch(requestFor('/xml'));

      assert.deepEqual(result, {
        status: 'blocked',
        stage: 'network_safety',
        context: 'redirect',
        reason,
      });
      assert.equal(requests.length, 1);
    }
  });

  it('reruns DNS for same-host redirects and never reuses an earlier safe address', async () => {
    const requests: FetchRequest[] = [];
    const fetcher = createHttpFetcher({
      resolver: resolverSequence([
        [{ address: '8.8.8.8', family: 4 }],
        [{ address: '127.0.0.1', family: 4 }],
      ]),
      transport: recordingTransport(requests, () => redirect('/next.xml')),
    });

    const result = await fetcher.fetch(requestFor('/xml'));

    assertBlocked(result);
    assert.equal(result.reason, 'unsafe_resolved_address');
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0]!.destination.addresses, [
      { address: '8.8.8.8', family: 4 },
    ]);
  });

  it('classifies missing and blank Location as bounded fetcher failures', async () => {
    for (const location of [undefined, '   ']) {
      const fetcher = createHttpFetcher({
        resolver: resolverSequence([[{ address: '8.8.8.8', family: 4 }]]),
        transport: recordingTransport([], () => redirect(location)),
      });
      const result = await fetcher.fetch(requestFor('/xml'));
      assertFailure(result, 'redirect_missing_location', 0, 1);
    }
  });

  it('allows redirects immediately below and at the limit, then stops on N+1', async () => {
    const below = await fetchWithScript([redirect('/one.xml'), content()], {
      maxRedirects: 2,
    });
    assertTerminal(below);
    assert.equal(below.outcome, 'content');
    if (below.outcome === 'content') assert.equal(below.redirectCount, 1);

    const at = await fetchWithScript(
      [redirect('/one.xml'), redirect('/two.xml'), content()],
      { maxRedirects: 2 },
    );
    assertTerminal(at);
    assert.equal(at.outcome, 'content');
    if (at.outcome === 'content') assert.equal(at.redirectCount, 2);

    const requests: FetchRequest[] = [];
    const above = await fetchWithScript(
      [redirect('/one.xml'), redirect('/two.xml'), redirect('/three.xml')],
      { maxRedirects: 2 },
      requests,
    );
    assertFailure(above, 'redirect_limit_exceeded', 2, 3);
    assert.equal(requests.length, 3);
  });

  it('detects a validated redirect loop without repeating transport', async () => {
    const requests: FetchRequest[] = [];
    const result = await fetchWithScript(
      [redirect('/loop-b.xml'), redirect('/xml')],
      {},
      requests,
    );

    assertFailure(result, 'redirect_loop', 1, 2);
    assert.deepEqual(
      requests.map((request) => request.destination.requestUrl),
      [
        'https://feeds.example.test/xml',
        'https://feeds.example.test/loop-b.xml',
      ],
    );
  });

  it('shares one overall deadline across resolver and transport hops', async () => {
    let now = 0;
    const transportTimeouts: number[] = [];
    const requests: FetchRequest[] = [];
    const fetcher = createHttpFetcher({
      resolver: resolverSequence([
        [{ address: '8.8.8.8', family: 4 }],
        [{ address: '1.1.1.1', family: 4 }],
      ]),
      transport: recordingTransport(requests, (request, index) => {
        transportTimeouts.push(request.totalTimeoutMs!);
        now += index === 0 ? 6 : 5;
        return index === 0 ? redirect('/next.xml') : content();
      }),
      now: () => now,
    });

    const result = await fetcher.fetch(
      requestFor('/xml', { connectTimeoutMs: 5, totalTimeoutMs: 10 }),
    );

    assertFailure(result, 'total_timeout', 1, 2);
    assert.deepEqual(transportTimeouts, [10, 4]);
  });

  it('bounds a stalled resolver with the overall deadline and never starts transport', async () => {
    const requests: FetchRequest[] = [];
    const fetcher = createHttpFetcher({
      resolver: {
        resolve() {
          return new Promise(() => undefined);
        },
      },
      transport: recordingTransport(requests, () => content()),
    });

    const result = await fetcher.fetch(
      requestFor('/xml', { connectTimeoutMs: 5, totalTimeoutMs: 20 }),
    );

    assertFailure(result, 'total_timeout', 0, 0);
    assert.deepEqual(requests, []);
  });

  it('propagates terminal 304 and P3 failures while forwarding validators on every hop', async () => {
    const validators = {
      etag: '"endpoint-etag"',
      lastModified: 'Sat, 08 Aug 2026 12:00:00 GMT',
    };
    const requests: FetchRequest[] = [];
    const notModifiedResult = await fetchWithScript(
      [redirect('/cached.xml'), notModified()],
      { validators },
      requests,
    );
    assertTerminal(notModifiedResult);
    assert.equal(notModifiedResult.outcome, 'not_modified');
    if (notModifiedResult.outcome === 'not_modified') {
      assert.equal(notModifiedResult.redirectCount, 1);
      assert.equal(
        notModifiedResult.finalUrl,
        'https://feeds.example.test/cached.xml',
      );
    }
    assert.deepEqual(
      requests.map((request) => request.validators),
      [validators, validators],
    );

    for (const failure of [
      failed('connect_timeout', 'transient'),
      failed('wire_size_limit', 'permanent'),
      failed('unsupported_content_type', 'permanent'),
    ]) {
      const result = await fetchWithScript([redirect('/failed.xml'), failure]);
      assertFailure(result, failure.reason, 1, 2);
      assertTerminal(result);
      if (result.outcome === 'failure')
        assert.equal(result.retry, failure.retry);
    }
  });

  it('composes real one-hop HTTP transport with controlled redirect fixtures without a loopback safety exemption', async () => {
    const server = await startHttpFixtureServer();
    try {
      const transport = createHttpTransport({
        request(_protocol, options, listener) {
          // Test-only connector maps a synthetic public validated address to the
          // loopback fixture after production safety has made its decision.
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

      const twoHop = await fetcher.fetch(requestFor('/redirect-two'));
      assertTerminal(twoHop);
      assert.equal(twoHop.outcome, 'content');
      if (twoHop.outcome === 'content') assert.equal(twoHop.redirectCount, 2);

      const absolute = await fetcher.fetch(requestFor('/redirect-absolute'));
      assertTerminal(absolute);
      assert.equal(absolute.outcome, 'content');

      const cached = await fetcher.fetch(requestFor('/redirect-not-modified'));
      assertTerminal(cached);
      assert.equal(cached.outcome, 'not_modified');

      const httpFailure = await fetcher.fetch(
        requestFor('/redirect-server-error'),
      );
      assertFailure(httpFailure, 'http_status', 1, 2);

      const oversized = await fetcher.fetch(
        requestFor('/redirect-oversized', { maxWireBytes: 100 }),
      );
      assertFailure(oversized, 'wire_size_limit', 1, 2);

      const malformed = await fetcher.fetch(requestFor('/redirect-malformed'));
      assertBlocked(malformed);
      assert.equal(malformed.context, 'redirect');
      assert.equal(malformed.reason, 'invalid_destination_url');
    } finally {
      await server.close();
    }
  });
});

function requestFor(
  path: string,
  overrides: Partial<HttpFetcherRequest> = {},
): HttpFetcherRequest {
  return {
    configuration: configuration(path),
    ...overrides,
  };
}

function configuration(path: string): EndpointConfigurationAggregate {
  const timestamp = new Date('2026-08-08T00:00:00.000Z');
  return {
    publication: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Generic news',
      slug: 'generic-news',
      activeForCollection: true,
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
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      sourceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      configKey: 'main_feed',
      endpointUrl: {
        value: `https://feeds.example.test${path}`,
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

function resolverSequence(
  answers: readonly (readonly {
    readonly address: string;
    readonly family: 4 | 6;
  }[])[],
  hostnames: string[] = [],
): DestinationResolver {
  let index = 0;
  return {
    async resolve(hostname) {
      hostnames.push(hostname);
      return answers[index++] ?? [];
    },
  };
}

function recordingTransport(
  requests: FetchRequest[],
  result: (request: FetchRequest, index: number) => FetchResult,
): Fetcher {
  return {
    async fetch(request) {
      requests.push(request);
      return result(request, requests.length - 1);
    },
  };
}

async function fetchWithScript(
  results: readonly FetchResult[],
  overrides: Partial<HttpFetcherRequest> = {},
  requests: FetchRequest[] = [],
): Promise<HttpFetcherResult> {
  const answers = Array.from({ length: results.length + 1 }, (_, index) => [
    { address: `8.8.8.${String(index + 1)}`, family: 4 as const },
  ]);
  const fetcher = createHttpFetcher({
    resolver: resolverSequence(answers),
    transport: recordingTransport(requests, (_request, index) => {
      const result = results[index];
      if (result === undefined)
        throw new Error('Missing scripted fetch result');
      return result;
    }),
  });
  return fetcher.fetch(requestFor('/xml', overrides));
}

function content(): FetchResult {
  return Object.freeze({
    outcome: 'content',
    content: Buffer.from('<rss/>'),
    mediaType: 'application/rss+xml',
    response: Object.freeze({ contentType: 'application/rss+xml' }),
    metrics: metrics(200),
  });
}

function notModified(): FetchResult {
  return Object.freeze({
    outcome: 'not_modified',
    response: Object.freeze({ etag: '"endpoint-etag"' }),
    metrics: metrics(304),
  });
}

function redirect(location?: string): FetchResult {
  return Object.freeze({
    outcome: 'redirect',
    ...(location === undefined ? {} : { location }),
    response: Object.freeze({}),
    metrics: metrics(302),
  });
}

function failed(
  reason: Extract<FetchResult, { outcome: 'failure' }>['reason'],
  retry: Extract<FetchResult, { outcome: 'failure' }>['retry'],
): Extract<FetchResult, { outcome: 'failure' }> {
  return Object.freeze({
    outcome: 'failure',
    reason,
    retry,
    detail: 'Controlled transport failure.',
    metrics: metrics(),
  });
}

function metrics(httpStatus?: number): TransportMetrics {
  return Object.freeze({
    elapsedMilliseconds: 1,
    ...(httpStatus === undefined ? {} : { httpStatus }),
    wireBytes: 10,
    decompressedBytes: httpStatus === 200 ? 7 : 0,
    selectedAddress: '8.8.8.8',
    selectedAddressFamily: 4,
  });
}

function assertFailure(
  result: HttpFetcherResult,
  reason: string,
  redirectCount: number,
  hopCount: number,
): void {
  assertTerminal(result);
  assert.equal(result.outcome, 'failure');
  if (result.outcome !== 'failure') return;
  assert.equal(result.reason, reason);
  assert.equal(result.redirectCount, redirectCount);
  assert.equal(result.metrics.hopCount, hopCount);
  assert.ok(result.detail.length <= 160);
}

function assertTerminal(
  result: HttpFetcherResult,
): asserts result is Exclude<HttpFetcherResult, { status: 'blocked' }> {
  assert.equal('outcome' in result, true);
}

function assertBlocked(
  result: HttpFetcherResult,
): asserts result is Extract<HttpFetcherResult, { status: 'blocked' }> {
  assert.equal('status' in result && result.status === 'blocked', true);
}
