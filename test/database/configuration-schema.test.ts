import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import { Client } from 'pg';

import { migrateDatabase } from '../../src/database/migrations.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const sourceOne = '00000000-0000-0000-0000-000000000011';
const sourceTwo = '00000000-0000-0000-0000-000000000012';
const endpointOne = '00000000-0000-0000-0000-000000000021';
const endpointTwo = '00000000-0000-0000-0000-000000000022';
const endpointThree = '00000000-0000-0000-0000-000000000023';
const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

test('canonical production schema migrates from zero and reruns safely', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    assert.deepEqual(await migrateDatabase({ connectionString: databaseUrl }), [
      '0001_initial_schema.sql',
      '0002_endpoint_runtime_and_run_transport_telemetry.sql',
      '0003_endpoint_collection_jobs.sql',
      '0004_canonical_scheduled_execution.sql',
      '0005_categories_and_relevance.sql',
      '0006_mutable_relevance_rule_history.sql',
      '0007_public_feed_discovery_indexes.sql',
      '0008_publication_presentation.sql',
      '0009_source_administration_foundation.sql',
      '0010_endpoint_collection_job_trigger_kind.sql',
      '0011_publication_presentation_timezone.sql',
      '0012_duplicate_persistence_foundation.sql',
      '0013_article_duplicate_moderation.sql',
      '0014_html_endpoint_profile_and_run_diagnostics.sql',
      '0015_distribution_profiles.sql',
      '0016_distribution_credentials.sql',
      '0017_article_summary_bound.sql',
      '0018_profile_ai_digest_foundation.sql',
      '0019_digest_lifecycle_handoff.sql',
      '0020_profile_digest_style_guidance.sql',
      '0021_source_rss_atom_admission_excludes.sql',
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
             'publication_settings',
             'sources',
             'source_approved_domain_rules',
             'source_rss_atom_admission_phrases',
             'source_rss_atom_admission_exclude_phrases',
             'source_endpoints',
             'source_endpoint_domain_rules',
             'collection_runs',
             'articles',
             'article_observations',
             'categories',
             'relevance_rules',
             'article_categories',
             'article_observation_category_reasons'
           )
         ORDER BY table_name`,
      );
      assert.deepEqual(
        tables.rows.map(({ table_name }) => table_name),
        [
          'article_categories',
          'article_observation_category_reasons',
          'article_observations',
          'articles',
          'categories',
          'collection_runs',
          'publication_settings',
          'relevance_rules',
          'source_approved_domain_rules',
          'source_endpoint_domain_rules',
          'source_endpoints',
          'source_rss_atom_admission_exclude_phrases',
          'source_rss_atom_admission_phrases',
          'sources',
        ],
      );

      const history = await client.query<{
        filename: string;
      }>(
        'SELECT filename FROM news_scraper_schema_migrations ORDER BY filename',
      );
      assert.deepEqual(history.rows, [
        { filename: '0001_initial_schema.sql' },
        { filename: '0002_endpoint_runtime_and_run_transport_telemetry.sql' },
        { filename: '0003_endpoint_collection_jobs.sql' },
        { filename: '0004_canonical_scheduled_execution.sql' },
        { filename: '0005_categories_and_relevance.sql' },
        { filename: '0006_mutable_relevance_rule_history.sql' },
        { filename: '0007_public_feed_discovery_indexes.sql' },
        { filename: '0008_publication_presentation.sql' },
        { filename: '0009_source_administration_foundation.sql' },
        { filename: '0010_endpoint_collection_job_trigger_kind.sql' },
        { filename: '0011_publication_presentation_timezone.sql' },
        { filename: '0012_duplicate_persistence_foundation.sql' },
        { filename: '0013_article_duplicate_moderation.sql' },
        { filename: '0014_html_endpoint_profile_and_run_diagnostics.sql' },
        { filename: '0015_distribution_profiles.sql' },
        { filename: '0016_distribution_credentials.sql' },
        { filename: '0017_article_summary_bound.sql' },
        { filename: '0018_profile_ai_digest_foundation.sql' },
        { filename: '0019_digest_lifecycle_handoff.sql' },
        { filename: '0020_profile_digest_style_guidance.sql' },
        { filename: '0021_source_rss_atom_admission_excludes.sql' },
      ]);

      const removedTenancy = await client.query<{
        publications_table_absent: boolean;
        settings_identity_absent: boolean;
        publication_id_absent: boolean;
      }>(
        `SELECT
           to_regclass('public.publications') IS NULL AS publications_table_absent,
           NOT EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'publication_settings'
               AND column_name IN ('id', 'slug')
           ) AS settings_identity_absent,
           NOT EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND column_name = 'publication_id'
           ) AS publication_id_absent`,
      );
      assert.deepEqual(removedTenancy.rows, [
        {
          publications_table_absent: true,
          settings_identity_absent: true,
          publication_id_absent: true,
        },
      ]);

      const presentationColumns = await client.query<{
        column_name: string;
        is_nullable: string;
      }>(
        `SELECT column_name, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'publication_settings'
            AND column_name IN ('description', 'logo_path', 'accent_color', 'presentation_timezone')
         ORDER BY column_name`,
      );
      assert.deepEqual(presentationColumns.rows, [
        { column_name: 'accent_color', is_nullable: 'YES' },
        { column_name: 'description', is_nullable: 'YES' },
        { column_name: 'logo_path', is_nullable: 'YES' },
        { column_name: 'presentation_timezone', is_nullable: 'YES' },
      ]);
    } finally {
      await client.end();
    }
  });
});

test('canonical configuration schema enforces singleton, ownership, state, and policy invariants', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await insertPublicationSettings(client);
      await rejects(client, () =>
        client.query(
          `INSERT INTO publication_settings (name, active_for_collection, public_status)
           VALUES ('Second Publication', true, 'public')`,
        ),
      );
      await rejects(client, () =>
        client.query(`UPDATE publication_settings SET name = ' Invalid '`),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE publication_settings SET public_status = 'invalid'`,
        ),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE publication_settings SET description = ' Invalid '`,
        ),
      );
      await rejects(client, () =>
        client.query(`UPDATE publication_settings SET description = $1`, [
          'a'.repeat(501),
        ]),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE publication_settings SET logo_path = 'https://outside.example/logo.svg'`,
        ),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE publication_settings SET logo_path = '/logo.svg?cache=1'`,
        ),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE publication_settings SET logo_path = '/logo.svg#fragment'`,
        ),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE publication_settings SET logo_path = '/\\outside.example/logo.svg'`,
        ),
      );
      await rejects(client, () =>
        client.query(`UPDATE publication_settings SET logo_path = $1`, [
          '/logo\u0000.svg',
        ]),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE publication_settings SET accent_color = '#abc123'`,
        ),
      );
      await rejects(client, () =>
        client.query(
          `UPDATE publication_settings SET accent_color = 'rgb(1, 2, 3)'`,
        ),
      );
      const presentation = await client.query<{
        description: string | null;
        logo_path: string | null;
        accent_color: string | null;
      }>(
        `UPDATE publication_settings
         SET description = 'Canonical description',
             logo_path = '/assets/logo.svg',
             accent_color = '#A1B2C3'
         RETURNING description, logo_path, accent_color`,
      );
      assert.deepEqual(presentation.rows, [
        {
          description: 'Canonical description',
          logo_path: '/assets/logo.svg',
          accent_color: '#A1B2C3',
        },
      ]);

      await insertSource(client, sourceOne, 'primary_source');
      await insertSource(client, sourceTwo, 'secondary_source');
      await rejects(client, () =>
        insertSource(
          client,
          '00000000-0000-0000-0000-000000000013',
          'primary_source',
        ),
      );
      await rejects(client, () =>
        insertSource(
          client,
          '00000000-0000-0000-0000-000000000014',
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
         FROM sources s
         JOIN source_endpoints e ON e.id = $2
         CROSS JOIN publication_settings p
         WHERE s.id = $1`,
        [sourceOne, endpointOne],
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

async function insertPublicationSettings(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO publication_settings (name, active_for_collection, public_status)
     VALUES ('Canonical Publication', true, 'public')`,
  );
}

async function insertSource(
  client: Client,
  id: string,
  configKey: string,
): Promise<void> {
  await client.query(
    `INSERT INTO sources (
       id, config_key, display_name, site_url,
       approval_state, lifecycle_state, operational_state
     ) VALUES ($1, $2, 'Synthetic Source', 'https://source.invalid', 'approved', 'active', 'enabled')`,
    [id, configKey],
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
