import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';

import {
  EndpointAdministrationError,
  type AdminEndpointReadModel,
  type EndpointAdministrationService,
} from '../../src/admin/endpoint-administration.ts';
import {
  SourceAdministrationError,
  type AdminSourceReadModel,
  type SourceAdministrationService,
} from '../../src/admin/source-administration.ts';
import {
  PublicationAdministrationError,
  type AdminPublicationReadModel,
  type PublicationAdministrationService,
} from '../../src/admin/publication-administration.ts';
import {
  EditorialAdministrationError,
  type AdminRelevanceRuleReadModel,
  type EditorialAdministrationService,
} from '../../src/admin/editorial-administration.ts';
import { createWebApp } from '../../src/app/web/create-app.ts';
import { registerEditorialAdministrationRoutes } from '../../src/app/web/editorial-administration-router.ts';
import { registerEndpointAdministrationRoutes } from '../../src/app/web/endpoint-administration-router.ts';
import { registerPublicationAdministrationRoutes } from '../../src/app/web/publication-administration-router.ts';
import { registerSourceAdministrationRoutes } from '../../src/app/web/source-administration-router.ts';
import { startWebServer, type WebServer } from '../../src/app/web/server.ts';
import type { PublicFeed } from '../../src/public-feed/repository.ts';

const category = Object.freeze({
  configKey: 'industry_news',
  displayName: 'Industry news',
});

const initialSource: AdminSourceReadModel = Object.freeze({
  configKey: 'journal',
  displayName: 'Independent Publishing Journal',
  siteUrl: 'https://journal.example.com/',
  approvalState: 'approved',
  lifecycleState: 'active',
  operationalState: 'enabled',
  priority: 10,
  approvedDomains: Object.freeze([
    Object.freeze({ hostname: 'journal.example.com', includeSubdomains: true }),
  ]),
  defaultCategory: category,
  rssAtomAdmissionPhrases: Object.freeze(['publishing', 'indie author']),
  endpointCount: 1,
});

const initialEndpoint: AdminEndpointReadModel = Object.freeze({
  sourceConfigKey: 'journal',
  configKey: 'main_feed',
  endpointUrl: 'https://feeds.journal.example.com/rss.xml',
  endpointType: 'rss_atom',
  approvalState: 'approved',
  lifecycleState: 'active',
  operationalState: 'enabled',
  pollIntervalSeconds: 300,
  endpointDomainRules: Object.freeze([]),
  inheritsSourceDomainPolicy: true,
  defaultCategory: category,
});

const initialHtmlEndpoint: AdminEndpointReadModel = Object.freeze({
  sourceConfigKey: 'journal',
  configKey: 'html_listing',
  endpointUrl: 'https://journal.example.com/listing',
  endpointType: 'html_listing',
  htmlListingProfile: Object.freeze({
    itemSelector: '.item',
    title: Object.freeze({ selector: '.title' }),
    articleLink: Object.freeze({ selector: 'a' }),
    publishedAt: Object.freeze({ selector: 'time', mode: 'text' as const }),
    author: Object.freeze({ selector: '.author' }),
  }),
  htmlListingProfileRevision: 3,
  approvalState: 'approved',
  lifecycleState: 'active',
  operationalState: 'enabled',
  pollIntervalSeconds: 300,
  endpointDomainRules: Object.freeze([]),
  inheritsSourceDomainPolicy: true,
  defaultCategory: category,
});

const initialPublication: AdminPublicationReadModel = Object.freeze({
  name: 'Indie publishing news',
  activeForCollection: true,
  publicStatus: 'public',
  description: 'A bounded Publication fixture.',
  logoPath: '/publication.svg',
  accentColor: '#164E63',
  presentationTimezone: null,
});

const publicFeed: PublicFeed = Object.freeze({
  publication: Object.freeze({
    name: 'Public regression publication',
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
      articleId: '20000000-0000-4000-8000-000000000001',
      effectiveFeedDate: new Date('2026-08-14T12:00:00.000Z'),
      feedDateSource: 'published_at' as const,
      headline: 'Public page remains isolated from Source administration',
      sourceName: 'Independent Publishing Journal',
      originalUrl: 'https://journal.example.com/public-regression',
    }),
  ]),
});

describe('Source administration page browser behavior', () => {
  let browser: Browser;

  before(async () => {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      throw new Error(
        'Chromium is required for browser tests. Run "npx playwright install chromium".',
        { cause: error },
      );
    }
  });

  after(async () => {
    await browser?.close();
  });

  it('keeps the disabled admin route unavailable and the public root unchanged', async () => {
    const server = await startHarnessServer(new AdminHarness(), false);
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const admin = await page.goto(`${baseUrl(server)}/admin`);
      assert.equal(admin?.status(), 404);

      const root = await page.goto(`${baseUrl(server)}/`);
      assert.equal(root?.status(), 200);
      await page.waitForSelector('[data-feed-content][data-state="populated"]');
      assert.equal(
        await page.locator('.feed-headline-link').innerText(),
        'Public page remains isolated from Source administration',
      );
      assert.equal(
        await page.locator('.feed-headline-link').getAttribute('href'),
        'https://journal.example.com/public-regression',
      );
    } finally {
      await context.close();
      await server.close();
    }
  });

  it('loads and edits the singleton Publication without losing the Source workspace', async () => {
    const harness = new AdminHarness();
    const mutationHeaders: string[] = [];
    await withAdminPage(
      browser,
      harness,
      { viewport: { width: 1280, height: 900 } },
      async (page) => {
        page.on('request', (request) => {
          if (
            request.url().includes('/admin/api/publication/configuration') &&
            request.method() === 'PUT'
          ) {
            mutationHeaders.push(
              request.headers()['x-news-scraper-admin-request'] ?? '',
            );
          }
        });
        await page.getByRole('tab', { name: /^Publication/u }).click();
        await page
          .locator('[data-publication-state][data-publication-state="ready"]')
          .waitFor();
        const form = page.locator('[data-publication-form]');
        assert.equal(
          await form.locator('[name="name"]').inputValue(),
          initialPublication.name,
        );
        assert.equal(
          await form.locator('[name="activeForCollection"]').isChecked(),
          true,
        );
        assert.equal(
          await form.locator('[name="publicStatus"]').inputValue(),
          'public',
        );
        assert.equal(
          await form.locator('[name="presentationTimezone"]').inputValue(),
          '',
        );
        assert.match(
          await page.locator('[data-timezone-hint]').innerText(),
          /calendar dates use UTC/u,
        );

        await form
          .locator('[name="name"]')
          .fill('Updated indie publishing news');
        await form.locator('[name="description"]').fill('Updated description');
        await form.locator('[name="activeForCollection"]').uncheck();
        await form.locator('[name="publicStatus"]').selectOption('private');
        await form.locator('[name="logoPath"]').fill('/updated-logo.svg');
        await form.locator('[name="accentColor"]').fill('#abcdef');
        await form
          .locator('[name="presentationTimezone"]')
          .fill('America/Chicago');
        await page.getByRole('button', { name: 'Save Publication' }).click();
        await page
          .locator('[data-admin-status]')
          .filter({ hasText: 'Publication configuration saved.' })
          .waitFor();

        assert.deepEqual(harness.publication, {
          name: 'Updated indie publishing news',
          activeForCollection: false,
          publicStatus: 'private',
          description: 'Updated description',
          logoPath: '/updated-logo.svg',
          accentColor: '#ABCDEF',
          presentationTimezone: 'America/Chicago',
        });
        assert.deepEqual(mutationHeaders, ['1']);

        await page.getByRole('tab', { name: /^Sources/u }).click();
        await waitForSource(page, 'journal');
        await page.getByRole('button', { name: /main_feed/u }).click();
        await page.waitForSelector('[data-operational-state="ready"]');
        assert.equal(
          await page.locator('[data-endpoint-form]').isVisible(),
          true,
        );
      },
    );
  });

  it('manages Categories and bounded Relevance rules in the Editorial workspace', async () => {
    const harness = new AdminHarness();
    await withAdminPage(
      browser,
      harness,
      { viewport: { width: 390, height: 844 } },
      async (page) => {
        await page.getByRole('tab', { name: /^Editorial/u }).click();
        await page.getByRole('button', { name: 'New Category' }).click();
        await page
          .locator('[data-category-form] [name="configKey"]')
          .fill('markets');
        await page
          .locator('[data-category-form] [name="displayName"]')
          .fill('Markets');
        await page.locator('[data-category-submit]').click();
        await page.getByRole('button', { name: /Markets/u }).click();
        assert.equal(
          await page
            .locator('[data-category-form] [name="configKey"]')
            .isDisabled(),
          true,
        );
        await page.getByRole('button', { name: 'New Relevance rule' }).click();
        const rule = page.locator('[data-rule-form]');
        await rule.locator('[name="configKey"]').fill('include_markets');
        await rule.locator('[name="pattern"]').fill('market');
        await rule.locator('[name="reason"]').fill('Market coverage');
        await page.locator('[data-rule-submit]').click();
        await page
          .getByRole('button', { name: /Include: Market coverage/u })
          .click();
        await page.getByRole('button', { name: 'Disable rule' }).click();
        assert.match(
          await page.locator('.precedence-guidance').innerText(),
          /endpoint default wins over the Source default/u,
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          true,
        );
      },
    );
  });

  it('keeps Publication values and focus after a server validation error', async () => {
    const harness = new AdminHarness();
    harness.rejectNextPublicationUpdate = true;
    await withAdminPage(browser, harness, {}, async (page) => {
      await page.getByRole('tab', { name: /^Publication/u }).click();
      await page
        .locator('[data-publication-state][data-publication-state="ready"]')
        .waitFor();
      const form = page.locator('[data-publication-form]');
      const unsavedName = 'Unsaved name retained after validation failure';
      await form.locator('[name="name"]').fill(unsavedName);
      await form
        .locator('[name="presentationTimezone"]')
        .fill('Pacific/Auckland');
      await page.getByRole('button', { name: 'Save Publication' }).click();
      await page.locator('[data-publication-form-error]').waitFor();
      assert.equal(
        await form.locator('[name="name"]').inputValue(),
        unsavedName,
      );
      assert.equal(
        await form.locator('[name="presentationTimezone"]').inputValue(),
        'Pacific/Auckland',
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.activeElement ===
            document.querySelector('[data-publication-form-error]'),
        ),
        true,
      );
    });
  });

  it('supports keyboard workspace navigation and contains the Publication editor on mobile', async () => {
    await withAdminPage(
      browser,
      new AdminHarness(),
      { viewport: { width: 390, height: 844 } },
      async (page) => {
        const publicationTab = page.getByRole('tab', { name: /^Publication/u });
        await publicationTab.focus();
        assert.equal(
          await publicationTab.evaluate((element) => {
            const style = getComputedStyle(element);
            return (
              style.outlineStyle !== 'none' && style.outlineWidth !== '0px'
            );
          }),
          true,
        );
        await page.keyboard.press('Enter');
        await page
          .locator('[data-publication-state][data-publication-state="ready"]')
          .waitFor();
        assert.equal(
          await page
            .getByRole('tab', { name: /^Publication/u })
            .getAttribute('aria-selected'),
          'true',
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          true,
        );
      },
    );
  });

  it('distinguishes empty, error, and ready Source-list states', async () => {
    const emptyHarness = new AdminHarness({ sources: [] });
    await withAdminPage(browser, emptyHarness, {}, async (page) => {
      await page
        .locator('[data-source-list-state][data-list-state="empty"]')
        .waitFor();
      assert.match(
        await page.locator('[data-source-list-state]').innerText(),
        /No Sources are configured/u,
      );
      assert.equal(await page.locator('[data-source-key]').count(), 0);
    });

    const errorHarness = new AdminHarness({ sourceListError: true });
    await withAdminPage(browser, errorHarness, {}, async (page) => {
      await page
        .locator('[data-source-list-state][data-list-state="error"]')
        .waitFor();
      assert.match(
        await page.locator('[data-admin-status]').innerText(),
        /temporarily unavailable/u,
      );
    });

    await withAdminPage(browser, new AdminHarness(), {}, async (page) => {
      await waitForSource(page, 'journal');
      assert.equal(
        await page
          .locator('[data-source-list-state]')
          .getAttribute('data-list-state'),
        'ready',
      );
      assert.ok((await page.getByText('Approval: Approved').count()) >= 2);
    });
  });

  it('creates and edits a Source, manages admission phrases, and keeps state concepts separate', async () => {
    const harness = new AdminHarness();
    await withAdminPage(
      browser,
      harness,
      { viewport: { width: 1280, height: 900 } },
      async (page) => {
        await waitForSource(page, 'journal');
        await page.getByRole('button', { name: 'New Source' }).click();
        const sourceForm = page.locator('[data-source-form]');
        await sourceForm.locator('[name="configKey"]').fill('new_source');
        await sourceForm.locator('[name="displayName"]').fill('New Source');
        await sourceForm
          .locator('[name="siteUrl"]')
          .fill('https://news.example.test/');
        await sourceForm.locator('[name="priority"]').fill('7');
        await sourceForm
          .locator('[name="defaultCategoryConfigKey"]')
          .selectOption('industry_news');
        await sourceForm
          .locator('[data-domain-hostname]')
          .fill('news.example.test');
        await page.getByRole('button', { name: 'Add include phrase' }).click();
        await sourceForm
          .locator('[data-admission-phrase]')
          .fill('independent publishing');
        await sourceForm
          .locator('[name="approvalState"]')
          .selectOption('unapproved');
        await sourceForm
          .locator('[name="operationalState"]')
          .selectOption('disabled');
        await page
          .getByRole('button', { name: 'Create Source', exact: true })
          .click();

        await page
          .locator('[data-admin-status]')
          .filter({ hasText: 'Source created.' })
          .waitFor();
        await waitForSource(page, 'new_source');
        assert.deepEqual(harness.source('new_source').rssAtomAdmissionPhrases, [
          'independent publishing',
        ]);
        assert.equal(harness.source('new_source').priority, 7);

        await sourceForm.locator('[name="displayName"]').fill('Renamed Source');
        await page.getByRole('button', { name: 'Remove phrase' }).click();
        assert.match(
          await sourceForm.locator('[data-phrase-empty]').innerText(),
          /Collect all/u,
        );
        await page
          .getByRole('button', { name: 'Save Source configuration' })
          .click();
        await page
          .locator('[data-admin-status]')
          .filter({ hasText: 'Source configuration saved.' })
          .waitFor();
        assert.equal(
          harness.source('new_source').displayName,
          'Renamed Source',
        );
        assert.deepEqual(
          harness.source('new_source').rssAtomAdmissionPhrases,
          [],
        );

        await page.getByRole('button', { name: 'Approve Source' }).click();
        await page.getByRole('button', { name: 'Unapprove Source' }).waitFor();
        await page.getByRole('button', { name: 'Enable Source' }).click();
        await page
          .locator('[data-source-state-summary]')
          .filter({ hasText: 'Operation: Enabled' })
          .waitFor();
        assert.equal(harness.source('new_source').approvalState, 'approved');
        assert.equal(harness.source('new_source').operationalState, 'enabled');

        await page.getByRole('button', { name: 'Archive Source' }).click();
        await page.getByRole('button', { name: 'Restore Source' }).waitFor();
        assert.equal(harness.source('new_source').lifecycleState, 'archived');
        assert.equal(harness.source('new_source').operationalState, 'disabled');
        await page.getByRole('button', { name: 'Restore Source' }).click();
        await page
          .locator('[data-admin-status]')
          .filter({ hasText: 'remains disabled' })
          .waitFor();
        assert.equal(harness.source('new_source').lifecycleState, 'active');
        assert.equal(harness.source('new_source').operationalState, 'disabled');
        assert.match(
          await page.locator('[data-admin-status]').innerText(),
          /remains disabled/u,
        );
      },
    );
  });

  it('creates and edits a Source-scoped endpoint without offering physical deletion', async () => {
    const harness = new AdminHarness();
    await withAdminPage(
      browser,
      harness,
      { viewport: { width: 1280, height: 900 } },
      async (page) => {
        await waitForSource(page, 'journal');
        await page.getByRole('button', { name: 'New endpoint' }).click();
        const form = page.locator('[data-endpoint-form]');
        await form.locator('[name="configKey"]').fill('secondary_feed');
        await form
          .locator('[name="endpointUrl"]')
          .fill('https://feeds.journal.example.com/secondary.xml');
        await form.locator('[name="pollIntervalSeconds"]').fill('600');
        await form
          .locator('[name="defaultCategoryConfigKey"]')
          .selectOption('industry_news');
        await form.locator('[name="domainPolicyMode"][value="narrow"]').check();
        await form
          .locator('[data-domain-hostname]')
          .fill('feeds.journal.example.com');
        await page
          .getByRole('button', { name: 'Create endpoint', exact: true })
          .click();

        await waitForEndpoint(page, 'secondary_feed');
        assert.equal(
          harness.endpoint('journal', 'secondary_feed').pollIntervalSeconds,
          600,
        );
        assert.equal(
          harness.endpoint('journal', 'secondary_feed')
            .inheritsSourceDomainPolicy,
          false,
        );
        await page
          .locator('[data-admin-status]')
          .filter({ hasText: 'Endpoint created.' })
          .waitFor();

        await form
          .locator('[name="endpointUrl"]')
          .fill('https://feeds.journal.example.com/updated.xml');
        await form.locator('[name="pollIntervalSeconds"]').fill('1200');
        await form
          .locator('[name="domainPolicyMode"][value="inherit"]')
          .check();
        const updateResponsePromise = page.waitForResponse(
          (response) =>
            response.request().method() === 'PUT' &&
            response.url().endsWith('/secondary_feed/configuration'),
        );
        await page
          .getByRole('button', { name: 'Save endpoint configuration' })
          .click();
        const updateResponse = await updateResponsePromise;
        assert.equal(updateResponse.status(), 200);
        assert.equal(
          (
            (await updateResponse.json()) as {
              endpoint: AdminEndpointReadModel;
            }
          ).endpoint.pollIntervalSeconds,
          1200,
        );
        await page
          .locator('[data-admin-status]')
          .filter({ hasText: 'Endpoint configuration saved.' })
          .waitFor();
        assert.equal(
          harness.endpoint('journal', 'secondary_feed').pollIntervalSeconds,
          1200,
        );
        assert.equal(
          harness.endpoint('journal', 'secondary_feed')
            .inheritsSourceDomainPolicy,
          true,
        );

        await page.getByRole('button', { name: 'Approve endpoint' }).click();
        await page
          .getByRole('button', { name: 'Unapprove endpoint' })
          .waitFor();
        await page.getByRole('button', { name: 'Enable endpoint' }).click();
        await page
          .locator('[data-endpoint-state-summary]')
          .filter({ hasText: 'Operation: Enabled' })
          .waitFor();
        await page.getByRole('button', { name: 'Archive endpoint' }).click();
        await page.getByRole('button', { name: 'Restore endpoint' }).waitFor();
        assert.equal(
          harness.endpoint('journal', 'secondary_feed').operationalState,
          'disabled',
        );
        await page.getByRole('button', { name: 'Restore endpoint' }).click();
        assert.equal(
          harness.endpoint('journal', 'secondary_feed').lifecycleState,
          'active',
        );
        assert.equal(
          harness.endpoint('journal', 'secondary_feed').operationalState,
          'disabled',
        );
        assert.equal(
          await page.getByRole('button', { name: /Delete/iu }).count(),
          0,
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          true,
        );
      },
    );
  });

  it('configures HTML listing profiles, previews safely, switches types, and keeps check-now durable', async () => {
    const harness = new AdminHarness();
    let lastConfigurationBody: Record<string, unknown> | null = null;
    await withAdminPage(
      browser,
      harness,
      { viewport: { width: 1280, height: 900 } },
      async (page) => {
        page.on('request', (request) => {
          if (
            request.method() === 'PUT' &&
            request.url().endsWith('/configuration')
          ) {
            lastConfigurationBody = JSON.parse(
              request.postData() ?? '{}',
            ) as Record<string, unknown>;
          }
        });
        await waitForSource(page, 'journal');
        await page.getByRole('button', { name: 'New endpoint' }).click();
        const form = page.locator('[data-endpoint-form]');
        assert.deepEqual(
          await form.locator('[name="endpointType"] option').allTextContents(),
          ['RSS / Atom', 'HTML listing'],
        );
        await form.locator('[name="configKey"]').fill('html_listing');
        await form
          .locator('[name="endpointUrl"]')
          .fill('https://journal.example.com/listing');
        await form
          .locator('[name="endpointType"]')
          .selectOption('html_listing');
        await form.locator('[name="htmlItemSelector"]').fill('.item');
        await form.locator('[name="htmlTitleSelector"]').fill('.title');
        await form.locator('[name="htmlArticleLinkSelector"]').fill('a');
        await form.locator('[name="htmlAuthorSelector"]').fill('.author');
        assert.equal(
          await page.locator('[data-html-profile]').isVisible(),
          true,
        );
        assert.equal(
          await page.locator('[data-html-preview-panel]').isVisible(),
          true,
        );
        assert.match(
          await page.locator('[data-admission-explanation]').innerText(),
          /RSS\/Atom.*HTML listing selectors.*not an HTML keyword filter/u,
        );

        const previewRequests: Array<{
          url: string;
          header: string | null;
          body: string;
        }> = [];
        page.on('request', (request) => {
          if (request.url().endsWith('/admin/api/html-listing/preview')) {
            previewRequests.push({
              url: request.url(),
              header: request.headers()['x-news-scraper-admin-request'] ?? null,
              body: request.postData() ?? '',
            });
          }
        });
        await page
          .locator('[data-html-preview-sample]')
          .fill(
            '<article class="item"><h2 class="title">Safe <script>globalThis.previewXss=true</script> headline</h2><a href="/preview">Read</a><span class="author">Alex</span></article>',
          );
        await page.getByRole('button', { name: 'Preview draft' }).click();
        await page
          .locator('[data-html-preview-status]')
          .filter({ hasText: 'Preview completed.' })
          .waitFor();
        assert.equal(previewRequests.length, 1);
        assert.equal(previewRequests[0]?.header, '1');
        assert.equal(
          previewRequests[0]?.url.endsWith('/admin/api/html-listing/preview'),
          true,
        );
        assert.match(previewRequests[0]?.body ?? '', /"profile"/u);
        assert.match(
          await page.locator('[data-html-preview-results]').innerText(),
          /Safe.*headline|preview/u,
        );
        assert.match(
          await page.locator('[data-html-preview-results]').innerText(),
          /Article link: \/preview/u,
        );
        assert.equal(
          await page.locator('[data-html-preview-results] script').count(),
          0,
        );
        assert.equal(
          await page.evaluate(() => 'previewXss' in globalThis),
          false,
        );

        await page
          .locator('[data-html-preview-sample]')
          .fill(
            '<article class="item"><h2 class="title">Valid row</h2><a href="/valid">Read</a></article><article class="item"><h2 class="title">Invalid row</h2></article>',
          );
        await page.getByRole('button', { name: 'Preview draft' }).click();
        await page
          .locator('[data-html-preview-status]')
          .filter({ hasText: 'Preview completed.' })
          .waitFor();
        assert.match(
          await page.locator('[data-html-preview-results]').innerText(),
          /Rejected items: 1/u,
        );

        await page
          .locator('[data-html-preview-sample]')
          .fill('<div>PREVIEW_SECRET_SHOULD_NOT_RENDER</div>');
        await page.getByRole('button', { name: 'Preview draft' }).click();
        await page
          .locator('[data-html-preview-status]')
          .filter({ hasText: 'Preview failed:' })
          .waitFor();
        assert.equal(
          (
            await page.locator('[data-html-preview-results]').innerText()
          ).includes('PREVIEW_SECRET_SHOULD_NOT_RENDER'),
          false,
        );

        const createResponsePromise = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith('/admin/api/sources/journal/endpoints'),
        );
        await page
          .getByRole('button', { name: 'Create endpoint', exact: true })
          .click();
        assert.equal((await createResponsePromise).status(), 201);
        await page
          .locator('[data-admin-status]')
          .filter({ hasText: 'Endpoint created.' })
          .waitFor();
        await waitForEndpoint(page, 'html_listing');
        assert.equal(
          harness.endpoint('journal', 'html_listing').endpointType,
          'html_listing',
        );
        assert.equal(
          harness.endpoint('journal', 'html_listing')
            .htmlListingProfileRevision,
          1,
        );
        assert.match(
          await page.locator('[data-endpoint-profile-revision]').innerText(),
          /revision: 1/u,
        );

        await form.locator('[name="htmlAuthorSelector"]').fill('.writer');
        await page
          .getByRole('button', { name: 'Save endpoint configuration' })
          .click();
        await page
          .locator('[data-admin-status]')
          .filter({ hasText: 'Endpoint configuration saved.' })
          .waitFor();
        assert.equal(
          harness.endpoint('journal', 'html_listing')
            .htmlListingProfileRevision,
          2,
        );

        await form.locator('[name="endpointType"]').selectOption('rss_atom');
        assert.equal(
          await page.locator('[data-html-profile]').isVisible(),
          false,
        );
        await page
          .getByRole('button', { name: 'Save endpoint configuration' })
          .click();
        await page
          .locator('[data-admin-status]')
          .filter({ hasText: 'Endpoint configuration saved.' })
          .waitFor();
        assert.equal(lastConfigurationBody?.endpointType, 'rss_atom');
        assert.equal(
          'htmlListingProfile' in (lastConfigurationBody ?? {}),
          false,
        );
        assert.equal(
          harness.endpoint('journal', 'html_listing').htmlListingProfile,
          null,
        );
        assert.equal(
          harness.endpoint('journal', 'html_listing')
            .htmlListingProfileRevision,
          null,
        );

        await form
          .locator('[name="endpointType"]')
          .selectOption('html_listing');
        await form.locator('[name="htmlItemSelector"]').fill(':has(article)');
        await form.locator('[name="htmlTitleSelector"]').fill('.title');
        await form.locator('[name="htmlArticleLinkSelector"]').fill('a');
        await page
          .getByRole('button', { name: 'Save endpoint configuration' })
          .click();
        await page
          .locator('[data-endpoint-form-error]')
          .filter({ hasText: 'unsaved values have been kept' })
          .waitFor();
        await form.locator('[name="htmlItemSelector"]').fill('.item');
        await form.locator('[name="htmlTitleSelector"]').fill('.title');
        await form.locator('[name="htmlArticleLinkSelector"]').fill('a');
        await page
          .getByRole('button', { name: 'Save endpoint configuration' })
          .click();
        await page
          .locator('[data-admin-status]')
          .filter({ hasText: 'Endpoint configuration saved.' })
          .waitFor();
        assert.equal(
          harness.endpoint('journal', 'html_listing')
            .htmlListingProfileRevision,
          1,
        );

        await page.getByRole('button', { name: 'Check now' }).click();
        await page
          .locator('[data-check-now-result]')
          .filter({ hasText: 'queued for the Worker' })
          .waitFor();
        assert.equal(harness.checkNowCalls, 1);
      },
    );
  });

  it('loads persisted HTML profile/revision and renders parser diagnostics with stale preview recovery', async () => {
    const harness = new AdminHarness({ initialEndpoint: initialHtmlEndpoint });
    await withAdminPage(
      browser,
      harness,
      { viewport: { width: 390, height: 844 } },
      async (page) => {
        await waitForSource(page, 'journal');
        await page.getByRole('button', { name: 'html_listing' }).click();
        await page.waitForSelector('[data-operational-state="ready"]');
        const form = page.locator('[data-endpoint-form]');
        assert.equal(
          await form.locator('[name="endpointType"]').inputValue(),
          'html_listing',
        );
        assert.equal(
          await form.locator('[name="htmlItemSelector"]').inputValue(),
          '.item',
        );
        assert.equal(
          await form.locator('[name="htmlTitleSelector"]').inputValue(),
          '.title',
        );
        assert.match(
          await page.locator('[data-endpoint-profile-revision]').innerText(),
          /revision: 3/u,
        );
        const runText = await page.locator('[data-runs-list]').innerText();
        assert.match(runText, /Parser adapter\s+html_listing/u);
        assert.match(runText, /Parser version\s+1/u);
        assert.match(runText, /Profile revision used\s+3/u);
        assert.match(runText, /Item\/extraction failures\s+1/u);
        assert.match(runText, /required_field_missing/u);

        let releasePreview: (() => void) | undefined;
        const previewHeld = new Promise<void>((resolve) => {
          releasePreview = resolve;
        });
        await page.route('**/admin/api/html-listing/preview', async (route) => {
          await previewHeld;
          await route.continue();
        });
        await page
          .locator('[data-html-preview-sample]')
          .fill(
            '<article class="item"><h2 class="title">Stale preview</h2><a href="/stale">Read</a></article>',
          );
        const stalePreviewResponse = page.waitForResponse((response) =>
          response.url().endsWith('/admin/api/html-listing/preview'),
        );
        await page.getByRole('button', { name: 'Preview draft' }).click();
        assert.equal(
          await page
            .getByRole('button', { name: 'Preview draft' })
            .isDisabled(),
          true,
        );
        await page.getByRole('button', { name: 'main_feed' }).click();
        releasePreview?.();
        await stalePreviewResponse;
        await page.unroute('**/admin/api/html-listing/preview');
        await page.waitForSelector(
          '[data-endpoint-form] [name="endpointType"]',
        );
        assert.equal(
          await form.locator('[name="endpointType"]').inputValue(),
          'rss_atom',
        );
        assert.equal(
          await page.locator('[data-html-preview-panel]').isVisible(),
          false,
        );
        assert.equal(
          await page.locator('[data-html-preview-results]').innerText(),
          '',
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          true,
        );
      },
    );
  });

  it('renders health and run accounting and distinguishes queued, outstanding, and ineligible check-now results', async () => {
    const harness = new AdminHarness();
    const mutationRequests: Array<{ method: string; header: string | null }> =
      [];
    await withAdminPage(browser, harness, {}, async (page) => {
      page.on('request', (request) => {
        if (request.url().endsWith('/check-now')) {
          mutationRequests.push({
            method: request.method(),
            header: request.headers()['x-news-scraper-admin-request'] ?? null,
          });
        }
      });
      await waitForSource(page, 'journal');
      await page.getByRole('button', { name: /main_feed/u }).click();
      await page.waitForSelector('[data-operational-state="ready"]');
      assert.match(
        await page.locator('[data-health-grid]').innerText(),
        /Healthy/u,
      );
      const runText = await page.locator('[data-runs-list]').innerText();
      assert.match(runText, /Manual · Succeeded/u);
      assert.match(runText, /Source-filtered\s+2/u);
      assert.match(runText, /Created\s+3/u);
      assert.match(runText, /Failure: fixture_timeout/u);

      await page.getByRole('button', { name: 'Check now' }).click();
      await page
        .locator('[data-check-now-result]')
        .filter({ hasText: 'queued for the Worker' })
        .waitFor();
      assert.match(
        await page.locator('[data-check-now-result]').innerText(),
        /queued for the Worker/u,
      );
      await page.getByRole('button', { name: 'Check now' }).click();
      await page
        .locator('[data-check-now-result]')
        .filter({ hasText: 'already Queued' })
        .waitFor();
      assert.match(
        await page.locator('[data-check-now-result]').innerText(),
        /already Queued|already queued/u,
      );
      harness.checkNowIneligible = true;
      await page.getByRole('button', { name: 'Check now' }).click();
      await page
        .locator('[data-check-now-result]')
        .filter({ hasText: 'ineligible: Endpoint paused' })
        .waitFor();
      assert.match(
        await page.locator('[data-check-now-result]').innerText(),
        /ineligible: Endpoint paused/u,
      );
      assert.deepEqual(mutationRequests, [
        { method: 'POST', header: '1' },
        { method: 'POST', header: '1' },
        { method: 'POST', header: '1' },
      ]);

      await page
        .getByRole('button', { name: 'Refresh operational data' })
        .click();
      await page.waitForSelector('[data-operational-state="ready"]');
      assert.equal(harness.inlineCollectionCalls, 0);
    });
  });

  it('preserves invalid form input, visible keyboard focus, wrapping, and mobile containment', async () => {
    const longName =
      'A very long Source name with <img src=x onerror="globalThis.adminXss=true"> and enough words to exercise responsive wrapping without becoming executable content';
    const longError =
      'A bounded fixture failure detail with a deliberately long unbroken segment abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789';
    const harness = new AdminHarness({ longRunError: longError });
    await withAdminPage(
      browser,
      harness,
      { viewport: { width: 390, height: 844 } },
      async (page) => {
        await waitForSource(page, 'journal');
        const name = page.locator('[data-source-form] [name="displayName"]');
        await name.fill(longName);
        harness.rejectNextSourceUpdate = true;
        await page
          .getByRole('button', { name: 'Save Source configuration' })
          .click();
        await page
          .locator('[data-source-form-error]')
          .filter({ hasText: 'unsaved values have been kept' })
          .waitFor();
        assert.match(
          await page.locator('[data-source-form-error]').innerText(),
          /unsaved values have been kept/u,
        );
        assert.equal(await name.inputValue(), longName);
        assert.equal(await page.locator('img').count(), 0);
        assert.equal(
          await page.evaluate(() => 'adminXss' in globalThis),
          false,
        );

        await name.focus();
        const focus = await name.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            style: style.outlineStyle,
            width: Number.parseFloat(style.outlineWidth),
          };
        });
        assert.equal(focus.style, 'solid');
        assert.ok(focus.width >= 3);

        await page.getByRole('button', { name: /main_feed/u }).click();
        await page.waitForSelector('[data-operational-state="ready"]');
        assert.match(
          await page.locator('[data-runs-list]').innerText(),
          new RegExp(longError, 'u'),
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          true,
        );
        const checkNow = page.getByRole('button', { name: 'Check now' });
        const box = await checkNow.boundingBox();
        assert.ok(box !== null && box.height >= 44 && box.width >= 44);
      },
    );
  });
});

interface HarnessOptions {
  readonly sources?: readonly AdminSourceReadModel[];
  readonly sourceListError?: boolean;
  readonly longRunError?: string;
  readonly initialEndpoint?: AdminEndpointReadModel;
}

class AdminHarness {
  readonly categories: { configKey: string; displayName: string }[] = [
    { ...category },
  ];
  readonly relevanceRules: AdminRelevanceRuleReadModel[] = [];
  publication: AdminPublicationReadModel = initialPublication;
  readonly sources: AdminSourceReadModel[];
  readonly endpoints = new Map<string, AdminEndpointReadModel[]>();
  readonly sourceListError: boolean;
  readonly longRunError: string;
  rejectNextSourceUpdate = false;
  rejectNextPublicationUpdate = false;
  checkNowIneligible = false;
  checkNowCalls = 0;
  inlineCollectionCalls = 0;

  constructor(options: HarnessOptions = {}) {
    this.sources = [...(options.sources ?? [initialSource])];
    this.sourceListError = options.sourceListError === true;
    this.longRunError =
      options.longRunError ?? 'A bounded fixture timeout detail.';
    const configuredEndpoint = options.initialEndpoint ?? initialEndpoint;
    if (this.sources.some((source) => source.configKey === 'journal')) {
      this.endpoints.set(
        'journal',
        configuredEndpoint.endpointType === 'html_listing'
          ? [configuredEndpoint, initialEndpoint]
          : [configuredEndpoint],
      );
    }
  }

  source(configKey: string): AdminSourceReadModel {
    const source = this.sources.find(
      (candidate) => candidate.configKey === configKey,
    );
    if (source === undefined)
      throw new Error(`Missing test Source ${configKey}`);
    return source;
  }

  publicationService(): PublicationAdministrationService {
    return {
      getPublication: async () => this.publication,
      replacePublication: async (input) => {
        if (this.rejectNextPublicationUpdate) {
          this.rejectNextPublicationUpdate = false;
          throw new PublicationAdministrationError('invalid_request');
        }
        const body = record(input);
        this.publication = Object.freeze({
          name: String(body.name).trim(),
          activeForCollection: body.activeForCollection === true,
          publicStatus: String(body.publicStatus) as 'private' | 'public',
          description: optionalString(body.description),
          logoPath: optionalString(body.logoPath),
          accentColor: optionalString(body.accentColor)?.toUpperCase() ?? null,
          presentationTimezone: optionalString(body.presentationTimezone),
        });
        return this.publication;
      },
    };
  }

  endpoint(sourceKey: string, endpointKey: string): AdminEndpointReadModel {
    const endpoint = this.endpoints
      .get(sourceKey)
      ?.find((candidate) => candidate.configKey === endpointKey);
    if (endpoint === undefined)
      throw new Error(`Missing test endpoint ${endpointKey}`);
    return endpoint;
  }

  sourceService(): SourceAdministrationService {
    return {
      listSources: async () => {
        if (this.sourceListError) throw new Error('private database failure');
        return this.sources;
      },
      getSource: async (sourceKey) => this.requireSource(String(sourceKey)),
      createSource: async (input) => {
        const body = record(input);
        const source = sourceFromBody(body);
        this.sources.push(source);
        this.endpoints.set(source.configKey, []);
        return source;
      },
      replaceSourceConfiguration: async (sourceKey, input) => {
        if (this.rejectNextSourceUpdate) {
          this.rejectNextSourceUpdate = false;
          throw new SourceAdministrationError('invalid_request');
        }
        const current = this.requireSource(String(sourceKey));
        const body = record(input);
        return this.replaceSource(current.configKey, {
          ...current,
          ...sourceConfigurationFromBody(body),
        });
      },
      setSourceApproval: async (sourceKey, input) => {
        const current = this.requireSource(String(sourceKey));
        return this.replaceSource(current.configKey, {
          ...current,
          approvalState: String(record(input).approvalState) as
            'approved' | 'unapproved',
        });
      },
      setSourceOperationalState: async (sourceKey, input) => {
        const current = this.requireSource(String(sourceKey));
        return this.replaceSource(current.configKey, {
          ...current,
          operationalState: String(record(input).operationalState) as
            'enabled' | 'paused' | 'disabled',
        });
      },
      setSourceLifecycle: async (sourceKey, input) => {
        const current = this.requireSource(String(sourceKey));
        return this.replaceSource(current.configKey, {
          ...current,
          lifecycleState: String(record(input).lifecycleState) as
            'active' | 'archived',
          operationalState: 'disabled',
        });
      },
    };
  }

  editorialService(): EditorialAdministrationService {
    return {
      listCategories: async () => this.categories,
      createCategory: async (input) => {
        const value = record(input);
        const category = {
          configKey: String(value.configKey),
          displayName: String(value.displayName),
        };
        this.categories.push(category);
        return category;
      },
      getCategory: async (key) => this.category(String(key)),
      updateCategory: async (key, input) => {
        const current = this.category(String(key));
        current.displayName = String(record(input).displayName);
        return current;
      },
      deleteCategory: async (key) => {
        const index = this.categories.findIndex(
          (value) => value.configKey === String(key),
        );
        if (index < 0)
          throw new EditorialAdministrationError('category_not_found');
        this.categories.splice(index, 1);
      },
      listRelevanceRules: async () => this.relevanceRules,
      createRelevanceRule: async (input) => {
        const value = record(input);
        const rule: AdminRelevanceRuleReadModel = {
          configKey: String(value.configKey),
          predicateType: String(
            value.predicateType,
          ) as AdminRelevanceRuleReadModel['predicateType'],
          pattern: String(value.pattern),
          action: String(value.action) as AdminRelevanceRuleReadModel['action'],
          priority: Number(value.priority),
          enabled: true,
          reason: String(value.reason),
          ...(typeof value.sourceConfigKey === 'string' && value.sourceConfigKey
            ? { sourceConfigKey: value.sourceConfigKey }
            : {}),
          ...(typeof value.categoryConfigKey === 'string' &&
          value.categoryConfigKey
            ? { categoryConfigKey: value.categoryConfigKey }
            : {}),
        };
        this.relevanceRules.push(rule);
        return rule;
      },
      getRelevanceRule: async (key) => this.rule(String(key)),
      updateRelevanceRule: async (key, input) => {
        const rule = this.rule(String(key));
        Object.assign(rule, record(input));
        return rule;
      },
      setRelevanceRuleEnabled: async (key, input) => {
        const rule = this.rule(String(key));
        const replacement = {
          ...rule,
          enabled: record(input).enabled === true,
        };
        this.relevanceRules.splice(
          this.relevanceRules.indexOf(rule),
          1,
          replacement,
        );
        return replacement;
      },
      deleteRelevanceRule: async (key) => {
        const index = this.relevanceRules.findIndex(
          (value) => value.configKey === String(key),
        );
        if (index < 0)
          throw new EditorialAdministrationError('relevance_rule_not_found');
        this.relevanceRules.splice(index, 1);
      },
    };
  }

  private category(key: string) {
    const value = this.categories.find(
      (candidate) => candidate.configKey === key,
    );
    if (!value) throw new EditorialAdministrationError('category_not_found');
    return value;
  }
  private rule(key: string) {
    const value = this.relevanceRules.find(
      (candidate) => candidate.configKey === key,
    );
    if (!value)
      throw new EditorialAdministrationError('relevance_rule_not_found');
    return value;
  }

  endpointService(): EndpointAdministrationService {
    return {
      listEndpoints: async (sourceKey) => {
        this.requireSource(String(sourceKey));
        return this.endpoints.get(String(sourceKey)) ?? [];
      },
      getEndpoint: async (sourceKey, endpointKey) =>
        this.requireEndpoint(String(sourceKey), String(endpointKey)),
      createEndpoint: async (sourceKey, input) => {
        const key = String(sourceKey);
        this.requireSource(key);
        const endpoint = endpointFromBody(key, record(input));
        const endpoints = this.endpoints.get(key) ?? [];
        endpoints.push(endpoint);
        this.endpoints.set(key, endpoints);
        this.syncEndpointCount(key);
        return endpoint;
      },
      replaceEndpointConfiguration: async (sourceKey, endpointKey, input) => {
        const current = this.requireEndpoint(
          String(sourceKey),
          String(endpointKey),
        );
        const body = record(input);
        const replacement = this.replaceEndpoint(
          current.sourceConfigKey,
          current.configKey,
          {
            ...current,
            ...endpointConfigurationFromBody(body),
          },
        );
        if (replacement.endpointType === 'html_listing') {
          const unchanged =
            current.endpointType === 'html_listing' &&
            JSON.stringify(current.htmlListingProfile) ===
              JSON.stringify(replacement.htmlListingProfile);
          return this.replaceEndpoint(
            current.sourceConfigKey,
            current.configKey,
            {
              ...replacement,
              htmlListingProfileRevision: unchanged
                ? (current.htmlListingProfileRevision ?? 1)
                : (current.htmlListingProfileRevision ?? 0) + 1,
            },
          );
        }
        return replacement;
      },
      setEndpointApproval: async (sourceKey, endpointKey, input) => {
        const current = this.requireEndpoint(
          String(sourceKey),
          String(endpointKey),
        );
        return this.replaceEndpoint(
          current.sourceConfigKey,
          current.configKey,
          {
            ...current,
            approvalState: String(record(input).approvalState) as
              'approved' | 'unapproved',
          },
        );
      },
      setEndpointOperationalState: async (sourceKey, endpointKey, input) => {
        const current = this.requireEndpoint(
          String(sourceKey),
          String(endpointKey),
        );
        return this.replaceEndpoint(
          current.sourceConfigKey,
          current.configKey,
          {
            ...current,
            operationalState: String(record(input).operationalState) as
              'enabled' | 'paused' | 'disabled',
          },
        );
      },
      setEndpointLifecycle: async (sourceKey, endpointKey, input) => {
        const current = this.requireEndpoint(
          String(sourceKey),
          String(endpointKey),
        );
        return this.replaceEndpoint(
          current.sourceConfigKey,
          current.configKey,
          {
            ...current,
            lifecycleState: String(record(input).lifecycleState) as
              'active' | 'archived',
            operationalState: 'disabled',
          },
        );
      },
      checkNow: async (sourceKey, endpointKey) => {
        this.requireEndpoint(String(sourceKey), String(endpointKey));
        if (this.checkNowIneligible) {
          throw new EndpointAdministrationError(
            'endpoint_not_collectable',
            'endpoint_paused',
          );
        }
        this.checkNowCalls += 1;
        return {
          disposition:
            this.checkNowCalls === 1 ? 'queued' : 'already_outstanding',
          job: {
            id: '70000000-0000-4000-8000-000000000001',
            triggerKind: 'manual',
            status: 'queued',
            availableAt: new Date('2026-08-14T12:30:00.000Z'),
            attemptNumber: 1,
          },
        };
      },
      getEndpointHealth: async (sourceKey, endpointKey) => {
        const endpoint = this.requireEndpoint(
          String(sourceKey),
          String(endpointKey),
        );
        const source = this.requireSource(endpoint.sourceConfigKey);
        return {
          sourceConfigKey: source.configKey,
          endpointConfigKey: endpoint.configKey,
          publicationActiveForCollection: true,
          sourceApprovalState: source.approvalState,
          sourceLifecycleState: source.lifecycleState,
          sourceOperationalState: source.operationalState,
          endpointApprovalState: endpoint.approvalState,
          endpointLifecycleState: endpoint.lifecycleState,
          endpointOperationalState: endpoint.operationalState,
          derivedHealth: 'healthy',
          lastAttemptAt: new Date('2026-08-14T12:00:00.000Z'),
          lastSuccessAt: new Date('2026-08-14T12:00:00.000Z'),
          lastFailureAt: new Date('2026-08-13T12:00:00.000Z'),
          nextDueAt: new Date('2026-08-14T12:05:00.000Z'),
          cooldownUntil: null,
          consecutiveFailureCount: 0,
          pollIntervalSeconds: endpoint.pollIntervalSeconds,
        };
      },
      listRecentRuns: async (sourceKey, endpointKey, limit) => {
        const endpoint = this.requireEndpoint(
          String(sourceKey),
          String(endpointKey),
        );
        return {
          sourceConfigKey: endpoint.sourceConfigKey,
          endpointConfigKey: endpoint.configKey,
          limit: limit === undefined ? 20 : Number(limit),
          runs: [
            {
              id: '80000000-0000-4000-8000-000000000001',
              triggerKind: 'manual',
              startedAt: new Date('2026-08-14T12:00:00.000Z'),
              finishedAt: new Date('2026-08-14T12:00:02.000Z'),
              runStatus: 'succeeded',
              transportStatus: 'succeeded',
              parserStatus: 'succeeded',
              parserKind:
                endpoint.endpointType === 'html_listing'
                  ? 'html_listing'
                  : 'rss_atom',
              parserVersion: '1',
              htmlListingProfileRevision:
                endpoint.htmlListingProfileRevision ?? null,
              parserItemFailureCount:
                endpoint.endpointType === 'html_listing' ? 1 : 0,
              parserDiagnosticCode:
                endpoint.endpointType === 'html_listing'
                  ? 'required_field_missing'
                  : null,
              parserDiagnosticDetail:
                endpoint.endpointType === 'html_listing'
                  ? 'One listing row did not include a required field.'
                  : null,
              normalizationStatus: 'succeeded',
              processingStatus: 'succeeded',
              outcomeCode: 'content',
              retryClassification: null,
              httpStatusCode: 200,
              redirectCount: 0,
              transportElapsedMilliseconds: 125,
              wireByteCount: 1000,
              decompressedByteCount: 1500,
              rawItemCount: 5,
              sourceItemFilteredCount: 2,
              normalizedCandidateCount: 3,
              normalizationFailureCount: 0,
              articleLinkRejectionCount: 0,
              createdCount: 3,
              updatedCount: 0,
              unchangedCount: 0,
              rejectedCount: 0,
              excludedCount: 0,
              failedCount: 0,
              errorCode: 'fixture_timeout',
              errorDetail: this.longRunError,
            },
          ],
        };
      },
    };
  }

  private requireSource(key: string): AdminSourceReadModel {
    const source = this.sources.find(
      (candidate) => candidate.configKey === key,
    );
    if (source === undefined)
      throw new SourceAdministrationError('source_not_found');
    return source;
  }

  private requireEndpoint(
    sourceKey: string,
    endpointKey: string,
  ): AdminEndpointReadModel {
    const endpoint = this.endpoints
      .get(sourceKey)
      ?.find((candidate) => candidate.configKey === endpointKey);
    if (endpoint === undefined)
      throw new EndpointAdministrationError('endpoint_not_found');
    return endpoint;
  }

  private replaceSource(
    key: string,
    replacement: AdminSourceReadModel,
  ): AdminSourceReadModel {
    const index = this.sources.findIndex((source) => source.configKey === key);
    if (index === -1) throw new SourceAdministrationError('source_not_found');
    this.sources[index] = Object.freeze(replacement);
    return this.sources[index]!;
  }

  private replaceEndpoint(
    sourceKey: string,
    endpointKey: string,
    replacement: AdminEndpointReadModel,
  ): AdminEndpointReadModel {
    const endpoints = this.endpoints.get(sourceKey) ?? [];
    const index = endpoints.findIndex(
      (endpoint) => endpoint.configKey === endpointKey,
    );
    if (index === -1)
      throw new EndpointAdministrationError('endpoint_not_found');
    endpoints[index] = Object.freeze(replacement);
    return endpoints[index]!;
  }

  private syncEndpointCount(sourceKey: string): void {
    const source = this.requireSource(sourceKey);
    this.replaceSource(sourceKey, {
      ...source,
      endpointCount: this.endpoints.get(sourceKey)?.length ?? 0,
    });
  }
}

function sourceFromBody(body: Record<string, unknown>): AdminSourceReadModel {
  return Object.freeze({
    configKey: String(body.configKey),
    ...sourceConfigurationFromBody(body),
    approvalState: String(body.approvalState) as 'approved' | 'unapproved',
    lifecycleState: 'active',
    operationalState: String(body.operationalState) as
      'enabled' | 'paused' | 'disabled',
    endpointCount: 0,
  });
}

function sourceConfigurationFromBody(body: Record<string, unknown>) {
  const categoryKey = body.defaultCategoryConfigKey;
  return {
    displayName: String(body.displayName),
    siteUrl: String(body.siteUrl),
    priority: Number(body.priority),
    approvedDomains:
      body.approvedDomains as AdminSourceReadModel['approvedDomains'],
    defaultCategory: categoryKey === null ? null : category,
    rssAtomAdmissionPhrases:
      body.rssAtomAdmissionPhrases as AdminSourceReadModel['rssAtomAdmissionPhrases'],
  };
}

function endpointFromBody(
  sourceConfigKey: string,
  body: Record<string, unknown>,
): AdminEndpointReadModel {
  return Object.freeze({
    sourceConfigKey,
    configKey: String(body.configKey),
    ...endpointConfigurationFromBody(body),
    approvalState: String(body.approvalState) as 'approved' | 'unapproved',
    lifecycleState: 'active',
    operationalState: String(body.operationalState) as
      'enabled' | 'paused' | 'disabled',
  });
}

function endpointConfigurationFromBody(body: Record<string, unknown>) {
  const rules =
    body.endpointDomainRules as AdminEndpointReadModel['endpointDomainRules'];
  const endpointType = body.endpointType as 'rss_atom' | 'html_listing';
  if (endpointType !== 'rss_atom' && endpointType !== 'html_listing') {
    throw new EndpointAdministrationError('invalid_request');
  }
  if (
    endpointType === 'html_listing' &&
    (typeof body.htmlListingProfile !== 'object' ||
      body.htmlListingProfile === null ||
      Array.isArray(body.htmlListingProfile))
  ) {
    throw new EndpointAdministrationError('invalid_request');
  }
  if (endpointType === 'html_listing') {
    const profile = body.htmlListingProfile as Record<string, unknown>;
    for (const key of ['title', 'articleLink']) {
      const descriptor = profile[key];
      const descriptorRecord =
        typeof descriptor === 'object' &&
        descriptor !== null &&
        !Array.isArray(descriptor)
          ? (descriptor as Record<string, unknown>)
          : null;
      if (
        descriptorRecord === null ||
        typeof descriptorRecord.selector !== 'string' ||
        descriptorRecord.selector.trim() === '' ||
        descriptorRecord.selector.includes(':')
      ) {
        throw new EndpointAdministrationError('invalid_request');
      }
    }
    if (
      typeof profile.itemSelector !== 'string' ||
      profile.itemSelector.trim() === '' ||
      profile.itemSelector.includes(':')
    ) {
      throw new EndpointAdministrationError('invalid_request');
    }
  }
  return {
    endpointUrl: String(body.endpointUrl),
    endpointType,
    ...(endpointType === 'html_listing'
      ? {
          htmlListingProfile: body.htmlListingProfile as NonNullable<
            AdminEndpointReadModel['htmlListingProfile']
          >,
          htmlListingProfileRevision: 1,
        }
      : {
          htmlListingProfile: null,
          htmlListingProfileRevision: null,
        }),
    pollIntervalSeconds: Number(body.pollIntervalSeconds),
    endpointDomainRules: rules,
    inheritsSourceDomainPolicy: rules.length === 0,
    defaultCategory: body.defaultCategoryConfigKey === null ? null : category,
  };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected browser test object body');
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length === 0 ? null : normalized;
}

async function startHarnessServer(
  harness: AdminHarness,
  adminEnabled = true,
): Promise<WebServer> {
  const sourceRoutes = registerSourceAdministrationRoutes(
    harness.sourceService(),
  );
  const endpointRoutes = registerEndpointAdministrationRoutes(
    harness.endpointService(),
  );
  const editorialRoutes = registerEditorialAdministrationRoutes(
    harness.editorialService(),
  );
  const publicationRoutes = registerPublicationAdministrationRoutes(
    harness.publicationService(),
  );
  return startWebServer(
    createWebApp(
      {
        readiness: { checkReady: async () => true },
        publicFeed: { read: async () => publicFeed },
      },
      {
        adminEnabled,
        registerAdminApiRoutes: (router) => {
          sourceRoutes(router);
          endpointRoutes(router);
          editorialRoutes(router);
          publicationRoutes(router);
        },
      },
    ),
    { host: '127.0.0.1', port: 0 },
  );
}

async function withAdminPage(
  browser: Browser,
  harness: AdminHarness,
  contextOptions: Parameters<Browser['newContext']>[0],
  work: (page: Page, context: BrowserContext) => Promise<void>,
): Promise<void> {
  const server = await startHarnessServer(harness);
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  try {
    const response = await page.goto(`${baseUrl(server)}/admin`);
    assert.equal(response?.status(), 200);
    await work(page, context);
  } finally {
    await context.close();
    await server.close();
  }
}

async function waitForSource(page: Page, key: string): Promise<void> {
  await page.waitForFunction((sourceKey) => {
    const keyInput = document.querySelector(
      '[data-source-form] [name="configKey"]',
    );
    return keyInput instanceof HTMLInputElement && keyInput.value === sourceKey;
  }, key);
}

async function waitForEndpoint(page: Page, key: string): Promise<void> {
  await page.waitForFunction((endpointKey) => {
    const keyInput = document.querySelector(
      '[data-endpoint-form] [name="configKey"]',
    );
    return (
      keyInput instanceof HTMLInputElement && keyInput.value === endpointKey
    );
  }, key);
}

function baseUrl(server: WebServer): string {
  return `http://${server.host}:${String(server.port)}`;
}
