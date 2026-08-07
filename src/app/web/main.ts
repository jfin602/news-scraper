import { createWebApp } from './create-app.ts';
import { startWebServer } from './server.ts';
import { parseWebConfig } from './web-config.ts';

async function main(): Promise<void> {
  try {
    const config = parseWebConfig(process.env);
    const webServer = await startWebServer(createWebApp(), config);
    writeEvent({
      event: 'web.listening',
      host: webServer.host,
      port: webServer.port,
    });

    let shutdownPromise: Promise<void> | undefined;
    const shutdown = () => {
      shutdownPromise ??= webServer
        .close()
        .then(() => writeEvent({ event: 'web.stopped', role: 'web' }))
        .catch(() => {
          writeError('web.shutdown_failed');
          process.exitCode = 1;
        });
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch {
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
