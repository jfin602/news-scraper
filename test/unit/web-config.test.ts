import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseWebConfig } from '../../src/app/web/web-config.ts';
import { RuntimeConfigError } from '../../src/shared/runtime-config.ts';

describe('parseWebConfig', () => {
  it('uses safe local defaults and common runtime configuration', () => {
    assert.deepEqual(parseWebConfig({ NODE_ENV: 'test' }), {
      nodeEnv: 'test',
      host: '127.0.0.1',
      port: 3000,
      adminEnabled: false,
      trustedProxy: 'none',
      distributionTransport: 'local_http',
    });
  });

  it('accepts explicit host and port, including ephemeral port zero', () => {
    assert.deepEqual(
      parseWebConfig({
        NEWS_SCRAPER_WEB_HOST: 'localhost',
        NEWS_SCRAPER_WEB_PORT: '8123',
      }),
      {
        nodeEnv: 'development',
        host: 'localhost',
        port: 8123,
        adminEnabled: false,
        trustedProxy: 'none',
        distributionTransport: 'local_http',
      },
    );
    assert.equal(parseWebConfig({ NEWS_SCRAPER_WEB_PORT: '0' }).port, 0);
  });

  it('accepts only explicit true and false admin enablement values', () => {
    assert.equal(
      parseWebConfig({ NEWS_SCRAPER_ADMIN_ENABLED: 'true' }).adminEnabled,
      true,
    );
    assert.equal(
      parseWebConfig({ NEWS_SCRAPER_ADMIN_ENABLED: 'false' }).adminEnabled,
      false,
    );
  });

  it('requires one bounded trusted local proxy for production TLS termination', () => {
    assert.deepEqual(
      parseWebConfig({
        NODE_ENV: 'production',
        NEWS_SCRAPER_WEB_TRUSTED_PROXY: 'loopback',
        NEWS_SCRAPER_DISTRIBUTION_TRANSPORT: 'trusted_proxy_https',
      }),
      {
        nodeEnv: 'production',
        host: '127.0.0.1',
        port: 3000,
        adminEnabled: false,
        trustedProxy: 'loopback',
        distributionTransport: 'trusted_proxy_https',
      },
    );
    assertSafeError(
      () => parseWebConfig({ NODE_ENV: 'production' }),
      'NEWS_SCRAPER_DISTRIBUTION_TRANSPORT',
    );
    assertSafeError(
      () =>
        parseWebConfig({
          NODE_ENV: 'production',
          NEWS_SCRAPER_DISTRIBUTION_TRANSPORT: 'local_http',
        }),
      'NEWS_SCRAPER_DISTRIBUTION_TRANSPORT',
    );
    assertSafeError(
      () =>
        parseWebConfig({
          NEWS_SCRAPER_DISTRIBUTION_TRANSPORT: 'trusted_proxy_https',
        }),
      'NEWS_SCRAPER_WEB_TRUSTED_PROXY',
    );
  });

  for (const value of ['external', '127.0.0.1', ' loopback']) {
    it(`rejects unsupported proxy trust ${JSON.stringify(value)} safely`, () => {
      assertSafeError(
        () => parseWebConfig({ NEWS_SCRAPER_WEB_TRUSTED_PROXY: value }),
        'NEWS_SCRAPER_WEB_TRUSTED_PROXY',
      );
    });
  }

  for (const value of ['', 'TRUE', '1', 'yes', ' private-value ']) {
    it(`rejects malformed admin enablement ${JSON.stringify(value)} safely`, () => {
      assertSafeError(
        () => parseWebConfig({ NEWS_SCRAPER_ADMIN_ENABLED: value }),
        'NEWS_SCRAPER_ADMIN_ENABLED',
      );
    });
  }

  for (const port of ['-1', '65536', '1.5', 'not-a-number', '']) {
    it(`rejects invalid port ${JSON.stringify(port)} safely`, () => {
      assertSafeError(
        () => parseWebConfig({ NEWS_SCRAPER_WEB_PORT: port }),
        'NEWS_SCRAPER_WEB_PORT',
      );
    });
  }

  for (const host of ['', '   ', 'http://private.example']) {
    it(`rejects invalid host ${JSON.stringify(host)} safely`, () => {
      assertSafeError(
        () => parseWebConfig({ NEWS_SCRAPER_WEB_HOST: host }),
        'NEWS_SCRAPER_WEB_HOST',
      );
    });
  }

  it('returns an immutable composed configuration', () => {
    const config = parseWebConfig({});
    assert.equal(Object.isFrozen(config), true);
    assert.throws(() => Object.assign(config, { port: 4000 }), TypeError);
  });
});

function assertSafeError(action: () => unknown, variable: string): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof RuntimeConfigError);
    assert.equal(error.variable, variable);
    assert.ok(error.message.length < 120);
    assert.doesNotMatch(error.message, /private\.example|not-a-number/);
    return true;
  });
}
