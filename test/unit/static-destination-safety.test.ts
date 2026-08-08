import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  validateInitialStaticDestination,
  validateRedirectStaticDestination,
  type StaticDestinationDecision,
  type StaticDestinationPolicy,
} from '../../src/collection/safety/static-destination.ts';

const sourceSubdomainPolicy: StaticDestinationPolicy = {
  sourceDomainRules: [{ hostname: 'example.test', includeSubdomains: true }],
  endpointDomainRules: [],
};

test('allows only HTTP default port 80 and HTTPS default port 443', () => {
  assertValidated(
    validateInitialStaticDestination(
      sourceSubdomainPolicy,
      'https://feeds.example.test/latest.xml',
    ),
    {
      requestUrl: 'https://feeds.example.test/latest.xml',
      protocol: 'https:',
      hostname: 'feeds.example.test',
      port: 443,
    },
  );
  assertValidated(
    validateInitialStaticDestination(
      sourceSubdomainPolicy,
      'https://feeds.example.test:443/latest.xml',
    ),
    {
      requestUrl: 'https://feeds.example.test/latest.xml',
      protocol: 'https:',
      hostname: 'feeds.example.test',
      port: 443,
    },
  );
  assertValidated(
    validateInitialStaticDestination(
      sourceSubdomainPolicy,
      'http://feeds.example.test/latest.xml',
    ),
    {
      requestUrl: 'http://feeds.example.test/latest.xml',
      protocol: 'http:',
      hostname: 'feeds.example.test',
      port: 80,
    },
  );
  assertValidated(
    validateInitialStaticDestination(
      sourceSubdomainPolicy,
      'http://feeds.example.test:80/latest.xml',
    ),
    {
      requestUrl: 'http://feeds.example.test/latest.xml',
      protocol: 'http:',
      hostname: 'feeds.example.test',
      port: 80,
    },
  );
});

test('blocks non-default ports with a stable network-safety decision', () => {
  for (const [url, description] of [
    ['https://feeds.example.test:80/feed', 'HTTPS port 80'],
    ['https://feeds.example.test:442/feed', 'HTTPS port 442'],
    ['https://feeds.example.test:444/feed', 'HTTPS port 444'],
    ['http://feeds.example.test:443/feed', 'HTTP port 443'],
    ['http://feeds.example.test:79/feed', 'HTTP port 79'],
    ['http://feeds.example.test:81/feed', 'HTTP port 81'],
    ['https://feeds.example.test:8443/feed', 'arbitrary non-default port'],
  ] as const) {
    assertBlocked(
      validateInitialStaticDestination(sourceSubdomainPolicy, url),
      'initial',
      'port_not_allowed',
      description,
    );
  }
});

test('rejects malformed, hostless, and credential-bearing request destinations', () => {
  for (const url of [
    'not a URL',
    '/relative-initial-url',
    'https://',
    'https://user:pass@feeds.example.test/feed.xml',
  ]) {
    assertBlocked(
      validateInitialStaticDestination(sourceSubdomainPolicy, url),
      'initial',
      'invalid_destination_url',
    );
  }
});

test('rejects every non-HTTP scheme before domain policy', () => {
  for (const url of [
    'ftp://feeds.example.test/feed.xml',
    'gopher://feeds.example.test/feed.xml',
  ]) {
    assertBlocked(
      validateInitialStaticDestination(sourceSubdomainPolicy, url),
      'initial',
      'unsupported_scheme',
    );
  }
});

test('uses canonical exact-host and subtree domain matching without suffix confusion', () => {
  const exactPolicy: StaticDestinationPolicy = {
    sourceDomainRules: [{ hostname: 'example.test', includeSubdomains: false }],
    endpointDomainRules: [],
  };

  assertValidated(
    validateInitialStaticDestination(exactPolicy, 'https://example.test/feed'),
    { hostname: 'example.test' },
  );
  for (const url of [
    'https://news.example.test/feed',
    'https://evil-example.test/feed',
    'https://example.test.evil.test/feed',
  ]) {
    assertBlocked(
      validateInitialStaticDestination(exactPolicy, url),
      'initial',
      'domain_not_approved',
    );
  }

  assertValidated(
    validateInitialStaticDestination(
      sourceSubdomainPolicy,
      'https://news.example.test/feed',
    ),
    { hostname: 'news.example.test' },
  );
});

test('normalizes URL hostnames through the canonical Source domain policy', () => {
  assertValidated(
    validateInitialStaticDestination(
      sourceSubdomainPolicy,
      'HTTPS://NËWS.EXAMPLE.TEST./feed',
    ),
    {
      requestUrl: 'https://xn--nws-jma.example.test/feed',
      hostname: 'xn--nws-jma.example.test',
    },
  );
});

test('applies endpoint narrowing and inherits the Source policy when narrowing is empty', () => {
  const narrowedPolicy: StaticDestinationPolicy = {
    sourceDomainRules: [{ hostname: 'example.test', includeSubdomains: true }],
    endpointDomainRules: [
      { hostname: 'feeds.example.test', includeSubdomains: false },
    ],
  };
  assertValidated(
    validateInitialStaticDestination(
      narrowedPolicy,
      'https://feeds.example.test/feed',
    ),
    { hostname: 'feeds.example.test' },
  );
  assertBlocked(
    validateInitialStaticDestination(
      narrowedPolicy,
      'https://www.example.test/feed',
    ),
    'initial',
    'domain_not_approved',
  );
  assertValidated(
    validateInitialStaticDestination(
      sourceSubdomainPolicy,
      'https://www.example.test/feed',
    ),
    { hostname: 'www.example.test' },
  );
});

test('revalidates relative and scheme-relative redirects through the same policy', () => {
  assertValidated(
    validateRedirectStaticDestination(
      sourceSubdomainPolicy,
      'https://feeds.example.test/news/current.xml',
      '../archive.xml#item-3',
    ),
    {
      context: 'redirect',
      requestUrl: 'https://feeds.example.test/archive.xml',
      hostname: 'feeds.example.test',
    },
  );
  assertValidated(
    validateRedirectStaticDestination(
      sourceSubdomainPolicy,
      'https://feeds.example.test/current.xml',
      '//news.example.test/archive.xml',
    ),
    {
      context: 'redirect',
      requestUrl: 'https://news.example.test/archive.xml',
      hostname: 'news.example.test',
    },
  );
  assertBlocked(
    validateRedirectStaticDestination(
      sourceSubdomainPolicy,
      'https://feeds.example.test/current.xml',
      'https://outside.test/feed.xml',
    ),
    'redirect',
    'domain_not_approved',
  );
  assertBlocked(
    validateRedirectStaticDestination(
      sourceSubdomainPolicy,
      'https://feeds.example.test/current.xml',
      'https://news.example.test:8443/feed.xml',
    ),
    'redirect',
    'port_not_allowed',
  );
});

test('returns immutable plain destination decisions without URL objects', () => {
  const validated = validateInitialStaticDestination(
    sourceSubdomainPolicy,
    'https://feeds.example.test/feed.xml#entry',
  );
  assert.equal(validated.status, 'validated');
  assert.equal(Object.isFrozen(validated), true);
  assert.equal(validated.requestUrl.includes('#'), false);
  assert.equal(validated instanceof URL, false);

  const blocked = validateInitialStaticDestination(
    sourceSubdomainPolicy,
    'ftp://feeds.example.test/feed.xml',
  );
  assertBlocked(blocked, 'initial', 'unsupported_scheme');
  assert.equal(Object.isFrozen(blocked), true);
});

function assertValidated(
  decision: StaticDestinationDecision,
  expected: Partial<{
    context: 'initial' | 'redirect';
    requestUrl: string;
    protocol: 'http:' | 'https:';
    hostname: string;
    port: 80 | 443;
  }>,
): void {
  assert.equal(decision.status, 'validated');
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(
      decision[key as keyof typeof expected],
      value,
      `expected ${key} to match`,
    );
  }
}

function assertBlocked(
  decision: StaticDestinationDecision,
  context: 'initial' | 'redirect',
  reason:
    | 'invalid_destination_url'
    | 'unsupported_scheme'
    | 'domain_not_approved'
    | 'port_not_allowed',
  message?: string,
): void {
  const expected = {
    status: 'blocked',
    stage: 'network_safety',
    context,
    reason,
  };
  if (message === undefined) {
    assert.deepEqual(decision, expected);
    return;
  }
  assert.deepEqual(decision, expected, message);
}
