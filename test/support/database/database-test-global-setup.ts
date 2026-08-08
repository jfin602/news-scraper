import { preflightTestDatabaseAdminCapabilities } from './test-database-config.ts';

export async function globalSetup(): Promise<void> {
  await preflightTestDatabaseAdminCapabilities();
}
