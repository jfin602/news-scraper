import type { QueryExecutor } from '../database/database.ts';
import {
  encodePublicDiscoveryCursor,
  type PublicDiscoveryCursorPosition,
  type PublicDiscoveryRequest,
} from './discovery.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const CONFIG_KEY_PATTERN = /^[a-z0-9]+(_[a-z0-9]+)*$/u;

export const PUBLIC_FEED_PAGE_SIZE = 100;
export const PUBLIC_DISCOVERY_OPTION_LIMIT = 200;

const EMPTY_PUBLIC_DISCOVERY_REQUEST: PublicDiscoveryRequest = Object.freeze(
  {},
);

export type PublicFeedDateSource = 'published_at' | 'first_seen_at';

export interface PublicFeedPublication {
  readonly name: string;
}

export interface PublicFeedItem {
  readonly articleId: string;
  readonly effectiveFeedDate: Date;
  readonly feedDateSource: PublicFeedDateSource;
  readonly headline: string;
  readonly sourceName: string;
  readonly originalUrl: string;
}

export interface PublicFeed {
  readonly publication: PublicFeedPublication;
  readonly items: readonly PublicFeedItem[];
  /** Present on the canonical Phase 12 discovery read model. */
  readonly sourceChoices?: readonly PublicDiscoveryChoice[];
  /** Present on the canonical Phase 12 discovery read model. */
  readonly categoryChoices?: readonly PublicDiscoveryChoice[];
  /** Present on the canonical Phase 12 discovery read model. */
  readonly nextCursor?: string | null;
}

export interface PublicDiscoveryChoice {
  readonly configKey: string;
  readonly displayName: string;
}

export interface PublicDiscoveryFeed extends PublicFeed {
  readonly sourceChoices: readonly PublicDiscoveryChoice[];
  readonly categoryChoices: readonly PublicDiscoveryChoice[];
  readonly nextCursor: string | null;
}

export type PublicFeedRepositoryErrorReason =
  'invalid_row' | 'read_failed' | 'unsupported_discovery_filter';

export class PublicFeedRepositoryError extends Error {
  readonly reason: PublicFeedRepositoryErrorReason;

  constructor(reason: PublicFeedRepositoryErrorReason) {
    super('Public feed read failed.');
    this.name = 'PublicFeedRepositoryError';
    this.reason = reason;
  }
}

interface PublicPublicationRow {
  readonly publication_name: unknown;
}

interface PublicFeedItemRow {
  readonly article_id: unknown;
  readonly effective_feed_date: unknown;
  readonly cursor_effective_feed_date: unknown;
  readonly cursor_first_seen_at: unknown;
  readonly feed_date_source: unknown;
  readonly headline: unknown;
  readonly source_name: unknown;
  readonly original_url: unknown;
}

interface PublicDiscoveryChoiceRow {
  readonly config_key: unknown;
  readonly display_name: unknown;
}

interface MappedPublicFeedItemRow {
  readonly item: PublicFeedItem;
  readonly cursorPosition: PublicDiscoveryCursorPosition;
}

const PUBLIC_PUBLICATION_QUERY = `
  SELECT name AS publication_name
  FROM publication_settings
  WHERE public_status = 'public'`;

const PUBLIC_SOURCE_FILTER_QUERY = `
  WITH public_publication AS (
    SELECT 1
    FROM publication_settings
    WHERE public_status = 'public'
  )
  SELECT config_key, display_name
  FROM public_publication
  CROSS JOIN sources
  WHERE sources.config_key = $1::text
    AND sources.approval_state = 'approved'
    AND sources.lifecycle_state = 'active'`;

const PUBLIC_CATEGORY_FILTER_QUERY = `
  WITH public_publication AS (
    SELECT 1
    FROM publication_settings
    WHERE public_status = 'public'
  )
  SELECT config_key, display_name
  FROM public_publication
  CROSS JOIN categories
  WHERE categories.config_key = $1::text`;

const PUBLIC_FEED_ITEMS_QUERY = `
  WITH public_publication AS (
    SELECT 1
    FROM publication_settings
    WHERE public_status = 'public'
  ),
  eligible_items AS (
    SELECT
      article.id AS article_id,
      CASE
        WHEN article.published_at_status = 'parsed' THEN article.published_at
        ELSE article.first_seen_at
      END AS effective_feed_date,
      article.first_seen_at,
      CASE
        WHEN article.published_at_status = 'parsed' THEN 'published_at'
        ELSE 'first_seen_at'
      END AS feed_date_source,
      article.display_title AS headline,
      source.display_name AS source_name,
      article.original_url
    FROM public_publication
    CROSS JOIN articles AS article
    JOIN sources AS source
      ON source.id = article.source_id
    WHERE source.approval_state = 'approved'
      AND source.lifecycle_state = 'active'
      AND article.visibility_state = 'visible'
      AND (
        $1::text IS NULL
        OR source.config_key = $1::text
      )
      AND (
        $2::text IS NULL
        OR EXISTS (
          SELECT 1
          FROM article_categories AS article_category
          JOIN categories AS category
            ON category.id = article_category.category_id
          WHERE article_category.article_id = article.id
            AND category.config_key = $2::text
        )
      )
      AND (
        $3::text IS NULL
        OR strpos(lower(article.display_title), lower($3::text)) > 0
        OR strpos(lower(article.normalized_title), lower($3::text)) > 0
        OR (
          article.author IS NOT NULL
          AND strpos(lower(article.author), lower($3::text)) > 0
        )
        OR (
          article.summary IS NOT NULL
          AND strpos(lower(article.summary), lower($3::text)) > 0
        )
      )
  ),
  continued_items AS (
    SELECT *
    FROM eligible_items
    WHERE $4::timestamptz IS NULL
      OR effective_feed_date < $4::timestamptz
      OR (
        effective_feed_date = $4::timestamptz
        AND first_seen_at < $5::timestamptz
      )
      OR (
        effective_feed_date = $4::timestamptz
        AND first_seen_at = $5::timestamptz
        AND article_id > $6::uuid
      )
    ORDER BY
      effective_feed_date DESC,
      first_seen_at DESC,
      article_id ASC
    LIMIT $7::integer
  )
  SELECT
    article_id,
    effective_feed_date,
    to_char(
      effective_feed_date AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ) AS cursor_effective_feed_date,
    to_char(
      first_seen_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ) AS cursor_first_seen_at,
    feed_date_source,
    headline,
    source_name,
    original_url
  FROM continued_items
  ORDER BY
    effective_feed_date DESC,
    first_seen_at DESC,
    article_id ASC`;

const PUBLIC_SOURCE_CHOICES_QUERY = `
  WITH public_publication AS (
    SELECT 1
    FROM publication_settings
    WHERE public_status = 'public'
  ),
  ranked_choices AS (
    SELECT
      source.config_key,
      source.display_name,
      ROW_NUMBER() OVER (
        ORDER BY lower(source.display_name), source.config_key
      ) AS choice_position
    FROM public_publication
    CROSS JOIN sources AS source
    WHERE source.approval_state = 'approved'
      AND source.lifecycle_state = 'active'
  ),
  selected_outside_default_window AS (
    SELECT 1
    FROM ranked_choices
    WHERE config_key = $1::text
      AND choice_position > $2::integer
  )
  SELECT config_key, display_name
  FROM ranked_choices
  WHERE choice_position <= CASE
    WHEN EXISTS (SELECT 1 FROM selected_outside_default_window) THEN $2::integer - 1
    ELSE $2::integer
  END
    OR (
      config_key = $1::text
      AND choice_position > $2::integer
    )
  ORDER BY lower(display_name), config_key`;

const PUBLIC_CATEGORY_CHOICES_QUERY = `
  WITH public_publication AS (
    SELECT 1
    FROM publication_settings
    WHERE public_status = 'public'
  ),
  ranked_choices AS (
    SELECT
      category.config_key,
      category.display_name,
      ROW_NUMBER() OVER (
        ORDER BY lower(category.display_name), category.config_key
      ) AS choice_position
    FROM public_publication
    CROSS JOIN categories AS category
  ),
  selected_outside_default_window AS (
    SELECT 1
    FROM ranked_choices
    WHERE config_key = $1::text
      AND choice_position > $2::integer
  )
  SELECT config_key, display_name
  FROM ranked_choices
  WHERE choice_position <= CASE
    WHEN EXISTS (SELECT 1 FROM selected_outside_default_window) THEN $2::integer - 1
    ELSE $2::integer
  END
    OR (
      config_key = $1::text
      AND choice_position > $2::integer
    )
  ORDER BY lower(display_name), config_key`;

export async function readPublicFeed(
  executor: QueryExecutor,
  request: PublicDiscoveryRequest = EMPTY_PUBLIC_DISCOVERY_REQUEST,
): Promise<PublicDiscoveryFeed | undefined> {
  try {
    const publication = await readPublicPublication(executor);
    if (publication === undefined) return undefined;

    await assertSupportedFilters(executor, request);
    const { items, nextCursor } = await readPublicFeedItems(executor, request);
    const sourceChoices = await readPublicDiscoveryChoices(
      executor,
      PUBLIC_SOURCE_CHOICES_QUERY,
      request.sourceConfigKey,
    );
    const categoryChoices = await readPublicDiscoveryChoices(
      executor,
      PUBLIC_CATEGORY_CHOICES_QUERY,
      request.categoryConfigKey,
    );
    const finalPublication = await readPublicPublication(executor);
    if (finalPublication === undefined) return undefined;

    return Object.freeze({
      publication: finalPublication,
      sourceChoices,
      categoryChoices,
      items,
      nextCursor,
    });
  } catch (error) {
    if (error instanceof PublicFeedNoPublicPublicationError) return undefined;
    if (error instanceof PublicFeedRepositoryError) throw error;
    throw new PublicFeedRepositoryError('read_failed');
  }
}

async function readPublicPublication(
  executor: QueryExecutor,
): Promise<PublicFeedPublication | undefined> {
  const result = await executor.query<PublicPublicationRow>(
    PUBLIC_PUBLICATION_QUERY,
  );
  try {
    if (!Array.isArray(result.rows) || result.rows.length > 1) {
      throw new PublicFeedRepositoryError('invalid_row');
    }
    if (result.rows.length === 0) return undefined;
    return Object.freeze({
      name: requiredTrimmedString(result.rows[0]?.publication_name),
    });
  } catch (error) {
    if (error instanceof PublicFeedRepositoryError) throw error;
    throw new PublicFeedRepositoryError('invalid_row');
  }
}

async function assertSupportedFilters(
  executor: QueryExecutor,
  request: PublicDiscoveryRequest,
): Promise<void> {
  if (request.sourceConfigKey !== undefined) {
    await assertSupportedFilter(
      executor,
      PUBLIC_SOURCE_FILTER_QUERY,
      request.sourceConfigKey,
    );
  }
  if (request.categoryConfigKey !== undefined) {
    await assertSupportedFilter(
      executor,
      PUBLIC_CATEGORY_FILTER_QUERY,
      request.categoryConfigKey,
    );
  }
}

async function assertSupportedFilter(
  executor: QueryExecutor,
  query: string,
  configKey: string,
): Promise<void> {
  const result = await executor.query<PublicDiscoveryChoiceRow>(query, [
    configKey,
  ]);
  if (!Array.isArray(result.rows) || result.rows.length > 1) {
    throw new PublicFeedRepositoryError('invalid_row');
  }
  const row = result.rows[0];
  if (row === undefined) {
    if ((await readPublicPublication(executor)) === undefined) {
      throw new PublicFeedNoPublicPublicationError();
    }
    throw new PublicFeedRepositoryError('unsupported_discovery_filter');
  }
  const choice = mapPublicDiscoveryChoice(row);
  if (choice.configKey !== configKey) {
    throw new PublicFeedRepositoryError('invalid_row');
  }
}

class PublicFeedNoPublicPublicationError extends Error {}

async function readPublicFeedItems(
  executor: QueryExecutor,
  request: PublicDiscoveryRequest,
): Promise<{
  readonly items: readonly PublicFeedItem[];
  readonly nextCursor: string | null;
}> {
  const result = await executor.query<PublicFeedItemRow>(
    PUBLIC_FEED_ITEMS_QUERY,
    publicFeedItemQueryValues(request),
  );
  if (
    !Array.isArray(result.rows) ||
    result.rows.length > PUBLIC_FEED_PAGE_SIZE + 1
  ) {
    throw new PublicFeedRepositoryError('invalid_row');
  }

  const mappedRows = result.rows.map(mapPublicFeedItemRow);
  const hasNextPage = mappedRows.length > PUBLIC_FEED_PAGE_SIZE;
  const returnedRows = hasNextPage
    ? mappedRows.slice(0, PUBLIC_FEED_PAGE_SIZE)
    : mappedRows;
  const lastReturnedRow = returnedRows.at(-1);
  const nextCursor = hasNextPage
    ? encodeNextCursor(request, lastReturnedRow?.cursorPosition)
    : null;

  return Object.freeze({
    items: Object.freeze(returnedRows.map((row) => row.item)),
    nextCursor,
  });
}

function publicFeedItemQueryValues(
  request: PublicDiscoveryRequest,
): readonly unknown[] {
  return [
    request.sourceConfigKey ?? null,
    request.categoryConfigKey ?? null,
    request.keywordQuery ?? null,
    request.cursorPosition?.effectiveFeedDate ?? null,
    request.cursorPosition?.firstSeenAt ?? null,
    request.cursorPosition?.articleId ?? null,
    PUBLIC_FEED_PAGE_SIZE + 1,
  ];
}

async function readPublicDiscoveryChoices(
  executor: QueryExecutor,
  query: string,
  selectedConfigKey: string | undefined,
): Promise<readonly PublicDiscoveryChoice[]> {
  const result = await executor.query<PublicDiscoveryChoiceRow>(query, [
    selectedConfigKey ?? null,
    PUBLIC_DISCOVERY_OPTION_LIMIT,
  ]);
  if (
    !Array.isArray(result.rows) ||
    result.rows.length > PUBLIC_DISCOVERY_OPTION_LIMIT
  ) {
    throw new PublicFeedRepositoryError('invalid_row');
  }

  const seenConfigKeys = new Set<string>();
  const choices = result.rows.map((row) => {
    const choice = mapPublicDiscoveryChoice(row);
    if (seenConfigKeys.has(choice.configKey)) {
      throw new PublicFeedRepositoryError('invalid_row');
    }
    seenConfigKeys.add(choice.configKey);
    return choice;
  });
  if (
    selectedConfigKey !== undefined &&
    !seenConfigKeys.has(selectedConfigKey)
  ) {
    if ((await readPublicPublication(executor)) === undefined) {
      throw new PublicFeedNoPublicPublicationError();
    }
    throw new PublicFeedRepositoryError('invalid_row');
  }
  return Object.freeze(choices);
}

function mapPublicFeedItemRow(row: PublicFeedItemRow): MappedPublicFeedItemRow {
  try {
    if (row === null || typeof row !== 'object') throw new Error();
    const articleId = requiredUuid(row.article_id);
    const cursorPosition = requiredCursorPosition({
      effectiveFeedDate: row.cursor_effective_feed_date,
      firstSeenAt: row.cursor_first_seen_at,
      articleId,
    });
    return Object.freeze({
      item: Object.freeze({
        articleId,
        effectiveFeedDate: requiredTimestamp(row.effective_feed_date),
        feedDateSource: requiredFeedDateSource(row.feed_date_source),
        headline: requiredTrimmedString(row.headline),
        sourceName: requiredTrimmedString(row.source_name),
        originalUrl: requiredTrimmedString(row.original_url),
      }),
      cursorPosition,
    });
  } catch (error) {
    if (error instanceof PublicFeedRepositoryError) throw error;
    throw new PublicFeedRepositoryError('invalid_row');
  }
}

function mapPublicDiscoveryChoice(
  row: PublicDiscoveryChoiceRow,
): PublicDiscoveryChoice {
  try {
    if (row === null || typeof row !== 'object') throw new Error();
    return Object.freeze({
      configKey: requiredConfigKey(row.config_key),
      displayName: requiredTrimmedString(row.display_name),
    });
  } catch (error) {
    if (error instanceof PublicFeedRepositoryError) throw error;
    throw new PublicFeedRepositoryError('invalid_row');
  }
}

function requiredCursorPosition(input: {
  readonly effectiveFeedDate: unknown;
  readonly firstSeenAt: unknown;
  readonly articleId: string;
}): PublicDiscoveryCursorPosition {
  if (
    typeof input.effectiveFeedDate !== 'string' ||
    typeof input.firstSeenAt !== 'string'
  ) {
    throw new PublicFeedRepositoryError('invalid_row');
  }
  const position = {
    effectiveFeedDate: input.effectiveFeedDate,
    firstSeenAt: input.firstSeenAt,
    articleId: input.articleId,
  };
  try {
    encodePublicDiscoveryCursor({}, position);
  } catch {
    throw new PublicFeedRepositoryError('invalid_row');
  }
  return Object.freeze(position);
}

function encodeNextCursor(
  request: PublicDiscoveryRequest,
  position: PublicDiscoveryCursorPosition | undefined,
): string {
  if (position === undefined) {
    throw new PublicFeedRepositoryError('invalid_row');
  }
  try {
    return encodePublicDiscoveryCursor(request, position);
  } catch {
    throw new PublicFeedRepositoryError('invalid_row');
  }
}

function requiredUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new Error();
  return value;
}

function requiredConfigKey(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 100 ||
    !CONFIG_KEY_PATTERN.test(value)
  ) {
    throw new Error();
  }
  return value;
}

function requiredTrimmedString(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error();
  }
  return value;
}

function requiredTimestamp(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error();
  }
  return new Date(value.getTime());
}

function requiredFeedDateSource(value: unknown): PublicFeedDateSource {
  if (value === 'published_at' || value === 'first_seen_at') return value;
  throw new Error();
}
