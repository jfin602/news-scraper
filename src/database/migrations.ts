import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client, type ClientBase } from 'pg';

import type { DatabaseConfig } from './config.ts';
import type { QueryExecutor } from './database.ts';

const MIGRATION_FILENAME_PATTERN = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/u;
const LEDGER_TABLE = 'news_scraper_schema_migrations';

// Stable, topic-independent key reserved for this application's schema migrations.
const MIGRATION_ADVISORY_LOCK_KEY = 7_291_031_843_517_909;

export interface Migration {
  readonly id: string;
  readonly filename: string;
  readonly checksum: string;
  readonly sql: string;
}

export type SchemaStatus =
  | { readonly state: 'uninitialized' }
  | { readonly state: 'current' }
  | { readonly state: 'pending'; readonly migrations: readonly string[] }
  | {
      readonly state: 'incompatible';
      readonly reason: 'checksum_mismatch' | 'missing_repository_migration';
      readonly migration: string;
    };

export class MigrationError extends Error {
  constructor(reason: string, options?: ErrorOptions) {
    super(`Database migration failed: ${reason}`, options);
    this.name = 'MigrationError';
  }
}

export function migrationChecksum(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function discoverMigrations(
  directory: string,
): Promise<readonly Migration[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) return [];
    throw new MigrationError('migration directory cannot be read', {
      cause: error,
    });
  }

  const sqlEntries = entries.filter(
    (entry) => entry.isFile() && entry.name.endsWith('.sql'),
  );
  const ids = new Set<string>();
  const filenames = new Set<string>();

  for (const entry of sqlEntries) {
    const match = MIGRATION_FILENAME_PATTERN.exec(entry.name);
    if (match === null) {
      throw new MigrationError('invalid migration filename');
    }
    const id = match[1] as string;
    if (ids.has(id) || filenames.has(entry.name)) {
      throw new MigrationError('duplicate migration identifier');
    }
    ids.add(id);
    filenames.add(entry.name);
  }

  sqlEntries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  return Promise.all(
    sqlEntries.map(async (entry) => {
      let sql: string;
      try {
        sql = await readFile(path.join(directory, entry.name), 'utf8');
      } catch (error) {
        throw new MigrationError('migration file cannot be read', {
          cause: error,
        });
      }
      return Object.freeze({
        id: entry.name.slice(0, 4),
        filename: entry.name,
        checksum: migrationChecksum(sql),
        sql,
      });
    }),
  );
}

export async function inspectSchemaStatus(
  database: QueryExecutor,
  migrations: readonly Migration[],
): Promise<SchemaStatus> {
  const tableResult = await database.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [LEDGER_TABLE],
  );
  if (tableResult.rows[0]?.exists !== true) return { state: 'uninitialized' };

  const ledger = await database.query<{ filename: string; checksum: string }>(
    `SELECT filename, checksum FROM ${LEDGER_TABLE} ORDER BY filename`,
  );
  const repositoryByFilename = new Map(
    migrations.map((migration) => [migration.filename, migration]),
  );
  const applied = new Set<string>();

  for (const row of ledger.rows) {
    const migration = repositoryByFilename.get(row.filename);
    if (migration === undefined) {
      return {
        state: 'incompatible',
        reason: 'missing_repository_migration',
        migration: row.filename,
      };
    }
    if (migration.checksum !== row.checksum) {
      return {
        state: 'incompatible',
        reason: 'checksum_mismatch',
        migration: row.filename,
      };
    }
    applied.add(row.filename);
  }

  const pending = migrations
    .filter((migration) => !applied.has(migration.filename))
    .map((migration) => migration.filename);
  return pending.length === 0
    ? { state: 'current' }
    : { state: 'pending', migrations: pending };
}

export async function migrateDatabase(
  config: Readonly<DatabaseConfig>,
  directory = path.resolve('migrations'),
): Promise<readonly string[]> {
  const migrations = await discoverMigrations(directory);
  const client = new Client({ connectionString: config.connectionString });
  let locked = false;
  try {
    await client.connect();
    await client.query('SELECT pg_advisory_lock($1)', [
      MIGRATION_ADVISORY_LOCK_KEY,
    ]);
    locked = true;
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`,
    );

    const status = await inspectSchemaStatus(client, migrations);
    if (status.state === 'incompatible') {
      throw new MigrationError(
        `incompatible history (${status.reason}: ${status.migration})`,
      );
    }
    const pending =
      status.state === 'pending'
        ? migrations.filter((migration) =>
            status.migrations.includes(migration.filename),
          )
        : [];

    const applied: string[] = [];
    for (const migration of pending) {
      await applyMigration(client, migration);
      applied.push(migration.filename);
    }
    return applied;
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError('operation could not be completed', {
      cause: error,
    });
  } finally {
    if (locked) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [
          MIGRATION_ADVISORY_LOCK_KEY,
        ]);
      } catch {
        // Session loss releases advisory locks automatically.
      }
    }
    await client.end().catch(() => undefined);
  }
}

async function applyMigration(
  client: ClientBase,
  migration: Migration,
): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(migration.sql);
    await client.query(
      `INSERT INTO ${LEDGER_TABLE} (filename, checksum) VALUES ($1, $2)`,
      [migration.filename, migration.checksum],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw new MigrationError(`migration ${migration.filename} failed`, {
      cause: error,
    });
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
