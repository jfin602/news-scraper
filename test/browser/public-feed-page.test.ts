import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';

import { createWebApp } from '../../src/app/web/create-app.ts';
import { startWebServer, type WebServer } from '../../src/app/web/server.ts';
import {
  encodePublicDiscoveryCursor,
  type PublicDiscoveryRequest,
} from '../../src/public-feed/discovery.ts';
import type { PublicFeed } from '../../src/public-feed/repository.ts';

const publication = Object.freeze({
  name: 'Example Publication',
  description: 'A publication description.',
  logoPath: null,
  accentColor: '#1A2B3C',
  presentationTimezone: 'America/Chicago',
});
const sourceChoices = Object.freeze([
  Object.freeze({ configKey: 'first_source', displayName: 'First Source' }),
]);
const categoryChoices = Object.freeze([
  Object.freeze({ configKey: 'industry_news', displayName: 'Industry news' }),
]);
let base = '';

describe('Public feed SSR and progressive enhancement', () => {
  let browser: Browser;
  let server: WebServer;
  let outcome: (request: PublicDiscoveryRequest) => PublicFeed | undefined =
    feedFor;

  before(async () => {
    browser = await chromium.launch({ headless: true });
    server = await startWebServer(
      createWebApp({
        readiness: { checkReady: async () => true },
        publicFeed: { read: async (request) => outcome(request) },
      }),
      { host: '127.0.0.1', port: 0 },
    );
    base = `http://${server.host}:${server.port}`;
  });
  after(async () => {
    await browser.close();
    await server.close();
  });

  it('adopts an already-populated SSR page without an initial API request', async () => {
    outcome = feedFor;
    const { context, page, apiRequests } = await openPage('/');
    try {
      await page
        .locator('[data-feed-content][data-state="populated"]')
        .waitFor();
      assert.equal(
        await page.locator('[data-publication-name]').innerText(),
        publication.name,
      );
      assert.equal(
        await page.locator('.feed-headline-link').first().innerText(),
        'Result for all',
      );
      assert.equal(
        await page.locator('.feed-headline-link').first().getAttribute('href'),
        'https://publisher.example.test/all',
      );
      assert.equal(await page.title(), `${publication.name} | News feed`);
      assert.deepEqual(apiRequests, []);
      assert.equal(await page.locator('[data-feed-item-id]').count(), 1);
    } finally {
      await context.close();
    }
  });

  it('starts direct root discovery URLs from corresponding SSR state without duplicate reads', async () => {
    outcome = feedFor;
    const { context, page, apiRequests } = await openPage(
      '/?q=Needle&source=first_source&category=industry_news',
    );
    try {
      assert.equal(
        await page.locator('[data-discovery-keyword]').inputValue(),
        'Needle',
      );
      assert.equal(
        await page.locator('[data-discovery-source]').inputValue(),
        'first_source',
      );
      assert.equal(
        await page.locator('[data-discovery-category]').inputValue(),
        'industry_news',
      );
      assert.equal(
        await page.locator('.feed-headline-link').innerText(),
        'Result for Needle',
      );
      assert.deepEqual(apiRequests, []);
    } finally {
      await context.close();
    }
  });

  it('uses the existing API path only after enhanced search and reset', async () => {
    outcome = feedFor;
    const { context, page, apiRequests } = await openPage('/');
    try {
      await page.locator('[data-discovery-keyword]').fill('new query');
      await page
        .locator('[data-discovery-form]')
        .evaluate((form) => (form as HTMLFormElement).requestSubmit());
      await page
        .locator('.feed-headline-link')
        .filter({ hasText: 'Result for new query' })
        .waitFor();
      assert.equal(apiRequests.at(-1), '/api/feed?q=new+query');
      assert.equal(
        await page.evaluate(() => location.pathname + location.search),
        '/?q=new+query',
      );
      await page.locator('[data-discovery-reset]').click();
      await page
        .locator('.feed-headline-link')
        .filter({ hasText: 'Result for all' })
        .waitFor();
      assert.equal(apiRequests.at(-1), '/api/feed');
      assert.equal(
        await page.evaluate(() => location.pathname + location.search),
        '/',
      );
    } finally {
      await context.close();
    }
  });

  it('continues from the SSR cursor through the canonical API cursor path', async () => {
    const cursor = encodePublicDiscoveryCursor(
      {},
      {
        effectiveFeedDate: '2026-08-10T12:00:00.123456Z',
        firstSeenAt: '2026-08-10T12:01:00.654321Z',
        articleId: '20000000-0000-4000-8000-000000000001',
      },
    );
    outcome = (request) =>
      request.cursorPosition === undefined
        ? feedFor(request, cursor)
        : continuationFeed();
    const { context, page, apiRequests } = await openPage('/');
    try {
      await page.locator('[data-feed-load-more]').click();
      await page
        .locator('.feed-headline-link')
        .filter({ hasText: 'Older result' })
        .waitFor();
      assert.equal(apiRequests.length, 1);
      assert.match(apiRequests[0] ?? '', /^\/api\/feed\?cursor=/u);
      assert.equal(await page.evaluate(() => location.search), '');
    } finally {
      await context.close();
    }
  });

  it('keeps error pages understandable and does not hydrate them into API reads', async () => {
    outcome = () => undefined;
    const { context, page, apiRequests, response } = await openPage('/');
    try {
      assert.equal(response.status(), 404);
      assert.match(
        await page.locator('main').innerText(),
        /publication is unavailable/i,
      );
      assert.deepEqual(apiRequests, []);
    } finally {
      await context.close();
    }
  });

  it('supports first-page reading, form discovery, reset, and errors without JavaScript', async () => {
    outcome = feedFor;
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      let response = await page.goto(baseUrl('/'));
      assert.equal(response?.status(), 200);
      assert.equal(
        await page.locator('[data-publication-name]').innerText(),
        publication.name,
      );
      assert.equal(
        await page.locator('.feed-headline-link').innerText(),
        'Result for all',
      );
      await page.locator('[data-discovery-keyword]').fill('needle');
      await Promise.all([
        page.waitForURL(/\/?q=needle&source=&category=$/u),
        page
          .locator('[data-discovery-form]')
          .evaluate((form) => (form as HTMLFormElement).requestSubmit()),
      ]);
      assert.equal(
        await page.locator('.feed-headline-link').innerText(),
        'Result for needle',
      );
      await Promise.all([
        page.waitForURL(/\/$/u),
        page.locator('[data-discovery-reset]').click(),
      ]);
      assert.equal(
        await page.locator('.feed-headline-link').innerText(),
        'Result for all',
      );
      response = await page.goto(baseUrl('/?cursor=opaque'));
      assert.equal(response?.status(), 400);
      assert.match(
        await page.locator('main').innerText(),
        /discovery request is invalid/i,
      );
    } finally {
      await context.close();
    }
  });

  async function openPage(path: string): Promise<
    Readonly<{
      context: BrowserContext;
      page: Page;
      apiRequests: string[];
      response: NonNullable<Awaited<ReturnType<Page['goto']>>>;
    }>
  > {
    const context = await browser.newContext();
    const page = await context.newPage();
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/feed')
        apiRequests.push(`${url.pathname}${url.search}`);
    });
    const response = await page.goto(baseUrl(path));
    if (response === null) throw new Error('Expected root response.');
    return { context, page, apiRequests, response };
  }
});

function feedFor(
  request: PublicDiscoveryRequest,
  nextCursor: string | null = null,
): PublicFeed {
  const suffix =
    request.keywordQuery ??
    request.sourceConfigKey ??
    request.categoryConfigKey ??
    'all';
  return Object.freeze({
    publication,
    sourceChoices,
    categoryChoices,
    nextCursor,
    items: Object.freeze([
      Object.freeze({
        articleId: '20000000-0000-4000-8000-000000000001',
        effectiveFeedDate: new Date('2026-08-10T12:00:00.000Z'),
        feedDateSource: 'published_at' as const,
        headline: `Result for ${suffix}`,
        sourceName: 'First Source',
        originalUrl: `https://publisher.example.test/${suffix}`,
      }),
    ]),
  });
}

function continuationFeed(): PublicFeed {
  return Object.freeze({
    ...feedFor({}),
    nextCursor: null,
    items: Object.freeze([
      Object.freeze({
        articleId: '30000000-0000-4000-8000-000000000001',
        effectiveFeedDate: new Date('2026-08-09T12:00:00.000Z'),
        feedDateSource: 'published_at' as const,
        headline: 'Older result',
        sourceName: 'First Source',
        originalUrl: 'https://publisher.example.test/older',
      }),
    ]),
  });
}

function baseUrl(path: string): string {
  return `${base}${path}`;
}
