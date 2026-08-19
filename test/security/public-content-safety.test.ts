import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium, type Browser, type Page } from 'playwright';

import { createWebApp } from '../../src/app/web/create-app.ts';
import { startWebServer, type WebServer } from '../../src/app/web/server.ts';
import type { PublicFeed } from '../../src/public-feed/repository.ts';

let browser: Browser;
let server: WebServer;
let feed = hostileFeed();

before(async () => {
  server = await startWebServer(
    createWebApp({
      readiness: { checkReady: async () => true },
      publicFeed: { read: async () => feed },
    }),
    { host: '127.0.0.1', port: 0 },
  );
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

test('publisher-controlled text stays inert through API serialization and browser rendering', async () => {
  feed = hostileFeed();
  const page = await newPage();
  try {
    await page.goto(baseUrl());
    await page.locator('[data-feed-content][data-state="populated"]').waitFor();

    assert.equal(await page.locator('[data-feed-list] img').count(), 0);
    assert.equal(await page.locator('[data-feed-list] script').count(), 0);
    assert.equal(
      await page.evaluate(() => 'publisherXss' in globalThis),
      false,
    );
    assert.equal(
      await page.locator('.feed-headline-link').textContent(),
      '<img src=x onerror="globalThis.publisherXss=1"> Publisher title',
    );
    assert.equal(
      await page.locator('.feed-source').textContent(),
      'Source<svg onload="globalThis.publisherXss=2"> Source',
    );
  } finally {
    await page.close();
  }
});

test('the browser rejects credential-bearing feed links even if an upstream boundary is bypassed', async () => {
  feed = hostileFeed({
    originalUrl: 'https://operator:secret@publisher.example.test/article',
  });
  const page = await newPage();
  try {
    await page.goto(baseUrl());
    await page
      .locator('[data-feed-content][data-state="unavailable"]')
      .waitFor();
    assert.equal(await page.locator('.feed-headline-link').count(), 0);
    assert.equal(
      await page.locator('[data-feed-status-message]').textContent(),
      'The feed is temporarily unavailable. Please try again later.',
    );
  } finally {
    await page.close();
  }
});

function hostileFeed(
  overrides: Partial<PublicFeed['items'][number]> = {},
): PublicFeed {
  return Object.freeze({
    publication: Object.freeze({
      name: 'Configured Publication',
      description: null,
      logoPath: null,
      accentColor: null,
      presentationTimezone: null,
    }),
    sourceChoices: Object.freeze([]),
    categoryChoices: Object.freeze([]),
    nextCursor: null,
    items: Object.freeze([
      Object.freeze({
        articleId: '10000000-0000-4000-8000-000000000001',
        effectiveFeedDate: new Date('2026-08-15T12:00:00.000Z'),
        feedDateSource: 'published_at' as const,
        headline:
          '<img src=x onerror="globalThis.publisherXss=1"> Publisher title',
        sourceName: '<svg onload="globalThis.publisherXss=2"> Source',
        originalUrl: 'https://publisher.example.test/article',
        ...overrides,
      }),
    ]),
  });
}

function baseUrl(): string {
  return `http://${server.host}:${String(server.port)}`;
}

async function newPage(): Promise<Page> {
  return browser.newPage();
}
