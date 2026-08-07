import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseRuntimeConfig,
  RuntimeConfigError,
} from '../../src/shared/runtime-config.ts';

describe('parseRuntimeConfig', () => {
  it('defaults NODE_ENV to development', () => {
    assert.deepEqual(parseRuntimeConfig({}), { nodeEnv: 'development' });
  });

  for (const nodeEnv of ['development', 'test', 'production'] as const) {
    it(`accepts ${nodeEnv}`, () => {
      assert.deepEqual(parseRuntimeConfig({ NODE_ENV: nodeEnv }), { nodeEnv });
    });
  }

  it('returns an immutable result with only common configuration', () => {
    const config = parseRuntimeConfig({ NODE_ENV: 'test', WEB_PORT: 'secret' });

    assert.deepEqual(config, { nodeEnv: 'test' });
    assert.equal(Object.isFrozen(config), true);
    assert.throws(
      () => Object.assign(config, { nodeEnv: 'production' }),
      TypeError,
    );
  });

  it('rejects an unsupported NODE_ENV with a deterministic safe error', () => {
    const suppliedEnvironment = {
      NODE_ENV: 'unsupported-private-value',
      API_TOKEN: 'unrelated-secret',
    };

    assert.throws(
      () => parseRuntimeConfig(suppliedEnvironment),
      (error: unknown) => {
        assert.ok(error instanceof RuntimeConfigError);
        assert.equal(error.variable, 'NODE_ENV');
        assert.equal(
          error.message,
          'NODE_ENV: must be one of development, test, production',
        );
        assert.doesNotMatch(
          error.message,
          /unsupported-private-value|unrelated-secret/,
        );
        return true;
      },
    );
  });
});
