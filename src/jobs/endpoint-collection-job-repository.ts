import { randomUUID } from 'node:crypto';

import type { QueryExecutor } from '../database/database.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MACHINE_CODE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const WORKER_ID_MAX_LENGTH = 200;
const MACHINE_CODE_MAX_LENGTH = 100;
const ERROR_DETAIL_MAX_LENGTH = 2000;
const EXPIRED_BATCH_MAX_LIMIT = 100;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

export type EndpointCollectionJobStatus =
  'queued' | 'running' | EndpointCollectionJobTerminalStatus;
export type EndpointCollectionJobTerminalStatus =
  'succeeded' | 'failed' | 'skipped' | 'abandoned';
export type EndpointCollectionJobTriggerKind = 'scheduled' | 'manual';

export interface PersistedEndpointCollectionJob {
  readonly id: string;
  readonly sourceEndpointId: string;
  readonly triggerKind: EndpointCollectionJobTriggerKind;
  readonly status: EndpointCollectionJobStatus;
  readonly enqueuedAt: Date;
  readonly availableAt: Date;
  readonly attemptNumber: number;
  readonly previousJobId: string | undefined;
  readonly claimWorkerId: string | undefined;
  readonly claimToken: string | undefined;
  readonly claimedAt: Date | undefined;
  readonly leaseExpiresAt: Date | undefined;
  readonly collectionRunId: string | undefined;
  readonly terminalAt: Date | undefined;
  readonly outcomeCode: string | undefined;
  readonly reasonCode: string | undefined;
  readonly errorCode: string | undefined;
  readonly errorDetail: string | undefined;
  readonly updatedAt: Date;
}

export interface EnqueueEndpointCollectionJobInput {
  readonly sourceEndpointId: string;
  readonly triggerKind: EndpointCollectionJobTriggerKind;
  readonly availableAt: Date;
  readonly attemptNumber: number;
  readonly previousJobId?: string;
}

export interface EnqueueEndpointCollectionJobResult {
  readonly created: boolean;
  readonly job: PersistedEndpointCollectionJob;
}

export interface ClaimNextEndpointCollectionJobInput {
  readonly workerId: string;
  readonly claimedAt: Date;
  readonly leaseExpiresAt: Date;
}

export interface TerminalizeEndpointCollectionJobInput {
  readonly status: EndpointCollectionJobTerminalStatus;
  readonly terminalAt: Date;
  readonly outcomeCode: string;
  readonly reasonCode?: string;
  readonly error?: Readonly<{
    readonly code: string;
    readonly detail?: string;
  }>;
}

export interface RecoverExpiredStartedEndpointCollectionJobInput {
  readonly workerId: string;
  readonly expiredAt: Date;
  readonly recoveredAt: Date;
  readonly leaseExpiresAt: Date;
}

export interface EndpointCollectionJobRow {
  readonly id: unknown;
  readonly source_endpoint_id: unknown;
  readonly trigger_kind: unknown;
  readonly status: unknown;
  readonly enqueued_at: unknown;
  readonly available_at: unknown;
  readonly attempt_number: unknown;
  readonly previous_job_id: unknown;
  readonly claim_worker_id: unknown;
  readonly claim_token: unknown;
  readonly claimed_at: unknown;
  readonly lease_expires_at: unknown;
  readonly collection_run_id: unknown;
  readonly terminal_at: unknown;
  readonly outcome_code: unknown;
  readonly reason_code: unknown;
  readonly error_code: unknown;
  readonly error_detail: unknown;
  readonly updated_at: unknown;
}

interface EnqueueRow extends EndpointCollectionJobRow {
  readonly created: unknown;
}

const JOB_COLUMNS = `
  id, source_endpoint_id, trigger_kind, status, enqueued_at, available_at, attempt_number,
  previous_job_id, claim_worker_id, claim_token, claimed_at, lease_expires_at,
  collection_run_id, terminal_at, outcome_code, reason_code, error_code,
  error_detail, updated_at`;

export class EndpointCollectionJobPersistenceError extends Error {
  constructor(reason: string, options?: ErrorOptions) {
    super(`Endpoint collection job persistence failed: ${reason}`, options);
    this.name = 'EndpointCollectionJobPersistenceError';
  }
}

export async function enqueueEndpointCollectionJob(
  executor: QueryExecutor,
  input: EnqueueEndpointCollectionJobInput,
): Promise<EnqueueEndpointCollectionJobResult> {
  const validated = validateEnqueueInput(input);
  const jobId = randomUUID();
  let result;
  try {
    result = await executor.query<EnqueueRow>(
      `INSERT INTO endpoint_collection_jobs (
         id, source_endpoint_id, trigger_kind, status, available_at, attempt_number,
         previous_job_id
       )
       SELECT $1, e.id, $3, 'queued', $4, $5, $6
       FROM source_endpoints e
       WHERE e.id = $2
         AND (
           $6::uuid IS NULL
           OR EXISTS (
             SELECT 1
             FROM endpoint_collection_jobs AS previous
             WHERE previous.id = $6
               AND previous.source_endpoint_id = e.id
               AND previous.trigger_kind = $3
           )
         )
       ON CONFLICT (source_endpoint_id)
         WHERE status IN ('queued', 'running')
       DO UPDATE SET source_endpoint_id = endpoint_collection_jobs.source_endpoint_id
       RETURNING ${JOB_COLUMNS}, id = $1 AS created`,
      [
        jobId,
        validated.sourceEndpointId,
        validated.triggerKind,
        validated.availableAt,
        validated.attemptNumber,
        validated.previousJobId ?? null,
      ],
    );
  } catch (error) {
    throw new EndpointCollectionJobPersistenceError(
      'enqueue could not be completed',
      { cause: error },
    );
  }
  const row = result.rows[0];
  if (row === undefined) {
    throw new EndpointCollectionJobPersistenceError(
      'source endpoint or matching retry predecessor was not found',
    );
  }
  return Object.freeze({
    created: requiredBoolean(row.created),
    job: mapEndpointCollectionJobRow(row),
  });
}

export async function claimNextEndpointCollectionJob(
  executor: QueryExecutor,
  input: ClaimNextEndpointCollectionJobInput,
): Promise<PersistedEndpointCollectionJob | undefined> {
  const workerId = requiredWorkerId(input.workerId);
  const claimedAt = requiredTimestamp(input.claimedAt);
  const leaseExpiresAt = requiredTimestampAfter(
    input.leaseExpiresAt,
    claimedAt,
    'lease expiration',
  );
  const claimToken = randomUUID();
  const result = await executor.query<EndpointCollectionJobRow>(
    `WITH next_job AS (
       SELECT id
       FROM endpoint_collection_jobs
       WHERE status = 'queued' AND available_at <= $1
       ORDER BY available_at ASC, enqueued_at ASC, id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE endpoint_collection_jobs AS job
     SET status = 'running',
         claim_worker_id = $2,
         claim_token = $3,
         claimed_at = $1,
         lease_expires_at = $4,
         updated_at = $1
     FROM next_job
     WHERE job.id = next_job.id
     RETURNING ${qualifiedJobColumns('job')}`,
    [claimedAt, workerId, claimToken, leaseExpiresAt],
  );
  return optionalMappedRow(result.rows);
}

export async function renewEndpointCollectionJobLease(
  executor: QueryExecutor,
  jobId: string,
  claimToken: string,
  renewedAt: Date,
  leaseExpiresAt: Date,
): Promise<PersistedEndpointCollectionJob | undefined> {
  const id = requiredUuid(jobId, 'job id');
  const token = requiredUuid(claimToken, 'claim token');
  const now = requiredTimestamp(renewedAt);
  const expiration = requiredTimestampAfter(
    leaseExpiresAt,
    now,
    'lease expiration',
  );
  const result = await executor.query<EndpointCollectionJobRow>(
    `UPDATE endpoint_collection_jobs
     SET lease_expires_at = $4, updated_at = $3
     WHERE id = $1
       AND status = 'running'
       AND claim_token = $2
       AND lease_expires_at > $3
       AND $4 > lease_expires_at
     RETURNING ${JOB_COLUMNS}`,
    [id, token, now, expiration],
  );
  return optionalMappedRow(result.rows);
}

export async function attachCollectionRunToEndpointCollectionJob(
  executor: QueryExecutor,
  jobId: string,
  claimToken: string,
  collectionRunId: string,
): Promise<PersistedEndpointCollectionJob | undefined> {
  const id = requiredUuid(jobId, 'job id');
  const token = requiredUuid(claimToken, 'claim token');
  const runId = requiredUuid(collectionRunId, 'collection run id');
  const result = await executor.query<EndpointCollectionJobRow>(
    `WITH locked_job AS MATERIALIZED (
       SELECT id
       FROM endpoint_collection_jobs
       WHERE id = $1
       FOR UPDATE
     ),
     attachment_clock AS MATERIALIZED (
       SELECT clock_timestamp() AS attached_at
       FROM locked_job
     )
     UPDATE endpoint_collection_jobs AS job
     SET collection_run_id = run.id,
         updated_at = GREATEST(job.updated_at, attachment_clock.attached_at)
     FROM collection_runs AS run, locked_job, attachment_clock
     WHERE job.id = locked_job.id
       AND job.status = 'running'
       AND job.claim_token = $2
       AND run.id = $3
       AND run.source_endpoint_id = job.source_endpoint_id
       AND run.execution_id = job.id::text
       AND run.trigger_kind = job.trigger_kind
       AND job.lease_expires_at > attachment_clock.attached_at
       AND (job.collection_run_id IS NULL OR job.collection_run_id = run.id)
     RETURNING ${qualifiedJobColumns('job')}`,
    [id, token, runId],
  );
  return optionalMappedRow(result.rows);
}

export async function terminalizeEndpointCollectionJob(
  executor: QueryExecutor,
  jobId: string,
  claimToken: string,
  input: TerminalizeEndpointCollectionJobInput,
): Promise<PersistedEndpointCollectionJob | undefined> {
  const id = requiredUuid(jobId, 'job id');
  const token = requiredUuid(claimToken, 'claim token');
  const terminal = validateTerminalInput(input);
  const result = await executor.query<EndpointCollectionJobRow>(
    `UPDATE endpoint_collection_jobs
     SET status = $3,
         claim_token = NULL,
         lease_expires_at = NULL,
         terminal_at = $4,
         outcome_code = $5,
         reason_code = $6,
         error_code = $7,
         error_detail = $8,
         updated_at = $4
     WHERE id = $1
       AND status = 'running'
       AND claim_token = $2
       AND lease_expires_at > $4
     RETURNING ${JOB_COLUMNS}`,
    [
      id,
      token,
      terminal.status,
      terminal.terminalAt,
      terminal.outcomeCode,
      terminal.reasonCode ?? null,
      terminal.errorCode ?? null,
      terminal.errorDetail ?? null,
    ],
  );
  return optionalMappedRow(result.rows);
}

export async function deferClaimedEndpointCollectionJob(
  executor: QueryExecutor,
  jobId: string,
  claimToken: string,
  deferredAt: Date,
  availableAt: Date,
): Promise<PersistedEndpointCollectionJob | undefined> {
  const id = requiredUuid(jobId, 'job id');
  const token = requiredUuid(claimToken, 'claim token');
  const now = requiredTimestamp(deferredAt);
  const availability = requiredTimestamp(availableAt);
  const result = await executor.query<EndpointCollectionJobRow>(
    `UPDATE endpoint_collection_jobs
     SET status = 'queued',
         available_at = $4,
         claim_worker_id = NULL,
         claim_token = NULL,
         claimed_at = NULL,
         lease_expires_at = NULL,
         updated_at = $3
     WHERE id = $1
       AND status = 'running'
       AND claim_token = $2
       AND lease_expires_at > $3
       AND collection_run_id IS NULL
     RETURNING ${JOB_COLUMNS}`,
    [id, token, now, availability],
  );
  return optionalMappedRow(result.rows);
}

export async function listExpiredRunningEndpointCollectionJobs(
  executor: QueryExecutor,
  expiredAt: Date,
  limit: number,
): Promise<readonly PersistedEndpointCollectionJob[]> {
  const boundary = requiredTimestamp(expiredAt);
  const boundedLimit = requiredIntegerInRange(
    limit,
    1,
    EXPIRED_BATCH_MAX_LIMIT,
    'expired job batch limit',
  );
  const result = await executor.query<EndpointCollectionJobRow>(
    `SELECT ${JOB_COLUMNS}
     FROM endpoint_collection_jobs
     WHERE status = 'running' AND lease_expires_at <= $1
     ORDER BY lease_expires_at ASC, claimed_at ASC, id ASC
     LIMIT $2`,
    [boundary, boundedLimit],
  );
  return Object.freeze(result.rows.map(mapEndpointCollectionJobRow));
}

export async function listRecentEndpointCollectionJobs(
  executor: QueryExecutor,
  limit: number,
): Promise<readonly PersistedEndpointCollectionJob[]> {
  const boundedLimit = requiredIntegerInRange(
    limit,
    1,
    EXPIRED_BATCH_MAX_LIMIT,
    'recent job batch limit',
  );
  const result = await executor.query<EndpointCollectionJobRow>(
    `SELECT ${JOB_COLUMNS}
     FROM endpoint_collection_jobs
     ORDER BY updated_at DESC, id DESC
     LIMIT $1`,
    [boundedLimit],
  );
  return Object.freeze(result.rows.map(mapEndpointCollectionJobRow));
}

export async function requeueExpiredUnstartedEndpointCollectionJob(
  executor: QueryExecutor,
  jobId: string,
  expiredAt: Date,
  availableAt: Date,
): Promise<PersistedEndpointCollectionJob | undefined> {
  const id = requiredUuid(jobId, 'job id');
  const boundary = requiredTimestamp(expiredAt);
  const availability = requiredTimestamp(availableAt);
  const result = await executor.query<EndpointCollectionJobRow>(
    `UPDATE endpoint_collection_jobs
     SET status = 'queued',
         available_at = $3,
         claim_worker_id = NULL,
         claim_token = NULL,
         claimed_at = NULL,
         lease_expires_at = NULL,
         updated_at = $2
     WHERE id = $1
       AND status = 'running'
       AND lease_expires_at <= $2
       AND collection_run_id IS NULL
     RETURNING ${JOB_COLUMNS}`,
    [id, boundary, availability],
  );
  return optionalMappedRow(result.rows);
}

export async function recoverExpiredStartedEndpointCollectionJob(
  executor: QueryExecutor,
  jobId: string,
  input: RecoverExpiredStartedEndpointCollectionJobInput,
): Promise<PersistedEndpointCollectionJob | undefined> {
  const id = requiredUuid(jobId, 'job id');
  const workerId = requiredWorkerId(input.workerId);
  const expiredAt = requiredTimestamp(input.expiredAt);
  const recoveredAt = requiredTimestamp(input.recoveredAt);
  const leaseExpiresAt = requiredTimestampAfter(
    input.leaseExpiresAt,
    recoveredAt,
    'lease expiration',
  );
  const claimToken = randomUUID();
  const result = await executor.query<EndpointCollectionJobRow>(
    `UPDATE endpoint_collection_jobs
     SET claim_worker_id = $3,
         claim_token = $4,
         claimed_at = $5,
         lease_expires_at = $6,
         updated_at = $5
     WHERE id = $1
       AND status = 'running'
       AND lease_expires_at <= $2
       AND collection_run_id IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM collection_runs AS run
         WHERE run.id = endpoint_collection_jobs.collection_run_id
           AND run.source_endpoint_id = endpoint_collection_jobs.source_endpoint_id
           AND run.execution_id = endpoint_collection_jobs.id::text
           AND run.trigger_kind = endpoint_collection_jobs.trigger_kind
       )
     RETURNING ${JOB_COLUMNS}`,
    [id, expiredAt, workerId, claimToken, recoveredAt, leaseExpiresAt],
  );
  return optionalMappedRow(result.rows);
}

export async function findEndpointCollectionJobById(
  executor: QueryExecutor,
  jobId: string,
): Promise<PersistedEndpointCollectionJob | undefined> {
  const id = requiredUuid(jobId, 'job id');
  const result = await executor.query<EndpointCollectionJobRow>(
    `SELECT ${JOB_COLUMNS}
     FROM endpoint_collection_jobs
     WHERE id = $1`,
    [id],
  );
  return optionalMappedRow(result.rows);
}

export function mapEndpointCollectionJobRow(
  row: EndpointCollectionJobRow,
): PersistedEndpointCollectionJob {
  try {
    const mapped: PersistedEndpointCollectionJob = {
      id: requiredUuid(row.id, 'database job id'),
      sourceEndpointId: requiredUuid(
        row.source_endpoint_id,
        'database source endpoint id',
      ),
      triggerKind: normalizeTriggerKind(row.trigger_kind),
      status: normalizeStatus(row.status),
      enqueuedAt: requiredTimestamp(row.enqueued_at),
      availableAt: requiredTimestamp(row.available_at),
      attemptNumber: requiredPositiveInteger(row.attempt_number),
      previousJobId: nullableUuid(row.previous_job_id, 'previous job id'),
      claimWorkerId: nullableWorkerId(row.claim_worker_id),
      claimToken: nullableUuid(row.claim_token, 'claim token'),
      claimedAt: nullableTimestamp(row.claimed_at),
      leaseExpiresAt: nullableTimestamp(row.lease_expires_at),
      collectionRunId: nullableUuid(row.collection_run_id, 'collection run id'),
      terminalAt: nullableTimestamp(row.terminal_at),
      outcomeCode: nullableMachineCode(row.outcome_code, 'outcome code'),
      reasonCode: nullableMachineCode(row.reason_code, 'reason code'),
      errorCode: nullableMachineCode(row.error_code, 'error code'),
      errorDetail: nullableErrorDetail(row.error_detail),
      updatedAt: requiredTimestamp(row.updated_at),
    };
    validateMappedState(mapped);
    return Object.freeze(mapped);
  } catch (error) {
    if (error instanceof EndpointCollectionJobPersistenceError) throw error;
    throw new EndpointCollectionJobPersistenceError(
      'database returned an invalid endpoint collection job',
      { cause: error },
    );
  }
}

function validateEnqueueInput(
  input: EnqueueEndpointCollectionJobInput,
): EnqueueEndpointCollectionJobInput {
  try {
    const sourceEndpointId = requiredUuid(
      input.sourceEndpointId,
      'source endpoint id',
    );
    const triggerKind = normalizeTriggerKind(input.triggerKind);
    const availableAt = requiredTimestamp(input.availableAt);
    const attemptNumber = requiredPositiveInteger(input.attemptNumber);
    const previousJobId =
      input.previousJobId === undefined
        ? undefined
        : requiredUuid(input.previousJobId, 'previous job id');
    if (
      (attemptNumber === 1 && previousJobId !== undefined) ||
      (attemptNumber > 1 && previousJobId === undefined)
    ) {
      throw new Error('invalid retry chain shape');
    }
    return Object.freeze({
      sourceEndpointId,
      triggerKind,
      availableAt,
      attemptNumber,
      ...(previousJobId === undefined ? {} : { previousJobId }),
    });
  } catch (error) {
    if (error instanceof EndpointCollectionJobPersistenceError) throw error;
    throw new EndpointCollectionJobPersistenceError('invalid enqueue input', {
      cause: error,
    });
  }
}

function validateTerminalInput(input: TerminalizeEndpointCollectionJobInput) {
  try {
    if (input === null || typeof input !== 'object') throw new Error();
    const error = input.error;
    if (error !== undefined && (error === null || typeof error !== 'object')) {
      throw new Error();
    }
    return Object.freeze({
      status: normalizeTerminalStatus(input.status),
      terminalAt: requiredTimestamp(input.terminalAt),
      outcomeCode: requiredMachineCode(input.outcomeCode, 'outcome code'),
      reasonCode:
        input.reasonCode === undefined
          ? undefined
          : requiredMachineCode(input.reasonCode, 'reason code'),
      errorCode:
        error === undefined
          ? undefined
          : requiredMachineCode(error.code, 'error code'),
      errorDetail:
        error?.detail === undefined
          ? undefined
          : requiredErrorDetail(error.detail),
    });
  } catch (error) {
    throw new EndpointCollectionJobPersistenceError(
      'invalid terminal transition input',
      { cause: error },
    );
  }
}

function validateMappedState(job: PersistedEndpointCollectionJob): void {
  const retryShapeValid =
    (job.attemptNumber === 1 && job.previousJobId === undefined) ||
    (job.attemptNumber > 1 && job.previousJobId !== undefined);
  if (!retryShapeValid || job.previousJobId === job.id) throw new Error();

  const noTerminalDiagnostics =
    job.terminalAt === undefined &&
    job.outcomeCode === undefined &&
    job.reasonCode === undefined &&
    job.errorCode === undefined &&
    job.errorDetail === undefined;
  if (job.status === 'queued') {
    if (
      job.claimWorkerId !== undefined ||
      job.claimToken !== undefined ||
      job.claimedAt !== undefined ||
      job.leaseExpiresAt !== undefined ||
      job.collectionRunId !== undefined ||
      !noTerminalDiagnostics
    ) {
      throw new Error();
    }
    return;
  }
  if (job.status === 'running') {
    if (
      job.claimWorkerId === undefined ||
      job.claimToken === undefined ||
      job.claimedAt === undefined ||
      job.leaseExpiresAt === undefined ||
      job.leaseExpiresAt <= job.claimedAt ||
      !noTerminalDiagnostics
    ) {
      throw new Error();
    }
    return;
  }
  if (
    job.claimWorkerId === undefined ||
    job.claimToken !== undefined ||
    job.claimedAt === undefined ||
    job.leaseExpiresAt !== undefined ||
    job.terminalAt === undefined ||
    job.terminalAt < job.claimedAt ||
    job.outcomeCode === undefined
  ) {
    throw new Error();
  }
}

function qualifiedJobColumns(alias: string): string {
  return JOB_COLUMNS.split(',')
    .map((column) => `${alias}.${column.trim()}`)
    .join(', ');
}

function optionalMappedRow(
  rows: readonly EndpointCollectionJobRow[],
): PersistedEndpointCollectionJob | undefined {
  const row = rows[0];
  return row === undefined ? undefined : mapEndpointCollectionJobRow(row);
}

function normalizeStatus(value: unknown): EndpointCollectionJobStatus {
  if (value === 'queued' || value === 'running') return value;
  return normalizeTerminalStatus(value);
}

function normalizeTriggerKind(
  value: unknown,
): EndpointCollectionJobTriggerKind {
  if (value === 'scheduled' || value === 'manual') return value;
  throw new Error();
}

function normalizeTerminalStatus(
  value: unknown,
): EndpointCollectionJobTerminalStatus {
  if (
    value !== 'succeeded' &&
    value !== 'failed' &&
    value !== 'skipped' &&
    value !== 'abandoned'
  ) {
    throw new Error();
  }
  return value;
}

function requiredUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`invalid ${field}`);
  }
  return value;
}

function nullableUuid(value: unknown, field: string): string | undefined {
  return value === null ? undefined : requiredUuid(value, field);
}

function requiredTimestamp(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error('invalid timestamp');
  }
  return value;
}

function nullableTimestamp(value: unknown): Date | undefined {
  return value === null ? undefined : requiredTimestamp(value);
}

function requiredTimestampAfter(
  value: unknown,
  boundary: Date,
  field: string,
): Date {
  const timestamp = requiredTimestamp(value);
  if (timestamp <= boundary) throw new Error(`invalid ${field}`);
  return timestamp;
}

function requiredPositiveInteger(value: unknown): number {
  return requiredIntegerInRange(
    value,
    1,
    POSTGRES_INTEGER_MAX,
    'positive integer',
  );
}

function requiredIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  field: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`invalid ${field}`);
  }
  return value;
}

function requiredWorkerId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    value.length === 0 ||
    value.length > WORKER_ID_MAX_LENGTH ||
    /\p{Cc}/u.test(value)
  ) {
    throw new Error('invalid worker id');
  }
  return value;
}

function nullableWorkerId(value: unknown): string | undefined {
  return value === null ? undefined : requiredWorkerId(value);
}

function requiredMachineCode(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length > MACHINE_CODE_MAX_LENGTH ||
    !MACHINE_CODE_PATTERN.test(value)
  ) {
    throw new Error(`invalid ${field}`);
  }
  return value;
}

function nullableMachineCode(
  value: unknown,
  field: string,
): string | undefined {
  return value === null ? undefined : requiredMachineCode(value, field);
}

function requiredErrorDetail(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    value.length === 0 ||
    value.length > ERROR_DETAIL_MAX_LENGTH ||
    /\p{Cc}/u.test(value)
  ) {
    throw new Error('invalid error detail');
  }
  return value;
}

function nullableErrorDetail(value: unknown): string | undefined {
  return value === null ? undefined : requiredErrorDetail(value);
}

function requiredBoolean(value: unknown): boolean {
  if (value !== true && value !== false) throw new Error('invalid boolean');
  return value;
}
