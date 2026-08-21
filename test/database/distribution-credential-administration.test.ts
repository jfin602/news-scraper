import assert from 'node:assert/strict';
import test from 'node:test';

import { createDistributionCredentialAdministrationService } from '../../src/admin/distribution-credential-administration.ts';
import { createDatabase } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

test('credential administration uses P1 lifecycle authority while retaining one-time secrets outside metadata and audit', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const service =
        createDistributionCredentialAdministrationService(database);
      const created = await service.createCredential({ label: 'Admin sync' });
      assert.match(created.plaintextToken, /^nsd1\./u);
      assert.equal(
        created.credential.lookupId,
        created.plaintextToken.split('.')[1],
      );
      assert.equal('plaintextToken' in created.credential, false);

      const firstList = await service.listCredentials();
      assert.deepEqual(
        firstList.map((item) => item.lookupId),
        [created.credential.lookupId],
      );
      assert.equal(
        JSON.stringify(firstList).includes(created.plaintextToken),
        false,
      );
      assert.equal(JSON.stringify(firstList).match(/verifier|digest/iu), null);

      const rotated = await service.rotateCredential(
        created.credential.lookupId,
        { label: 'Rotated sync' },
      );
      assert.notEqual(rotated.plaintextToken, created.plaintextToken);
      const afterRotation = await service.listCredentials();
      const predecessor = afterRotation.find(
        (item) => item.lookupId === created.credential.lookupId,
      );
      assert.equal(predecessor?.revokedAt, null);
      assert.equal(
        predecessor?.rotationSuccessorLookupId,
        rotated.credential.lookupId,
      );
      assert.equal(
        JSON.stringify(afterRotation).includes(created.plaintextToken),
        false,
      );
      assert.equal(
        JSON.stringify(afterRotation).includes(rotated.plaintextToken),
        false,
      );

      const revoked = await service.revokeCredential(
        created.credential.lookupId,
      );
      assert.notEqual(revoked.revokedAt, null);
      assert.equal('plaintextToken' in revoked, false);
      const audit = await database.query<{ readonly serialized: string }>(
        `SELECT coalesce(jsonb_agg(jsonb_build_object('prior', prior_state, 'next', new_state))::text, '[]') AS serialized
           FROM audit_events WHERE target_type = 'distribution_credential'`,
      );
      const serialized = audit.rows[0]?.serialized ?? '';
      assert.doesNotMatch(serialized, /nsd1|verifier|digest/i);
    } finally {
      await database.close();
    }
  });
});
