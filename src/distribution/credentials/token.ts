import {
  createHash,
  randomBytes as secureRandomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const DISTRIBUTION_CREDENTIAL_TOKEN_VERSION = 'nsd1';
export const DISTRIBUTION_CREDENTIAL_LOOKUP_BYTES = 16;
export const DISTRIBUTION_CREDENTIAL_SECRET_BYTES = 32;
export const DISTRIBUTION_CREDENTIAL_VERIFIER_BYTES = 32;
export const MAXIMUM_DISTRIBUTION_CREDENTIAL_TOKEN_LENGTH = 80;

const LOOKUP_ENCODED_LENGTH = 22;
const SECRET_ENCODED_LENGTH = 43;
const TOKEN_PATTERN = new RegExp(
  `^${DISTRIBUTION_CREDENTIAL_TOKEN_VERSION}\\.(l[A-Za-z0-9_-]{${LOOKUP_ENCODED_LENGTH}})\\.([A-Za-z0-9_-]{${SECRET_ENCODED_LENGTH}})$`,
  'u',
);

export interface ParsedDistributionCredentialToken {
  readonly lookupId: string;
  readonly secret: Buffer;
}

export interface GeneratedDistributionCredentialToken extends ParsedDistributionCredentialToken {
  readonly token: string;
}

export type CredentialRandomBytes = (size: number) => Buffer;

export function generateDistributionCredentialToken(
  randomBytes: CredentialRandomBytes = secureRandomBytes,
): Readonly<GeneratedDistributionCredentialToken> {
  const lookupBytes = randomBytes(DISTRIBUTION_CREDENTIAL_LOOKUP_BYTES);
  const secret = randomBytes(DISTRIBUTION_CREDENTIAL_SECRET_BYTES);
  if (
    lookupBytes.length !== DISTRIBUTION_CREDENTIAL_LOOKUP_BYTES ||
    secret.length !== DISTRIBUTION_CREDENTIAL_SECRET_BYTES
  ) {
    throw new Error('Credential random generator returned an invalid length.');
  }
  const lookupId = `l${lookupBytes.toString('base64url')}`;
  const token = `${DISTRIBUTION_CREDENTIAL_TOKEN_VERSION}.${lookupId}.${secret.toString('base64url')}`;
  return Object.freeze({ lookupId, secret: Buffer.from(secret), token });
}

export function parseDistributionCredentialToken(
  input: unknown,
): Readonly<ParsedDistributionCredentialToken> | undefined {
  if (
    typeof input !== 'string' ||
    input.length > MAXIMUM_DISTRIBUTION_CREDENTIAL_TOKEN_LENGTH
  ) {
    return undefined;
  }
  const matched = TOKEN_PATTERN.exec(input);
  if (matched === null) return undefined;
  const lookupId = matched[1];
  const encodedSecret = matched[2];
  if (lookupId === undefined || encodedSecret === undefined) return undefined;
  const secret = Buffer.from(encodedSecret, 'base64url');
  if (
    secret.length !== DISTRIBUTION_CREDENTIAL_SECRET_BYTES ||
    secret.toString('base64url') !== encodedSecret
  ) {
    return undefined;
  }
  return Object.freeze({ lookupId, secret });
}

export function deriveDistributionCredentialVerifier(secret: Buffer): Buffer {
  if (secret.length !== DISTRIBUTION_CREDENTIAL_SECRET_BYTES) {
    throw new Error('Credential secret has an invalid length.');
  }
  return createHash('sha256').update(secret).digest();
}

export function distributionCredentialVerifierMatches(
  candidateVerifier: Buffer,
  persistedVerifier: Buffer,
): boolean {
  if (
    candidateVerifier.length !== DISTRIBUTION_CREDENTIAL_VERIFIER_BYTES ||
    persistedVerifier.length !== DISTRIBUTION_CREDENTIAL_VERIFIER_BYTES
  ) {
    return false;
  }
  return timingSafeEqual(candidateVerifier, persistedVerifier);
}
