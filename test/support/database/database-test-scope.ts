import { Client } from 'pg';

import { migrateDatabase } from '../../../src/database/migrations.ts';
import {
  createDisposableDatabase,
  type DisposableDatabase,
  type OwnedDisposableDatabase,
} from './disposable-database.ts';

const MIGRATION_LEDGER_TABLE = 'news_scraper_schema_migrations';
const RESET_LOCK_TIMEOUT = '500ms';

export type DatabaseTestScopeMode = 'bare' | 'migrated';

export interface DatabaseTestScope {
  use<T>(callback: (database: DisposableDatabase) => Promise<T>): Promise<T>;
  dispose(): Promise<void>;
}

export function createDatabaseTestScope(
  mode: DatabaseTestScopeMode,
): DatabaseTestScope {
  if (mode !== 'bare' && mode !== 'migrated') {
    throw new Error('Database test scope mode must be bare or migrated.');
  }

  let database: OwnedDisposableDatabase | undefined;
  let initialized = false;
  let active = false;
  let disposed = false;
  let disposePromise: Promise<void> | undefined;
  let unusableError: Error | undefined;

  async function initialize(): Promise<OwnedDisposableDatabase> {
    if (database === undefined) {
      database = await createDisposableDatabase();
    }
    if (!initialized && mode === 'migrated') {
      await migrateDatabase({ connectionString: database.databaseUrl });
      initialized = true;
    }
    return database;
  }

  return {
    async use<T>(
      callback: (database: DisposableDatabase) => Promise<T>,
    ): Promise<T> {
      if (disposed) {
        throw new Error('Database test scope has already been disposed.');
      }
      if (unusableError !== undefined) {
        throw new Error(
          'Database test scope is unusable after a reset failure.',
          {
            cause: unusableError,
          },
        );
      }
      if (active) {
        throw new Error(
          'Database test scope does not allow overlapping callbacks.',
        );
      }

      active = true;
      let callbackResult: T | undefined;
      let callbackError: unknown;
      let initializedDatabase: OwnedDisposableDatabase | undefined;
      try {
        initializedDatabase = await initialize();
        callbackResult = await callback(initializedDatabase);
      } catch (error) {
        callbackError = error;
      }

      let resetError: unknown;
      if (mode === 'migrated' && initializedDatabase !== undefined) {
        try {
          await resetMigratedDatabase(initializedDatabase.databaseUrl);
        } catch (error) {
          resetError = error;
          unusableError = new Error('Database test scope reset failed.', {
            cause: error,
          });
        }
      }
      active = false;

      if (callbackError !== undefined && resetError !== undefined) {
        throw new AggregateError(
          [callbackError, resetError],
          'Database test callback and scope reset both failed.',
          { cause: resetError },
        );
      }
      if (resetError !== undefined) {
        throw new Error(
          `Database test scope reset failed: ${safeErrorMessage(resetError)}`,
          { cause: resetError },
        );
      }
      if (callbackError !== undefined) {
        throw callbackError;
      }
      return callbackResult as T;
    },

    dispose(): Promise<void> {
      if (active) {
        return Promise.reject(
          new Error(
            'Cannot dispose a database test scope during an active callback.',
          ),
        );
      }
      disposePromise ??= (async () => {
        disposed = true;
        if (database !== undefined) {
          await database.dispose();
        }
      })();
      return disposePromise;
    },
  };
}

async function resetMigratedDatabase(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name <> $1
        ORDER BY table_name`,
      [MIGRATION_LEDGER_TABLE],
    );
    if (tables.rows.length === 0) return;

    await client.query(`SET lock_timeout = '${RESET_LOCK_TIMEOUT}'`);
    const identifiers = tables.rows
      .map(({ table_name }) => quoteIdentifier(table_name))
      .join(', ');
    await client.query(
      `TRUNCATE TABLE ${identifiers} RESTART IDENTITY CASCADE`,
    );
  } catch (error) {
    if (isLockTimeout(error)) {
      throw new Error(
        'Database test scope reset timed out waiting for case-owned database locks. Close all pools, clients, and transactions before the callback returns.',
        { cause: error },
      );
    }
    throw new Error('Database test scope reset could not be completed.', {
      cause: error,
    });
  } finally {
    await client.end().catch(() => undefined);
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function isLockTimeout(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '55P03'
  );
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'the reset operation returned an unknown error';
}
