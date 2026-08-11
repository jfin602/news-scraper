import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromium, type Browser } from 'playwright';

import { createWebApp } from '../../src/app/web/create-app.ts';
import { startWebServer, type WebServer } from '../../src/app/web/server.ts';

describe('Public feed page browser delivery', () => {
  let browser: Browser;
  let webServer: WebServer;
  let publicFeedReads = 0;

  before(async () => {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      throw new Error(
        'Chromium is required for browser tests. Run "npx playwright install chromium".',
        { cause: error },
      );
    }
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

  after(async () => {
    await webServer?.close();
    await browser?.close();
  });

  it('supports direct navigation and refresh without feed reads or topic hard-coding', async () => {
    const page = await browser.newPage();
    const stylesheetRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/public-feed.css') {
        stylesheetRequests.push(request.url());
      }
    });

    const url = `http://${webServer.host}:${webServer.port}/publications/arbitrary-generic-slug`;
    const navigation = await page.goto(url);
    assert.equal(navigation?.status(), 200);
    assert.equal(await page.title(), 'News feed');
    assert.equal(await page.locator('h1').innerText(), 'News feed');
    assert.doesNotMatch(
      await page.locator('body').innerText(),
      /indie|author|publishing/u,
    );
    assert.equal(
      await page
        .locator('body')
        .evaluate((element) => getComputedStyle(element).backgroundColor),
      'rgb(250, 250, 250)',
    );
    assert.equal(stylesheetRequests.length, 1);

    const refresh = await page.reload();
    assert.equal(refresh?.status(), 200);
    assert.equal(await page.locator('h1').innerText(), 'News feed');
    assert.equal(stylesheetRequests.length, 2);
    assert.equal(publicFeedReads, 0);

    await page.close();
  });
});
