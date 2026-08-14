import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';
import {
  cleanupChild,
  disconnectTestIpc,
  sendGracefulInterrupt,
  sendGracefulTermination,
  spawnRole,
  waitForExit,
  waitForJsonEvent,
} from '../support/process.ts';

const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

describe('real process database readiness', () => {
  it('starts and stops Web and Worker against a current database', async () => {
    await databaseTestScope.use(async ({ databaseUrl }) => {
      const web = spawnDatabaseRole('web', databaseUrl);
      const worker = spawnDatabaseRole('worker', databaseUrl);
      try {
        const workerReady = waitForJsonEvent(worker, 'stdout', 'worker.ready');
        const schedulerActive = waitForJsonEvent(
          worker,
          'stdout',
          'worker.scheduler_pass_completed',
        );
        const listening = await waitForJsonEvent(
          web,
          'stdout',
          'web.listening',
        );
        const baseUrl = `http://127.0.0.1:${String(listening.port)}`;
        assert.equal((await fetch(`${baseUrl}/health/live`)).status, 200);
        assert.equal((await fetch(`${baseUrl}/health/ready`)).status, 200);
        assert.deepEqual(await workerReady, {
          event: 'worker.ready',
          role: 'worker',
        });
        assert.deepEqual(await schedulerActive, {
          event: 'worker.scheduler_pass_completed',
          role: 'worker',
          considered: 0,
          enqueued: 0,
          alreadyOutstanding: 0,
        });

        const webStopped = waitForJsonEvent(web, 'stdout', 'web.stopped');
        const workerStopped = waitForJsonEvent(
          worker,
          'stdout',
          'worker.stopped',
        );
        const workerShutdown = waitForJsonEvent(
          worker,
          'stdout',
          'worker.shutdown_begin',
        );
        sendGracefulTermination(web);
        sendGracefulTermination(worker);
        assert.deepEqual(await webStopped, {
          event: 'web.stopped',
          role: 'web',
        });
        assert.deepEqual(await workerStopped, {
          event: 'worker.stopped',
          role: 'worker',
        });
        assert.deepEqual(await workerShutdown, {
          event: 'worker.shutdown_begin',
          role: 'worker',
        });
        disconnectTestIpc(web);
        disconnectTestIpc(worker);
        const webExit = waitForExit(web);
        const workerExit = waitForExit(worker);
        assert.deepEqual(await webExit, { code: 0, signal: null });
        assert.deepEqual(await workerExit, { code: 0, signal: null });
      } finally {
        await cleanupChild(web);
        await cleanupChild(worker);
      }
    });
  });

  it('keeps Web live but rejects Worker readiness for an uninitialized database', async () => {
    await withDisposableDatabase(async ({ databaseUrl }) => {
      const web = spawnDatabaseRole('web', databaseUrl);
      const worker = spawnDatabaseRole('worker', databaseUrl);
      const workerStdout: Buffer[] = [];
      worker.stdout?.on('data', (chunk: Buffer) => workerStdout.push(chunk));
      try {
        const listening = await waitForJsonEvent(
          web,
          'stdout',
          'web.listening',
        );
        const baseUrl = `http://127.0.0.1:${String(listening.port)}`;
        assert.equal((await fetch(`${baseUrl}/health/live`)).status, 200);
        assert.equal((await fetch(`${baseUrl}/health/ready`)).status, 503);
        assert.deepEqual(
          await waitForJsonEvent(worker, 'stderr', 'worker.start_failed'),
          { event: 'worker.start_failed', role: 'worker' },
        );
        disconnectTestIpc(worker);
        assert.deepEqual(await waitForExit(worker), { code: 1, signal: null });
        assert.doesNotMatch(
          Buffer.concat(workerStdout).toString(),
          /worker\.ready/u,
        );
        const webStopped = waitForJsonEvent(web, 'stdout', 'web.stopped');
        sendGracefulTermination(web);
        assert.deepEqual(await webStopped, {
          event: 'web.stopped',
          role: 'web',
        });
        disconnectTestIpc(web);
        const webExit = waitForExit(web);
        assert.deepEqual(await webExit, { code: 0, signal: null });
      } finally {
        await cleanupChild(web);
        await cleanupChild(worker);
      }
    });
  });

  it('stops the active Worker runtime cleanly on SIGINT', async () => {
    await databaseTestScope.use(async ({ databaseUrl }) => {
      const worker = spawnDatabaseRole('worker', databaseUrl);
      try {
        assert.deepEqual(
          await waitForJsonEvent(worker, 'stdout', 'worker.ready'),
          { event: 'worker.ready', role: 'worker' },
        );
        const stopped = waitForJsonEvent(worker, 'stdout', 'worker.stopped');
        sendGracefulInterrupt(worker);
        assert.deepEqual(await stopped, {
          event: 'worker.stopped',
          role: 'worker',
        });
        disconnectTestIpc(worker);
        assert.deepEqual(await waitForExit(worker), {
          code: 0,
          signal: null,
        });
      } finally {
        await cleanupChild(worker);
      }
    });
  });
});

function spawnDatabaseRole(role: 'web' | 'worker', databaseUrl: string) {
  return spawnRole(role, {
    NODE_ENV: 'test',
    NEWS_SCRAPER_DATABASE_URL: databaseUrl,
    NEWS_SCRAPER_WEB_HOST: role === 'web' ? '127.0.0.1' : undefined,
    NEWS_SCRAPER_WEB_PORT: role === 'web' ? '0' : undefined,
  });
}
