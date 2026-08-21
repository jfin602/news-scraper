import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { Client } from 'pg';

import { createDatabase } from '../../src/database/database.ts';
import { readCanonicalOutwardArticles } from '../../src/distribution/canonical-outward-articles.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const scope = createDatabaseTestScope('migrated');
after(async () => scope.dispose());

test('canonical outward producer owns retained Article eligibility and normalized projection', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const client = new Client({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await client.connect();
      const source = await sourceRow(client, 'approved', 'active', 'paused');
      const unapproved = await sourceRow(
        client,
        'unapproved',
        'active',
        'enabled',
      );
      const archived = await sourceRow(
        client,
        'approved',
        'archived',
        'enabled',
      );
      const primary = await article(client, source, {
        title: 'Persisted title',
        override: 'Moderated title',
        originalUrl: 'https://reader.example/original',
        canonicalUrl: 'https://identity.example/other',
        publishedAt: '2026-08-01T00:00:00.123456Z',
        author: 'Author',
        summary: 'Summary',
        imageUrl: 'https://images.example/a.jpg',
      });
      const nonPrimary = await article(client, source, {
        title: 'Suppressed duplicate',
      });
      await article(client, source, { title: 'Hidden', visibility: 'hidden' });
      await article(client, source, {
        title: 'Archived',
        visibility: 'archived',
      });
      await article(client, unapproved, { title: 'Unapproved' });
      await article(client, archived, { title: 'Archived source' });
      const group = randomUUID();
      await client.query('BEGIN');
      await client.query(
        'SET CONSTRAINTS duplicate_groups_primary_membership_fk DEFERRED',
      );
      await client.query(
        'INSERT INTO duplicate_groups (id, primary_article_id) VALUES ($1, $2)',
        [group, primary],
      );
      await client.query(
        'INSERT INTO duplicate_group_memberships (group_id, article_id) VALUES ($1, $2), ($1, $3)',
        [group, primary, nonPrimary],
      );
      await client.query('COMMIT');
      const automatic = await category(client, 'automatic', 'Automatic');
      const manual = await category(client, 'manual', 'Manual');
      await client.query(
        'INSERT INTO article_categories (article_id, category_id) VALUES ($1, $2)',
        [primary, automatic],
      );

      let results = await readCanonicalOutwardArticles(database, { limit: 10 });
      assert.deepEqual(
        results.map((item) => item.articleId),
        [primary],
      );
      assert.deepEqual(results[0], {
        articleId: primary,
        headline: 'Moderated title',
        originalUrl: 'https://reader.example/original',
        effectiveFeedDate: new Date('2026-08-01T00:00:00.123Z'),
        feedDateSource: 'published_at',
        publishedAt: new Date('2026-08-01T00:00:00.123Z'),
        author: 'Author',
        summary: 'Summary',
        imageUrl: 'https://images.example/a.jpg',
        source: {
          configKey: 'source_approved_active',
          displayName: 'Approved source',
        },
        categories: [{ configKey: 'automatic', displayName: 'Automatic' }],
        orderPosition: {
          effectiveFeedDate: '2026-08-01T00:00:00.123456Z',
          firstSeenAt: '2026-08-02T00:00:00.654321Z',
          articleId: primary,
        },
      });
      await client.query(
        'INSERT INTO article_category_overrides (article_id) VALUES ($1)',
        [primary],
      );
      results = await readCanonicalOutwardArticles(database, { limit: 10 });
      assert.deepEqual(results[0]?.categories, []);
      await client.query(
        'INSERT INTO article_category_override_memberships (article_id, category_id) VALUES ($1, $2)',
        [primary, manual],
      );
      results = await readCanonicalOutwardArticles(database, { limit: 10 });
      assert.deepEqual(results[0]?.categories, [
        { configKey: 'manual', displayName: 'Manual' },
      ]);
      await client.query(
        'DELETE FROM article_category_overrides WHERE article_id = $1',
        [primary],
      );
      results = await readCanonicalOutwardArticles(database, { limit: 10 });
      assert.deepEqual(results[0]?.categories, [
        { configKey: 'automatic', displayName: 'Automatic' },
      ]);
    } finally {
      await Promise.all([database.close(), client.end()]);
    }
  });
});

test('canonical outward producer preserves microsecond order positions and first-seen fallback', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const client = new Client({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await client.connect();
      const source = await sourceRow(client, 'approved', 'active', 'disabled');
      const later = await article(client, source, {
        title: 'Later microsecond',
        firstSeen: '2026-08-02T00:00:00.000002Z',
      });
      const earlier = await article(client, source, {
        title: 'Earlier microsecond',
        firstSeen: '2026-08-02T00:00:00.000001Z',
      });
      const results = await readCanonicalOutwardArticles(database, {
        limit: 10,
      });
      assert.deepEqual(
        results.map((item) => item.articleId),
        [later, earlier],
      );
      assert.equal(results[0]?.feedDateSource, 'first_seen_at');
      assert.equal(
        results[0]?.orderPosition.effectiveFeedDate,
        '2026-08-02T00:00:00.000002Z',
      );
      const continued = await readCanonicalOutwardArticles(database, {
        limit: 10,
        continuationPosition: results[0]!.orderPosition,
      });
      assert.deepEqual(
        continued.map((item) => item.articleId),
        [earlier],
      );
    } finally {
      await Promise.all([database.close(), client.end()]);
    }
  });
});

async function sourceRow(
  client: Client,
  approval: string,
  lifecycle: string,
  operational: string,
): Promise<string> {
  const id = randomUUID();
  const key = `source_${approval}_${lifecycle}`;
  await client.query(
    'INSERT INTO sources (id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [
      id,
      key,
      approval === 'approved' ? 'Approved source' : 'Unapproved source',
      `https://${key}.example`,
      approval,
      lifecycle,
      operational,
    ],
  );
  return id;
}
async function category(
  client: Client,
  key: string,
  name: string,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    'INSERT INTO categories (id, config_key, display_name) VALUES ($1,$2,$3)',
    [id, key, name],
  );
  return id;
}
async function article(
  client: Client,
  sourceId: string,
  options: {
    title: string;
    override?: string;
    originalUrl?: string;
    canonicalUrl?: string;
    publishedAt?: string;
    firstSeen?: string;
    author?: string;
    summary?: string;
    imageUrl?: string;
    visibility?: string;
  },
): Promise<string> {
  const id = randomUUID();
  const firstSeen = options.firstSeen ?? '2026-08-02T00:00:00.654321Z';
  const parsed = options.publishedAt !== undefined;
  await client.query(
    `INSERT INTO articles (id, source_id, original_url, canonical_identity_url, display_title, normalized_title, display_title_override, author, summary, image_url, published_at_status, published_at, source_updated_at_status, first_seen_at, last_seen_at, visibility_state) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'missing',$13,$13,$14)`,
    [
      id,
      sourceId,
      options.originalUrl ?? `https://reader.example/${id}`,
      options.canonicalUrl ?? `https://identity.example/${id}`,
      options.title,
      options.title.toLowerCase(),
      options.override ?? null,
      options.author ?? null,
      options.summary ?? null,
      options.imageUrl ?? null,
      parsed ? 'parsed' : 'missing',
      options.publishedAt ?? null,
      firstSeen,
      options.visibility ?? 'visible',
    ],
  );
  return id;
}
