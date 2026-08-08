import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  COLLECTION_DECISION_REASONS,
  type CollectionBlockedDecision,
} from '../../src/collection/decision.ts';
import { evaluateCollectionEligibility } from '../../src/collection/eligibility.ts';
import type {
  ApprovalState,
  LifecycleState,
  OperationalState,
} from '../../src/sources/configuration.ts';

test('returns an immutable eligible decision for fully collectable configuration', () => {
  const decision = evaluateCollectionEligibility(eligibleAggregate());

  assert.deepEqual(decision, { status: 'eligible' });
  assert.equal(Object.isFrozen(decision), true);
});

test('returns each canonical state-eligibility reason exactly', () => {
  const cases: readonly {
    readonly change: (aggregate: MutableCollectionEligibilityAggregate) => void;
    readonly reason: CollectionBlockedDecision['reason'];
  }[] = [
    {
      change: (aggregate) => {
        aggregate.publication.activeForCollection = false;
      },
      reason: 'publication_inactive',
    },
    {
      change: (aggregate) => {
        aggregate.source.approvalState = 'unapproved';
      },
      reason: 'source_unapproved',
    },
    {
      change: (aggregate) => {
        aggregate.source.lifecycleState = 'archived';
      },
      reason: 'source_archived',
    },
    {
      change: (aggregate) => {
        aggregate.source.operationalState = 'paused';
      },
      reason: 'source_paused',
    },
    {
      change: (aggregate) => {
        aggregate.source.operationalState = 'disabled';
      },
      reason: 'source_disabled',
    },
    {
      change: (aggregate) => {
        aggregate.endpoint.approvalState = 'unapproved';
      },
      reason: 'endpoint_unapproved',
    },
    {
      change: (aggregate) => {
        aggregate.endpoint.lifecycleState = 'archived';
      },
      reason: 'endpoint_archived',
    },
    {
      change: (aggregate) => {
        aggregate.endpoint.operationalState = 'paused';
      },
      reason: 'endpoint_paused',
    },
    {
      change: (aggregate) => {
        aggregate.endpoint.operationalState = 'disabled';
      },
      reason: 'endpoint_disabled',
    },
  ];

  for (const { change, reason } of cases) {
    const aggregate = eligibleAggregate();
    change(aggregate);
    const decision = evaluateCollectionEligibility(aggregate);

    assert.deepEqual(decision, {
      status: 'blocked',
      stage: 'eligibility',
      reason,
    });
    assert.equal(Object.isFrozen(decision), true);
  }
});

test('uses canonical Phase 4 decision-reason codes', () => {
  assert.equal(Object.isFrozen(COLLECTION_DECISION_REASONS), true);
  assert.deepEqual(COLLECTION_DECISION_REASONS, [
    'publication_inactive',
    'source_unapproved',
    'source_archived',
    'source_paused',
    'source_disabled',
    'endpoint_unapproved',
    'endpoint_archived',
    'endpoint_paused',
    'endpoint_disabled',
    'endpoint_locked',
    'unsupported_scheme',
    'invalid_destination_url',
    'domain_not_approved',
    'port_not_allowed',
    'dns_resolution_failed',
    'unsafe_resolved_address',
  ]);
});

test('returns the first blocking state in deterministic precedence order', () => {
  const aggregate = eligibleAggregate();
  aggregate.publication.activeForCollection = false;
  aggregate.source.approvalState = 'unapproved';
  aggregate.source.lifecycleState = 'archived';
  aggregate.source.operationalState = 'disabled';
  aggregate.endpoint.approvalState = 'unapproved';
  aggregate.endpoint.lifecycleState = 'archived';
  aggregate.endpoint.operationalState = 'paused';

  assert.deepEqual(evaluateCollectionEligibility(aggregate), {
    status: 'blocked',
    stage: 'eligibility',
    reason: 'publication_inactive',
  });

  aggregate.publication.activeForCollection = true;
  assert.equal(
    blockedReason(evaluateCollectionEligibility(aggregate)),
    'source_unapproved',
  );

  aggregate.source.approvalState = 'approved';
  assert.equal(
    blockedReason(evaluateCollectionEligibility(aggregate)),
    'source_archived',
  );

  aggregate.source.lifecycleState = 'active';
  assert.equal(
    blockedReason(evaluateCollectionEligibility(aggregate)),
    'source_disabled',
  );

  aggregate.source.operationalState = 'enabled';
  assert.equal(
    blockedReason(evaluateCollectionEligibility(aggregate)),
    'endpoint_unapproved',
  );
});

test('does not mutate the input aggregate', () => {
  const aggregate = eligibleAggregate();
  const before = structuredClone(aggregate);

  evaluateCollectionEligibility(aggregate);

  assert.deepEqual(aggregate, before);
});

interface MutableCollectionEligibilityAggregate {
  publication: { activeForCollection: boolean };
  source: {
    approvalState: ApprovalState;
    lifecycleState: LifecycleState;
    operationalState: OperationalState;
  };
  endpoint: {
    approvalState: ApprovalState;
    lifecycleState: LifecycleState;
    operationalState: OperationalState;
  };
}

function eligibleAggregate(): MutableCollectionEligibilityAggregate {
  return {
    publication: { activeForCollection: true },
    source: {
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
    },
    endpoint: {
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
    },
  };
}

function blockedReason(
  decision: ReturnType<typeof evaluateCollectionEligibility>,
): CollectionBlockedDecision['reason'] {
  assert.equal(decision.status, 'blocked');
  return decision.reason;
}
