import type { PersistedPublication } from '../publications/repository.ts';
import type {
  PersistedSource,
  PersistedSourceEndpoint,
} from '../sources/repository.ts';
import {
  ELIGIBLE_COLLECTION_DECISION,
  blockedEligibilityDecision,
  type CollectionEligibilityDecision,
} from './decision.ts';

export interface CollectionEligibilityAggregate {
  readonly publication: Pick<PersistedPublication, 'activeForCollection'>;
  readonly source: Pick<
    PersistedSource,
    'approvalState' | 'lifecycleState' | 'operationalState'
  >;
  readonly endpoint: Pick<
    PersistedSourceEndpoint,
    'approvalState' | 'lifecycleState' | 'operationalState'
  >;
}

export function evaluateCollectionEligibility(
  aggregate: CollectionEligibilityAggregate,
): CollectionEligibilityDecision {
  if (!aggregate.publication.activeForCollection) {
    return blockedEligibilityDecision('publication_inactive');
  }

  if (aggregate.source.approvalState !== 'approved') {
    return blockedEligibilityDecision('source_unapproved');
  }
  if (aggregate.source.lifecycleState === 'archived') {
    return blockedEligibilityDecision('source_archived');
  }
  if (aggregate.source.operationalState === 'paused') {
    return blockedEligibilityDecision('source_paused');
  }
  if (aggregate.source.operationalState === 'disabled') {
    return blockedEligibilityDecision('source_disabled');
  }

  if (aggregate.endpoint.approvalState !== 'approved') {
    return blockedEligibilityDecision('endpoint_unapproved');
  }
  if (aggregate.endpoint.lifecycleState === 'archived') {
    return blockedEligibilityDecision('endpoint_archived');
  }
  if (aggregate.endpoint.operationalState === 'paused') {
    return blockedEligibilityDecision('endpoint_paused');
  }
  if (aggregate.endpoint.operationalState === 'disabled') {
    return blockedEligibilityDecision('endpoint_disabled');
  }

  return ELIGIBLE_COLLECTION_DECISION;
}
