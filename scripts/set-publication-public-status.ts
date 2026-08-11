import {
  DatabaseConfigError,
  parseDatabaseConfig,
} from '../src/database/config.ts';
import {
  createDatabase,
  DatabaseRuntimeError,
} from '../src/database/database.ts';
import { ConfigurationValidationError } from '../src/publications/configuration.ts';
import {
  ConfigurationPersistenceError,
  setPublicationPublicStatus,
} from '../src/publications/repository.ts';

if (process.argv.length !== 4) {
  console.error(
    'Usage: set-publication-public-status.ts <publication-slug> <private|public>',
  );
  process.exitCode = 1;
} else {
  let database: ReturnType<typeof createDatabase> | undefined;
  try {
    const slug = process.argv[2] as string;
    const publicStatus = process.argv[3] as string;
    database = createDatabase(parseDatabaseConfig(process.env));
    const publication = await setPublicationPublicStatus(
      database,
      slug,
      publicStatus,
    );
    if (publication === undefined) {
      console.error('Publication not found.');
      process.exitCode = 1;
    } else {
      console.log(
        `Publication public status set: slug=${publication.slug}, public_status=${publication.publicStatus}.`,
      );
    }
  } catch (error) {
    console.error(publicStatusFailureMessage(error));
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

function publicStatusFailureMessage(error: unknown): string {
  if (error instanceof ConfigurationValidationError) {
    return 'Invalid publication public status.';
  }
  if (error instanceof DatabaseConfigError) {
    return 'Database configuration failed.';
  }
  if (error instanceof DatabaseRuntimeError) {
    return 'Database operation failed.';
  }
  if (error instanceof ConfigurationPersistenceError) {
    return 'Publication public-status update failed.';
  }
  return 'Publication public-status update failed.';
}
