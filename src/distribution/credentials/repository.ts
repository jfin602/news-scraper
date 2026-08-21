import { randomUUID } from 'node:crypto';

import type { QueryExecutor } from '../../database/database.ts';
import {
  ConfigurationPersistenceError,
  requiredString,
  requiredTimestamp,
} from '../../publication/repository.ts';
import {
  DISTRIBUTION_CREDENTIAL_CAPABILITY,
  normalizeDistributionCredentialIssueInput,
} from './configuration.ts';
import {
  deriveDistributionCredentialVerifier,
  generateDistributionCredentialToken,
  type CredentialRandomBytes,
} from './token.ts';

export interface DistributionCredentialMetadata {
  readonly id: string;
  readonly lookupId: string;
  readonly label: string;
  readonly capability: typeof DISTRIBUTION_CREDENTIAL_CAPABILITY;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly rotationSuccessorId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IssuedDistributionCredential {
  readonly credential: DistributionCredentialMetadata;
  /** Present only in the immediate issue or rotate result; never persisted. */
  readonly token: string;
}

export interface DistributionCredentialAuthenticationRecord {
  readonly id: string;
  readonly lookupId: string;
  readonly verifier: Buffer;
  readonly capability: typeof DISTRIBUTION_CREDENTIAL_CAPABILITY;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
}

export type DistributionCredentialRevocationResult =
  | { readonly outcome: 'missing' }
  | {
      readonly outcome: 'revoked' | 'already_revoked';
      readonly credential: DistributionCredentialMetadata;
    };

export type DistributionCredentialRotationResult =
  | { readonly outcome: 'missing' }
  | {
      readonly outcome: 'already_rotated';
      readonly credential: DistributionCredentialMetadata;
    }
  | {
      readonly outcome: 'rotated';
      readonly predecessor: DistributionCredentialMetadata;
      readonly successor: IssuedDistributionCredential;
    };

interface CredentialRow {
  readonly id: unknown;
  readonly lookup_id: unknown;
  readonly verifier?: unknown;
  readonly label: unknown;
  readonly capability: unknown;
  readonly expires_at: unknown;
  readonly revoked_at: unknown;
  readonly rotation_successor_id: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const LOOKUP_ID_PATTERN = /^l[A-Za-z0-9_-]{22}$/u;
const METADATA_COLUMNS = `
  id, lookup_id, label, capability, expires_at, revoked_at,
  rotation_successor_id, created_at, updated_at`;
const AUTHENTICATION_COLUMNS = `
  id, lookup_id, verifier, capability, expires_at, revoked_at`;

export async function issueDistributionCredential(
  executor: QueryExecutor,
  input: unknown,
  options: { readonly randomBytes?: CredentialRandomBytes } = {},
): Promise<Readonly<IssuedDistributionCredential>> {
  const normalized = normalizeDistributionCredentialIssueInput(input);
  const generated = generateDistributionCredentialToken(options.randomBytes);
  const verifier = deriveDistributionCredentialVerifier(generated.secret);
  const result = await executor.query<CredentialRow>(
    `INSERT INTO distribution_credentials (
       id, lookup_id, verifier, label, capability, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${METADATA_COLUMNS}`,
    [
      randomUUID(),
      generated.lookupId,
      verifier,
      normalized.label,
      DISTRIBUTION_CREDENTIAL_CAPABILITY,
      normalized.expiresAt,
    ],
  );
  return Object.freeze({
    credential: mapCredentialMetadata(
      requiredRow(result.rows, 'credential issue'),
    ),
    token: generated.token,
  });
}

export async function listDistributionCredentialMetadata(
  executor: QueryExecutor,
): Promise<readonly DistributionCredentialMetadata[]> {
  const result = await executor.query<CredentialRow>(
    `SELECT ${METADATA_COLUMNS}
       FROM distribution_credentials
      ORDER BY created_at DESC, id DESC`,
  );
  return Object.freeze(result.rows.map(mapCredentialMetadata));
}

export async function findDistributionCredentialForAuthentication(
  executor: QueryExecutor,
  lookupId: unknown,
): Promise<DistributionCredentialAuthenticationRecord | undefined> {
  if (typeof lookupId !== 'string' || !LOOKUP_ID_PATTERN.test(lookupId)) {
    return undefined;
  }
  const result = await executor.query<CredentialRow>(
    `SELECT ${AUTHENTICATION_COLUMNS}
       FROM distribution_credentials
      WHERE lookup_id = $1`,
    [lookupId],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapAuthenticationRecord(row);
}

export async function revokeDistributionCredential(
  executor: QueryExecutor,
  credentialId: unknown,
): Promise<Readonly<DistributionCredentialRevocationResult>> {
  const id = normalizeCredentialId(credentialId);
  const existing = await findCredentialForUpdate(executor, id);
  if (existing === undefined) return Object.freeze({ outcome: 'missing' });
  if (existing.revokedAt !== null) {
    return Object.freeze({ outcome: 'already_revoked', credential: existing });
  }
  const result = await executor.query<CredentialRow>(
    `UPDATE distribution_credentials
        SET revoked_at = now(), updated_at = now()
      WHERE id = $1
      RETURNING ${METADATA_COLUMNS}`,
    [id],
  );
  return Object.freeze({
    outcome: 'revoked',
    credential: mapCredentialMetadata(
      requiredRow(result.rows, 'credential revoke'),
    ),
  });
}

export async function rotateDistributionCredential(
  executor: QueryExecutor,
  credentialId: unknown,
  successorInput: unknown,
  options: { readonly randomBytes?: CredentialRandomBytes } = {},
): Promise<Readonly<DistributionCredentialRotationResult>> {
  const id = normalizeCredentialId(credentialId);
  const predecessor = await findCredentialForUpdate(executor, id);
  if (predecessor === undefined) return Object.freeze({ outcome: 'missing' });
  if (predecessor.rotationSuccessorId !== null) {
    return Object.freeze({
      outcome: 'already_rotated',
      credential: predecessor,
    });
  }
  const successor = await issueDistributionCredential(
    executor,
    successorInput,
    options,
  );
  const result = await executor.query<CredentialRow>(
    `UPDATE distribution_credentials
        SET rotation_successor_id = $2, updated_at = now()
      WHERE id = $1 AND rotation_successor_id IS NULL
      RETURNING ${METADATA_COLUMNS}`,
    [id, successor.credential.id],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new ConfigurationPersistenceError('credential rotation conflict');
  }
  return Object.freeze({
    outcome: 'rotated',
    predecessor: mapCredentialMetadata(row),
    successor,
  });
}

async function findCredentialForUpdate(
  executor: QueryExecutor,
  id: string,
): Promise<DistributionCredentialMetadata | undefined> {
  const result = await executor.query<CredentialRow>(
    `SELECT ${METADATA_COLUMNS}
       FROM distribution_credentials
      WHERE id = $1
      FOR UPDATE`,
    [id],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapCredentialMetadata(row);
}

function mapCredentialMetadata(
  row: CredentialRow,
): DistributionCredentialMetadata {
  try {
    const capability = requiredString(row.capability);
    if (capability !== DISTRIBUTION_CREDENTIAL_CAPABILITY) throw new Error();
    const lookupId = requiredString(row.lookup_id);
    if (!LOOKUP_ID_PATTERN.test(lookupId)) throw new Error();
    const label = requiredString(row.label);
    if (label !== label.trim() || label.length > 200 || /\p{Cc}/u.test(label)) {
      throw new Error();
    }
    return Object.freeze({
      id: normalizeCredentialId(row.id),
      lookupId,
      label,
      capability: DISTRIBUTION_CREDENTIAL_CAPABILITY,
      expiresAt: nullableTimestamp(row.expires_at),
      revokedAt: nullableTimestamp(row.revoked_at),
      rotationSuccessorId: nullableCredentialId(row.rotation_successor_id),
      createdAt: requiredTimestamp(row.created_at),
      updatedAt: requiredTimestamp(row.updated_at),
    });
  } catch {
    throw new ConfigurationPersistenceError(
      'database returned invalid credential metadata',
    );
  }
}

function mapAuthenticationRecord(
  row: CredentialRow,
): DistributionCredentialAuthenticationRecord {
  try {
    const capability = requiredString(row.capability);
    const lookupId = requiredString(row.lookup_id);
    const verifier = row.verifier;
    if (
      capability !== DISTRIBUTION_CREDENTIAL_CAPABILITY ||
      !LOOKUP_ID_PATTERN.test(lookupId) ||
      !Buffer.isBuffer(verifier) ||
      verifier.length !== 32
    ) {
      throw new Error();
    }
    return Object.freeze({
      id: normalizeCredentialId(row.id),
      lookupId,
      verifier: Buffer.from(verifier),
      capability: DISTRIBUTION_CREDENTIAL_CAPABILITY,
      expiresAt: nullableTimestamp(row.expires_at),
      revokedAt: nullableTimestamp(row.revoked_at),
    });
  } catch {
    throw new ConfigurationPersistenceError(
      'database returned invalid credential authentication record',
    );
  }
}

function normalizeCredentialId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new Error();
  return value;
}

function nullableCredentialId(value: unknown): string | null {
  return value === null ? null : normalizeCredentialId(value);
}

function nullableTimestamp(value: unknown): Date | null {
  return value === null ? null : requiredTimestamp(value);
}

function requiredRow<T>(rows: readonly T[], operation: string): T {
  const row = rows[0];
  if (row === undefined) throw new ConfigurationPersistenceError(operation);
  return row;
}
