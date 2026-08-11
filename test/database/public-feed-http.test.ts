import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { Client } from 'pg';

import { createWebApp } from '../../src/app/web/create-app.ts';
import { startWebServer } from '../../src/app/web/server.ts';
import { createDatabase } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import { readPublicFeed } from '../../src/public-feed/repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

test('serves persisted public Articles through the production reader and HTTP stack', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const client = new Client({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    await client.connect();

    try {
      const publication = await insertPublicationSettings(
        client,
        'Public Feed HTTP',
      );
      const sourceId = randomUUID();
      await client.query(
        `INSERT INTO sources (
           id, config_key, display_name, site_url,
           approval_state, lifecycle_state, operational_state
         ) VALUES ($1, 'http_source', 'HTTP Publisher',
           'https://publisher.example/', 'approved', 'active', 'enabled')`,
        [sourceId],
      );
      const articleId = randomUUID();
      const originalUrl = 'https://publisher.example/canonical-story';
      await client.query(
        `INSERT INTO articles (
           id, source_id, original_url, canonical_identity_url,
           display_title, normalized_title, published_at_status, published_at,
           source_updated_at_status, source_updated_at, visibility_state,
           first_seen_at, last_seen_at
         ) VALUES (
           $1, $2, $3, $3, 'Persisted HTTP headline',
           'persisted http headline', 'parsed', $4, 'missing', NULL, 'visible',
           $5, $5
         )`,
        [
          articleId,
          sourceId,
          originalUrl,
          new Date('2026-08-10T12:00:00.000Z'),
          new Date('2026-08-10T13:00:00.000Z'),
        ],
      );

      const webServer = await startWebServer(
        createWebApp({
          readiness: { checkReady: async () => true },
          publicFeed: {
            read: () => readPublicFeed(database),
          },
        }),
        { host: '127.0.0.1', port: 0 },
      );
      try {
        const baseUrl = `http://${webServer.host}:${webServer.port}`;
        const response = await fetch(`${baseUrl}/api/feed`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          publication,
          items: [
            {
              articleId,
              effectiveFeedDate: '2026-08-10T12:00:00.000Z',
              feedDateSource: 'published_at',
              headline: 'Persisted HTTP headline',
              sourceName: 'HTTP Publisher',
              originalUrl,
            },
          ],
        });

        await client.query(
          "UPDATE articles SET visibility_state = 'hidden' WHERE id = $1",
          [articleId],
        );
        const emptyResponse = await fetch(`${baseUrl}/api/feed`);
        assert.equal(emptyResponse.status, 200);
        assert.deepEqual(await emptyResponse.json(), {
          publication,
          items: [],
        });

        await client.query(
          "UPDATE publication_settings SET public_status = 'private'",
        );
        const privateResponse = await fetch(`${baseUrl}/api/feed`);
        assert.equal(privateResponse.status, 404);
        assert.deepEqual(await privateResponse.json(), { error: 'not_found' });

        await client.query('DELETE FROM publication_settings');
        const absentResponse = await fetch(`${baseUrl}/api/feed`);
        assert.equal(absentResponse.status, 404);
        assert.deepEqual(await absentResponse.json(), { error: 'not_found' });

        const obsoleteResponse = await fetch(
          `${baseUrl}/api/publications/obsolete/feed`,
        );
        assert.equal(obsoleteResponse.status, 404);
      } finally {
        await webServer.close();
      }
    } finally {
      await Promise.all([database.close(), client.end()]);
    }
  });
});

async function insertPublicationSettings(client: Client, name: string) {
  const publication = { name };
  await client.query(
    `INSERT INTO publication_settings (
       name, active_for_collection, public_status
     ) VALUES ($1, true, 'public')`,
    [publication.name],
  );
  return publication;
}
