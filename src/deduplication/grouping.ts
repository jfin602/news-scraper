import { createHash, randomUUID } from 'node:crypto';

import {
  ARTICLE_COLUMNS,
  mapArticleRow,
  type ArticleRow,
  type PersistedArticle,
} from '../articles/repository.ts';
import type { Database, QueryExecutor } from '../database/database.ts';
import {
  canonicalizeArticlePair,
  evaluateDuplicateEvidence,
  type CanonicalArticlePair,
} from './evidence.ts';
import { selectPrimary } from './primary.ts';

const DUPLICATE_TOPOLOGY_LOCK_NAMESPACE =
  'news-scraper:duplicate-topology-transaction-lock:v1';
const DUPLICATE_TOPOLOGY_GLOBAL_LOCK_KEY = advisoryLockKey('global');
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

type CandidateState = 'pending' | 'dismissed' | 'merged' | 'superseded';

export type DuplicateGroupingNoopReason =
  | 'candidate_not_found'
  | 'candidate_not_actionable'
  | 'stale_evidence'
  | 'same_source';

export interface DuplicateGroupingResult {
  readonly outcome: 'grouped' | 'already_merged' | 'not_actionable';
  readonly reason: DuplicateGroupingNoopReason | undefined;
  readonly groupId: string | undefined;
  readonly primaryArticleId: string | undefined;
  readonly topologyChanged: boolean;
  readonly duplicateGroupedCount: 0 | 1;
}

export type DuplicateGroupingErrorReason =
  'invalid_pair' | 'transaction_failed';

export class DuplicateGroupingError extends Error {
  readonly reason: DuplicateGroupingErrorReason;

  constructor(reason: DuplicateGroupingErrorReason, options?: ErrorOptions) {
    super(`Duplicate grouping failed: ${reason}.`, options);
    this.name = 'DuplicateGroupingError';
    this.reason = reason;
  }
}

interface CandidateRow {
  readonly id: unknown;
  readonly article_low_id: unknown;
  readonly article_high_id: unknown;
  readonly state: unknown;
  readonly confidence: unknown;
  readonly evidence_fingerprint: unknown;
}

interface SignalRow {
  readonly signal_order: unknown;
  readonly reason_code: unknown;
  readonly signal_strength: unknown;
}

interface MembershipRow {
  readonly article_id: unknown;
  readonly group_id: unknown;
}

interface GroupRow {
  readonly id: unknown;
  readonly primary_article_id: unknown;
}

/**
 * Applies one P3 review candidate inside the caller's transaction. The
 * database-wide topology gate is deliberately followed by sorted Article
 * advisory locks. The gate covers membership expansion during group merges;
 * the per-Article locks make the stable ownership order explicit and provide
 * a collision-safe boundary for future narrower topology work.
 */
export async function groupStrongDuplicateCandidateInTransaction(
  executor: QueryExecutor,
  pair: CanonicalArticlePair,
): Promise<DuplicateGroupingResult> {
  const canonicalPair = validatePair(pair);
  try {
    await acquireDuplicateTopologyLocks(executor, canonicalPair);

    const candidate = await loadCandidateForUpdate(executor, canonicalPair);
    if (candidate === undefined) return noAction('candidate_not_found');

    const candidateState = requiredCandidateState(candidate.state);
    if (candidateState === 'dismissed' || candidateState === 'superseded') {
      return noAction('candidate_not_actionable');
    }

    const articles = await loadPairArticlesForUpdate(executor, canonicalPair);
    if (articles === undefined) {
      throw new DuplicateGroupingError('transaction_failed', {
        cause: new Error('candidate references missing Article'),
      });
    }
    if (articles[0].sourceId === articles[1].sourceId)
      return noAction('same_source');

    const evidence = evaluateDuplicateEvidence(articles[0], articles[1]);
    const signals = await loadSignalsForUpdate(
      executor,
      requiredUuid(candidate.id),
    );
    if (
      evidence === undefined ||
      evidence.strength !== 'strong' ||
      requiredConfidence(candidate.confidence) !== evidence.confidence ||
      requiredFingerprint(candidate.evidence_fingerprint) !==
        evidence.evidenceFingerprint ||
      !signalsMatchEvidence(signals, evidence.signals)
    ) {
      return noAction('stale_evidence');
    }

    const memberships = await loadPairMembershipsForUpdate(
      executor,
      canonicalPair,
    );
    const firstGroupId = memberships.get(articles[0].id);
    const secondGroupId = memberships.get(articles[1].id);

    if (candidateState === 'merged') {
      if (firstGroupId === undefined || firstGroupId !== secondGroupId) {
        throw new DuplicateGroupingError('transaction_failed', {
          cause: new Error('merged candidate has no shared Duplicate group'),
        });
      }
      const primary = await reselectPrimary(executor, firstGroupId);
      return groupedResult('already_merged', firstGroupId, primary.id, false);
    }

    let groupId: string;
    let topologyChanged: boolean;
    if (firstGroupId === undefined && secondGroupId === undefined) {
      groupId = randomUUID();
      await executor.query(
        `INSERT INTO duplicate_groups (id, primary_article_id)
         VALUES ($1, $2)`,
        [groupId, articles[0].id],
      );
      await executor.query(
        `INSERT INTO duplicate_group_memberships (group_id, article_id)
         VALUES ($1, $2), ($1, $3)`,
        [groupId, articles[0].id, articles[1].id],
      );
      topologyChanged = true;
    } else if (firstGroupId === undefined || secondGroupId === undefined) {
      groupId = firstGroupId ?? secondGroupId!;
      const ungroupedArticleId =
        firstGroupId === undefined ? articles[0].id : articles[1].id;
      await executor.query(
        `INSERT INTO duplicate_group_memberships (group_id, article_id)
         VALUES ($1, $2)`,
        [groupId, ungroupedArticleId],
      );
      topologyChanged = true;
    } else if (firstGroupId === secondGroupId) {
      groupId = firstGroupId;
      topologyChanged = false;
    } else {
      const [survivingGroupId, losingGroupId] =
        firstGroupId < secondGroupId
          ? [firstGroupId, secondGroupId]
          : [secondGroupId, firstGroupId];
      await executor.query(
        `UPDATE duplicate_group_memberships
         SET group_id = $1
         WHERE group_id = $2`,
        [survivingGroupId, losingGroupId],
      );
      await executor.query('DELETE FROM duplicate_groups WHERE id = $1', [
        losingGroupId,
      ]);
      groupId = survivingGroupId;
      topologyChanged = true;
    }

    const primary = await reselectPrimary(executor, groupId);
    await executor.query(
      `UPDATE duplicate_review_candidates
       SET state = 'merged', updated_at = now()
       WHERE id = $1`,
      [requiredUuid(candidate.id)],
    );
    return groupedResult('grouped', groupId, primary.id, topologyChanged);
  } catch (error) {
    if (error instanceof DuplicateGroupingError) throw error;
    throw new DuplicateGroupingError('transaction_failed', { cause: error });
  }
}

/** Convenience wrapper for tests and standalone operator-free callers. */
export async function groupStrongDuplicateCandidate(
  database: Pick<Database, 'transaction'>,
  pair: CanonicalArticlePair,
): Promise<DuplicateGroupingResult> {
  validatePair(pair);
  try {
    return await database.transaction((transaction) =>
      groupStrongDuplicateCandidateInTransaction(transaction, pair),
    );
  } catch (error) {
    if (error instanceof DuplicateGroupingError) throw error;
    throw new DuplicateGroupingError('transaction_failed', { cause: error });
  }
}

export function duplicateTopologyArticleLockKey(articleId: string): string {
  if (!UUID_PATTERN.test(articleId)) {
    throw new TypeError('Duplicate topology Article id must be a UUID.');
  }
  return advisoryLockKey(`article:${articleId.toLowerCase()}`);
}

async function acquireDuplicateTopologyLocks(
  executor: QueryExecutor,
  pair: CanonicalArticlePair,
): Promise<void> {
  await acquireTransactionLock(executor, DUPLICATE_TOPOLOGY_GLOBAL_LOCK_KEY);
  for (const articleId of [pair.articleLowId, pair.articleHighId]) {
    await acquireTransactionLock(
      executor,
      duplicateTopologyArticleLockKey(articleId),
    );
  }
}

function advisoryLockKey(material: string): string {
  return createHash('sha256')
    .update(DUPLICATE_TOPOLOGY_LOCK_NAMESPACE, 'utf8')
    .update('\0', 'utf8')
    .update(material, 'utf8')
    .digest()
    .readBigInt64BE(0)
    .toString(10);
}

async function acquireTransactionLock(
  executor: QueryExecutor,
  key: string,
): Promise<void> {
  await executor.query('SELECT pg_advisory_xact_lock($1::bigint)', [key]);
}

async function loadCandidateForUpdate(
  executor: QueryExecutor,
  pair: CanonicalArticlePair,
): Promise<CandidateRow | undefined> {
  const result = await executor.query<CandidateRow>(
    `SELECT id, article_low_id, article_high_id, state, confidence, evidence_fingerprint
     FROM duplicate_review_candidates
     WHERE article_low_id = $1 AND article_high_id = $2
     FOR UPDATE`,
    [pair.articleLowId, pair.articleHighId],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  if (
    requiredUuid(row.article_low_id) !== pair.articleLowId ||
    requiredUuid(row.article_high_id) !== pair.articleHighId
  ) {
    throw new DuplicateGroupingError('transaction_failed');
  }
  return row;
}

async function loadPairArticlesForUpdate(
  executor: QueryExecutor,
  pair: CanonicalArticlePair,
): Promise<readonly [PersistedArticle, PersistedArticle] | undefined> {
  const result = await executor.query<ArticleRow>(
    `SELECT ${ARTICLE_COLUMNS}
     FROM articles
     WHERE id = ANY($1::uuid[])
     ORDER BY id ASC
     FOR UPDATE`,
    [[pair.articleLowId, pair.articleHighId]],
  );
  if (result.rows.length !== 2) return undefined;
  const articles = result.rows.map(mapArticleRow);
  if (
    articles[0]?.id !== pair.articleLowId ||
    articles[1]?.id !== pair.articleHighId
  ) {
    throw new DuplicateGroupingError('transaction_failed');
  }
  return [articles[0], articles[1]];
}

async function loadSignalsForUpdate(
  executor: QueryExecutor,
  candidateId: string,
): Promise<readonly SignalRow[]> {
  const result = await executor.query<SignalRow>(
    `SELECT signal_order, reason_code, signal_strength
     FROM duplicate_review_signals
     WHERE candidate_id = $1
     ORDER BY signal_order ASC
     FOR UPDATE`,
    [candidateId],
  );
  return result.rows;
}

async function loadPairMembershipsForUpdate(
  executor: QueryExecutor,
  pair: CanonicalArticlePair,
): Promise<ReadonlyMap<string, string>> {
  const result = await executor.query<MembershipRow>(
    `SELECT membership.article_id, membership.group_id
     FROM duplicate_group_memberships membership
     JOIN duplicate_groups grp ON grp.id = membership.group_id
     WHERE membership.article_id = ANY($1::uuid[])
     ORDER BY membership.article_id ASC
     FOR UPDATE OF membership, grp`,
    [[pair.articleLowId, pair.articleHighId]],
  );
  const memberships = new Map<string, string>();
  for (const row of result.rows) {
    memberships.set(requiredUuid(row.article_id), requiredUuid(row.group_id));
  }
  return memberships;
}

async function reselectPrimary(
  executor: QueryExecutor,
  groupId: string,
): Promise<PersistedArticle> {
  const group = await executor.query<GroupRow>(
    `SELECT id, primary_article_id
     FROM duplicate_groups
     WHERE id = $1
     FOR UPDATE`,
    [groupId],
  );
  if (group.rows.length !== 1) {
    throw new DuplicateGroupingError('transaction_failed', {
      cause: new Error('Duplicate group disappeared during mutation'),
    });
  }
  const members = await executor.query<
    ArticleRow & { readonly priority: unknown }
  >(
    `SELECT ${qualifiedArticleColumns('articles')}, source.priority AS priority
     FROM duplicate_group_memberships membership
     JOIN articles ON articles.id = membership.article_id
     JOIN sources AS source ON source.id = articles.source_id
     WHERE membership.group_id = $1
     ORDER BY articles.id ASC
     FOR UPDATE OF membership, articles, source`,
    [groupId],
  );
  if (members.rows.length === 0) {
    throw new DuplicateGroupingError('transaction_failed', {
      cause: new Error('Duplicate group has no members'),
    });
  }
  const priorities = new Map<string, number>();
  const articles = members.rows.map((row) => {
    const article = mapArticleRow(row);
    priorities.set(article.sourceId, requiredPriority(row.priority));
    return article;
  });
  const primary = selectPrimary(articles, { priorities });
  await executor.query(
    `UPDATE duplicate_groups
     SET primary_article_id = $2, updated_at = now()
     WHERE id = $1`,
    [groupId, primary.id],
  );
  return primary;
}

function signalsMatchEvidence(
  rows: readonly SignalRow[],
  expected: readonly {
    readonly reasonCode: string;
    readonly strength: string;
  }[],
): boolean {
  return (
    rows.length === expected.length &&
    rows.every(
      (row, index) =>
        row.signal_order === index + 1 &&
        row.reason_code === expected[index]?.reasonCode &&
        row.signal_strength === expected[index]?.strength,
    )
  );
}

function validatePair(pair: CanonicalArticlePair): CanonicalArticlePair {
  try {
    const canonical = canonicalizeArticlePair(
      pair.articleLowId,
      pair.articleHighId,
    );
    if (
      canonical.articleLowId !== pair.articleLowId.toLowerCase() ||
      canonical.articleHighId !== pair.articleHighId.toLowerCase()
    ) {
      throw new Error();
    }
    return canonical;
  } catch {
    throw new DuplicateGroupingError('invalid_pair');
  }
}

function groupedResult(
  outcome: 'grouped' | 'already_merged',
  groupId: string,
  primaryArticleId: string,
  topologyChanged: boolean,
): DuplicateGroupingResult {
  return Object.freeze({
    outcome,
    reason: undefined,
    groupId,
    primaryArticleId,
    topologyChanged,
    duplicateGroupedCount: topologyChanged ? (1 as const) : (0 as const),
  });
}

function noAction(
  reason: DuplicateGroupingNoopReason,
): DuplicateGroupingResult {
  return Object.freeze({
    outcome: 'not_actionable' as const,
    reason,
    groupId: undefined,
    primaryArticleId: undefined,
    topologyChanged: false,
    duplicateGroupedCount: 0 as const,
  });
}

function requiredUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new DuplicateGroupingError('transaction_failed');
  }
  return value.toLowerCase();
}

function requiredCandidateState(value: unknown): CandidateState {
  if (
    value !== 'pending' &&
    value !== 'dismissed' &&
    value !== 'merged' &&
    value !== 'superseded'
  ) {
    throw new DuplicateGroupingError('transaction_failed');
  }
  return value;
}

function requiredConfidence(value: unknown): 50 | 100 {
  if (value !== 50 && value !== 100) {
    throw new DuplicateGroupingError('transaction_failed');
  }
  return value;
}

function requiredFingerprint(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new DuplicateGroupingError('transaction_failed');
  }
  return value;
}

function requiredPriority(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new DuplicateGroupingError('transaction_failed');
  }
  return value;
}

function qualifiedArticleColumns(alias: string): string {
  return ARTICLE_COLUMNS.split(',')
    .map((column) => `${alias}.${column.trim()}`)
    .join(', ');
}
