import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';

import {
  DistributionProfileAdministrationError,
  type AdminDistributionProfileReadModel,
  type DistributionProfileAdministrationService,
} from '../../src/admin/distribution-profile-administration.ts';
import type {
  AdminProfileAiReadModel,
  ProfileAiAdministrationService,
} from '../../src/admin/profile-ai-administration.ts';
import type { EndpointAdministrationService } from '../../src/admin/endpoint-administration.ts';
import type {
  AdminSourceReadModel,
  SourceAdministrationService,
} from '../../src/admin/source-administration.ts';
import { createWebApp } from '../../src/app/web/create-app.ts';
import { registerDistributionProfileAdministrationRoutes } from '../../src/app/web/distribution-profile-administration-router.ts';
import { registerProfileAiAdministrationRoutes } from '../../src/app/web/profile-ai-administration-router.ts';
import { registerEndpointAdministrationRoutes } from '../../src/app/web/endpoint-administration-router.ts';
import { registerSourceAdministrationRoutes } from '../../src/app/web/source-administration-router.ts';
import { startWebServer } from '../../src/app/web/server.ts';
import type { PublicFeed } from '../../src/public-feed/repository.ts';

const categories = Object.freeze([
  Object.freeze({ configKey: 'industry_news', displayName: 'Industry news' }),
  Object.freeze({ configKey: 'markets', displayName: 'Markets' }),
]);
const sources: readonly AdminSourceReadModel[] = Object.freeze([
  Object.freeze({
    configKey: 'journal',
    displayName: 'Independent Publishing Journal',
    siteUrl: 'https://journal.example.test/',
    approvalState: 'approved' as const,
    lifecycleState: 'active' as const,
    operationalState: 'enabled' as const,
    priority: 10,
    approvedDomains: Object.freeze([]),
    defaultCategory: categories[0]!,
    rssAtomAdmissionPhrases: Object.freeze([]),
    endpointCount: 0,
  }),
  Object.freeze({
    configKey: 'archive',
    displayName: 'Archive desk',
    siteUrl: 'https://archive.example.test/',
    approvalState: 'unapproved' as const,
    lifecycleState: 'active' as const,
    operationalState: 'disabled' as const,
    priority: 5,
    approvedDomains: Object.freeze([]),
    defaultCategory: null,
    rssAtomAdmissionPhrases: Object.freeze([]),
    endpointCount: 0,
  }),
]);
const publicFeed: PublicFeed = Object.freeze({
  publication: Object.freeze({
    name: 'Profile browser fixture',
    description: null,
    logoPath: null,
    accentColor: null,
    presentationTimezone: null,
  }),
  sourceChoices: Object.freeze([]),
  categoryChoices: Object.freeze([]),
  nextCursor: null,
  items: Object.freeze([]),
});

describe('Distribution Profile administration page browser behavior', () => {
  let browser: Browser;

  before(async () => {
    browser = await chromium.launch({ headless: true });
  });
  after(async () => browser?.close());

  it('creates, configures, associates, and transitions Profiles through the shared admin client', async () => {
    const harness = new ProfileHarness();
    const headers: string[] = [];
    await withPage(
      browser,
      harness,
      { viewport: { width: 390, height: 844 } },
      async (page) => {
        page.on('request', (request) => {
          if (
            request.url().includes('/admin/api/distribution-profiles') &&
            request.method() !== 'GET'
          ) {
            headers.push(
              request.headers()['x-news-scraper-admin-request'] ?? '',
            );
          }
        });
        await page.getByRole('tab', { name: /^Sources/u }).click();
        await page.locator('[data-source-form] [name="configKey"]').waitFor();
        const profilesTab = page.getByRole('tab', { name: /^Profiles/u });
        await profilesTab.focus();
        await page.keyboard.press('Enter');
        await page
          .locator('[data-profile-list-state][data-list-state="empty"]')
          .waitFor();
        await page.getByRole('button', { name: 'New Profile' }).click();
        const create = page.locator('[data-profile-create-form]');
        await create.locator('[name="configKey"]').fill('publisher_news');
        await create.locator('[name="displayName"]').fill('Publisher news');
        await create.locator('[name="resultLimit"]').fill('75');
        await page
          .getByRole('button', { name: 'Create draft Profile' })
          .click();
        await page
          .locator('[data-profile-state-summary]')
          .filter({ hasText: 'Draft' })
          .waitFor();
        assert.equal(
          await page
            .locator('[data-profile-configuration-form] [name="configKey"]')
            .isDisabled(),
          true,
        );

        const configuration = page.locator('[data-profile-configuration-form]');
        await configuration
          .locator('[name="displayName"]')
          .fill('Publisher updates');
        await configuration.locator('[name="resultLimit"]').fill('120');
        await page
          .getByRole('button', { name: 'Save Profile configuration' })
          .click();
        assert.equal(harness.profile('publisher_news').resultLimit, 120);
        assert.equal(
          harness.profile('publisher_news').displayName,
          'Publisher updates',
        );

        const association = page.locator('[data-profile-association-form]');
        await association
          .locator('[name="sourceConfigKey"]')
          .selectOption('journal');
        await association
          .locator('[name="includeAnyPhrases"]')
          .fill('publishing\nrights');
        await association
          .locator('[name="excludeAnyPhrases"]')
          .fill('sponsored');
        await association
          .getByRole('checkbox', { name: /Industry news/u })
          .check();
        await association.getByRole('checkbox', { name: /Markets/u }).check();
        await page
          .getByRole('button', { name: 'Add Source association' })
          .click();
        assert.deepEqual(harness.profile('publisher_news').sources[0], {
          configKey: 'journal',
          displayName: 'Independent Publishing Journal',
          approvalState: 'approved',
          lifecycleState: 'active',
          includeAnyPhrases: ['publishing', 'rights'],
          excludeAnyPhrases: ['sponsored'],
          categoryConfigKeys: ['industry_news', 'markets'],
        });
        await association
          .locator('[name="sourceConfigKey"]')
          .selectOption('archive');
        await page
          .getByRole('button', { name: 'Add Source association' })
          .click();
        await page
          .getByRole('button', { name: 'Remove association' })
          .last()
          .click();
        await page.waitForFunction(
          () =>
            document.querySelectorAll('[data-profile-association-edit]')
              .length === 1,
        );
        assert.equal(harness.profile('publisher_news').sources.length, 1);
        await page.getByRole('button', { name: 'Edit association' }).click();
        await association
          .locator('[name="includeAnyPhrases"]')
          .fill('publishing');
        await page
          .getByRole('button', { name: 'Save Source association' })
          .click();
        await page.getByRole('button', { name: 'Activate' }).click();
        await page.getByRole('button', { name: 'Disable' }).waitFor();
        await page.getByRole('button', { name: 'Disable' }).click();
        await page.getByRole('button', { name: 'Reactivate' }).click();
        await page.getByRole('button', { name: 'Disable' }).waitFor();
        assert.ok(headers.length >= 6);
        assert.ok(headers.every((header) => header === '1'));
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          true,
        );
        await page.getByRole('button', { name: 'Refresh Profiles' }).click();
        await page
          .getByRole('button', { name: /Publisher updates/u })
          .waitFor();
        await page.reload();
        await page.getByRole('tab', { name: /^Profiles/u }).click();
        await page.getByRole('button', { name: /Publisher updates/u }).click();
        assert.equal(
          await page
            .locator('[data-profile-configuration-form] [name="resultLimit"]')
            .inputValue(),
          '120',
        );
        assert.match(
          await page.locator('[data-profile-association-list]').innerText(),
          /Include: publishing/u,
        );
      },
    );
  });

  it('keeps selected state on bounded lifecycle, removal, and unexpected errors', async () => {
    const harness = new ProfileHarness();
    harness.addProfile(activeProfile());
    await withPage(browser, harness, {}, async (page) => {
      await page.getByRole('tab', { name: /^Profiles/u }).click();
      await page.getByRole('button', { name: /Publisher news/u }).click();
      harness.rejectActivation = true;
      await page.getByRole('button', { name: 'Disable' }).click();
      await page.getByRole('button', { name: 'Reactivate' }).waitFor();
      await page.getByRole('button', { name: 'Reactivate' }).click();
      await page.waitForTimeout(300);
      assert.match(
        await page.locator('[data-profile-configuration-error]').innerText(),
        /must retain/u,
      );
      assert.equal(
        await page
          .locator('[data-profile-configuration-form] [name="configKey"]')
          .inputValue(),
        'publisher_news',
      );
      harness.rejectActivation = false;
      await page.getByRole('button', { name: 'Reactivate' }).click();
      await page.getByRole('button', { name: 'Disable' }).waitFor();
      await page.getByRole('button', { name: 'Remove association' }).click();
      await page
        .locator('[data-profile-association-error]')
        .filter({ hasText: /must retain/u })
        .waitFor();
      harness.unexpectedFailure = true;
      await page.getByRole('button', { name: 'Disable' }).click();
      await page
        .locator('[data-profile-configuration-error]')
        .filter({ hasText: /Profile service/u })
        .waitFor();
      assert.doesNotMatch(
        await page.locator('[data-profile-configuration-error]').innerText(),
        /SQLSTATE|stack|secret/u,
      );
    });
  });

  it('edits Profile-scoped AI settings and shows bounded manual generation state', async () => {
    const harness = new ProfileHarness();
    harness.addProfile(activeProfile());
    await withPage(browser, harness, {}, async (page, _context, ai) => {
      await page.getByRole('tab', { name: /^Profiles/u }).click();
      await page.getByRole('button', { name: /Publisher news/u }).click();
      await page
        .locator('[data-profile-ai-state][data-profile-ai-state="ready"]')
        .waitFor();
      const form = page.locator('[data-profile-ai-configuration-form]');
      await form
        .getByRole('checkbox', { name: /Enable this Profile/u })
        .check();
      await form.locator('[name="lookbackDays"]').fill('14');
      await form.locator('[name="maxArticles"]').fill('10');
      await page.getByRole('button', { name: 'Save AI settings' }).click();
      assert.deepEqual(ai.configuration('publisher_news'), {
        digestEnabled: true,
        lookbackDays: 14,
        maxArticles: 10,
        digestStyleGuidance: null,
      });
      await page.getByRole('button', { name: 'Generate now' }).click();
      await page
        .locator('[data-profile-ai-generation-result]')
        .filter({ hasText: /completed successfully/u })
        .waitFor();
      assert.equal(ai.generateCalls, 1);
      assert.match(
        await page.locator('[data-profile-ai-active-digest]').innerText(),
        /Current|google-gemini/u,
      );
      assert.doesNotMatch(
        await page.content(),
        /NEWS_SCRAPER_GEMINI_API_KEY|Gemini API key|secret value/u,
      );
    });
  });

  it('does not paint a stale Profile AI response after switching Profiles', async () => {
    const harness = new ProfileHarness();
    harness.addProfile(activeProfile());
    harness.addProfile({
      ...activeProfile(),
      configKey: 'opportunities',
      displayName: 'Opportunities',
    });
    await withPage(browser, harness, {}, async (page, _context, ai) => {
      ai.setConfiguration('publisher_news', {
        digestEnabled: true,
        lookbackDays: 30,
        maxArticles: 20,
        digestStyleGuidance: null,
      });
      ai.delayProfileRead('publisher_news');
      await page.getByRole('tab', { name: /^Profiles/u }).click();
      await page.getByRole('button', { name: /Publisher news/u }).click();
      await ai.waitForSlowRead();
      await page.getByRole('button', { name: 'Opportunities' }).click();
      await page
        .locator('[data-profile-ai-state][data-profile-ai-state="ready"]')
        .waitFor();
      ai.releaseSlowRead();
      await page.waitForTimeout(100);
      assert.equal(
        await page
          .locator('[data-profile-ai-configuration-form] [name="lookbackDays"]')
          .inputValue(),
        '7',
      );
    });
  });
});

class ProfileHarness {
  readonly profiles: AdminDistributionProfileReadModel[] = [];
  rejectActivation = false;
  unexpectedFailure = false;

  profile(key: string): AdminDistributionProfileReadModel {
    const profile = this.profiles.find(
      (candidate) => candidate.configKey === key,
    );
    if (!profile)
      throw new DistributionProfileAdministrationError('profile_not_found');
    return profile;
  }
  addProfile(profile: AdminDistributionProfileReadModel): void {
    this.profiles.push(profile);
  }
  service(): DistributionProfileAdministrationService {
    return {
      listProfiles: async () => this.profiles,
      getProfile: async (key) => this.profile(String(key)),
      createProfile: async (input) => {
        const value = record(input);
        const profile: AdminDistributionProfileReadModel = {
          configKey: String(value.configKey),
          displayName: String(value.displayName),
          lifecycleState: 'draft',
          resultLimit: Number(value.resultLimit),
          sources: [],
        };
        this.addProfile(profile);
        return profile;
      },
      replaceProfileConfiguration: async (key, input) => {
        const current = this.profile(String(key));
        return this.replace(current, {
          ...current,
          ...record(input),
        } as AdminDistributionProfileReadModel);
      },
      replaceSourceAssociation: async (key, sourceKey, input) => {
        const current = this.profile(String(key));
        const source = sources.find(
          (candidate) => candidate.configKey === String(sourceKey),
        );
        if (!source)
          throw new DistributionProfileAdministrationError('source_not_found');
        const value = record(input);
        const association = {
          configKey: source.configKey,
          displayName: source.displayName,
          approvalState: source.approvalState,
          lifecycleState: source.lifecycleState,
          includeAnyPhrases: value.includeAnyPhrases as string[],
          excludeAnyPhrases: value.excludeAnyPhrases as string[],
          categoryConfigKeys: value.categoryConfigKeys as string[],
        };
        return this.replace(current, {
          ...current,
          sources: [
            ...current.sources.filter(
              (item) => item.configKey !== source.configKey,
            ),
            association,
          ],
        });
      },
      removeSourceAssociation: async (key, sourceKey) => {
        const current = this.profile(String(key));
        if (
          current.lifecycleState === 'active' &&
          current.sources.length === 1
        ) {
          throw new DistributionProfileAdministrationError(
            'profile_requires_usable_source',
          );
        }
        return this.replace(current, {
          ...current,
          sources: current.sources.filter(
            (item) => item.configKey !== String(sourceKey),
          ),
        });
      },
      setProfileLifecycle: async (key, input) => {
        if (this.unexpectedFailure)
          throw new Error('SQLSTATE fixture secret stack');
        const current = this.profile(String(key));
        const requested = String(record(input).lifecycleState) as
          'active' | 'disabled';
        if (requested === 'active' && this.rejectActivation) {
          throw new DistributionProfileAdministrationError(
            'profile_requires_usable_source',
          );
        }
        return this.replace(current, { ...current, lifecycleState: requested });
      },
    };
  }
  private replace(
    current: AdminDistributionProfileReadModel,
    profile: AdminDistributionProfileReadModel,
  ): AdminDistributionProfileReadModel {
    this.profiles.splice(this.profiles.indexOf(current), 1, profile);
    return profile;
  }
}

class ProfileAiHarness {
  readonly states = new Map<string, AdminProfileAiReadModel>();
  generateCalls = 0;
  #slowProfileKey: string | undefined;
  #slowReadStarted: Promise<void> | undefined;
  #markSlowReadStarted: (() => void) | undefined;
  #slowReadRelease: (() => void) | undefined;
  #slowRead: Promise<void> | undefined;

  configuration(key: string): AdminProfileAiReadModel['configuration'] {
    return this.state(key).configuration;
  }

  setConfiguration(
    key: string,
    configuration: AdminProfileAiReadModel['configuration'],
  ): void {
    const current = this.state(key);
    this.states.set(key, Object.freeze({ ...current, configuration }));
  }

  delayProfileRead(key: string): void {
    this.#slowProfileKey = key;
    this.#slowReadStarted = new Promise((resolve) => {
      this.#markSlowReadStarted = resolve;
    });
    this.#slowRead = new Promise((resolve) => {
      this.#slowReadRelease = resolve;
    });
  }

  async waitForSlowRead(): Promise<void> {
    await this.#slowReadStarted;
  }

  releaseSlowRead(): void {
    this.#slowReadRelease?.();
  }

  service(): ProfileAiAdministrationService {
    return {
      getProfileAi: async (key) => {
        const profileKey = String(key);
        if (profileKey === this.#slowProfileKey) {
          this.#markSlowReadStarted?.();
          await this.#slowRead;
        }
        return this.state(profileKey);
      },
      updateProfileAiConfiguration: async (key, input) => {
        const current = this.state(String(key));
        const value = record(input);
        const next = Object.freeze({
          ...current,
          configuration: Object.freeze({
            digestEnabled: Boolean(value.digestEnabled),
            lookbackDays: Number(value.lookbackDays),
            maxArticles: Number(value.maxArticles),
            digestStyleGuidance: current.configuration.digestStyleGuidance,
          }),
        });
        this.states.set(next.profileKey, next);
        return next;
      },
      forceGenerateProfileDigest: async (key) => {
        this.generateCalls += 1;
        const current = this.state(String(key));
        const next = Object.freeze({
          ...current,
          activeDigest: Object.freeze({
            generatedAt: new Date('2026-08-28T12:00:00.000Z'),
            freshness: 'current' as const,
            inputArticleCount: 2,
            provider: 'google-gemini',
            model: 'gemini-fixture',
          }),
          latestAttempt: Object.freeze({
            triggerKind: 'manual' as const,
            outcome: 'success' as const,
            startedAt: new Date('2026-08-28T12:00:00.000Z'),
            completedAt: new Date('2026-08-28T12:00:01.000Z'),
            failureCategory: null,
            urlContextSucceededCount: 2,
            urlContextFailedCount: 0,
          }),
        });
        this.states.set(next.profileKey, next);
        return Object.freeze({ result: 'generated' as const, ai: next });
      },
    };
  }

  private state(key: string): AdminProfileAiReadModel {
    const existing = this.states.get(key);
    if (existing !== undefined) return existing;
    const created = Object.freeze({
      profileKey: key,
      configuration: Object.freeze({
        digestEnabled: false,
        lookbackDays: 7,
        maxArticles: 20,
        digestStyleGuidance: null,
      }),
      cadence: Object.freeze({
        kind: 'twice_daily' as const,
        slots: Object.freeze(['00:00Z', '12:00Z']) as readonly [
          '00:00Z',
          '12:00Z',
        ],
      }),
      activeDigest: null,
      latestAttempt: null,
    });
    this.states.set(key, created);
    return created;
  }
}

function activeProfile(): AdminDistributionProfileReadModel {
  return {
    configKey: 'publisher_news',
    displayName: 'Publisher news',
    lifecycleState: 'active',
    resultLimit: 100,
    sources: [
      {
        configKey: 'journal',
        displayName: 'Independent Publishing Journal',
        approvalState: 'approved',
        lifecycleState: 'active',
        includeAnyPhrases: [],
        excludeAnyPhrases: [],
        categoryConfigKeys: [],
      },
    ],
  };
}

function sourceService(): SourceAdministrationService {
  return {
    listSources: async () => sources,
    getSource: async (key: unknown) => source(String(key)),
  } as unknown as SourceAdministrationService;
}

function endpointService(): EndpointAdministrationService {
  return {
    listEndpoints: async () => [],
  } as unknown as EndpointAdministrationService;
}

function source(key: string): AdminSourceReadModel {
  const value = sources.find((candidate) => candidate.configKey === key);
  if (!value) throw new Error('Missing fixture Source');
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected request record');
  }
  return value as Record<string, unknown>;
}

async function withPage(
  browser: Browser,
  harness: ProfileHarness,
  options: Parameters<Browser['newContext']>[0],
  work: (
    page: Page,
    context: BrowserContext,
    ai: ProfileAiHarness,
  ) => Promise<void>,
): Promise<void> {
  const ai = new ProfileAiHarness();
  const server = await startWebServer(
    createWebApp(
      {
        readiness: { checkReady: async () => true },
        publicFeed: { read: async () => publicFeed },
      },
      {
        adminEnabled: true,
        registerAdminApiRoutes: (router) => {
          registerSourceAdministrationRoutes(sourceService())(router);
          registerEndpointAdministrationRoutes(endpointService())(router);
          router.get('/categories', (_request, response) =>
            response.json({ categories }),
          );
          registerDistributionProfileAdministrationRoutes(harness.service())(
            router,
          );
          registerProfileAiAdministrationRoutes(ai.service())(router);
        },
      },
    ),
    { host: '127.0.0.1', port: 0 },
  );
  const context = await browser.newContext(options);
  const page = await context.newPage();
  try {
    const response = await page.goto(
      `http://${server.host}:${String(server.port)}/admin`,
    );
    assert.equal(response?.status(), 200);
    await work(page, context, ai);
  } finally {
    await context.close();
    await server.close();
  }
}
