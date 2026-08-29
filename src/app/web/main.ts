import { parseDatabaseConfig } from '../../database/config.ts';
import { createDatabase } from '../../database/database.ts';
import { createDatabaseDependency } from '../../database/readiness.ts';
import { createEditorialAdministrationService } from '../../admin/editorial-administration.ts';
import { createDistributionProfileAdministrationService } from '../../admin/distribution-profile-administration.ts';
import { createDistributionCredentialAdministrationService } from '../../admin/distribution-credential-administration.ts';
import { createArticleAdministrationService } from '../../admin/article-administration.ts';
import { createDuplicateAdministrationService } from '../../admin/duplicate-administration.ts';
import { createEndpointAdministrationService } from '../../admin/endpoint-administration.ts';
import { createPublicationAdministrationService } from '../../admin/publication-administration.ts';
import { createSourceAdministrationService } from '../../admin/source-administration.ts';
import { createOperationalSnapshotService } from '../../observability/operational-snapshot.ts';
import { readPublicFeed } from '../../public-feed/repository.ts';
import { createWebApp } from './create-app.ts';
import { registerEditorialAdministrationRoutes } from './editorial-administration-router.ts';
import { registerDistributionProfileAdministrationRoutes } from './distribution-profile-administration-router.ts';
import { registerDistributionCredentialAdministrationRoutes } from './distribution-credential-administration-router.ts';
import { registerEndpointAdministrationRoutes } from './endpoint-administration-router.ts';
import { registerPublicationAdministrationRoutes } from './publication-administration-router.ts';
import { startWebServer } from './server.ts';
import { registerSourceAdministrationRoutes } from './source-administration-router.ts';
import { registerModerationAdministrationRoutes } from './moderation-administration-router.ts';
import { registerOperationalSnapshotRoutes } from './operational-snapshot-router.ts';
import { registerPhpIntegrationDownloadRoutes } from './php-integration-download-router.ts';
import { parseWebConfig } from './web-config.ts';
import { createDistributionApiRuntime } from './distribution-api-runtime.ts';
import { createPhpIntegrationPackageProducer } from '../../integrations/php-integration-package.ts';
import { createProfileAiAdministrationService } from '../../admin/profile-ai-administration.ts';
import { createProductionDigestLifecycleService } from '../../distribution/digests/production.ts';
import { registerProfileAiAdministrationRoutes } from './profile-ai-administration-router.ts';

async function main(): Promise<void> {
  let database: ReturnType<typeof createDatabase> | undefined;
  try {
    const config = parseWebConfig(process.env);
    const databaseConfig = parseDatabaseConfig(process.env);
    const applicationDatabase = createDatabase(databaseConfig);
    database = applicationDatabase;
    const dependency = createDatabaseDependency(applicationDatabase);
    const distributionApi = createDistributionApiRuntime(
      applicationDatabase,
      config,
      { telemetry: writeEvent },
    );
    const digestLifecycle =
      createProductionDigestLifecycleService(applicationDatabase);
    const registerProfileAiRoutes = registerProfileAiAdministrationRoutes(
      createProfileAiAdministrationService(
        applicationDatabase,
        digestLifecycle,
      ),
    );
    const registerSourceRoutes = registerSourceAdministrationRoutes(
      createSourceAdministrationService(applicationDatabase),
    );
    const registerEndpointRoutes = registerEndpointAdministrationRoutes(
      createEndpointAdministrationService(applicationDatabase),
    );
    const registerPublicationRoutes = registerPublicationAdministrationRoutes(
      createPublicationAdministrationService(applicationDatabase),
    );
    const registerEditorialRoutes = registerEditorialAdministrationRoutes(
      createEditorialAdministrationService(applicationDatabase),
    );
    const registerDistributionProfileRoutes =
      registerDistributionProfileAdministrationRoutes(
        createDistributionProfileAdministrationService(applicationDatabase),
      );
    const registerDistributionCredentialRoutes =
      registerDistributionCredentialAdministrationRoutes(
        createDistributionCredentialAdministrationService(applicationDatabase),
      );
    const phpIntegrationPackageProducer = createPhpIntegrationPackageProducer();
    const phpIntegrationPackageDescription =
      await phpIntegrationPackageProducer.describe();
    const registerPhpIntegrationDownloadRoute =
      registerPhpIntegrationDownloadRoutes(phpIntegrationPackageProducer);
    const registerModerationRoutes = registerModerationAdministrationRoutes(
      applicationDatabase,
      createArticleAdministrationService(applicationDatabase),
      createDuplicateAdministrationService(applicationDatabase),
    );
    const registerOperationalRoutes = registerOperationalSnapshotRoutes(
      createOperationalSnapshotService(applicationDatabase),
    );
    const webServer = await startWebServer(
      createWebApp(
        {
          readiness: dependency,
          publicFeed: {
            read: (request) => readPublicFeed(applicationDatabase, request),
          },
        },
        {
          adminEnabled: config.adminEnabled,
          phpIntegrationPackageVersion:
            phpIntegrationPackageDescription.version,
          distributionApiRouter: distributionApi.router,
          registerAdminApiRoutes: (router) => {
            registerSourceRoutes(router);
            registerEndpointRoutes(router);
            registerPublicationRoutes(router);
            registerEditorialRoutes(router);
            registerDistributionProfileRoutes(router);
            registerProfileAiRoutes(router);
            registerDistributionCredentialRoutes(router);
            registerPhpIntegrationDownloadRoute(router);
            registerModerationRoutes(router);
            registerOperationalRoutes(router);
          },
        },
      ),
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

function writeEvent(event: object): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function writeError(event: string): void {
  process.stderr.write(`${JSON.stringify({ event, role: 'web' })}\n`);
}

await main();
