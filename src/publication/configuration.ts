export const PUBLICATION_PUBLIC_STATUSES = ['private', 'public'] as const;

export type PublicationPublicStatus =
  (typeof PUBLICATION_PUBLIC_STATUSES)[number];

export interface PublicationConfiguration {
  readonly name: string;
  readonly activeForCollection: boolean;
  readonly publicStatus: PublicationPublicStatus;
  readonly description?: string;
  readonly logoPath?: string;
  readonly accentColor?: string;
}

export interface PublicationPresentationConfiguration {
  readonly name: string;
  readonly description?: string;
  readonly logoPath?: string;
  readonly accentColor?: string;
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
const PUBLICATION_DESCRIPTION_MAX_CODE_POINTS = 500;
const PUBLICATION_LOGO_PATH_MAX_LENGTH = 1024;
const ACCENT_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/u;

export function normalizePublicationConfiguration(
  input: unknown,
): Readonly<PublicationConfiguration> {
  const record = configurationRecord(input, 'publication');
  const presentation = normalizePublicationPresentation(record);

  if (typeof record.activeForCollection !== 'boolean') {
    throw new ConfigurationValidationError(
      'publication.activeForCollection',
      'must_be_boolean',
    );
  }

  return Object.freeze({
    ...presentation,
    activeForCollection: record.activeForCollection,
    publicStatus: normalizePublicationPublicStatus(record.publicStatus),
  });
}

export function normalizePublicationPresentation(
  input: unknown,
): Readonly<PublicationPresentationConfiguration> {
  const record = configurationRecord(input, 'publication');
  const name = trimmedString(record.name, 'publication.name');
  if (name.length > PUBLICATION_NAME_MAX_LENGTH) {
    throw new ConfigurationValidationError('publication.name', 'too_long');
  }

  const description = optionalDescription(record, 'publication.description');
  const logoPath = optionalLogoPath(record, 'publication.logoPath');
  const accentColor = optionalAccentColor(record, 'publication.accentColor');

  return Object.freeze({
    name,
    ...(description === undefined ? {} : { description }),
    ...(logoPath === undefined ? {} : { logoPath }),
    ...(accentColor === undefined ? {} : { accentColor }),
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

function optionalDescription(
  record: Record<string, unknown>,
  field: string,
): string | undefined {
  if (!(fieldName(field) in record)) return undefined;
  const value = stringValue(record[fieldName(field)], field).trim();
  if (value.length === 0) return undefined;
  if (Array.from(value).length > PUBLICATION_DESCRIPTION_MAX_CODE_POINTS) {
    throw new ConfigurationValidationError(field, 'too_long');
  }
  return value;
}

function optionalLogoPath(
  record: Record<string, unknown>,
  field: string,
): string | undefined {
  if (!(fieldName(field) in record)) return undefined;
  const value = stringValue(record[fieldName(field)], field).trim();
  if (value.length === 0) return undefined;
  if (value.length > PUBLICATION_LOGO_PATH_MAX_LENGTH) {
    throw new ConfigurationValidationError(field, 'too_long');
  }
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[?#\\]/u.test(value) ||
    containsControlCharacter(value)
  ) {
    throw new ConfigurationValidationError(field, 'invalid_path');
  }
  return value;
}

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function optionalAccentColor(
  record: Record<string, unknown>,
  field: string,
): string | undefined {
  if (!(fieldName(field) in record)) return undefined;
  const value = stringValue(record[fieldName(field)], field).trim();
  if (value.length === 0) return undefined;
  if (!ACCENT_COLOR_PATTERN.test(value)) {
    throw new ConfigurationValidationError(field, 'invalid_color');
  }
  return value.toUpperCase();
}

function fieldName(field: string): string {
  return field.slice(field.lastIndexOf('.') + 1);
}
