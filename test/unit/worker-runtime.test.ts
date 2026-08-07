import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { startWorkerRuntime } from '../../src/app/worker/runtime.ts';
import { parseRuntimeConfig } from '../../src/shared/runtime-config.ts';

describe('Worker runtime', () => {
  function dependency(ready = true) {
    let closeCalls = 0;
    return {
      async checkReady() {
        return ready;
      },
      async close() {
        closeCalls += 1;
      },
      get closeCalls() {
        return closeCalls;
      },
    };
  }
  it('initializes with common configuration and enters ready state', async () => {
    const config = parseRuntimeConfig({ NODE_ENV: 'test' });
    const runtime = await startWorkerRuntime(config, dependency());

    assert.equal(runtime.state, 'ready');
    assert.equal(runtime.config, config);
    await runtime.shutdown();
  });

  it('does not require Web-specific configuration', async () => {
    const runtime = await startWorkerRuntime(
      parseRuntimeConfig({}),
      dependency(),
    );

    assert.equal(runtime.state, 'ready');
    await runtime.shutdown();
  });

  it('remains active until explicit shutdown and then stops cleanly', async () => {
    const runtime = await startWorkerRuntime(
      parseRuntimeConfig({}),
      dependency(),
    );
    let stopped = false;
    void runtime.stopped.then(() => {
      stopped = true;
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(stopped, false);
    assert.equal(runtime.state, 'ready');

    await runtime.shutdown();
    await runtime.stopped;
    assert.equal(stopped, true);
    assert.equal(runtime.state, 'stopped');
  });

  it('makes concurrent and repeated shutdown requests idempotent', async () => {
    const database = dependency();
    const runtime = await startWorkerRuntime(parseRuntimeConfig({}), database);
    const first = runtime.shutdown();
    const second = runtime.shutdown();

    assert.equal(first, second);
    await Promise.all([first, second, runtime.shutdown()]);
    assert.equal(runtime.state, 'stopped');
    assert.equal(database.closeCalls, 1);
  });

  it('closes the database and does not create a ready runtime when validation fails', async () => {
    const database = dependency(false);
    await assert.rejects(startWorkerRuntime(parseRuntimeConfig({}), database));
    assert.equal(database.closeCalls, 1);
  });

  it('does not create a runtime when common configuration is invalid', async () => {
    let startupAttempted = false;

    await assert.rejects(async () => {
      const config = parseRuntimeConfig({ NODE_ENV: 'invalid' });
      startupAttempted = true;
      await startWorkerRuntime(config, dependency());
    });
    assert.equal(startupAttempted, false);
  });
});
