import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cleanupChild,
  disconnectTestIpc,
  sendGracefulTermination,
  spawnRole,
  waitForExit,
  waitForJsonEvent,
} from '../support/process.ts';

describe('Web process entrypoint', () => {
  it('listens with an unavailable database, serves liveness, and stops cleanly', async () => {
    const child = spawnRole('web', {
      NODE_ENV: 'test',
      NEWS_SCRAPER_WEB_HOST: '127.0.0.1',
      NEWS_SCRAPER_WEB_PORT: '0',
      NEWS_SCRAPER_DATABASE_URL:
        'postgresql://synthetic-secret@127.0.0.1:1/unavailable',
    });
    const output: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => output.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => output.push(chunk));
    try {
      const listening = await waitForJsonEvent(
        child,
        'stdout',
        'web.listening',
      );
      assert.equal(listening.host, '127.0.0.1');
      assert.equal(typeof listening.port, 'number');
      const baseUrl = `http://127.0.0.1:${String(listening.port)}`;
      assert.deepEqual(await (await fetch(`${baseUrl}/health/live`)).json(), {
        status: 'ok',
        role: 'web',
      });
      const readiness = await fetch(`${baseUrl}/health/ready`);
      assert.equal(readiness.status, 503);
      assert.deepEqual(await readiness.json(), {
        status: 'not_ready',
        role: 'web',
      });
      const stoppedEvent = waitForJsonEvent(child, 'stdout', 'web.stopped');
      const exitEvent = waitForExit(child);
      sendGracefulTermination(child);
      assert.deepEqual(await stoppedEvent, {
        event: 'web.stopped',
        role: 'web',
      });
      disconnectTestIpc(child);
      assert.deepEqual(await exitEvent, { code: 0, signal: null });
      assert.doesNotMatch(
        Buffer.concat(output).toString(),
        /synthetic-secret/u,
      );
    } finally {
      await cleanupChild(child);
    }
  });

  it('fails predictably for malformed Web configuration', async () => {
    const child = spawnRole('web', {
      NEWS_SCRAPER_WEB_PORT: 'private-value',
    });
    assert.deepEqual(
      await waitForJsonEvent(child, 'stderr', 'web.start_failed'),
      { event: 'web.start_failed', role: 'web' },
    );
    disconnectTestIpc(child);
    assert.deepEqual(await waitForExit(child), { code: 1, signal: null });
  });
});
