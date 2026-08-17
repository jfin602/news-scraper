import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import {
  createPublicationAdministrationService,
  PublicationAdministrationError,
} from '../../src/admin/publication-administration.ts';
import { createWebApp } from '../../src/app/web/create-app.ts';
import { registerPublicationAdministrationRoutes } from '../../src/app/web/publication-administration-router.ts';
import { createDatabase } from '../../src/database/database.ts';
import { insertPublicationSettings } from '../../src/publication/repository.ts';
import { startWebServer } from '../../src/app/web/server.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

describe('Publication administration API', () => {
  it('reads and atomically replaces the complete singleton configuration', async () => {
    await databaseTestScope.use(async ({ databaseUrl }) => {
      const database = createDatabase({ connectionString: databaseUrl });
      try {
        await insertPublicationSettings(database, publicationInput());
        const service = createPublicationAdministrationService(database);
        assert.equal(
          (await service.getPublication()).presentationTimezone,
          'America/Chicago',
        );

        const updated = await service.replacePublication({
          name: 'Updated publication',
          activeForCollection: false,
          publicStatus: 'private',
          description: 'Updated description',
          logoPath: '/updated.svg',
          accentColor: '#ABCDEF',
          presentationTimezone: 'UTC',
        });
        assert.deepEqual(updated, {
          name: 'Updated publication',
          activeForCollection: false,
          publicStatus: 'private',
          description: 'Updated description',
          logoPath: '/updated.svg',
          accentColor: '#ABCDEF',
          presentationTimezone: 'UTC',
        });
        await assert.rejects(
          service.replacePublication({ ...publicationInput(), typo: true }),
          (error: unknown) =>
            error instanceof PublicationAdministrationError &&
            error.code === 'invalid_request',
        );
      } finally {
        await database.close();
      }
    });
  });

  it('returns bounded HTTP errors and enforces mutation integrity', async () => {
    await databaseTestScope.use(async ({ databaseUrl }) => {
      const database = createDatabase({ connectionString: databaseUrl });
      const service = createPublicationAdministrationService(database);
      const server = await startWebServer(
        createWebApp(
          {
            readiness: { checkReady: async () => true },
            publicFeed: { read: async () => undefined },
          },
          {
            adminEnabled: true,
            registerAdminApiRoutes:
              registerPublicationAdministrationRoutes(service),
          },
        ),
        { host: '127.0.0.1', port: 0 },
      );
      try {
        const missing = await fetch(
          `http://${server.host}:${String(server.port)}/admin/api/publication`,
        );
        assert.equal(missing.status, 404);
        assert.deepEqual(await missing.json(), {
          error: 'publication_not_found',
        });

        const rejected = await fetch(
          `http://${server.host}:${String(server.port)}/admin/api/publication/configuration`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(publicationInput()),
          },
        );
        assert.equal(rejected.status, 403);
        const count = await database.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM publication_settings',
        );
        assert.equal(count.rows[0]?.count, '0');
      } finally {
        await server.close();
        await database.close();
      }
    });
  });
});

function publicationInput(): Record<string, unknown> {
  return {
    name: 'Initial publication',
    activeForCollection: true,
    publicStatus: 'public',
    description: 'Description',
    logoPath: '/logo.svg',
    accentColor: '#123456',
    presentationTimezone: 'America/Chicago',
  };
}
