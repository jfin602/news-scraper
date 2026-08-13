import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  COLLECTION_CAPACITY_LIMITS,
  CollectionCapacityError,
  type CollectionCapacityRequest,
  type CollectionCapacityResult,
  withCollectionCapacity,
} from '../../src/collection/concurrency/collection-capacity.ts';
import {
  type EndpointRunLockResult,
  withEndpointRunLock,
} from '../../src/collection/locks/endpoint-run-lock.ts';
import {
  createDatabase,
  DATABASE_POOL_MAX_CONNECTIONS,
  type Database,
  type QueryExecutor,
} from '../../src/database/database.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const SHARED_SOURCE = sourceId(1);
const SHARED_HOST = 'shared-capacity.example';
const ENDPOINT_ID = endpointId(1);

test('global capacity admits exactly four independent actors and blocks the next', async () => {
  await withDatabaseActors(5, async (actors) => {
    const holders: CapacityHolder[] = [];
    try {
      for (
        let index = 0;
        index < COLLECTION_CAPACITY_LIMITS.global;
        index += 1
      ) {
        const holder = startCapacityHolder(
          requiredActor(actors, index),
          capacityRequest(index + 1),
        );
        holders.push(holder);
        await holder.entered;
      }

      assert.equal(
        new Set(await Promise.all(holders.map((holder) => holder.entered)))
          .size,
        4,
      );

      let contendingWorkExecuted = false;
      const blocked = await withCollectionCapacity(
        requiredActor(actors, 4),
        capacityRequest(5),
        async () => {
          contendingWorkExecuted = true;
        },
      );
      assertCapacityBlocked(blocked, 'global');
      assert.equal(contendingWorkExecuted, false);

      releaseHolders(holders);
      for (const result of await Promise.all(
        holders.map((holder) => holder.operation),
      )) {
        assert.equal(result.status, 'acquired');
      }
    } finally {
      await stopHolders(holders);
    }
  });
});

test('per-Source capacity is cross-client while an unrelated Source continues', async () => {
  await withDatabaseActors(4, async (actors) => {
    const sourceHolders = [
      startCapacityHolder(requiredActor(actors, 0), {
        sourceId: SHARED_SOURCE,
        destinationHost: 'source-a-one.example',
      }),
      startCapacityHolder(requiredActor(actors, 1), {
        sourceId: SHARED_SOURCE,
        destinationHost: 'source-a-two.example',
      }),
    ];
    const unrelatedHolders: CapacityHolder[] = [];
    try {
      await Promise.all(sourceHolders.map((holder) => holder.entered));

      let thirdSourceWorkExecuted = false;
      const blocked = await withCollectionCapacity(
        requiredActor(actors, 2),
        {
          sourceId: SHARED_SOURCE,
          destinationHost: 'source-a-three.example',
        },
        async () => {
          thirdSourceWorkExecuted = true;
        },
      );
      assertCapacityBlocked(blocked, 'source');
      assert.equal(thirdSourceWorkExecuted, false);

      const unrelated = startCapacityHolder(requiredActor(actors, 3), {
        sourceId: sourceId(2),
        destinationHost: 'source-b.example',
      });
      unrelatedHolders.push(unrelated);
      await unrelated.entered;

      releaseHolders([...sourceHolders, ...unrelatedHolders]);
      for (const result of await Promise.all(
        [...sourceHolders, ...unrelatedHolders].map(
          (holder) => holder.operation,
        ),
      )) {
        assert.equal(result.status, 'acquired');
      }
    } finally {
      await stopHolders([...sourceHolders, ...unrelatedHolders]);
    }
  });
});

test('per-host capacity spans Sources while an unrelated host continues', async () => {
  await withDatabaseActors(4, async (actors) => {
    const hostHolders = [
      startCapacityHolder(requiredActor(actors, 0), {
        sourceId: sourceId(1),
        destinationHost: SHARED_HOST,
      }),
      startCapacityHolder(requiredActor(actors, 1), {
        sourceId: sourceId(2),
        destinationHost: SHARED_HOST,
      }),
    ];
    const unrelatedHolders: CapacityHolder[] = [];
    try {
      await Promise.all(hostHolders.map((holder) => holder.entered));

      let thirdHostWorkExecuted = false;
      const blocked = await withCollectionCapacity(
        requiredActor(actors, 2),
        {
          sourceId: sourceId(3),
          destinationHost: SHARED_HOST,
        },
        async () => {
          thirdHostWorkExecuted = true;
        },
      );
      assertCapacityBlocked(blocked, 'host');
      assert.equal(thirdHostWorkExecuted, false);

      const unrelated = startCapacityHolder(requiredActor(actors, 3), {
        sourceId: sourceId(4),
        destinationHost: 'unrelated-host.example',
      });
      unrelatedHolders.push(unrelated);
      await unrelated.entered;

      releaseHolders([...hostHolders, ...unrelatedHolders]);
      for (const result of await Promise.all(
        [...hostHolders, ...unrelatedHolders].map((holder) => holder.operation),
      )) {
        assert.equal(result.status, 'acquired');
      }
    } finally {
      await stopHolders([...hostHolders, ...unrelatedHolders]);
    }
  });
});

test('a failed later-scope acquisition releases its earlier global slot', async () => {
  await withDatabaseActors(6, async (actors) => {
    const holders: CapacityHolder[] = [
      startCapacityHolder(requiredActor(actors, 0), {
        sourceId: SHARED_SOURCE,
        destinationHost: 'partial-one.example',
      }),
      startCapacityHolder(requiredActor(actors, 1), {
        sourceId: SHARED_SOURCE,
        destinationHost: 'partial-two.example',
      }),
    ];
    try {
      await Promise.all(holders.map((holder) => holder.entered));

      const sourceBlocked = await withCollectionCapacity(
        requiredActor(actors, 2),
        {
          sourceId: SHARED_SOURCE,
          destinationHost: 'partial-three.example',
        },
        async () => 'unreachable',
      );
      assertCapacityBlocked(sourceBlocked, 'source');

      for (let index = 3; index <= 4; index += 1) {
        const holder = startCapacityHolder(
          requiredActor(actors, index),
          capacityRequest(index + 10),
        );
        holders.push(holder);
        await holder.entered;
      }

      assert.equal(holders.length, COLLECTION_CAPACITY_LIMITS.global);
      const globallyBlocked = await withCollectionCapacity(
        requiredActor(actors, 5),
        capacityRequest(99),
        async () => 'unreachable',
      );
      assertCapacityBlocked(globallyBlocked, 'global');

      releaseHolders(holders);
      for (const result of await Promise.all(
        holders.map((holder) => holder.operation),
      )) {
        assert.equal(result.status, 'acquired');
      }
    } finally {
      await stopHolders(holders);
    }
  });
});

test('success and thrown work both release all capacity scopes for reacquisition', async () => {
  await withDatabaseActors(2, async ([actorA, actorB]) => {
    assert.ok(actorA);
    assert.ok(actorB);
    const request = capacityRequest(1);

    assert.deepEqual(
      await withCollectionCapacity(actorA, request, async () => 'success'),
      { status: 'acquired', value: 'success' },
    );
    assert.deepEqual(
      await withCollectionCapacity(
        actorB,
        request,
        async () => 'after-success',
      ),
      { status: 'acquired', value: 'after-success' },
    );

    const workFailure = new Error('synthetic collection failure');
    await assert.rejects(
      withCollectionCapacity(actorA, request, async () => {
        throw workFailure;
      }),
      workFailure,
    );
    assert.deepEqual(
      await withCollectionCapacity(
        actorB,
        request,
        async () => 'after-failure',
      ),
      { status: 'acquired', value: 'after-failure' },
    );
  });
});

test('an unconfirmed unlock discards the session and does not strand capacity', async () => {
  await withDatabaseActors(2, async ([actorA, actorB]) => {
    assert.ok(actorA);
    assert.ok(actorB);
    const request = capacityRequest(1);
    let uncertainPid: number | undefined;

    await assert.rejects(
      withCollectionCapacity(actorA, request, async (executor) => {
        uncertainPid = await backendPid(executor);
        await executor.query('SELECT pg_advisory_unlock_all()');
        return 'release-will-not-be-confirmed';
      }),
      (error: unknown) => {
        assert.ok(error instanceof CollectionCapacityError);
        assert.match(error.message, /release/u);
        return true;
      },
    );
    assert.ok(uncertainPid);
    assert.notEqual(await actorA.withSession(backendPid), uncertainPid);

    assert.deepEqual(
      await withCollectionCapacity(actorB, request, async () => 'reacquired'),
      { status: 'acquired', value: 'reacquired' },
    );
  });
});

test('terminating a holder backend releases capacity before its work barrier exits', async () => {
  await withDatabaseActors(
    3,
    async ([holderActor, killerActor, contenderActor]) => {
      assert.ok(holderActor);
      assert.ok(killerActor);
      assert.ok(contenderActor);
      const request = capacityRequest(1);
      const workEntered = deferred<number>();
      const finishOriginalWork = deferred<void>();
      const original = withCollectionCapacity(
        holderActor,
        request,
        async (executor) => {
          workEntered.resolve(await backendPid(executor));
          await finishOriginalWork.promise;
          return 'original-work-finished';
        },
      );

      try {
        const holderPid = await waitForSignalOrFailure(
          workEntered.promise,
          original,
        );
        const termination = await killerActor.query<{ terminated: boolean }>(
          'SELECT pg_terminate_backend($1, 5000) AS terminated',
          [holderPid],
        );
        assert.equal(termination.rows[0]?.terminated, true);

        assert.deepEqual(
          await withCollectionCapacity(
            contenderActor,
            request,
            async () => 'acquired-before-original-work-exited',
          ),
          { status: 'acquired', value: 'acquired-before-original-work-exited' },
        );

        finishOriginalWork.resolve();
        await assert.rejects(original, CollectionCapacityError);
      } finally {
        finishOriginalWork.resolve();
        await original.catch(() => undefined);
      }
    },
  );
});

test('capacity and the endpoint lock remain independent same-endpoint boundaries', async () => {
  await withDatabaseActors(2, async ([actorA, actorB]) => {
    assert.ok(actorA);
    assert.ok(actorB);
    const request = capacityRequest(1);
    const endpointWorkEntered = deferred<void>();
    const finishEndpointWork = deferred<void>();
    const first = withCollectionCapacity(actorA, request, async () =>
      withEndpointRunLock(actorA, ENDPOINT_ID, async () => {
        endpointWorkEntered.resolve();
        await finishEndpointWork.promise;
        return 'endpoint-owner';
      }),
    );

    try {
      await waitForSignalOrFailure(endpointWorkEntered.promise, first);

      let contendingEndpointWorkExecuted = false;
      const contender = await withCollectionCapacity(
        actorB,
        request,
        async () =>
          withEndpointRunLock(actorB, ENDPOINT_ID, async () => {
            contendingEndpointWorkExecuted = true;
            return 'unreachable';
          }),
      );
      assert.equal(contender.status, 'acquired');
      if (contender.status === 'acquired') {
        assert.deepEqual(contender.value, {
          status: 'blocked',
          stage: 'lock',
          reason: 'endpoint_locked',
        });
      }
      assert.equal(contendingEndpointWorkExecuted, false);

      finishEndpointWork.resolve();
      const firstResult = await first;
      assert.equal(firstResult.status, 'acquired');
      if (firstResult.status === 'acquired') {
        assert.deepEqual(firstResult.value, {
          status: 'acquired',
          value: 'endpoint-owner',
        });
      }
    } finally {
      finishEndpointWork.resolve();
      await first.catch(() => undefined);
    }
  });
});

test(
  'the fixed pool retains a progress connection at full collection capacity',
  { timeout: 30_000 },
  async () => {
    await withDatabaseActors(1, async ([database]) => {
      assert.ok(database);
      assert.ok(
        COLLECTION_CAPACITY_LIMITS.global * 2 + 1 <=
          DATABASE_POOL_MAX_CONNECTIONS,
      );
      const finishWork = deferred<void>();
      const operations: Promise<
        CollectionCapacityResult<EndpointRunLockResult<number>>
      >[] = [];
      const entered: Promise<void>[] = [];

      try {
        for (
          let index = 0;
          index < COLLECTION_CAPACITY_LIMITS.global;
          index += 1
        ) {
          const endpointEntered = deferred<void>();
          const operation = withCollectionCapacity(
            database,
            capacityRequest(index + 1),
            async () =>
              withEndpointRunLock(database, endpointId(index + 1), async () => {
                const persisted = await database.transaction(
                  async (transaction) => {
                    const result = await transaction.query<{ value: number }>(
                      'SELECT 1::integer AS value',
                    );
                    return result.rows[0]?.value;
                  },
                );
                assert.equal(persisted, 1);
                endpointEntered.resolve();
                await finishWork.promise;
                return index;
              }),
          );
          operations.push(operation);
          entered.push(
            waitForSignalOrFailure(endpointEntered.promise, operation),
          );
          await entered.at(-1);
        }
        await Promise.all(entered);

        const progress = await database.query<{ value: number }>(
          'SELECT 1::integer AS value',
        );
        assert.equal(progress.rows[0]?.value, 1);

        finishWork.resolve();
        for (const result of await Promise.all(operations)) {
          assert.equal(result.status, 'acquired');
          if (result.status === 'acquired') {
            assert.equal(result.value.status, 'acquired');
          }
        }
      } finally {
        finishWork.resolve();
        await Promise.allSettled(operations);
      }
    });
  },
);

interface CapacityHolder {
  readonly entered: Promise<number>;
  readonly release: Deferred<void>;
  readonly operation: Promise<CollectionCapacityResult<string>>;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
}

function startCapacityHolder(
  database: Database,
  request: CollectionCapacityRequest,
): CapacityHolder {
  const entered = deferred<number>();
  const release = deferred<void>();
  const operation = withCollectionCapacity(
    database,
    request,
    async (executor) => {
      entered.resolve(await backendPid(executor));
      await release.promise;
      return 'released';
    },
  );
  return {
    entered: waitForSignalOrFailure(entered.promise, operation),
    release,
    operation,
  };
}

function releaseHolders(holders: readonly CapacityHolder[]): void {
  for (const holder of holders) holder.release.resolve();
}

async function stopHolders(holders: readonly CapacityHolder[]): Promise<void> {
  releaseHolders(holders);
  await Promise.allSettled(holders.map((holder) => holder.operation));
}

async function waitForSignalOrFailure<T, R>(
  signal: Promise<T>,
  operation: Promise<R>,
): Promise<T> {
  return Promise.race([
    signal,
    operation.then(() => {
      throw new Error(
        'Protected work exited before reaching its test barrier.',
      );
    }),
  ]);
}

function assertCapacityBlocked<T>(
  result: CollectionCapacityResult<T>,
  limitingScope: 'global' | 'source' | 'host',
): void {
  assert.deepEqual(result, {
    status: 'blocked',
    stage: 'capacity',
    reason: 'collection_capacity_limited',
    limitingScope,
  });
}

function capacityRequest(index: number): CollectionCapacityRequest {
  return Object.freeze({
    sourceId: sourceId(index),
    destinationHost: `capacity-${index}.example`,
  });
}

function sourceId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function endpointId(index: number): string {
  return `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function requiredActor(actors: readonly Database[], index: number): Database {
  const actor = actors[index];
  if (actor === undefined) throw new Error(`Missing database actor ${index}.`);
  return actor;
}

async function withDatabaseActors(
  count: number,
  work: (actors: readonly Database[]) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    const actors = Array.from({ length: count }, () =>
      createDatabase({ connectionString: databaseUrl }),
    );
    try {
      await work(actors);
    } finally {
      await Promise.all(actors.map(async (actor) => actor.close()));
    }
  });
}

async function backendPid(executor: QueryExecutor): Promise<number> {
  const result = await executor.query<{ pid: number }>(
    'SELECT pg_backend_pid() AS pid',
  );
  const pid = result.rows[0]?.pid;
  if (pid === undefined) throw new Error('Backend PID query returned no row.');
  return pid;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
