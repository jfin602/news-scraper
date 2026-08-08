import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  validateInitialDestination,
  validateRedirectDestination,
  type DestinationSafetyDecision,
} from '../../src/collection/safety/destination-safety.ts';
import {
  createNodeResolver,
  type DestinationResolver,
  type ResolvedAddress,
} from '../../src/collection/safety/resolver.ts';
import type { StaticDestinationPolicy } from '../../src/collection/safety/static-destination.ts';

const policy: StaticDestinationPolicy = {
  sourceDomainRules: [{ hostname: 'example.test', includeSubdomains: true }],
  endpointDomainRules: [],
};

test('validates an approved destination with concrete normalized addresses', async () => {
  const decision = await validateInitialDestination(
    policy,
    'https://feeds.example.test/feed.xml#entry',
    resolverWith([
      { address: '8.8.8.8', family: 4 },
      { address: '2606:4700:4700:0:0:0:0:1111', family: 6 },
    ]),
  );

  assert.deepEqual(decision, {
    status: 'validated',
    context: 'initial',
    requestUrl: 'https://feeds.example.test/feed.xml',
    protocol: 'https:',
    hostname: 'feeds.example.test',
    port: 443,
    addresses: [
      { address: '8.8.8.8', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ],
  });
});

test('fails DNS resolution closed for zero answers, exceptions, and malformed output', async () => {
  const decisions = await Promise.all([
    validateInitialDestination(
      policy,
      'https://example.test/feed',
      resolverWith([]),
    ),
    validateInitialDestination(policy, 'https://example.test/feed', {
      async resolve() {
        throw new Error('low-level resolver detail');
      },
    }),
    validateInitialDestination(
      policy,
      'https://example.test/feed',
      resolverWith([{ address: 'not-an-ip', family: 4 }]),
    ),
    validateInitialDestination(
      policy,
      'https://example.test/feed',
      resolverWith([{ address: '8.8.8.8', family: 6 }]),
    ),
    validateInitialDestination(policy, 'https://example.test/feed', {
      async resolve() {
        return [
          {
            get address(): string {
              throw new Error('malformed resolver property');
            },
            family: 4 as const,
          },
        ];
      },
    }),
  ]);

  for (const decision of decisions) {
    assertBlocked(decision, 'initial', 'dns_resolution_failed');
  }
});

test('rejects the entire destination when any resolved answer is unsafe', async () => {
  const decision = await validateInitialDestination(
    policy,
    'https://example.test/feed',
    resolverWith([
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ]),
  );

  assertBlocked(decision, 'initial', 'unsafe_resolved_address');
});

test('preserves deterministic public-answer order and removes normalized duplicates', async () => {
  const decision = await validateInitialDestination(
    policy,
    'https://example.test/feed',
    resolverWith([
      { address: '2606:4700:4700:0:0:0:0:1111', family: 6 },
      { address: '8.8.8.8', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
      { address: '1.1.1.1', family: 4 },
      { address: '8.8.8.8', family: 4 },
    ]),
  );

  assert.equal(decision.status, 'validated');
  assert.deepEqual(decision.addresses, [
    { address: '2606:4700:4700::1111', family: 6 },
    { address: '8.8.8.8', family: 4 },
    { address: '1.1.1.1', family: 4 },
  ]);
});

test('completes static policy before invoking DNS', async () => {
  let calls = 0;
  const resolver: DestinationResolver = {
    async resolve() {
      calls += 1;
      return [{ address: '8.8.8.8', family: 4 }];
    },
  };

  const unsupported = await validateInitialDestination(
    policy,
    'ftp://example.test/feed',
    resolver,
  );
  const outside = await validateInitialDestination(
    policy,
    'https://outside.test/feed',
    resolver,
  );
  assertBlocked(unsupported, 'initial', 'unsupported_scheme');
  assertBlocked(outside, 'initial', 'domain_not_approved');
  assert.equal(calls, 0);
});

test('revalidates a relative redirect through static and DNS policy', async () => {
  const hostnames: string[] = [];
  const resolver: DestinationResolver = {
    async resolve(hostname) {
      hostnames.push(hostname);
      return [{ address: '1.1.1.1', family: 4 }];
    },
  };
  const decision = await validateRedirectDestination(
    policy,
    'https://feeds.example.test/news/current.xml',
    '../archive.xml#entry',
    resolver,
  );

  assert.equal(decision.status, 'validated');
  assert.equal(decision.context, 'redirect');
  assert.equal(decision.requestUrl, 'https://feeds.example.test/archive.xml');
  assert.deepEqual(decision.addresses, [{ address: '1.1.1.1', family: 4 }]);
  assert.deepEqual(hostnames, ['feeds.example.test']);
});

test('blocks an outside-domain redirect before DNS and an unsafe approved redirect after DNS', async () => {
  let calls = 0;
  const resolver: DestinationResolver = {
    async resolve() {
      calls += 1;
      return [{ address: '169.254.169.254', family: 4 }];
    },
  };

  const outside = await validateRedirectDestination(
    policy,
    'https://feeds.example.test/current.xml',
    'https://outside.test/feed',
    resolver,
  );
  assertBlocked(outside, 'redirect', 'domain_not_approved');
  assert.equal(calls, 0);

  const unsafe = await validateRedirectDestination(
    policy,
    'https://feeds.example.test/current.xml',
    'https://news.example.test/feed',
    resolver,
  );
  assertBlocked(unsafe, 'redirect', 'unsafe_resolved_address');
  assert.equal(calls, 1);
});

test('redirect validation cannot reuse a previous destination address', async () => {
  const answers = [
    [{ address: '8.8.8.8', family: 4 }] as const,
    [{ address: '1.1.1.1', family: 4 }] as const,
  ];
  let call = 0;
  const resolver: DestinationResolver = {
    async resolve() {
      return answers[call++] ?? [];
    },
  };

  const initial = await validateInitialDestination(
    policy,
    'https://feeds.example.test/current.xml',
    resolver,
  );
  const redirect = await validateRedirectDestination(
    policy,
    'https://feeds.example.test/current.xml',
    'https://news.example.test/feed.xml',
    resolver,
  );
  assert.equal(initial.status, 'validated');
  assert.equal(redirect.status, 'validated');
  assert.deepEqual(initial.addresses, [{ address: '8.8.8.8', family: 4 }]);
  assert.deepEqual(redirect.addresses, [{ address: '1.1.1.1', family: 4 }]);
  assert.equal(call, 2);
});

test('returns deeply immutable validated and DNS-blocked decisions', async () => {
  const validated = await validateInitialDestination(
    policy,
    'https://example.test/feed',
    resolverWith([{ address: '8.8.8.8', family: 4 }]),
  );
  assert.equal(validated.status, 'validated');
  assert.equal(Object.isFrozen(validated), true);
  assert.equal(Object.isFrozen(validated.addresses), true);
  assert.equal(Object.isFrozen(validated.addresses[0]), true);

  const blocked = await validateInitialDestination(
    policy,
    'https://example.test/feed',
    resolverWith([]),
  );
  assert.equal(Object.isFrozen(blocked), true);
});

test('production resolver adapter requests all answers without public DNS', async () => {
  const calls: unknown[][] = [];
  const resolver = createNodeResolver(async (hostname, options) => {
    calls.push([hostname, options]);
    return [
      { address: '1.1.1.1', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ];
  });

  const answers = await resolver.resolve('feeds.example.test');
  assert.deepEqual(calls, [
    ['feeds.example.test', { all: true, order: 'verbatim' }],
  ]);
  assert.deepEqual(answers, [
    { address: '1.1.1.1', family: 4 },
    { address: '2606:4700:4700::1111', family: 6 },
  ]);
  assert.equal(Object.isFrozen(answers), true);
  assert.equal(Object.isFrozen(answers[0]), true);
});

function resolverWith(
  answers: readonly ResolvedAddress[],
): DestinationResolver {
  return {
    async resolve() {
      return answers;
    },
  };
}

function assertBlocked(
  decision: DestinationSafetyDecision,
  context: 'initial' | 'redirect',
  reason: Exclude<DestinationSafetyDecision, { status: 'validated' }>['reason'],
): void {
  assert.deepEqual(decision, {
    status: 'blocked',
    stage: 'network_safety',
    context,
    reason,
  });
}
