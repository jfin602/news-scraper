import { randomUUID } from 'node:crypto';

import type { QueryExecutor } from '../../database/database.ts';
import {
  ConfigurationPersistenceError,
  requiredBoolean,
  requiredString,
  requiredTimestamp,
} from '../../publication/repository.ts';
import { normalizeConfigKey } from '../../sources/configuration.ts';
import {
  normalizeCategoryConfiguration,
  normalizeMutableCategoryConfiguration,
  normalizeMutableRelevanceRuleConfiguration,
  normalizeRelevanceRuleConfiguration,
  type CategoryConfiguration,
  type CategoryTargetIdentity,
  type RelevanceAction,
  type RelevancePredicateType,
  type RelevanceRuleConfiguration,
  type RelevanceRuleScope,
} from './configuration.ts';

export interface PersistedCategory extends CategoryTargetIdentity {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PersistedRelevanceRule {
  readonly id: string;
  readonly configKey: string;
  readonly predicateType: RelevancePredicateType;
  readonly pattern: string;
  readonly action: RelevanceAction;
  readonly priority: number;
  readonly enabled: boolean;
  readonly reason: string;
  readonly scope: RelevanceRuleScope;
  readonly sourceId?: string;
  readonly sourceConfigKey?: string;
  readonly categoryTarget?: CategoryTargetIdentity;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EffectiveRelevanceConfigurationSnapshot {
  readonly sourceId: string;
  readonly sourceEndpointId: string;
  readonly rules: readonly PersistedRelevanceRule[];
  readonly sourceDefaultCategory?: CategoryTargetIdentity;
  readonly endpointDefaultCategory?: CategoryTargetIdentity;
}

interface CategoryRow {
  readonly id: unknown;
  readonly config_key: unknown;
  readonly display_name: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

interface RuleRow {
  readonly id: unknown;
  readonly config_key: unknown;
  readonly source_id: unknown;
  readonly source_config_key: unknown;
  readonly predicate_type: unknown;
  readonly pattern: unknown;
  readonly action: unknown;
  readonly priority: unknown;
  readonly enabled: unknown;
  readonly reason: unknown;
  readonly category_config_key: unknown;
  readonly category_display_name: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

interface SnapshotDefaultsRow {
  readonly source_default_config_key: unknown;
  readonly source_default_display_name: unknown;
  readonly endpoint_default_config_key: unknown;
  readonly endpoint_default_display_name: unknown;
}

const CATEGORY_COLUMNS = `id, config_key, display_name, created_at, updated_at`;
const RULE_COLUMNS = `
  r.id, r.config_key, r.source_id, source.config_key AS source_config_key,
  r.predicate_type, r.pattern, r.action, r.priority, r.enabled, r.reason,
  category.config_key AS category_config_key,
  category.display_name AS category_display_name,
  r.created_at, r.updated_at`;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export async function createCategory(
  executor: QueryExecutor,
  input: unknown,
): Promise<PersistedCategory> {
  return insertCategory(executor, normalizeCategoryConfiguration(input));
}

export async function findCategoryByConfigKey(
  executor: QueryExecutor,
  configKey: unknown,
): Promise<PersistedCategory | undefined> {
  const result = await executor.query<CategoryRow>(
    `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE config_key = $1`,
    [normalizeConfigKey(configKey)],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapCategoryRow(row);
}

export async function updateCategory(
  executor: QueryExecutor,
  configKey: unknown,
  input: unknown,
): Promise<PersistedCategory> {
  const categoryKey = normalizeConfigKey(configKey);
  const category = normalizeMutableCategoryConfiguration(input);
  const result = await executor.query<CategoryRow>(
    `UPDATE categories
     SET display_name = $2, updated_at = now()
     WHERE config_key = $1
     RETURNING ${CATEGORY_COLUMNS}`,
    [categoryKey, category.displayName],
  );
  return mapCategoryRow(requiredRow(result.rows, 'category update'));
}

export async function listCategories(
  executor: QueryExecutor,
): Promise<readonly PersistedCategory[]> {
  const result = await executor.query<CategoryRow>(
    `SELECT ${CATEGORY_COLUMNS} FROM categories ORDER BY config_key ASC`,
  );
  return Object.freeze(result.rows.map(mapCategoryRow));
}

export async function deleteCategory(
  executor: QueryExecutor,
  configKey: unknown,
): Promise<PersistedCategory | undefined> {
  const result = await executor.query<CategoryRow>(
    `DELETE FROM categories
     WHERE config_key = $1
     RETURNING ${CATEGORY_COLUMNS}`,
    [normalizeConfigKey(configKey)],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapCategoryRow(row);
}

export async function createRelevanceRule(
  executor: QueryExecutor,
  input: unknown,
): Promise<PersistedRelevanceRule> {
  const rule = normalizeRelevanceRuleConfiguration(input);
  return insertRelevanceRule(executor, rule);
}

export async function findRelevanceRuleByConfigKey(
  executor: QueryExecutor,
  configKey: unknown,
): Promise<PersistedRelevanceRule | undefined> {
  const result = await executor.query<RuleRow>(
    `${ruleSelect()} WHERE r.config_key = $1`,
    [normalizeConfigKey(configKey)],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapRuleRow(row);
}

export async function updateRelevanceRule(
  executor: QueryExecutor,
  configKey: unknown,
  input: unknown,
): Promise<PersistedRelevanceRule> {
  const ruleKey = normalizeConfigKey(configKey);
  const rule = normalizeMutableRelevanceRuleConfiguration(input);
  const sourceId = await resolveSourceId(executor, rule.sourceConfigKey);
  const categoryId = await resolveCategoryId(executor, rule.categoryConfigKey);
  const result = await executor.query<{ readonly id: unknown }>(
    `UPDATE relevance_rules
     SET source_id = $2, predicate_type = $3, pattern = $4, action = $5,
         category_id = $6, priority = $7, enabled = $8, reason = $9,
         updated_at = now()
     WHERE config_key = $1
     RETURNING id`,
    [
      ruleKey,
      sourceId,
      rule.predicateType,
      rule.pattern,
      rule.action,
      categoryId,
      rule.priority,
      rule.enabled,
      rule.reason,
    ],
  );
  requiredRow(result.rows, 'relevance rule update');
  return requireRelevanceRule(executor, ruleKey, 'relevance rule update');
}

export async function setRelevanceRuleEnabled(
  executor: QueryExecutor,
  configKey: unknown,
  enabled: unknown,
): Promise<PersistedRelevanceRule> {
  if (typeof enabled !== 'boolean') {
    throw new ConfigurationPersistenceError(
      'invalid relevance rule enabled state',
    );
  }
  const ruleKey = normalizeConfigKey(configKey);
  const result = await executor.query<{ readonly id: unknown }>(
    `UPDATE relevance_rules
     SET enabled = $2, updated_at = now()
     WHERE config_key = $1
     RETURNING id`,
    [ruleKey, enabled],
  );
  requiredRow(result.rows, 'relevance rule enabled update');
  return requireRelevanceRule(
    executor,
    ruleKey,
    'relevance rule enabled update',
  );
}

export async function listRelevanceRules(
  executor: QueryExecutor,
): Promise<readonly PersistedRelevanceRule[]> {
  const result = await executor.query<RuleRow>(
    `${ruleSelect()} ORDER BY r.config_key ASC`,
  );
  return Object.freeze(result.rows.map(mapRuleRow));
}

export async function setSourceDefaultCategory(
  executor: QueryExecutor,
  sourceId: unknown,
  categoryConfigKey: unknown | undefined,
): Promise<CategoryTargetIdentity | undefined> {
  const resolvedSourceId = requiredUuid(sourceId, 'source id');
  const category = await resolveCategory(executor, categoryConfigKey);
  const result = await executor.query<{ readonly id: unknown }>(
    `UPDATE sources SET default_category_id = $2 WHERE id = $1 RETURNING id`,
    [resolvedSourceId, category?.id ?? null],
  );
  requiredRow(result.rows, 'source default category update');
  return category === undefined ? undefined : categoryIdentity(category);
}

export async function setEndpointDefaultCategory(
  executor: QueryExecutor,
  sourceEndpointId: unknown,
  categoryConfigKey: unknown | undefined,
): Promise<CategoryTargetIdentity | undefined> {
  const endpointId = requiredUuid(sourceEndpointId, 'source endpoint id');
  const category = await resolveCategory(executor, categoryConfigKey);
  const result = await executor.query<{ readonly id: unknown }>(
    `UPDATE source_endpoints
     SET default_category_id = $2
     WHERE id = $1
     RETURNING id`,
    [endpointId, category?.id ?? null],
  );
  requiredRow(result.rows, 'endpoint default category update');
  return category === undefined ? undefined : categoryIdentity(category);
}

export async function loadEffectiveRelevanceConfiguration(
  executor: QueryExecutor,
  sourceId: unknown,
  sourceEndpointId: unknown,
): Promise<EffectiveRelevanceConfigurationSnapshot | undefined> {
  const resolvedSourceId = requiredUuid(sourceId, 'source id');
  const endpointId = requiredUuid(sourceEndpointId, 'source endpoint id');
  const defaults = await executor.query<SnapshotDefaultsRow>(
    `SELECT
       source_category.config_key AS source_default_config_key,
       source_category.display_name AS source_default_display_name,
       endpoint_category.config_key AS endpoint_default_config_key,
       endpoint_category.display_name AS endpoint_default_display_name
     FROM sources source
     JOIN source_endpoints endpoint
       ON endpoint.source_id = source.id
     LEFT JOIN categories source_category
       ON source_category.id = source.default_category_id
     LEFT JOIN categories endpoint_category
       ON endpoint_category.id = endpoint.default_category_id
     WHERE source.id = $1 AND endpoint.id = $2`,
    [resolvedSourceId, endpointId],
  );
  const defaultsRow = defaults.rows[0];
  if (defaultsRow === undefined) return undefined;
  const rules = await executor.query<RuleRow>(
    `${ruleSelect()}
     WHERE r.enabled = TRUE AND (r.source_id IS NULL OR r.source_id = $1)
     ORDER BY r.config_key ASC`,
    [resolvedSourceId],
  );
  return freezeSnapshot({
    sourceId: resolvedSourceId,
    sourceEndpointId: endpointId,
    rules: rules.rows.map(mapRuleRow),
    ...optionalSnapshotCategories(defaultsRow),
  });
}

async function insertCategory(
  executor: QueryExecutor,
  category: Readonly<CategoryConfiguration>,
): Promise<PersistedCategory> {
  const result = await executor.query<CategoryRow>(
    `INSERT INTO categories (id, config_key, display_name)
     VALUES ($1, $2, $3)
     RETURNING ${CATEGORY_COLUMNS}`,
    [randomUUID(), category.configKey, category.displayName],
  );
  return mapCategoryRow(requiredRow(result.rows, 'category insert'));
}

async function insertRelevanceRule(
  executor: QueryExecutor,
  rule: Readonly<RelevanceRuleConfiguration>,
): Promise<PersistedRelevanceRule> {
  const sourceId = await resolveSourceId(executor, rule.sourceConfigKey);
  const categoryId = await resolveCategoryId(executor, rule.categoryConfigKey);
  const result = await executor.query<{ readonly id: unknown }>(
    `INSERT INTO relevance_rules (
       id, config_key, source_id, predicate_type, pattern, action,
       category_id, priority, enabled, reason
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      randomUUID(),
      rule.configKey,
      sourceId,
      rule.predicateType,
      rule.pattern,
      rule.action,
      categoryId,
      rule.priority,
      rule.enabled,
      rule.reason,
    ],
  );
  requiredRow(result.rows, 'relevance rule insert');
  return requireRelevanceRule(
    executor,
    rule.configKey,
    'relevance rule insert',
  );
}

async function requireRelevanceRule(
  executor: QueryExecutor,
  configKey: string,
  operation: string,
): Promise<PersistedRelevanceRule> {
  const rule = await findRelevanceRuleByConfigKey(executor, configKey);
  if (rule === undefined) throw new ConfigurationPersistenceError(operation);
  return rule;
}

async function resolveSourceId(
  executor: QueryExecutor,
  configKey: string | undefined,
): Promise<string | null> {
  if (configKey === undefined) return null;
  const result = await executor.query<{ readonly id: unknown }>(
    'SELECT id FROM sources WHERE config_key = $1',
    [configKey],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new ConfigurationPersistenceError(
      'relevance rule source scope not found',
    );
  }
  return requiredUuid(row.id, 'source id');
}

async function resolveCategoryId(
  executor: QueryExecutor,
  configKey: string | undefined,
): Promise<string | null> {
  const category = await resolveCategory(executor, configKey);
  return category?.id ?? null;
}

async function resolveCategory(
  executor: QueryExecutor,
  configKey: unknown | undefined,
): Promise<PersistedCategory | undefined> {
  if (configKey === undefined) return undefined;
  const category = await findCategoryByConfigKey(executor, configKey);
  if (category === undefined) {
    throw new ConfigurationPersistenceError('category not found');
  }
  return category;
}

function ruleSelect(): string {
  return `SELECT ${RULE_COLUMNS} FROM relevance_rules r
    LEFT JOIN sources source ON source.id = r.source_id
    LEFT JOIN categories category ON category.id = r.category_id`;
}

function mapCategoryRow(row: CategoryRow): PersistedCategory {
  try {
    return Object.freeze({
      id: requiredUuid(row.id, 'category id'),
      configKey: normalizeConfigKey(row.config_key),
      displayName: requiredString(row.display_name),
      createdAt: requiredTimestamp(row.created_at),
      updatedAt: requiredTimestamp(row.updated_at),
    });
  } catch {
    throw new ConfigurationPersistenceError(
      'database returned invalid category',
    );
  }
}

function mapRuleRow(row: RuleRow): PersistedRelevanceRule {
  try {
    const sourceId = nullableUuid(row.source_id, 'relevance rule source id');
    const sourceConfigKey = nullableConfigKey(row.source_config_key);
    if ((sourceId === undefined) !== (sourceConfigKey === undefined))
      throw new Error();
    const categoryTarget = nullableCategoryIdentity(
      row.category_config_key,
      row.category_display_name,
    );
    const action = relevanceAction(row.action);
    if ((action === 'categorize') !== (categoryTarget !== undefined))
      throw new Error();
    return Object.freeze({
      id: requiredUuid(row.id, 'relevance rule id'),
      configKey: normalizeConfigKey(row.config_key),
      predicateType: relevancePredicateType(row.predicate_type),
      pattern: requiredString(row.pattern),
      action,
      priority: requiredInteger(row.priority, 'relevance rule priority'),
      enabled: requiredBoolean(row.enabled),
      reason: requiredString(row.reason),
      scope: sourceId === undefined ? 'installation' : 'source',
      ...(sourceId === undefined ? {} : { sourceId }),
      ...(sourceConfigKey === undefined ? {} : { sourceConfigKey }),
      ...(categoryTarget === undefined ? {} : { categoryTarget }),
      createdAt: requiredTimestamp(row.created_at),
      updatedAt: requiredTimestamp(row.updated_at),
    });
  } catch {
    throw new ConfigurationPersistenceError(
      'database returned invalid relevance rule',
    );
  }
}

function nullableCategoryIdentity(
  configKey: unknown,
  displayName: unknown,
): CategoryTargetIdentity | undefined {
  if (configKey === null && displayName === null) return undefined;
  return Object.freeze({
    configKey: normalizeConfigKey(configKey),
    displayName: requiredString(displayName),
  });
}

function categoryIdentity(category: PersistedCategory): CategoryTargetIdentity {
  return Object.freeze({
    configKey: category.configKey,
    displayName: category.displayName,
  });
}

function freezeSnapshot(input: {
  sourceId: string;
  sourceEndpointId: string;
  rules: readonly PersistedRelevanceRule[];
  sourceDefaultCategory?: CategoryTargetIdentity;
  endpointDefaultCategory?: CategoryTargetIdentity;
}): EffectiveRelevanceConfigurationSnapshot {
  return Object.freeze({
    sourceId: input.sourceId,
    sourceEndpointId: input.sourceEndpointId,
    rules: Object.freeze([...input.rules]),
    ...(input.sourceDefaultCategory === undefined
      ? {}
      : { sourceDefaultCategory: input.sourceDefaultCategory }),
    ...(input.endpointDefaultCategory === undefined
      ? {}
      : { endpointDefaultCategory: input.endpointDefaultCategory }),
  });
}

function optionalSnapshotCategories(
  row: SnapshotDefaultsRow,
): Pick<
  EffectiveRelevanceConfigurationSnapshot,
  'sourceDefaultCategory' | 'endpointDefaultCategory'
> {
  const sourceDefaultCategory = nullableCategoryIdentity(
    row.source_default_config_key,
    row.source_default_display_name,
  );
  const endpointDefaultCategory = nullableCategoryIdentity(
    row.endpoint_default_config_key,
    row.endpoint_default_display_name,
  );
  return {
    ...(sourceDefaultCategory === undefined ? {} : { sourceDefaultCategory }),
    ...(endpointDefaultCategory === undefined
      ? {}
      : { endpointDefaultCategory }),
  };
}

function relevancePredicateType(value: unknown): RelevancePredicateType {
  if (
    value === 'title_contains' ||
    value === 'summary_contains' ||
    value === 'source_category_equals'
  ) {
    return value;
  }
  throw new Error();
}

function relevanceAction(value: unknown): RelevanceAction {
  if (value === 'include' || value === 'exclude' || value === 'categorize') {
    return value;
  }
  throw new Error();
}

function nullableConfigKey(value: unknown): string | undefined {
  return value === null ? undefined : normalizeConfigKey(value);
}

function nullableUuid(value: unknown, field: string): string | undefined {
  return value === null ? undefined : requiredUuid(value, field);
}

function requiredUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ConfigurationPersistenceError(`invalid ${field}`);
  }
  return value;
}

function requiredInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new ConfigurationPersistenceError(`invalid ${field}`);
  }
  return value;
}

function requiredRow<T>(rows: readonly T[], operation: string): T {
  const row = rows[0];
  if (row === undefined) throw new ConfigurationPersistenceError(operation);
  return row;
}
