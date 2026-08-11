import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createWebApp } from '../../src/app/web/create-app.ts';
import { startWebServer, type WebServer } from '../../src/app/web/server.ts';

const contentSecurityPolicy =
  "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'";

describe('Public feed page HTTP delivery', () => {
  let webServer: WebServer;
  let publicFeedReads = 0;

  before(async () => {
    webServer = await startWebServer(
      createWebApp({
        readiness: { checkReady: async () => true },
        publicFeed: {
          async read() {
            publicFeedReads += 1;
            throw new Error('The public page shell must not read the feed.');
          },
        },
      }),
      { host: '127.0.0.1', port: 0 },
    );
  });

  after(async () => webServer.close());

  it('returns the canonical root HTML shell without looking up the Publication', async () => {
    const response = await request('/');
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html/u);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(
      response.headers.get('content-security-policy'),
      contentSecurityPolicy,
    );
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(body, /<link rel="stylesheet" href="\/public-feed\.css">/u);
    assert.match(body, /<script src="\/public-feed\.js" defer><\/script>/u);
    assert.match(body, /<h1 data-publication-name>News feed<\/h1>/u);
    assert.doesNotMatch(body, /indie|author|publishing/u);
    assert.equal(publicFeedReads, 0);
  });

  it('does not retain the obsolete slug-addressed page route', async () => {
    const response = await request('/publications/obsolete');
    assert.equal(response.status, 404);
    assert.equal(publicFeedReads, 0);
  });

  it('delivers only the explicit same-origin page resources', async () => {
    const stylesheet = await request('/public-feed.css');
    assert.equal(stylesheet.status, 200);
    assert.match(stylesheet.headers.get('content-type') ?? '', /^text\/css/u);
    assert.equal(stylesheet.headers.get('cache-control'), 'no-store');
    assert.equal(stylesheet.headers.get('x-content-type-options'), 'nosniff');
    assert.match(await stylesheet.text(), /\.public-feed-shell/u);

    const client = await request('/public-feed.js');
    assert.equal(client.status, 200);
    assert.match(
      client.headers.get('content-type') ?? '',
      /^(application|text)\/javascript/u,
    );
    assert.equal(client.headers.get('cache-control'), 'no-store');
    assert.equal(client.headers.get('x-content-type-options'), 'nosniff');
    const clientSource = await client.text();
    assert.match(clientSource, /\/api\/feed/u);
    assert.doesNotMatch(
      clientSource,
      /api\/publications|window\.location\.pathname|decodeURIComponent/u,
    );

    const unknown = await request('/public/private-source-file.ts');
    assert.equal(unknown.status, 404);
    assert.doesNotMatch(await unknown.text(), /public-feed-shell|box-sizing/u);
  });

  function request(path: string): Promise<Response> {
    return fetch(`http://${webServer.host}:${webServer.port}${path}`);
  }
});
