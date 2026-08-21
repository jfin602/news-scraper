import { normalizeConfigKey } from '../sources/configuration.ts';
import type { CanonicalOutwardOrderPosition } from './canonical-outward-articles.ts';

export const DISTRIBUTION_CURSOR_VERSION = 1;
export const DISTRIBUTION_CURSOR_MAX_ENCODED_LENGTH = 1024;

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const HEX_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export class DistributionCursorInputError extends Error {
  readonly reason = 'invalid_cursor' as const;

  constructor() {
    super('Invalid distribution cursor.');
    this.name = 'DistributionCursorInputError';
  }
}

export interface DistributionCursor extends CanonicalOutwardOrderPosition {
  readonly version: typeof DISTRIBUTION_CURSOR_VERSION;
  readonly profileConfigKey: string;
  readonly snapshotRevision: string;
}

interface CursorPayload {
  readonly version: number;
  readonly profileConfigKey: string;
  readonly snapshotRevision: string;
  readonly effectiveFeedDate: string;
  readonly firstSeenAt: string;
  readonly articleId: string;
}

export function encodeDistributionCursor(
  profileConfigKey: unknown,
  snapshotRevision: unknown,
  position: CanonicalOutwardOrderPosition,
): string {
  try {
    const payload: CursorPayload = {
      version: DISTRIBUTION_CURSOR_VERSION,
      profileConfigKey: normalizeConfigKey(profileConfigKey),
      snapshotRevision: normalizeRevision(snapshotRevision),
      ...normalizePosition(position),
    };
    return encodePayload(payload);
  } catch (error) {
    if (error instanceof DistributionCursorInputError) throw error;
    throw new DistributionCursorInputError();
  }
}

export function decodeDistributionCursor(
  encodedCursor: unknown,
  expectedProfileConfigKey: unknown,
): DistributionCursor {
  try {
    const expectedProfile = normalizeConfigKey(expectedProfileConfigKey);
    if (
      typeof encodedCursor !== 'string' ||
      encodedCursor.length === 0 ||
      encodedCursor.length > DISTRIBUTION_CURSOR_MAX_ENCODED_LENGTH ||
      !BASE64URL_PATTERN.test(encodedCursor)
    ) {
      throw new Error();
    }
    const bytes = Buffer.from(encodedCursor, 'base64url');
    if (bytes.toString('base64url') !== encodedCursor) throw new Error();
    const text = bytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error();
    const parsed: unknown = JSON.parse(text);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new Error();
    }
    const payload = parsed as Partial<CursorPayload>;
    const expectedKeys = [
      'version',
      'profileConfigKey',
      'snapshotRevision',
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
    if (payload.version !== DISTRIBUTION_CURSOR_VERSION) throw new Error();
    if (payload.profileConfigKey !== expectedProfile) throw new Error();
    const profileConfigKey = normalizeConfigKey(payload.profileConfigKey);
    const snapshotRevision = normalizeRevision(payload.snapshotRevision);
    const position = normalizePosition({
      effectiveFeedDate: payload.effectiveFeedDate,
      firstSeenAt: payload.firstSeenAt,
      articleId: payload.articleId,
    });
    return Object.freeze({
      version: DISTRIBUTION_CURSOR_VERSION,
      profileConfigKey,
      snapshotRevision,
      ...position,
    });
  } catch (error) {
    if (error instanceof DistributionCursorInputError) throw error;
    throw new DistributionCursorInputError();
  }
}

function encodePayload(payload: CursorPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  if (encoded.length > DISTRIBUTION_CURSOR_MAX_ENCODED_LENGTH)
    throw new Error();
  return encoded;
}

function normalizeRevision(value: unknown): string {
  if (typeof value !== 'string' || !HEX_FINGERPRINT_PATTERN.test(value)) {
    throw new Error();
  }
  return value;
}

function normalizePosition(value: unknown): CanonicalOutwardOrderPosition {
  if (value === null || typeof value !== 'object') throw new Error();
  const position = value as Partial<CanonicalOutwardOrderPosition>;
  const articleId = position.articleId;
  if (
    !isCanonicalPostgresTimestamp(position.effectiveFeedDate) ||
    !isCanonicalPostgresTimestamp(position.firstSeenAt) ||
    typeof articleId !== 'string' ||
    !UUID_PATTERN.test(articleId)
  ) {
    throw new Error();
  }
  return Object.freeze({
    effectiveFeedDate: position.effectiveFeedDate,
    firstSeenAt: position.firstSeenAt,
    articleId,
  });
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
