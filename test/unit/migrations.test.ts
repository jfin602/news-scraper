import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  discoverMigrations,
  migrationChecksum,
} from '../../src/database/migrations.ts';

async function withMigrationDirectory(
  files: Readonly<Record<string, string>>,
  callback: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'news-scraper-migrations-'),
  );
  try {
    await Promise.all(
      Object.entries(files).map(([filename, content]) =>
        writeFile(path.join(directory, filename), content, 'utf8'),
      ),
    );
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('migration checksums are deterministic and content-sensitive', () => {
  assert.equal(migrationChecksum('SELECT 1;'), migrationChecksum('SELECT 1;'));
  assert.notEqual(
    migrationChecksum('SELECT 1;'),
    migrationChecksum('SELECT 2;'),
  );
  assert.match(migrationChecksum('SELECT 1;'), /^[0-9a-f]{64}$/u);
});

test('migration discovery validates and sorts filenames deterministically', async () => {
  await withMigrationDirectory(
    { '0002_second.sql': 'SELECT 2;', '0001_first.sql': 'SELECT 1;' },
    async (directory) => {
      const migrations = await discoverMigrations(directory);
      assert.deepEqual(
        migrations.map((migration) => migration.filename),
        ['0001_first.sql', '0002_second.sql'],
      );
    },
  );
});

test('migration discovery rejects invalid and duplicate identifiers safely', async () => {
  await withMigrationDirectory(
    { '1_bad.sql': 'SELECT 1;' },
    async (directory) => {
      await assert.rejects(
        discoverMigrations(directory),
        /invalid migration filename/u,
      );
    },
  );
  await withMigrationDirectory(
    { '0001_first.sql': 'SELECT 1;', '0001_other.sql': 'SELECT 2;' },
    async (directory) => {
      await assert.rejects(
        discoverMigrations(directory),
        /duplicate migration identifier/u,
      );
    },
  );
});

test('a missing production migration directory represents an empty set', async () => {
  const migrations = await discoverMigrations(
    path.join(tmpdir(), 'news-scraper-directory-that-does-not-exist'),
  );
  assert.deepEqual(migrations, []);
});
