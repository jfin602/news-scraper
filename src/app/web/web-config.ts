import { isIP } from 'node:net';

import {
  parseRuntimeConfig,
  RuntimeConfigError,
  type RuntimeConfig,
} from '../../shared/runtime-config.ts';

const hostnamePattern =
  /^(?=.{1,253}$)(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)*[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i;

export interface WebConfig extends RuntimeConfig {
  readonly host: string;
  readonly port: number;
  readonly adminEnabled: boolean;
}

export function parseWebConfig(
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<WebConfig> {
  const common = parseRuntimeConfig(environment);
  const host = environment.NEWS_SCRAPER_WEB_HOST ?? '127.0.0.1';
  const portText = environment.NEWS_SCRAPER_WEB_PORT;
  const adminEnabled = parseAdminEnabled(
    environment.NEWS_SCRAPER_ADMIN_ENABLED,
  );

  if (
    host !== host.trim() ||
    (isIP(host) === 0 && !hostnamePattern.test(host))
  ) {
    throw new RuntimeConfigError(
      'NEWS_SCRAPER_WEB_HOST',
      'must be a non-blank IP address or hostname',
    );
  }

  const port = portText === undefined ? 3000 : Number(portText);
  if (portText === '' || !Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new RuntimeConfigError(
      'NEWS_SCRAPER_WEB_PORT',
      'must be an integer from 0 through 65535',
    );
  }

  return Object.freeze({ ...common, host, port, adminEnabled });
}

function parseAdminEnabled(value: string | undefined): boolean {
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  throw new RuntimeConfigError(
    'NEWS_SCRAPER_ADMIN_ENABLED',
    'must be true or false',
  );
}
