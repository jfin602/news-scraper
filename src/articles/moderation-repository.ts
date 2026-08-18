import type { QueryExecutor } from '../database/database.ts';
import { randomUUID } from 'node:crypto';

export const ARTICLE_MODERATION_PAGE_SIZE = 50;
export const ARTICLE_MODERATION_MAX_PAGE_SIZE = 100;
export const ARTICLE_MODERATION_HISTORY_PAGE_SIZE = 50;
export const ARTICLE_MODERATION_MAX_HISTORY_PAGE_SIZE = 100;

export type ModerationVisibilityState = 'visible' | 'hidden' | 'archived';
export type ModerationDuplicateRole = 'ungrouped' | 'primary' | 'non_primary';
export type ModerationReviewState =
  'pending' | 'dismissed' | 'merged' | 'superseded';

export interface ModerationSearchCriteria {
  readonly query?: string;
  readonly sourceConfigKey?: string;
  readonly visibilityState?: ModerationVisibilityState;
  readonly categoryConfigKey?: string;
  readonly duplicateRole?: ModerationDuplicateRole;
  readonly duplicateGroupId?: string;
  readonly duplicateReviewState?: ModerationReviewState;
  readonly duplicateReviewParticipating?: boolean;
  readonly pageSize: number;
}

export interface ModerationSearchCursor {
  readonly lastSeenAt: string;
  readonly articleId: string;
}

export interface NormalizedModerationSearchRequest {
  readonly criteria: ModerationSearchCriteria;
  readonly cursor?: ModerationSearchCursor;
}

export interface ModerationCategory {
  readonly configKey: string;
  readonly displayName: string;
}

export interface ModerationSource {
  readonly id: string;
  readonly configKey: string;
  readonly displayName: string;
}

export interface ModerationDuplicateState {
  readonly role: ModerationDuplicateRole;
  readonly groupId: string | null;
  readonly primaryArticleId: string | null;
  readonly primarySelectionOrigin: 'automatic' | 'manual' | null;
  readonly reviewStates: readonly ModerationReviewState[];
  readonly reviewParticipating: boolean;
}

export interface ModeratedArticle {
  readonly articleId: string;
  readonly source: ModerationSource;
  readonly displayTitle: string;
  readonly sourceDerivedDisplayTitle: string;
  readonly displayTitleOverride: string | null;
  readonly visibilityState: ModerationVisibilityState;
  readonly automaticCategories: readonly ModerationCategory[];
  readonly manualCategoryOverride: Readonly<{
    readonly active: boolean;
    readonly categories: readonly ModerationCategory[];
  }>;
  readonly effectiveCategories: readonly ModerationCategory[];
  readonly externalId: string | null;
  readonly originalUrl: string;
  readonly canonicalIdentityUrl: string;
  readonly author: string | null;
  readonly summary: string | null;
  readonly imageUrl: string | null;
  readonly language: string | null;
  readonly publishedAtStatus: 'parsed' | 'missing' | 'invalid';
  readonly publishedAt: Date | null;
  readonly sourceUpdatedAtStatus: 'parsed' | 'missing' | 'invalid';
  readonly sourceUpdatedAt: Date | null;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly duplicate: ModerationDuplicateState;
}

export interface ModerationObservation {
  readonly observationId: string;
  readonly observedAt: Date;
  readonly processingOutcome:
    'created' | 'updated' | 'unchanged' | 'rejected' | 'excluded' | 'failed';
  readonly source: ModerationSource;
  readonly endpoint: Readonly<{ id: string; configKey: string }>;
  readonly collectionRun: Readonly<{
    readonly id: string;
    readonly executionId: string;
    readonly startedAt: Date;
    readonly finishedAt: Date | null;
    readonly status: 'running' | 'succeeded' | 'failed';
    readonly transportStatus: string;
    readonly parserStatus: string;
  }>;
  readonly observedExternalId: string | null;
  readonly observedCanonicalIdentityUrl: string | null;
  readonly relevance: Readonly<{
    readonly reasonCode: string | null;
    readonly ruleId: string | null;
    readonly detail: string | null;
  }>;
  readonly categoryReasons: readonly Readonly<{
    readonly category: ModerationCategory;
    readonly kind: 'rule' | 'endpoint_default' | 'source_default';
    readonly ruleId: string | null;
    readonly position: number;
    readonly detail: string;
  }>[];
}

export interface ModerationDuplicateReview {
  readonly candidateId: string;
  readonly articleLowId: string;
  readonly articleHighId: string;
  readonly state: ModerationReviewState;
  readonly origin: 'automatic' | 'manual';
  readonly confidence: number;
  readonly evidenceFingerprint: string;
  readonly manualDecidedAt: Date | null;
  readonly manualDecisionReason: string | null;
  readonly signals: readonly Readonly<{
    readonly order: number;
    readonly reasonCode: string;
    readonly strength: 'strong' | 'weak';
  }>[];
}

export interface ModeratedArticleDetail extends ModeratedArticle {
  readonly duplicateReviews: readonly ModerationDuplicateReview[];
}

export interface ModerationAuditEvent {
  readonly id: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly occurredAt: Date;
  readonly reason: string | null;
  readonly priorState: Readonly<Record<string, unknown>> | null;
  readonly newState: Readonly<Record<string, unknown>> | null;
}

interface ArticleRow {
  readonly article_id: unknown;
  readonly source_id: unknown;
  readonly source_config_key: unknown;
  readonly source_display_name: unknown;
  readonly display_title: unknown;
  readonly display_title_override: unknown;
  readonly visibility_state: unknown;
  readonly external_id: unknown;
  readonly original_url: unknown;
  readonly canonical_identity_url: unknown;
  readonly author: unknown;
  readonly summary: unknown;
  readonly image_url: unknown;
  readonly language: unknown;
  readonly published_at_status: unknown;
  readonly published_at: unknown;
  readonly source_updated_at_status: unknown;
  readonly source_updated_at: unknown;
  readonly first_seen_at: unknown;
  readonly last_seen_at: unknown;
  readonly cursor_last_seen_at: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
  readonly duplicate_role: unknown;
  readonly duplicate_group_id: unknown;
  readonly primary_article_id: unknown;
  readonly primary_selection_origin: unknown;
  readonly review_states: unknown;
  readonly review_participating: unknown;
  readonly manual_override_active: unknown;
}

interface CategoryMembershipRow {
  readonly article_id: unknown;
  readonly membership_kind: unknown;
  readonly config_key: unknown;
  readonly display_name: unknown;
}

interface ModerationCategoryBundles {
  readonly automatic: readonly ModerationCategory[];
  readonly manual: readonly ModerationCategory[];
}

interface ObservationRow {
  readonly observation_id: unknown;
  readonly observed_at: unknown;
  readonly processing_outcome: unknown;
  readonly source_id: unknown;
  readonly source_config_key: unknown;
  readonly source_display_name: unknown;
  readonly endpoint_id: unknown;
  readonly endpoint_config_key: unknown;
  readonly run_id: unknown;
  readonly execution_id: unknown;
  readonly run_started_at: unknown;
  readonly run_finished_at: unknown;
  readonly run_status: unknown;
  readonly transport_status: unknown;
  readonly parser_status: unknown;
  readonly observed_external_id: unknown;
  readonly observed_canonical_identity_url: unknown;
  readonly reason_code: unknown;
  readonly relevance_rule_id: unknown;
  readonly detail: unknown;
}

interface CategoryReasonRow {
  readonly observation_id: unknown;
  readonly category_config_key: unknown;
  readonly category_display_name: unknown;
  readonly relevance_rule_id: unknown;
  readonly reason_position: unknown;
  readonly reason_kind: unknown;
  readonly reason_detail: unknown;
}

interface ReviewRow {
  readonly candidate_id: unknown;
  readonly article_low_id: unknown;
  readonly article_high_id: unknown;
  readonly state: unknown;
  readonly origin: unknown;
  readonly confidence: unknown;
  readonly evidence_fingerprint: unknown;
  readonly manual_decided_at: unknown;
  readonly manual_decision_reason: unknown;
}

interface SignalRow {
  readonly candidate_id: unknown;
  readonly signal_order: unknown;
  readonly reason_code: unknown;
  readonly signal_strength: unknown;
}

interface AuditRow {
  readonly id: unknown;
  readonly action: unknown;
  readonly target_type: unknown;
  readonly target_id: unknown;
  readonly occurred_at: unknown;
  readonly cursor_occurred_at: unknown;
  readonly reason: unknown;
  readonly prior_state: unknown;
  readonly new_state: unknown;
}

const ARTICLE_SELECT = `
  SELECT
    article.id AS article_id,
    source.id AS source_id,
    source.config_key AS source_config_key,
    source.display_name AS source_display_name,
    article.display_title,
    article.display_title_override,
    article.visibility_state,
    article.external_id,
    article.original_url,
    article.canonical_identity_url,
    article.author,
    article.summary,
    article.image_url,
    article.language,
    article.published_at_status,
    article.published_at,
    article.source_updated_at_status,
    article.source_updated_at,
    article.first_seen_at,
    article.last_seen_at,
    to_char(article.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_last_seen_at,
    article.created_at,
    article.updated_at,
    CASE
      WHEN membership.article_id IS NULL THEN 'ungrouped'
      WHEN duplicate_group.primary_article_id = article.id THEN 'primary'
      ELSE 'non_primary'
    END AS duplicate_role,
    membership.group_id AS duplicate_group_id,
    duplicate_group.primary_article_id,
    duplicate_group.primary_selection_origin,
    COALESCE(review.review_states, ARRAY[]::text[]) AS review_states,
    (review.review_states IS NOT NULL) AS review_participating,
    (category_override.article_id IS NOT NULL) AS manual_override_active
  FROM articles AS article
  JOIN sources AS source ON source.id = article.source_id
  LEFT JOIN duplicate_group_memberships AS membership
    ON membership.article_id = article.id
  LEFT JOIN duplicate_groups AS duplicate_group
    ON duplicate_group.id = membership.group_id
  LEFT JOIN article_category_overrides AS category_override
    ON category_override.article_id = article.id
  LEFT JOIN LATERAL (
    SELECT array_agg(candidate.state ORDER BY candidate.updated_at DESC, candidate.id) AS review_states
    FROM duplicate_review_candidates AS candidate
    WHERE candidate.article_low_id = article.id
       OR candidate.article_high_id = article.id
  ) AS review ON TRUE`;

export async function readModeratedArticles(
  executor: QueryExecutor,
  request: NormalizedModerationSearchRequest,
): Promise<
  Readonly<{
    articles: readonly ModeratedArticle[];
    nextCursor: ModerationSearchCursor | null;
  }>
> {
  const { criteria, cursor } = request;
  const result = await executor.query<ArticleRow>(
    `${ARTICLE_SELECT}
     WHERE ($1::text IS NULL OR (
       strpos(lower(coalesce(article.display_title_override, article.display_title)), lower($1::text)) > 0
       OR strpos(lower(article.display_title), lower($1::text)) > 0
       OR strpos(lower(article.normalized_title), lower($1::text)) > 0
       OR strpos(lower(coalesce(article.author, '')), lower($1::text)) > 0
       OR strpos(lower(coalesce(article.summary, '')), lower($1::text)) > 0
       OR strpos(lower(article.original_url), lower($1::text)) > 0
     ))
       AND ($2::text IS NULL OR source.config_key = $2::text)
       AND ($3::text IS NULL OR article.visibility_state = $3::text)
       AND ($4::text IS NULL OR EXISTS (
         SELECT 1
         FROM categories AS category
         LEFT JOIN article_categories AS automatic_membership
           ON automatic_membership.category_id = category.id
          AND automatic_membership.article_id = article.id
         LEFT JOIN article_category_override_memberships AS manual_membership
           ON manual_membership.category_id = category.id
          AND manual_membership.article_id = article.id
         WHERE category.config_key = $4::text
           AND CASE WHEN category_override.article_id IS NOT NULL
                    THEN manual_membership.article_id IS NOT NULL
                    ELSE automatic_membership.article_id IS NOT NULL
               END
       ))
       AND ($5::text IS NULL OR (
         CASE
           WHEN membership.article_id IS NULL THEN 'ungrouped'
           WHEN duplicate_group.primary_article_id = article.id THEN 'primary'
           ELSE 'non_primary'
         END
       ) = $5::text)
       AND ($6::uuid IS NULL OR membership.group_id = $6::uuid)
       AND ($7::text IS NULL OR EXISTS (
         SELECT 1
         FROM duplicate_review_candidates AS candidate
         WHERE (candidate.article_low_id = article.id OR candidate.article_high_id = article.id)
           AND candidate.state = $7::text
       ))
       AND ($8::boolean IS NULL OR (($8::boolean AND review.review_states IS NOT NULL)
         OR (NOT $8::boolean AND review.review_states IS NULL)))
       AND ($9::timestamptz IS NULL OR article.last_seen_at < $9::timestamptz
         OR (article.last_seen_at = $9::timestamptz AND article.id > $10::uuid))
     ORDER BY article.last_seen_at DESC, article.id ASC
     LIMIT $11::integer`,
    [
      criteria.query ?? null,
      criteria.sourceConfigKey ?? null,
      criteria.visibilityState ?? null,
      criteria.categoryConfigKey ?? null,
      criteria.duplicateRole ?? null,
      criteria.duplicateGroupId ?? null,
      criteria.duplicateReviewState ?? null,
      criteria.duplicateReviewParticipating ?? null,
      cursor?.lastSeenAt ?? null,
      cursor?.articleId ?? null,
      criteria.pageSize + 1,
    ],
  );
  const hasMore = result.rows.length > criteria.pageSize;
  const rows = hasMore ? result.rows.slice(0, criteria.pageSize) : result.rows;
  const categories = await loadModerationCategories(
    executor,
    rows.map((row) => requiredUuid(row.article_id)),
  );
  const articles = rows.map((row) =>
    mapArticle(row, categoryBundlesFor(categories, row.article_id)),
  );
  const last = rows.at(-1);
  return Object.freeze({
    articles: Object.freeze(articles),
    nextCursor:
      hasMore && last !== undefined
        ? Object.freeze({
            lastSeenAt: requiredText(last.cursor_last_seen_at, 30),
            articleId: requiredUuid(last.article_id),
          })
        : null,
  });
}

export async function readModeratedArticle(
  executor: QueryExecutor,
  articleId: string,
): Promise<ModeratedArticleDetail | undefined> {
  const result = await executor.query<ArticleRow>(
    `${ARTICLE_SELECT} WHERE article.id = $1`,
    [articleId],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  const categories = await loadModerationCategories(executor, [articleId]);
  return mapArticleWithReviews(
    executor,
    row,
    categoryBundlesFor(categories, row.article_id),
  );
}

export async function lockModeratedArticle(
  executor: QueryExecutor,
  articleId: string,
): Promise<ModeratedArticleDetail | undefined> {
  const result = await executor.query<ArticleRow>(
    `${ARTICLE_SELECT} WHERE article.id = $1 FOR UPDATE OF article`,
    [articleId],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  const categories = await loadModerationCategories(executor, [articleId]);
  return mapArticleWithReviews(
    executor,
    row,
    categoryBundlesFor(categories, row.article_id),
  );
}

export async function readObservations(
  executor: QueryExecutor,
  articleId: string,
  limit: number,
): Promise<readonly ModerationObservation[]> {
  const result = await executor.query<ObservationRow>(
    `SELECT
       observation.id AS observation_id,
       observation.observed_at,
       observation.processing_outcome,
       observation.source_id,
       source.config_key AS source_config_key,
       source.display_name AS source_display_name,
       endpoint.id AS endpoint_id,
       endpoint.config_key AS endpoint_config_key,
       run.id AS run_id,
       run.execution_id,
       run.started_at AS run_started_at,
       run.finished_at AS run_finished_at,
       run.run_status,
       run.transport_status,
       run.parser_status,
       observation.observed_external_id,
       observation.observed_canonical_identity_url,
       observation.reason_code,
       observation.relevance_rule_id,
       observation.detail
     FROM article_observations AS observation
     JOIN sources AS source ON source.id = observation.source_id
     JOIN source_endpoints AS endpoint ON endpoint.id = observation.source_endpoint_id
     JOIN collection_runs AS run ON run.id = observation.collection_run_id
     WHERE observation.article_id = $1
     ORDER BY observation.observed_at DESC, observation.id DESC
     LIMIT $2::integer`,
    [articleId, limit],
  );
  const ids = result.rows.map((row) => requiredUuid(row.observation_id));
  const reasons = await readCategoryReasons(executor, ids);
  return Object.freeze(
    result.rows.map((row) =>
      mapObservation(row, reasons.get(requiredUuid(row.observation_id)) ?? []),
    ),
  );
}

export async function readAuditEvents(
  executor: QueryExecutor,
  articleId: string,
  limit: number,
  cursor?: Readonly<{ occurredAt: string; eventId: string }>,
): Promise<
  Readonly<{
    events: readonly ModerationAuditEvent[];
    nextCursor: Readonly<{ occurredAt: string; eventId: string }> | null;
  }>
> {
  const result = await executor.query<AuditRow>(
    `SELECT id, action, target_type, target_id, occurred_at,
            to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_occurred_at,
            reason, prior_state, new_state
     FROM audit_events
     WHERE target_type = 'article'
       AND target_id = $1
       AND ($2::timestamptz IS NULL OR occurred_at < $2::timestamptz
         OR (occurred_at = $2::timestamptz AND id < $3::uuid))
     ORDER BY occurred_at DESC, id DESC
     LIMIT $4::integer`,
    [articleId, cursor?.occurredAt ?? null, cursor?.eventId ?? null, limit + 1],
  );
  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  const events = Object.freeze(rows.map(mapAuditEvent));
  const last = rows.at(-1);
  return Object.freeze({
    events,
    nextCursor:
      hasMore && last !== undefined
        ? Object.freeze({
            occurredAt: requiredText(last.cursor_occurred_at, 30),
            eventId: requiredUuid(last.id),
          })
        : null,
  });
}

export async function writeAuditEvent(
  executor: QueryExecutor,
  input: Readonly<{
    readonly action: string;
    readonly targetId: string;
    readonly reason: string | null;
    readonly priorState: Readonly<Record<string, unknown>> | null;
    readonly newState: Readonly<Record<string, unknown>> | null;
  }>,
): Promise<ModerationAuditEvent> {
  const result = await executor.query<AuditRow>(
    `INSERT INTO audit_events
       (id, action, target_type, target_id, reason, prior_state, new_state)
     VALUES ($1, $2, 'article', $3, $4, $5::jsonb, $6::jsonb)
     RETURNING id, action, target_type, target_id, occurred_at, reason, prior_state, new_state`,
    [
      randomUUID(),
      input.action,
      input.targetId,
      input.reason,
      input.priorState === null ? null : JSON.stringify(input.priorState),
      input.newState === null ? null : JSON.stringify(input.newState),
    ],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('Audit event insert returned no row.');
  return mapAuditEvent(row);
}

export async function replaceManualCategoryOverride(
  executor: QueryExecutor,
  articleId: string,
  categoryIds: readonly string[],
): Promise<void> {
  await executor.query(
    `INSERT INTO article_category_overrides (article_id, updated_at)
     VALUES ($1, now())
     ON CONFLICT (article_id) DO UPDATE SET updated_at = now()`,
    [articleId],
  );
  await executor.query(
    `DELETE FROM article_category_override_memberships
     WHERE article_id = $1`,
    [articleId],
  );
  for (const categoryId of categoryIds) {
    await executor.query(
      `INSERT INTO article_category_override_memberships (article_id, category_id)
       VALUES ($1, $2)`,
      [articleId, categoryId],
    );
  }
}

export async function clearManualCategoryOverride(
  executor: QueryExecutor,
  articleId: string,
): Promise<void> {
  await executor.query(
    'DELETE FROM article_category_overrides WHERE article_id = $1',
    [articleId],
  );
}

export async function readCategoryIds(
  executor: QueryExecutor,
  articleId: string,
  manual: boolean,
): Promise<readonly string[]> {
  const result = await executor.query<{ readonly id: unknown }>(
    `SELECT category.id
     FROM categories AS category
     JOIN ${manual ? 'article_category_override_memberships' : 'article_categories'} AS membership
       ON membership.category_id = category.id
     WHERE membership.article_id = $1
     ORDER BY category.config_key ASC`,
    [articleId],
  );
  return Object.freeze(result.rows.map((row) => requiredUuid(row.id)));
}

function mapArticle(
  row: ArticleRow,
  categories: ModerationCategoryBundles,
): ModeratedArticle {
  const articleId = requiredUuid(row.article_id);
  const automaticCategories = categories.automatic;
  const manualCategories = categories.manual;
  const effectiveCategories =
    row.manual_override_active === true
      ? manualCategories
      : automaticCategories;
  return Object.freeze({
    articleId,
    source: Object.freeze({
      id: requiredUuid(row.source_id),
      configKey: requiredText(row.source_config_key, 100),
      displayName: requiredText(row.source_display_name, 200),
    }),
    displayTitle: requiredText(
      row.display_title_override ?? row.display_title,
      2048,
    ),
    sourceDerivedDisplayTitle: requiredText(row.display_title, 2048),
    displayTitleOverride: nullableText(row.display_title_override, 2048),
    visibilityState: requiredVisibility(row.visibility_state),
    automaticCategories,
    manualCategoryOverride: Object.freeze({
      active: row.manual_override_active === true,
      categories: manualCategories,
    }),
    effectiveCategories,
    externalId: nullableText(row.external_id, 2048),
    originalUrl: requiredText(row.original_url, 8192),
    canonicalIdentityUrl: requiredText(row.canonical_identity_url, 8192),
    author: nullableText(row.author, 1024),
    summary: nullableText(row.summary, 32768),
    imageUrl: nullableText(row.image_url, 8192),
    language: nullableText(row.language, 128),
    publishedAtStatus: requiredDateStatus(row.published_at_status),
    publishedAt: nullableDate(row.published_at),
    sourceUpdatedAtStatus: requiredDateStatus(row.source_updated_at_status),
    sourceUpdatedAt: nullableDate(row.source_updated_at),
    firstSeenAt: requiredDate(row.first_seen_at),
    lastSeenAt: requiredDate(row.last_seen_at),
    createdAt: requiredDate(row.created_at),
    updatedAt: requiredDate(row.updated_at),
    duplicate: Object.freeze({
      role: requiredDuplicateRole(row.duplicate_role),
      groupId: nullableUuid(row.duplicate_group_id),
      primaryArticleId: nullableUuid(row.primary_article_id),
      primarySelectionOrigin: nullablePrimaryOrigin(
        row.primary_selection_origin,
      ),
      reviewStates: requiredReviewStates(row.review_states),
      reviewParticipating: row.review_participating === true,
    }),
  });
}

async function loadModerationCategories(
  executor: QueryExecutor,
  articleIds: readonly string[],
): Promise<ReadonlyMap<string, ModerationCategoryBundles>> {
  const requestedArticleIds = [...new Set(articleIds)];
  const categories = new Map<
    string,
    { automatic: ModerationCategory[]; manual: ModerationCategory[] }
  >();
  for (const articleId of requestedArticleIds) {
    categories.set(articleId, { automatic: [], manual: [] });
  }
  if (requestedArticleIds.length === 0) return categories;

  const result = await executor.query<CategoryMembershipRow>(
    `SELECT membership.article_id, membership.membership_kind,
            category.config_key, category.display_name
     FROM (
       SELECT article_id, category_id, 'automatic'::text AS membership_kind
       FROM article_categories
       WHERE article_id = ANY($1::uuid[])
       UNION ALL
       SELECT article_id, category_id, 'manual'::text AS membership_kind
       FROM article_category_override_memberships
       WHERE article_id = ANY($1::uuid[])
     ) AS membership
     JOIN categories AS category ON category.id = membership.category_id
     ORDER BY membership.article_id ASC, membership.membership_kind ASC,
              category.config_key ASC`,
    [requestedArticleIds],
  );
  for (const row of result.rows) {
    const articleId = requiredUuid(row.article_id);
    const bundle = categories.get(articleId);
    if (bundle === undefined)
      throw new Error('Unexpected moderation Category membership Article.');
    const category = Object.freeze({
      configKey: requiredText(row.config_key, 100),
      displayName: requiredText(row.display_name, 200),
    });
    if (row.membership_kind === 'automatic') {
      bundle.automatic.push(category);
    } else if (row.membership_kind === 'manual') {
      bundle.manual.push(category);
    } else {
      throw new Error('Invalid moderation Category membership kind.');
    }
  }

  return new Map(
    [...categories].map(([articleId, bundle]) => [
      articleId,
      Object.freeze({
        automatic: Object.freeze(bundle.automatic),
        manual: Object.freeze(bundle.manual),
      }),
    ]),
  );
}

function categoryBundlesFor(
  categories: ReadonlyMap<string, ModerationCategoryBundles>,
  articleId: unknown,
): ModerationCategoryBundles {
  const bundle = categories.get(requiredUuid(articleId));
  if (bundle === undefined)
    throw new Error('Missing moderation Category membership bundle.');
  return bundle;
}

async function readCategoryReasons(
  executor: QueryExecutor,
  observationIds: readonly string[],
): Promise<ReadonlyMap<string, readonly CategoryReasonRow[]>> {
  if (observationIds.length === 0) return new Map();
  const result = await executor.query<CategoryReasonRow>(
    `SELECT
       reason.article_observation_id AS observation_id,
       category.config_key AS category_config_key,
       category.display_name AS category_display_name,
       reason.relevance_rule_id,
       reason.reason_position,
       reason.reason_kind,
       reason.reason_detail
     FROM article_observation_category_reasons AS reason
     JOIN categories AS category ON category.id = reason.category_id
     WHERE reason.article_observation_id = ANY($1::uuid[])
     ORDER BY reason.article_observation_id, reason.reason_position ASC`,
    [observationIds],
  );
  const byObservation = new Map<string, CategoryReasonRow[]>();
  for (const row of result.rows) {
    const id = requiredUuid(row.observation_id);
    const current = byObservation.get(id) ?? [];
    current.push(row);
    byObservation.set(id, current);
  }
  return byObservation;
}

function mapObservation(
  row: ObservationRow,
  categoryReasons: readonly CategoryReasonRow[],
): ModerationObservation {
  return Object.freeze({
    observationId: requiredUuid(row.observation_id),
    observedAt: requiredDate(row.observed_at),
    processingOutcome: requiredOutcome(row.processing_outcome),
    source: Object.freeze({
      id: requiredUuid(row.source_id),
      configKey: requiredText(row.source_config_key, 100),
      displayName: requiredText(row.source_display_name, 200),
    }),
    endpoint: Object.freeze({
      id: requiredUuid(row.endpoint_id),
      configKey: requiredText(row.endpoint_config_key, 100),
    }),
    collectionRun: Object.freeze({
      id: requiredUuid(row.run_id),
      executionId: requiredText(row.execution_id, 200),
      startedAt: requiredDate(row.run_started_at),
      finishedAt: nullableDate(row.run_finished_at),
      status: requiredRunStatus(row.run_status),
      transportStatus: requiredText(row.transport_status, 100),
      parserStatus: requiredText(row.parser_status, 100),
    }),
    observedExternalId: nullableText(row.observed_external_id, 2048),
    observedCanonicalIdentityUrl: nullableText(
      row.observed_canonical_identity_url,
      8192,
    ),
    relevance: Object.freeze({
      reasonCode: nullableText(row.reason_code, 100),
      ruleId: nullableUuid(row.relevance_rule_id),
      detail: nullableText(row.detail, 160),
    }),
    categoryReasons: Object.freeze(
      categoryReasons.map((reason) =>
        Object.freeze({
          category: Object.freeze({
            configKey: requiredText(reason.category_config_key, 100),
            displayName: requiredText(reason.category_display_name, 200),
          }),
          kind: requiredReasonKind(reason.reason_kind),
          ruleId: nullableUuid(reason.relevance_rule_id),
          position: requiredInteger(reason.reason_position),
          detail: requiredText(reason.reason_detail, 160),
        }),
      ),
    ),
  });
}

async function readReviews(
  executor: QueryExecutor,
  articleId: string,
): Promise<readonly ModerationDuplicateReview[]> {
  const result = await executor.query<ReviewRow>(
    `SELECT id AS candidate_id, article_low_id, article_high_id, state,
            origin, confidence, evidence_fingerprint, manual_decided_at,
            manual_decision_reason
     FROM duplicate_review_candidates
     WHERE article_low_id = $1 OR article_high_id = $1
     ORDER BY updated_at DESC, id DESC
     LIMIT 50`,
    [articleId],
  );
  const ids = result.rows.map((row) => requiredUuid(row.candidate_id));
  const signals = await readSignals(executor, ids);
  return Object.freeze(
    result.rows.map((row) => {
      const id = requiredUuid(row.candidate_id);
      return Object.freeze({
        candidateId: id,
        articleLowId: requiredUuid(row.article_low_id),
        articleHighId: requiredUuid(row.article_high_id),
        state: requiredReviewState(row.state),
        origin: requiredOrigin(row.origin),
        confidence: requiredInteger(row.confidence),
        evidenceFingerprint: requiredText(row.evidence_fingerprint, 64),
        manualDecidedAt: nullableDate(row.manual_decided_at),
        manualDecisionReason: nullableText(row.manual_decision_reason, 2000),
        signals: Object.freeze(signals.get(id) ?? []),
      });
    }),
  );
}

async function readSignals(
  executor: QueryExecutor,
  candidateIds: readonly string[],
): Promise<
  ReadonlyMap<
    string,
    readonly Readonly<{
      order: number;
      reasonCode: string;
      strength: 'strong' | 'weak';
    }>[]
  >
> {
  if (candidateIds.length === 0) return new Map();
  const result = await executor.query<SignalRow>(
    `SELECT candidate_id, signal_order, reason_code, signal_strength
     FROM duplicate_review_signals
     WHERE candidate_id = ANY($1::uuid[])
     ORDER BY candidate_id, signal_order`,
    [candidateIds],
  );
  const byCandidate = new Map<
    string,
    Readonly<{
      order: number;
      reasonCode: string;
      strength: 'strong' | 'weak';
    }>[]
  >();
  for (const row of result.rows) {
    const id = requiredUuid(row.candidate_id);
    const current = byCandidate.get(id) ?? [];
    current.push(
      Object.freeze({
        order: requiredInteger(row.signal_order),
        reasonCode: requiredText(row.reason_code, 100),
        strength: requiredStrength(row.signal_strength),
      }),
    );
    byCandidate.set(id, current);
  }
  return byCandidate;
}

async function mapArticleWithReviews(
  executor: QueryExecutor,
  row: ArticleRow,
  categories: ModerationCategoryBundles,
): Promise<ModeratedArticleDetail> {
  return Object.freeze({
    ...mapArticle(row, categories),
    duplicateReviews: await readReviews(executor, requiredUuid(row.article_id)),
  });
}

function mapAuditEvent(row: AuditRow): ModerationAuditEvent {
  return Object.freeze({
    id: requiredUuid(row.id),
    action: requiredText(row.action, 100),
    targetType: requiredText(row.target_type, 100),
    targetId: requiredUuid(row.target_id),
    occurredAt: requiredDate(row.occurred_at),
    reason: nullableText(row.reason, 2000),
    priorState: nullableJsonObject(row.prior_state),
    newState: nullableJsonObject(row.new_state),
  });
}

function requiredUuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      value,
    )
  ) {
    throw new Error('Invalid moderation UUID.');
  }
  return value.toLowerCase();
}

function nullableUuid(value: unknown): string | null {
  return value === null ? null : requiredUuid(value);
}

function requiredText(value: unknown, max: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > max ||
    value !== value.trim()
  ) {
    throw new Error('Invalid moderation text.');
  }
  return value;
}

function nullableText(value: unknown, max: number): string | null {
  return value === null ? null : requiredText(value, max);
}

function requiredDate(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime()))
    throw new Error('Invalid moderation date.');
  return new Date(value.getTime());
}

function nullableDate(value: unknown): Date | null {
  return value === null ? null : requiredDate(value);
}

function requiredInteger(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?[0-9]+$/u.test(value))
    return Number(value);
  throw new Error('Invalid moderation integer.');
}

function requiredVisibility(value: unknown): ModerationVisibilityState {
  if (value === 'visible' || value === 'hidden' || value === 'archived')
    return value;
  throw new Error('Invalid moderation visibility.');
}

function requiredDuplicateRole(value: unknown): ModerationDuplicateRole {
  if (value === 'ungrouped' || value === 'primary' || value === 'non_primary')
    return value;
  throw new Error('Invalid moderation duplicate role.');
}

function requiredReviewState(value: unknown): ModerationReviewState {
  if (
    value === 'pending' ||
    value === 'dismissed' ||
    value === 'merged' ||
    value === 'superseded'
  )
    return value;
  throw new Error('Invalid moderation review state.');
}

function requiredReviewStates(
  value: unknown,
): readonly ModerationReviewState[] {
  if (!Array.isArray(value))
    throw new Error('Invalid moderation review states.');
  return Object.freeze(value.map(requiredReviewState));
}

function nullablePrimaryOrigin(value: unknown): 'automatic' | 'manual' | null {
  if (value === null) return null;
  return requiredOrigin(value);
}

function requiredOrigin(value: unknown): 'automatic' | 'manual' {
  if (value === 'automatic' || value === 'manual') return value;
  throw new Error('Invalid moderation origin.');
}

function requiredOutcome(
  value: unknown,
): ModerationObservation['processingOutcome'] {
  if (
    value === 'created' ||
    value === 'updated' ||
    value === 'unchanged' ||
    value === 'rejected' ||
    value === 'excluded' ||
    value === 'failed'
  )
    return value;
  throw new Error('Invalid moderation outcome.');
}

function requiredRunStatus(value: unknown): 'running' | 'succeeded' | 'failed' {
  if (value === 'running' || value === 'succeeded' || value === 'failed')
    return value;
  throw new Error('Invalid moderation run status.');
}

function requiredReasonKind(
  value: unknown,
): 'rule' | 'endpoint_default' | 'source_default' {
  if (
    value === 'rule' ||
    value === 'endpoint_default' ||
    value === 'source_default'
  )
    return value;
  throw new Error('Invalid moderation reason kind.');
}

function requiredStrength(value: unknown): 'strong' | 'weak' {
  if (value === 'strong' || value === 'weak') return value;
  throw new Error('Invalid moderation signal strength.');
}

function requiredDateStatus(value: unknown): 'parsed' | 'missing' | 'invalid' {
  if (value === 'parsed' || value === 'missing' || value === 'invalid')
    return value;
  throw new Error('Invalid moderation date status.');
}

function nullableJsonObject(
  value: unknown,
): Readonly<Record<string, unknown>> | null {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid moderation JSON state.');
  return Object.freeze({ ...(value as Record<string, unknown>) });
}
