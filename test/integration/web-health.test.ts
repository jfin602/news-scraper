import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createWebApp } from '../../src/app/web/create-app.ts';
import { startWebServer, type WebServer } from '../../src/app/web/server.ts';

describe('Web health endpoints', () => {
  let webServer: WebServer;
  let ready = true;
  let checks = 0;
  before(async () => {
    webServer = await startWebServer(
      createWebApp({
        async checkReady() {
          checks += 1;
          return ready;
        },
      }),
      {
        host: '127.0.0.1',
        port: 0,
      },
    );
  });

  it('keeps liveness independent from readiness', async () => {
    ready = false;
    const beforeChecks = checks;
    const response = await fetch(
      `http://${webServer.host}:${webServer.port}/health/live`,
    );
    assert.equal(response.status, 200);
    assert.equal(checks, beforeChecks);
    ready = true;
  });

  it('reports unavailable dependencies safely', async () => {
    ready = false;
    const response = await fetch(
      `http://${webServer.host}:${webServer.port}/health/ready`,
    );
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      status: 'not_ready',
      role: 'web',
    });
    ready = true;
  });
  after(async () => webServer.close());

  for (const expectation of [
    { path: '/health/live', body: { status: 'ok', role: 'web' } },
    { path: '/health/ready', body: { status: 'ready', role: 'web' } },
  ]) {
    it(`${expectation.path} returns its deterministic contract`, async () => {
      const response = await fetch(
        `http://${webServer.host}:${webServer.port}${expectation.path}`,
      );
      assert.equal(response.status, 200);
      assert.match(
        response.headers.get('content-type') ?? '',
        /^application\/json/,
      );
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), expectation.body);
    });
  }
});
