import type { Database } from '../database/database.ts';
import type { EndpointConfigurationAggregate } from '../sources/repository.ts';
import type { CollectionBlockedDecision } from './decision.ts';
import { evaluateCollectionEligibility } from './eligibility.ts';
import {
  withEndpointRunLock,
  type EndpointRunLockResult,
} from './locks/endpoint-run-lock.ts';

export interface EndpointExecutionLockRunner {
  run<T>(
    endpointId: string,
    work: () => Promise<T>,
  ): Promise<EndpointRunLockResult<T>>;
}

export type EligibleEndpointExecutionResult<T> =
  CollectionBlockedDecision | EndpointRunLockResult<T>;

export function createEndpointExecutionLockRunner(
  database: Pick<Database, 'withSession'>,
): EndpointExecutionLockRunner {
  return Object.freeze({
    run<T>(
      endpointId: string,
      work: () => Promise<T>,
    ): Promise<EndpointRunLockResult<T>> {
      return withEndpointRunLock(database, endpointId, async () => work());
    },
  });
}

export async function withEligibleEndpointExecution<T>(
  aggregate: EndpointConfigurationAggregate,
  lockRunner: EndpointExecutionLockRunner,
  work: () => Promise<T>,
): Promise<EligibleEndpointExecutionResult<T>> {
  const eligibility = evaluateCollectionEligibility(aggregate);
  if (eligibility.status === 'blocked') return eligibility;

  return lockRunner.run(aggregate.endpoint.id, work);
}
