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
    assert.match(body, /<script src="\/public-theme\.js"><\/script>/u);
    assert.match(body, /<link rel="stylesheet" href="\/public-feed\.css">/u);
    assert.match(body, /<script src="\/public-feed\.js" defer><\/script>/u);
    const themeIndex = body.indexOf('<script src="/public-theme.js">');
    const stylesheetIndex = body.indexOf(
      '<link rel="stylesheet" href="/public-feed.css">',
    );
    const feedClientIndex = body.indexOf(
      '<script src="/public-feed.js" defer>',
    );
    assert.ok(themeIndex > 0);
    assert.ok(themeIndex < stylesheetIndex);
    assert.ok(stylesheetIndex < feedClientIndex);
    assert.match(body, /<title>Loading publication…<\/title>/u);
    assert.match(
      body,
      /<main class="public-feed-shell" data-publication-state="unresolved">/u,
    );
    assert.match(body, /<header class="publication-header">/u);
    assert.match(
      body,
      /<div class="publication-masthead" data-publication-masthead hidden>/u,
    );
    assert.match(body, /<fieldset class="theme-control" data-theme-control>/u);
    assert.match(body, /<legend>Theme<\/legend>/u);
    assert.match(
      body,
      /name="reader-theme" value="system" data-theme-option checked/u,
    );
    assert.match(body, /name="reader-theme" value="light" data-theme-option/u);
    assert.match(body, /name="reader-theme" value="dark" data-theme-option/u);
    assert.match(body, /<h1 data-publication-name><\/h1>/u);
    assert.match(
      body,
      /<p class="publication-description" data-publication-description hidden><\/p>/u,
    );
    assert.match(body, /data-feed-status role="status" aria-live="polite"/u);
    assert.match(
      body,
      /<span data-feed-status-message>Loading publication…<\/span>/u,
    );
    assert.match(body, /<section data-feed-content data-state="loading"/u);
    assert.doesNotMatch(body, />\s*News feed\s*</iu);
    assert.match(
      body,
      /<form data-discovery-form aria-label="Discover headlines">/u,
    );
    assert.match(body, /<label for="discovery-keyword">Keyword<\/label>/u);
    assert.match(
      body,
      /<input id="discovery-keyword" name="q" type="search" data-discovery-keyword>/u,
    );
    assert.match(body, /<label for="discovery-source">Source<\/label>/u);
    assert.match(
      body,
      /<select id="discovery-source" name="source" data-discovery-source>/u,
    );
    assert.match(body, /<label for="discovery-category">Category<\/label>/u);
    assert.match(
      body,
      /<select id="discovery-category" name="category" data-discovery-category>/u,
    );
    assert.match(body, /<button type="submit">Search<\/button>/u);
    assert.match(
      body,
      /<button type="button" data-discovery-reset>Reset<\/button>/u,
    );
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
      /api\/publications|publications\/|decodeURIComponent/u,
    );
    assert.match(clientSource, /window\.location\.search/u);
    assert.match(clientSource, /history\.pushState/u);

    const theme = await request('/public-theme.js');
    assert.equal(theme.status, 200);
    assert.match(
      theme.headers.get('content-type') ?? '',
      /^(application|text)\/javascript/u,
    );
    assert.equal(theme.headers.get('cache-control'), 'no-store');
    assert.equal(theme.headers.get('x-content-type-options'), 'nosniff');
    const themeSource = await theme.text();
    assert.match(themeSource, /news-scraper\.reader-theme/u);
    assert.match(themeSource, /prefers-color-scheme: dark/u);
    assert.doesNotMatch(themeSource, /fetch|\/api\/feed|pushState/u);

    const unknown = await request('/public/private-source-file.ts');
    assert.equal(unknown.status, 404);
    assert.doesNotMatch(await unknown.text(), /public-feed-shell|box-sizing/u);

    const unknownThemeMap = await request('/public-theme.js.map');
    assert.equal(unknownThemeMap.status, 404);
    assert.doesNotMatch(
      await unknownThemeMap.text(),
      /news-scraper\.reader-theme/u,
    );
  });

  function request(path: string): Promise<Response> {
    return fetch(`http://${webServer.host}:${webServer.port}${path}`);
  }
});
