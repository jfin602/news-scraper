import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';

import { chromium, type Browser } from 'playwright';

import {
  DistributionCredentialAdministrationError,
  type AdminDistributionCredentialReadModel,
  type DistributionCredentialAdministrationService,
} from '../../src/admin/distribution-credential-administration.ts';
import type { PhpIntegrationPackageProducer } from '../../src/integrations/php-integration-package.ts';
import { createWebApp } from '../../src/app/web/create-app.ts';
import { registerDistributionCredentialAdministrationRoutes } from '../../src/app/web/distribution-credential-administration-router.ts';
import { registerPhpIntegrationDownloadRoutes } from '../../src/app/web/php-integration-download-router.ts';
import { startWebServer, type WebServer } from '../../src/app/web/server.ts';

const packageBytes = Buffer.from('fake-package-bytes');
const packageFilename = 'news-scraper-php-integration-1.7.0.zip';

describe('Distribution credential administration page browser behavior', () => {
  let browser: Browser;
  before(async () => {
    browser = await chromium.launch({ headless: true });
  });
  after(async () => browser?.close());

  it('uses the protected API while keeping issued plaintext transient', async () => {
    const harness = new CredentialHarness();
    const server = await startHarnessServer(harness);
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const mutationHeaders: string[] = [];
    page.on('request', (request) => {
      if (
        request.url().includes('/distribution-credentials') &&
        request.method() !== 'GET'
      )
        mutationHeaders.push(
          request.headers()['x-news-scraper-admin-request'] ?? '',
        );
    });
    try {
      await page.goto(`${baseUrl(server)}/admin`);
      await page.getByRole('tab', { name: /^Credentials/u }).click();
      await page
        .locator('[data-credentials-state][data-list-state="empty"]')
        .waitFor();
      const form = page.locator('[data-credential-create-form]');
      await form.getByLabel('Label').fill('PHP sync');
      await form.getByRole('button', { name: 'Create credential' }).click();
      await page.locator('[data-credential-secret]').waitFor();
      assert.match(
        await page.locator('[data-credential-token]').innerText(),
        /^nsd1\./u,
      );
      assert.match(
        await page.locator('[data-credentials-list]').innerText(),
        /PHP sync/u,
      );
      assert.doesNotMatch(
        await page.locator('[data-credentials-list]').innerText(),
        /verifier|digest|nsd1\./iu,
      );
      assert.deepEqual(mutationHeaders, ['1']);
      assert.equal(
        await page.evaluate(() => location.href.includes('nsd1.')),
        false,
      );
      assert.equal(
        await page.evaluate(() => localStorage.length + sessionStorage.length),
        0,
      );
      await page.getByRole('button', { name: 'Dismiss and clear' }).click();
      assert.equal(
        await page.locator('[data-credential-token]').innerText(),
        '',
      );
      await page.getByRole('tab', { name: /^Sources/u }).click();
      await page.getByRole('tab', { name: /^Credentials/u }).click();
      assert.equal(
        await page.locator('[data-credential-secret]').isHidden(),
        true,
      );
      await page
        .getByRole('button', { name: 'Rotate credential' })
        .last()
        .click();
      await page.locator('[data-credential-secret]').waitFor();
      assert.match(
        await page.locator('[data-credential-secret]').innerText(),
        /cannot be shown again/u,
      );
      assert.match(
        await page.locator('[data-credentials-list]').innerText(),
        /Rotated/u,
      );
      page.once('dialog', (dialog) => void dialog.accept());
      await page
        .getByRole('button', { name: 'Revoke credential' })
        .first()
        .click();
      await page.getByText(/Status: Revoked/u).waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
      await page.reload();
      await page.getByRole('tab', { name: /^Credentials/u }).click();
      assert.equal(
        await page.locator('[data-credential-secret]').isHidden(),
        true,
      );
    } finally {
      await context.close();
      await server.close();
    }
  });

  it('keeps invalid and dependency failures bounded without fabricating a credential', async () => {
    const harness = new CredentialHarness();
    harness.failCreate = true;
    const server = await startHarnessServer(harness);
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl(server)}/admin`);
      await page.getByRole('tab', { name: /^Credentials/u }).click();
      await page
        .locator('[data-credentials-state][data-list-state="empty"]')
        .waitFor();
      await page
        .locator('[data-credential-create-form]')
        .getByLabel('Label')
        .fill('Bad');
      await page.getByRole('button', { name: 'Create credential' }).click();
      await page.locator('[data-credentials-error]').waitFor();
      assert.equal(
        await page.locator('[data-credentials-list] article').count(),
        0,
      );
      assert.equal(
        await page.locator('[data-credential-secret]').isHidden(),
        true,
      );
    } finally {
      await context.close();
      await server.close();
    }
  });

  it('downloads the generic package with zero credentials and no token coupling', async () => {
    const harness = new CredentialHarness();
    const server = await startHarnessServer(harness);
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    let downloadRequestUrl = '';
    page.on('request', (request) => {
      if (request.url().includes('/admin/api/php-integration/download'))
        downloadRequestUrl = request.url();
    });
    try {
      await page.goto(`${baseUrl(server)}/admin`);
      await page.getByRole('tab', { name: /^Credentials/u }).click();
      await page
        .locator('[data-credentials-state][data-list-state="empty"]')
        .waitFor();

      const downloadLink = page.getByRole('link', {
        name: 'Download PHP Integration 1.7.0',
      });
      await downloadLink.waitFor();
      assert.equal(
        await downloadLink.getAttribute('href'),
        '/admin/api/php-integration/download',
      );
      const downloadPromise = page.waitForEvent('download');
      await downloadLink.click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), packageFilename);
      const downloadedPath = await download.path();
      assert.ok(downloadedPath);
      assert.deepEqual(await readFile(downloadedPath), packageBytes);
      assert.doesNotMatch(packageBytes.toString('utf8'), /nsd1|secret|token/iu);
      assert.doesNotMatch(
        downloadRequestUrl,
        /nsd1|token|credential|profile|version/iu,
      );
      assert.doesNotMatch(download.suggestedFilename(), /nsd1|secret|token/iu);
      assert.equal(
        await page.evaluate(() => localStorage.length + sessionStorage.length),
        0,
      );
      assert.equal(harness.packageBuilds, 1);
      assert.equal(harness.credentials.length, 0);
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
});

class CredentialHarness {
  credentials: AdminDistributionCredentialReadModel[] = [];
  serial = 0;
  failCreate = false;
  packageBuilds = 0;
  packageProducer(): PhpIntegrationPackageProducer {
    return {
      describe: async () => ({ version: '1.7.0' }),
      build: async () => {
        this.packageBuilds += 1;
        return {
          filename: packageFilename,
          contentType: 'application/zip',
          version: '1.7.0',
          bytes: packageBytes,
        };
      },
    };
  }
  service(): DistributionCredentialAdministrationService {
    return {
      listCredentials: async () => this.credentials,
      createCredential: async (input) => {
        if (this.failCreate)
          throw new DistributionCredentialAdministrationError(
            'invalid_request',
          );
        const credential = this.issue(
          String((input as { label: string }).label),
        );
        this.credentials.push(credential);
        return {
          credential,
          plaintextToken: `nsd1.${credential.lookupId}.create-secret`,
        };
      },
      rotateCredential: async (lookupId, input) => {
        const prior = this.find(String(lookupId));
        if (prior.rotationSuccessorLookupId)
          throw new DistributionCredentialAdministrationError(
            'credential_already_rotated',
          );
        const credential = this.issue(
          String((input as { label: string }).label),
        );
        this.credentials[this.credentials.indexOf(prior)] = {
          ...prior,
          lifecycleState: 'rotated',
          rotationSuccessorLookupId: credential.lookupId,
        };
        this.credentials.push(credential);
        return {
          credential,
          plaintextToken: `nsd1.${credential.lookupId}.rotate-secret`,
        };
      },
      revokeCredential: async (lookupId) => {
        const prior = this.find(String(lookupId));
        const credential = {
          ...prior,
          lifecycleState: 'revoked' as const,
          revokedAt: '2026-08-21T00:00:00.000Z',
        };
        this.credentials[this.credentials.indexOf(prior)] = credential;
        return credential;
      },
    };
  }
  private issue(label: string): AdminDistributionCredentialReadModel {
    this.serial += 1;
    return {
      lookupId: `lookup-${this.serial}`,
      label,
      capability: 'distribution:read',
      expiresAt: null,
      revokedAt: null,
      rotationSuccessorLookupId: null,
      lifecycleState: 'active',
      createdAt: `2026-08-2${this.serial}T00:00:00.000Z`,
      updatedAt: '2026-08-21T00:00:00.000Z',
    };
  }
  private find(lookupId: string) {
    const value = this.credentials.find(
      (credential) => credential.lookupId === lookupId,
    );
    if (!value)
      throw new DistributionCredentialAdministrationError(
        'credential_not_found',
      );
    return value;
  }
}
async function startHarnessServer(
  harness: CredentialHarness,
): Promise<WebServer> {
  return startWebServer(
    createWebApp(
      {
        readiness: { checkReady: async () => true },
        publicFeed: { read: async () => undefined },
      },
      {
        adminEnabled: true,
        phpIntegrationPackageVersion: '1.7.0',
        registerAdminApiRoutes: (router) => {
          registerDistributionCredentialAdministrationRoutes(harness.service())(
            router,
          );
          registerPhpIntegrationDownloadRoutes(harness.packageProducer())(
            router,
          );
        },
      },
    ),
    { host: '127.0.0.1', port: 0 },
  );
}
function baseUrl(server: WebServer): string {
  return `http://${server.host}:${String(server.port)}`;
}
