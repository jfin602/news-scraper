import { ConfigurationValidationError } from '../../publication/configuration.ts';

export const DISTRIBUTION_CREDENTIAL_CAPABILITY = 'distribution:read';
export const MAXIMUM_DISTRIBUTION_CREDENTIAL_LABEL_LENGTH = 200;

export interface DistributionCredentialIssueInput {
  readonly label: string;
  readonly expiresAt: Date | null;
}

export function normalizeDistributionCredentialIssueInput(
  input: unknown,
): Readonly<DistributionCredentialIssueInput> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ConfigurationValidationError(
      'distributionCredential',
      'must_be_an_object',
    );
  }
  const record = input as Record<string, unknown>;
  return Object.freeze({
    label: normalizeDistributionCredentialLabel(record.label),
    expiresAt: normalizeDistributionCredentialExpiry(record.expiresAt),
  });
}

export function normalizeDistributionCredentialLabel(input: unknown): string {
  if (typeof input !== 'string') {
    throw new ConfigurationValidationError(
      'distributionCredential.label',
      'must_be_a_string',
    );
  }
  const label = input.trim();
  if (label.length === 0) {
    throw new ConfigurationValidationError(
      'distributionCredential.label',
      'must_not_be_blank',
    );
  }
  if (label.length > MAXIMUM_DISTRIBUTION_CREDENTIAL_LABEL_LENGTH) {
    throw new ConfigurationValidationError(
      'distributionCredential.label',
      'too_long',
    );
  }
  if (/\p{Cc}/u.test(label)) {
    throw new ConfigurationValidationError(
      'distributionCredential.label',
      'contains_control_character',
    );
  }
  return label;
}

export function normalizeDistributionCredentialExpiry(
  input: unknown,
): Date | null {
  if (input === undefined || input === null) return null;
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return new Date(input.getTime());
  }
  if (
    typeof input !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input)
  ) {
    throw new ConfigurationValidationError(
      'distributionCredential.expiresAt',
      'must_be_an_absolute_iso_timestamp',
    );
  }
  const value = new Date(input);
  if (Number.isNaN(value.getTime()) || value.toISOString() !== input) {
    throw new ConfigurationValidationError(
      'distributionCredential.expiresAt',
      'must_be_an_absolute_iso_timestamp',
    );
  }
  return value;
}
