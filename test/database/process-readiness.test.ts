import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { describe, it } from 'node:test';

import { migrateDatabase } from '../../src/database/migrations.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

describe('real process database readiness', () => {
  it('starts and stops Web and Worker against a current database', async () => {
    await withDisposableDatabase(async ({ databaseUrl }) => {
      await migrateDatabase({ connectionString: databaseUrl });

      const web = spawnRole('web', databaseUrl);
      const worker = spawnRole('worker', databaseUrl);
      try {
        const listening = await waitForJsonLine(web, 'stdout', 'web.listening');
        const baseUrl = `http://127.0.0.1:${String(listening.port)}`;
        assert.equal((await fetch(`${baseUrl}/health/live`)).status, 200);
        assert.equal((await fetch(`${baseUrl}/health/ready`)).status, 200);
        assert.deepEqual(
          await waitForJsonLine(worker, 'stdout', 'worker.ready'),
          { event: 'worker.ready', role: 'worker' },
        );

        const webExit = waitForExit(web);
        const workerExit = waitForExit(worker);
        sendTermination(web);
        sendTermination(worker);
        assert.deepEqual(await webExit, { code: 0, signal: null });
        assert.deepEqual(await workerExit, { code: 0, signal: null });
      } finally {
        stopIfRunning(web);
        stopIfRunning(worker);
      }
    });
  });

  it('keeps Web live but rejects Worker readiness for an uninitialized database', async () => {
    await withDisposableDatabase(async ({ databaseUrl }) => {
      const web = spawnRole('web', databaseUrl);
      const worker = spawnRole('worker', databaseUrl);
      const workerStdout: Buffer[] = [];
      worker.stdout?.on('data', (chunk: Buffer) => workerStdout.push(chunk));
      try {
        const listening = await waitForJsonLine(web, 'stdout', 'web.listening');
        const baseUrl = `http://127.0.0.1:${String(listening.port)}`;
        assert.equal((await fetch(`${baseUrl}/health/live`)).status, 200);
        assert.equal((await fetch(`${baseUrl}/health/ready`)).status, 503);
        assert.deepEqual(
          await waitForJsonLine(worker, 'stderr', 'worker.start_failed'),
          { event: 'worker.start_failed', role: 'worker' },
        );
        assert.deepEqual(await waitForExit(worker), { code: 1, signal: null });
        assert.doesNotMatch(
          Buffer.concat(workerStdout).toString(),
          /worker\.ready/u,
        );
        const webExit = waitForExit(web);
        sendTermination(web);
        assert.deepEqual(await webExit, { code: 0, signal: null });
      } finally {
        stopIfRunning(web);
        stopIfRunning(worker);
      }
    });
  });
});

function spawnRole(role: 'web' | 'worker', databaseUrl: string): ChildProcess {
  const module = `./src/app/${role}/main.ts`;
  const arguments_ =
    process.platform === 'win32'
      ? [
          '--input-type=module',
          '--eval',
          `process.on('message', signal => process.emit(signal)); await import('${module}')`,
        ]
      : [module];
  return spawn(process.execPath, arguments_, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NEWS_SCRAPER_DATABASE_URL: databaseUrl,
      NEWS_SCRAPER_WEB_HOST: role === 'web' ? '127.0.0.1' : undefined,
      NEWS_SCRAPER_WEB_PORT: role === 'web' ? '0' : undefined,
    },
    stdio: [
      'ignore',
      'pipe',
      'pipe',
      ...(process.platform === 'win32' ? ['ipc' as const] : []),
    ],
  });
}

function sendTermination(child: ChildProcess): void {
  if (process.platform === 'win32') child.send?.('SIGTERM');
  else assert.equal(child.kill('SIGTERM'), true);
}

function stopIfRunning(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) child.kill();
}

function waitForJsonLine(
  child: ChildProcess,
  streamName: 'stdout' | 'stderr',
  event: string,
): Promise<Record<string, unknown>> {
  const stream = child[streamName];
  assert.ok(stream);
  return new Promise((resolve, reject) => {
    let buffered = '';
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      10_000,
    );
    const cleanup = () => {
      clearTimeout(timeout);
      stream.off('data', onData);
      child.off('exit', onExit);
    };
    const onExit = () => {
      cleanup();
      reject(new Error(`Process exited before ${event}`));
    };
    const onData = (chunk: Buffer) => {
      buffered += chunk.toString();
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (parsed.event === event) {
          cleanup();
          resolve(parsed);
        }
      }
    };
    stream.on('data', onData);
    child.once('exit', onExit);
  });
}

function waitForExit(
  child: ChildProcess,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  return new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal })),
  );
}
