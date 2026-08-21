import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryResult, QueryResultRow } from 'pg';

import { articleIdentityLockKey } from '../../src/articles/identity-lock.ts';
import { endpointRunLockKey } from '../../src/collection/locks/endpoint-run-lock.ts';
import type { QueryExecutor } from '../../src/database/database.ts';
import {
  acquireDistributionProfileSourceValidityLock,
  acquireDistributionProfileSourceValidityLocks,
  distributionProfileSourceValidityLockKey,
} from '../../src/distribution/profiles/source-validity-lock.ts';

const SOURCE_A = '11111111-1111-4111-8111-111111111111';
const SOURCE_B = '22222222-2222-4222-8222-222222222222';
const SOURCE_C = '33333333-3333-4333-8333-333333333333';

test('derives deterministic, normalized, namespaced signed bigint validity keys', () => {
  const key = distributionProfileSourceValidityLockKey(SOURCE_A);

  assert.equal(
    distributionProfileSourceValidityLockKey(SOURCE_A.toUpperCase()),
    key,
  );
  assert.notEqual(distributionProfileSourceValidityLockKey(SOURCE_B), key);
  assert.notEqual(
    articleIdentityLockKey(SOURCE_A, 'external_id', 'publisher-item-1'),
    key,
  );
  assert.notEqual(endpointRunLockKey(SOURCE_A), key);
  assert.match(key, /^-?\d+$/u);
  assert.ok(BigInt(key) >= -(1n << 63n));
  assert.ok(BigInt(key) <= (1n << 63n) - 1n);
});

test('rejects malformed Distribution Profile Source validity lock input', () => {
  assert.throws(
    () => distributionProfileSourceValidityLockKey('not-a-uuid'),
    /must be a UUID/u,
  );
});

test('acquires each validity guard once in deterministic Source-id order', async () => {
  const executor = new RecordingExecutor();

  await acquireDistributionProfileSourceValidityLocks(executor, [
    SOURCE_C,
    SOURCE_A.toUpperCase(),
    SOURCE_B,
    SOURCE_A,
  ]);

  assert.deepEqual(executor.values, [
    distributionProfileSourceValidityLockKey(SOURCE_A),
    distributionProfileSourceValidityLockKey(SOURCE_B),
    distributionProfileSourceValidityLockKey(SOURCE_C),
  ]);
  assert.ok(
    executor.queries.every(
      (query) =>
        query.includes('pg_advisory_xact_lock') &&
        !query.includes('pg_advisory_unlock') &&
        !query.includes('pg_advisory_lock'),
    ),
  );
});

test('acquires one Source validity guard with a transaction advisory lock', async () => {
  const executor = new RecordingExecutor();

  await acquireDistributionProfileSourceValidityLock(executor, SOURCE_A);

  assert.deepEqual(executor.values, [
    distributionProfileSourceValidityLockKey(SOURCE_A),
  ]);
  assert.equal(executor.queries[0], 'SELECT pg_advisory_xact_lock($1::bigint)');
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
