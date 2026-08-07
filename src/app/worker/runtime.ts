import { MessageChannel } from 'node:worker_threads';

import type { RuntimeConfig } from '../../shared/runtime-config.ts';

export interface WorkerRuntime {
  readonly config: Readonly<RuntimeConfig>;
  readonly state: 'ready' | 'stopped';
  readonly stopped: Promise<void>;
  shutdown(): Promise<void>;
}

export async function startWorkerRuntime(
  config: Readonly<RuntimeConfig>,
): Promise<WorkerRuntime> {
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
      shutdownPromise ??= Promise.resolve().then(() => {
        keepAlive.port1.off('message', holdOpen);
        keepAlive.port1.close();
        keepAlive.port2.close();
        state = 'stopped';
        resolveStopped?.();
      });
      return shutdownPromise;
    },
  };
}
