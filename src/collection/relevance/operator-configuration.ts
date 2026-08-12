import type { Database, QueryExecutor } from '../../database/database.ts';
import {
  findSourceByConfigKey,
  findSourceEndpointBySourceAndConfigKey,
  type PersistedSource,
  type PersistedSourceEndpoint,
} from '../../sources/repository.ts';
import { normalizeConfigKey } from '../../sources/configuration.ts';
import {
  normalizeCategoryConfiguration,
  normalizeRelevanceRuleConfiguration,
  type CategoryConfiguration,
  type RelevanceRuleConfiguration,
} from './configuration.ts';
import {
  createCategory,
  createRelevanceRule,
  findCategoryByConfigKey,
  findRelevanceRuleByConfigKey,
  type PersistedRelevanceRule,
  setEndpointDefaultCategory,
  setSourceDefaultCategory,
  updateCategory,
  updateRelevanceRule,
} from './repository.ts';

export interface SourceDefaultConfiguration {
  readonly sourceConfigKey: string;
  readonly categoryConfigKey?: string;
}

export interface EndpointDefaultConfiguration extends SourceDefaultConfiguration {
  readonly endpointConfigKey: string;
}

export interface EditorialConfigurationDocument {
  readonly categories: readonly CategoryConfiguration[];
  readonly rules: readonly RelevanceRuleConfiguration[];
  readonly sourceDefaults: readonly SourceDefaultConfiguration[];
  readonly endpointDefaults: readonly EndpointDefaultConfiguration[];
}

export interface EditorialConfigurationApplyResult {
  readonly categoriesCreated: number;
  readonly categoriesUpdated: number;
  readonly rulesCreated: number;
  readonly rulesUpdated: number;
  readonly sourceDefaultsEdited: number;
  readonly endpointDefaultsEdited: number;
}

export class EditorialConfigurationError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Invalid editorial configuration: ${reason}`);
    this.name = 'EditorialConfigurationError';
    this.reason = reason;
  }
}

export function parseEditorialConfigurationDocument(
  json: string,
): Readonly<EditorialConfigurationDocument> {
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    throw new EditorialConfigurationError('invalid_json');
  }
  return normalizeEditorialConfigurationDocument(input);
}

export function normalizeEditorialConfigurationDocument(
  input: unknown,
): Readonly<EditorialConfigurationDocument> {
  const document = record(input, 'document');
  exactKeys(
    document,
    ['categories', 'rules', 'sourceDefaults', 'endpointDefaults'],
    'document',
  );
  const categories = normalizedArray(
    document.categories,
    'categories',
    normalizeCategory,
  );
  const rules = normalizedArray(document.rules, 'rules', normalizeRule);
  const sourceDefaults = normalizedArray(
    document.sourceDefaults,
    'sourceDefaults',
    normalizeSourceDefault,
  );
  const endpointDefaults = normalizedArray(
    document.endpointDefaults,
    'endpointDefaults',
    normalizeEndpointDefault,
  );
  requireUnique(
    categories,
    (category) => category.configKey,
    'duplicate_category_config_key',
  );
  requireUnique(rules, (rule) => rule.configKey, 'duplicate_rule_config_key');
  requireUnique(
    sourceDefaults,
    (entry) => entry.sourceConfigKey,
    'duplicate_source_default_target',
  );
  requireUnique(
    endpointDefaults,
    (entry) => `${entry.sourceConfigKey}\u0000${entry.endpointConfigKey}`,
    'duplicate_endpoint_default_target',
  );
  return Object.freeze({ categories, rules, sourceDefaults, endpointDefaults });
}

export async function applyEditorialConfiguration(
  database: Database,
  document: Readonly<EditorialConfigurationDocument>,
): Promise<Readonly<EditorialConfigurationApplyResult>> {
  return database.transaction(async (transaction) => {
    await validateReferences(transaction, document);
    let categoriesCreated = 0;
    let categoriesUpdated = 0;
    let rulesCreated = 0;
    let rulesUpdated = 0;

    for (const category of document.categories) {
      const existing = await findCategoryByConfigKey(
        transaction,
        category.configKey,
      );
      if (existing === undefined) {
        await createCategory(transaction, category);
        categoriesCreated += 1;
      } else if (existing.displayName !== category.displayName) {
        await updateCategory(transaction, category.configKey, category);
        categoriesUpdated += 1;
      }
    }
    for (const rule of document.rules) {
      const existing = await findRelevanceRuleByConfigKey(
        transaction,
        rule.configKey,
      );
      if (existing === undefined) {
        await createRelevanceRule(transaction, rule);
        rulesCreated += 1;
      } else if (!sameRule(existing, rule)) {
        await updateRelevanceRule(transaction, rule.configKey, rule);
        rulesUpdated += 1;
      }
    }
    for (const entry of document.sourceDefaults) {
      const source = await requireSource(transaction, entry.sourceConfigKey);
      await setSourceDefaultCategory(
        transaction,
        source.id,
        entry.categoryConfigKey,
      );
    }
    for (const entry of document.endpointDefaults) {
      const source = await requireSource(transaction, entry.sourceConfigKey);
      const endpoint = await requireEndpoint(
        transaction,
        source,
        entry.endpointConfigKey,
      );
      await setEndpointDefaultCategory(
        transaction,
        endpoint.id,
        entry.categoryConfigKey,
      );
    }
    return Object.freeze({
      categoriesCreated,
      categoriesUpdated,
      rulesCreated,
      rulesUpdated,
      sourceDefaultsEdited: document.sourceDefaults.length,
      endpointDefaultsEdited: document.endpointDefaults.length,
    });
  });
}

async function validateReferences(
  executor: QueryExecutor,
  document: Readonly<EditorialConfigurationDocument>,
): Promise<void> {
  const requestedCategories = new Set(
    document.categories.map((category) => category.configKey),
  );
  const categoryKeys = new Set<string>();
  for (const rule of document.rules) {
    if (rule.sourceConfigKey !== undefined)
      await requireSource(executor, rule.sourceConfigKey);
    if (rule.categoryConfigKey !== undefined)
      categoryKeys.add(rule.categoryConfigKey);
  }
  for (const entry of document.sourceDefaults) {
    await requireSource(executor, entry.sourceConfigKey);
    if (entry.categoryConfigKey !== undefined)
      categoryKeys.add(entry.categoryConfigKey);
  }
  for (const entry of document.endpointDefaults) {
    const source = await requireSource(executor, entry.sourceConfigKey);
    await requireEndpoint(executor, source, entry.endpointConfigKey);
    if (entry.categoryConfigKey !== undefined)
      categoryKeys.add(entry.categoryConfigKey);
  }
  for (const categoryKey of categoryKeys) {
    if (requestedCategories.has(categoryKey)) continue;
    if ((await findCategoryByConfigKey(executor, categoryKey)) === undefined) {
      throw new EditorialConfigurationError('referenced_category_not_found');
    }
  }
}

async function requireSource(
  executor: QueryExecutor,
  configKey: string,
): Promise<PersistedSource> {
  const source = await findSourceByConfigKey(executor, configKey);
  if (source === undefined) {
    throw new EditorialConfigurationError('referenced_source_not_found');
  }
  return source;
}

async function requireEndpoint(
  executor: QueryExecutor,
  source: PersistedSource,
  configKey: string,
): Promise<PersistedSourceEndpoint> {
  const endpoint = await findSourceEndpointBySourceAndConfigKey(
    executor,
    source.id,
    configKey,
  );
  if (endpoint === undefined) {
    throw new EditorialConfigurationError('referenced_endpoint_not_found');
  }
  return endpoint;
}

function normalizeCategory(
  input: unknown,
  index: number,
): CategoryConfiguration {
  const entry = record(input, `categories[${String(index)}]`);
  exactKeys(
    entry,
    ['configKey', 'displayName'],
    `categories[${String(index)}]`,
  );
  return normalizeCategoryConfiguration(entry);
}

function normalizeRule(
  input: unknown,
  index: number,
): RelevanceRuleConfiguration {
  const field = `rules[${String(index)}]`;
  const entry = record(input, field);
  exactKeys(
    entry,
    [
      'configKey',
      'predicateType',
      'pattern',
      'action',
      'priority',
      'enabled',
      'reason',
    ],
    field,
    ['sourceConfigKey', 'categoryConfigKey'],
  );
  return normalizeRelevanceRuleConfiguration(entry);
}

function normalizeSourceDefault(
  input: unknown,
  index: number,
): SourceDefaultConfiguration {
  const field = `sourceDefaults[${String(index)}]`;
  const entry = record(input, field);
  exactKeys(entry, ['sourceConfigKey', 'categoryConfigKey'], field);
  return Object.freeze({
    sourceConfigKey: configKey(
      entry.sourceConfigKey,
      `${field}.sourceConfigKey`,
    ),
    ...defaultCategory(entry.categoryConfigKey, `${field}.categoryConfigKey`),
  });
}

function normalizeEndpointDefault(
  input: unknown,
  index: number,
): EndpointDefaultConfiguration {
  const field = `endpointDefaults[${String(index)}]`;
  const entry = record(input, field);
  exactKeys(
    entry,
    ['sourceConfigKey', 'endpointConfigKey', 'categoryConfigKey'],
    field,
  );
  return Object.freeze({
    sourceConfigKey: configKey(
      entry.sourceConfigKey,
      `${field}.sourceConfigKey`,
    ),
    endpointConfigKey: configKey(
      entry.endpointConfigKey,
      `${field}.endpointConfigKey`,
    ),
    ...defaultCategory(entry.categoryConfigKey, `${field}.categoryConfigKey`),
  });
}

function defaultCategory(
  value: unknown,
  field: string,
): Pick<SourceDefaultConfiguration, 'categoryConfigKey'> {
  if (value === null) return {};
  return { categoryConfigKey: configKey(value, field) };
}

function configKey(value: unknown, field: string): string {
  try {
    return normalizeConfigKey(value);
  } catch {
    throw new EditorialConfigurationError(`${field}_invalid_config_key`);
  }
}

function normalizedArray<T>(
  value: unknown,
  field: string,
  normalize: (input: unknown, index: number) => T,
): readonly T[] {
  if (!Array.isArray(value))
    throw new EditorialConfigurationError(`${field}_must_be_an_array`);
  return Object.freeze(value.map(normalize));
}

function requireUnique<T>(
  entries: readonly T[],
  key: (entry: T) => string,
  reason: string,
): void {
  const keys = new Set<string>();
  for (const entry of entries) {
    const value = key(entry);
    if (keys.has(value)) throw new EditorialConfigurationError(reason);
    keys.add(value);
  }
}

function record(input: unknown, field: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new EditorialConfigurationError(`${field}_must_be_an_object`);
  }
  return input as Record<string, unknown>;
}

function exactKeys(
  input: Record<string, unknown>,
  required: readonly string[],
  field: string,
  optional: readonly string[] = [],
): void {
  if (required.some((key) => !(key in input))) {
    throw new EditorialConfigurationError(`${field}_missing_required_field`);
  }
  const allowed = new Set([...required, ...optional]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new EditorialConfigurationError(`${field}_unknown_field`);
  }
}

function sameRule(
  existing: PersistedRelevanceRule,
  requested: RelevanceRuleConfiguration,
): boolean {
  return (
    existing.predicateType === requested.predicateType &&
    existing.pattern === requested.pattern &&
    existing.action === requested.action &&
    existing.priority === requested.priority &&
    existing.enabled === requested.enabled &&
    existing.reason === requested.reason &&
    existing.sourceConfigKey === requested.sourceConfigKey &&
    existing.categoryTarget?.configKey === requested.categoryConfigKey
  );
}
