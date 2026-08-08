import { isIP } from 'node:net';

import type { ResolvedAddress } from './resolver.ts';

export type UnsafeAddressCategory =
  | (typeof IPV4_NON_PUBLIC_RANGES)[number]['name']
  | (typeof IPV6_NON_PUBLIC_RANGES)[number]['name']
  | 'ipv6_outside_global_unicast'
  | `ipv4_mapped_${(typeof IPV4_NON_PUBLIC_RANGES)[number]['name']}`;

export interface PublicUnicastAddress {
  readonly status: 'public_unicast';
  readonly address: string;
  readonly family: 4 | 6;
}

export interface InvalidAddress {
  readonly status: 'invalid';
}

export interface UnsafeAddress {
  readonly status: 'unsafe';
  readonly category: UnsafeAddressCategory;
}

export type AddressPolicyDecision =
  PublicUnicastAddress | InvalidAddress | UnsafeAddress;

type Ipv4UnsafeCategory = (typeof IPV4_NON_PUBLIC_RANGES)[number]['name'];
type Ipv4AddressPolicyDecision =
  | PublicUnicastAddress
  | InvalidAddress
  | Readonly<{ status: 'unsafe'; category: Ipv4UnsafeCategory }>;

const IPV4_NON_PUBLIC_RANGES = [
  { name: 'ipv4_zero_space', cidr: '0.0.0.0/8' },
  { name: 'ipv4_private_10', cidr: '10.0.0.0/8' },
  { name: 'ipv4_shared_cgnat', cidr: '100.64.0.0/10' },
  { name: 'ipv4_loopback', cidr: '127.0.0.0/8' },
  { name: 'ipv4_link_local', cidr: '169.254.0.0/16' },
  { name: 'ipv4_private_172', cidr: '172.16.0.0/12' },
  { name: 'ipv4_ietf_protocol_assignments', cidr: '192.0.0.0/24' },
  { name: 'ipv4_documentation_1', cidr: '192.0.2.0/24' },
  { name: 'ipv4_as112_v4', cidr: '192.31.196.0/24' },
  { name: 'ipv4_amt', cidr: '192.52.193.0/24' },
  { name: 'ipv4_6to4_relay', cidr: '192.88.99.0/24' },
  { name: 'ipv4_private_192', cidr: '192.168.0.0/16' },
  { name: 'ipv4_as112_direct_delegation', cidr: '192.175.48.0/24' },
  { name: 'ipv4_benchmarking', cidr: '198.18.0.0/15' },
  { name: 'ipv4_documentation_2', cidr: '198.51.100.0/24' },
  { name: 'ipv4_documentation_3', cidr: '203.0.113.0/24' },
  { name: 'ipv4_multicast', cidr: '224.0.0.0/4' },
  { name: 'ipv4_reserved_future', cidr: '240.0.0.0/4' },
] as const;

const IPV6_NON_PUBLIC_RANGES = [
  { name: 'ipv6_unspecified', cidr: '::/128' },
  { name: 'ipv6_loopback', cidr: '::1/128' },
  { name: 'ipv6_deprecated_low_address', cidr: '::/96' },
  { name: 'ipv6_nat64_well_known', cidr: '64:ff9b::/96' },
  { name: 'ipv6_nat64_local_use', cidr: '64:ff9b:1::/48' },
  { name: 'ipv6_discard_only', cidr: '100::/64' },
  { name: 'ipv6_dummy_prefix', cidr: '100:0:0:1::/64' },
  { name: 'ipv6_ietf_protocol_assignments', cidr: '2001::/23' },
  { name: 'ipv6_documentation', cidr: '2001:db8::/32' },
  { name: 'ipv6_deprecated_6to4', cidr: '2002::/16' },
  { name: 'ipv6_documentation_2', cidr: '3fff::/20' },
  { name: 'ipv6_segment_routing_sids', cidr: '5f00::/16' },
  { name: 'ipv6_unique_local', cidr: 'fc00::/7' },
  { name: 'ipv6_link_local', cidr: 'fe80::/10' },
  { name: 'ipv6_deprecated_site_local', cidr: 'fec0::/10' },
  { name: 'ipv6_multicast', cidr: 'ff00::/8' },
  { name: 'ipv6_as112_direct_delegation', cidr: '2620:4f:8000::/48' },
] as const;

const IPV4_RANGES = IPV4_NON_PUBLIC_RANGES.map((range) => ({
  ...range,
  ...parseIpv4Cidr(range.cidr),
}));
const IPV6_RANGES = IPV6_NON_PUBLIC_RANGES.map((range) => ({
  ...range,
  ...parseIpv6Cidr(range.cidr),
}));
const IPV6_GLOBAL_UNICAST = parseIpv6Cidr('2000::/3');

export function classifyPublicUnicastAddress(
  answer: ResolvedAddress,
): AddressPolicyDecision {
  if (
    typeof answer !== 'object' ||
    answer === null ||
    typeof answer.address !== 'string' ||
    (answer.family !== 4 && answer.family !== 6) ||
    answer.address.includes('%') ||
    isIP(answer.address) !== answer.family
  ) {
    return Object.freeze({ status: 'invalid' });
  }

  if (answer.family === 4) return classifyIpv4(answer.address);

  const groups = parseIpv6(answer.address);
  if (groups === undefined) return Object.freeze({ status: 'invalid' });

  if (isIpv4Mapped(groups)) {
    const embedded = ipv4FromMappedGroups(groups);
    const ipv4Decision = classifyIpv4(embedded);
    if (ipv4Decision.status === 'unsafe') {
      return Object.freeze({
        status: 'unsafe',
        category: `ipv4_mapped_${ipv4Decision.category}`,
      });
    }
    if (ipv4Decision.status === 'invalid') return ipv4Decision;
    return Object.freeze({
      status: 'public_unicast',
      address: normalizeIpv6(groups),
      family: 6,
    });
  }

  const value = ipv6GroupsToBigInt(groups);
  for (const range of IPV6_RANGES) {
    if (matchesPrefix(value, range.network, range.prefix, 128)) {
      return Object.freeze({ status: 'unsafe', category: range.name });
    }
  }
  if (
    !matchesPrefix(
      value,
      IPV6_GLOBAL_UNICAST.network,
      IPV6_GLOBAL_UNICAST.prefix,
      128,
    )
  ) {
    return Object.freeze({
      status: 'unsafe',
      category: 'ipv6_outside_global_unicast',
    });
  }

  return Object.freeze({
    status: 'public_unicast',
    address: normalizeIpv6(groups),
    family: 6,
  });
}

function classifyIpv4(address: string): Ipv4AddressPolicyDecision {
  const octets = parseIpv4(address);
  if (octets === undefined) return Object.freeze({ status: 'invalid' });
  const value = ipv4OctetsToNumber(octets);
  for (const range of IPV4_RANGES) {
    if (matchesPrefix(BigInt(value), BigInt(range.network), range.prefix, 32)) {
      return Object.freeze({ status: 'unsafe', category: range.name });
    }
  }
  return Object.freeze({
    status: 'public_unicast',
    address: octets.join('.'),
    family: 4,
  });
}

function parseIpv4(address: string): readonly number[] | undefined {
  if (isIP(address) !== 4) return undefined;
  const octets = address.split('.').map(Number);
  return octets.length === 4 ? octets : undefined;
}

function ipv4OctetsToNumber(octets: readonly number[]): number {
  return (
    octets[0]! * 0x1000000 +
    octets[1]! * 0x10000 +
    octets[2]! * 0x100 +
    octets[3]!
  );
}

function parseIpv6(address: string): readonly number[] | undefined {
  let hexadecimalAddress = address.toLowerCase();
  if (hexadecimalAddress.includes('.')) {
    const lastColon = hexadecimalAddress.lastIndexOf(':');
    const ipv4 = parseIpv4(hexadecimalAddress.slice(lastColon + 1));
    if (lastColon < 0 || ipv4 === undefined) return undefined;
    hexadecimalAddress = `${hexadecimalAddress.slice(0, lastColon)}:${(
      ipv4[0]! * 256 +
      ipv4[1]!
    ).toString(16)}:${(ipv4[2]! * 256 + ipv4[3]!).toString(16)}`;
  }

  const halves = hexadecimalAddress.split('::');
  if (halves.length > 2) return undefined;
  const left = splitIpv6Half(halves[0]!);
  const right = splitIpv6Half(halves[1] ?? '');
  if (left === undefined || right === undefined) return undefined;

  if (halves.length === 1) return left.length === 8 ? left : undefined;
  const omittedCount = 8 - left.length - right.length;
  if (omittedCount < 1) return undefined;
  return [...left, ...Array<number>(omittedCount).fill(0), ...right];
}

function splitIpv6Half(half: string): readonly number[] | undefined {
  if (half.length === 0) return [];
  const pieces = half.split(':');
  if (pieces.some((piece) => !/^[0-9a-f]{1,4}$/u.test(piece))) return undefined;
  return pieces.map((piece) => Number.parseInt(piece, 16));
}

function normalizeIpv6(groups: readonly number[]): string {
  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < groups.length;) {
    if (groups[index] !== 0) {
      index += 1;
      continue;
    }
    const start = index;
    while (index < groups.length && groups[index] === 0) index += 1;
    const length = index - start;
    if (length > bestLength && length >= 2) {
      bestStart = start;
      bestLength = length;
    }
  }

  const hexadecimal = groups.map((group) => group.toString(16));
  if (bestStart < 0) return hexadecimal.join(':');
  const left = hexadecimal.slice(0, bestStart).join(':');
  const right = hexadecimal.slice(bestStart + bestLength).join(':');
  if (left.length === 0 && right.length === 0) return '::';
  if (left.length === 0) return `::${right}`;
  if (right.length === 0) return `${left}::`;
  return `${left}::${right}`;
}

function isIpv4Mapped(groups: readonly number[]): boolean {
  return (
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff
  );
}

function ipv4FromMappedGroups(groups: readonly number[]): string {
  return [
    groups[6]! >> 8,
    groups[6]! & 0xff,
    groups[7]! >> 8,
    groups[7]! & 0xff,
  ].join('.');
}

function ipv6GroupsToBigInt(groups: readonly number[]): bigint {
  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n);
}

function matchesPrefix(
  value: bigint,
  network: bigint,
  prefix: number,
  bits: number,
): boolean {
  const shift = BigInt(bits - prefix);
  return value >> shift === network >> shift;
}

function parseIpv4Cidr(cidr: string): { network: number; prefix: number } {
  const [address, prefixText] = cidr.split('/');
  const octets = parseIpv4(address!);
  const prefix = Number(prefixText);
  if (
    octets === undefined ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > 32
  )
    throw new Error(`Invalid internal IPv4 CIDR: ${cidr}`);
  return { network: ipv4OctetsToNumber(octets), prefix };
}

function parseIpv6Cidr(cidr: string): { network: bigint; prefix: number } {
  const [address, prefixText] = cidr.split('/');
  const groups = parseIpv6(address!);
  const prefix = Number(prefixText);
  if (
    groups === undefined ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > 128
  )
    throw new Error(`Invalid internal IPv6 CIDR: ${cidr}`);
  return { network: ipv6GroupsToBigInt(groups), prefix };
}
