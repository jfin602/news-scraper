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

  it('keeps application-owned contrast and visible focus safe in Light and Dark', async () => {
    outcome = Object.freeze({
      ...populatedFeed,
      publication: Object.freeze({
        ...populatedFeed.publication,
        accentColor: '#FFFFFF',
      }),
      nextCursor: 'presentation-cursor',
    });
    const { context, page } = await openThemePage({ colorScheme: 'light' });
    try {
      await waitForState(page, 'populated');
      const presentations: Record<string, Record<string, string>> = {};

      for (const theme of ['light', 'dark'] as const) {
        await chooseTheme(page, theme);
        presentations[theme] = await page.evaluate(() => {
          const rootStyle = getComputedStyle(document.documentElement);
          const masthead = document.querySelector(
            '[data-publication-masthead]',
          );
          if (!(masthead instanceof HTMLElement))
            throw new Error('Missing masthead.');
          const value = (name: string) =>
            rootStyle.getPropertyValue(name).trim();
          return {
            page: value('--page-bg'),
            surface: value('--surface'),
            subtle: value('--surface-subtle'),
            text: value('--text-primary'),
            muted: value('--text-muted'),
            link: value('--link'),
            focus: value('--focus-ring'),
            danger: value('--danger'),
            border: value('--border'),
            control: value('--control-bg'),
            accent: getComputedStyle(masthead, '::before').backgroundColor,
          };
        });
        const tokens = presentations[theme]!;
        assertContrastAtLeast(tokens.text!, tokens.page!, 4.5, `${theme} text`);
        assertContrastAtLeast(
          tokens.muted!,
          tokens.page!,
          4.5,
          `${theme} metadata`,
        );
        assertContrastAtLeast(
          tokens.muted!,
          tokens.subtle!,
          4.5,
          `${theme} filter metadata`,
        );
        assertContrastAtLeast(tokens.link!, tokens.page!, 4.5, `${theme} link`);
        assertContrastAtLeast(
          tokens.danger!,
          tokens.page!,
          4.5,
          `${theme} error`,
        );
        assertContrastAtLeast(
          tokens.text!,
          tokens.control!,
          4.5,
          `${theme} control text`,
        );
        assertContrastAtLeast(
          tokens.border!,
          tokens.control!,
          3,
          `${theme} control boundary`,
        );
        assertContrastAtLeast(
          tokens.border!,
          tokens.subtle!,
          3,
          `${theme} control boundary against filter surface`,
        );
        assertContrastAtLeast(tokens.focus!, tokens.page!, 3, `${theme} focus`);
        assertContrastAtLeast(
          tokens.focus!,
          tokens.subtle!,
          3,
          `${theme} focus against filter surface`,
        );
        assert.equal(tokens.accent, 'rgb(255, 255, 255)');
        assert.notEqual(tokens.text, tokens.accent);
        assert.notEqual(tokens.focus, tokens.accent);
        assert.notEqual(tokens.danger, tokens.accent);

        await page.keyboard.press('Tab');
        for (const selector of [
          '[data-theme-option][value="system"]',
          '[data-theme-option][value="light"]',
          '[data-theme-option][value="dark"]',
          '[data-discovery-keyword]',
          '[data-discovery-source]',
          '[data-discovery-category]',
          '.discovery-actions button[type="submit"]',
          '[data-discovery-reset]',
          '.feed-headline-link',
          '[data-feed-load-more]',
        ]) {
          const control = page.locator(selector);
          await control.focus();
          const focusPresentation = await control.evaluate((element) => {
            const target = element.matches('[data-theme-option]')
              ? element.nextElementSibling
              : element;
            if (!(target instanceof HTMLElement))
              throw new Error('Missing focus presentation target.');
            const style = getComputedStyle(target);
            return {
              style: style.outlineStyle,
              width: Number.parseFloat(style.outlineWidth),
              color: style.outlineColor,
            };
          });
          assert.equal(focusPresentation.style, 'solid', selector);
          assert.ok(focusPresentation.width >= 3, selector);
          assert.equal(focusPresentation.color, tokens.focus, selector);
        }
      }

      assert.notEqual(presentations.light!.page, presentations.dark!.page);
      assert.notEqual(presentations.light!.text, presentations.dark!.text);
      assert.notEqual(
        presentations.light!.control,
        presentations.dark!.control,
      );
    } finally {
      await context.close();
    }
  });

  it('traverses theme, discovery, headline, and pagination controls without a keyboard trap', async () => {
    outcome = Object.freeze({
      ...populatedFeed,
      nextCursor: 'presentation-cursor',
    });
    const { context, page } = await openThemePage({ colorScheme: 'light' });
    try {
      await waitForState(page, 'populated');
      const order: string[] = [];
      for (let index = 0; index < 8; index += 1) {
        await page.keyboard.press('Tab');
        order.push(await focusedControl(page));
      }
      assert.deepEqual(order, [
        'theme:system',
        'keyword',
        'source',
        'category',
        'button:Search',
        'button:Reset',
        'headline',
        'button:Load more',
      ]);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await focusedControl(page), 'headline');
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

function focusedControl(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return 'none';
    if (active.matches('[data-theme-option]'))
      return `theme:${(active as HTMLInputElement).value}`;
    if (active.matches('[data-discovery-keyword]')) return 'keyword';
    if (active.matches('[data-discovery-source]')) return 'source';
    if (active.matches('[data-discovery-category]')) return 'category';
    if (active.matches('.feed-headline-link')) return 'headline';
    if (active instanceof HTMLButtonElement)
      return `button:${active.innerText}`;
    return active.tagName.toLowerCase();
  });
}

function assertContrastAtLeast(
  foreground: string,
  background: string,
  minimum: number,
  label: string,
): void {
  const ratio = contrastRatio(foreground, background);
  assert.ok(ratio >= minimum, `${label} contrast ${ratio} is below ${minimum}`);
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string): number {
  const channels = color
    .match(/[\d.]+/gu)
    ?.slice(0, 3)
    .map(Number);
  if (channels === undefined || channels.length !== 3)
    throw new Error(`Unsupported color: ${color}`);
  const linear = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}
