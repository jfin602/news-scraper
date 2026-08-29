import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';

import { ConfigurationValidationError } from '../publication/configuration.ts';
import {
  normalizeHtmlListingProfile,
  type NormalizedHtmlListingProfile,
} from '../collection/parsers/html-listing-profile.ts';

export const APPROVAL_STATES = ['approved', 'unapproved'] as const;
export const LIFECYCLE_STATES = ['active', 'archived'] as const;
export const OPERATIONAL_STATES = ['enabled', 'paused', 'disabled'] as const;
export const ENDPOINT_TYPES = ['rss_atom', 'html_listing'] as const;

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

interface SourceEndpointConfigurationBase {
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

export interface RssAtomEndpointConfiguration extends SourceEndpointConfigurationBase {
  readonly endpointType: 'rss_atom';
}

export interface HtmlListingEndpointConfiguration extends SourceEndpointConfigurationBase {
  readonly endpointType: 'html_listing';
  readonly htmlListingProfile: NormalizedHtmlListingProfile;
}

export type SourceEndpointConfiguration =
  RssAtomEndpointConfiguration | HtmlListingEndpointConfiguration;

export interface SourceConfiguration {
  readonly configKey: string;
  readonly displayName: string;
  readonly siteUrl: ParsedConfiguredUrl;
  readonly approvalState: ApprovalState;
  readonly lifecycleState: LifecycleState;
  readonly operationalState: OperationalState;
  readonly domainRules: readonly DomainRule[];
  readonly priority: number;
  readonly rssAtomAdmissionIncludePhrases: readonly string[];
  readonly rssAtomAdmissionExcludePhrases: readonly string[];
}

export interface SourceRssAtomAdmissionPolicy {
  readonly rssAtomAdmissionIncludePhrases: readonly string[];
  readonly rssAtomAdmissionExcludePhrases: readonly string[];
}

const CONFIG_KEY_MAX_LENGTH = 100;
const URL_MAX_LENGTH = 2048;
export const MINIMUM_POLL_INTERVAL_SECONDS = 60;
const POLL_INTERVAL_MAXIMUM_SECONDS = 2_592_000;
const POSTGRES_INTEGER_MAXIMUM = 2_147_483_647;
export const RSS_ATOM_ADMISSION_PHRASE_MAXIMUM_COUNT = 64;
export const RSS_ATOM_ADMISSION_PHRASE_MAXIMUM_LENGTH = 512;
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
    input < MINIMUM_POLL_INTERVAL_SECONDS ||
    input > POLL_INTERVAL_MAXIMUM_SECONDS
  ) {
    throw new ConfigurationValidationError(
      'pollIntervalSeconds',
      'must_be_an_integer_within_bounds',
    );
  }
  return input;
}

export function normalizeSourcePriority(input: unknown): number {
  if (
    typeof input !== 'number' ||
    !Number.isSafeInteger(input) ||
    input < 0 ||
    input > POSTGRES_INTEGER_MAXIMUM
  ) {
    throw new ConfigurationValidationError(
      'source.priority',
      'must_be_a_nonnegative_postgresql_integer',
    );
  }
  return input;
}

export function normalizeRssAtomAdmissionPhraseList(
  input: unknown,
  field: string,
): readonly string[] {
  if (!Array.isArray(input)) {
    throw new ConfigurationValidationError(field, 'must_be_an_array');
  }
  if (input.length > RSS_ATOM_ADMISSION_PHRASE_MAXIMUM_COUNT) {
    throw new ConfigurationValidationError(
      field,
      'must_contain_at_most_64_phrases',
    );
  }
  return Object.freeze(
    input.map((value) => {
      if (typeof value !== 'string') {
        throw new ConfigurationValidationError(
          field,
          'phrase_must_be_a_string',
        );
      }
      const phrase = value.trim();
      if (
        phrase.length === 0 ||
        phrase.length > RSS_ATOM_ADMISSION_PHRASE_MAXIMUM_LENGTH ||
        /\p{Cc}/u.test(phrase)
      ) {
        throw new ConfigurationValidationError(field, 'invalid_phrase');
      }
      return phrase;
    }),
  );
}

export function normalizeSourceRssAtomAdmissionPolicy(
  input: unknown,
): Readonly<SourceRssAtomAdmissionPolicy> {
  const record = configurationRecord(input, 'source.rssAtomAdmissionPolicy');
  return Object.freeze({
    rssAtomAdmissionIncludePhrases:
      record.rssAtomAdmissionIncludePhrases === undefined
        ? Object.freeze([])
        : normalizeRssAtomAdmissionPhraseList(
            record.rssAtomAdmissionIncludePhrases,
            'source.rssAtomAdmissionIncludePhrases',
          ),
    rssAtomAdmissionExcludePhrases:
      record.rssAtomAdmissionExcludePhrases === undefined
        ? Object.freeze([])
        : normalizeRssAtomAdmissionPhraseList(
            record.rssAtomAdmissionExcludePhrases,
            'source.rssAtomAdmissionExcludePhrases',
          ),
  });
}

export function normalizeSourceEndpointConfiguration(
  input: unknown,
): Readonly<SourceEndpointConfiguration> {
  const record = configurationRecord(input, 'sourceEndpoint');
  const approvalState = normalizeApprovalState(record.approvalState);
  const endpointUrl = parseEndpointUrl(record.endpointUrl);
  const sourceDomainRules = normalizeDomainRules(record.sourceDomainRules);
  const endpointDomainRules =
    record.endpointDomainRules === undefined
      ? Object.freeze([])
      : normalizeDomainRules(record.endpointDomainRules);
  const effectiveDomainRules = effectiveEndpointDomainRules(
    sourceDomainRules,
    endpointDomainRules,
  );

  if (
    approvalState === 'approved' &&
    !effectiveDomainRules.some((rule) =>
      hostMatchesDomainRule(endpointUrl.hostname, rule),
    )
  ) {
    throw new ConfigurationValidationError(
      'endpointUrl',
      'hostname_outside_effective_domain_policy',
    );
  }

  const common = {
    configKey: normalizeConfigKey(record.configKey),
    endpointUrl,
    approvalState,
    lifecycleState: normalizeLifecycleState(record.lifecycleState),
    operationalState: normalizeOperationalState(record.operationalState),
    pollIntervalSeconds: normalizePollIntervalSeconds(
      record.pollIntervalSeconds,
    ),
    sourceDomainRules,
    endpointDomainRules,
  };
  const endpointType = normalizeEndpointType(record.endpointType);
  if (endpointType === 'html_listing') {
    if (record.htmlListingProfile === undefined) {
      throw new ConfigurationValidationError(
        'htmlListingProfile',
        'required_for_html_listing',
      );
    }
    try {
      return Object.freeze({
        ...common,
        endpointType,
        htmlListingProfile: normalizeHtmlListingProfile(
          record.htmlListingProfile,
        ),
      });
    } catch {
      throw new ConfigurationValidationError(
        'htmlListingProfile',
        'invalid_html_listing_profile',
      );
    }
  }
  if (record.htmlListingProfile !== undefined) {
    throw new ConfigurationValidationError(
      'htmlListingProfile',
      'not_allowed_for_rss_atom',
    );
  }
  return Object.freeze({ ...common, endpointType });
}

export function normalizeSourceConfiguration(
  input: unknown,
): Readonly<SourceConfiguration> {
  const record = configurationRecord(input, 'source');
  return Object.freeze({
    configKey: normalizeConfigKey(record.configKey),
    displayName: normalizedDisplayName(record.displayName),
    siteUrl: parseSourceSiteUrl(record.siteUrl),
    approvalState: normalizeApprovalState(record.approvalState),
    lifecycleState: normalizeLifecycleState(record.lifecycleState),
    operationalState: normalizeOperationalState(record.operationalState),
    domainRules: normalizeDomainRules(record.domainRules),
    priority: normalizeSourcePriority(record.priority ?? 0),
    ...normalizeSourceRssAtomAdmissionPolicy(record),
  });
}

export function normalizeSourceEndpointConfigurationForSource(
  input: unknown,
  sourceDomainRules: unknown,
): Readonly<SourceEndpointConfiguration> {
  const record = configurationRecord(input, 'sourceEndpoint');
  return normalizeSourceEndpointConfiguration({
    ...record,
    sourceDomainRules,
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

function normalizedDisplayName(input: unknown): string {
  if (typeof input !== 'string') {
    throw new ConfigurationValidationError(
      'source.displayName',
      'must_be_a_string',
    );
  }
  const displayName = input.trim();
  if (displayName.length === 0) {
    throw new ConfigurationValidationError(
      'source.displayName',
      'must_not_be_blank',
    );
  }
  if (displayName.length > 200) {
    throw new ConfigurationValidationError('source.displayName', 'too_long');
  }
  return displayName;
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
