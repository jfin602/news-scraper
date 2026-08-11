import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createWebApp } from '../../src/app/web/create-app.ts';
import { startWebServer, type WebServer } from '../../src/app/web/server.ts';
import type { PublicFeed } from '../../src/public-feed/repository.ts';

const publication = Object.freeze({
  name: 'Example Publication',
});
const publicationWithLegacyIdentity = Object.freeze({
  ...publication,
  id: '10000000-0000-4000-8000-000000000001',
  slug: 'must-not-leak',
});

describe('Public feed HTTP endpoint', () => {
  let webServer: WebServer;
  let outcome: PublicFeed | undefined | Error;
  let publicFeedReads = 0;

  before(async () => {
    webServer = await startWebServer(
      createWebApp({
        readiness: { checkReady: async () => true },
        publicFeed: {
          async read() {
            publicFeedReads += 1;
            if (outcome instanceof Error) throw outcome;
            return outcome;
          },
        },
      }),
      { host: '127.0.0.1', port: 0 },
    );
  });

  after(async () => webServer.close());

  it('returns the exact minimal feed shape with an explicit ISO date', async () => {
    const readsBefore = publicFeedReads;
    outcome = Object.freeze({
      publication: publicationWithLegacyIdentity,
      items: Object.freeze([
        Object.freeze({
          articleId: '20000000-0000-4000-8000-000000000001',
          effectiveFeedDate: new Date('2026-08-10T12:00:00.000Z'),
          feedDateSource: 'published_at',
          headline: 'Public headline',
          sourceName: 'Publisher',
          originalUrl: 'https://publisher.example/article',
          canonicalIdentityUrl: 'https://internal.example/identity',
          summary: 'internal summary',
          observations: ['internal observation'],
        }),
      ]),
    });

    const response = await requestFeed();
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get('content-type') ?? '',
      /^application\/json/u,
    );
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      publication,
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
    });
    assert.equal(publicFeedReads, readsBefore + 1);
  });

  it('returns a public empty feed as 200', async () => {
    outcome = Object.freeze({ publication, items: Object.freeze([]) });
    const response = await requestFeed();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { publication, items: [] });
  });

  it('uses one indistinguishable 404 for every undefined reader result', async () => {
    outcome = undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await requestFeed();
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), { error: 'not_found' });
    }
  });

  it('bounds and redacts reader failures', async () => {
    const secret = 'postgresql://user:SQL_SECRET@database/private';
    outcome = new Error(`SELECT * FROM articles failed at ${secret}`);
    const response = await requestFeed();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = JSON.stringify(await response.json());
    assert.equal(body, JSON.stringify({ error: 'service_unavailable' }));
    assert.doesNotMatch(body, /SQL_SECRET|SELECT \*|articles/u);
  });

  it('does not retain the obsolete slug-addressed API route', async () => {
    outcome = Object.freeze({ publication, items: Object.freeze([]) });
    const readsBefore = publicFeedReads;
    const response = await fetch(
      `http://${webServer.host}:${webServer.port}/api/publications/obsolete/feed`,
    );
    assert.equal(response.status, 404);
    assert.equal(publicFeedReads, readsBefore);
  });

  function requestFeed(): Promise<Response> {
    return fetch(`http://${webServer.host}:${webServer.port}/api/feed`);
  }
});
