import { randomUUID } from 'node:crypto';

import { type Database, type QueryExecutor } from '../database/database.ts';
import {
  normalizeDistributionCredentialIssueInput,
  type DistributionCredentialIssueInput,
} from '../distribution/credentials/configuration.ts';
import {
  issueDistributionCredential,
  listDistributionCredentialMetadata,
  revokeDistributionCredential,
  rotateDistributionCredential,
  type DistributionCredentialMetadata,
} from '../distribution/credentials/repository.ts';
import { ConfigurationValidationError } from '../publication/configuration.ts';
import { validateAdminInputRecord } from './input-validation.ts';

export type DistributionCredentialAdministrationErrorCode =
  'invalid_request' | 'credential_not_found' | 'credential_already_rotated';

export class DistributionCredentialAdministrationError extends Error {
  readonly code: DistributionCredentialAdministrationErrorCode;

  constructor(code: DistributionCredentialAdministrationErrorCode) {
    super(`Distribution credential administration command failed: ${code}`);
    this.name = 'DistributionCredentialAdministrationError';
    this.code = code;
  }
}

export interface AdminDistributionCredentialReadModel {
  readonly lookupId: string;
  readonly label: string;
  readonly capability: 'distribution:read';
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly rotationSuccessorLookupId: string | null;
  readonly lifecycleState: 'active' | 'expired' | 'revoked' | 'rotated';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AdminIssuedDistributionCredential {
  readonly credential: AdminDistributionCredentialReadModel;
  /** Transient: only returned by the issuing create/rotate command. */
  readonly plaintextToken: string;
}

export interface DistributionCredentialAdministrationService {
  listCredentials(): Promise<readonly AdminDistributionCredentialReadModel[]>;
  createCredential(input: unknown): Promise<AdminIssuedDistributionCredential>;
  revokeCredential(
    lookupId: unknown,
  ): Promise<AdminDistributionCredentialReadModel>;
  rotateCredential(
    lookupId: unknown,
    input: unknown,
  ): Promise<AdminIssuedDistributionCredential>;
}

export function createDistributionCredentialAdministrationService(
  database: Database,
): DistributionCredentialAdministrationService {
  return Object.freeze({
    async listCredentials() {
      const credentials = await listDistributionCredentialMetadata(database);
      return mapCredentials(credentials);
    },

    async createCredential(input: unknown) {
      const command = issueCommand(input);
      return credentialTransaction(database, async (transaction) => {
        const issued = await issueDistributionCredential(transaction, command);
        await writeCredentialAudit(
          transaction,
          'distribution_credential_issued',
          issued.credential,
          null,
          credentialAuditState(issued.credential, new Map()),
        );
        return Object.freeze({
          credential: mapCredential(issued.credential, new Map()),
          plaintextToken: issued.token,
        });
      });
    },

    async revokeCredential(lookupId: unknown) {
      const lookup = publicLookupId(lookupId);
      return credentialTransaction(database, async (transaction) => {
        const credentials =
          await listDistributionCredentialMetadata(transaction);
        const current = credentialForLookupId(credentials, lookup);
        const result = await revokeDistributionCredential(
          transaction,
          current.id,
        );
        if (result.outcome === 'missing') {
          throw new DistributionCredentialAdministrationError(
            'credential_not_found',
          );
        }
        if (result.outcome === 'revoked') {
          await writeCredentialAudit(
            transaction,
            'distribution_credential_revoked',
            result.credential,
            credentialAuditState(current, lookupIdsById(credentials)),
            credentialAuditState(result.credential, lookupIdsById(credentials)),
          );
        }
        return mapCredential(result.credential, lookupIdsById(credentials));
      });
    },

    async rotateCredential(lookupId: unknown, input: unknown) {
      const lookup = publicLookupId(lookupId);
      const command = issueCommand(input);
      return credentialTransaction(database, async (transaction) => {
        const credentials =
          await listDistributionCredentialMetadata(transaction);
        const current = credentialForLookupId(credentials, lookup);
        const result = await rotateDistributionCredential(
          transaction,
          current.id,
          command,
        );
        if (result.outcome === 'missing') {
          throw new DistributionCredentialAdministrationError(
            'credential_not_found',
          );
        }
        if (result.outcome === 'already_rotated') {
          throw new DistributionCredentialAdministrationError(
            'credential_already_rotated',
          );
        }
        await writeCredentialAudit(
          transaction,
          'distribution_credential_rotated',
          result.predecessor,
          credentialAuditState(current, lookupIdsById(credentials)),
          credentialAuditState(
            result.predecessor,
            lookupIdsById([...credentials, result.successor.credential]),
          ),
        );
        await writeCredentialAudit(
          transaction,
          'distribution_credential_issued',
          result.successor.credential,
          null,
          credentialAuditState(result.successor.credential, new Map()),
        );
        return Object.freeze({
          credential: mapCredential(result.successor.credential, new Map()),
          plaintextToken: result.successor.token,
        });
      });
    },
  });
}

function issueCommand(
  input: unknown,
): Readonly<DistributionCredentialIssueInput> {
  const record = validateAdminInputRecord(input, ['label'], ['expiresAt']);
  if (record === undefined) {
    throw new DistributionCredentialAdministrationError('invalid_request');
  }
  try {
    return normalizeDistributionCredentialIssueInput(record);
  } catch (error) {
    if (error instanceof ConfigurationValidationError) {
      throw new DistributionCredentialAdministrationError('invalid_request');
    }
    throw error;
  }
}

function publicLookupId(value: unknown): string {
  if (typeof value !== 'string' || !/^l[A-Za-z0-9_-]{22}$/u.test(value)) {
    throw new DistributionCredentialAdministrationError('credential_not_found');
  }
  return value;
}

function credentialForLookupId(
  credentials: readonly DistributionCredentialMetadata[],
  lookupId: string,
): DistributionCredentialMetadata {
  const credential = credentials.find(
    (candidate) => candidate.lookupId === lookupId,
  );
  if (credential === undefined)
    throw new DistributionCredentialAdministrationError('credential_not_found');
  return credential;
}

function mapCredentials(
  credentials: readonly DistributionCredentialMetadata[],
): readonly AdminDistributionCredentialReadModel[] {
  const lookupIds = lookupIdsById(credentials);
  return Object.freeze(
    credentials.map((credential) => mapCredential(credential, lookupIds)),
  );
}

function lookupIdsById(
  credentials: readonly DistributionCredentialMetadata[],
): ReadonlyMap<string, string> {
  return new Map(
    credentials.map((credential) => [credential.id, credential.lookupId]),
  );
}

function mapCredential(
  credential: DistributionCredentialMetadata,
  lookupIds: ReadonlyMap<string, string>,
): AdminDistributionCredentialReadModel {
  return Object.freeze({
    lookupId: credential.lookupId,
    label: credential.label,
    capability: credential.capability,
    expiresAt: credential.expiresAt?.toISOString() ?? null,
    revokedAt: credential.revokedAt?.toISOString() ?? null,
    rotationSuccessorLookupId:
      credential.rotationSuccessorId === null
        ? null
        : (lookupIds.get(credential.rotationSuccessorId) ?? null),
    lifecycleState:
      credential.revokedAt !== null
        ? 'revoked'
        : credential.expiresAt !== null &&
            credential.expiresAt.getTime() <= Date.now()
          ? 'expired'
          : credential.rotationSuccessorId !== null
            ? 'rotated'
            : 'active',
    createdAt: credential.createdAt.toISOString(),
    updatedAt: credential.updatedAt.toISOString(),
  });
}

function credentialAuditState(
  credential: DistributionCredentialMetadata,
  lookupIds: ReadonlyMap<string, string>,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    lookupId: credential.lookupId,
    label: credential.label,
    capability: credential.capability,
    expiresAt: credential.expiresAt?.toISOString() ?? null,
    revokedAt: credential.revokedAt?.toISOString() ?? null,
    rotationSuccessorLookupId:
      credential.rotationSuccessorId === null
        ? null
        : (lookupIds.get(credential.rotationSuccessorId) ?? null),
  });
}

async function writeCredentialAudit(
  executor: QueryExecutor,
  action: string,
  credential: DistributionCredentialMetadata,
  priorState: Readonly<Record<string, unknown>> | null,
  newState: Readonly<Record<string, unknown>> | null,
): Promise<void> {
  await executor.query(
    `INSERT INTO audit_events (id, action, target_type, target_id, prior_state, new_state)
     VALUES ($1, $2, 'distribution_credential', $3, $4::jsonb, $5::jsonb)`,
    [
      randomUUID(),
      action,
      credential.id,
      priorState === null ? null : JSON.stringify(priorState),
      newState === null ? null : JSON.stringify(newState),
    ],
  );
}

async function credentialTransaction<T>(
  database: Database,
  work: (transaction: QueryExecutor) => Promise<T>,
): Promise<T> {
  return database.transaction(work);
}
