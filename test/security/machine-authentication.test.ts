import assert from 'node:assert/strict';
import test from 'node:test';

import { DISTRIBUTION_CREDENTIAL_CAPABILITY } from '../../src/distribution/credentials/configuration.ts';
import {
  createWebApp,
  type WebDependencies,
} from '../../src/app/web/create-app.ts';
import { startWebServer } from '../../src/app/web/server.ts';
import {
  createMachineAuthenticator,
  parseBearerCredential,
  type DistributionCredentialAuthenticationRepository,
} from '../../src/distribution/credentials/machine-authentication.ts';
import {
  createMachineRequestGuard,
  MachineRequestGuardInputError,
} from '../../src/distribution/credentials/machine-request-guard.ts';
import type { DistributionCredentialAuthenticationRecord } from '../../src/distribution/credentials/repository.ts';
import {
  deriveDistributionCredentialVerifier,
  generateDistributionCredentialToken,
} from '../../src/distribution/credentials/token.ts';

const credential = generateDistributionCredentialToken();
const record: DistributionCredentialAuthenticationRecord = {
  id: '00000000-0000-0000-0000-000000000001',
  lookupId: credential.lookupId,
  verifier: deriveDistributionCredentialVerifier(credential.secret),
  capability: DISTRIBUTION_CREDENTIAL_CAPABILITY,
  expiresAt: null,
  revokedAt: null,
};

test('machine authentication accepts only an exact, canonical Authorization Bearer credential', async () => {
  const repository = repositoryFor(record);
  const authenticator = createMachineAuthenticator({ repository });
  const invalidHeaders = [
    undefined,
    '',
    `bearer ${credential.token}`,
    `BEARER ${credential.token}`,
    `Basic ${credential.token}`,
    'Bearer ',
    `Bearer  ${credential.token}`,
    `Bearer ${credential.token} extra`,
    `Bearer nsd2.${credential.lookupId}.x`,
    `Bearer ${credential.token.slice(0, -1)}`,
    `Bearer ${credential.token}${'a'.repeat(100)}`,
  ];

  for (const authorizationHeader of invalidHeaders) {
    assert.deepEqual(await authenticator.authenticate(authorizationHeader), {
      outcome: 'unauthenticated',
    });
  }
  assert.equal(repository.lookups.length, 0);
  assert.equal(
    parseBearerCredential(`Bearer ${credential.token}`)?.lookupId,
    credential.lookupId,
  );
});

test('unknown credentials use the fixed dummy verifier path and every credential failure is generic', async () => {
  const compared: Buffer[] = [];
  const authenticator = createMachineAuthenticator({
    repository: {
      async findByLookupId(lookupId) {
        if (lookupId === credential.lookupId) return record;
        return undefined;
      },
    },
    verifierMatches(candidate, persisted) {
      compared.push(Buffer.from(persisted));
      return candidate.equals(persisted);
    },
    now: () => new Date('2028-01-02T03:04:05.006Z'),
  });
  const unknown = generateDistributionCredentialToken();
  const wrongSecret = generateDistributionCredentialToken();
  const wrongSecretToken = `${credential.token.slice(0, credential.token.lastIndexOf('.') + 1)}${wrongSecret.secret.toString('base64url')}`;

  const unknownResult = await authenticator.authenticate(
    `Bearer ${unknown.token}`,
  );
  const wrongSecretResult = await authenticator.authenticate(
    `Bearer ${wrongSecretToken}`,
  );
  assert.deepEqual(unknownResult, { outcome: 'unauthenticated' });
  assert.deepEqual(wrongSecretResult, { outcome: 'unauthenticated' });
  assert.equal(compared.length, 2);
  assert.deepEqual(compared[0], Buffer.alloc(32));
  assert.deepEqual(compared[1], record.verifier);
});

test('revoked, expired, and unusable credentials fail identically after verifier comparison', async () => {
  const atBoundary = new Date('2027-01-02T03:04:05.006Z');
  const states: readonly DistributionCredentialAuthenticationRecord[] = [
    { ...record, revokedAt: atBoundary },
    { ...record, expiresAt: atBoundary },
    { ...record, capability: 'admin' as never },
    { ...record, verifier: Buffer.alloc(31) },
  ];
  for (const state of states) {
    const authenticator = createMachineAuthenticator({
      repository: repositoryFor(state),
      now: () => atBoundary,
    });
    assert.deepEqual(
      await authenticator.authenticate(`Bearer ${credential.token}`),
      {
        outcome: 'unauthenticated',
      },
    );
  }

  const futureAuthenticator = createMachineAuthenticator({
    repository: repositoryFor({
      ...record,
      expiresAt: new Date('2027-01-02T03:04:05.007Z'),
    }),
    now: () => atBoundary,
  });
  assert.equal(
    (await futureAuthenticator.authenticate(`Bearer ${credential.token}`))
      .outcome,
    'authenticated',
  );
});

test('the authenticated principal is redacted and contains only machine authority', async () => {
  const authenticator = createMachineAuthenticator({
    repository: repositoryFor(record),
  });
  const result = await authenticator.authenticate(`Bearer ${credential.token}`);
  assert.equal(result.outcome, 'authenticated');
  if (result.outcome !== 'authenticated')
    assert.fail('Expected authentication.');
  assert.deepEqual(Object.keys(result.principal).sort(), [
    'capability',
    'credentialId',
    'lookupId',
  ]);
  assert.deepEqual(result.principal.capability, 'distribution:read');
  assert.equal(JSON.stringify(result).includes(credential.token), false);
  assert.equal(
    JSON.stringify(result).includes(record.verifier.toString('hex')),
    false,
  );
  assert.equal('admin' in result.principal, false);
});

test('the combined guard keeps valid credentials and invalid networks separate', async () => {
  let now = 0;
  const authenticator = createMachineAuthenticator({
    repository: repositoryFor(record),
  });
  const guard = createMachineRequestGuard({
    authenticator,
    clock: { now: () => now },
    policy: {
      authenticated: {
        maximumRequests: 1,
        windowMilliseconds: 1_000,
        maximumEntries: 2,
      },
      invalidAuthentication: {
        maximumRequests: 1,
        windowMilliseconds: 1_000,
        maximumEntries: 2,
      },
    },
  });

  assert.equal(
    (
      await guard.guard({
        authorizationHeader: 'Bearer malformed',
        invalidAuthNetworkKey: '203.0.113.1',
      })
    ).outcome,
    'unauthenticated',
  );
  assert.equal(
    (
      await guard.guard({
        authorizationHeader: `Bearer ${credential.token}`,
        invalidAuthNetworkKey: '203.0.113.2',
      })
    ).outcome,
    'authenticated',
  );
  const exhausted = await guard.guard({
    authorizationHeader: `Bearer ${credential.token}`,
    invalidAuthNetworkKey: '203.0.113.3',
  });
  assert.deepEqual(exhausted, {
    outcome: 'rate_limited',
    classification: 'authenticated_credential',
    retryAfterSeconds: 1,
  });

  now = 1_000;
  assert.equal(
    (
      await guard.guard({
        authorizationHeader: `Bearer ${credential.token}`,
        invalidAuthNetworkKey: '203.0.113.2',
      })
    ).outcome,
    'authenticated',
  );
});

test('invalid-auth limiting is keyed by bounded caller network identity and never uses bearer plaintext', async () => {
  let now = 0;
  const calls: string[] = [];
  const guard = createMachineRequestGuard({
    authenticator: {
      async authenticate(header) {
        calls.push(header ?? 'absent');
        return header === 'good'
          ? {
              outcome: 'authenticated' as const,
              principal: {
                credentialId: 'credential-a',
                lookupId: 'lookup-a',
                capability: DISTRIBUTION_CREDENTIAL_CAPABILITY,
              },
            }
          : { outcome: 'unauthenticated' as const };
      },
    },
    clock: { now: () => now },
    policy: {
      authenticated: {
        maximumRequests: 2,
        windowMilliseconds: 1_000,
        maximumEntries: 3,
      },
      invalidAuthentication: {
        maximumRequests: 1,
        windowMilliseconds: 1_000,
        maximumEntries: 3,
      },
    },
  });
  assert.equal(
    (
      await guard.guard({
        authorizationHeader: 'secret-a',
        invalidAuthNetworkKey: 'net-a',
      })
    ).outcome,
    'unauthenticated',
  );
  assert.equal(
    (
      await guard.guard({
        authorizationHeader: 'secret-b',
        invalidAuthNetworkKey: 'net-b',
      })
    ).outcome,
    'unauthenticated',
  );
  assert.equal(
    (
      await guard.guard({
        authorizationHeader: 'good',
        invalidAuthNetworkKey: 'net-c',
      })
    ).outcome,
    'authenticated',
  );
  assert.equal(
    (
      await guard.guard({
        authorizationHeader: 'not-good',
        invalidAuthNetworkKey: 'net-c',
      })
    ).outcome,
    'unauthenticated',
  );
  assert.equal(calls.includes('secret-a'), true);
  await assert.rejects(
    guard.guard({ authorizationHeader: undefined, invalidAuthNetworkKey: '' }),
    MachineRequestGuardInputError,
  );
  now = 1_000;
  assert.equal(
    (
      await guard.guard({
        authorizationHeader: 'secret-c',
        invalidAuthNetworkKey: 'net-a',
      })
    ).outcome,
    'unauthenticated',
  );
});

test('machine bearer credentials do not alter the independent administrator mutation boundary', async () => {
  const dependencies: WebDependencies = {
    readiness: { checkReady: async () => true },
    publicFeed: { read: async () => undefined },
  };
  let mutations = 0;
  const server = await startWebServer(
    createWebApp(dependencies, {
      adminEnabled: true,
      registerAdminApiRoutes(router) {
        router.post('/mutation', (_request, response) => {
          mutations += 1;
          response.status(204).end();
        });
      },
    }),
    { host: '127.0.0.1', port: 0 },
  );
  try {
    const response = await fetch(
      `http://${server.host}:${String(server.port)}/admin/api/mutation`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credential.token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
    );
    assert.equal(response.status, 403);
    assert.equal(mutations, 0);
  } finally {
    await server.close();
  }
});

function repositoryFor(
  authenticationRecord: DistributionCredentialAuthenticationRecord,
): DistributionCredentialAuthenticationRepository & {
  readonly lookups: string[];
} {
  const lookups: string[] = [];
  return {
    lookups,
    async findByLookupId(lookupId) {
      lookups.push(lookupId);
      return lookupId === authenticationRecord.lookupId
        ? authenticationRecord
        : undefined;
    },
  };
}
