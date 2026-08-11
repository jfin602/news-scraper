import { parseDatabaseConfig } from '../../database/config.ts';
import { createDatabase } from '../../database/database.ts';
import { createDatabaseDependency } from '../../database/readiness.ts';
import { readPublicFeed } from '../../public-feed/repository.ts';
import { createWebApp } from './create-app.ts';
import { startWebServer } from './server.ts';
import { parseWebConfig } from './web-config.ts';

async function main(): Promise<void> {
  let database: ReturnType<typeof createDatabase> | undefined;
  try {
    const config = parseWebConfig(process.env);
    const databaseConfig = parseDatabaseConfig(process.env);
    const applicationDatabase = createDatabase(databaseConfig);
    database = applicationDatabase;
    const dependency = createDatabaseDependency(applicationDatabase);
    const webServer = await startWebServer(
      createWebApp({
        readiness: dependency,
        publicFeed: {
          read: () => readPublicFeed(applicationDatabase),
        },
      }),
      config,
    );
    writeEvent({
      event: 'web.listening',
      host: webServer.host,
      port: webServer.port,
    });

    let shutdownPromise: Promise<void> | undefined;
    const shutdown = () => {
      shutdownPromise ??= (async () => {
        try {
          await webServer.close();
        } finally {
          await dependency.close();
        }
      })()
        .then(() => writeEvent({ event: 'web.stopped', role: 'web' }))
        .catch(() => {
          writeError('web.shutdown_failed');
          process.exitCode = 1;
        });
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch {
    await database?.close().catch(() => undefined);
    writeError('web.start_failed');
    process.exitCode = 1;
  }
}

function writeEvent(event: Readonly<Record<string, string | number>>): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function writeError(event: string): void {
  process.stderr.write(`${JSON.stringify({ event, role: 'web' })}\n`);
}

await main();
