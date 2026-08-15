import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromium, type Browser, type Page } from 'playwright';

import { createWebApp } from '../../src/app/web/create-app.ts';
import { startWebServer, type WebServer } from '../../src/app/web/server.ts';

const articleIds = {
  primary: '20000000-0000-4000-8000-000000000001',
  nonPrimary: '20000000-0000-4000-8000-000000000002',
  hidden: '20000000-0000-4000-8000-000000000003',
  archived: '20000000-0000-4000-8000-000000000004',
} as const;
const candidateId = '30000000-0000-4000-8000-000000000001';
const groupId = '40000000-0000-4000-8000-000000000001';

describe('Article moderation page browser behavior', () => {
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

  it('supports bounded Article filtering, detail inspection, moderation, and mobile layout', async () => {
    const harness = new ModerationHarness();
    const server = await startHarnessServer(harness);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    const mutationHeaders: string[] = [];
    page.on('request', (request) => {
      if (['POST', 'PUT', 'DELETE'].includes(request.method()))
        mutationHeaders.push(
          request.headers()['x-news-scraper-admin-request'] ?? '',
        );
    });
    try {
      await openArticles(page, server);
      await page.getByRole('button', { name: /Load more Articles/u }).click();
      await page
        .getByRole('button', { name: /Visibility: Archived/u })
        .waitFor();
      assert.equal(
        await page
          .locator(`[data-article-id="${articleIds.nonPrimary}"]`)
          .count(),
        1,
      );

      const filters = page.locator('[data-article-filter-form]');
      await filters.locator('[name="visibilityState"]').selectOption('hidden');
      await filters.getByRole('button', { name: 'Apply filters' }).click();
      await page.getByRole('button', { name: /Visibility: Hidden/u }).waitFor();
      assert.equal(
        await page
          .getByRole('button', { name: /Visibility: Archived/u })
          .count(),
        0,
      );
      await filters.getByRole('button', { name: 'Reset' }).click();
      await filters.locator('[name="q"]').fill('Source headline');
      await filters.locator('[name="sourceConfigKey"]').selectOption('journal');
      await filters
        .locator('[name="categoryConfigKey"]')
        .selectOption('industry_news');
      await filters.getByRole('button', { name: 'Apply filters' }).click();
      await page.locator(`[data-article-id="${articleIds.primary}"]`).waitFor();
      await filters.getByRole('button', { name: 'Reset' }).click();
      await page.locator(`[data-article-id="${articleIds.primary}"]`).click();

      await page
        .locator('[data-article-display-form] [name="displayTitleOverride"]')
        .fill('Operator headline');
      await page.getByRole('button', { name: 'Save display override' }).click();
      await page.getByText('Display-title override saved.').waitFor();
      assert.match(
        await page.locator('[data-article-overview]').innerText(),
        /Source headline/u,
      );
      assert.match(
        await page.locator('[data-article-overview]').innerText(),
        /Operator headline/u,
      );
      await page.getByRole('button', { name: 'Clear override' }).click();
      await page
        .getByText(
          'Display-title override cleared; latest Source headline is active.',
        )
        .waitFor();

      const categoryForm = page.locator('[data-article-category-form]');
      await categoryForm.locator('input[type="checkbox"]').uncheck();
      await categoryForm
        .getByRole('button', { name: 'Save manual Categories' })
        .click();
      await page.getByText('Active empty manual Category set saved.').waitFor();
      assert.match(
        await page.locator('[data-article-overview]').innerText(),
        /Intentionally empty/u,
      );
      await categoryForm
        .getByRole('button', { name: 'Clear manual override' })
        .click();
      await page
        .getByText(
          'Manual Category override cleared; automatic Categories are active.',
        )
        .waitFor();

      await page.getByRole('button', { name: 'Hide Article' }).click();
      await page.getByText('Article hidden.').waitFor();
      await page.getByRole('button', { name: 'Restore Article' }).click();
      await page.getByText('Article restored.').waitFor();
      assert.deepEqual(mutationHeaders.slice(0, 6), [
        '1',
        '1',
        '1',
        '1',
        '1',
        '1',
      ]);

      await page.getByRole('tab', { name: /^Sources/u }).click();
      await page
        .getByRole('button', { name: /Independent Publishing Journal/u })
        .waitFor();
      assert.equal(
        await page
          .getByRole('tab', { name: /^Sources/u })
          .getAttribute('aria-selected'),
        'true',
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
    } finally {
      await context.close();
      await server.close();
    }
  });

  it('handles duplicate review evidence, conflict recovery, actions, errors, focus, and mobile overflow', async () => {
    const harness = new ModerationHarness();
    const server = await startHarnessServer(harness);
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const mutationHeaders: string[] = [];
    page.on('request', (request) => {
      if (['POST', 'PUT', 'DELETE'].includes(request.method()))
        mutationHeaders.push(
          request.headers()['x-news-scraper-admin-request'] ?? '',
        );
    });
    try {
      await openArticles(page, server);
      await page.getByRole('button', { name: /Candidate headline/u }).click();
      await page.getByRole('heading', { name: /confidence 50/u }).waitFor();
      assert.match(
        await page.locator('[data-review-articles]').innerText(),
        /Original URL/u,
      );
      assert.match(
        await page.locator('[data-review-signals]').innerText(),
        /normalized_title_equal/u,
      );
      assert.match(
        await page.locator('[data-review-conflict-message]').innerText(),
        /manual separation/u,
      );

      await page
        .locator('[data-review-action-form] [name="reason"]')
        .fill('Needs a human decision');
      await page
        .getByRole('button', { name: 'Merge candidate Articles' })
        .click();
      await page
        .getByText(/manual separation|topology changed|explicit Primary/u)
        .waitFor();
      await page
        .locator('[data-review-merge-primary]')
        .selectOption(articleIds.primary);
      await page
        .getByRole('button', { name: 'Merge candidate Articles' })
        .click();
      await page.getByText('Duplicate merge saved.').waitFor();

      await page.locator('[data-review-group-select]').selectOption(groupId);
      await page.locator('[data-split-member]').first().check();
      await page
        .getByRole('button', { name: 'Split selected members' })
        .click();
      await page.getByText('Duplicate split saved.').waitFor();

      await page
        .locator('[data-review-merge-primary]')
        .selectOption(articleIds.primary);
      await page
        .getByRole('button', { name: 'Choose selected Primary' })
        .click();
      await page.getByText('Primary selection saved.').waitFor();
      assert.ok(mutationHeaders.length >= 4);
      assert.ok(mutationHeaders.every((value) => value === '1'));

      harness.failNextArticleSearch = true;
      await page.getByRole('button', { name: 'Apply filters' }).click();
      await page
        .getByText('The administration service is temporarily unavailable.')
        .waitFor();
      assert.equal(
        await page.evaluate(
          () =>
            document.activeElement ===
            document.querySelector('[data-article-list-state]'),
        ),
        true,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
    } finally {
      await context.close();
      await server.close();
    }
  });

  it('dismisses a pending duplicate review with a bounded reason', async () => {
    const server = await startHarnessServer(new ModerationHarness());
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    try {
      await openArticles(page, server);
      await page.getByRole('button', { name: /Candidate headline/u }).click();
      await page
        .locator('[data-review-action-form] [name="reason"]')
        .fill('Not the same published item');
      await page.getByRole('button', { name: 'Dismiss candidate' }).click();
      await page.getByText('Dismiss review candidate saved.').waitFor();
      assert.equal(
        await page
          .getByRole('button', { name: 'Dismiss candidate' })
          .isDisabled(),
        true,
      );
    } finally {
      await context.close();
      await server.close();
    }
  });
});

class ModerationHarness {
  failNextArticleSearch = false;
  displayOverride: string | null = null;
  manualCategories: string[] | null = null;
  visibility: Record<string, 'visible' | 'hidden' | 'archived'> = {
    [articleIds.primary]: 'visible',
    [articleIds.nonPrimary]: 'visible',
    [articleIds.hidden]: 'hidden',
    [articleIds.archived]: 'archived',
  };
  reviewState: 'pending' | 'dismissed' | 'merged' = 'pending';
  merged = false;

  categories() {
    return [{ configKey: 'industry_news', displayName: 'Industry news' }];
  }

  sources() {
    return [
      {
        configKey: 'journal',
        displayName: 'Independent Publishing Journal',
        siteUrl: 'https://journal.example.com/',
        approvalState: 'approved',
        lifecycleState: 'active',
        operationalState: 'enabled',
        priority: 10,
        approvedDomains: [],
        defaultCategory: this.categories()[0],
        rssAtomAdmissionPhrases: [],
        endpointCount: 1,
      },
    ];
  }

  article(id: string) {
    const sourceTitle =
      id === articleIds.nonPrimary ? 'Syndicated headline' : 'Source headline';
    const duplicateRole =
      id === articleIds.primary
        ? 'primary'
        : id === articleIds.nonPrimary
          ? 'non_primary'
          : 'ungrouped';
    const group =
      id === articleIds.primary || id === articleIds.nonPrimary
        ? groupId
        : null;
    const categories =
      this.manualCategories === null
        ? this.categories()
        : this.manualCategories.map((configKey) => ({
            configKey,
            displayName: 'Industry news',
          }));
    return {
      articleId: id,
      source: {
        id: '10000000-0000-4000-8000-000000000001',
        configKey: 'journal',
        displayName: 'Independent Publishing Journal',
      },
      displayTitle: this.displayOverride ?? sourceTitle,
      sourceDerivedDisplayTitle: sourceTitle,
      displayTitleOverride: this.displayOverride,
      visibilityState: this.visibility[id],
      automaticCategories: this.categories(),
      manualCategoryOverride: {
        active: this.manualCategories !== null,
        categories,
      },
      effectiveCategories: categories,
      externalId: `external-${id.slice(-1)}`,
      originalUrl: `https://journal.example.com/articles/${id.slice(-1)}`,
      canonicalIdentityUrl: `https://journal.example.com/articles/${id.slice(-1)}`,
      author: 'Fixture editor',
      summary: 'Bounded moderation fixture summary.',
      imageUrl: null,
      language: 'en',
      publishedAtStatus: 'parsed',
      publishedAt: new Date('2026-08-14T12:00:00.000Z'),
      sourceUpdatedAtStatus: 'parsed',
      sourceUpdatedAt: new Date('2026-08-14T12:01:00.000Z'),
      firstSeenAt: new Date('2026-08-14T12:02:00.000Z'),
      lastSeenAt: new Date('2026-08-14T12:03:00.000Z'),
      createdAt: new Date('2026-08-14T12:02:00.000Z'),
      updatedAt: new Date('2026-08-14T12:03:00.000Z'),
      duplicate: {
        role: duplicateRole,
        groupId: group,
        primaryArticleId: group === null ? null : articleIds.primary,
        primarySelectionOrigin: group === null ? null : 'automatic',
        reviewStates:
          this.reviewState === 'pending' ? ['pending'] : [this.reviewState],
        reviewParticipating:
          id === articleIds.primary || id === articleIds.nonPrimary,
      },
      duplicateReviews: [],
    };
  }

  articleDetail(id: string) {
    const value = this.article(id);
    return {
      ...value,
      observations: [
        {
          observationId: '50000000-0000-4000-8000-000000000001',
          observedAt: new Date('2026-08-14T12:03:00.000Z'),
          processingOutcome: 'updated',
          source: value.source,
          endpoint: {
            id: '60000000-0000-4000-8000-000000000001',
            configKey: 'main_feed',
          },
          collectionRun: {
            id: '70000000-0000-4000-8000-000000000001',
            executionId: 'fixture-run',
            startedAt: new Date('2026-08-14T12:00:00.000Z'),
            finishedAt: new Date('2026-08-14T12:00:02.000Z'),
            status: 'succeeded',
            transportStatus: 'succeeded',
            parserStatus: 'succeeded',
          },
          observedExternalId: value.externalId,
          observedCanonicalIdentityUrl: value.canonicalIdentityUrl,
          relevance: {
            reasonCode: 'default_include',
            ruleId: null,
            detail: 'No exclusion matched.',
          },
          categoryReasons: [
            {
              category: this.categories()[0],
              kind: 'source_default',
              ruleId: null,
              position: 1,
              detail: 'Source default',
            },
          ],
        },
      ],
      history: {
        events: [
          {
            id: '80000000-0000-4000-8000-000000000001',
            action: 'article_hidden',
            targetType: 'article',
            targetId: id,
            occurredAt: new Date('2026-08-14T12:04:00.000Z'),
            reason: 'Fixture moderation history',
            priorState: { visibilityState: 'visible' },
            newState: { visibilityState: 'hidden' },
          },
        ],
        nextCursor: null,
      },
    };
  }

  reviews() {
    return [
      {
        candidateId,
        articleLowId: articleIds.primary,
        articleHighId: articleIds.nonPrimary,
        state: this.reviewState,
        origin: this.reviewState === 'pending' ? 'automatic' : 'manual',
        confidence: 50,
        evidenceFingerprint: 'fingerprint',
        manualDecidedAt: null,
        manualDecisionReason: null,
        articleSummaries: ['Candidate headline A', 'Candidate headline B'],
        manuallySeparated: true,
      },
    ];
  }

  reviewDetail() {
    const primary = this.articleDetail(articleIds.primary);
    const nonPrimary = this.articleDetail(articleIds.nonPrimary);
    return {
      ...this.reviews()[0],
      signals: [
        { order: 1, reasonCode: 'normalized_title_equal', strength: 'weak' },
      ],
      articles: [primary, nonPrimary],
      groups: this.merged
        ? [
            {
              groupId,
              primaryArticleId: articleIds.primary,
              primarySelectionOrigin: 'automatic',
              memberCount: 2,
              members: [primary, nonPrimary],
              membersTruncated: false,
            },
          ]
        : [],
      automaticGroupingBlockedByManualSeparation: true,
      automaticMergeBlockedByManualPrimaryConflict: false,
    };
  }
}

async function startHarnessServer(
  harness: ModerationHarness,
): Promise<WebServer> {
  return startWebServer(
    createWebApp(
      {
        readiness: { checkReady: async () => true },
        publicFeed: { read: async () => undefined },
      },
      {
        adminEnabled: true,
        registerAdminApiRoutes: (router) => {
          router.get('/categories', (_request, response) =>
            response.json({ categories: harness.categories() }),
          );
          router.get('/sources', (_request, response) =>
            response.json({ sources: harness.sources() }),
          );
          router.get('/articles', (request, response) => {
            if (harness.failNextArticleSearch) {
              harness.failNextArticleSearch = false;
              response.status(503).json({ error: 'internal_error' });
              return;
            }
            const all = [
              articleIds.primary,
              articleIds.nonPrimary,
              articleIds.hidden,
              articleIds.archived,
            ].map((id) => harness.article(id));
            const filtered = all.filter((article) => {
              const query =
                typeof request.query.q === 'string'
                  ? request.query.q.toLowerCase()
                  : '';
              return (
                (query === '' ||
                  `${article.displayTitle} ${article.source.displayName}`
                    .toLowerCase()
                    .includes(query)) &&
                (typeof request.query.visibilityState !== 'string' ||
                  article.visibilityState === request.query.visibilityState) &&
                (typeof request.query.duplicateRole !== 'string' ||
                  article.duplicate.role === request.query.duplicateRole)
              );
            });
            const page =
              request.query.cursor === 'page-2'
                ? filtered.slice(2)
                : filtered.slice(0, 2);
            response.json({
              articles: page,
              nextCursor:
                request.query.cursor === 'page-2' || filtered.length <= 2
                  ? null
                  : 'page-2',
            });
          });
          router.get('/articles/:articleId', (request, response) =>
            response.json({
              article: harness.articleDetail(request.params.articleId),
            }),
          );
          router.get('/articles/:articleId/history', (request, response) =>
            response.json({
              history: harness.articleDetail(request.params.articleId).history,
            }),
          );
          router.put('/articles/:articleId/visibility', (request, response) => {
            const id = request.params.articleId;
            const action = request.body.action;
            harness.visibility[id] = action === 'hide' ? 'hidden' : 'visible';
            response.json({
              changed: true,
              article: harness.articleDetail(id),
              auditEvent: {},
            });
          });
          router.put(
            '/articles/:articleId/display-title',
            (request, response) => {
              harness.displayOverride = request.body.displayTitleOverride;
              response.json({
                changed: true,
                article: harness.articleDetail(request.params.articleId),
                auditEvent: {},
              });
            },
          );
          router.delete(
            '/articles/:articleId/display-title',
            (request, response) => {
              harness.displayOverride = null;
              response.json({
                changed: true,
                article: harness.articleDetail(request.params.articleId),
                auditEvent: {},
              });
            },
          );
          router.put('/articles/:articleId/categories', (request, response) => {
            harness.manualCategories = request.body.categoryConfigKeys;
            response.json({
              changed: true,
              article: harness.articleDetail(request.params.articleId),
              auditEvent: {},
            });
          });
          router.delete(
            '/articles/:articleId/categories',
            (request, response) => {
              harness.manualCategories = null;
              response.json({
                changed: true,
                article: harness.articleDetail(request.params.articleId),
                auditEvent: {},
              });
            },
          );
          router.get('/duplicate-reviews', (request, response) => {
            if (request.query.cursor)
              response.json({ items: [], nextCursor: null });
            else response.json({ items: harness.reviews(), nextCursor: null });
          });
          router.get('/duplicate-reviews/:candidateId', (_request, response) =>
            response.json({ review: harness.reviewDetail() }),
          );
          router.post(
            '/duplicate-reviews/:candidateId/dismiss',
            (_request, response) => {
              harness.reviewState = 'dismissed';
              response.json({ outcome: 'changed' });
            },
          );
          router.post('/duplicate-groups/merge', (request, response) => {
            if (!request.body.primaryArticleId) {
              response.status(409).json({ error: 'conflict' });
              return;
            }
            harness.merged = true;
            harness.reviewState = 'merged';
            response.json({
              outcome: 'changed',
              groupId,
              primaryArticleId: request.body.primaryArticleId,
            });
          });
          router.post(
            '/duplicate-groups/:groupId/split',
            (_request, response) =>
              response.json({ outcome: 'changed', groupId }),
          );
          router.post(
            '/duplicate-groups/:groupId/primary',
            (_request, response) =>
              response.json({
                outcome: 'changed',
                groupId,
                primaryArticleId: articleIds.primary,
              }),
          );
        },
      },
    ),
    { host: '127.0.0.1', port: 0 },
  );
}

async function openArticles(page: Page, server: WebServer): Promise<void> {
  page.on('pageerror', (error) => {
    process.stderr.write(`browser page error: ${error.message}\n`);
  });
  const response = await page.goto(
    `http://${server.host}:${String(server.port)}/admin`,
  );
  assert.equal(response?.status(), 200);
  await page.getByRole('tab', { name: /^Articles/u }).click();
  await page.locator(`[data-article-id="${articleIds.primary}"]`).waitFor();
}
