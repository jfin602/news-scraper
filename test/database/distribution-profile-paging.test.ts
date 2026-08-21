import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { Client } from 'pg';

import { createDatabase } from '../../src/database/database.ts';
import { createDistributionProfilePageService } from '../../src/distribution/profile-page.ts';
import {
  createDistributionProfile,
  replaceDistributionProfileSourceAssociation,
} from '../../src/distribution/profiles/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const scope = createDatabaseTestScope('migrated');
after(async () => scope.dispose());

test('distribution paging is bounded, keyset-based, microsecond-safe, and revision-bound', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await client.query(
        'INSERT INTO publication_settings (name, active_for_collection, public_status) VALUES ($1, true, $2)',
        ['Before publication', 'private'],
      );
      const sourceId = '12345678-1234-4234-8234-000000000001';
      await client.query(
        "INSERT INTO sources (id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state) VALUES ($1, 'alpha', 'Alpha source', 'https://alpha.example', 'approved', 'active', 'enabled')",
        [sourceId],
      );
      const articleIds: string[] = [];
      for (let index = 0; index < 101; index += 1) {
        const id = `12345678-1234-4234-8234-${(index + 2).toString(16).padStart(12, '0')}`;
        articleIds.push(id);
        await client.query(
          "INSERT INTO articles (id, source_id, original_url, canonical_identity_url, display_title, normalized_title, published_at_status, source_updated_at_status, first_seen_at, last_seen_at, visibility_state) VALUES ($1, $2, $3, $4, $5, $5, 'missing', 'missing', $6, $6, 'visible')",
          [
            id,
            sourceId,
            `https://reader.example/${id}`,
            `https://identity.example/${id}`,
            `Headline ${index}`,
            `2026-08-12T10:10:09.${String(101 - index).padStart(6, '0')}Z`,
          ],
        );
      }
      const profile = await createDistributionProfile(database, {
        configKey: 'books',
        displayName: 'Books',
        lifecycle: 'active',
        resultLimit: 101,
      });
      await database.transaction((transaction) =>
        replaceDistributionProfileSourceAssociation(
          transaction,
          profile.configKey,
          'alpha',
          {},
        ),
      );

      const service = createDistributionProfilePageService(database);
      const first = await service.read('books');
      assert.equal(first.kind, 'active');
      if (first.kind !== 'active' || first.nextCursor === null)
        throw new Error();
      assert.equal(first.items.length, 100);
      assert.equal(first.items[0]?.articleId, articleIds[0]);
      assert.equal(first.items[99]?.articleId, articleIds[99]);
      assert.equal(
        first.items[99]?.effectiveFeedDate.toISOString(),
        '2026-08-12T10:10:09.000Z',
      );

      await client.query(
        "UPDATE publication_settings SET public_status = 'public'",
      );
      await client.query(
        "UPDATE sources SET operational_state = 'paused' WHERE id = $1",
        [sourceId],
      );
      const unchanged = await service.read('books', first.nextCursor);
      assert.equal(unchanged.kind, 'active');
      if (unchanged.kind !== 'active') throw new Error();
      assert.equal(unchanged.items.length, 1);
      assert.equal(unchanged.items[0]?.articleId, articleIds[100]);
      assert.equal(unchanged.nextCursor, null);
      assert.equal(unchanged.snapshotRevision, first.snapshotRevision);

      const freshFirst = await service.read('books');
      assert.equal(freshFirst.kind, 'active');
      if (freshFirst.kind !== 'active' || freshFirst.nextCursor === null)
        throw new Error();
      await client.query(
        "UPDATE articles SET author = 'Changed author' WHERE id = $1",
        [articleIds[100]],
      );
      assert.deepEqual(await service.read('books', freshFirst.nextCursor), {
        kind: 'snapshot_changed',
      });
    } finally {
      await Promise.all([database.close(), client.end()]);
    }
  });
});
