import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Route,
} from 'playwright';

import { createWebApp } from '../../src/app/web/create-app.ts';
import { startWebServer, type WebServer } from '../../src/app/web/server.ts';
import type { PublicDiscoveryRequest } from '../../src/public-feed/discovery.ts';
import type { PublicFeed } from '../../src/public-feed/repository.ts';

const publication = Object.freeze({ name: 'Example Publication' });
const sourceChoices = Object.freeze([
  Object.freeze({ configKey: 'first_source', displayName: 'First Source' }),
  Object.freeze({ configKey: 'second_source', displayName: 'Second Source' }),
]);
const categoryChoices = Object.freeze([
  Object.freeze({ configKey: 'industry_news', displayName: 'Industry news' }),
  Object.freeze({ configKey: 'craft', displayName: 'Craft' }),
]);

type FeedOutcome =
  | PublicFeed
  | undefined
  | Error
  | Promise<PublicFeed | undefined>
  | ((
      request: PublicDiscoveryRequest,
    ) => PublicFeed | undefined | Error | Promise<PublicFeed | undefined>);

function populatedFeed(overrides: Partial<PublicFeed> = {}): PublicFeed {
  return Object.freeze({
    publication,
    sourceChoices,
    categoryChoices,
    nextCursor: 'opaque-next-cursor',
    items: Object.freeze([
      Object.freeze({
        articleId: '20000000-0000-4000-8000-000000000001',
        effectiveFeedDate: new Date('2026-08-06T00:30:00.000Z'),
        feedDateSource: 'published_at' as const,
        headline: 'Newest headline',
        sourceName: 'First Source',
        originalUrl: 'https://publisher.example.test/newest',
      }),
      Object.freeze({
        articleId: '30000000-0000-4000-8000-000000000001',
        effectiveFeedDate: new Date('2026-08-05T12:00:00.000Z'),
        feedDateSource: 'first_seen_at' as const,
        headline: 'Older headline',
        sourceName: 'Second Source',
        originalUrl: 'https://publisher.example.test/older',
      }),
    ]),
    ...overrides,
  });
}

function feedFor(request: PublicDiscoveryRequest): PublicFeed {
  const suffix =
    request.keywordQuery ??
    request.sourceConfigKey ??
    request.categoryConfigKey ??
    'all';
  return populatedFeed({
    items: Object.freeze([
      Object.freeze({
        ...populatedFeed().items[0]!,
        headline: `Result for ${suffix}`,
      }),
    ]),
  });
}

describe('Public feed page browser behavior', () => {
  let browser: Browser;
  let webServer: WebServer;
  let outcome: FeedOutcome;

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
          async read(request) {
            const current =
              typeof outcome === 'function' ? outcome(request) : outcome;
            if (current instanceof Error) throw current;
            return await current;
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

  it('keeps loading visible until the owned first-page response resolves', async () => {
    let resolveFeed: ((feed: PublicFeed | undefined) => void) | undefined;
    outcome = new Promise<PublicFeed | undefined>((resolve) => {
      resolveFeed = resolve;
    });
    const { context, page, apiRequestUrls } = await openPage();
    try {
      await waitForState(page, 'loading');
      assert.equal(
        await page.locator('[data-feed-status]').innerText(),
        'Loading the latest headlines.',
      );
      assert.equal(await page.locator('.feed-row').count(), 0);
      resolveFeed?.(populatedFeed());
      await waitForState(page, 'populated');
      assert.deepEqual(apiRequestUrls, ['/api/feed']);
    } finally {
      await context.close();
    }
  });

  it('renders the baseline feed, UTC dates, inert metadata, exact links, focus, and mobile layout', async () => {
    const markup = '<img src=x onerror="globalThis.feedXss = true">';
    const originalUrl =
      'https://publisher.example.test/original?preserve=exact';
    outcome = populatedFeed({
      publication: { name: markup },
      sourceChoices: Object.freeze([
        Object.freeze({ configKey: 'first_source', displayName: markup }),
      ]),
      categoryChoices: Object.freeze([
        Object.freeze({ configKey: 'industry_news', displayName: markup }),
      ]),
      items: Object.freeze([
        Object.freeze({
          ...populatedFeed().items[0]!,
          headline: markup,
          sourceName: markup,
          originalUrl,
        }),
      ]),
    });
    const { context, page } = await openPage({
      timezoneId: 'America/Los_Angeles',
      viewport: { width: 390, height: 844 },
    });
    try {
      await waitForState(page, 'populated');
      assert.equal(await page.title(), `${markup} | News feed`);
      assert.equal(await page.locator('h1').innerText(), markup);
      assert.equal(
        await page.locator('.feed-date time').innerText(),
        'AUG 6, 2026',
      );
      assert.equal(
        await page.locator('.feed-headline-link').getAttribute('href'),
        originalUrl,
      );
      assert.equal(await page.locator('img').count(), 0);
      assert.equal(await page.evaluate(() => 'feedXss' in globalThis), false);
      assert.equal(
        await page.locator('[data-discovery-source] option').nth(1).innerText(),
        markup,
      );
      assert.equal(
        await page
          .locator('[data-discovery-category] option')
          .nth(1)
          .innerText(),
        markup,
      );
      const link = page.locator('.feed-headline-link');
      await link.focus();
      assert.notEqual(
        await link.evaluate(
          (element) => getComputedStyle(element).outlineStyle,
        ),
        'none',
      );
      assert.equal(
        await page
          .locator('.feed-row')
          .evaluate((element) => getComputedStyle(element).display),
        'block',
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
      await page.route('https://publisher.example.test/**', async (route) => {
        await route.abort();
      });
      const destinationRequest = page.waitForRequest(
        'https://publisher.example.test/**',
      );
      await link.click({ noWaitAfter: true });
      assert.equal((await destinationRequest).url(), originalUrl);
    } finally {
      await context.close();
    }
  });

  it('supports direct URL criteria, metadata-supplied labels, combined filters, and refresh reconstruction', async () => {
    outcome = feedFor;
    const { context, page, apiRequestUrls } = await openPage({
      path: '/?q=contract&source=first_source&category=industry_news',
    });
    try {
      await waitForState(page, 'populated');
      assert.deepEqual(apiRequestUrls, [
        '/api/feed?q=contract&source=first_source&category=industry_news',
      ]);
      assert.equal(
        await page.locator('[data-discovery-keyword]').inputValue(),
        'contract',
      );
      assert.equal(
        await page.locator('[data-discovery-source]').inputValue(),
        'first_source',
      );
      assert.equal(
        await page.locator('[data-discovery-category]').inputValue(),
        'industry_news',
      );
      assert.deepEqual(
        await page.locator('[data-discovery-source] option').allTextContents(),
        ['All sources', 'First Source', 'Second Source'],
      );
      await page.reload();
      await waitForState(page, 'populated');
      assert.equal(
        new URL(page.url()).search,
        '?q=contract&source=first_source&category=industry_news',
      );
      assert.equal(
        apiRequestUrls.at(-1),
        '/api/feed?q=contract&source=first_source&category=industry_news',
      );
    } finally {
      await context.close();
    }
  });

  it('applies criteria in deterministic URL order and replaces first-page rows', async () => {
    outcome = feedFor;
    const { context, page, apiRequestUrls } = await openPage();
    try {
      await waitForState(page, 'populated');
      await page.locator('[data-discovery-keyword]').fill('  contract  ');
      await page
        .locator('[data-discovery-source]')
        .selectOption('second_source');
      await page.locator('[data-discovery-category]').selectOption('craft');
      await page
        .locator('[data-discovery-form]')
        .evaluate((form) => (form as HTMLFormElement).requestSubmit());
      await waitForState(page, 'populated');
      assert.equal(
        new URL(page.url()).search,
        '?q=contract&source=second_source&category=craft',
      );
      assert.equal(
        apiRequestUrls.at(-1),
        '/api/feed?q=contract&source=second_source&category=craft',
      );
      assert.deepEqual(
        await page.locator('.feed-headline-link').allTextContents(),
        ['Result for contract'],
      );
      assert.equal(await page.locator('.feed-row').count(), 1);
    } finally {
      await context.close();
    }
  });

  it('applies Source and Category independently as first-page criteria', async () => {
    outcome = feedFor;
    const { context, page, apiRequestUrls } = await openPage();
    try {
      await waitForState(page, 'populated');
      await page
        .locator('[data-discovery-source]')
        .selectOption('first_source');
      await page
        .locator('[data-discovery-form]')
        .evaluate((form) => (form as HTMLFormElement).requestSubmit());
      await waitForState(page, 'populated');
      assert.equal(new URL(page.url()).search, '?source=first_source');
      assert.equal(apiRequestUrls.at(-1), '/api/feed?source=first_source');
      await page.locator('[data-discovery-source]').selectOption('');
      await page.locator('[data-discovery-category]').selectOption('craft');
      await page
        .locator('[data-discovery-form]')
        .evaluate((form) => (form as HTMLFormElement).requestSubmit());
      await waitForState(page, 'populated');
      assert.equal(new URL(page.url()).search, '?category=craft');
      assert.equal(apiRequestUrls.at(-1), '/api/feed?category=craft');
    } finally {
      await context.close();
    }
  });

  it('resets from valid and invalid URLs to the unfiltered first page', async () => {
    outcome = feedFor;
    const { context, page, apiRequestUrls } = await openPage({
      path: '/?q=contract',
    });
    try {
      await waitForState(page, 'populated');
      await page.locator('[data-discovery-reset]').click();
      await waitForState(page, 'populated');
      assert.equal(
        new URL(page.url()).pathname + new URL(page.url()).search,
        '/',
      );
      assert.equal(apiRequestUrls.at(-1), '/api/feed');
      await page.goto(
        `http://${webServer.host}:${webServer.port}/?unknown=value`,
      );
      await waitForState(page, 'invalid');
      await page.locator('[data-discovery-reset]').click();
      await waitForState(page, 'populated');
      assert.equal(
        new URL(page.url()).pathname + new URL(page.url()).search,
        '/',
      );
    } finally {
      await context.close();
    }
  });

  it('restores controls and rows through Back and Forward without adding history entries', async () => {
    outcome = feedFor;
    const { context, page, apiRequestUrls } = await openPage();
    try {
      await waitForState(page, 'populated');
      await applyKeyword(page, 'alpha');
      await applyKeyword(page, 'beta');
      assert.equal(new URL(page.url()).search, '?q=beta');
      await page.goBack();
      await waitForState(page, 'populated');
      assert.equal(new URL(page.url()).search, '?q=alpha');
      assert.equal(
        await page.locator('[data-discovery-keyword]').inputValue(),
        'alpha',
      );
      assert.deepEqual(
        await page.locator('.feed-headline-link').allTextContents(),
        ['Result for alpha'],
      );
      const requestsAfterBack = apiRequestUrls.length;
      await page.goForward();
      await waitForState(page, 'populated');
      assert.equal(new URL(page.url()).search, '?q=beta');
      assert.equal(
        await page.locator('[data-discovery-keyword]').inputValue(),
        'beta',
      );
      assert.equal(apiRequestUrls.length, requestsAfterBack + 1);
      assert.equal(new URL(page.url()).searchParams.has('cursor'), false);
    } finally {
      await context.close();
    }
  });

  it('maps empty, unavailable, invalid, and dependency outcomes to bounded public states', async () => {
    outcome = populatedFeed({ items: Object.freeze([]), nextCursor: null });
    const { context, page } = await openPage({ path: '/?q=no-match' });
    try {
      await waitForState(page, 'empty');
      assert.match(
        await page.locator('[data-feed-status]').innerText(),
        /no recent headlines/i,
      );
      await page.goto(
        `http://${webServer.host}:${webServer.port}/?q=one&q=two`,
      );
      await waitForState(page, 'invalid');
      assert.match(await page.locator('main').innerText(), /invalid/i);
      outcome = undefined;
      await page.goto(`http://${webServer.host}:${webServer.port}/`);
      await waitForState(page, 'unavailable');
      assert.doesNotMatch(
        await page.locator('main').innerText(),
        /private|postgresql|database/i,
      );
      outcome = new Error('postgresql://user:PAGE_SECRET@database/private');
      await page.reload();
      await waitForState(page, 'error');
      assert.doesNotMatch(
        await page.locator('main').innerText(),
        /PAGE_SECRET|postgresql|database/u,
      );
    } finally {
      await context.close();
    }
  });

  it('does not repair malformed raw discovery URLs before the API validates them', async () => {
    outcome = feedFor;
    const { context, page, apiRequestUrls } = await openPage({
      path: '/?q=%E0%A4%A',
    });
    try {
      await waitForState(page, 'invalid');
      assert.equal(apiRequestUrls[0], '/api/feed?q=%E0%A4%A');
      assert.equal(new URL(page.url()).search, '?q=%E0%A4%A');
    } finally {
      await context.close();
    }
  });

  it('treats malformed successful discovery payloads as generic errors', async () => {
    outcome = populatedFeed();
    const { context, page } = await openPage({
      routeApi: async (route) => {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            publication,
            discovery: { query: {}, sources: [], categories: [] },
            items: [],
            nextCursor: null,
          }),
        });
      },
    });
    try {
      await waitForState(page, 'error');
    } finally {
      await context.close();
    }
  });

  it('prevents a slow initial response from overwriting a newer Apply result', async () => {
    let resolveSlow: ((feed: PublicFeed | undefined) => void) | undefined;
    const slow = new Promise<PublicFeed | undefined>((resolve) => {
      resolveSlow = resolve;
    });
    outcome = (request) =>
      request.keywordQuery === 'slow' ? slow : feedFor(request);
    const { context, page } = await openPage({ path: '/?q=slow' });
    try {
      await waitForState(page, 'loading');
      await applyKeyword(page, 'fast');
      assert.equal(await page.locator('h1').innerText(), 'Example Publication');
      resolveSlow?.(
        populatedFeed({ publication: { name: 'Stale Publication' } }),
      );
      await page.waitForTimeout(50);
      assert.equal(await page.locator('h1').innerText(), 'Example Publication');
      assert.deepEqual(
        await page.locator('.feed-headline-link').allTextContents(),
        ['Result for fast'],
      );
    } finally {
      await context.close();
    }
  });

  it('prevents slow Apply and history responses from overwriting Reset or popstate', async () => {
    const deferred = new Map<string, (feed: PublicFeed | undefined) => void>();
    outcome = (request) => {
      const q = request.keywordQuery;
      if (q === 'slow' || q === 'alpha') {
        return new Promise<PublicFeed | undefined>((resolve) =>
          deferred.set(q, resolve),
        );
      }
      return feedFor(request);
    };
    const { context, page } = await openPage();
    try {
      await waitForState(page, 'populated');
      await page.locator('[data-discovery-keyword]').fill('slow');
      await page
        .locator('[data-discovery-form]')
        .evaluate((form) => (form as HTMLFormElement).requestSubmit());
      await waitForState(page, 'loading');
      await page.locator('[data-discovery-reset]').click();
      await waitForState(page, 'populated');
      deferred.get('slow')?.(
        populatedFeed({ publication: { name: 'Stale Reset' } }),
      );
      await page.waitForTimeout(50);
      assert.equal(await page.locator('h1').innerText(), 'Example Publication');
      await page.locator('[data-discovery-keyword]').fill('alpha');
      await page
        .locator('[data-discovery-form]')
        .evaluate((form) => (form as HTMLFormElement).requestSubmit());
      await waitForState(page, 'loading');
      await applyKeyword(page, 'beta');
      await page.goBack();
      await waitForState(page, 'loading');
      await page.goForward();
      await waitForState(page, 'populated');
      deferred.get('alpha')?.(
        populatedFeed({ publication: { name: 'Stale History' } }),
      );
      await page.waitForTimeout(50);
      assert.equal(
        await page.locator('[data-discovery-keyword]').inputValue(),
        'beta',
      );
      assert.equal(await page.locator('h1').innerText(), 'Example Publication');
      assert.doesNotMatch(
        await page.locator('[data-feed-status]').innerText(),
        /temporarily unavailable/i,
      );
    } finally {
      await context.close();
    }
  });

  async function openPage(
    options: Readonly<{
      path?: string;
      timezoneId?: string;
      viewport?: { readonly width: number; readonly height: number };
      routeApi?: (route: Route) => Promise<void>;
    }> = {},
  ): Promise<{
    readonly context: BrowserContext;
    readonly page: Page;
    readonly apiRequestUrls: string[];
  }> {
    const context = await browser.newContext({
      ...(options.timezoneId === undefined
        ? {}
        : { timezoneId: options.timezoneId }),
      ...(options.viewport === undefined ? {} : { viewport: options.viewport }),
    });
    const page = await context.newPage();
    const apiRequestUrls: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/feed')
        apiRequestUrls.push(`${url.pathname}${url.search}`);
    });
    if (options.routeApi !== undefined)
      await page.route('**/api/feed**', options.routeApi);
    const response = await page.goto(
      `http://${webServer.host}:${webServer.port}${options.path ?? '/'}`,
    );
    assert.equal(response?.status(), 200);
    return { context, page, apiRequestUrls };
  }
});

async function applyKeyword(page: Page, value: string): Promise<void> {
  await page.locator('[data-discovery-keyword]').fill(value);
  await page
    .locator('[data-discovery-form]')
    .evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await waitForState(page, 'populated');
}

function waitForState(page: Page, state: string): Promise<unknown> {
  return page.waitForSelector(`[data-feed-content][data-state="${state}"]`);
}
