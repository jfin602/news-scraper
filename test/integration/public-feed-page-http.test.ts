import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createWebApp } from '../../src/app/web/create-app.ts';
import { startWebServer, type WebServer } from '../../src/app/web/server.ts';
import {
  PublicFeedRepositoryError,
  type PublicDiscoveryFeed,
} from '../../src/public-feed/repository.ts';

const contentSecurityPolicy =
  "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'";

describe('Public feed page HTTP delivery', () => {
  let webServer: WebServer;
  let outcome: PublicDiscoveryFeed | undefined | Error = feed();
  const reads: unknown[] = [];

  before(async () => {
    webServer = await startWebServer(
      createWebApp({
        readiness: { checkReady: async () => true },
        publicFeed: {
          async read(request) {
            reads.push(request);
            if (outcome instanceof Error) throw outcome;
            return outcome;
          },
        },
      }),
      { host: '127.0.0.1', port: 0 },
    );
  });
  after(async () => webServer.close());

  it('server-renders the canonical first page and forwards root criteria once', async () => {
    outcome = feed();
    const beforeReads = reads.length;
    const response = await request(
      '/?q=%20Needle%20&source=publisher_one&category=industry_news',
    );
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.equal(reads.length, beforeReads + 1);
    assert.deepEqual(reads.at(-1), {
      keywordQuery: 'Needle',
      sourceConfigKey: 'publisher_one',
      categoryConfigKey: 'industry_news',
    });
    assertHeaders(response);
    assert.match(body, /<title>Example Publication \| News feed<\/title>/u);
    assert.match(body, /Example Publication/u);
    assert.match(body, /Publisher One/u);
    assert.match(body, /Public headline/u);
    assert.match(body, /href="https:\/\/publisher\.example\/article"/u);
    assert.match(body, /method="get" action="\/" data-discovery-form/u);
    assert.match(body, /<a href="\/" data-discovery-reset>Reset<\/a>/u);
    assert.match(body, /data-public-feed-bootstrap/u);
  });

  it('accepts ordinary blank form values and has a useful empty state', async () => {
    outcome = feed({ items: Object.freeze([]), nextCursor: null });
    const response = await request('/?q=&source=&category=');
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.deepEqual(reads.at(-1), {});
    assert.match(body, /There are no recent headlines yet\./u);
    assert.match(body, /data-state="empty"/u);
  });

  it('rejects invalid root input without a feed read', async () => {
    outcome = feed();
    for (const query of [
      'q=one&q=two',
      'unknown=value',
      'source=bad-key',
      'cursor=anything',
    ]) {
      const beforeReads = reads.length;
      const response = await request(`/?${query}`);
      assert.equal(response.status, 400, query);
      assert.equal(reads.length, beforeReads, query);
      assert.match(await response.text(), /This discovery request is invalid/u);
    }
  });

  it('maps unsupported, absent, and failed reads to bounded pages', async () => {
    outcome = new PublicFeedRepositoryError('unsupported_discovery_filter');
    assert.equal((await request('/?source=missing')).status, 400);
    outcome = undefined;
    const missing = await request('/');
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /This publication is unavailable/u);
    outcome = new Error('SELECT secret from postgresql://user:SECRET@private');
    const unavailable = await request('/');
    const body = await unavailable.text();
    assert.equal(unavailable.status, 503);
    assert.match(body, /temporarily unavailable/u);
    assert.doesNotMatch(body, /SECRET|SELECT|postgresql/u);
  });

  it('retains explicit same-origin resources and no obsolete slug route', async () => {
    const css = await request('/public-feed.css');
    assert.equal(css.status, 200);
    assert.match(await css.text(), /\.public-feed-shell/u);
    const client = await request('/public-feed.js');
    assert.equal(client.status, 200);
    assert.match(await client.text(), /data-public-feed-bootstrap/u);
    const beforeReads = reads.length;
    assert.equal((await request('/publications/obsolete')).status, 404);
    assert.equal(reads.length, beforeReads);
  });

  function request(path: string): Promise<Response> {
    return fetch(`http://${webServer.host}:${webServer.port}${path}`);
  }
});

function assertHeaders(response: Response): void {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(
    response.headers.get('content-security-policy'),
    contentSecurityPolicy,
  );
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

function feed(
  overrides: Partial<PublicDiscoveryFeed> = {},
): PublicDiscoveryFeed {
  return Object.freeze({
    publication: Object.freeze({
      name: 'Example Publication',
      description: 'A useful feed',
      logoPath: null,
      accentColor: '#ABCDEF',
      presentationTimezone: 'UTC',
    }),
    sourceChoices: Object.freeze([
      { configKey: 'publisher_one', displayName: 'Publisher One' },
    ]),
    categoryChoices: Object.freeze([
      { configKey: 'industry_news', displayName: 'Industry news' },
    ]),
    items: Object.freeze([
      {
        articleId: '20000000-0000-4000-8000-000000000001',
        effectiveFeedDate: new Date('2026-08-10T12:00:00.000Z'),
        feedDateSource: 'published_at' as const,
        headline: 'Public headline',
        sourceName: 'Publisher One',
        originalUrl: 'https://publisher.example/article',
      },
    ]),
    nextCursor: 'opaque-next-cursor',
    ...overrides,
  });
}
