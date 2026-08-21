import { isIP } from 'node:net';

import type { Request } from 'express';

import type { DistributionTransport, TrustedProxyMode } from './web-config.ts';

const MAXIMUM_FORWARDED_HEADER_LENGTH = 128;

export class DistributionRequestContextError extends Error {}

export interface DistributionRequestContextConfig {
  readonly trustedProxy: TrustedProxyMode;
  readonly distributionTransport: DistributionTransport;
}

/**
 * Resolves only the single-hop proxy arrangement we operate. It intentionally
 * does not use Express's general proxy-chain parser: accepting a variable
 * number of forwarded hops would exceed this deployment boundary.
 */
export function createDistributionRequestContextResolver(
  config: DistributionRequestContextConfig,
): (request: Request) => string {
  return (request) => {
    const peer = normalizedAddress(request.socket.remoteAddress);
    if (peer === undefined) throw new DistributionRequestContextError();

    if (config.trustedProxy === 'none') {
      if (config.distributionTransport === 'trusted_proxy_https') {
        throw new DistributionRequestContextError();
      }
      return peer;
    }

    if (!isLoopback(peer)) throw new DistributionRequestContextError();
    if (
      config.distributionTransport === 'trusted_proxy_https' &&
      singleForwardedValue(request.get('X-Forwarded-Proto')) !== 'https'
    ) {
      throw new DistributionRequestContextError();
    }
    const forwardedFor = singleForwardedValue(request.get('X-Forwarded-For'));
    const client = normalizedAddress(forwardedFor);
    if (client === undefined) throw new DistributionRequestContextError();
    return client;
  };
}

function singleForwardedValue(value: string | undefined): string | undefined {
  if (
    value === undefined ||
    value.length === 0 ||
    value.length > MAXIMUM_FORWARDED_HEADER_LENGTH ||
    value.includes(',') ||
    value !== value.trim()
  ) {
    return undefined;
  }
  return value;
}

function normalizedAddress(value: string | undefined): string | undefined {
  if (value === undefined || isIP(value) === 0) return undefined;
  if (isIP(value) === 4) return value;

  let canonical: string;
  try {
    canonical = new URL(`http://[${value}]`).hostname.slice(1, -1);
  } catch {
    return undefined;
  }
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u.exec(canonical);
  if (mapped === null) return canonical;
  const high = Number.parseInt(mapped[1]!, 16);
  const low = Number.parseInt(mapped[2]!, 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

function isLoopback(address: string): boolean {
  return address === '::1' || /^127(?:\.\d{1,3}){3}$/u.test(address);
}
