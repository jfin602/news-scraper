import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  deriveEndpointHealth,
  type EndpointHealthFacts,
} from '../../src/sources/endpoint-health.ts';

const NOW = new Date('2026-08-11T10:10:00.000Z');
const ATTEMPT = new Date('2026-08-11T10:00:00.000Z');
const DUE = new Date('2026-08-11T10:09:00.000Z');

test('endpoint health follows unknown, failure, delayed, then healthy precedence', () => {
  assert.equal(deriveEndpointHealth(facts({}, false), NOW), 'unknown');
  assert.equal(
    deriveEndpointHealth(facts({ consecutiveFailureCount: 3 }), NOW),
    'unhealthy',
  );
  for (const consecutiveFailureCount of [1, 2]) {
    assert.equal(
      deriveEndpointHealth(facts({ consecutiveFailureCount }), NOW),
      'degraded',
    );
  }
  assert.equal(
    deriveEndpointHealth(
      facts({ nextDueAt: new Date('2026-08-11T10:08:59.999Z') }),
      NOW,
    ),
    'delayed',
  );
  assert.equal(deriveEndpointHealth(facts(), NOW), 'healthy');
});

test('delayed threshold is strict immediately before, at, and after due plus one interval', () => {
  const threshold = new Date(DUE.getTime() + 60_000);
  assert.equal(
    deriveEndpointHealth(facts(), new Date(threshold.getTime() - 1)),
    'healthy',
  );
  assert.equal(deriveEndpointHealth(facts(), threshold), 'healthy');
  assert.equal(
    deriveEndpointHealth(facts(), new Date(threshold.getTime() + 1)),
    'delayed',
  );
});

test('intentionally non-collectable configuration does not become delayed', () => {
  const farLater = new Date('2026-08-12T10:00:00.000Z');
  const variants: Partial<EndpointHealthFacts>[] = [
    { publicationActiveForCollection: false },
    { sourceApprovalState: 'unapproved' },
    { sourceLifecycleState: 'archived' },
    { sourceOperationalState: 'paused' },
    { sourceOperationalState: 'disabled' },
    { endpointApprovalState: 'unapproved' },
    { endpointLifecycleState: 'archived' },
    { endpointOperationalState: 'paused' },
    { endpointOperationalState: 'disabled' },
  ];
  for (const variant of variants) {
    assert.equal(deriveEndpointHealth(facts(variant), farLater), 'healthy');
  }
});

test('failure evidence outranks delayed time even when operation is paused', () => {
  assert.equal(
    deriveEndpointHealth(
      facts({
        endpointOperationalState: 'paused',
        consecutiveFailureCount: 2,
      }),
      new Date('2026-08-12T10:00:00.000Z'),
    ),
    'degraded',
  );
});

function facts(
  overrides: Partial<EndpointHealthFacts> = {},
  includeLastAttempt = true,
): EndpointHealthFacts {
  return Object.freeze({
    publicationActiveForCollection: true,
    sourceApprovalState: 'approved',
    sourceLifecycleState: 'active',
    sourceOperationalState: 'enabled',
    endpointApprovalState: 'approved',
    endpointLifecycleState: 'active',
    endpointOperationalState: 'enabled',
    pollIntervalSeconds: 60,
    nextDueAt: DUE,
    ...(includeLastAttempt ? { lastAttemptAt: ATTEMPT } : {}),
    consecutiveFailureCount: 0,
    ...overrides,
  });
}
