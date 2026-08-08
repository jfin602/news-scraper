import { Client } from 'pg';

export const TEST_DATABASE_ADMIN_URL_ENV =
  'NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL';

export interface TestDatabaseAdminCapabilities {
  readonly currentRole: string;
  readonly canCreateDatabase: boolean;
  readonly canSignalBackend: boolean;
}

export function readTestDatabaseAdminUrl(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const rawValue = environment[TEST_DATABASE_ADMIN_URL_ENV];

  if (rawValue === undefined || rawValue.trim() === '') {
    throw new Error(
      `${TEST_DATABASE_ADMIN_URL_ENV} is required for database tests.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(
      `${TEST_DATABASE_ADMIN_URL_ENV} must be a valid PostgreSQL URL.`,
    );
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(
      `${TEST_DATABASE_ADMIN_URL_ENV} must use the postgres or postgresql protocol.`,
    );
  }

  if (parsed.hostname === '') {
    throw new Error(`${TEST_DATABASE_ADMIN_URL_ENV} must include a hostname.`);
  }

  return rawValue;
}

export function assertTestDatabaseAdminCapabilities(
  capabilities: TestDatabaseAdminCapabilities,
): void {
  if (!capabilities.canCreateDatabase) {
    throw new Error(
      `${TEST_DATABASE_ADMIN_URL_ENV} role lacks CREATEDB capability required for disposable database tests.`,
    );
  }

  if (!capabilities.canSignalBackend) {
    throw new Error(
      `${TEST_DATABASE_ADMIN_URL_ENV} role lacks backend-signal capability required for forced disposable database cleanup.`,
    );
  }
}

export async function preflightTestDatabaseAdminCapabilities(
  adminUrl: string = readTestDatabaseAdminUrl(),
): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  let capabilities: TestDatabaseAdminCapabilities;

  try {
    await client.connect();
    const result = await client.query<TestDatabaseAdminCapabilities>(
      `SELECT current_user AS "currentRole",
              rolsuper OR rolcreatedb AS "canCreateDatabase",
              rolsuper OR pg_has_role(current_user, 'pg_signal_backend', 'member') AS "canSignalBackend"
         FROM pg_roles
        WHERE rolname = current_user`,
    );
    capabilities = result.rows[0] ?? failCapabilityInspection();
  } catch {
    throw new Error(
      `${TEST_DATABASE_ADMIN_URL_ENV} test-admin capability preflight could not be completed.`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }

  assertTestDatabaseAdminCapabilities(capabilities);
}

function failCapabilityInspection(): never {
  throw new Error(
    `${TEST_DATABASE_ADMIN_URL_ENV} test-admin capability preflight could not be completed.`,
  );
}
