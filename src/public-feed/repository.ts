import type { QueryExecutor } from '../database/database.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export type PublicFeedDateSource = 'published_at' | 'first_seen_at';

export interface PublicFeedPublication {
  readonly id: string;
  readonly slug: string;
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
}

export type PublicFeedRepositoryErrorReason = 'invalid_row' | 'read_failed';

export class PublicFeedRepositoryError extends Error {
  readonly reason: PublicFeedRepositoryErrorReason;

  constructor(reason: PublicFeedRepositoryErrorReason) {
    super('Public feed read failed.');
    this.name = 'PublicFeedRepositoryError';
    this.reason = reason;
  }
}

interface PublicFeedRow {
  readonly publication_id: unknown;
  readonly publication_slug: unknown;
  readonly publication_name: unknown;
  readonly article_id: unknown;
  readonly effective_feed_date: unknown;
  readonly feed_date_source: unknown;
  readonly headline: unknown;
  readonly source_name: unknown;
  readonly original_url: unknown;
}

interface MappedPublicFeedRow {
  readonly publication: PublicFeedPublication;
  readonly item: PublicFeedItem | undefined;
}

const PUBLIC_FEED_QUERY = `
  WITH public_publication AS (
    SELECT id, slug, name
    FROM publications
    WHERE slug = $1
      AND public_status = 'public'
  ),
  eligible_items AS (
    SELECT
      article.id AS article_id,
      CASE
        WHEN article.published_at_status = 'parsed' THEN article.published_at
        ELSE article.first_seen_at
      END AS effective_feed_date,
      CASE
        WHEN article.published_at_status = 'parsed' THEN 'published_at'
        ELSE 'first_seen_at'
      END AS feed_date_source,
      article.display_title AS headline,
      source.display_name AS source_name,
      article.original_url,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE
            WHEN article.published_at_status = 'parsed' THEN article.published_at
            ELSE article.first_seen_at
          END DESC,
          article.first_seen_at DESC,
          article.id ASC
      ) AS feed_position
    FROM public_publication AS publication
    JOIN articles AS article
      ON article.publication_id = publication.id
    JOIN sources AS source
      ON source.id = article.source_id
     AND source.publication_id = article.publication_id
    WHERE source.approval_state = 'approved'
      AND source.lifecycle_state = 'active'
      AND article.visibility_state = 'visible'
    ORDER BY
      CASE
        WHEN article.published_at_status = 'parsed' THEN article.published_at
        ELSE article.first_seen_at
      END DESC,
      article.first_seen_at DESC,
      article.id ASC
    LIMIT 100
  )
  SELECT
    publication.id AS publication_id,
    publication.slug AS publication_slug,
    publication.name AS publication_name,
    item.article_id,
    item.effective_feed_date,
    item.feed_date_source,
    item.headline,
    item.source_name,
    item.original_url
  FROM public_publication AS publication
  LEFT JOIN eligible_items AS item ON true
  ORDER BY item.feed_position ASC NULLS LAST`;

export async function readPublicFeed(
  executor: QueryExecutor,
  publicationSlug: string,
): Promise<PublicFeed | undefined> {
  try {
    const result = await executor.query<PublicFeedRow>(PUBLIC_FEED_QUERY, [
      publicationSlug,
    ]);
    if (!Array.isArray(result.rows)) {
      throw new PublicFeedRepositoryError('invalid_row');
    }
    if (result.rows.length === 0) return undefined;
    if (result.rows.length > 100) {
      throw new PublicFeedRepositoryError('invalid_row');
    }

    const firstRow = mapPublicFeedRow(result.rows[0]!);
    const items: PublicFeedItem[] = [];
    if (firstRow.item !== undefined) items.push(firstRow.item);

    for (const row of result.rows.slice(1)) {
      const mappedRow = mapPublicFeedRow(row);
      if (!samePublication(mappedRow.publication, firstRow.publication)) {
        throw new PublicFeedRepositoryError('invalid_row');
      }
      if (firstRow.item === undefined || mappedRow.item === undefined) {
        throw new PublicFeedRepositoryError('invalid_row');
      }
      items.push(mappedRow.item);
    }

    return Object.freeze({
      publication: firstRow.publication,
      items: Object.freeze(items),
    });
  } catch (error) {
    if (error instanceof PublicFeedRepositoryError) throw error;
    throw new PublicFeedRepositoryError('read_failed');
  }
}

function mapPublicFeedRow(row: PublicFeedRow): MappedPublicFeedRow {
  try {
    if (row === null || typeof row !== 'object') throw new Error();
    return Object.freeze({
      publication: Object.freeze({
        id: requiredUuid(row.publication_id),
        slug: requiredTrimmedString(row.publication_slug),
        name: requiredTrimmedString(row.publication_name),
      }),
      item: mapPublicFeedItem(row),
    });
  } catch (error) {
    if (error instanceof PublicFeedRepositoryError) throw error;
    throw new PublicFeedRepositoryError('invalid_row');
  }
}

function mapPublicFeedItem(row: PublicFeedRow): PublicFeedItem | undefined {
  if (row.article_id === null) {
    if (
      row.effective_feed_date !== null ||
      row.feed_date_source !== null ||
      row.headline !== null ||
      row.source_name !== null ||
      row.original_url !== null
    ) {
      throw new PublicFeedRepositoryError('invalid_row');
    }
    return undefined;
  }

  return Object.freeze({
    articleId: requiredUuid(row.article_id),
    effectiveFeedDate: requiredTimestamp(row.effective_feed_date),
    feedDateSource: requiredFeedDateSource(row.feed_date_source),
    headline: requiredTrimmedString(row.headline),
    sourceName: requiredTrimmedString(row.source_name),
    originalUrl: requiredTrimmedString(row.original_url),
  });
}

function samePublication(
  left: PublicFeedPublication,
  right: PublicFeedPublication,
): boolean {
  return (
    left.id === right.id && left.slug === right.slug && left.name === right.name
  );
}

function requiredUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new Error();
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
