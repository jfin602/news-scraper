import type { Database } from '../database/database.ts';
import {
  ConfigurationValidationError,
  normalizePublicationConfiguration,
} from '../publication/configuration.ts';
import {
  readPublicationSettings,
  replacePublicationSettings,
  type PersistedPublicationSettings,
} from '../publication/repository.ts';

export type PublicationAdministrationErrorCode =
  'invalid_request' | 'publication_not_found';

export class PublicationAdministrationError extends Error {
  readonly code: PublicationAdministrationErrorCode;

  constructor(code: PublicationAdministrationErrorCode) {
    super(`Publication administration command failed: ${code}`);
    this.name = 'PublicationAdministrationError';
    this.code = code;
  }
}

export interface AdminPublicationReadModel {
  readonly name: string;
  readonly activeForCollection: boolean;
  readonly publicStatus: 'private' | 'public';
  readonly description: string | null;
  readonly logoPath: string | null;
  readonly accentColor: string | null;
  readonly presentationTimezone: string | null;
}

export interface PublicationAdministrationService {
  getPublication(): Promise<AdminPublicationReadModel>;
  replacePublication(input: unknown): Promise<AdminPublicationReadModel>;
}

const PUBLICATION_CONFIGURATION_KEYS = [
  'name',
  'activeForCollection',
  'publicStatus',
  'description',
  'logoPath',
  'accentColor',
  'presentationTimezone',
] as const;

export function createPublicationAdministrationService(
  database: Database,
): PublicationAdministrationService {
  return Object.freeze({
    async getPublication() {
      return requirePublication(await readPublicationSettings(database));
    },

    async replacePublication(input: unknown) {
      const configuration = normalizePublicationInput(input);
      const publication = await database.transaction((transaction) =>
        replacePublicationSettings(transaction, configuration),
      );
      return requirePublication(publication);
    },
  });
}

function normalizePublicationInput(input: unknown) {
  const record = exactRecord(input);
  try {
    return normalizePublicationConfiguration(record);
  } catch (error) {
    if (error instanceof ConfigurationValidationError) {
      throw new PublicationAdministrationError('invalid_request');
    }
    throw error;
  }
}

function exactRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new PublicationAdministrationError('invalid_request');
  }
  const record = input as Record<string, unknown>;
  const allowed = new Set<string>(PUBLICATION_CONFIGURATION_KEYS);
  if (
    !('name' in record) ||
    !('activeForCollection' in record) ||
    !('publicStatus' in record) ||
    Object.keys(record).some((key) => !allowed.has(key))
  ) {
    throw new PublicationAdministrationError('invalid_request');
  }
  return record;
}

function requirePublication(
  publication: PersistedPublicationSettings | undefined,
): AdminPublicationReadModel {
  if (publication === undefined) {
    throw new PublicationAdministrationError('publication_not_found');
  }
  return Object.freeze({
    name: publication.name,
    activeForCollection: publication.activeForCollection,
    publicStatus: publication.publicStatus,
    description: publication.description,
    logoPath: publication.logoPath,
    accentColor: publication.accentColor,
    presentationTimezone: publication.presentationTimezone,
  });
}
