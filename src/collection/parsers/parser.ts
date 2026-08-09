import type { RawItem } from '../raw-item.ts';

export type FeedDialect = 'rss' | 'atom';

export type ParserFailureReason =
  | 'empty_content'
  | 'input_limit'
  | 'malformed_xml'
  | 'unsupported_feed'
  | 'security_rejection'
  | 'structure_limit'
  | 'field_limit';

export interface ParserInput {
  /** Fetched content whose byte length has already been bounded by the caller. */
  readonly content: string | Uint8Array;
  readonly mediaType?: string;
}

export interface ParserSuccess {
  readonly ok: true;
  readonly dialect: FeedDialect;
  readonly items: readonly RawItem[];
  readonly feed?: Readonly<{ language?: string }>;
}

export interface ParserFailure {
  readonly ok: false;
  readonly reason: ParserFailureReason;
  /** Safe diagnostic text; never contains the response body or a stack trace. */
  readonly detail: string;
}

export type ParserResult = ParserSuccess | ParserFailure;

export interface FeedParser {
  parse(input: ParserInput): ParserResult;
}
