import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type RequestListener, type Server } from 'node:http';
import test from 'node:test';

import {
  parseReferenceDeploymentConfig,
  validateReferenceDeployment,
} from '../../src/operations/reference-deployment-validator.ts';

test('classifies public success, admin denial, and unreachable direct origin', async (context) => {
  const publicServer = await listen((request, response) => {
    if (request.url === '/admin') response.writeHead(403).end('denied');
    else response.writeHead(200).end('ok');
  });
  context.after(() => close(publicServer.server));

  const result = await validateReferenceDeployment({
    publicBaseUrl: publicServer.origin,
    directOriginBaseUrl: 'http://127.0.0.1:1',
    timeoutMilliseconds: 500,
  });
  assert.equal(result.ok, true);
  assert.equal(
    result.observations.find((item) => item.check === 'admin_perimeter')
      ?.outcome,
    'pass',
  );
  assert.equal(
    result.observations.find((item) => item.check === 'direct_origin')?.outcome,
    'pass',
  );
});

test('fails unsafe direct-origin success and distinguishes redirects', async (context) => {
  const publicServer = await listen((request, response) => {
    if (request.url === '/admin')
      response
        .writeHead(302, {
          location: 'https://access.example/login?token=secret',
        })
        .end();
    else response.writeHead(200).end();
  });
  const originServer = await listen((_request, response) => {
    response.writeHead(200).end('admin application');
  });
  context.after(() =>
    Promise.all([close(publicServer.server), close(originServer.server)]),
  );

  const result = await validateReferenceDeployment({
    publicBaseUrl: publicServer.origin,
    directOriginBaseUrl: originServer.origin,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.observations.find((item) => item.check === 'admin_perimeter'),
    {
      check: 'admin_perimeter',
      outcome: 'pass',
      status: 302,
      locationOrigin: 'https://access.example',
      detail: 'unauthenticated admin request was redirected',
    },
  );
  assert.equal(
    result.observations.find((item) => item.check === 'direct_origin')?.outcome,
    'fail',
  );
  assert.doesNotMatch(JSON.stringify(result), /token=secret/u);
});

test('classifies public redirects and network failures without following them', async (context) => {
  const redirectServer = await listen((_request, response) => {
    response
      .writeHead(301, {
        location: 'https://public.example/next?sentinel=hidden',
      })
      .end();
  });
  context.after(() => close(redirectServer.server));
  const result = await validateReferenceDeployment({
    publicBaseUrl: redirectServer.origin,
    directOriginBaseUrl: 'http://127.0.0.1:1',
    timeoutMilliseconds: 500,
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.observations.find((item) => item.check === 'public_root')?.outcome,
    'redirect_observed',
  );
  assert.doesNotMatch(JSON.stringify(result), /sentinel/u);

  const network = await validateReferenceDeployment({
    publicBaseUrl: 'http://127.0.0.1:1',
    directOriginBaseUrl: 'http://127.0.0.1:2',
    timeoutMilliseconds: 500,
  });
  assert.equal(network.ok, false);
  assert.equal(network.observations[0]?.outcome, 'network_error');
});

test('malformed or secret-bearing configuration fails closed without echoing sentinels', () => {
  assert.throws(
    () => parseReferenceDeploymentConfig({}),
    /publicBaseUrl is required/u,
  );
  const sentinel = 'DO_NOT_PRINT_ME';
  assert.throws(
    () =>
      parseReferenceDeploymentConfig({
        publicBaseUrl: `https://user:${sentinel}@public.example/`,
        directOriginBaseUrl: 'https://origin.example/',
      }),
    (error: Error) => !error.message.includes(sentinel),
  );
  assert.throws(
    () =>
      parseReferenceDeploymentConfig({
        publicBaseUrl: 'https://same.example/',
        directOriginBaseUrl: 'https://same.example/path',
      }),
    /must differ/u,
  );
});

async function listen(
  handler: RequestListener,
): Promise<{ server: Server; origin: string }> {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('missing address');
  return { server, origin: `http://127.0.0.1:${String(address.port)}` };
}

async function close(server: Server): Promise<void> {
  server.close();
  await once(server, 'close');
}
