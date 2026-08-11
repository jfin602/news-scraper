import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { Client, type QueryResult, type QueryResultRow } from 'pg';

import {
  createDatabase,
  type Database,
  type QueryExecutor,
} from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  PublicFeedRepositoryError,
  readPublicFeed,
} from '../../src/public-feed/repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

type PublicFeed = NonNullable<Awaited<ReturnType<typeof readPublicFeed>>>;
type ApprovalState = 'approved' | 'unapproved';
type LifecycleState = 'active' | 'archived';
type OperationalState = 'enabled' | 'paused' | 'disabled';
type VisibilityState = 'visible' | 'hidden' | 'archived';
type PublicationPublicStatus = 'private' | 'public';
type PublishedAtStatus = 'parsed' | 'missing' | 'invalid';

interface SeededPublication {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

interface SeededSource {
  readonly id: string;
  readonly publicationId: string;
  readonly displayName: string;
}

interface SeededEndpoint {
  readonly id: string;
  readonly sourceId: string;
}

interface SeededArticle {
  readonly id: string;
  readonly publicationId: string;
  readonly sourceId: string;
  readonly originalUrl: string;
  readonly canonicalIdentityUrl: string;
}

interface PublicFeedDatabaseContext {
  readonly client: Client;
  readonly database: Database;
}

let sourceSequence = 0;
let endpointSequence = 0;
let runSequence = 0;

test('readPublicFeed exposes only the requested public Publication and ignores collection activity', async () => {
  await withPublicFeedDatabase(async ({ client, database }) => {
    const target = await insertPublication(client, {
      slug: 'public-target',
      name: 'Public target',
      activeForCollection: false,
    });
    const targetSource = await insertSource(client, target, {
      displayName: 'Target source',
    });
    const targetArticle = await insertArticle(client, targetSource, {
      displayTitle: 'Target headline',
      firstSeenAt: new Date('2026-08-10T01:00:00.000Z'),
    });

    const privatePublication = await insertPublication(client, {
      slug: 'private-publication',
      publicStatus: 'private',
    });
    const privateSource = await insertSource(client, privatePublication);
    await insertArticle(client, privateSource, {
      displayTitle: 'Private headline',
      firstSeenAt: new Date('2026-08-10T02:00:00.000Z'),
    });

    const otherPublication = await insertPublication(client, {
      slug: 'other-publication',
      name: 'Other public Publication',
    });
    const otherSource = await insertSource(client, otherPublication);
    const otherArticle = await insertArticle(client, otherSource, {
      displayTitle: 'Other headline',
      firstSeenAt: new Date('2026-08-10T03:00:00.000Z'),
    });

    const feed = requireFeed(await readPublicFeed(database, target.slug));
    assert.deepEqual(feed.publication, target);
    assert.deepEqual(
      feed.items.map((item) => item.articleId),
      [targetArticle.id],
    );
    assert.notEqual(feed.items[0]?.articleId, otherArticle.id);

    assert.deepEqual(
      await Promise.all([
        readPublicFeed(database, privatePublication.slug),
        readPublicFeed(database, 'missing-publication'),
      ]),
      [undefined, undefined],
    );
  });
});

test('readPublicFeed gates Source trust and lifecycle but retains paused and disabled Sources', async () => {
  await withPublicFeedDatabase(async ({ client, database }) => {
    const publication = await insertPublication(client, {
      slug: 'source-states',
    });
    const included = await insertSource(client, publication, {
      displayName: 'Enabled source',
    });
    const unapproved = await insertSource(client, publication, {
      approvalState: 'unapproved',
      displayName: 'Unapproved source',
    });
    const archived = await insertSource(client, publication, {
      lifecycleState: 'archived',
      displayName: 'Archived source',
    });
    const paused = await insertSource(client, publication, {
      operationalState: 'paused',
      displayName: 'Paused source',
    });
    const disabled = await insertSource(client, publication, {
      operationalState: 'disabled',
      displayName: 'Disabled source',
    });

    const includedArticle = await insertArticle(client, included);
    await insertArticle(client, unapproved);
    await insertArticle(client, archived);
    const pausedArticle = await insertArticle(client, paused);
    const disabledArticle = await insertArticle(client, disabled);

    const feed = requireFeed(await readPublicFeed(database, publication.slug));
    assert.deepEqual(
      feed.items.map((item) => item.articleId).sort(),
      [includedArticle.id, pausedArticle.id, disabledArticle.id].sort(),
    );
  });
});

test('readPublicFeed does not use endpoint state or failed Collection-run provenance as row suppression gates', async () => {
  await withPublicFeedDatabase(async ({ client, database }) => {
    const publication = await insertPublication(client, {
      slug: 'endpoint-and-run-state',
    });
    const source = await insertSource(client, publication);
    const endpoint = await insertEndpoint(client, source);
    const article = await insertArticle(client, source, {
      firstSeenAt: new Date('2026-08-09T00:05:00.000Z'),
      lastSeenAt: new Date('2026-08-09T00:05:00.000Z'),
    });

    const before = requireFeed(
      await readPublicFeed(database, publication.slug),
    );
    assert.deepEqual(
      before.items.map((item) => item.articleId),
      [article.id],
    );

    const failedRunId = await insertFailedCollectionRun(client, endpoint.id);
    await insertObservation(client, {
      publicationId: publication.id,
      sourceId: source.id,
      endpointId: endpoint.id,
      collectionRunId: failedRunId,
      article,
    });
    await client.query(
      `UPDATE source_endpoints
       SET approval_state = 'unapproved',
           lifecycle_state = 'archived',
           operational_state = 'disabled'
       WHERE id = $1`,
      [endpoint.id],
    );

    const after = requireFeed(await readPublicFeed(database, publication.slug));
    assert.deepEqual(after, before);
  });
});

test('readPublicFeed excludes hidden and archived Articles', async () => {
  await withPublicFeedDatabase(async ({ client, database }) => {
    const publication = await insertPublication(client, {
      slug: 'article-visibility',
    });
    const source = await insertSource(client, publication);
    const visible = await insertArticle(client, source, {
      visibilityState: 'visible',
    });
    await insertArticle(client, source, { visibilityState: 'hidden' });
    await insertArticle(client, source, { visibilityState: 'archived' });

    const feed = requireFeed(await readPublicFeed(database, publication.slug));
    assert.deepEqual(
      feed.items.map((item) => item.articleId),
      [visible.id],
    );
  });
});

test('readPublicFeed maps canonical dates and only the safe basic public fields', async () => {
  await withPublicFeedDatabase(async ({ client, database }) => {
    const publication = await insertPublication(client, {
      slug: 'date-and-shaping',
      name: 'Date and shaping',
    });
    const source = await insertSource(client, publication, {
      displayName: 'Mapped source name',
    });
    const parsedDate = new Date('2026-08-01T09:00:00.000Z');
    const parsed = await insertArticle(client, source, {
      displayTitle: 'Parsed headline',
      originalUrl:
        'https://publisher.example.test/story?utm_source=feed#section-one',
      canonicalIdentityUrl: 'https://publisher.example.test/story',
      publishedAtStatus: 'parsed',
      publishedAt: parsedDate,
      firstSeenAt: new Date('2026-08-10T09:00:00.000Z'),
    });
    const missing = await insertArticle(client, source, {
      displayTitle: 'Missing-date headline',
      publishedAtStatus: 'missing',
      firstSeenAt: new Date('2026-08-03T09:00:00.000Z'),
    });
    const invalid = await insertArticle(client, source, {
      displayTitle: 'Invalid-date headline',
      publishedAtStatus: 'invalid',
      firstSeenAt: new Date('2026-08-02T09:00:00.000Z'),
    });

    const recordingExecutor = new RecordingExecutor(database);
    const feed = requireFeed(
      await readPublicFeed(recordingExecutor, publication.slug),
    );
    assert.equal(recordingExecutor.queries.length, 1);
    assert.equal(recordingExecutor.queries[0]?.values?.[0], publication.slug);

    const parsedItem = requireItem(feed, parsed.id);
    assert.equal(
      parsedItem.effectiveFeedDate.toISOString(),
      parsedDate.toISOString(),
    );
    assert.equal(parsedItem.feedDateSource, 'published_at');
    assert.equal(parsedItem.headline, 'Parsed headline');
    assert.equal(parsedItem.sourceName, source.displayName);
    assert.equal(parsedItem.originalUrl, parsed.originalUrl);
    assert.notEqual(parsedItem.originalUrl, parsed.canonicalIdentityUrl);

    const missingItem = requireItem(feed, missing.id);
    assert.equal(
      missingItem.effectiveFeedDate.toISOString(),
      '2026-08-03T09:00:00.000Z',
    );
    assert.equal(missingItem.feedDateSource, 'first_seen_at');

    const invalidItem = requireItem(feed, invalid.id);
    assert.equal(
      invalidItem.effectiveFeedDate.toISOString(),
      '2026-08-02T09:00:00.000Z',
    );
    assert.equal(invalidItem.feedDateSource, 'first_seen_at');

    assert.deepEqual(Object.keys(feed.publication).sort(), [
      'id',
      'name',
      'slug',
    ]);
    assert.deepEqual(Object.keys(parsedItem).sort(), [
      'articleId',
      'effectiveFeedDate',
      'feedDateSource',
      'headline',
      'originalUrl',
      'sourceName',
    ]);
    assert.equal('canonicalIdentityUrl' in parsedItem, false);
  });
});

test('readPublicFeed uses canonical deterministic ordering across repeated reads', async () => {
  await withPublicFeedDatabase(async ({ client, database }) => {
    const publication = await insertPublication(client, {
      slug: 'deterministic-order',
    });
    const source = await insertSource(client, publication);
    const later = await insertArticle(client, source, {
      firstSeenAt: new Date('2026-08-12T00:00:00.000Z'),
    });
    const sameEffectiveLaterFirstSeen = await insertArticle(client, source, {
      publishedAtStatus: 'parsed',
      publishedAt: new Date('2026-08-11T00:00:00.000Z'),
      firstSeenAt: new Date('2026-08-11T12:00:00.000Z'),
    });
    const sameEffectiveEarlierFirstSeen = await insertArticle(client, source, {
      publishedAtStatus: 'parsed',
      publishedAt: new Date('2026-08-11T00:00:00.000Z'),
      firstSeenAt: new Date('2026-08-11T11:00:00.000Z'),
    });
    const sameEffectiveAndFirstSeenLowId = await insertArticle(client, source, {
      id: '10000000-0000-4000-8000-000000000001',
      firstSeenAt: new Date('2026-08-10T00:00:00.000Z'),
    });
    const sameEffectiveAndFirstSeenHighId = await insertArticle(
      client,
      source,
      {
        id: '20000000-0000-4000-8000-000000000001',
        firstSeenAt: new Date('2026-08-10T00:00:00.000Z'),
      },
    );

    const expectedArticleIds = [
      later.id,
      sameEffectiveLaterFirstSeen.id,
      sameEffectiveEarlierFirstSeen.id,
      sameEffectiveAndFirstSeenLowId.id,
      sameEffectiveAndFirstSeenHighId.id,
    ];
    const first = requireFeed(await readPublicFeed(database, publication.slug));
    const second = requireFeed(
      await readPublicFeed(database, publication.slug),
    );
    assert.deepEqual(
      first.items.map((item) => item.articleId),
      expectedArticleIds,
    );
    assert.deepEqual(
      second.items.map((item) => item.articleId),
      expectedArticleIds,
    );
  });
});

test('readPublicFeed preserves public empty state and limits the canonical window to 100 Articles', async () => {
  await withPublicFeedDatabase(async ({ client, database }) => {
    const emptyPublication = await insertPublication(client, {
      slug: 'empty-public-feed',
      name: 'Empty public feed',
    });
    const emptySource = await insertSource(client, emptyPublication);
    await insertArticle(client, emptySource, { visibilityState: 'hidden' });

    const emptyFeed = requireFeed(
      await readPublicFeed(database, emptyPublication.slug),
    );
    assert.deepEqual(emptyFeed.publication, emptyPublication);
    assert.deepEqual(emptyFeed.items, []);

    const boundedPublication = await insertPublication(client, {
      slug: 'bounded-public-feed',
    });
    const boundedSource = await insertSource(client, boundedPublication);
    const articles: SeededArticle[] = [];
    const baseTime = Date.parse('2026-08-01T00:00:00.000Z');
    for (let index = 0; index <= 100; index += 1) {
      articles.push(
        await insertArticle(client, boundedSource, {
          displayTitle: `Bounded headline ${index}`,
          firstSeenAt: new Date(baseTime + index * 60_000),
        }),
      );
    }

    const boundedFeed = requireFeed(
      await readPublicFeed(database, boundedPublication.slug),
    );
    assert.equal(boundedFeed.items.length, 100);
    assert.deepEqual(
      boundedFeed.items.map((item) => item.articleId),
      articles
        .slice(1)
        .reverse()
        .map((article) => article.id),
    );
    assert.equal(
      boundedFeed.items.some((item) => item.articleId === articles[0]?.id),
      false,
    );
  });
});

test('readPublicFeed rejects malformed result rows and database failures through its bounded error', async () => {
  const malformedRowExecutor = new ScriptedExecutor([
    {
      publication_id: '10000000-0000-4000-8000-000000000001',
      publication_slug: 'scripted-publication',
      publication_name: 'Scripted Publication',
      article_id: null,
      effective_feed_date: null,
      feed_date_source: null,
      headline: 'ROW_SHAPE_SECRET',
      source_name: null,
      original_url: null,
    },
  ]);
  await assertPublicFeedFailure(
    () => readPublicFeed(malformedRowExecutor, 'scripted-publication'),
    'invalid_row',
    'ROW_SHAPE_SECRET',
  );

  const queryFailureExecutor = new ScriptedExecutor(
    new Error('database error: CONNECTION_SECRET'),
  );
  await assertPublicFeedFailure(
    () => readPublicFeed(queryFailureExecutor, 'scripted-publication'),
    'read_failed',
    'CONNECTION_SECRET',
  );
});

async function withPublicFeedDatabase(
  work: (context: PublicFeedDatabaseContext) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const client = new Client({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await client.connect();
      await work({ client, database });
    } finally {
      await Promise.all([database.close(), client.end()]);
    }
  });
}

async function insertPublication(
  client: Client,
  options: Readonly<{
    slug: string;
    name?: string;
    activeForCollection?: boolean;
    publicStatus?: PublicationPublicStatus;
  }>,
): Promise<SeededPublication> {
  const publication: SeededPublication = {
    id: randomUUID(),
    name: options.name ?? `Publication ${options.slug}`,
    slug: options.slug,
  };
  await client.query(
    `INSERT INTO publications (
       id, name, slug, active_for_collection, public_status
     ) VALUES ($1, $2, $3, $4, $5)`,
    [
      publication.id,
      publication.name,
      publication.slug,
      options.activeForCollection ?? true,
      options.publicStatus ?? 'public',
    ],
  );
  return publication;
}

async function insertSource(
  client: Client,
  publication: SeededPublication,
  options: Readonly<{
    displayName?: string;
    approvalState?: ApprovalState;
    lifecycleState?: LifecycleState;
    operationalState?: OperationalState;
  }> = {},
): Promise<SeededSource> {
  sourceSequence += 1;
  const source: SeededSource = {
    id: randomUUID(),
    publicationId: publication.id,
    displayName: options.displayName ?? `Source ${sourceSequence}`,
  };
  await client.query(
    `INSERT INTO sources (
       id, publication_id, config_key, display_name, site_url,
       approval_state, lifecycle_state, operational_state
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      source.id,
      source.publicationId,
      `source_${sourceSequence}`,
      source.displayName,
      `https://source-${sourceSequence}.example.test/`,
      options.approvalState ?? 'approved',
      options.lifecycleState ?? 'active',
      options.operationalState ?? 'enabled',
    ],
  );
  return source;
}

async function insertEndpoint(
  client: Client,
  source: SeededSource,
): Promise<SeededEndpoint> {
  endpointSequence += 1;
  const endpoint: SeededEndpoint = {
    id: randomUUID(),
    sourceId: source.id,
  };
  await client.query(
    `INSERT INTO source_endpoints (
       id, source_id, config_key, endpoint_url, endpoint_type,
       approval_state, lifecycle_state, operational_state, poll_interval_seconds
     ) VALUES ($1, $2, $3, $4, 'rss_atom', 'approved', 'active', 'enabled', 300)`,
    [
      endpoint.id,
      endpoint.sourceId,
      `endpoint_${endpointSequence}`,
      `https://endpoint-${endpointSequence}.example.test/feed.xml`,
    ],
  );
  return endpoint;
}

async function insertArticle(
  client: Client,
  source: SeededSource,
  options: Readonly<{
    id?: string;
    displayTitle?: string;
    normalizedTitle?: string;
    originalUrl?: string;
    canonicalIdentityUrl?: string;
    publishedAtStatus?: PublishedAtStatus;
    publishedAt?: Date;
    visibilityState?: VisibilityState;
    firstSeenAt?: Date;
    lastSeenAt?: Date;
  }> = {},
): Promise<SeededArticle> {
  const id = options.id ?? randomUUID();
  const publishedAtStatus = options.publishedAtStatus ?? 'missing';
  if (publishedAtStatus === 'parsed' && options.publishedAt === undefined) {
    throw new Error('Parsed Article fixtures require publishedAt.');
  }
  if (publishedAtStatus !== 'parsed' && options.publishedAt !== undefined) {
    throw new Error(
      'Missing/invalid Article fixtures cannot have publishedAt.',
    );
  }
  const firstSeenAt =
    options.firstSeenAt ?? new Date('2026-08-10T00:00:00.000Z');
  const article: SeededArticle = {
    id,
    publicationId: source.publicationId,
    sourceId: source.id,
    originalUrl: options.originalUrl ?? `https://article.example.test/${id}`,
    canonicalIdentityUrl:
      options.canonicalIdentityUrl ?? `https://article.example.test/${id}`,
  };
  await client.query(
    `INSERT INTO articles (
       id, publication_id, source_id, original_url, canonical_identity_url,
       display_title, normalized_title, published_at_status, published_at,
       source_updated_at_status, source_updated_at, visibility_state,
       first_seen_at, last_seen_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, 'missing', NULL, $10, $11, $12
     )`,
    [
      article.id,
      article.publicationId,
      article.sourceId,
      article.originalUrl,
      article.canonicalIdentityUrl,
      options.displayTitle ?? `Headline ${id}`,
      options.normalizedTitle ?? `headline ${id}`,
      publishedAtStatus,
      options.publishedAt ?? null,
      options.visibilityState ?? 'visible',
      firstSeenAt,
      options.lastSeenAt ?? firstSeenAt,
    ],
  );
  return article;
}

async function insertFailedCollectionRun(
  client: Client,
  endpointId: string,
): Promise<string> {
  runSequence += 1;
  const id = randomUUID();
  await client.query(
    `INSERT INTO collection_runs (
       id, source_endpoint_id, execution_id, started_at, finished_at,
       run_status, transport_status, parser_status, normalization_status,
       processing_status, raw_item_count, normalized_candidate_count,
       normalization_failure_count, article_link_rejection_count, created_count,
       updated_count, unchanged_count, rejected_count, excluded_count, failed_count,
       error_code, error_detail
     ) VALUES (
       $1, $2, $3, '2026-08-09T00:00:00.000Z', '2026-08-09T00:10:00.000Z',
       'failed', 'succeeded', 'succeeded', 'succeeded', 'failed', 2, 2, 0, 0,
       1, 0, 0, 0, 0, 1, 'processing_execution_failed',
       'One Article persisted before processing failed.'
     )`,
    [id, endpointId, `failed-run-${runSequence}`],
  );
  return id;
}

async function insertObservation(
  client: Client,
  input: Readonly<{
    publicationId: string;
    sourceId: string;
    endpointId: string;
    collectionRunId: string;
    article: SeededArticle;
  }>,
): Promise<void> {
  await client.query(
    `INSERT INTO article_observations (
       id, publication_id, source_id, source_endpoint_id, collection_run_id,
       article_id, observed_at, processing_outcome,
       observed_canonical_identity_url
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'created', $8)`,
    [
      randomUUID(),
      input.publicationId,
      input.sourceId,
      input.endpointId,
      input.collectionRunId,
      input.article.id,
      '2026-08-09T00:05:00.000Z',
      input.article.canonicalIdentityUrl,
    ],
  );
}

function requireFeed(
  feed: Awaited<ReturnType<typeof readPublicFeed>>,
): PublicFeed {
  if (feed === undefined) assert.fail('Expected a public feed.');
  return feed;
}

function requireItem(feed: PublicFeed, articleId: string) {
  const item = feed.items.find(
    (candidate) => candidate.articleId === articleId,
  );
  if (item === undefined) assert.fail(`Expected Article ${articleId}.`);
  return item;
}

async function assertPublicFeedFailure(
  operation: () => Promise<unknown>,
  reason: 'invalid_row' | 'read_failed',
  secret: string,
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof PublicFeedRepositoryError);
    assert.equal(error.reason, reason);
    assert.equal(error.message, 'Public feed read failed.');
    assert.doesNotMatch(error.message, new RegExp(secret, 'u'));
    return true;
  });
}

class RecordingExecutor implements QueryExecutor {
  readonly queries: Array<{
    readonly text: string;
    readonly values: readonly unknown[] | undefined;
  }> = [];
  readonly #delegate: QueryExecutor;

  constructor(delegate: QueryExecutor) {
    this.#delegate = delegate;
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>> {
    this.queries.push({
      text,
      values: values === undefined ? undefined : [...values],
    });
    return this.#delegate.query<Row>(text, values);
  }
}

class ScriptedExecutor implements QueryExecutor {
  readonly #outcome: readonly QueryResultRow[] | Error;

  constructor(outcome: readonly QueryResultRow[] | Error) {
    this.#outcome = outcome;
  }

  async query<Row extends QueryResultRow = QueryResultRow>(): Promise<
    QueryResult<Row>
  > {
    if (this.#outcome instanceof Error) throw this.#outcome;
    return queryResult(this.#outcome as readonly Row[]);
  }
}

function queryResult<Row extends QueryResultRow>(
  rows: readonly Row[],
): QueryResult<Row> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    rows: [...rows],
    fields: [],
  };
}
