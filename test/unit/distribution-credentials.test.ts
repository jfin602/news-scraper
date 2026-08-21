import assert from 'node:assert/strict';
import test from 'node:test';

import { ConfigurationValidationError } from '../../src/publication/configuration.ts';
import {
  normalizeDistributionCredentialExpiry,
  normalizeDistributionCredentialIssueInput,
  normalizeDistributionCredentialLabel,
} from '../../src/distribution/credentials/configuration.ts';
import { findDistributionCredentialForAuthentication } from '../../src/distribution/credentials/repository.ts';
import {
  deriveDistributionCredentialVerifier,
  distributionCredentialVerifierMatches,
  DISTRIBUTION_CREDENTIAL_SECRET_BYTES,
  DISTRIBUTION_CREDENTIAL_VERIFIER_BYTES,
  generateDistributionCredentialToken,
  parseDistributionCredentialToken,
} from '../../src/distribution/credentials/token.ts';

test('credential generation uses a versioned canonical token with independent random lookup and 256-bit secret', () => {
  const requests: number[] = [];
  let counter = 0;
  const generated = generateDistributionCredentialToken((size) => {
    requests.push(size);
    counter += 1;
    return Buffer.alloc(size, counter);
  });
  assert.deepEqual(requests, [16, DISTRIBUTION_CREDENTIAL_SECRET_BYTES]);
  assert.match(
    generated.token,
    /^nsd1\.l[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/u,
  );
  assert.equal(generated.secret.length, DISTRIBUTION_CREDENTIAL_SECRET_BYTES);
  assert.deepEqual(parseDistributionCredentialToken(generated.token), {
    lookupId: generated.lookupId,
    secret: generated.secret,
  });
});

test('independent credential issues have distinct lookup and secret values', () => {
  const first = generateDistributionCredentialToken();
  const second = generateDistributionCredentialToken();
  assert.notEqual(first.lookupId, second.lookupId);
  assert.notDeepEqual(first.secret, second.secret);
  assert.notEqual(first.token, second.token);
});

test('credential parser rejects malformed, noncanonical, wrong-version, truncated, extra, and oversized tokens', () => {
  const token = generateDistributionCredentialToken().token;
  const [, lookup, secret] = token.split('.');
  assert.equal(parseDistributionCredentialToken('nsd2.x.y'), undefined);
  assert.equal(parseDistributionCredentialToken(`nsd1.${lookup}`), undefined);
  assert.equal(parseDistributionCredentialToken(`${token}.extra`), undefined);
  assert.equal(
    parseDistributionCredentialToken(`nsd1.${lookup}.${secret?.slice(1)}`),
    undefined,
  );
  assert.equal(
    parseDistributionCredentialToken(`nsd1.${lookup}.${secret}=`),
    undefined,
  );
  assert.equal(
    parseDistributionCredentialToken(
      `nsd1.${lookup?.replace(/^l/u, 'x')}.${secret}`,
    ),
    undefined,
  );
  assert.equal(
    parseDistributionCredentialToken(`nsd1.${lookup}.${'a'.repeat(100)}`),
    undefined,
  );
});

test('verifier derivation is deterministic, fixed length, and safely comparable', () => {
  const parsed = parseDistributionCredentialToken(
    generateDistributionCredentialToken().token,
  );
  assert.ok(parsed !== undefined);
  const verifier = deriveDistributionCredentialVerifier(parsed.secret);
  assert.equal(verifier.length, DISTRIBUTION_CREDENTIAL_VERIFIER_BYTES);
  assert.deepEqual(
    verifier,
    deriveDistributionCredentialVerifier(parsed.secret),
  );
  assert.equal(distributionCredentialVerifierMatches(verifier, verifier), true);
  assert.equal(
    distributionCredentialVerifierMatches(verifier, Buffer.alloc(31)),
    false,
  );
  assert.throws(() => deriveDistributionCredentialVerifier(Buffer.alloc(31)));
});

test('credential metadata validation trims labels and normalizes only unambiguous expiry timestamps', () => {
  assert.deepEqual(
    normalizeDistributionCredentialIssueInput({
      label: '  PHP distributor  ',
      expiresAt: '2027-01-02T03:04:05.006Z',
    }),
    {
      label: 'PHP distributor',
      expiresAt: new Date('2027-01-02T03:04:05.006Z'),
    },
  );
  assert.equal(normalizeDistributionCredentialExpiry(undefined), null);
  assert.throws(
    () => normalizeDistributionCredentialLabel('bad\nlabel'),
    ConfigurationValidationError,
  );
  assert.throws(
    () => normalizeDistributionCredentialExpiry('2027-01-02T03:04:05Z'),
    ConfigurationValidationError,
  );
});

test('ordinary credential metadata is structurally unable to include plaintext tokens or verifiers', () => {
  const ordinaryMetadataKeys = [
    'id',
    'lookupId',
    'label',
    'capability',
    'expiresAt',
    'revokedAt',
    'rotationSuccessorId',
    'createdAt',
    'updatedAt',
  ];
  assert.equal(ordinaryMetadataKeys.includes('token'), false);
  assert.equal(ordinaryMetadataKeys.includes('verifier'), false);
});

test('malformed persisted verifier material fails boundedly instead of becoming an authentication record', async () => {
  await assert.rejects(
    findDistributionCredentialForAuthentication(
      {
        query: async () =>
          ({
            rows: [
              {
                id: '00000000-0000-0000-0000-000000000001',
                lookup_id: 'lAAAAAAAAAAAAAAAAAAAAAA',
                verifier: Buffer.alloc(31),
                capability: 'distribution:read',
                expires_at: null,
                revoked_at: null,
              },
            ],
          }) as never,
      },
      'lAAAAAAAAAAAAAAAAAAAAAA',
    ),
  );
});
