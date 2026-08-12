import { ConfigurationValidationError } from '../../publication/configuration.ts';
import { normalizeConfigKey } from '../../sources/configuration.ts';

export const RELEVANCE_PREDICATE_TYPES = [
  'title_contains',
  'summary_contains',
  'source_category_equals',
] as const;
export const RELEVANCE_ACTIONS = ['include', 'exclude', 'categorize'] as const;

export type RelevancePredicateType = (typeof RELEVANCE_PREDICATE_TYPES)[number];
export type RelevanceAction = (typeof RELEVANCE_ACTIONS)[number];
export type RelevanceRuleScope = 'installation' | 'source';

export interface CategoryConfiguration {
  readonly configKey: string;
  readonly displayName: string;
}

export interface MutableCategoryConfiguration {
  readonly displayName: string;
}

export interface CategoryTargetIdentity {
  readonly configKey: string;
  readonly displayName: string;
}

export interface RelevanceRuleConfiguration {
  readonly configKey: string;
  readonly predicateType: RelevancePredicateType;
  readonly pattern: string;
  readonly action: RelevanceAction;
  readonly priority: number;
  readonly enabled: boolean;
  readonly reason: string;
  readonly sourceConfigKey?: string;
  readonly categoryConfigKey?: string;
}

export interface MutableRelevanceRuleConfiguration {
  readonly predicateType: RelevancePredicateType;
  readonly pattern: string;
  readonly action: RelevanceAction;
  readonly priority: number;
  readonly enabled: boolean;
  readonly reason: string;
  readonly sourceConfigKey?: string;
  readonly categoryConfigKey?: string;
}

const CATEGORY_DISPLAY_NAME_MAX_LENGTH = 200;
const RULE_PATTERN_MAX_LENGTH = 2000;
const RULE_REASON_MAX_LENGTH = 160;

export function normalizeCategoryConfiguration(
  input: unknown,
): Readonly<CategoryConfiguration> {
  const record = configurationRecord(input, 'category');
  return Object.freeze({
    configKey: normalizeConfigKey(record.configKey),
    displayName: requiredTrimmedString(
      record.displayName,
      'category.displayName',
      CATEGORY_DISPLAY_NAME_MAX_LENGTH,
    ),
  });
}

export function normalizeMutableCategoryConfiguration(
  input: unknown,
): Readonly<MutableCategoryConfiguration> {
  const record = configurationRecord(input, 'category');
  return Object.freeze({
    displayName: requiredTrimmedString(
      record.displayName,
      'category.displayName',
      CATEGORY_DISPLAY_NAME_MAX_LENGTH,
    ),
  });
}

export function normalizeRelevanceRuleConfiguration(
  input: unknown,
): Readonly<RelevanceRuleConfiguration> {
  const record = configurationRecord(input, 'relevanceRule');
  return Object.freeze({
    configKey: normalizeConfigKey(record.configKey),
    ...normalizeMutableRelevanceRuleRecord(record),
  });
}

export function normalizeMutableRelevanceRuleConfiguration(
  input: unknown,
): Readonly<MutableRelevanceRuleConfiguration> {
  return Object.freeze(
    normalizeMutableRelevanceRuleRecord(
      configurationRecord(input, 'relevanceRule'),
    ),
  );
}

export function normalizeRelevancePredicateType(
  input: unknown,
): RelevancePredicateType {
  return enumValue(
    input,
    RELEVANCE_PREDICATE_TYPES,
    'relevanceRule.predicateType',
  );
}

export function normalizeRelevanceAction(input: unknown): RelevanceAction {
  return enumValue(input, RELEVANCE_ACTIONS, 'relevanceRule.action');
}

function normalizeMutableRelevanceRuleRecord(
  record: Record<string, unknown>,
): MutableRelevanceRuleConfiguration {
  const action = normalizeRelevanceAction(record.action);
  const sourceConfigKey = optionalConfigKey(
    record.sourceConfigKey,
    'relevanceRule.sourceConfigKey',
  );
  const categoryConfigKey = optionalConfigKey(
    record.categoryConfigKey,
    'relevanceRule.categoryConfigKey',
  );
  if (action === 'categorize' && categoryConfigKey === undefined) {
    throw new ConfigurationValidationError(
      'relevanceRule.categoryConfigKey',
      'required_for_categorize',
    );
  }
  if (action !== 'categorize' && categoryConfigKey !== undefined) {
    throw new ConfigurationValidationError(
      'relevanceRule.categoryConfigKey',
      'only_allowed_for_categorize',
    );
  }
  return {
    predicateType: normalizeRelevancePredicateType(record.predicateType),
    pattern: requiredTrimmedString(
      record.pattern,
      'relevanceRule.pattern',
      RULE_PATTERN_MAX_LENGTH,
    ),
    action,
    priority: priority(record.priority),
    enabled: requiredBoolean(record.enabled, 'relevanceRule.enabled'),
    reason: requiredTrimmedString(
      record.reason,
      'relevanceRule.reason',
      RULE_REASON_MAX_LENGTH,
    ),
    ...(sourceConfigKey === undefined ? {} : { sourceConfigKey }),
    ...(categoryConfigKey === undefined ? {} : { categoryConfigKey }),
  };
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

function requiredTrimmedString(
  input: unknown,
  field: string,
  maximumLength: number,
): string {
  if (typeof input !== 'string') {
    throw new ConfigurationValidationError(field, 'must_be_a_string');
  }
  if (input.length === 0 || input !== input.trim()) {
    throw new ConfigurationValidationError(
      field,
      'must_be_trimmed_and_nonempty',
    );
  }
  if (input.length > maximumLength) {
    throw new ConfigurationValidationError(field, 'too_long');
  }
  return input;
}

function optionalConfigKey(input: unknown, field: string): string | undefined {
  if (input === undefined) return undefined;
  try {
    return normalizeConfigKey(input);
  } catch {
    throw new ConfigurationValidationError(field, 'invalid_config_key');
  }
}

function requiredBoolean(input: unknown, field: string): boolean {
  if (typeof input !== 'boolean') {
    throw new ConfigurationValidationError(field, 'must_be_boolean');
  }
  return input;
}

function priority(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input)) {
    throw new ConfigurationValidationError(
      'relevanceRule.priority',
      'must_be_an_integer',
    );
  }
  return input;
}

function enumValue<const T extends readonly string[]>(
  input: unknown,
  values: T,
  field: string,
): T[number] {
  if (typeof input === 'string' && values.includes(input)) {
    return input as T[number];
  }
  throw new ConfigurationValidationError(field, 'unsupported_value');
}
