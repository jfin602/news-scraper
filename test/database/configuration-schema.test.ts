import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Client } from 'pg';

import { migrateDatabase } from '../../src/database/migrations.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const publicationOne = '00000000-0000-0000-0000-000000000001';
const publicationTwo = '00000000-0000-0000-0000-000000000002';
const sourceOne = '00000000-0000-0000-0000-000000000011';
const sourceTwo = '00000000-0000-0000-0000-000000000012';
const sourceThree = '00000000-0000-0000-0000-000000000013';
const endpointOne = '00000000-0000-0000-0000-000000000021';
const endpointTwo = '00000000-0000-0000-0000-000000000022';
const endpointThree = '00000000-0000-0000-0000-000000000023';

test('production configuration schema migrates from zero and reruns safely', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    assert.deepEqual(await migrateDatabase({ connectionString: databaseUrl }), [
      '0001_publication_source_configuration.sql',
      '0002_collection_runs.sql',
      '0003_collection_run_normalization.sql',
    ]);
    assert.deepEqual(
      await migrateDatabase({ connectionString: databaseUrl }),
      [],
    );

    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      const tables = await client.query<{ table_name: string }>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN (
             'publications',
             'sources',
             'source_approved_domain_rules',
             'source_endpoints',
             'source_endpoint_domain_rules',
             'collection_runs'
           )
         ORDER BY table_name`,
      );
      assert.deepEqual(
        tables.rows.map(({ table_name }) => table_name),
        [
          'collection_runs',
          'publications',
          'source_approved_domain_rules',
          'source_endpoint_domain_rules',
          'source_endpoints',
          'sources',
        ],
      );
      const history = await client.query<{ count: string }>(
        'SELECT count(*) FROM news_scraper_schema_migrations',
      );
      assert.equal(history.rows[0]?.count, '3');
    } finally {
      await client.end();
    }
  });
});

test('production configuration schema enforces ownership, state, and policy invariants', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await insertPublication(client, publicationOne, 'publication-one');
      await insertPublication(client, publicationTwo, 'publication-two');
      await rejects(client, () =>
        insertPublication(
          client,
          '00000000-0000-0000-0000-000000000003',
          'publication-one',
        ),
      );
      await rejects(client, () =>
        client.query(
          `INSERT INTO publications (id, name, slug, active_for_collection, public_status)
           VALUES ('00000000-0000-0000-0000-000000000004', 'Invalid', 'Uppercase', true, 'public')`,
        ),
      );
      await rejects(client, () =>
        client.query(
          `INSERT INTO publications (id, name, slug, active_for_collection, public_status)
           VALUES ('00000000-0000-0000-0000-000000000005', 'Invalid', 'invalid-status', true, 'invalid')`,
        ),
      );

      await insertSource(client, sourceOne, publicationOne, 'primary_source');
      await insertSource(client, sourceTwo, publicationOne, 'secondary_source');
      await insertSource(client, sourceThree, publicationTwo, 'primary_source');
      await rejects(client, () =>
        insertSource(
          client,
          '00000000-0000-0000-0000-000000000014',
          publicationOne,
          'primary_source',
        ),
      );
      await rejects(client, () =>
        insertSource(
          client,
          '00000000-0000-0000-0000-000000000015',
          '00000000-0000-0000-0000-000000000099',
          'orphan_source',
        ),
      );
      await rejects(client, () =>
        insertSource(
          client,
          '00000000-0000-0000-0000-000000000016',
          publicationOne,
          'UPPERCASE',
        ),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE sources SET approval_state = 'invalid' WHERE id = '${sourceOne}'`,
        ),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE sources SET lifecycle_state = 'invalid' WHERE id = '${sourceOne}'`,
        ),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE sources SET operational_state = 'invalid' WHERE id = '${sourceOne}'`,
        ),
      );

      await insertEndpoint(
        client,
        endpointOne,
        sourceOne,
        'main_feed',
        'https://endpoint.invalid/feed.xml',
        60,
      );
      await insertEndpoint(
        client,
        endpointTwo,
        sourceOne,
        'secondary_feed',
        'https://endpoint.invalid/second.xml',
        2592000,
      );
      await insertEndpoint(
        client,
        endpointThree,
        sourceTwo,
        'main_feed',
        'https://endpoint.invalid/feed.xml',
        120,
      );
      await rejects(client, () =>
        insertEndpoint(
          client,
          '00000000-0000-0000-0000-000000000024',
          sourceOne,
          'main_feed',
          'https://endpoint.invalid/other.xml',
          120,
        ),
      );
      await rejects(client, () =>
        insertEndpoint(
          client,
          '00000000-0000-0000-0000-000000000025',
          sourceOne,
          'other_feed',
          'https://endpoint.invalid/feed.xml',
          120,
        ),
      );
      await rejects(client, () =>
        insertEndpoint(
          client,
          '00000000-0000-0000-0000-000000000026',
          '00000000-0000-0000-0000-000000000099',
          'orphan_feed',
          'https://endpoint.invalid/orphan.xml',
          120,
        ),
      );
      await rejects(client, () =>
        insertEndpoint(
          client,
          '00000000-0000-0000-0000-000000000027',
          sourceOne,
          'UPPERCASE',
          'https://endpoint.invalid/uppercase.xml',
          120,
        ),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE source_endpoints SET approval_state = 'invalid' WHERE id = '${endpointOne}'`,
        ),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE source_endpoints SET lifecycle_state = 'invalid' WHERE id = '${endpointOne}'`,
        ),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE source_endpoints SET operational_state = 'invalid' WHERE id = '${endpointOne}'`,
        ),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE source_endpoints SET endpoint_type = 'html' WHERE id = '${endpointOne}'`,
        ),
      );
      await rejects(client, () =>
        insertEndpoint(
          client,
          '00000000-0000-0000-0000-000000000028',
          sourceOne,
          'below_minimum',
          'https://endpoint.invalid/below.xml',
          59,
        ),
      );
      await insertEndpoint(
        client,
        '00000000-0000-0000-0000-000000000030',
        sourceOne,
        'above_minimum',
        'https://endpoint.invalid/above-minimum.xml',
        61,
      );
      await insertEndpoint(
        client,
        '00000000-0000-0000-0000-000000000031',
        sourceOne,
        'below_maximum',
        'https://endpoint.invalid/below-maximum.xml',
        2591999,
      );
      await rejects(client, () =>
        insertEndpoint(
          client,
          '00000000-0000-0000-0000-000000000029',
          sourceOne,
          'above_maximum',
          'https://endpoint.invalid/above.xml',
          2592001,
        ),
      );

      const sourceRule = await client.query<{ include_subdomains: boolean }>(
        `INSERT INTO source_approved_domain_rules (source_id, hostname)
         VALUES ($1, 'source.invalid')
         RETURNING include_subdomains`,
        [sourceOne],
      );
      assert.equal(sourceRule.rows[0]?.include_subdomains, false);
      await client.query(
        `INSERT INTO source_approved_domain_rules (source_id, hostname)
         VALUES ($1, 'source.invalid')`,
        [sourceTwo],
      );
      await rejects(client, () =>
        client.query(
          `INSERT INTO source_approved_domain_rules (source_id, hostname)
           VALUES ($1, 'source.invalid')`,
          [sourceOne],
        ),
      );
      await rejects(client, () =>
        client.query(
          `INSERT INTO source_approved_domain_rules (source_id, hostname)
           VALUES ($1, 'Source.Invalid')`,
          [sourceOne],
        ),
      );
      await rejects(client, () =>
        client.query(
          `INSERT INTO source_approved_domain_rules (source_id, hostname)
           VALUES ('00000000-0000-0000-0000-000000000099', 'orphan.invalid')`,
        ),
      );

      const endpointRule = await client.query<{ include_subdomains: boolean }>(
        `INSERT INTO source_endpoint_domain_rules (source_endpoint_id, hostname)
         VALUES ($1, 'endpoint.invalid')
         RETURNING include_subdomains`,
        [endpointOne],
      );
      assert.equal(endpointRule.rows[0]?.include_subdomains, false);
      await client.query(
        `INSERT INTO source_endpoint_domain_rules (source_endpoint_id, hostname)
         VALUES ($1, 'endpoint.invalid')`,
        [endpointThree],
      );
      await rejects(client, () =>
        client.query(
          `INSERT INTO source_endpoint_domain_rules (source_endpoint_id, hostname)
           VALUES ($1, 'endpoint.invalid')`,
          [endpointOne],
        ),
      );
      await rejects(client, () =>
        client.query(
          `INSERT INTO source_endpoint_domain_rules (source_endpoint_id, hostname)
           VALUES ($1, ' endpoint.invalid')`,
          [endpointOne],
        ),
      );
      await rejects(client, () =>
        client.query(
          `INSERT INTO source_endpoint_domain_rules (source_endpoint_id, hostname)
           VALUES ('00000000-0000-0000-0000-000000000099', 'orphan.invalid')`,
        ),
      );

      const timestamps = await client.query<{
        publication_created: Date;
        publication_updated: Date;
        source_created: Date;
        source_updated: Date;
        endpoint_created: Date;
        endpoint_updated: Date;
      }>(
        `SELECT
           p.created_at AS publication_created,
           p.updated_at AS publication_updated,
           s.created_at AS source_created,
           s.updated_at AS source_updated,
           e.created_at AS endpoint_created,
           e.updated_at AS endpoint_updated
         FROM publications p
         JOIN sources s ON s.id = $1
         JOIN source_endpoints e ON e.id = $2
         WHERE p.id = $3`,
        [sourceOne, endpointOne, publicationOne],
      );
      assert.ok(timestamps.rows[0]?.publication_created instanceof Date);
      assert.ok(timestamps.rows[0]?.publication_updated instanceof Date);
      assert.ok(timestamps.rows[0]?.source_created instanceof Date);
      assert.ok(timestamps.rows[0]?.source_updated instanceof Date);
      assert.ok(timestamps.rows[0]?.endpoint_created instanceof Date);
      assert.ok(timestamps.rows[0]?.endpoint_updated instanceof Date);
    } finally {
      await client.end();
    }
  });
});

async function insertPublication(
  client: Client,
  id: string,
  slug: string,
): Promise<void> {
  await client.query(
    `INSERT INTO publications (id, name, slug, active_for_collection, public_status)
     VALUES ($1, $2, $3, true, 'public')`,
    [id, `Publication ${slug}`, slug],
  );
}

async function insertSource(
  client: Client,
  id: string,
  publicationId: string,
  configKey: string,
): Promise<void> {
  await client.query(
    `INSERT INTO sources (
       id, publication_id, config_key, display_name, site_url,
       approval_state, lifecycle_state, operational_state
     ) VALUES ($1, $2, $3, 'Synthetic Source', 'https://source.invalid', 'approved', 'active', 'enabled')`,
    [id, publicationId, configKey],
  );
}

async function insertEndpoint(
  client: Client,
  id: string,
  sourceId: string,
  configKey: string,
  endpointUrl: string,
  pollIntervalSeconds: number,
): Promise<void> {
  await client.query(
    `INSERT INTO source_endpoints (
       id, source_id, config_key, endpoint_url, endpoint_type,
       approval_state, lifecycle_state, operational_state, poll_interval_seconds
     ) VALUES ($1, $2, $3, $4, 'rss_atom', 'approved', 'active', 'enabled', $5)`,
    [id, sourceId, configKey, endpointUrl, pollIntervalSeconds],
  );
}

async function rejects(
  client: Client,
  operation: () => Promise<unknown>,
): Promise<void> {
  await assert.rejects(operation);
  await client.query('SELECT 1');
}
