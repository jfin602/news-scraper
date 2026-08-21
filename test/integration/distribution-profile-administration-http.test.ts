import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DistributionProfileAdministrationError,
  type AdminDistributionProfileReadModel,
  type DistributionProfileAdministrationErrorCode,
  type DistributionProfileAdministrationService,
} from '../../src/admin/distribution-profile-administration.ts';
import {
  ADMIN_REQUEST_HEADER,
  ADMIN_REQUEST_HEADER_VALUE,
} from '../../src/app/web/admin-api-security.ts';
import { createWebApp } from '../../src/app/web/create-app.ts';
import { registerDistributionProfileAdministrationRoutes } from '../../src/app/web/distribution-profile-administration-router.ts';
import { startWebServer } from '../../src/app/web/server.ts';

const profile: AdminDistributionProfileReadModel = Object.freeze({
  configKey: 'publisher_news',
  displayName: 'Publisher News',
  lifecycleState: 'draft',
  resultLimit: 25,
  sources: Object.freeze([
    Object.freeze({
      configKey: 'journal',
      displayName: 'Journal',
      approvalState: 'approved',
      lifecycleState: 'active',
      includeAnyPhrases: Object.freeze(['books']),
      excludeAnyPhrases: Object.freeze([]),
      categoryConfigKeys: Object.freeze(['industry']),
    }),
  ]),
});

describe('Distribution Profile administration HTTP API', () => {
  it('routes reads and commands directly to the P2 service', async () => {
    const calls: unknown[][] = [];
    await withAdminServer(mockService(calls), async (baseUrl) => {
      const list = await fetch(`${baseUrl}/admin/api/distribution-profiles`);
      assert.equal(list.status, 200);
      assert.deepEqual(await list.json(), { profiles: [profile] });
      assertAdminSecurityHeaders(list);

      const detail = await fetch(
        `${baseUrl}/admin/api/distribution-profiles/publisher_news`,
      );
      assert.equal(detail.status, 200);
      assert.deepEqual(await detail.json(), { profile });

      const commands: readonly [string, string, unknown, number][] = [
        ['/admin/api/distribution-profiles', 'POST', { create: true }, 201],
        [
          '/admin/api/distribution-profiles/publisher_news/configuration',
          'PUT',
          { displayName: 'New name', resultLimit: 50 },
          200,
        ],
        [
          '/admin/api/distribution-profiles/publisher_news/lifecycle',
          'PUT',
          { lifecycleState: 'active' },
          200,
        ],
        [
          '/admin/api/distribution-profiles/publisher_news/sources/journal',
          'PUT',
          { includeAnyPhrases: ['books'] },
          200,
        ],
        [
          '/admin/api/distribution-profiles/publisher_news/sources/journal',
          'DELETE',
          {},
          200,
        ],
      ];
      for (const [path, method, body, status] of commands) {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: adminHeaders(),
          body: JSON.stringify(body),
        });
        assert.equal(response.status, status, `${method} ${path}`);
        assert.deepEqual(await response.json(), { profile });
      }
    });
    assert.deepEqual(calls, [
      ['list'],
      ['get', 'publisher_news'],
      ['create', { create: true }],
      [
        'configuration',
        'publisher_news',
        { displayName: 'New name', resultLimit: 50 },
      ],
      ['lifecycle', 'publisher_news', { lifecycleState: 'active' }],
      [
        'association',
        'publisher_news',
        'journal',
        { includeAnyPhrases: ['books'] },
      ],
      ['remove', 'publisher_news', 'journal'],
    ]);
  });

  it('maps every bounded P2 error without disclosing details', async () => {
    const cases: readonly [
      string,
      string,
      DistributionProfileAdministrationErrorCode,
      number,
    ][] = [
      ['POST', '/distribution-profiles', 'invalid_request', 400],
      ['POST', '/distribution-profiles', 'category_not_found', 400],
      ['GET', '/distribution-profiles/missing', 'profile_not_found', 404],
      [
        'PUT',
        '/distribution-profiles/publisher_news/sources/missing',
        'source_not_found',
        404,
      ],
      [
        'DELETE',
        '/distribution-profiles/publisher_news/sources/missing',
        'profile_association_not_found',
        404,
      ],
      ['POST', '/distribution-profiles', 'profile_config_key_conflict', 409],
      [
        'PUT',
        '/distribution-profiles/publisher_news/lifecycle',
        'profile_invalid_lifecycle_transition',
        409,
      ],
      [
        'DELETE',
        '/distribution-profiles/publisher_news/sources/journal',
        'profile_requires_usable_source',
        409,
      ],
    ];
    for (const [method, path, code, status] of cases) {
      await withAdminServer(errorService(code), async (baseUrl) => {
        const response =
          method === 'GET'
            ? await fetch(`${baseUrl}/admin/api${path}`)
            : await fetch(`${baseUrl}/admin/api${path}`, {
                method,
                headers: adminHeaders(),
                body: '{}',
              });
        const text = await response.text();
        assert.equal(response.status, status, code);
        assert.deepEqual(JSON.parse(text), { error: code });
        assert.doesNotMatch(text, /database|secret|stack|SELECT/u);
      });
    }
  });

  it('keeps request integrity and JSON parsing ahead of Profile commands', async () => {
    const calls: unknown[][] = [];
    await withAdminServer(mockService(calls), async (baseUrl) => {
      const read = await fetch(`${baseUrl}/admin/api/distribution-profiles`);
      assert.equal(read.status, 200);

      for (const headers of [
        { 'Content-Type': 'application/json' },
        {
          'Content-Type': 'application/json',
          [ADMIN_REQUEST_HEADER]: 'wrong',
        },
      ]) {
        const response = await fetch(
          `${baseUrl}/admin/api/distribution-profiles`,
          {
            method: 'POST',
            headers,
            body: '{}',
          },
        );
        assert.equal(response.status, 403);
      }
      const malformed = await fetch(
        `${baseUrl}/admin/api/distribution-profiles`,
        {
          method: 'POST',
          headers: adminHeaders(),
          body: '{',
        },
      );
      assert.equal(malformed.status, 400);
      assert.deepEqual(await malformed.json(), { error: 'invalid_json' });
      const unsupported = await fetch(
        `${baseUrl}/admin/api/distribution-profiles`,
        {
          method: 'POST',
          headers: { [ADMIN_REQUEST_HEADER]: ADMIN_REQUEST_HEADER_VALUE },
          body: '{}',
        },
      );
      assert.equal(unsupported.status, 415);
    });
    assert.deepEqual(calls, [['list']]);
  });

  it('does not expose Profile routes when administration is disabled', async () => {
    const server = await startWebServer(
      createWebApp({
        readiness: { checkReady: async () => true },
        publicFeed: { read: async () => undefined },
      }),
      { host: '127.0.0.1', port: 0 },
    );
    try {
      const response = await fetch(
        `http://${server.host}:${String(server.port)}/admin/api/distribution-profiles`,
      );
      assert.equal(response.status, 404);
      assert.match(response.headers.get('content-type') ?? '', /^text\/html/u);
    } finally {
      await server.close();
    }
  });

  it('passes unexpected service failures to the centralized bounded error handler', async () => {
    const server = await startWebServer(
      createWebApp(
        {
          readiness: { checkReady: async () => true },
          publicFeed: { read: async () => undefined },
        },
        {
          adminEnabled: true,
          registerAdminApiRoutes:
            registerDistributionProfileAdministrationRoutes({
              ...mockService([]),
              listProfiles: async () => {
                throw new Error('SELECT private_table profile-route-secret');
              },
            }),
        },
      ),
      { host: '127.0.0.1', port: 0 },
    );
    try {
      const response = await fetch(
        `http://${server.host}:${String(server.port)}/admin/api/distribution-profiles`,
      );
      const body = await response.text();
      assert.equal(response.status, 500);
      assert.deepEqual(JSON.parse(body), { error: 'internal_error' });
      assert.doesNotMatch(body, /SELECT|private_table|profile-route-secret/u);
    } finally {
      await server.close();
    }
  });
});

function mockService(
  calls: unknown[][],
): DistributionProfileAdministrationService {
  return {
    async listProfiles() {
      calls.push(['list']);
      return [profile];
    },
    async getProfile(key) {
      calls.push(['get', key]);
      return profile;
    },
    async createProfile(input) {
      calls.push(['create', input]);
      return profile;
    },
    async replaceProfileConfiguration(key, input) {
      calls.push(['configuration', key, input]);
      return profile;
    },
    async replaceSourceAssociation(key, source, input) {
      calls.push(['association', key, source, input]);
      return profile;
    },
    async removeSourceAssociation(key, source) {
      calls.push(['remove', key, source]);
      return profile;
    },
    async setProfileLifecycle(key, input) {
      calls.push(['lifecycle', key, input]);
      return profile;
    },
  };
}

function errorService(
  code: DistributionProfileAdministrationErrorCode,
): DistributionProfileAdministrationService {
  const fail = async (): Promise<never> => {
    throw new DistributionProfileAdministrationError(code);
  };
  return {
    listProfiles: fail,
    getProfile: fail,
    createProfile: fail,
    replaceProfileConfiguration: fail,
    replaceSourceAssociation: fail,
    removeSourceAssociation: fail,
    setProfileLifecycle: fail,
  };
}

async function withAdminServer(
  service: DistributionProfileAdministrationService,
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
          registerDistributionProfileAdministrationRoutes(service),
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

function assertAdminSecurityHeaders(response: Response): void {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(
    response.headers.get('content-security-policy') ?? '',
    /default-src 'self'/u,
  );
}
