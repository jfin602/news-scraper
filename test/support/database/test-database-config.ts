export const TEST_DATABASE_ADMIN_URL_ENV =
  'NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL';

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
