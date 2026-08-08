import {
  validateDestination,
  type DestinationSafetyDecision,
  type ValidatedDestination,
} from './destination-safety.ts';
import type { DestinationResolver } from './resolver.ts';
import type {
  StaticDestinationInput,
  StaticDestinationPolicy,
} from './static-destination.ts';

export type DestinationSafetyBlocked = Exclude<
  DestinationSafetyDecision,
  ValidatedDestination
>;

export type ValidatedOutboundBoundaryResult<T> = DestinationSafetyBlocked | T;

export async function reachValidatedOutboundBoundary<T>(
  policy: StaticDestinationPolicy,
  input: StaticDestinationInput,
  resolver: DestinationResolver,
  outbound: (destination: ValidatedDestination) => Promise<T>,
): Promise<ValidatedOutboundBoundaryResult<T>> {
  const decision = await validateDestination(policy, input, resolver);
  if (decision.status === 'blocked') return decision;

  return outbound(decision);
}
