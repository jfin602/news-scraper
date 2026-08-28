import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Client } from 'pg';

import { migrateDatabase } from '../../src/database/migrations.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

test('Phase 17 moderation persistence migrates from zero and enforces bounded authority', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    const applied = await migrateDatabase({ connectionString: databaseUrl });
    assert.equal(applied.at(-1), '0019_digest_lifecycle_handoff.sql');
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      const fixture = await createFixture(client);

      const migrationRows = await client.query<{ filename: string }>(
        `SELECT filename FROM news_scraper_schema_migrations ORDER BY filename`,
      );
      assert.equal(
        migrationRows.rows.at(-1)?.filename,
        '0019_digest_lifecycle_handoff.sql',
        'latest migration should remain current',
      );

      await client.query(
        'UPDATE articles SET display_title_override = $2 WHERE id = $1',
        [fixture.articleOne, 'Human headline'],
      );
      await client.query(
        'UPDATE articles SET display_title_override = NULL WHERE id = $1',
        [fixture.articleOne],
      );
      for (const value of [' ', ' padded ', 'x'.repeat(2049)]) {
        await rejects(client, () =>
          client.query(
            'UPDATE articles SET display_title_override = $2 WHERE id = $1',
            [fixture.articleOne, value],
          ),
        );
      }

      const noOverride = await client.query(
        'SELECT count(*)::int AS count FROM article_category_overrides WHERE article_id = $1',
        [fixture.articleOne],
      );
      assert.equal(noOverride.rows[0]?.count, 0);
      await client.query(
        'INSERT INTO article_category_overrides (article_id) VALUES ($1)',
        [fixture.articleOne],
      );
      const emptyOverride = await client.query(
        `SELECT count(*)::int AS marker,
                (SELECT count(*)::int FROM article_category_override_memberships WHERE article_id = $1) AS memberships
           FROM article_category_overrides WHERE article_id = $1`,
        [fixture.articleOne],
      );
      assert.deepEqual(emptyOverride.rows, [{ marker: 1, memberships: 0 }]);
      await client.query(
        `INSERT INTO article_category_override_memberships (article_id, category_id)
         VALUES ($1, $2)`,
        [fixture.articleOne, fixture.categoryOne],
      );
      await rejects(client, () =>
        client.query(
          `INSERT INTO article_category_override_memberships (article_id, category_id)
           VALUES ($1, $2)`,
          [fixture.articleOne, fixture.categoryOne],
        ),
      );
      await rejects(client, () =>
        client.query(
          `INSERT INTO article_category_override_memberships (article_id, category_id)
           VALUES ($1, $2)`,
          [fixture.articleOne, randomUUID()],
        ),
      );

      await client.query(
        `INSERT INTO duplicate_manual_separations (article_low_id, article_high_id, reason)
         VALUES ($1, $2, 'Operator confirmed distinct')`,
        [fixture.articleOne, fixture.articleTwo],
      );
      await rejects(client, () =>
        client.query(
          `INSERT INTO duplicate_manual_separations (article_low_id, article_high_id)
           VALUES ($1, $2)`,
          [fixture.articleOne, fixture.articleOne],
        ),
      );
      await rejects(client, () =>
        client.query(
          `INSERT INTO duplicate_manual_separations (article_low_id, article_high_id)
           VALUES ($1, $2)`,
          [fixture.articleTwo, fixture.articleOne],
        ),
      );
      await rejects(client, () =>
        client.query(
          `INSERT INTO duplicate_manual_separations (article_low_id, article_high_id, reason)
           VALUES ($1, $2, ' ')`,
          [fixture.articleOne, fixture.articleThree],
        ),
      );
      const separation = await client.query<{ reason: string }>(
        `SELECT reason FROM duplicate_manual_separations
         WHERE article_low_id = $1 AND article_high_id = $2`,
        [fixture.articleOne, fixture.articleTwo],
      );
      assert.deepEqual(separation.rows, [
        { reason: 'Operator confirmed distinct' },
      ]);

      const groupId = randomUUID();
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO duplicate_groups (id, primary_article_id) VALUES ($1, $2)',
        [groupId, fixture.articleOne],
      );
      await client.query(
        `INSERT INTO duplicate_group_memberships (group_id, article_id)
         VALUES ($1, $2), ($1, $3)`,
        [groupId, fixture.articleOne, fixture.articleTwo],
      );
      await client.query('COMMIT');
      await client.query(
        `UPDATE duplicate_groups SET primary_selection_origin = 'manual' WHERE id = $1`,
        [groupId],
      );
      await rejects(client, () =>
        client.query(
          `UPDATE duplicate_groups SET primary_selection_origin = 'operator' WHERE id = $1`,
          [groupId],
        ),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE duplicate_groups SET primary_article_id = $2 WHERE id = $1`,
          [groupId, fixture.articleThree],
        ),
      );

      await client.query(
        `INSERT INTO audit_events (id, action, target_type, target_id, reason, prior_state, new_state)
         VALUES ($1, 'article_hidden', 'article', $2, 'Editorial decision', '{"visibility_state":"visible"}', '{"visibility_state":"hidden"}')`,
        [randomUUID(), fixture.articleOne],
      );
      const invalidAuditRows: ReadonlyArray<{
        statement: string;
        params: unknown[];
      }> = [
        {
          statement: `INSERT INTO audit_events (id, action, target_type, target_id) VALUES ($1, ' ', 'article', $2)`,
          params: [randomUUID(), fixture.articleOne],
        },
        {
          statement: `INSERT INTO audit_events (id, action, target_type, target_id) VALUES ($1, 'article_hidden', ' ', $2)`,
          params: [randomUUID(), fixture.articleOne],
        },
        {
          statement: `INSERT INTO audit_events (id, action, target_type, target_id, reason) VALUES ($1, 'article_hidden', 'article', $2, ' ')`,
          params: [randomUUID(), fixture.articleOne],
        },
        {
          statement: `INSERT INTO audit_events (id, action, target_type, target_id, prior_state) VALUES ($1, 'article_hidden', 'article', $2, '[]')`,
          params: [randomUUID(), fixture.articleOne],
        },
        {
          statement: `INSERT INTO audit_events (id, action, target_type, target_id, new_state) VALUES ($1, 'article_hidden', 'article', $2, $3::jsonb)`,
          params: [
            randomUUID(),
            fixture.articleOne,
            JSON.stringify({ value: 'x'.repeat(33000) }),
          ],
        },
      ];
      for (const { statement, params } of invalidAuditRows) {
        await rejects(client, () => client.query(statement, params));
      }
      const counts = await client.query<{
        articles: string;
        observations: string;
        categories: string;
      }>(
        `SELECT (SELECT count(*) FROM articles) AS articles,
                (SELECT count(*) FROM article_observations) AS observations,
                (SELECT count(*) FROM article_categories) AS categories`,
      );
      assert.deepEqual(counts.rows, [
        { articles: '3', observations: '1', categories: '1' },
      ]);
    } finally {
      await client.end();
    }
  });
});

async function createFixture(client: Client) {
  const sourceId = '10000000-0000-4000-8000-000000000001';
  const endpointId = '20000000-0000-4000-8000-000000000001';
  const runId = '30000000-0000-4000-8000-000000000001';
  const articleOne = '40000000-0000-4000-8000-000000000001';
  const articleTwo = '40000000-0000-4000-8000-000000000002';
  const articleThree = '40000000-0000-4000-8000-000000000003';
  const categoryOne = '50000000-0000-4000-8000-000000000001';
  await client.query(
    `INSERT INTO sources (id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state)
     VALUES ($1, 'moderation_source', 'Moderation Source', 'https://moderation.example', 'approved', 'active', 'enabled')`,
    [sourceId],
  );
  await client.query(
    `INSERT INTO source_endpoints (id, source_id, config_key, endpoint_url, endpoint_type, approval_state, lifecycle_state, operational_state, poll_interval_seconds)
     VALUES ($1, $2, 'moderation_feed', 'https://moderation.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300)`,
    [endpointId, sourceId],
  );
  await client.query(
    `INSERT INTO collection_runs (id, source_endpoint_id, execution_id, started_at, finished_at, run_status, transport_status, parser_status)
     VALUES ($1, $2, 'moderation-run', now(), now(), 'succeeded', 'not_modified', 'not_run')`,
    [runId, endpointId],
  );
  for (const [id, title] of [
    [articleOne, 'One'],
    [articleTwo, 'Two'],
    [articleThree, 'Three'],
  ] as const) {
    await client.query(
      `INSERT INTO articles (id, source_id, original_url, canonical_identity_url, display_title, normalized_title,
         published_at_status, source_updated_at_status, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $3, $4, $5, 'missing', 'missing', now(), now())`,
      [
        id,
        sourceId,
        `https://moderation.example/${title.toLowerCase()}`,
        title,
        title.toLowerCase(),
      ],
    );
  }
  await client.query(
    `INSERT INTO article_observations (id, source_id, source_endpoint_id, collection_run_id, article_id, processing_outcome)
     VALUES ($1, $2, $3, $4, $5, 'created')`,
    [randomUUID(), sourceId, endpointId, runId, articleOne],
  );
  await client.query(
    `INSERT INTO categories (id, config_key, display_name) VALUES ($1, 'moderation_category', 'Moderation Category')`,
    [categoryOne],
  );
  await client.query(
    'INSERT INTO article_categories (article_id, category_id) VALUES ($1, $2)',
    [articleOne, categoryOne],
  );
  return { articleOne, articleTwo, articleThree, categoryOne };
}

async function rejects(
  client: Client,
  operation: () => Promise<unknown>,
): Promise<void> {
  await assert.rejects(operation);
  await client.query('SELECT 1');
}
