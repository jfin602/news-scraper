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
export type CollectionRunNormalizationStatus =
  'not_run' | 'succeeded' | 'failed';
export type CollectionRunProcessingStatus = 'not_run' | 'succeeded' | 'failed';

export interface PersistedCollectionRun {
  readonly id: string;
  readonly sourceEndpointId: string;
  readonly executionId: string;
  readonly startedAt: Date;
  readonly finishedAt: Date | undefined;
  readonly runStatus: CollectionRunStatus;
  readonly transportStatus: CollectionRunTransportStatus;
  readonly parserStatus: CollectionRunParserStatus;
  readonly normalizationStatus: CollectionRunNormalizationStatus;
  readonly processingStatus: CollectionRunProcessingStatus;
  readonly httpStatusCode: number | undefined;
  readonly wireByteCount: number | undefined;
  readonly decompressedByteCount: number | undefined;
  readonly redirectCount?: number | undefined;
  readonly transportElapsedMilliseconds?: number | undefined;
  readonly rawItemCount: number;
  readonly normalizedCandidateCount: number;
  readonly normalizationFailureCount: number;
  readonly articleLinkRejectionCount: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly rejectedCount: number;
  readonly excludedCount: number;
  readonly failedCount: number;
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
  readonly normalizationStatus: CollectionRunNormalizationStatus;
  readonly processingStatus: CollectionRunProcessingStatus;
  readonly httpStatusCode?: number;
  readonly wireByteCount?: number;
  readonly decompressedByteCount?: number;
  readonly redirectCount?: number;
  readonly transportElapsedMilliseconds?: number;
  readonly rawItemCount: number;
  readonly normalizedCandidateCount: number;
  readonly normalizationFailureCount: number;
  readonly articleLinkRejectionCount: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly rejectedCount: number;
  readonly excludedCount: number;
  readonly failedCount: number;
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
  readonly normalization_status: unknown;
  readonly processing_status: unknown;
  readonly http_status_code: unknown;
  readonly wire_byte_count: unknown;
  readonly decompressed_byte_count: unknown;
  readonly redirect_count?: unknown;
  readonly transport_elapsed_milliseconds?: unknown;
  readonly raw_item_count: unknown;
  readonly normalized_candidate_count: unknown;
  readonly normalization_failure_count: unknown;
  readonly article_link_rejection_count: unknown;
  readonly created_count: unknown;
  readonly updated_count: unknown;
  readonly unchanged_count: unknown;
  readonly rejected_count: unknown;
  readonly excluded_count: unknown;
  readonly failed_count: unknown;
  readonly error_code: unknown;
  readonly error_detail: unknown;
}

interface ValidatedFinalization {
  readonly runStatus: 'succeeded' | 'failed';
  readonly transportStatus: CollectionRunTransportStatus;
  readonly parserStatus: CollectionRunParserStatus;
  readonly normalizationStatus: CollectionRunNormalizationStatus;
  readonly processingStatus: CollectionRunProcessingStatus;
  readonly httpStatusCode: number | null;
  readonly wireByteCount: number | null;
  readonly decompressedByteCount: number | null;
  readonly redirectCount: number | null;
  readonly transportElapsedMilliseconds: number | null;
  readonly rawItemCount: number;
  readonly normalizedCandidateCount: number;
  readonly normalizationFailureCount: number;
  readonly articleLinkRejectionCount: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly rejectedCount: number;
  readonly excludedCount: number;
  readonly failedCount: number;
  readonly errorCode: string | null;
  readonly errorDetail: string | null;
}

const COLLECTION_RUN_COLUMNS = `
  id, source_endpoint_id, execution_id, started_at, finished_at, run_status,
  transport_status, parser_status, normalization_status, processing_status, http_status_code,
  wire_byte_count, decompressed_byte_count, redirect_count,
  transport_elapsed_milliseconds, raw_item_count,
  normalized_candidate_count, normalization_failure_count,
  article_link_rejection_count, created_count, updated_count, unchanged_count,
  rejected_count, excluded_count, failed_count, error_code, error_detail`;

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
       parser_status, normalization_status, processing_status, raw_item_count,
       normalized_candidate_count, normalization_failure_count,
       article_link_rejection_count, created_count, updated_count, unchanged_count,
       rejected_count, excluded_count, failed_count
     ) VALUES ($1, $2, $3, 'running', 'not_run', 'not_run', 'not_run', 'not_run', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
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
         normalization_status = $5,
         processing_status = $6,
         http_status_code = $7,
         wire_byte_count = $8,
         decompressed_byte_count = $9,
         redirect_count = $10,
         transport_elapsed_milliseconds = $11,
         raw_item_count = $12,
         normalized_candidate_count = $13,
         normalization_failure_count = $14,
         article_link_rejection_count = $15,
         created_count = $16,
         updated_count = $17,
         unchanged_count = $18,
         rejected_count = $19,
         excluded_count = $20,
         failed_count = $21,
         error_code = $22,
         error_detail = $23
     WHERE id = $1 AND run_status = 'running'
     RETURNING ${COLLECTION_RUN_COLUMNS}`,
    [
      runId,
      finalization.runStatus,
      finalization.transportStatus,
      finalization.parserStatus,
      finalization.normalizationStatus,
      finalization.processingStatus,
      finalization.httpStatusCode,
      finalization.wireByteCount,
      finalization.decompressedByteCount,
      finalization.redirectCount,
      finalization.transportElapsedMilliseconds,
      finalization.rawItemCount,
      finalization.normalizedCandidateCount,
      finalization.normalizationFailureCount,
      finalization.articleLinkRejectionCount,
      finalization.createdCount,
      finalization.updatedCount,
      finalization.unchangedCount,
      finalization.rejectedCount,
      finalization.excludedCount,
      finalization.failedCount,
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
    const mapped = {
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
      normalizationStatus: normalizeNormalizationStatus(
        row.normalization_status,
      ),
      processingStatus: normalizeProcessingStatus(row.processing_status),
      httpStatusCode: nullableIntegerInRange(row.http_status_code, 100, 599),
      wireByteCount: nullableNonnegativeInteger(row.wire_byte_count),
      decompressedByteCount: nullableNonnegativeInteger(
        row.decompressed_byte_count,
      ),
      redirectCount: nullableNonnegativeInteger(row.redirect_count),
      transportElapsedMilliseconds: nullableNonnegativeNumber(
        row.transport_elapsed_milliseconds,
      ),
      rawItemCount: requiredNonnegativeInteger(row.raw_item_count),
      normalizedCandidateCount: requiredNonnegativeInteger(
        row.normalized_candidate_count,
      ),
      normalizationFailureCount: requiredNonnegativeInteger(
        row.normalization_failure_count,
      ),
      articleLinkRejectionCount: requiredNonnegativeInteger(
        row.article_link_rejection_count,
      ),
      createdCount: requiredNonnegativeInteger(row.created_count),
      updatedCount: requiredNonnegativeInteger(row.updated_count),
      unchangedCount: requiredNonnegativeInteger(row.unchanged_count),
      rejectedCount: requiredNonnegativeInteger(row.rejected_count),
      excludedCount: requiredNonnegativeInteger(row.excluded_count),
      failedCount: requiredNonnegativeInteger(row.failed_count),
      errorCode: nullableErrorCode(row.error_code),
      errorDetail: nullableTrimmedString(
        row.error_detail,
        ERROR_DETAIL_MAX_LENGTH,
      ),
    };
    validateRunAccounting(mapped);
    return Object.freeze(mapped);
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
    const validated = {
      runStatus: normalizeTerminalRunStatus(input.runStatus),
      transportStatus: normalizeTransportStatus(input.transportStatus),
      parserStatus: normalizeParserStatus(input.parserStatus),
      normalizationStatus: normalizeNormalizationStatus(
        input.normalizationStatus,
      ),
      processingStatus: normalizeProcessingStatus(input.processingStatus),
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
      redirectCount:
        input.redirectCount === undefined
          ? null
          : nonnegativeInteger(input.redirectCount),
      transportElapsedMilliseconds:
        input.transportElapsedMilliseconds === undefined
          ? null
          : nonnegativeNumber(input.transportElapsedMilliseconds),
      rawItemCount: nonnegativeInteger(input.rawItemCount),
      normalizedCandidateCount: nonnegativeInteger(
        input.normalizedCandidateCount,
      ),
      normalizationFailureCount: nonnegativeInteger(
        input.normalizationFailureCount,
      ),
      articleLinkRejectionCount: nonnegativeInteger(
        input.articleLinkRejectionCount,
      ),
      createdCount: nonnegativeInteger(input.createdCount),
      updatedCount: nonnegativeInteger(input.updatedCount),
      unchangedCount: nonnegativeInteger(input.unchangedCount),
      rejectedCount: nonnegativeInteger(input.rejectedCount),
      excludedCount: nonnegativeInteger(input.excludedCount),
      failedCount: nonnegativeInteger(input.failedCount),
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
    };
    validateRunAccounting(validated);
    return Object.freeze(validated);
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

function normalizeNormalizationStatus(
  value: unknown,
): CollectionRunNormalizationStatus {
  if (value === 'not_run' || value === 'succeeded' || value === 'failed') {
    return value;
  }
  throw new Error();
}

function normalizeProcessingStatus(
  value: unknown,
): CollectionRunProcessingStatus {
  if (value === 'not_run' || value === 'succeeded' || value === 'failed') {
    return value;
  }
  throw new Error();
}

function validateRunAccounting(value: {
  readonly runStatus: CollectionRunStatus;
  readonly parserStatus: CollectionRunParserStatus;
  readonly normalizationStatus: CollectionRunNormalizationStatus;
  readonly processingStatus: CollectionRunProcessingStatus;
  readonly rawItemCount: number;
  readonly normalizedCandidateCount: number;
  readonly normalizationFailureCount: number;
  readonly articleLinkRejectionCount: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly rejectedCount: number;
  readonly excludedCount: number;
  readonly failedCount: number;
}): void {
  if (
    value.articleLinkRejectionCount > value.normalizedCandidateCount ||
    (value.normalizationStatus === 'not_run' &&
      (value.normalizedCandidateCount !== 0 ||
        value.normalizationFailureCount !== 0 ||
        value.articleLinkRejectionCount !== 0)) ||
    (value.normalizationStatus !== 'not_run' &&
      value.parserStatus !== 'succeeded') ||
    (value.normalizationStatus === 'succeeded' &&
      value.rawItemCount !==
        value.normalizedCandidateCount + value.normalizationFailureCount) ||
    (value.normalizationStatus === 'failed' &&
      value.runStatus === 'succeeded') ||
    (value.processingStatus === 'not_run' &&
      (value.createdCount !== 0 ||
        value.updatedCount !== 0 ||
        value.unchangedCount !== 0 ||
        value.rejectedCount !== 0 ||
        value.excludedCount !== 0 ||
        value.failedCount !== 0)) ||
    (value.processingStatus !== 'not_run' &&
      (value.normalizationStatus !== 'succeeded' ||
        value.createdCount +
          value.updatedCount +
          value.unchangedCount +
          value.rejectedCount +
          value.excludedCount +
          value.failedCount !==
          value.normalizedCandidateCount ||
        value.rejectedCount < value.articleLinkRejectionCount)) ||
    (value.processingStatus === 'failed' && value.runStatus !== 'failed')
  ) {
    throw new Error();
  }
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

function nonnegativeNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
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
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && /^\d+$/u.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return nonnegativeInteger(value);
}

function nullableNonnegativeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  return nonnegativeNumber(value);
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
