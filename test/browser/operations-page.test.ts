import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromium, type Browser } from 'playwright';

import { createWebApp } from '../../src/app/web/create-app.ts';
import { startWebServer, type WebServer } from '../../src/app/web/server.ts';

describe('Operations administration workspace browser behavior', () => {
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

  it('presents the server-owned snapshot safely, refreshes without overlap, and navigates to endpoint administration', async () => {
    const harness = new OperationsHarness();
    const server = await startHarnessServer(harness);
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl(server)}/admin`);
      const operations = page.getByRole('tab', { name: /^Operations/u });
      await operations.focus();
      assert.notEqual(
        await operations.evaluate(
          (element) => getComputedStyle(element).outlineStyle,
        ),
        'none',
      );
      await operations.click();
      await page
        .locator('[data-operations-state="loading"]')
        .waitFor({ state: 'visible' });
      assert.equal(harness.operationsRequests, 1);
      assert.equal(
        await page
          .getByRole('button', { name: 'Refresh Operations' })
          .isDisabled(),
        true,
      );
      await page
        .getByRole('button', { name: 'Refresh Operations' })
        .evaluate((button) => (button as HTMLButtonElement).click());
      assert.equal(harness.operationsRequests, 1);

      harness.resolveFirstSnapshot();
      await page
        .locator('[data-operations-state="ready"]')
        .waitFor({ state: 'visible' });
      assert.match(
        await page.locator('[data-operations-content]').innerText(),
        /Overall status: Healthy|Overall Status: Healthy/u,
      );
      assert.match(
        await page.locator('[data-operations-content]').innerText(),
        /No delayed, degraded, or unhealthy eligible endpoints/u,
      );
      assert.match(
        await page.locator('[data-operations-content]').innerText(),
        /No current operational alerts/u,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );

      harness.snapshot = actionableSnapshot();
      await page.getByRole('button', { name: 'Refresh Operations' }).click();
      await page
        .getByRole('button', { name: 'Open endpoint administration' })
        .first()
        .waitFor();
      const operationsText = await page
        .locator('[data-operations-content]')
        .innerText();
      assert.match(operationsText, /Degraded/u);
      assert.match(operationsText, /Ready now[\s\S]*2/u);
      assert.match(operationsText, /Oldest ready delay/u);
      assert.match(operationsText, /Critical: Endpoint unhealthy/u);
      assert.equal(await page.locator('img').count(), 0);
      assert.equal(
        await page
          .locator('[data-operations-content]')
          .locator('script')
          .count(),
        0,
      );

      await page
        .getByRole('button', { name: 'Open endpoint administration' })
        .first()
        .click();
      await page.locator('[data-workspace-panel="sources"]').waitFor();
      await page.waitForFunction(() => {
        const endpoint = document.querySelector(
          '[data-endpoint-form] [name="configKey"]',
        );
        return endpoint instanceof HTMLInputElement && endpoint.value === 'rss';
      });

      await operations.click();
      await page
        .locator('[data-operations-state="ready"]')
        .waitFor({ state: 'visible' });
      harness.failSnapshot = true;
      await page.getByRole('button', { name: 'Refresh Operations' }).click();
      await page
        .locator('[data-operations-state="error"]')
        .waitFor({ state: 'visible' });
      assert.match(
        await page.locator('[data-operations-state]').innerText(),
        /temporarily unavailable/u,
      );
      harness.failSnapshot = false;
      await page.getByRole('button', { name: 'Refresh Operations' }).click();
      await page
        .locator('[data-operations-state="ready"]')
        .waitFor({ state: 'visible' });
    } finally {
      await context.close();
      await server.close();
    }
  });
});

class OperationsHarness {
  operationsRequests = 0;
  failSnapshot = false;
  snapshot:
    ReturnType<typeof healthySnapshot> | ReturnType<typeof actionableSnapshot> =
    healthySnapshot();
  private firstSnapshotResolve: (() => void) | undefined;

  resolveFirstSnapshot(): void {
    this.firstSnapshotResolve?.();
  }

  async readSnapshot() {
    this.operationsRequests += 1;
    if (this.operationsRequests === 1) {
      await new Promise<void>((resolve) => {
        this.firstSnapshotResolve = resolve;
      });
    }
    if (this.failSnapshot) throw new Error('database credential secret');
    return this.snapshot;
  }
}

async function startHarnessServer(
  harness: OperationsHarness,
): Promise<WebServer> {
  const source = {
    configKey: 'journal',
    displayName: 'Journal',
    siteUrl: 'https://journal.example.test/',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    priority: 1,
    approvedDomains: [],
    defaultCategory: null,
    rssAtomAdmissionPhrases: [],
    endpointCount: 1,
  };
  const endpoint = {
    sourceConfigKey: 'journal',
    configKey: 'rss',
    endpointUrl: 'https://journal.example.test/rss.xml',
    endpointType: 'rss_atom',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    pollIntervalSeconds: 300,
    endpointDomainRules: [],
    inheritsSourceDomainPolicy: true,
    defaultCategory: null,
  };
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
            response.json({ categories: [] }),
          );
          router.get('/sources', (_request, response) =>
            response.json({ sources: [source] }),
          );
          router.get('/sources/journal', (_request, response) =>
            response.json({ source }),
          );
          router.get('/sources/journal/endpoints', (_request, response) =>
            response.json({ endpoints: [endpoint] }),
          );
          router.get('/sources/journal/endpoints/rss', (_request, response) =>
            response.json({ endpoint }),
          );
          router.get(
            '/sources/journal/endpoints/rss/health',
            (_request, response) => response.json({ health: endpointHealth() }),
          );
          router.get(
            '/sources/journal/endpoints/rss/runs',
            (_request, response) => response.json({ runs: [] }),
          );
          router.get('/operations/snapshot', async (_request, response) => {
            try {
              response.json({ snapshot: await harness.readSnapshot() });
            } catch {
              response.status(503).json({ error: 'service_unavailable' });
            }
          });
        },
      },
    ),
    { host: '127.0.0.1', port: 0 },
  );
}

function healthySnapshot() {
  return {
    observedAt: '2026-08-15T12:00:00.000Z',
    status: 'healthy',
    endpointHealthCounts: {
      unknown: 0,
      healthy: 1,
      delayed: 0,
      degraded: 0,
      unhealthy: 0,
    },
    actionableEndpoints: [],
    jobs: {
      queuedCount: 0,
      runningCount: 0,
      readyQueuedCount: 0,
      futureQueuedCount: 0,
      oldestReadyQueuedAt: null,
      oldestReadyAgeMilliseconds: null,
      expiredRunningCount: 0,
    },
    capacity: { global: 4, source: 2, host: 2 },
    workerTiming: workerTiming(),
    alerts: [],
  };
}

function actionableSnapshot() {
  return {
    ...healthySnapshot(),
    status: 'critical',
    endpointHealthCounts: {
      unknown: 0,
      healthy: 0,
      delayed: 1,
      degraded: 1,
      unhealthy: 1,
    },
    actionableEndpoints: [
      {
        sourceConfigKey: 'journal',
        sourceDisplayName: '<img src=x onerror=alert(1)>',
        endpointConfigKey: 'rss',
        health: 'degraded',
        lastSuccessAt: '2026-08-15T11:00:00.000Z',
        lastFailureAt: '2026-08-15T11:50:00.000Z',
        nextDueAt: '2026-08-15T12:00:00.000Z',
        cooldownUntil: null,
        consecutiveFailureCount: 2,
      },
    ],
    jobs: {
      queuedCount: 3,
      runningCount: 1,
      readyQueuedCount: 2,
      futureQueuedCount: 1,
      oldestReadyQueuedAt: '2026-08-15T11:55:00.000Z',
      oldestReadyAgeMilliseconds: 300_000,
      expiredRunningCount: 1,
    },
    alerts: [
      {
        code: 'endpoint_unhealthy',
        severity: 'critical',
        sourceConfigKey: 'journal',
        endpointConfigKey: 'rss',
      },
    ],
  };
}

function endpointHealth() {
  return {
    derivedHealth: 'healthy',
    publicationActiveForCollection: true,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    nextDueAt: null,
    cooldownUntil: null,
    consecutiveFailureCount: 0,
    pollIntervalSeconds: 300,
  };
}

function workerTiming() {
  return {
    schedulerPassIntervalMilliseconds: 15_000,
    digestSchedulerPassIntervalMilliseconds: 60_000,
    idleJobPollIntervalMilliseconds: 1_000,
    jobLeaseDurationMilliseconds: 120_000,
    leaseRenewalIntervalMilliseconds: 30_000,
    staleRecoveryPassIntervalMilliseconds: 30_000,
    staleRecoveryBatchLimit: 25,
    localExecutionLimit: 4,
  };
}

function baseUrl(server: WebServer): string {
  return `http://${server.host}:${String(server.port)}`;
}
