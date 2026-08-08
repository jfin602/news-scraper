import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ConfigurationValidationError } from '../../src/publications/configuration.ts';
import {
  effectiveEndpointDomainRules,
  endpointRuleIsNarrowerThanSourceRule,
  hostMatchesDomainRule,
  normalizeApprovalState,
  normalizeConfigKey,
  normalizeDomainHostname,
  normalizeDomainRules,
  normalizeEndpointType,
  normalizeLifecycleState,
  normalizeOperationalState,
  normalizePollIntervalSeconds,
  normalizeSourceEndpointConfiguration,
  normalizeSourceEndpointConfigurationForSource,
  normalizeSourceConfiguration,
  parseEndpointUrl,
  parseSourceSiteUrl,
} from '../../src/sources/configuration.ts';

test('validates Source and endpoint config keys', () => {
  assert.equal(normalizeConfigKey('main_feed'), 'main_feed');
  assert.equal(normalizeConfigKey('a'.repeat(100)), 'a'.repeat(100));
  for (const key of [
    '',
    '_leading',
    'trailing_',
    'two__segments',
    'Uppercase',
    'space key',
    'a'.repeat(101),
  ]) {
    assertConfigurationFailure(() => normalizeConfigKey(key));
  }
});

test('accepts only independent canonical state vocabularies and endpoint types', () => {
  for (const state of ['approved', 'unapproved'])
    assert.equal(normalizeApprovalState(state), state);
  for (const state of ['active', 'archived'])
    assert.equal(normalizeLifecycleState(state), state);
  for (const state of ['enabled', 'paused', 'disabled'])
    assert.equal(normalizeOperationalState(state), state);
  assert.equal(normalizeEndpointType('rss_atom'), 'rss_atom');
  for (const value of ['invalid', 'html', 'rss']) {
    assertConfigurationFailure(() => normalizeApprovalState(value));
    assertConfigurationFailure(() => normalizeLifecycleState(value));
    assertConfigurationFailure(() => normalizeOperationalState(value));
    assertConfigurationFailure(() => normalizeEndpointType(value));
  }
});

test('normalizes DNS hostnames and rejects non-hostname domain rules', () => {
  assert.equal(
    normalizeDomainHostname('  NeWs.Example.COM.  '),
    'news.example.com',
  );
  assert.equal(
    normalizeDomainHostname('bücher.example'),
    'xn--bcher-kva.example',
  );
  for (const hostname of [
    '',
    'https://example.com',
    'example.com/path',
    'example.com?x=1',
    'example.com#fragment',
    'user@example.com',
    'example.com:443',
    '192.0.2.1',
    '2001:db8::1',
    'bad..example',
    '-bad.example',
    `${'a'.repeat(64)}.example`,
  ]) {
    assertConfigurationFailure(() => normalizeDomainHostname(hostname));
  }
  assertConfigurationFailure(() =>
    normalizeDomainRules([
      { hostname: 'Example.com' },
      { hostname: 'example.com.' },
    ]),
  );
});

test('matches exact hosts and DNS-label descendants without suffix confusion', () => {
  const exact = { hostname: 'example.com', includeSubdomains: false };
  const subtree = { hostname: 'example.com', includeSubdomains: true };
  assert.equal(hostMatchesDomainRule('EXAMPLE.COM.', exact), true);
  assert.equal(hostMatchesDomainRule('news.example.com', exact), false);
  assert.equal(hostMatchesDomainRule('example.com', subtree), true);
  assert.equal(hostMatchesDomainRule('news.example.com', subtree), true);
  assert.equal(hostMatchesDomainRule('evil-example.com', subtree), false);
  assert.equal(hostMatchesDomainRule('example.com.evil.test', subtree), false);
});

test('requires endpoint policies to be equal to or narrower than Source maximum policy', () => {
  const sourceExact = { hostname: 'example.com', includeSubdomains: false };
  const sourceSubtree = { hostname: 'example.com', includeSubdomains: true };
  assert.equal(
    endpointRuleIsNarrowerThanSourceRule(sourceExact, sourceExact),
    true,
  );
  assert.equal(
    endpointRuleIsNarrowerThanSourceRule(sourceExact, {
      hostname: 'example.com',
      includeSubdomains: true,
    }),
    false,
  );
  assert.equal(
    endpointRuleIsNarrowerThanSourceRule(sourceSubtree, {
      hostname: 'news.example.com',
      includeSubdomains: false,
    }),
    true,
  );
  assert.equal(
    endpointRuleIsNarrowerThanSourceRule(sourceSubtree, {
      hostname: 'news.example.com',
      includeSubdomains: true,
    }),
    true,
  );
  assert.equal(
    endpointRuleIsNarrowerThanSourceRule(sourceSubtree, {
      hostname: 'example.net',
      includeSubdomains: false,
    }),
    false,
  );
  assert.deepEqual(
    effectiveEndpointDomainRules([sourceSubtree], undefined),
    normalizeDomainRules([sourceSubtree]),
  );
  assert.deepEqual(
    effectiveEndpointDomainRules([sourceSubtree], []),
    normalizeDomainRules([sourceSubtree]),
  );
  assertConfigurationFailure(() =>
    effectiveEndpointDomainRules([sourceSubtree], 'not-an-array'),
  );
  assertConfigurationFailure(() =>
    effectiveEndpointDomainRules(
      [sourceSubtree],
      [{ hostname: 'news.example.com' }, { hostname: 'example.net' }],
    ),
  );
});

test('parses configured URLs structurally without applying request safety policy', () => {
  assert.deepEqual(parseEndpointUrl('ftp://Feeds.Example.com:21/path?q=1'), {
    value: 'ftp://Feeds.Example.com:21/path?q=1',
    hostname: 'feeds.example.com',
  });
  assert.deepEqual(parseSourceSiteUrl('https://example.com/about#team'), {
    value: 'https://example.com/about#team',
    hostname: 'example.com',
  });
  assertConfigurationFailure(() =>
    parseSourceSiteUrl('https://user:pass@example.com/about'),
  );
  for (const url of [
    '/relative',
    'mailto:news@example.com',
    'https://user:pass@example.com/feed',
    'https://example.com/feed#part',
  ]) {
    assertConfigurationFailure(() => parseEndpointUrl(url));
  }
});

test('validates approved endpoint containment and preserves unapproved drafting distinction', () => {
  const base = {
    configKey: 'main_feed',
    endpointUrl: 'https://news.example.com/feed.xml?format=atom',
    endpointType: 'rss_atom',
    lifecycleState: 'active',
    operationalState: 'enabled',
    pollIntervalSeconds: 300,
    sourceDomainRules: [{ hostname: 'example.com', includeSubdomains: true }],
  };
  assert.equal(
    normalizeSourceEndpointConfiguration({ ...base, approvalState: 'approved' })
      .endpointUrl.value,
    base.endpointUrl,
  );
  assert.deepEqual(
    normalizeSourceEndpointConfiguration({ ...base, approvalState: 'approved' })
      .endpointDomainRules,
    [],
  );
  assertConfigurationFailure(() =>
    normalizeSourceEndpointConfiguration({
      ...base,
      approvalState: 'approved',
      endpointDomainRules: [{ hostname: 'feeds.example.com' }],
    }),
  );
  assertConfigurationFailure(() =>
    normalizeSourceEndpointConfiguration({
      ...base,
      approvalState: 'approved',
      endpointUrl: 'https://outside.example.net/feed.xml',
    }),
  );
  assert.equal(
    normalizeSourceEndpointConfiguration({
      ...base,
      approvalState: 'unapproved',
      endpointUrl: 'https://outside.example.net/feed.xml',
    }).approvalState,
    'unapproved',
  );
});

test('enforces positive bounded integer polling intervals', () => {
  for (const value of [59, 0, -1, 60.5, 2_592_001]) {
    assertConfigurationFailure(() => normalizePollIntervalSeconds(value));
  }
  for (const value of [60, 300, 2_592_000]) {
    assert.equal(normalizePollIntervalSeconds(value), value);
  }
});

test('normalizes Source writes and validates endpoint writes against supplied Source policy', () => {
  assert.deepEqual(
    normalizeSourceConfiguration({
      configKey: 'primary_source',
      displayName: '  Primary Source  ',
      siteUrl: 'https://source.example/about',
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
      domainRules: [{ hostname: 'example.com', includeSubdomains: true }],
    }),
    {
      configKey: 'primary_source',
      displayName: 'Primary Source',
      siteUrl: {
        value: 'https://source.example/about',
        hostname: 'source.example',
      },
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
      domainRules: [{ hostname: 'example.com', includeSubdomains: true }],
    },
  );

  assertConfigurationFailure(() =>
    normalizeSourceEndpointConfigurationForSource(
      {
        configKey: 'feed',
        endpointUrl: 'https://outside.example.net/feed.xml',
        endpointType: 'rss_atom',
        approvalState: 'approved',
        lifecycleState: 'active',
        operationalState: 'enabled',
        pollIntervalSeconds: 300,
      },
      [{ hostname: 'example.com', includeSubdomains: true }],
    ),
  );
});

function assertConfigurationFailure(operation: () => unknown): void {
  assert.throws(
    operation,
    (error: unknown) => error instanceof ConfigurationValidationError,
  );
}
