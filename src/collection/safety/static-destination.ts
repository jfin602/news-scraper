import type { CollectionDecisionReason } from '../decision.ts';
import {
  effectiveEndpointDomainRules,
  hostMatchesDomainRule,
  normalizeDomainHostname,
  type DomainRule,
} from '../../sources/configuration.ts';

export type DestinationContext = 'initial' | 'redirect';

export interface StaticDestinationPolicy {
  readonly sourceDomainRules: readonly DomainRule[];
  readonly endpointDomainRules: readonly DomainRule[];
}

export interface InitialDestinationInput {
  readonly context: 'initial';
  readonly destination: string;
}

export interface RedirectDestinationInput {
  readonly context: 'redirect';
  readonly currentUrl: string;
  readonly destination: string;
}

export type StaticDestinationInput =
  InitialDestinationInput | RedirectDestinationInput;

export interface StaticValidatedDestination {
  readonly status: 'validated';
  readonly context: DestinationContext;
  readonly requestUrl: string;
  readonly protocol: 'http:' | 'https:';
  readonly hostname: string;
  readonly port: 80 | 443;
}

type StaticDestinationBlockReason = Extract<
  CollectionDecisionReason,
  | 'invalid_destination_url'
  | 'unsupported_scheme'
  | 'domain_not_approved'
  | 'port_not_allowed'
>;

export interface StaticDestinationBlocked {
  readonly status: 'blocked';
  readonly stage: 'network_safety';
  readonly context: DestinationContext;
  readonly reason: StaticDestinationBlockReason;
}

export type StaticDestinationDecision =
  StaticValidatedDestination | StaticDestinationBlocked;

export function validateInitialStaticDestination(
  policy: StaticDestinationPolicy,
  destination: string,
): StaticDestinationDecision {
  return validateStaticDestination(policy, { context: 'initial', destination });
}

export function validateRedirectStaticDestination(
  policy: StaticDestinationPolicy,
  currentUrl: string,
  destination: string,
): StaticDestinationDecision {
  return validateStaticDestination(policy, {
    context: 'redirect',
    currentUrl,
    destination,
  });
}

export function validateStaticDestination(
  policy: StaticDestinationPolicy,
  input: StaticDestinationInput,
): StaticDestinationDecision {
  const url = resolveDestinationUrl(input);
  if (url === undefined)
    return blockedDestination(input.context, 'invalid_destination_url');

  if (
    url.hostname.length === 0 ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    return blockedDestination(input.context, 'invalid_destination_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return blockedDestination(input.context, 'unsupported_scheme');
  }

  let hostname: string;
  try {
    hostname = normalizeDomainHostname(url.hostname);
  } catch {
    return blockedDestination(input.context, 'invalid_destination_url');
  }

  const port = effectivePort(url.protocol, url.port);
  if (port === undefined) {
    return blockedDestination(input.context, 'port_not_allowed');
  }

  const effectiveDomainRules = effectiveEndpointDomainRules(
    policy.sourceDomainRules,
    policy.endpointDomainRules,
  );
  if (
    !effectiveDomainRules.some((rule) => hostMatchesDomainRule(hostname, rule))
  ) {
    return blockedDestination(input.context, 'domain_not_approved');
  }

  url.hostname = hostname;
  url.hash = '';
  return Object.freeze({
    status: 'validated',
    context: input.context,
    requestUrl: url.toString(),
    protocol: url.protocol,
    hostname,
    port,
  });
}

function resolveDestinationUrl(input: StaticDestinationInput): URL | undefined {
  try {
    return input.context === 'initial'
      ? new URL(input.destination)
      : new URL(input.destination, input.currentUrl);
  } catch {
    return undefined;
  }
}

function effectivePort(
  protocol: 'http:' | 'https:',
  explicitPort: string,
): 80 | 443 | undefined {
  const port = explicitPort.length === 0 ? undefined : Number(explicitPort);
  if (protocol === 'http:' && (port === undefined || port === 80)) return 80;
  if (protocol === 'https:' && (port === undefined || port === 443)) return 443;
  return undefined;
}

function blockedDestination(
  context: DestinationContext,
  reason: StaticDestinationBlockReason,
): StaticDestinationBlocked {
  return Object.freeze({
    status: 'blocked',
    stage: 'network_safety',
    context,
    reason,
  });
}
