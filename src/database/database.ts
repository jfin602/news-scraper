import {
  Pool,
  type PoolClient,
  type PoolConfig,
  type QueryResult,
  type QueryResultRow,
} from 'pg';

import type { DatabaseConfig } from './config.ts';

export interface QueryExecutor {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

export interface Database extends QueryExecutor {
  ping(): Promise<void>;
  transaction<T>(work: (transaction: QueryExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export class DatabaseRuntimeError extends Error {
  readonly operation: string;

  constructor(operation: string, reason: string) {
    super(`Database ${operation} failed: ${reason}`);
    this.name = 'DatabaseRuntimeError';
    this.operation = operation;
  }
}

const CLOSED_REASON = 'database is closed';
const UNAVAILABLE_REASON = 'database connection is unavailable';

export function createDatabase(config: Readonly<DatabaseConfig>): Database {
  return new PooledDatabase({ connectionString: config.connectionString });
}

class PooledDatabase implements Database {
  readonly #pool: Pool;
  #closePromise: Promise<void> | undefined;
  #idlePoolFailure = false;

  constructor(poolConfig: PoolConfig) {
    this.#pool = new Pool(poolConfig);
    this.#pool.on('error', () => {
      this.#idlePoolFailure = true;
    });
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>> {
    this.#assertUsable('query');
    try {
      return await this.#pool.query<Row>(
        text,
        values === undefined ? [] : [...values],
      );
    } catch {
      throw new DatabaseRuntimeError('query', UNAVAILABLE_REASON);
    }
  }

  async ping(): Promise<void> {
    this.#assertUsable('ping');
    try {
      await this.#pool.query('SELECT 1');
    } catch {
      throw new DatabaseRuntimeError('ping', UNAVAILABLE_REASON);
    }
  }

  async transaction<T>(
    work: (transaction: QueryExecutor) => Promise<T>,
  ): Promise<T> {
    this.#assertUsable('transaction');

    let client: PoolClient;
    try {
      client = await this.#pool.connect();
    } catch {
      throw new DatabaseRuntimeError('transaction', UNAVAILABLE_REASON);
    }

    try {
      await client.query('BEGIN');
      try {
        const result = await work({
          query: <Row extends QueryResultRow = QueryResultRow>(
            text: string,
            values?: readonly unknown[],
          ) => client.query<Row>(text, values === undefined ? [] : [...values]),
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // The original callback/query failure remains the most useful cause.
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof DatabaseRuntimeError) {
        throw error;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  close(): Promise<void> {
    if (this.#closePromise === undefined) {
      this.#closePromise = this.#pool.end().catch(() => {
        throw new DatabaseRuntimeError('close', UNAVAILABLE_REASON);
      });
    }
    return this.#closePromise;
  }

  #assertUsable(operation: string): void {
    if (this.#closePromise !== undefined) {
      throw new DatabaseRuntimeError(operation, CLOSED_REASON);
    }
    if (this.#idlePoolFailure) {
      throw new DatabaseRuntimeError(operation, UNAVAILABLE_REASON);
    }
  }
}
