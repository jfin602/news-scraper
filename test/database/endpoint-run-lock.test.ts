import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  endpointRunLockKey,
  type EndpointRunLockResult,
  withEndpointRunLock,
} from '../../src/collection/locks/endpoint-run-lock.ts';
import { createDatabase } from '../../src/database/database.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const ENDPOINT_A = '11111111-1111-4111-8111-111111111111';
const ENDPOINT_B = '22222222-2222-4222-8222-222222222222';

test('independent database actors coordinate endpoint ownership through PostgreSQL', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    const actorA = createDatabase({ connectionString: databaseUrl });
    const actorB = createDatabase({ connectionString: databaseUrl });
    const actorAOwnsEndpoint = deferred<void>();
    const releaseActorA = deferred<void>();
    let actorAOwnership: Promise<EndpointRunLockResult<string>> | undefined;
    let actorAClose: Promise<void> | undefined;

    try {
      let ownerPid: number | undefined;
      actorAOwnership = withEndpointRunLock(
        actorA,
        ENDPOINT_A,
        async (executor) => {
          ownerPid = await backendPid(executor);
          actorAOwnsEndpoint.resolve();
          await releaseActorA.promise;
          return 'actor-a-result';
        },
      );
      await actorAOwnsEndpoint.promise;

      const independentActorPid = await actorB.withSession(backendPid);
      assert.notEqual(independentActorPid, ownerPid);

      let contendingWorkExecuted = false;
      const contended = await withEndpointRunLock(
        actorB,
        ENDPOINT_A,
        async () => {
          contendingWorkExecuted = true;
          return 'unreachable';
        },
      );
      assert.deepEqual(contended, {
        status: 'blocked',
        stage: 'lock',
        reason: 'endpoint_locked',
      });
      assert.equal(Object.isFrozen(contended), true);
      assert.equal(contendingWorkExecuted, false);

      const unrelated = await withEndpointRunLock(
        actorB,
        ENDPOINT_B,
        async (executor) => ({ pid: await backendPid(executor) }),
      );
      assert.equal(unrelated.status, 'acquired');
      if (unrelated.status === 'acquired') {
        assert.notEqual(unrelated.value.pid, ownerPid);
      }

      releaseActorA.resolve();
      assert.deepEqual(await actorAOwnership, {
        status: 'acquired',
        value: 'actor-a-result',
      });
      actorAOwnership = undefined;

      assert.deepEqual(
        await withEndpointRunLock(actorB, ENDPOINT_A, async () => 'reacquired'),
        { status: 'acquired', value: 'reacquired' },
      );

      const callbackFailure = new Error('synthetic protected work failure');
      await assert.rejects(
        withEndpointRunLock(actorA, ENDPOINT_A, async () => {
          throw callbackFailure;
        }),
        callbackFailure,
      );
      assert.equal(
        (
          await withEndpointRunLock(
            actorB,
            ENDPOINT_A,
            async () => 'after-failure',
          )
        ).status,
        'acquired',
      );

      for (let index = 0; index < 5; index += 1) {
        assert.equal(
          (
            await withEndpointRunLock(
              index % 2 === 0 ? actorA : actorB,
              ENDPOINT_A,
              async () => index,
            )
          ).status,
          'acquired',
        );
      }

      const closeBarrierEntered = deferred<void>();
      const finishClosingOwner = deferred<void>();
      actorAOwnership = withEndpointRunLock(actorA, ENDPOINT_A, async () => {
        closeBarrierEntered.resolve();
        await finishClosingOwner.promise;
        return 'closing-owner';
      });
      await closeBarrierEntered.promise;
      actorAClose = actorA.close();

      assert.equal(
        (
          await withEndpointRunLock(
            actorB,
            ENDPOINT_A,
            async () => 'unreachable',
          )
        ).status,
        'blocked',
      );
      finishClosingOwner.resolve();
      assert.equal((await actorAOwnership).status, 'acquired');
      actorAOwnership = undefined;
      await actorAClose;
      actorAClose = undefined;

      assert.equal(
        (
          await withEndpointRunLock(
            actorB,
            ENDPOINT_A,
            async () => 'after-close',
          )
        ).status,
        'acquired',
      );

      assert.notEqual(
        endpointRunLockKey(ENDPOINT_A),
        endpointRunLockKey(ENDPOINT_B),
      );
    } finally {
      releaseActorA.resolve();
      await actorAOwnership?.catch(() => undefined);
      await actorAClose?.catch(() => undefined);
      await Promise.all([actorA.close(), actorB.close()]);
    }
  });
});

interface PidExecutor {
  query<Row extends { [column: string]: unknown }>(
    text: string,
  ): Promise<{ rows: Row[] }>;
}

async function backendPid(executor: PidExecutor): Promise<number> {
  const result = await executor.query<{ pid: number }>(
    'SELECT pg_backend_pid() AS pid',
  );
  const pid = result.rows[0]?.pid;
  if (pid === undefined) throw new Error('Backend PID query returned no row.');
  return pid;
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
