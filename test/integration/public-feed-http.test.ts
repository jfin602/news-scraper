import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createWebApp } from '../../src/app/web/create-app.ts';
import {
  encodePublicDiscoveryCursor,
  type PublicDiscoveryRequest,
} from '../../src/public-feed/discovery.ts';
import {
  PublicFeedRepositoryError,
  type PublicDiscoveryFeed,
} from '../../src/public-feed/repository.ts';
import { startWebServer, type WebServer } from '../../src/app/web/server.ts';

const publication = Object.freeze({
  name: 'Example Publication',
  description: null,
  logoPath: null,
  accentColor: null,
  presentationTimezone: null,
});
const sourceChoices = Object.freeze([
  Object.freeze({ configKey: 'publisher_one', displayName: 'Publisher One' }),
]);
const categoryChoices = Object.freeze([
  Object.freeze({ configKey: 'industry_news', displayName: 'Industry news' }),
]);

describe('Public feed HTTP endpoint', () => {
  let webServer: WebServer;
  let outcome: PublicDiscoveryFeed | undefined | Error;
  const requests: PublicDiscoveryRequest[] = [];

  before(async () => {
    webServer = await startWebServer(
      createWebApp({
        readiness: { checkReady: async () => true },
        publicFeed: {
          async read(request) {
            requests.push(request);
            if (outcome instanceof Error) throw outcome;
            return outcome;
          },
        },
      }),
      { host: '127.0.0.1', port: 0 },
    );
  });

  after(async () => webServer.close());

  it('normalizes and forwards every supported discovery criterion exactly once', async () => {
    outcome = discoveryFeed({ nextCursor: 'opaque-next-cursor' });
    const cursor = encodePublicDiscoveryCursor(
      {
        keywordQuery: 'Needle',
        sourceConfigKey: 'publisher_one',
        categoryConfigKey: 'industry_news',
      },
      {
        effectiveFeedDate: '2026-08-10T12:00:00.123456Z',
        firstSeenAt: '2026-08-10T12:01:00.654321Z',
        articleId: '20000000-0000-4000-8000-000000000001',
      },
    );

    const requestsBefore = requests.length;
    const response = await requestFeed(
      `q=%20Needle%20&source=publisher_one&category=industry_news&cursor=${cursor}`,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(requests.length, requestsBefore + 1);
    assert.deepEqual(requests.at(-1), {
      keywordQuery: 'Needle',
      sourceConfigKey: 'publisher_one',
      categoryConfigKey: 'industry_news',
      cursorPosition: {
        effectiveFeedDate: '2026-08-10T12:00:00.123456Z',
        firstSeenAt: '2026-08-10T12:01:00.654321Z',
        articleId: '20000000-0000-4000-8000-000000000001',
      },
    });
    assert.deepEqual(
      await response.json(),
      publicResponse({
        query: {
          q: 'Needle',
          source: 'publisher_one',
          category: 'industry_news',
        },
        nextCursor: 'opaque-next-cursor',
      }),
    );
  });

  it('keeps the no-query feed as the canonical unfiltered first page', async () => {
    outcome = discoveryFeed({ nextCursor: null });
    const requestsBefore = requests.length;
    const response = await requestFeed();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(requests.length, requestsBefore + 1);
    assert.deepEqual(requests.at(-1), {});
    assert.deepEqual(await response.json(), publicResponse());
  });

  it('serializes presentation values as inert JSON without internal leakage', async () => {
    const inertPublication = Object.freeze({
      name: '<strong>Markup-looking name</strong>',
      description: '<script>globalThis.presentationSecret = true</script>',
      logoPath: '/logo.svg</style><script>',
      accentColor: '#ABCDEF; background: url(secret)',
      presentationTimezone: null,
    });
    outcome = discoveryFeed({
      publication: Object.freeze({
        ...inertPublication,
        activeForCollection: true,
        publicStatus: 'public',
        createdAt: new Date('2026-08-13T00:00:00.000Z'),
        internalPublicationId: 'internal-publication-id',
      }),
    });

    const response = await requestFeed('source=publisher_one');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.deepEqual(body.publication, inertPublication);
    assert.deepEqual(Object.keys(body.publication), [
      'name',
      'description',
      'logoPath',
      'accentColor',
      'presentationTimezone',
    ]);
    assert.doesNotMatch(
      JSON.stringify(body),
      /activeForCollection|publicStatus|createdAt|internalPublicationId/u,
    );
  });

  it('forwards each non-cursor criterion on its own', async () => {
    outcome = discoveryFeed();
    for (const expectation of [
      { query: 'q=Needle', request: { keywordQuery: 'Needle' } },
      {
        query: 'source=publisher_one',
        request: { sourceConfigKey: 'publisher_one' },
      },
      {
        query: 'category=industry_news',
        request: { categoryConfigKey: 'industry_news' },
      },
    ]) {
      const response = await requestFeed(expectation.query);
      assert.equal(response.status, 200, expectation.query);
      assert.deepEqual(requests.at(-1), expectation.request);
    }
  });

  it('rejects malformed discovery input before reading the repository', async () => {
    outcome = discoveryFeed();
    const cursor = encodePublicDiscoveryCursor(
      { keywordQuery: 'issued-query' },
      {
        effectiveFeedDate: '2026-08-10T12:00:00.123456Z',
        firstSeenAt: '2026-08-10T12:01:00.654321Z',
        articleId: '20000000-0000-4000-8000-000000000001',
      },
    );
    for (const query of [
      'q=one&q=two',
      'source=publisher_one&source=publisher_two',
      'category=industry_news&category=other',
      'cursor=one&cursor=two',
      'unknown=value',
      'q=%',
      'q=%E0%A4%A',
      `q=${'x'.repeat(201)}`,
      'cursor=not-a-valid-cursor',
      `q=different&cursor=${cursor}`,
    ]) {
      const requestsBefore = requests.length;
      const response = await requestFeed(query);
      assert.equal(response.status, 400, query);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), { error: 'invalid_request' });
      assert.equal(requests.length, requestsBefore, query);
    }
  });

  it('maps unsupported public filters to the same bounded 400', async () => {
    outcome = new PublicFeedRepositoryError('unsupported_discovery_filter');
    for (const query of [
      'source=missing_source',
      'category=missing_category',
    ]) {
      const response = await requestFeed(query);
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), { error: 'invalid_request' });
    }
  });

  it('preserves generic absent/private and dependency outcomes', async () => {
    outcome = undefined;
    const notFound = await requestFeed('source=valid_source');
    assert.equal(notFound.status, 404);
    assert.equal(notFound.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await notFound.json(), { error: 'not_found' });

    const secret = 'postgresql://user:SQL_SECRET@database/private';
    outcome = new Error(`SELECT * FROM articles failed at ${secret}`);
    const unavailable = await requestFeed();
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get('cache-control'), 'no-store');
    const body = JSON.stringify(await unavailable.json());
    assert.equal(body, JSON.stringify({ error: 'service_unavailable' }));
    assert.doesNotMatch(body, /SQL_SECRET|SELECT \*|articles/u);
  });

  it('does not retain the obsolete slug-addressed API route', async () => {
    outcome = discoveryFeed();
    const requestsBefore = requests.length;
    const response = await fetch(
      `http://${webServer.host}:${webServer.port}/api/publications/obsolete/feed`,
    );
    assert.equal(response.status, 404);
    assert.equal(requests.length, requestsBefore);
  });

  function requestFeed(query = ''): Promise<Response> {
    const suffix = query === '' ? '' : `?${query}`;
    return fetch(
      `http://${webServer.host}:${webServer.port}/api/feed${suffix}`,
    );
  }
});

function discoveryFeed(
  overrides: Partial<PublicDiscoveryFeed> = {},
): PublicDiscoveryFeed {
  return Object.freeze({
    publication: Object.freeze({
      ...publication,
      id: 'internal-publication-id',
    }),
    sourceChoices: Object.freeze([
      Object.freeze({
        configKey: 'publisher_one',
        displayName: 'Publisher One',
        id: 'internal-source-id',
      }),
    ]),
    categoryChoices: Object.freeze([
      Object.freeze({
        configKey: 'industry_news',
        displayName: 'Industry news',
        id: 'internal-category-id',
      }),
    ]),
    items: Object.freeze([
      Object.freeze({
        articleId: '20000000-0000-4000-8000-000000000001',
        effectiveFeedDate: new Date('2026-08-10T12:00:00.000Z'),
        feedDateSource: 'published_at' as const,
        headline: 'Public headline',
        sourceName: 'Publisher',
        originalUrl: 'https://publisher.example/article',
        normalizedTitle: 'internal title',
        summary: 'internal summary',
        author: 'internal author',
        cursorFirstSeenAt: '2026-08-10T12:01:00.123456Z',
      }),
    ]),
    nextCursor: null,
    ...overrides,
  });
}

function publicResponse(
  input: {
    readonly query?: {
      readonly q: string | null;
      readonly source: string | null;
      readonly category: string | null;
    };
    readonly nextCursor?: string | null;
  } = {},
) {
  return {
    publication,
    discovery: {
      query: input.query ?? { q: null, source: null, category: null },
      sources: sourceChoices,
      categories: categoryChoices,
    },
    items: [
      {
        articleId: '20000000-0000-4000-8000-000000000001',
        effectiveFeedDate: '2026-08-10T12:00:00.000Z',
        feedDateSource: 'published_at',
        headline: 'Public headline',
        sourceName: 'Publisher',
        originalUrl: 'https://publisher.example/article',
      },
    ],
    nextCursor: input.nextCursor ?? null,
  };
}
