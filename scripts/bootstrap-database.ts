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
  BootstrapDocumentError,
  bootstrapPublicationTree,
  parseBootstrapDocument,
} from '../src/publications/bootstrap.ts';
import { ConfigurationValidationError } from '../src/publications/configuration.ts';
import { ConfigurationPersistenceError } from '../src/publications/repository.ts';

if (process.argv.length !== 3) {
  console.error('Usage: bootstrap-database.ts <bootstrap.json>');
  process.exitCode = 1;
} else {
  let database: ReturnType<typeof createDatabase> | undefined;
  try {
    const document = parseBootstrapDocument(
      await readFile(process.argv[2] as string, 'utf8'),
    );
    database = createDatabase(parseDatabaseConfig(process.env));
    const result = await bootstrapPublicationTree(database, document);
    console.log(
      `Bootstrap complete: publication=${result.publicationCreated ? 'created' : 'existing'}, sources_created=${String(result.sourcesCreated)}, endpoints_created=${String(result.endpointsCreated)}.`,
    );
  } catch (error) {
    console.error(bootstrapFailureMessage(error));
    process.exitCode = 1;
  } finally {
    if (database !== undefined) {
      try {
        await database.close();
      } catch (error) {
        console.error(
          error instanceof Error ? error.message : 'Database close failed.',
        );
        process.exitCode = 1;
      }
    }
  }
}

function bootstrapFailureMessage(error: unknown): string {
  if (
    error instanceof BootstrapDocumentError ||
    error instanceof ConfigurationValidationError ||
    error instanceof DatabaseConfigError ||
    error instanceof DatabaseRuntimeError ||
    error instanceof ConfigurationPersistenceError
  ) {
    return error.message;
  }
  if (isFileSystemError(error)) return 'Bootstrap file could not be read.';
  return 'Bootstrap persistence failed.';
}

function isFileSystemError(
  error: unknown,
): error is NodeJS.ErrnoException & Error {
  return error instanceof Error && 'code' in error;
}
