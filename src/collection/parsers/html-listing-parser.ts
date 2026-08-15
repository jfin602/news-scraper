import { load, type Cheerio, type CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';

import type { RawItem } from '../raw-item.ts';
import type {
  CollectionParser,
  ParserAdapterIdentity,
  ParserDiagnosticCode,
  ParserDiagnosticSummary,
  ParserFailure,
  ParserFailureReason,
  ParserInput,
  ParserResult,
} from './parser.ts';
import type {
  HtmlDateFieldDescriptor,
  HtmlTextFieldDescriptor,
  NormalizedHtmlListingProfile,
} from './html-listing-profile.ts';

export const HTML_LISTING_PARSER_VERSION = '1';

export const HTML_LISTING_PARSER_LIMITS = Object.freeze({
  inputBytes: 2_097_152,
  matchedItems: 250,
  title: 2_048,
  url: 8_192,
  timestamp: 256,
  author: 1_024,
  summary: 16_384,
  categories: 64,
  category: 512,
  diagnosticDetail: 160,
  diagnosticSamples: 8,
});

const adapter: ParserAdapterIdentity = Object.freeze({
  kind: 'html_listing',
  version: HTML_LISTING_PARSER_VERSION,
});

export class HtmlListingParser implements CollectionParser {
  readonly profile: NormalizedHtmlListingProfile;

  constructor(profile: NormalizedHtmlListingProfile) {
    this.profile = profile;
  }

  parse(input: ParserInput): ParserResult {
    const decoded = decode(input.content);
    if (!decoded.ok) return decoded;

    let $: CheerioAPI;
    try {
      // Cheerio/parse5 is an inert server-side document parser: it executes no
      // scripts and performs no resource loading.
      $ = load(decoded.value, { xmlMode: false });
    } catch {
      return failure('malformed_html', 'HTML content could not be parsed.');
    }

    let itemRoots: Cheerio<AnyNode>;
    try {
      itemRoots = $(this.profile.itemSelector);
    } catch {
      return failure(
        'malformed_html',
        'HTML item selector could not be evaluated.',
      );
    }
    if (itemRoots.length === 0)
      return failure(
        'no_matching_items',
        'HTML profile matched no listing items.',
      );
    if (itemRoots.length > HTML_LISTING_PARSER_LIMITS.matchedItems)
      return failure(
        'structure_limit',
        'HTML item count exceeds the parser limit.',
      );

    const diagnostics = new DiagnosticCollector();
    const items: RawItem[] = [];
    itemRoots.each((_, element) => {
      const title = requiredText($, element, this.profile.title, 'title');
      const url = requiredHref($, element, this.profile.articleLink);
      if (!title.ok) {
        diagnostics.reject(title.code);
        return;
      }
      if (!url.ok) {
        diagnostics.reject(url.code);
        return;
      }

      const item: Record<string, unknown> = {
        title: title.value,
        url: url.value,
      };
      setOptional(
        item,
        'publishedAtRaw',
        optionalDate($, element, this.profile.publishedAt),
        diagnostics,
      );
      setOptional(
        item,
        'updatedAtRaw',
        optionalDate($, element, this.profile.updatedAt),
        diagnostics,
      );
      setOptional(
        item,
        'author',
        optionalText(
          $,
          element,
          this.profile.author,
          HTML_LISTING_PARSER_LIMITS.author,
        ),
        diagnostics,
      );
      setOptional(
        item,
        'content',
        optionalText(
          $,
          element,
          this.profile.summary,
          HTML_LISTING_PARSER_LIMITS.summary,
        ),
        diagnostics,
      );
      const categories = optionalCategories(
        $,
        element,
        this.profile.categories,
      );
      if (categories.ok && categories.value !== undefined)
        item.categories = categories.value;
      else if (!categories.ok) diagnostics.optional(categories.code);
      items.push(Object.freeze(item) as RawItem);
    });

    const summary = diagnostics.summary();
    if (items.length === 0)
      return failure(
        'no_valid_items',
        'No matched item yielded a usable title and Article URL.',
        summary,
      );
    const result: {
      ok: true;
      items: readonly RawItem[];
      adapter: ParserAdapterIdentity;
      diagnostics?: ParserDiagnosticSummary;
    } = {
      ok: true,
      items: Object.freeze(items),
      adapter,
    };
    if (summary !== undefined) result.diagnostics = summary;
    return Object.freeze(result);
  }
}

type FieldResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly code: ParserDiagnosticCode };
type OptionalFieldResult =
  | { readonly ok: true; readonly value: string | undefined }
  | { readonly ok: false; readonly code: ParserDiagnosticCode };

function requiredText(
  $: CheerioAPI,
  root: AnyNode,
  descriptor: HtmlTextFieldDescriptor,
  name: 'title',
): FieldResult {
  const value = normalizedText($, root, descriptor);
  if (value === undefined) return { ok: false, code: 'required_field_missing' };
  if (value.length > HTML_LISTING_PARSER_LIMITS[name])
    return { ok: false, code: 'required_field_limit' };
  return { ok: true, value };
}

function requiredHref(
  $: CheerioAPI,
  root: AnyNode,
  descriptor: HtmlTextFieldDescriptor,
): FieldResult {
  const selected = $(root).find(descriptor.selector).first();
  const href = selected.attr('href')?.trim();
  if (href === undefined || href === '')
    return { ok: false, code: 'required_field_missing' };
  if (href.length > HTML_LISTING_PARSER_LIMITS.url)
    return { ok: false, code: 'required_field_limit' };
  return { ok: true, value: href };
}

function optionalDate(
  $: CheerioAPI,
  root: AnyNode,
  descriptor: HtmlDateFieldDescriptor | undefined,
): OptionalFieldResult {
  if (descriptor === undefined) return { ok: true, value: undefined };
  const selected = $(root).find(descriptor.selector).first();
  const value =
    descriptor.mode === 'attribute'
      ? selected.attr(descriptor.attribute)?.trim()
      : normalizedText($, root, descriptor);
  return optionalValue(value, HTML_LISTING_PARSER_LIMITS.timestamp);
}

function optionalText(
  $: CheerioAPI,
  root: AnyNode,
  descriptor: HtmlTextFieldDescriptor | undefined,
  limit: number,
): OptionalFieldResult {
  if (descriptor === undefined) return { ok: true, value: undefined };
  return optionalValue(normalizedText($, root, descriptor), limit);
}

function optionalCategories(
  $: CheerioAPI,
  root: AnyNode,
  descriptor: HtmlTextFieldDescriptor | undefined,
):
  | { readonly ok: true; readonly value: readonly string[] | undefined }
  | {
      readonly ok: false;
      readonly code: 'category_limit' | 'optional_field_limit';
    } {
  if (descriptor === undefined) return { ok: true, value: undefined };
  const values: string[] = [];
  $(root)
    .find(descriptor.selector)
    .each((_, element) => {
      const value = normalizeText($(element).text());
      if (value !== undefined) values.push(value);
    });
  if (values.length > HTML_LISTING_PARSER_LIMITS.categories)
    return { ok: false, code: 'category_limit' };
  if (
    values.some((value) => value.length > HTML_LISTING_PARSER_LIMITS.category)
  )
    return { ok: false, code: 'optional_field_limit' };
  return {
    ok: true,
    value: values.length === 0 ? undefined : Object.freeze(values),
  };
}

function optionalValue(
  value: string | undefined,
  limit: number,
): OptionalFieldResult {
  if (value === undefined || value === '')
    return { ok: true, value: undefined };
  if (value.length > limit) return { ok: false, code: 'optional_field_limit' };
  return { ok: true, value };
}

function normalizedText(
  $: CheerioAPI,
  root: AnyNode,
  descriptor: HtmlTextFieldDescriptor,
): string | undefined {
  return normalizeText($(root).find(descriptor.selector).first().text());
}

function normalizeText(value: string): string | undefined {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized === '' ? undefined : normalized;
}

function setOptional(
  item: Record<string, unknown>,
  key: string,
  value: OptionalFieldResult,
  diagnostics: DiagnosticCollector,
): void {
  if (value.ok && value.value !== undefined) item[key] = value.value;
  else if (!value.ok) diagnostics.optional(value.code);
}

function decode(
  content: string | Uint8Array,
): { readonly ok: true; readonly value: string } | ParserFailure {
  const bytes =
    typeof content === 'string'
      ? Buffer.byteLength(content, 'utf8')
      : content.byteLength;
  if (bytes > HTML_LISTING_PARSER_LIMITS.inputBytes)
    return failure(
      'input_limit',
      'HTML content exceeds the parser input limit.',
    );
  if (typeof content === 'string') return { ok: true, value: content };
  try {
    return {
      ok: true,
      value: new TextDecoder('utf-8', { fatal: true }).decode(content),
    };
  } catch {
    return failure('malformed_html', 'HTML content is not valid UTF-8.');
  }
}

function failure(
  reason: ParserFailureReason,
  detail: string,
  diagnostics?: ParserDiagnosticSummary,
): ParserFailure {
  return Object.freeze({
    ok: false,
    reason,
    detail: detail.slice(0, HTML_LISTING_PARSER_LIMITS.diagnosticDetail),
    adapter,
    ...(diagnostics === undefined ? {} : { diagnostics }),
  });
}

class DiagnosticCollector {
  #rejectedItemCount = 0;
  #malformedOptionalFieldCount = 0;
  #samples: { code: ParserDiagnosticCode; detail: string }[] = [];

  reject(code: ParserDiagnosticCode): void {
    this.#rejectedItemCount += 1;
    this.sample(code);
  }

  optional(code: ParserDiagnosticCode): void {
    this.#malformedOptionalFieldCount += 1;
    this.sample(code);
  }

  summary(): ParserDiagnosticSummary | undefined {
    if (
      this.#rejectedItemCount === 0 &&
      this.#malformedOptionalFieldCount === 0
    )
      return undefined;
    return Object.freeze({
      rejectedItemCount: this.#rejectedItemCount,
      malformedOptionalFieldCount: this.#malformedOptionalFieldCount,
      samples: Object.freeze(
        this.#samples.map((sample) => Object.freeze({ ...sample })),
      ),
    });
  }

  private sample(code: ParserDiagnosticCode): void {
    if (this.#samples.length >= HTML_LISTING_PARSER_LIMITS.diagnosticSamples)
      return;
    const detail = diagnosticDetail(code).slice(
      0,
      HTML_LISTING_PARSER_LIMITS.diagnosticDetail,
    );
    this.#samples.push({ code, detail });
  }
}

function diagnosticDetail(code: ParserDiagnosticCode): string {
  switch (code) {
    case 'required_field_missing':
      return 'A matched item is missing a required extracted value.';
    case 'required_field_limit':
      return 'A matched item required value exceeds its limit.';
    case 'optional_field_malformed':
      return 'An optional extracted value is malformed.';
    case 'optional_field_limit':
      return 'An optional extracted value exceeds its limit.';
    case 'category_limit':
      return 'Matched item categories exceed their configured limit.';
  }
}
