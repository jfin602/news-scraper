import { randomUUID } from 'node:crypto';

import type { QueryExecutor } from '../../database/database.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const EXECUTION_ID_MAX_LENGTH = 200;
const ERROR_CODE_MAX_LENGTH = 100;
const ERROR_DETAIL_MAX_LENGTH = 2000;

export type CollectionRunStatus = 'running' | 'succeeded' | 'failed';
export type CollectionRunTransportStatus =
  'not_run' | 'succeeded' | 'not_modified' | 'failed';
export type CollectionRunParserStatus = 'not_run' | 'succeeded' | 'failed';

export interface PersistedCollectionRun {
  readonly id: string;
  readonly sourceEndpointId: string;
  readonly executionId: string;
  readonly startedAt: Date;
  readonly finishedAt: Date | undefined;
  readonly runStatus: CollectionRunStatus;
  readonly transportStatus: CollectionRunTransportStatus;
  readonly parserStatus: CollectionRunParserStatus;
  readonly httpStatusCode: number | undefined;
  readonly wireByteCount: number | undefined;
  readonly decompressedByteCount: number | undefined;
  readonly rawItemCount: number;
  readonly errorCode: string | undefined;
  readonly errorDetail: string | undefined;
}

export interface StartCollectionRunInput {
  readonly sourceEndpointId: string;
  readonly executionId: string;
}

export interface FinalizeCollectionRunInput {
  readonly runStatus: 'succeeded' | 'failed';
  readonly transportStatus: CollectionRunTransportStatus;
  readonly parserStatus: CollectionRunParserStatus;
  readonly httpStatusCode?: number;
  readonly wireByteCount?: number;
  readonly decompressedByteCount?: number;
  readonly rawItemCount: number;
  readonly error?: {
    readonly code: string;
    readonly detail: string;
  };
}

export interface CollectionRunRow {
  readonly id: unknown;
  readonly source_endpoint_id: unknown;
  readonly execution_id: unknown;
  readonly started_at: unknown;
  readonly finished_at: unknown;
  readonly run_status: unknown;
  readonly transport_status: unknown;
  readonly parser_status: unknown;
  readonly http_status_code: unknown;
  readonly wire_byte_count: unknown;
  readonly decompressed_byte_count: unknown;
  readonly raw_item_count: unknown;
  readonly error_code: unknown;
  readonly error_detail: unknown;
}

interface ValidatedFinalization {
  readonly runStatus: 'succeeded' | 'failed';
  readonly transportStatus: CollectionRunTransportStatus;
  readonly parserStatus: CollectionRunParserStatus;
  readonly httpStatusCode: number | null;
  readonly wireByteCount: number | null;
  readonly decompressedByteCount: number | null;
  readonly rawItemCount: number;
  readonly errorCode: string | null;
  readonly errorDetail: string | null;
}

const COLLECTION_RUN_COLUMNS = `
  id, source_endpoint_id, execution_id, started_at, finished_at, run_status,
  transport_status, parser_status, http_status_code, wire_byte_count,
  decompressed_byte_count, raw_item_count, error_code, error_detail`;

export class CollectionRunPersistenceError extends Error {
  constructor(reason: string) {
    super(`Collection run persistence failed: ${reason}`);
    this.name = 'CollectionRunPersistenceError';
  }
}

export async function startCollectionRun(
  executor: QueryExecutor,
  input: StartCollectionRunInput,
): Promise<PersistedCollectionRun> {
  const sourceEndpointId = requiredUuid(
    input.sourceEndpointId,
    'source endpoint id',
  );
  const executionId = requiredTrimmedString(
    input.executionId,
    EXECUTION_ID_MAX_LENGTH,
    'execution id',
  );
  const result = await executor.query<CollectionRunRow>(
    `INSERT INTO collection_runs (
       id, source_endpoint_id, execution_id, run_status, transport_status,
       parser_status, raw_item_count
     ) VALUES ($1, $2, $3, 'running', 'not_run', 'not_run', 0)
     RETURNING ${COLLECTION_RUN_COLUMNS}`,
    [randomUUID(), sourceEndpointId, executionId],
  );
  return mapCollectionRunRow(requiredRow(result.rows, 'collection run start'));
}

export async function finalizeCollectionRun(
  executor: QueryExecutor,
  collectionRunId: string,
  input: FinalizeCollectionRunInput,
): Promise<PersistedCollectionRun> {
  const runId = requiredUuid(collectionRunId, 'collection run id');
  const finalization = validateFinalization(input);
  const result = await executor.query<CollectionRunRow>(
    `UPDATE collection_runs
     SET finished_at = now(),
         run_status = $2,
         transport_status = $3,
         parser_status = $4,
         http_status_code = $5,
         wire_byte_count = $6,
         decompressed_byte_count = $7,
         raw_item_count = $8,
         error_code = $9,
         error_detail = $10
     WHERE id = $1 AND run_status = 'running'
     RETURNING ${COLLECTION_RUN_COLUMNS}`,
    [
      runId,
      finalization.runStatus,
      finalization.transportStatus,
      finalization.parserStatus,
      finalization.httpStatusCode,
      finalization.wireByteCount,
      finalization.decompressedByteCount,
      finalization.rawItemCount,
      finalization.errorCode,
      finalization.errorDetail,
    ],
  );
  const row = result.rows[0];
  if (row !== undefined) return mapCollectionRunRow(row);

  const existing = await findCollectionRunById(executor, runId);
  if (existing === undefined) {
    throw new CollectionRunPersistenceError('collection run not found');
  }
  throw new CollectionRunPersistenceError('collection run is already terminal');
}

export async function findCollectionRunById(
  executor: QueryExecutor,
  collectionRunId: string,
): Promise<PersistedCollectionRun | undefined> {
  const runId = requiredUuid(collectionRunId, 'collection run id');
  const result = await executor.query<CollectionRunRow>(
    `SELECT ${COLLECTION_RUN_COLUMNS}
     FROM collection_runs
     WHERE id = $1`,
    [runId],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapCollectionRunRow(row);
}

export function mapCollectionRunRow(
  row: CollectionRunRow,
): PersistedCollectionRun {
  try {
    return Object.freeze({
      id: requiredUuid(row.id, 'database collection run id'),
      sourceEndpointId: requiredUuid(
        row.source_endpoint_id,
        'database source endpoint id',
      ),
      executionId: requiredTrimmedString(
        row.execution_id,
        EXECUTION_ID_MAX_LENGTH,
        'database execution id',
      ),
      startedAt: requiredTimestamp(row.started_at),
      finishedAt: nullableTimestamp(row.finished_at),
      runStatus: normalizeRunStatus(row.run_status),
      transportStatus: normalizeTransportStatus(row.transport_status),
      parserStatus: normalizeParserStatus(row.parser_status),
      httpStatusCode: nullableIntegerInRange(row.http_status_code, 100, 599),
      wireByteCount: nullableNonnegativeInteger(row.wire_byte_count),
      decompressedByteCount: nullableNonnegativeInteger(
        row.decompressed_byte_count,
      ),
      rawItemCount: requiredNonnegativeInteger(row.raw_item_count),
      errorCode: nullableErrorCode(row.error_code),
      errorDetail: nullableTrimmedString(
        row.error_detail,
        ERROR_DETAIL_MAX_LENGTH,
      ),
    });
  } catch {
    throw new CollectionRunPersistenceError(
      'database returned invalid collection run',
    );
  }
}

function validateFinalization(
  input: FinalizeCollectionRunInput,
): ValidatedFinalization {
  if (input === null || typeof input !== 'object') {
    throw new CollectionRunPersistenceError('invalid finalization input');
  }
  const error = input.error;
  if (error !== undefined && (error === null || typeof error !== 'object')) {
    throw new CollectionRunPersistenceError('invalid finalization error');
  }
  try {
    return Object.freeze({
      runStatus: normalizeTerminalRunStatus(input.runStatus),
      transportStatus: normalizeTransportStatus(input.transportStatus),
      parserStatus: normalizeParserStatus(input.parserStatus),
      httpStatusCode:
        input.httpStatusCode === undefined
          ? null
          : integerInRange(input.httpStatusCode, 100, 599),
      wireByteCount:
        input.wireByteCount === undefined
          ? null
          : nonnegativeInteger(input.wireByteCount),
      decompressedByteCount:
        input.decompressedByteCount === undefined
          ? null
          : nonnegativeInteger(input.decompressedByteCount),
      rawItemCount: nonnegativeInteger(input.rawItemCount),
      errorCode:
        error === undefined
          ? null
          : requiredErrorCode(error.code, 'error code'),
      errorDetail:
        error === undefined
          ? null
          : requiredTrimmedString(
              error.detail,
              ERROR_DETAIL_MAX_LENGTH,
              'error detail',
            ),
    });
  } catch (error) {
    if (error instanceof CollectionRunPersistenceError) throw error;
    throw new CollectionRunPersistenceError('invalid finalization input');
  }
}

function normalizeRunStatus(value: unknown): CollectionRunStatus {
  if (value === 'running' || value === 'succeeded' || value === 'failed') {
    return value;
  }
  throw new Error();
}

function normalizeTerminalRunStatus(value: unknown): 'succeeded' | 'failed' {
  if (value === 'succeeded' || value === 'failed') return value;
  throw new Error();
}

function normalizeTransportStatus(
  value: unknown,
): CollectionRunTransportStatus {
  if (
    value === 'not_run' ||
    value === 'succeeded' ||
    value === 'not_modified' ||
    value === 'failed'
  ) {
    return value;
  }
  throw new Error();
}

function normalizeParserStatus(value: unknown): CollectionRunParserStatus {
  if (value === 'not_run' || value === 'succeeded' || value === 'failed') {
    return value;
  }
  throw new Error();
}

function requiredUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new CollectionRunPersistenceError(`invalid ${field}`);
  }
  return value;
}

function requiredTrimmedString(
  value: unknown,
  maximumLength: number,
  field: string,
): string {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    throw new CollectionRunPersistenceError(`invalid ${field}`);
  }
  return value;
}

function requiredErrorCode(value: unknown, field: string): string {
  const errorCode = requiredTrimmedString(value, ERROR_CODE_MAX_LENGTH, field);
  if (!/^[a-z0-9]+(_[a-z0-9]+)*$/u.test(errorCode)) {
    throw new CollectionRunPersistenceError(`invalid ${field}`);
  }
  return errorCode;
}

function nullableTrimmedString(
  value: unknown,
  maximumLength: number,
): string | undefined {
  return value === null
    ? undefined
    : requiredTrimmedString(value, maximumLength, 'value');
}

function requiredTimestamp(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime()))
    throw new Error();
  return value;
}

function nullableTimestamp(value: unknown): Date | undefined {
  return value === null ? undefined : requiredTimestamp(value);
}

function nonnegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error();
  }
  return value;
}

function integerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): number {
  const integer = nonnegativeInteger(value);
  if (integer < minimum || integer > maximum) throw new Error();
  return integer;
}

function nullableIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  return value === null ? undefined : integerInRange(value, minimum, maximum);
}

function nullableNonnegativeInteger(value: unknown): number | undefined {
  if (value === null) return undefined;
  if (typeof value === 'string' && /^\d+$/u.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return nonnegativeInteger(value);
}

function nullableErrorCode(value: unknown): string | undefined {
  return value === null
    ? undefined
    : requiredErrorCode(value, 'database error code');
}

function requiredNonnegativeInteger(value: unknown): number {
  const normalized = nullableNonnegativeInteger(value);
  if (normalized === undefined) throw new Error();
  return normalized;
}

function requiredRow<T>(rows: readonly T[], operation: string): T {
  const row = rows[0];
  if (row === undefined) throw new CollectionRunPersistenceError(operation);
  return row;
}
