import type { QueryExecutor } from '../database/database.ts';
import {
  CanonicalOutwardArticleRepositoryError,
  readCanonicalOutwardArticles,
} from '../distribution/canonical-outward-articles.ts';
import { normalizePublicationPresentation } from '../publication/configuration.ts';
import {
  encodePublicDiscoveryCursor,
  type PublicDiscoveryCursorPosition,
  type PublicDiscoveryRequest,
} from './discovery.ts';

const CONFIG_KEY_PATTERN = /^[a-z0-9]+(_[a-z0-9]+)*$/u;

export const PUBLIC_FEED_PAGE_SIZE = 100;
export const PUBLIC_DISCOVERY_OPTION_LIMIT = 200;

const EMPTY_PUBLIC_DISCOVERY_REQUEST: PublicDiscoveryRequest = Object.freeze(
  {},
);

export type PublicFeedDateSource = 'published_at' | 'first_seen_at';

export interface PublicFeedPublication {
  readonly name: string;
  readonly description: string | null;
  readonly logoPath: string | null;
  readonly accentColor: string | null;
  readonly presentationTimezone: string | null;
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
  readonly publication_description: unknown;
  readonly publication_logo_path: unknown;
  readonly publication_accent_color: unknown;
  readonly publication_presentation_timezone: unknown;
}

interface PublicDiscoveryChoiceRow {
  readonly config_key: unknown;
  readonly display_name: unknown;
}

const PUBLIC_PUBLICATION_QUERY = `
  SELECT
    name AS publication_name,
    description AS publication_description,
    logo_path AS publication_logo_path,
    accent_color AS publication_accent_color,
    presentation_timezone AS publication_presentation_timezone
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
    const row = result.rows[0];
    if (row === undefined) throw new Error();
    const normalized = normalizePublicationPresentation({
      name: row.publication_name,
      ...(row.publication_description === null
        ? {}
        : { description: row.publication_description }),
      ...(row.publication_logo_path === null
        ? {}
        : { logoPath: row.publication_logo_path }),
      ...(row.publication_accent_color === null
        ? {}
        : { accentColor: row.publication_accent_color }),
      ...(row.publication_presentation_timezone === null
        ? {}
        : { presentationTimezone: row.publication_presentation_timezone }),
    });
    return Object.freeze({
      name: canonicalString(row.publication_name, normalized.name),
      description: canonicalNullableString(
        row.publication_description,
        normalized.description,
      ),
      logoPath: canonicalNullableString(
        row.publication_logo_path,
        normalized.logoPath,
      ),
      accentColor: canonicalNullableString(
        row.publication_accent_color,
        normalized.accentColor,
      ),
      presentationTimezone: canonicalNullableString(
        row.publication_presentation_timezone,
        normalized.presentationTimezone,
      ),
    });
  } catch (error) {
    if (error instanceof PublicFeedRepositoryError) throw error;
    throw new PublicFeedRepositoryError('invalid_row');
  }
}

function canonicalString(persisted: unknown, normalized: string): string {
  if (typeof persisted !== 'string' || persisted !== normalized) {
    throw new Error();
  }
  return persisted;
}

function canonicalNullableString(
  persisted: unknown,
  normalized: string | undefined,
): string | null {
  if (persisted === null) return null;
  if (typeof persisted !== 'string' || persisted !== normalized) {
    throw new Error();
  }
  return persisted;
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
  let canonicalItems;
  try {
    canonicalItems = await readCanonicalOutwardArticles(executor, {
      ...(request.sourceConfigKey === undefined
        ? {}
        : { sourceConfigKey: request.sourceConfigKey }),
      ...(request.categoryConfigKey === undefined
        ? {}
        : { categoryConfigKey: request.categoryConfigKey }),
      ...(request.keywordQuery === undefined
        ? {}
        : { publicKeywordQuery: request.keywordQuery }),
      ...(request.cursorPosition === undefined
        ? {}
        : { continuationPosition: request.cursorPosition }),
      limit: PUBLIC_FEED_PAGE_SIZE + 1,
    });
  } catch (error) {
    if (error instanceof CanonicalOutwardArticleRepositoryError) {
      throw new PublicFeedRepositoryError(error.reason);
    }
    throw error;
  }
  const mappedRows = canonicalItems.map((item) =>
    Object.freeze({
      item: Object.freeze({
        articleId: item.articleId,
        effectiveFeedDate: item.effectiveFeedDate,
        feedDateSource: item.feedDateSource,
        headline: item.headline,
        sourceName: item.source.displayName,
        originalUrl: item.originalUrl,
      }),
      cursorPosition: item.orderPosition,
    }),
  );
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
