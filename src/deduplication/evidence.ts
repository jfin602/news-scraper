import { createHash } from 'node:crypto';

import type { PersistedArticle } from '../articles/repository.ts';

export const DUPLICATE_REASON_CODES = Object.freeze({
  canonicalIdentityUrlEqual: 'canonical_identity_url_equal',
  normalizedTitleEqual: 'normalized_title_equal',
} as const);

export type DuplicateSignalStrength = 'strong' | 'weak';
export type DuplicateReasonCode =
  (typeof DUPLICATE_REASON_CODES)[keyof typeof DUPLICATE_REASON_CODES];

export interface CanonicalArticlePair {
  readonly articleLowId: string;
  readonly articleHighId: string;
}

export interface DuplicateEvidenceSignal {
  readonly reasonCode: DuplicateReasonCode;
  readonly strength: DuplicateSignalStrength;
}

export interface DuplicateEvidence {
  readonly pair: CanonicalArticlePair;
  readonly signals: readonly DuplicateEvidenceSignal[];
  readonly strength: DuplicateSignalStrength;
  readonly confidence: 50 | 100;
  readonly evidenceFingerprint: string;
}

export class DuplicateEvidenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateEvidenceValidationError';
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Canonical identity for one unordered pair; IDs are compared as strings. */
export function canonicalizeArticlePair(
  firstArticleId: string,
  secondArticleId: string,
): CanonicalArticlePair {
  validateUuid(firstArticleId, 'firstArticleId');
  validateUuid(secondArticleId, 'secondArticleId');
  if (firstArticleId.toLowerCase() === secondArticleId.toLowerCase()) {
    throw new DuplicateEvidenceValidationError(
      'article pair cannot self-match',
    );
  }
  const [articleLowId, articleHighId] =
    firstArticleId.toLowerCase() < secondArticleId.toLowerCase()
      ? [firstArticleId.toLowerCase(), secondArticleId.toLowerCase()]
      : [secondArticleId.toLowerCase(), firstArticleId.toLowerCase()];
  return Object.freeze({ articleLowId, articleHighId });
}

/**
 * Evaluates only exact persisted values. No result means there is no governed
 * automatic review/grouping evidence.
 */
export function evaluateDuplicateEvidence(
  first: PersistedArticle,
  second: PersistedArticle,
): DuplicateEvidence | undefined {
  const pair = canonicalizeArticlePair(first.id, second.id);
  if (first.sourceId === second.sourceId) return undefined;

  const signals: DuplicateEvidenceSignal[] = [];
  const material: Array<readonly [string, string]> = [];
  if (first.canonicalIdentityUrl === second.canonicalIdentityUrl) {
    signals.push(
      Object.freeze({
        reasonCode: DUPLICATE_REASON_CODES.canonicalIdentityUrlEqual,
        strength: 'strong' as const,
      }),
    );
    material.push(['canonical_identity_url', first.canonicalIdentityUrl]);
  }
  if (
    first.normalizedTitle.length > 0 &&
    first.normalizedTitle === second.normalizedTitle
  ) {
    signals.push(
      Object.freeze({
        reasonCode: DUPLICATE_REASON_CODES.normalizedTitleEqual,
        strength: 'weak' as const,
      }),
    );
    material.push(['normalized_title', first.normalizedTitle]);
  }
  if (signals.length === 0) return undefined;

  const strength = signals.some((signal) => signal.strength === 'strong')
    ? 'strong'
    : 'weak';
  return Object.freeze({
    pair,
    signals: Object.freeze(signals),
    strength,
    confidence: strength === 'strong' ? 100 : 50,
    evidenceFingerprint: fingerprint(pair, material),
  });
}

function fingerprint(
  pair: CanonicalArticlePair,
  material: readonly (readonly [string, string])[],
): string {
  const representation = [
    'duplicate-evidence-v1',
    pair.articleLowId,
    pair.articleHighId,
    ...material
      .slice()
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .flatMap(([kind, value]) => [kind, value]),
  ];
  const encoded = representation
    .map((value) => `${Buffer.byteLength(value, 'utf8')}:${value}`)
    .join('|');
  return createHash('sha256').update(encoded, 'utf8').digest('hex');
}

function validateUuid(value: string, field: string): void {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new DuplicateEvidenceValidationError(`${field} must be a UUID`);
  }
}
