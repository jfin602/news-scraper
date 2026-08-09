import { XMLParser, XMLValidator } from 'fast-xml-parser';

import type { RawItem } from '../raw-item.ts';
import type {
  FeedParser,
  ParserFailure,
  ParserFailureReason,
  ParserInput,
  ParserResult,
} from './parser.ts';

export const RSS_ATOM_LIMITS = Object.freeze({
  inputBytes: 2_097_152,
  nestingDepth: 64,
  items: 500,
  externalId: 2_048,
  title: 2_048,
  url: 8_192,
  timestamp: 256,
  author: 1_024,
  content: 131_072,
  imageUrl: 8_192,
  language: 128,
  categories: 64,
  category: 512,
  diagnosticKeys: 8,
  diagnosticKey: 64,
  diagnosticValue: 512,
  errorDetail: 160,
});

type XmlRecord = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // Declarations are rejected before parsing, leaving only predefined XML entities.
  processEntities: true,
  maxNestedTags: RSS_ATOM_LIMITS.nestingDepth,
  stopNodes: ['*.description', '*.content', '*.content:encoded', '*.summary'],
});

export class RssAtomParser implements FeedParser {
  parse(input: ParserInput): ParserResult {
    const decoded = decode(input.content);
    if (!decoded.ok) return decoded;
    const xml = decoded.value;

    if (xml.trim() === '')
      return failure('empty_content', 'Feed content is empty.');
    if (/<!DOCTYPE\b|<!ENTITY\b/iu.test(xml)) {
      return failure(
        'security_rejection',
        'DOCTYPE and entity declarations are not accepted.',
      );
    }

    const validation = XMLValidator.validate(xml, {
      allowBooleanAttributes: false,
      unpairedTags: [],
    });
    if (validation !== true) {
      return failure('malformed_xml', 'Feed content is not well-formed XML.');
    }

    let document: unknown;
    try {
      document = parser.parse(xml);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/nested tags|maxnestedtags/iu.test(message)) {
        return failure('structure_limit', 'XML nesting limit exceeded.');
      }
      return failure('malformed_xml', 'Feed content could not be parsed.');
    }

    if (!isRecord(document)) {
      return failure(
        'unsupported_feed',
        'XML document is not an RSS or Atom feed.',
      );
    }
    if (isRecord(document.rss)) return parseRss(document.rss);
    if (document.feed === '' || isRecord(document.feed))
      return parseAtom(isRecord(document.feed) ? document.feed : {});
    return failure(
      'unsupported_feed',
      'XML document is not an RSS or Atom feed.',
    );
  }
}

function parseRss(rss: XmlRecord): ParserResult {
  const channel = rss.channel === '' ? {} : rss.channel;
  if (!isRecord(channel)) {
    return failure('unsupported_feed', 'RSS document has no channel.');
  }
  const languageResult = optionalField(channel.language, 'language');
  if (!languageResult.ok) return languageResult.failure;
  const itemValues = elements(channel.item);
  if (itemValues.length > RSS_ATOM_LIMITS.items) return itemCountFailure();

  const items: RawItem[] = [];
  for (const value of itemValues) {
    if (!isRecord(value)) continue;
    const item = buildRssItem(value, languageResult.value);
    if (!item.ok) return item.failure;
    items.push(item.value);
  }
  return success('rss', items, languageResult.value);
}

function buildRssItem(
  item: XmlRecord,
  feedLanguage: string | undefined,
): BuildResult<RawItem> {
  const externalId = optionalField(item.guid, 'externalId');
  const title = optionalField(item.title, 'title');
  const url = optionalField(item.link, 'url');
  const publishedAtRaw = optionalField(item.pubDate, 'timestamp');
  const author = optionalField(item['dc:creator'] ?? item.author, 'author');
  const content = optionalField(
    item.description ?? item['content:encoded'],
    'content',
  );
  const language = optionalField(item.language, 'language');
  const categories = categoryValues(item.category);
  const imageUrl = rssImage(item);
  const failureResult = firstFailure([
    externalId,
    title,
    url,
    publishedAtRaw,
    author,
    content,
    language,
    categories,
    imageUrl,
  ]);
  if (failureResult) return { ok: false, failure: failureResult };

  return buildItem({
    externalId: resultValue(externalId),
    title: resultValue(title),
    url: resultValue(url),
    publishedAtRaw: resultValue(publishedAtRaw),
    author: resultValue(author),
    content: resultValue(content),
    imageUrl: resultValue(imageUrl),
    categories: resultValue(categories),
    language: resultValue(language) ?? feedLanguage,
  });
}

function parseAtom(feed: XmlRecord): ParserResult {
  const languageResult = optionalField(
    feed['@_xml:lang'] ?? feed['@_lang'],
    'language',
  );
  if (!languageResult.ok) return languageResult.failure;
  const entryValues = elements(feed.entry);
  if (entryValues.length > RSS_ATOM_LIMITS.items) return itemCountFailure();

  const items: RawItem[] = [];
  for (const value of entryValues) {
    if (!isRecord(value)) continue;
    const item = buildAtomItem(value, languageResult.value);
    if (!item.ok) return item.failure;
    items.push(item.value);
  }
  return success('atom', items, languageResult.value);
}

function buildAtomItem(
  entry: XmlRecord,
  feedLanguage: string | undefined,
): BuildResult<RawItem> {
  const externalId = optionalField(entry.id, 'externalId');
  const title = optionalField(entry.title, 'title');
  const url = optionalField(atomLink(entry.link), 'url');
  const publishedAtRaw = optionalField(entry.published, 'timestamp');
  const updatedAtRaw = optionalField(entry.updated, 'timestamp');
  const author = optionalField(atomAuthor(entry.author), 'author');
  const content = optionalField(entry.summary ?? entry.content, 'content');
  const language = optionalField(
    entry['@_xml:lang'] ?? entry['@_lang'],
    'language',
  );
  const categories = atomCategories(entry.category);
  const imageUrl = atomImage(entry.link);
  const failureResult = firstFailure([
    externalId,
    title,
    url,
    publishedAtRaw,
    updatedAtRaw,
    author,
    content,
    language,
    categories,
    imageUrl,
  ]);
  if (failureResult) return { ok: false, failure: failureResult };

  return buildItem({
    externalId: resultValue(externalId),
    title: resultValue(title),
    url: resultValue(url),
    publishedAtRaw: resultValue(publishedAtRaw),
    updatedAtRaw: resultValue(updatedAtRaw),
    author: resultValue(author),
    content: resultValue(content),
    imageUrl: resultValue(imageUrl),
    categories: resultValue(categories),
    language: resultValue(language) ?? feedLanguage,
  });
}

type FieldKind =
  | 'externalId'
  | 'title'
  | 'url'
  | 'timestamp'
  | 'author'
  | 'content'
  | 'imageUrl'
  | 'language';

type BuildResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: ParserFailure };

function optionalField(
  value: unknown,
  kind: FieldKind,
): BuildResult<string | undefined> {
  const text = textValue(value);
  if (text === undefined) return { ok: true, value: undefined };
  if (text.length > RSS_ATOM_LIMITS[kind]) {
    return {
      ok: false,
      failure: failure('field_limit', `Raw item ${kind} exceeds its limit.`),
    };
  }
  return { ok: true, value: text };
}

function categoryValues(
  value: unknown,
): BuildResult<readonly string[] | undefined> {
  const values = elements(value)
    .map(textValue)
    .filter((category): category is string => category !== undefined);
  return boundedCategories(values);
}

function atomCategories(
  value: unknown,
): BuildResult<readonly string[] | undefined> {
  const values = elements(value)
    .map((category) =>
      isRecord(category) ? textValue(category['@_term']) : undefined,
    )
    .filter((category): category is string => category !== undefined);
  return boundedCategories(values);
}

function boundedCategories(
  values: string[],
): BuildResult<readonly string[] | undefined> {
  if (values.length > RSS_ATOM_LIMITS.categories) {
    return {
      ok: false,
      failure: failure('field_limit', 'Category count exceeds its limit.'),
    };
  }
  if (values.some((value) => value.length > RSS_ATOM_LIMITS.category)) {
    return {
      ok: false,
      failure: failure('field_limit', 'Category value exceeds its limit.'),
    };
  }
  return {
    ok: true,
    value: values.length === 0 ? undefined : Object.freeze(values),
  };
}

function rssImage(item: XmlRecord): BuildResult<string | undefined> {
  for (const candidate of [
    ...elements(item['media:content']),
    ...elements(item.enclosure),
  ]) {
    if (!isRecord(candidate)) continue;
    const type = textValue(candidate['@_type']);
    const medium = textValue(candidate['@_medium']);
    if (medium === 'image' || type?.startsWith('image/') === true) {
      return optionalField(candidate['@_url'], 'imageUrl');
    }
  }
  const thumbnail = elements(item['media:thumbnail']).find(isRecord);
  return optionalField(thumbnail?.['@_url'], 'imageUrl');
}

function atomImage(value: unknown): BuildResult<string | undefined> {
  const link = elements(value).find(
    (candidate) =>
      isRecord(candidate) &&
      (textValue(candidate['@_rel']) === 'enclosure' ||
        textValue(candidate['@_rel']) === 'related') &&
      textValue(candidate['@_type'])?.startsWith('image/') === true,
  );
  return optionalField(isRecord(link) ? link['@_href'] : undefined, 'imageUrl');
}

function atomLink(value: unknown): unknown {
  const links = elements(value);
  const alternate = links.find(
    (link) => isRecord(link) && textValue(link['@_rel']) === 'alternate',
  );
  if (isRecord(alternate)) return alternate['@_href'];
  const relationOmitted = links.find(
    (link) => isRecord(link) && textValue(link['@_rel']) === undefined,
  );
  return isRecord(relationOmitted) ? relationOmitted['@_href'] : undefined;
}

function atomAuthor(value: unknown): unknown {
  const author = elements(value).find(isRecord);
  return author?.name;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === 'string') return unwrapCdata(value);
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (!isRecord(value)) return undefined;
  const direct = value['#text'];
  if (typeof direct === 'string') return direct;
  return undefined;
}

function unwrapCdata(value: string): string {
  const match = /^<!\[CDATA\[([\s\S]*)\]\]>$/u.exec(value);
  return match?.[1] ?? value;
}

function elements(value: unknown): readonly unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function buildItem(values: {
  externalId: string | undefined;
  title: string | undefined;
  url: string | undefined;
  publishedAtRaw: string | undefined;
  updatedAtRaw?: string | undefined;
  author: string | undefined;
  content: string | undefined;
  imageUrl: string | undefined;
  categories: readonly string[] | undefined;
  language: string | undefined;
}): BuildResult<RawItem> {
  const item: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) item[key] = value;
  }
  return { ok: true, value: Object.freeze(item) as RawItem };
}

function success(
  dialect: 'rss' | 'atom',
  items: RawItem[],
  language: string | undefined,
): ParserResult {
  const result: {
    ok: true;
    dialect: 'rss' | 'atom';
    items: readonly RawItem[];
    feed?: Readonly<{ language?: string }>;
  } = { ok: true, dialect, items: Object.freeze(items) };
  if (language !== undefined) result.feed = Object.freeze({ language });
  return Object.freeze(result);
}

function decode(
  content: string | Uint8Array,
): { readonly ok: true; readonly value: string } | ParserFailure {
  const byteLength =
    typeof content === 'string'
      ? Buffer.byteLength(content, 'utf8')
      : content.byteLength;
  if (byteLength > RSS_ATOM_LIMITS.inputBytes) {
    return failure(
      'input_limit',
      'Feed content exceeds the parser input limit.',
    );
  }
  if (typeof content === 'string') return { ok: true, value: content };
  try {
    return {
      ok: true,
      value: new TextDecoder('utf-8', { fatal: true }).decode(content),
    };
  } catch {
    return failure('malformed_xml', 'Feed content is not valid UTF-8 XML.');
  }
}

function firstFailure(
  results: readonly BuildResult<unknown>[],
): ParserFailure | undefined {
  return results.find((result) => !result.ok)?.failure;
}

function resultValue<T>(result: BuildResult<T>): T {
  if (!result.ok)
    throw new Error('Attempted to use a failed parser field result.');
  return result.value;
}

function itemCountFailure(): ParserFailure {
  return failure('structure_limit', 'Feed item count exceeds its limit.');
}

function failure(reason: ParserFailureReason, detail: string): ParserFailure {
  return Object.freeze({
    ok: false,
    reason,
    detail: detail.slice(0, RSS_ATOM_LIMITS.errorDetail),
  });
}

function isRecord(value: unknown): value is XmlRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
