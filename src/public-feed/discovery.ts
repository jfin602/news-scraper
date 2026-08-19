import { createHash } from 'node:crypto';

export const PUBLIC_DISCOVERY_LIMITS = Object.freeze({
  maxRawQueryLength: 8192,
  maxKeywordCodePoints: 200,
  maxConfigKeyLength: 100,
  maxEncodedCursorLength: 2048,
});

const SUPPORTED_QUERY_KEYS = Object.freeze([
  'q',
  'source',
  'category',
  'cursor',
] as const);
const CONFIG_KEY_PATTERN = /^[a-z0-9]+(_[a-z0-9]+)*$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CURSOR_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const CURSOR_VERSION = 1;

export type PublicDiscoveryInputErrorReason = 'invalid_discovery_input';

export class PublicDiscoveryInputError extends Error {
  readonly reason: PublicDiscoveryInputErrorReason;

  constructor() {
    super('Invalid public discovery input.');
    this.name = 'PublicDiscoveryInputError';
    this.reason = 'invalid_discovery_input';
  }
}

export interface PublicDiscoveryCriteria {
  readonly keywordQuery?: string;
  readonly sourceConfigKey?: string;
  readonly categoryConfigKey?: string;
}

export interface PublicDiscoveryCursorPosition {
  readonly effectiveFeedDate: string;
  readonly firstSeenAt: string;
  readonly articleId: string;
}

export interface PublicDiscoveryRequest extends PublicDiscoveryCriteria {
  readonly cursorPosition?: PublicDiscoveryCursorPosition;
}

interface CursorPayload {
  readonly version: number;
  readonly criteriaFingerprint: string;
  readonly effectiveFeedDate: string;
  readonly firstSeenAt: string;
  readonly articleId: string;
}

export function parsePublicDiscoveryRequest(
  rawQuery: string,
): PublicDiscoveryRequest {
  try {
    if (rawQuery.length > PUBLIC_DISCOVERY_LIMITS.maxRawQueryLength) {
      throw new Error();
    }

    const values = decodeRawQuery(rawQuery);
    const criteria = normalizeCriteria({
      ...(values.q === undefined ? {} : { keywordQuery: values.q }),
      ...(values.source === undefined
        ? {}
        : { sourceConfigKey: values.source }),
      ...(values.category === undefined
        ? {}
        : { categoryConfigKey: values.category }),
    });
    const cursorPosition =
      values.cursor === undefined
        ? undefined
        : decodePublicDiscoveryCursor(values.cursor, criteria);

    return freezeRequest(criteria, cursorPosition);
  } catch (error) {
    if (error instanceof PublicDiscoveryInputError) throw error;
    throw new PublicDiscoveryInputError();
  }
}

/**
 * Parses the first-page discovery form submitted to the public root.  This is
 * deliberately separate from the API boundary: ordinary HTML forms submit
 * empty select values, while the API retains its stricter immutable-key input
 * contract.  Root navigation never accepts a cursor in Phase 0.
 */
export function parsePublicRootDiscoveryRequest(
  rawQuery: string,
): PublicDiscoveryRequest {
  try {
    if (rawQuery.length > PUBLIC_DISCOVERY_LIMITS.maxRawQueryLength) {
      throw new Error();
    }
    const values = decodeRawQuery(rawQuery);
    if (values.cursor !== undefined) throw new Error();
    const criteria = normalizeCriteria({
      ...(values.q === undefined ? {} : { keywordQuery: values.q }),
      ...(values.source === undefined || values.source === ''
        ? {}
        : { sourceConfigKey: values.source }),
      ...(values.category === undefined || values.category === ''
        ? {}
        : { categoryConfigKey: values.category }),
    });
    return freezeRequest(criteria, undefined);
  } catch (error) {
    if (error instanceof PublicDiscoveryInputError) throw error;
    throw new PublicDiscoveryInputError();
  }
}

export function encodePublicDiscoveryCursor(
  criteria: PublicDiscoveryCriteria,
  position: PublicDiscoveryCursorPosition,
): string {
  try {
    const normalizedCriteria = normalizeCriteria(criteria);
    const normalizedPosition = normalizeCursorPosition(position);
    const payload: CursorPayload = {
      version: CURSOR_VERSION,
      criteriaFingerprint:
        publicDiscoveryCriteriaFingerprint(normalizedCriteria),
      effectiveFeedDate: normalizedPosition.effectiveFeedDate,
      firstSeenAt: normalizedPosition.firstSeenAt,
      articleId: normalizedPosition.articleId,
    };
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  } catch (error) {
    if (error instanceof PublicDiscoveryInputError) throw error;
    throw new PublicDiscoveryInputError();
  }
}

export function decodePublicDiscoveryCursor(
  encodedCursor: string,
  criteria: PublicDiscoveryCriteria,
): PublicDiscoveryCursorPosition {
  try {
    const normalizedCriteria = normalizeCriteria(criteria);
    const payload = decodeCursorPayload(encodedCursor);
    if (
      payload.criteriaFingerprint !==
      publicDiscoveryCriteriaFingerprint(normalizedCriteria)
    ) {
      throw new Error();
    }
    return freezeCursorPosition({
      effectiveFeedDate: payload.effectiveFeedDate,
      firstSeenAt: payload.firstSeenAt,
      articleId: payload.articleId,
    });
  } catch (error) {
    if (error instanceof PublicDiscoveryInputError) throw error;
    throw new PublicDiscoveryInputError();
  }
}

export function publicDiscoveryCriteriaFingerprint(
  criteria: PublicDiscoveryCriteria,
): string {
  try {
    return fingerprintNormalizedCriteria(normalizeCriteria(criteria));
  } catch (error) {
    if (error instanceof PublicDiscoveryInputError) throw error;
    throw new PublicDiscoveryInputError();
  }
}

function fingerprintNormalizedCriteria(
  normalizedCriteria: PublicDiscoveryCriteria,
): string {
  const stableCriteria = JSON.stringify({
    q:
      normalizedCriteria.keywordQuery === undefined
        ? null
        : normalizedCriteria.keywordQuery.toLowerCase(),
    source: normalizedCriteria.sourceConfigKey ?? null,
    category: normalizedCriteria.categoryConfigKey ?? null,
  });
  return createHash('sha256').update(stableCriteria, 'utf8').digest('hex');
}

function decodeRawQuery(rawQuery: string): Readonly<Record<string, string>> {
  if (rawQuery === '') return Object.freeze({});

  const values: Record<string, string> = {};
  for (const pair of rawQuery.split('&')) {
    const separatorIndex = pair.indexOf('=');
    const rawName =
      separatorIndex === -1 ? pair : pair.slice(0, separatorIndex);
    const rawValue =
      separatorIndex === -1 ? '' : pair.slice(separatorIndex + 1);
    const name = decodeQueryComponent(rawName);
    const value = decodeQueryComponent(rawValue);
    if (!isSupportedQueryKey(name) || Object.hasOwn(values, name)) {
      throw new Error();
    }
    values[name] = value;
  }
  return Object.freeze(values);
}

function decodeQueryComponent(value: string): string {
  return decodeURIComponent(value.replaceAll('+', ' '));
}

function isSupportedQueryKey(
  value: string,
): value is (typeof SUPPORTED_QUERY_KEYS)[number] {
  return (SUPPORTED_QUERY_KEYS as readonly string[]).includes(value);
}

function normalizeCriteria(
  input: PublicDiscoveryCriteria,
): PublicDiscoveryCriteria {
  if (input === null || typeof input !== 'object') throw new Error();
  const keywordQuery = normalizeKeywordQuery(input.keywordQuery);
  const sourceConfigKey = normalizeConfigKey(input.sourceConfigKey);
  const categoryConfigKey = normalizeConfigKey(input.categoryConfigKey);
  return Object.freeze({
    ...(keywordQuery === undefined ? {} : { keywordQuery }),
    ...(sourceConfigKey === undefined ? {} : { sourceConfigKey }),
    ...(categoryConfigKey === undefined ? {} : { categoryConfigKey }),
  });
}

function normalizeKeywordQuery(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error();
  const normalized = value.trim();
  if (normalized === '') return undefined;
  if (
    Array.from(normalized).length > PUBLIC_DISCOVERY_LIMITS.maxKeywordCodePoints
  ) {
    throw new Error();
  }
  return normalized;
}

function normalizeConfigKey(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > PUBLIC_DISCOVERY_LIMITS.maxConfigKeyLength ||
    !CONFIG_KEY_PATTERN.test(value)
  ) {
    throw new Error();
  }
  return value;
}

function decodeCursorPayload(encodedCursor: string): CursorPayload {
  if (
    typeof encodedCursor !== 'string' ||
    encodedCursor.length === 0 ||
    encodedCursor.length > PUBLIC_DISCOVERY_LIMITS.maxEncodedCursorLength ||
    !BASE64URL_PATTERN.test(encodedCursor)
  ) {
    throw new Error();
  }

  const bytes = Buffer.from(encodedCursor, 'base64url');
  if (bytes.toString('base64url') !== encodedCursor) throw new Error();
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error();

  const parsed: unknown = JSON.parse(text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error();
  }
  const payload = parsed as Partial<CursorPayload>;
  const expectedKeys = [
    'version',
    'criteriaFingerprint',
    'effectiveFeedDate',
    'firstSeenAt',
    'articleId',
  ];
  if (
    Object.keys(payload).length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(payload, key)) ||
    JSON.stringify(payload) !== text
  ) {
    throw new Error();
  }
  if (payload.version !== CURSOR_VERSION) throw new Error();
  if (
    typeof payload.criteriaFingerprint !== 'string' ||
    !CURSOR_FINGERPRINT_PATTERN.test(payload.criteriaFingerprint)
  ) {
    throw new Error();
  }

  const { effectiveFeedDate, firstSeenAt, articleId } = payload;
  if (
    typeof effectiveFeedDate !== 'string' ||
    typeof firstSeenAt !== 'string' ||
    typeof articleId !== 'string'
  ) {
    throw new Error();
  }
  const position = normalizeCursorPosition({
    effectiveFeedDate,
    firstSeenAt,
    articleId,
  });
  return Object.freeze({
    version: CURSOR_VERSION,
    criteriaFingerprint: payload.criteriaFingerprint,
    ...position,
  });
}

function normalizeCursorPosition(
  position: PublicDiscoveryCursorPosition,
): PublicDiscoveryCursorPosition {
  if (position === null || typeof position !== 'object') throw new Error();
  const { effectiveFeedDate, firstSeenAt, articleId } = position;
  if (
    !isCanonicalPostgresTimestamp(effectiveFeedDate) ||
    !isCanonicalPostgresTimestamp(firstSeenAt) ||
    typeof articleId !== 'string' ||
    !UUID_PATTERN.test(articleId)
  ) {
    throw new Error();
  }
  return freezeCursorPosition({ effectiveFeedDate, firstSeenAt, articleId });
}

function isCanonicalPostgresTimestamp(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})\.([0-9]{6})Z$/u.test(
      value,
    )
  ) {
    return false;
  }
  const match =
    /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})\.[0-9]{6}Z$/u.exec(
      value,
    );
  if (match === null) return false;
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    year < 1
  ) {
    return false;
  }
  const date = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, 0),
  );
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

function freezeRequest(
  criteria: PublicDiscoveryCriteria,
  cursorPosition: PublicDiscoveryCursorPosition | undefined,
): PublicDiscoveryRequest {
  return Object.freeze({
    ...criteria,
    ...(cursorPosition === undefined ? {} : { cursorPosition }),
  });
}

function freezeCursorPosition(
  position: PublicDiscoveryCursorPosition,
): PublicDiscoveryCursorPosition {
  return Object.freeze({ ...position });
}
