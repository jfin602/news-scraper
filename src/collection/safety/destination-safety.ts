import type { CollectionDecisionReason } from '../decision.ts';
import { classifyPublicUnicastAddress } from './address-policy.ts';
import type { DestinationResolver, ResolvedAddress } from './resolver.ts';
import {
  validateStaticDestination,
  type DestinationContext,
  type StaticDestinationBlocked,
  type StaticDestinationInput,
  type StaticDestinationPolicy,
} from './static-destination.ts';

export interface ValidatedDestination {
  readonly status: 'validated';
  readonly context: DestinationContext;
  readonly requestUrl: string;
  readonly protocol: 'http:' | 'https:';
  readonly hostname: string;
  readonly port: 80 | 443;
  readonly addresses: readonly ResolvedAddress[];
}

type DnsDestinationBlockReason = Extract<
  CollectionDecisionReason,
  'dns_resolution_failed' | 'unsafe_resolved_address'
>;

export interface DnsDestinationBlocked {
  readonly status: 'blocked';
  readonly stage: 'network_safety';
  readonly context: DestinationContext;
  readonly reason: DnsDestinationBlockReason;
}

export type DestinationSafetyDecision =
  ValidatedDestination | StaticDestinationBlocked | DnsDestinationBlocked;

export async function validateInitialDestination(
  policy: StaticDestinationPolicy,
  destination: string,
  resolver: DestinationResolver,
): Promise<DestinationSafetyDecision> {
  return validateDestination(
    policy,
    { context: 'initial', destination },
    resolver,
  );
}

export async function validateRedirectDestination(
  policy: StaticDestinationPolicy,
  currentUrl: string,
  destination: string,
  resolver: DestinationResolver,
): Promise<DestinationSafetyDecision> {
  return validateDestination(
    policy,
    { context: 'redirect', currentUrl, destination },
    resolver,
  );
}

export async function validateDestination(
  policy: StaticDestinationPolicy,
  input: StaticDestinationInput,
  resolver: DestinationResolver,
): Promise<DestinationSafetyDecision> {
  const staticDecision = validateStaticDestination(policy, input);
  if (staticDecision.status === 'blocked') return staticDecision;

  let answers: readonly ResolvedAddress[];
  try {
    answers = await resolver.resolve(staticDecision.hostname);
  } catch {
    return blockedDestination(staticDecision.context, 'dns_resolution_failed');
  }
  if (!Array.isArray(answers) || answers.length === 0) {
    return blockedDestination(staticDecision.context, 'dns_resolution_failed');
  }

  let classified: ReturnType<typeof classifyPublicUnicastAddress>[];
  try {
    classified = answers.map((answer) => classifyPublicUnicastAddress(answer));
  } catch {
    return blockedDestination(staticDecision.context, 'dns_resolution_failed');
  }
  if (classified.some((decision) => decision.status === 'invalid')) {
    return blockedDestination(staticDecision.context, 'dns_resolution_failed');
  }
  if (classified.some((decision) => decision.status === 'unsafe')) {
    return blockedDestination(
      staticDecision.context,
      'unsafe_resolved_address',
    );
  }

  const addresses: ResolvedAddress[] = [];
  const seen = new Set<string>();
  for (const decision of classified) {
    if (decision.status !== 'public_unicast') continue;
    const key = `${decision.family}:${decision.address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    addresses.push(
      Object.freeze({ address: decision.address, family: decision.family }),
    );
  }
  if (addresses.length === 0) {
    return blockedDestination(staticDecision.context, 'dns_resolution_failed');
  }

  return Object.freeze({
    ...staticDecision,
    addresses: Object.freeze(addresses),
  });
}

function blockedDestination(
  context: DestinationContext,
  reason: DnsDestinationBlockReason,
): DnsDestinationBlocked {
  return Object.freeze({
    status: 'blocked',
    stage: 'network_safety',
    context,
    reason,
  });
}
