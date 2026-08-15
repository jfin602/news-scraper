import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryResult, QueryResultRow } from 'pg';

import {
  COLLECTION_CAPACITY_LIMITS,
  COLLECTION_DATABASE_POOL_POLICY,
  COLLECTION_MINIMUM_DATABASE_POOL_HEADROOM,
  COLLECTION_PINNED_DATABASE_SESSIONS_PER_EXECUTION,
  CollectionCapacityError,
  collectionCapacitySlotSet,
  globalCollectionCapacitySlotKey,
  hostCollectionCapacitySlotKey,
  sourceCollectionCapacitySlotKey,
  withCollectionCapacity,
} from '../../src/collection/concurrency/collection-capacity.ts';
import {
  DATABASE_POOL_MAX_CONNECTIONS,
  type DatabaseSession,
} from '../../src/database/database.ts';

const SOURCE_A = '11111111-1111-4111-8111-111111111111';
const SOURCE_B = '22222222-2222-4222-8222-222222222222';
const HOST_A = 'news.example';

test('derives stable signed 64-bit keys with separate capacity namespaces', () => {
  const representativeKeys = [
    globalCollectionCapacitySlotKey(0),
    globalCollectionCapacitySlotKey(1),
    sourceCollectionCapacitySlotKey(SOURCE_A, 0),
    sourceCollectionCapacitySlotKey(SOURCE_B, 0),
    hostCollectionCapacitySlotKey(HOST_A, 0),
    hostCollectionCapacitySlotKey('other.example', 0),
  ];

  assert.equal(new Set(representativeKeys).size, representativeKeys.length);
  for (const key of representativeKeys) {
    assert.match(key, /^-?\d+$/u);
    assert.ok(BigInt(key) >= -(1n << 63n));
    assert.ok(BigInt(key) <= (1n << 63n) - 1n);
  }
  assert.equal(
    sourceCollectionCapacitySlotKey(SOURCE_A.toUpperCase(), 1),
    sourceCollectionCapacitySlotKey(SOURCE_A, 1),
  );
  assert.equal(
    hostCollectionCapacitySlotKey('  B\u00dcCHER.Example.  ', 1),
    hostCollectionCapacitySlotKey('xn--bcher-kva.example', 1),
  );
});

test('builds fixed bounded slot sets in deterministic index order', () => {
  assert.deepEqual(COLLECTION_CAPACITY_LIMITS, {
    global: 4,
    source: 2,
    host: 2,
  });
  assert.deepEqual(collectionCapacitySlotSet({ scope: 'global' }), [
    globalCollectionCapacitySlotKey(0),
    globalCollectionCapacitySlotKey(1),
    globalCollectionCapacitySlotKey(2),
    globalCollectionCapacitySlotKey(3),
  ]);
  assert.deepEqual(
    collectionCapacitySlotSet({ scope: 'source', sourceId: SOURCE_A }),
    [
      sourceCollectionCapacitySlotKey(SOURCE_A, 0),
      sourceCollectionCapacitySlotKey(SOURCE_A, 1),
    ],
  );
  assert.deepEqual(
    collectionCapacitySlotSet({ scope: 'host', destinationHost: HOST_A }),
    [
      hostCollectionCapacitySlotKey(HOST_A, 0),
      hostCollectionCapacitySlotKey(HOST_A, 1),
    ],
  );
});

test('global capacity leaves explicit pool headroom for nested collection work', () => {
  assert.equal(COLLECTION_PINNED_DATABASE_SESSIONS_PER_EXECUTION, 2);
  assert.equal(COLLECTION_MINIMUM_DATABASE_POOL_HEADROOM, 1);
  assert.equal(DATABASE_POOL_MAX_CONNECTIONS, 10);
  assert.deepEqual(COLLECTION_DATABASE_POOL_POLICY, {
    maxConnections: 10,
    pinnedSessionsPerExecution: 2,
    minimumHeadroomConnections: 1,
    pinnedConnectionsAtGlobalLimit: 8,
    availableConnectionsAtGlobalLimit: 2,
  });
  assert.ok(
    COLLECTION_CAPACITY_LIMITS.global *
      COLLECTION_PINNED_DATABASE_SESSIONS_PER_EXECUTION +
      COLLECTION_MINIMUM_DATABASE_POOL_HEADROOM <=
      DATABASE_POOL_MAX_CONNECTIONS,
  );
});

test('rejects invalid Source, host, and out-of-range slot inputs', () => {
  assert.throws(
    () => sourceCollectionCapacitySlotKey('not-a-source-id', 0),
    /Source id must be a UUID/u,
  );
  for (const host of ['', 'https://news.example/feed', '127.0.0.1']) {
    assert.throws(() => hostCollectionCapacitySlotKey(host, 0));
  }
  for (const slotIndex of [-1, 0.5, COLLECTION_CAPACITY_LIMITS.global]) {
    assert.throws(() => globalCollectionCapacitySlotKey(slotIndex), RangeError);
  }
  assert.throws(
    () =>
      sourceCollectionCapacitySlotKey(
        SOURCE_A,
        COLLECTION_CAPACITY_LIMITS.source,
      ),
    RangeError,
  );
  assert.throws(
    () =>
      hostCollectionCapacitySlotKey(HOST_A, COLLECTION_CAPACITY_LIMITS.host),
    RangeError,
  );
});

test('reports the limiting scope without invoking work and rolls back partial acquisition', async () => {
  const cases = [
    {
      scope: 'global',
      outcomes: [false, false, false, false],
      releasedKeys: [],
    },
    {
      scope: 'source',
      outcomes: [true, false, false, true],
      releasedKeys: [globalCollectionCapacitySlotKey(0)],
    },
    {
      scope: 'host',
      outcomes: [true, true, false, false, true, true],
      releasedKeys: [
        sourceCollectionCapacitySlotKey(SOURCE_A, 0),
        globalCollectionCapacitySlotKey(0),
      ],
    },
  ] as const;

  for (const { scope, outcomes, releasedKeys } of cases) {
    const session = new ScriptedSession([...outcomes]);
    let workExecuted = false;

    const result = await withCollectionCapacity(
      new FakeSessionDatabase(session),
      { sourceId: SOURCE_A, destinationHost: HOST_A },
      async () => {
        workExecuted = true;
      },
    );

    assert.deepEqual(result, {
      status: 'blocked',
      stage: 'capacity',
      reason: 'collection_capacity_limited',
      limitingScope: scope,
    });
    assert.equal(workExecuted, false);
    assert.deepEqual(session.unlockKeys, releasedKeys);
    assert.equal(session.discarded, false);
  }
});

test('acquires scopes in order and releases successful work in reverse order', async () => {
  const session = new ScriptedSession([true, true, true, true, true, true]);

  const result = await withCollectionCapacity(
    new FakeSessionDatabase(session),
    { sourceId: SOURCE_A, destinationHost: HOST_A },
    async (executor) => {
      assert.equal(executor, session);
      return 'completed';
    },
  );

  assert.deepEqual(result, { status: 'acquired', value: 'completed' });
  assert.deepEqual(session.tryKeys, [
    globalCollectionCapacitySlotKey(0),
    sourceCollectionCapacitySlotKey(SOURCE_A, 0),
    hostCollectionCapacitySlotKey(HOST_A, 0),
  ]);
  assert.deepEqual(session.unlockKeys, [
    hostCollectionCapacitySlotKey(HOST_A, 0),
    sourceCollectionCapacitySlotKey(SOURCE_A, 0),
    globalCollectionCapacitySlotKey(0),
  ]);
});

test('releases every slot when protected work throws', async () => {
  const workFailure = new Error('synthetic work failure');
  const session = new ScriptedSession([true, true, true, true, true, true]);

  await assert.rejects(
    withCollectionCapacity(
      new FakeSessionDatabase(session),
      { sourceId: SOURCE_A, destinationHost: HOST_A },
      async () => {
        throw workFailure;
      },
    ),
    workFailure,
  );
  assert.deepEqual(session.unlockKeys, [
    hostCollectionCapacitySlotKey(HOST_A, 0),
    sourceCollectionCapacitySlotKey(SOURCE_A, 0),
    globalCollectionCapacitySlotKey(0),
  ]);
  assert.equal(session.discarded, false);
});

test('discards the session when capacity release is not confirmed', async () => {
  const session = new ScriptedSession([true, true, true, false]);

  await assert.rejects(
    withCollectionCapacity(
      new FakeSessionDatabase(session),
      { sourceId: SOURCE_A, destinationHost: HOST_A },
      async () => 'completed',
    ),
    (error: unknown) => {
      assert.ok(error instanceof CollectionCapacityError);
      assert.match(error.message, /release was not confirmed/u);
      return true;
    },
  );
  assert.equal(session.discarded, true);
});

test('preserves work and release failures together and discards the session', async () => {
  const workFailure = new Error('synthetic work failure');
  const unlockFailure = new Error('synthetic unlock failure');
  const session = new ScriptedSession([true, true, true, unlockFailure]);

  await assert.rejects(
    withCollectionCapacity(
      new FakeSessionDatabase(session),
      { sourceId: SOURCE_A, destinationHost: HOST_A },
      async () => {
        throw workFailure;
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors[0], workFailure);
      assert.ok(error.errors[1] instanceof CollectionCapacityError);
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
  readonly tryKeys: string[] = [];
  readonly unlockKeys: string[] = [];
  readonly #outcomes: (boolean | Error)[];
  #queryCount = 0;

  constructor(outcomes: (boolean | Error)[]) {
    this.#outcomes = outcomes;
  }

  discard(): void {
    this.discarded = true;
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    const outcome = this.#outcomes[this.#queryCount];
    this.#queryCount += 1;
    if (outcome instanceof Error) throw outcome;
    if (outcome === undefined) throw new Error('Unexpected fake query.');

    const key = values[0];
    if (typeof key !== 'string') throw new Error('Expected string lock key.');
    if (text.includes('pg_try_advisory_lock')) {
      this.tryKeys.push(key);
      return queryResult({ acquired: outcome }) as unknown as QueryResult<Row>;
    }
    if (text.includes('pg_advisory_unlock')) {
      this.unlockKeys.push(key);
      return queryResult({ released: outcome }) as unknown as QueryResult<Row>;
    }
    throw new Error(`Unexpected fake query: ${text}`);
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
