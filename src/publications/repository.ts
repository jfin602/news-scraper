import { randomUUID } from 'node:crypto';

import type { QueryExecutor } from '../database/database.ts';
import {
  normalizePublicationConfiguration,
  normalizePublicationPublicStatus,
  type PublicationConfiguration,
  type PublicationPublicStatus,
} from './configuration.ts';

export interface PersistedPublication {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly activeForCollection: boolean;
  readonly publicStatus: PublicationPublicStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface PublicationRow {
  readonly id: unknown;
  readonly name: unknown;
  readonly slug: unknown;
  readonly active_for_collection: unknown;
  readonly public_status: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

const PUBLICATION_COLUMNS = `
  id, name, slug, active_for_collection, public_status, created_at, updated_at`;

export async function insertPublication(
  executor: QueryExecutor,
  input: unknown,
): Promise<PersistedPublication> {
  const publication = normalizePublicationConfiguration(input);
  return insertValidatedPublication(executor, publication);
}

export interface CreateIfAbsentResult<T> {
  readonly value: T;
  readonly created: boolean;
}

export async function createPublicationIfAbsent(
  executor: QueryExecutor,
  input: unknown,
): Promise<CreateIfAbsentResult<PersistedPublication>> {
  const publication = normalizePublicationConfiguration(input);
  const result = await executor.query<PublicationRow>(
    `INSERT INTO publications (
       id, name, slug, active_for_collection, public_status
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (slug) DO NOTHING
     RETURNING ${PUBLICATION_COLUMNS}`,
    [
      randomUUID(),
      publication.name,
      publication.slug,
      publication.activeForCollection,
      publication.publicStatus,
    ],
  );
  const inserted = result.rows[0];
  if (inserted !== undefined) {
    return Object.freeze({ value: mapPublicationRow(inserted), created: true });
  }
  const existing = await findPublicationBySlug(executor, publication.slug);
  if (existing === undefined) {
    throw new ConfigurationPersistenceError('publication conflict lookup');
  }
  return Object.freeze({ value: existing, created: false });
}

async function insertValidatedPublication(
  executor: QueryExecutor,
  publication: Readonly<PublicationConfiguration>,
): Promise<PersistedPublication> {
  const result = await executor.query<PublicationRow>(
    `INSERT INTO publications (
       id, name, slug, active_for_collection, public_status
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLICATION_COLUMNS}`,
    [
      randomUUID(),
      publication.name,
      publication.slug,
      publication.activeForCollection,
      publication.publicStatus,
    ],
  );
  return mapPublicationRow(requiredRow(result.rows, 'publication insert'));
}

export async function findPublicationBySlug(
  executor: QueryExecutor,
  slug: string,
): Promise<PersistedPublication | undefined> {
  const result = await executor.query<PublicationRow>(
    `SELECT ${PUBLICATION_COLUMNS} FROM publications WHERE slug = $1`,
    [slug],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapPublicationRow(row);
}

export async function setPublicationPublicStatus(
  executor: QueryExecutor,
  slug: string,
  publicStatus: unknown,
): Promise<PersistedPublication | undefined> {
  const normalizedPublicStatus = normalizePublicationPublicStatus(publicStatus);
  const result = await executor.query<PublicationRow>(
    `UPDATE publications
     SET public_status = $2, updated_at = now()
     WHERE slug = $1
     RETURNING ${PUBLICATION_COLUMNS}`,
    [slug, normalizedPublicStatus],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapPublicationRow(row);
}

export function mapPublicationRow(row: PublicationRow): PersistedPublication {
  try {
    return Object.freeze({
      id: requiredString(row.id),
      name: requiredString(row.name),
      slug: requiredString(row.slug),
      activeForCollection: requiredBoolean(row.active_for_collection),
      publicStatus: normalizePublicationPublicStatus(row.public_status),
      createdAt: requiredTimestamp(row.created_at),
      updatedAt: requiredTimestamp(row.updated_at),
    });
  } catch {
    throw new ConfigurationPersistenceError(
      'database returned invalid publication',
    );
  }
}

export class ConfigurationPersistenceError extends Error {
  constructor(reason: string) {
    super(`Configuration persistence failed: ${reason}`);
    this.name = 'ConfigurationPersistenceError';
  }
}

export function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error();
  return value;
}

export function requiredBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error();
  return value;
}

export function requiredTimestamp(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime()))
    throw new Error();
  return value;
}

function requiredRow<T>(rows: readonly T[], operation: string): T {
  const row = rows[0];
  if (row === undefined) throw new ConfigurationPersistenceError(operation);
  return row;
}
