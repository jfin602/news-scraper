import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryResult, QueryResultRow } from 'pg';

import {
  endpointRunLockKey,
  EndpointRunLockError,
  withEndpointRunLock,
} from '../../src/collection/locks/endpoint-run-lock.ts';
import {
  type DatabaseSession,
  DatabaseRuntimeError,
} from '../../src/database/database.ts';

const ENDPOINT_A = '11111111-1111-4111-8111-111111111111';
const ENDPOINT_B = '22222222-2222-4222-8222-222222222222';

test('derives stable signed 64-bit keys from canonical endpoint UUID identity', () => {
  const key = endpointRunLockKey(ENDPOINT_A);

  assert.equal(endpointRunLockKey(ENDPOINT_A.toUpperCase()), key);
  assert.notEqual(endpointRunLockKey(ENDPOINT_B), key);
  assert.match(key, /^-?\d+$/u);
  assert.ok(BigInt(key) >= -(1n << 63n));
  assert.ok(BigInt(key) <= (1n << 63n) - 1n);
  assert.throws(
    () => endpointRunLockKey('not-a-persisted-endpoint-id'),
    /must be a UUID/u,
  );
});

test('returns stable lock contention without executing protected work', async () => {
  const session = new ScriptedSession([false]);
  let workExecuted = false;

  const result = await withEndpointRunLock(
    new FakeSessionDatabase(session),
    ENDPOINT_A,
    async () => {
      workExecuted = true;
    },
  );

  assert.deepEqual(result, {
    status: 'blocked',
    stage: 'lock',
    reason: 'endpoint_locked',
  });
  assert.equal(workExecuted, false);
  assert.equal(session.discarded, false);
});

test('discards an uncertain session when acquisition or release fails', async () => {
  const acquisitionFailure = new DatabaseRuntimeError(
    'session query',
    'database connection is unavailable',
  );
  const failedAcquisitionSession = new ScriptedSession([acquisitionFailure]);
  await assert.rejects(
    withEndpointRunLock(
      new FakeSessionDatabase(failedAcquisitionSession),
      ENDPOINT_A,
      async () => 'unreachable',
    ),
    acquisitionFailure,
  );
  assert.equal(failedAcquisitionSession.discarded, true);

  const failedReleaseSession = new ScriptedSession([true, false]);
  await assert.rejects(
    withEndpointRunLock(
      new FakeSessionDatabase(failedReleaseSession),
      ENDPOINT_A,
      async () => 'completed-work',
    ),
    (error: unknown) => {
      assert.ok(error instanceof EndpointRunLockError);
      assert.match(error.message, /release was not confirmed/u);
      return true;
    },
  );
  assert.equal(failedReleaseSession.discarded, true);
});

test('preserves callback and unlock failures together while discarding the session', async () => {
  const callbackFailure = new Error('synthetic callback failure');
  const unlockFailure = new Error('synthetic unlock failure');
  const session = new ScriptedSession([true, unlockFailure]);

  await assert.rejects(
    withEndpointRunLock(
      new FakeSessionDatabase(session),
      ENDPOINT_A,
      async () => {
        throw callbackFailure;
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors[0], callbackFailure);
      assert.ok(error.errors[1] instanceof EndpointRunLockError);
      assert.equal(error.errors[1].cause, unlockFailure);
      return true;
    },
  );
  assert.equal(session.discarded, true);
});

class FakeSessionDatabase {
  readonly #session: DatabaseSession;

  constructor(session: DatabaseSession) {
    this.#session = session;
  }

  withSession<T>(work: (session: DatabaseSession) => Promise<T>): Promise<T> {
    return work(this.#session);
  }
}

class ScriptedSession implements DatabaseSession {
  discarded = false;
  readonly #outcomes: (boolean | Error)[];
  #queryCount = 0;

  constructor(outcomes: (boolean | Error)[]) {
    this.#outcomes = outcomes;
  }

  discard(): void {
    this.discarded = true;
  }

  async query<Row extends QueryResultRow = QueryResultRow>(): Promise<
    QueryResult<Row>
  > {
    const outcome = this.#outcomes[this.#queryCount];
    this.#queryCount += 1;
    if (outcome instanceof Error) throw outcome;
    if (outcome === undefined) throw new Error('Unexpected fake query.');

    const field = this.#queryCount === 1 ? 'acquired' : 'released';
    return queryResult({ [field]: outcome }) as unknown as QueryResult<Row>;
  }
}

function queryResult<Row extends QueryResultRow>(row: Row): QueryResult<Row> {
  return {
    command: 'SELECT',
    rowCount: 1,
    oid: 0,
    rows: [row],
    fields: [],
  };
}
