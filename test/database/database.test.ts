import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createDatabase,
  DatabaseRuntimeError,
} from '../../src/database/database.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

test('production database boundary pings and executes parameterized queries', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await database.ping();
      const result = await database.query<{ value: string }>(
        'SELECT $1::text AS value',
        ['parameterized-value'],
      );
      assert.equal(result.rows[0]?.value, 'parameterized-value');
    } finally {
      await database.close();
    }
  });
});

test('concurrent and repeated close is safe and prevents later operations', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    await database.ping();

    await Promise.all([database.close(), database.close(), database.close()]);
    await database.close();

    await assert.rejects(
      database.query('SELECT 1'),
      (error: unknown) =>
        error instanceof DatabaseRuntimeError && /closed/u.test(error.message),
    );
    await assert.rejects(database.ping(), /closed/u);
    await assert.rejects(
      database.transaction(async () => undefined),
      /closed/u,
    );
  });
});

test('connection failures are surfaced without reproducing credentials', async () => {
  const secret = 'synthetic-runtime-secret';
  const database = createDatabase({
    connectionString: `postgresql://user:${secret}@127.0.0.1:1/db?token=private`,
  });
  try {
    await assert.rejects(database.ping(), (error: unknown) => {
      assert.ok(error instanceof DatabaseRuntimeError);
      assert.doesNotMatch(
        error.message,
        /synthetic-runtime-secret|token=private/u,
      );
      return true;
    });
  } finally {
    await database.close();
  }
});

test('transaction acquisition failures are safe and predictable', async () => {
  const secret = 'synthetic-acquisition-secret';
  const database = createDatabase({
    connectionString: `postgresql://user:${secret}@127.0.0.1:1/db?token=private`,
  });
  try {
    await assert.rejects(
      database.transaction(async () => 'unreachable'),
      (error: unknown) => {
        assert.ok(error instanceof DatabaseRuntimeError);
        assert.equal(error.operation, 'transaction');
        assert.doesNotMatch(
          error.message,
          /synthetic-acquisition-secret|token=private/u,
        );
        return true;
      },
    );
  } finally {
    await database.close();
  }
});
