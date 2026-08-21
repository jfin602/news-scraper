import assert from 'node:assert/strict';
import test from 'node:test';

import { createDatabase } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  createDistributionCredentialAuthenticationRepository,
  createMachineAuthenticator,
} from '../../src/distribution/credentials/machine-authentication.ts';
import {
  issueDistributionCredential,
  listDistributionCredentialMetadata,
  revokeDistributionCredential,
  rotateDistributionCredential,
} from '../../src/distribution/credentials/repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

test('real PostgreSQL credential authentication survives service reconstruction and preserves generic failures', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const issued = await issueDistributionCredential(database, {
        label: 'Database authentication',
      });
      const authenticate = (now = new Date('2027-01-01T00:00:00.000Z')) =>
        createMachineAuthenticator({
          repository:
            createDistributionCredentialAuthenticationRepository(database),
          now: () => now,
        });

      const first = await authenticate().authenticate(`Bearer ${issued.token}`);
      assert.equal(first.outcome, 'authenticated');
      assert.equal(JSON.stringify(first).includes(issued.token), false);

      const reconstructed = await authenticate().authenticate(
        `Bearer ${issued.token}`,
      );
      assert.equal(reconstructed.outcome, 'authenticated');
      const metadata = await listDistributionCredentialMetadata(database);
      assert.equal('verifier' in metadata[0]!, false);
      assert.equal('token' in metadata[0]!, false);

      const unknown = await authenticate().authenticate(
        'Bearer nsd1.lAAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      );
      const wrongSecret = await authenticate().authenticate(
        `Bearer ${issued.token.slice(0, issued.token.lastIndexOf('.') + 1)}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
      );
      assert.deepEqual(unknown, { outcome: 'unauthenticated' });
      assert.deepEqual(wrongSecret, { outcome: 'unauthenticated' });

      const rotation = await database.transaction((transaction) =>
        rotateDistributionCredential(transaction, issued.credential.id, {
          label: 'Database authentication successor',
        }),
      );
      assert.equal(rotation.outcome, 'rotated');
      if (rotation.outcome !== 'rotated') assert.fail('Expected rotation.');
      assert.equal(
        (await authenticate().authenticate(`Bearer ${issued.token}`)).outcome,
        'authenticated',
      );
      assert.equal(
        (
          await authenticate().authenticate(
            `Bearer ${rotation.successor.token}`,
          )
        ).outcome,
        'authenticated',
      );

      await database.transaction((transaction) =>
        revokeDistributionCredential(transaction, issued.credential.id),
      );
      assert.deepEqual(
        await authenticate().authenticate(`Bearer ${issued.token}`),
        { outcome: 'unauthenticated' },
      );
      assert.equal(
        (
          await authenticate().authenticate(
            `Bearer ${rotation.successor.token}`,
          )
        ).outcome,
        'authenticated',
      );

      const expiring = await issueDistributionCredential(database, {
        label: 'Expiring database authentication',
        expiresAt: '2027-01-02T03:04:05.006Z',
      });
      assert.equal(
        (
          await authenticate(new Date('2027-01-02T03:04:05.005Z')).authenticate(
            `Bearer ${expiring.token}`,
          )
        ).outcome,
        'authenticated',
      );
      assert.deepEqual(
        await authenticate(new Date('2027-01-02T03:04:05.006Z')).authenticate(
          `Bearer ${expiring.token}`,
        ),
        { outcome: 'unauthenticated' },
      );
    } finally {
      await database.close();
    }
  });
});
