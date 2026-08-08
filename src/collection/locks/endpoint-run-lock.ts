import { createHash } from 'node:crypto';

import type {
  Database,
  DatabaseSession,
  QueryExecutor,
} from '../../database/database.ts';

const ENDPOINT_RUN_LOCK_NAMESPACE = 'news-scraper:endpoint-run-lock:';
const ENDPOINT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface EndpointRunLockAcquired<T> {
  readonly status: 'acquired';
  readonly value: T;
}

export interface EndpointRunLockBlocked {
  readonly status: 'blocked';
  readonly stage: 'lock';
  readonly reason: 'endpoint_locked';
}

export type EndpointRunLockResult<T> =
  EndpointRunLockAcquired<T> | EndpointRunLockBlocked;

export class EndpointRunLockError extends Error {
  constructor(reason: string, options?: ErrorOptions) {
    super(`Endpoint run lock failed: ${reason}`, options);
    this.name = 'EndpointRunLockError';
  }
}

const ENDPOINT_LOCKED_RESULT: EndpointRunLockBlocked = Object.freeze({
  status: 'blocked',
  stage: 'lock',
  reason: 'endpoint_locked',
});

export function endpointRunLockKey(endpointId: string): string {
  if (!ENDPOINT_ID_PATTERN.test(endpointId)) {
    throw new TypeError('Endpoint id must be a UUID.');
  }

  const digest = createHash('sha256')
    .update(`${ENDPOINT_RUN_LOCK_NAMESPACE}${endpointId.toLowerCase()}`, 'utf8')
    .digest();
  return digest.readBigInt64BE(0).toString(10);
}

export async function withEndpointRunLock<T>(
  database: Pick<Database, 'withSession'>,
  endpointId: string,
  work: (executor: QueryExecutor) => Promise<T>,
): Promise<EndpointRunLockResult<T>> {
  const key = endpointRunLockKey(endpointId);

  return database.withSession(async (session) => {
    const acquired = await acquireLock(session, key);
    if (!acquired) return ENDPOINT_LOCKED_RESULT;

    let workCompleted = false;
    let workValue!: T;
    let workFailure: unknown;
    let releaseFailure: EndpointRunLockError | undefined;
    try {
      workValue = await work(session);
      workCompleted = true;
    } catch (error) {
      workFailure = error;
    } finally {
      releaseFailure = await releaseLock(session, key);
    }

    if (releaseFailure !== undefined) {
      if (!workCompleted) {
        throw new AggregateError(
          [workFailure, releaseFailure],
          'Endpoint run lock work and release both failed.',
          { cause: releaseFailure },
        );
      }
      throw releaseFailure;
    }
    if (!workCompleted) throw workFailure;

    return Object.freeze({ status: 'acquired', value: workValue });
  });
}

async function acquireLock(
  session: DatabaseSession,
  key: string,
): Promise<boolean> {
  try {
    const result = await session.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1::bigint) AS acquired',
      [key],
    );
    const acquired = result.rows[0]?.acquired;
    if (acquired === true || acquired === false) return acquired;

    session.discard();
    throw new EndpointRunLockError('acquisition returned an invalid result');
  } catch (error) {
    session.discard();
    throw error;
  }
}

async function releaseLock(
  session: DatabaseSession,
  key: string,
): Promise<EndpointRunLockError | undefined> {
  try {
    const result = await session.query<{ released: boolean }>(
      'SELECT pg_advisory_unlock($1::bigint) AS released',
      [key],
    );
    if (result.rows[0]?.released === true) return undefined;

    session.discard();
    return new EndpointRunLockError('release was not confirmed');
  } catch (error) {
    session.discard();
    return new EndpointRunLockError('release could not be completed', {
      cause: error,
    });
  }
}
