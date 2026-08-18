import { createHash } from 'node:crypto';

import { validateAdminInputRecord } from './input-validation.ts';
import type { Database, QueryExecutor } from '../database/database.ts';
import {
  readModeratedArticle,
  readModeratedArticles,
  type ModeratedArticle,
  type ModeratedArticleDetail,
} from '../articles/moderation-repository.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u;
const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_CURSOR_LENGTH = 2048;
const GROUP_MEMBER_LIMIT = 100;

type ReviewState = 'pending' | 'dismissed' | 'merged' | 'superseded';
type ReviewConfidence = 50 | 100;

export type DuplicateAdministrationErrorCode =
  'invalid_request' | 'duplicate_review_not_found';

export class DuplicateAdministrationError extends Error {
  readonly code: DuplicateAdministrationErrorCode;

  constructor(code: DuplicateAdministrationErrorCode) {
    super(`Duplicate administration request failed: ${code}`);
    this.name = 'DuplicateAdministrationError';
    this.code = code;
  }
}

export interface DuplicateAdministrationService {
  searchReviews(input?: unknown): Promise<DuplicateReviewSearchResult>;
  getReview(candidateId: unknown): Promise<DuplicateReviewDetail>;
}

export interface DuplicateReviewSearchResult {
  readonly items: readonly DuplicateReviewQueueItem[];
  readonly nextCursor: string | null;
}

export interface DuplicateReviewQueueItem {
  readonly candidateId: string;
  readonly articleLowId: string;
  readonly articleHighId: string;
  readonly state: ReviewState;
  readonly origin: 'automatic' | 'manual';
  readonly confidence: ReviewConfidence;
  readonly evidenceFingerprint: string;
  readonly manualDecidedAt: Date | null;
  readonly manualDecisionReason: string | null;
  readonly articleSummaries: readonly string[];
}

export interface DuplicateReviewDetail extends DuplicateReviewQueueItem {
  readonly signals: readonly Readonly<{
    readonly order: number;
    readonly reasonCode: string;
    readonly strength: 'strong' | 'weak';
  }>[];
  readonly articles: readonly [ModeratedArticleDetail, ModeratedArticleDetail];
  readonly groups: readonly DuplicateReviewGroupContext[];
  readonly automaticGroupingBlockedByManualSeparation: boolean;
  readonly automaticMergeBlockedByManualPrimaryConflict: boolean;
}

export interface DuplicateReviewGroupContext {
  readonly groupId: string;
  readonly primaryArticleId: string;
  readonly primarySelectionOrigin: 'automatic' | 'manual';
  readonly memberCount: number;
  readonly members: readonly ModeratedArticle[];
  readonly membersTruncated: boolean;
}

interface SearchCriteria {
  readonly state?: ReviewState;
  readonly confidence?: ReviewConfidence;
  readonly pageSize: number;
}
interface SearchCursor {
  readonly updatedAt: string;
  readonly candidateId: string;
}
interface CandidateRow {
  readonly id: unknown;
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
  readonly cursor_updated_at: unknown;
}

export function createDuplicateAdministrationService(
  database: Database,
): DuplicateAdministrationService {
  return Object.freeze({
    async searchReviews(input: unknown = {}) {
      const { criteria, cursor } = normalizeSearch(input);
      const result = await database.query<CandidateRow>(
        `SELECT candidate.id, candidate.article_low_id, candidate.article_high_id,
                candidate.state, candidate.origin, candidate.confidence,
                candidate.evidence_fingerprint, candidate.manual_decided_at,
                candidate.manual_decision_reason, low.display_title AS low_title,
                high.display_title AS high_title,
                to_char(candidate.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_updated_at
         FROM duplicate_review_candidates candidate
         JOIN articles low ON low.id = candidate.article_low_id
         JOIN articles high ON high.id = candidate.article_high_id
         WHERE ($1::text IS NULL OR candidate.state = $1)
           AND ($2::smallint IS NULL OR candidate.confidence = $2)
           AND ($3::timestamptz IS NULL OR candidate.updated_at < $3
             OR (candidate.updated_at = $3 AND candidate.id < $4::uuid))
         ORDER BY candidate.updated_at DESC, candidate.id DESC
         LIMIT $5`,
        [
          criteria.state ?? null,
          criteria.confidence ?? null,
          cursor?.updatedAt ?? null,
          cursor?.candidateId ?? null,
          criteria.pageSize + 1,
        ],
      );
      const hasMore = result.rows.length > criteria.pageSize;
      const rows = hasMore
        ? result.rows.slice(0, criteria.pageSize)
        : result.rows;
      const last = rows.at(-1);
      return Object.freeze({
        items: Object.freeze(rows.map(mapCandidate)),
        nextCursor:
          hasMore && last !== undefined
            ? encodeCursor(criteria, {
                updatedAt: timestamp(last.cursor_updated_at),
                candidateId: uuid(last.id),
              })
            : null,
      });
    },

    async getReview(candidateId: unknown) {
      const id = normalizeUuid(candidateId);
      return database.transaction(async (executor) => {
        const candidate = await readCandidate(executor, id);
        if (candidate === undefined)
          throw new DuplicateAdministrationError('duplicate_review_not_found');
        const low = await readModeratedArticle(
          executor,
          uuid(candidate.article_low_id),
        );
        const high = await readModeratedArticle(
          executor,
          uuid(candidate.article_high_id),
        );
        if (low === undefined || high === undefined)
          throw new Error('candidate Article missing');
        const groupIds = [
          ...new Set(
            [low.duplicate.groupId, high.duplicate.groupId].filter(
              (value): value is string => value !== null,
            ),
          ),
        ].sort();
        const groups: DuplicateReviewGroupContext[] = [];
        for (const groupId of groupIds) {
          groups.push(await readGroup(executor, groupId));
        }
        return Object.freeze({
          ...mapCandidate(candidate),
          signals: await readSignals(executor, id),
          articles: [low, high] as const,
          groups: Object.freeze(groups),
          automaticGroupingBlockedByManualSeparation:
            await hasComponentSeparation(executor, low, high),
          automaticMergeBlockedByManualPrimaryConflict:
            conflictingManualPrimaries(low, high),
        });
      });
    },
  });
}

async function readCandidate(
  executor: QueryExecutor,
  id: string,
): Promise<CandidateRow | undefined> {
  const result = await executor.query<CandidateRow>(
    `SELECT candidate.id, candidate.article_low_id, candidate.article_high_id,
            candidate.state, candidate.origin, candidate.confidence,
            candidate.evidence_fingerprint, candidate.manual_decided_at,
            candidate.manual_decision_reason, low.display_title AS low_title,
            high.display_title AS high_title,
            to_char(candidate.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_updated_at
     FROM duplicate_review_candidates candidate
     JOIN articles low ON low.id = candidate.article_low_id
     JOIN articles high ON high.id = candidate.article_high_id
     WHERE candidate.id = $1`,
    [id],
  );
  return result.rows[0];
}

async function readSignals(executor: QueryExecutor, candidateId: string) {
  const result = await executor.query<{
    signal_order: unknown;
    reason_code: unknown;
    signal_strength: unknown;
  }>(
    `SELECT signal_order, reason_code, signal_strength
     FROM duplicate_review_signals WHERE candidate_id = $1 ORDER BY signal_order ASC`,
    [candidateId],
  );
  return Object.freeze(
    result.rows.map((row) =>
      Object.freeze({
        order: integer(row.signal_order),
        reasonCode: text(row.reason_code, 100),
        strength: strength(row.signal_strength),
      }),
    ),
  );
}

async function readGroup(
  executor: QueryExecutor,
  groupId: string,
): Promise<DuplicateReviewGroupContext> {
  const group = await executor.query<{
    primary_article_id: unknown;
    primary_selection_origin: unknown;
    member_count: unknown;
  }>(
    `SELECT grp.primary_article_id, grp.primary_selection_origin,
            (SELECT count(*) FROM duplicate_group_memberships WHERE group_id = grp.id) AS member_count
     FROM duplicate_groups grp WHERE grp.id = $1`,
    [groupId],
  );
  const row = group.rows[0];
  if (row === undefined) throw new Error('Article duplicate group missing');
  const memberCount = integer(row.member_count);
  const members = await readModeratedArticles(executor, {
    criteria: { duplicateGroupId: groupId, pageSize: GROUP_MEMBER_LIMIT },
  });
  return Object.freeze({
    groupId,
    primaryArticleId: uuid(row.primary_article_id),
    primarySelectionOrigin: origin(row.primary_selection_origin),
    memberCount,
    members: members.articles,
    membersTruncated: memberCount > members.articles.length,
  });
}

async function hasComponentSeparation(
  executor: QueryExecutor,
  low: ModeratedArticleDetail,
  high: ModeratedArticleDetail,
): Promise<boolean> {
  const groupIds = [
    ...new Set(
      [low.duplicate.groupId, high.duplicate.groupId].filter(
        (id): id is string => id !== null,
      ),
    ),
  ];
  const result = await executor.query<{ count: unknown }>(
    `WITH members AS (
       SELECT unnest($1::uuid[]) AS article_id
       UNION
       SELECT membership.article_id FROM duplicate_group_memberships membership
       WHERE membership.group_id = ANY($2::uuid[])
     )
     SELECT count(*) FROM duplicate_manual_separations separation
     WHERE separation.article_low_id IN (SELECT article_id FROM members)
       AND separation.article_high_id IN (SELECT article_id FROM members)`,
    [[low.articleId, high.articleId], groupIds],
  );
  return integer(result.rows[0]?.count) > 0;
}

function conflictingManualPrimaries(
  low: ModeratedArticleDetail,
  high: ModeratedArticleDetail,
): boolean {
  const first = low.duplicate;
  const second = high.duplicate;
  return (
    first.groupId !== null &&
    second.groupId !== null &&
    first.groupId !== second.groupId &&
    first.primarySelectionOrigin === 'manual' &&
    second.primarySelectionOrigin === 'manual' &&
    first.primaryArticleId !== second.primaryArticleId
  );
}

function mapCandidate(row: CandidateRow): DuplicateReviewQueueItem {
  return Object.freeze({
    candidateId: uuid(row.id),
    articleLowId: uuid(row.article_low_id),
    articleHighId: uuid(row.article_high_id),
    state: persistedState(row.state),
    origin: origin(row.origin),
    confidence: persistedConfidence(row.confidence),
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
  });
}

function normalizeSearch(input: unknown): {
  criteria: SearchCriteria;
  cursor?: SearchCursor;
} {
  try {
    const record = exactRecord(input, [
      'state',
      'confidence',
      'pageSize',
      'cursor',
    ]);
    const criteria: SearchCriteria = Object.freeze({
      ...(record.state === undefined ? {} : { state: state(record.state) }),
      ...(record.confidence === undefined
        ? {}
        : { confidence: confidence(record.confidence) }),
      pageSize: pageSize(record.pageSize),
    });
    return Object.freeze({
      ...(record.cursor === undefined
        ? {}
        : { cursor: decodeCursor(record.cursor, criteria) }),
      criteria,
    });
  } catch (error) {
    if (error instanceof DuplicateAdministrationError) throw error;
    throw new DuplicateAdministrationError('invalid_request');
  }
}

function encodeCursor(
  criteria: SearchCriteria,
  position: SearchCursor,
): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      criteria: fingerprint(criteria),
      ...position,
    }),
    'utf8',
  ).toString('base64url');
}
function decodeCursor(value: unknown, criteria: SearchCriteria): SearchCursor {
  if (
    typeof value !== 'string' ||
    value.length > MAX_CURSOR_LENGTH ||
    !BASE64URL_PATTERN.test(value)
  )
    throw new DuplicateAdministrationError('invalid_request');
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value) throw new Error();
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error();
    const payload = parsed as Record<string, unknown>;
    if (
      Object.keys(payload).length !== 4 ||
      payload.version !== 1 ||
      payload.criteria !== fingerprint(criteria)
    )
      throw new Error();
    return Object.freeze({
      updatedAt: timestamp(payload.updatedAt),
      candidateId: normalizeUuid(payload.candidateId),
    });
  } catch {
    throw new DuplicateAdministrationError('invalid_request');
  }
}
function fingerprint(criteria: SearchCriteria): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        state: criteria.state ?? null,
        confidence: criteria.confidence ?? null,
        pageSize: criteria.pageSize,
      }),
    )
    .digest('hex');
}
function exactRecord(
  input: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  const record = validateAdminInputRecord(input, [], keys);
  if (record === undefined)
    throw new DuplicateAdministrationError('invalid_request');
  return record;
}
function pageSize(value: unknown): number {
  if (value === undefined) return PAGE_SIZE;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_PAGE_SIZE
  )
    throw new DuplicateAdministrationError('invalid_request');
  return value;
}
function normalizeUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value))
    throw new DuplicateAdministrationError('invalid_request');
  return value.toLowerCase();
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value))
    throw new Error('invalid persisted UUID');
  return value.toLowerCase();
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max)
    throw new Error('invalid persisted text');
  return value;
}
function integer(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error('invalid persisted integer');
  return parsed;
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !TIMESTAMP_PATTERN.test(value))
    throw new Error('invalid persisted timestamp');
  return value;
}
function state(value: unknown): ReviewState {
  if (
    value === 'pending' ||
    value === 'dismissed' ||
    value === 'merged' ||
    value === 'superseded'
  )
    return value;
  throw new DuplicateAdministrationError('invalid_request');
}
function confidence(value: unknown): ReviewConfidence {
  if (value === 50 || value === 100) return value;
  throw new DuplicateAdministrationError('invalid_request');
}
function persistedState(value: unknown): ReviewState {
  if (
    value === 'pending' ||
    value === 'dismissed' ||
    value === 'merged' ||
    value === 'superseded'
  )
    return value;
  throw new Error('invalid persisted state');
}
function persistedConfidence(value: unknown): ReviewConfidence {
  if (value === 50 || value === 100) return value;
  throw new Error('invalid persisted confidence');
}
function origin(value: unknown): 'automatic' | 'manual' {
  if (value === 'automatic' || value === 'manual') return value;
  throw new Error('invalid persisted origin');
}
function strength(value: unknown): 'strong' | 'weak' {
  if (value === 'strong' || value === 'weak') return value;
  throw new Error('invalid persisted strength');
}
