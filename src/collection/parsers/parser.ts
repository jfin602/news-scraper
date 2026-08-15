import type { RawItem } from '../raw-item.ts';

export type FeedDialect = 'rss' | 'atom';

/** The installed parser adapter that produced a result. */
export type ParserAdapterKind = 'rss_atom' | 'html_listing';

export interface ParserAdapterIdentity {
  readonly kind: ParserAdapterKind;
  /** A stable implementation identifier, not a response or configuration value. */
  readonly version: string;
}

export type ParserDiagnosticCode =
  | 'required_field_missing'
  | 'required_field_limit'
  | 'optional_field_malformed'
  | 'optional_field_limit'
  | 'category_limit';

export interface ParserDiagnosticSample {
  readonly code: ParserDiagnosticCode;
  /** Safe, bounded implementation text; never source markup or a stack trace. */
  readonly detail: string;
}

/**
 * Non-terminal extraction accounting. It lets a later run layer retain useful
 * parser evidence without treating one bad listing row as a document failure.
 */
export interface ParserDiagnosticSummary {
  readonly rejectedItemCount: number;
  readonly malformedOptionalFieldCount: number;
  readonly samples: readonly ParserDiagnosticSample[];
}

export type ParserFailureReason =
  | 'empty_content'
  | 'input_limit'
  | 'malformed_xml'
  | 'unsupported_feed'
  | 'security_rejection'
  | 'structure_limit'
  | 'field_limit'
  | 'malformed_html'
  | 'no_matching_items'
  | 'no_valid_items';

export interface ParserInput {
  /** Fetched content whose byte length has already been bounded by the caller. */
  readonly content: string | Uint8Array;
  readonly mediaType?: string;
}

export interface ParserSuccess {
  readonly ok: true;
  /** RSS/Atom dialect where the adapter has one. */
  readonly dialect?: FeedDialect;
  readonly items: readonly RawItem[];
  readonly feed?: Readonly<{ language?: string }>;
  /** Present for adapters that need later run-level parser provenance. */
  readonly adapter?: ParserAdapterIdentity;
  /** Present when valid output was recovered from malformed listing rows. */
  readonly diagnostics?: ParserDiagnosticSummary;
}

export interface ParserFailure {
  readonly ok: false;
  readonly reason: ParserFailureReason;
  /** Safe diagnostic text; never contains the response body or a stack trace. */
  readonly detail: string;
  readonly adapter?: ParserAdapterIdentity;
  readonly diagnostics?: ParserDiagnosticSummary;
}

export type ParserResult = ParserSuccess | ParserFailure;

export interface CollectionParser {
  parse(input: ParserInput): ParserResult;
}

/** @deprecated Kept as the source-compatible name for the RSS/Atom pipeline. */
export type FeedParser = CollectionParser;
