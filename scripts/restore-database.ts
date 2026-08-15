import { restorePostgresBackup } from '../src/database/backup.ts';
import { parseDatabaseConfig } from '../src/database/config.ts';

const TARGET_ENV = 'NEWS_SCRAPER_RESTORE_DATABASE_URL';
try {
  const archivePath = process.argv[2];
  if (archivePath === undefined || archivePath.trim() === '')
    throw new Error('backup archive argument is required.');
  const result = await restorePostgresBackup({
    sourceDatabase: parseDatabaseConfig(process.env),
    targetDatabase: parseDatabaseConfig({
      NEWS_SCRAPER_DATABASE_URL: process.env[TARGET_ENV],
    }),
    archivePath,
  });
  console.log(
    `Backup restored and verified into the explicit target (${Math.round(result.durationMilliseconds)} ms).`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Restore failed.');
  process.exitCode = 1;
}
