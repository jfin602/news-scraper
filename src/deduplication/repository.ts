import { randomUUID } from 'node:crypto';

import {
  ARTICLE_COLUMNS,
  mapArticleRow,
  type ArticleRow,
  type PersistedArticle,
} from '../articles/repository.ts';
import type { Database, QueryExecutor } from '../database/database.ts';
import {
  evaluateDuplicateEvidence,
  type CanonicalArticlePair,
  type DuplicateEvidence,
} from './evidence.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export type DuplicateReviewStatus =
  | 'weak_pending'
  | 'strong_pending'
  | 'dismissed_unchanged'
  | 'merged'
  | 'superseded';

export interface DuplicateReviewEvaluation {
  readonly pair: CanonicalArticlePair;
  readonly status: DuplicateReviewStatus;
}

export interface DuplicateReviewDetectionResult {
  readonly articleId: string;
  readonly outcome: 'no_evidence' | 'evidence_evaluated';
  readonly newlyCreatedCount: number;
  readonly strongPendingCandidates: readonly CanonicalArticlePair[];
  readonly evaluations: readonly DuplicateReviewEvaluation[];
}

export type DuplicateReviewPersistenceErrorReason =
  'invalid_article_id' | 'article_not_found' | 'transaction_failed';

export class DuplicateReviewPersistenceError extends Error {
  readonly reason: DuplicateReviewPersistenceErrorReason;

  constructor(
    reason: DuplicateReviewPersistenceErrorReason,
    options?: ErrorOptions,
  ) {
    super(`Duplicate review persistence failed: ${reason}.`, options);
    this.name = 'DuplicateReviewPersistenceError';
    this.reason = reason;
  }
}

interface DuplicateReviewCandidateRow {
  readonly id: unknown;
  readonly article_low_id: unknown;
  readonly article_high_id: unknown;
  readonly state: unknown;
  readonly origin: unknown;
  readonly confidence: unknown;
  readonly evidence_fingerprint: unknown;
  readonly manual_decided_at: unknown;
  readonly manual_decision_reason: unknown;
}

type PersistedReviewState = 'pending' | 'dismissed' | 'merged' | 'superseded';

/**
 * Runs duplicate review detection in a caller-owned transaction. The caller
 * controls the transaction boundary so Article identity and later grouping
 * can be composed without nested transactions.
 */
export async function detectDuplicateReviewsInTransaction(
  executor: QueryExecutor,
  articleId: string,
): Promise<DuplicateReviewDetectionResult> {
  validateArticleId(articleId);

  try {
    const article = await loadArticle(executor, articleId);
    if (article === undefined) {
      throw new DuplicateReviewPersistenceError('article_not_found');
    }

    const candidates = await findPotentialDuplicates(executor, article);
    const evaluations: DuplicateReviewEvaluation[] = [];
    const strongPendingCandidates: CanonicalArticlePair[] = [];
    let newlyCreatedCount = 0;

    for (const candidate of candidates) {
      const evidence = evaluateDuplicateEvidence(article, candidate);
      if (evidence === undefined) continue;

      const persisted = await persistReviewEvidence(executor, evidence);
      if (persisted.created) newlyCreatedCount += 1;
      const evaluation = Object.freeze({
        pair: evidence.pair,
        status: persisted.status,
      });
      evaluations.push(evaluation);
      if (persisted.status === 'strong_pending') {
        strongPendingCandidates.push(evidence.pair);
      }
    }

    return Object.freeze({
      articleId: article.id,
      outcome:
        evaluations.length === 0
          ? ('no_evidence' as const)
          : 'evidence_evaluated',
      newlyCreatedCount,
      strongPendingCandidates: Object.freeze(strongPendingCandidates),
      evaluations: Object.freeze(evaluations),
    });
  } catch (error) {
    if (error instanceof DuplicateReviewPersistenceError) throw error;
    throw new DuplicateReviewPersistenceError('transaction_failed', {
      cause: error,
    });
  }
}

/** Convenience wrapper for standalone use and focused tests. */
export async function detectDuplicateReviews(
  database: Pick<Database, 'transaction'>,
  articleId: string,
): Promise<DuplicateReviewDetectionResult> {
  validateArticleId(articleId);
  try {
    return await database.transaction((transaction) =>
      detectDuplicateReviewsInTransaction(transaction, articleId),
    );
  } catch (error) {
    if (error instanceof DuplicateReviewPersistenceError) throw error;
    throw new DuplicateReviewPersistenceError('transaction_failed', {
      cause: error,
    });
  }
}

async function loadArticle(
  executor: QueryExecutor,
  articleId: string,
): Promise<PersistedArticle | undefined> {
  const result = await executor.query<ArticleRow>(
    `SELECT ${ARTICLE_COLUMNS}
     FROM articles
     WHERE id = $1`,
    [articleId],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapArticleRow(row);
}

async function findPotentialDuplicates(
  executor: QueryExecutor,
  article: PersistedArticle,
): Promise<readonly PersistedArticle[]> {
  const result = await executor.query<ArticleRow>(
    `SELECT ${ARTICLE_COLUMNS}
     FROM articles
     WHERE id <> $1
       AND source_id <> $2
       AND canonical_identity_digest = sha256($3::text::bytea)
       AND canonical_identity_url = $3
     UNION
     SELECT ${ARTICLE_COLUMNS}
     FROM articles
     WHERE id <> $1
       AND source_id <> $2
       AND sha256(normalized_title::bytea) = sha256($4::text::bytea)
       AND normalized_title = $4
       AND $4 <> ''
     ORDER BY id`,
    [
      article.id,
      article.sourceId,
      article.canonicalIdentityUrl,
      article.normalizedTitle,
    ],
  );
  return Object.freeze(result.rows.map(mapArticleRow));
}

async function persistReviewEvidence(
  executor: QueryExecutor,
  evidence: DuplicateEvidence,
): Promise<{
  readonly created: boolean;
  readonly status: DuplicateReviewStatus;
}> {
  const inserted = await executor.query<DuplicateReviewCandidateRow>(
    `INSERT INTO duplicate_review_candidates
       (id, article_low_id, article_high_id, state, origin, confidence, evidence_fingerprint)
     VALUES ($1, $2, $3, 'pending', 'automatic', $4, $5)
     ON CONFLICT (article_low_id, article_high_id) DO NOTHING
     RETURNING id, article_low_id, article_high_id, state, origin, confidence,
               evidence_fingerprint, manual_decided_at, manual_decision_reason`,
    [
      randomUUID(),
      evidence.pair.articleLowId,
      evidence.pair.articleHighId,
      evidence.confidence,
      evidence.evidenceFingerprint,
    ],
  );
  const insertedRow = inserted.rows[0];
  if (insertedRow !== undefined) {
    await replaceSignals(executor, requiredUuid(insertedRow.id), evidence);
    return Object.freeze({
      created: true,
      status: pendingStatus(evidence),
    });
  }

  const existingResult = await executor.query<DuplicateReviewCandidateRow>(
    `SELECT id, article_low_id, article_high_id, state, origin, confidence,
            evidence_fingerprint, manual_decided_at, manual_decision_reason
     FROM duplicate_review_candidates
     WHERE article_low_id = $1 AND article_high_id = $2
     FOR UPDATE`,
    [evidence.pair.articleLowId, evidence.pair.articleHighId],
  );
  const existing = existingResult.rows[0];
  if (existing === undefined) {
    throw new DuplicateReviewPersistenceError('transaction_failed');
  }

  const state = requiredState(existing.state);
  const fingerprint = requiredFingerprint(existing.evidence_fingerprint);
  const unchanged = fingerprint === evidence.evidenceFingerprint;

  if (state === 'dismissed' && unchanged) {
    return Object.freeze({ created: false, status: 'dismissed_unchanged' });
  }
  if (state === 'merged' && unchanged) {
    return Object.freeze({ created: false, status: 'merged' });
  }
  if (state === 'superseded') {
    return Object.freeze({ created: false, status: 'superseded' });
  }
  if (state === 'pending' && unchanged) {
    return Object.freeze({
      created: false,
      status: pendingStatus(evidence),
    });
  }

  const nextState: PersistedReviewState =
    state === 'dismissed' ? 'pending' : state;
  await executor.query(
    `UPDATE duplicate_review_candidates
     SET state = $2,
         confidence = $3,
         evidence_fingerprint = $4,
         updated_at = now()
     WHERE id = $1`,
    [
      requiredUuid(existing.id),
      nextState,
      evidence.confidence,
      evidence.evidenceFingerprint,
    ],
  );
  await replaceSignals(executor, requiredUuid(existing.id), evidence);

  if (nextState === 'pending') {
    return Object.freeze({ created: false, status: pendingStatus(evidence) });
  }
  return Object.freeze({ created: false, status: 'merged' });
}

async function replaceSignals(
  executor: QueryExecutor,
  candidateId: string,
  evidence: DuplicateEvidence,
): Promise<void> {
  await executor.query(
    'DELETE FROM duplicate_review_signals WHERE candidate_id = $1',
    [candidateId],
  );
  for (const [index, signal] of evidence.signals.entries()) {
    await executor.query(
      `INSERT INTO duplicate_review_signals
         (candidate_id, signal_order, reason_code, signal_strength)
       VALUES ($1, $2, $3, $4)`,
      [candidateId, index + 1, signal.reasonCode, signal.strength],
    );
  }
}

function pendingStatus(evidence: DuplicateEvidence): DuplicateReviewStatus {
  return evidence.strength === 'strong' ? 'strong_pending' : 'weak_pending';
}

function validateArticleId(articleId: string): void {
  if (typeof articleId !== 'string' || !UUID_PATTERN.test(articleId)) {
    throw new DuplicateReviewPersistenceError('invalid_article_id');
  }
}

function requiredUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new DuplicateReviewPersistenceError('transaction_failed');
  }
  return value.toLowerCase();
}

function requiredState(value: unknown): PersistedReviewState {
  if (
    value !== 'pending' &&
    value !== 'dismissed' &&
    value !== 'merged' &&
    value !== 'superseded'
  ) {
    throw new DuplicateReviewPersistenceError('transaction_failed');
  }
  return value;
}

function requiredFingerprint(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new DuplicateReviewPersistenceError('transaction_failed');
  }
  return value;
}
