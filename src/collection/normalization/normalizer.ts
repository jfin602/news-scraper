import type { RawItem } from '../raw-item.ts';
import { collectionPlainText } from '../text/plain-text.ts';
import {
  ARTICLE_CANDIDATE_LIMITS,
  type ArticleCandidate,
  type ArticleCandidateProvenance,
  type ArticleNormalizationContext,
  type ArticleNormalizationFailureReason,
  type ArticleNormalizationResult,
  type PublicationDateMetadata,
  type SourceDateMetadata,
} from './article-candidate.ts';

const TRACKING_PARAMETERS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'dclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
]);

const RFC_MONTHS: Readonly<Record<string, number>> = Object.freeze({
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
});

export function normalizeArticleCandidate(
  rawItem: RawItem,
  context: ArticleNormalizationContext,
): ArticleNormalizationResult {
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext) {
    return failure('invalid_context', 'Normalization context is invalid.');
  }

  const displayTitle = collectionPlainText(rawItem.title ?? '');
  if (
    displayTitle.length === 0 ||
    displayTitle.length > ARTICLE_CANDIDATE_LIMITS.title
  ) {
    return failure(
      'unusable_title',
      'Article title is missing or out of bounds.',
    );
  }

  const urls = normalizeArticleUrls(rawItem.url, normalizedContext.feedUrl);
  if (!urls) {
    return failure(
      'unusable_article_url',
      'Article URL is missing or structurally unusable.',
    );
  }

  const candidate: ArticleCandidate = {
    displayTitle,
    normalizedTitle: displayTitle.normalize('NFKC').toLowerCase(),
    originalUrl: urls.originalUrl,
    canonicalIdentityUrl: urls.canonicalIdentityUrl,
    publishedAt: publicationDate(rawItem.publishedAtRaw),
    updatedAt: sourceDate(rawItem.updatedAtRaw),
    provenance: normalizedContext.provenance,
  };

  const externalId = boundedOuterTrim(
    rawItem.externalId,
    ARTICLE_CANDIDATE_LIMITS.externalId,
  );
  const author = boundedPlainText(
    rawItem.author,
    ARTICLE_CANDIDATE_LIMITS.author,
  );
  const summary = excerpt(rawItem.content);
  const imageUrl = optionalHttpUrl(
    rawItem.imageUrl,
    normalizedContext.feedUrl,
    ARTICLE_CANDIDATE_LIMITS.imageUrl,
  );
  const sourceCategories = normalizeCategories(rawItem.categories);
  const language = boundedPlainText(
    rawItem.language,
    ARTICLE_CANDIDATE_LIMITS.language,
  );

  if (externalId !== undefined) Object.assign(candidate, { externalId });
  if (author !== undefined) Object.assign(candidate, { author });
  if (summary !== undefined) Object.assign(candidate, { summary });
  if (imageUrl !== undefined) Object.assign(candidate, { imageUrl });
  if (sourceCategories !== undefined)
    Object.assign(candidate, { sourceCategories });
  if (language !== undefined) Object.assign(candidate, { language });

  return Object.freeze({ ok: true, candidate: Object.freeze(candidate) });
}

function normalizeContext(
  context: ArticleNormalizationContext,
):
  | Readonly<{ feedUrl: URL; provenance: ArticleCandidateProvenance }>
  | undefined {
  const sourceId = contextId(context.sourceId);
  const sourceEndpointId = contextId(context.sourceEndpointId);
  const collectionRunId = contextId(context.collectionRunId);
  const feedUrl = absoluteHttpUrl(
    context.terminalFeedUrl,
    ARTICLE_CANDIDATE_LIMITS.url,
  );
  if (!sourceId || !sourceEndpointId || !collectionRunId || !feedUrl) {
    return undefined;
  }
  return Object.freeze({
    feedUrl,
    provenance: Object.freeze({
      sourceId,
      sourceEndpointId,
      collectionRunId,
    }),
  });
}

function contextId(value: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 &&
    normalized.length <= ARTICLE_CANDIDATE_LIMITS.contextId
    ? normalized
    : undefined;
}

function normalizeArticleUrls(
  rawUrl: string | undefined,
  feedUrl: URL,
): Readonly<{ originalUrl: string; canonicalIdentityUrl: string }> | undefined {
  if (rawUrl === undefined) return undefined;
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0 || trimmed.length > ARTICLE_CANDIDATE_LIMITS.url)
    return undefined;
  const resolved = relativeHttpUrl(trimmed, feedUrl);
  if (!resolved) return undefined;
  const originalUrl = resolved.href;
  if (originalUrl.length > ARTICLE_CANDIDATE_LIMITS.url) return undefined;

  const canonical = new URL(originalUrl);
  canonical.hash = '';
  for (const key of [...canonical.searchParams.keys()]) {
    if (TRACKING_PARAMETERS.has(key)) canonical.searchParams.delete(key);
  }
  const canonicalIdentityUrl = canonical.href;
  if (canonicalIdentityUrl.length > ARTICLE_CANDIDATE_LIMITS.url)
    return undefined;
  return Object.freeze({ originalUrl, canonicalIdentityUrl });
}

function absoluteHttpUrl(value: string, limit: number): URL | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > limit) return undefined;
  try {
    return validHttpUrl(new URL(trimmed));
  } catch {
    return undefined;
  }
}

function relativeHttpUrl(value: string, base: URL): URL | undefined {
  try {
    return validHttpUrl(new URL(value, base));
  } catch {
    return undefined;
  }
}

function validHttpUrl(url: URL): URL | undefined {
  return (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.hostname.length > 0 &&
    url.username === '' &&
    url.password === ''
    ? url
    : undefined;
}

function optionalHttpUrl(
  value: string | undefined,
  base: URL,
  limit: number,
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > limit) return undefined;
  const url = relativeHttpUrl(trimmed, base);
  if (!url || url.href.length > limit) return undefined;
  return url.href;
}

function boundedOuterTrim(
  value: string | undefined,
  limit: number,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= limit
    ? normalized
    : undefined;
}

function boundedPlainText(
  value: string | undefined,
  limit: number,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = collectionPlainText(value);
  return normalized.length > 0 && normalized.length <= limit
    ? normalized
    : undefined;
}

function excerpt(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = collectionPlainText(value);
  if (normalized.length === 0) return undefined;
  return truncateSummary(normalized);
}

function truncateSummary(value: string): string {
  const characters = Array.from(value);
  const limit = ARTICLE_CANDIDATE_LIMITS.summary;
  if (characters.length <= limit) return value;

  const contentLimit = limit - 3;
  const prefix = characters.slice(0, contentLimit);
  const nextCharacter = characters[contentLimit];
  if (prefix.at(-1) === ' ') return `${prefix.slice(0, -1).join('')}...`;
  if (nextCharacter === ' ') return `${prefix.join('')}...`;

  const boundary = prefix.lastIndexOf(' ');
  return boundary === -1
    ? `${prefix.join('')}...`
    : `${prefix.slice(0, boundary).join('')}...`;
}

function normalizeCategories(
  values: readonly string[] | undefined,
): readonly string[] | undefined {
  if (values === undefined) return undefined;
  if (values.length > ARTICLE_CANDIDATE_LIMITS.sourceCategories)
    return undefined;
  const categories: string[] = [];
  for (const value of values) {
    const category = boundedPlainText(
      value,
      ARTICLE_CANDIDATE_LIMITS.sourceCategory,
    );
    if (category !== undefined) categories.push(category);
  }
  return categories.length > 0 ? Object.freeze(categories) : undefined;
}

function publicationDate(value: string | undefined): PublicationDateMetadata {
  const parsed = sourceDate(value);
  return Object.freeze({ ...parsed, fallback: 'first_seen' });
}

function sourceDate(value: string | undefined): SourceDateMetadata {
  if (value === undefined || value.trim() === '')
    return Object.freeze({ status: 'missing' });
  const parsed = parseFeedTimestamp(value.trim());
  return parsed === undefined
    ? Object.freeze({ status: 'invalid' })
    : Object.freeze({ status: 'parsed', value: parsed });
}

function parseFeedTimestamp(value: string): string | undefined {
  const iso =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/u.exec(
      value,
    );
  if (iso) {
    const [, year, month, day, hour, minute, second, , zone] = iso;
    if (
      !validDateParts(+year!, +month! - 1, +day!, +hour!, +minute!, +second!) ||
      (zone !== 'Z' && !validIsoZone(zone!))
    )
      return undefined;
    return validDate(value);
  }

  const rfc =
    /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+)?(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+(UT|GMT|Z|[+-]\d{4})$/u.exec(
      value,
    );
  if (!rfc) return undefined;
  const [, day, monthName, year, hour, minute, second = '0', zone] = rfc;
  const month = RFC_MONTHS[monthName!];
  if (
    month === undefined ||
    !validDateParts(+year!, month, +day!, +hour!, +minute!, +second!) ||
    !validZone(zone!)
  ) {
    return undefined;
  }
  return validDate(value);
}

function validIsoZone(zone: string): boolean {
  const match = /^[+-](\d{2}):(\d{2})$/u.exec(zone);
  return match !== null && +match[1]! <= 23 && +match[2]! <= 59;
}

function validZone(zone: string): boolean {
  if (zone === 'UT' || zone === 'GMT' || zone === 'Z') return true;
  const match = /^([+-])(\d{2})(\d{2})$/u.exec(zone);
  return match !== null && +match[2]! <= 23 && +match[3]! <= 59;
}

function validDateParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  if (hour > 23 || minute > 59 || second > 59 || day < 1) return false;
  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month &&
    date.getUTCDate() === day
  );
}

function validDate(value: string): string | undefined {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : undefined;
}

function failure(
  reason: ArticleNormalizationFailureReason,
  detail: string,
): ArticleNormalizationResult {
  return Object.freeze({
    ok: false,
    reason,
    detail: detail.slice(0, ARTICLE_CANDIDATE_LIMITS.failureDetail),
  });
}
