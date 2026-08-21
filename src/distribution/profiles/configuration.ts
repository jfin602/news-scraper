import { ConfigurationValidationError } from '../../publication/configuration.ts';
import { normalizeConfigKey } from '../../sources/configuration.ts';

export const DISTRIBUTION_PROFILE_LIFECYCLES = [
  'draft',
  'active',
  'disabled',
] as const;
export const DEFAULT_DISTRIBUTION_PROFILE_RESULT_LIMIT = 100;
export const MAXIMUM_DISTRIBUTION_PROFILE_RESULT_LIMIT = 1000;
export const MAXIMUM_DISTRIBUTION_PROFILE_FILTER_ITEMS = 64;
export const MAXIMUM_DISTRIBUTION_PROFILE_PHRASE_LENGTH = 512;

export type DistributionProfileLifecycle =
  (typeof DISTRIBUTION_PROFILE_LIFECYCLES)[number];

export interface DistributionProfileConfiguration {
  readonly configKey: string;
  readonly displayName: string;
  readonly lifecycle: DistributionProfileLifecycle;
  readonly resultLimit: number;
}

export interface MutableDistributionProfileConfiguration {
  readonly displayName: string;
  readonly lifecycle: DistributionProfileLifecycle;
  readonly resultLimit: number;
}

export interface DistributionProfileSourceFilters {
  readonly includeAnyPhrases: readonly string[];
  readonly excludeAnyPhrases: readonly string[];
  readonly categoryConfigKeys: readonly string[];
}

export function normalizeDistributionProfileConfiguration(
  input: unknown,
): Readonly<DistributionProfileConfiguration> {
  const record = configurationRecord(input, 'distributionProfile');
  return Object.freeze({
    configKey: normalizeConfigKey(record.configKey),
    ...normalizeMutableDistributionProfileRecord(record),
  });
}

export function normalizeMutableDistributionProfileConfiguration(
  input: unknown,
): Readonly<MutableDistributionProfileConfiguration> {
  return Object.freeze(
    normalizeMutableDistributionProfileRecord(
      configurationRecord(input, 'distributionProfile'),
    ),
  );
}

export function normalizeDistributionProfileLifecycle(
  input: unknown,
): DistributionProfileLifecycle {
  if (
    typeof input === 'string' &&
    DISTRIBUTION_PROFILE_LIFECYCLES.includes(
      input as DistributionProfileLifecycle,
    )
  ) {
    return input as DistributionProfileLifecycle;
  }
  throw new ConfigurationValidationError(
    'distributionProfile.lifecycle',
    'unsupported_value',
  );
}

export function normalizeDistributionProfileSourceFilters(
  input: unknown,
): Readonly<DistributionProfileSourceFilters> {
  const record = configurationRecord(input, 'distributionProfileSourceFilters');
  return Object.freeze({
    includeAnyPhrases: normalizePhrases(
      record.includeAnyPhrases ?? [],
      'distributionProfileSourceFilters.includeAnyPhrases',
    ),
    excludeAnyPhrases: normalizePhrases(
      record.excludeAnyPhrases ?? [],
      'distributionProfileSourceFilters.excludeAnyPhrases',
    ),
    categoryConfigKeys: normalizeCategoryConfigKeys(
      record.categoryConfigKeys ?? [],
    ),
  });
}

function normalizeMutableDistributionProfileRecord(
  record: Record<string, unknown>,
): MutableDistributionProfileConfiguration {
  return {
    displayName: requiredTrimmedString(
      record.displayName,
      'distributionProfile.displayName',
      200,
    ),
    lifecycle: normalizeDistributionProfileLifecycle(
      record.lifecycle ?? 'draft',
    ),
    resultLimit: normalizeResultLimit(record.resultLimit),
  };
}

function normalizeResultLimit(input: unknown): number {
  const value = input ?? DEFAULT_DISTRIBUTION_PROFILE_RESULT_LIMIT;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAXIMUM_DISTRIBUTION_PROFILE_RESULT_LIMIT
  ) {
    throw new ConfigurationValidationError(
      'distributionProfile.resultLimit',
      'must_be_an_integer_within_bounds',
    );
  }
  return value;
}

function normalizePhrases(input: unknown, field: string): readonly string[] {
  if (
    !Array.isArray(input) ||
    input.length > MAXIMUM_DISTRIBUTION_PROFILE_FILTER_ITEMS
  ) {
    throw new ConfigurationValidationError(
      field,
      'must_contain_at_most_64_items',
    );
  }
  const values: string[] = [];
  const seen = new Set<string>();
  for (const value of input) {
    if (typeof value !== 'string') {
      throw new ConfigurationValidationError(field, 'phrase_must_be_a_string');
    }
    const phrase = value.trim();
    if (
      phrase.length === 0 ||
      phrase.length > MAXIMUM_DISTRIBUTION_PROFILE_PHRASE_LENGTH ||
      /\p{Cc}/u.test(phrase)
    ) {
      throw new ConfigurationValidationError(field, 'invalid_phrase');
    }
    const comparison = phrase.toLocaleLowerCase('en-US');
    if (seen.has(comparison)) {
      throw new ConfigurationValidationError(field, 'duplicate_phrase');
    }
    seen.add(comparison);
    values.push(phrase);
  }
  return Object.freeze(values);
}

function normalizeCategoryConfigKeys(input: unknown): readonly string[] {
  const field = 'distributionProfileSourceFilters.categoryConfigKeys';
  if (
    !Array.isArray(input) ||
    input.length > MAXIMUM_DISTRIBUTION_PROFILE_FILTER_ITEMS
  ) {
    throw new ConfigurationValidationError(
      field,
      'must_contain_at_most_64_items',
    );
  }
  const values: string[] = [];
  const seen = new Set<string>();
  for (const value of input) {
    let configKey: string;
    try {
      configKey = normalizeConfigKey(value);
    } catch {
      throw new ConfigurationValidationError(field, 'invalid_config_key');
    }
    if (seen.has(configKey)) {
      throw new ConfigurationValidationError(
        field,
        'duplicate_category_config_key',
      );
    }
    seen.add(configKey);
    values.push(configKey);
  }
  return Object.freeze(values);
}

function requiredTrimmedString(
  input: unknown,
  field: string,
  maximumLength: number,
): string {
  if (typeof input !== 'string') {
    throw new ConfigurationValidationError(field, 'must_be_a_string');
  }
  const value = input.trim();
  if (value.length === 0) {
    throw new ConfigurationValidationError(field, 'must_not_be_blank');
  }
  if (value.length > maximumLength) {
    throw new ConfigurationValidationError(field, 'too_long');
  }
  return value;
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
