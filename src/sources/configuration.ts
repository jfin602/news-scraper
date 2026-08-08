import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';

import { ConfigurationValidationError } from '../publications/configuration.ts';

export const APPROVAL_STATES = ['approved', 'unapproved'] as const;
export const LIFECYCLE_STATES = ['active', 'archived'] as const;
export const OPERATIONAL_STATES = ['enabled', 'paused', 'disabled'] as const;
export const ENDPOINT_TYPES = ['rss_atom'] as const;

export type ApprovalState = (typeof APPROVAL_STATES)[number];
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];
export type OperationalState = (typeof OPERATIONAL_STATES)[number];
export type EndpointType = (typeof ENDPOINT_TYPES)[number];

export interface DomainRule {
  readonly hostname: string;
  readonly includeSubdomains: boolean;
}

export interface ParsedConfiguredUrl {
  readonly value: string;
  readonly hostname: string;
}

export interface SourceEndpointConfiguration {
  readonly configKey: string;
  readonly endpointUrl: ParsedConfiguredUrl;
  readonly endpointType: EndpointType;
  readonly approvalState: ApprovalState;
  readonly lifecycleState: LifecycleState;
  readonly operationalState: OperationalState;
  readonly pollIntervalSeconds: number;
  readonly sourceDomainRules: readonly DomainRule[];
  readonly endpointDomainRules: readonly DomainRule[];
}

const CONFIG_KEY_MAX_LENGTH = 100;
const URL_MAX_LENGTH = 2048;
const POLL_INTERVAL_MINIMUM_SECONDS = 60;
const POLL_INTERVAL_MAXIMUM_SECONDS = 2_592_000;
const CONFIG_KEY_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const DNS_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

export function normalizeConfigKey(input: unknown): string {
  if (typeof input !== 'string') {
    throw new ConfigurationValidationError('configKey', 'must_be_a_string');
  }
  if (
    input.length === 0 ||
    input.length > CONFIG_KEY_MAX_LENGTH ||
    !CONFIG_KEY_PATTERN.test(input)
  ) {
    throw new ConfigurationValidationError('configKey', 'invalid_shape');
  }
  return input;
}

export function normalizeApprovalState(input: unknown): ApprovalState {
  return enumValue(input, APPROVAL_STATES, 'approvalState');
}

export function normalizeLifecycleState(input: unknown): LifecycleState {
  return enumValue(input, LIFECYCLE_STATES, 'lifecycleState');
}

export function normalizeOperationalState(input: unknown): OperationalState {
  return enumValue(input, OPERATIONAL_STATES, 'operationalState');
}

export function normalizeEndpointType(input: unknown): EndpointType {
  return enumValue(input, ENDPOINT_TYPES, 'endpointType');
}

export function normalizeDomainHostname(input: unknown): string {
  if (typeof input !== 'string') {
    throw new ConfigurationValidationError(
      'domainRule.hostname',
      'must_be_a_string',
    );
  }
  const hostname = input.trim();
  if (hostname.length === 0) {
    throw new ConfigurationValidationError(
      'domainRule.hostname',
      'must_not_be_blank',
    );
  }
  if (hostname.endsWith('.')) {
    if (hostname.endsWith('..')) {
      throw new ConfigurationValidationError(
        'domainRule.hostname',
        'invalid_dns_name',
      );
    }
  }
  const withoutRootDot = hostname.endsWith('.')
    ? hostname.slice(0, -1)
    : hostname;
  if (
    withoutRootDot.length === 0 ||
    isIP(withoutRootDot) !== 0 ||
    ['/', ':', '?', '#', '@', '[', ']'].some((character) =>
      withoutRootDot.includes(character),
    )
  ) {
    throw new ConfigurationValidationError(
      'domainRule.hostname',
      'invalid_dns_name',
    );
  }

  const ascii = domainToASCII(withoutRootDot);
  if (
    ascii.length === 0 ||
    ascii.length > 253 ||
    isIP(ascii) !== 0 ||
    !ascii.split('.').every((label) => DNS_LABEL_PATTERN.test(label))
  ) {
    throw new ConfigurationValidationError(
      'domainRule.hostname',
      'invalid_dns_name',
    );
  }
  return ascii.toLowerCase();
}

export function normalizeDomainRules(input: unknown): readonly DomainRule[] {
  if (!Array.isArray(input)) {
    throw new ConfigurationValidationError('domainRules', 'must_be_an_array');
  }
  const rules: DomainRule[] = [];
  const hostnames = new Set<string>();
  for (const ruleInput of input) {
    const rule = normalizeDomainRule(ruleInput);
    if (hostnames.has(rule.hostname)) {
      throw new ConfigurationValidationError(
        'domainRules',
        'duplicate_hostname',
      );
    }
    hostnames.add(rule.hostname);
    rules.push(rule);
  }
  return Object.freeze(rules);
}

export function hostMatchesDomainRule(
  hostnameInput: unknown,
  ruleInput: DomainRule,
): boolean {
  const hostname = normalizeDomainHostname(hostnameInput);
  const rule = normalizeDomainRule(ruleInput);
  return (
    hostname === rule.hostname ||
    (rule.includeSubdomains && hostname.endsWith(`.${rule.hostname}`))
  );
}

export function endpointRuleIsNarrowerThanSourceRule(
  sourceRuleInput: DomainRule,
  endpointRuleInput: DomainRule,
): boolean {
  const sourceRule = normalizeDomainRule(sourceRuleInput);
  const endpointRule = normalizeDomainRule(endpointRuleInput);
  if (!hostMatchesDomainRule(endpointRule.hostname, sourceRule)) return false;
  return sourceRule.includeSubdomains || !endpointRule.includeSubdomains;
}

export function effectiveEndpointDomainRules(
  sourceRulesInput: unknown,
  endpointNarrowingInput: unknown | undefined,
): readonly DomainRule[] {
  const sourceRules = normalizeDomainRules(sourceRulesInput);
  if (endpointNarrowingInput === undefined) return sourceRules;
  const narrowingRules = normalizeDomainRules(endpointNarrowingInput);
  if (narrowingRules.length === 0) return sourceRules;
  for (const narrowingRule of narrowingRules) {
    if (
      !sourceRules.some((sourceRule) =>
        endpointRuleIsNarrowerThanSourceRule(sourceRule, narrowingRule),
      )
    ) {
      throw new ConfigurationValidationError(
        'endpointDomainRules',
        'widens_source_policy',
      );
    }
  }
  return narrowingRules;
}

export function parseEndpointUrl(
  input: unknown,
): Readonly<ParsedConfiguredUrl> {
  return parseConfiguredUrl(input, 'endpointUrl', true);
}

export function parseSourceSiteUrl(
  input: unknown,
): Readonly<ParsedConfiguredUrl> {
  return parseConfiguredUrl(input, 'siteUrl');
}

export function normalizePollIntervalSeconds(input: unknown): number {
  if (
    typeof input !== 'number' ||
    !Number.isInteger(input) ||
    input < POLL_INTERVAL_MINIMUM_SECONDS ||
    input > POLL_INTERVAL_MAXIMUM_SECONDS
  ) {
    throw new ConfigurationValidationError(
      'pollIntervalSeconds',
      'must_be_an_integer_within_bounds',
    );
  }
  return input;
}

export function normalizeSourceEndpointConfiguration(
  input: unknown,
): Readonly<SourceEndpointConfiguration> {
  const record = configurationRecord(input, 'sourceEndpoint');
  const approvalState = normalizeApprovalState(record.approvalState);
  const endpointUrl = parseEndpointUrl(record.endpointUrl);
  const sourceDomainRules = normalizeDomainRules(record.sourceDomainRules);
  const endpointDomainRules = effectiveEndpointDomainRules(
    sourceDomainRules,
    record.endpointDomainRules,
  );

  if (
    approvalState === 'approved' &&
    !endpointDomainRules.some((rule) =>
      hostMatchesDomainRule(endpointUrl.hostname, rule),
    )
  ) {
    throw new ConfigurationValidationError(
      'endpointUrl',
      'hostname_outside_effective_domain_policy',
    );
  }

  return Object.freeze({
    configKey: normalizeConfigKey(record.configKey),
    endpointUrl,
    endpointType: normalizeEndpointType(record.endpointType),
    approvalState,
    lifecycleState: normalizeLifecycleState(record.lifecycleState),
    operationalState: normalizeOperationalState(record.operationalState),
    pollIntervalSeconds: normalizePollIntervalSeconds(
      record.pollIntervalSeconds,
    ),
    sourceDomainRules,
    endpointDomainRules,
  });
}

function normalizeDomainRule(input: unknown): Readonly<DomainRule> {
  const record = configurationRecord(input, 'domainRule');
  if (
    record.includeSubdomains !== undefined &&
    typeof record.includeSubdomains !== 'boolean'
  ) {
    throw new ConfigurationValidationError(
      'domainRule.includeSubdomains',
      'must_be_boolean',
    );
  }
  return Object.freeze({
    hostname: normalizeDomainHostname(record.hostname),
    includeSubdomains: record.includeSubdomains ?? false,
  });
}

function parseConfiguredUrl(
  input: unknown,
  field: 'endpointUrl' | 'siteUrl',
  rejectFragment = false,
): Readonly<ParsedConfiguredUrl> {
  if (
    typeof input !== 'string' ||
    input.length === 0 ||
    input.length > URL_MAX_LENGTH
  ) {
    throw new ConfigurationValidationError(field, 'invalid_url');
  }
  if (input !== input.trim()) {
    throw new ConfigurationValidationError(field, 'invalid_url');
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ConfigurationValidationError(field, 'invalid_url');
  }
  if (url.protocol.length === 0 || url.hostname.length === 0) {
    throw new ConfigurationValidationError(
      field,
      'absolute_url_with_hostname_required',
    );
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new ConfigurationValidationError(field, 'credentials_not_allowed');
  }
  if (rejectFragment && url.hash.length > 0) {
    throw new ConfigurationValidationError(field, 'fragment_not_allowed');
  }
  return Object.freeze({ value: input, hostname: url.hostname.toLowerCase() });
}

function enumValue<const T extends readonly string[]>(
  input: unknown,
  values: T,
  field: string,
): T[number] {
  if (typeof input === 'string' && values.includes(input))
    return input as T[number];
  throw new ConfigurationValidationError(field, 'unsupported_value');
}

function configurationRecord(
  input: unknown,
  field: string,
): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ConfigurationValidationError(field, 'must_be_an_object');
  }
  return input as Record<string, unknown>;
}
