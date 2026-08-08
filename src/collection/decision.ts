export const COLLECTION_DECISION_REASONS = Object.freeze([
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
] as const);

export type CollectionDecisionReason =
  (typeof COLLECTION_DECISION_REASONS)[number];

export interface CollectionEligibleDecision {
  readonly status: 'eligible';
}

export interface CollectionBlockedDecision {
  readonly status: 'blocked';
  readonly stage: 'eligibility';
  readonly reason: CollectionDecisionReason;
}

export type CollectionEligibilityDecision =
  CollectionEligibleDecision | CollectionBlockedDecision;

export const ELIGIBLE_COLLECTION_DECISION: CollectionEligibleDecision =
  Object.freeze({ status: 'eligible' });

export function blockedEligibilityDecision(
  reason: CollectionDecisionReason,
): CollectionBlockedDecision {
  return Object.freeze({ status: 'blocked', stage: 'eligibility', reason });
}
