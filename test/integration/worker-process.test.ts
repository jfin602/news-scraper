import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { describe, it } from 'node:test';

describe('Worker process entrypoint', () => {
  it('starts without Web configuration, remains alive, and stops cleanly', async () => {
    const child = spawnWorker({
      NODE_ENV: 'test',
      NEWS_SCRAPER_WEB_HOST: undefined,
      NEWS_SCRAPER_WEB_PORT: undefined,
    });
    try {
      assert.deepEqual(await waitForJsonLine(child, 'stdout', 'worker.ready'), {
        event: 'worker.ready',
        role: 'worker',
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(child.exitCode, null);
      assert.equal(child.signalCode, null);

      const stoppedEvent = waitForJsonLine(child, 'stdout', 'worker.stopped');
      const exitEvent = waitForExit(child);
      sendTermination(child);
      assert.deepEqual(await stoppedEvent, {
        event: 'worker.stopped',
        role: 'worker',
      });
      if (child.connected) child.disconnect();
      assert.deepEqual(await exitEvent, { code: 0, signal: null });
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  });

  it('rejects invalid common configuration before readiness', async () => {
    const child = spawnWorker({ NODE_ENV: 'invalid-private-value' });
    const stdout: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));

    assert.deepEqual(
      await waitForJsonLine(child, 'stderr', 'worker.start_failed'),
      { event: 'worker.start_failed', role: 'worker' },
    );
    if (child.connected) child.disconnect();
    assert.deepEqual(await waitForExit(child), { code: 1, signal: null });
    assert.doesNotMatch(Buffer.concat(stdout).toString(), /worker\.ready/);
  });
});

function spawnWorker(environment: NodeJS.ProcessEnv): ChildProcess {
  const arguments_ =
    process.platform === 'win32'
      ? [
          '--input-type=module',
          '--eval',
          "process.on('message', signal => process.emit(signal)); await import('./src/app/worker/main.ts')",
        ]
      : ['src/app/worker/main.ts'];
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
