import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from 'pg';

import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';
import { databaseExists } from '../support/database/disposable-database.ts';
import { readTestDatabaseAdminUrl } from '../support/database/test-database-config.ts';

test('migrated scopes reuse one migrated database while resetting rows and identities', async () => {
  const scope = createDatabaseTestScope('migrated');
  try {
    let firstName = '';
    let ledgerCount = 0;
    await scope.use(async ({ databaseName, databaseUrl }) => {
      firstName = databaseName;
      await withClient(databaseUrl, async (client) => {
        const ledger = await client.query<{ count: string }>(
          'SELECT count(*) FROM news_scraper_schema_migrations',
        );
        ledgerCount = Number(ledger.rows[0]?.count);
        assert.ok(ledgerCount > 0);
        assert.equal(
          (
            await client.query<{ table_name: string | null }>(
              "SELECT to_regclass('public.duplicate_groups')::text AS table_name",
            )
          ).rows[0]?.table_name,
          'duplicate_groups',
        );
        await client.query(
          'CREATE TABLE scope_identity_probe (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, value text NOT NULL)',
        );
        const identity = await client.query<{ id: string }>(
          "INSERT INTO scope_identity_probe (value) VALUES ('first') RETURNING id",
        );
        assert.equal(identity.rows[0]?.id, '1');
        await client.query(
          `INSERT INTO publication_settings (name, active_for_collection, public_status)
           VALUES ('Scope first case', true, 'private')`,
        );
      });
    });

    await scope.use(async ({ databaseName, databaseUrl }) => {
      assert.equal(databaseName, firstName);
      await withClient(databaseUrl, async (client) => {
        const rows = await client.query<{ count: string }>(
          'SELECT count(*) FROM publication_settings',
        );
        assert.equal(rows.rows[0]?.count, '0');
        const ledger = await client.query<{ count: string }>(
          'SELECT count(*) FROM news_scraper_schema_migrations',
        );
        assert.equal(Number(ledger.rows[0]?.count), ledgerCount);
        const identity = await client.query<{ id: string }>(
          "INSERT INTO scope_identity_probe (value) VALUES ('second') RETURNING id",
        );
        assert.equal(identity.rows[0]?.id, '1');
        const indexes = await client.query<{ count: string }>(
          `SELECT count(*) FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = 'articles'`,
        );
        assert.ok(Number(indexes.rows[0]?.count) > 0);
        const constraints = await client.query<{ count: string }>(
          `SELECT count(*) FROM pg_constraint constraint_row
             JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
            WHERE table_row.relname = 'sources' AND constraint_row.contype = 'u'`,
        );
        assert.ok(Number(constraints.rows[0]?.count) > 0);
      });
    });
  } finally {
    await scope.dispose();
  }
});

test('independent scopes own distinct physical databases and verify final cleanup', async () => {
  const adminUrl = readTestDatabaseAdminUrl();
  const first = createDatabaseTestScope('bare');
  const second = createDatabaseTestScope('bare');
  let firstName = '';
  let secondName = '';
  try {
    await first.use(async ({ databaseName }) => {
      firstName = databaseName;
      assert.equal(await databaseExists(adminUrl, databaseName), true);
    });
    await second.use(async ({ databaseName }) => {
      secondName = databaseName;
      assert.equal(await databaseExists(adminUrl, databaseName), true);
    });
    assert.notEqual(firstName, secondName);
  } finally {
    await Promise.all([first.dispose(), second.dispose()]);
  }
  assert.equal(await databaseExists(adminUrl, firstName), false);
  assert.equal(await databaseExists(adminUrl, secondName), false);
});

test('bare scopes do not migrate application schema and support deliberate reuse cleanup', async () => {
  const scope = createDatabaseTestScope('bare');
  try {
    let name = '';
    await scope.use(async ({ databaseName, databaseUrl }) => {
      name = databaseName;
      await withClient(databaseUrl, async (client) => {
        assert.equal(
          (
            await client.query<{ table_name: string | null }>(
              "SELECT to_regclass('public.news_scraper_schema_migrations')::text AS table_name",
            )
          ).rows[0]?.table_name,
          null,
        );
        await client.query(
          'CREATE TABLE bare_scope_probe (value text PRIMARY KEY)',
        );
        await client.query("INSERT INTO bare_scope_probe VALUES ('first')");
        await client.query('TRUNCATE bare_scope_probe');
      });
    });
    await scope.use(async ({ databaseName, databaseUrl }) => {
      assert.equal(databaseName, name);
      await withClient(databaseUrl, async (client) => {
        const rows = await client.query<{ count: string }>(
          'SELECT count(*) FROM bare_scope_probe',
        );
        assert.equal(rows.rows[0]?.count, '0');
      });
    });
  } finally {
    await scope.dispose();
  }
});

test('a scope rejects overlapping callbacks', async () => {
  const scope = createDatabaseTestScope('bare');
  const entered = deferred<void>();
  const release = deferred<void>();
  try {
    const first = scope.use(async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    await assert.rejects(
      scope.use(async () => undefined),
      /does not allow overlapping callbacks/u,
    );
    release.resolve();
    await first;
  } finally {
    release.resolve();
    await scope.dispose();
  }
});

test('migrated scopes reset after callback failures once case-owned clients close', async () => {
  const scope = createDatabaseTestScope('migrated');
  const callbackFailure = new Error('synthetic callback failure');
  try {
    await assert.rejects(
      scope.use(async ({ databaseUrl }) => {
        await withClient(databaseUrl, async (client) => {
          await client.query(
            `INSERT INTO publication_settings (name, active_for_collection, public_status)
             VALUES ('Scope failed case', true, 'private')`,
          );
        });
        throw callbackFailure;
      }),
      callbackFailure,
    );
    await scope.use(async ({ databaseUrl }) => {
      await withClient(databaseUrl, async (client) => {
        const rows = await client.query<{ count: string }>(
          'SELECT count(*) FROM publication_settings',
        );
        assert.equal(rows.rows[0]?.count, '0');
      });
    });
  } finally {
    await scope.dispose();
  }
});

test('a leaked transaction makes migrated reset fail within the lock timeout', async () => {
  const scope = createDatabaseTestScope('migrated');
  let leakedClient: Client | undefined;
  let databaseName = '';
  try {
    const startedAt = Date.now();
    await assert.rejects(
      scope.use(async (database) => {
        databaseName = database.databaseName;
        leakedClient = new Client({ connectionString: database.databaseUrl });
        leakedClient.on('error', () => undefined);
        await leakedClient.connect();
        await leakedClient.query('BEGIN');
        await leakedClient.query('LOCK TABLE sources IN ACCESS EXCLUSIVE MODE');
      }),
      /reset timed out waiting for case-owned database locks/u,
    );
    assert.ok(Date.now() - startedAt < 5_000);
  } finally {
    await scope.dispose();
    await leakedClient?.end().catch(() => undefined);
  }
  assert.equal(
    await databaseExists(readTestDatabaseAdminUrl(), databaseName),
    false,
  );
});

async function withClient(
  databaseUrl: string,
  callback: (client: Client) => Promise<void>,
): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await callback(client);
  } finally {
    await client.end().catch(() => undefined);
  }
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
