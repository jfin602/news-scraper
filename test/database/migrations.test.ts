import assert from 'node:assert/strict';
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
