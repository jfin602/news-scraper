import type { QueryExecutor } from '../database/database.ts';
import {
  normalizePublicationConfiguration,
  normalizePublicationPublicStatus,
  type PublicationConfiguration,
  type PublicationPublicStatus,
} from './configuration.ts';

export interface PersistedPublicationSettings {
  readonly name: string;
  readonly activeForCollection: boolean;
  readonly publicStatus: PublicationPublicStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface PublicationSettingsRow {
  readonly name: unknown;
  readonly active_for_collection: unknown;
  readonly public_status: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

const PUBLICATION_SETTINGS_COLUMNS = `
  name, active_for_collection, public_status, created_at, updated_at`;

export async function insertPublicationSettings(
  executor: QueryExecutor,
  input: unknown,
): Promise<PersistedPublicationSettings> {
  const settings = normalizePublicationConfiguration(input);
  return insertValidatedPublicationSettings(executor, settings);
}

export interface CreateIfAbsentResult<T> {
  readonly value: T;
  readonly created: boolean;
}

export async function createPublicationSettingsIfAbsent(
  executor: QueryExecutor,
  input: unknown,
): Promise<CreateIfAbsentResult<PersistedPublicationSettings>> {
  const settings = normalizePublicationConfiguration(input);
  const result = await executor.query<PublicationSettingsRow>(
    `INSERT INTO publication_settings (
       name, active_for_collection, public_status
     ) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING ${PUBLICATION_SETTINGS_COLUMNS}`,
    [settings.name, settings.activeForCollection, settings.publicStatus],
  );
  const inserted = result.rows[0];
  if (inserted !== undefined) {
    return Object.freeze({
      value: mapPublicationSettingsRow(inserted),
      created: true,
    });
  }
  const existing = await readPublicationSettings(executor);
  if (existing === undefined) {
    throw new ConfigurationPersistenceError('publication conflict lookup');
  }
  return Object.freeze({ value: existing, created: false });
}

async function insertValidatedPublicationSettings(
  executor: QueryExecutor,
  settings: Readonly<PublicationConfiguration>,
): Promise<PersistedPublicationSettings> {
  const result = await executor.query<PublicationSettingsRow>(
    `INSERT INTO publication_settings (
       name, active_for_collection, public_status
     ) VALUES ($1, $2, $3)
     RETURNING ${PUBLICATION_SETTINGS_COLUMNS}`,
    [settings.name, settings.activeForCollection, settings.publicStatus],
  );
  return mapPublicationSettingsRow(
    requiredRow(result.rows, 'publication settings insert'),
  );
}

export async function readPublicationSettings(
  executor: QueryExecutor,
): Promise<PersistedPublicationSettings | undefined> {
  const result = await executor.query<PublicationSettingsRow>(
    `SELECT ${PUBLICATION_SETTINGS_COLUMNS} FROM publication_settings`,
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapPublicationSettingsRow(row);
}

export async function setPublicationPublicStatus(
  executor: QueryExecutor,
  publicStatus: unknown,
): Promise<PersistedPublicationSettings | undefined> {
  const normalizedPublicStatus = normalizePublicationPublicStatus(publicStatus);
  const result = await executor.query<PublicationSettingsRow>(
    `UPDATE publication_settings
     SET public_status = $1, updated_at = now()
     RETURNING ${PUBLICATION_SETTINGS_COLUMNS}`,
    [normalizedPublicStatus],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapPublicationSettingsRow(row);
}

export function mapPublicationSettingsRow(
  row: PublicationSettingsRow,
): PersistedPublicationSettings {
  try {
    return Object.freeze({
      name: requiredString(row.name),
      activeForCollection: requiredBoolean(row.active_for_collection),
      publicStatus: normalizePublicationPublicStatus(row.public_status),
      createdAt: requiredTimestamp(row.created_at),
      updatedAt: requiredTimestamp(row.updated_at),
    });
  } catch {
    throw new ConfigurationPersistenceError(
      'database returned invalid publication settings',
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
