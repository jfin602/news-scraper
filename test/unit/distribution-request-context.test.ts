import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Request } from 'express';

import {
  createDistributionRequestContextResolver,
  DistributionRequestContextError,
} from '../../src/app/web/distribution-request-context.ts';

describe('distribution request context', () => {
  it('uses the normalized immediate peer and ignores client forwarding headers without proxy trust', () => {
    const resolve = createDistributionRequestContextResolver({
      trustedProxy: 'none',
      distributionTransport: 'local_http',
    });
    assert.equal(
      resolve(
        request('::ffff:192.0.2.10', {
          'X-Forwarded-For': '198.51.100.8',
          Forwarded: 'for=198.51.100.9',
          'CF-Connecting-IP': '198.51.100.10',
        }),
      ),
      '192.0.2.10',
    );
    assert.equal(resolve(request('2001:0db8:0:0:0:0:0:1')), '2001:db8::1');
  });

  it('accepts exactly one client address from the configured loopback TLS proxy', () => {
    const resolve = createDistributionRequestContextResolver({
      trustedProxy: 'loopback',
      distributionTransport: 'trusted_proxy_https',
    });
    assert.equal(
      resolve(
        request('::1', {
          'X-Forwarded-For': '::ffff:198.51.100.8',
          'X-Forwarded-Proto': 'https',
        }),
      ),
      '198.51.100.8',
    );
  });

  for (const headers of [
    {
      'X-Forwarded-For': '198.51.100.8, 203.0.113.1',
      'X-Forwarded-Proto': 'https',
    },
    { 'X-Forwarded-For': 'x'.repeat(129), 'X-Forwarded-Proto': 'https' },
    { 'X-Forwarded-For': '198.51.100.8', 'X-Forwarded-Proto': 'https,http' },
  ]) {
    it('fails boundedly for malformed trusted-proxy forwarding state', () => {
      const resolve = createDistributionRequestContextResolver({
        trustedProxy: 'loopback',
        distributionTransport: 'trusted_proxy_https',
      });
      assert.throws(
        () => resolve(request('127.0.0.1', headers)),
        DistributionRequestContextError,
      );
    });
  }

  it('rejects untrusted proxy peers and spoofed production HTTPS headers', () => {
    const resolve = createDistributionRequestContextResolver({
      trustedProxy: 'loopback',
      distributionTransport: 'trusted_proxy_https',
    });
    assert.throws(
      () =>
        resolve(
          request('203.0.113.4', {
            'X-Forwarded-For': '198.51.100.8',
            'X-Forwarded-Proto': 'https',
          }),
        ),
      DistributionRequestContextError,
    );
    assert.throws(
      () =>
        resolve(request('127.0.0.1', { 'X-Forwarded-For': '198.51.100.8' })),
      DistributionRequestContextError,
    );
  });
});

function request(
  remoteAddress: string | undefined,
  headers: Readonly<Record<string, string>> = {},
): Request {
  return {
    socket: { remoteAddress },
    get(name: string): string | undefined {
      return headers[name] ?? headers[name.toLowerCase()];
    },
  } as unknown as Request;
}
