import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createDatabase } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  findDistributionCredentialForAuthentication,
  issueDistributionCredential,
  listDistributionCredentialMetadata,
  revokeDistributionCredential,
  rotateDistributionCredential,
} from '../../src/distribution/credentials/repository.ts';
import {
  deriveDistributionCredentialVerifier,
  parseDistributionCredentialToken,
} from '../../src/distribution/credentials/token.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

test('real PostgreSQL persists redacted credential lifecycle and authentication lookup state', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const issued = await database.transaction(async (transaction) => {
        const created = await issueDistributionCredential(transaction, {
          label: '  Distribution sync  ',
          expiresAt: '2027-01-02T03:04:05.006Z',
        });
        await transaction.query(
          `INSERT INTO audit_events (id, action, target_type, target_id, new_state)
           VALUES ($1, 'distribution_credential_issued', 'distribution_credential', $2, $3::jsonb)`,
          [
            randomUUID(),
            created.credential.id,
            JSON.stringify({
              lookupId: created.credential.lookupId,
              label: created.credential.label,
              capability: created.credential.capability,
            }),
          ],
        );
        return created;
      });
      const audit = await database.query<{ readonly count: string }>(
        `SELECT count(*)::text AS count
           FROM audit_events
          WHERE target_type = 'distribution_credential'
            AND target_id = $1`,
        [issued.credential.id],
      );
      assert.equal(audit.rows[0]?.count, '1');
      const parsed = parseDistributionCredentialToken(issued.token);
      assert.ok(parsed !== undefined);
      const authentication = await findDistributionCredentialForAuthentication(
        database,
        parsed.lookupId,
      );
      assert.ok(authentication !== undefined);
      assert.deepEqual(
        authentication.verifier,
        deriveDistributionCredentialVerifier(parsed.secret),
      );
      assert.equal(authentication.capability, 'distribution:read');
      assert.equal(
        authentication.expiresAt?.toISOString(),
        '2027-01-02T03:04:05.006Z',
      );
      assert.equal(authentication.revokedAt, null);

      const metadata = await listDistributionCredentialMetadata(database);
      assert.deepEqual(metadata, [issued.credential]);
      assert.equal('token' in metadata[0]!, false);
      assert.equal('verifier' in metadata[0]!, false);
      const persistence = await database.query<{
        readonly plaintext_present: boolean;
        readonly verifier_length: number;
      }>(
        `SELECT position($1 IN row_to_json(distribution_credentials)::text) > 0 AS plaintext_present,
                octet_length(verifier) AS verifier_length
           FROM distribution_credentials
          WHERE id = $2`,
        [issued.token, issued.credential.id],
      );
      assert.deepEqual(persistence.rows[0], {
        plaintext_present: false,
        verifier_length: 32,
      });

      const revocation = await database.transaction((transaction) =>
        revokeDistributionCredential(transaction, issued.credential.id),
      );
      assert.equal(revocation.outcome, 'revoked');
      const repeated = await database.transaction((transaction) =>
        revokeDistributionCredential(transaction, issued.credential.id),
      );
      assert.equal(repeated.outcome, 'already_revoked');
      const missing = await database.transaction((transaction) =>
        revokeDistributionCredential(
          transaction,
          '00000000-0000-0000-0000-000000000001',
        ),
      );
      assert.deepEqual(missing, { outcome: 'missing' });
      assert.notEqual(
        (
          await findDistributionCredentialForAuthentication(
            database,
            parsed.lookupId,
          )
        )?.revokedAt,
        null,
      );
    } finally {
      await database.close();
    }
  });
});

test('real PostgreSQL enforces credential constraints and supports overlapping rotation without profile relations', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const first = await issueDistributionCredential(database, {
        label: 'First',
      });
      const second = await issueDistributionCredential(database, {
        label: 'Second',
      });
      assert.equal(
        (await listDistributionCredentialMetadata(database)).length,
        2,
      );
      const rotation = await database.transaction((transaction) =>
        rotateDistributionCredential(transaction, first.credential.id, {
          label: 'First successor',
        }),
      );
      assert.equal(rotation.outcome, 'rotated');
      if (rotation.outcome !== 'rotated') assert.fail('Expected rotation.');
      assert.notEqual(rotation.successor.credential.id, first.credential.id);
      assert.notEqual(rotation.successor.token, first.token);
      assert.equal(rotation.predecessor.revokedAt, null);
      assert.equal(
        rotation.predecessor.rotationSuccessorId,
        rotation.successor.credential.id,
      );
      const predecessorAuth = await findDistributionCredentialForAuthentication(
        database,
        first.credential.lookupId,
      );
      assert.notEqual(predecessorAuth, undefined);
      assert.equal(predecessorAuth?.revokedAt, null);
      const repeated = await database.transaction((transaction) =>
        rotateDistributionCredential(transaction, first.credential.id, {
          label: 'Unexpected successor',
        }),
      );
      assert.equal(repeated.outcome, 'already_rotated');

      await assert.rejects(
        database.query(
          `INSERT INTO distribution_credentials (id, lookup_id, verifier, label, capability)
           VALUES ('00000000-0000-0000-0000-000000000010', $1, decode(repeat('00', 32), 'hex'), 'Bad capability', 'admin')`,
          [second.credential.lookupId],
        ),
      );
      await assert.rejects(
        database.query(
          `UPDATE distribution_credentials
              SET lookup_id = 'lBBBBBBBBBBBBBBBBBBBBBB'
            WHERE id = $1`,
          [second.credential.id],
        ),
      );
      await assert.rejects(
        database.query(
          `INSERT INTO distribution_credentials (id, lookup_id, verifier, label, capability)
           VALUES ('00000000-0000-0000-0000-000000000011', 'lAAAAAAAAAAAAAAAAAAAAAA', decode(repeat('00', 31), 'hex'), 'Bad verifier', 'distribution:read')`,
        ),
      );
      const relationCount = await database.query<{ readonly count: string }>(
        `SELECT count(*)::text AS count
           FROM information_schema.table_constraints
          WHERE table_schema = 'public'
            AND table_name = 'distribution_credentials'
            AND constraint_type = 'FOREIGN KEY'`,
      );
      assert.equal(relationCount.rows[0]?.count, '1');
    } finally {
      await database.close();
    }
  });
});
