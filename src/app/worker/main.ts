import { parseRuntimeConfig } from '../../shared/runtime-config.ts';
import { startWorkerRuntime } from './runtime.ts';

async function main(): Promise<void> {
  try {
    const config = parseRuntimeConfig(process.env);
    const runtime = await startWorkerRuntime(config);
    let shutdownPromise: Promise<void> | undefined;
    const shutdown = () => {
      shutdownPromise ??= runtime.shutdown();
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    writeEvent({ event: 'worker.ready', role: 'worker' });

    try {
      await runtime.stopped;
      writeEvent({ event: 'worker.stopped', role: 'worker' });
    } finally {
      process.off('SIGINT', shutdown);
      process.off('SIGTERM', shutdown);
    }
  } catch {
    writeError('worker.start_failed');
    process.exitCode = 1;
  }
}

function writeEvent(event: Readonly<Record<string, string>>): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function writeError(event: string): void {
  process.stderr.write(`${JSON.stringify({ event, role: 'worker' })}\n`);
}

await main();
