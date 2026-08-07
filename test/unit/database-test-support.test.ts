import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertDisposableDatabaseName,
  generateDisposableDatabaseName,
} from '../support/database/disposable-database.ts';
import {
  readTestDatabaseAdminUrl,
  TEST_DATABASE_ADMIN_URL_ENV,
} from '../support/database/test-database-config.ts';

test('database test admin URL is required', () => {
  assert.throws(
    () => readTestDatabaseAdminUrl({}),
    new RegExp(TEST_DATABASE_ADMIN_URL_ENV, 'u'),
  );
});

test('database test admin URL must be a PostgreSQL URL', () => {
  for (const value of ['not a url', 'https://database.example/test']) {
    assert.throws(
      () => readTestDatabaseAdminUrl({ [TEST_DATABASE_ADMIN_URL_ENV]: value }),
      new RegExp(TEST_DATABASE_ADMIN_URL_ENV, 'u'),
    );
  }
});

test('database test configuration errors do not reproduce credentials', () => {
  const credential = 'synthetic-secret-password';
  assert.throws(
    () =>
      readTestDatabaseAdminUrl({
        [TEST_DATABASE_ADMIN_URL_ENV]: `https://admin:${credential}@example.test/db?token=private`,
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

test('database test configuration never falls back to an application URL', () => {
  assert.throws(() =>
    readTestDatabaseAdminUrl({
      NEWS_SCRAPER_DATABASE_URL: 'postgresql://application.example/app',
    }),
  );
});

test('generated disposable database names satisfy the destructive guard', () => {
  const first = generateDisposableDatabaseName();
  const second = generateDisposableDatabaseName();
  assert.match(first, /^news_scraper_test_[0-9a-f]{32}$/u);
  assert.notEqual(first, second);
  assert.doesNotThrow(() => assertDisposableDatabaseName(first));
});

test('destructive guard rejects arbitrary database names', () => {
  for (const name of [
    'postgres',
    'news_scraper',
    'news_scraper_test_fake',
    '',
  ]) {
    assert.throws(() => assertDisposableDatabaseName(name), /non-disposable/u);
  }
});
