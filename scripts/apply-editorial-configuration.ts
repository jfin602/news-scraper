import { readFile } from 'node:fs/promises';

import {
  DatabaseConfigError,
  parseDatabaseConfig,
} from '../src/database/config.ts';
import {
  createDatabase,
  DatabaseRuntimeError,
} from '../src/database/database.ts';
import {
  applyEditorialConfiguration,
  EditorialConfigurationError,
  parseEditorialConfigurationDocument,
} from '../src/collection/relevance/operator-configuration.ts';
import { ConfigurationPersistenceError } from '../src/publication/repository.ts';

if (process.argv.length !== 3) {
  console.error('Usage: apply-editorial-configuration.ts <editorial.json>');
  process.exitCode = 1;
} else {
  let database: ReturnType<typeof createDatabase> | undefined;
  try {
    const document = parseEditorialConfigurationDocument(
      await readFile(process.argv[2] as string, 'utf8'),
    );
    database = createDatabase(parseDatabaseConfig(process.env));
    const result = await applyEditorialConfiguration(database, document);
    console.log(
      `Editorial configuration applied: categories_created=${String(result.categoriesCreated)}, categories_updated=${String(result.categoriesUpdated)}, rules_created=${String(result.rulesCreated)}, rules_updated=${String(result.rulesUpdated)}, source_defaults_edited=${String(result.sourceDefaultsEdited)}, endpoint_defaults_edited=${String(result.endpointDefaultsEdited)}.`,
    );
  } catch (error) {
    console.error(editorialFailureMessage(error));
    process.exitCode = 1;
  } finally {
    if (database !== undefined) {
      try {
        await database.close();
      } catch {
        console.error('Database close failed.');
        process.exitCode = 1;
      }
    }
  }
}

function editorialFailureMessage(error: unknown): string {
  if (error instanceof EditorialConfigurationError) return error.message;
  if (error instanceof DatabaseConfigError)
    return 'Database configuration failed.';
  if (error instanceof DatabaseRuntimeError)
    return 'Database operation failed.';
  if (error instanceof ConfigurationPersistenceError) {
    return 'Editorial configuration persistence failed.';
  }
  if (error instanceof Error && 'code' in error) {
    return 'Editorial configuration file could not be read.';
  }
  return 'Editorial configuration apply failed.';
}
