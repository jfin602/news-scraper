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
import type {
  PublicFeed,
  PublicFeedItem,
} from '../../src/public-feed/repository.ts';

const storageKey = 'news-scraper.reader-theme';
const originalUrl =
  'https://publisher.example.test/original?preserve=theme-exact';
const article: PublicFeedItem = Object.freeze({
  articleId: '20000000-0000-4000-8000-000000000001',
  effectiveFeedDate: new Date('2026-08-06T00:30:00.000Z'),
  feedDateSource: 'published_at',
  headline: 'Theme-safe headline',
  sourceName: 'First Source',
  originalUrl,
});
const populatedFeed: PublicFeed = Object.freeze({
  publication: Object.freeze({
    name: 'Example Publication',
    description: null,
    logoPath: null,
    accentColor: null,
  }),
  sourceChoices: Object.freeze([
    Object.freeze({ configKey: 'first_source', displayName: 'First Source' }),
  ]),
  categoryChoices: Object.freeze([
    Object.freeze({ configKey: 'industry_news', displayName: 'Industry news' }),
  ]),
  items: Object.freeze([article]),
  nextCursor: null,
});

type FeedOutcome = PublicFeed | undefined | Error;

describe('Public feed reader theme browser behavior', () => {
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
    outcome = populatedFeed;
    webServer = await startWebServer(
      createWebApp({
        readiness: { checkReady: async () => true },
        publicFeed: {
          async read() {
            if (outcome instanceof Error) throw outcome;
            return outcome;
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

  it('defaults to System and computes the light system presentation', async () => {
    outcome = populatedFeed;
    const { context, page } = await openThemePage({ colorScheme: 'light' });
    try {
      await waitForState(page, 'populated');
      await assertTheme(page, {
        selection: 'system',
        effective: 'light',
        forced: null,
        pageBackground: 'rgb(247, 244, 238)',
        textColor: 'rgb(36, 33, 30)',
        controlBackground: 'rgb(255, 253, 248)',
        colorScheme: 'light',
      });
      assert.equal(await selectedTheme(page), 'system');
      assert.equal(await storedTheme(page), null);
    } finally {
      await context.close();
    }
  });

  it('defaults to System and computes the dark system presentation', async () => {
    outcome = populatedFeed;
    const { context, page } = await openThemePage({ colorScheme: 'dark' });
    try {
      await waitForState(page, 'populated');
      await assertTheme(page, {
        selection: 'system',
        effective: 'dark',
        forced: null,
        pageBackground: 'rgb(27, 26, 24)',
        textColor: 'rgb(244, 239, 231)',
        controlBackground: 'rgb(41, 38, 34)',
        colorScheme: 'dark',
      });
      assert.equal(await selectedTheme(page), 'system');
    } finally {
      await context.close();
    }
  });

  it('follows live system changes without reload while explicit modes stay fixed', async () => {
    outcome = populatedFeed;
    const { context, page } = await openThemePage({ colorScheme: 'light' });
    try {
      await waitForState(page, 'populated');
      await page.emulateMedia({ colorScheme: 'dark' });
      await waitForEffectiveTheme(page, 'dark');
      assert.equal(await bodyBackground(page), 'rgb(27, 26, 24)');

      await chooseTheme(page, 'light');
      await page.emulateMedia({ colorScheme: 'dark' });
      await assertThemeMode(page, 'light', 'light', 'light');
      assert.equal(await bodyBackground(page), 'rgb(247, 244, 238)');

      await chooseTheme(page, 'system');
      await assertThemeMode(page, 'system', 'dark', null);
      assert.equal(await bodyBackground(page), 'rgb(27, 26, 24)');
    } finally {
      await context.close();
    }
  });

  it('forces Light against a dark system and persists it across reload', async () => {
    outcome = populatedFeed;
    const { context, page } = await openThemePage({ colorScheme: 'dark' });
    try {
      await waitForState(page, 'populated');
      await chooseTheme(page, 'light');
      await assertThemeMode(page, 'light', 'light', 'light');
      assert.equal(await storedTheme(page), 'light');
      await page.reload();
      await waitForState(page, 'populated');
      await assertThemeMode(page, 'light', 'light', 'light');
      assert.equal(await bodyBackground(page), 'rgb(247, 244, 238)');
    } finally {
      await context.close();
    }
  });

  it('forces Dark against a light system, persists it, then System removes the override', async () => {
    outcome = populatedFeed;
    const { context, page } = await openThemePage({ colorScheme: 'light' });
    try {
      await waitForState(page, 'populated');
      await chooseTheme(page, 'dark');
      await assertThemeMode(page, 'dark', 'dark', 'dark');
      assert.equal(await storedTheme(page), 'dark');
      await page.reload();
      await waitForState(page, 'populated');
      await assertThemeMode(page, 'dark', 'dark', 'dark');
      assert.equal(await bodyBackground(page), 'rgb(27, 26, 24)');

      await page.emulateMedia({ colorScheme: 'dark' });
      await chooseTheme(page, 'system');
      await assertThemeMode(page, 'system', 'dark', null);
      assert.equal(await storedTheme(page), null);
      await page.emulateMedia({ colorScheme: 'light' });
      await waitForEffectiveTheme(page, 'light');
      assert.equal(await bodyBackground(page), 'rgb(247, 244, 238)');
    } finally {
      await context.close();
    }
  });

  it('removes a corrupt stored value and starts both theme and feed safely', async () => {
    outcome = populatedFeed;
    const { context, page } = await openThemePage({
      colorScheme: 'dark',
      storedValue: 'sepia',
    });
    try {
      await waitForState(page, 'populated');
      await assertThemeMode(page, 'system', 'dark', null);
      assert.equal(await selectedTheme(page), 'system');
      assert.equal(await storedTheme(page), null);
      assert.equal(await page.locator('.feed-row').count(), 1);
    } finally {
      await context.close();
    }
  });

  it('survives unavailable storage for reads, writes, removals, reload, and feed startup', async () => {
    outcome = populatedFeed;
    const { context, page } = await openThemePage({
      colorScheme: 'dark',
      unavailableStorage: true,
    });
    try {
      await waitForState(page, 'populated');
      await assertThemeMode(page, 'system', 'dark', null);
      await chooseTheme(page, 'light');
      await assertThemeMode(page, 'light', 'light', 'light');
      await chooseTheme(page, 'system');
      await assertThemeMode(page, 'system', 'dark', null);
      await page.reload();
      await waitForState(page, 'populated');
      await assertThemeMode(page, 'system', 'dark', null);
      assert.equal(await page.locator('.feed-row').count(), 1);
    } finally {
      await context.close();
    }
  });

  it('supports native keyboard selection without changing discovery, history, requests, or Articles', async () => {
    outcome = populatedFeed;
    const { context, page, apiRequestUrls } = await openThemePage({
      colorScheme: 'light',
      path: '/?q=contract&source=first_source&category=industry_news',
    });
    try {
      await waitForState(page, 'populated');
      const originalLocation = await locationPath(page);
      const originalHistoryLength = await page.evaluate(() => history.length);
      const originalControls = await discoveryValues(page);
      const originalArticles = await articleValues(page);

      await page.locator('[data-theme-option][value="system"]').focus();
      await page.keyboard.press('ArrowRight');
      await assertThemeMode(page, 'light', 'light', 'light');
      assert.equal(await selectedTheme(page), 'light');
      await page.keyboard.press('ArrowRight');
      await assertThemeMode(page, 'dark', 'dark', 'dark');
      assert.equal(await selectedTheme(page), 'dark');

      assert.equal(await locationPath(page), originalLocation);
      assert.equal(
        await page.evaluate(() => history.length),
        originalHistoryLength,
      );
      assert.deepEqual(await discoveryValues(page), originalControls);
      assert.deepEqual(await articleValues(page), originalArticles);
      assert.deepEqual(apiRequestUrls, [
        '/api/feed?q=contract&source=first_source&category=industry_news',
      ]);
    } finally {
      await context.close();
    }
  });

  it('keeps Dark coherent in every public state and preserves UTC dates and exact links', async () => {
    outcome = populatedFeed;
    const { context, page } = await openThemePage({
      colorScheme: 'light',
      storedValue: 'dark',
    });
    try {
      await waitForState(page, 'populated');
      await assertDarkState(page);
      assert.equal(
        await page.locator('.feed-date time').innerText(),
        'AUG 6, 2026',
      );
      assert.equal(
        await page.locator('.feed-headline-link').getAttribute('href'),
        originalUrl,
      );

      outcome = Object.freeze({ ...populatedFeed, items: Object.freeze([]) });
      await page.reload();
      await waitForState(page, 'empty');
      await assertDarkState(page);

      await page.goto(
        `http://${webServer.host}:${webServer.port}/?q=one&q=two`,
      );
      await waitForState(page, 'invalid');
      await assertDarkState(page);

      outcome = undefined;
      await page.goto(`http://${webServer.host}:${webServer.port}/`);
      await waitForState(page, 'unavailable');
      await assertDarkState(page);

      outcome = new Error('private dependency detail');
      await page.reload();
      await waitForState(page, 'error');
      await assertDarkState(page);
    } finally {
      await context.close();
    }
  });

  async function openThemePage(
    options: Readonly<{
      colorScheme: 'light' | 'dark';
      path?: string;
      storedValue?: string;
      unavailableStorage?: boolean;
    }>,
  ): Promise<{
    readonly context: BrowserContext;
    readonly page: Page;
    readonly apiRequestUrls: string[];
  }> {
    const context = await browser.newContext({
      colorScheme: options.colorScheme,
    });
    if (options.storedValue !== undefined) {
      await context.addInitScript(
        ({ key, value }) => window.localStorage.setItem(key, value),
        { key: storageKey, value: options.storedValue },
      );
    }
    if (options.unavailableStorage === true) {
      await context.addInitScript(() => {
        const fail = () => {
          throw new DOMException('Storage unavailable', 'SecurityError');
        };
        Storage.prototype.getItem = fail;
        Storage.prototype.setItem = fail;
        Storage.prototype.removeItem = fail;
      });
    }
    const page = await context.newPage();
    const apiRequestUrls: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/feed') {
        apiRequestUrls.push(`${url.pathname}${url.search}`);
      }
    });
    const response = await page.goto(
      `http://${webServer.host}:${webServer.port}${options.path ?? '/'}`,
    );
    assert.equal(response?.status(), 200);
    return { context, page, apiRequestUrls };
  }
});

interface ExpectedTheme {
  readonly selection: 'system' | 'light' | 'dark';
  readonly effective: 'light' | 'dark';
  readonly forced: 'light' | 'dark' | null;
  readonly pageBackground: string;
  readonly textColor: string;
  readonly controlBackground: string;
  readonly colorScheme: string;
}

async function assertTheme(page: Page, expected: ExpectedTheme): Promise<void> {
  assert.deepEqual(
    await page.evaluate(() => {
      const root = document.documentElement;
      const bodyStyle = getComputedStyle(document.body);
      const control = document.querySelector('.theme-options');
      if (!(control instanceof HTMLElement)) {
        throw new Error('Missing theme control.');
      }
      const rootStyle = getComputedStyle(root);
      return {
        selection: root.dataset.themeSelection,
        effective: root.dataset.themeEffective,
        forced: root.getAttribute('data-theme'),
        pageBackground: bodyStyle.backgroundColor,
        textColor: bodyStyle.color,
        controlBackground: getComputedStyle(control).backgroundColor,
        colorScheme: rootStyle.colorScheme,
      };
    }),
    expected,
  );
}

async function assertThemeMode(
  page: Page,
  selection: 'system' | 'light' | 'dark',
  effective: 'light' | 'dark',
  forced: 'light' | 'dark' | null,
): Promise<void> {
  assert.deepEqual(
    await page.evaluate(() => ({
      selection: document.documentElement.dataset.themeSelection,
      effective: document.documentElement.dataset.themeEffective,
      forced: document.documentElement.getAttribute('data-theme'),
    })),
    { selection, effective, forced },
  );
}

async function assertDarkState(page: Page): Promise<void> {
  await assertThemeMode(page, 'dark', 'dark', 'dark');
  assert.equal(await bodyBackground(page), 'rgb(27, 26, 24)');
  assert.equal(await page.locator('[data-theme-control]').isVisible(), true);
  assert.equal(await selectedTheme(page), 'dark');
}

function waitForState(page: Page, state: string): Promise<unknown> {
  return page.waitForSelector(`[data-feed-content][data-state="${state}"]`);
}

function waitForEffectiveTheme(
  page: Page,
  theme: 'light' | 'dark',
): Promise<unknown> {
  return page.waitForFunction(
    (expected) => document.documentElement.dataset.themeEffective === expected,
    theme,
  );
}

async function chooseTheme(
  page: Page,
  theme: 'system' | 'light' | 'dark',
): Promise<void> {
  await page.locator(`[data-theme-option][value="${theme}"] + span`).click();
}

async function selectedTheme(page: Page): Promise<string | undefined> {
  return page
    .locator('[data-theme-option]:checked')
    .getAttribute('value')
    .then((value) => value ?? undefined);
}

function storedTheme(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), storageKey);
}

function bodyBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

function locationPath(page: Page): Promise<string> {
  return page.evaluate(
    () => `${window.location.pathname}${window.location.search}`,
  );
}

function discoveryValues(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [
      '[data-discovery-keyword]',
      '[data-discovery-source]',
      '[data-discovery-category]',
    ].map((selector) => {
      const control = document.querySelector(selector);
      if (
        !(control instanceof HTMLInputElement) &&
        !(control instanceof HTMLSelectElement)
      ) {
        throw new Error('Missing discovery control.');
      }
      return control.value;
    }),
  );
}

function articleValues(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll('.feed-row'),
      (row) => row.textContent ?? '',
    ),
  );
}
