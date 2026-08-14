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
import {
  encodePublicDiscoveryCursor,
  type PublicDiscoveryCriteria,
  type PublicDiscoveryRequest,
} from '../../src/public-feed/discovery.ts';
import type {
  PublicFeed,
  PublicFeedItem,
} from '../../src/public-feed/repository.ts';

const publication = Object.freeze({
  name: 'Example Publication',
  description: null,
  logoPath: null,
  accentColor: null,
});
const brandedPublication = Object.freeze({
  name: 'Configured Publication',
  description: 'Configured publication description.',
  logoPath: '/publication-logo.svg',
  accentColor: '#1A2B3C',
});
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
    nextCursor: null,
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

interface DiscoveryQuery {
  readonly q: string | null;
  readonly source: string | null;
  readonly category: string | null;
}

const cursorPositions = Object.freeze([
  Object.freeze({
    effectiveFeedDate: '2026-08-05T12:00:00.000001Z',
    firstSeenAt: '2026-08-05T12:00:00.000001Z',
    articleId: '40000000-0000-4000-8000-000000000001',
  }),
  Object.freeze({
    effectiveFeedDate: '2026-08-04T12:00:00.000001Z',
    firstSeenAt: '2026-08-04T12:00:00.000001Z',
    articleId: '40000000-0000-4000-8000-000000000002',
  }),
]);

function queryFor(request: PublicDiscoveryRequest): DiscoveryQuery {
  return Object.freeze({
    q: request.keywordQuery ?? null,
    source: request.sourceConfigKey ?? null,
    category: request.categoryConfigKey ?? null,
  });
}

function criteriaFor(query: DiscoveryQuery): PublicDiscoveryCriteria {
  return Object.freeze({
    ...(query.q === null ? {} : { keywordQuery: query.q }),
    ...(query.source === null ? {} : { sourceConfigKey: query.source }),
    ...(query.category === null ? {} : { categoryConfigKey: query.category }),
  });
}

function cursorFor(query: DiscoveryQuery, positionIndex = 0): string {
  const position = cursorPositions[positionIndex];
  if (position === undefined) throw new Error('Unknown cursor position.');
  return encodePublicDiscoveryCursor(criteriaFor(query), position);
}

function continuationItems(): readonly PublicFeedItem[] {
  return Object.freeze([
    Object.freeze({
      articleId: '50000000-0000-4000-8000-000000000001',
      effectiveFeedDate: new Date('2026-08-04T10:00:00.000Z'),
      feedDateSource: 'published_at' as const,
      headline: 'Continuation headline one',
      sourceName: 'First Source',
      originalUrl: 'https://publisher.example.test/continuation-one',
    }),
    Object.freeze({
      articleId: '60000000-0000-4000-8000-000000000001',
      effectiveFeedDate: new Date('2026-08-03T12:00:00.000Z'),
      feedDateSource: 'first_seen_at' as const,
      headline: 'Continuation headline two',
      sourceName: 'Second Source',
      originalUrl: 'https://publisher.example.test/continuation-two',
    }),
  ]);
}

function continuationFeed(overrides: Partial<PublicFeed> = {}): PublicFeed {
  return populatedFeed({
    items: continuationItems(),
    nextCursor: null,
    ...overrides,
  });
}

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  resolve(value: Value): void;
  reject(error: unknown): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolvePromise: ((value: Value) => void) | undefined;
  let rejectPromise: ((error: unknown) => void) | undefined;
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve(value) {
      resolvePromise?.(value);
    },
    reject(error) {
      rejectPromise?.(error);
    },
  };
}

function publicFeedResponse(feed: PublicFeed, query: DiscoveryQuery) {
  return {
    publication: {
      name: feed.publication.name,
      description: feed.publication.description,
      logoPath: feed.publication.logoPath,
      accentColor: feed.publication.accentColor,
    },
    discovery: {
      query,
      sources: feed.sourceChoices ?? [],
      categories: feed.categoryChoices ?? [],
    },
    items: feed.items.map((item) => ({
      articleId: item.articleId,
      effectiveFeedDate: item.effectiveFeedDate.toISOString(),
      feedDateSource: item.feedDateSource,
      headline: item.headline,
      sourceName: item.sourceName,
      originalUrl: item.originalUrl,
    })),
    nextCursor: feed.nextCursor ?? null,
  };
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
        'Loading publication…',
      );
      assert.equal(await page.locator('[data-feed-status]').isVisible(), true);
      assert.equal(await page.locator('.feed-row').count(), 0);
      assert.equal(
        await page.locator('[data-publication-masthead]').isHidden(),
        true,
      );
      assert.equal(
        await page.locator('[data-publication-name]').innerText(),
        '',
      );
      assert.doesNotMatch(
        await page.locator('main').innerText(),
        /News feed/iu,
      );
      assert.doesNotMatch(
        await page.locator('main').innerText(),
        /Example Publication|Configured publication description/iu,
      );
      assert.equal(await page.locator('img').count(), 0);
      assert.equal(await page.title(), 'Loading publication…');
      resolveFeed?.(populatedFeed());
      await waitForState(page, 'populated');
      assert.deepEqual(apiRequestUrls, ['/api/feed']);
    } finally {
      await context.close();
    }
  });

  it('renders optional branding, degrades a broken logo, and removes absent optional presentation', async () => {
    outcome = populatedFeed({ publication: brandedPublication });
    const { context, page } = await openPage({
      routeLogo: async (route) => {
        await route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"></svg>',
        });
      },
    });
    try {
      await waitForState(page, 'populated');
      const masthead = page.locator('[data-publication-masthead]');
      assert.equal(await masthead.isVisible(), true);
      assert.equal(
        await page.locator('[data-publication-name]').innerText(),
        brandedPublication.name,
      );
      assert.equal(
        await page.locator('[data-publication-description]').innerText(),
        brandedPublication.description,
      );
      const logo = page.locator('.publication-logo-image');
      assert.equal(await logo.getAttribute('src'), brandedPublication.logoPath);
      assert.equal(await logo.getAttribute('alt'), '');
      assert.equal(
        await masthead.evaluate((element) =>
          element.style.getPropertyValue('--publication-accent'),
        ),
        brandedPublication.accentColor,
      );
      assert.equal(
        await page.title(),
        `${brandedPublication.name} | News feed`,
      );

      outcome = populatedFeed({
        publication: {
          ...brandedPublication,
          logoPath: '/missing-publication-logo.svg',
        },
      });
      await page.locator('[data-discovery-keyword]').fill('broken-logo');
      await submitDiscovery(page);
      await waitForState(page, 'populated');
      await page.waitForFunction(
        () => document.querySelector('.publication-logo-image') === null,
      );
      assert.equal(
        await page.locator('[data-publication-logo]').isHidden(),
        true,
      );
      assert.equal(
        await page.locator('[data-publication-name]').innerText(),
        brandedPublication.name,
      );

      outcome = populatedFeed({ publication });
      await page.locator('[data-discovery-reset]').click();
      await waitForState(page, 'populated');
      assert.equal(
        await page.locator('[data-publication-name]').innerText(),
        publication.name,
      );
      assert.equal(
        await page.locator('[data-publication-description]').isHidden(),
        true,
      );
      assert.equal(await page.locator('.publication-logo-image').count(), 0);
      assert.equal(
        await masthead.evaluate((element) =>
          element.style.getPropertyValue('--publication-accent'),
        ),
        '',
      );
    } finally {
      await context.close();
    }
  });

  it('renders the baseline feed, UTC dates, inert metadata, exact links, focus, and mobile layout', async () => {
    const markup = '<img src=x onerror="globalThis.feedXss = true">';
    const originalUrl =
      'https://publisher.example.test/original?preserve=exact';
    outcome = populatedFeed({
      publication: { ...publication, name: markup, description: markup },
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
        await page.locator('[data-publication-description]').innerText(),
        markup,
      );
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
      assert.equal(await page.locator('[data-feed-load-more]').count(), 0);
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

  it('preserves resolved branding while Search, Reset, and history first pages are pending', async () => {
    const unfiltered: DiscoveryQuery = Object.freeze({
      q: null,
      source: null,
      category: null,
    });
    const alpha: DiscoveryQuery = Object.freeze({
      q: 'alpha',
      source: null,
      category: null,
    });
    outcome = populatedFeed();
    const { context, page } = await openPage({ controlledFetch: true });
    try {
      await waitForControlledFetchCount(page, 1);
      await resolveControlledFetch(
        page,
        0,
        publicFeedResponse(
          populatedFeed({
            publication: { ...brandedPublication, logoPath: null },
          }),
          unfiltered,
        ),
      );
      await waitForState(page, 'populated');

      await page.locator('[data-discovery-keyword]').fill('alpha');
      await submitDiscovery(page);
      await waitForControlledFetchCount(page, 2);
      await assertPendingBranding(page, brandedPublication);
      await resolveControlledFetch(
        page,
        1,
        publicFeedResponse(
          populatedFeed({
            publication: { ...brandedPublication, logoPath: null },
          }),
          alpha,
        ),
      );
      await waitForState(page, 'populated');

      await page.locator('[data-discovery-reset]').click();
      await waitForControlledFetchCount(page, 3);
      await assertPendingBranding(page, brandedPublication);
      await resolveControlledFetch(
        page,
        2,
        publicFeedResponse(
          populatedFeed({
            publication: { ...brandedPublication, logoPath: null },
          }),
          unfiltered,
        ),
      );
      await waitForState(page, 'populated');

      await page.goBack();
      await waitForControlledFetchCount(page, 4);
      await assertPendingBranding(page, brandedPublication);
      await resolveControlledFetch(
        page,
        3,
        publicFeedResponse(
          populatedFeed({
            publication: { ...brandedPublication, logoPath: null },
          }),
          alpha,
        ),
      );
      await waitForState(page, 'populated');
    } finally {
      await context.close();
    }
  });

  it('clears previously resolved branding when an owned response establishes unavailability', async () => {
    outcome = populatedFeed({
      publication: { ...brandedPublication, logoPath: null },
    });
    const { context, page } = await openPage();
    try {
      await waitForState(page, 'populated');
      outcome = undefined;
      await page.locator('[data-discovery-keyword]').fill('unavailable');
      await submitDiscovery(page);
      await waitForState(page, 'unavailable');
      assert.equal(
        await page.locator('[data-publication-masthead]').isHidden(),
        true,
      );
      assert.equal(
        await page.locator('[data-publication-name]').innerText(),
        '',
      );
      assert.equal(
        await page.locator('[data-publication-description]').innerText(),
        '',
      );
      assert.equal(await page.locator('.publication-logo-image').count(), 0);
      assert.equal(
        await page
          .locator('[data-publication-masthead]')
          .evaluate((element) =>
            element.style.getPropertyValue('--publication-accent'),
          ),
        '',
      );
      assert.equal(await page.title(), 'Publication unavailable');
      assert.match(
        await page.locator('[data-feed-status]').innerText(),
        /publication is unavailable/i,
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

  it('does not treat literal or encoded root cursor parameters as shareable continuation state', async () => {
    const cursor = cursorFor(
      Object.freeze({ q: null, source: null, category: null }),
    );
    outcome = feedFor;
    const { context, page, apiRequestUrls } = await openPage({
      path: `/?cursor=${cursor}`,
    });
    try {
      await waitForState(page, 'invalid');
      assert.equal(apiRequestUrls[0], '/api/feed?cursor=');
      assert.equal(await page.locator('.feed-row').count(), 0);
      assert.equal(await page.locator('[data-feed-load-more]').count(), 0);
      assert.equal(new URL(page.url()).searchParams.has('cursor'), true);
    } finally {
      await context.close();
    }

    const encodedContext = await browser.newContext();
    const encodedPage = await encodedContext.newPage();
    const encodedApiRequestUrls: string[] = [];
    encodedPage.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/feed') {
        encodedApiRequestUrls.push(`${url.pathname}${url.search}`);
      }
    });
    try {
      const response = await encodedPage.goto(
        `http://${webServer.host}:${webServer.port}/?%63%75%72%73%6f%72=${cursor}`,
      );
      assert.equal(response?.status(), 200);
      await waitForState(encodedPage, 'invalid');
      assert.equal(encodedApiRequestUrls[0], '/api/feed?cursor=');
      assert.equal(await encodedPage.locator('.feed-row').count(), 0);
    } finally {
      await encodedContext.close();
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

  it('rejects malformed successful Publication presentation as a generic error', async () => {
    const malformedPresentations: readonly Record<string, unknown>[] = [
      {
        description: null,
        logoPath: null,
        accentColor: null,
      },
      {
        name: 'Valid name',
        description: 42,
        logoPath: null,
        accentColor: null,
      },
      {
        name: 'Valid name',
        description: null,
        logoPath: 'https://outside.example/logo.svg',
        accentColor: null,
      },
      {
        name: 'Valid name',
        description: null,
        logoPath: null,
        accentColor: '#abcdef',
      },
    ];

    for (const malformedPublication of malformedPresentations) {
      outcome = populatedFeed();
      const { context, page } = await openPage({
        routeApi: async (route) => {
          const response = publicFeedResponse(
            populatedFeed(),
            Object.freeze({ q: null, source: null, category: null }),
          );
          await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              ...response,
              publication: malformedPublication,
            }),
          });
        },
      });
      try {
        await waitForState(page, 'error');
        assert.equal(
          await page.locator('[data-publication-masthead]').isHidden(),
          true,
        );
        assert.equal(await page.title(), 'Feed unavailable');
      } finally {
        await context.close();
      }
    }
  });

  it('uses the current opaque cursor and criteria to append a final page in server order', async () => {
    const query: DiscoveryQuery = Object.freeze({
      q: 'contract',
      source: 'first_source',
      category: 'industry_news',
    });
    const cursor = cursorFor(query);
    const originalUrl =
      'https://publisher.example.test/continuation?preserve=exact';
    const markup = '<img src=x onerror="globalThis.appendedXss = true">';
    const appendedItems = Object.freeze([
      Object.freeze({
        ...continuationItems()[0]!,
        effectiveFeedDate: new Date('2026-01-02T00:30:00.000Z'),
        headline: markup,
        sourceName: markup,
        originalUrl,
      }),
      continuationItems()[1]!,
    ]);
    let continuationReads = 0;
    outcome = (request) => {
      assert.deepEqual(queryFor(request), query);
      if (request.cursorPosition === undefined) {
        return populatedFeed({ nextCursor: cursor });
      }
      continuationReads += 1;
      return continuationFeed({
        publication: {
          ...publication,
          name: 'Unexpected continuation name',
        },
        sourceChoices: Object.freeze([
          Object.freeze({ configKey: 'other_source', displayName: 'Other' }),
        ]),
        categoryChoices: Object.freeze([
          Object.freeze({ configKey: 'other_category', displayName: 'Other' }),
        ]),
        items: appendedItems,
        nextCursor: null,
      });
    };
    const { context, page, apiRequestUrls } = await openPage({
      path: '/?q=contract&source=first_source&category=industry_news',
      timezoneId: 'America/Los_Angeles',
      viewport: { width: 390, height: 844 },
    });
    try {
      await waitForState(page, 'populated');
      const loadMore = page.locator('[data-feed-load-more]');
      assert.equal(await loadMore.count(), 1);
      assert.equal(
        await loadMore.evaluate((button) => button.tagName),
        'BUTTON',
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
      await page.locator('[data-discovery-keyword]').fill('unapplied');
      const continuationRequest = page.waitForRequest((request) => {
        const url = new URL(request.url());
        return url.pathname === '/api/feed' && url.searchParams.has('cursor');
      });
      await loadMore.click();
      const requestedUrl = new URL((await continuationRequest).url());
      assert.equal(
        `${requestedUrl.pathname}${requestedUrl.search}`,
        `/api/feed?q=contract&source=first_source&category=industry_news&cursor=${cursor}`,
      );
      await waitForRowCount(page, 4);
      assert.equal(continuationReads, 1);
      assert.equal(
        new URL(page.url()).search,
        '?q=contract&source=first_source&category=industry_news',
      );
      assert.equal(new URL(page.url()).searchParams.has('cursor'), false);
      assert.deepEqual(
        await page.locator('.feed-headline-link').allTextContents(),
        [
          'Newest headline',
          'Older headline',
          markup,
          'Continuation headline two',
        ],
      );
      assert.equal(
        await page.locator('[data-feed-status]').innerText(),
        '4 headlines shown.',
      );
      assert.equal(await page.locator('h1').innerText(), 'Example Publication');
      assert.deepEqual(
        await page.locator('[data-discovery-source] option').allTextContents(),
        ['All sources', 'First Source', 'Second Source'],
      );
      assert.equal(
        await page.locator('.feed-row').nth(2).locator('time').innerText(),
        'JAN 2, 2026',
      );
      assert.equal(
        await page
          .locator('.feed-row')
          .nth(2)
          .locator('.feed-headline-link')
          .getAttribute('href'),
        originalUrl,
      );
      assert.equal(await page.locator('img').count(), 0);
      assert.equal(
        await page.evaluate(() => 'appendedXss' in globalThis),
        false,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
      assert.equal(await page.locator('[data-feed-load-more]').count(), 0);
      assert.equal(
        apiRequestUrls.at(-1),
        `/api/feed?q=contract&source=first_source&category=industry_news&cursor=${cursor}`,
      );
    } finally {
      await context.close();
    }
  });

  it('shows no final-page control and prevents duplicate keyboard or click continuation activation', async () => {
    const query: DiscoveryQuery = Object.freeze({
      q: null,
      source: null,
      category: null,
    });
    const cursor = cursorFor(query);
    const nextPage = deferred<PublicFeed | undefined>();
    let continuationReads = 0;
    outcome = (request) => {
      if (request.cursorPosition === undefined) {
        return populatedFeed({ nextCursor: cursor });
      }
      continuationReads += 1;
      return nextPage.promise;
    };
    const { context, page, apiRequestUrls } = await openPage();
    try {
      await waitForState(page, 'populated');
      const loadMore = page.locator('[data-feed-load-more]');
      await loadMore.focus();
      assert.equal(
        await loadMore.evaluate((button) => button.tagName),
        'BUTTON',
      );
      const continuationRequest = page.waitForRequest((request) => {
        const url = new URL(request.url());
        return url.pathname === '/api/feed' && url.searchParams.has('cursor');
      });
      await page.keyboard.press('Enter');
      await continuationRequest;
      assert.equal(await loadMore.isDisabled(), true);
      assert.equal(
        await page.locator('[data-feed-pagination-status]').innerText(),
        'Loading more headlines.',
      );
      assert.equal(
        await page.locator('[data-feed-pagination]').getAttribute('aria-busy'),
        'true',
      );
      await loadMore.evaluate((button) => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flushBrowser(page);
      assert.equal(
        apiRequestUrls.filter((url) => url.includes('cursor=')).length,
        1,
      );
      nextPage.resolve(continuationFeed());
      await waitForRowCount(page, 4);
      assert.equal(continuationReads, 1);
      assert.equal(await page.locator('[data-feed-load-more]').count(), 0);

      outcome = populatedFeed({ nextCursor: null });
      const finalContext = await browser.newContext();
      const finalPage = await finalContext.newPage();
      try {
        await finalPage.goto(`http://${webServer.host}:${webServer.port}/`);
        await waitForState(finalPage, 'populated');
        assert.equal(
          await finalPage.locator('[data-feed-load-more]').count(),
          0,
        );
      } finally {
        await finalContext.close();
      }
    } finally {
      await context.close();
    }
  });

  it('replaces a successful continuation cursor before requesting the next page', async () => {
    const query: DiscoveryQuery = Object.freeze({
      q: null,
      source: null,
      category: null,
    });
    const firstCursor = cursorFor(query);
    const secondCursor = cursorFor(query, 1);
    outcome = (request) => {
      if (request.cursorPosition === undefined) {
        return populatedFeed({ nextCursor: firstCursor });
      }
      if (
        request.cursorPosition.effectiveFeedDate ===
        cursorPositions[0]!.effectiveFeedDate
      ) {
        return continuationFeed({
          items: Object.freeze([continuationItems()[0]!]),
          nextCursor: secondCursor,
        });
      }
      return continuationFeed({
        items: Object.freeze([continuationItems()[1]!]),
        nextCursor: null,
      });
    };
    const { context, page, apiRequestUrls } = await openPage();
    try {
      await waitForState(page, 'populated');
      await page.locator('[data-feed-load-more]').click();
      await waitForRowCount(page, 3);
      assert.equal(await page.locator('[data-feed-load-more]').count(), 1);
      assert.equal(apiRequestUrls.at(-1), `/api/feed?cursor=${firstCursor}`);

      await page.locator('[data-feed-load-more]').click();
      await waitForRowCount(page, 4);
      assert.equal(apiRequestUrls.at(-1), `/api/feed?cursor=${secondCursor}`);
      assert.equal(await page.locator('[data-feed-load-more]').count(), 0);
      assert.equal(
        await page.locator('[data-feed-status]').innerText(),
        '4 headlines shown.',
      );
    } finally {
      await context.close();
    }
  });

  it('does not append a continuation response twice when its resolver is invoked again', async () => {
    const query: DiscoveryQuery = Object.freeze({
      q: null,
      source: null,
      category: null,
    });
    outcome = populatedFeed();
    const { context, page } = await openPage({ controlledFetch: true });
    try {
      await waitForControlledFetchCount(page, 1);
      await resolveControlledFetch(
        page,
        0,
        publicFeedResponse(
          populatedFeed({ nextCursor: cursorFor(query) }),
          query,
        ),
      );
      await waitForRowCount(page, 2);
      await page.locator('[data-feed-load-more]').click();
      await waitForControlledFetchCount(page, 2);
      const continuation = publicFeedResponse(
        continuationFeed({
          items: Object.freeze([continuationItems()[0]!]),
          nextCursor: null,
        }),
        query,
      );
      await resolveControlledFetch(page, 1, continuation);
      await waitForRowCount(page, 3);
      await resolveControlledFetch(page, 1, continuation);
      await flushBrowser(page);
      assert.equal(await page.locator('.feed-row').count(), 3);
      assert.equal(await page.locator('[data-feed-load-more]').count(), 0);
      assert.equal(
        await page.locator('[data-feed-status]').innerText(),
        '3 headlines shown.',
      );
    } finally {
      await context.close();
    }
  });

  it('rejects duplicate continuation items without advancing the cursor and appends one safe retry', async () => {
    const query: DiscoveryQuery = Object.freeze({
      q: null,
      source: null,
      category: null,
    });
    const cursor = cursorFor(query);
    const followingCursor = cursorFor(query, 1);
    let duplicateResponse = true;
    outcome = (request) => {
      if (request.cursorPosition === undefined) {
        return populatedFeed({ nextCursor: cursor });
      }
      if (duplicateResponse) {
        return continuationFeed({
          items: Object.freeze([
            populatedFeed().items[0]!,
            continuationItems()[0]!,
          ]),
          nextCursor: followingCursor,
        });
      }
      return continuationFeed();
    };
    const { context, page, apiRequestUrls } = await openPage();
    try {
      await waitForState(page, 'populated');
      await page.locator('[data-feed-load-more]').click();
      await waitForPaginationFailure(page);
      assert.equal(await page.locator('.feed-row').count(), 2);
      assert.equal(
        await page.locator('[data-feed-status]').innerText(),
        '2 headlines shown.',
      );
      assert.equal(
        await page.locator('[data-feed-load-more]').isDisabled(),
        false,
      );
      assert.match(
        await page.locator('[data-feed-pagination-error]').innerText(),
        /unable to load more headlines/i,
      );
      assert.equal(apiRequestUrls.at(-1), `/api/feed?cursor=${cursor}`);

      duplicateResponse = false;
      await page.locator('[data-feed-load-more]').click();
      await waitForRowCount(page, 4);
      assert.equal(apiRequestUrls.at(-1), `/api/feed?cursor=${cursor}`);
      assert.equal(
        await page.locator('[data-feed-pagination-error]').count(),
        0,
      );
      assert.equal(await page.locator('[data-feed-load-more]').count(), 0);
    } finally {
      await context.close();
    }
  });

  it('preserves rows and cursor across retryable continuation failures', async () => {
    const query: DiscoveryQuery = Object.freeze({
      q: null,
      source: null,
      category: null,
    });
    const cursor = cursorFor(query);
    const scriptedResponses = [
      { kind: 'abort' as const },
      { kind: 'status' as const, status: 503 },
      { kind: 'status' as const, status: 400 },
      { kind: 'status' as const, status: 404 },
      { kind: 'malformed' as const },
      {
        kind: 'json' as const,
        body: publicFeedResponse(
          continuationFeed(),
          Object.freeze({ q: 'wrong', source: null, category: null }),
        ),
      },
      {
        kind: 'json' as const,
        body: publicFeedResponse(continuationFeed(), query),
      },
    ];
    outcome = populatedFeed({ nextCursor: cursor });
    const { context, page, apiRequestUrls } = await openPage({
      routeApi: async (route) => {
        const url = new URL(route.request().url());
        if (!url.searchParams.has('cursor')) {
          await route.continue();
          return;
        }
        const response = scriptedResponses.shift();
        if (response === undefined)
          throw new Error('Unexpected continuation request.');
        if (response.kind === 'abort') {
          await route.abort('failed');
          return;
        }
        if (response.kind === 'status') {
          await route.fulfill({
            status: response.status,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'service_unavailable' }),
          });
          return;
        }
        if (response.kind === 'malformed') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '{not valid json',
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(response.body),
        });
      },
    });
    try {
      await waitForState(page, 'populated');
      for (let index = 0; index < 6; index += 1) {
        const continuationRequest = page.waitForRequest((request) =>
          new URL(request.url()).searchParams.has('cursor'),
        );
        await page.locator('[data-feed-load-more]').click();
        await continuationRequest;
        await waitForPaginationFailure(page);
        assert.equal(await page.locator('.feed-row').count(), 2);
        assert.equal(
          await page.locator('[data-feed-status]').innerText(),
          '2 headlines shown.',
        );
        assert.equal(
          await page.locator('[data-feed-load-more]').isDisabled(),
          false,
        );
        assert.equal(new URL(page.url()).searchParams.has('cursor'), false);
        assert.equal(apiRequestUrls.at(-1), `/api/feed?cursor=${cursor}`);
      }
      await page.locator('[data-feed-load-more]').click();
      await waitForRowCount(page, 4);
      assert.equal(apiRequestUrls.at(-1), `/api/feed?cursor=${cursor}`);
      assert.equal(
        await page.locator('[data-feed-pagination-error]').count(),
        0,
      );
      assert.equal(await page.locator('[data-feed-load-more]').count(), 0);
    } finally {
      await context.close();
    }
  });

  it('resets loaded depth for Source, Category, and Reset without carrying a cursor', async () => {
    outcome = (request) => {
      const query = queryFor(request);
      const suffix = query.q ?? query.source ?? query.category ?? 'all';
      if (request.cursorPosition !== undefined) {
        return continuationFeed({
          items: Object.freeze([
            Object.freeze({
              ...continuationItems()[0]!,
              headline: `Page two for ${suffix}`,
            }),
          ]),
          nextCursor: null,
        });
      }
      return populatedFeed({
        items: Object.freeze([
          Object.freeze({
            ...populatedFeed().items[0]!,
            headline: `First page for ${suffix}`,
          }),
        ]),
        nextCursor: cursorFor(query),
      });
    };
    const { context, page, apiRequestUrls } = await openPage();
    try {
      await waitForState(page, 'populated');
      await page.locator('[data-feed-load-more]').click();
      await waitForRowCount(page, 2);
      assert.deepEqual(
        await page.locator('.feed-headline-link').allTextContents(),
        ['First page for all', 'Page two for all'],
      );

      await page.locator('[data-discovery-keyword]').fill('new-query');
      await submitDiscovery(page);
      await waitForHeadlines(page, ['First page for new-query']);
      assert.equal(new URL(page.url()).search, '?q=new-query');
      assert.equal(apiRequestUrls.at(-1), '/api/feed?q=new-query');
      assert.equal(apiRequestUrls.at(-1)?.includes('cursor='), false);

      await page.locator('[data-discovery-keyword]').fill('');
      await page
        .locator('[data-discovery-source]')
        .selectOption('first_source');
      await submitDiscovery(page);
      await waitForHeadlines(page, ['First page for first_source']);
      assert.equal(new URL(page.url()).search, '?source=first_source');
      assert.equal(apiRequestUrls.at(-1), '/api/feed?source=first_source');
      assert.equal(apiRequestUrls.at(-1)?.includes('cursor='), false);

      await page.locator('[data-feed-load-more]').click();
      await waitForHeadlines(page, [
        'First page for first_source',
        'Page two for first_source',
      ]);
      await page.locator('[data-discovery-source]').selectOption('');
      await page.locator('[data-discovery-category]').selectOption('craft');
      await submitDiscovery(page);
      await waitForHeadlines(page, ['First page for craft']);
      assert.equal(new URL(page.url()).search, '?category=craft');
      assert.equal(apiRequestUrls.at(-1), '/api/feed?category=craft');
      assert.equal(apiRequestUrls.at(-1)?.includes('cursor='), false);

      await page.locator('[data-feed-load-more]').click();
      await waitForHeadlines(page, [
        'First page for craft',
        'Page two for craft',
      ]);
      await page.locator('[data-discovery-reset]').click();
      await waitForHeadlines(page, ['First page for all']);
      assert.equal(
        new URL(page.url()).pathname + new URL(page.url()).search,
        '/',
      );
      assert.equal(apiRequestUrls.at(-1), '/api/feed');
      assert.equal(apiRequestUrls.at(-1)?.includes('cursor='), false);
    } finally {
      await context.close();
    }
  });

  it('restores the first URL page through Back and Forward rather than load-more depth', async () => {
    outcome = (request) => {
      const query = queryFor(request);
      const suffix = query.q ?? 'all';
      if (request.cursorPosition !== undefined) {
        return continuationFeed({
          items: Object.freeze([
            Object.freeze({
              ...continuationItems()[0]!,
              headline: `${suffix} continuation`,
            }),
          ]),
          nextCursor: null,
        });
      }
      return populatedFeed({
        items: Object.freeze([
          Object.freeze({
            ...populatedFeed().items[0]!,
            headline: `${suffix} first page`,
          }),
        ]),
        nextCursor: cursorFor(query),
      });
    };
    const { context, page, apiRequestUrls } = await openPage({
      path: '/?q=alpha',
    });
    try {
      await waitForHeadlines(page, ['alpha first page']);
      await page.locator('[data-feed-load-more]').click();
      await waitForHeadlines(page, ['alpha first page', 'alpha continuation']);
      await applyKeyword(page, 'beta');
      await waitForHeadlines(page, ['beta first page']);

      await page.goBack();
      await waitForHeadlines(page, ['alpha first page']);
      assert.equal(new URL(page.url()).search, '?q=alpha');
      assert.equal(apiRequestUrls.at(-1), '/api/feed?q=alpha');
      assert.equal(new URL(page.url()).searchParams.has('cursor'), false);

      await page.goForward();
      await waitForHeadlines(page, ['beta first page']);
      assert.equal(new URL(page.url()).search, '?q=beta');
      assert.equal(apiRequestUrls.at(-1), '/api/feed?q=beta');
      assert.equal(await page.locator('.feed-row').count(), 1);
      assert.equal(new URL(page.url()).searchParams.has('cursor'), false);
    } finally {
      await context.close();
    }
  });

  it('invalidates a slow continuation on Apply so stale failures cannot affect newer rows or controls', async () => {
    const alpha: DiscoveryQuery = Object.freeze({
      q: 'alpha',
      source: null,
      category: null,
    });
    const slowContinuation = deferred<PublicFeed | undefined>();
    const betaFirstPage = deferred<PublicFeed | undefined>();
    outcome = (request) => {
      const query = queryFor(request);
      if (query.q === 'alpha' && request.cursorPosition !== undefined) {
        return slowContinuation.promise;
      }
      if (query.q === 'alpha') {
        return populatedFeed({
          items: Object.freeze([
            Object.freeze({
              ...populatedFeed().items[0]!,
              headline: 'alpha first page',
            }),
          ]),
          nextCursor: cursorFor(alpha),
        });
      }
      if (query.q === 'beta') return betaFirstPage.promise;
      return populatedFeed({
        items: Object.freeze([
          Object.freeze({
            ...populatedFeed().items[0]!,
            headline: 'beta first page',
          }),
        ]),
        nextCursor: null,
      });
    };
    const { context, page } = await openPage({ path: '/?q=alpha' });
    try {
      await waitForHeadlines(page, ['alpha first page']);
      const continuationRequest = page.waitForRequest((request) =>
        new URL(request.url()).searchParams.has('cursor'),
      );
      await page.locator('[data-feed-load-more]').click();
      await continuationRequest;
      assert.equal(
        await page.locator('[data-feed-load-more]').isDisabled(),
        true,
      );

      await page.locator('[data-discovery-keyword]').fill('beta');
      await page
        .locator('[data-discovery-form]')
        .evaluate((form) => (form as HTMLFormElement).requestSubmit());
      await waitForState(page, 'loading');
      assert.equal(await page.locator('[data-feed-load-more]').count(), 0);
      betaFirstPage.resolve(
        populatedFeed({
          items: Object.freeze([
            Object.freeze({
              ...populatedFeed().items[0]!,
              headline: 'beta first page',
            }),
          ]),
          nextCursor: null,
        }),
      );
      await waitForHeadlines(page, ['beta first page']);

      slowContinuation.reject(new Error('stale continuation failure'));
      await flushBrowser(page);
      assert.deepEqual(
        await page.locator('.feed-headline-link').allTextContents(),
        ['beta first page'],
      );
      assert.equal(
        await page.locator('[data-feed-pagination-error]').isHidden(),
        true,
      );
      assert.doesNotMatch(
        await page.locator('[data-feed-status]').innerText(),
        /temporarily unavailable|unable to load/i,
      );
    } finally {
      await context.close();
    }
  });

  it('invalidates a slow continuation on Reset and preserves the fresh unfiltered first page', async () => {
    const alpha: DiscoveryQuery = Object.freeze({
      q: 'alpha',
      source: null,
      category: null,
    });
    const slowContinuation = deferred<PublicFeed | undefined>();
    outcome = (request) => {
      const query = queryFor(request);
      if (query.q === 'alpha' && request.cursorPosition !== undefined) {
        return slowContinuation.promise;
      }
      if (query.q === 'alpha') {
        return populatedFeed({
          items: Object.freeze([
            Object.freeze({
              ...populatedFeed().items[0]!,
              headline: 'alpha first page',
            }),
          ]),
          nextCursor: cursorFor(alpha),
        });
      }
      return populatedFeed({
        items: Object.freeze([
          Object.freeze({
            ...populatedFeed().items[0]!,
            headline: 'unfiltered first page',
          }),
        ]),
        nextCursor: null,
      });
    };
    const { context, page } = await openPage({ path: '/?q=alpha' });
    try {
      await waitForHeadlines(page, ['alpha first page']);
      const continuationRequest = page.waitForRequest((request) =>
        new URL(request.url()).searchParams.has('cursor'),
      );
      await page.locator('[data-feed-load-more]').click();
      await continuationRequest;
      await page.locator('[data-discovery-reset]').click();
      await waitForHeadlines(page, ['unfiltered first page']);
      assert.equal(
        new URL(page.url()).pathname + new URL(page.url()).search,
        '/',
      );

      slowContinuation.resolve(
        continuationFeed({
          items: Object.freeze([
            Object.freeze({
              ...continuationItems()[0]!,
              headline: 'stale continuation page',
            }),
          ]),
        }),
      );
      await flushBrowser(page);
      assert.deepEqual(
        await page.locator('.feed-headline-link').allTextContents(),
        ['unfiltered first page'],
      );
      assert.equal(
        await page.locator('[data-feed-pagination-error]').count(),
        0,
      );
    } finally {
      await context.close();
    }
  });

  it('invalidates a slow continuation during Back and Forward restoration', async () => {
    const beta: DiscoveryQuery = Object.freeze({
      q: 'beta',
      source: null,
      category: null,
    });
    const slowContinuation = deferred<PublicFeed | undefined>();
    outcome = (request) => {
      const query = queryFor(request);
      if (query.q === 'beta' && request.cursorPosition !== undefined) {
        return slowContinuation.promise;
      }
      const suffix = query.q ?? 'alpha';
      return populatedFeed({
        items: Object.freeze([
          Object.freeze({
            ...populatedFeed().items[0]!,
            headline: `${suffix} first page`,
          }),
        ]),
        nextCursor: query.q === 'beta' ? cursorFor(beta) : null,
      });
    };
    const { context, page } = await openPage({ path: '/?q=alpha' });
    try {
      await waitForHeadlines(page, ['alpha first page']);
      await applyKeyword(page, 'beta');
      await waitForHeadlines(page, ['beta first page']);
      const continuationRequest = page.waitForRequest((request) =>
        new URL(request.url()).searchParams.has('cursor'),
      );
      await page.locator('[data-feed-load-more]').click();
      await continuationRequest;

      await page.goBack();
      await waitForHeadlines(page, ['alpha first page']);
      await page.goForward();
      await waitForHeadlines(page, ['beta first page']);
      assert.equal(new URL(page.url()).search, '?q=beta');
      assert.equal(new URL(page.url()).searchParams.has('cursor'), false);

      slowContinuation.resolve(
        continuationFeed({
          items: Object.freeze([
            Object.freeze({
              ...continuationItems()[0]!,
              headline: 'stale beta continuation',
            }),
          ]),
        }),
      );
      await flushBrowser(page);
      assert.deepEqual(
        await page.locator('.feed-headline-link').allTextContents(),
        ['beta first page'],
      );
      assert.equal(
        await page.locator('[data-feed-pagination-error]').isHidden(),
        true,
      );
    } finally {
      await context.close();
    }
  });

  it('ignores an abort-insensitive stale continuation success after Apply', async () => {
    const alpha: DiscoveryQuery = Object.freeze({
      q: 'alpha',
      source: null,
      category: null,
    });
    const beta: DiscoveryQuery = Object.freeze({
      q: 'beta',
      source: null,
      category: null,
    });
    outcome = populatedFeed();
    const { context, page } = await openPage({ controlledFetch: true });
    try {
      await waitForControlledFetchCount(page, 1);
      await resolveControlledFetch(
        page,
        0,
        publicFeedResponse(
          populatedFeed({
            items: Object.freeze([
              Object.freeze({
                ...populatedFeed().items[0]!,
                headline: 'alpha first page',
              }),
            ]),
            nextCursor: cursorFor(alpha),
          }),
          alpha,
        ),
      );
      await waitForHeadlines(page, ['alpha first page']);

      await page.locator('[data-feed-load-more]').click();
      await waitForControlledFetchCount(page, 2);
      assert.equal(
        await page.locator('[data-feed-load-more]').isDisabled(),
        true,
      );
      assert.equal(await page.locator('.feed-row').count(), 1);
      assert.equal(
        await page
          .locator('[data-feed-pagination-status]')
          .getAttribute('role'),
        'status',
      );
      assert.equal(
        await page
          .locator('[data-feed-pagination-status]')
          .getAttribute('aria-live'),
        'polite',
      );

      await page.locator('[data-discovery-keyword]').fill('beta');
      await submitDiscovery(page);
      await waitForControlledFetchCount(page, 3);
      await resolveControlledFetch(
        page,
        2,
        publicFeedResponse(
          populatedFeed({
            items: Object.freeze([
              Object.freeze({
                ...populatedFeed().items[0]!,
                headline: 'beta first page',
              }),
            ]),
            nextCursor: null,
          }),
          beta,
        ),
      );
      await waitForHeadlines(page, ['beta first page']);

      await resolveControlledFetch(
        page,
        1,
        publicFeedResponse(
          continuationFeed({
            items: Object.freeze([
              Object.freeze({
                ...continuationItems()[0]!,
                headline: 'stale alpha continuation',
              }),
            ]),
          }),
          alpha,
        ),
      );
      await flushBrowser(page);
      assert.deepEqual(
        await page.locator('.feed-headline-link').allTextContents(),
        ['beta first page'],
      );
      assert.equal(
        await page.locator('[data-feed-pagination-error]').count(),
        0,
      );
    } finally {
      await context.close();
    }
  });

  it('ignores an abort-insensitive stale continuation failure after Reset and history navigation', async () => {
    const alpha: DiscoveryQuery = Object.freeze({
      q: 'alpha',
      source: null,
      category: null,
    });
    const beta: DiscoveryQuery = Object.freeze({
      q: 'beta',
      source: null,
      category: null,
    });
    const unfiltered: DiscoveryQuery = Object.freeze({
      q: null,
      source: null,
      category: null,
    });
    outcome = populatedFeed();
    const { context, page } = await openPage({ controlledFetch: true });
    try {
      await waitForControlledFetchCount(page, 1);
      await resolveControlledFetch(
        page,
        0,
        publicFeedResponse(
          populatedFeed({
            items: Object.freeze([
              Object.freeze({
                ...populatedFeed().items[0]!,
                headline: 'alpha first page',
              }),
            ]),
            nextCursor: cursorFor(alpha),
          }),
          alpha,
        ),
      );
      await waitForHeadlines(page, ['alpha first page']);

      await page.locator('[data-feed-load-more]').click();
      await waitForControlledFetchCount(page, 2);
      await page.locator('[data-discovery-reset]').click();
      await waitForControlledFetchCount(page, 3);
      await resolveControlledFetch(
        page,
        2,
        publicFeedResponse(
          populatedFeed({
            items: Object.freeze([
              Object.freeze({
                ...populatedFeed().items[0]!,
                headline: 'unfiltered first page',
              }),
            ]),
            nextCursor: null,
          }),
          unfiltered,
        ),
      );
      await waitForHeadlines(page, ['unfiltered first page']);
      await rejectControlledFetch(page, 1);
      await flushBrowser(page);
      assert.deepEqual(
        await page.locator('.feed-headline-link').allTextContents(),
        ['unfiltered first page'],
      );

      await page.locator('[data-discovery-keyword]').fill('alpha');
      await submitDiscovery(page);
      await waitForControlledFetchCount(page, 4);
      await resolveControlledFetch(
        page,
        3,
        publicFeedResponse(
          populatedFeed({
            items: Object.freeze([
              Object.freeze({
                ...populatedFeed().items[0]!,
                headline: 'alpha history page',
              }),
            ]),
            nextCursor: cursorFor(alpha),
          }),
          alpha,
        ),
      );
      await waitForHeadlines(page, ['alpha history page']);
      await page.locator('[data-feed-load-more]').click();
      await waitForControlledFetchCount(page, 5);

      await page.locator('[data-discovery-keyword]').fill('beta');
      await submitDiscovery(page);
      await waitForControlledFetchCount(page, 6);
      await resolveControlledFetch(
        page,
        5,
        publicFeedResponse(
          populatedFeed({
            items: Object.freeze([
              Object.freeze({
                ...populatedFeed().items[0]!,
                headline: 'beta history page',
              }),
            ]),
            nextCursor: null,
          }),
          beta,
        ),
      );
      await waitForHeadlines(page, ['beta history page']);

      await page.goBack();
      await waitForControlledFetchCount(page, 7);
      await resolveControlledFetch(
        page,
        6,
        publicFeedResponse(
          populatedFeed({
            items: Object.freeze([
              Object.freeze({
                ...populatedFeed().items[0]!,
                headline: 'alpha restored first page',
              }),
            ]),
            nextCursor: null,
          }),
          alpha,
        ),
      );
      await waitForHeadlines(page, ['alpha restored first page']);
      await rejectControlledFetch(page, 4);
      await flushBrowser(page);
      assert.deepEqual(
        await page.locator('.feed-headline-link').allTextContents(),
        ['alpha restored first page'],
      );
      assert.equal(
        await page.locator('[data-feed-pagination-error]').count(),
        0,
      );
    } finally {
      await context.close();
    }
  });

  it('does not let stale success, 404, or error responses overwrite newer owned branding', async () => {
    outcome = populatedFeed();
    const { context, page } = await openPage({ controlledFetch: true });
    const presentation = (name: string) => ({
      ...brandedPublication,
      name,
      logoPath: null,
    });
    const query = (q: string | null): DiscoveryQuery =>
      Object.freeze({ q, source: null, category: null });
    const response = (name: string, q: string | null) =>
      publicFeedResponse(
        populatedFeed({ publication: presentation(name) }),
        query(q),
      );
    try {
      await waitForControlledFetchCount(page, 1);
      await resolveControlledFetch(page, 0, response('Initial', null));
      await waitForState(page, 'populated');

      await page.locator('[data-discovery-keyword]').fill('stale-404');
      await submitDiscovery(page);
      await waitForControlledFetchCount(page, 2);
      await page.locator('[data-discovery-keyword]').fill('after-404');
      await submitDiscovery(page);
      await waitForControlledFetchCount(page, 3);
      await resolveControlledFetch(page, 2, response('After 404', 'after-404'));
      await waitForState(page, 'populated');
      await resolveControlledFetch(page, 1, { error: 'not_found' }, 404);
      await flushBrowser(page);
      await assertCurrentBranding(page, 'After 404');

      await page.locator('[data-discovery-keyword]').fill('stale-error');
      await submitDiscovery(page);
      await waitForControlledFetchCount(page, 4);
      await page.locator('[data-discovery-keyword]').fill('after-error');
      await submitDiscovery(page);
      await waitForControlledFetchCount(page, 5);
      await resolveControlledFetch(
        page,
        4,
        response('After error', 'after-error'),
      );
      await waitForState(page, 'populated');
      await rejectControlledFetch(page, 3);
      await flushBrowser(page);
      await assertCurrentBranding(page, 'After error');

      await page.locator('[data-discovery-keyword]').fill('stale-success');
      await submitDiscovery(page);
      await waitForControlledFetchCount(page, 6);
      await page.locator('[data-discovery-keyword]').fill('current');
      await submitDiscovery(page);
      await waitForControlledFetchCount(page, 7);
      await resolveControlledFetch(page, 6, response('Current', 'current'));
      await waitForState(page, 'populated');
      await resolveControlledFetch(
        page,
        5,
        response('Stale success', 'stale-success'),
      );
      await flushBrowser(page);
      await assertCurrentBranding(page, 'Current');
    } finally {
      await context.close();
    }
  });

  it('prevents a slow initial response from overwriting a newer Apply result', async () => {
    const slow = deferred<PublicFeed | undefined>();
    outcome = (request) =>
      request.keywordQuery === 'slow' ? slow.promise : feedFor(request);
    const { context, page } = await openPage({ path: '/?q=slow' });
    try {
      await waitForState(page, 'loading');
      await applyKeyword(page, 'fast');
      assert.equal(await page.locator('h1').innerText(), 'Example Publication');
      slow.resolve(
        populatedFeed({
          publication: { ...publication, name: 'Stale Publication' },
        }),
      );
      await flushBrowser(page);
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
    const delayed = new Map<string, Deferred<PublicFeed | undefined>[]>();
    outcome = (request) => {
      const q = request.keywordQuery;
      if (q === 'slow' || q === 'alpha') {
        const pending = deferred<PublicFeed | undefined>();
        const pendingForQuery = delayed.get(q) ?? [];
        pendingForQuery.push(pending);
        delayed.set(q, pendingForQuery);
        return pending.promise;
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
      delayed.get('slow')?.[0]?.resolve(
        populatedFeed({
          publication: { ...publication, name: 'Stale Reset' },
        }),
      );
      await flushBrowser(page);
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
      for (const pending of delayed.get('alpha') ?? []) {
        pending.resolve(
          populatedFeed({
            publication: { ...publication, name: 'Stale History' },
          }),
        );
      }
      await flushBrowser(page);
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
      routeLogo?: (route: Route) => Promise<void>;
      controlledFetch?: boolean;
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
    if (options.controlledFetch === true) await installControlledFetch(page);
    const apiRequestUrls: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/feed')
        apiRequestUrls.push(`${url.pathname}${url.search}`);
    });
    if (options.routeApi !== undefined)
      await page.route('**/api/feed**', options.routeApi);
    if (options.routeLogo !== undefined)
      await page.route('**/publication-logo.svg', options.routeLogo);
    const response = await page.goto(
      `http://${webServer.host}:${webServer.port}${options.path ?? '/'}`,
    );
    assert.equal(response?.status(), 200);
    return { context, page, apiRequestUrls };
  }
});

async function applyKeyword(page: Page, value: string): Promise<void> {
  await page.locator('[data-discovery-keyword]').fill(value);
  await submitDiscovery(page);
  await waitForState(page, 'populated');
}

async function submitDiscovery(page: Page): Promise<void> {
  await page
    .locator('[data-discovery-form]')
    .evaluate((form) => (form as HTMLFormElement).requestSubmit());
}

async function assertPendingBranding(
  page: Page,
  expected: Readonly<{
    name: string;
    description: string;
    accentColor: string;
  }>,
): Promise<void> {
  await waitForState(page, 'loading');
  assert.equal(
    await page.locator('[data-feed-status]').innerText(),
    'Loading the latest headlines.',
  );
  assert.equal(
    await page.locator('[data-publication-name]').innerText(),
    expected.name,
  );
  assert.equal(
    await page.locator('[data-publication-description]').innerText(),
    expected.description,
  );
  assert.equal(
    await page
      .locator('[data-publication-masthead]')
      .evaluate((element) =>
        element.style.getPropertyValue('--publication-accent'),
      ),
    expected.accentColor,
  );
  assert.equal(await page.title(), `${expected.name} | News feed`);
  assert.equal(await page.locator('.feed-row').count(), 0);
}

async function assertCurrentBranding(page: Page, name: string): Promise<void> {
  assert.equal(
    await page.locator('[data-feed-content]').getAttribute('data-state'),
    'populated',
  );
  assert.equal(await page.locator('[data-publication-name]').innerText(), name);
  assert.equal(
    await page.locator('[data-publication-description]').innerText(),
    brandedPublication.description,
  );
  assert.equal(
    await page
      .locator('[data-publication-masthead]')
      .evaluate((element) =>
        element.style.getPropertyValue('--publication-accent'),
      ),
    brandedPublication.accentColor,
  );
  assert.equal(await page.title(), `${name} | News feed`);
}

function waitForState(page: Page, state: string): Promise<unknown> {
  return page.waitForSelector(`[data-feed-content][data-state="${state}"]`);
}

function waitForRowCount(page: Page, count: number): Promise<unknown> {
  return page.waitForFunction(
    (expectedCount) =>
      document.querySelectorAll('.feed-row').length === expectedCount,
    count,
  );
}

function waitForHeadlines(
  page: Page,
  expectedHeadlines: readonly string[],
): Promise<unknown> {
  return page.waitForFunction((expected) => {
    const headlines = Array.from(
      document.querySelectorAll('.feed-headline-link'),
      (link) => link.textContent,
    );
    return JSON.stringify(headlines) === JSON.stringify(expected);
  }, expectedHeadlines);
}

function waitForPaginationFailure(page: Page): Promise<unknown> {
  return page.waitForFunction(() => {
    const error = document.querySelector('[data-feed-pagination-error]');
    const button = document.querySelector('[data-feed-load-more]');
    return (
      error instanceof HTMLElement &&
      !error.hidden &&
      button instanceof HTMLButtonElement &&
      !button.disabled
    );
  });
}

async function flushBrowser(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function installControlledFetch(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const requests: unknown[] = [];
    (
      globalThis as typeof globalThis & {
        __publicFeedControlledFetchRequests?: unknown[];
      }
    ).__publicFeedControlledFetchRequests = requests;
    globalThis.fetch = (input) =>
      new Promise((resolve, reject) => {
        requests.push({
          url: typeof input === 'string' ? input : input.toString(),
          resolve,
          reject,
        });
      });
  });
}

function waitForControlledFetchCount(
  page: Page,
  expectedCount: number,
): Promise<unknown> {
  return page.waitForFunction((count) => {
    const requests = (
      globalThis as typeof globalThis & {
        __publicFeedControlledFetchRequests?: unknown[];
      }
    ).__publicFeedControlledFetchRequests;
    return requests?.length === count;
  }, expectedCount);
}

async function resolveControlledFetch(
  page: Page,
  requestIndex: number,
  body: unknown,
  status = 200,
): Promise<void> {
  await page.evaluate(
    ({ index, responseBody, responseStatus }) => {
      const requests = (
        globalThis as typeof globalThis & {
          __publicFeedControlledFetchRequests?: unknown[];
        }
      ).__publicFeedControlledFetchRequests as
        | {
            resolve?(response: Response): void;
          }[]
        | undefined;
      const request = requests?.[index];
      if (request?.resolve === undefined) {
        throw new Error('Missing controlled fetch request.');
      }
      request.resolve(
        new Response(JSON.stringify(responseBody), {
          status: responseStatus,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    },
    { index: requestIndex, responseBody: body, responseStatus: status },
  );
}

async function rejectControlledFetch(
  page: Page,
  requestIndex: number,
): Promise<void> {
  await page.evaluate((index) => {
    const requests = (
      globalThis as typeof globalThis & {
        __publicFeedControlledFetchRequests?: unknown[];
      }
    ).__publicFeedControlledFetchRequests as
      | {
          reject?(error: Error): void;
        }[]
      | undefined;
    const request = requests?.[index];
    if (request?.reject === undefined) {
      throw new Error('Missing controlled fetch request.');
    }
    request.reject(new Error('Controlled fetch failure.'));
  }, requestIndex);
}
