import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { Client } from 'pg';

import { createWebApp } from '../../src/app/web/create-app.ts';
import { createDistributionApiRuntime } from '../../src/app/web/distribution-api-runtime.ts';
import { startWebServer } from '../../src/app/web/server.ts';
import { createDatabase } from '../../src/database/database.ts';
import {
  issueDistributionCredential,
  revokeDistributionCredential,
} from '../../src/distribution/credentials/repository.ts';
import {
  createDistributionProfile,
  replaceDistributionProfileSourceAssociation,
} from '../../src/distribution/profiles/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const scope = createDatabaseTestScope('migrated');
after(async () => scope.dispose());

test('the process-lifetime distribution runtime authenticates persisted credentials and preserves Profile paging semantics', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    const client = new Client({ connectionString: databaseUrl });
    let server: Awaited<ReturnType<typeof startWebServer>> | undefined;
    try {
      await client.connect();
      const seeded = await seedProfile(client, database);
      const issued = await issueDistributionCredential(database, {
        label: 'HTTP traversal',
      });
      const telemetry: object[] = [];
      const runtime = createDistributionApiRuntime(
        database,
        { trustedProxy: 'none', distributionTransport: 'local_http' },
        { telemetry: (event) => telemetry.push(event) },
      );
      server = await startWebServer(
        createWebApp(
          {
            readiness: { checkReady: async () => true },
            publicFeed: { read: async () => undefined },
          },
          { distributionApiRouter: runtime.router },
        ),
        { host: '127.0.0.1', port: 0 },
      );
      const baseUrl = `http://${server.host}:${String(server.port)}`;
      const first = await distributionRequest(baseUrl, 'books', issued.token);
      assert.equal(first.status, 200);
      const firstBody = await first.json();
      assert.equal(firstBody.profile.configKey, 'books');
      assert.equal(firstBody.publication.name, 'Private publication');
      assert.equal(firstBody.items.length, 100);
      assert.equal(firstBody.items[0].articleId, seeded.articleIds[0]);
      assert.equal(firstBody.items[0].headline, 'Moderated headline');
      assert.equal(firstBody.items[0].originalUrl, seeded.exactOriginalUrl);
      assert.deepEqual(firstBody.items[0].categories, [
        { configKey: 'books', displayName: 'Books' },
      ]);
      assert.equal(firstBody.items[0].feedDateSource, 'published_at');
      assert.equal(firstBody.nextCursor === null, false);
      assert.equal(first.headers.get('access-control-allow-origin'), null);

      const unchanged = await distributionRequest(
        baseUrl,
        'books',
        issued.token,
        { 'If-None-Match': first.headers.get('etag')! },
      );
      assert.equal(unchanged.status, 304);

      const second = await distributionRequest(
        baseUrl,
        `books?cursor=${encodeURIComponent(firstBody.nextCursor)}`,
        issued.token,
      );
      assert.equal(second.status, 200);
      const secondBody = await second.json();
      assert.equal(secondBody.snapshotRevision, firstBody.snapshotRevision);
      assert.deepEqual(
        secondBody.items.map((item: { articleId: string }) => item.articleId),
        [seeded.articleIds[100]],
      );
      assert.equal(secondBody.nextCursor, null);

      const fresh = await distributionRequest(baseUrl, 'books', issued.token);
      const freshBody = await fresh.json();
      await client.query(
        "UPDATE articles SET author = 'revision change' WHERE id = $1",
        [seeded.articleIds[100]],
      );
      const changed = await distributionRequest(
        baseUrl,
        `books?cursor=${encodeURIComponent(freshBody.nextCursor)}`,
        issued.token,
      );
      assert.equal(changed.status, 409);
      assert.deepEqual(await changed.json(), { error: 'snapshot_changed' });

      await client.query(
        "UPDATE distribution_profiles SET lifecycle = 'disabled' WHERE config_key = 'books'",
      );
      const disabled = await distributionRequest(
        baseUrl,
        'books',
        issued.token,
      );
      assert.equal(disabled.status, 409);
      assert.deepEqual(await disabled.json(), { error: 'profile_disabled' });
      const draft = await distributionRequest(baseUrl, 'draft', issued.token);
      assert.equal(draft.status, 404);
      const missing = await distributionRequest(
        baseUrl,
        'missing',
        issued.token,
      );
      assert.equal(missing.status, 404);

      assert.equal(JSON.stringify(telemetry).includes(issued.token), false);
      assert.equal(JSON.stringify(telemetry).includes('Authorization'), false);
      assert.equal(
        JSON.stringify(telemetry).includes(seeded.exactOriginalUrl),
        false,
      );
      assert.equal(
        telemetry.some((event) =>
          JSON.stringify(event).includes(issued.credential.id),
        ),
        true,
      );
    } finally {
      await server?.close();
      await Promise.all([database.close(), client.end()]);
    }
  });
});

test('the long-lived runtime isolates valid credential quotas and maps credential lifecycle and database failures generically', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    const client = new Client({ connectionString: databaseUrl });
    let server: Awaited<ReturnType<typeof startWebServer>> | undefined;
    let closed = false;
    try {
      await client.connect();
      await seedProfile(client, database);
      const first = await issueDistributionCredential(database, {
        label: 'One',
      });
      const second = await issueDistributionCredential(database, {
        label: 'Two',
      });
      const expired = await issueDistributionCredential(database, {
        label: 'Expired',
        expiresAt: '2020-01-01T00:00:00.000Z',
      });
      const runtime = createDistributionApiRuntime(
        database,
        { trustedProxy: 'none', distributionTransport: 'local_http' },
        {
          requestGuardPolicy: {
            authenticated: {
              maximumRequests: 1,
              windowMilliseconds: 60_000,
              maximumEntries: 10,
            },
            invalidAuthentication: {
              maximumRequests: 5,
              windowMilliseconds: 60_000,
              maximumEntries: 10,
            },
          },
        },
      );
      server = await startWebServer(
        createWebApp(
          {
            readiness: { checkReady: async () => true },
            publicFeed: { read: async () => undefined },
          },
          { distributionApiRouter: runtime.router },
        ),
        { host: '127.0.0.1', port: 0 },
      );
      const baseUrl = `http://${server.host}:${String(server.port)}`;
      assert.equal(
        (await distributionRequest(baseUrl, 'books', first.token)).status,
        200,
      );
      assert.equal(
        (await distributionRequest(baseUrl, 'books', second.token)).status,
        200,
      );
      const exhausted = await distributionRequest(
        baseUrl,
        'books',
        first.token,
      );
      assert.equal(exhausted.status, 429);
      assert.equal(exhausted.headers.get('retry-after'), '60');

      await database.transaction((transaction) =>
        revokeDistributionCredential(transaction, second.credential.id),
      );
      const revoked = await distributionRequest(baseUrl, 'books', second.token);
      const expiredResponse = await distributionRequest(
        baseUrl,
        'books',
        expired.token,
      );
      assert.equal(revoked.status, 401);
      assert.equal(expiredResponse.status, 401);
      assert.deepEqual(await revoked.json(), { error: 'unauthenticated' });
      assert.deepEqual(await expiredResponse.json(), {
        error: 'unauthenticated',
      });

      await database.close();
      closed = true;
      const dependencyFailure = await distributionRequest(
        baseUrl,
        'books',
        'nsd1.lAAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      );
      const body = await dependencyFailure.text();
      assert.equal(dependencyFailure.status, 503);
      assert.deepEqual(JSON.parse(body), { error: 'service_unavailable' });
      assert.doesNotMatch(body, /postgres|connection|database/i);
    } finally {
      await server?.close();
      await Promise.all([
        closed ? Promise.resolve() : database.close(),
        client.end(),
      ]);
    }
  });
});

async function seedProfile(
  client: Client,
  database: ReturnType<typeof createDatabase>,
) {
  await client.query(
    "INSERT INTO publication_settings (name, active_for_collection, public_status) VALUES ('Private publication', true, 'private')",
  );
  const sourceId = randomUUID();
  await client.query(
    "INSERT INTO sources (id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state) VALUES ($1, 'alpha', 'Alpha', 'https://alpha.example', 'approved', 'active', 'paused')",
    [sourceId],
  );
  const categoryId = randomUUID();
  await client.query(
    "INSERT INTO categories (id, config_key, display_name) VALUES ($1, 'books', 'Books')",
    [categoryId],
  );
  const articleIds: string[] = [];
  let exactOriginalUrl = '';
  for (let index = 0; index < 101; index += 1) {
    const id = randomUUID();
    articleIds.push(id);
    const originalUrl =
      index === 0
        ? 'https://publisher.example/article?preserve=exact'
        : `https://publisher.example/${String(index)}`;
    if (index === 0) exactOriginalUrl = originalUrl;
    await client.query(
      "INSERT INTO articles (id, source_id, original_url, canonical_identity_url, display_title, display_title_override, normalized_title, published_at, published_at_status, source_updated_at_status, first_seen_at, last_seen_at, visibility_state) VALUES ($1,$2,$3,$4,$5,$6,$5,$7,'parsed','missing',$7,$7,'visible')",
      [
        id,
        sourceId,
        originalUrl,
        `https://identity.example/${id}`,
        `Headline ${String(index)}`,
        index === 0 ? 'Moderated headline' : null,
        `2026-08-12T10:10:09.${String(101 - index).padStart(6, '0')}Z`,
      ],
    );
  }
  await client.query(
    'INSERT INTO article_categories (article_id, category_id) VALUES ($1, $2)',
    [articleIds[0], categoryId],
  );
  const profile = await createDistributionProfile(database, {
    configKey: 'books',
    displayName: 'Books',
    lifecycle: 'active',
    resultLimit: 101,
  });
  await createDistributionProfile(database, {
    configKey: 'draft',
    displayName: 'Draft',
    lifecycle: 'draft',
    resultLimit: 1,
  });
  await database.transaction((transaction) =>
    replaceDistributionProfileSourceAssociation(
      transaction,
      profile.configKey,
      'alpha',
      {},
    ),
  );
  return { articleIds, exactOriginalUrl };
}

function distributionRequest(
  baseUrl: string,
  profilePath: string,
  token: string,
  headers: HeadersInit = {},
): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/distribution/${profilePath}`, {
    headers: { Authorization: `Bearer ${token}`, ...headers },
  });
}
