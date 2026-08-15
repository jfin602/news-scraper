import type { QueryResultRow } from 'pg';

import {
  COLLECTION_CAPACITY_LIMITS,
  COLLECTION_DATABASE_POOL_POLICY,
} from '../collection/concurrency/collection-capacity.ts';
import type { Database, QueryExecutor } from '../database/database.ts';
import {
  deriveEndpointHealth,
  isEndpointScheduleEligible,
  type EndpointHealth,
  type EndpointHealthFacts,
} from '../sources/endpoint-health.ts';
import {
  WORKER_RUNTIME_TIMING,
  type WorkerRuntimeTiming,
} from '../app/worker/runtime-timing.ts';

export const OPERATIONAL_SNAPSHOT_ACTIONABLE_ENDPOINT_LIMIT = 100;
export const OPERATIONAL_SNAPSHOT_ALERT_LIMIT = 100;
export const OPERATIONAL_SNAPSHOT_EXPIRED_JOB_LIMIT = 100;

export type OperationalStatus =
  'healthy' | 'attention' | 'critical' | 'unknown';
export type OperationalAlertSeverity = 'warning' | 'critical';
export type OperationalAlertCode =
  | 'endpoint_delayed'
  | 'endpoint_degraded'
  | 'endpoint_unhealthy'
  | 'expired_running_job'
  | 'ready_queued_work';

export interface OperationalEndpoint {
  readonly sourceConfigKey: string;
  readonly sourceDisplayName: string;
  readonly endpointConfigKey: string;
  readonly collectionEligible: boolean;
  readonly health: EndpointHealth;
  readonly lastAttemptAt: Date | null;
  readonly lastSuccessAt: Date | null;
  readonly lastFailureAt: Date | null;
  readonly nextDueAt: Date | null;
  readonly cooldownUntil: Date | null;
  readonly consecutiveFailureCount: number;
  readonly pollIntervalSeconds: number;
}

export interface ExpiredRunningJob {
  readonly jobId: string;
  readonly sourceConfigKey: string;
  readonly endpointConfigKey: string;
  readonly claimedAt: Date | null;
  readonly leaseExpiresAt: Date;
}

export interface OperationalAlert {
  readonly code: OperationalAlertCode;
  readonly severity: OperationalAlertSeverity;
  readonly sourceConfigKey?: string;
  readonly endpointConfigKey?: string;
  readonly jobId?: string;
}

export interface OperationalSnapshot {
  readonly observedAt: Date;
  readonly status: OperationalStatus;
  readonly endpointHealthCounts: Readonly<Record<EndpointHealth, number>>;
  readonly actionableEndpoints: readonly OperationalEndpoint[];
  readonly actionableEndpointsTruncated: boolean;
  readonly jobs: Readonly<{
    readonly queuedCount: number;
    readonly runningCount: number;
    readonly readyQueuedCount: number;
    readonly futureQueuedCount: number;
    readonly oldestReadyQueuedAt: Date | null;
    readonly oldestReadyAgeMilliseconds: number | null;
    readonly expiredRunningCount: number;
    readonly expiredRunningJobs: readonly ExpiredRunningJob[];
    readonly expiredRunningJobsTruncated: boolean;
  }>;
  readonly capacity: Readonly<{
    readonly global: number;
    readonly source: number;
    readonly host: number;
    readonly databasePool: typeof COLLECTION_DATABASE_POOL_POLICY;
  }>;
  readonly workerTiming: Readonly<WorkerRuntimeTiming>;
  readonly alerts: readonly OperationalAlert[];
  readonly alertsTruncated: boolean;
}

export interface OperationalSnapshotService {
  readSnapshot(): Promise<OperationalSnapshot>;
}

export class OperationalSnapshotError extends Error {
  constructor(reason: string, options?: ErrorOptions) {
    super(`Operational snapshot failed: ${reason}`, options);
    this.name = 'OperationalSnapshotError';
  }
}

interface EndpointRow extends QueryResultRow {
  readonly source_config_key: unknown;
  readonly source_display_name: unknown;
  readonly endpoint_config_key: unknown;
  readonly publication_active_for_collection: unknown;
  readonly source_approval_state: unknown;
  readonly source_lifecycle_state: unknown;
  readonly source_operational_state: unknown;
  readonly endpoint_approval_state: unknown;
  readonly endpoint_lifecycle_state: unknown;
  readonly endpoint_operational_state: unknown;
  readonly poll_interval_seconds: unknown;
  readonly next_due_at: unknown;
  readonly last_attempt_at: unknown;
  readonly last_success_at: unknown;
  readonly last_failure_at: unknown;
  readonly cooldown_until: unknown;
  readonly consecutive_failure_count: unknown;
}

interface JobSummaryRow extends QueryResultRow {
  readonly queued_count: unknown;
  readonly running_count: unknown;
  readonly ready_queued_count: unknown;
  readonly future_queued_count: unknown;
  readonly oldest_ready_queued_at: unknown;
  readonly expired_running_count: unknown;
}

interface ExpiredJobRow extends QueryResultRow {
  readonly job_id: unknown;
  readonly source_config_key: unknown;
  readonly endpoint_config_key: unknown;
  readonly claimed_at: unknown;
  readonly lease_expires_at: unknown;
}

export function createOperationalSnapshotService(
  database: Pick<Database, 'query'>,
  dependencies: Readonly<{
    now?: () => Date;
    workerTiming?: WorkerRuntimeTiming;
  }> = {},
): OperationalSnapshotService {
  const now = dependencies.now ?? (() => new Date());
  const workerTiming = dependencies.workerTiming ?? WORKER_RUNTIME_TIMING;
  return Object.freeze({
    readSnapshot: () =>
      readOperationalSnapshot(database, requiredNow(now), workerTiming),
  });
}

export async function readOperationalSnapshot(
  executor: QueryExecutor,
  now: Date,
  workerTiming: WorkerRuntimeTiming = WORKER_RUNTIME_TIMING,
): Promise<OperationalSnapshot> {
  const observedAt = requiredTimestamp(now, 'observation time');
  try {
    const [endpointResult, jobSummaryResult, expiredJobResult] =
      await Promise.all([
        executor.query<EndpointRow>(ENDPOINTS_QUERY),
        executor.query<JobSummaryRow>(JOB_SUMMARY_QUERY, [observedAt]),
        executor.query<ExpiredJobRow>(EXPIRED_JOBS_QUERY, [
          observedAt,
          OPERATIONAL_SNAPSHOT_EXPIRED_JOB_LIMIT + 1,
        ]),
      ]);
    return buildOperationalSnapshot(
      endpointResult.rows.map((row) => mapEndpoint(row, observedAt)),
      requiredJobSummary(jobSummaryResult.rows[0]),
      expiredJobResult.rows.map(mapExpiredJob),
      observedAt,
      workerTiming,
    );
  } catch (error) {
    if (error instanceof OperationalSnapshotError) throw error;
    throw new OperationalSnapshotError('read could not be completed', {
      cause: error,
    });
  }
}

export function buildOperationalSnapshot(
  endpoints: readonly OperationalEndpoint[],
  jobs: Readonly<{
    queuedCount: number;
    runningCount: number;
    readyQueuedCount: number;
    futureQueuedCount: number;
    oldestReadyQueuedAt: Date | null;
    expiredRunningCount: number;
  }>,
  expiredRunningJobs: readonly ExpiredRunningJob[],
  observedAt: Date,
  workerTiming: WorkerRuntimeTiming = WORKER_RUNTIME_TIMING,
): OperationalSnapshot {
  const now = requiredTimestamp(observedAt, 'observation time');
  const counts: Record<EndpointHealth, number> = {
    unknown: 0,
    healthy: 0,
    delayed: 0,
    degraded: 0,
    unhealthy: 0,
  };
  for (const endpoint of endpoints) counts[endpoint.health] += 1;
  const actionable = endpoints
    .filter(
      (endpoint) =>
        endpoint.collectionEligible &&
        endpoint.health !== 'healthy' &&
        endpoint.health !== 'unknown',
    )
    .sort(compareEndpoints);
  const boundedExpiredJobs = expiredRunningJobs
    .slice()
    .sort(compareExpiredJobs)
    .slice(0, OPERATIONAL_SNAPSHOT_EXPIRED_JOB_LIMIT);
  const oldestReadyQueuedAt = jobs.oldestReadyQueuedAt;
  const oldestReadyAgeMilliseconds =
    oldestReadyQueuedAt === null
      ? null
      : Math.max(0, now.getTime() - oldestReadyQueuedAt.getTime());
  const alerts = buildAlerts(
    actionable,
    jobs.readyQueuedCount,
    boundedExpiredJobs,
  );
  const status = deriveStatus(
    counts,
    actionable,
    jobs.readyQueuedCount,
    jobs.expiredRunningCount,
  );
  return Object.freeze({
    observedAt: now,
    status,
    endpointHealthCounts: Object.freeze(counts),
    actionableEndpoints: Object.freeze(
      actionable.slice(0, OPERATIONAL_SNAPSHOT_ACTIONABLE_ENDPOINT_LIMIT),
    ),
    actionableEndpointsTruncated:
      actionable.length > OPERATIONAL_SNAPSHOT_ACTIONABLE_ENDPOINT_LIMIT,
    jobs: Object.freeze({
      queuedCount: jobs.queuedCount,
      runningCount: jobs.runningCount,
      readyQueuedCount: jobs.readyQueuedCount,
      futureQueuedCount: jobs.futureQueuedCount,
      oldestReadyQueuedAt,
      oldestReadyAgeMilliseconds,
      expiredRunningCount: jobs.expiredRunningCount,
      expiredRunningJobs: Object.freeze(boundedExpiredJobs),
      expiredRunningJobsTruncated:
        expiredRunningJobs.length > OPERATIONAL_SNAPSHOT_EXPIRED_JOB_LIMIT,
    }),
    capacity: Object.freeze({
      ...COLLECTION_CAPACITY_LIMITS,
      databasePool: COLLECTION_DATABASE_POOL_POLICY,
    }),
    workerTiming: Object.freeze({ ...workerTiming }),
    alerts: Object.freeze(alerts.slice(0, OPERATIONAL_SNAPSHOT_ALERT_LIMIT)),
    alertsTruncated: alerts.length > OPERATIONAL_SNAPSHOT_ALERT_LIMIT,
  });
}

function mapEndpoint(row: EndpointRow, now: Date): OperationalEndpoint {
  const nextDueAt = optionalTimestamp(row.next_due_at);
  const lastAttemptAt = optionalTimestamp(row.last_attempt_at);
  const lastSuccessAt = optionalTimestamp(row.last_success_at);
  const lastFailureAt = optionalTimestamp(row.last_failure_at);
  const cooldownUntil = optionalTimestamp(row.cooldown_until);
  const facts: EndpointHealthFacts = {
    publicationActiveForCollection: requiredBoolean(
      row.publication_active_for_collection,
    ),
    sourceApprovalState: requiredState(row.source_approval_state, [
      'approved',
      'unapproved',
    ]),
    sourceLifecycleState: requiredState(row.source_lifecycle_state, [
      'active',
      'archived',
    ]),
    sourceOperationalState: requiredState(row.source_operational_state, [
      'enabled',
      'paused',
      'disabled',
    ]),
    endpointApprovalState: requiredState(row.endpoint_approval_state, [
      'approved',
      'unapproved',
    ]),
    endpointLifecycleState: requiredState(row.endpoint_lifecycle_state, [
      'active',
      'archived',
    ]),
    endpointOperationalState: requiredState(row.endpoint_operational_state, [
      'enabled',
      'paused',
      'disabled',
    ]),
    pollIntervalSeconds: requiredPositiveInteger(row.poll_interval_seconds),
    ...(nextDueAt === undefined ? {} : { nextDueAt }),
    ...(lastAttemptAt === undefined ? {} : { lastAttemptAt }),
    ...(lastSuccessAt === undefined ? {} : { lastSuccessAt }),
    ...(lastFailureAt === undefined ? {} : { lastFailureAt }),
    ...(cooldownUntil === undefined ? {} : { cooldownUntil }),
    consecutiveFailureCount: requiredNonnegativeInteger(
      row.consecutive_failure_count,
    ),
  };
  return Object.freeze({
    sourceConfigKey: requiredString(row.source_config_key),
    sourceDisplayName: requiredString(row.source_display_name),
    endpointConfigKey: requiredString(row.endpoint_config_key),
    collectionEligible: isEndpointScheduleEligible(facts),
    health: deriveEndpointHealth(facts, now),
    lastAttemptAt: facts.lastAttemptAt ?? null,
    lastSuccessAt: facts.lastSuccessAt ?? null,
    lastFailureAt: facts.lastFailureAt ?? null,
    nextDueAt: facts.nextDueAt ?? null,
    cooldownUntil: facts.cooldownUntil ?? null,
    consecutiveFailureCount: facts.consecutiveFailureCount,
    pollIntervalSeconds: facts.pollIntervalSeconds,
  });
}

function requiredJobSummary(row: JobSummaryRow | undefined) {
  if (row === undefined)
    throw new OperationalSnapshotError('job summary was absent');
  const readyQueuedCount = requiredNonnegativeInteger(row.ready_queued_count);
  const oldestReadyQueuedAt = optionalTimestamp(row.oldest_ready_queued_at);
  if ((readyQueuedCount === 0) !== (oldestReadyQueuedAt === undefined)) {
    throw new OperationalSnapshotError('job summary was inconsistent');
  }
  return Object.freeze({
    queuedCount: requiredNonnegativeInteger(row.queued_count),
    runningCount: requiredNonnegativeInteger(row.running_count),
    readyQueuedCount,
    futureQueuedCount: requiredNonnegativeInteger(row.future_queued_count),
    oldestReadyQueuedAt: oldestReadyQueuedAt ?? null,
    expiredRunningCount: requiredNonnegativeInteger(row.expired_running_count),
  });
}

function mapExpiredJob(row: ExpiredJobRow): ExpiredRunningJob {
  return Object.freeze({
    jobId: requiredString(row.job_id),
    sourceConfigKey: requiredString(row.source_config_key),
    endpointConfigKey: requiredString(row.endpoint_config_key),
    claimedAt: optionalTimestamp(row.claimed_at) ?? null,
    leaseExpiresAt: requiredTimestamp(row.lease_expires_at, 'lease expiration'),
  });
}

function buildAlerts(
  endpoints: readonly OperationalEndpoint[],
  readyQueuedCount: number,
  expiredJobs: readonly ExpiredRunningJob[],
): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  for (const endpoint of endpoints) {
    const code = `endpoint_${endpoint.health}` as OperationalAlertCode;
    alerts.push(
      Object.freeze({
        code,
        severity: endpoint.health === 'unhealthy' ? 'critical' : 'warning',
        sourceConfigKey: endpoint.sourceConfigKey,
        endpointConfigKey: endpoint.endpointConfigKey,
      }),
    );
  }
  for (const job of expiredJobs) {
    alerts.push(
      Object.freeze({
        code: 'expired_running_job',
        severity: 'critical',
        sourceConfigKey: job.sourceConfigKey,
        endpointConfigKey: job.endpointConfigKey,
        jobId: job.jobId,
      }),
    );
  }
  if (readyQueuedCount > 0) {
    alerts.push(
      Object.freeze({ code: 'ready_queued_work', severity: 'warning' }),
    );
  }
  return alerts.sort(compareAlerts);
}

function deriveStatus(
  counts: Readonly<Record<EndpointHealth, number>>,
  actionableEndpoints: readonly OperationalEndpoint[],
  readyQueuedCount: number,
  expiredRunningCount: number,
): OperationalStatus {
  if (
    actionableEndpoints.some((endpoint) => endpoint.health === 'unhealthy') ||
    expiredRunningCount > 0
  ) {
    return 'critical';
  }
  if (actionableEndpoints.length > 0 || readyQueuedCount > 0) {
    return 'attention';
  }
  if (
    counts.healthy > 0 &&
    counts.unknown === 0 &&
    counts.delayed === 0 &&
    counts.degraded === 0 &&
    counts.unhealthy === 0
  ) {
    return 'healthy';
  }
  return 'unknown';
}

function compareEndpoints(
  left: OperationalEndpoint,
  right: OperationalEndpoint,
): number {
  const severity = healthRank(right.health) - healthRank(left.health);
  if (severity !== 0) return severity;
  return (
    compareText(left.sourceConfigKey, right.sourceConfigKey) ||
    compareText(left.endpointConfigKey, right.endpointConfigKey)
  );
}

function compareExpiredJobs(
  left: ExpiredRunningJob,
  right: ExpiredRunningJob,
): number {
  return (
    left.leaseExpiresAt.getTime() - right.leaseExpiresAt.getTime() ||
    compareText(left.jobId, right.jobId)
  );
}

function compareAlerts(
  left: OperationalAlert,
  right: OperationalAlert,
): number {
  const severity = alertRank(right.severity) - alertRank(left.severity);
  if (severity !== 0) return severity;
  return (
    compareText(left.code, right.code) ||
    compareText(left.sourceConfigKey ?? '', right.sourceConfigKey ?? '') ||
    compareText(left.endpointConfigKey ?? '', right.endpointConfigKey ?? '') ||
    compareText(left.jobId ?? '', right.jobId ?? '')
  );
}

function healthRank(health: EndpointHealth): number {
  return health === 'unhealthy'
    ? 3
    : health === 'degraded'
      ? 2
      : health === 'delayed'
        ? 1
        : 0;
}

function alertRank(severity: OperationalAlertSeverity): number {
  return severity === 'critical' ? 2 : 1;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requiredNow(now: () => Date): Date {
  return requiredTimestamp(now(), 'clock value');
}

function requiredTimestamp(value: unknown, field: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new OperationalSnapshotError(`${field} was invalid`);
  }
  return value;
}

function optionalTimestamp(value: unknown): Date | undefined {
  return value === null || value === undefined
    ? undefined
    : requiredTimestamp(value, 'database timestamp');
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new OperationalSnapshotError('database string was invalid');
  }
  return value;
}

function requiredBoolean(value: unknown): boolean {
  if (value !== true && value !== false) {
    throw new OperationalSnapshotError('database boolean was invalid');
  }
  return value;
}

function requiredPositiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new OperationalSnapshotError('database positive integer was invalid');
  }
  return value as number;
}

function requiredNonnegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new OperationalSnapshotError(
      'database nonnegative integer was invalid',
    );
  }
  return value as number;
}

function requiredState<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new OperationalSnapshotError('database state was invalid');
  }
  return value as T;
}

const ENDPOINTS_QUERY = `SELECT
  s.config_key AS source_config_key,
  s.display_name AS source_display_name,
  e.config_key AS endpoint_config_key,
  p.active_for_collection AS publication_active_for_collection,
  s.approval_state AS source_approval_state,
  s.lifecycle_state AS source_lifecycle_state,
  s.operational_state AS source_operational_state,
  e.approval_state AS endpoint_approval_state,
  e.lifecycle_state AS endpoint_lifecycle_state,
  e.operational_state AS endpoint_operational_state,
  e.poll_interval_seconds,
  e.next_due_at,
  e.last_attempt_at,
  e.last_success_at,
  e.last_failure_at,
  e.cooldown_until,
  e.consecutive_failure_count
FROM source_endpoints e
JOIN sources s ON s.id = e.source_id
CROSS JOIN publication_settings p
ORDER BY s.config_key ASC, e.config_key ASC`;

const JOB_SUMMARY_QUERY = `SELECT
  count(*) FILTER (WHERE status = 'queued')::integer AS queued_count,
  count(*) FILTER (WHERE status = 'running')::integer AS running_count,
  count(*) FILTER (WHERE status = 'queued' AND available_at <= $1)::integer AS ready_queued_count,
  count(*) FILTER (WHERE status = 'queued' AND available_at > $1)::integer AS future_queued_count,
  min(enqueued_at) FILTER (WHERE status = 'queued' AND available_at <= $1) AS oldest_ready_queued_at,
  count(*) FILTER (WHERE status = 'running' AND lease_expires_at <= $1)::integer AS expired_running_count
FROM endpoint_collection_jobs`;

const EXPIRED_JOBS_QUERY = `SELECT
  job.id AS job_id,
  s.config_key AS source_config_key,
  e.config_key AS endpoint_config_key,
  job.claimed_at,
  job.lease_expires_at
FROM endpoint_collection_jobs job
JOIN source_endpoints e ON e.id = job.source_endpoint_id
JOIN sources s ON s.id = e.source_id
WHERE job.status = 'running' AND job.lease_expires_at <= $1
ORDER BY job.lease_expires_at ASC, job.claimed_at ASC, job.id ASC
LIMIT $2`;
