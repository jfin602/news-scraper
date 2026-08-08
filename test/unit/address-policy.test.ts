import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyPublicUnicastAddress } from '../../src/collection/safety/address-policy.ts';
import type { ResolvedAddress } from '../../src/collection/safety/resolver.ts';

test('accepts ordinary globally routable IPv4 and IPv6 addresses', () => {
  assert.deepEqual(classify({ address: '8.8.8.8', family: 4 }), {
    status: 'public_unicast',
    address: '8.8.8.8',
    family: 4,
  });
  assert.deepEqual(classify({ address: '2606:4700:4700::1111', family: 6 }), {
    status: 'public_unicast',
    address: '2606:4700:4700::1111',
    family: 6,
  });
});

test('rejects required IPv4 non-public and special-use categories', () => {
  const blockedAddresses = [
    '0.0.0.0',
    '0.255.255.255',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.0.0.1',
    '192.0.2.1',
    '192.88.99.1',
    '192.168.0.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '239.255.255.255',
    '240.0.0.1',
    '255.255.255.255',
  ];

  for (const address of blockedAddresses) {
    assert.equal(classify({ address, family: 4 }).status, 'unsafe', address);
  }
});

test('rejects required IPv6 non-public, translation, and special-use categories', () => {
  const blockedAddresses = [
    '::',
    '::1',
    '::2',
    '64:ff9b::808:808',
    '64:ff9b:1::808:808',
    '100::1',
    '100:0:0:1::1',
    '2001::1',
    '2001:db8::1',
    '2002:808:808::1',
    '3fff::1',
    '5f00::1',
    'fc00::1',
    'fd00:ec2::254',
    'fe80::1',
    'fec0::1',
    'ff02::1',
  ];

  for (const address of blockedAddresses) {
    assert.equal(classify({ address, family: 6 }).status, 'unsafe', address);
  }
});

test('applies IPv4 policy to dotted and hexadecimal IPv4-mapped IPv6 forms', () => {
  for (const address of [
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '::ffff:a00:1',
    '::ffff:169.254.169.254',
    '::ffff:a9fe:a9fe',
    '::ffff:100.64.0.1',
    '::ffff:6440:1',
    '::ffff:192.0.2.1',
    '::ffff:c000:201',
  ]) {
    assert.equal(classify({ address, family: 6 }).status, 'unsafe', address);
  }

  const dotted = classify({ address: '::ffff:8.8.8.8', family: 6 });
  const hexadecimal = classify({ address: '::ffff:808:808', family: 6 });
  assert.deepEqual(dotted, {
    status: 'public_unicast',
    address: '::ffff:808:808',
    family: 6,
  });
  assert.deepEqual(hexadecimal, dotted);
});

test('fails closed on malformed syntax, family mismatches, and scoped addresses', () => {
  const malformed = [
    { address: 'not-an-ip', family: 4 },
    { address: '8.8.8.8', family: 6 },
    { address: '2606:4700:4700::1111', family: 4 },
    { address: 'fe80::1%lo0', family: 6 },
    { address: '001.2.3.4', family: 4 },
  ] as const;

  for (const answer of malformed) {
    assert.deepEqual(classify(answer as ResolvedAddress), {
      status: 'invalid',
    });
  }
});

function classify(answer: ResolvedAddress) {
  return classifyPublicUnicastAddress(answer);
}
