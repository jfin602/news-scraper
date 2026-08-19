import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromium, type Browser, type Page } from 'playwright';

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
  description: 'A publication description.',
  logoPath: null,
  accentColor: '#1A2B3C',
  presentationTimezone: 'America/Chicago',
});
const choices = Object.freeze({
  source: Object.freeze([
    { configKey: 'first_source', displayName: 'First Source' },
    { configKey: 'second_source', displayName: 'Second Source' },
  ]),
  category: Object.freeze([
    { configKey: 'industry_news', displayName: 'Industry news' },
    { configKey: 'craft', displayName: 'Craft' },
  ]),
});
type Outcome =
  | PublicFeed
  | undefined
  | Error
  | ((request: PublicDiscoveryRequest) => PublicFeed | undefined | Error);
let base = '';

function item(overrides: Partial<PublicFeedItem> = {}): PublicFeedItem {
  return Object.freeze({
    articleId: '20000000-0000-4000-8000-000000000001',
    effectiveFeedDate: new Date('2026-08-10T00:30:00.000Z'),
    feedDateSource: 'published_at',
    headline: 'Result for all',
    sourceName: 'First Source',
    originalUrl: 'https://publisher.example.test/all',
    ...overrides,
  });
}
function feed(
  request: PublicDiscoveryRequest = {},
  overrides: Partial<PublicFeed> = {},
): PublicFeed {
  const suffix =
    request.keywordQuery ??
    request.sourceConfigKey ??
    request.categoryConfigKey ??
    'all';
  return Object.freeze({
    publication,
    sourceChoices: choices.source,
    categoryChoices: choices.category,
    nextCursor: null,
    items: Object.freeze([
      item({
        headline: `Result for ${suffix}`,
        originalUrl: `https://publisher.example.test/${suffix}`,
      }),
    ]),
    ...overrides,
  });
}
function query(request: PublicDiscoveryRequest): {
  q: string | null;
  source: string | null;
  category: string | null;
} {
  return {
    q: request.keywordQuery ?? null,
    source: request.sourceConfigKey ?? null,
    category: request.categoryConfigKey ?? null,
  };
}
function response(value: PublicFeed, request: PublicDiscoveryRequest = {}) {
  return {
    publication: value.publication,
    discovery: {
      query: query(request),
      sources: value.sourceChoices ?? [],
      categories: value.categoryChoices ?? [],
    },
    items: value.items.map((entry) => ({
      ...entry,
      effectiveFeedDate: entry.effectiveFeedDate.toISOString(),
    })),
    nextCursor: value.nextCursor ?? null,
  };
}
function cursor(
  criteria: PublicDiscoveryCriteria = {},
  id = '20000000-0000-4000-8000-000000000002',
) {
  return encodePublicDiscoveryCursor(criteria, {
    effectiveFeedDate: '2026-08-09T00:00:00.000001Z',
    firstSeenAt: '2026-08-09T00:00:00.000001Z',
    articleId: id,
  });
}

describe('Public feed SSR and progressive enhancement', () => {
  let browser: Browser;
  let server: WebServer;
  let outcome: Outcome = feed;
  before(async () => {
    browser = await chromium.launch({ headless: true });
    activeBrowser = browser;
    server = await startWebServer(
      createWebApp({
        readiness: { checkReady: async () => true },
        publicFeed: {
          read: async (request) => {
            const value =
              typeof outcome === 'function' ? outcome(request) : outcome;
            if (value instanceof Error) throw value;
            return value;
          },
        },
      }),
      { host: '127.0.0.1', port: 0 },
    );
    base = `http://${server.host}:${server.port}`;
  });
  after(async () => {
    await server.close();
    await browser.close();
  });

  it('starts with stable, useful SSR publication and Article DOM without an API request or hydration replacement', async () => {
    outcome = feed;
    const { context, page, requests } = await open('/');
    try {
      const firstRow = await page
        .locator('[data-feed-item-id]')
        .first()
        .evaluate((node) => {
          (node as HTMLElement).dataset.ssrNode = 'kept';
          return node;
        });
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-feed-content]')
            ?.getAttribute('data-state') === 'populated',
      );
      assert.equal(
        await page.locator('[data-publication-name]').innerText(),
        publication.name,
      );
      assert.equal(await page.title(), `${publication.name} | News feed`);
      assert.equal(
        await page
          .locator('[data-feed-item-id]')
          .first()
          .getAttribute('data-ssr-node'),
        'kept',
      );
      assert.deepEqual(requests, []);
      assert.ok(firstRow);
    } finally {
      await context.close();
    }
  });

  it('renders presentation safely, including early broken-logo fallback, absent options, hostile text, and calendar timezone parity', async () => {
    const hostile = '<img src=x onerror=globalThis.xss=true>';
    outcome = feed(
      {},
      {
        publication: {
          ...publication,
          name: hostile,
          description: hostile,
          logoPath: '/missing.svg',
          presentationTimezone: 'America/Los_Angeles',
        },
        sourceChoices: Object.freeze([
          { configKey: 'first_source', displayName: hostile },
        ]),
        categoryChoices: Object.freeze([
          { configKey: 'industry_news', displayName: hostile },
        ]),
        items: Object.freeze([
          item({
            headline: hostile,
            sourceName: hostile,
            originalUrl: 'https://publisher.example.test/exact?x=1',
            effectiveFeedDate: new Date('2026-08-10T00:30:00Z'),
          }),
        ]),
      },
    );
    const { context, page, requests } = await open('/', {
      timezoneId: 'Asia/Tokyo',
    });
    try {
      await page.waitForFunction(
        () => document.querySelector('.publication-logo-image') === null,
      );
      assert.equal(await page.locator('h1').innerText(), hostile);
      assert.equal(await page.locator('img').count(), 0);
      assert.equal(await page.evaluate(() => 'xss' in globalThis), false);
      assert.equal(
        await page.locator('.feed-headline-link').getAttribute('href'),
        'https://publisher.example.test/exact?x=1',
      );
      assert.equal(
        await page.locator('.feed-date time').innerText(),
        'AUG 9, 2026',
      );
      assert.deepEqual(requests, []);
    } finally {
      await context.close();
    }
    outcome = feed(
      {},
      {
        publication: {
          ...publication,
          description: null,
          logoPath: null,
          accentColor: null,
          presentationTimezone: null,
        },
      },
    );
    const next = await open('/');
    try {
      assert.equal(
        await next.page.locator('[data-publication-description]').isHidden(),
        true,
      );
      assert.equal(
        await next.page.locator('.publication-logo-image').count(),
        0,
      );
      assert.equal(
        await next.page.locator('.feed-date time').innerText(),
        'AUG 10, 2026',
      );
    } finally {
      await next.context.close();
    }
  });

  it('keeps desktop and mobile feed controls coherent, focusable, and inside the viewport', async () => {
    outcome = feed(
      {},
      {
        nextCursor: cursor(),
        items: Object.freeze([
          item({
            headline:
              'A deliberately very long headline which wraps without horizontal overflow',
            sourceName: 'A deliberately very long source name',
          }),
        ]),
      },
    );
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      const { context, page } = await open('/', { viewport });
      try {
        const link = page.locator('.feed-headline-link');
        await link.focus();
        assert.notEqual(
          await link.evaluate((node) => getComputedStyle(node).outlineStyle),
          'none',
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        assert.equal(
          await page
            .locator('.feed-row')
            .evaluate((node) => getComputedStyle(node).display),
          'grid',
        );
      } finally {
        await context.close();
      }
    }
  });

  it('uses SSR for direct criteria and refresh, and enhanced Search uses deterministic first-page URLs', async () => {
    outcome = feed;
    const { context, page, requests } = await open(
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
      assert.deepEqual(requests, []);
      await page.reload();
      assert.deepEqual(requests, []);
      await page.locator('[data-discovery-keyword]').fill('query');
      await page
        .locator('[data-discovery-source]')
        .selectOption('second_source');
      await page.locator('[data-discovery-category]').selectOption('craft');
      await submit(page);
      await headlines(page, ['Result for query']);
      assert.equal(
        requests[0],
        '/api/feed?q=query&source=second_source&category=craft',
      );
      assert.equal(
        new URL(page.url()).search,
        '?q=query&source=second_source&category=craft',
      );
    } finally {
      await context.close();
    }
  });

  it('supports independent Source/Category, Reset, and Back/Forward using first pages without cursor URLs', async () => {
    outcome = feed;
    const { context, page, requests } = await open('/');
    try {
      await page
        .locator('[data-discovery-source]')
        .selectOption('first_source');
      await submit(page);
      await headlines(page, ['Result for first_source']);
      assert.equal(requests[0], '/api/feed?source=first_source');
      await page.locator('[data-discovery-source]').selectOption('');
      await page.locator('[data-discovery-category]').selectOption('craft');
      await submit(page);
      await headlines(page, ['Result for craft']);
      assert.equal(requests[1], '/api/feed?category=craft');
      await page.locator('[data-discovery-reset]').click();
      await headlines(page, ['Result for all']);
      assert.equal(requests[2], '/api/feed');
      assert.equal(
        new URL(page.url()).pathname + new URL(page.url()).search,
        '/',
      );
      await page.goBack();
      await headlines(page, ['Result for craft']);
      assert.equal(requests[3], '/api/feed?category=craft');
      assert.equal(new URL(page.url()).searchParams.has('cursor'), false);
      await page.goForward();
      await headlines(page, ['Result for all']);
      assert.equal(requests[4], '/api/feed');
    } finally {
      await context.close();
    }
  });

  it('uses root status semantics directly and rejects malformed/cursor root URLs without client reconstruction', async () => {
    outcome = feed({}, { items: Object.freeze([]) });
    let opened = await open('/?q=empty');
    try {
      assert.equal(
        await opened.page
          .locator('[data-feed-content]')
          .getAttribute('data-state'),
        'empty',
      );
      assert.deepEqual(opened.requests, []);
    } finally {
      await opened.context.close();
    }
    outcome = undefined;
    opened = await open('/');
    try {
      assert.equal(opened.response.status(), 404);
      assert.match(
        await opened.page.locator('main').innerText(),
        /unavailable/i,
      );
      assert.deepEqual(opened.requests, []);
    } finally {
      await opened.context.close();
    }
    outcome = new Error('postgresql://secret');
    opened = await open('/');
    try {
      assert.equal(opened.response.status(), 503);
      assert.doesNotMatch(
        await opened.page.locator('main').innerText(),
        /secret|postgresql/i,
      );
    } finally {
      await opened.context.close();
    }
    outcome = feed;
    for (const path of ['/?q=one&q=two', '/?cursor=x', '/?%63ursor=x']) {
      opened = await open(path);
      try {
        assert.equal(opened.response.status(), 400);
        assert.deepEqual(opened.requests, []);
      } finally {
        await opened.context.close();
      }
    }
  });

  it('retains resolved branding while an enhanced first page is pending and clears it for owned 404', async () => {
    outcome = feed(
      {},
      { publication: { ...publication, name: 'Branded', logoPath: null } },
    );
    const { context, page } = await open('/', { controlled: true });
    try {
      await page.locator('[data-discovery-keyword]').fill('slow');
      await submit(page);
      await waitRequests(page, 1);
      assert.equal(
        await page.locator('[data-publication-name]').innerText(),
        'Branded',
      );
      assert.equal(await page.locator('.feed-row').count(), 0);
      await resolve(page, 0, { error: 'not_found' }, 404);
      await state(page, 'unavailable');
      assert.equal(
        await page.locator('[data-publication-masthead]').isHidden(),
        true,
      );
    } finally {
      await context.close();
    }
  });

  it('fails malformed enhanced payloads safely and never lets stale first-page outcomes win', async () => {
    outcome = feed;
    const { context, page } = await open('/', { controlled: true });
    try {
      await page.locator('[data-discovery-keyword]').fill('bad');
      await submit(page);
      await waitRequests(page, 1);
      await resolve(page, 0, { publication: null });
      await state(page, 'error');
      await page.locator('[data-discovery-keyword]').fill('old');
      await submit(page);
      await waitRequests(page, 2);
      await page.locator('[data-discovery-keyword]').fill('new');
      await submit(page);
      await waitRequests(page, 3);
      await resolve(
        page,
        2,
        response(feed({ keywordQuery: 'new' }), { keywordQuery: 'new' }),
      );
      await headlines(page, ['Result for new']);
      await resolve(
        page,
        1,
        response(feed({ keywordQuery: 'old' }), { keywordQuery: 'old' }),
      );
      await flush(page);
      await headlines(page, ['Result for new']);
    } finally {
      await context.close();
    }
  });

  it('continues from SSR cursor with criteria, server order, inert text, and no root cursor depth', async () => {
    const criteria = { keywordQuery: 'alpha' };
    const firstCursor = cursor(criteria);
    const older = item({
      articleId: '30000000-0000-4000-8000-000000000001',
      headline: '<b>Older</b>',
      originalUrl: 'https://publisher.example.test/older',
      effectiveFeedDate: new Date('2026-08-08T00:30:00Z'),
    });
    outcome = (request) =>
      request.cursorPosition === undefined
        ? feed(criteria, { nextCursor: firstCursor })
        : feed(criteria, { items: Object.freeze([older]), nextCursor: null });
    const { context, page, requests } = await open('/?q=alpha');
    try {
      await page.locator('[data-feed-load-more]').click();
      await headlines(page, ['Result for alpha', '<b>Older</b>']);
      assert.match(requests[0] ?? '', /^\/api\/feed\?q=alpha&cursor=/u);
      assert.equal(new URL(page.url()).search, '?q=alpha');
      assert.equal(await page.locator('b').count(), 0);
      assert.equal(
        await page.locator('.feed-headline-link').nth(1).getAttribute('href'),
        older.originalUrl,
      );
    } finally {
      await context.close();
    }
  });

  it('guards continuation duplicate activation, malformed pages, failures, retry, and replacement cursors locally', async () => {
    const first = cursor();
    const second = cursor({}, '20000000-0000-4000-8000-000000000003');
    outcome = feed({}, { nextCursor: first });
    const { context, page } = await open('/', { controlled: true });
    try {
      await page.locator('[data-feed-load-more]').click();
      await page
        .locator('[data-feed-load-more]')
        .evaluate((button) => (button as HTMLButtonElement).click());
      await waitRequests(page, 1);
      assert.equal(
        await page.locator('[data-feed-load-more]').isDisabled(),
        true,
      );
      await resolve(
        page,
        0,
        response(feed({}, { items: Object.freeze([]), nextCursor: second })),
      );
      await page.waitForSelector('[data-feed-pagination-error]:not([hidden])');
      await page.waitForFunction(
        () =>
          !(
            document.querySelector(
              '[data-feed-load-more]',
            ) as HTMLButtonElement | null
          )?.disabled,
      );
      assert.equal(await page.locator('.feed-row').count(), 1);
      await page.locator('[data-feed-load-more]').click();
      await waitRequests(page, 2);
      await resolve(
        page,
        1,
        response(
          feed(
            {},
            {
              items: Object.freeze([
                item({
                  articleId: '30000000-0000-4000-8000-000000000001',
                  headline: 'Retry',
                }),
              ]),
              nextCursor: second,
            },
          ),
        ),
      );
      await headlines(page, ['Result for all', 'Retry']);
      await page.locator('[data-feed-load-more]').click();
      await waitRequests(page, 3);
      assert.match(await controlledUrl(page, 2), /cursor=/u);
      await resolve(
        page,
        2,
        response(
          feed(
            {},
            {
              items: Object.freeze([
                item({
                  articleId: '40000000-0000-4000-8000-000000000001',
                  headline: 'Final',
                }),
              ]),
              nextCursor: null,
            },
          ),
        ),
      );
      await headlines(page, ['Result for all', 'Retry', 'Final']);
      assert.equal(await page.locator('[data-feed-load-more]').count(), 0);
    } finally {
      await context.close();
    }
  });

  it('invalidates slow and abort-insensitive continuation outcomes across Apply, Reset, and history', async () => {
    const oldCursor = cursor();
    outcome = feed({}, { nextCursor: oldCursor });
    const { context, page } = await open('/', { controlled: true });
    try {
      await page.locator('[data-feed-load-more]').click();
      await waitRequests(page, 1);
      await page.locator('[data-discovery-keyword]').fill('new');
      await submit(page);
      await waitRequests(page, 2);
      await resolve(
        page,
        1,
        response(feed({ keywordQuery: 'new' }), { keywordQuery: 'new' }),
      );
      await headlines(page, ['Result for new']);
      await resolve(
        page,
        0,
        response(
          feed(
            {},
            {
              items: Object.freeze([
                item({
                  articleId: '30000000-0000-4000-8000-000000000001',
                  headline: 'stale',
                }),
              ]),
            },
          ),
        ),
      );
      await flush(page);
      await headlines(page, ['Result for new']);
      assert.equal(
        await page.locator('[data-feed-pagination-error]').count(),
        0,
      );
      await page.locator('[data-discovery-reset]').click();
      await waitRequests(page, 3);
      await resolve(page, 2, response(feed()));
      await headlines(page, ['Result for all']);
      await page.goBack();
      await waitRequests(page, 4);
      await resolve(
        page,
        3,
        response(feed({ keywordQuery: 'new' }), { keywordQuery: 'new' }),
      );
      await headlines(page, ['Result for new']);
    } finally {
      await context.close();
    }
  });

  it('uses a static reduced-motion enhanced loading state without overflow', async () => {
    outcome = feed;
    const { context, page } = await open('/', {
      controlled: true,
      reducedMotion: 'reduce',
      viewport: { width: 390, height: 844 },
    });
    try {
      await page.locator('[data-discovery-keyword]').fill('slow');
      await submit(page);
      await waitRequests(page, 1);
      await state(page, 'loading');
      assert.deepEqual(
        await page.locator('[data-feed-loading-indicator]').evaluate((node) => {
          const style = getComputedStyle(node);
          return {
            animationName: style.animationName,
            transitionDuration: style.transitionDuration,
          };
        }),
        { animationName: 'none', transitionDuration: '0s' },
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    } finally {
      await context.close();
    }
  });

  it('proves the no-JavaScript root, discovery form, Reset, links, and error matrix', async () => {
    outcome = feed;
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      for (const path of [
        '/',
        '/?q=needle',
        '/?source=first_source',
        '/?category=craft',
      ]) {
        const result = await page.goto(`${base}${path}`);
        assert.equal(result?.status(), 200);
        assert.equal(await page.locator('.feed-headline-link').count(), 1);
      }
      await page.goto(base);
      await page
        .locator('[data-discovery-source]')
        .selectOption('first_source');
      await Promise.all([
        page.waitForURL(/\?q=&source=first_source&category=$/u),
        page
          .locator('[data-discovery-form]')
          .evaluate((form) => (form as HTMLFormElement).requestSubmit()),
      ]);
      await page.locator('[data-discovery-category]').selectOption('craft');
      await Promise.all([
        page.waitForURL(/category=craft$/u),
        page
          .locator('[data-discovery-form]')
          .evaluate((form) => (form as HTMLFormElement).requestSubmit()),
      ]);
      await Promise.all([
        page.waitForURL(/\/$/u),
        page.locator('[data-discovery-reset]').click(),
      ]);
      assert.equal(await page.locator('[data-feed-load-more]').count(), 0);
      assert.equal(
        await page.locator('.feed-headline-link').getAttribute('href'),
        'https://publisher.example.test/all',
      );
      outcome = feed({}, { items: Object.freeze([]) });
      assert.equal((await page.goto(`${base}/?q=empty`))?.status(), 200);
      outcome = undefined;
      assert.equal((await page.goto(base))?.status(), 404);
      outcome = new Error('secret');
      assert.equal((await page.goto(base))?.status(), 503);
      assert.equal((await page.goto(`${base}/?cursor=x`))?.status(), 400);
    } finally {
      await context.close();
    }
  });
});

async function open(
  path: string,
  options: {
    timezoneId?: string;
    viewport?: { width: number; height: number };
    reducedMotion?: 'reduce';
    controlled?: boolean;
  } = {},
) {
  const context = await chromiumInstance().newContext({
    ...(options.timezoneId === undefined
      ? {}
      : { timezoneId: options.timezoneId }),
    ...(options.viewport === undefined ? {} : { viewport: options.viewport }),
    ...(options.reducedMotion === undefined
      ? {}
      : { reducedMotion: options.reducedMotion }),
  });
  const page = await context.newPage();
  if (options.controlled) await installControlledFetch(page);
  const requests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/feed')
      requests.push(`${url.pathname}${url.search}`);
  });
  const result = await page.goto(`${base}${path}`);
  if (result === null) throw new Error('Missing root response.');
  return { context, page, requests, response: result };
}
let activeBrowser: Browser | undefined;
function chromiumInstance(): Browser {
  if (activeBrowser === undefined) throw new Error('Browser unavailable.');
  return activeBrowser;
}
async function submit(page: Page) {
  await page
    .locator('[data-discovery-form]')
    .evaluate((form) => (form as HTMLFormElement).requestSubmit());
}
function state(page: Page, value: string) {
  return page.waitForSelector(`[data-feed-content][data-state="${value}"]`);
}
function headlines(page: Page, values: readonly string[]) {
  return page.waitForFunction(
    (expected) =>
      JSON.stringify(
        Array.from(
          document.querySelectorAll('.feed-headline-link'),
          (link) => link.textContent,
        ),
      ) === JSON.stringify(expected),
    values,
  );
}
function flush(page: Page) {
  return page.evaluate(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
function waitRequests(page: Page, count: number) {
  return page.waitForFunction(
    (expected) =>
      ((globalThis as typeof globalThis & { __feedRequests?: unknown[] })
        .__feedRequests?.length ?? 0) === expected,
    count,
  );
}
function controlledUrl(page: Page, index: number) {
  return page.evaluate(
    (requestIndex) =>
      String(
        (
          globalThis as typeof globalThis & {
            __feedRequests?: { url: string }[];
          }
        ).__feedRequests?.[requestIndex]?.url,
      ),
    index,
  );
}
async function installControlledFetch(page: Page) {
  await page.addInitScript(() => {
    const requests: {
      url: string;
      resolve: (response: Response) => void;
      reject: (reason?: unknown) => void;
    }[] = [];
    (
      globalThis as typeof globalThis & { __feedRequests?: typeof requests }
    ).__feedRequests = requests;
    globalThis.fetch = ((input: RequestInfo | URL) =>
      new Promise<Response>((resolve, reject) =>
        requests.push({
          url: typeof input === 'string' ? input : input.toString(),
          resolve,
          reject,
        }),
      )) as typeof fetch;
  });
}
async function resolve(page: Page, index: number, body: unknown, status = 200) {
  await page.evaluate(
    ({ index: requestIndex, body: value, status: code }) => {
      const request = (
        globalThis as typeof globalThis & {
          __feedRequests?: { resolve(response: Response): void }[];
        }
      ).__feedRequests?.[requestIndex];
      if (request === undefined) throw new Error('Missing controlled request.');
      request.resolve(
        new Response(JSON.stringify(value), {
          status: code,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    },
    { index, body, status },
  );
}
