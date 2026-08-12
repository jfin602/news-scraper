import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';

const EVENT_TIMEOUT_MS = 10_000;
const EXIT_TIMEOUT_MS = 10_000;

export type ProcessRole = 'web' | 'worker';

export function spawnRole(
  role: ProcessRole,
  environment: NodeJS.ProcessEnv,
): ChildProcess {
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
    env: mergeEnvironment(process.env, environment),
    stdio: [
      'ignore',
      'pipe',
      'pipe',
      ...(process.platform === 'win32' ? ['ipc' as const] : []),
    ],
  });
}

export function waitForJsonEvent(
  child: ChildProcess,
  streamName: 'stdout' | 'stderr',
  event: string,
  timeoutMs = EVENT_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  const stream = child[streamName];
  assert.ok(stream);

  return new Promise((resolve, reject) => {
    let buffered = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timed out after ${String(timeoutMs)}ms waiting for ${event}`,
        ),
      );
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      stream.off('data', onData);
      child.off('exit', onExit);
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(
        new Error(
          `Process exited before ${event} (code=${String(code)}, signal=${String(signal)})`,
        ),
      );
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
          return;
        }
      }
    };
    stream.on('data', onData);
    child.once('exit', onExit);
  });
}

export function sendGracefulTermination(child: ChildProcess): void {
  sendSignal(child, 'SIGTERM');
}

export function sendGracefulInterrupt(child: ChildProcess): void {
  sendSignal(child, 'SIGINT');
}

function sendSignal(child: ChildProcess, signal: 'SIGINT' | 'SIGTERM'): void {
  if (process.platform === 'win32') {
    assert.equal(child.connected, true, 'Windows test IPC is not connected');
    child.send(signal);
  } else {
    assert.equal(child.kill(signal), true);
  }
}

export function disconnectTestIpc(child: ChildProcess): void {
  if (child.connected) child.disconnect();
}

export function waitForExit(
  child: ChildProcess,
  timeoutMs = EXIT_TIMEOUT_MS,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.off('exit', onExit);
      reject(
        new Error(
          `Timed out after ${String(timeoutMs)}ms waiting for process exit`,
        ),
      );
    }, timeoutMs);
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    };
    child.once('exit', onExit);
  });
}

export async function cleanupChild(child: ChildProcess): Promise<void> {
  disconnectTestIpc(child);
  if (child.exitCode !== null || child.signalCode !== null) return;

  child.kill();
  try {
    await waitForExit(child, 2_000);
  } catch {
    // Cleanup is best-effort after the test's lifecycle assertion has failed.
  }
}

function mergeEnvironment(
  inherited: NodeJS.ProcessEnv,
  overrides: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const result = { ...inherited };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete result[key];
    else result[key] = value;
  }
  return result;
}
