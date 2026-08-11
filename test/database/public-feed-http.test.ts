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
      const publicPublication = await insertPublication(
        client,
        'public-feed-http',
        'Public Feed HTTP',
        'public',
      );
      const emptyPublication = await insertPublication(
        client,
        'empty-feed-http',
        'Empty Feed HTTP',
        'public',
      );
      const privatePublication = await insertPublication(
        client,
        'private-feed-http',
        'Private Feed HTTP',
        'private',
      );
      const sourceId = randomUUID();
      await client.query(
        `INSERT INTO sources (
           id, publication_id, config_key, display_name, site_url,
           approval_state, lifecycle_state, operational_state
         ) VALUES ($1, $2, 'http_source', 'HTTP Publisher',
           'https://publisher.example/', 'approved', 'active', 'enabled')`,
        [sourceId, publicPublication.id],
      );
      const articleId = randomUUID();
      const originalUrl = 'https://publisher.example/canonical-story';
      await client.query(
        `INSERT INTO articles (
           id, publication_id, source_id, original_url, canonical_identity_url,
           display_title, normalized_title, published_at_status, published_at,
           source_updated_at_status, source_updated_at, visibility_state,
           first_seen_at, last_seen_at
         ) VALUES (
           $1, $2, $3, $4, $4, 'Persisted HTTP headline',
           'persisted http headline', 'parsed', $5, 'missing', NULL, 'visible',
           $6, $6
         )`,
        [
          articleId,
          publicPublication.id,
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
            read: (slug) => readPublicFeed(database, slug),
          },
        }),
        { host: '127.0.0.1', port: 0 },
      );
      try {
        const baseUrl = `http://${webServer.host}:${webServer.port}`;
        const response = await fetch(
          `${baseUrl}/api/publications/${publicPublication.slug}/feed`,
        );
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          publication: publicPublication,
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

        const emptyResponse = await fetch(
          `${baseUrl}/api/publications/${emptyPublication.slug}/feed`,
        );
        assert.equal(emptyResponse.status, 200);
        assert.deepEqual(await emptyResponse.json(), {
          publication: emptyPublication,
          items: [],
        });

        for (const slug of [privatePublication.slug, 'missing-feed-http']) {
          const hiddenResponse = await fetch(
            `${baseUrl}/api/publications/${slug}/feed`,
          );
          assert.equal(hiddenResponse.status, 404);
          assert.deepEqual(await hiddenResponse.json(), { error: 'not_found' });
        }
      } finally {
        await webServer.close();
      }
    } finally {
      await Promise.all([database.close(), client.end()]);
    }
  });
});

async function insertPublication(
  client: Client,
  slug: string,
  name: string,
  publicStatus: 'private' | 'public',
) {
  const publication = { id: randomUUID(), slug, name };
  await client.query(
    `INSERT INTO publications (
       id, name, slug, active_for_collection, public_status
     ) VALUES ($1, $2, $3, true, $4)`,
    [publication.id, publication.name, publication.slug, publicStatus],
  );
  return publication;
}
