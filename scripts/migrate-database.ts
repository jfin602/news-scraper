import { parseDatabaseConfig } from '../src/database/config.ts';
import { migrateDatabase } from '../src/database/migrations.ts';

try {
  const applied = await migrateDatabase(parseDatabaseConfig(process.env));
  console.log(
    applied.length === 0
      ? 'Database schema is current.'
      : `Applied ${applied.length} migration(s): ${applied.join(', ')}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Migration failed.');
  process.exitCode = 1;
}
