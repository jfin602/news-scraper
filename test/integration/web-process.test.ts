import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { describe, it } from 'node:test';

describe('Web process entrypoint', () => {
  it('reports its actual port, serves health, and stops cleanly', async () => {
    const child = spawnWeb({
      NODE_ENV: 'test',
      NEWS_SCRAPER_WEB_HOST: '127.0.0.1',
      NEWS_SCRAPER_WEB_PORT: '0',
    });
    try {
      const listening = await waitForJsonLine(child, 'stdout', 'web.listening');
      assert.equal(listening.host, '127.0.0.1');
      assert.equal(typeof listening.port, 'number');
      const baseUrl = `http://127.0.0.1:${String(listening.port)}`;
      assert.deepEqual(await (await fetch(`${baseUrl}/health/live`)).json(), {
        status: 'ok',
        role: 'web',
      });
      assert.deepEqual(await (await fetch(`${baseUrl}/health/ready`)).json(), {
        status: 'ready',
        role: 'web',
      });
      const stoppedEvent = waitForJsonLine(child, 'stdout', 'web.stopped');
      const exitEvent = waitForExit(child);
      sendTermination(child);
      assert.deepEqual(await stoppedEvent, {
        event: 'web.stopped',
        role: 'web',
      });
      if (child.connected) child.disconnect();
      assert.deepEqual(await exitEvent, { code: 0, signal: null });
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  });

  it('fails predictably for malformed Web configuration', async () => {
    const child = spawnWeb({ NEWS_SCRAPER_WEB_PORT: 'private-value' });
    assert.deepEqual(
      await waitForJsonLine(child, 'stderr', 'web.start_failed'),
      { event: 'web.start_failed', role: 'web' },
    );
    if (child.connected) child.disconnect();
    assert.deepEqual(await waitForExit(child), { code: 1, signal: null });
  });
});

function spawnWeb(environment: NodeJS.ProcessEnv): ChildProcess {
  const arguments_ =
    process.platform === 'win32'
      ? [
          '--input-type=module',
          '--eval',
          "process.on('message', signal => process.emit(signal)); await import('./src/app/web/main.ts')",
        ]
      : ['src/app/web/main.ts'];
  return spawn(process.execPath, arguments_, {
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
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
      5_000,
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
