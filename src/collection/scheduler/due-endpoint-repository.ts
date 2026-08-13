import type { QueryExecutor } from '../../database/database.ts';

const SCHEDULER_BATCH_MAX_LIMIT = 100;

export interface DueEndpoint {
  readonly id: string;
  readonly pollIntervalSeconds: number;
  readonly nextDueAt: Date | undefined;
}

interface DueEndpointRow {
  readonly id: unknown;
  readonly poll_interval_seconds: unknown;
  readonly next_due_at: unknown;
}

export class DueEndpointPersistenceError extends Error {
  constructor(reason: string, options?: ErrorOptions) {
    super(`Due endpoint lookup failed: ${reason}`, options);
    this.name = 'DueEndpointPersistenceError';
  }
}

export async function listDueEndpoints(
  executor: QueryExecutor,
  now: Date,
  limit: number,
): Promise<readonly DueEndpoint[]> {
  const boundary = requiredTimestamp(now, 'scheduler time');
  const batchLimit = requiredLimit(limit);
  let result;
  try {
    result = await executor.query<DueEndpointRow>(
      `SELECT e.id, e.poll_interval_seconds, e.next_due_at
       FROM source_endpoints AS e
       JOIN sources AS s ON s.id = e.source_id
       WHERE EXISTS (
         SELECT 1
         FROM publication_settings AS p
         WHERE p.active_for_collection = TRUE
       )
         AND s.approval_state = 'approved'
         AND s.lifecycle_state = 'active'
         AND s.operational_state = 'enabled'
         AND e.approval_state = 'approved'
         AND e.lifecycle_state = 'active'
         AND e.operational_state = 'enabled'
         AND (e.cooldown_until IS NULL OR e.cooldown_until <= $1)
         AND (e.next_due_at IS NULL OR e.next_due_at <= $1)
         AND NOT EXISTS (
           SELECT 1
           FROM endpoint_collection_jobs AS job
           WHERE job.source_endpoint_id = e.id
             AND job.status IN ('queued', 'running')
         )
       ORDER BY (e.next_due_at IS NOT NULL) ASC, e.next_due_at ASC, e.id ASC
       LIMIT $2`,
      [boundary, batchLimit],
    );
  } catch (error) {
    throw new DueEndpointPersistenceError('query could not be completed', {
      cause: error,
    });
  }
  return Object.freeze(result.rows.map(mapDueEndpointRow));
}

export function mapDueEndpointRow(row: DueEndpointRow): DueEndpoint {
  try {
    const id = requiredUuid(row.id);
    const pollIntervalSeconds = row.poll_interval_seconds;
    if (
      typeof pollIntervalSeconds !== 'number' ||
      !Number.isSafeInteger(pollIntervalSeconds) ||
      pollIntervalSeconds <= 0
    ) {
      throw new Error();
    }
    return Object.freeze({
      id,
      pollIntervalSeconds,
      nextDueAt:
        row.next_due_at === null
          ? undefined
          : requiredTimestamp(row.next_due_at, 'next due time'),
    });
  } catch (error) {
    if (error instanceof DueEndpointPersistenceError) throw error;
    throw new DueEndpointPersistenceError(
      'database returned an invalid due endpoint',
      { cause: error },
    );
  }
}

function requiredLimit(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > SCHEDULER_BATCH_MAX_LIMIT
  ) {
    throw new DueEndpointPersistenceError(
      'batch limit is outside supported bounds',
    );
  }
  return value;
}

function requiredUuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      value,
    )
  ) {
    throw new Error();
  }
  return value;
}

function requiredTimestamp(value: unknown, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DueEndpointPersistenceError(`${field} is invalid`);
  }
  return value;
}
