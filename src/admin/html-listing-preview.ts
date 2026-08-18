import type { RawItem } from '../collection/raw-item.ts';
import { previewHtmlListing } from '../collection/parsers/html-listing-preview.ts';
import type { ParserDiagnosticSummary } from '../collection/parsers/parser.ts';
import { validateAdminInputRecord } from './input-validation.ts';

/**
 * Fits below the admin JSON body limit after the maximum canonical profile and
 * JSON framing are accounted for. The parser's broader input bound remains a
 * collection/fixture bound, not an admin request entitlement.
 */
export const HTML_LISTING_PREVIEW_HTML_MAX_BYTES = 40 * 1024;
export const HTML_LISTING_PREVIEW_MAX_ROWS = 50;

export class HtmlListingPreviewError extends Error {
  constructor() {
    super('HTML listing preview input is invalid.');
    this.name = 'HtmlListingPreviewError';
  }
}

export interface AdminHtmlListingPreviewRow {
  readonly title: string;
  readonly url: string;
  readonly publishedAtRaw?: string;
  readonly updatedAtRaw?: string;
  readonly author?: string;
  readonly summary?: string;
  readonly categories?: readonly string[];
}

export interface AdminHtmlListingPreviewReadModel {
  readonly rows: readonly AdminHtmlListingPreviewRow[];
  readonly diagnostics: ParserDiagnosticSummary | null;
}

/**
 * Pure adapter over the P1 preview producer. It deliberately owns neither a
 * database nor any collection/network dependency, so a draft preview cannot
 * become a second collection path.
 */
export function previewHtmlListingSample(
  input: unknown,
): AdminHtmlListingPreviewReadModel {
  const record = exactPreviewInput(input);
  if (
    Buffer.byteLength(record.html, 'utf8') > HTML_LISTING_PREVIEW_HTML_MAX_BYTES
  )
    throw new HtmlListingPreviewError();

  const result = previewHtmlListing({
    html: record.html,
    profile: record.profile,
  });
  if (!result.ok) throw new HtmlListingPreviewError();
  return Object.freeze({
    rows: Object.freeze(
      result.items.slice(0, HTML_LISTING_PREVIEW_MAX_ROWS).map(mapPreviewRow),
    ),
    diagnostics: result.diagnostics ?? null,
  });
}

function exactPreviewInput(input: unknown): {
  readonly html: string;
  readonly profile: unknown;
} {
  const record = validateAdminInputRecord(input, ['html', 'profile']);
  if (record === undefined || typeof record.html !== 'string') {
    throw new HtmlListingPreviewError();
  }
  return { html: record.html, profile: record.profile };
}

function mapPreviewRow(item: RawItem): AdminHtmlListingPreviewRow {
  if (typeof item.title !== 'string' || typeof item.url !== 'string')
    throw new HtmlListingPreviewError();
  return Object.freeze({
    title: item.title,
    url: item.url,
    ...(item.publishedAtRaw === undefined
      ? {}
      : { publishedAtRaw: item.publishedAtRaw }),
    ...(item.updatedAtRaw === undefined
      ? {}
      : { updatedAtRaw: item.updatedAtRaw }),
    ...(item.author === undefined ? {} : { author: item.author }),
    ...(item.content === undefined ? {} : { summary: item.content }),
    ...(item.categories === undefined
      ? {}
      : { categories: Object.freeze([...item.categories]) }),
  });
}
