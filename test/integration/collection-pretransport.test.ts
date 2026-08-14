import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  withEligibleEndpointExecution,
  type EndpointExecutionLockRunner,
} from '../../src/collection/execution.ts';
import type { EndpointRunLockResult } from '../../src/collection/locks/endpoint-run-lock.ts';
import { reachValidatedOutboundBoundary } from '../../src/collection/safety/outbound-boundary.ts';
import type {
  DestinationResolver,
  ResolvedAddress,
} from '../../src/collection/safety/resolver.ts';
import type { EndpointConfigurationAggregate } from '../../src/sources/repository.ts';

test('eligibility blocks every inactive configuration state before lock and safety', async () => {
  const cases: readonly [string, EndpointConfigurationAggregate, string][] = [
    [
      'inactive publication',
      aggregate({ publicationActive: false }),
      'publication_inactive',
    ],
    [
      'unapproved source',
      aggregate({ sourceApproval: 'unapproved' }),
      'source_unapproved',
    ],
    [
      'archived source',
      aggregate({ sourceLifecycle: 'archived' }),
      'source_archived',
    ],
    [
      'paused source',
      aggregate({ sourceOperational: 'paused' }),
      'source_paused',
    ],
    [
      'disabled source',
      aggregate({ sourceOperational: 'disabled' }),
      'source_disabled',
    ],
    [
      'unapproved endpoint',
      aggregate({ endpointApproval: 'unapproved' }),
      'endpoint_unapproved',
    ],
    [
      'archived endpoint',
      aggregate({ endpointLifecycle: 'archived' }),
      'endpoint_archived',
    ],
    [
      'paused endpoint',
      aggregate({ endpointOperational: 'paused' }),
      'endpoint_paused',
    ],
    [
      'disabled endpoint',
      aggregate({ endpointOperational: 'disabled' }),
      'endpoint_disabled',
    ],
  ];

  for (const [name, configuration, reason] of cases) {
    const events: string[] = [];
    const result = await withEligibleEndpointExecution(
      configuration,
      acquiredLockRunner(events),
      async () => {
        events.push('safety');
      },
    );

    assert.deepEqual(
      result,
      {
        status: 'blocked',
        stage: 'eligibility',
        reason,
      },
      name,
    );
    assert.deepEqual(events, [], name);
  }
});

test('lock contention blocks safety, resolver, and outbound work', async () => {
  const events: string[] = [];
  const result = await withEligibleEndpointExecution(
    aggregate(),
    contendedLockRunner(events),
    async () => {
      events.push('safety');
      return reachValidatedOutboundBoundary(
        aggregate(),
        initialInput(),
        resolverWith([{ address: '8.8.8.8', family: 4 }], events),
        async () => {
          events.push('outbound');
        },
      );
    },
  );

  assert.deepEqual(result, {
    status: 'blocked',
    stage: 'lock',
    reason: 'endpoint_locked',
  });
  assert.deepEqual(events, ['lock']);
});

test('lock infrastructure errors propagate without becoming state decisions', async () => {
  const expected = new Error('synthetic lock infrastructure failure');
  let workExecuted = false;

  await assert.rejects(
    withEligibleEndpointExecution(
      aggregate(),
      {
        async run<T>(): Promise<EndpointRunLockResult<T>> {
          throw expected;
        },
      },
      async () => {
        workExecuted = true;
      },
    ),
    expected,
  );
  assert.equal(workExecuted, false);
});

test('static policy blocks unsupported scheme, domain, and port before DNS', async () => {
  const cases = [
    ['ftp://feeds.example.test/feed.xml', 'unsupported_scheme'],
    ['https://outside.example.test/feed.xml', 'domain_not_approved'],
    ['https://feeds.example.test:8443/feed.xml', 'port_not_allowed'],
  ] as const;

  for (const [destination, reason] of cases) {
    const events: string[] = [];
    const result = await reachValidatedOutboundBoundary(
      aggregate(),
      { context: 'initial', destination },
      resolverWith([{ address: '8.8.8.8', family: 4 }], events),
      async () => {
        events.push('outbound');
      },
    );

    assert.deepEqual(result, {
      status: 'blocked',
      stage: 'network_safety',
      context: 'initial',
      reason,
    });
    assert.deepEqual(events, []);
  }
});

test('DNS failure and unsafe answers never reach outbound work', async () => {
  const cases: readonly [readonly ResolvedAddress[], string][] = [
    [[], 'dns_resolution_failed'],
    [[{ address: '127.0.0.1', family: 4 }], 'unsafe_resolved_address'],
  ];

  for (const [answers, reason] of cases) {
    const events: string[] = [];
    const result = await reachValidatedOutboundBoundary(
      aggregate(),
      initialInput(),
      resolverWith(answers, events),
      async () => {
        events.push('outbound');
      },
    );

    assert.deepEqual(result, {
      status: 'blocked',
      stage: 'network_safety',
      context: 'initial',
      reason,
    });
    assert.deepEqual(events, ['resolver']);
  }
});

test('eligible locked execution reaches outbound once in staged order and returns its result', async () => {
  const events: string[] = [];
  const configuration = aggregateWithEligibilityObservation(events);
  const destinations: unknown[] = [];

  const result = await withEligibleEndpointExecution(
    configuration,
    acquiredLockRunner(events),
    async () => {
      events.push('safety');
      return reachValidatedOutboundBoundary(
        configuration,
        initialInput(),
        resolverWith(
          [
            { address: '8.8.8.8', family: 4 },
            { address: '2606:4700:4700::1111', family: 6 },
          ],
          events,
        ),
        async (destination) => {
          events.push('outbound');
          destinations.push(destination);
          return 'controlled-result';
        },
      );
    },
  );

  assert.deepEqual(result, {
    status: 'acquired',
    value: 'controlled-result',
  });
  assert.deepEqual(events, [
    'eligibility',
    'lock',
    'safety',
    'resolver',
    'outbound',
    'release',
  ]);
  assert.equal(destinations.length, 1);
  assert.deepEqual(destinations[0], {
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
  assert.equal(Object.isFrozen(destinations[0]), true);
});

test('outbound errors propagate through the lock scope and release it', async () => {
  const events: string[] = [];
  const expected = new Error('controlled outbound failure');

  await assert.rejects(
    withEligibleEndpointExecution(
      aggregate(),
      acquiredLockRunner(events),
      async () => {
        events.push('safety');
        return reachValidatedOutboundBoundary(
          aggregate(),
          initialInput(),
          resolverWith([{ address: '8.8.8.8', family: 4 }], events),
          async () => {
            events.push('outbound');
            throw expected;
          },
        );
      },
    ),
    expected,
  );
  assert.deepEqual(events, [
    'lock',
    'safety',
    'resolver',
    'outbound',
    'release',
  ]);
});

test('redirect candidates use the same static and DNS boundary without address reuse', async () => {
  const configuration = aggregate();
  const blockedEvents: string[] = [];
  const blocked = await reachValidatedOutboundBoundary(
    configuration,
    {
      context: 'redirect',
      currentUrl: configuration.endpoint.endpointUrl.value,
      destination: 'https://outside.example.test/redirect.xml',
    },
    resolverWith([{ address: '8.8.8.8', family: 4 }], blockedEvents),
    async () => {
      blockedEvents.push('outbound');
    },
  );
  assert.deepEqual(blocked, {
    status: 'blocked',
    stage: 'network_safety',
    context: 'redirect',
    reason: 'domain_not_approved',
  });
  assert.deepEqual(blockedEvents, []);

  const safeEvents: string[] = [];
  const safe = await reachValidatedOutboundBoundary(
    configuration,
    {
      context: 'redirect',
      currentUrl: configuration.endpoint.endpointUrl.value,
      destination: '/redirect.xml',
    },
    resolverWith([{ address: '1.1.1.1', family: 4 }], safeEvents),
    async (destination) => {
      safeEvents.push('outbound');
      return destination;
    },
  );
  assert.equal(safe.status, 'validated');
  assert.equal(safe.context, 'redirect');
  assert.deepEqual(safe.addresses, [{ address: '1.1.1.1', family: 4 }]);
  assert.deepEqual(safeEvents, ['resolver', 'outbound']);
});

function acquiredLockRunner(events: string[]): EndpointExecutionLockRunner {
  return {
    async run<T>(
      _endpointId: string,
      work: () => Promise<T>,
    ): Promise<EndpointRunLockResult<T>> {
      events.push('lock');
      try {
        return { status: 'acquired', value: await work() };
      } finally {
        events.push('release');
      }
    },
  };
}

function contendedLockRunner(events: string[]): EndpointExecutionLockRunner {
  return {
    async run<T>(): Promise<EndpointRunLockResult<T>> {
      events.push('lock');
      return { status: 'blocked', stage: 'lock', reason: 'endpoint_locked' };
    },
  };
}

function resolverWith(
  answers: readonly ResolvedAddress[],
  events: string[],
): DestinationResolver {
  return {
    async resolve() {
      events.push('resolver');
      return answers;
    },
  };
}

function initialInput() {
  return {
    context: 'initial',
    destination: 'https://feeds.example.test/feed.xml',
  } as const;
}

interface AggregateOverrides {
  readonly publicationActive?: boolean;
  readonly sourceApproval?: 'approved' | 'unapproved';
  readonly sourceLifecycle?: 'active' | 'archived';
  readonly sourceOperational?: 'enabled' | 'paused' | 'disabled';
  readonly endpointApproval?: 'approved' | 'unapproved';
  readonly endpointLifecycle?: 'active' | 'archived';
  readonly endpointOperational?: 'enabled' | 'paused' | 'disabled';
}

function aggregate(
  overrides: AggregateOverrides = {},
): EndpointConfigurationAggregate {
  const timestamp = new Date('2026-08-08T00:00:00.000Z');
  return {
    publication: {
      name: 'Generic news',
      activeForCollection: overrides.publicationActive ?? true,
      publicStatus: 'private',
      description: null,
      logoPath: null,
      accentColor: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    source: {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      configKey: 'generic_source',
      displayName: 'Generic source',
      siteUrl: {
        value: 'https://example.test/',
        hostname: 'example.test',
      },
      approvalState: overrides.sourceApproval ?? 'approved',
      lifecycleState: overrides.sourceLifecycle ?? 'active',
      operationalState: overrides.sourceOperational ?? 'enabled',
      priority: 0,
      rssAtomAdmissionPhrases: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    sourceDomainRules: [{ hostname: 'example.test', includeSubdomains: true }],
    endpoint: {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      sourceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      configKey: 'main_feed',
      endpointUrl: {
        value: 'https://feeds.example.test/feed.xml',
        hostname: 'feeds.example.test',
      },
      endpointType: 'rss_atom',
      approvalState: overrides.endpointApproval ?? 'approved',
      lifecycleState: overrides.endpointLifecycle ?? 'active',
      operationalState: overrides.endpointOperational ?? 'enabled',
      pollIntervalSeconds: 300,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    endpointDomainRules: [
      { hostname: 'feeds.example.test', includeSubdomains: false },
    ],
  };
}

function aggregateWithEligibilityObservation(
  events: string[],
): EndpointConfigurationAggregate {
  const configuration = aggregate();
  return {
    ...configuration,
    publication: {
      ...configuration.publication,
      get activeForCollection() {
        events.push('eligibility');
        return true;
      },
    },
  };
}
