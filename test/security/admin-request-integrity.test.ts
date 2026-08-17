import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Router } from 'express';

import {
  ADMIN_REQUEST_HEADER,
  ADMIN_REQUEST_HEADER_VALUE,
} from '../../src/app/web/admin-router.ts';
import {
  createWebApp,
  type WebDependencies,
} from '../../src/app/web/create-app.ts';
import { startWebServer } from '../../src/app/web/server.ts';

const dependencies: WebDependencies = {
  readiness: { checkReady: async () => true },
  publicFeed: { read: async () => undefined },
};

test('nested duplicate JSON keys and handler failures cannot mutate or disclose details', async () => {
  let mutations = 0;
  const secret = 'postgresql://operator:security-secret@db.invalid/news';
  const server = await startWebServer(
    createWebApp(dependencies, {
      adminEnabled: true,
      registerAdminApiRoutes(router: Router) {
        router.post('/mutation', (_request, response) => {
          mutations += 1;
          throw new Error(`SELECT private_data; ${secret}`);
          void response;
        });
      },
    }),
    { host: '127.0.0.1', port: 0 },
  );
  const baseUrl = `http://${server.host}:${String(server.port)}`;

  try {
    const duplicate = await fetch(`${baseUrl}/admin/api/mutation`, {
      method: 'POST',
      headers: adminJsonHeaders(),
      body: '{"operation":"safe","nested":{"role":"reader","role":"admin"}}',
    });
    assert.equal(duplicate.status, 400);
    assert.deepEqual(await duplicate.json(), { error: 'invalid_json' });
    assert.equal(mutations, 0);

    const malformed = await fetch(`${baseUrl}/admin/api/mutation`, {
      method: 'POST',
      headers: adminJsonHeaders(),
      body: '{"operation":',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: 'invalid_json' });
    assert.equal(mutations, 0);

    const missingIntegrity = await fetch(`${baseUrl}/admin/api/mutation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(missingIntegrity.status, 403);
    assert.deepEqual(await missingIntegrity.json(), {
      error: 'request_integrity_required',
    });
    assert.equal(mutations, 0);

    const handlerFailure = await fetch(`${baseUrl}/admin/api/mutation`, {
      method: 'POST',
      headers: adminJsonHeaders(),
      body: '{}',
    });
    const body = await handlerFailure.text();
    assert.equal(handlerFailure.status, 500);
    assert.deepEqual(JSON.parse(body), { error: 'internal_error' });
    assert.doesNotMatch(
      body,
      /postgresql|security-secret|SELECT|private_data/u,
    );
    assert.equal(mutations, 1);
  } finally {
    await server.close();
  }
});

function adminJsonHeaders(): Record<string, string> {
  return {
    [ADMIN_REQUEST_HEADER]: ADMIN_REQUEST_HEADER_VALUE,
    'Content-Type': 'application/json',
  };
}
