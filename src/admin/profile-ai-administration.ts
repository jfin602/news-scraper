import { randomUUID } from 'node:crypto';

import type { Database } from '../database/database.ts';
import {
  type ActiveProfileDigest,
  type DigestEvaluationResult,
  type DigestLifecycleService,
} from '../distribution/digests/lifecycle.ts';
import {
  readProfileAiSettings,
  updateProfileAiSettings,
  type PersistedDigestAttempt,
  type ProfileAiSettings,
} from '../distribution/digests/repository.ts';
import { findDistributionProfileByConfigKey } from '../distribution/profiles/repository.ts';
import { normalizeConfigKey } from '../sources/configuration.ts';
import { validateAdminInputRecord } from './input-validation.ts';

export type ProfileAiAdministrationErrorCode =
  | 'invalid_request'
  | 'profile_not_found'
  | 'digest_disabled'
  | 'digest_no_input'
  | 'digest_generation_in_progress';

export class ProfileAiAdministrationError extends Error {
  readonly code: ProfileAiAdministrationErrorCode;

  constructor(code: ProfileAiAdministrationErrorCode) {
    super(`Profile AI administration command failed: ${code}`);
    this.name = 'ProfileAiAdministrationError';
    this.code = code;
  }
}

export interface AdminProfileAiReadModel {
  readonly profileKey: string;
  readonly configuration: Readonly<{
    digestEnabled: boolean;
    lookbackDays: number;
    maxArticles: number;
  }>;
  readonly cadence: Readonly<{
    kind: 'twice_daily';
    slots: readonly ['00:00Z', '12:00Z'];
  }>;
  readonly activeDigest: Readonly<{
    generatedAt: Date;
    freshness: 'current' | 'older';
    inputArticleCount: number;
    provider: string;
    model: string;
  }> | null;
  readonly latestAttempt: Readonly<{
    triggerKind: 'scheduled' | 'manual';
    outcome:
      | 'running'
      | 'success'
      | 'skipped_disabled'
      | 'skipped_no_input'
      | 'skipped_unchanged'
      | 'failed'
      | 'abandoned';
    startedAt: Date;
    completedAt: Date | null;
    failureCategory:
      | 'provider_failure'
      | 'timeout'
      | 'rate_limit'
      | 'malformed_output'
      | 'safety_rejection'
      | 'dependency_failure'
      | 'abandoned'
      | null;
    urlContextSucceededCount: number;
    urlContextFailedCount: number;
  }> | null;
}

export interface ProfileAiAdministrationService {
  getProfileAi(profileConfigKey: unknown): Promise<AdminProfileAiReadModel>;
  updateProfileAiConfiguration(
    profileConfigKey: unknown,
    input: unknown,
  ): Promise<AdminProfileAiReadModel>;
  forceGenerateProfileDigest(profileConfigKey: unknown): Promise<
    Readonly<{
      result: 'generated' | 'completed_unsuccessfully' | 'skipped_unchanged';
      ai: AdminProfileAiReadModel;
    }>
  >;
}

export function createProfileAiAdministrationService(
  database: Database,
  lifecycle: DigestLifecycleService,
): ProfileAiAdministrationService {
  return Object.freeze({
    async getProfileAi(profileConfigKey: unknown) {
      const key = profileKey(profileConfigKey);
      return readModel(database, lifecycle, key);
    },

    async updateProfileAiConfiguration(
      profileConfigKey: unknown,
      input: unknown,
    ) {
      const key = profileKey(profileConfigKey);
      const command = configurationCommand(input);
      await database.transaction(async (transaction) => {
        const profile = await findDistributionProfileByConfigKey(
          transaction,
          key,
        );
        if (profile === undefined)
          throw new ProfileAiAdministrationError('profile_not_found');
        const before = await requireSettings(transaction, key);
        if (sameConfiguration(before, command)) return;
        const after = await updateProfileAiSettings(transaction, key, command);
        await transaction.query(
          `INSERT INTO audit_events
             (id, action, target_type, target_id, prior_state, new_state)
           VALUES ($1, 'distribution_profile_ai_configuration_changed',
                   'distribution_profile', $2, $3::jsonb, $4::jsonb)`,
          [
            randomUUID(),
            profile.id,
            JSON.stringify(configurationState(before)),
            JSON.stringify(configurationState(after)),
          ],
        );
      });
      return readModel(database, lifecycle, key);
    },

    async forceGenerateProfileDigest(profileConfigKey: unknown) {
      const key = profileKey(profileConfigKey);
      const result = await lifecycle.forceGenerate(key);
      const conflict = generationConflict(result);
      if (conflict !== undefined)
        throw new ProfileAiAdministrationError(conflict);
      if (result.kind === 'not_found')
        throw new ProfileAiAdministrationError('profile_not_found');
      return Object.freeze({
        result:
          result.kind === 'generated'
            ? 'generated'
            : result.kind === 'skipped_unchanged'
              ? 'skipped_unchanged'
              : 'completed_unsuccessfully',
        ai: await readModel(database, lifecycle, key),
      });
    },
  });
}

async function readModel(
  database: Database,
  lifecycle: DigestLifecycleService,
  key: string,
): Promise<AdminProfileAiReadModel> {
  const profile = await findDistributionProfileByConfigKey(database, key);
  if (profile === undefined)
    throw new ProfileAiAdministrationError('profile_not_found');
  const settings = await requireSettings(database, key);
  const status = await lifecycle.readStatus(key);
  return Object.freeze({
    profileKey: key,
    configuration: configurationState(settings),
    cadence: Object.freeze({
      kind: 'twice_daily' as const,
      slots: Object.freeze(['00:00Z', '12:00Z']) as readonly [
        '00:00Z',
        '12:00Z',
      ],
    }),
    activeDigest: mapDigest(status.digest),
    latestAttempt: mapAttempt(status.latestAttempt),
  });
}

function configurationCommand(input: unknown): Readonly<{
  digestEnabled: boolean;
  digestLookbackDays: number;
  digestMaxArticleCount: number;
}> {
  const record = validateAdminInputRecord(input, [
    'digestEnabled',
    'lookbackDays',
    'maxArticles',
  ]);
  if (
    record === undefined ||
    typeof record.digestEnabled !== 'boolean' ||
    !integerBetween(record.lookbackDays, 1, 30) ||
    !integerBetween(record.maxArticles, 1, 20)
  ) {
    throw new ProfileAiAdministrationError('invalid_request');
  }
  return Object.freeze({
    digestEnabled: record.digestEnabled,
    digestLookbackDays: record.lookbackDays,
    digestMaxArticleCount: record.maxArticles,
  });
}

async function requireSettings(
  executor: Database,
  key: string,
): Promise<ProfileAiSettings>;
async function requireSettings(
  executor: Parameters<Database['transaction']>[0] extends (
    transaction: infer Transaction,
  ) => Promise<unknown>
    ? Transaction
    : never,
  key: string,
): Promise<ProfileAiSettings>;
async function requireSettings(
  executor: Parameters<typeof readProfileAiSettings>[0],
  key: string,
): Promise<ProfileAiSettings> {
  const settings = await readProfileAiSettings(executor, key);
  if (settings === undefined)
    throw new Error('Profile AI settings are missing.');
  return settings;
}

function profileKey(value: unknown): string {
  try {
    return normalizeConfigKey(value);
  } catch {
    throw new ProfileAiAdministrationError('invalid_request');
  }
}

function integerBetween(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function configurationState(settings: ProfileAiSettings): Readonly<{
  digestEnabled: boolean;
  lookbackDays: number;
  maxArticles: number;
}> {
  return Object.freeze({
    digestEnabled: settings.digestEnabled,
    lookbackDays: settings.digestLookbackDays,
    maxArticles: settings.digestMaxArticleCount,
  });
}

function sameConfiguration(
  settings: ProfileAiSettings,
  input: Readonly<{
    digestEnabled: boolean;
    digestLookbackDays: number;
    digestMaxArticleCount: number;
  }>,
): boolean {
  return (
    settings.digestEnabled === input.digestEnabled &&
    settings.digestLookbackDays === input.digestLookbackDays &&
    settings.digestMaxArticleCount === input.digestMaxArticleCount
  );
}

function mapDigest(
  digest: ActiveProfileDigest | null,
): AdminProfileAiReadModel['activeDigest'] {
  if (digest === null) return null;
  return Object.freeze({
    generatedAt: digest.generatedAt,
    freshness: digest.freshness,
    inputArticleCount: digest.inputArticleCount,
    provider: digest.provider,
    model: digest.model,
  });
}

function mapAttempt(
  attempt: PersistedDigestAttempt | null,
): AdminProfileAiReadModel['latestAttempt'] {
  if (attempt === null) return null;
  return Object.freeze({
    triggerKind: attempt.triggerKind,
    outcome:
      attempt.state === 'running'
        ? 'running'
        : (attempt.terminalOutcome ?? 'abandoned'),
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    failureCategory: attempt.failureCategory,
    urlContextSucceededCount: attempt.urlContextSucceededCount,
    urlContextFailedCount: attempt.urlContextFailedCount,
  });
}

function generationConflict(
  result: DigestEvaluationResult,
): ProfileAiAdministrationErrorCode | undefined {
  if (result.kind === 'skipped_disabled') return 'digest_disabled';
  if (result.kind === 'skipped_no_input') return 'digest_no_input';
  if (result.kind === 'already_running') return 'digest_generation_in_progress';
  return undefined;
}
