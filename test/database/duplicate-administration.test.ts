import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import {
  createDuplicateAdministrationService,
  DuplicateAdministrationError,
} from '../../src/admin/duplicate-administration.ts';
import {
  createDatabase,
  type QueryExecutor,
} from '../../src/database/database.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const scope = createDatabaseTestScope('migrated');
after(async () => scope.dispose());
const ids = {
  sourceA: '71000000-0000-4000-8000-000000000001',
  sourceB: '71000000-0000-4000-8000-000000000002',
  a: '72000000-0000-4000-8000-000000000001',
  b: '72000000-0000-4000-8000-000000000002',
  c: '72000000-0000-4000-8000-000000000003',
  d: '72000000-0000-4000-8000-000000000004',
  e: '72000000-0000-4000-8000-000000000005',
  f: '72000000-0000-4000-8000-000000000006',
} as const;

test('provides criteria-bound keyset review queue and canonical candidate detail without writes', async () => {
  await scope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await database.transaction(fixture);
      const service = createDuplicateAdministrationService(database);
      const stored = await database.query<{
        id: string;
        article_low_id: string;
        article_high_id: string;
      }>(
        'SELECT id, article_low_id, article_high_id FROM duplicate_review_candidates',
      );
      assert.deepEqual(stored.rows[0], {
        id: '73000000-0000-4000-8000-000000000001',
        article_low_id: ids.a,
        article_high_id: ids.b,
      });
      const first = await service.searchReviews({
        pageSize: 1,
        state: 'pending',
      });
      assert.equal(first.items.length, 1);
      assert.notEqual(first.nextCursor, null);
      const second = await service.searchReviews({
        pageSize: 1,
        state: 'pending',
        cursor: first.nextCursor,
      });
      assert.equal(second.items.length, 1);
      assert.notEqual(
        first.items[0]!.candidateId,
        second.items[0]!.candidateId,
      );
      const third = await service.searchReviews({
        pageSize: 1,
        state: 'pending',
        cursor: second.nextCursor,
      });
      assert.deepEqual(
        [first, second, third].flatMap((page) =>
          page.items.map((item) => item.candidateId),
        ),
        [
          '73000000-0000-4000-8000-000000000001',
          '73000000-0000-4000-8000-000000000003',
          '73000000-0000-4000-8000-000000000002',
        ],
      );
      assert.equal(third.nextCursor, null);
      const exactPage = await service.searchReviews({
        pageSize: 3,
        state: 'pending',
      });
      assert.equal(exactPage.items.length, 3);
      assert.equal(exactPage.nextCursor, null);
      const filtered = await service.searchReviews({
        pageSize: 2,
        state: 'pending',
        confidence: 50,
      });
      assert.deepEqual(
        filtered.items.map((item) => item.candidateId),
        [
          '73000000-0000-4000-8000-000000000003',
          '73000000-0000-4000-8000-000000000002',
        ],
      );
      await assert.rejects(
        service.searchReviews({
          pageSize: 1,
          state: 'merged',
          cursor: first.nextCursor,
        }),
        (error: unknown) =>
          error instanceof DuplicateAdministrationError &&
          error.code === 'invalid_request',
      );
      await assert.rejects(
        service.searchReviews({ cursor: 'not-a-cursor' }),
        (error: unknown) =>
          error instanceof DuplicateAdministrationError &&
          error.code === 'invalid_request',
      );
      await assert.rejects(
        service.searchReviews({ cursor: 'a'.repeat(2049) }),
        (error: unknown) =>
          error instanceof DuplicateAdministrationError &&
          error.code === 'invalid_request',
      );
      await assert.rejects(
        service.searchReviews({ pageSize: 101 }),
        (error: unknown) =>
          error instanceof DuplicateAdministrationError &&
          error.code === 'invalid_request',
      );
      await assert.rejects(
        service.getReview(randomUUID()),
        (error: unknown) =>
          error instanceof DuplicateAdministrationError &&
          error.code === 'duplicate_review_not_found',
      );

      const before = await counts(database);
      const detail = await service.getReview(first.items[0]!.candidateId);
      assert.deepEqual(
        detail.signals.map((signal) => [
          signal.order,
          signal.reasonCode,
          signal.strength,
        ]),
        [
          [1, 'canonical_identity_url_equal', 'strong'],
          [2, 'normalized_title_equal', 'weak'],
        ],
      );
      assert.equal(detail.articles[0].displayTitle, 'Updated title A');
      assert.equal(detail.automaticGroupingBlockedByManualSeparation, true);
      assert.equal(detail.automaticMergeBlockedByManualPrimaryConflict, true);
      assert.equal(detail.groups.length, 2);
      assert.deepEqual(
        detail.groups.map((group) => group.primarySelectionOrigin),
        ['manual', 'manual'],
      );
      assert.equal(detail.groups[0]!.memberCount, 101);
      assert.equal(detail.groups[0]!.members.length, 100);
      assert.equal(detail.groups[0]!.membersTruncated, true);
      const directSeparation = await service.getReview(
        '73000000-0000-4000-8000-000000000002',
      );
      assert.equal(
        directSeparation.automaticGroupingBlockedByManualSeparation,
        true,
      );
      assert.equal(
        (await service.getReview('73000000-0000-4000-8000-000000000004')).groups
          .length,
        1,
      );
      assert.equal(
        (await service.getReview('73000000-0000-4000-8000-000000000005')).groups
          .length,
        1,
      );
      assert.equal(
        (await service.getReview('73000000-0000-4000-8000-000000000006')).groups
          .length,
        0,
      );
      assert.deepEqual(await counts(database), before);
    } finally {
      await database.close();
    }
  });
});

async function fixture(executor: QueryExecutor): Promise<void> {
  await executor.query(
    `INSERT INTO sources (id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state, priority)
    VALUES ($1, 'duplicate_a', 'Duplicate A', 'https://a.example', 'approved', 'active', 'enabled', 1), ($2, 'duplicate_b', 'Duplicate B', 'https://b.example', 'approved', 'active', 'enabled', 2)`,
    [ids.sourceA, ids.sourceB],
  );
  await executor.query(
    `INSERT INTO articles (id, source_id, original_url, canonical_identity_url, display_title, normalized_title, published_at_status, source_updated_at_status, first_seen_at, last_seen_at)
    VALUES ($1,$7,'https://a.example/1','https://same.example/1','Updated title A','same','missing','missing',now(),now()), ($2,$8,'https://b.example/1','https://same.example/1','Title B','same','missing','missing',now(),now()), ($3,$7,'https://a.example/2','https://same.example/2','Title C','same','missing','missing',now(),now()), ($4,$8,'https://b.example/2','https://same.example/2','Title D','same','missing','missing',now(),now()), ($5,$7,'https://a.example/3','https://same.example/3','Title E','same','missing','missing',now(),now()), ($6,$8,'https://b.example/3','https://same.example/3','Title F','same','missing','missing',now(),now())`,
    [ids.a, ids.b, ids.c, ids.d, ids.e, ids.f, ids.sourceA, ids.sourceB],
  );
  const first = '73000000-0000-4000-8000-000000000001';
  const second = '73000000-0000-4000-8000-000000000002';
  const third = '73000000-0000-4000-8000-000000000003';
  await executor.query(
    `INSERT INTO duplicate_review_candidates (id, article_low_id, article_high_id, state, origin, confidence, evidence_fingerprint, updated_at)
    VALUES ($1,$4,$5,'pending','automatic',100,$10,'2026-01-02'), ($2,$4,$6,'pending','automatic',50,$10,'2026-01-01'), ($3,$7,$6,'pending','automatic',50,$10,'2026-01-01'), ('73000000-0000-4000-8000-000000000004',$5,$6,'dismissed','manual',50,$10,'2026-01-01'), ('73000000-0000-4000-8000-000000000005',$4,$8,'dismissed','manual',50,$10,'2026-01-01'), ('73000000-0000-4000-8000-000000000006',$8,$9,'dismissed','manual',50,$10,'2026-01-01')`,
    [
      first,
      second,
      third,
      ids.a,
      ids.b,
      ids.d,
      ids.c,
      ids.e,
      ids.f,
      'a'.repeat(64),
    ],
  );
  await executor.query(
    `INSERT INTO duplicate_review_signals (candidate_id, signal_order, reason_code, signal_strength)
    VALUES ($1,1,'canonical_identity_url_equal','strong'), ($1,2,'normalized_title_equal','weak')`,
    [first],
  );
  const groupOne = '74000000-0000-4000-8000-000000000001';
  const groupTwo = '74000000-0000-4000-8000-000000000002';
  await executor.query(
    `INSERT INTO duplicate_groups (id, primary_article_id, primary_selection_origin)
     VALUES ($1,$3,'manual'),($2,$4,'manual')`,
    [groupOne, groupTwo, ids.a, ids.b],
  );
  await executor.query(
    `INSERT INTO duplicate_group_memberships (group_id, article_id)
     VALUES ($1,$3),($1,$5),($2,$4),($2,$6)`,
    [groupOne, groupTwo, ids.a, ids.b, ids.c, ids.d],
  );
  for (let index = 7; index <= 105; index += 1) {
    const articleId = `72000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    await executor.query(
      `INSERT INTO articles (id, source_id, original_url, canonical_identity_url, display_title, normalized_title, published_at_status, source_updated_at_status, first_seen_at, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,'same','missing','missing',now(),now())`,
      [
        articleId,
        ids.sourceA,
        `https://a.example/member-${index}`,
        `https://same.example/member-${index}`,
        `Member ${index}`,
      ],
    );
    await executor.query(
      `INSERT INTO duplicate_group_memberships (group_id, article_id) VALUES ($1,$2)`,
      [groupOne, articleId],
    );
  }
  await executor.query(
    `INSERT INTO duplicate_manual_separations (article_low_id, article_high_id)
     VALUES ($1,$2)`,
    [ids.a, ids.d],
  );
}

async function counts(executor: QueryExecutor): Promise<unknown> {
  return (
    await executor.query(
      `SELECT (SELECT count(*) FROM duplicate_review_candidates) candidates, (SELECT count(*) FROM duplicate_groups) groups, (SELECT count(*) FROM duplicate_group_memberships) memberships, (SELECT count(*) FROM duplicate_manual_separations) separations, (SELECT count(*) FROM audit_events) audits`,
    )
  ).rows[0];
}
