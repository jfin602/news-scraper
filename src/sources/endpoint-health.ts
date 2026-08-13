import type { QueryExecutor } from '../database/database.ts';
import type {
  ApprovalState,
  LifecycleState,
  OperationalState,
} from './configuration.ts';
import { findEndpointConfigurationById } from './repository.ts';

export type EndpointHealth =
  'unknown' | 'healthy' | 'delayed' | 'degraded' | 'unhealthy';

export interface EndpointHealthFacts {
  readonly publicationActiveForCollection: boolean;
  readonly sourceApprovalState: ApprovalState;
  readonly sourceLifecycleState: LifecycleState;
  readonly sourceOperationalState: OperationalState;
  readonly endpointApprovalState: ApprovalState;
  readonly endpointLifecycleState: LifecycleState;
  readonly endpointOperationalState: OperationalState;
  readonly pollIntervalSeconds: number;
  readonly nextDueAt?: Date;
  readonly lastAttemptAt?: Date;
  readonly lastSuccessAt?: Date;
  readonly lastFailureAt?: Date;
  readonly cooldownUntil?: Date;
  readonly consecutiveFailureCount: number;
}

export interface EndpointHealthReadModel {
  readonly endpointId: string;
  readonly sourceId: string;
  readonly sourceDisplayName: string;
  readonly configuration: Readonly<{
    readonly publicationActiveForCollection: boolean;
    readonly sourceApprovalState: ApprovalState;
    readonly sourceLifecycleState: LifecycleState;
    readonly sourceOperationalState: OperationalState;
    readonly endpointApprovalState: ApprovalState;
    readonly endpointLifecycleState: LifecycleState;
    readonly endpointOperationalState: OperationalState;
    readonly pollIntervalSeconds: number;
  }>;
  readonly runtime: Readonly<{
    readonly lastAttemptAt?: Date;
    readonly lastSuccessAt?: Date;
    readonly lastFailureAt?: Date;
    readonly nextDueAt?: Date;
    readonly cooldownUntil?: Date;
    readonly consecutiveFailureCount: number;
  }>;
  readonly health: EndpointHealth;
}

export function deriveEndpointHealth(
  facts: EndpointHealthFacts,
  now: Date,
): EndpointHealth {
  const currentTime = requiredTimestamp(now, 'health evaluation time');
  validateFacts(facts);
  if (facts.lastAttemptAt === undefined) return 'unknown';
  if (facts.consecutiveFailureCount >= 3) return 'unhealthy';
  if (facts.consecutiveFailureCount >= 1) return 'degraded';
  if (
    isScheduleEligible(facts) &&
    facts.nextDueAt !== undefined &&
    currentTime.getTime() >
      facts.nextDueAt.getTime() + facts.pollIntervalSeconds * 1_000
  ) {
    return 'delayed';
  }
  return 'healthy';
}

export async function readEndpointHealth(
  executor: QueryExecutor,
  sourceEndpointId: string,
  now: Date,
): Promise<EndpointHealthReadModel | undefined> {
  const aggregate = await findEndpointConfigurationById(
    executor,
    sourceEndpointId,
  );
  if (aggregate === undefined) return undefined;
  const facts: EndpointHealthFacts = Object.freeze({
    publicationActiveForCollection: aggregate.publication.activeForCollection,
    sourceApprovalState: aggregate.source.approvalState,
    sourceLifecycleState: aggregate.source.lifecycleState,
    sourceOperationalState: aggregate.source.operationalState,
    endpointApprovalState: aggregate.endpoint.approvalState,
    endpointLifecycleState: aggregate.endpoint.lifecycleState,
    endpointOperationalState: aggregate.endpoint.operationalState,
    pollIntervalSeconds: aggregate.endpoint.pollIntervalSeconds,
    ...(aggregate.endpoint.nextDueAt === undefined
      ? {}
      : { nextDueAt: aggregate.endpoint.nextDueAt }),
    ...(aggregate.endpoint.lastAttemptAt === undefined
      ? {}
      : { lastAttemptAt: aggregate.endpoint.lastAttemptAt }),
    ...(aggregate.endpoint.lastSuccessAt === undefined
      ? {}
      : { lastSuccessAt: aggregate.endpoint.lastSuccessAt }),
    ...(aggregate.endpoint.lastFailureAt === undefined
      ? {}
      : { lastFailureAt: aggregate.endpoint.lastFailureAt }),
    ...(aggregate.endpoint.cooldownUntil === undefined
      ? {}
      : { cooldownUntil: aggregate.endpoint.cooldownUntil }),
    consecutiveFailureCount: aggregate.endpoint.consecutiveFailureCount ?? 0,
  });
  return Object.freeze({
    endpointId: aggregate.endpoint.id,
    sourceId: aggregate.source.id,
    sourceDisplayName: aggregate.source.displayName,
    configuration: Object.freeze({
      publicationActiveForCollection: facts.publicationActiveForCollection,
      sourceApprovalState: facts.sourceApprovalState,
      sourceLifecycleState: facts.sourceLifecycleState,
      sourceOperationalState: facts.sourceOperationalState,
      endpointApprovalState: facts.endpointApprovalState,
      endpointLifecycleState: facts.endpointLifecycleState,
      endpointOperationalState: facts.endpointOperationalState,
      pollIntervalSeconds: facts.pollIntervalSeconds,
    }),
    runtime: Object.freeze({
      ...(facts.lastAttemptAt === undefined
        ? {}
        : { lastAttemptAt: facts.lastAttemptAt }),
      ...(facts.lastSuccessAt === undefined
        ? {}
        : { lastSuccessAt: facts.lastSuccessAt }),
      ...(facts.lastFailureAt === undefined
        ? {}
        : { lastFailureAt: facts.lastFailureAt }),
      ...(facts.nextDueAt === undefined ? {} : { nextDueAt: facts.nextDueAt }),
      ...(facts.cooldownUntil === undefined
        ? {}
        : { cooldownUntil: facts.cooldownUntil }),
      consecutiveFailureCount: facts.consecutiveFailureCount,
    }),
    health: deriveEndpointHealth(facts, now),
  });
}

function isScheduleEligible(facts: EndpointHealthFacts): boolean {
  return (
    facts.publicationActiveForCollection &&
    facts.sourceApprovalState === 'approved' &&
    facts.sourceLifecycleState === 'active' &&
    facts.sourceOperationalState === 'enabled' &&
    facts.endpointApprovalState === 'approved' &&
    facts.endpointLifecycleState === 'active' &&
    facts.endpointOperationalState === 'enabled'
  );
}

function validateFacts(facts: EndpointHealthFacts): void {
  if (
    !Number.isSafeInteger(facts.pollIntervalSeconds) ||
    facts.pollIntervalSeconds <= 0 ||
    !Number.isSafeInteger(facts.consecutiveFailureCount) ||
    facts.consecutiveFailureCount < 0
  ) {
    throw new TypeError('Endpoint health facts are invalid.');
  }
  for (const timestamp of [
    facts.nextDueAt,
    facts.lastAttemptAt,
    facts.lastSuccessAt,
    facts.lastFailureAt,
    facts.cooldownUntil,
  ]) {
    if (timestamp !== undefined) requiredTimestamp(timestamp, 'runtime time');
  }
}

function requiredTimestamp(value: unknown, field: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError(`Endpoint ${field} is invalid.`);
  }
  return value;
}
