import { readFile } from 'node:fs/promises';
import { parseDatabaseConfig } from '../src/database/config.ts';
import { createPostgresBackup } from '../src/database/backup.ts';

try {
  const directory = requiredArgument(process.argv[2], 'backup directory');
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  const result = await createPostgresBackup({
    database: parseDatabaseConfig(process.env),
    outputDirectory: directory,
    projectVersion: packageJson.version,
  });
  console.log(
    `Backup created: ${result.archivePath} (${Math.round(result.durationMilliseconds)} ms).`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Backup failed.');
  process.exitCode = 1;
}

function requiredArgument(value: string | undefined, label: string): string {
  if (value === undefined || value.trim() === '')
    throw new Error(`${label} argument is required.`);
  return value;
}
