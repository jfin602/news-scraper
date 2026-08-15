import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EndpointAdministrationError,
  type AdminEndpointCheckNowReadModel,
  type AdminEndpointCollectionRunsReadModel,
  type AdminEndpointHealthReadModel,
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

const checkNow: AdminEndpointCheckNowReadModel = Object.freeze({
  disposition: 'queued',
  job: Object.freeze({
    id: 'b7687522-2ad6-4e76-96e2-457513c30736',
    triggerKind: 'manual',
    status: 'queued',
    availableAt: new Date('2026-08-13T12:00:00.000Z'),
    attemptNumber: 1,
  }),
});

const health: AdminEndpointHealthReadModel = Object.freeze({
  sourceConfigKey: 'journal',
  endpointConfigKey: 'main_feed',
  publicationActiveForCollection: true,
  sourceApprovalState: 'approved',
  sourceLifecycleState: 'active',
  sourceOperationalState: 'enabled',
  endpointApprovalState: 'approved',
  endpointLifecycleState: 'active',
  endpointOperationalState: 'enabled',
  derivedHealth: 'healthy',
  lastAttemptAt: new Date('2026-08-13T11:00:00.000Z'),
  lastSuccessAt: new Date('2026-08-13T11:00:00.000Z'),
  lastFailureAt: null,
  nextDueAt: new Date('2026-08-13T11:05:00.000Z'),
  cooldownUntil: null,
  consecutiveFailureCount: 0,
  pollIntervalSeconds: 300,
});

const recentRuns: AdminEndpointCollectionRunsReadModel = Object.freeze({
  sourceConfigKey: 'journal',
  endpointConfigKey: 'main_feed',
  limit: 5,
  runs: Object.freeze([]),
});

describe('Endpoint administration HTTP API', () => {
  it('serves the protected pure HTML draft preview without consulting endpoint services', async () => {
    const calls: string[] = [];
    await withAdminServer(mockService(calls), async (baseUrl) => {
      const path = `${baseUrl}/api/admin/html-listing/preview`;
      const valid = await fetch(path, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify(previewInput()),
      });
      assert.equal(valid.status, 200);
      assert.deepEqual(await valid.json(), {
        preview: {
          rows: [{ title: 'Example', url: '/story' }],
          diagnostics: null,
        },
      });

      const denied = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(previewInput()),
      });
      assert.equal(denied.status, 403);
      assert.deepEqual(await denied.json(), {
        error: 'request_integrity_required',
      });

      for (const body of [
        { ...previewInput(), unknown: true },
        { ...previewInput(), html: '<p>preview-secret-sentinel</p>' },
        { html: 'x'.repeat(41 * 1024), profile: previewInput().profile },
      ]) {
        const invalid = await fetch(path, {
          method: 'POST',
          headers: adminHeaders(),
          body: JSON.stringify(body),
        });
        assert.equal(invalid.status, 400);
        const text = await invalid.text();
        assert.deepEqual(JSON.parse(text), { error: 'invalid_request' });
        assert.doesNotMatch(text, /preview-secret-sentinel/u);
      }

      const duplicate = await fetch(path, {
        method: 'POST',
        headers: adminHeaders(),
        body: '{"html":"<p>first</p>","html":"<p>second</p>","profile":{}}',
      });
      assert.equal(duplicate.status, 400);
      assert.deepEqual(await duplicate.json(), { error: 'invalid_json' });
    });
    assert.deepEqual(calls, []);
  });

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

      const healthResponse = await fetch(
        `${baseUrl}/api/admin/sources/journal/endpoints/main_feed/health`,
      );
      assert.equal(healthResponse.status, 200);
      assert.deepEqual(await healthResponse.json(), {
        health: {
          ...health,
          lastAttemptAt: '2026-08-13T11:00:00.000Z',
          lastSuccessAt: '2026-08-13T11:00:00.000Z',
          nextDueAt: '2026-08-13T11:05:00.000Z',
        },
      });

      const runsResponse = await fetch(
        `${baseUrl}/api/admin/sources/journal/endpoints/main_feed/runs?limit=5`,
      );
      assert.equal(runsResponse.status, 200);
      assert.deepEqual(await runsResponse.json(), recentRuns);

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

      const checkNowResponse = await fetch(
        `${baseUrl}/api/admin/sources/journal/endpoints/main_feed/check-now`,
        {
          method: 'POST',
          headers: adminHeaders(),
          body: '{}',
        },
      );
      assert.equal(checkNowResponse.status, 202);
      assert.deepEqual(await checkNowResponse.json(), {
        disposition: 'queued',
        job: {
          ...checkNow.job,
          availableAt: '2026-08-13T12:00:00.000Z',
        },
      });
    });

    assert.deepEqual(calls, [
      'list:journal',
      'get:journal:main_feed',
      'health:journal:main_feed',
      'runs:journal:main_feed:5',
      'create:journal:create',
      'configuration:journal:main_feed:configuration',
      'approval:journal:main_feed:approval',
      'operational:journal:main_feed:operational',
      'lifecycle:journal:main_feed:lifecycle',
      'check-now:journal:main_feed',
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

      const checkNowWithoutHeader = await fetch(
        `${baseUrl}/api/admin/sources/journal/endpoints/main_feed/check-now`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      assert.equal(checkNowWithoutHeader.status, 403);
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
    service.checkNow = async () => {
      throw new EndpointAdministrationError(
        'endpoint_not_collectable',
        'endpoint_paused',
      );
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

      const notCollectable = await fetch(
        `${baseUrl}/api/admin/sources/journal/endpoints/main_feed/check-now`,
        {
          method: 'POST',
          headers: adminHeaders(),
          body: '{}',
        },
      );
      assert.equal(notCollectable.status, 409);
      assert.deepEqual(await notCollectable.json(), {
        error: 'endpoint_not_collectable',
        reason: 'endpoint_paused',
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
    async checkNow(sourceKey, endpointKey) {
      calls.push(`check-now:${String(sourceKey)}:${String(endpointKey)}`);
      return checkNow;
    },
    async getEndpointHealth(sourceKey, endpointKey) {
      calls.push(`health:${String(sourceKey)}:${String(endpointKey)}`);
      return health;
    },
    async listRecentRuns(sourceKey, endpointKey, limit) {
      calls.push(
        `runs:${String(sourceKey)}:${String(endpointKey)}:${String(limit)}`,
      );
      return recentRuns;
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

function previewInput(): Record<string, unknown> {
  return {
    html: '<article class="item"><h2>Example</h2><a href="/story">Read</a></article>',
    profile: {
      itemSelector: '.item',
      title: { selector: 'h2' },
      articleLink: { selector: 'a' },
    },
  };
}
