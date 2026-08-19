import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { Client } from 'pg';

import { createWebApp } from '../../src/app/web/create-app.ts';
import { startWebServer } from '../../src/app/web/server.ts';
import { createDatabase } from '../../src/database/database.ts';
import { readPublicFeed } from '../../src/public-feed/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const presentation = Object.freeze({
  name: 'Public Feed HTTP',
  description: 'Persisted public presentation.',
  logoPath: '/assets/public-feed-http.svg',
  accentColor: '#2A4B6C',
  presentationTimezone: 'America/Chicago',
});
const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

test('serves discovery through the production PostgreSQL reader and HTTP stack', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const client = new Client({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    await client.connect();

    try {
      await insertPublicationSettings(client, presentation);
      const source = await insertSource(
        client,
        'http_source',
        'HTTP Publisher',
      );
      const category = await insertCategory(
        client,
        'industry_news',
        'Industry news',
      );
      const specialArticle = await insertArticle(client, source.id, {
        displayTitle: 'Persisted HTTP headline',
        normalizedTitle: 'persisted http headline',
        publishedAt: '2026-08-12T12:00:00.000000Z',
        firstSeenAt: '2026-08-12T13:00:00.000000Z',
      });
      await assignCategory(client, specialArticle.id, category.id);
      await insertArticle(client, source.id, {
        displayTitle: 'Hidden Page Needle',
        normalizedTitle: 'hidden page needle',
        visibilityState: 'hidden',
      });
      for (let index = 0; index <= 100; index += 1) {
        await insertArticle(client, source.id, {
          displayTitle: `Page needle ${index}`,
          normalizedTitle: `page needle ${index}`,
          firstSeenAt: `2026-08-10T00:00:${String(index % 60).padStart(2, '0')}.${String(index).padStart(6, '0')}Z`,
        });
      }

      const webServer = await startWebServer(
        createWebApp({
          readiness: { checkReady: async () => true },
          publicFeed: { read: (request) => readPublicFeed(database, request) },
        }),
        { host: '127.0.0.1', port: 0 },
      );
      try {
        const baseUrl = `http://${webServer.host}:${webServer.port}`;
        const firstResponse = await fetch(`${baseUrl}/api/feed`);
        assert.equal(firstResponse.status, 200);
        assert.equal(firstResponse.headers.get('cache-control'), 'no-store');
        const firstBody = await firstResponse.json();
        assert.deepEqual(firstBody.publication, presentation);
        assert.deepEqual(firstBody.discovery.query, {
          q: null,
          source: null,
          category: null,
        });
        assert.deepEqual(firstBody.discovery.sources, [
          { configKey: 'http_source', displayName: 'HTTP Publisher' },
        ]);
        assert.deepEqual(firstBody.discovery.categories, [
          { configKey: 'industry_news', displayName: 'Industry news' },
        ]);
        assert.equal(firstBody.items.length, 100);
        assert.equal(firstBody.items[0].articleId, specialArticle.id);
        assert.equal(
          firstBody.items[0].originalUrl,
          specialArticle.originalUrl,
        );
        assert.equal(typeof firstBody.nextCursor, 'string');
        assert.doesNotMatch(
          JSON.stringify(firstBody),
          /normalizedTitle|firstSeen|author|summary|cursor_effective|internal/i,
        );

        const rootResponse = await fetch(
          `${baseUrl}/?q=HTTP%20HEADLINE&source=http_source&category=industry_news`,
        );
        const rootBody = await rootResponse.text();
        assert.equal(rootResponse.status, 200);
        assert.equal(rootResponse.headers.get('cache-control'), 'no-store');
        assert.match(rootBody, /Public Feed HTTP/u);
        assert.match(rootBody, /Persisted HTTP headline/u);
        assert.match(rootBody, new RegExp(specialArticle.originalUrl, 'u'));
        assert.match(rootBody, /data-public-feed-bootstrap/u);
        assert.doesNotMatch(rootBody, /Hidden Page Needle/u);

        const filteredResponse = await fetch(
          `${baseUrl}/api/feed?q=HTTP%20HEADLINE&source=http_source&category=industry_news`,
        );
        assert.equal(filteredResponse.status, 200);
        assert.equal(filteredResponse.headers.get('cache-control'), 'no-store');
        const filteredBody = await filteredResponse.json();
        assert.deepEqual(filteredBody.publication, presentation);
        assert.deepEqual(filteredBody.discovery.query, {
          q: 'HTTP HEADLINE',
          source: 'http_source',
          category: 'industry_news',
        });
        assert.deepEqual(
          filteredBody.items.map(
            (item: { articleId: string }) => item.articleId,
          ),
          [specialArticle.id],
        );

        const secondResponse = await fetch(
          `${baseUrl}/api/feed?cursor=${firstBody.nextCursor as string}`,
        );
        assert.equal(secondResponse.status, 200);
        assert.equal(secondResponse.headers.get('cache-control'), 'no-store');
        const secondBody = await secondResponse.json();
        assert.deepEqual(secondBody.publication, presentation);
        assert.equal(secondBody.items.length, 2);
        assert.equal(secondBody.nextCursor, null);
        assert.equal(
          new Set([
            ...firstBody.items.map(
              (item: { articleId: string }) => item.articleId,
            ),
            ...secondBody.items.map(
              (item: { articleId: string }) => item.articleId,
            ),
          ]).size,
          102,
        );

        const mismatchResponse = await fetch(
          `${baseUrl}/api/feed?q=other&cursor=${firstBody.nextCursor as string}`,
        );
        assert.equal(mismatchResponse.status, 400);
        assert.deepEqual(await mismatchResponse.json(), {
          error: 'invalid_request',
        });

        const unsupportedResponse = await fetch(
          `${baseUrl}/api/feed?source=missing_source`,
        );
        assert.equal(unsupportedResponse.status, 400);
        const unsupportedBody = JSON.stringify(
          await unsupportedResponse.json(),
        );
        assert.equal(
          unsupportedBody,
          JSON.stringify({ error: 'invalid_request' }),
        );
        assert.doesNotMatch(unsupportedBody, /missing_source|postgres|select/i);

        await client.query(
          "UPDATE articles SET visibility_state = 'hidden' WHERE id = $1",
          [specialArticle.id],
        );
        const hiddenResponse = await fetch(
          `${baseUrl}/api/feed?q=Persisted%20HTTP%20headline`,
        );
        assert.equal(hiddenResponse.status, 200);
        assert.deepEqual((await hiddenResponse.json()).items, []);

        await client.query(
          "UPDATE publication_settings SET public_status = 'private'",
        );
        const privateResponse = await fetch(
          `${baseUrl}/api/feed?source=missing_source`,
        );
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

async function insertPublicationSettings(
  client: Client,
  values: Readonly<{
    name: string;
    description: string | null;
    logoPath: string | null;
    accentColor: string | null;
    presentationTimezone: string | null;
  }>,
): Promise<void> {
  await client.query(
    `INSERT INTO publication_settings (
       name, active_for_collection, public_status,
       description, logo_path, accent_color, presentation_timezone
     ) VALUES ($1, true, 'public', $2, $3, $4, $5)`,
    [
      values.name,
      values.description,
      values.logoPath,
      values.accentColor,
      values.presentationTimezone,
    ],
  );
}

async function insertSource(
  client: Client,
  configKey: string,
  displayName: string,
): Promise<{ readonly id: string }> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO sources (
       id, config_key, display_name, site_url,
       approval_state, lifecycle_state, operational_state
     ) VALUES ($1, $2, $3, 'https://publisher.example/',
       'approved', 'active', 'enabled')`,
    [id, configKey, displayName],
  );
  return { id };
}

async function insertCategory(
  client: Client,
  configKey: string,
  displayName: string,
): Promise<{ readonly id: string }> {
  const id = randomUUID();
  await client.query(
    'INSERT INTO categories (id, config_key, display_name) VALUES ($1, $2, $3)',
    [id, configKey, displayName],
  );
  return { id };
}

async function insertArticle(
  client: Client,
  sourceId: string,
  options: Readonly<{
    displayTitle: string;
    normalizedTitle: string;
    publishedAt?: string;
    firstSeenAt?: string;
    visibilityState?: 'visible' | 'hidden';
  }>,
): Promise<{ readonly id: string; readonly originalUrl: string }> {
  const id = randomUUID();
  const originalUrl = `https://publisher.example/articles/${id}`;
  await client.query(
    `INSERT INTO articles (
       id, source_id, original_url, canonical_identity_url,
       display_title, normalized_title, published_at_status, published_at,
       source_updated_at_status, source_updated_at, visibility_state,
       first_seen_at, last_seen_at
     ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, 'missing', NULL, $8, $9, $9)`,
    [
      id,
      sourceId,
      originalUrl,
      options.displayTitle,
      options.normalizedTitle,
      options.publishedAt === undefined ? 'missing' : 'parsed',
      options.publishedAt ?? null,
      options.visibilityState ?? 'visible',
      options.firstSeenAt ?? '2026-08-10T00:00:00.000000Z',
    ],
  );
  return { id, originalUrl };
}

async function assignCategory(
  client: Client,
  articleId: string,
  categoryId: string,
): Promise<void> {
  await client.query(
    'INSERT INTO article_categories (article_id, category_id) VALUES ($1, $2)',
    [articleId, categoryId],
  );
}
