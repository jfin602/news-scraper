import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import {
  createDatabase,
  type QueryExecutor,
} from '../../src/database/database.ts';
import {
  groupStrongDuplicateCandidate,
  groupStrongDuplicateCandidateInTransaction,
} from '../../src/deduplication/grouping.ts';
import { canonicalizeArticlePair } from '../../src/deduplication/evidence.ts';
import { detectDuplicateReviews } from '../../src/deduplication/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const ids = Object.freeze({
  sourceA: '10000000-0000-4000-8000-000000000001',
  sourceB: '10000000-0000-4000-8000-000000000002',
  sourceC: '10000000-0000-4000-8000-000000000003',
  sourceD: '10000000-0000-4000-8000-000000000004',
  endpointA: '20000000-0000-4000-8000-000000000001',
  endpointB: '20000000-0000-4000-8000-000000000002',
  endpointC: '20000000-0000-4000-8000-000000000003',
  endpointD: '20000000-0000-4000-8000-000000000004',
  runA: '30000000-0000-4000-8000-000000000001',
  runB: '30000000-0000-4000-8000-000000000002',
  runC: '30000000-0000-4000-8000-000000000003',
  runD: '30000000-0000-4000-8000-000000000004',
  a: '40000000-0000-4000-8000-000000000001',
  b: '40000000-0000-4000-8000-000000000002',
  c: '40000000-0000-4000-8000-000000000003',
  d: '40000000-0000-4000-8000-000000000004',
  weak: '40000000-0000-4000-8000-000000000005',
  sameSource: '40000000-0000-4000-8000-000000000006',
});
const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

test('groups, adds, merges, and retains Article provenance with P2 Primary selection', async () => {
  await withGroupingDatabase(async (database) => {
    await ensureCandidate(database, ids.a);
    await ensureCandidate(database, ids.c);
    const ab = pair(ids.a, ids.b);
    const cd = pair(ids.c, ids.d);
    const bc = pair(ids.b, ids.c);

    await database.query(
      "UPDATE articles SET visibility_state = 'hidden' WHERE id = $1",
      [ids.a],
    );
    const first = await groupStrongDuplicateCandidate(database, ab);
    assert.equal(first.outcome, 'grouped');
    assert.equal(first.topologyChanged, true);
    assert.equal(first.duplicateGroupedCount, 1);
    assert.equal(first.primaryArticleId, ids.b);
    assert.equal(await groupMemberCount(database, first.groupId!), 2);

    const repeat = await groupStrongDuplicateCandidate(database, ab);
    assert.equal(repeat.outcome, 'already_merged');
    assert.equal(repeat.topologyChanged, false);
    assert.equal(repeat.duplicateGroupedCount, 0);
    assert.equal(repeat.groupId, first.groupId);

    const second = await groupStrongDuplicateCandidate(database, cd);
    assert.equal(second.outcome, 'grouped');
    assert.equal(second.duplicateGroupedCount, 1);
    assert.notEqual(second.groupId, first.groupId);

    const beforeMerge = await retainedCounts(database);
    const merged = await groupStrongDuplicateCandidate(database, bc);
    assert.equal(merged.outcome, 'grouped');
    assert.equal(merged.topologyChanged, true);
    assert.equal(merged.duplicateGroupedCount, 1);
    assert.equal(merged.groupId, [first.groupId, second.groupId].sort()[0]);
    assert.equal(await groupMemberCount(database, merged.groupId!), 4);
    assert.equal(await groupCount(database), 1);
    assert.deepEqual(await retainedCounts(database), beforeMerge);
    assert.equal(await visibility(database, ids.a), 'hidden');
    assert.equal(await candidateState(database, bc), 'merged');
    await assertTopology(database);
  });
});

test('does not group weak, dismissed, or same-Source evidence', async () => {
  await withGroupingDatabase(async (database) => {
    await ensureCandidate(database, ids.a);
    const weak = await groupStrongDuplicateCandidate(
      database,
      pair(ids.a, ids.weak),
    );
    assert.deepEqual(weak, {
      outcome: 'not_actionable',
      reason: 'stale_evidence',
      groupId: undefined,
      primaryArticleId: undefined,
      topologyChanged: false,
      duplicateGroupedCount: 0,
    });

    const ab = pair(ids.a, ids.b);
    await database.query(
      `UPDATE duplicate_review_candidates
       SET state = 'dismissed'
       WHERE article_low_id = $1 AND article_high_id = $2`,
      [ab.articleLowId, ab.articleHighId],
    );
    const dismissed = await groupStrongDuplicateCandidate(database, ab);
    assert.equal(dismissed.reason, 'candidate_not_actionable');
    assert.equal(await groupCount(database), 0);

    const samePair = pair(ids.a, ids.sameSource);
    await insertSyntheticCandidate(database, samePair);
    const same = await groupStrongDuplicateCandidate(database, samePair);
    assert.equal(same.reason, 'same_source');
    assert.equal(await groupCount(database), 0);
  });
});

test('same-group reevaluation uses the P2 selector against current persisted rows', async () => {
  await withGroupingDatabase(async (database) => {
    await ensureCandidate(database, ids.a);
    const ab = pair(ids.a, ids.b);
    assert.equal(
      (await groupStrongDuplicateCandidate(database, ab)).primaryArticleId,
      ids.b,
    );

    await database.query(
      'UPDATE sources SET priority = 10 WHERE id IN ($1, $2)',
      [ids.sourceA, ids.sourceB],
    );
    await database.query(
      "UPDATE articles SET summary = 'complete', original_url = 'http://b.example/story' WHERE id = $1",
      [ids.b],
    );
    assert.equal(
      (await groupStrongDuplicateCandidate(database, ab)).primaryArticleId,
      ids.b,
    );

    await database.query(
      "UPDATE articles SET summary = NULL, original_url = 'https://b.example/story' WHERE id = $1",
      [ids.b],
    );
    assert.equal(
      (await groupStrongDuplicateCandidate(database, ab)).primaryArticleId,
      ids.b,
    );

    await database.query(
      `UPDATE articles
       SET original_url = 'https://a.example/story', published_at_status = 'parsed',
           published_at = '2026-01-01'
       WHERE id = $1`,
      [ids.a],
    );
    await database.query(
      `UPDATE articles
       SET published_at_status = 'parsed', published_at = '2026-01-02'
       WHERE id = $1`,
      [ids.b],
    );
    assert.equal(
      (await groupStrongDuplicateCandidate(database, ab)).primaryArticleId,
      ids.a,
    );

    await database.query(
      `UPDATE articles
       SET published_at_status = 'missing', published_at = NULL,
           first_seen_at = CASE WHEN id = $1 THEN '2026-01-01'::timestamptz ELSE '2026-01-02'::timestamptz END,
           created_at = CASE WHEN id = $1 THEN '2026-01-02'::timestamptz ELSE '2026-01-03'::timestamptz END
       WHERE id IN ($1, $2)`,
      [ids.a, ids.b],
    );
    assert.equal(
      (await groupStrongDuplicateCandidate(database, ab)).primaryArticleId,
      ids.a,
    );
  });
});

test('cross-connection same and crossing strong pairs converge without overlap', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const first = createDatabase({ connectionString: databaseUrl });
    const second = createDatabase({ connectionString: databaseUrl });
    try {
      await insertFixture(first);
      await ensureCandidate(first, ids.a);
      await ensureCandidate(first, ids.b);
      const [ab, bc] = await Promise.all([
        groupStrongDuplicateCandidate(first, pair(ids.a, ids.b)),
        groupStrongDuplicateCandidate(second, pair(ids.b, ids.c)),
      ]);
      assert.equal(ab.outcome, 'grouped');
      assert.equal(bc.outcome, 'grouped');
      assert.equal(await groupCount(first), 1);
      assert.equal(await groupMemberCount(first, ab.groupId!), 3);
      await assertTopology(first);
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });
});

test('concurrent connections between two existing groups choose one survivor', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const first = createDatabase({ connectionString: databaseUrl });
    const second = createDatabase({ connectionString: databaseUrl });
    try {
      await insertFixture(first);
      await ensureCandidate(first, ids.a);
      await ensureCandidate(first, ids.c);
      const ab = await groupStrongDuplicateCandidate(first, pair(ids.a, ids.b));
      const cd = await groupStrongDuplicateCandidate(first, pair(ids.c, ids.d));
      const [bc, ad] = await Promise.all([
        groupStrongDuplicateCandidate(first, pair(ids.b, ids.c)),
        groupStrongDuplicateCandidate(second, pair(ids.a, ids.d)),
      ]);
      const survivingGroup = [ab.groupId, cd.groupId].sort()[0];
      assert.equal(bc.groupId, survivingGroup);
      assert.equal(ad.groupId, survivingGroup);
      assert.equal(await groupCount(first), 1);
      assert.equal(await groupMemberCount(first, survivingGroup!), 4);
      await assertTopology(first);
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });
});

test('an injected candidate-write failure rolls back all topology and disposition changes', async () => {
  await withGroupingDatabase(async (database) => {
    await ensureCandidate(database, ids.a);
    const ab = pair(ids.a, ids.b);
    await assert.rejects(
      database.transaction((transaction) =>
        groupStrongDuplicateCandidateInTransaction(
          {
            query: async <
              Row extends Record<string, unknown> = Record<string, unknown>,
            >(
              text: string,
              values?: readonly unknown[],
            ) => {
              if (text.includes("SET state = 'merged'")) {
                throw new Error('synthetic candidate failure');
              }
              return transaction.query<Row>(text, values);
            },
          },
          ab,
        ),
      ),
    );
    assert.equal(await groupCount(database), 0);
    assert.equal(await candidateState(database, ab), 'pending');
  });
});

async function withGroupingDatabase(
  callback: (database: ReturnType<typeof createDatabase>) => Promise<void>,
): Promise<void> {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await insertFixture(database);
      await callback(database);
    } finally {
      await database.close();
    }
  });
}

async function insertFixture(executor: QueryExecutor): Promise<void> {
  await executor.query(
    `INSERT INTO sources
       (id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state, priority)
     VALUES ($1, 'group_a', 'Group A', 'https://a.example', 'approved', 'active', 'enabled', 1),
            ($2, 'group_b', 'Group B', 'https://b.example', 'approved', 'active', 'enabled', 20),
            ($3, 'group_c', 'Group C', 'https://c.example', 'approved', 'active', 'enabled', 10),
            ($4, 'group_d', 'Group D', 'https://d.example', 'approved', 'active', 'enabled', 5)`,
    [ids.sourceA, ids.sourceB, ids.sourceC, ids.sourceD],
  );
  await executor.query(
    `INSERT INTO source_endpoints
       (id, source_id, config_key, endpoint_url, endpoint_type, approval_state, lifecycle_state, operational_state, poll_interval_seconds)
     VALUES ($1, $5, 'feed_a', 'https://a.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300),
            ($2, $6, 'feed_b', 'https://b.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300),
            ($3, $7, 'feed_c', 'https://c.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300),
            ($4, $8, 'feed_d', 'https://d.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300)`,
    [
      ids.endpointA,
      ids.endpointB,
      ids.endpointC,
      ids.endpointD,
      ids.sourceA,
      ids.sourceB,
      ids.sourceC,
      ids.sourceD,
    ],
  );
  await executor.query(
    `INSERT INTO collection_runs
       (id, source_endpoint_id, execution_id, run_status, transport_status, parser_status)
     VALUES ($1, $5, 'group_run_a', 'running', 'not_run', 'not_run'),
            ($2, $6, 'group_run_b', 'running', 'not_run', 'not_run'),
            ($3, $7, 'group_run_c', 'running', 'not_run', 'not_run'),
            ($4, $8, 'group_run_d', 'running', 'not_run', 'not_run')`,
    [
      ids.runA,
      ids.runB,
      ids.runC,
      ids.runD,
      ids.endpointA,
      ids.endpointB,
      ids.endpointC,
      ids.endpointD,
    ],
  );
  await executor.query(
    `INSERT INTO articles
       (id, source_id, original_url, canonical_identity_url, display_title, normalized_title,
        published_at_status, source_updated_at_status, first_seen_at, last_seen_at)
     VALUES ($1, $7, 'http://a.example/story', 'https://publisher.example/story', 'Story A', 'shared title', 'missing', 'missing', '2026-01-01', '2026-01-01'),
            ($2, $8, 'https://b.example/story', 'https://publisher.example/story', 'Story B', 'shared title', 'missing', 'missing', '2026-01-02', '2026-01-02'),
            ($3, $9, 'https://c.example/story', 'https://publisher.example/story', 'Story C', 'shared title', 'missing', 'missing', '2026-01-03', '2026-01-03'),
            ($4, $10, 'https://d.example/story', 'https://publisher.example/story', 'Story D', 'shared title', 'missing', 'missing', '2026-01-04', '2026-01-04'),
            ($5, $9, 'https://c.example/weak', 'https://publisher.example/weak', 'Weak Story', 'shared title', 'missing', 'missing', '2026-01-05', '2026-01-05'),
            ($6, $7, 'https://a.example/alias', 'https://publisher.example/alias', 'Alias Story', 'shared title', 'missing', 'missing', '2026-01-06', '2026-01-06')`,
    [
      ids.a,
      ids.b,
      ids.c,
      ids.d,
      ids.weak,
      ids.sameSource,
      ids.sourceA,
      ids.sourceB,
      ids.sourceC,
      ids.sourceD,
    ],
  );
  for (const [articleId, sourceId, endpointId, runId] of [
    [ids.a, ids.sourceA, ids.endpointA, ids.runA],
    [ids.b, ids.sourceB, ids.endpointB, ids.runB],
    [ids.c, ids.sourceC, ids.endpointC, ids.runC],
    [ids.d, ids.sourceD, ids.endpointD, ids.runD],
  ]) {
    await executor.query(
      `INSERT INTO article_observations
         (id, source_id, source_endpoint_id, collection_run_id, article_id, processing_outcome, observed_canonical_identity_url)
       VALUES ($1, $2, $3, $4, $5, 'created', 'https://publisher.example/story')`,
      [randomUUID(), sourceId, endpointId, runId, articleId],
    );
  }
}

async function ensureCandidate(
  database: ReturnType<typeof createDatabase>,
  articleId: string,
): Promise<void> {
  await detectDuplicateReviews(database, articleId);
}

async function insertSyntheticCandidate(
  executor: QueryExecutor,
  candidate: { readonly articleLowId: string; readonly articleHighId: string },
): Promise<void> {
  await executor.query(
    `INSERT INTO duplicate_review_candidates
       (id, article_low_id, article_high_id, state, origin, confidence, evidence_fingerprint)
     VALUES ($1, $2, $3, 'pending', 'automatic', 100, $4)`,
    [
      randomUUID(),
      candidate.articleLowId,
      candidate.articleHighId,
      'a'.repeat(64),
    ],
  );
}

function pair(first: string, second: string) {
  return canonicalizeArticlePair(first, second);
}

async function groupCount(executor: QueryExecutor): Promise<number> {
  const result = await executor.query<{ count: string }>(
    'SELECT count(*) FROM duplicate_groups',
  );
  return Number(result.rows[0]?.count);
}

async function groupMemberCount(
  executor: QueryExecutor,
  groupId: string,
): Promise<number> {
  const result = await executor.query<{ count: string }>(
    'SELECT count(*) FROM duplicate_group_memberships WHERE group_id = $1',
    [groupId],
  );
  return Number(result.rows[0]?.count);
}

async function candidateState(
  executor: QueryExecutor,
  candidate: { readonly articleLowId: string; readonly articleHighId: string },
): Promise<string | undefined> {
  const result = await executor.query<{ state: string }>(
    `SELECT state FROM duplicate_review_candidates
     WHERE article_low_id = $1 AND article_high_id = $2`,
    [candidate.articleLowId, candidate.articleHighId],
  );
  return result.rows[0]?.state;
}

async function retainedCounts(executor: QueryExecutor): Promise<unknown> {
  const result = await executor.query(
    `SELECT (SELECT count(*) FROM articles) AS articles,
            (SELECT count(*) FROM article_observations) AS observations`,
  );
  return result.rows[0];
}

async function visibility(
  executor: QueryExecutor,
  articleId: string,
): Promise<string | undefined> {
  const result = await executor.query<{ visibility_state: string }>(
    'SELECT visibility_state FROM articles WHERE id = $1',
    [articleId],
  );
  return result.rows[0]?.visibility_state;
}

async function assertTopology(executor: QueryExecutor): Promise<void> {
  const invalidPrimary = await executor.query<{ count: string }>(
    `SELECT count(*)
     FROM duplicate_groups grp
     LEFT JOIN duplicate_group_memberships membership
       ON membership.group_id = grp.id AND membership.article_id = grp.primary_article_id
     WHERE membership.article_id IS NULL`,
  );
  const overlapping = await executor.query<{ count: string }>(
    `SELECT count(*) FROM (
       SELECT article_id FROM duplicate_group_memberships
       GROUP BY article_id HAVING count(*) > 1
     ) overlap`,
  );
  assert.equal(invalidPrimary.rows[0]?.count, '0');
  assert.equal(overlapping.rows[0]?.count, '0');
}
