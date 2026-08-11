import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { Client } from 'pg';

import { migrateDatabase } from '../../src/database/migrations.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

interface Fixture {
  sourceOne: string;
  sourceTwo: string;
  sourceThree: string;
  endpointOne: string;
  endpointTwo: string;
  endpointThree: string;
  runOne: string;
  runTwo: string;
  runThree: string;
}

test('article schema stores valid Article and terminal observation provenance', async () => {
  await withArticleDatabase(async (client, fixture) => {
    const articleId = await insertArticle(client, fixture, {
      externalId: 'publisher-item-1',
      canonicalUrl: 'https://publisher.example/articles/one',
    });
    await insertObservation(client, fixture, {
      articleId,
      outcome: 'created',
      observedExternalId: 'publisher-item-1',
    });
    for (const outcome of ['rejected', 'excluded', 'failed']) {
      await insertObservation(client, fixture, { outcome });
    }
    const counts = await client.query<{
      articles: string;
      observations: string;
    }>(
      `SELECT (SELECT count(*) FROM articles) AS articles,
              (SELECT count(*) FROM article_observations) AS observations`,
    );
    assert.deepEqual(counts.rows, [{ articles: '1', observations: '4' }]);
  });
});

test('article visibility accepts only canonical states', async () => {
  await withArticleDatabase(async (client, fixture) => {
    const articleIds: string[] = [];
    for (const visibilityState of ['visible', 'hidden', 'archived']) {
      const articleId = await insertArticle(client, fixture);
      await client.query(
        'UPDATE articles SET visibility_state = $2 WHERE id = $1',
        [articleId, visibilityState],
      );
      articleIds.push(articleId);
    }
    const states = await client.query<{ visibility_state: string }>(
      `SELECT visibility_state
       FROM articles
       WHERE id = ANY($1::uuid[])
       ORDER BY visibility_state`,
      [articleIds],
    );
    assert.deepEqual(states.rows, [
      { visibility_state: 'archived' },
      { visibility_state: 'hidden' },
      { visibility_state: 'visible' },
    ]);
    await rejects(() =>
      client.query(
        "UPDATE articles SET visibility_state = 'unsupported' WHERE id = $1",
        [articleIds[0]],
      ),
    );
  });
});

test('article metadata shape and length constraints remain database-enforced', async () => {
  await withArticleDatabase(async (client, fixture) => {
    const articleId = await insertArticle(client, fixture);
    const maximumValues = {
      external_id: 'e'.repeat(2_048),
      original_url: 'o'.repeat(8_192),
      canonical_identity_url: 'c'.repeat(8_192),
      display_title: 'd'.repeat(2_048),
      normalized_title: 'n'.repeat(2_048),
      author: 'a'.repeat(1_024),
      summary: 's'.repeat(32_768),
      image_url: 'i'.repeat(8_192),
      language: 'l'.repeat(128),
    } as const;

    await client.query(
      `UPDATE articles
       SET external_id = $2,
           original_url = $3,
           canonical_identity_url = $4,
           display_title = $5,
           normalized_title = $6,
           author = $7,
           summary = $8,
           image_url = $9,
           language = $10
       WHERE id = $1`,
      [articleId, ...Object.values(maximumValues)],
    );
    const lengths = await client.query<Record<string, number>>(
      `SELECT char_length(external_id) AS external_id,
              char_length(original_url) AS original_url,
              char_length(canonical_identity_url) AS canonical_identity_url,
              char_length(display_title) AS display_title,
              char_length(normalized_title) AS normalized_title,
              char_length(author) AS author,
              char_length(summary) AS summary,
              char_length(image_url) AS image_url,
              char_length(language) AS language
       FROM articles
       WHERE id = $1`,
      [articleId],
    );
    assert.deepEqual(lengths.rows, [
      Object.fromEntries(
        Object.entries(maximumValues).map(([column, value]) => [
          column,
          value.length,
        ]),
      ),
    ]);

    const constraints = [
      ['external_id', 2_048],
      ['original_url', 8_192],
      ['canonical_identity_url', 8_192],
      ['display_title', 2_048],
      ['normalized_title', 2_048],
      ['author', 1_024],
      ['summary', 32_768],
      ['image_url', 8_192],
      ['language', 128],
    ] as const;
    for (const [column, maximumLength] of constraints) {
      await rejects(() =>
        client.query(`UPDATE articles SET ${column} = $2 WHERE id = $1`, [
          articleId,
          'x'.repeat(maximumLength + 1),
        ]),
      );
      await rejects(() =>
        client.query(`UPDATE articles SET ${column} = $2 WHERE id = $1`, [
          articleId,
          ' not-trimmed ',
        ]),
      );
    }
  });
});

test('article and observation ownership constraints reject false provenance', async () => {
  await withArticleDatabase(async (client, fixture) => {
    await rejects(() =>
      insertArticle(client, fixture, {
        sourceId: randomUUID(),
      }),
    );
    const articleId = await insertArticle(client, fixture);
    await rejects(() =>
      insertObservation(client, fixture, {
        articleId,
        outcome: 'unsupported',
      }),
    );
    for (const outcome of ['created', 'updated', 'unchanged']) {
      await rejects(() => insertObservation(client, fixture, { outcome }));
    }
    await rejects(() =>
      insertObservation(client, fixture, {
        articleId,
        outcome: 'created',
        endpointId: fixture.endpointTwo,
        runId: fixture.runOne,
      }),
    );
    await rejects(() =>
      insertObservation(client, fixture, {
        articleId,
        outcome: 'created',
        endpointId: fixture.endpointThree,
        runId: fixture.runThree,
      }),
    );
    const otherArticle = await insertArticle(client, fixture, {
      sourceId: fixture.sourceThree,
      externalId: 'other',
      canonicalUrl: 'https://other.example/article',
    });
    await rejects(() =>
      insertObservation(client, fixture, {
        articleId: otherArticle,
        outcome: 'created',
      }),
    );
  });
});

test('digest indexes enforce strong and fallback identity without indexing long text', async () => {
  await withArticleDatabase(async (client, fixture) => {
    const sharedUrl = 'https://publisher.example/articles/shared';
    await insertArticle(client, fixture, {
      externalId: 'strong-one',
      canonicalUrl: sharedUrl,
    });
    await insertArticle(client, fixture, {
      externalId: 'strong-two',
      canonicalUrl: sharedUrl,
    });
    await rejects(() =>
      insertArticle(client, fixture, {
        externalId: 'strong-one',
        canonicalUrl: 'https://publisher.example/articles/changed',
      }),
    );
    await insertArticle(client, fixture, {
      sourceId: fixture.sourceTwo,
      externalId: 'strong-one',
      canonicalUrl: 'https://publisher.example/articles/source-two',
    });
    await insertArticle(client, fixture, { canonicalUrl: sharedUrl });
    await rejects(() =>
      insertArticle(client, fixture, { canonicalUrl: sharedUrl }),
    );

    const externalId = `external-${'x'.repeat(2039)}`;
    const canonicalUrl = `https://publisher.example/${'y'.repeat(8166)}`;
    await insertArticle(client, fixture, { externalId, canonicalUrl });
    const lookup = await client.query<{ external_id: string | null }>(
      `SELECT external_id FROM articles
       WHERE canonical_identity_digest = sha256($1::text::bytea)
       ORDER BY external_id NULLS FIRST`,
      [sharedUrl],
    );
    assert.deepEqual(lookup.rows, [
      { external_id: null },
      { external_id: 'strong-one' },
      { external_id: 'strong-two' },
    ]);
  });
});

test('article checks reject contradictory dates, observation order, and destructive provenance changes', async () => {
  await withArticleDatabase(async (client, fixture) => {
    await rejects(() =>
      insertArticle(client, fixture, { publishedStatus: 'parsed' }),
    );
    await rejects(() =>
      insertArticle(client, fixture, {
        publishedStatus: 'missing',
        publishedAt: '2026-08-09T00:00:00Z',
      }),
    );
    await rejects(() =>
      insertArticle(client, fixture, {
        updatedStatus: 'parsed',
      }),
    );
    await rejects(() =>
      insertArticle(client, fixture, {
        firstSeenAt: '2026-08-10T01:00:00Z',
        lastSeenAt: '2026-08-10T00:00:00Z',
      }),
    );
    const articleId = await insertArticle(client, fixture);
    await insertObservation(client, fixture, {
      articleId,
      outcome: 'unchanged',
    });
    await rejects(() =>
      client.query('DELETE FROM collection_runs WHERE id = $1', [
        fixture.runOne,
      ]),
    );
    await rejects(() =>
      client.query('UPDATE source_endpoints SET source_id = $1 WHERE id = $2', [
        fixture.sourceTwo,
        fixture.endpointOne,
      ]),
    );
    await rejects(() =>
      client.query('DELETE FROM articles WHERE id = $1', [articleId]),
    );
  });
});

async function withArticleDatabase(
  callback: (client: Client, fixture: Fixture) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      const fixture = await createFixture(client);
      await callback(client, fixture);
    } finally {
      await client.end();
    }
  });
}

async function createFixture(client: Client): Promise<Fixture> {
  const fixture: Fixture = {
    sourceOne: randomUUID(),
    sourceTwo: randomUUID(),
    sourceThree: randomUUID(),
    endpointOne: randomUUID(),
    endpointTwo: randomUUID(),
    endpointThree: randomUUID(),
    runOne: randomUUID(),
    runTwo: randomUUID(),
    runThree: randomUUID(),
  };
  await client.query(
    `INSERT INTO sources (id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state)
     VALUES ($1, 'source_one', 'Source One', 'https://one.example', 'approved', 'active', 'enabled'),
            ($2, 'source_two', 'Source Two', 'https://two.example', 'approved', 'active', 'enabled'),
            ($3, 'source_three', 'Source Three', 'https://three.example', 'approved', 'active', 'enabled')`,
    [fixture.sourceOne, fixture.sourceTwo, fixture.sourceThree],
  );
  await client.query(
    `INSERT INTO source_endpoints (id, source_id, config_key, endpoint_url, endpoint_type, approval_state, lifecycle_state, operational_state, poll_interval_seconds)
     VALUES ($1, $4, 'feed_one', 'https://one.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300),
            ($2, $5, 'feed_two', 'https://two.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300),
            ($3, $6, 'feed_three', 'https://three.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300)`,
    [
      fixture.endpointOne,
      fixture.endpointTwo,
      fixture.endpointThree,
      fixture.sourceOne,
      fixture.sourceTwo,
      fixture.sourceThree,
    ],
  );
  await client.query(
    `INSERT INTO collection_runs (id, source_endpoint_id, execution_id, started_at, finished_at, run_status, transport_status, parser_status)
     VALUES ($1, $4, 'run-one', now(), now(), 'succeeded', 'not_modified', 'not_run'),
            ($2, $5, 'run-two', now(), now(), 'succeeded', 'not_modified', 'not_run'),
            ($3, $6, 'run-three', now(), now(), 'succeeded', 'not_modified', 'not_run')`,
    [
      fixture.runOne,
      fixture.runTwo,
      fixture.runThree,
      fixture.endpointOne,
      fixture.endpointTwo,
      fixture.endpointThree,
    ],
  );
  return fixture;
}

async function insertArticle(
  client: Client,
  fixture: Fixture,
  overrides: {
    sourceId?: string;
    externalId?: string;
    canonicalUrl?: string;
    publishedStatus?: string;
    publishedAt?: string;
    updatedStatus?: string;
    updatedAt?: string;
    firstSeenAt?: string;
    lastSeenAt?: string;
  } = {},
): Promise<string> {
  const id = randomUUID();
  const canonicalUrl = overrides.canonicalUrl ?? `https://one.example/${id}`;
  await client.query(
    `INSERT INTO articles (
       id, source_id, external_id, original_url,
       canonical_identity_url, display_title, normalized_title,
       published_at_status, published_at, source_updated_at_status,
       source_updated_at, first_seen_at, last_seen_at
     ) VALUES ($1, $2, $3, $4, $5, 'Display title', 'display title', $6, $7, $8, $9, $10, $11)`,
    [
      id,
      overrides.sourceId ?? fixture.sourceOne,
      overrides.externalId ?? null,
      canonicalUrl,
      canonicalUrl,
      overrides.publishedStatus ?? 'missing',
      overrides.publishedAt ?? null,
      overrides.updatedStatus ?? 'missing',
      overrides.updatedAt ?? null,
      overrides.firstSeenAt ?? '2026-08-10T00:00:00Z',
      overrides.lastSeenAt ?? '2026-08-10T00:00:00Z',
    ],
  );
  return id;
}

async function insertObservation(
  client: Client,
  fixture: Fixture,
  options: {
    articleId?: string;
    outcome: string;
    endpointId?: string;
    runId?: string;
    observedExternalId?: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO article_observations (
       id, source_id, source_endpoint_id, collection_run_id,
       article_id, processing_outcome, observed_external_id,
       observed_canonical_identity_url
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'https://one.example/observed')`,
    [
      randomUUID(),
      fixture.sourceOne,
      options.endpointId ?? fixture.endpointOne,
      options.runId ?? fixture.runOne,
      options.articleId ?? null,
      options.outcome,
      options.observedExternalId ?? null,
    ],
  );
}

async function rejects(operation: () => Promise<unknown>): Promise<void> {
  await assert.rejects(operation);
}
