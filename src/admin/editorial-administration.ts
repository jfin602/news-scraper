import type { Database, QueryExecutor } from '../database/database.ts';
import { ConfigurationValidationError } from '../publication/configuration.ts';
import { normalizeConfigKey } from '../sources/configuration.ts';
import {
  createCategory as insertCategory,
  deleteCategory as removeCategory,
  findCategoryByConfigKey,
  listCategories as readCategories,
  updateCategory as saveCategory,
  type PersistedCategory,
} from '../collection/relevance/repository.ts';
import {
  normalizeCategoryConfiguration,
  normalizeMutableCategoryConfiguration,
} from '../collection/relevance/configuration.ts';

export type EditorialAdministrationErrorCode =
  | 'category_config_key_conflict'
  | 'category_in_use'
  | 'category_not_found'
  | 'invalid_request';

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

export interface EditorialAdministrationService {
  listCategories(): Promise<readonly AdminCategoryReadModel[]>;
  createCategory(input: unknown): Promise<AdminCategoryReadModel>;
  getCategory(categoryConfigKey: unknown): Promise<AdminCategoryReadModel>;
  updateCategory(
    categoryConfigKey: unknown,
    input: unknown,
  ): Promise<AdminCategoryReadModel>;
  deleteCategory(categoryConfigKey: unknown): Promise<void>;
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

function mapCategoryReadModel(
  category: PersistedCategory,
): AdminCategoryReadModel {
  return Object.freeze({
    configKey: category.configKey,
    displayName: category.displayName,
  });
}

function normalizeCategoryKey(input: unknown): string {
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
): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new EditorialAdministrationError('invalid_request');
  }
  const record = input as Record<string, unknown>;
  const allowed = new Set(requiredKeys);
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
