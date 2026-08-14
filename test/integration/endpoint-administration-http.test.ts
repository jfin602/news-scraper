import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EndpointAdministrationError,
  type AdminEndpointReadModel,
  type EndpointAdministrationService,
} from '../../src/admin/endpoint-administration.ts';
import {
  ADMIN_REQUEST_HEADER,
  ADMIN_REQUEST_HEADER_VALUE,
} from '../../src/app/web/admin-router.ts';
import { createWebApp } from '../../src/app/web/create-app.ts';
import { registerEndpointAdministrationRoutes } from '../../src/app/web/endpoint-administration-router.ts';
import { startWebServer } from '../../src/app/web/server.ts';

const endpoint: AdminEndpointReadModel = Object.freeze({
  sourceConfigKey: 'journal',
  configKey: 'main_feed',
  endpointUrl: 'https://feeds.example.com/rss.xml',
  endpointType: 'rss_atom',
  approvalState: 'approved',
  lifecycleState: 'active',
  operationalState: 'enabled',
  pollIntervalSeconds: 300,
  endpointDomainRules: Object.freeze([]),
  inheritsSourceDomainPolicy: true,
  defaultCategory: null,
});

describe('Endpoint administration HTTP API', () => {
  it('routes Source-scoped reads and every endpoint command', async () => {
    const calls: string[] = [];
    const service = mockService(calls);
    await withAdminServer(service, async (baseUrl) => {
      const list = await fetch(
        `${baseUrl}/api/admin/sources/journal/endpoints`,
      );
      assert.equal(list.status, 200);
      assert.deepEqual(await list.json(), { endpoints: [endpoint] });

      const detail = await fetch(
        `${baseUrl}/api/admin/sources/journal/endpoints/main_feed`,
      );
      assert.equal(detail.status, 200);
      assert.deepEqual(await detail.json(), { endpoint });

      const commands: readonly [string, string, number][] = [
        [
          '/api/admin/sources/journal/endpoints',
          JSON.stringify({ command: 'create' }),
          201,
        ],
        [
          '/api/admin/sources/journal/endpoints/main_feed/configuration',
          JSON.stringify({ command: 'configuration' }),
          200,
        ],
        [
          '/api/admin/sources/journal/endpoints/main_feed/approval',
          JSON.stringify({ command: 'approval' }),
          200,
        ],
        [
          '/api/admin/sources/journal/endpoints/main_feed/operational-state',
          JSON.stringify({ command: 'operational' }),
          200,
        ],
        [
          '/api/admin/sources/journal/endpoints/main_feed/lifecycle',
          JSON.stringify({ command: 'lifecycle' }),
          200,
        ],
      ];
      for (const [path, body, status] of commands) {
        const response = await fetch(`${baseUrl}${path}`, {
          method: path.endsWith('/endpoints') ? 'POST' : 'PUT',
          headers: adminHeaders(),
          body,
        });
        assert.equal(response.status, status, path);
        assert.deepEqual(await response.json(), { endpoint });
      }
    });

    assert.deepEqual(calls, [
      'list:journal',
      'get:journal:main_feed',
      'create:journal:create',
      'configuration:journal:main_feed:configuration',
      'approval:journal:main_feed:approval',
      'operational:journal:main_feed:operational',
      'lifecycle:journal:main_feed:lifecycle',
    ]);
  });

  it('keeps P3 request integrity in front of endpoint mutations', async () => {
    const calls: string[] = [];
    await withAdminServer(mockService(calls), async (baseUrl) => {
      const path = `${baseUrl}/api/admin/sources/journal/endpoints`;
      const withoutHeader = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(withoutHeader.status, 403);

      const malformed = await fetch(path, {
        method: 'POST',
        headers: adminHeaders(),
        body: '{',
      });
      assert.equal(malformed.status, 400);
      assert.deepEqual(await malformed.json(), { error: 'invalid_json' });
    });
    assert.deepEqual(calls, []);
  });

  it('maps relationship/conflict errors safely and exposes no DELETE endpoint', async () => {
    const service = mockService([]);
    service.getEndpoint = async () => {
      throw new EndpointAdministrationError('endpoint_not_found');
    };
    service.createEndpoint = async () => {
      throw new EndpointAdministrationError('endpoint_config_key_conflict');
    };
    await withAdminServer(service, async (baseUrl) => {
      const missing = await fetch(
        `${baseUrl}/api/admin/sources/wrong/endpoints/main_feed`,
      );
      assert.equal(missing.status, 404);
      assert.deepEqual(await missing.json(), { error: 'endpoint_not_found' });

      const conflict = await fetch(
        `${baseUrl}/api/admin/sources/journal/endpoints`,
        {
          method: 'POST',
          headers: adminHeaders(),
          body: '{}',
        },
      );
      assert.equal(conflict.status, 409);
      assert.deepEqual(await conflict.json(), {
        error: 'endpoint_config_key_conflict',
      });

      const deletion = await fetch(
        `${baseUrl}/api/admin/sources/journal/endpoints/main_feed`,
        {
          method: 'DELETE',
          headers: adminHeaders(),
          body: '{}',
        },
      );
      assert.equal(deletion.status, 404);
      assert.deepEqual(await deletion.json(), { error: 'not_found' });
    });
  });
});

function mockService(calls: string[]): EndpointAdministrationService {
  return {
    async listEndpoints(sourceKey) {
      calls.push(`list:${String(sourceKey)}`);
      return [endpoint];
    },
    async getEndpoint(sourceKey, endpointKey) {
      calls.push(`get:${String(sourceKey)}:${String(endpointKey)}`);
      return endpoint;
    },
    async createEndpoint(sourceKey, input) {
      calls.push(
        `create:${String(sourceKey)}:${String((input as { command?: unknown }).command)}`,
      );
      return endpoint;
    },
    async replaceEndpointConfiguration(sourceKey, endpointKey, input) {
      calls.push(
        `configuration:${String(sourceKey)}:${String(endpointKey)}:${String((input as { command?: unknown }).command)}`,
      );
      return endpoint;
    },
    async setEndpointApproval(sourceKey, endpointKey, input) {
      calls.push(
        `approval:${String(sourceKey)}:${String(endpointKey)}:${String((input as { command?: unknown }).command)}`,
      );
      return endpoint;
    },
    async setEndpointOperationalState(sourceKey, endpointKey, input) {
      calls.push(
        `operational:${String(sourceKey)}:${String(endpointKey)}:${String((input as { command?: unknown }).command)}`,
      );
      return endpoint;
    },
    async setEndpointLifecycle(sourceKey, endpointKey, input) {
      calls.push(
        `lifecycle:${String(sourceKey)}:${String(endpointKey)}:${String((input as { command?: unknown }).command)}`,
      );
      return endpoint;
    },
  };
}

async function withAdminServer(
  service: EndpointAdministrationService,
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
        registerAdminApiRoutes: registerEndpointAdministrationRoutes(service),
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

function adminHeaders(): Record<string, string> {
  return {
    [ADMIN_REQUEST_HEADER]: ADMIN_REQUEST_HEADER_VALUE,
    'Content-Type': 'application/json',
  };
}
