import { MessageChannel } from 'node:worker_threads';

import type { RuntimeConfig } from '../../shared/runtime-config.ts';
import type { DatabaseDependency } from '../../database/readiness.ts';

export interface WorkerRuntime {
  readonly config: Readonly<RuntimeConfig>;
  readonly state: 'ready' | 'stopped';
  readonly stopped: Promise<void>;
  shutdown(): Promise<void>;
}

export async function startWorkerRuntime(
  config: Readonly<RuntimeConfig>,
  database: DatabaseDependency,
): Promise<WorkerRuntime> {
  try {
    if (!(await database.checkReady())) throw new Error('Database not ready');
  } catch (error) {
    await database.close().catch(() => undefined);
    throw error;
  }
  const keepAlive = new MessageChannel();
  const holdOpen = () => undefined;
  keepAlive.port1.on('message', holdOpen);
  let state: WorkerRuntime['state'] = 'ready';
  let resolveStopped: (() => void) | undefined;
  const stopped = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });
  let shutdownPromise: Promise<void> | undefined;

  return {
    config,
    get state() {
      return state;
    },
    stopped,
    shutdown() {
      shutdownPromise ??= (async () => {
        try {
          await database.close();
        } finally {
          keepAlive.port1.off('message', holdOpen);
          keepAlive.port1.close();
          keepAlive.port2.close();
          state = 'stopped';
          resolveStopped?.();
        }
      })();
      return shutdownPromise;
    },
  };
}
