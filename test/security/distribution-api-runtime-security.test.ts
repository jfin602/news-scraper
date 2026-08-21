import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';

import express from 'express';

import { createDistributionApiRouter } from '../../src/app/web/distribution-api-router.ts';
import { createDistributionRequestContextResolver } from '../../src/app/web/distribution-request-context.ts';
import { startWebServer, type WebServer } from '../../src/app/web/server.ts';
import { createMachineRequestGuard } from '../../src/distribution/credentials/machine-request-guard.ts';

let server: WebServer;

beforeEach(async () => {
  await server?.close();
  const guard = createMachineRequestGuard({
    authenticator: {
      async authenticate() {
        return { outcome: 'unauthenticated' as const };
      },
    },
    policy: {
      authenticated: {
        maximumRequests: 1,
        windowMilliseconds: 60_000,
        maximumEntries: 10,
      },
      invalidAuthentication: {
        maximumRequests: 1,
        windowMilliseconds: 60_000,
        maximumEntries: 10,
      },
    },
  });
  const app = express();
  app.use(
    '/api/v1/distribution',
    createDistributionApiRouter({
      pageService: { read: async () => ({ kind: 'not_found' }) },
      requestGuard: guard,
      invalidAuthNetworkKey: createDistributionRequestContextResolver({
        trustedProxy: 'none',
        distributionTransport: 'local_http',
      }),
    }),
  );
  server = await startWebServer(app, { host: '127.0.0.1', port: 0 });
});

after(async () => server?.close());

test('untrusted forwarding headers cannot split the long-lived invalid-auth bucket', async () => {
  const baseUrl = `http://${server.host}:${String(server.port)}`;
  const first = await fetch(`${baseUrl}/api/v1/distribution/books`, {
    headers: {
      Authorization: 'Bearer malformed-a',
      'X-Forwarded-For': '198.51.100.1',
      'X-Forwarded-Proto': 'https',
    },
  });
  const spoofed = await fetch(`${baseUrl}/api/v1/distribution/books`, {
    headers: {
      Authorization: 'Bearer malformed-b',
      'X-Forwarded-For': '203.0.113.2',
      'X-Forwarded-Proto': 'https',
    },
  });
  assert.equal(first.status, 401);
  assert.equal(spoofed.status, 429);
  assert.equal(spoofed.headers.get('retry-after'), '60');
  assert.equal(spoofed.headers.get('access-control-allow-origin'), null);
});
