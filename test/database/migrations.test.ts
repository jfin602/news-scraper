import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
import { insertPublication } from '../../src/publications/repository.ts';
import {
  insertSource,
  insertSourceEndpoint,
} from '../../src/sources/repository.ts';

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

test('upgrades representative Phase 5 collection runs from 0002 to 0003 without rewriting history', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    const productionDirectory = path.join(process.cwd(), 'migrations');
    const migrationFiles = {
      '0001_publication_source_configuration.sql': await readFile(
        path.join(
          productionDirectory,
          '0001_publication_source_configuration.sql',
        ),
        'utf8',
      ),
      '0002_collection_runs.sql': await readFile(
        path.join(productionDirectory, '0002_collection_runs.sql'),
        'utf8',
      ),
    };
    await withMigrationDirectory(migrationFiles, async (directory) => {
      assert.deepEqual(
        await migrateDatabase({ connectionString: databaseUrl }, directory),
        Object.keys(migrationFiles),
      );
      const database = createDatabase({ connectionString: databaseUrl });
      try {
        const publication = await insertPublication(database, {
          name: 'Upgrade publication',
          slug: 'upgrade-publication',
          activeForCollection: true,
          publicStatus: 'private',
        });
        const source = await insertSource(database, publication.id, {
          configKey: 'upgrade_source',
          displayName: 'Upgrade Source',
          siteUrl: 'https://example.com/',
          approvalState: 'approved',
          lifecycleState: 'active',
          operationalState: 'enabled',
          domainRules: [{ hostname: 'example.com', includeSubdomains: true }],
        });
        const endpoint = await insertSourceEndpoint(database, source.id, {
          configKey: 'upgrade_feed',
          endpointUrl: 'https://example.com/feed.xml',
          endpointType: 'rss_atom',
          approvalState: 'approved',
          lifecycleState: 'active',
          operationalState: 'enabled',
          pollIntervalSeconds: 300,
        });
        await database.query(
          `INSERT INTO collection_runs (
             id, source_endpoint_id, execution_id, started_at, finished_at,
             run_status, transport_status, parser_status, http_status_code,
             wire_byte_count, decompressed_byte_count, raw_item_count,
             error_code, error_detail
           ) VALUES
             ('10000000-0000-4000-8000-000000000001', $1, 'content', '2026-08-08T10:00:00Z', '2026-08-08T10:00:01Z', 'succeeded', 'succeeded', 'succeeded', 200, 123, 456, 3, NULL, NULL),
             ('10000000-0000-4000-8000-000000000002', $1, 'unchanged', '2026-08-08T11:00:00Z', '2026-08-08T11:00:01Z', 'succeeded', 'not_modified', 'not_run', 304, 20, 0, 0, NULL, NULL),
             ('10000000-0000-4000-8000-000000000003', $1, 'failed', '2026-08-08T12:00:00Z', '2026-08-08T12:00:01Z', 'failed', 'failed', 'not_run', NULL, 0, 0, 0, 'transport_timeout', 'Timed out.')`,
          [endpoint.id],
        );
      } finally {
        await database.close();
      }

      await writeFile(
        path.join(directory, '0003_collection_run_normalization.sql'),
        await readFile(
          path.join(
            productionDirectory,
            '0003_collection_run_normalization.sql',
          ),
          'utf8',
        ),
        'utf8',
      );
      assert.deepEqual(
        await migrateDatabase({ connectionString: databaseUrl }, directory),
        ['0003_collection_run_normalization.sql'],
      );
      assert.deepEqual(
        await migrateDatabase({ connectionString: databaseUrl }, directory),
        [],
      );

      const upgraded = createDatabase({ connectionString: databaseUrl });
      try {
        const rows = await upgraded.query(
          `SELECT execution_id, run_status, transport_status, parser_status,
                  http_status_code, wire_byte_count, decompressed_byte_count,
                  raw_item_count, error_code, error_detail,
                  normalization_status, normalized_candidate_count,
                  normalization_failure_count, article_link_rejection_count
             FROM collection_runs ORDER BY execution_id`,
        );
        assert.deepEqual(
          rows.rows.map((row) => ({
            ...row,
            wire_byte_count: Number(row.wire_byte_count),
            decompressed_byte_count: Number(row.decompressed_byte_count),
          })),
          [
            {
              execution_id: 'content',
              run_status: 'succeeded',
              transport_status: 'succeeded',
              parser_status: 'succeeded',
              http_status_code: 200,
              wire_byte_count: 123,
              decompressed_byte_count: 456,
              raw_item_count: 3,
              error_code: null,
              error_detail: null,
              normalization_status: 'not_run',
              normalized_candidate_count: 0,
              normalization_failure_count: 0,
              article_link_rejection_count: 0,
            },
            {
              execution_id: 'failed',
              run_status: 'failed',
              transport_status: 'failed',
              parser_status: 'not_run',
              http_status_code: null,
              wire_byte_count: 0,
              decompressed_byte_count: 0,
              raw_item_count: 0,
              error_code: 'transport_timeout',
              error_detail: 'Timed out.',
              normalization_status: 'not_run',
              normalized_candidate_count: 0,
              normalization_failure_count: 0,
              article_link_rejection_count: 0,
            },
            {
              execution_id: 'unchanged',
              run_status: 'succeeded',
              transport_status: 'not_modified',
              parser_status: 'not_run',
              http_status_code: 304,
              wire_byte_count: 20,
              decompressed_byte_count: 0,
              raw_item_count: 0,
              error_code: null,
              error_detail: null,
              normalization_status: 'not_run',
              normalized_candidate_count: 0,
              normalization_failure_count: 0,
              article_link_rejection_count: 0,
            },
          ],
        );
        assert.deepEqual(
          await inspectSchemaStatus(
            upgraded,
            await discoverMigrations(directory),
          ),
          { state: 'current' },
        );
      } finally {
        await upgraded.close();
      }
    });
  });
});

test('upgrades representative Phase 6 history from 0003 to 0004 without rewriting history', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    const productionDirectory = path.join(process.cwd(), 'migrations');
    const migrationNames = [
      '0001_publication_source_configuration.sql',
      '0002_collection_runs.sql',
      '0003_collection_run_normalization.sql',
    ];
    const migrationFiles = Object.fromEntries(
      await Promise.all(
        migrationNames.map(async (filename) => [
          filename,
          await readFile(path.join(productionDirectory, filename), 'utf8'),
        ]),
      ),
    );
    await withMigrationDirectory(migrationFiles, async (directory) => {
      assert.deepEqual(
        await migrateDatabase({ connectionString: databaseUrl }, directory),
        migrationNames,
      );
      const database = createDatabase({ connectionString: databaseUrl });
      let publicationId: string;
      let sourceId: string;
      let endpointId: string;
      try {
        const publication = await insertPublication(database, {
          name: 'Phase 6 upgrade publication',
          slug: 'phase-6-upgrade',
          activeForCollection: true,
          publicStatus: 'private',
        });
        publicationId = publication.id;
        const source = await insertSource(database, publication.id, {
          configKey: 'upgrade_source',
          displayName: 'Upgrade Source',
          siteUrl: 'https://upgrade.example/',
          approvalState: 'approved',
          lifecycleState: 'active',
          operationalState: 'enabled',
          domainRules: [
            { hostname: 'upgrade.example', includeSubdomains: false },
          ],
        });
        sourceId = source.id;
        const endpoint = await insertSourceEndpoint(database, source.id, {
          configKey: 'upgrade_feed',
          endpointUrl: 'https://upgrade.example/feed.xml',
          endpointType: 'rss_atom',
          approvalState: 'approved',
          lifecycleState: 'active',
          operationalState: 'enabled',
          pollIntervalSeconds: 300,
        });
        endpointId = endpoint.id;
        await database.query(
          `INSERT INTO collection_runs (
             id, source_endpoint_id, execution_id, started_at, finished_at,
             run_status, transport_status, parser_status, raw_item_count,
             normalization_status, normalized_candidate_count,
             normalization_failure_count, article_link_rejection_count
           ) VALUES (
             '10000000-0000-4000-8000-000000000010', $1, 'phase-6-history',
             '2026-08-09T10:00:00Z', '2026-08-09T10:00:01Z', 'succeeded',
             'succeeded', 'succeeded', 1, 'succeeded', 1, 0, 0
           )`,
          [endpoint.id],
        );
      } finally {
        await database.close();
      }

      await writeFile(
        path.join(directory, '0004_articles_and_observations.sql'),
        await readFile(
          path.join(productionDirectory, '0004_articles_and_observations.sql'),
          'utf8',
        ),
        'utf8',
      );
      assert.deepEqual(
        await migrateDatabase({ connectionString: databaseUrl }, directory),
        ['0004_articles_and_observations.sql'],
      );
      assert.deepEqual(
        await migrateDatabase({ connectionString: databaseUrl }, directory),
        [],
      );

      const upgraded = createDatabase({ connectionString: databaseUrl });
      try {
        const history = await upgraded.query(
          `SELECT p.id AS publication_id, s.id AS source_id, e.id AS endpoint_id,
                  r.execution_id, r.normalization_status, r.normalized_candidate_count
             FROM publications p
             JOIN sources s ON s.publication_id = p.id
             JOIN source_endpoints e ON e.source_id = s.id
             JOIN collection_runs r ON r.source_endpoint_id = e.id`,
        );
        assert.deepEqual(history.rows, [
          {
            publication_id: publicationId,
            source_id: sourceId,
            endpoint_id: endpointId,
            execution_id: 'phase-6-history',
            normalization_status: 'succeeded',
            normalized_candidate_count: 1,
          },
        ]);
        const counts = await upgraded.query<{
          articles: string;
          observations: string;
        }>(
          `SELECT (SELECT count(*) FROM articles) AS articles,
                  (SELECT count(*) FROM article_observations) AS observations`,
        );
        assert.deepEqual(counts.rows, [{ articles: '0', observations: '0' }]);
      } finally {
        await upgraded.close();
      }
    });
  });
});

test('upgrades representative Phase 7 history from 0004 through 0006 without rewriting records', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    const productionDirectory = path.join(process.cwd(), 'migrations');
    const migrationNames = [
      '0001_publication_source_configuration.sql',
      '0002_collection_runs.sql',
      '0003_collection_run_normalization.sql',
      '0004_articles_and_observations.sql',
    ];
    const migrationFiles = Object.fromEntries(
      await Promise.all(
        migrationNames.map(async (filename) => [
          filename,
          await readFile(path.join(productionDirectory, filename), 'utf8'),
        ]),
      ),
    );
    await withMigrationDirectory(migrationFiles, async (directory) => {
      assert.deepEqual(
        await migrateDatabase({ connectionString: databaseUrl }, directory),
        migrationNames,
      );
      const database = createDatabase({ connectionString: databaseUrl });
      try {
        const publication = await insertPublication(database, {
          name: 'Phase 7 upgrade publication',
          slug: 'phase-7-upgrade',
          activeForCollection: true,
          publicStatus: 'private',
        });
        const source = await insertSource(database, publication.id, {
          configKey: 'phase_7_source',
          displayName: 'Phase 7 Source',
          siteUrl: 'https://phase-7.example/',
          approvalState: 'approved',
          lifecycleState: 'active',
          operationalState: 'enabled',
          domainRules: [
            { hostname: 'phase-7.example', includeSubdomains: false },
          ],
        });
        const endpoint = await insertSourceEndpoint(database, source.id, {
          configKey: 'phase_7_feed',
          endpointUrl: 'https://phase-7.example/feed.xml',
          endpointType: 'rss_atom',
          approvalState: 'approved',
          lifecycleState: 'active',
          operationalState: 'enabled',
          pollIntervalSeconds: 300,
        });
        await database.query(
          `INSERT INTO collection_runs (
             id, source_endpoint_id, execution_id, started_at, finished_at,
             run_status, transport_status, parser_status, raw_item_count,
             normalization_status, normalized_candidate_count,
             normalization_failure_count, article_link_rejection_count
           ) VALUES (
             '10000000-0000-4000-8000-000000000020', $1, 'phase-7-history',
             '2026-08-10T10:00:00Z', '2026-08-10T10:00:01Z', 'succeeded',
             'succeeded', 'succeeded', 2, 'succeeded', 2, 0, 1
           )`,
          [endpoint.id],
        );
        await database.query(
          `INSERT INTO articles (
             id, publication_id, source_id, original_url, canonical_identity_url,
             display_title, normalized_title, published_at_status,
             source_updated_at_status, first_seen_at, last_seen_at
           ) VALUES (
             '20000000-0000-4000-8000-000000000020', $1, $2,
             'https://phase-7.example/article', 'https://phase-7.example/article',
             'Phase 7 article', 'phase 7 article', 'missing', 'missing',
             '2026-08-10T10:00:00Z', '2026-08-10T10:00:00Z'
           )`,
          [publication.id, source.id],
        );
        await database.query(
          `INSERT INTO article_observations (
             id, publication_id, source_id, source_endpoint_id, collection_run_id,
             article_id, processing_outcome, observed_canonical_identity_url
           ) VALUES (
             '30000000-0000-4000-8000-000000000020', $1, $2, $3,
             '10000000-0000-4000-8000-000000000020',
             '20000000-0000-4000-8000-000000000020', 'created',
             'https://phase-7.example/article'
           )`,
          [publication.id, source.id, endpoint.id],
        );
      } finally {
        await database.close();
      }

      await writeFile(
        path.join(directory, '0005_collection_run_processing.sql'),
        await readFile(
          path.join(productionDirectory, '0005_collection_run_processing.sql'),
          'utf8',
        ),
        'utf8',
      );
      assert.deepEqual(
        await migrateDatabase({ connectionString: databaseUrl }, directory),
        ['0005_collection_run_processing.sql'],
      );
      await writeFile(
        path.join(directory, '0006_article_visibility.sql'),
        await readFile(
          path.join(productionDirectory, '0006_article_visibility.sql'),
          'utf8',
        ),
        'utf8',
      );
      assert.deepEqual(
        await migrateDatabase({ connectionString: databaseUrl }, directory),
        ['0006_article_visibility.sql'],
      );
      assert.deepEqual(
        await migrateDatabase({ connectionString: databaseUrl }, directory),
        [],
      );

      const upgraded = createDatabase({ connectionString: databaseUrl });
      try {
        const rows = await upgraded.query(
          `SELECT r.execution_id, r.normalized_candidate_count,
                  r.article_link_rejection_count, r.processing_status,
                  r.created_count, r.updated_count, r.unchanged_count,
                  r.rejected_count, r.excluded_count, r.failed_count,
                  a.id AS article_id, a.visibility_state, o.id AS observation_id
             FROM collection_runs r
             JOIN article_observations o ON o.collection_run_id = r.id
             JOIN articles a ON a.id = o.article_id`,
        );
        assert.deepEqual(rows.rows, [
          {
            execution_id: 'phase-7-history',
            normalized_candidate_count: 2,
            article_link_rejection_count: 1,
            processing_status: 'not_run',
            created_count: 0,
            updated_count: 0,
            unchanged_count: 0,
            rejected_count: 0,
            excluded_count: 0,
            failed_count: 0,
            article_id: '20000000-0000-4000-8000-000000000020',
            visibility_state: 'visible',
            observation_id: '30000000-0000-4000-8000-000000000020',
          },
        ]);
      } finally {
        await upgraded.close();
      }
    });
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
