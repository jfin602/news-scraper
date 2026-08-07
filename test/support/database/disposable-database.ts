import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

import { readTestDatabaseAdminUrl } from './test-database-config.ts';

const DISPOSABLE_DATABASE_NAME_PATTERN = /^news_scraper_test_[0-9a-f]{32}$/u;

export interface DisposableDatabase {
  databaseName: string;
  databaseUrl: string;
}

export function generateDisposableDatabaseName(): string {
  return `news_scraper_test_${randomUUID().replaceAll('-', '')}`;
}

export function assertDisposableDatabaseName(databaseName: string): void {
  if (!DISPOSABLE_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      'Refusing database administration for a non-disposable name.',
    );
  }
}

function quoteIdentifier(identifier: string): string {
  assertDisposableDatabaseName(identifier);
  return `"${identifier.replaceAll('"', '""')}"`;
}

function databaseUrlFor(adminUrl: string, databaseName: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export async function databaseExists(
  adminUrl: string,
  databaseName: string,
): Promise<boolean> {
  assertDisposableDatabaseName(databaseName);
  const client = new Client({ connectionString: adminUrl });
  try {
    await client.connect();
    const result = await client.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
      [databaseName],
    );
    return result.rows[0]?.exists === true;
  } finally {
    await client.end();
  }
}

async function createDatabase(adminUrl: string, databaseName: string) {
  const client = new Client({ connectionString: adminUrl });
  try {
    await client.connect();
    await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  } finally {
    await client.end();
  }
}

async function dropAndVerifyDatabase(
  adminUrl: string,
  databaseName: string,
): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  try {
    await client.connect();
    await client.query(
      `DROP DATABASE ${quoteIdentifier(databaseName)} WITH (FORCE)`,
    );
    const result = await client.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
      [databaseName],
    );
    if (result.rows[0]?.exists === true) {
      throw new Error('Disposable database cleanup verification failed.');
    }
  } finally {
    await client.end();
  }
}

export async function withDisposableDatabase<T>(
  callback: (database: DisposableDatabase) => Promise<T>,
): Promise<T> {
  const adminUrl = readTestDatabaseAdminUrl();
  const databaseName = generateDisposableDatabaseName();
  assertDisposableDatabaseName(databaseName);
  await createDatabase(adminUrl, databaseName);

  let callbackResult: T | undefined;
  let callbackError: unknown;
  try {
    callbackResult = await callback({
      databaseName,
      databaseUrl: databaseUrlFor(adminUrl, databaseName),
    });
  } catch (error) {
    callbackError = error;
  }

  let cleanupError: unknown;
  try {
    await dropAndVerifyDatabase(adminUrl, databaseName);
  } catch (error) {
    cleanupError = error;
  }

  if (callbackError !== undefined && cleanupError !== undefined) {
    throw new AggregateError(
      [callbackError, cleanupError],
      'Database test callback and disposable database cleanup both failed.',
      { cause: cleanupError },
    );
  }
  if (cleanupError !== undefined) {
    throw new Error('Disposable database cleanup failed.', {
      cause: cleanupError,
    });
  }
  if (callbackError !== undefined) {
    throw callbackError;
  }

  return callbackResult as T;
}
