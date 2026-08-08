export const PUBLICATION_PUBLIC_STATUSES = ['private', 'public'] as const;

export type PublicationPublicStatus =
  (typeof PUBLICATION_PUBLIC_STATUSES)[number];

export interface PublicationConfiguration {
  readonly name: string;
  readonly slug: string;
  readonly activeForCollection: boolean;
  readonly publicStatus: PublicationPublicStatus;
}

export class ConfigurationValidationError extends Error {
  readonly field: string;
  readonly reason: string;

  constructor(field: string, reason: string) {
    super(`Invalid configuration for ${field}: ${reason}`);
    this.name = 'ConfigurationValidationError';
    this.field = field;
    this.reason = reason;
  }
}

const PUBLICATION_NAME_MAX_LENGTH = 200;
const PUBLICATION_SLUG_MAX_LENGTH = 100;
const PUBLICATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function normalizePublicationConfiguration(
  input: unknown,
): Readonly<PublicationConfiguration> {
  const record = configurationRecord(input, 'publication');
  const name = trimmedString(record.name, 'publication.name');
  if (name.length > PUBLICATION_NAME_MAX_LENGTH) {
    throw new ConfigurationValidationError('publication.name', 'too_long');
  }

  const slug = stringValue(record.slug, 'publication.slug');
  if (
    slug.length > PUBLICATION_SLUG_MAX_LENGTH ||
    !PUBLICATION_SLUG_PATTERN.test(slug)
  ) {
    throw new ConfigurationValidationError('publication.slug', 'invalid_shape');
  }

  if (typeof record.activeForCollection !== 'boolean') {
    throw new ConfigurationValidationError(
      'publication.activeForCollection',
      'must_be_boolean',
    );
  }

  return Object.freeze({
    name,
    slug,
    activeForCollection: record.activeForCollection,
    publicStatus: normalizePublicationPublicStatus(record.publicStatus),
  });
}

export function normalizePublicationPublicStatus(
  input: unknown,
): PublicationPublicStatus {
  if (input === 'private' || input === 'public') return input;
  throw new ConfigurationValidationError(
    'publication.publicStatus',
    'unsupported_value',
  );
}

function configurationRecord(
  input: unknown,
  field: string,
): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ConfigurationValidationError(field, 'must_be_an_object');
  }
  return input as Record<string, unknown>;
}

function stringValue(input: unknown, field: string): string {
  if (typeof input !== 'string') {
    throw new ConfigurationValidationError(field, 'must_be_a_string');
  }
  return input;
}

function trimmedString(input: unknown, field: string): string {
  const value = stringValue(input, field).trim();
  if (value.length === 0) {
    throw new ConfigurationValidationError(field, 'must_not_be_blank');
  }
  return value;
}
