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
import type { PublicFeed } from '../../src/public-feed/repository.ts';

const publication = Object.freeze({
  name: 'Example Publication',
});

function populatedFeed(overrides: Partial<PublicFeed> = {}): PublicFeed {
  return Object.freeze({
    publication,
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

describe('Public feed page browser behavior', () => {
  let browser: Browser;
  let webServer: WebServer;
  let outcome: PublicFeed | undefined | Error | Promise<PublicFeed | undefined>;

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
            const current = outcome;
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

  it('keeps loading visible until the canonical API response resolves', async () => {
    let resolveFeed: ((feed: PublicFeed | undefined) => void) | undefined;
    outcome = new Promise<PublicFeed | undefined>((resolve) => {
      resolveFeed = resolve;
    });
    const { context, page, apiRequestPaths } = await openPage();
    try {
      await waitForState(page, 'loading');
      assert.equal(
        await page.locator('[data-feed-status]').innerText(),
        'Loading the latest headlines.',
      );
      assert.equal(await page.locator('.feed-row').count(), 0);

      resolveFeed?.(populatedFeed());
      await waitForState(page, 'populated');
      assert.equal(await page.locator('.feed-row').count(), 2);
      assert.deepEqual(apiRequestPaths, ['/api/feed']);
    } finally {
      await context.close();
    }
  });

  it('renders Publication name and server ordering into usable desktop Date, Headline, Source columns', async () => {
    outcome = populatedFeed();
    const { context, page } = await openPage({
      viewport: { width: 1440, height: 900 },
    });
    try {
      await waitForState(page, 'populated');
      assert.equal(await page.title(), 'Example Publication | News feed');
      assert.equal(await page.locator('h1').innerText(), 'Example Publication');
      assert.deepEqual(
        await page.locator('.feed-headline-link').allTextContents(),
        ['Newest headline', 'Older headline'],
      );
      assert.deepEqual(
        await page.locator('.feed-column-headings span').allTextContents(),
        ['Date', 'Headline', 'Source'],
      );
      assert.equal(
        await page
          .locator('.feed-row')
          .first()
          .evaluate((element) => getComputedStyle(element).display),
        'grid',
      );
      assert.equal(
        await page.locator('.feed-date time').first().innerText(),
        'AUG 6, 2026',
      );
      assert.equal(
        await page
          .locator('.feed-source > span:not(.feed-field-label)')
          .first()
          .innerText(),
        'First Source',
      );
    } finally {
      await context.close();
    }
  });

  it('renders an empty public Publication with its descriptive settings', async () => {
    outcome = Object.freeze({ publication, items: Object.freeze([]) });
    const { context, page } = await openPage();
    try {
      await waitForState(page, 'empty');
      assert.equal(await page.locator('h1').innerText(), 'Example Publication');
      assert.equal(
        await page.locator('[data-feed-status]').innerText(),
        'There are no recent headlines yet.',
      );
      assert.equal(await page.locator('.feed-row').count(), 0);
    } finally {
      await context.close();
    }
  });

  it('uses one generic unavailable page state regardless of the temporary shell path segment', async () => {
    outcome = undefined;
    const unavailableStates: Array<{
      readonly text: string;
      readonly markup: string;
    }> = [];
    for (const shellSegment of ['first-shell', 'second-shell']) {
      const { context, page } = await openPage({ shellSegment });
      try {
        await waitForState(page, 'unavailable');
        unavailableStates.push({
          text: await page.locator('main').innerText(),
          markup: await page.locator('main').innerHTML(),
        });
      } finally {
        await context.close();
      }
    }
    assert.deepEqual(unavailableStates[0], unavailableStates[1]);
    assert.match(unavailableStates[0]?.text ?? '', /News feed/u);
    assert.match(
      unavailableStates[0]?.text ?? '',
      /This publication is unavailable\./u,
    );
  });

  it('shows a bounded generic error without backend details', async () => {
    const secret = 'postgresql://user:PAGE_SECRET@database/private';
    outcome = new Error(`Database failure ${secret}`);
    const { context, page } = await openPage();
    try {
      await waitForState(page, 'error');
      const text = await page.locator('main').innerText();
      assert.match(text, /temporarily unavailable/u);
      assert.doesNotMatch(text, /PAGE_SECRET|postgresql|database/u);
    } finally {
      await context.close();
    }
  });

  it('renders untrusted text inertly and uses the exact original publisher URL', async () => {
    const markup = '<img src=x onerror="globalThis.feedXss = true">';
    const originalUrl =
      'https://publisher.example.test/original?preserve=exact';
    outcome = populatedFeed({
      publication: { ...publication, name: markup },
      items: Object.freeze([
        Object.freeze({
          ...populatedFeed().items[0]!,
          headline: markup,
          sourceName: markup,
          originalUrl,
        }),
      ]),
    });
    const { context, page } = await openPage();
    try {
      await waitForState(page, 'populated');
      assert.equal(await page.locator('h1').innerText(), markup);
      assert.equal(
        await page.locator('.feed-headline-link').innerText(),
        markup,
      );
      assert.equal(
        await page
          .locator('.feed-source > span:not(.feed-field-label)')
          .innerText(),
        markup,
      );
      assert.equal(await page.locator('img').count(), 0);
      assert.equal(await page.evaluate(() => 'feedXss' in globalThis), false);
      assert.equal(
        await page.locator('.feed-headline-link').getAttribute('href'),
        originalUrl,
      );
    } finally {
      await context.close();
    }
  });

  it('uses UTC date rendering, safely intercepts external navigation, and preserves keyboard focus', async () => {
    outcome = populatedFeed();
    const { context, page } = await openPage({
      timezoneId: 'America/Los_Angeles',
    });
    try {
      await waitForState(page, 'populated');
      assert.equal(
        await page.locator('.feed-date time').first().innerText(),
        'AUG 6, 2026',
      );

      const link = page.locator('.feed-headline-link').first();
      await page.keyboard.press('Tab');
      assert.equal(
        await link.evaluate((element) => document.activeElement === element),
        true,
      );
      assert.notEqual(
        await link.evaluate(
          (element) => getComputedStyle(element).outlineStyle,
        ),
        'none',
      );

      const originalUrl = populatedFeed().items[0]!.originalUrl;
      let resolveIntercepted: ((url: string) => void) | undefined;
      const intercepted = new Promise<string>((resolve) => {
        resolveIntercepted = resolve;
      });
      await page.route('https://publisher.example.test/**', async (route) => {
        resolveIntercepted?.(route.request().url());
        await route.abort();
      });
      await link.click({ noWaitAfter: true });
      assert.equal(await intercepted, originalUrl);
    } finally {
      await context.close();
    }
  });

  it('uses a stacked mobile item layout without feed-caused horizontal overflow', async () => {
    outcome = populatedFeed();
    const { context, page } = await openPage({
      viewport: { width: 390, height: 844 },
    });
    try {
      await waitForState(page, 'populated');
      assert.equal(
        await page
          .locator('.feed-column-headings')
          .evaluate((element) => getComputedStyle(element).display),
        'none',
      );
      assert.equal(
        await page
          .locator('.feed-row')
          .first()
          .evaluate((element) => getComputedStyle(element).display),
        'block',
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
      const rowText = await page.locator('.feed-row').first().innerText();
      assert.match(rowText, /AUG 6, 2026/u);
      assert.match(rowText, /First Source/iu);
      assert.match(rowText, /Newest headline/u);
    } finally {
      await context.close();
    }
  });

  async function openPage(
    options: Readonly<{
      shellSegment?: string;
      timezoneId?: string;
      viewport?: { readonly width: number; readonly height: number };
    }> = {},
  ): Promise<{
    readonly context: BrowserContext;
    readonly page: Page;
    readonly apiRequestPaths: string[];
  }> {
    const context = await browser.newContext({
      ...(options.timezoneId === undefined
        ? {}
        : { timezoneId: options.timezoneId }),
      ...(options.viewport === undefined ? {} : { viewport: options.viewport }),
    });
    const page = await context.newPage();
    const apiRequestPaths: string[] = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith('/api/')) apiRequestPaths.push(pathname);
    });
    const shellSegment = options.shellSegment ?? 'current';
    const response = await page.goto(
      `http://${webServer.host}:${webServer.port}/publications/${shellSegment}`,
    );
    assert.equal(response?.status(), 200);
    return { context, page, apiRequestPaths };
  }
});

function waitForState(page: Page, state: string): Promise<unknown> {
  return page.waitForSelector(`[data-feed-content][data-state="${state}"]`);
}
