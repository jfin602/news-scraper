import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { Client } from 'pg';
import type { QueryResultRow } from 'pg';

import { createDatabase } from '../../src/database/database.ts';
import type { Database, QueryExecutor } from '../../src/database/database.ts';
import { createDistributionProfileSnapshotService } from '../../src/distribution/profile-snapshot.ts';
import {
  createDistributionProfile,
  replaceDistributionProfileSourceAssociation,
} from '../../src/distribution/profiles/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const scope = createDatabaseTestScope('migrated');
after(async () => scope.dispose());

test('Profile snapshots distinguish lifecycle outcomes and apply bounded canonical filtering before the result limit', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await publication(client, 'Private publication', 'private', false);
      const source = await seedSource(client, 'alpha', 'paused');
      await article(
        client,
        source,
        'Newest unmatched',
        '2026-08-04T00:00:00.000002Z',
      );
      const matching = await article(
        client,
        source,
        'BOOKS [a] 100% \\ title',
        '2026-08-03T00:00:00.000001Z',
        'AUTHOR',
        'A summary',
      );
      await article(
        client,
        source,
        'Excluded books',
        '2026-08-02T00:00:00.000001Z',
        null,
        'rumor',
      );
      const draft = await createDistributionProfile(database, {
        configKey: 'draft',
        displayName: 'Draft',
        lifecycle: 'draft',
        resultLimit: 1,
      });
      const disabled = await createDistributionProfile(database, {
        configKey: 'disabled',
        displayName: 'Disabled',
        lifecycle: 'disabled',
        resultLimit: 1,
      });
      const active = await createDistributionProfile(database, {
        configKey: 'active',
        displayName: 'Active',
        lifecycle: 'active',
        resultLimit: 1,
      });
      await database.transaction(async (transaction) => {
        await replaceDistributionProfileSourceAssociation(
          transaction,
          active.configKey,
          'alpha',
          {
            includeAnyPhrases: ['books [a] 100% \\'],
            excludeAnyPhrases: ['rumor'],
            categoryConfigKeys: [],
          },
        );
      });
      const service = createDistributionProfileSnapshotService(database);
      assert.deepEqual(await service.read('missing'), { kind: 'not_found' });
      assert.equal((await service.read(draft.configKey)).kind, 'draft');
      assert.equal((await service.read(disabled.configKey)).kind, 'disabled');
      const outcome = await service.read(active.configKey);
      assert.equal(outcome.kind, 'active');
      if (outcome.kind !== 'active') throw new Error();
      assert.equal(outcome.snapshot.publication.name, 'Private publication');
      assert.deepEqual(
        outcome.snapshot.articles.map((item) => item.articleId),
        [matching],
      );
      assert.equal(outcome.snapshot.articles[0]?.source.configKey, 'alpha');
      assert.equal(
        outcome.snapshot.internal.orderPositions[0]?.effectiveFeedDate,
        '2026-08-03T00:00:00.000001Z',
      );
    } finally {
      await Promise.all([database.close(), client.end()]);
    }
  });
});

test('Profile snapshot unions associated Sources in canonical order and respects effective Category overrides', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await publication(client, 'Publication', 'public', true);
      const alpha = await seedSource(client, 'alpha', 'disabled');
      const beta = await seedSource(client, 'beta', 'enabled');
      const categoryId = randomUUID();
      await client.query(
        'INSERT INTO categories (id, config_key, display_name) VALUES ($1, $2, $3)',
        [categoryId, 'books', 'Books'],
      );
      const alphaArticle = await article(
        client,
        alpha,
        'Alpha',
        '2026-08-01T00:00:00.000001Z',
      );
      const betaArticle = await article(
        client,
        beta,
        'Beta',
        '2026-08-02T00:00:00.000002Z',
      );
      await client.query(
        'INSERT INTO article_categories (article_id, category_id) VALUES ($1, $2)',
        [alphaArticle, categoryId],
      );
      const profile = await createDistributionProfile(database, {
        configKey: 'active',
        displayName: 'Active',
        lifecycle: 'active',
        resultLimit: 2,
      });
      await database.transaction(async (transaction) => {
        await replaceDistributionProfileSourceAssociation(
          transaction,
          profile.configKey,
          'alpha',
          { categoryConfigKeys: ['books'] },
        );
        await replaceDistributionProfileSourceAssociation(
          transaction,
          profile.configKey,
          'beta',
          {},
        );
      });
      const outcome =
        await createDistributionProfileSnapshotService(database).read('active');
      assert.equal(outcome.kind, 'active');
      if (outcome.kind !== 'active') throw new Error();
      assert.deepEqual(
        outcome.snapshot.articles.map((item) => item.articleId),
        [betaArticle, alphaArticle],
      );
      assert.deepEqual(outcome.snapshot.articles[1]?.categories, [
        { configKey: 'books', displayName: 'Books' },
      ]);
    } finally {
      await Promise.all([database.close(), client.end()]);
    }
  });
});

test('Profile snapshot is a coherent repeatable-read view across profile, publication, and Articles', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await publication(client, 'Before', 'private', false);
      const source = await seedSource(client, 'alpha', 'enabled');
      const before = await article(
        client,
        source,
        'Before',
        '2026-08-01T00:00:00.000001Z',
      );
      await createDistributionProfile(database, {
        configKey: 'active',
        displayName: 'Before profile',
        lifecycle: 'active',
        resultLimit: 2,
      });
      await database.transaction((transaction) =>
        replaceDistributionProfileSourceAssociation(
          transaction,
          'active',
          'alpha',
          {},
        ),
      );
      const aggregateRead = deferred<void>();
      const releaseRead = deferred<void>();
      const coordinated = checkpointDatabase(database, async (text) => {
        if (text.includes('distribution_profile_source_categories')) {
          aggregateRead.resolve();
          await releaseRead.promise;
        }
      });
      const reading =
        createDistributionProfileSnapshotService(coordinated).read('active');
      await aggregateRead.promise;
      await database.query("UPDATE publication_settings SET name = 'After'");
      await database.query(
        "UPDATE distribution_profiles SET display_name = 'After profile' WHERE config_key = 'active'",
      );
      await article(client, source, 'After', '2026-08-02T00:00:00.000001Z');
      releaseRead.resolve();
      const outcome = await reading;
      assert.equal(outcome.kind, 'active');
      if (outcome.kind !== 'active') throw new Error();
      assert.equal(outcome.snapshot.publication.name, 'Before');
      assert.equal(outcome.snapshot.profile.displayName, 'Before profile');
      assert.deepEqual(
        outcome.snapshot.articles.map((item) => item.articleId),
        [before],
      );
    } finally {
      await Promise.all([database.close(), client.end()]);
    }
  });
});

function checkpointDatabase(
  database: Database,
  checkpoint: (text: string) => Promise<void>,
): Database {
  return {
    query: database.query.bind(database),
    ping: database.ping.bind(database),
    close: database.close.bind(database),
    withSession: database.withSession.bind(database),
    transaction: database.transaction.bind(database),
    readOnlyRepeatableReadTransaction: async <T>(
      work: (transaction: QueryExecutor) => Promise<T>,
    ) =>
      database.readOnlyRepeatableReadTransaction!(async (transaction) =>
        work({
          query: async <Row extends QueryResultRow = QueryResultRow>(
            text: string,
            values?: readonly unknown[],
          ) => {
            const result = await transaction.query<Row>(text, values);
            await checkpoint(text);
            return result;
          },
        }),
      ),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function publication(
  client: Client,
  name: string,
  publicStatus: string,
  active: boolean,
) {
  await client.query(
    'INSERT INTO publication_settings (name, active_for_collection, public_status) VALUES ($1, $2, $3)',
    [name, active, publicStatus],
  );
}
async function seedSource(client: Client, key: string, operational: string) {
  const id = randomUUID();
  await client.query(
    "INSERT INTO sources (id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state) VALUES ($1, $2, $3, $4, 'approved', 'active', $5)",
    [id, key, `${key} source`, `https://${key}.example`, operational],
  );
  return id;
}
async function article(
  client: Client,
  sourceId: string,
  title: string,
  firstSeen: string,
  author: string | null = null,
  summary: string | null = null,
) {
  const id = randomUUID();
  await client.query(
    "INSERT INTO articles (id, source_id, original_url, canonical_identity_url, display_title, normalized_title, author, summary, published_at_status, source_updated_at_status, first_seen_at, last_seen_at, visibility_state) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'missing','missing',$9,$9,'visible')",
    [
      id,
      sourceId,
      `https://reader.example/${id}`,
      `https://identity.example/${id}`,
      title,
      'hidden normalized title',
      author,
      summary,
      firstSeen,
    ],
  );
  return id;
}
