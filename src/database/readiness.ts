import path from 'node:path';

import type { Database } from './database.ts';
import { discoverMigrations, inspectSchemaStatus } from './migrations.ts';

export interface DatabaseDependency {
  checkReady(): Promise<boolean>;
  close(): Promise<void>;
}

export function createDatabaseDependency(
  database: Database,
  migrationDirectory = path.resolve('migrations'),
): DatabaseDependency {
  return {
    async checkReady() {
      await database.ping();
      const migrations = await discoverMigrations(migrationDirectory);
      const status = await inspectSchemaStatus(database, migrations);
      return status.state === 'current';
    },
    close: () => database.close(),
  };
}
