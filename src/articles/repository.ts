import { randomUUID } from 'node:crypto';

import type { ArticleCandidate } from '../collection/normalization/article-candidate.ts';
import { ARTICLE_CANDIDATE_LIMITS } from '../collection/normalization/article-candidate.ts';
import type { Database, QueryExecutor } from '../database/database.ts';
import { acquireArticleIdentityLocks } from './identity-lock.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const IDENTITY_CONSTRAINTS = new Set([
  'articles_source_external_id_digest_unique',
  'articles_fallback_canonical_digest_unique',
]);

export type ArticlePersistenceSuccessOutcome =
  'created' | 'updated' | 'unchanged';
export type ArticlePersistenceFailureReason =
  'identity_conflict' | 'provenance_mismatch';
export type ArticleVisibilityState = 'visible' | 'hidden' | 'archived';

export interface PersistedArticle {
  readonly id: string;
  readonly publicationId: string;
  readonly sourceId: string;
  readonly externalId: string | undefined;
  readonly originalUrl: string;
  readonly canonicalIdentityUrl: string;
  readonly displayTitle: string;
  readonly normalizedTitle: string;
  readonly author: string | undefined;
  readonly summary: string | undefined;
  readonly imageUrl: string | undefined;
  readonly language: string | undefined;
  readonly publishedAtStatus: 'parsed' | 'missing' | 'invalid';
  readonly publishedAt: Date | undefined;
  readonly sourceUpdatedAtStatus: 'parsed' | 'missing' | 'invalid';
  readonly sourceUpdatedAt: Date | undefined;
  readonly visibilityState: ArticleVisibilityState;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PersistedArticleObservation {
  readonly id: string;
  readonly publicationId: string;
  readonly sourceId: string;
  readonly sourceEndpointId: string;
  readonly collectionRunId: string;
  readonly articleId: string;
  readonly observedAt: Date;
  readonly processingOutcome: ArticlePersistenceSuccessOutcome;
  readonly observedExternalId: string | undefined;
  readonly observedCanonicalIdentityUrl: string;
}

export interface ArticlePersistenceSuccess {
  readonly outcome: ArticlePersistenceSuccessOutcome;
  readonly article: PersistedArticle;
  readonly observation: PersistedArticleObservation;
}

export interface ArticlePersistenceFailure {
  readonly outcome: 'failed';
  readonly reason: ArticlePersistenceFailureReason;
}

export type ArticlePersistenceResult =
  ArticlePersistenceSuccess | ArticlePersistenceFailure;

export type ArticlePersistenceErrorReason =
  'invalid_candidate' | 'invalid_observation_time' | 'transaction_failed';

export class ArticlePersistenceError extends Error {
  readonly reason: ArticlePersistenceErrorReason;

  constructor(reason: ArticlePersistenceErrorReason, options?: ErrorOptions) {
    super(`Article persistence failed: ${reason}.`, options);
    this.name = 'ArticlePersistenceError';
    this.reason = reason;
  }
}

interface ArticleRow {
  readonly id: unknown;
  readonly publication_id: unknown;
  readonly source_id: unknown;
  readonly external_id: unknown;
  readonly original_url: unknown;
  readonly canonical_identity_url: unknown;
  readonly display_title: unknown;
  readonly normalized_title: unknown;
  readonly author: unknown;
  readonly summary: unknown;
  readonly image_url: unknown;
  readonly language: unknown;
  readonly published_at_status: unknown;
  readonly published_at: unknown;
  readonly source_updated_at_status: unknown;
  readonly source_updated_at: unknown;
  readonly visibility_state: unknown;
  readonly first_seen_at: unknown;
  readonly last_seen_at: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

interface ObservationRow {
  readonly id: unknown;
  readonly publication_id: unknown;
  readonly source_id: unknown;
  readonly source_endpoint_id: unknown;
  readonly collection_run_id: unknown;
  readonly article_id: unknown;
  readonly observed_at: unknown;
  readonly processing_outcome: unknown;
  readonly observed_external_id: unknown;
  readonly observed_canonical_identity_url: unknown;
}

interface ValidatedCandidate {
  readonly externalId: string | undefined;
  readonly displayTitle: string;
  readonly normalizedTitle: string;
  readonly originalUrl: string;
  readonly canonicalIdentityUrl: string;
  readonly author: string | undefined;
  readonly summary: string | undefined;
  readonly imageUrl: string | undefined;
  readonly language: string | undefined;
  readonly publishedAtStatus: 'parsed' | 'missing' | 'invalid';
  readonly publishedAt: Date | undefined;
  readonly sourceUpdatedAtStatus: 'parsed' | 'missing' | 'invalid';
  readonly sourceUpdatedAt: Date | undefined;
  readonly publicationId: string;
  readonly sourceId: string;
  readonly sourceEndpointId: string;
  readonly collectionRunId: string;
}

interface IdentityResolution {
  readonly article: PersistedArticle | undefined;
  readonly promoteFallback: boolean;
}

const ARTICLE_COLUMNS = `
  id, publication_id, source_id, external_id, original_url,
  canonical_identity_url, display_title, normalized_title, author, summary,
  image_url, language, published_at_status, published_at,
  source_updated_at_status, source_updated_at, visibility_state, first_seen_at, last_seen_at,
  created_at, updated_at`;
const OBSERVATION_COLUMNS = `
  id, publication_id, source_id, source_endpoint_id, collection_run_id,
  article_id, observed_at, processing_outcome, observed_external_id,
  observed_canonical_identity_url`;

const IDENTITY_CONFLICT_RESULT: ArticlePersistenceFailure = Object.freeze({
  outcome: 'failed',
  reason: 'identity_conflict',
});
const PROVENANCE_MISMATCH_RESULT: ArticlePersistenceFailure = Object.freeze({
  outcome: 'failed',
  reason: 'provenance_mismatch',
});

export async function persistIncludedArticle(
  database: Pick<Database, 'transaction'>,
  candidate: ArticleCandidate,
  observationTime: Date,
): Promise<ArticlePersistenceResult> {
  const validatedCandidate = validateCandidate(candidate);
  const observedAt = validateObservationTime(observationTime);

  try {
    return await database.transaction(async (transaction) => {
      await acquireArticleIdentityLocks(transaction, {
        sourceId: validatedCandidate.sourceId,
        ...(validatedCandidate.externalId === undefined
          ? {}
          : { externalId: validatedCandidate.externalId }),
        canonicalIdentityUrl: validatedCandidate.canonicalIdentityUrl,
      });

      if (!(await provenanceMatches(transaction, validatedCandidate))) {
        return PROVENANCE_MISMATCH_RESULT;
      }

      const resolution = await resolveIdentity(transaction, validatedCandidate);
      if (resolution === undefined) return IDENTITY_CONFLICT_RESULT;

      const persisted = await persistResolvedArticle(
        transaction,
        validatedCandidate,
        observedAt,
        resolution,
      );
      const observation = await insertObservation(
        transaction,
        validatedCandidate,
        persisted.article,
        persisted.outcome,
        observedAt,
      );
      return Object.freeze({
        outcome: persisted.outcome,
        article: persisted.article,
        observation,
      });
    });
  } catch (error) {
    if (isIdentityConstraintConflict(error)) return IDENTITY_CONFLICT_RESULT;
    if (error instanceof ArticlePersistenceError) throw error;
    throw new ArticlePersistenceError('transaction_failed', { cause: error });
  }
}

async function provenanceMatches(
  executor: QueryExecutor,
  candidate: ValidatedCandidate,
): Promise<boolean> {
  const result = await executor.query<{ provenance_matches: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM sources AS source
       JOIN source_endpoints AS endpoint ON endpoint.source_id = source.id
       JOIN collection_runs AS run ON run.source_endpoint_id = endpoint.id
       WHERE source.publication_id = $1
         AND source.id = $2
         AND endpoint.id = $3
         AND run.id = $4
     ) AS provenance_matches`,
    [
      candidate.publicationId,
      candidate.sourceId,
      candidate.sourceEndpointId,
      candidate.collectionRunId,
    ],
  );
  return result.rows[0]?.provenance_matches === true;
}

async function resolveIdentity(
  executor: QueryExecutor,
  candidate: ValidatedCandidate,
): Promise<IdentityResolution | undefined> {
  if (candidate.externalId !== undefined) {
    const externalRows = await findByExternalDigest(
      executor,
      candidate.sourceId,
      candidate.externalId,
    );
    const exactExternal = externalRows.filter(
      (article) => article.externalId === candidate.externalId,
    );
    if (externalRows.length !== exactExternal.length) return undefined;
    if (exactExternal.length === 1) {
      return assertResolvedOwnership(exactExternal[0]!, candidate, false);
    }
    if (exactExternal.length > 1) return undefined;

    const canonicalRows = await findByCanonicalDigest(
      executor,
      candidate.publicationId,
      candidate.sourceId,
      candidate.canonicalIdentityUrl,
    );
    const exactCanonical = canonicalRows.filter(
      (article) =>
        article.canonicalIdentityUrl === candidate.canonicalIdentityUrl,
    );
    const fallback = exactCanonical.filter(
      (article) => article.externalId === undefined,
    );
    const contradictoryStrong = exactCanonical.filter(
      (article) => article.externalId !== undefined,
    );
    if (fallback.length === 1 && contradictoryStrong.length === 0) {
      return assertResolvedOwnership(fallback[0]!, candidate, true);
    }
    return Object.freeze({ article: undefined, promoteFallback: false });
  }

  const canonicalRows = await findByCanonicalDigest(
    executor,
    candidate.publicationId,
    candidate.sourceId,
    candidate.canonicalIdentityUrl,
  );
  const exactCanonical = canonicalRows.filter(
    (article) =>
      article.canonicalIdentityUrl === candidate.canonicalIdentityUrl,
  );
  if (exactCanonical.length === 1) {
    return assertResolvedOwnership(exactCanonical[0]!, candidate, false);
  }
  if (exactCanonical.length > 1) return undefined;

  const collidingFallback = canonicalRows.some(
    (article) => article.externalId === undefined,
  );
  return collidingFallback
    ? undefined
    : Object.freeze({ article: undefined, promoteFallback: false });
}

function assertResolvedOwnership(
  article: PersistedArticle,
  candidate: ValidatedCandidate,
  promoteFallback: boolean,
): IdentityResolution {
  if (
    article.publicationId !== candidate.publicationId ||
    article.sourceId !== candidate.sourceId
  ) {
    throw new ArticlePersistenceError('transaction_failed');
  }
  return Object.freeze({ article, promoteFallback });
}

async function findByExternalDigest(
  executor: QueryExecutor,
  sourceId: string,
  externalId: string,
): Promise<readonly PersistedArticle[]> {
  const result = await executor.query<ArticleRow>(
    `SELECT ${ARTICLE_COLUMNS}
     FROM articles
     WHERE source_id = $1
       AND external_id_digest = sha256($2::text::bytea)
     ORDER BY id`,
    [sourceId, externalId],
  );
  return Object.freeze(result.rows.map(mapArticleRow));
}

async function findByCanonicalDigest(
  executor: QueryExecutor,
  publicationId: string,
  sourceId: string,
  canonicalIdentityUrl: string,
): Promise<readonly PersistedArticle[]> {
  const result = await executor.query<ArticleRow>(
    `SELECT ${ARTICLE_COLUMNS}
     FROM articles
     WHERE publication_id = $1
       AND source_id = $2
       AND canonical_identity_digest = sha256($3::text::bytea)
     ORDER BY id`,
    [publicationId, sourceId, canonicalIdentityUrl],
  );
  return Object.freeze(result.rows.map(mapArticleRow));
}

async function persistResolvedArticle(
  executor: QueryExecutor,
  candidate: ValidatedCandidate,
  observationTime: Date,
  resolution: IdentityResolution,
): Promise<
  Readonly<{
    outcome: ArticlePersistenceSuccessOutcome;
    article: PersistedArticle;
  }>
> {
  if (resolution.article === undefined) {
    return Object.freeze({
      outcome: 'created',
      article: await insertArticle(executor, candidate, observationTime),
    });
  }

  const desiredExternalId =
    candidate.externalId ?? resolution.article.externalId;
  const materialChange =
    resolution.promoteFallback ||
    desiredExternalId !== resolution.article.externalId ||
    candidate.originalUrl !== resolution.article.originalUrl ||
    candidate.canonicalIdentityUrl !==
      resolution.article.canonicalIdentityUrl ||
    candidate.displayTitle !== resolution.article.displayTitle ||
    candidate.normalizedTitle !== resolution.article.normalizedTitle ||
    candidate.author !== resolution.article.author ||
    candidate.summary !== resolution.article.summary ||
    candidate.imageUrl !== resolution.article.imageUrl ||
    candidate.language !== resolution.article.language ||
    candidate.publishedAtStatus !== resolution.article.publishedAtStatus ||
    !timestampsEqual(candidate.publishedAt, resolution.article.publishedAt) ||
    candidate.sourceUpdatedAtStatus !==
      resolution.article.sourceUpdatedAtStatus ||
    !timestampsEqual(
      candidate.sourceUpdatedAt,
      resolution.article.sourceUpdatedAt,
    );

  if (!materialChange) {
    const result = await executor.query<ArticleRow>(
      `UPDATE articles
       SET first_seen_at = LEAST(first_seen_at, $2),
           last_seen_at = GREATEST(last_seen_at, $2)
       WHERE id = $1 AND publication_id = $3 AND source_id = $4
       RETURNING ${ARTICLE_COLUMNS}`,
      [
        resolution.article.id,
        observationTime,
        candidate.publicationId,
        candidate.sourceId,
      ],
    );
    return Object.freeze({
      outcome: 'unchanged',
      article: mapRequiredArticle(result.rows, 'unchanged update'),
    });
  }

  const result = await executor.query<ArticleRow>(
    `UPDATE articles
     SET external_id = $2,
         original_url = $3,
         canonical_identity_url = $4,
         display_title = $5,
         normalized_title = $6,
         author = $7,
         summary = $8,
         image_url = $9,
         language = $10,
         published_at_status = $11,
         published_at = $12,
         source_updated_at_status = $13,
         source_updated_at = $14,
         first_seen_at = LEAST(first_seen_at, $15),
         last_seen_at = GREATEST(last_seen_at, $15),
         updated_at = now()
     WHERE id = $1 AND publication_id = $16 AND source_id = $17
     RETURNING ${ARTICLE_COLUMNS}`,
    [
      resolution.article.id,
      desiredExternalId ?? null,
      candidate.originalUrl,
      candidate.canonicalIdentityUrl,
      candidate.displayTitle,
      candidate.normalizedTitle,
      candidate.author ?? null,
      candidate.summary ?? null,
      candidate.imageUrl ?? null,
      candidate.language ?? null,
      candidate.publishedAtStatus,
      candidate.publishedAt ?? null,
      candidate.sourceUpdatedAtStatus,
      candidate.sourceUpdatedAt ?? null,
      observationTime,
      candidate.publicationId,
      candidate.sourceId,
    ],
  );
  return Object.freeze({
    outcome: 'updated',
    article: mapRequiredArticle(result.rows, 'material update'),
  });
}

async function insertArticle(
  executor: QueryExecutor,
  candidate: ValidatedCandidate,
  observationTime: Date,
): Promise<PersistedArticle> {
  const result = await executor.query<ArticleRow>(
    `INSERT INTO articles (
       id, publication_id, source_id, external_id, original_url,
       canonical_identity_url, display_title, normalized_title, author,
       summary, image_url, language, published_at_status, published_at,
       source_updated_at_status, source_updated_at, first_seen_at, last_seen_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       $15, $16, $17, $17
     )
     RETURNING ${ARTICLE_COLUMNS}`,
    [
      randomUUID(),
      candidate.publicationId,
      candidate.sourceId,
      candidate.externalId ?? null,
      candidate.originalUrl,
      candidate.canonicalIdentityUrl,
      candidate.displayTitle,
      candidate.normalizedTitle,
      candidate.author ?? null,
      candidate.summary ?? null,
      candidate.imageUrl ?? null,
      candidate.language ?? null,
      candidate.publishedAtStatus,
      candidate.publishedAt ?? null,
      candidate.sourceUpdatedAtStatus,
      candidate.sourceUpdatedAt ?? null,
      observationTime,
    ],
  );
  return mapRequiredArticle(result.rows, 'insert');
}

async function insertObservation(
  executor: QueryExecutor,
  candidate: ValidatedCandidate,
  article: PersistedArticle,
  outcome: ArticlePersistenceSuccessOutcome,
  observationTime: Date,
): Promise<PersistedArticleObservation> {
  const result = await executor.query<ObservationRow>(
    `INSERT INTO article_observations (
       id, publication_id, source_id, source_endpoint_id, collection_run_id,
       article_id, observed_at, processing_outcome, observed_external_id,
       observed_canonical_identity_url
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${OBSERVATION_COLUMNS}`,
    [
      randomUUID(),
      candidate.publicationId,
      candidate.sourceId,
      candidate.sourceEndpointId,
      candidate.collectionRunId,
      article.id,
      observationTime,
      outcome,
      candidate.externalId ?? null,
      candidate.canonicalIdentityUrl,
    ],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new ArticlePersistenceError('transaction_failed');
  }
  return mapObservationRow(row);
}

function validateCandidate(candidate: ArticleCandidate): ValidatedCandidate {
  try {
    if (candidate === null || typeof candidate !== 'object') throw new Error();
    const externalId = optionalTrimmedString(
      candidate.externalId,
      ARTICLE_CANDIDATE_LIMITS.externalId,
    );
    const publishedAt = validateSourceDate(candidate.publishedAt);
    if (candidate.publishedAt.fallback !== 'first_seen') throw new Error();
    const sourceUpdatedAt = validateSourceDate(candidate.updatedAt);
    return Object.freeze({
      externalId,
      displayTitle: requiredTrimmedString(
        candidate.displayTitle,
        ARTICLE_CANDIDATE_LIMITS.title,
      ),
      normalizedTitle: requiredTrimmedString(
        candidate.normalizedTitle,
        ARTICLE_CANDIDATE_LIMITS.title,
      ),
      originalUrl: requiredHttpUrl(
        candidate.originalUrl,
        ARTICLE_CANDIDATE_LIMITS.url,
      ),
      canonicalIdentityUrl: requiredHttpUrl(
        candidate.canonicalIdentityUrl,
        ARTICLE_CANDIDATE_LIMITS.url,
      ),
      author: optionalTrimmedString(
        candidate.author,
        ARTICLE_CANDIDATE_LIMITS.author,
      ),
      summary: optionalTrimmedString(
        candidate.summary,
        ARTICLE_CANDIDATE_LIMITS.summary,
      ),
      imageUrl:
        candidate.imageUrl === undefined
          ? undefined
          : requiredHttpUrl(
              candidate.imageUrl,
              ARTICLE_CANDIDATE_LIMITS.imageUrl,
            ),
      language: optionalTrimmedString(
        candidate.language,
        ARTICLE_CANDIDATE_LIMITS.language,
      ),
      publishedAtStatus: publishedAt.status,
      publishedAt: publishedAt.value,
      sourceUpdatedAtStatus: sourceUpdatedAt.status,
      sourceUpdatedAt: sourceUpdatedAt.value,
      publicationId: requiredUuid(candidate.provenance.publicationId),
      sourceId: requiredUuid(candidate.provenance.sourceId),
      sourceEndpointId: requiredUuid(candidate.provenance.sourceEndpointId),
      collectionRunId: requiredUuid(candidate.provenance.collectionRunId),
    });
  } catch {
    throw new ArticlePersistenceError('invalid_candidate');
  }
}

function validateSourceDate(value: unknown): Readonly<{
  status: 'parsed' | 'missing' | 'invalid';
  value: Date | undefined;
}> {
  if (value === null || typeof value !== 'object') throw new Error();
  const status = Reflect.get(value, 'status');
  if (status === 'missing' || status === 'invalid') {
    if (Reflect.has(value, 'value')) throw new Error();
    return Object.freeze({ status, value: undefined });
  }
  if (status !== 'parsed') throw new Error();
  const timestamp = Reflect.get(value, 'value');
  if (typeof timestamp !== 'string') throw new Error();
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error();
  return Object.freeze({ status, value: date });
}

function validateObservationTime(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ArticlePersistenceError('invalid_observation_time');
  }
  return new Date(value.getTime());
}

function requiredUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new Error();
  return value;
}

function requiredTrimmedString(value: unknown, limit: number): string {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    value.length === 0 ||
    value.length > limit
  ) {
    throw new Error();
  }
  return value;
}

function optionalTrimmedString(
  value: unknown,
  limit: number,
): string | undefined {
  return value === undefined ? undefined : requiredTrimmedString(value, limit);
}

function requiredHttpUrl(value: unknown, limit: number): string {
  const text = requiredTrimmedString(value, limit);
  const url = new URL(text);
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.hostname.length === 0 ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new Error();
  }
  return text;
}

function mapRequiredArticle(
  rows: readonly ArticleRow[],
  operation: string,
): PersistedArticle {
  const row = rows[0];
  if (row === undefined) {
    throw new ArticlePersistenceError('transaction_failed', {
      cause: new Error(`Article ${operation} returned no row.`),
    });
  }
  return mapArticleRow(row);
}

function mapArticleRow(row: ArticleRow): PersistedArticle {
  try {
    return Object.freeze({
      id: requiredUuid(row.id),
      publicationId: requiredUuid(row.publication_id),
      sourceId: requiredUuid(row.source_id),
      externalId: nullableString(row.external_id),
      originalUrl: requiredTrimmedString(
        row.original_url,
        ARTICLE_CANDIDATE_LIMITS.url,
      ),
      canonicalIdentityUrl: requiredTrimmedString(
        row.canonical_identity_url,
        ARTICLE_CANDIDATE_LIMITS.url,
      ),
      displayTitle: requiredTrimmedString(
        row.display_title,
        ARTICLE_CANDIDATE_LIMITS.title,
      ),
      normalizedTitle: requiredTrimmedString(
        row.normalized_title,
        ARTICLE_CANDIDATE_LIMITS.title,
      ),
      author: nullableString(row.author),
      summary: nullableString(row.summary),
      imageUrl: nullableString(row.image_url),
      language: nullableString(row.language),
      publishedAtStatus: requiredDateStatus(row.published_at_status),
      publishedAt: nullableTimestamp(row.published_at),
      sourceUpdatedAtStatus: requiredDateStatus(row.source_updated_at_status),
      sourceUpdatedAt: nullableTimestamp(row.source_updated_at),
      visibilityState: requiredVisibilityState(row.visibility_state),
      firstSeenAt: requiredTimestamp(row.first_seen_at),
      lastSeenAt: requiredTimestamp(row.last_seen_at),
      createdAt: requiredTimestamp(row.created_at),
      updatedAt: requiredTimestamp(row.updated_at),
    });
  } catch (error) {
    if (error instanceof ArticlePersistenceError) throw error;
    throw new ArticlePersistenceError('transaction_failed', { cause: error });
  }
}

function mapObservationRow(row: ObservationRow): PersistedArticleObservation {
  try {
    return Object.freeze({
      id: requiredUuid(row.id),
      publicationId: requiredUuid(row.publication_id),
      sourceId: requiredUuid(row.source_id),
      sourceEndpointId: requiredUuid(row.source_endpoint_id),
      collectionRunId: requiredUuid(row.collection_run_id),
      articleId: requiredUuid(row.article_id),
      observedAt: requiredTimestamp(row.observed_at),
      processingOutcome: requiredSuccessOutcome(row.processing_outcome),
      observedExternalId: nullableString(row.observed_external_id),
      observedCanonicalIdentityUrl: requiredTrimmedString(
        row.observed_canonical_identity_url,
        ARTICLE_CANDIDATE_LIMITS.url,
      ),
    });
  } catch (error) {
    if (error instanceof ArticlePersistenceError) throw error;
    throw new ArticlePersistenceError('transaction_failed', { cause: error });
  }
}

function requiredDateStatus(value: unknown): 'parsed' | 'missing' | 'invalid' {
  if (value === 'parsed' || value === 'missing' || value === 'invalid') {
    return value;
  }
  throw new Error();
}

function requiredVisibilityState(value: unknown): ArticleVisibilityState {
  if (value === 'visible' || value === 'hidden' || value === 'archived') {
    return value;
  }
  throw new Error();
}

function requiredSuccessOutcome(
  value: unknown,
): ArticlePersistenceSuccessOutcome {
  if (value === 'created' || value === 'updated' || value === 'unchanged') {
    return value;
  }
  throw new Error();
}

function nullableString(value: unknown): string | undefined {
  if (value === null) return undefined;
  if (typeof value !== 'string') throw new Error();
  return value;
}

function requiredTimestamp(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error();
  }
  return new Date(value.getTime());
}

function nullableTimestamp(value: unknown): Date | undefined {
  return value === null ? undefined : requiredTimestamp(value);
}

function timestampsEqual(
  left: Date | undefined,
  right: Date | undefined,
): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined && left.getTime() === right.getTime();
}

function isIdentityConstraintConflict(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  return (
    Reflect.get(error, 'code') === '23505' &&
    IDENTITY_CONSTRAINTS.has(String(Reflect.get(error, 'constraint')))
  );
}
