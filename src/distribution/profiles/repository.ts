import { randomUUID } from 'node:crypto';

import type { QueryExecutor } from '../../database/database.ts';
import {
  ConfigurationPersistenceError,
  requiredString,
  requiredTimestamp,
} from '../../publication/repository.ts';
import {
  normalizeApprovalState,
  normalizeConfigKey,
  normalizeLifecycleState,
  type ApprovalState,
  type LifecycleState,
} from '../../sources/configuration.ts';
import {
  normalizeDistributionProfileConfiguration,
  normalizeDistributionProfileLifecycle,
  normalizeDistributionProfileSourceFilters,
  normalizeMutableDistributionProfileConfiguration,
  type DistributionProfileLifecycle,
  type DistributionProfileSourceFilters,
} from './configuration.ts';

export interface PersistedDistributionProfileSource {
  readonly sourceId: string;
  readonly sourceConfigKey: string;
  readonly sourceDisplayName: string;
  readonly sourceApprovalState: ApprovalState;
  readonly sourceLifecycleState: LifecycleState;
  readonly includeAnyPhrases: readonly string[];
  readonly excludeAnyPhrases: readonly string[];
  readonly categoryConfigKeys: readonly string[];
}

export interface PersistedDistributionProfile {
  readonly id: string;
  readonly configKey: string;
  readonly displayName: string;
  readonly lifecycle: DistributionProfileLifecycle;
  readonly resultLimit: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly sources: readonly PersistedDistributionProfileSource[];
}

export interface LockedDistributionProfileSource {
  readonly sourceId: string;
  readonly sourceConfigKey: string;
  readonly sourceApprovalState: ApprovalState;
  readonly sourceLifecycleState: LifecycleState;
}

export interface LockedDistributionProfileSourceAssociation extends LockedDistributionProfileSource {
  readonly profileId: string;
}

interface ProfileRow {
  readonly id: unknown;
  readonly config_key: unknown;
  readonly display_name: unknown;
  readonly lifecycle: unknown;
  readonly result_limit: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

interface SourceRow {
  readonly source_id: unknown;
  readonly source_config_key: unknown;
  readonly source_display_name: unknown;
  readonly source_approval_state: unknown;
  readonly source_lifecycle_state: unknown;
}

interface PhraseRow {
  readonly source_id: unknown;
  readonly phrase_kind: unknown;
  readonly position: unknown;
  readonly phrase: unknown;
}

interface CategoryRow {
  readonly source_id: unknown;
  readonly position: unknown;
  readonly config_key: unknown;
}

const PROFILE_COLUMNS = `
  id, config_key, display_name, lifecycle, result_limit, created_at, updated_at`;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export async function createDistributionProfile(
  executor: QueryExecutor,
  input: unknown,
): Promise<PersistedDistributionProfile> {
  const profile = normalizeDistributionProfileConfiguration(input);
  await executor.query(
    `INSERT INTO distribution_profiles (
       id, config_key, display_name, lifecycle, result_limit
     ) VALUES ($1, $2, $3, $4, $5)`,
    [
      randomUUID(),
      profile.configKey,
      profile.displayName,
      profile.lifecycle,
      profile.resultLimit,
    ],
  );
  return requireDistributionProfile(
    executor,
    profile.configKey,
    'profile insert',
  );
}

export async function findDistributionProfileByConfigKey(
  executor: QueryExecutor,
  configKey: unknown,
): Promise<PersistedDistributionProfile | undefined> {
  const profileResult = await executor.query<ProfileRow>(
    `SELECT ${PROFILE_COLUMNS}
       FROM distribution_profiles
      WHERE config_key = $1`,
    [normalizeConfigKey(configKey)],
  );
  const profileRow = profileResult.rows[0];
  if (profileRow === undefined) return undefined;
  const profile = mapProfileRow(profileRow);
  const sourcesResult = await executor.query<SourceRow>(
    `SELECT ps.source_id, s.config_key AS source_config_key,
            s.display_name AS source_display_name,
            s.approval_state AS source_approval_state,
            s.lifecycle_state AS source_lifecycle_state
       FROM distribution_profile_sources ps
       JOIN sources s ON s.id = ps.source_id
      WHERE ps.profile_id = $1
      ORDER BY s.config_key ASC`,
    [profile.id],
  );
  const sourceIds = sourcesResult.rows.map((row) =>
    requiredUuid(row.source_id, 'source id'),
  );
  const [phrasesResult, categoriesResult] = await Promise.all([
    executor.query<PhraseRow>(
      `SELECT source_id, phrase_kind, position, phrase
         FROM distribution_profile_source_phrases
        WHERE profile_id = $1
        ORDER BY source_id ASC, phrase_kind ASC, position ASC`,
      [profile.id],
    ),
    executor.query<CategoryRow>(
      `SELECT psc.source_id, psc.position, c.config_key
         FROM distribution_profile_source_categories psc
         JOIN categories c ON c.id = psc.category_id
        WHERE psc.profile_id = $1
        ORDER BY psc.source_id ASC, psc.position ASC`,
      [profile.id],
    ),
  ]);
  return freezeProfile({
    ...profile,
    sources: sourcesResult.rows.map((source) =>
      mapProfileSource(
        source,
        sourceIds,
        phrasesResult.rows,
        categoriesResult.rows,
      ),
    ),
  });
}

export async function listDistributionProfiles(
  executor: QueryExecutor,
): Promise<readonly PersistedDistributionProfile[]> {
  const result = await executor.query<{ readonly config_key: unknown }>(
    `SELECT config_key FROM distribution_profiles ORDER BY config_key ASC`,
  );
  return Object.freeze(
    await Promise.all(
      result.rows.map(async (row) => {
        const profile = await findDistributionProfileByConfigKey(
          executor,
          normalizeConfigKey(row.config_key),
        );
        if (profile === undefined) {
          throw new ConfigurationPersistenceError('profile list changed');
        }
        return profile;
      }),
    ),
  );
}

export async function updateDistributionProfile(
  executor: QueryExecutor,
  configKey: unknown,
  input: unknown,
): Promise<PersistedDistributionProfile> {
  const key = normalizeConfigKey(configKey);
  const profile = normalizeMutableDistributionProfileConfiguration(input);
  const result = await executor.query<ProfileRow>(
    `UPDATE distribution_profiles
        SET display_name = $2, lifecycle = $3, result_limit = $4, updated_at = now()
      WHERE config_key = $1
      RETURNING ${PROFILE_COLUMNS}`,
    [key, profile.displayName, profile.lifecycle, profile.resultLimit],
  );
  requiredRow(result.rows, 'profile update');
  return requireDistributionProfile(executor, key, 'profile update');
}

export async function setDistributionProfileLifecycle(
  executor: QueryExecutor,
  configKey: unknown,
  lifecycle: unknown,
): Promise<PersistedDistributionProfile> {
  const key = normalizeConfigKey(configKey);
  const result = await executor.query<ProfileRow>(
    `UPDATE distribution_profiles
        SET lifecycle = $2, updated_at = now()
      WHERE config_key = $1
      RETURNING ${PROFILE_COLUMNS}`,
    [key, normalizeDistributionProfileLifecycle(lifecycle)],
  );
  requiredRow(result.rows, 'profile lifecycle update');
  return requireDistributionProfile(executor, key, 'profile lifecycle update');
}

export async function replaceDistributionProfileSourceAssociation(
  executor: QueryExecutor,
  profileConfigKey: unknown,
  sourceConfigKey: unknown,
  filters: unknown,
): Promise<PersistedDistributionProfile> {
  const profile = await lockDistributionProfileByConfigKey(
    executor,
    profileConfigKey,
  );
  if (profile === undefined)
    throw new ConfigurationPersistenceError('profile not found');
  const source = await lockSourceForDistributionProfile(
    executor,
    sourceConfigKey,
  );
  if (source === undefined)
    throw new ConfigurationPersistenceError('source not found');
  const normalizedFilters = normalizeDistributionProfileSourceFilters(filters);
  await executor.query(
    `INSERT INTO distribution_profile_sources (profile_id, source_id)
     VALUES ($1, $2)
     ON CONFLICT (profile_id, source_id) DO NOTHING`,
    [profile.id, source.sourceId],
  );
  await replaceAssociationFilters(
    executor,
    profile.id,
    source.sourceId,
    normalizedFilters,
  );
  return requireDistributionProfile(
    executor,
    profile.configKey,
    'profile source association replace',
  );
}

export async function removeDistributionProfileSourceAssociation(
  executor: QueryExecutor,
  profileConfigKey: unknown,
  sourceConfigKey: unknown,
): Promise<boolean> {
  const profile = await lockDistributionProfileByConfigKey(
    executor,
    profileConfigKey,
  );
  if (profile === undefined) return false;
  const source = await lockSourceForDistributionProfile(
    executor,
    sourceConfigKey,
  );
  if (source === undefined) return false;
  const result = await executor.query(
    `DELETE FROM distribution_profile_sources
      WHERE profile_id = $1 AND source_id = $2`,
    [profile.id, source.sourceId],
  );
  return result.rowCount === 1;
}

export async function lockDistributionProfileByConfigKey(
  executor: QueryExecutor,
  configKey: unknown,
): Promise<Omit<PersistedDistributionProfile, 'sources'> | undefined> {
  const result = await executor.query<ProfileRow>(
    `SELECT ${PROFILE_COLUMNS}
       FROM distribution_profiles
      WHERE config_key = $1
      FOR UPDATE`,
    [normalizeConfigKey(configKey)],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapProfileRow(row);
}

export async function lockSourceForDistributionProfile(
  executor: QueryExecutor,
  configKey: unknown,
): Promise<LockedDistributionProfileSource | undefined> {
  const result = await executor.query<SourceRow>(
    `SELECT id AS source_id, config_key AS source_config_key,
            display_name AS source_display_name,
            approval_state AS source_approval_state,
            lifecycle_state AS source_lifecycle_state
       FROM sources
      WHERE config_key = $1
      FOR UPDATE`,
    [normalizeConfigKey(configKey)],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  try {
    return Object.freeze({
      sourceId: requiredUuid(row.source_id, 'source id'),
      sourceConfigKey: normalizeConfigKey(row.source_config_key),
      sourceApprovalState: normalizeApprovalState(row.source_approval_state),
      sourceLifecycleState: normalizeLifecycleState(row.source_lifecycle_state),
    });
  } catch {
    throw new ConfigurationPersistenceError(
      'database returned invalid profile source',
    );
  }
}

/**
 * Lists the stable Source identities associated with one already-locked
 * Profile. It deliberately does not lock or interpret the Source rows.
 */
export async function listDistributionProfileSourceIds(
  executor: QueryExecutor,
  profileId: string,
): Promise<readonly string[]> {
  const result = await executor.query<{ readonly source_id: unknown }>(
    `SELECT source_id
       FROM distribution_profile_sources
      WHERE profile_id = $1
      ORDER BY source_id ASC`,
    [profileId],
  );
  return Object.freeze(
    result.rows.map((row) => requiredUuid(row.source_id, 'source id')),
  );
}

/**
 * Locks all Sources associated with one already-locked Profile. Source rows
 * are always acquired by stable database ID after the Profile row.
 */
export async function lockDistributionProfileSources(
  executor: QueryExecutor,
  profileId: string,
): Promise<readonly LockedDistributionProfileSource[]> {
  const result = await executor.query<SourceRow>(
    `SELECT s.id AS source_id, s.config_key AS source_config_key,
            s.display_name AS source_display_name,
            s.approval_state AS source_approval_state,
            s.lifecycle_state AS source_lifecycle_state
       FROM distribution_profile_sources ps
       JOIN sources s ON s.id = ps.source_id
      WHERE ps.profile_id = $1
      ORDER BY s.id ASC
      FOR UPDATE OF s`,
    [profileId],
  );
  return Object.freeze(result.rows.map(mapLockedSource));
}

/**
 * Locks every active Profile that currently references a Source. Callers must
 * acquire the returned Profile rows before acquiring any Source row.
 */
export async function lockActiveDistributionProfilesReferencingSource(
  executor: QueryExecutor,
  sourceId: string,
): Promise<readonly Omit<PersistedDistributionProfile, 'sources'>[]> {
  const result = await executor.query<ProfileRow>(
    `SELECT ${PROFILE_COLUMNS}
       FROM distribution_profiles profile
       JOIN distribution_profile_sources association
         ON association.profile_id = profile.id
      WHERE association.source_id = $1 AND profile.lifecycle = 'active'
      ORDER BY profile.id ASC
      FOR UPDATE OF profile`,
    [sourceId],
  );
  return Object.freeze(result.rows.map(mapProfileRow));
}

/**
 * Locks the Sources belonging to a previously locked set of Profiles. This
 * is the Source-administration half of the Profile -> Source lock order.
 */
export async function lockDistributionProfileSourcesForProfiles(
  executor: QueryExecutor,
  profileIds: readonly string[],
): Promise<readonly LockedDistributionProfileSourceAssociation[]> {
  if (profileIds.length === 0) return Object.freeze([]);
  const result = await executor.query<
    SourceRow & { readonly profile_id: unknown }
  >(
    `SELECT ps.profile_id, s.id AS source_id, s.config_key AS source_config_key,
            s.display_name AS source_display_name,
            s.approval_state AS source_approval_state,
            s.lifecycle_state AS source_lifecycle_state
       FROM distribution_profile_sources ps
       JOIN sources s ON s.id = ps.source_id
      WHERE ps.profile_id = ANY($1::uuid[])
      ORDER BY s.id ASC, ps.profile_id ASC
      FOR UPDATE OF s`,
    [profileIds],
  );
  return Object.freeze(
    result.rows.map((row) =>
      Object.freeze({
        profileId: requiredUuid(row.profile_id, 'profile id'),
        ...mapLockedSource(row),
      }),
    ),
  );
}

async function replaceAssociationFilters(
  executor: QueryExecutor,
  profileId: string,
  sourceId: string,
  filters: Readonly<DistributionProfileSourceFilters>,
): Promise<void> {
  const categoryIds = await Promise.all(
    filters.categoryConfigKeys.map(async (categoryConfigKey) => {
      const category = await executor.query<{ readonly id: unknown }>(
        `SELECT id FROM categories WHERE config_key = $1`,
        [categoryConfigKey],
      );
      const categoryRow = category.rows[0];
      if (categoryRow === undefined) {
        throw new ConfigurationPersistenceError(
          'profile source category not found',
        );
      }
      return requiredUuid(categoryRow.id, 'category id');
    }),
  );
  await executor.query(
    `DELETE FROM distribution_profile_source_phrases
      WHERE profile_id = $1 AND source_id = $2`,
    [profileId, sourceId],
  );
  await executor.query(
    `DELETE FROM distribution_profile_source_categories
      WHERE profile_id = $1 AND source_id = $2`,
    [profileId, sourceId],
  );
  for (const [phraseKind, phrases] of [
    ['include', filters.includeAnyPhrases],
    ['exclude', filters.excludeAnyPhrases],
  ] as const) {
    for (const [position, phrase] of phrases.entries()) {
      await executor.query(
        `INSERT INTO distribution_profile_source_phrases
           (profile_id, source_id, phrase_kind, position, phrase)
         VALUES ($1, $2, $3, $4, $5)`,
        [profileId, sourceId, phraseKind, position, phrase],
      );
    }
  }
  for (const [position, categoryId] of categoryIds.entries()) {
    await executor.query(
      `INSERT INTO distribution_profile_source_categories
         (profile_id, source_id, category_id, position)
       VALUES ($1, $2, $3, $4)`,
      [profileId, sourceId, categoryId, position],
    );
  }
}

function mapLockedSource(row: SourceRow): LockedDistributionProfileSource {
  try {
    return Object.freeze({
      sourceId: requiredUuid(row.source_id, 'source id'),
      sourceConfigKey: normalizeConfigKey(row.source_config_key),
      sourceApprovalState: normalizeApprovalState(row.source_approval_state),
      sourceLifecycleState: normalizeLifecycleState(row.source_lifecycle_state),
    });
  } catch {
    throw new ConfigurationPersistenceError(
      'database returned invalid profile source',
    );
  }
}

async function requireDistributionProfile(
  executor: QueryExecutor,
  configKey: string,
  operation: string,
): Promise<PersistedDistributionProfile> {
  const profile = await findDistributionProfileByConfigKey(executor, configKey);
  if (profile === undefined) throw new ConfigurationPersistenceError(operation);
  return profile;
}

function mapProfileRow(
  row: ProfileRow,
): Omit<PersistedDistributionProfile, 'sources'> {
  try {
    return Object.freeze({
      id: requiredUuid(row.id, 'profile id'),
      configKey: normalizeConfigKey(row.config_key),
      displayName: requiredString(row.display_name),
      lifecycle: normalizeDistributionProfileLifecycle(row.lifecycle),
      resultLimit: requiredResultLimit(row.result_limit),
      createdAt: requiredTimestamp(row.created_at),
      updatedAt: requiredTimestamp(row.updated_at),
    });
  } catch {
    throw new ConfigurationPersistenceError(
      'database returned invalid distribution profile',
    );
  }
}

function mapProfileSource(
  row: SourceRow,
  sourceIds: readonly string[],
  phraseRows: readonly PhraseRow[],
  categoryRows: readonly CategoryRow[],
): PersistedDistributionProfileSource {
  try {
    const sourceId = requiredUuid(row.source_id, 'source id');
    if (!sourceIds.includes(sourceId)) throw new Error();
    const phrases = phraseRows.filter(
      (phrase) => phrase.source_id === sourceId,
    );
    const includeAnyPhrases = phrasesForKind(phrases, 'include');
    const excludeAnyPhrases = phrasesForKind(phrases, 'exclude');
    const categoryConfigKeys = categoryRows
      .filter((category) => category.source_id === sourceId)
      .map((category) => normalizeConfigKey(category.config_key));
    return Object.freeze({
      sourceId,
      sourceConfigKey: normalizeConfigKey(row.source_config_key),
      sourceDisplayName: requiredString(row.source_display_name),
      sourceApprovalState: normalizeApprovalState(row.source_approval_state),
      sourceLifecycleState: normalizeLifecycleState(row.source_lifecycle_state),
      includeAnyPhrases: Object.freeze(includeAnyPhrases),
      excludeAnyPhrases: Object.freeze(excludeAnyPhrases),
      categoryConfigKeys: Object.freeze(categoryConfigKeys),
    });
  } catch {
    throw new ConfigurationPersistenceError(
      'database returned invalid profile source',
    );
  }
}

function phrasesForKind(
  rows: readonly PhraseRow[],
  kind: 'include' | 'exclude',
): string[] {
  const matched = rows.filter((row) => row.phrase_kind === kind);
  for (const [expectedPosition, row] of matched.entries()) {
    if (requiredPosition(row.position) !== expectedPosition) throw new Error();
  }
  return matched.map((row) => requiredString(row.phrase));
}

function freezeProfile(
  input: PersistedDistributionProfile,
): PersistedDistributionProfile {
  return Object.freeze({
    ...input,
    sources: Object.freeze([...input.sources]),
  });
}

function requiredUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`invalid ${field}`);
  }
  return value;
}

function requiredResultLimit(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 1000
  ) {
    throw new Error();
  }
  return value;
}

function requiredPosition(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 63
  ) {
    throw new Error();
  }
  return value;
}

function requiredRow<T>(rows: readonly T[], operation: string): T {
  const row = rows[0];
  if (row === undefined) throw new ConfigurationPersistenceError(operation);
  return row;
}
