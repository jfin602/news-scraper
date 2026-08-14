import type { Database, QueryExecutor } from '../database/database.ts';
import {
  normalizeCategoryConfiguration,
  normalizeMutableCategoryConfiguration,
  normalizeMutableRelevanceRuleConfiguration,
  normalizeRelevanceRuleConfiguration,
} from '../collection/relevance/configuration.ts';
import {
  createCategory as insertCategory,
  createRelevanceRule as insertRelevanceRule,
  deleteCategory as removeCategory,
  deleteRelevanceRule as removeRelevanceRule,
  findCategoryByConfigKey,
  findRelevanceRuleByConfigKey,
  listCategories as readCategories,
  listRelevanceRules as readRelevanceRules,
  setRelevanceRuleEnabled,
  updateCategory as saveCategory,
  updateRelevanceRule as saveRelevanceRule,
  type PersistedCategory,
  type PersistedRelevanceRule,
} from '../collection/relevance/repository.ts';
import { ConfigurationValidationError } from '../publication/configuration.ts';
import { ConfigurationPersistenceError } from '../publication/repository.ts';
import { normalizeConfigKey } from '../sources/configuration.ts';

export type EditorialAdministrationErrorCode =
  | 'category_config_key_conflict'
  | 'category_in_use'
  | 'category_not_found'
  | 'invalid_request'
  | 'relevance_rule_action_target_incompatible'
  | 'relevance_rule_category_not_found'
  | 'relevance_rule_config_key_conflict'
  | 'relevance_rule_in_use'
  | 'relevance_rule_not_found'
  | 'relevance_rule_source_not_found';

export class EditorialAdministrationError extends Error {
  readonly code: EditorialAdministrationErrorCode;

  constructor(code: EditorialAdministrationErrorCode) {
    super(`Editorial administration command failed: ${code}`);
    this.name = 'EditorialAdministrationError';
    this.code = code;
  }
}

export interface AdminCategoryReadModel {
  readonly configKey: string;
  readonly displayName: string;
}

export interface AdminRelevanceRuleReadModel {
  readonly configKey: string;
  readonly predicateType: PersistedRelevanceRule['predicateType'];
  readonly pattern: string;
  readonly action: PersistedRelevanceRule['action'];
  readonly priority: number;
  readonly enabled: boolean;
  readonly reason: string;
  readonly sourceConfigKey?: string;
  readonly categoryConfigKey?: string;
}

export interface EditorialAdministrationService {
  listCategories(): Promise<readonly AdminCategoryReadModel[]>;
  createCategory(input: unknown): Promise<AdminCategoryReadModel>;
  getCategory(categoryConfigKey: unknown): Promise<AdminCategoryReadModel>;
  updateCategory(
    categoryConfigKey: unknown,
    input: unknown,
  ): Promise<AdminCategoryReadModel>;
  deleteCategory(categoryConfigKey: unknown): Promise<void>;
  listRelevanceRules(): Promise<readonly AdminRelevanceRuleReadModel[]>;
  createRelevanceRule(input: unknown): Promise<AdminRelevanceRuleReadModel>;
  getRelevanceRule(
    ruleConfigKey: unknown,
  ): Promise<AdminRelevanceRuleReadModel>;
  updateRelevanceRule(
    ruleConfigKey: unknown,
    input: unknown,
  ): Promise<AdminRelevanceRuleReadModel>;
  setRelevanceRuleEnabled(
    ruleConfigKey: unknown,
    input: unknown,
  ): Promise<AdminRelevanceRuleReadModel>;
  deleteRelevanceRule(ruleConfigKey: unknown): Promise<void>;
}

export function createEditorialAdministrationService(
  database: Database,
): EditorialAdministrationService {
  return Object.freeze({
    async listCategories() {
      return Object.freeze(
        (await readCategories(database)).map(mapCategoryReadModel),
      );
    },

    async createCategory(input: unknown) {
      const category = normalizeCategoryCreate(input);
      try {
        return await database.transaction(async (transaction) =>
          mapCategoryReadModel(await insertCategory(transaction, category)),
        );
      } catch (error) {
        throw translateCategoryPersistenceError(error);
      }
    },

    async getCategory(categoryConfigKey: unknown) {
      const key = normalizeCategoryKey(categoryConfigKey);
      const category = await findCategoryByConfigKey(database, key);
      if (category === undefined) {
        throw new EditorialAdministrationError('category_not_found');
      }
      return mapCategoryReadModel(category);
    },

    async updateCategory(categoryConfigKey: unknown, input: unknown) {
      const key = normalizeCategoryKey(categoryConfigKey);
      const category = normalizeCategoryUpdate(input);
      try {
        return await database.transaction(async (transaction) => {
          await requireCategory(transaction, key);
          return mapCategoryReadModel(
            await saveCategory(transaction, key, category),
          );
        });
      } catch (error) {
        throw translateCategoryPersistenceError(error);
      }
    },

    async deleteCategory(categoryConfigKey: unknown) {
      const key = normalizeCategoryKey(categoryConfigKey);
      try {
        await database.transaction(async (transaction) => {
          const category = await removeCategory(transaction, key);
          if (category === undefined) {
            throw new EditorialAdministrationError('category_not_found');
          }
        });
      } catch (error) {
        throw translateCategoryPersistenceError(error);
      }
    },

    async listRelevanceRules() {
      return Object.freeze(
        (await readRelevanceRules(database)).map(mapRelevanceRuleReadModel),
      );
    },

    async createRelevanceRule(input: unknown) {
      const rule = normalizeRelevanceRuleCreate(input);
      try {
        return await database.transaction(async (transaction) =>
          mapRelevanceRuleReadModel(
            await insertRelevanceRule(transaction, rule),
          ),
        );
      } catch (error) {
        throw translateRelevancePersistenceError(error);
      }
    },

    async getRelevanceRule(ruleConfigKey: unknown) {
      const key = normalizeRuleKey(ruleConfigKey);
      const rule = await findRelevanceRuleByConfigKey(database, key);
      if (rule === undefined) {
        throw new EditorialAdministrationError('relevance_rule_not_found');
      }
      return mapRelevanceRuleReadModel(rule);
    },

    async updateRelevanceRule(ruleConfigKey: unknown, input: unknown) {
      const key = normalizeRuleKey(ruleConfigKey);
      const rule = normalizeRelevanceRuleUpdate(input);
      try {
        return await database.transaction(async (transaction) => {
          await requireRelevanceRule(transaction, key);
          return mapRelevanceRuleReadModel(
            await saveRelevanceRule(transaction, key, rule),
          );
        });
      } catch (error) {
        throw translateRelevancePersistenceError(error);
      }
    },

    async setRelevanceRuleEnabled(ruleConfigKey: unknown, input: unknown) {
      const key = normalizeRuleKey(ruleConfigKey);
      const record = exactRecord(input, ['enabled']);
      if (typeof record.enabled !== 'boolean') {
        throw new EditorialAdministrationError('invalid_request');
      }
      try {
        return await database.transaction(async (transaction) => {
          await requireRelevanceRule(transaction, key);
          return mapRelevanceRuleReadModel(
            await setRelevanceRuleEnabled(transaction, key, record.enabled),
          );
        });
      } catch (error) {
        throw translateRelevancePersistenceError(error);
      }
    },

    async deleteRelevanceRule(ruleConfigKey: unknown) {
      const key = normalizeRuleKey(ruleConfigKey);
      try {
        await database.transaction(async (transaction) => {
          const deleted = await removeRelevanceRule(transaction, key);
          if (!deleted) {
            throw new EditorialAdministrationError('relevance_rule_not_found');
          }
        });
      } catch (error) {
        throw translateRelevancePersistenceError(error);
      }
    },
  });
}

function normalizeCategoryCreate(input: unknown) {
  const record = exactRecord(input, ['configKey', 'displayName']);
  return normalizeAdminValue(() => normalizeCategoryConfiguration(record));
}

function normalizeCategoryUpdate(input: unknown) {
  const record = exactRecord(input, ['displayName']);
  return normalizeAdminValue(() =>
    normalizeMutableCategoryConfiguration(record),
  );
}

const RELEVANCE_RULE_MUTABLE_KEYS = [
  'predicateType',
  'pattern',
  'action',
  'priority',
  'enabled',
  'reason',
] as const;

function normalizeRelevanceRuleCreate(input: unknown) {
  const record = exactRecord(
    input,
    ['configKey', ...RELEVANCE_RULE_MUTABLE_KEYS],
    ['sourceConfigKey', 'categoryConfigKey'],
  );
  return normalizeRelevanceRuleAdminValue(() =>
    normalizeRelevanceRuleConfiguration(record),
  );
}

function normalizeRelevanceRuleUpdate(input: unknown) {
  const record = exactRecord(
    input,
    [...RELEVANCE_RULE_MUTABLE_KEYS],
    ['sourceConfigKey', 'categoryConfigKey'],
  );
  return normalizeRelevanceRuleAdminValue(() =>
    normalizeMutableRelevanceRuleConfiguration(record),
  );
}

function normalizeRelevanceRuleAdminValue<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof EditorialAdministrationError) throw error;
    if (error instanceof ConfigurationValidationError) {
      if (
        error.field === 'relevanceRule.categoryConfigKey' &&
        (error.reason === 'required_for_categorize' ||
          error.reason === 'only_allowed_for_categorize')
      ) {
        throw new EditorialAdministrationError(
          'relevance_rule_action_target_incompatible',
        );
      }
      throw new EditorialAdministrationError('invalid_request');
    }
    throw error;
  }
}

async function requireCategory(
  executor: QueryExecutor,
  configKey: string,
): Promise<PersistedCategory> {
  const category = await findCategoryByConfigKey(executor, configKey);
  if (category === undefined) {
    throw new EditorialAdministrationError('category_not_found');
  }
  return category;
}

async function requireRelevanceRule(
  executor: QueryExecutor,
  configKey: string,
): Promise<PersistedRelevanceRule> {
  const rule = await findRelevanceRuleByConfigKey(executor, configKey);
  if (rule === undefined) {
    throw new EditorialAdministrationError('relevance_rule_not_found');
  }
  return rule;
}

function mapCategoryReadModel(
  category: PersistedCategory,
): AdminCategoryReadModel {
  return Object.freeze({
    configKey: category.configKey,
    displayName: category.displayName,
  });
}

function mapRelevanceRuleReadModel(
  rule: PersistedRelevanceRule,
): AdminRelevanceRuleReadModel {
  return Object.freeze({
    configKey: rule.configKey,
    predicateType: rule.predicateType,
    pattern: rule.pattern,
    action: rule.action,
    priority: rule.priority,
    enabled: rule.enabled,
    reason: rule.reason,
    ...(rule.sourceConfigKey === undefined
      ? {}
      : { sourceConfigKey: rule.sourceConfigKey }),
    ...(rule.categoryTarget === undefined
      ? {}
      : { categoryConfigKey: rule.categoryTarget.configKey }),
  });
}

function normalizeCategoryKey(input: unknown): string {
  return normalizeAdminValue(() => normalizeConfigKey(input));
}

function normalizeRuleKey(input: unknown): string {
  return normalizeAdminValue(() => normalizeConfigKey(input));
}

function normalizeAdminValue<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof EditorialAdministrationError) throw error;
    if (error instanceof ConfigurationValidationError) {
      throw new EditorialAdministrationError('invalid_request');
    }
    throw error;
  }
}

function exactRecord(
  input: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new EditorialAdministrationError('invalid_request');
  }
  const record = input as Record<string, unknown>;
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  if (
    requiredKeys.some((key) => !(key in record)) ||
    Object.keys(record).some((key) => !allowed.has(key))
  ) {
    throw new EditorialAdministrationError('invalid_request');
  }
  return record;
}

function translateCategoryPersistenceError(
  error: unknown,
): EditorialAdministrationError | never {
  if (error instanceof EditorialAdministrationError) return error;
  if (postgresError(error, '23505', 'categories_config_key_unique')) {
    return new EditorialAdministrationError('category_config_key_conflict');
  }
  if (postgresError(error, '23503')) {
    return new EditorialAdministrationError('category_in_use');
  }
  throw error;
}

function translateRelevancePersistenceError(
  error: unknown,
): EditorialAdministrationError | never {
  if (error instanceof EditorialAdministrationError) return error;
  if (postgresError(error, '23505', 'relevance_rules_config_key_unique')) {
    return new EditorialAdministrationError(
      'relevance_rule_config_key_conflict',
    );
  }
  if (postgresError(error, '23503')) {
    return new EditorialAdministrationError('relevance_rule_in_use');
  }
  if (error instanceof ConfigurationPersistenceError) {
    if (error.reason === 'relevance rule source scope not found') {
      return new EditorialAdministrationError(
        'relevance_rule_source_not_found',
      );
    }
    if (error.reason === 'category not found') {
      return new EditorialAdministrationError(
        'relevance_rule_category_not_found',
      );
    }
    if (error.reason === 'invalid relevance rule enabled state') {
      return new EditorialAdministrationError('invalid_request');
    }
  }
  throw error;
}

function postgresError(
  error: unknown,
  code: string,
  constraint?: string,
): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if (Reflect.get(error, 'code') !== code) return false;
  return (
    constraint === undefined || Reflect.get(error, 'constraint') === constraint
  );
}
