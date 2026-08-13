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
  readonly description: string | null;
  readonly logoPath: string | null;
  readonly accentColor: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface PublicationSettingsRow {
  readonly name: unknown;
  readonly active_for_collection: unknown;
  readonly public_status: unknown;
  readonly description: unknown;
  readonly logo_path: unknown;
  readonly accent_color: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

const PUBLICATION_SETTINGS_COLUMNS = `
  name, active_for_collection, public_status,
  description, logo_path, accent_color,
  created_at, updated_at`;

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
       name, active_for_collection, public_status,
       description, logo_path, accent_color
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING
     RETURNING ${PUBLICATION_SETTINGS_COLUMNS}`,
    publicationSettingsValues(settings),
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
       name, active_for_collection, public_status,
       description, logo_path, accent_color
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${PUBLICATION_SETTINGS_COLUMNS}`,
    publicationSettingsValues(settings),
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
    const normalized = normalizePublicationConfiguration({
      name: row.name,
      activeForCollection: row.active_for_collection,
      publicStatus: row.public_status,
      ...(row.description === null ? {} : { description: row.description }),
      ...(row.logo_path === null ? {} : { logoPath: row.logo_path }),
      ...(row.accent_color === null ? {} : { accentColor: row.accent_color }),
    });
    return Object.freeze({
      name: normalized.name,
      activeForCollection: normalized.activeForCollection,
      publicStatus: normalized.publicStatus,
      description: canonicalNullableValue(
        row.description,
        normalized.description,
      ),
      logoPath: canonicalNullableValue(row.logo_path, normalized.logoPath),
      accentColor: canonicalNullableValue(
        row.accent_color,
        normalized.accentColor,
      ),
      createdAt: requiredTimestamp(row.created_at),
      updatedAt: requiredTimestamp(row.updated_at),
    });
  } catch {
    throw new ConfigurationPersistenceError(
      'database returned invalid publication settings',
    );
  }
}

function publicationSettingsValues(
  settings: Readonly<PublicationConfiguration>,
): readonly [
  string,
  boolean,
  PublicationPublicStatus,
  string | null,
  string | null,
  string | null,
] {
  return [
    settings.name,
    settings.activeForCollection,
    settings.publicStatus,
    settings.description ?? null,
    settings.logoPath ?? null,
    settings.accentColor ?? null,
  ];
}

function canonicalNullableValue(
  persisted: unknown,
  normalized: string | undefined,
): string | null {
  if (persisted === null) return null;
  if (typeof persisted !== 'string' || normalized !== persisted)
    throw new Error();
  return persisted;
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
