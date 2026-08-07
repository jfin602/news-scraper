import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cleanupChild,
  disconnectTestIpc,
  spawnRole,
  waitForExit,
  waitForJsonEvent,
} from '../support/process.ts';

describe('Worker process entrypoint', () => {
  it('rejects missing database configuration without requiring Web configuration', async () => {
    const inheritedDatabaseUrl = process.env.NEWS_SCRAPER_DATABASE_URL;
    process.env.NEWS_SCRAPER_DATABASE_URL =
      'postgresql://inherited-value-that-must-be-removed.invalid/database';
    const child = spawnRole('worker', {
      NODE_ENV: 'test',
      NEWS_SCRAPER_DATABASE_URL: undefined,
      NEWS_SCRAPER_WEB_HOST: undefined,
      NEWS_SCRAPER_WEB_PORT: undefined,
    });
    const stdout: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
    try {
      assert.deepEqual(
        await waitForJsonEvent(child, 'stderr', 'worker.start_failed'),
        {
          event: 'worker.start_failed',
          role: 'worker',
        },
      );
      disconnectTestIpc(child);
      assert.deepEqual(await waitForExit(child), { code: 1, signal: null });
      assert.doesNotMatch(Buffer.concat(stdout).toString(), /worker\.ready/u);
    } finally {
      if (inheritedDatabaseUrl === undefined)
        delete process.env.NEWS_SCRAPER_DATABASE_URL;
      else process.env.NEWS_SCRAPER_DATABASE_URL = inheritedDatabaseUrl;
      await cleanupChild(child);
    }
  });

  it('rejects invalid common configuration before readiness', async () => {
    const child = spawnRole('worker', {
      NODE_ENV: 'invalid-private-value',
    });
    const stdout: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
    try {
      assert.deepEqual(
        await waitForJsonEvent(child, 'stderr', 'worker.start_failed'),
        { event: 'worker.start_failed', role: 'worker' },
      );
      disconnectTestIpc(child);
      assert.deepEqual(await waitForExit(child), { code: 1, signal: null });
      assert.doesNotMatch(Buffer.concat(stdout).toString(), /worker\.ready/);
    } finally {
      await cleanupChild(child);
    }
  });
});
