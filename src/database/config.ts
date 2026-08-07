export const DATABASE_URL_ENV = 'NEWS_SCRAPER_DATABASE_URL';

export interface DatabaseConfig {
  readonly connectionString: string;
}

export class DatabaseConfigError extends Error {
  readonly variable: string;

  constructor(variable: string, reason: string) {
    super(`${variable}: ${reason}`);
    this.name = 'DatabaseConfigError';
    this.variable = variable;
  }
}

export function parseDatabaseConfig(
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<DatabaseConfig> {
  const connectionString = environment[DATABASE_URL_ENV];

  if (connectionString === undefined || connectionString.trim() === '') {
    throw new DatabaseConfigError(DATABASE_URL_ENV, 'is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new DatabaseConfigError(
      DATABASE_URL_ENV,
      'must be a valid PostgreSQL URL',
    );
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new DatabaseConfigError(
      DATABASE_URL_ENV,
      'must use the postgres or postgresql protocol',
    );
  }

  if (parsed.hostname === '') {
    throw new DatabaseConfigError(DATABASE_URL_ENV, 'must include a hostname');
  }

  return Object.freeze({ connectionString });
}
