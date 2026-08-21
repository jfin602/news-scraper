import { ConfigurationPersistenceError } from '../../publication/repository.ts';
import { DISTRIBUTION_CREDENTIAL_CAPABILITY } from './configuration.ts';
import {
  findDistributionCredentialForAuthentication,
  type DistributionCredentialAuthenticationRecord,
} from './repository.ts';
import {
  deriveDistributionCredentialVerifier,
  distributionCredentialVerifierMatches,
  parseDistributionCredentialToken,
} from './token.ts';

export const MAXIMUM_MACHINE_AUTHORIZATION_HEADER_LENGTH = 87;

const dummyVerifier = Buffer.alloc(32);

export interface DistributionCredentialAuthenticationRepository {
  findByLookupId(
    lookupId: string,
  ): Promise<DistributionCredentialAuthenticationRecord | undefined>;
}

export interface MachineAuthenticationPrincipal {
  readonly credentialId: string;
  readonly lookupId: string;
  readonly capability: typeof DISTRIBUTION_CREDENTIAL_CAPABILITY;
}

export type MachineAuthenticationResult =
  | {
      readonly outcome: 'authenticated';
      readonly principal: MachineAuthenticationPrincipal;
    }
  | { readonly outcome: 'unauthenticated' };

export interface MachineAuthenticationDependencies {
  readonly repository: DistributionCredentialAuthenticationRepository;
  readonly now?: () => Date;
  readonly verifierMatches?: (candidate: Buffer, persisted: Buffer) => boolean;
}

export function createDistributionCredentialAuthenticationRepository(
  executor: Parameters<typeof findDistributionCredentialForAuthentication>[0],
): DistributionCredentialAuthenticationRepository {
  return Object.freeze({
    findByLookupId: (lookupId: string) =>
      findDistributionCredentialForAuthentication(executor, lookupId),
  });
}

export function createMachineAuthenticator(
  dependencies: MachineAuthenticationDependencies,
): {
  authenticate(
    authorizationHeader: string | undefined,
  ): Promise<MachineAuthenticationResult>;
} {
  const now = dependencies.now ?? (() => new Date());
  const verifierMatches =
    dependencies.verifierMatches ?? distributionCredentialVerifierMatches;

  return Object.freeze({
    async authenticate(authorizationHeader) {
      const parsed = parseBearerCredential(authorizationHeader);
      if (parsed === undefined) return unauthenticated();

      let record: DistributionCredentialAuthenticationRecord | undefined;
      try {
        record = await dependencies.repository.findByLookupId(parsed.lookupId);
      } catch (error) {
        if (error instanceof ConfigurationPersistenceError)
          return unauthenticated();
        throw error;
      }

      const candidateVerifier = deriveDistributionCredentialVerifier(
        parsed.secret,
      );
      let verifierMatchesPersisted: boolean;
      try {
        verifierMatchesPersisted = verifierMatches(
          candidateVerifier,
          record?.verifier ?? dummyVerifier,
        );
      } catch {
        return unauthenticated();
      }
      if (
        record === undefined ||
        !verifierMatchesPersisted ||
        !recordCanAuthorize(record, now())
      ) {
        return unauthenticated();
      }
      return Object.freeze({
        outcome: 'authenticated' as const,
        principal: Object.freeze({
          credentialId: record.id,
          lookupId: record.lookupId,
          capability: DISTRIBUTION_CREDENTIAL_CAPABILITY,
        }),
      });
    },
  });
}

export function parseBearerCredential(
  authorizationHeader: string | undefined,
): ReturnType<typeof parseDistributionCredentialToken> {
  if (
    typeof authorizationHeader !== 'string' ||
    authorizationHeader.length > MAXIMUM_MACHINE_AUTHORIZATION_HEADER_LENGTH ||
    !authorizationHeader.startsWith('Bearer ')
  ) {
    return undefined;
  }
  return parseDistributionCredentialToken(
    authorizationHeader.slice('Bearer '.length),
  );
}

function recordCanAuthorize(
  record: DistributionCredentialAuthenticationRecord,
  now: Date,
): boolean {
  if (
    !(now instanceof Date) ||
    Number.isNaN(now.getTime()) ||
    typeof record.id !== 'string' ||
    typeof record.lookupId !== 'string' ||
    record.lookupId.length === 0 ||
    (record.expiresAt !== null &&
      (!(record.expiresAt instanceof Date) ||
        Number.isNaN(record.expiresAt.getTime())))
  ) {
    return false;
  }
  return (
    record.capability === DISTRIBUTION_CREDENTIAL_CAPABILITY &&
    record.revokedAt === null &&
    (record.expiresAt === null || record.expiresAt.getTime() > now.getTime())
  );
}

function unauthenticated(): Readonly<{ readonly outcome: 'unauthenticated' }> {
  return Object.freeze({ outcome: 'unauthenticated' });
}
