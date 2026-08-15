import path from 'node:path';

import { parseDatabaseConfig } from '../src/database/config.ts';
import { createDatabase } from '../src/database/database.ts';
import {
  discoverMigrations,
  inspectSchemaStatus,
} from '../src/database/migrations.ts';

try {
  const database = createDatabase(parseDatabaseConfig(process.env));
  try {
    const status = await inspectSchemaStatus(
      database,
      await discoverMigrations(path.resolve('migrations')),
    );
    process.stdout.write(`${JSON.stringify(status)}\n`);
    if (status.state === 'incompatible') process.exitCode = 1;
  } finally {
    await database.close();
  }
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ state: 'error', message: safeMessage(error) })}\n`,
  );
  process.exitCode = 1;
}

function safeMessage(error: unknown): string {
  if (
    error instanceof Error &&
    error.name === 'DatabaseConfigError' &&
    'variable' in error
  ) {
    return `${String(error.variable)} configuration is invalid or missing`;
  }
  return 'Schema status could not be determined';
}
