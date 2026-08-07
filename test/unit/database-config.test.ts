import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DATABASE_URL_ENV,
  DatabaseConfigError,
  parseDatabaseConfig,
} from '../../src/database/config.ts';

test('application database URL is required explicitly', () => {
  assert.throws(
    () => parseDatabaseConfig({}),
    (error: unknown) =>
      error instanceof DatabaseConfigError &&
      error.variable === DATABASE_URL_ENV,
  );
});

test('application database URL must be a PostgreSQL URL', () => {
  for (const value of ['not a url', 'https://database.example/app']) {
    assert.throws(
      () => parseDatabaseConfig({ [DATABASE_URL_ENV]: value }),
      new RegExp(DATABASE_URL_ENV, 'u'),
    );
  }
});

test('configuration errors do not reproduce credentials or query strings', () => {
  const secret = 'synthetic-secret-password';
  assert.throws(
    () =>
      parseDatabaseConfig({
        [DATABASE_URL_ENV]: `https://user:${secret}@example.test/db?token=private`,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(
        error.message,
        /synthetic-secret-password|token=private/u,
      );
      return true;
    },
  );
});

test('configuration is stable, typed, and immutable', () => {
  const connectionString = 'postgresql://application.example/news';
  const config = parseDatabaseConfig({ [DATABASE_URL_ENV]: connectionString });

  assert.deepEqual(config, { connectionString });
  assert.equal(Object.isFrozen(config), true);
  assert.throws(() => Object.assign(config, { connectionString: 'changed' }));
});

test('test admin URL is never an application fallback', () => {
  assert.throws(() =>
    parseDatabaseConfig({
      NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL:
        'postgresql://admin.example/postgres',
    }),
  );
});
