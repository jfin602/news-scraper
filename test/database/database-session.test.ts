import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createDatabase,
  DatabaseRuntimeError,
} from '../../src/database/database.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

test('dedicated sessions preserve one backend and release or discard every client', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const successfulResult = await database.withSession(async (session) => {
        const first = await backendPid(session);
        const second = await backendPid(session);
        assert.equal(second, first);
        return { pid: first, value: 'session-result' };
      });
      assert.equal(successfulResult.value, 'session-result');

      const firstSessionEntered = deferred<void>();
      const releaseFirstSession = deferred<void>();
      const firstSession = database.withSession(async (session) => {
        const pid = await backendPid(session);
        firstSessionEntered.resolve();
        await releaseFirstSession.promise;
        return pid;
      });

      await firstSessionEntered.promise;
      const secondPid = await database.withSession(backendPid);
      releaseFirstSession.resolve();
      const firstPid = await firstSession;
      assert.notEqual(secondPid, firstPid);

      const callbackFailure = new Error('synthetic session callback failure');
      await assert.rejects(
        database.withSession(async () => {
          throw callbackFailure;
        }),
        callbackFailure,
      );
      assert.equal(await database.withSession(backendPid), firstPid);

      const discardedPid = await database.withSession(async (session) => {
        const pid = await backendPid(session);
        session.discard();
        return pid;
      });
      assert.notEqual(await database.withSession(backendPid), discardedPid);

      const querySecret = 'synthetic-session-query-secret';
      await assert.rejects(
        database.withSession((session) =>
          session.query(`SELECT missing_${querySecret}`),
        ),
        (error: unknown) => {
          assert.ok(error instanceof DatabaseRuntimeError);
          assert.equal(error.operation, 'session query');
          assert.doesNotMatch(error.message, new RegExp(querySecret, 'u'));
          return true;
        },
      );
      await database.ping();
    } finally {
      await database.close();
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
