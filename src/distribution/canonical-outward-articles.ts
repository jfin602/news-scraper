import type { QueryExecutor } from '../database/database.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const CONFIG_KEY_PATTERN = /^[a-z0-9]+(_[a-z0-9]+)*$/u;

export type CanonicalOutwardFeedDateSource = 'published_at' | 'first_seen_at';

/** Exact PostgreSQL timestamp strings, retained for keyset consumers. */
export interface CanonicalOutwardOrderPosition {
  readonly effectiveFeedDate: string;
  readonly firstSeenAt: string;
  readonly articleId: string;
}

export interface CanonicalOutwardCategory {
  readonly configKey: string;
  readonly displayName: string;
}

export interface CanonicalOutwardArticle {
  readonly articleId: string;
  readonly headline: string;
  readonly originalUrl: string;
  readonly effectiveFeedDate: Date;
  readonly feedDateSource: CanonicalOutwardFeedDateSource;
  readonly publishedAt: Date | null;
  readonly author: string | null;
  readonly summary: string | null;
  readonly imageUrl: string | null;
  readonly source: Readonly<{ configKey: string; displayName: string }>;
  readonly categories: readonly CanonicalOutwardCategory[];
  readonly orderPosition: CanonicalOutwardOrderPosition;
}

/** Public-only criteria are deliberately kept here only to let the reference
 * consumer reuse this producer without changing its discovery semantics. */
export interface CanonicalOutwardArticleRequest {
  readonly sourceConfigKey?: string;
  readonly categoryConfigKey?: string;
  readonly publicKeywordQuery?: string;
  readonly continuationPosition?: CanonicalOutwardOrderPosition;
  readonly limit: number;
}

export type CanonicalOutwardArticleRepositoryErrorReason =
  'invalid_row' | 'read_failed';

export class CanonicalOutwardArticleRepositoryError extends Error {
  readonly reason: CanonicalOutwardArticleRepositoryErrorReason;

  constructor(reason: CanonicalOutwardArticleRepositoryErrorReason) {
    super('Canonical outward Article read failed.');
    this.name = 'CanonicalOutwardArticleRepositoryError';
    this.reason = reason;
  }
}

interface Row {
  readonly article_id: unknown;
  readonly headline: unknown;
  readonly original_url: unknown;
  readonly effective_feed_date: unknown;
  readonly cursor_effective_feed_date: unknown;
  readonly cursor_first_seen_at: unknown;
  readonly feed_date_source: unknown;
  readonly published_at: unknown;
  readonly author: unknown;
  readonly summary: unknown;
  readonly image_url: unknown;
  readonly source_config_key: unknown;
  readonly source_display_name: unknown;
  readonly categories: unknown;
}

const CANONICAL_OUTWARD_ARTICLES_QUERY = `
  WITH eligible_items AS (
    SELECT
      article.id AS article_id,
      COALESCE(article.display_title_override, article.display_title) AS headline,
      article.original_url,
      CASE WHEN article.published_at_status = 'parsed' THEN article.published_at ELSE article.first_seen_at END AS effective_feed_date,
      article.first_seen_at,
      CASE WHEN article.published_at_status = 'parsed' THEN 'published_at' ELSE 'first_seen_at' END AS feed_date_source,
      article.published_at,
      article.author,
      article.summary,
      article.image_url,
      source.config_key AS source_config_key,
      source.display_name AS source_display_name,
      effective_categories.categories
    FROM articles AS article
    JOIN sources AS source ON source.id = article.source_id
    LEFT JOIN article_category_overrides AS category_override ON category_override.article_id = article.id
    CROSS JOIN LATERAL (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('configKey', category.config_key, 'displayName', category.display_name) ORDER BY lower(category.display_name), category.config_key), '[]'::jsonb) AS categories
      FROM categories AS category
      LEFT JOIN article_categories AS automatic_membership ON automatic_membership.category_id = category.id AND automatic_membership.article_id = article.id
      LEFT JOIN article_category_override_memberships AS manual_membership ON manual_membership.category_id = category.id AND manual_membership.article_id = article.id
      WHERE CASE WHEN category_override.article_id IS NOT NULL THEN manual_membership.article_id IS NOT NULL ELSE automatic_membership.article_id IS NOT NULL END
    ) AS effective_categories
    WHERE source.approval_state = 'approved'
      AND source.lifecycle_state = 'active'
      AND article.visibility_state = 'visible'
      AND NOT EXISTS (
        SELECT 1 FROM duplicate_group_memberships AS membership
        JOIN duplicate_groups AS duplicate_group ON duplicate_group.id = membership.group_id
        WHERE membership.article_id = article.id AND duplicate_group.primary_article_id <> article.id
      )
      AND ($1::text IS NULL OR source.config_key = $1::text)
      AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(effective_categories.categories) AS category WHERE category->>'configKey' = $2::text))
      AND ($3::text IS NULL
        OR strpos(lower(COALESCE(article.display_title_override, article.display_title)), lower($3::text)) > 0
        OR strpos(lower(article.display_title), lower($3::text)) > 0
        OR strpos(lower(article.normalized_title), lower($3::text)) > 0
        OR (article.author IS NOT NULL AND strpos(lower(article.author), lower($3::text)) > 0)
        OR (article.summary IS NOT NULL AND strpos(lower(article.summary), lower($3::text)) > 0))
  ), continued_items AS (
    SELECT * FROM eligible_items
    WHERE $4::timestamptz IS NULL OR effective_feed_date < $4::timestamptz
      OR (effective_feed_date = $4::timestamptz AND first_seen_at < $5::timestamptz)
      OR (effective_feed_date = $4::timestamptz AND first_seen_at = $5::timestamptz AND article_id > $6::uuid)
    ORDER BY effective_feed_date DESC, first_seen_at DESC, article_id ASC
    LIMIT $7::integer
  )
  SELECT *,
    to_char(effective_feed_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_effective_feed_date,
    to_char(first_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_first_seen_at
  FROM continued_items
  ORDER BY effective_feed_date DESC, first_seen_at DESC, article_id ASC`;

export async function readCanonicalOutwardArticles(
  executor: QueryExecutor,
  request: CanonicalOutwardArticleRequest,
): Promise<readonly CanonicalOutwardArticle[]> {
  try {
    if (!Number.isSafeInteger(request.limit) || request.limit < 1)
      throw new Error();
    const result = await executor.query<Row>(CANONICAL_OUTWARD_ARTICLES_QUERY, [
      request.sourceConfigKey ?? null,
      request.categoryConfigKey ?? null,
      request.publicKeywordQuery ?? null,
      request.continuationPosition?.effectiveFeedDate ?? null,
      request.continuationPosition?.firstSeenAt ?? null,
      request.continuationPosition?.articleId ?? null,
      request.limit,
    ]);
    if (!Array.isArray(result.rows) || result.rows.length > request.limit)
      throw new Error();
    return Object.freeze(result.rows.map(mapRow));
  } catch (error) {
    if (error instanceof CanonicalOutwardArticleRepositoryError) throw error;
    throw new CanonicalOutwardArticleRepositoryError('read_failed');
  }
}

function mapRow(row: Row): CanonicalOutwardArticle {
  try {
    const articleId = uuid(row.article_id);
    const position = Object.freeze({
      effectiveFeedDate: timestampKey(row.cursor_effective_feed_date),
      firstSeenAt: timestampKey(row.cursor_first_seen_at),
      articleId,
    });
    return Object.freeze({
      articleId,
      headline: text(row.headline),
      originalUrl: text(row.original_url),
      effectiveFeedDate: date(row.effective_feed_date),
      feedDateSource: feedDateSource(row.feed_date_source),
      publishedAt: nullableDate(row.published_at),
      author: nullableText(row.author),
      summary: nullableText(row.summary),
      imageUrl: nullableText(row.image_url),
      source: Object.freeze({
        configKey: configKey(row.source_config_key),
        displayName: text(row.source_display_name),
      }),
      categories: Object.freeze(categories(row.categories)),
      orderPosition: position,
    });
  } catch {
    throw new CanonicalOutwardArticleRepositoryError('invalid_row');
  }
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim())
    throw new Error();
  return value;
}
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new Error();
  return value;
}
function configKey(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 100 ||
    !CONFIG_KEY_PATTERN.test(value)
  )
    throw new Error();
  return value;
}
function date(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime()))
    throw new Error();
  return new Date(value.getTime());
}
function nullableDate(value: unknown): Date | null {
  return value === null ? null : date(value);
}
function feedDateSource(value: unknown): CanonicalOutwardFeedDateSource {
  if (value === 'published_at' || value === 'first_seen_at') return value;
  throw new Error();
}
function timestampKey(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(value)
  )
    throw new Error();
  return value;
}
function categories(value: unknown): CanonicalOutwardCategory[] {
  if (!Array.isArray(value)) throw new Error();
  return value.map((item) => {
    if (item === null || typeof item !== 'object') throw new Error();
    const candidate = item as { configKey?: unknown; displayName?: unknown };
    return Object.freeze({
      configKey: configKey(candidate.configKey),
      displayName: text(candidate.displayName),
    });
  });
}
