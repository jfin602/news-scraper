import { randomUUID } from 'node:crypto';

import type { Database, QueryExecutor } from '../database/database.ts';
import { canonicalizeArticlePair } from './evidence.ts';
import {
  acquireDuplicateTopologyLocksForArticles,
  selectDuplicateGroupPrimaryInTransaction,
} from './grouping.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export type DuplicateModerationOutcome =
  'changed' | 'no_op' | 'conflict' | 'not_found';
export interface DuplicateModerationResult {
  readonly outcome: DuplicateModerationOutcome;
  readonly groupId?: string;
  readonly primaryArticleId?: string;
}

export class DuplicateModerationError extends Error {
  readonly reason: 'invalid_input' | 'transaction_failed';

  constructor(
    reason: 'invalid_input' | 'transaction_failed',
    options?: ErrorOptions,
  ) {
    super(`Duplicate moderation failed: ${reason}.`, options);
    this.name = 'DuplicateModerationError';
    this.reason = reason;
  }
}

/** Dismisses an existing actionable review without destroying its evidence. */
export async function dismissDuplicateReview(
  database: Pick<Database, 'transaction'>,
  candidateId: string,
  reason: string | null = null,
): Promise<DuplicateModerationResult> {
  assertUuid(candidateId);
  assertReason(reason);
  return database.transaction(async (executor) => {
    const row = await executor.query<CandidateRow>(
      `SELECT id, state FROM duplicate_review_candidates WHERE id = $1 FOR UPDATE`,
      [candidateId],
    );
    const candidate = row.rows[0];
    if (candidate === undefined) return { outcome: 'not_found' };
    if (candidate.state === 'dismissed') return { outcome: 'no_op' };
    if (candidate.state !== 'pending') return { outcome: 'conflict' };
    await executor.query(
      `UPDATE duplicate_review_candidates
       SET state = 'dismissed', origin = 'manual', manual_decided_at = now(),
           manual_decision_reason = $2, updated_at = now() WHERE id = $1`,
      [candidateId, reason],
    );
    await audit(
      executor,
      'duplicate_review_dismissed',
      'duplicate_review_candidate',
      candidateId,
      reason,
      { state: 'pending' },
      { state: 'dismissed' },
    );
    return { outcome: 'changed' };
  });
}

/** Explicitly makes selected Articles/current components a single group. */
export async function mergeDuplicateArticles(
  database: Pick<Database, 'transaction'>,
  articleIds: readonly string[],
  input: Readonly<{ primaryArticleId?: string; reason?: string | null }> = {},
): Promise<DuplicateModerationResult> {
  const ids = uniqueIds(articleIds);
  if (ids.length < 2) throw new DuplicateModerationError('invalid_input');
  if (input.primaryArticleId !== undefined) assertUuid(input.primaryArticleId);
  assertReason(input.reason ?? null);
  return database.transaction((executor) =>
    mergeInTransaction(executor, ids, input),
  );
}

/** Removes selected members from a group, leaving them individually ungrouped. */
export async function splitDuplicateGroup(
  database: Pick<Database, 'transaction'>,
  groupId: string,
  articleIds: readonly string[],
  reason: string | null = null,
): Promise<DuplicateModerationResult> {
  assertUuid(groupId);
  const ids = uniqueIds(articleIds);
  assertReason(reason);
  if (ids.length === 0) throw new DuplicateModerationError('invalid_input');
  return database.transaction(async (executor) => {
    await acquireDuplicateTopologyLocksForArticles(executor, ids);
    const group = await executor.query<GroupRow>(
      `SELECT id, primary_article_id, primary_selection_origin FROM duplicate_groups WHERE id = $1 FOR UPDATE`,
      [groupId],
    );
    const current = group.rows[0];
    if (current === undefined) return { outcome: 'not_found' };
    const members = await groupMemberIds(executor, groupId);
    const removed = ids.filter((id) => members.includes(id));
    if (removed.length === 0) return { outcome: 'conflict' };
    const remaining = members.filter((id) => !removed.includes(id));
    await executor.query(
      `DELETE FROM duplicate_group_memberships WHERE group_id = $1 AND article_id = ANY($2::uuid[])`,
      [groupId, removed],
    );
    if (remaining.length < 2) {
      await executor.query(
        `DELETE FROM duplicate_group_memberships WHERE group_id = $1`,
        [groupId],
      );
      await executor.query(`DELETE FROM duplicate_groups WHERE id = $1`, [
        groupId,
      ]);
    } else if (
      current.primary_selection_origin === 'manual' &&
      removed.includes(uuid(current.primary_article_id))
    ) {
      await selectDuplicateGroupPrimaryInTransaction(executor, groupId);
    }
    await insertSeparations(
      executor,
      formerlyTogetherPairs(removed, remaining),
    );
    await executor.query(
      `UPDATE duplicate_review_candidates
       SET state = 'dismissed', origin = 'manual', manual_decided_at = now(),
           manual_decision_reason = $2, updated_at = now()
       WHERE state = 'merged'
         AND ((article_low_id = ANY($1::uuid[]) AND article_high_id = ANY($3::uuid[]))
           OR (article_high_id = ANY($1::uuid[]) AND article_low_id = ANY($3::uuid[])))`,
      [removed, reason, remaining.concat(removed)],
    );
    await audit(
      executor,
      'duplicate_group_split',
      'duplicate_group',
      groupId,
      reason,
      { memberCount: members.length },
      { memberCount: remaining.length },
    );
    return remaining.length >= 2
      ? { outcome: 'changed', groupId }
      : { outcome: 'changed' };
  });
}

export async function chooseDuplicatePrimary(
  database: Pick<Database, 'transaction'>,
  groupId: string,
  articleId: string,
  reason: string | null = null,
): Promise<DuplicateModerationResult> {
  assertUuid(groupId);
  assertUuid(articleId);
  assertReason(reason);
  return database.transaction(async (executor) => {
    await acquireDuplicateTopologyLocksForArticles(executor, [articleId]);
    const group = await executor.query<GroupRow>(
      `SELECT id, primary_article_id, primary_selection_origin FROM duplicate_groups WHERE id = $1 FOR UPDATE`,
      [groupId],
    );
    const current = group.rows[0];
    if (current === undefined) return { outcome: 'not_found' };
    const members = await groupMemberIds(executor, groupId);
    if (!members.includes(articleId.toLowerCase()))
      return { outcome: 'conflict' };
    if (
      uuid(current.primary_article_id) === articleId.toLowerCase() &&
      current.primary_selection_origin === 'manual'
    )
      return {
        outcome: 'no_op',
        groupId,
        primaryArticleId: articleId.toLowerCase(),
      };
    await executor.query(
      `UPDATE duplicate_groups SET primary_article_id = $2, primary_selection_origin = 'manual', updated_at = now() WHERE id = $1`,
      [groupId, articleId],
    );
    await audit(
      executor,
      'duplicate_primary_chosen',
      'duplicate_group',
      groupId,
      reason,
      {
        primaryArticleId: uuid(current.primary_article_id),
        origin: current.primary_selection_origin,
      },
      { primaryArticleId: articleId.toLowerCase(), origin: 'manual' },
    );
    return {
      outcome: 'changed',
      groupId,
      primaryArticleId: articleId.toLowerCase(),
    };
  });
}

export async function readDuplicateReviewQueue(
  executor: QueryExecutor,
  input: Readonly<{
    state?: 'pending' | 'dismissed' | 'merged' | 'superseded';
    confidence?: 50 | 100;
    limit?: number;
  }> = {},
): Promise<readonly DuplicateReviewQueueItem[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const result = await executor.query<QueueRow>(
    `SELECT candidate.id, candidate.article_low_id, candidate.article_high_id, candidate.state,
            candidate.origin, candidate.confidence, candidate.evidence_fingerprint,
            candidate.manual_decided_at, candidate.manual_decision_reason,
            low.display_title AS low_title, high.display_title AS high_title,
            EXISTS (SELECT 1 FROM duplicate_manual_separations s
                    WHERE s.article_low_id = candidate.article_low_id AND s.article_high_id = candidate.article_high_id) AS manually_separated
     FROM duplicate_review_candidates candidate
     JOIN articles low ON low.id = candidate.article_low_id
     JOIN articles high ON high.id = candidate.article_high_id
     WHERE ($1::text IS NULL OR candidate.state = $1)
       AND ($2::smallint IS NULL OR candidate.confidence = $2)
     ORDER BY candidate.updated_at DESC, candidate.id DESC LIMIT $3`,
    [input.state ?? null, input.confidence ?? null, limit],
  );
  return Object.freeze(
    result.rows.map((row) =>
      Object.freeze({
        candidateId: uuid(row.id),
        articleLowId: uuid(row.article_low_id),
        articleHighId: uuid(row.article_high_id),
        state: state(row.state),
        origin: origin(row.origin),
        confidence: confidence(row.confidence),
        evidenceFingerprint: text(row.evidence_fingerprint, 64),
        manualDecidedAt:
          row.manual_decided_at instanceof Date
            ? new Date(row.manual_decided_at)
            : null,
        manualDecisionReason:
          row.manual_decision_reason === null
            ? null
            : text(row.manual_decision_reason, 2000),
        articleSummaries: Object.freeze([
          text(row.low_title, 2048),
          text(row.high_title, 2048),
        ]),
        manuallySeparated: row.manually_separated === true,
      }),
    ),
  );
}

export interface DuplicateReviewQueueItem {
  readonly candidateId: string;
  readonly articleLowId: string;
  readonly articleHighId: string;
  readonly state: 'pending' | 'dismissed' | 'merged' | 'superseded';
  readonly origin: 'automatic' | 'manual';
  readonly confidence: 50 | 100;
  readonly evidenceFingerprint: string;
  readonly manualDecidedAt: Date | null;
  readonly manualDecisionReason: string | null;
  readonly articleSummaries: readonly string[];
  readonly manuallySeparated: boolean;
}
interface CandidateRow {
  readonly id: unknown;
  readonly state: unknown;
}
interface GroupRow {
  readonly id: unknown;
  readonly primary_article_id: unknown;
  readonly primary_selection_origin: unknown;
}
interface QueueRow extends GroupRow {
  readonly article_low_id: unknown;
  readonly article_high_id: unknown;
  readonly state: unknown;
  readonly origin: unknown;
  readonly confidence: unknown;
  readonly evidence_fingerprint: unknown;
  readonly manual_decided_at: unknown;
  readonly manual_decision_reason: unknown;
  readonly low_title: unknown;
  readonly high_title: unknown;
  readonly manually_separated: unknown;
}

async function mergeInTransaction(
  executor: QueryExecutor,
  selected: readonly string[],
  input: Readonly<{ primaryArticleId?: string; reason?: string | null }>,
): Promise<DuplicateModerationResult> {
  await acquireDuplicateTopologyLocksForArticles(executor, selected);
  const components = await executor.query<{
    readonly group_id: unknown;
    readonly article_id: unknown;
  }>(
    `SELECT group_id, article_id FROM duplicate_group_memberships WHERE article_id = ANY($1::uuid[]) FOR UPDATE`,
    [selected],
  );
  const groups = [
    ...new Set(components.rows.map((row) => uuid(row.group_id))),
  ].sort();
  const memberRows =
    groups.length === 0
      ? []
      : (
          await executor.query<{ readonly article_id: unknown }>(
            `SELECT article_id FROM duplicate_group_memberships WHERE group_id = ANY($1::uuid[]) FOR UPDATE`,
            [groups],
          )
        ).rows;
  const members = [
    ...new Set([...selected, ...memberRows.map((row) => uuid(row.article_id))]),
  ].sort();
  const existing =
    groups.length === 0
      ? []
      : (
          await executor.query<GroupRow>(
            `SELECT id, primary_article_id, primary_selection_origin FROM duplicate_groups WHERE id = ANY($1::uuid[]) FOR UPDATE`,
            [groups],
          )
        ).rows;
  const manual = existing
    .filter((row) => row.primary_selection_origin === 'manual')
    .map((row) => uuid(row.primary_article_id));
  if (input.primaryArticleId === undefined && new Set(manual).size > 1)
    return { outcome: 'conflict' };
  if (
    input.primaryArticleId !== undefined &&
    !members.includes(input.primaryArticleId.toLowerCase())
  )
    return { outcome: 'conflict' };
  const groupId = groups[0] ?? randomUUID();
  if (groups.length === 0) {
    await executor.query(
      `INSERT INTO duplicate_groups (id, primary_article_id) VALUES ($1, $2)`,
      [groupId, members[0]],
    );
    await executor.query(
      `INSERT INTO duplicate_group_memberships (group_id, article_id) SELECT $1, unnest($2::uuid[])`,
      [groupId, members],
    );
  } else {
    await executor.query(
      `INSERT INTO duplicate_group_memberships (group_id, article_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT (article_id) DO NOTHING`,
      [groupId, selected],
    );
    if (groups.length > 1) {
      await executor.query(
        `UPDATE duplicate_group_memberships SET group_id = $1 WHERE group_id = ANY($2::uuid[])`,
        [groupId, groups.slice(1)],
      );
      await executor.query(
        `DELETE FROM duplicate_groups WHERE id = ANY($1::uuid[])`,
        [groups.slice(1)],
      );
    }
  }
  if (input.primaryArticleId !== undefined || manual.length === 1) {
    const primary = input.primaryArticleId?.toLowerCase() ?? manual[0]!;
    await executor.query(
      `UPDATE duplicate_groups SET primary_article_id = $2, primary_selection_origin = 'manual', updated_at = now() WHERE id = $1`,
      [groupId, primary],
    );
  } else await selectDuplicateGroupPrimaryInTransaction(executor, groupId);
  await executor.query(
    `DELETE FROM duplicate_manual_separations WHERE article_low_id = ANY($1::uuid[]) AND article_high_id = ANY($1::uuid[])`,
    [members],
  );
  await executor.query(
    `UPDATE duplicate_review_candidates SET state = 'merged', updated_at = now() WHERE article_low_id = ANY($1::uuid[]) AND article_high_id = ANY($1::uuid[])`,
    [members],
  );
  const primary = await executor.query<{
    readonly primary_article_id: unknown;
  }>(`SELECT primary_article_id FROM duplicate_groups WHERE id = $1`, [
    groupId,
  ]);
  await audit(
    executor,
    'duplicate_group_merged',
    'duplicate_group',
    groupId,
    input.reason ?? null,
    { memberCount: selected.length },
    { memberCount: members.length },
  );
  return {
    outcome: 'changed',
    groupId,
    primaryArticleId: uuid(primary.rows[0]!.primary_article_id),
  };
}

async function groupMemberIds(
  executor: QueryExecutor,
  groupId: string,
): Promise<string[]> {
  const r = await executor.query<{ readonly article_id: unknown }>(
    `SELECT article_id FROM duplicate_group_memberships WHERE group_id = $1 ORDER BY article_id FOR UPDATE`,
    [groupId],
  );
  return r.rows.map((row) => uuid(row.article_id));
}
async function insertSeparations(
  executor: QueryExecutor,
  pairs: readonly (readonly [string, string])[],
): Promise<void> {
  for (const [low, high] of pairs)
    await executor.query(
      `INSERT INTO duplicate_manual_separations (article_low_id, article_high_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [low, high],
    );
}
function formerlyTogetherPairs(
  removed: readonly string[],
  remaining: readonly string[],
): readonly (readonly [string, string])[] {
  const all = [...removed, ...remaining];
  const pairs: [string, string][] = [];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      if (removed.includes(all[i]!) || removed.includes(all[j]!)) {
        const p = canonicalizeArticlePair(all[i]!, all[j]!);
        pairs.push([p.articleLowId, p.articleHighId]);
      }
    }
  return pairs;
}
async function audit(
  executor: QueryExecutor,
  action: string,
  targetType: string,
  targetId: string,
  reason: string | null,
  prior: Record<string, unknown>,
  next: Record<string, unknown>,
): Promise<void> {
  await executor.query(
    `INSERT INTO audit_events (id, action, target_type, target_id, reason, prior_state, new_state) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
    [
      randomUUID(),
      action,
      targetType,
      targetId,
      reason,
      JSON.stringify(prior),
      JSON.stringify(next),
    ],
  );
}
function uniqueIds(ids: readonly string[]): string[] {
  const result = [
    ...new Set(
      ids.map((id) => {
        assertUuid(id);
        return id.toLowerCase();
      }),
    ),
  ].sort();
  return result;
}
function assertUuid(value: string): void {
  if (typeof value !== 'string' || !UUID.test(value))
    throw new DuplicateModerationError('invalid_input');
}
function assertReason(value: string | null): void {
  if (
    value !== null &&
    (value !== value.trim() || value.length === 0 || value.length > 2000)
  )
    throw new DuplicateModerationError('invalid_input');
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value))
    throw new DuplicateModerationError('transaction_failed');
  return value.toLowerCase();
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max)
    throw new DuplicateModerationError('transaction_failed');
  return value;
}
function state(value: unknown): DuplicateReviewQueueItem['state'] {
  if (
    value === 'pending' ||
    value === 'dismissed' ||
    value === 'merged' ||
    value === 'superseded'
  )
    return value;
  throw new DuplicateModerationError('transaction_failed');
}
function origin(value: unknown): 'automatic' | 'manual' {
  if (value === 'automatic' || value === 'manual') return value;
  throw new DuplicateModerationError('transaction_failed');
}
function confidence(value: unknown): 50 | 100 {
  if (value === 50 || value === 100) return value;
  throw new DuplicateModerationError('transaction_failed');
}
