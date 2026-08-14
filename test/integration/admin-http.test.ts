import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Router } from 'express';

import {
  ADMIN_API_JSON_BODY_LIMIT_BYTES,
  ADMIN_REQUEST_HEADER,
  ADMIN_REQUEST_HEADER_VALUE,
  adminContentSecurityPolicy,
  type AdminApiRouteRegistrar,
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

describe('Admin HTTP perimeter foundation', () => {
  it('does not expose admin page, assets, or API routes when disabled', async () => {
    await withWebServer(false, undefined, async (baseUrl) => {
      for (const path of [
        '/admin',
        '/admin/assets/admin.css',
        '/api/admin',
        '/api/admin/sources',
      ]) {
        const response = await fetch(`${baseUrl}${path}`);
        assert.equal(response.status, 404, path);
        assert.doesNotMatch(await response.text(), /Administration/u, path);
      }

      const mutation = await fetch(`${baseUrl}/api/admin/test-mutation`, {
        method: 'POST',
        headers: adminJsonHeaders(),
        body: '{}',
      });
      assert.equal(mutation.status, 404);
      assert.match(mutation.headers.get('content-type') ?? '', /^text\/html/u);
    });
  });

  it('serves the bounded admin shell and asset with no-store security headers', async () => {
    await withWebServer(true, undefined, async (baseUrl) => {
      const page = await fetch(`${baseUrl}/admin`);
      const body = await page.text();
      assert.equal(page.status, 200);
      assert.match(page.headers.get('content-type') ?? '', /^text\/html/u);
      assertAdminSecurityHeaders(page);
      assert.match(body, /<h1>Administration<\/h1>/u);
      assert.match(body, /href="\/admin\/assets\/admin\.css"/u);
      assert.doesNotMatch(body, /<script|<form|password|login/iu);

      const stylesheet = await fetch(`${baseUrl}/admin/assets/admin.css`);
      assert.equal(stylesheet.status, 200);
      assert.match(stylesheet.headers.get('content-type') ?? '', /^text\/css/u);
      assertAdminSecurityHeaders(stylesheet);
      assert.match(await stylesheet.text(), /\.admin-shell/u);
    });
  });

  it('returns bounded JSON for unknown API routes and permits safe reads without the mutation header', async () => {
    const registerRoutes = (router: Router) => {
      router.get('/test-read', (_request, response) => {
        response.status(200).json({ status: 'ok' });
      });
    };
    await withWebServer(true, registerRoutes, async (baseUrl) => {
      const read = await fetch(`${baseUrl}/api/admin/test-read`);
      assert.equal(read.status, 200);
      assert.deepEqual(await read.json(), { status: 'ok' });
      assertAdminSecurityHeaders(read);

      const unknown = await fetch(`${baseUrl}/api/admin/unknown`);
      assert.equal(unknown.status, 404);
      assert.deepEqual(await unknown.json(), { error: 'not_found' });
      assertAdminSecurityHeaders(unknown);
    });
  });

  it('allows valid JSON mutations with the exact request header through the controlled handler', async () => {
    let receivedBody: unknown;
    const registerRoutes = mutationRoute((requestBody) => {
      receivedBody = requestBody;
    });
    await withWebServer(true, registerRoutes, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/test-mutation`, {
        method: 'POST',
        headers: adminJsonHeaders(),
        body: JSON.stringify({ value: 'accepted' }),
      });
      assert.equal(response.status, 204);
      assert.deepEqual(receivedBody, { value: 'accepted' });
      assertAdminSecurityHeaders(response);
    });
  });

  it('rejects missing or wrong mutation headers before the controlled handler', async () => {
    let handlerCalls = 0;
    const registerRoutes = mutationRoute(() => {
      handlerCalls += 1;
    });
    await withWebServer(true, registerRoutes, async (baseUrl) => {
      for (const headerValue of [undefined, '0', 'true', 'secret']) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (headerValue !== undefined) {
          headers[ADMIN_REQUEST_HEADER] = headerValue;
        }
        const response = await fetch(`${baseUrl}/api/admin/test-mutation`, {
          method: 'POST',
          headers,
          body: '{}',
        });
        assert.equal(response.status, 403, String(headerValue));
        assert.deepEqual(await response.json(), {
          error: 'request_integrity_required',
        });
      }
      assert.equal(handlerCalls, 0);
    });
  });

  it('applies the mutation boundary to POST, PUT, PATCH, and DELETE', async () => {
    let handlerCalls = 0;
    const registerRoutes = (router: Router) => {
      router.all('/test-unsafe-methods', (_request, response) => {
        handlerCalls += 1;
        response.status(204).end();
      });
    };
    await withWebServer(true, registerRoutes, async (baseUrl) => {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const rejected = await fetch(
          `${baseUrl}/api/admin/test-unsafe-methods`,
          {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          },
        );
        assert.equal(rejected.status, 403, method);

        const accepted = await fetch(
          `${baseUrl}/api/admin/test-unsafe-methods`,
          {
            method,
            headers: adminJsonHeaders(),
            body: '{}',
          },
        );
        assert.equal(accepted.status, 204, method);
      }
      assert.equal(handlerCalls, 4);
    });
  });

  it('rejects form and plain-text mutation bodies before the controlled handler', async () => {
    let handlerCalls = 0;
    const registerRoutes = mutationRoute(() => {
      handlerCalls += 1;
    });
    await withWebServer(true, registerRoutes, async (baseUrl) => {
      for (const contentType of [
        'application/x-www-form-urlencoded',
        'text/plain',
      ]) {
        const response = await fetch(`${baseUrl}/api/admin/test-mutation`, {
          method: 'POST',
          headers: {
            [ADMIN_REQUEST_HEADER]: ADMIN_REQUEST_HEADER_VALUE,
            'Content-Type': contentType,
          },
          body: 'value=not-json',
        });
        assert.equal(response.status, 415, contentType);
        assert.deepEqual(await response.json(), {
          error: 'json_content_type_required',
        });
      }
      assert.equal(handlerCalls, 0);
    });
  });

  it('returns deterministic JSON for malformed JSON without reaching the handler', async () => {
    let handlerCalls = 0;
    const registerRoutes = mutationRoute(() => {
      handlerCalls += 1;
    });
    await withWebServer(true, registerRoutes, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/test-mutation`, {
        method: 'POST',
        headers: adminJsonHeaders(),
        body: '{"broken":',
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'invalid_json' });
      assert.equal(handlerCalls, 0);
    });
  });

  it('accepts exactly 64 KiB and rejects one byte more before the handler', async () => {
    let handlerCalls = 0;
    const registerRoutes = mutationRoute(() => {
      handlerCalls += 1;
    });
    await withWebServer(true, registerRoutes, async (baseUrl) => {
      const exactBody = sizedJsonBody(ADMIN_API_JSON_BODY_LIMIT_BYTES);
      assert.equal(
        Buffer.byteLength(exactBody),
        ADMIN_API_JSON_BODY_LIMIT_BYTES,
      );
      const accepted = await fetch(`${baseUrl}/api/admin/test-mutation`, {
        method: 'POST',
        headers: adminJsonHeaders(),
        body: exactBody,
      });
      assert.equal(accepted.status, 204);
      assert.equal(handlerCalls, 1);

      const oversizedBody = sizedJsonBody(ADMIN_API_JSON_BODY_LIMIT_BYTES + 1);
      assert.equal(
        Buffer.byteLength(oversizedBody),
        ADMIN_API_JSON_BODY_LIMIT_BYTES + 1,
      );
      const rejected = await fetch(`${baseUrl}/api/admin/test-mutation`, {
        method: 'POST',
        headers: adminJsonHeaders(),
        body: oversizedBody,
      });
      assert.equal(rejected.status, 413);
      assert.deepEqual(await rejected.json(), {
        error: 'request_too_large',
      });
      assert.equal(handlerCalls, 1);
    });
  });

  it('does not emit permissive CORS headers for cross-origin mutation attempts', async () => {
    const registerRoutes = mutationRoute(() => undefined);
    await withWebServer(true, registerRoutes, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/test-mutation`, {
        method: 'POST',
        headers: {
          ...adminJsonHeaders(),
          Origin: 'https://attacker.invalid',
        },
        body: '{}',
      });
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      assert.equal(
        response.headers.get('access-control-allow-credentials'),
        null,
      );

      const preflight = await fetch(`${baseUrl}/api/admin/test-mutation`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://attacker.invalid',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': ADMIN_REQUEST_HEADER,
        },
      });
      assert.equal(preflight.status, 404);
      assert.equal(preflight.headers.get('access-control-allow-origin'), null);
    });
  });

  it('bounds unexpected API errors without exposing exception details', async () => {
    const syntheticSecret = 'synthetic-admin-database-secret';
    const registerRoutes = (router: Router) => {
      router.get('/test-error', () => {
        throw new Error(`SELECT private_table ${syntheticSecret}`);
      });
    };
    await withWebServer(true, registerRoutes, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/test-error`);
      const body = await response.text();
      assert.equal(response.status, 500);
      assert.deepEqual(JSON.parse(body), { error: 'internal_error' });
      assert.doesNotMatch(body, /SELECT|private_table|synthetic-admin/u);
      assertAdminSecurityHeaders(response);
    });
  });

  it('preserves public, health, and public-asset behavior whether admin is enabled or disabled', async () => {
    const disabled = await publicRouteSnapshots(false);
    const enabled = await publicRouteSnapshots(true);
    assert.deepEqual(enabled, disabled);
    assert.deepEqual(
      disabled.map(({ status }) => status),
      [200, 200, 200, 404, 200, 200, 200],
    );
  });
});

function mutationRoute(
  onBody: (body: unknown) => void,
): AdminApiRouteRegistrar {
  return (router) => {
    router.post('/test-mutation', (request, response) => {
      onBody(request.body);
      response.status(204).end();
    });
  };
}

async function withWebServer(
  adminEnabled: boolean,
  registerAdminApiRoutes: AdminApiRouteRegistrar | undefined,
  work: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const options =
    registerAdminApiRoutes === undefined
      ? { adminEnabled }
      : { adminEnabled, registerAdminApiRoutes };
  const server = await startWebServer(createWebApp(dependencies, options), {
    host: '127.0.0.1',
    port: 0,
  });
  try {
    await work(`http://${server.host}:${String(server.port)}`);
  } finally {
    await server.close();
  }
}

function adminJsonHeaders(): Record<string, string> {
  return {
    [ADMIN_REQUEST_HEADER]: ADMIN_REQUEST_HEADER_VALUE,
    'Content-Type': 'application/json',
  };
}

function assertAdminSecurityHeaders(response: Response): void {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(
    response.headers.get('content-security-policy'),
    adminContentSecurityPolicy,
  );
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
}

function sizedJsonBody(byteLength: number): string {
  const prefix = '{"value":"';
  const suffix = '"}';
  const valueLength =
    byteLength - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
  assert.ok(valueLength >= 0);
  return `${prefix}${'a'.repeat(valueLength)}${suffix}`;
}

interface RouteSnapshot {
  readonly path: string;
  readonly status: number;
  readonly contentType: string | null;
  readonly cacheControl: string | null;
  readonly body: string;
}

async function publicRouteSnapshots(
  adminEnabled: boolean,
): Promise<readonly RouteSnapshot[]> {
  let snapshots: readonly RouteSnapshot[] = [];
  await withWebServer(adminEnabled, undefined, async (baseUrl) => {
    snapshots = await Promise.all(
      [
        '/health/live',
        '/health/ready',
        '/',
        '/api/feed',
        '/public-feed.css',
        '/public-feed.js',
        '/public-theme.js',
      ].map(async (path) => {
        const response = await fetch(`${baseUrl}${path}`);
        return {
          path,
          status: response.status,
          contentType: response.headers.get('content-type'),
          cacheControl: response.headers.get('cache-control'),
          body: await response.text(),
        };
      }),
    );
  });
  return snapshots;
}
