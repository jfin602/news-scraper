import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDatabase } from '../../src/database/database.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

test('transactions commit, roll back, propagate failures, and release clients', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await database.query(
        'CREATE TABLE transaction_value (value text PRIMARY KEY)',
      );

      const committed = await database.transaction(async (transaction) => {
        await transaction.query(
          'INSERT INTO transaction_value (value) VALUES ($1)',
          ['committed'],
        );
        return 'result';
      });
      assert.equal(committed, 'result');

      const callbackFailure = new Error('synthetic callback failure');
      await assert.rejects(
        database.transaction(async (transaction) => {
          await transaction.query(
            'INSERT INTO transaction_value (value) VALUES ($1)',
            ['rolled-back'],
          );
          throw callbackFailure;
        }),
        callbackFailure,
      );

      const result = await database.query<{ value: string }>(
        'SELECT value FROM transaction_value ORDER BY value',
      );
      assert.deepEqual(result.rows, [{ value: 'committed' }]);

      // A pool with its default finite size can acquire again only if both paths released.
      await database.transaction(async (transaction) => {
        const probe = await transaction.query<{ value: number }>(
          'SELECT 1 AS value',
        );
        assert.equal(probe.rows[0]?.value, 1);
      });
    } finally {
      await database.close();
    }
  });
});
