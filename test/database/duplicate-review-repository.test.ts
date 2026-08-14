import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import {
  createDatabase,
  type QueryExecutor,
} from '../../src/database/database.ts';
import {
  detectDuplicateReviews,
  detectDuplicateReviewsInTransaction,
} from '../../src/deduplication/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const IDS = {
  sourceOne: '51000000-0000-4000-8000-000000000001',
  sourceTwo: '51000000-0000-4000-8000-000000000002',
  sourceThree: '51000000-0000-4000-8000-000000000003',
  endpointOne: '52000000-0000-4000-8000-000000000001',
  endpointTwo: '52000000-0000-4000-8000-000000000002',
  endpointThree: '52000000-0000-4000-8000-000000000003',
  runOne: '53000000-0000-4000-8000-000000000001',
  runTwo: '53000000-0000-4000-8000-000000000002',
  runThree: '53000000-0000-4000-8000-000000000003',
  articleOne: '54000000-0000-4000-8000-000000000001',
  articleTwo: '54000000-0000-4000-8000-000000000002',
  articleThree: '54000000-0000-4000-8000-000000000003',
  sameSource: '54000000-0000-4000-8000-000000000004',
  unrelated: '54000000-0000-4000-8000-000000000005',
} as const;
const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

test('detects exact cross-Source evidence and persists one ordered review set', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await insertFixture(database);

      const first = await detectDuplicateReviews(database, IDS.articleOne);
      assert.equal(first.outcome, 'evidence_evaluated');
      assert.equal(first.newlyCreatedCount, 2);
      assert.deepEqual(
        first.evaluations.map((evaluation) => evaluation.status),
        ['strong_pending', 'weak_pending'],
      );
      assert.deepEqual(first.strongPendingCandidates, [
        { articleLowId: IDS.articleOne, articleHighId: IDS.articleTwo },
      ]);

      const rows = await database.query<{
        article_low_id: string;
        article_high_id: string;
        confidence: number;
        state: string;
      }>(
        `SELECT article_low_id, article_high_id, confidence, state
         FROM duplicate_review_candidates
         ORDER BY article_low_id, article_high_id`,
      );
      assert.deepEqual(rows.rows, [
        {
          article_low_id: IDS.articleOne,
          article_high_id: IDS.articleTwo,
          confidence: 100,
          state: 'pending',
        },
        {
          article_low_id: IDS.articleOne,
          article_high_id: IDS.articleThree,
          confidence: 50,
          state: 'pending',
        },
      ]);

      const signals = await database.query<{
        article_low_id: string;
        article_high_id: string;
        signal_order: number;
        reason_code: string;
        signal_strength: string;
      }>(
        `SELECT candidate.article_low_id, candidate.article_high_id,
                signal.signal_order, signal.reason_code, signal.signal_strength
         FROM duplicate_review_candidates candidate
         JOIN duplicate_review_signals signal ON signal.candidate_id = candidate.id
         ORDER BY candidate.article_low_id, candidate.article_high_id, signal.signal_order`,
      );
      assert.deepEqual(signals.rows, [
        {
          article_low_id: IDS.articleOne,
          article_high_id: IDS.articleTwo,
          signal_order: 1,
          reason_code: 'canonical_identity_url_equal',
          signal_strength: 'strong',
        },
        {
          article_low_id: IDS.articleOne,
          article_high_id: IDS.articleTwo,
          signal_order: 2,
          reason_code: 'normalized_title_equal',
          signal_strength: 'weak',
        },
        {
          article_low_id: IDS.articleOne,
          article_high_id: IDS.articleThree,
          signal_order: 1,
          reason_code: 'normalized_title_equal',
          signal_strength: 'weak',
        },
      ]);

      const unchanged = await detectDuplicateReviews(database, IDS.articleOne);
      assert.equal(unchanged.newlyCreatedCount, 0);
      assert.deepEqual(
        unchanged.strongPendingCandidates,
        first.strongPendingCandidates,
      );

      const sameSourceCount = await database.query<{ count: string }>(
        'SELECT count(*) FROM duplicate_review_candidates WHERE article_low_id = $1 OR article_high_id = $1',
        [IDS.sameSource],
      );
      assert.equal(sameSourceCount.rows[0]?.count, '0');

      const unrelated = await detectDuplicateReviews(database, IDS.unrelated);
      assert.deepEqual(unrelated, {
        articleId: IDS.unrelated,
        outcome: 'no_evidence',
        newlyCreatedCount: 0,
        strongPendingCandidates: [],
        evaluations: [],
      });

      const articleState = await database.query<{
        visibility_state: string;
        observation_count: string;
      }>(
        `SELECT article.visibility_state,
                (SELECT count(*) FROM article_observations observation
                 WHERE observation.article_id = article.id) AS observation_count
         FROM articles article
         WHERE article.id = $1`,
        [IDS.articleOne],
      );
      assert.deepEqual(articleState.rows[0], {
        visibility_state: 'visible',
        observation_count: '1',
      });
      const groups = await database.query<{ count: string }>(
        'SELECT count(*) FROM duplicate_groups',
      );
      assert.equal(groups.rows[0]?.count, '0');
    } finally {
      await database.close();
    }
  });
});

test('preserves dismissal, reconsiders changed evidence, and keeps merged rows non-pending', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await insertFixture(database);
      await detectDuplicateReviews(database, IDS.articleOne);

      await database.query(
        `UPDATE duplicate_review_candidates
         SET state = 'dismissed', manual_decided_at = now(), manual_decision_reason = 'operator decision'
         WHERE article_low_id = $1 AND article_high_id = $2`,
        [IDS.articleOne, IDS.articleTwo],
      );
      const unchanged = await detectDuplicateReviews(database, IDS.articleOne);
      assert.equal(
        unchanged.evaluations.find(
          (evaluation) => evaluation.pair.articleHighId === IDS.articleTwo,
        )?.status,
        'dismissed_unchanged',
      );
      assert.deepEqual(unchanged.strongPendingCandidates, []);

      await database.query(
        `UPDATE articles
         SET canonical_identity_url = 'https://publisher.example/item-revised'
         WHERE id IN ($1, $2)`,
        [IDS.articleOne, IDS.articleTwo],
      );
      const reconsidered = await detectDuplicateReviews(
        database,
        IDS.articleOne,
      );
      assert.deepEqual(reconsidered.strongPendingCandidates, [
        { articleLowId: IDS.articleOne, articleHighId: IDS.articleTwo },
      ]);
      const retainedDecision = await database.query<{
        id: string;
        state: string;
        manual_decision_reason: string;
      }>(
        `SELECT id, state, manual_decision_reason
         FROM duplicate_review_candidates
         WHERE article_low_id = $1 AND article_high_id = $2`,
        [IDS.articleOne, IDS.articleTwo],
      );
      assert.equal(retainedDecision.rows.length, 1);
      assert.equal(retainedDecision.rows[0]?.state, 'pending');
      assert.equal(
        retainedDecision.rows[0]?.manual_decision_reason,
        'operator decision',
      );

      await database.query(
        `UPDATE duplicate_review_candidates
         SET state = 'merged'
         WHERE article_low_id = $1 AND article_high_id = $2`,
        [IDS.articleOne, IDS.articleTwo],
      );
      const merged = await detectDuplicateReviews(database, IDS.articleOne);
      assert.equal(
        merged.evaluations.find(
          (evaluation) => evaluation.pair.articleHighId === IDS.articleTwo,
        )?.status,
        'merged',
      );
      assert.deepEqual(merged.strongPendingCandidates, []);
      const candidateCount = await database.query<{ count: string }>(
        'SELECT count(*) FROM duplicate_review_candidates',
      );
      assert.equal(candidateCount.rows[0]?.count, '2');
    } finally {
      await database.close();
    }
  });
});

test('updates pending evidence in place and rolls back signal replacement atomically', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await insertFixture(database);
      await detectDuplicateReviews(database, IDS.articleOne);
      const before = await readCandidate(
        database,
        IDS.articleOne,
        IDS.articleThree,
      );

      await database.query(
        `UPDATE articles
         SET normalized_title = 'revised duplicate title'
         WHERE id IN ($1, $2)`,
        [IDS.articleOne, IDS.articleThree],
      );
      const changed = await detectDuplicateReviews(database, IDS.articleOne);
      assert.equal(changed.newlyCreatedCount, 0);
      const after = await readCandidate(
        database,
        IDS.articleOne,
        IDS.articleThree,
      );
      assert.notEqual(after.fingerprint, before.fingerprint);

      await database.query(
        `UPDATE articles
         SET normalized_title = 'rollback duplicate title'
         WHERE id IN ($1, $2)`,
        [IDS.articleOne, IDS.articleThree],
      );
      await assert.rejects(
        database.transaction((transaction) =>
          detectDuplicateReviewsInTransaction(
            {
              query: async <
                Row extends Record<string, unknown> = Record<string, unknown>,
              >(
                text: string,
                values?: readonly unknown[],
              ) => {
                if (text.includes('INSERT INTO duplicate_review_signals')) {
                  throw new Error('synthetic signal failure');
                }
                return transaction.query<Row>(text, values);
              },
            },
            IDS.articleOne,
          ),
        ),
      );
      const rolledBack = await readCandidate(
        database,
        IDS.articleOne,
        IDS.articleThree,
      );
      assert.equal(rolledBack.fingerprint, after.fingerprint);
      assert.deepEqual(rolledBack.signals, after.signals);
    } finally {
      await database.close();
    }
  });
});

test('concurrent same-pair detection converges to one candidate and signal set', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const firstDatabase = createDatabase({ connectionString: databaseUrl });
    const secondDatabase = createDatabase({ connectionString: databaseUrl });
    try {
      await insertFixture(firstDatabase);
      const [first, second] = await Promise.all([
        detectDuplicateReviews(firstDatabase, IDS.articleOne),
        detectDuplicateReviews(secondDatabase, IDS.articleTwo),
      ]);
      assert.equal(first.newlyCreatedCount + second.newlyCreatedCount, 4);

      const candidates = await firstDatabase.query<{ count: string }>(
        'SELECT count(*) FROM duplicate_review_candidates',
      );
      const signals = await firstDatabase.query<{ count: string }>(
        `SELECT count(*) FROM duplicate_review_signals signal
         JOIN duplicate_review_candidates candidate
           ON candidate.id = signal.candidate_id
         WHERE candidate.article_low_id = $1 AND candidate.article_high_id = $2`,
        [IDS.articleOne, IDS.articleTwo],
      );
      assert.equal(candidates.rows[0]?.count, '4');
      assert.equal(signals.rows[0]?.count, '2');
    } finally {
      await Promise.all([firstDatabase.close(), secondDatabase.close()]);
    }
  });
});

async function insertFixture(executor: QueryExecutor): Promise<void> {
  await executor.query(
    `INSERT INTO sources
       (id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state, priority)
     VALUES ($1, 'review_source_one', 'Review Source One', 'https://one.example', 'approved', 'active', 'enabled', 10),
            ($2, 'review_source_two', 'Review Source Two', 'https://two.example', 'approved', 'active', 'enabled', 5),
            ($3, 'review_source_three', 'Review Source Three', 'https://three.example', 'approved', 'active', 'enabled', 1)`,
    [IDS.sourceOne, IDS.sourceTwo, IDS.sourceThree],
  );
  await executor.query(
    `INSERT INTO source_endpoints
       (id, source_id, config_key, endpoint_url, endpoint_type, approval_state, lifecycle_state, operational_state, poll_interval_seconds)
     VALUES ($1, $4, 'review_feed_one', 'https://one.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300),
            ($2, $5, 'review_feed_two', 'https://two.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300),
            ($3, $6, 'review_feed_three', 'https://three.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300)`,
    [
      IDS.endpointOne,
      IDS.endpointTwo,
      IDS.endpointThree,
      IDS.sourceOne,
      IDS.sourceTwo,
      IDS.sourceThree,
    ],
  );
  await executor.query(
    `INSERT INTO collection_runs
       (id, source_endpoint_id, execution_id, run_status, transport_status, parser_status)
     VALUES ($1, $4, 'review_run_one', 'running', 'not_run', 'not_run'),
            ($2, $5, 'review_run_two', 'running', 'not_run', 'not_run'),
            ($3, $6, 'review_run_three', 'running', 'not_run', 'not_run')`,
    [
      IDS.runOne,
      IDS.runTwo,
      IDS.runThree,
      IDS.endpointOne,
      IDS.endpointTwo,
      IDS.endpointThree,
    ],
  );
  await executor.query(
    `INSERT INTO articles
       (id, source_id, external_id, original_url, canonical_identity_url,
        display_title, normalized_title, published_at_status, source_updated_at_status,
        first_seen_at, last_seen_at)
     VALUES
       ($1, $6, NULL, 'https://one.example/a', 'https://publisher.example/item-a',
        'Duplicate title', 'duplicate title', 'missing', 'missing', '2026-01-01', '2026-01-01'),
       ($2, $7, NULL, 'https://two.example/a', 'https://publisher.example/item-a',
        'Syndicated title', 'duplicate title', 'missing', 'missing', '2026-01-02', '2026-01-02'),
       ($3, $8, NULL, 'https://three.example/c', 'https://publisher.example/item-c',
        'Related title', 'duplicate title', 'missing', 'missing', '2026-01-03', '2026-01-03'),
       ($4, $6, 'same-source-id', 'https://one.example/same', 'https://publisher.example/item-a',
        'Same source title', 'duplicate title', 'missing', 'missing', '2026-01-04', '2026-01-04'),
       ($5, $8, NULL, 'https://three.example/e', 'https://publisher.example/item-e',
        'Unrelated title', 'unrelated title', 'missing', 'missing', '2026-01-05', '2026-01-05')`,
    [
      IDS.articleOne,
      IDS.articleTwo,
      IDS.articleThree,
      IDS.sameSource,
      IDS.unrelated,
      IDS.sourceOne,
      IDS.sourceTwo,
      IDS.sourceThree,
    ],
  );
  await executor.query(
    `INSERT INTO article_observations
       (id, source_id, source_endpoint_id, collection_run_id, article_id,
        processing_outcome, observed_canonical_identity_url)
     VALUES
       ('55000000-0000-4000-8000-000000000001', $1, $4, $7, $10, 'created', 'https://publisher.example/item-a'),
       ('55000000-0000-4000-8000-000000000002', $2, $5, $8, $11, 'created', 'https://publisher.example/item-a'),
       ('55000000-0000-4000-8000-000000000003', $3, $6, $9, $12, 'created', 'https://publisher.example/item-c')`,
    [
      IDS.sourceOne,
      IDS.sourceTwo,
      IDS.sourceThree,
      IDS.endpointOne,
      IDS.endpointTwo,
      IDS.endpointThree,
      IDS.runOne,
      IDS.runTwo,
      IDS.runThree,
      IDS.articleOne,
      IDS.articleTwo,
      IDS.articleThree,
    ],
  );
}

async function readCandidate(
  executor: QueryExecutor,
  low: string,
  high: string,
): Promise<{ fingerprint: string; signals: readonly string[] }> {
  const candidate = await executor.query<{ evidence_fingerprint: string }>(
    `SELECT evidence_fingerprint
     FROM duplicate_review_candidates
     WHERE article_low_id = $1 AND article_high_id = $2`,
    [low, high],
  );
  const signals = await executor.query<{ reason_code: string }>(
    `SELECT signal.reason_code
     FROM duplicate_review_signals signal
     JOIN duplicate_review_candidates candidate
       ON candidate.id = signal.candidate_id
     WHERE candidate.article_low_id = $1 AND candidate.article_high_id = $2
     ORDER BY signal.signal_order`,
    [low, high],
  );
  return {
    fingerprint: candidate.rows[0]!.evidence_fingerprint,
    signals: signals.rows.map((row) => row.reason_code),
  };
}
