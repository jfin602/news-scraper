import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createDatabase } from '../../src/database/database.ts';
import {
  discoverMigrations,
  inspectSchemaStatus,
  migrateDatabase,
} from '../../src/database/migrations.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

async function withMigrationDirectory(
  files: Readonly<Record<string, string>>,
  callback: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'news-scraper-db-migrations-'),
  );
  try {
    for (const [filename, content] of Object.entries(files)) {
      await writeFile(path.join(directory, filename), content, 'utf8');
    }
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('migrates from zero in order and reruns without repeated effects', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await withMigrationDirectory(
      {
        '0002_insert.sql': `INSERT INTO migration_probe (value) VALUES ('second');`,
        '0001_create.sql': `CREATE TABLE migration_probe (sequence integer GENERATED ALWAYS AS IDENTITY, value text NOT NULL); INSERT INTO migration_probe (value) VALUES ('first');`,
      },
      async (directory) => {
        const database = createDatabase({ connectionString: databaseUrl });
        try {
          assert.deepEqual(
            await inspectSchemaStatus(
              database,
              await discoverMigrations(directory),
            ),
            { state: 'uninitialized' },
          );
        } finally {
          await database.close();
        }

        assert.deepEqual(
          await migrateDatabase({ connectionString: databaseUrl }, directory),
          ['0001_create.sql', '0002_insert.sql'],
        );
        assert.deepEqual(
          await migrateDatabase({ connectionString: databaseUrl }, directory),
          [],
        );

        const currentDatabase = createDatabase({
          connectionString: databaseUrl,
        });
        try {
          const values = await currentDatabase.query<{ value: string }>(
            'SELECT value FROM migration_probe ORDER BY sequence',
          );
          assert.deepEqual(values.rows, [
            { value: 'first' },
            { value: 'second' },
          ]);
          const ledger = await currentDatabase.query<{ count: string }>(
            'SELECT count(*) FROM news_scraper_schema_migrations',
          );
          assert.equal(ledger.rows[0]?.count, '2');
          assert.deepEqual(
            await inspectSchemaStatus(
              currentDatabase,
              await discoverMigrations(directory),
            ),
            { state: 'current' },
          );
        } finally {
          await currentDatabase.close();
        }
      },
    );
  });
});

test('serializes concurrent migration runners and releases the advisory lock', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await withMigrationDirectory(
      {
        '0001_create.sql': `SELECT pg_sleep(0.2); CREATE TABLE migration_lock_probe (value integer NOT NULL); INSERT INTO migration_lock_probe (value) VALUES (1);`,
      },
      async (directory) => {
        const results = await Promise.all([
          migrateDatabase({ connectionString: databaseUrl }, directory),
          migrateDatabase({ connectionString: databaseUrl }, directory),
        ]);

        assert.deepEqual(
          results
            .map((result) => [...result])
            .sort((left, right) => left.length - right.length),
          [[], ['0001_create.sql']],
        );
        assert.deepEqual(
          await migrateDatabase({ connectionString: databaseUrl }, directory),
          [],
        );

        const database = createDatabase({ connectionString: databaseUrl });
        try {
          const probe = await database.query<{ count: string }>(
            'SELECT count(*) FROM migration_lock_probe',
          );
          const ledger = await database.query<{ count: string }>(
            'SELECT count(*) FROM news_scraper_schema_migrations',
          );
          assert.equal(probe.rows[0]?.count, '1');
          assert.equal(ledger.rows[0]?.count, '1');
        } finally {
          await database.close();
        }
      },
    );
  });
});

test('reports pending migrations without applying them', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await withMigrationDirectory(
      { '0001_create.sql': 'CREATE TABLE pending_probe (id integer);' },
      async (directory) => {
        await migrateDatabase({ connectionString: databaseUrl }, directory);
        await writeFile(
          path.join(directory, '0002_add.sql'),
          'ALTER TABLE pending_probe ADD COLUMN value text;',
          'utf8',
        );
        const database = createDatabase({ connectionString: databaseUrl });
        try {
          assert.deepEqual(
            await inspectSchemaStatus(
              database,
              await discoverMigrations(directory),
            ),
            { state: 'pending', migrations: ['0002_add.sql'] },
          );
          const column = await database.query<{ exists: boolean }>(
            `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pending_probe' AND column_name = 'value') AS exists`,
          );
          assert.equal(column.rows[0]?.exists, false);
        } finally {
          await database.close();
        }
        assert.deepEqual(
          await migrateDatabase({ connectionString: databaseUrl }, directory),
          ['0002_add.sql'],
        );
      },
    );
  });
});

test('rolls back a failed migration and stops later migrations', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await withMigrationDirectory(
      {
        '0001_base.sql': 'CREATE TABLE rollback_probe (value text);',
        '0002_fail.sql': `INSERT INTO rollback_probe VALUES ('rolled back'); CREATE TABLE partial_probe (id integer); SELECT missing_function();`,
        '0003_later.sql': 'CREATE TABLE later_probe (id integer);',
      },
      async (directory) => {
        await assert.rejects(
          migrateDatabase({ connectionString: databaseUrl }, directory),
          /migration 0002_fail\.sql failed/u,
        );
        const database = createDatabase({ connectionString: databaseUrl });
        try {
          const rows = await database.query('SELECT * FROM rollback_probe');
          assert.equal(rows.rowCount, 0);
          const tables = await database.query<{ name: string | null }>(
            `SELECT to_regclass('partial_probe')::text AS name UNION ALL SELECT to_regclass('later_probe')::text`,
          );
          assert.deepEqual(tables.rows, [{ name: null }, { name: null }]);
          const ledger = await database.query<{ filename: string }>(
            'SELECT filename FROM news_scraper_schema_migrations ORDER BY filename',
          );
          assert.deepEqual(ledger.rows, [{ filename: '0001_base.sql' }]);
        } finally {
          await database.close();
        }

        await writeFile(
          path.join(directory, '0002_fail.sql'),
          `INSERT INTO rollback_probe VALUES ('committed'); CREATE TABLE recovered_probe (id integer);`,
          'utf8',
        );
        assert.deepEqual(
          await migrateDatabase({ connectionString: databaseUrl }, directory),
          ['0002_fail.sql', '0003_later.sql'],
        );
        const recoveredDatabase = createDatabase({
          connectionString: databaseUrl,
        });
        try {
          const rows = await recoveredDatabase.query<{ value: string }>(
            'SELECT value FROM rollback_probe',
          );
          assert.deepEqual(rows.rows, [{ value: 'committed' }]);
          const tables = await recoveredDatabase.query<{
            recovered: string | null;
            later: string | null;
          }>(
            `SELECT to_regclass('recovered_probe')::text AS recovered, to_regclass('later_probe')::text AS later`,
          );
          assert.deepEqual(tables.rows, [
            { recovered: 'recovered_probe', later: 'later_probe' },
          ]);
        } finally {
          await recoveredDatabase.close();
        }
      },
    );
  });
});

test('detects modified and missing applied migration history', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await withMigrationDirectory(
      { '0001_create.sql': 'CREATE TABLE history_probe (id integer);' },
      async (directory) => {
        await migrateDatabase({ connectionString: databaseUrl }, directory);
        await writeFile(
          path.join(directory, '0001_create.sql'),
          'CREATE TABLE history_probe (id bigint);',
          'utf8',
        );
        const database = createDatabase({ connectionString: databaseUrl });
        try {
          assert.deepEqual(
            await inspectSchemaStatus(
              database,
              await discoverMigrations(directory),
            ),
            {
              state: 'incompatible',
              reason: 'checksum_mismatch',
              migration: '0001_create.sql',
            },
          );
          assert.deepEqual(await inspectSchemaStatus(database, []), {
            state: 'incompatible',
            reason: 'missing_repository_migration',
            migration: '0001_create.sql',
          });
        } finally {
          await database.close();
        }
        await assert.rejects(
          migrateDatabase({ connectionString: databaseUrl }, directory),
          /incompatible history/u,
        );
      },
    );
  });
});

test('installs only the justified public-feed discovery indexes from zero', async () => {
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
    ]);
    assert.deepEqual(
      await migrateDatabase({ connectionString: databaseUrl }),
      [],
    );

    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const indexes = await database.query<{
        indexname: string;
        indexdef: string;
        expression: string | null;
        predicate: string | null;
      }>(
        `SELECT
           index_class.relname AS indexname,
           pg_get_indexdef(index_class.oid) AS indexdef,
           pg_get_expr(index_definition.indexprs, index_definition.indrelid) AS expression,
           pg_get_expr(index_definition.indpred, index_definition.indrelid) AS predicate
         FROM pg_index AS index_definition
         JOIN pg_class AS index_class
           ON index_class.oid = index_definition.indexrelid
         WHERE index_class.relname = ANY($1::text[])
         ORDER BY index_class.relname`,
        [
          [
            'article_categories_category_article_lookup_idx',
            'articles_public_feed_visible_order_idx',
            'articles_source_public_feed_visible_order_idx',
          ],
        ],
      );
      const byName = new Map(
        indexes.rows.map((index) => [index.indexname, index]),
      );
      assert.deepEqual(
        [...byName.keys()],
        [
          'article_categories_category_article_lookup_idx',
          'articles_public_feed_visible_order_idx',
          'articles_source_public_feed_visible_order_idx',
        ],
      );

      const canonical = requireIndex(
        byName,
        'articles_public_feed_visible_order_idx',
      );
      assert.equal(canonical.predicate, "(visibility_state = 'visible'::text)");
      assert.equal(
        canonical.expression,
        "\nCASE\n    WHEN (published_at_status = 'parsed'::text) THEN published_at\n    ELSE first_seen_at\nEND",
      );
      assert.match(
        compactSql(canonical.indexdef),
        /\(\( ?CASE WHEN \(published_at_status = 'parsed'::text\) THEN published_at ELSE first_seen_at END\) DESC, first_seen_at DESC, id\) WHERE \(visibility_state = 'visible'::text\)$/u,
      );

      const sourceLeading = requireIndex(
        byName,
        'articles_source_public_feed_visible_order_idx',
      );
      assert.equal(
        sourceLeading.predicate,
        "(visibility_state = 'visible'::text)",
      );
      assert.equal(sourceLeading.expression, canonical.expression);
      assert.match(
        compactSql(sourceLeading.indexdef),
        /\(source_id, \( ?CASE WHEN \(published_at_status = 'parsed'::text\) THEN published_at ELSE first_seen_at END\) DESC, first_seen_at DESC, id\) WHERE \(visibility_state = 'visible'::text\)$/u,
      );

      const categoryLookup = requireIndex(
        byName,
        'article_categories_category_article_lookup_idx',
      );
      assert.equal(categoryLookup.expression, null);
      assert.equal(categoryLookup.predicate, null);
      assert.match(
        compactSql(categoryLookup.indexdef),
        /ON public\.article_categories USING btree \(category_id, article_id\)$/u,
      );

      const extensions = await database.query<{ extname: string }>(
        `SELECT extname
         FROM pg_extension
         WHERE extname = 'pg_trgm'`,
      );
      assert.deepEqual(extensions.rows, []);
      const fullTextOrTrigramIndexes = await database.query<{
        indexname: string;
      }>(
        `SELECT indexname
         FROM pg_indexes
         WHERE schemaname = 'public'
           AND (
             indexdef ILIKE '%to_tsvector%'
             OR indexdef ILIKE '%trgm%'
             OR indexdef ILIKE '%gin%'
             OR indexdef ILIKE '%gist%'
           )`,
      );
      assert.deepEqual(fullTextOrTrigramIndexes.rows, []);
    } finally {
      await database.close();
    }
  });
});

test('current migrations enforce the Article summary character bound', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const sourceId = '00000000-0000-0000-0000-000000000001';
      await database.query(
        `INSERT INTO sources (id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state)
         VALUES ($1, 'summary_source', 'Summary Source', 'https://summary.example', 'approved', 'active', 'enabled')`,
        [sourceId],
      );
      const article = (summary: string) =>
        database.query(
          `INSERT INTO articles (id, source_id, original_url, canonical_identity_url, display_title, normalized_title, summary, published_at_status, source_updated_at_status, first_seen_at, last_seen_at)
           VALUES ($1, $2, $3, $4, 'Summary', 'summary', $5, 'missing', 'missing', now(), now())`,
          [
            randomUUID(),
            sourceId,
            `https://summary.example/a/${randomUUID()}`,
            `https://summary.example/c/${randomUUID()}`,
            summary,
          ],
        );
      await article('🙂'.repeat(4_000));
      await assert.rejects(article('🙂'.repeat(4_001)));
    } finally {
      await database.close();
    }
  });
});

test('current migrations install the Distribution Profile relational boundary', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const tables = await database.query<{ readonly table_name: string }>(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])
          ORDER BY table_name`,
        [
          [
            'distribution_profiles',
            'distribution_profile_sources',
            'distribution_profile_source_phrases',
            'distribution_profile_source_categories',
          ],
        ],
      );
      assert.deepEqual(
        tables.rows.map((row) => row.table_name),
        [
          'distribution_profile_source_categories',
          'distribution_profile_source_phrases',
          'distribution_profile_sources',
          'distribution_profiles',
        ],
      );
      await assert.rejects(
        database.query(
          `INSERT INTO distribution_profiles (id, config_key, display_name, lifecycle, result_limit)
           VALUES ('00000000-0000-0000-0000-000000000001', 'invalid-key', 'Name', 'draft', 100)`,
        ),
      );
    } finally {
      await database.close();
    }
  });
});

test('current migrations install the isolated Distribution credential boundary', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const tables = await database.query<{ readonly table_name: string }>(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'distribution_credentials'`,
      );
      assert.deepEqual(tables.rows, [
        { table_name: 'distribution_credentials' },
      ]);
      await assert.rejects(
        database.query(
          `INSERT INTO distribution_credentials (id, lookup_id, verifier, label, capability)
           VALUES ('00000000-0000-0000-0000-000000000001', 'invalid', decode(repeat('00', 32), 'hex'), 'Name', 'distribution:read')`,
        ),
      );
    } finally {
      await database.close();
    }
  });
});

test('current migrations install the Profile AI digest foundation with bounded state', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const tables = await database.query<{ readonly table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = ANY($1::text[])
          ORDER BY table_name`,
        [
          [
            'distribution_profile_ai_settings',
            'distribution_profile_digest_generations',
            'distribution_profile_digest_inputs',
            'distribution_profile_digest_highlights',
            'distribution_profile_digest_highlight_supports',
            'distribution_profile_active_digests',
            'distribution_profile_digest_attempts',
          ],
        ],
      );
      assert.equal(tables.rows.length, 7);
      await database.query(
        `INSERT INTO distribution_profiles (id, config_key, display_name, lifecycle, result_limit)
         VALUES ('00000000-0000-0000-0000-000000000018', 'ai_profile', 'AI Profile', 'draft', 20)`,
      );
      const settings = await database.query<{
        readonly digest_enabled: boolean;
        readonly digest_lookback_days: number;
        readonly digest_max_article_count: number;
        readonly digest_style_guidance: string | null;
      }>(
        'SELECT digest_enabled, digest_lookback_days, digest_max_article_count, digest_style_guidance FROM distribution_profile_ai_settings',
      );
      assert.deepEqual(settings.rows, [
        {
          digest_enabled: false,
          digest_lookback_days: 7,
          digest_max_article_count: 20,
          digest_style_guidance: null,
        },
      ]);
      await assert.rejects(
        database.query(
          'UPDATE distribution_profile_ai_settings SET digest_max_article_count = 21',
        ),
      );
      await assert.rejects(
        database.query(
          "UPDATE distribution_profile_ai_settings SET digest_style_guidance = repeat('🙂', 501)",
        ),
      );
      await assert.rejects(
        database.query(
          "UPDATE distribution_profile_ai_settings SET digest_style_guidance = E'\\n\\t  '",
        ),
      );
    } finally {
      await database.close();
    }
  });
});

function requireIndex<T>(byName: ReadonlyMap<string, T>, name: string): T {
  const index = byName.get(name);
  if (index === undefined) assert.fail(`Expected index ${name}.`);
  return index;
}

function compactSql(value: string): string {
  return value.replaceAll(/\s+/gu, ' ');
}
