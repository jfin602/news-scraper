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
  decodePublicDiscoveryCursor,
  type PublicDiscoveryRequest,
} from '../../src/public-feed/discovery.ts';
import {
  PUBLIC_DISCOVERY_OPTION_LIMIT,
  PUBLIC_FEED_PAGE_SIZE,
  PublicFeedRepositoryError,
  readPublicFeed,
} from '../../src/public-feed/repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

type PublicDiscoveryFeed = NonNullable<
  Awaited<ReturnType<typeof readPublicFeed>>
>;
type ApprovalState = 'approved' | 'unapproved';
type LifecycleState = 'active' | 'archived';
type OperationalState = 'enabled' | 'paused' | 'disabled';
type VisibilityState = 'visible' | 'hidden' | 'archived';
type PublishedAtStatus = 'parsed' | 'missing' | 'invalid';
type TimestampInput = Date | string;

interface DiscoveryDatabaseContext {
  readonly client: Client;
  readonly database: Database;
}

interface SeededSource {
  readonly id: string;
  readonly configKey: string;
  readonly displayName: string;
}

interface SeededCategory {
  readonly id: string;
  readonly configKey: string;
  readonly displayName: string;
}

interface SeededArticle {
  readonly id: string;
  readonly sourceId: string;
}

let sourceSequence = 0;
let categorySequence = 0;
let endpointSequence = 0;

test('filters the one eligible stream by selectable Source and current Category membership', async () => {
  await withDiscoveryDatabase(async ({ client, database }) => {
    await insertPublicPublication(client, 'Discovery filter publication');
    const enabled = await insertSource(client, {
      configKey: 'enabled_source',
      displayName: 'Enabled Source',
    });
    const paused = await insertSource(client, {
      configKey: 'paused_source',
      displayName: 'Paused Source',
      operationalState: 'paused',
    });
    const disabled = await insertSource(client, {
      configKey: 'disabled_source',
      displayName: 'Disabled Source',
      operationalState: 'disabled',
    });
    const unapproved = await insertSource(client, {
      configKey: 'unapproved_source',
      displayName: 'Unapproved Source',
      approvalState: 'unapproved',
    });
    const archived = await insertSource(client, {
      configKey: 'archived_source',
      displayName: 'Archived Source',
      lifecycleState: 'archived',
    });
    const category = await insertCategory(client, {
      configKey: 'current_category',
      displayName: 'Current Category',
    });
    const secondCategory = await insertCategory(client, {
      configKey: 'second_category',
      displayName: 'Second Category',
    });
    const historicalOnlyCategory = await insertCategory(client, {
      configKey: 'historical_only_category',
      displayName: 'Historical Only Category',
    });

    const enabledArticle = await insertArticle(client, enabled, {
      displayTitle: 'Enabled article',
    });
    const pausedArticle = await insertArticle(client, paused, {
      displayTitle: 'Paused article',
    });
    const disabledArticle = await insertArticle(client, disabled, {
      displayTitle: 'Disabled article',
    });
    await insertArticle(client, unapproved, {
      displayTitle: 'Unapproved article',
    });
    await insertArticle(client, archived, { displayTitle: 'Archived article' });
    await assignCategory(client, enabledArticle, category);
    await assignCategory(client, enabledArticle, secondCategory);
    await insertHistoricalCategoryReason(
      client,
      enabled,
      enabledArticle,
      historicalOnlyCategory,
    );

    const pausedFeed = requireFeed(
      await readPublicFeed(database, { sourceConfigKey: paused.configKey }),
    );
    assert.deepEqual(
      pausedFeed.items.map((item) => item.articleId),
      [pausedArticle.id],
    );

    const disabledFeed = requireFeed(
      await readPublicFeed(database, { sourceConfigKey: disabled.configKey }),
    );
    assert.deepEqual(
      disabledFeed.items.map((item) => item.articleId),
      [disabledArticle.id],
    );

    const categoryFeed = requireFeed(
      await readPublicFeed(database, { categoryConfigKey: category.configKey }),
    );
    assert.deepEqual(
      categoryFeed.items.map((item) => item.articleId),
      [enabledArticle.id],
    );
    assert.equal(categoryFeed.items.length, 1);

    const historicalOnlyFeed = requireFeed(
      await readPublicFeed(database, {
        categoryConfigKey: historicalOnlyCategory.configKey,
      }),
    );
    assert.deepEqual(historicalOnlyFeed.items, []);

    const sourceChoiceKeys = categoryFeed.sourceChoices.map(
      (choice) => choice.configKey,
    );
    assert.deepEqual(sourceChoiceKeys.sort(), [
      disabled.configKey,
      enabled.configKey,
      paused.configKey,
    ]);
    assert.equal(sourceChoiceKeys.includes(unapproved.configKey), false);
    assert.equal(sourceChoiceKeys.includes(archived.configKey), false);
    assert.deepEqual(
      categoryFeed.categoryChoices.map((choice) => choice.configKey).sort(),
      [
        category.configKey,
        historicalOnlyCategory.configKey,
        secondCategory.configKey,
      ].sort(),
    );

    await assertUnsupportedFilter(() =>
      readPublicFeed(database, { sourceConfigKey: unapproved.configKey }),
    );
    await assertUnsupportedFilter(() =>
      readPublicFeed(database, { sourceConfigKey: archived.configKey }),
    );
    await assertUnsupportedFilter(() =>
      readPublicFeed(database, { sourceConfigKey: 'missing_source' }),
    );
    await assertUnsupportedFilter(() =>
      readPublicFeed(database, { categoryConfigKey: 'missing_category' }),
    );

    await client.query(
      "UPDATE publication_settings SET public_status = 'private'",
    );
    assert.equal(
      await readPublicFeed(database, { sourceConfigKey: unapproved.configKey }),
      undefined,
    );
    assert.equal(
      await readPublicFeed(database, { categoryConfigKey: 'missing_category' }),
      undefined,
    );
    await client.query('DELETE FROM publication_settings');
    assert.equal(
      await readPublicFeed(database, { sourceConfigKey: 'missing_source' }),
      undefined,
    );
    assert.equal(
      await readPublicFeed(database, { categoryConfigKey: category.configKey }),
      undefined,
    );
  });
});

test('uses case-insensitive literal search over only the permitted Article fields and composes criteria with AND', async () => {
  await withDiscoveryDatabase(async ({ client, database }) => {
    await insertPublicPublication(client, 'Literal search publication');
    const matchingSource = await insertSource(client, {
      configKey: 'matching_source',
      displayName: 'Matching Source',
    });
    const otherSource = await insertSource(client, {
      configKey: 'other_source',
      displayName: 'Other Source',
    });
    const matchingCategory = await insertCategory(client, {
      configKey: 'matching_category',
      displayName: 'Matching Category',
    });
    const otherCategory = await insertCategory(client, {
      configKey: 'other_category',
      displayName: 'Other Category',
    });

    const displayMatch = await insertArticle(client, matchingSource, {
      displayTitle: 'Display Needle headline',
      normalizedTitle: 'ordinary title',
      firstSeenAt: '2026-08-10T00:00:04.000000Z',
    });
    const normalizedMatch = await insertArticle(client, matchingSource, {
      displayTitle: 'Ordinary display title',
      normalizedTitle: 'Normalized Needle headline',
      firstSeenAt: '2026-08-10T00:00:03.000000Z',
    });
    const authorMatch = await insertArticle(client, matchingSource, {
      displayTitle: 'Author display title',
      normalizedTitle: 'author display title',
      author: 'Author Needle',
      firstSeenAt: '2026-08-10T00:00:02.000000Z',
    });
    const summaryMatch = await insertArticle(client, matchingSource, {
      displayTitle: 'Summary display title',
      normalizedTitle: 'summary display title',
      summary: 'Summary Needle',
      firstSeenAt: '2026-08-10T00:00:01.000000Z',
    });
    await insertArticle(client, matchingSource, {
      displayTitle: 'No optional metadata',
      normalizedTitle: 'no optional metadata',
      firstSeenAt: '2026-08-10T00:00:00.000000Z',
    });
    const literalPercent = await insertArticle(client, matchingSource, {
      displayTitle: 'Literal percent % marker',
      normalizedTitle: 'literal percent marker',
    });
    const literalUnderscore = await insertArticle(client, matchingSource, {
      displayTitle: 'Literal underscore _ marker',
      normalizedTitle: 'literal underscore marker',
    });
    const literalPunctuation = await insertArticle(client, matchingSource, {
      displayTitle: 'Literal slash \\.*?[] marker',
      normalizedTitle: 'literal punctuation marker',
    });
    const combinedMatch = await insertArticle(client, matchingSource, {
      displayTitle: 'Combined literal match',
      normalizedTitle: 'combined literal match',
      firstSeenAt: '2026-08-11T00:00:01.000000Z',
    });
    const combinedOlderMatch = await insertArticle(client, matchingSource, {
      displayTitle: 'Combined literal match',
      normalizedTitle: 'combined literal match',
      firstSeenAt: '2026-08-09T00:00:01.000000Z',
    });
    const wrongCategory = await insertArticle(client, matchingSource, {
      displayTitle: 'Combined literal match',
      normalizedTitle: 'combined literal match',
      firstSeenAt: '2026-08-11T00:00:02.000000Z',
    });
    const wrongSource = await insertArticle(client, otherSource, {
      displayTitle: 'Combined literal match',
      normalizedTitle: 'combined literal match',
      firstSeenAt: '2026-08-11T00:00:03.000000Z',
    });
    await assignCategory(client, combinedMatch, matchingCategory);
    await assignCategory(client, combinedOlderMatch, matchingCategory);
    await assignCategory(client, wrongCategory, otherCategory);
    await assignCategory(client, wrongSource, matchingCategory);

    assert.deepEqual(
      itemIds(
        await readPublicFeed(database, { keywordQuery: 'DISPLAY NEEDLE' }),
      ),
      [displayMatch.id],
    );
    assert.deepEqual(
      itemIds(
        await readPublicFeed(database, { keywordQuery: 'normalized needle' }),
      ),
      [normalizedMatch.id],
    );
    assert.deepEqual(
      itemIds(
        await readPublicFeed(database, { keywordQuery: 'AUTHOR NEEDLE' }),
      ),
      [authorMatch.id],
    );
    assert.deepEqual(
      itemIds(
        await readPublicFeed(database, { keywordQuery: 'summary needle' }),
      ),
      [summaryMatch.id],
    );
    assert.deepEqual(
      itemIds(
        await readPublicFeed(database, {
          keywordQuery: 'absent optional value',
        }),
      ),
      [],
    );
    assert.deepEqual(
      itemIds(await readPublicFeed(database, { keywordQuery: '%' })),
      [literalPercent.id],
    );
    assert.deepEqual(
      itemIds(await readPublicFeed(database, { keywordQuery: '_' })),
      [literalUnderscore.id],
    );
    assert.deepEqual(
      itemIds(await readPublicFeed(database, { keywordQuery: '\\.*?[]' })),
      [literalPunctuation.id],
    );

    const combined = requireFeed(
      await readPublicFeed(database, {
        keywordQuery: 'combined literal',
        sourceConfigKey: matchingSource.configKey,
        categoryConfigKey: matchingCategory.configKey,
      }),
    );
    assert.deepEqual(
      combined.items.map((item) => item.articleId),
      [combinedMatch.id, combinedOlderMatch.id],
    );
    assert.deepEqual(Object.keys(combined.items[0] ?? {}).sort(), [
      'articleId',
      'effectiveFeedDate',
      'feedDateSource',
      'headline',
      'originalUrl',
      'sourceName',
    ]);
    assert.deepEqual(Object.keys(combined.sourceChoices[0] ?? {}).sort(), [
      'configKey',
      'displayName',
    ]);
    assert.deepEqual(Object.keys(combined.categoryChoices[0] ?? {}).sort(), [
      'configKey',
      'displayName',
    ]);
  });
});

test('returns deterministic safe discovery choices for an empty public Publication', async () => {
  await withDiscoveryDatabase(async ({ client, database }) => {
    await insertPublicPublication(client, 'Empty discovery choices');
    await insertSource(client, {
      configKey: 'source_beta',
      displayName: 'apple',
    });
    await insertSource(client, {
      configKey: 'source_alpha',
      displayName: 'Apple',
    });
    await insertSource(client, {
      configKey: 'source_zeta',
      displayName: 'Zebra',
    });
    await insertCategory(client, {
      configKey: 'category_beta',
      displayName: 'apple',
    });
    await insertCategory(client, {
      configKey: 'category_alpha',
      displayName: 'Apple',
    });
    await insertCategory(client, {
      configKey: 'category_zeta',
      displayName: 'Zebra',
    });

    const feed = requireFeed(await readPublicFeed(database));
    assert.deepEqual(feed.items, []);
    assert.deepEqual(
      feed.sourceChoices.map((choice) => choice.configKey),
      ['source_alpha', 'source_beta', 'source_zeta'],
    );
    assert.deepEqual(
      feed.categoryChoices.map((choice) => choice.configKey),
      ['category_alpha', 'category_beta', 'category_zeta'],
    );
  });
});

test('does not expose filters or metadata after public state changes during a read', async () => {
  await withDiscoveryDatabase(async ({ client, database }) => {
    await insertPublicPublication(client, 'Changing public state');
    const source = await insertSource(client, {
      configKey: 'changing_source',
      displayName: 'Changing Source',
    });
    await insertCategory(client, {
      configKey: 'changing_category',
      displayName: 'Changing Category',
    });

    const sourceFilterExecutor = new PublicStateChangingExecutor(
      database,
      client,
    );
    assert.equal(
      await readPublicFeed(sourceFilterExecutor, {
        sourceConfigKey: source.configKey,
      }),
      undefined,
    );

    await client.query(
      "UPDATE publication_settings SET public_status = 'public'",
    );
    const unfilteredExecutor = new PublicStateChangingExecutor(
      database,
      client,
    );
    assert.equal(await readPublicFeed(unfilteredExecutor), undefined);
  });
});

test('keeps an active selected Source or configured selected Category in bounded metadata', async () => {
  await withDiscoveryDatabase(async ({ client, database }) => {
    await insertPublicPublication(client, 'Bounded discovery choices');
    for (let index = 0; index <= PUBLIC_DISCOVERY_OPTION_LIMIT; index += 1) {
      const suffix = index.toString().padStart(3, '0');
      await insertSource(client, {
        configKey: `source_${suffix}`,
        displayName: `Source ${suffix}`,
      });
      await insertCategory(client, {
        configKey: `category_${suffix}`,
        displayName: `Category ${suffix}`,
      });
    }

    const sourceFeed = requireFeed(
      await readPublicFeed(database, { sourceConfigKey: 'source_200' }),
    );
    assert.equal(
      sourceFeed.sourceChoices.length,
      PUBLIC_DISCOVERY_OPTION_LIMIT,
    );
    assert.equal(
      sourceFeed.sourceChoices.some(
        (choice) => choice.configKey === 'source_200',
      ),
      true,
    );
    assert.equal(
      sourceFeed.sourceChoices.some(
        (choice) => choice.configKey === 'source_199',
      ),
      false,
    );

    const categoryFeed = requireFeed(
      await readPublicFeed(database, { categoryConfigKey: 'category_200' }),
    );
    assert.equal(
      categoryFeed.categoryChoices.length,
      PUBLIC_DISCOVERY_OPTION_LIMIT,
    );
    assert.equal(
      categoryFeed.categoryChoices.some(
        (choice) => choice.configKey === 'category_200',
      ),
      true,
    );
    assert.equal(
      categoryFeed.categoryChoices.some(
        (choice) => choice.configKey === 'category_199',
      ),
      false,
    );
  });
});

test('walks ordinary keyset pages without omissions, repetitions, or lookahead cursor drift', async () => {
  await withDiscoveryDatabase(async ({ client, database }) => {
    await insertPublicPublication(client, 'Keyset walk publication');
    const source = await insertSource(client, {
      configKey: 'keyset_source',
      displayName: 'Keyset Source',
    });
    const articles: SeededArticle[] = [];
    const baseTime = Date.parse('2026-08-01T00:00:00.000Z');
    for (let index = 0; index < 205; index += 1) {
      articles.push(
        await insertArticle(client, source, {
          displayTitle: `Keyset article ${index}`,
          firstSeenAt: new Date(baseTime + index * 1_000),
        }),
      );
    }
    const expectedIds = articles
      .slice()
      .reverse()
      .map((article) => article.id);

    const firstPage = requireFeed(await readPublicFeed(database));
    assert.equal(firstPage.items.length, PUBLIC_FEED_PAGE_SIZE);
    assert.notEqual(firstPage.nextCursor, null);
    const firstCursor = decodePublicDiscoveryCursor(
      firstPage.nextCursor ?? '',
      {},
    );
    assert.equal(firstCursor.articleId, firstPage.items.at(-1)?.articleId);
    assert.notEqual(firstCursor.articleId, expectedIds[PUBLIC_FEED_PAGE_SIZE]);

    const walkedIds = [...firstPage.items.map((item) => item.articleId)];
    let request = requestAfterCursor({}, firstPage.nextCursor);
    let lastPage = firstPage;
    while (request !== undefined) {
      const page = requireFeed(await readPublicFeed(database, request));
      walkedIds.push(...page.items.map((item) => item.articleId));
      request = requestAfterCursor({}, page.nextCursor);
      lastPage = page;
    }
    assert.deepEqual(walkedIds, expectedIds);
    assert.equal(new Set(walkedIds).size, expectedIds.length);
    assert.equal(lastPage.nextCursor, null);

    const exhaustedFeed = requireFeed(
      await readPublicFeed(database, { keywordQuery: 'Keyset article 204' }),
    );
    assert.equal(exhaustedFeed.items.length, 1);
    assert.equal(exhaustedFeed.nextCursor, null);
  });
});

test('uses first_seen_at DESC then Article ID ASC for tie-heavy keyset continuation', async () => {
  await withDiscoveryDatabase(async ({ client, database }) => {
    await insertPublicPublication(client, 'Tie-heavy keyset publication');
    const source = await insertSource(client, {
      configKey: 'tie_source',
      displayName: 'Tie Source',
    });
    const sameEffective = '2026-08-08T00:00:00.000000Z';
    const laterFirstSeen = await insertArticle(client, source, {
      id: '10000000-0000-4000-8000-000000000000',
      displayTitle: 'Later first seen tie breaker',
      publishedAtStatus: 'parsed',
      publishedAt: sameEffective,
      firstSeenAt: '2026-08-09T00:00:00.000000Z',
    });
    const earlierFirstSeen = await insertArticle(client, source, {
      id: '20000000-0000-4000-8000-000000000000',
      displayTitle: 'Earlier first seen tie breaker',
      publishedAtStatus: 'parsed',
      publishedAt: sameEffective,
      firstSeenAt: '2026-08-08T23:00:00.000000Z',
    });
    const exactTieIds: string[] = [];
    for (let index = 0; index <= PUBLIC_FEED_PAGE_SIZE; index += 1) {
      const id = `30000000-0000-4000-8000-${index
        .toString()
        .padStart(12, '0')}`;
      exactTieIds.push(id);
      await insertArticle(client, source, {
        id,
        displayTitle: `Exact tie ${index}`,
        publishedAtStatus: 'parsed',
        publishedAt: sameEffective,
        firstSeenAt: '2026-08-08T12:00:00.000000Z',
      });
    }

    const firstPage = requireFeed(await readPublicFeed(database));
    assert.deepEqual(
      firstPage.items.slice(0, 2).map((item) => item.articleId),
      [laterFirstSeen.id, earlierFirstSeen.id],
    );
    assert.deepEqual(
      firstPage.items.slice(2).map((item) => item.articleId),
      exactTieIds.slice(0, PUBLIC_FEED_PAGE_SIZE - 2),
    );
    const cursor = decodePublicDiscoveryCursor(firstPage.nextCursor ?? '', {});
    assert.equal(cursor.articleId, exactTieIds[PUBLIC_FEED_PAGE_SIZE - 3]);

    const secondPage = requireFeed(
      await readPublicFeed(
        database,
        requestAfterCursor({}, firstPage.nextCursor),
      ),
    );
    assert.deepEqual(
      secondPage.items.map((item) => item.articleId),
      exactTieIds.slice(PUBLIC_FEED_PAGE_SIZE - 2),
    );
    assert.equal(secondPage.nextCursor, null);
  });
});

test('preserves PostgreSQL microsecond cursor keys across a page boundary', async () => {
  await withDiscoveryDatabase(async ({ client, database }) => {
    await insertPublicPublication(client, 'Microsecond keyset publication');
    const source = await insertSource(client, {
      configKey: 'microsecond_source',
      displayName: 'Microsecond Source',
    });
    const articles: SeededArticle[] = [];
    for (
      let microseconds = 0;
      microseconds <= PUBLIC_FEED_PAGE_SIZE;
      microseconds += 1
    ) {
      articles.push(
        await insertArticle(client, source, {
          id: `40000000-0000-4000-8000-${microseconds
            .toString()
            .padStart(12, '0')}`,
          displayTitle: `Microsecond ${microseconds}`,
          firstSeenAt: `2026-08-10T00:00:00.${microseconds
            .toString()
            .padStart(6, '0')}Z`,
        }),
      );
    }
    const expectedIds = articles
      .slice()
      .reverse()
      .map((article) => article.id);

    const firstPage = requireFeed(await readPublicFeed(database));
    assert.equal(firstPage.items.length, PUBLIC_FEED_PAGE_SIZE);
    const cursor = decodePublicDiscoveryCursor(firstPage.nextCursor ?? '', {});
    assert.equal(cursor.effectiveFeedDate, '2026-08-10T00:00:00.000001Z');
    assert.equal(cursor.firstSeenAt, '2026-08-10T00:00:00.000001Z');
    const secondPage = requireFeed(
      await readPublicFeed(
        database,
        requestAfterCursor({}, firstPage.nextCursor),
      ),
    );
    assert.deepEqual(
      [...firstPage.items, ...secondPage.items].map((item) => item.articleId),
      expectedIds,
    );
    assert.equal(new Set(expectedIds).size, expectedIds.length);
    assert.equal(secondPage.nextCursor, null);
  });
});

async function withDiscoveryDatabase(
  work: (context: DiscoveryDatabaseContext) => Promise<void>,
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

async function insertPublicPublication(
  client: Client,
  name: string,
): Promise<void> {
  await client.query(
    `INSERT INTO publication_settings (name, active_for_collection, public_status)
     VALUES ($1, true, 'public')`,
    [name],
  );
}

async function insertSource(
  client: Client,
  options: Readonly<{
    configKey?: string;
    displayName?: string;
    approvalState?: ApprovalState;
    lifecycleState?: LifecycleState;
    operationalState?: OperationalState;
  }> = {},
): Promise<SeededSource> {
  sourceSequence += 1;
  const configKey = options.configKey ?? `source_${sourceSequence}`;
  const source = {
    id: randomUUID(),
    configKey,
    displayName: options.displayName ?? `Source ${sourceSequence}`,
  };
  await client.query(
    `INSERT INTO sources (
       id, config_key, display_name, site_url,
       approval_state, lifecycle_state, operational_state
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      source.id,
      source.configKey,
      source.displayName,
      `https://source-${sourceSequence}.example.test/`,
      options.approvalState ?? 'approved',
      options.lifecycleState ?? 'active',
      options.operationalState ?? 'enabled',
    ],
  );
  return Object.freeze(source);
}

async function insertCategory(
  client: Client,
  options: Readonly<{ configKey?: string; displayName?: string }> = {},
): Promise<SeededCategory> {
  categorySequence += 1;
  const configKey = options.configKey ?? `category_${categorySequence}`;
  const category = {
    id: randomUUID(),
    configKey,
    displayName: options.displayName ?? `Category ${categorySequence}`,
  };
  await client.query(
    `INSERT INTO categories (id, config_key, display_name)
     VALUES ($1, $2, $3)`,
    [category.id, category.configKey, category.displayName],
  );
  return Object.freeze(category);
}

async function insertArticle(
  client: Client,
  source: SeededSource,
  options: Readonly<{
    id?: string;
    displayTitle?: string;
    normalizedTitle?: string;
    author?: string;
    summary?: string;
    publishedAtStatus?: PublishedAtStatus;
    publishedAt?: TimestampInput;
    visibilityState?: VisibilityState;
    firstSeenAt?: TimestampInput;
  }> = {},
): Promise<SeededArticle> {
  const id = options.id ?? randomUUID();
  const publishedAtStatus = options.publishedAtStatus ?? 'missing';
  if (publishedAtStatus === 'parsed' && options.publishedAt === undefined) {
    throw new Error('Parsed Article fixtures require publishedAt.');
  }
  if (publishedAtStatus !== 'parsed' && options.publishedAt !== undefined) {
    throw new Error('Only parsed Article fixtures may have publishedAt.');
  }
  const firstSeenAt = options.firstSeenAt ?? '2026-08-10T00:00:00.000000Z';
  const article = { id, sourceId: source.id };
  await client.query(
    `INSERT INTO articles (
       id, source_id, original_url, canonical_identity_url,
       display_title, normalized_title, author, summary,
       published_at_status, published_at, source_updated_at_status,
       source_updated_at, visibility_state, first_seen_at, last_seen_at
     ) VALUES (
       $1, $2, $3, $3, $4, $5, $6, $7, $8, $9, 'missing', NULL, $10, $11, $11
     )`,
    [
      article.id,
      article.sourceId,
      `https://article.example.test/${article.id}`,
      options.displayTitle ?? `Headline ${article.id}`,
      options.normalizedTitle ?? `headline ${article.id}`,
      options.author ?? null,
      options.summary ?? null,
      publishedAtStatus,
      options.publishedAt ?? null,
      options.visibilityState ?? 'visible',
      firstSeenAt,
    ],
  );
  return Object.freeze(article);
}

async function assignCategory(
  client: Client,
  article: SeededArticle,
  category: SeededCategory,
): Promise<void> {
  await client.query(
    `INSERT INTO article_categories (article_id, category_id)
     VALUES ($1, $2)`,
    [article.id, category.id],
  );
}

async function insertHistoricalCategoryReason(
  client: Client,
  source: SeededSource,
  article: SeededArticle,
  category: SeededCategory,
): Promise<void> {
  endpointSequence += 1;
  const endpointId = randomUUID();
  const runId = randomUUID();
  const observationId = randomUUID();
  await client.query(
    `INSERT INTO source_endpoints (
       id, source_id, config_key, endpoint_url, endpoint_type,
       approval_state, lifecycle_state, operational_state, poll_interval_seconds
     ) VALUES ($1, $2, $3, $4, 'rss_atom', 'approved', 'active', 'enabled', 300)`,
    [
      endpointId,
      source.id,
      `endpoint_${endpointSequence}`,
      `https://endpoint-${endpointSequence}.example.test/feed.xml`,
    ],
  );
  await client.query(
    `INSERT INTO collection_runs (
       id, source_endpoint_id, execution_id, started_at, finished_at,
       run_status, transport_status, parser_status
     ) VALUES ($1, $2, $3, now(), now(), 'succeeded', 'not_modified', 'not_run')`,
    [runId, endpointId, `historical-run-${endpointSequence}`],
  );
  await client.query(
    `INSERT INTO article_observations (
       id, source_id, source_endpoint_id, collection_run_id,
       article_id, processing_outcome
     ) VALUES ($1, $2, $3, $4, $5, 'created')`,
    [observationId, source.id, endpointId, runId, article.id],
  );
  await client.query(
    `INSERT INTO article_observation_category_reasons (
       article_observation_id, category_id, relevance_rule_id,
       reason_position, reason_kind, reason_detail
     ) VALUES ($1, $2, NULL, 1, 'endpoint_default', 'Historical only reason')`,
    [observationId, category.id],
  );
}

function requireFeed(
  feed: Awaited<ReturnType<typeof readPublicFeed>>,
): PublicDiscoveryFeed {
  if (feed === undefined) assert.fail('Expected a public feed.');
  return feed;
}

function itemIds(
  feed: Awaited<ReturnType<typeof readPublicFeed>>,
): readonly string[] {
  return requireFeed(feed).items.map((item) => item.articleId);
}

function requestAfterCursor(
  criteria: PublicDiscoveryRequest,
  cursor: string | null,
): PublicDiscoveryRequest | undefined {
  if (cursor === null) return undefined;
  return Object.freeze({
    ...criteria,
    cursorPosition: decodePublicDiscoveryCursor(cursor, criteria),
  });
}

async function assertUnsupportedFilter(
  operation: () => Promise<unknown>,
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof PublicFeedRepositoryError);
    assert.equal(error.reason, 'unsupported_discovery_filter');
    assert.equal(error.message, 'Public feed read failed.');
    assert.doesNotMatch(error.message, /missing|unapproved|archived/u);
    return true;
  });
}

class PublicStateChangingExecutor implements QueryExecutor {
  readonly #delegate: QueryExecutor;
  readonly #client: Client;
  #changed = false;

  constructor(delegate: QueryExecutor, client: Client) {
    this.#delegate = delegate;
    this.#client = client;
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>> {
    const result = await this.#delegate.query<Row>(text, values);
    if (!this.#changed && text.includes('SELECT name AS publication_name')) {
      this.#changed = true;
      await this.#client.query(
        "UPDATE publication_settings SET public_status = 'private'",
      );
    }
    return result;
  }
}
