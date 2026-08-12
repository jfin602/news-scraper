import { randomUUID } from 'node:crypto';

import type { ArticleCandidate } from '../collection/normalization/article-candidate.ts';
import { ARTICLE_CANDIDATE_LIMITS } from '../collection/normalization/article-candidate.ts';
import type {
  CategoryReason,
  RelevanceDecision,
  RelevanceDecisionReason,
} from '../collection/relevance/evaluator.ts';
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
export type ArticleObservationReasonCode =
  'default_include' | 'relevance_rule_include' | 'relevance_rule_exclude';

export interface PersistedArticle {
  readonly id: string;
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
  readonly sourceId: string;
  readonly sourceEndpointId: string;
  readonly collectionRunId: string;
  readonly articleId: string;
  readonly observedAt: Date;
  readonly processingOutcome: ArticlePersistenceSuccessOutcome;
  readonly observedExternalId: string | undefined;
  readonly observedCanonicalIdentityUrl: string;
  readonly relevanceRuleId: string | undefined;
  readonly reasonCode: ArticleObservationReasonCode;
  readonly detail: string | undefined;
}

export interface PersistedExcludedArticleObservation {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceEndpointId: string;
  readonly collectionRunId: string;
  readonly articleId: undefined;
  readonly observedAt: Date;
  readonly processingOutcome: 'excluded';
  readonly observedExternalId: string | undefined;
  readonly observedCanonicalIdentityUrl: string;
  readonly relevanceRuleId: string;
  readonly reasonCode: 'relevance_rule_exclude';
  readonly detail: string;
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

export interface ExcludedArticlePersistenceSuccess {
  readonly outcome: 'excluded';
  readonly observation: PersistedExcludedArticleObservation;
}

export type ExcludedArticlePersistenceResult =
  ExcludedArticlePersistenceSuccess | ArticlePersistenceFailure;

export type ArticlePersistenceErrorReason =
  | 'invalid_candidate'
  | 'invalid_observation_time'
  | 'invalid_relevance_decision'
  | 'transaction_failed';

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
  readonly source_id: unknown;
  readonly source_endpoint_id: unknown;
  readonly collection_run_id: unknown;
  readonly article_id: unknown;
  readonly observed_at: unknown;
  readonly processing_outcome: unknown;
  readonly observed_external_id: unknown;
  readonly observed_canonical_identity_url: unknown;
  readonly relevance_rule_id: unknown;
  readonly reason_code: unknown;
  readonly detail: unknown;
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
  readonly sourceId: string;
  readonly sourceEndpointId: string;
  readonly collectionRunId: string;
}

interface IdentityResolution {
  readonly article: PersistedArticle | undefined;
  readonly promoteFallback: boolean;
}

interface ProvenanceContext {
  readonly sourceDefaultCategoryId: string | undefined;
  readonly endpointDefaultCategoryId: string | undefined;
}

interface ValidatedCategoryAssignment {
  readonly configKey: string;
}

interface ValidatedCategoryReason {
  readonly kind: 'rule' | 'endpoint_default' | 'source_default';
  readonly categoryConfigKey: string;
  readonly detail: string;
  readonly ruleConfigKey: string | undefined;
}

interface ValidatedRelevancePersistenceInput {
  readonly included: boolean;
  readonly reasonCode: ArticleObservationReasonCode;
  readonly winningRuleConfigKey: string | undefined;
  readonly detail: string | undefined;
  readonly categoryAssignments: readonly ValidatedCategoryAssignment[];
  readonly categoryReasons: readonly ValidatedCategoryReason[];
}

interface ResolvedCategoryReason extends ValidatedCategoryReason {
  readonly categoryId: string;
  readonly relevanceRuleId: string | undefined;
}

interface ResolvedRelevancePersistenceInput {
  readonly reasonCode: ArticleObservationReasonCode;
  readonly relevanceRuleId: string | undefined;
  readonly detail: string | undefined;
  readonly categoryIds: readonly string[];
  readonly categoryReasons: readonly ResolvedCategoryReason[];
}

interface CategoryReferenceRow {
  readonly id: unknown;
  readonly config_key: unknown;
}

interface RuleReferenceRow {
  readonly id: unknown;
  readonly config_key: unknown;
  readonly source_id: unknown;
  readonly action: unknown;
  readonly category_id: unknown;
}

const ARTICLE_COLUMNS = `
  id, source_id, external_id, original_url,
  canonical_identity_url, display_title, normalized_title, author, summary,
  image_url, language, published_at_status, published_at,
  source_updated_at_status, source_updated_at, visibility_state, first_seen_at, last_seen_at,
  created_at, updated_at`;
const OBSERVATION_COLUMNS = `
  id, source_id, source_endpoint_id, collection_run_id,
  article_id, observed_at, processing_outcome, observed_external_id,
  observed_canonical_identity_url, relevance_rule_id, reason_code, detail`;

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
  decision: RelevanceDecision = defaultIncludeDecision(candidate),
): Promise<ArticlePersistenceResult> {
  const validatedCandidate = validateCandidate(candidate);
  const observedAt = validateObservationTime(observationTime);
  const relevance = validateRelevanceDecision(candidate, decision, true);

  try {
    return await database.transaction(async (transaction) => {
      await acquireArticleIdentityLocks(transaction, {
        sourceId: validatedCandidate.sourceId,
        ...(validatedCandidate.externalId === undefined
          ? {}
          : { externalId: validatedCandidate.externalId }),
        canonicalIdentityUrl: validatedCandidate.canonicalIdentityUrl,
      });

      const provenance = await loadProvenanceContext(
        transaction,
        validatedCandidate,
      );
      if (provenance === undefined) {
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
      const insertedObservation = await insertObservation(
        transaction,
        validatedCandidate,
        persisted.article,
        persisted.outcome,
        observedAt,
      );
      const resolvedRelevance = await resolveRelevancePersistenceInput(
        transaction,
        validatedCandidate,
        provenance,
        relevance,
      );
      const observation = mapIncludedObservationRow(
        await persistObservationDecisionReason(
          transaction,
          insertedObservation.id,
          resolvedRelevance,
        ),
      );
      await reconcileArticleCategories(
        transaction,
        persisted.article.id,
        resolvedRelevance.categoryIds,
      );
      await persistCategoryReasons(
        transaction,
        observation.id,
        resolvedRelevance.categoryReasons,
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

export async function persistExcludedArticleObservation(
  database: Pick<Database, 'transaction'>,
  candidate: ArticleCandidate,
  observationTime: Date,
  decision: RelevanceDecision,
): Promise<ExcludedArticlePersistenceResult> {
  const validatedCandidate = validateCandidate(candidate);
  const observedAt = validateObservationTime(observationTime);
  const relevance = validateRelevanceDecision(candidate, decision, false);

  try {
    return await database.transaction(async (transaction) => {
      const provenance = await loadProvenanceContext(
        transaction,
        validatedCandidate,
      );
      if (provenance === undefined) return PROVENANCE_MISMATCH_RESULT;

      const insertedObservation = await insertExcludedObservation(
        transaction,
        validatedCandidate,
        observedAt,
      );
      const resolvedRelevance = await resolveRelevancePersistenceInput(
        transaction,
        validatedCandidate,
        provenance,
        relevance,
      );
      const observation = mapExcludedObservationRow(
        await persistObservationDecisionReason(
          transaction,
          insertedObservation.id,
          resolvedRelevance,
        ),
      );
      await persistCategoryReasons(
        transaction,
        observation.id,
        resolvedRelevance.categoryReasons,
      );
      return Object.freeze({ outcome: 'excluded' as const, observation });
    });
  } catch (error) {
    if (error instanceof ArticlePersistenceError) throw error;
    throw new ArticlePersistenceError('transaction_failed', { cause: error });
  }
}

async function loadProvenanceContext(
  executor: QueryExecutor,
  candidate: ValidatedCandidate,
): Promise<ProvenanceContext | undefined> {
  const result = await executor.query<{
    readonly source_default_category_id: unknown;
    readonly endpoint_default_category_id: unknown;
  }>(
    `SELECT source.default_category_id AS source_default_category_id,
            endpoint.default_category_id AS endpoint_default_category_id
     FROM sources AS source
     JOIN source_endpoints AS endpoint ON endpoint.source_id = source.id
     JOIN collection_runs AS run ON run.source_endpoint_id = endpoint.id
     WHERE source.id = $1
       AND endpoint.id = $2
       AND run.id = $3`,
    [candidate.sourceId, candidate.sourceEndpointId, candidate.collectionRunId],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  return Object.freeze({
    sourceDefaultCategoryId: nullableUuid(
      row.source_default_category_id,
      'Source default Category id',
    ),
    endpointDefaultCategoryId: nullableUuid(
      row.endpoint_default_category_id,
      'endpoint default Category id',
    ),
  });
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
  if (article.sourceId !== candidate.sourceId) {
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
  sourceId: string,
  canonicalIdentityUrl: string,
): Promise<readonly PersistedArticle[]> {
  const result = await executor.query<ArticleRow>(
    `SELECT ${ARTICLE_COLUMNS}
     FROM articles
     WHERE source_id = $1
       AND canonical_identity_digest = sha256($2::text::bytea)
     ORDER BY id`,
    [sourceId, canonicalIdentityUrl],
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
       WHERE id = $1 AND source_id = $3
       RETURNING ${ARTICLE_COLUMNS}`,
      [resolution.article.id, observationTime, candidate.sourceId],
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
     WHERE id = $1 AND source_id = $16
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
       id, source_id, external_id, original_url,
       canonical_identity_url, display_title, normalized_title, author,
       summary, image_url, language, published_at_status, published_at,
       source_updated_at_status, source_updated_at, first_seen_at, last_seen_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       $15, $16, $16
     )
     RETURNING ${ARTICLE_COLUMNS}`,
    [
      randomUUID(),
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
): Promise<Readonly<{ id: string }>> {
  const result = await executor.query<ObservationRow>(
    `INSERT INTO article_observations (
       id, source_id, source_endpoint_id, collection_run_id,
       article_id, observed_at, processing_outcome, observed_external_id,
       observed_canonical_identity_url
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${OBSERVATION_COLUMNS}`,
    [
      randomUUID(),
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
  return Object.freeze({ id: requiredUuid(row.id) });
}

async function insertExcludedObservation(
  executor: QueryExecutor,
  candidate: ValidatedCandidate,
  observationTime: Date,
): Promise<Readonly<{ id: string }>> {
  const result = await executor.query<{ readonly id: unknown }>(
    `INSERT INTO article_observations (
       id, source_id, source_endpoint_id, collection_run_id,
       article_id, observed_at, processing_outcome, observed_external_id,
       observed_canonical_identity_url
     ) VALUES ($1, $2, $3, $4, NULL, $5, 'excluded', $6, $7)
     RETURNING id`,
    [
      randomUUID(),
      candidate.sourceId,
      candidate.sourceEndpointId,
      candidate.collectionRunId,
      observationTime,
      candidate.externalId ?? null,
      candidate.canonicalIdentityUrl,
    ],
  );
  const row = result.rows[0];
  if (row === undefined)
    throw new ArticlePersistenceError('transaction_failed');
  return Object.freeze({ id: requiredUuid(row.id) });
}

async function resolveRelevancePersistenceInput(
  executor: QueryExecutor,
  candidate: ValidatedCandidate,
  provenance: ProvenanceContext,
  input: ValidatedRelevancePersistenceInput,
): Promise<ResolvedRelevancePersistenceInput> {
  const categoryConfigKeys = input.categoryAssignments.map(
    (assignment) => assignment.configKey,
  );
  const categoryResult =
    categoryConfigKeys.length === 0
      ? { rows: [] as CategoryReferenceRow[] }
      : await executor.query<CategoryReferenceRow>(
          `SELECT id, config_key
           FROM categories
           WHERE config_key = ANY($1::text[])
           ORDER BY config_key`,
          [categoryConfigKeys],
        );
  const categories = new Map<string, string>();
  for (const row of categoryResult.rows) {
    const configKey = requiredConfigKey(row.config_key);
    categories.set(configKey, requiredUuid(row.id));
  }
  if (categories.size !== categoryConfigKeys.length) {
    throw new ArticlePersistenceError('invalid_relevance_decision');
  }

  const ruleConfigKeys = uniqueStrings([
    ...(input.winningRuleConfigKey === undefined
      ? []
      : [input.winningRuleConfigKey]),
    ...input.categoryReasons.flatMap((reason) =>
      reason.ruleConfigKey === undefined ? [] : [reason.ruleConfigKey],
    ),
  ]);
  const ruleResult =
    ruleConfigKeys.length === 0
      ? { rows: [] as RuleReferenceRow[] }
      : await executor.query<RuleReferenceRow>(
          `SELECT id, config_key, source_id, action, category_id
           FROM relevance_rules
           WHERE config_key = ANY($1::text[])
           ORDER BY config_key`,
          [ruleConfigKeys],
        );
  const rules = new Map<
    string,
    Readonly<{
      id: string;
      sourceId: string | undefined;
      action: 'include' | 'exclude' | 'categorize';
      categoryId: string | undefined;
    }>
  >();
  for (const row of ruleResult.rows) {
    const configKey = requiredConfigKey(row.config_key);
    rules.set(
      configKey,
      Object.freeze({
        id: requiredUuid(row.id),
        sourceId: nullableUuid(row.source_id, 'Relevance rule Source id'),
        action: requiredRelevanceAction(row.action),
        categoryId: nullableUuid(row.category_id, 'Relevance rule Category id'),
      }),
    );
  }
  if (rules.size !== ruleConfigKeys.length) {
    throw new ArticlePersistenceError('invalid_relevance_decision');
  }
  for (const rule of rules.values()) {
    if (rule.sourceId !== undefined && rule.sourceId !== candidate.sourceId) {
      throw new ArticlePersistenceError('invalid_relevance_decision');
    }
  }

  const winningRule =
    input.winningRuleConfigKey === undefined
      ? undefined
      : rules.get(input.winningRuleConfigKey);
  const expectedWinningAction = input.included ? 'include' : 'exclude';
  if (
    (winningRule === undefined) !==
      (input.winningRuleConfigKey === undefined) ||
    (winningRule !== undefined && winningRule.action !== expectedWinningAction)
  ) {
    throw new ArticlePersistenceError('invalid_relevance_decision');
  }

  const categoryReasons = input.categoryReasons.map((reason) => {
    const categoryId = categories.get(reason.categoryConfigKey);
    if (categoryId === undefined) {
      throw new ArticlePersistenceError('invalid_relevance_decision');
    }
    if (reason.kind === 'rule') {
      const rule =
        reason.ruleConfigKey === undefined
          ? undefined
          : rules.get(reason.ruleConfigKey);
      if (
        rule === undefined ||
        rule.action !== 'categorize' ||
        rule.categoryId !== categoryId
      ) {
        throw new ArticlePersistenceError('invalid_relevance_decision');
      }
      return Object.freeze({
        ...reason,
        categoryId,
        relevanceRuleId: rule.id,
      });
    }
    if (
      reason.kind === 'endpoint_default'
        ? provenance.endpointDefaultCategoryId !== categoryId
        : provenance.endpointDefaultCategoryId !== undefined ||
          provenance.sourceDefaultCategoryId !== categoryId
    ) {
      throw new ArticlePersistenceError('invalid_relevance_decision');
    }
    return Object.freeze({ ...reason, categoryId, relevanceRuleId: undefined });
  });

  return Object.freeze({
    reasonCode: input.reasonCode,
    relevanceRuleId: winningRule?.id,
    detail: input.detail,
    categoryIds: Object.freeze(
      categoryConfigKeys.map((configKey) => categories.get(configKey)!),
    ),
    categoryReasons: Object.freeze(categoryReasons),
  });
}

async function persistObservationDecisionReason(
  executor: QueryExecutor,
  observationId: string,
  relevance: ResolvedRelevancePersistenceInput,
): Promise<ObservationRow> {
  const result = await executor.query<ObservationRow>(
    `UPDATE article_observations
     SET relevance_rule_id = $2,
         reason_code = $3,
         detail = $4
     WHERE id = $1
     RETURNING ${OBSERVATION_COLUMNS}`,
    [
      observationId,
      relevance.relevanceRuleId ?? null,
      relevance.reasonCode,
      relevance.detail ?? null,
    ],
  );
  const row = result.rows[0];
  if (row === undefined)
    throw new ArticlePersistenceError('transaction_failed');
  return row;
}

async function reconcileArticleCategories(
  executor: QueryExecutor,
  articleId: string,
  categoryIds: readonly string[],
): Promise<void> {
  await executor.query(
    `DELETE FROM article_categories
     WHERE article_id = $1
       AND NOT (category_id = ANY($2::uuid[]))`,
    [articleId, categoryIds],
  );
  for (const categoryId of categoryIds) {
    await executor.query(
      `INSERT INTO article_categories (article_id, category_id)
       VALUES ($1, $2)
       ON CONFLICT (article_id, category_id) DO NOTHING`,
      [articleId, categoryId],
    );
  }
}

async function persistCategoryReasons(
  executor: QueryExecutor,
  observationId: string,
  reasons: readonly ResolvedCategoryReason[],
): Promise<void> {
  for (const [index, reason] of reasons.entries()) {
    await executor.query(
      `INSERT INTO article_observation_category_reasons (
         article_observation_id, category_id, relevance_rule_id,
         reason_position, reason_kind, reason_detail
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        observationId,
        reason.categoryId,
        reason.relevanceRuleId ?? null,
        index + 1,
        reason.kind,
        reason.detail,
      ],
    );
  }
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

function defaultIncludeDecision(
  candidate: ArticleCandidate,
): RelevanceDecision {
  return Object.freeze({
    included: true as const,
    candidate,
    decisionReason: Object.freeze({ kind: 'default_include' as const }),
    categoryAssignments: Object.freeze([]),
    categoryReasons: Object.freeze([]),
  });
}

function validateRelevanceDecision(
  candidate: ArticleCandidate,
  decision: RelevanceDecision,
  expectedIncluded: boolean,
): ValidatedRelevancePersistenceInput {
  try {
    if (
      decision === null ||
      typeof decision !== 'object' ||
      decision.included !== expectedIncluded ||
      (decision.included && decision.candidate !== candidate)
    ) {
      throw new Error();
    }
    const winning = validateWinningReason(decision.decisionReason);
    if (
      (decision.included && winning.reasonCode === 'relevance_rule_exclude') ||
      (!decision.included && winning.reasonCode !== 'relevance_rule_exclude')
    ) {
      throw new Error();
    }

    const categoryAssignments = decision.categoryAssignments.map((assignment) =>
      Object.freeze({ configKey: validateCategoryIdentity(assignment) }),
    );
    const assignmentKeys = new Set(
      categoryAssignments.map((assignment) => assignment.configKey),
    );
    if (assignmentKeys.size !== categoryAssignments.length) throw new Error();

    const categoryReasons = decision.categoryReasons.map((reason) =>
      validateCategoryReason(reason),
    );
    const reasonCategoryKeys = new Set(
      categoryReasons.map((reason) => reason.categoryConfigKey),
    );
    if (
      reasonCategoryKeys.size !== assignmentKeys.size ||
      [...reasonCategoryKeys].some(
        (configKey) => !assignmentKeys.has(configKey),
      )
    ) {
      throw new Error();
    }
    const defaultReasons = categoryReasons.filter(
      (reason) => reason.kind !== 'rule',
    );
    if (
      (defaultReasons.length > 0 &&
        (defaultReasons.length !== 1 || categoryReasons.length !== 1)) ||
      (categoryReasons.length === 0 && categoryAssignments.length !== 0)
    ) {
      throw new Error();
    }

    return Object.freeze({
      included: decision.included,
      reasonCode: winning.reasonCode,
      winningRuleConfigKey: winning.ruleConfigKey,
      detail: winning.detail,
      categoryAssignments: Object.freeze(categoryAssignments),
      categoryReasons: Object.freeze(categoryReasons),
    });
  } catch (error) {
    if (error instanceof ArticlePersistenceError) throw error;
    throw new ArticlePersistenceError('invalid_relevance_decision');
  }
}

function validateWinningReason(reason: RelevanceDecisionReason): Readonly<{
  reasonCode: ArticleObservationReasonCode;
  ruleConfigKey: string | undefined;
  detail: string | undefined;
}> {
  if (reason.kind === 'default_include') {
    return Object.freeze({
      reasonCode: 'default_include',
      ruleConfigKey: undefined,
      detail: undefined,
    });
  }
  if (reason.kind !== 'rule_include' && reason.kind !== 'rule_exclude') {
    throw new Error();
  }
  return Object.freeze({
    reasonCode:
      reason.kind === 'rule_include'
        ? 'relevance_rule_include'
        : 'relevance_rule_exclude',
    ruleConfigKey: requiredConfigKey(reason.ruleConfigKey),
    detail: requiredSnapshotDetail(reason.ruleReason),
  });
}

function validateCategoryReason(
  reason: CategoryReason,
): ValidatedCategoryReason {
  const categoryConfigKey = validateCategoryIdentity(reason.category);
  if (reason.kind === 'rule') {
    return Object.freeze({
      kind: reason.kind,
      categoryConfigKey,
      ruleConfigKey: requiredConfigKey(reason.ruleConfigKey),
      detail: requiredSnapshotDetail(reason.ruleReason),
    });
  }
  if (reason.kind !== 'endpoint_default' && reason.kind !== 'source_default') {
    throw new Error();
  }
  return Object.freeze({
    kind: reason.kind,
    categoryConfigKey,
    ruleConfigKey: undefined,
    detail: boundedCategorySnapshot(reason.category.displayName),
  });
}

function validateCategoryIdentity(value: {
  readonly configKey: string;
  readonly displayName: string;
}): string {
  requiredTrimmedString(value.displayName, 200);
  return requiredConfigKey(value.configKey);
}

function requiredSnapshotDetail(value: unknown): string {
  return requiredTrimmedString(value, 160);
}

function boundedCategorySnapshot(value: string): string {
  const validated = requiredTrimmedString(value, 200);
  return validated.slice(0, 160).trimEnd();
}

function requiredConfigKey(value: unknown): string {
  const configKey = requiredTrimmedString(value, 100);
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(configKey)) throw new Error();
  return configKey;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
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

function mapIncludedObservationRow(
  row: ObservationRow,
): PersistedArticleObservation {
  try {
    const reasonCode = requiredIncludedObservationReasonCode(row.reason_code);
    return Object.freeze({
      id: requiredUuid(row.id),
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
      relevanceRuleId: nullableUuid(
        row.relevance_rule_id,
        'observation Relevance rule id',
      ),
      reasonCode,
      detail: nullableString(row.detail),
    });
  } catch (error) {
    if (error instanceof ArticlePersistenceError) throw error;
    throw new ArticlePersistenceError('transaction_failed', { cause: error });
  }
}

function mapExcludedObservationRow(
  row: ObservationRow,
): PersistedExcludedArticleObservation {
  try {
    if (
      row.processing_outcome !== 'excluded' ||
      row.article_id !== null ||
      row.reason_code !== 'relevance_rule_exclude'
    ) {
      throw new Error();
    }
    return Object.freeze({
      id: requiredUuid(row.id),
      sourceId: requiredUuid(row.source_id),
      sourceEndpointId: requiredUuid(row.source_endpoint_id),
      collectionRunId: requiredUuid(row.collection_run_id),
      articleId: undefined,
      observedAt: requiredTimestamp(row.observed_at),
      processingOutcome: 'excluded',
      observedExternalId: nullableString(row.observed_external_id),
      observedCanonicalIdentityUrl: requiredTrimmedString(
        row.observed_canonical_identity_url,
        ARTICLE_CANDIDATE_LIMITS.url,
      ),
      relevanceRuleId: requiredUuid(row.relevance_rule_id),
      reasonCode: 'relevance_rule_exclude',
      detail: requiredSnapshotDetail(row.detail),
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

function requiredIncludedObservationReasonCode(
  value: unknown,
): Exclude<ArticleObservationReasonCode, 'relevance_rule_exclude'> {
  if (value === 'default_include' || value === 'relevance_rule_include') {
    return value;
  }
  throw new Error();
}

function requiredRelevanceAction(
  value: unknown,
): 'include' | 'exclude' | 'categorize' {
  if (value === 'include' || value === 'exclude' || value === 'categorize') {
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

function nullableUuid(value: unknown, field: string): string | undefined {
  if (value === null) return undefined;
  try {
    return requiredUuid(value);
  } catch {
    throw new ArticlePersistenceError('transaction_failed', {
      cause: new Error(`Invalid ${field}.`),
    });
  }
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
