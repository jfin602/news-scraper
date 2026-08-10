import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryResult, QueryResultRow } from 'pg';

import {
  acquireArticleIdentityLocks,
  articleIdentityLockKey,
} from '../../src/articles/identity-lock.ts';
import { endpointRunLockKey } from '../../src/collection/locks/endpoint-run-lock.ts';
import type { QueryExecutor } from '../../src/database/database.ts';

const SOURCE_A = '11111111-1111-4111-8111-111111111111';
const SOURCE_B = '22222222-2222-4222-8222-222222222222';

test('derives deterministic Source-scoped and kind-separated Article identity keys', () => {
  const externalKey = articleIdentityLockKey(
    SOURCE_A,
    'external_id',
    'publisher-item-1',
  );

  assert.equal(
    articleIdentityLockKey(
      SOURCE_A.toUpperCase(),
      'external_id',
      'publisher-item-1',
    ),
    externalKey,
  );
  assert.notEqual(
    articleIdentityLockKey(SOURCE_B, 'external_id', 'publisher-item-1'),
    externalKey,
  );
  assert.notEqual(
    articleIdentityLockKey(SOURCE_A, 'canonical_url', 'publisher-item-1'),
    externalKey,
  );
  assert.notEqual(endpointRunLockKey(SOURCE_A), externalKey);
  assert.match(externalKey, /^-?\d+$/u);
  assert.ok(BigInt(externalKey) >= -(1n << 63n));
  assert.ok(BigInt(externalKey) <= (1n << 63n) - 1n);
});

test('rejects malformed Article identity lock input', () => {
  assert.throws(
    () => articleIdentityLockKey('not-a-uuid', 'external_id', 'item'),
    /must be a UUID/u,
  );
  assert.throws(
    () => articleIdentityLockKey(SOURCE_A, 'external_id', ''),
    /must be non-empty/u,
  );
  assert.throws(
    () =>
      articleIdentityLockKey(SOURCE_A, 'unexpected' as 'external_id', 'item'),
    /kind is invalid/u,
  );
});

test('acquires strong external identity before canonical identity with transaction locks', async () => {
  const executor = new RecordingExecutor();

  await acquireArticleIdentityLocks(executor, {
    sourceId: SOURCE_A,
    externalId: 'publisher-item-1',
    canonicalIdentityUrl: 'https://publisher.example/article',
  });

  assert.deepEqual(executor.values, [
    articleIdentityLockKey(SOURCE_A, 'external_id', 'publisher-item-1'),
    articleIdentityLockKey(
      SOURCE_A,
      'canonical_url',
      'https://publisher.example/article',
    ),
  ]);
  assert.ok(
    executor.queries.every((query) => query.includes('pg_advisory_xact_lock')),
  );
});

test('canonical-only identity acquires one canonical transaction lock', async () => {
  const executor = new RecordingExecutor();

  await acquireArticleIdentityLocks(executor, {
    sourceId: SOURCE_A,
    canonicalIdentityUrl: 'https://publisher.example/article',
  });

  assert.deepEqual(executor.values, [
    articleIdentityLockKey(
      SOURCE_A,
      'canonical_url',
      'https://publisher.example/article',
    ),
  ]);
});

class RecordingExecutor implements QueryExecutor {
  readonly queries: string[] = [];
  readonly values: unknown[] = [];

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>> {
    this.queries.push(text);
    this.values.push(values?.[0]);
    return {
      command: 'SELECT',
      rowCount: 1,
      oid: 0,
      rows: [],
      fields: [],
    };
  }
}
