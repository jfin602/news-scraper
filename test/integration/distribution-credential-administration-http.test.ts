import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DistributionCredentialAdministrationError,
  type AdminDistributionCredentialReadModel,
  type DistributionCredentialAdministrationService,
} from '../../src/admin/distribution-credential-administration.ts';
import {
  ADMIN_REQUEST_HEADER,
  ADMIN_REQUEST_HEADER_VALUE,
} from '../../src/app/web/admin-api-security.ts';
import { createWebApp } from '../../src/app/web/create-app.ts';
import { registerDistributionCredentialAdministrationRoutes } from '../../src/app/web/distribution-credential-administration-router.ts';
import { startWebServer } from '../../src/app/web/server.ts';

const plaintextToken = `nsd1.l${'a'.repeat(22)}.${'b'.repeat(43)}`;
const successorToken = `nsd1.l${'c'.repeat(22)}.${'d'.repeat(43)}`;
const credential = metadata(`l${'a'.repeat(22)}`);
const successor = metadata(`l${'c'.repeat(22)}`);

describe('Distribution credential administration HTTP API', () => {
  it('returns plaintext only from create and rotate, never from metadata routes', async () => {
    const calls: unknown[][] = [];
    await withAdminServer(mockService(calls), async (baseUrl) => {
      const create = await request(
        baseUrl,
        '/distribution-credentials',
        'POST',
        {
          label: 'Integration sync',
        },
      );
      const created = await create.text();
      assert.equal(create.status, 201);
      assert.deepEqual(JSON.parse(created), { credential, plaintextToken });
      assert.match(created, new RegExp(plaintextToken, 'u'));
      assert.doesNotMatch(created, /verifier|digest|authorization/i);

      const list = await fetch(`${baseUrl}/admin/api/distribution-credentials`);
      const listed = await list.text();
      assert.equal(list.status, 200);
      assert.deepEqual(JSON.parse(listed), {
        credentials: [credential, successor],
      });
      assert.doesNotMatch(listed, /nsd1|verifier|digest/i);
      assertAdminSecurityHeaders(list);

      const rotate = await request(
        baseUrl,
        `/distribution-credentials/${credential.lookupId}/rotate`,
        'POST',
        { label: 'Replacement sync' },
      );
      const rotated = await rotate.text();
      assert.equal(rotate.status, 200);
      assert.deepEqual(JSON.parse(rotated), {
        credential: successor,
        plaintextToken: successorToken,
      });
      assert.notEqual(successorToken, plaintextToken);

      const revoke = await request(
        baseUrl,
        `/distribution-credentials/${credential.lookupId}/revoke`,
        'POST',
        {},
      );
      const revoked = await revoke.text();
      assert.equal(revoke.status, 200);
      assert.deepEqual(JSON.parse(revoked), { credential });
      assert.doesNotMatch(revoked, /nsd1|verifier|digest/i);

      const recovery = await fetch(
        `${baseUrl}/admin/api/distribution-credentials/${credential.lookupId}`,
      );
      assert.equal(recovery.status, 404);
      assert.deepEqual(await recovery.json(), { error: 'not_found' });
    });
    assert.deepEqual(calls, [
      ['create', { label: 'Integration sync' }],
      ['list'],
      ['rotate', credential.lookupId, { label: 'Replacement sync' }],
      ['revoke', credential.lookupId],
    ]);
  });

  it('keeps credential controls inside the existing admin perimeter and bounded error vocabulary', async () => {
    let calls = 0;
    await withAdminServer(
      mockService([], () => {
        calls += 1;
      }),
      async (baseUrl) => {
        const path = '/admin/api/distribution-credentials';
        const missingIntegrity = await fetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${plaintextToken}`,
          },
          body: '{}',
        });
        assert.equal(missingIntegrity.status, 403);
        assert.deepEqual(await missingIntegrity.json(), {
          error: 'request_integrity_required',
        });
        const nonJson = await fetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: {
            [ADMIN_REQUEST_HEADER]: ADMIN_REQUEST_HEADER_VALUE,
            'Content-Type': 'text/plain',
          },
          body: 'x',
        });
        assert.equal(nonJson.status, 415);
        const invalid = await request(
          baseUrl,
          path.slice('/admin/api'.length),
          'POST',
          { label: 'token-like-nsd1.secret' },
        );
        assert.equal(invalid.status, 400);
        const body = await invalid.text();
        assert.deepEqual(JSON.parse(body), { error: 'invalid_request' });
        assert.doesNotMatch(body, /token-like|nsd1|verifier/i);
        assert.equal(invalid.headers.get('access-control-allow-origin'), null);
      },
    );
    assert.equal(calls, 1);
  });

  it('does not expose credential routes when administration is disabled', async () => {
    const server = await startWebServer(
      createWebApp({
        readiness: { checkReady: async () => true },
        publicFeed: { read: async () => undefined },
      }),
      { host: '127.0.0.1', port: 0 },
    );
    try {
      const response = await fetch(
        `http://${server.host}:${String(server.port)}/admin/api/distribution-credentials`,
      );
      assert.equal(response.status, 404);
    } finally {
      await server.close();
    }
  });
});

function metadata(lookupId: string): AdminDistributionCredentialReadModel {
  return Object.freeze({
    lookupId,
    label: 'Integration sync',
    capability: 'distribution:read',
    expiresAt: null,
    revokedAt: null,
    rotationSuccessorLookupId: null,
    lifecycleState: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}
function mockService(
  calls: unknown[][],
  onCreate: () => void = () => undefined,
): DistributionCredentialAdministrationService {
  return {
    async listCredentials() {
      calls.push(['list']);
      return [credential, successor];
    },
    async createCredential(input) {
      calls.push(['create', input]);
      onCreate();
      if ((input as { label?: string }).label?.includes('token-like'))
        throw new DistributionCredentialAdministrationError('invalid_request');
      return { credential, plaintextToken };
    },
    async revokeCredential(lookupId) {
      calls.push(['revoke', lookupId]);
      return credential;
    },
    async rotateCredential(lookupId, input) {
      calls.push(['rotate', lookupId, input]);
      return { credential: successor, plaintextToken: successorToken };
    },
  };
}
async function withAdminServer(
  service: DistributionCredentialAdministrationService,
  work: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = await startWebServer(
    createWebApp(
      {
        readiness: { checkReady: async () => true },
        publicFeed: { read: async () => undefined },
      },
      {
        adminEnabled: true,
        registerAdminApiRoutes:
          registerDistributionCredentialAdministrationRoutes(service),
      },
    ),
    { host: '127.0.0.1', port: 0 },
  );
  try {
    await work(`http://${server.host}:${String(server.port)}`);
  } finally {
    await server.close();
  }
}
function request(
  baseUrl: string,
  path: string,
  method: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${baseUrl}/admin/api${path}`, {
    method,
    headers: {
      [ADMIN_REQUEST_HEADER]: ADMIN_REQUEST_HEADER_VALUE,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
function assertAdminSecurityHeaders(response: Response): void {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
}
