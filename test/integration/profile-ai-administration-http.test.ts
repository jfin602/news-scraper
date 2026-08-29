import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ProfileAiAdministrationError,
  type AdminProfileAiReadModel,
  type ProfileAiAdministrationService,
} from '../../src/admin/profile-ai-administration.ts';
import {
  ADMIN_REQUEST_HEADER,
  ADMIN_REQUEST_HEADER_VALUE,
} from '../../src/app/web/admin-api-security.ts';
import { createWebApp } from '../../src/app/web/create-app.ts';
import { registerProfileAiAdministrationRoutes } from '../../src/app/web/profile-ai-administration-router.ts';
import { startWebServer } from '../../src/app/web/server.ts';

const ai: AdminProfileAiReadModel = Object.freeze({
  profileKey: 'books',
  configuration: Object.freeze({
    digestEnabled: true,
    lookbackDays: 7,
    maxArticles: 20,
    digestStyleGuidance: null,
  }),
  cadence: Object.freeze({
    kind: 'twice_daily',
    slots: Object.freeze(['00:00Z', '12:00Z']) as readonly ['00:00Z', '12:00Z'],
  }),
  activeDigest: null,
  latestAttempt: null,
});

describe('Profile AI administration HTTP API', () => {
  it('keeps bounded AI reads and commands inside the protected admin router', async () => {
    const calls: unknown[][] = [];
    await withServer(service(calls), async (baseUrl) => {
      const read = await fetch(
        `${baseUrl}/admin/api/distribution-profiles/books/ai`,
      );
      assert.equal(read.status, 200);
      assert.deepEqual(await read.json(), { ai });

      const save = await fetch(
        `${baseUrl}/admin/api/distribution-profiles/books/ai/configuration`,
        {
          method: 'PUT',
          headers: headers(),
          body: JSON.stringify({
            digestEnabled: true,
            lookbackDays: 14,
            maxArticles: 10,
          }),
        },
      );
      assert.equal(save.status, 200);
      assert.deepEqual(await save.json(), { ai });

      const generate = await fetch(
        `${baseUrl}/admin/api/distribution-profiles/books/ai/generate`,
        { method: 'POST', headers: headers(), body: '{}' },
      );
      assert.equal(generate.status, 200);
      assert.deepEqual(await generate.json(), { result: 'generated', ai });

      const machine = await fetch(
        `${baseUrl}/api/v1/distribution/books/ai/generate`,
        {
          method: 'POST',
          headers: { Authorization: 'Bearer distribution-secret' },
        },
      );
      assert.equal(machine.status, 404);
    });
    assert.deepEqual(calls, [
      ['get', 'books'],
      [
        'update',
        'books',
        { digestEnabled: true, lookbackDays: 14, maxArticles: 10 },
      ],
      ['generate', 'books'],
    ]);
  });

  it('maps typed generation conflicts without details', async () => {
    await withServer(
      {
        ...service([]),
        forceGenerateProfileDigest: async () => {
          throw new ProfileAiAdministrationError(
            'digest_generation_in_progress',
          );
        },
      },
      async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/admin/api/distribution-profiles/books/ai/generate`,
          { method: 'POST', headers: headers(), body: '{}' },
        );
        const text = await response.text();
        assert.equal(response.status, 409);
        assert.deepEqual(JSON.parse(text), {
          error: 'digest_generation_in_progress',
        });
        assert.doesNotMatch(text, /key|prompt|provider body|stack/u);
      },
    );
  });

  it('requires the existing mutation-integrity boundary for save and generate', async () => {
    await withServer(service([]), async (baseUrl) => {
      for (const path of [
        '/admin/api/distribution-profiles/books/ai/configuration',
        '/admin/api/distribution-profiles/books/ai/generate',
      ]) {
        const response = await fetch(`${baseUrl}${path}`, {
          method: path.endsWith('configuration') ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        assert.equal(response.status, 403);
      }
    });
  });
});

function service(calls: unknown[][]): ProfileAiAdministrationService {
  return {
    async getProfileAi(key) {
      calls.push(['get', key]);
      return ai;
    },
    async updateProfileAiConfiguration(key, input) {
      calls.push(['update', key, input]);
      return ai;
    },
    async forceGenerateProfileDigest(key) {
      calls.push(['generate', key]);
      return Object.freeze({ result: 'generated' as const, ai });
    },
  };
}

async function withServer(
  adminService: ProfileAiAdministrationService,
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
          registerProfileAiAdministrationRoutes(adminService),
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

function headers(): Record<string, string> {
  return {
    [ADMIN_REQUEST_HEADER]: ADMIN_REQUEST_HEADER_VALUE,
    'Content-Type': 'application/json',
  };
}
