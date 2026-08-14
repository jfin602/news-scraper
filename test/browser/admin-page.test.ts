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
import { createWebApp } from '../../src/app/web/create-app.ts';
import { registerEndpointAdministrationRoutes } from '../../src/app/web/endpoint-administration-router.ts';
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

const publicFeed: PublicFeed = Object.freeze({
  publication: Object.freeze({
    name: 'Public regression publication',
    description: null,
    logoPath: null,
    accentColor: null,
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
}

class AdminHarness {
  readonly categories = [category];
  readonly sources: AdminSourceReadModel[];
  readonly endpoints = new Map<string, AdminEndpointReadModel[]>();
  readonly sourceListError: boolean;
  readonly longRunError: string;
  rejectNextSourceUpdate = false;
  checkNowIneligible = false;
  checkNowCalls = 0;
  inlineCollectionCalls = 0;

  constructor(options: HarnessOptions = {}) {
    this.sources = [...(options.sources ?? [initialSource])];
    this.sourceListError = options.sourceListError === true;
    this.longRunError =
      options.longRunError ?? 'A bounded fixture timeout detail.';
    if (this.sources.some((source) => source.configKey === 'journal')) {
      this.endpoints.set('journal', [initialEndpoint]);
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
      listCategories: async () => this.categories,
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
        return this.replaceEndpoint(
          current.sourceConfigKey,
          current.configKey,
          {
            ...current,
            ...endpointConfigurationFromBody(body),
          },
        );
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
  return {
    endpointUrl: String(body.endpointUrl),
    endpointType: 'rss_atom' as const,
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
