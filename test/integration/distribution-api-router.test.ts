import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';

import express from 'express';

import {
  DISTRIBUTION_API_VERSION,
  createDistributionApiRouter,
  type DistributionApiTelemetryEvent,
} from '../../src/app/web/distribution-api-router.ts';
import { startWebServer, type WebServer } from '../../src/app/web/server.ts';
import type { DistributionProfilePageOutcome } from '../../src/distribution/profile-page.ts';
import type { MachineRequestGuardResult } from '../../src/distribution/credentials/machine-request-guard.ts';

describe('Versioned distribution API router', () => {
  let outcome: DistributionProfilePageOutcome;
  let guardResult: MachineRequestGuardResult | Error;
  let pageCalls: Array<[unknown, unknown]>;
  let guardCalls: unknown[];
  let telemetry: DistributionApiTelemetryEvent[];
  let server: WebServer;

  beforeEach(async () => {
    await server?.close();
    outcome = activePage();
    guardResult = authenticated();
    pageCalls = [];
    guardCalls = [];
    telemetry = [];
    const app = express();
    app.disable('x-powered-by');
    app.use((_request, response, next) => {
      response.set('X-Content-Type-Options', 'nosniff');
      next();
    });
    app.use(
      '/api/v1/distribution',
      createDistributionApiRouter({
        pageService: {
          async read(profileKey, cursor) {
            pageCalls.push([profileKey, cursor]);
            if (outcome instanceof Error) throw outcome;
            return outcome;
          },
        },
        requestGuard: {
          async guard(input) {
            guardCalls.push(input);
            if (guardResult instanceof Error) throw guardResult;
            return guardResult;
          },
        },
        invalidAuthNetworkKey: () => 'test-network',
        now: (() => {
          const dates = [
            new Date('2026-08-21T10:00:00.000Z'),
            new Date('2026-08-21T10:00:00.012Z'),
          ];
          return () => dates.shift() ?? new Date('2026-08-21T10:00:00.012Z');
        })(),
        telemetry: (entry) => telemetry.push(entry),
      }),
    );
    server = await startWebServer(app, { host: '127.0.0.1', port: 0 });
  });

  after(async () => server?.close());

  it('serializes the exact stable v1 first-page envelope', async () => {
    const response = await request('authors');
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('content-type'),
      'application/json; charset=utf-8',
    );
    assert.equal(response.headers.get('etag'), '"revision-123"');
    assert.equal(response.headers.get('cache-control'), 'private, no-cache');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(await response.json(), {
      apiVersion: DISTRIBUTION_API_VERSION,
      generatedAt: '2026-08-21T10:00:00.012Z',
      snapshotRevision: 'revision-123',
      profile: { configKey: 'authors', displayName: 'Authors' },
      publication: { name: 'Publishing News' },
      items: [
        {
          articleId: 'article-1',
          headline: 'Headline',
          originalUrl: 'https://publisher.example/original?keep=exact',
          effectiveFeedDate: '2026-08-20T09:08:07.006Z',
          feedDateSource: 'published_at',
          publishedAt: null,
          author: null,
          summary: null,
          imageUrl: null,
          source: { configKey: 'publisher', displayName: 'Publisher' },
          categories: [],
        },
      ],
      nextCursor: 'next-cursor',
    });
    assert.deepEqual(pageCalls, [['authors', undefined]]);
    assert.deepEqual(telemetry, [
      {
        event: 'distribution_request',
        apiVersion: 'v1',
        profileKey: 'authors',
        status: 200,
        outcome: 'success',
        itemCount: 1,
        continuation: true,
        credential: { credentialId: 'credential-id', lookupId: 'lookup-id' },
        durationMilliseconds: 12,
      },
    ]);
  });

  it('forwards one cursor exactly once and rejects malformed queries before a page read', async () => {
    const success = await request('authors?cursor=opaque-cursor', {
      'If-None-Match': '"revision-123"',
    });
    assert.equal(success.status, 200);
    assert.deepEqual(pageCalls, [['authors', 'opaque-cursor']]);
    for (const query of [
      'authors?unknown=x',
      'authors?cursor=a&cursor=b',
      'authors?cursor=',
    ]) {
      const calls: number = pageCalls.length;
      const response = await request(query);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'invalid_request' });
      assert.equal(pageCalls.length, calls);
    }
  });

  it('maps authentication and rate outcomes without credential-state detail', async () => {
    guardResult = { outcome: 'unauthenticated' };
    let response = await request('authors', {
      Authorization: 'Bearer secret-token',
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthenticated' });
    assert.equal(pageCalls.length, 0);
    assert.equal(
      JSON.stringify(telemetry),
      JSON.stringify(telemetry).replaceAll('secret-token', ''),
    );

    guardResult = {
      outcome: 'rate_limited',
      classification: 'authenticated_credential',
      retryAfterSeconds: 9,
    };
    response = await request('authors');
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '9');
    assert.deepEqual(await response.json(), { error: 'rate_limited' });
  });

  it('maps page outcomes and keeps empty successful collections stable', async () => {
    const expected: Array<[DistributionProfilePageOutcome, number, object]> = [
      [{ kind: 'not_found' }, 404, { error: 'not_found' }],
      [{ kind: 'draft' }, 404, { error: 'not_found' }],
      [{ kind: 'disabled' }, 409, { error: 'profile_disabled' }],
      [{ kind: 'snapshot_changed' }, 409, { error: 'snapshot_changed' }],
      [{ kind: 'invalid_input' }, 400, { error: 'invalid_request' }],
      [{ kind: 'read_failed' }, 503, { error: 'service_unavailable' }],
    ];
    for (const [next, status, body] of expected) {
      outcome = next;
      const response = await request('authors');
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), body);
    }
    outcome = activePage({ items: [], nextCursor: null });
    const response = await request('authors');
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).items, []);
  });

  it('returns a bodyless 304 only for a matching authenticated initial request', async () => {
    let response = await request('authors', {
      'If-None-Match': 'W/"revision-123"',
    });
    assert.equal(response.status, 304);
    assert.equal(await response.text(), '');
    assert.equal(response.headers.get('etag'), '"revision-123"');

    response = await request('authors?cursor=opaque', {
      'If-None-Match': '"revision-123"',
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).nextCursor, 'next-cursor');
  });

  it('bounds dependency failures and does not let telemetry failure alter a response', async () => {
    guardResult = new Error('verifier token source failure');
    let response = await request('authors');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'service_unavailable' });

    await server.close();
    const app = express();
    app.use(
      '/api/v1/distribution',
      createDistributionApiRouter({
        pageService: { read: async () => activePage() },
        requestGuard: { guard: async () => authenticated() },
        invalidAuthNetworkKey: () => 'network',
        telemetry: () => {
          throw new Error('telemetry unavailable');
        },
      }),
    );
    server = await startWebServer(app, { host: '127.0.0.1', port: 0 });
    response = await request('authors');
    assert.equal(response.status, 200);
  });

  it('bounds invalid response clocks and isolates duration-clock failure', async () => {
    await server.close();
    let calls = 0;
    const events: DistributionApiTelemetryEvent[] = [];
    let app = express();
    app.use(
      '/api/v1/distribution',
      createDistributionApiRouter({
        pageService: { read: async () => activePage() },
        requestGuard: { guard: async () => authenticated() },
        invalidAuthNetworkKey: () => 'network',
        now: () => {
          calls += 1;
          if (calls === 3) throw new Error('duration clock unavailable');
          return new Date('2026-08-21T10:00:00.000Z');
        },
        telemetry: (entry) => events.push(entry),
      }),
    );
    server = await startWebServer(app, { host: '127.0.0.1', port: 0 });
    let response = await request('authors');
    assert.equal(response.status, 200);
    assert.equal(events.length, 1);
    assert.equal(events[0]!.durationMilliseconds, 0);

    await server.close();
    calls = 0;
    app = express();
    app.use(
      '/api/v1/distribution',
      createDistributionApiRouter({
        pageService: { read: async () => activePage() },
        requestGuard: { guard: async () => authenticated() },
        invalidAuthNetworkKey: () => 'network',
        now: () => {
          calls += 1;
          return calls === 2
            ? new Date(Number.NaN)
            : new Date('2026-08-21T10:00:00.000Z');
        },
      }),
    );
    server = await startWebServer(app, { host: '127.0.0.1', port: 0 });
    response = await request('authors');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'service_unavailable' });
  });

  async function request(
    path: string,
    headers?: HeadersInit,
  ): Promise<Response> {
    return fetch(
      `http://${server.host}:${server.port}/api/v1/distribution/${path}`,
      {
        ...(headers === undefined ? {} : { headers }),
      },
    );
  }
});

function authenticated(): MachineRequestGuardResult {
  return {
    outcome: 'authenticated',
    principal: {
      credentialId: 'credential-id',
      lookupId: 'lookup-id',
      capability: 'distribution:read',
    },
  };
}

function activePage(
  overrides: Partial<
    Extract<DistributionProfilePageOutcome, { kind: 'active' }>
  > = {},
): Extract<DistributionProfilePageOutcome, { kind: 'active' }> {
  return {
    kind: 'active',
    snapshotRevision: 'revision-123',
    profile: { configKey: 'authors', displayName: 'Authors' },
    publication: { name: 'Publishing News' },
    items: [
      {
        articleId: 'article-1',
        headline: 'Headline',
        originalUrl: 'https://publisher.example/original?keep=exact',
        effectiveFeedDate: new Date('2026-08-20T09:08:07.006Z'),
        feedDateSource: 'published_at',
        publishedAt: null,
        author: null,
        summary: null,
        imageUrl: null,
        source: { configKey: 'publisher', displayName: 'Publisher' },
        categories: [],
      },
    ],
    nextCursor: 'next-cursor',
    ...overrides,
  };
}
