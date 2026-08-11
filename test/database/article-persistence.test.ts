import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { Client, type QueryResultRow } from 'pg';

import {
  ArticlePersistenceError,
  persistIncludedArticle,
  type ArticlePersistenceResult,
  type ArticlePersistenceSuccess,
} from '../../src/articles/repository.ts';
import type { ArticleCandidate } from '../../src/collection/normalization/article-candidate.ts';
import {
  createDatabase,
  type Database,
  type QueryExecutor,
} from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

interface Fixture {
  readonly sourceOne: string;
  readonly sourceTwo: string;
  readonly sourceThree: string;
  readonly endpointOne: string;
  readonly endpointTwo: string;
  readonly endpointThree: string;
  readonly runOne: string;
  readonly runTwo: string;
  readonly runThree: string;
}

const OBSERVED_AT = new Date('2026-08-10T12:00:00.000Z');

test('strong identity creates, re-observes, and materially updates one Article', async () => {
  await withPersistenceDatabase(async ({ database, inspector, fixture }) => {
    const initial = candidate(fixture, {
      externalId: 'publisher-item-1',
      canonicalIdentityUrl: 'https://one.example/articles/one',
      originalUrl: 'https://one.example/articles/one?utm_source=feed',
    });
    const created = await persistIncludedArticle(
      database,
      initial,
      OBSERVED_AT,
    );
    assertSuccess(created, 'created');
    assert.equal(created.article.visibilityState, 'visible');
    assert.equal(created.article.externalId, 'publisher-item-1');
    assert.equal(created.article.originalUrl, initial.originalUrl);
    assert.equal(
      created.article.canonicalIdentityUrl,
      initial.canonicalIdentityUrl,
    );
    assert.equal(
      created.article.firstSeenAt.toISOString(),
      OBSERVED_AT.toISOString(),
    );
    assert.equal(
      created.article.lastSeenAt.toISOString(),
      OBSERVED_AT.toISOString(),
    );
    assert.equal(created.observation.articleId, created.article.id);
    assert.equal(created.observation.sourceEndpointId, fixture.endpointOne);
    assert.equal(created.observation.collectionRunId, fixture.runOne);
    assert.equal(created.observation.observedExternalId, 'publisher-item-1');

    const later = new Date('2026-08-10T13:00:00.000Z');
    const unchanged = await persistIncludedArticle(database, initial, later);
    assertSuccess(unchanged, 'unchanged');
    assert.equal(unchanged.article.id, created.article.id);
    assert.equal(
      unchanged.article.firstSeenAt.toISOString(),
      OBSERVED_AT.toISOString(),
    );
    assert.equal(
      unchanged.article.lastSeenAt.toISOString(),
      later.toISOString(),
    );
    assert.equal(
      unchanged.article.updatedAt.toISOString(),
      created.article.updatedAt.toISOString(),
    );

    const changed = candidate(fixture, {
      externalId: 'publisher-item-1',
      originalUrl: 'https://one.example/articles/renamed?ref=feed',
      canonicalIdentityUrl: 'https://one.example/articles/renamed?ref=feed',
      displayTitle: 'Corrected display title',
      normalizedTitle: 'corrected display title',
      author: 'Updated Author',
      summary: 'Updated summary',
      imageUrl: 'https://one.example/image-updated.jpg',
      language: 'en-US',
      publishedAt: {
        status: 'parsed',
        value: '2026-08-09T10:00:00.000Z',
        fallback: 'first_seen',
      },
      updatedAt: {
        status: 'parsed',
        value: '2026-08-10T12:30:00.000Z',
      },
    });
    const updated = await persistIncludedArticle(
      database,
      changed,
      new Date('2026-08-10T14:00:00.000Z'),
    );
    assertSuccess(updated, 'updated');
    assert.equal(updated.article.id, created.article.id);
    assert.equal(updated.article.externalId, 'publisher-item-1');
    assert.equal(updated.article.originalUrl, changed.originalUrl);
    assert.equal(updated.article.displayTitle, 'Corrected display title');
    assert.equal(
      updated.article.publishedAt?.toISOString(),
      '2026-08-09T10:00:00.000Z',
    );
    assert.equal(
      updated.article.sourceUpdatedAt?.toISOString(),
      '2026-08-10T12:30:00.000Z',
    );

    const replayedEarlier = await persistIncludedArticle(
      database,
      changed,
      new Date('2026-08-10T11:00:00.000Z'),
    );
    assertSuccess(replayedEarlier, 'unchanged');
    assert.equal(
      replayedEarlier.article.firstSeenAt.toISOString(),
      '2026-08-10T11:00:00.000Z',
    );
    assert.equal(
      replayedEarlier.article.lastSeenAt.toISOString(),
      '2026-08-10T14:00:00.000Z',
    );

    assert.deepEqual(await cardinality(inspector), {
      articles: 1,
      observations: 4,
    });
    const outcomes = await inspector.query<{ processing_outcome: string }>(
      `SELECT processing_outcome
       FROM article_observations
       ORDER BY observed_at, id`,
    );
    assert.deepEqual(
      outcomes.rows.map((row) => row.processing_outcome).sort(),
      ['created', 'unchanged', 'unchanged', 'updated'],
    );
  });
});

test('Source observations preserve durable visibility without changing Article outcomes or provenance', async () => {
  await withPersistenceDatabase(async ({ database, inspector, fixture }) => {
    const initial = candidate(fixture, {
      externalId: 'visibility-item',
      canonicalIdentityUrl: 'https://one.example/articles/visibility',
      originalUrl: 'https://one.example/articles/visibility',
    });
    const created = await persistIncludedArticle(
      database,
      initial,
      OBSERVED_AT,
    );
    assertSuccess(created, 'created');
    assert.equal(created.article.visibilityState, 'visible');

    await inspector.query(
      "UPDATE articles SET visibility_state = 'hidden' WHERE id = $1",
      [created.article.id],
    );
    const unchanged = await persistIncludedArticle(
      database,
      initial,
      new Date('2026-08-10T13:00:00.000Z'),
    );
    assertSuccess(unchanged, 'unchanged');
    assert.equal(unchanged.article.id, created.article.id);
    assert.equal(unchanged.article.visibilityState, 'hidden');

    await inspector.query(
      "UPDATE articles SET visibility_state = 'archived' WHERE id = $1",
      [created.article.id],
    );
    const materialUpdate = candidate(fixture, {
      externalId: 'visibility-item',
      canonicalIdentityUrl: initial.canonicalIdentityUrl,
      originalUrl: initial.originalUrl,
      displayTitle: 'Updated visibility title',
      normalizedTitle: 'updated visibility title',
    });
    const updated = await persistIncludedArticle(
      database,
      materialUpdate,
      new Date('2026-08-10T14:00:00.000Z'),
    );
    assertSuccess(updated, 'updated');
    assert.equal(updated.article.id, created.article.id);
    assert.equal(updated.article.visibilityState, 'archived');
    assert.equal(updated.observation.articleId, created.article.id);
    assert.deepEqual(await cardinality(inspector), {
      articles: 1,
      observations: 3,
    });
  });
});

test('canonical fallback is idempotent, resolves one strong Article, and promotes safely', async () => {
  await withPersistenceDatabase(async ({ database, inspector, fixture }) => {
    const canonicalUrl = 'https://one.example/articles/canonical-fallback';
    const fallbackCandidate = candidate(fixture, {
      externalId: null,
      originalUrl: canonicalUrl,
      canonicalIdentityUrl: canonicalUrl,
    });
    const created = await persistIncludedArticle(
      database,
      fallbackCandidate,
      OBSERVED_AT,
    );
    assertSuccess(created, 'created');
    assert.equal(created.article.externalId, undefined);

    const unchanged = await persistIncludedArticle(
      database,
      fallbackCandidate,
      new Date('2026-08-10T13:00:00.000Z'),
    );
    assertSuccess(unchanged, 'unchanged');
    assert.equal(unchanged.article.id, created.article.id);

    await inspector.query(
      "UPDATE articles SET visibility_state = 'hidden' WHERE id = $1",
      [created.article.id],
    );

    const strongCandidate = candidate(fixture, {
      externalId: 'later-strong-id',
      originalUrl: canonicalUrl,
      canonicalIdentityUrl: canonicalUrl,
    });
    const promoted = await persistIncludedArticle(
      database,
      strongCandidate,
      new Date('2026-08-10T14:00:00.000Z'),
    );
    assertSuccess(promoted, 'updated');
    assert.equal(promoted.article.id, created.article.id);
    assert.equal(promoted.article.externalId, 'later-strong-id');
    assert.equal(promoted.article.visibilityState, 'hidden');

    const canonicalAfterPromotion = await persistIncludedArticle(
      database,
      fallbackCandidate,
      new Date('2026-08-10T15:00:00.000Z'),
    );
    assertSuccess(canonicalAfterPromotion, 'unchanged');
    assert.equal(canonicalAfterPromotion.article.id, created.article.id);
    assert.equal(canonicalAfterPromotion.article.externalId, 'later-strong-id');
    assert.equal(canonicalAfterPromotion.article.visibilityState, 'hidden');
    assert.deepEqual(await cardinality(inspector), {
      articles: 1,
      observations: 4,
    });
  });
});

test('different strong ids may share one canonical URL while canonical-only identity conflicts conservatively', async () => {
  await withPersistenceDatabase(async ({ database, inspector, fixture }) => {
    const canonicalUrl = 'https://one.example/articles/shared-canonical';
    const first = await persistIncludedArticle(
      database,
      candidate(fixture, {
        externalId: 'strong-a',
        originalUrl: canonicalUrl,
        canonicalIdentityUrl: canonicalUrl,
      }),
      OBSERVED_AT,
    );
    const second = await persistIncludedArticle(
      database,
      candidate(fixture, {
        externalId: 'strong-b',
        originalUrl: canonicalUrl,
        canonicalIdentityUrl: canonicalUrl,
      }),
      new Date('2026-08-10T13:00:00.000Z'),
    );
    assertSuccess(first, 'created');
    assertSuccess(second, 'created');
    assert.notEqual(first.article.id, second.article.id);

    const before = await articleState(inspector);
    const conflict = await persistIncludedArticle(
      database,
      candidate(fixture, {
        externalId: null,
        originalUrl: canonicalUrl,
        canonicalIdentityUrl: canonicalUrl,
      }),
      new Date('2026-08-10T14:00:00.000Z'),
    );
    assert.deepEqual(conflict, {
      outcome: 'failed',
      reason: 'identity_conflict',
    });
    assert.deepEqual(await articleState(inspector), before);
    assert.deepEqual(await cardinality(inspector), {
      articles: 2,
      observations: 2,
    });
  });
});

test('contradictory strong identity does not cause fallback reassignment', async () => {
  await withPersistenceDatabase(async ({ database, inspector, fixture }) => {
    const canonicalUrl = 'https://one.example/articles/contradictory';
    const fallback = await persistIncludedArticle(
      database,
      candidate(fixture, {
        externalId: null,
        originalUrl: canonicalUrl,
        canonicalIdentityUrl: canonicalUrl,
      }),
      OBSERVED_AT,
    );
    assertSuccess(fallback, 'created');
    await seedStrongArticle(
      inspector,
      fixture,
      'existing-strong',
      canonicalUrl,
    );

    const third = await persistIncludedArticle(
      database,
      candidate(fixture, {
        externalId: 'new-strong',
        originalUrl: canonicalUrl,
        canonicalIdentityUrl: canonicalUrl,
      }),
      new Date('2026-08-10T13:00:00.000Z'),
    );
    assertSuccess(third, 'created');
    assert.notEqual(third.article.id, fallback.article.id);

    const rows = await inspector.query<{
      id: string;
      external_id: string | null;
    }>(
      `SELECT id, external_id
       FROM articles
       WHERE canonical_identity_url = $1
       ORDER BY external_id NULLS FIRST`,
      [canonicalUrl],
    );
    assert.deepEqual(
      rows.rows.map((row) => row.external_id),
      [null, 'existing-strong', 'new-strong'],
    );
    assert.equal(rows.rows[0]?.id, fallback.article.id);
  });
});

test('identity remains Source-scoped and provenance mismatches mutate nothing', async () => {
  await withPersistenceDatabase(async ({ database, inspector, fixture }) => {
    const canonicalUrl = 'https://shared.example/articles/source-scoped';
    const sourceOne = await persistIncludedArticle(
      database,
      candidate(fixture, {
        externalId: 'shared-external-id',
        originalUrl: canonicalUrl,
        canonicalIdentityUrl: canonicalUrl,
      }),
      OBSERVED_AT,
    );
    const sourceTwo = await persistIncludedArticle(
      database,
      candidate(fixture, {
        externalId: 'shared-external-id',
        originalUrl: canonicalUrl,
        canonicalIdentityUrl: canonicalUrl,
        provenance: {
          sourceId: fixture.sourceTwo,
          sourceEndpointId: fixture.endpointTwo,
          collectionRunId: fixture.runTwo,
        },
      }),
      OBSERVED_AT,
    );
    assertSuccess(sourceOne, 'created');
    assertSuccess(sourceTwo, 'created');
    assert.notEqual(sourceOne.article.id, sourceTwo.article.id);

    const before = await cardinality(inspector);
    for (const provenance of [
      {
        sourceId: fixture.sourceOne,
        sourceEndpointId: fixture.endpointTwo,
        collectionRunId: fixture.runTwo,
      },
      {
        sourceId: fixture.sourceOne,
        sourceEndpointId: fixture.endpointOne,
        collectionRunId: fixture.runThree,
      },
      {
        sourceId: fixture.sourceOne,
        sourceEndpointId: fixture.endpointOne,
        collectionRunId: randomUUID(),
      },
    ]) {
      assert.deepEqual(
        await persistIncludedArticle(
          database,
          candidate(fixture, {
            externalId: `mismatch-${provenance.collectionRunId}`,
            provenance,
          }),
          OBSERVED_AT,
        ),
        { outcome: 'failed', reason: 'provenance_mismatch' },
      );
    }
    assert.deepEqual(await cardinality(inspector), before);
  });
});

test('observation failure rolls back Article creation and fallback promotion', async () => {
  await withPersistenceDatabase(async ({ database, inspector, fixture }) => {
    await installFailingObservationTrigger(inspector);
    await assert.rejects(
      persistIncludedArticle(
        database,
        candidate(fixture, { externalId: 'rollback-create' }),
        OBSERVED_AT,
      ),
      boundedTransactionFailure,
    );
    assert.deepEqual(await cardinality(inspector), {
      articles: 0,
      observations: 0,
    });

    await removeFailingObservationTrigger(inspector);
    const canonicalUrl = 'https://one.example/articles/rollback-promotion';
    const fallback = await persistIncludedArticle(
      database,
      candidate(fixture, {
        externalId: null,
        originalUrl: canonicalUrl,
        canonicalIdentityUrl: canonicalUrl,
      }),
      OBSERVED_AT,
    );
    assertSuccess(fallback, 'created');

    await installFailingObservationTrigger(inspector);
    await assert.rejects(
      persistIncludedArticle(
        database,
        candidate(fixture, {
          externalId: 'rollback-promotion',
          originalUrl: canonicalUrl,
          canonicalIdentityUrl: canonicalUrl,
          displayTitle: 'Materially changed during failed promotion',
          normalizedTitle: 'materially changed during failed promotion',
        }),
        new Date('2026-08-10T13:00:00.000Z'),
      ),
      boundedTransactionFailure,
    );
    const article = await inspector.query<{
      external_id: string | null;
      display_title: string;
      last_seen_at: Date;
    }>('SELECT external_id, display_title, last_seen_at FROM articles');
    assert.deepEqual(article.rows, [
      {
        external_id: null,
        display_title: 'Display title',
        last_seen_at: OBSERVED_AT,
      },
    ]);
    assert.deepEqual(await cardinality(inspector), {
      articles: 1,
      observations: 1,
    });
  });
});

test('invalid observation time and malformed candidate fail predictably before mutation', async () => {
  await withPersistenceDatabase(async ({ database, inspector, fixture }) => {
    await assert.rejects(
      persistIncludedArticle(
        database,
        candidate(fixture),
        new Date(Number.NaN),
      ),
      (error: unknown) => {
        assert.ok(error instanceof ArticlePersistenceError);
        assert.equal(error.reason, 'invalid_observation_time');
        return true;
      },
    );
    await assert.rejects(
      persistIncludedArticle(
        database,
        { ...candidate(fixture), displayTitle: ' not normalized ' },
        OBSERVED_AT,
      ),
      (error: unknown) => {
        assert.ok(error instanceof ArticlePersistenceError);
        assert.equal(error.reason, 'invalid_candidate');
        return true;
      },
    );
    assert.deepEqual(await cardinality(inspector), {
      articles: 0,
      observations: 0,
    });
  });
});

test('near-limit high-entropy identities re-resolve through digest plus complete value', async () => {
  await withPersistenceDatabase(async ({ database, inspector, fixture }) => {
    const externalId = `external-${'x7Q!'.repeat(509)}z9!`;
    assert.equal(externalId.length, 2048);
    const urlPrefix = 'https://one.example/';
    const canonicalIdentityUrl = `${urlPrefix}${'y8R'.repeat(
      Math.floor((8192 - urlPrefix.length) / 3),
    )}${'z'.repeat((8192 - urlPrefix.length) % 3)}`;
    assert.equal(canonicalIdentityUrl.length, 8192);
    const input = candidate(fixture, {
      externalId,
      originalUrl: canonicalIdentityUrl,
      canonicalIdentityUrl,
    });

    const created = await persistIncludedArticle(database, input, OBSERVED_AT);
    const unchanged = await persistIncludedArticle(
      database,
      input,
      new Date('2026-08-10T13:00:00.000Z'),
    );
    assertSuccess(created, 'created');
    assertSuccess(unchanged, 'unchanged');
    assert.equal(unchanged.article.id, created.article.id);
    assert.equal(unchanged.article.externalId, externalId);
    assert.equal(unchanged.article.canonicalIdentityUrl, canonicalIdentityUrl);
    assert.deepEqual(await cardinality(inspector), {
      articles: 1,
      observations: 2,
    });
  });
});

test('transaction locks serialize same-identity and canonical-promotion races', async () => {
  await withPersistenceDatabase(async ({ databaseUrl, inspector, fixture }) => {
    await runRace({
      databaseUrl,
      inspector,
      fixture,
      firstCandidate: candidate(fixture, {
        externalId: 'race-same-strong',
        originalUrl: 'https://one.example/race/same-strong',
        canonicalIdentityUrl: 'https://one.example/race/same-strong',
      }),
      secondCandidate: candidate(fixture, {
        externalId: 'race-same-strong',
        originalUrl: 'https://one.example/race/same-strong',
        canonicalIdentityUrl: 'https://one.example/race/same-strong',
      }),
      firstLockCount: 2,
      expectedArticles: 1,
      expectedExternalIds: ['race-same-strong'],
    });

    await runRace({
      databaseUrl,
      inspector,
      fixture,
      firstCandidate: candidate(fixture, {
        externalId: null,
        originalUrl: 'https://one.example/race/same-canonical',
        canonicalIdentityUrl: 'https://one.example/race/same-canonical',
      }),
      secondCandidate: candidate(fixture, {
        externalId: null,
        originalUrl: 'https://one.example/race/same-canonical',
        canonicalIdentityUrl: 'https://one.example/race/same-canonical',
      }),
      firstLockCount: 1,
      expectedArticles: 1,
      expectedExternalIds: [null],
    });

    await runRace({
      databaseUrl,
      inspector,
      fixture,
      firstCandidate: candidate(fixture, {
        externalId: 'race-strong-first',
        originalUrl: 'https://one.example/race/strong-first',
        canonicalIdentityUrl: 'https://one.example/race/strong-first',
      }),
      secondCandidate: candidate(fixture, {
        externalId: null,
        originalUrl: 'https://one.example/race/strong-first',
        canonicalIdentityUrl: 'https://one.example/race/strong-first',
      }),
      firstLockCount: 2,
      expectedArticles: 1,
      expectedExternalIds: ['race-strong-first'],
    });

    await runRace({
      databaseUrl,
      inspector,
      fixture,
      firstCandidate: candidate(fixture, {
        externalId: null,
        originalUrl: 'https://one.example/race/canonical-first',
        canonicalIdentityUrl: 'https://one.example/race/canonical-first',
      }),
      secondCandidate: candidate(fixture, {
        externalId: 'race-canonical-first',
        originalUrl: 'https://one.example/race/canonical-first',
        canonicalIdentityUrl: 'https://one.example/race/canonical-first',
      }),
      firstLockCount: 1,
      expectedArticles: 1,
      expectedExternalIds: ['race-canonical-first'],
    });

    await runRace({
      databaseUrl,
      inspector,
      fixture,
      firstCandidate: candidate(fixture, {
        externalId: 'race-distinct-a',
        originalUrl: 'https://one.example/race/distinct-strong',
        canonicalIdentityUrl: 'https://one.example/race/distinct-strong',
      }),
      secondCandidate: candidate(fixture, {
        externalId: 'race-distinct-b',
        originalUrl: 'https://one.example/race/distinct-strong',
        canonicalIdentityUrl: 'https://one.example/race/distinct-strong',
      }),
      firstLockCount: 2,
      expectedArticles: 2,
      expectedExternalIds: ['race-distinct-a', 'race-distinct-b'],
    });
  });
});

interface RaceInput {
  readonly databaseUrl: string;
  readonly inspector: Client;
  readonly fixture: Fixture;
  readonly firstCandidate: ArticleCandidate;
  readonly secondCandidate: ArticleCandidate;
  readonly firstLockCount: number;
  readonly expectedArticles: number;
  readonly expectedExternalIds: readonly (string | null)[];
}

async function runRace(input: RaceInput): Promise<void> {
  const firstActor = createDatabase({ connectionString: input.databaseUrl });
  const secondActor = createDatabase({ connectionString: input.databaseUrl });
  const firstPaused = deferred<void>();
  const releaseFirst = deferred<void>();
  const firstPid = deferred<number>();
  const secondAttemptedLock = deferred<void>();
  const secondPid = deferred<number>();
  const firstDatabase = instrumentDatabase(firstActor, {
    pauseAfterLockCount: input.firstLockCount,
    paused: firstPaused,
    release: releaseFirst,
    pid: firstPid,
  });
  const secondDatabase = instrumentDatabase(secondActor, {
    attemptedLock: secondAttemptedLock,
    pid: secondPid,
  });
  let firstResult: Promise<ArticlePersistenceResult> | undefined;
  let secondResult: Promise<ArticlePersistenceResult> | undefined;

  try {
    firstResult = persistIncludedArticle(
      firstDatabase,
      input.firstCandidate,
      OBSERVED_AT,
    );
    await firstPaused.promise;
    secondResult = persistIncludedArticle(
      secondDatabase,
      input.secondCandidate,
      new Date('2026-08-10T13:00:00.000Z'),
    );
    await secondAttemptedLock.promise;
    const [firstBackendPid, secondBackendPid] = await Promise.all([
      firstPid.promise,
      secondPid.promise,
    ]);
    assert.notEqual(firstBackendPid, secondBackendPid);
    await waitForAdvisoryLockWait(input.inspector, secondBackendPid);

    releaseFirst.resolve();
    const [first, second] = await Promise.all([firstResult, secondResult]);
    assert.notEqual(first.outcome, 'failed');
    assert.notEqual(second.outcome, 'failed');
    if (first.outcome === 'failed' || second.outcome === 'failed') return;

    const canonicalUrl = input.firstCandidate.canonicalIdentityUrl;
    const rows = await input.inspector.query<{
      id: string;
      external_id: string | null;
    }>(
      `SELECT id, external_id
       FROM articles
       WHERE source_id = $1 AND canonical_identity_url = $2
       ORDER BY external_id NULLS FIRST`,
      [input.fixture.sourceOne, canonicalUrl],
    );
    assert.equal(rows.rowCount, input.expectedArticles);
    assert.deepEqual(
      rows.rows.map((row) => row.external_id),
      input.expectedExternalIds,
    );
    const observations = await input.inspector.query<{ count: string }>(
      `SELECT count(*)
       FROM article_observations
       WHERE observed_canonical_identity_url = $1`,
      [canonicalUrl],
    );
    assert.equal(observations.rows[0]?.count, '2');
    if (input.expectedArticles === 1) {
      assert.equal(first.article.id, second.article.id);
    } else {
      assert.notEqual(first.article.id, second.article.id);
    }
  } finally {
    releaseFirst.resolve();
    await Promise.all([
      firstResult?.catch(() => undefined),
      secondResult?.catch(() => undefined),
    ]);
    await Promise.all([firstActor.close(), secondActor.close()]);
  }
}

function instrumentDatabase(
  database: Pick<Database, 'transaction'>,
  options: Readonly<{
    pauseAfterLockCount?: number;
    paused?: Deferred<void>;
    release?: Deferred<void>;
    attemptedLock?: Deferred<void>;
    pid?: Deferred<number>;
  }>,
): Pick<Database, 'transaction'> {
  return {
    transaction: <T>(work: (executor: QueryExecutor) => Promise<T>) =>
      database.transaction(async (executor) => {
        const pidResult = await executor.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        );
        const backendPid = pidResult.rows[0]?.pid;
        if (backendPid === undefined) throw new Error('Missing backend PID.');
        options.pid?.resolve(backendPid);
        let lockCount = 0;
        const instrumented: QueryExecutor = {
          query: async <Row extends QueryResultRow = QueryResultRow>(
            text: string,
            values?: readonly unknown[],
          ) => {
            const isIdentityLock = text.includes('pg_advisory_xact_lock');
            if (isIdentityLock) options.attemptedLock?.resolve();
            const result = await executor.query<Row>(text, values);
            if (isIdentityLock) {
              lockCount += 1;
              if (lockCount === options.pauseAfterLockCount) {
                options.paused?.resolve();
                await options.release?.promise;
              }
            }
            return result;
          },
        };
        return work(instrumented);
      }),
  };
}

async function waitForAdvisoryLockWait(
  inspector: Client,
  backendPid: number,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const waiting = await inspector.query<{ waiting: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_locks
         WHERE pid = $1 AND locktype = 'advisory' AND granted = false
       ) AS waiting`,
      [backendPid],
    );
    if (waiting.rows[0]?.waiting === true) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Contending actor did not enter an advisory-lock wait.');
}

interface PersistenceDatabaseContext {
  readonly databaseUrl: string;
  readonly database: Database;
  readonly inspector: Client;
  readonly fixture: Fixture;
}

async function withPersistenceDatabase(
  work: (context: PersistenceDatabaseContext) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const inspector = new Client({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await inspector.connect();
      const fixture = await createFixture(inspector);
      await work({ databaseUrl, database, inspector, fixture });
    } finally {
      await Promise.all([database.close(), inspector.end()]);
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
    `INSERT INTO sources (
       id, config_key, display_name, site_url,
       approval_state, lifecycle_state, operational_state
     ) VALUES
       ($1, 'source_one', 'Source One', 'https://one.example', 'approved', 'active', 'enabled'),
       ($2, 'source_two', 'Source Two', 'https://two.example', 'approved', 'active', 'enabled'),
       ($3, 'source_three', 'Source Three', 'https://three.example', 'approved', 'active', 'enabled')`,
    [fixture.sourceOne, fixture.sourceTwo, fixture.sourceThree],
  );
  await client.query(
    `INSERT INTO source_endpoints (
       id, source_id, config_key, endpoint_url, endpoint_type,
       approval_state, lifecycle_state, operational_state, poll_interval_seconds
     ) VALUES
       ($1, $4, 'feed_one', 'https://one.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300),
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
    `INSERT INTO collection_runs (
       id, source_endpoint_id, execution_id, started_at, finished_at,
       run_status, transport_status, parser_status
     ) VALUES
       ($1, $4, 'run-one', now(), now(), 'succeeded', 'not_modified', 'not_run'),
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

function candidate(
  fixture: Fixture,
  overrides: Readonly<{
    externalId?: string | null;
    displayTitle?: string;
    normalizedTitle?: string;
    originalUrl?: string;
    canonicalIdentityUrl?: string;
    author?: string;
    summary?: string;
    imageUrl?: string;
    language?: string;
    publishedAt?: ArticleCandidate['publishedAt'];
    updatedAt?: ArticleCandidate['updatedAt'];
    provenance?: ArticleCandidate['provenance'];
  }> = {},
): ArticleCandidate {
  const externalId =
    overrides.externalId === undefined
      ? 'default-external-id'
      : overrides.externalId;
  return Object.freeze({
    ...(externalId === null ? {} : { externalId }),
    displayTitle: overrides.displayTitle ?? 'Display title',
    normalizedTitle: overrides.normalizedTitle ?? 'display title',
    originalUrl:
      overrides.originalUrl ?? 'https://one.example/articles/default',
    canonicalIdentityUrl:
      overrides.canonicalIdentityUrl ?? 'https://one.example/articles/default',
    author: overrides.author ?? 'Author Name',
    summary: overrides.summary ?? 'Summary text',
    imageUrl: overrides.imageUrl ?? 'https://one.example/image.jpg',
    language: overrides.language ?? 'en',
    publishedAt:
      overrides.publishedAt ??
      Object.freeze({ status: 'missing', fallback: 'first_seen' }),
    updatedAt: overrides.updatedAt ?? Object.freeze({ status: 'missing' }),
    provenance:
      overrides.provenance ??
      Object.freeze({
        sourceId: fixture.sourceOne,
        sourceEndpointId: fixture.endpointOne,
        collectionRunId: fixture.runOne,
      }),
  });
}

async function cardinality(
  client: Client,
): Promise<{ articles: number; observations: number }> {
  const result = await client.query<{
    articles: string;
    observations: string;
  }>(
    `SELECT (SELECT count(*) FROM articles) AS articles,
            (SELECT count(*) FROM article_observations) AS observations`,
  );
  return {
    articles: Number(result.rows[0]?.articles),
    observations: Number(result.rows[0]?.observations),
  };
}

async function articleState(client: Client): Promise<readonly unknown[]> {
  const result = await client.query(
    `SELECT id, source_id, external_id, original_url,
            canonical_identity_url, display_title, normalized_title, author,
            summary, image_url, language, published_at_status, published_at,
            source_updated_at_status, source_updated_at, visibility_state,
            first_seen_at, last_seen_at, created_at, updated_at
     FROM articles
     ORDER BY id`,
  );
  return result.rows;
}

async function seedStrongArticle(
  client: Client,
  fixture: Fixture,
  externalId: string,
  canonicalUrl: string,
): Promise<void> {
  await client.query(
    `INSERT INTO articles (
       id, source_id, external_id, original_url,
       canonical_identity_url, display_title, normalized_title,
       published_at_status, source_updated_at_status, first_seen_at, last_seen_at
     ) VALUES ($1, $2, $3, $4, $4, 'Seeded strong', 'seeded strong',
               'missing', 'missing', $5, $5)`,
    [randomUUID(), fixture.sourceOne, externalId, canonicalUrl, OBSERVED_AT],
  );
}

async function installFailingObservationTrigger(client: Client): Promise<void> {
  await client.query(
    `CREATE OR REPLACE FUNCTION fail_article_observation_insert()
     RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN
       RAISE EXCEPTION 'synthetic observation failure';
     END;
     $$;
     CREATE TRIGGER fail_article_observation_insert
     BEFORE INSERT ON article_observations
     FOR EACH ROW EXECUTE FUNCTION fail_article_observation_insert()`,
  );
}

async function removeFailingObservationTrigger(client: Client): Promise<void> {
  await client.query(
    `DROP TRIGGER fail_article_observation_insert ON article_observations;
     DROP FUNCTION fail_article_observation_insert()`,
  );
}

function boundedTransactionFailure(error: unknown): boolean {
  assert.ok(error instanceof ArticlePersistenceError);
  assert.equal(error.reason, 'transaction_failed');
  assert.equal(
    error.message,
    'Article persistence failed: transaction_failed.',
  );
  return true;
}

function assertSuccess(
  result: ArticlePersistenceResult,
  outcome: 'created' | 'updated' | 'unchanged',
): asserts result is ArticlePersistenceSuccess {
  assert.equal(result.outcome, outcome);
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value?: T | PromiseLike<T>) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value?: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise as (value?: T | PromiseLike<T>) => void;
  });
  return { promise, resolve };
}
