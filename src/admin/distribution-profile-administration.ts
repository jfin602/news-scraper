import { randomUUID } from 'node:crypto';

import { findCategoryByConfigKey } from '../collection/relevance/repository.ts';
import { type Database, type QueryExecutor } from '../database/database.ts';
import {
  normalizeDistributionProfileConfiguration,
  normalizeDistributionProfileLifecycle,
  normalizeDistributionProfileSourceFilters,
  normalizeMutableDistributionProfileConfiguration,
  type DistributionProfileLifecycle,
  type DistributionProfileSourceFilters,
} from '../distribution/profiles/configuration.ts';
import {
  createDistributionProfile,
  findDistributionProfileByConfigKey,
  listDistributionProfiles,
  listDistributionProfileSourceIds,
  lockDistributionProfileByConfigKey,
  lockDistributionProfileSources,
  lockSourceForDistributionProfile,
  removeDistributionProfileSourceAssociation,
  replaceDistributionProfileSourceAssociation,
  setDistributionProfileLifecycle,
  updateDistributionProfile,
  type PersistedDistributionProfile,
  type PersistedDistributionProfileSource,
} from '../distribution/profiles/repository.ts';
import { acquireDistributionProfileSourceValidityLocks } from '../distribution/profiles/source-validity-lock.ts';
import { validateAdminInputRecord } from './input-validation.ts';
import { ConfigurationValidationError } from '../publication/configuration.ts';
import {
  normalizeConfigKey,
  type ApprovalState,
  type LifecycleState,
} from '../sources/configuration.ts';

export type DistributionProfileAdministrationErrorCode =
  | 'invalid_request'
  | 'profile_not_found'
  | 'profile_config_key_conflict'
  | 'source_not_found'
  | 'category_not_found'
  | 'profile_association_not_found'
  | 'profile_invalid_lifecycle_transition'
  | 'profile_requires_usable_source';

export class DistributionProfileAdministrationError extends Error {
  readonly code: DistributionProfileAdministrationErrorCode;

  constructor(code: DistributionProfileAdministrationErrorCode) {
    super(`Distribution Profile administration command failed: ${code}`);
    this.name = 'DistributionProfileAdministrationError';
    this.code = code;
  }
}

export interface AdminDistributionProfileSourceReadModel {
  readonly configKey: string;
  readonly displayName: string;
  readonly approvalState: ApprovalState;
  readonly lifecycleState: LifecycleState;
  readonly includeAnyPhrases: readonly string[];
  readonly excludeAnyPhrases: readonly string[];
  readonly categoryConfigKeys: readonly string[];
}

export interface AdminDistributionProfileReadModel {
  readonly configKey: string;
  readonly displayName: string;
  readonly lifecycleState: DistributionProfileLifecycle;
  readonly resultLimit: number;
  readonly sources: readonly AdminDistributionProfileSourceReadModel[];
}

export interface DistributionProfileAdministrationService {
  listProfiles(): Promise<readonly AdminDistributionProfileReadModel[]>;
  getProfile(
    profileConfigKey: unknown,
  ): Promise<AdminDistributionProfileReadModel>;
  createProfile(input: unknown): Promise<AdminDistributionProfileReadModel>;
  replaceProfileConfiguration(
    profileConfigKey: unknown,
    input: unknown,
  ): Promise<AdminDistributionProfileReadModel>;
  replaceSourceAssociation(
    profileConfigKey: unknown,
    sourceConfigKey: unknown,
    input: unknown,
  ): Promise<AdminDistributionProfileReadModel>;
  removeSourceAssociation(
    profileConfigKey: unknown,
    sourceConfigKey: unknown,
  ): Promise<AdminDistributionProfileReadModel>;
  setProfileLifecycle(
    profileConfigKey: unknown,
    input: unknown,
  ): Promise<AdminDistributionProfileReadModel>;
}

export function createDistributionProfileAdministrationService(
  database: Database,
): DistributionProfileAdministrationService {
  return Object.freeze({
    async listProfiles() {
      return Object.freeze(
        (await listDistributionProfiles(database)).map(mapProfileReadModel),
      );
    },

    async getProfile(profileConfigKey: unknown) {
      const key = profileKey(profileConfigKey);
      return mapProfileReadModel(await requireProfile(database, key));
    },

    async createProfile(input: unknown) {
      const command = createCommand(input);
      return profileTransaction(database, async (transaction) => {
        const profile = await createDistributionProfile(transaction, {
          ...command,
          lifecycle: 'draft',
        });
        await writeProfileAudit(
          transaction,
          'distribution_profile_created',
          profile,
          null,
          profileState(profile),
        );
        return mapProfileReadModel(profile);
      });
    },

    async replaceProfileConfiguration(
      profileConfigKey: unknown,
      input: unknown,
    ) {
      const key = profileKey(profileConfigKey);
      const command = mutableConfigurationCommand(input);
      return profileTransaction(database, async (transaction) => {
        const locked = await lockProfile(transaction, key);
        const before = await requireProfile(transaction, key);
        const profile = await updateDistributionProfile(transaction, key, {
          ...command,
          lifecycle: locked.lifecycle,
        });
        await writeProfileAudit(
          transaction,
          'distribution_profile_configuration_changed',
          profile,
          configurationState(before),
          configurationState(profile),
        );
        return mapProfileReadModel(profile);
      });
    },

    async replaceSourceAssociation(
      profileConfigKey: unknown,
      sourceConfigKey: unknown,
      input: unknown,
    ) {
      const key = profileKey(profileConfigKey);
      const sourceKey = profileKey(sourceConfigKey);
      const filters = sourceAssociationCommand(input);
      return profileTransaction(database, async (transaction) => {
        const lockedProfile = await lockProfile(transaction, key);
        const before = await requireProfile(transaction, key);
        const source = await lockSourceForDistributionProfile(
          transaction,
          sourceKey,
        );
        if (source === undefined)
          throw new DistributionProfileAdministrationError('source_not_found');
        await requireCategories(transaction, filters.categoryConfigKeys);
        const priorAssociation = before.sources.find(
          (association) =>
            association.sourceConfigKey === source.sourceConfigKey,
        );
        const profile = await replaceDistributionProfileSourceAssociation(
          transaction,
          lockedProfile.configKey,
          source.sourceConfigKey,
          filters,
        );
        const association = profile.sources.find(
          (candidate) => candidate.sourceConfigKey === source.sourceConfigKey,
        );
        if (association === undefined)
          throw new Error('Missing persisted Profile association.');
        await writeProfileAudit(
          transaction,
          priorAssociation === undefined
            ? 'distribution_profile_source_association_created'
            : 'distribution_profile_source_association_changed',
          profile,
          priorAssociation === undefined
            ? null
            : associationState(priorAssociation),
          associationState(association),
        );
        return mapProfileReadModel(profile);
      });
    },

    async removeSourceAssociation(
      profileConfigKey: unknown,
      sourceConfigKey: unknown,
    ) {
      const key = profileKey(profileConfigKey);
      const sourceKey = profileKey(sourceConfigKey);
      return profileTransaction(database, async (transaction) => {
        const lockedProfile = await lockProfile(transaction, key);
        const lockedSources = await lockDistributionProfileSources(
          transaction,
          lockedProfile.id,
        );
        const before = await requireProfile(transaction, key);
        const association = before.sources.find(
          (candidate) => candidate.sourceConfigKey === sourceKey,
        );
        if (association === undefined) {
          throw new DistributionProfileAdministrationError(
            'profile_association_not_found',
          );
        }
        if (
          lockedProfile.lifecycle === 'active' &&
          !lockedSources.some(
            (source) =>
              source.sourceConfigKey !== sourceKey && isUsableSource(source),
          )
        ) {
          throw new DistributionProfileAdministrationError(
            'profile_requires_usable_source',
          );
        }
        const removed = await removeDistributionProfileSourceAssociation(
          transaction,
          lockedProfile.configKey,
          sourceKey,
        );
        if (!removed) {
          throw new DistributionProfileAdministrationError(
            'profile_association_not_found',
          );
        }
        const profile = await requireProfile(transaction, key);
        await writeProfileAudit(
          transaction,
          'distribution_profile_source_association_removed',
          profile,
          associationState(association),
          null,
        );
        return mapProfileReadModel(profile);
      });
    },

    async setProfileLifecycle(profileConfigKey: unknown, input: unknown) {
      const key = profileKey(profileConfigKey);
      const requested = lifecycleCommand(input);
      return profileTransaction(database, async (transaction) => {
        const lockedProfile = await lockProfile(transaction, key);
        const action = lifecycleAction(lockedProfile.lifecycle, requested);
        if (requested === 'active') {
          const sourceIds = await listDistributionProfileSourceIds(
            transaction,
            lockedProfile.id,
          );
          await acquireDistributionProfileSourceValidityLocks(
            transaction,
            sourceIds,
          );
          const sources = await lockDistributionProfileSources(
            transaction,
            lockedProfile.id,
          );
          if (!sources.some(isUsableSource)) {
            throw new DistributionProfileAdministrationError(
              'profile_requires_usable_source',
            );
          }
        }
        const profile = await setDistributionProfileLifecycle(
          transaction,
          lockedProfile.configKey,
          requested,
        );
        await writeProfileAudit(
          transaction,
          action,
          profile,
          lifecycleState(lockedProfile.lifecycle),
          lifecycleState(requested),
        );
        return mapProfileReadModel(profile);
      });
    },
  });
}

function createCommand(
  input: unknown,
): Readonly<{ configKey: string; displayName: string; resultLimit: number }> {
  const record = exactRecord(
    input,
    ['configKey', 'displayName'],
    ['resultLimit'],
  );
  const normalized = normalizeProfileValue(() =>
    normalizeDistributionProfileConfiguration({
      ...record,
      lifecycle: 'draft',
    }),
  );
  return Object.freeze({
    configKey: normalized.configKey,
    displayName: normalized.displayName,
    resultLimit: normalized.resultLimit,
  });
}

function mutableConfigurationCommand(
  input: unknown,
): Readonly<{ displayName: string; resultLimit: number }> {
  const record = exactRecord(input, ['displayName', 'resultLimit']);
  const normalized = normalizeProfileValue(() =>
    normalizeMutableDistributionProfileConfiguration({
      ...record,
      lifecycle: 'draft',
    }),
  );
  return Object.freeze({
    displayName: normalized.displayName,
    resultLimit: normalized.resultLimit,
  });
}

function sourceAssociationCommand(
  input: unknown,
): Readonly<DistributionProfileSourceFilters> {
  const record = exactRecord(
    input,
    [],
    ['includeAnyPhrases', 'excludeAnyPhrases', 'categoryConfigKeys'],
  );
  return normalizeProfileValue(() =>
    normalizeDistributionProfileSourceFilters(record),
  );
}

function lifecycleCommand(input: unknown): DistributionProfileLifecycle {
  const record = exactRecord(input, ['lifecycleState']);
  return normalizeProfileValue(() =>
    normalizeDistributionProfileLifecycle(record.lifecycleState),
  );
}

function profileKey(input: unknown): string {
  return normalizeProfileValue(() => normalizeConfigKey(input));
}

async function lockProfile(
  executor: QueryExecutor,
  key: string,
): Promise<
  NonNullable<Awaited<ReturnType<typeof lockDistributionProfileByConfigKey>>>
> {
  const profile = await lockDistributionProfileByConfigKey(executor, key);
  if (profile === undefined) {
    throw new DistributionProfileAdministrationError('profile_not_found');
  }
  return profile;
}

async function requireProfile(
  executor: QueryExecutor,
  key: string,
): Promise<PersistedDistributionProfile> {
  const profile = await findDistributionProfileByConfigKey(executor, key);
  if (profile === undefined) {
    throw new DistributionProfileAdministrationError('profile_not_found');
  }
  return profile;
}

async function requireCategories(
  executor: QueryExecutor,
  configKeys: readonly string[],
): Promise<void> {
  for (const configKey of configKeys) {
    if ((await findCategoryByConfigKey(executor, configKey)) === undefined) {
      throw new DistributionProfileAdministrationError('category_not_found');
    }
  }
}

function lifecycleAction(
  current: DistributionProfileLifecycle,
  requested: DistributionProfileLifecycle,
):
  | 'distribution_profile_activated'
  | 'distribution_profile_disabled'
  | 'distribution_profile_reactivated' {
  if (current === requested) {
    throw new DistributionProfileAdministrationError(
      'profile_invalid_lifecycle_transition',
    );
  }
  if (current === 'draft' && requested === 'active') {
    return 'distribution_profile_activated';
  }
  if (current === 'active' && requested === 'disabled') {
    return 'distribution_profile_disabled';
  }
  if (current === 'disabled' && requested === 'active') {
    return 'distribution_profile_reactivated';
  }
  throw new DistributionProfileAdministrationError(
    'profile_invalid_lifecycle_transition',
  );
}

function isUsableSource(
  source: Pick<
    PersistedDistributionProfileSource,
    'sourceApprovalState' | 'sourceLifecycleState'
  >,
): boolean {
  return (
    source.sourceApprovalState === 'approved' &&
    source.sourceLifecycleState === 'active'
  );
}

function mapProfileReadModel(
  profile: PersistedDistributionProfile,
): AdminDistributionProfileReadModel {
  return Object.freeze({
    configKey: profile.configKey,
    displayName: profile.displayName,
    lifecycleState: profile.lifecycle,
    resultLimit: profile.resultLimit,
    sources: Object.freeze(
      profile.sources.map((source) =>
        Object.freeze({
          configKey: source.sourceConfigKey,
          displayName: source.sourceDisplayName,
          approvalState: source.sourceApprovalState,
          lifecycleState: source.sourceLifecycleState,
          includeAnyPhrases: source.includeAnyPhrases,
          excludeAnyPhrases: source.excludeAnyPhrases,
          categoryConfigKeys: source.categoryConfigKeys,
        }),
      ),
    ),
  });
}

function profileState(
  profile: PersistedDistributionProfile,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    configKey: profile.configKey,
    displayName: profile.displayName,
    lifecycleState: profile.lifecycle,
    resultLimit: profile.resultLimit,
  });
}

function configurationState(
  profile: PersistedDistributionProfile,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    displayName: profile.displayName,
    resultLimit: profile.resultLimit,
  });
}

function lifecycleState(
  value: DistributionProfileLifecycle,
): Readonly<Record<string, unknown>> {
  return Object.freeze({ lifecycleState: value });
}

function associationState(
  source: PersistedDistributionProfileSource,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    sourceConfigKey: source.sourceConfigKey,
    includeAnyPhrases: source.includeAnyPhrases,
    excludeAnyPhrases: source.excludeAnyPhrases,
    categoryConfigKeys: source.categoryConfigKeys,
  });
}

async function writeProfileAudit(
  executor: QueryExecutor,
  action: string,
  profile: PersistedDistributionProfile,
  priorState: Readonly<Record<string, unknown>> | null,
  newState: Readonly<Record<string, unknown>> | null,
): Promise<void> {
  await executor.query(
    `INSERT INTO audit_events
       (id, action, target_type, target_id, prior_state, new_state)
     VALUES ($1, $2, 'distribution_profile', $3, $4::jsonb, $5::jsonb)`,
    [
      randomUUID(),
      action,
      profile.id,
      priorState === null ? null : JSON.stringify(priorState),
      newState === null ? null : JSON.stringify(newState),
    ],
  );
}

function exactRecord(
  input: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  const record = validateAdminInputRecord(input, required, optional);
  if (record === undefined) {
    throw new DistributionProfileAdministrationError('invalid_request');
  }
  return record;
}

function normalizeProfileValue<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof DistributionProfileAdministrationError) throw error;
    if (error instanceof ConfigurationValidationError) {
      throw new DistributionProfileAdministrationError('invalid_request');
    }
    throw error;
  }
}

async function profileTransaction<T>(
  database: Database,
  work: (transaction: QueryExecutor) => Promise<T>,
): Promise<T> {
  try {
    return await database.transaction(work);
  } catch (error) {
    throw translateProfilePersistenceError(error);
  }
}

function translateProfilePersistenceError(error: unknown): never {
  if (error instanceof DistributionProfileAdministrationError) throw error;
  if (
    postgresError(error, '23505', 'distribution_profiles_config_key_unique')
  ) {
    throw new DistributionProfileAdministrationError(
      'profile_config_key_conflict',
    );
  }
  if (postgresError(error, '23503')) {
    throw new DistributionProfileAdministrationError('category_not_found');
  }
  throw error;
}

function postgresError(
  error: unknown,
  code: string,
  constraint?: string,
): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    Reflect.get(error, 'code') === code &&
    (constraint === undefined ||
      Reflect.get(error, 'constraint') === constraint)
  );
}
