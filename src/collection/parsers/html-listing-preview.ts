import type { RawItem } from '../raw-item.ts';
import {
  HtmlListingParser,
  HTML_LISTING_PARSER_LIMITS,
} from './html-listing-parser.ts';
import {
  HtmlListingProfileValidationError,
  normalizeHtmlListingProfile,
} from './html-listing-profile.ts';
import type { ParserDiagnosticSummary, ParserFailureReason } from './parser.ts';

export interface HtmlListingPreviewInput {
  readonly html: string;
  readonly profile: unknown;
}

export type HtmlListingPreviewResult =
  | {
      readonly ok: true;
      readonly items: readonly RawItem[];
      readonly diagnostics?: ParserDiagnosticSummary;
    }
  | {
      readonly ok: false;
      readonly reason: ParserFailureReason | 'invalid_profile';
      readonly detail: string;
      readonly diagnostics?: ParserDiagnosticSummary;
    };

/** Pure draft parsing for a future protected preview route; it has no I/O. */
export function previewHtmlListing(
  input: HtmlListingPreviewInput,
): HtmlListingPreviewResult {
  if (
    Buffer.byteLength(input.html, 'utf8') >
    HTML_LISTING_PARSER_LIMITS.inputBytes
  ) {
    return Object.freeze({
      ok: false,
      reason: 'input_limit',
      detail: 'HTML content exceeds the parser input limit.',
    });
  }
  try {
    const profile = normalizeHtmlListingProfile(input.profile);
    const result = new HtmlListingParser(profile).parse({
      content: input.html,
    });
    if (result.ok) {
      return Object.freeze({
        ok: true,
        items: result.items,
        ...(result.diagnostics === undefined
          ? {}
          : { diagnostics: result.diagnostics }),
      });
    }
    return Object.freeze({
      ok: false,
      reason: result.reason,
      detail: result.detail,
      ...(result.diagnostics === undefined
        ? {}
        : { diagnostics: result.diagnostics }),
    });
  } catch (error) {
    const detail =
      error instanceof HtmlListingProfileValidationError
        ? error.message
        : 'HTML listing profile could not be validated.';
    return Object.freeze({
      ok: false,
      reason: 'invalid_profile',
      detail: detail.slice(0, HTML_LISTING_PARSER_LIMITS.diagnosticDetail),
    });
  }
}
