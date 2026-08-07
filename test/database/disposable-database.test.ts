import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from 'pg';

import {
  databaseExists,
  withDisposableDatabase,
} from '../support/database/disposable-database.ts';
import { readTestDatabaseAdminUrl } from '../support/database/test-database-config.ts';

test('creates a connectable unique database and drops it after success', async () => {
  const adminUrl = readTestDatabaseAdminUrl();
  let createdName = '';

  await withDisposableDatabase(async ({ databaseName, databaseUrl }) => {
    createdName = databaseName;
    assert.equal(await databaseExists(adminUrl, databaseName), true);
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      const result = await client.query<{ value: number }>('SELECT 1 AS value');
      assert.equal(result.rows[0]?.value, 1);
    } finally {
      await client.end();
    }
  });

  assert.equal(await databaseExists(adminUrl, createdName), false);
});

test('separate disposable databases do not share state', async () => {
  let firstName = '';
  let secondName = '';

  await withDisposableDatabase(async (first) => {
    firstName = first.databaseName;
    const firstClient = new Client({ connectionString: first.databaseUrl });
    try {
      await firstClient.connect();
      await firstClient.query(
        'CREATE TABLE isolated_value (value text NOT NULL)',
      );
      await firstClient.query("INSERT INTO isolated_value VALUES ('first')");
    } finally {
      await firstClient.end();
    }

    await withDisposableDatabase(async (second) => {
      secondName = second.databaseName;
      assert.notEqual(secondName, firstName);
      const secondClient = new Client({ connectionString: second.databaseUrl });
      try {
        await secondClient.connect();
        const result = await secondClient.query<{ table_name: string | null }>(
          "SELECT to_regclass('public.isolated_value')::text AS table_name",
        );
        assert.equal(result.rows[0]?.table_name, null);
      } finally {
        await secondClient.end();
      }
    });
  });
});

test('drops and verifies the database when the callback throws', async () => {
  const adminUrl = readTestDatabaseAdminUrl();
  let createdName = '';
  const callbackFailure = new Error('synthetic callback failure');

  await assert.rejects(
    withDisposableDatabase(async ({ databaseName }) => {
      createdName = databaseName;
      throw callbackFailure;
    }),
    callbackFailure,
  );

  assert.equal(await databaseExists(adminUrl, createdName), false);
});

test('cleanup closes leaked database connections before verified drop', async () => {
  const adminUrl = readTestDatabaseAdminUrl();
  let createdName = '';
  let leakedClient: Client | undefined;
  let connectionTermination: Promise<Error> | undefined;

  await withDisposableDatabase(async ({ databaseName, databaseUrl }) => {
    createdName = databaseName;
    leakedClient = new Client({ connectionString: databaseUrl });
    connectionTermination = new Promise((resolve) => {
      leakedClient?.on('error', resolve);
    });
    await leakedClient.connect();
  });

  assert.equal(await databaseExists(adminUrl, createdName), false);
  assert.ok((await connectionTermination) instanceof Error);
  await leakedClient?.end().catch(() => undefined);
});
