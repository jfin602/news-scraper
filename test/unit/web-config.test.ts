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
      },
    );
    assert.equal(parseWebConfig({ NEWS_SCRAPER_WEB_PORT: '0' }).port, 0);
  });

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
