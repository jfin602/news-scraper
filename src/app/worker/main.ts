import { parseDatabaseConfig } from '../../database/config.ts';
import { createDatabase } from '../../database/database.ts';
import { parseRuntimeConfig } from '../../shared/runtime-config.ts';
import {
  createWorkerRuntimeDependencies,
  startWorkerRuntime,
  type WorkerDiagnostic,
} from './runtime.ts';

async function main(): Promise<void> {
  try {
    const config = parseRuntimeConfig(process.env);
    const databaseConfig = parseDatabaseConfig(process.env);
    const database = createDatabase(databaseConfig);
    const runtime = await startWorkerRuntime(
      config,
      createWorkerRuntimeDependencies(database, { emit: writeEvent }),
    );
    let shutdownPromise: Promise<void> | undefined;
    const shutdown = () => {
      shutdownPromise ??= runtime.shutdown().catch(() => {
        writeError('worker.shutdown_failed');
        process.exitCode = 1;
      });
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

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

function writeEvent(event: WorkerDiagnostic): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function writeError(event: string): void {
  process.stderr.write(`${JSON.stringify({ event, role: 'worker' })}\n`);
}

await main();
