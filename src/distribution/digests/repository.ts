import { randomUUID } from 'node:crypto';

import type { Database, QueryExecutor } from '../../database/database.ts';
import { ConfigurationValidationError } from '../../publication/configuration.ts';
import { normalizeConfigKey } from '../../sources/configuration.ts';

export const DEFAULT_PROFILE_DIGEST_LOOKBACK_DAYS = 7;
export const DEFAULT_PROFILE_DIGEST_MAX_ARTICLE_COUNT = 20;

export interface ProfileAiSettings {
  readonly profileId: string;
  readonly profileConfigKey: string;
  readonly digestEnabled: boolean;
  readonly digestLookbackDays: number;
  readonly digestMaxArticleCount: number;
  readonly digestStyleGuidance: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DigestHighlightDraft {
  readonly title: string;
  readonly explanation: string;
  readonly supportingArticleIds: readonly string[];
}

export interface SuccessfulDigestDraft {
  readonly profileConfigKey: string;
  readonly digestInputIdentity: string;
  readonly generatedAt: Date;
  readonly provider: string;
  readonly model: string;
  readonly inputArticleIds: readonly string[];
  readonly overview: string;
  readonly highlights: readonly DigestHighlightDraft[];
}

export interface PersistedDigestHighlight {
  readonly title: string;
  readonly explanation: string;
  readonly supportingArticleIds: readonly string[];
}

export interface PersistedSuccessfulDigest {
  readonly id: string;
  readonly profileId: string;
  readonly profileConfigKey: string;
  readonly digestInputIdentity: string;
  readonly generatedAt: Date;
  readonly provider: string;
  readonly model: string;
  readonly inputArticleIds: readonly string[];
  readonly overview: string;
  readonly highlights: readonly PersistedDigestHighlight[];
}

export type DigestAttemptTriggerKind = 'scheduled' | 'manual';
export type DigestAttemptState = 'running' | 'completed';
export type DigestAttemptTerminalOutcome =
  | 'success'
  | 'skipped_disabled'
  | 'skipped_no_input'
  | 'skipped_unchanged'
  | 'failed'
  | 'abandoned';
export type DigestAttemptFailureCategory =
  | 'provider_failure'
  | 'timeout'
  | 'rate_limit'
  | 'malformed_output'
  | 'safety_rejection'
  | 'dependency_failure'
  | 'abandoned';

export interface PersistedDigestAttempt {
  readonly id: string;
  readonly profileId: string;
  readonly profileConfigKey: string;
  readonly triggerKind: DigestAttemptTriggerKind;
  readonly scheduledSlot: Date | null;
  readonly state: DigestAttemptState;
  readonly terminalOutcome: DigestAttemptTerminalOutcome | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly digestInputIdentity: string | null;
  readonly inputArticleCount: number | null;
  readonly failureCategory: DigestAttemptFailureCategory | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly urlContextSucceededCount: number;
  readonly urlContextFailedCount: number;
}

export interface ClaimDigestAttemptInput {
  readonly profileConfigKey: string;
  readonly triggerKind: DigestAttemptTriggerKind;
  readonly scheduledSlot?: Date;
  readonly startedAt: Date;
}

export interface CompleteDigestAttemptInput {
  readonly profileConfigKey: string;
  readonly attemptId: string;
  readonly terminalOutcome: Exclude<DigestAttemptTerminalOutcome, 'abandoned'>;
  readonly completedAt: Date;
  readonly digestInputIdentity?: string;
  readonly inputArticleCount?: number;
  readonly failureCategory?: Exclude<DigestAttemptFailureCategory, 'abandoned'>;
  readonly provider?: string;
  readonly model?: string;
  readonly urlContextSucceededCount?: number;
  readonly urlContextFailedCount?: number;
}

export type DigestAttemptClaimOutcome =
  | Readonly<{ kind: 'claimed'; attempt: PersistedDigestAttempt }>
  | Readonly<{ kind: 'already_running' }>
  | Readonly<{ kind: 'scheduled_slot_claimed' }>;

export interface RecoverAndClaimDigestAttemptInput extends ClaimDigestAttemptInput {
  readonly staleAttemptId: string;
  readonly staleBefore: Date;
  readonly recoveredAt: Date;
}

export type RecoverAndClaimDigestAttemptOutcome =
  | Readonly<{ kind: 'recovered_and_claimed'; attempt: PersistedDigestAttempt }>
  | Readonly<{ kind: 'stale_attempt_not_recovered' }>
  | Exclude<DigestAttemptClaimOutcome, { kind: 'claimed' }>;

interface SettingsRow {
  readonly profile_id: unknown;
  readonly config_key: unknown;
  readonly digest_enabled: unknown;
  readonly digest_lookback_days: unknown;
  readonly digest_max_article_count: unknown;
  readonly digest_style_guidance: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

interface GenerationRow {
  readonly id: unknown;
  readonly profile_id: unknown;
  readonly config_key: unknown;
  readonly digest_input_identity: unknown;
  readonly generated_at: unknown;
  readonly provider: unknown;
  readonly model: unknown;
  readonly input_article_count: unknown;
  readonly overview: unknown;
}

interface InputRow {
  readonly position: unknown;
  readonly article_id: unknown;
}

interface HighlightRow {
  readonly id: unknown;
  readonly position: unknown;
  readonly title: unknown;
  readonly explanation: unknown;
}

interface SupportRow {
  readonly highlight_id: unknown;
  readonly position: unknown;
  readonly article_id: unknown;
}

interface AttemptRow extends SettingsRow {
  readonly id: unknown;
  readonly trigger_kind: unknown;
  readonly scheduled_slot: unknown;
  readonly state: unknown;
  readonly terminal_outcome: unknown;
  readonly started_at: unknown;
  readonly completed_at: unknown;
  readonly digest_input_identity: unknown;
  readonly input_article_count: unknown;
  readonly failure_category: unknown;
  readonly provider: unknown;
  readonly model: unknown;
  readonly url_context_succeeded_count: unknown;
  readonly url_context_failed_count: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const IDENTITY = /^[0-9a-f]{64}$/u;

export function normalizeProfileAiSettingsUpdate(input: unknown): Readonly<{
  digestEnabled: boolean;
  digestLookbackDays: number;
  digestMaxArticleCount: number;
  digestStyleGuidance: string | null;
}> {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw configurationError('settings_invalid');
  const value = input as Record<string, unknown>;
  if (
    typeof value.digestEnabled !== 'boolean' ||
    !integerBetween(value.digestLookbackDays, 1, 30) ||
    !integerBetween(value.digestMaxArticleCount, 1, 20)
  ) {
    throw configurationError('settings_invalid');
  }
  return Object.freeze({
    digestEnabled: value.digestEnabled,
    digestLookbackDays: value.digestLookbackDays,
    digestMaxArticleCount: value.digestMaxArticleCount,
    digestStyleGuidance: normalizeDigestStyleGuidance(
      value.digestStyleGuidance,
    ),
  });
}

/** Canonical bounded plain-text Profile writing-style configuration. */
export function normalizeDigestStyleGuidance(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw configurationError('settings_invalid');
  const normalized = value.normalize('NFKC').trim();
  if (normalized.length === 0) return null;
  if (codePointLength(normalized) > 500)
    throw configurationError('settings_invalid');
  return normalized;
}

export async function readProfileAiSettings(
  executor: QueryExecutor,
  profileConfigKey: unknown,
): Promise<ProfileAiSettings | undefined> {
  const result = await executor.query<SettingsRow>(
    `SELECT settings.profile_id, profile.config_key, settings.digest_enabled,
            settings.digest_lookback_days, settings.digest_max_article_count,
            settings.digest_style_guidance,
            settings.created_at, settings.updated_at
       FROM distribution_profile_ai_settings settings
       JOIN distribution_profiles profile ON profile.id = settings.profile_id
      WHERE profile.config_key = $1`,
    [normalizeConfigKey(profileConfigKey)],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapSettings(row);
}

export async function updateProfileAiSettings(
  executor: QueryExecutor,
  profileConfigKey: unknown,
  input: unknown,
): Promise<ProfileAiSettings> {
  const settings = normalizeProfileAiSettingsUpdate(input);
  const result = await executor.query<SettingsRow>(
    `UPDATE distribution_profile_ai_settings settings
        SET digest_enabled = $2, digest_lookback_days = $3,
            digest_max_article_count = $4, digest_style_guidance = $5,
            updated_at = now()
       FROM distribution_profiles profile
      WHERE settings.profile_id = profile.id AND profile.config_key = $1
       RETURNING settings.profile_id, profile.config_key, settings.digest_enabled,
                settings.digest_lookback_days, settings.digest_max_article_count,
                settings.digest_style_guidance,
                settings.created_at, settings.updated_at`,
    [
      normalizeConfigKey(profileConfigKey),
      settings.digestEnabled,
      settings.digestLookbackDays,
      settings.digestMaxArticleCount,
      settings.digestStyleGuidance,
    ],
  );
  const row = result.rows[0];
  if (row === undefined) throw configurationError('settings_missing');
  return mapSettings(row);
}

export async function createSuccessfulDigestGeneration(
  executor: QueryExecutor,
  input: SuccessfulDigestDraft,
): Promise<PersistedSuccessfulDigest> {
  const draft = normalizeSuccessfulDigestDraft(input);
  const profile = await requireProfile(executor, draft.profileConfigKey);
  const id = randomUUID();
  await executor.query(
    `INSERT INTO distribution_profile_digest_generations
       (id, profile_id, digest_input_identity, generated_at, provider, model, input_article_count, overview)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      profile.id,
      draft.digestInputIdentity,
      draft.generatedAt,
      draft.provider,
      draft.model,
      draft.inputArticleIds.length,
      draft.overview,
    ],
  );
  for (const [position, articleId] of draft.inputArticleIds.entries()) {
    await executor.query(
      `INSERT INTO distribution_profile_digest_inputs
         (generation_id, profile_id, position, article_id)
       VALUES ($1, $2, $3, $4)`,
      [id, profile.id, position, articleId],
    );
  }
  for (const [position, highlight] of draft.highlights.entries()) {
    const highlightId = randomUUID();
    await executor.query(
      `INSERT INTO distribution_profile_digest_highlights
         (id, generation_id, position, title, explanation)
       VALUES ($1, $2, $3, $4, $5)`,
      [highlightId, id, position, highlight.title, highlight.explanation],
    );
    for (const [
      supportPosition,
      articleId,
    ] of highlight.supportingArticleIds.entries()) {
      await executor.query(
        `INSERT INTO distribution_profile_digest_highlight_supports
           (highlight_id, generation_id, position, article_id)
         VALUES ($1, $2, $3, $4)`,
        [highlightId, id, supportPosition, articleId],
      );
    }
  }
  return requireDigestGeneration(executor, id);
}

export async function findLatestSuccessfulDigest(
  executor: QueryExecutor,
  profileConfigKey: unknown,
): Promise<PersistedSuccessfulDigest | undefined> {
  const result = await executor.query<{ readonly id: unknown }>(
    `SELECT generation.id
       FROM distribution_profile_digest_generations generation
       JOIN distribution_profiles profile ON profile.id = generation.profile_id
      WHERE profile.config_key = $1
      ORDER BY generation.generated_at DESC, generation.id ASC
      LIMIT 1`,
    [normalizeConfigKey(profileConfigKey)],
  );
  const row = result.rows[0];
  return row === undefined
    ? undefined
    : requireDigestGeneration(executor, requiredUuid(row.id));
}

export async function findActiveDigest(
  executor: QueryExecutor,
  profileConfigKey: unknown,
): Promise<PersistedSuccessfulDigest | undefined> {
  const result = await executor.query<{ readonly generation_id: unknown }>(
    `SELECT active.generation_id
       FROM distribution_profile_active_digests active
       JOIN distribution_profiles profile ON profile.id = active.profile_id
      WHERE profile.config_key = $1`,
    [normalizeConfigKey(profileConfigKey)],
  );
  const row = result.rows[0];
  return row === undefined
    ? undefined
    : requireDigestGeneration(executor, requiredUuid(row.generation_id));
}

export async function suppressActiveDigest(
  database: Pick<Database, 'transaction'>,
  profileConfigKey: unknown,
): Promise<boolean> {
  return database.transaction((transaction) =>
    suppressActiveDigestInTransaction(transaction, profileConfigKey),
  );
}

/** Caller owns the transaction when suppression is part of a lifecycle transition. */
export async function suppressActiveDigestInTransaction(
  executor: QueryExecutor,
  profileConfigKey: unknown,
): Promise<boolean> {
  const profile = await requireProfile(executor, profileConfigKey);
  await acquireDigestLifecycleLock(executor, profile.id);
  const result = await executor.query<{ readonly profile_id: unknown }>(
    `DELETE FROM distribution_profile_active_digests
      WHERE profile_id = $1
      RETURNING profile_id`,
    [profile.id],
  );
  return result.rows[0] !== undefined;
}

/** Caller owns the transaction so P3 can compose completion and activation. */
export async function activateSuccessfulDigestGeneration(
  executor: QueryExecutor,
  profileConfigKey: unknown,
  generationId: unknown,
  activatedAt: Date,
): Promise<PersistedSuccessfulDigest> {
  const profile = await requireProfile(executor, profileConfigKey);
  await acquireDigestLifecycleLock(executor, profile.id);
  const digest = await requireDigestGeneration(
    executor,
    requiredUuid(generationId),
  );
  if (digest.profileId !== profile.id)
    throw configurationError('digest_profile_mismatch');
  await executor.query(
    `INSERT INTO distribution_profile_active_digests
       (profile_id, generation_id, activated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (profile_id) DO UPDATE
       SET generation_id = EXCLUDED.generation_id, activated_at = EXCLUDED.activated_at`,
    [profile.id, digest.id, requiredDate(activatedAt)],
  );
  return digest;
}

export async function persistAndActivateSuccessfulDigest(
  database: Pick<Database, 'transaction'>,
  input: SuccessfulDigestDraft,
  activatedAt: Date,
): Promise<PersistedSuccessfulDigest> {
  return database.transaction(async (transaction) => {
    const digest = await createSuccessfulDigestGeneration(transaction, input);
    return activateSuccessfulDigestGeneration(
      transaction,
      digest.profileConfigKey,
      digest.id,
      activatedAt,
    );
  });
}

export async function claimDigestAttempt(
  database: Pick<Database, 'transaction'>,
  input: ClaimDigestAttemptInput,
): Promise<DigestAttemptClaimOutcome> {
  return database.transaction((transaction) =>
    claimDigestAttemptInTransaction(transaction, input),
  );
}

/** Shared scheduled/manual claim seam. Call only inside a caller-owned transaction. */
export async function claimDigestAttemptInTransaction(
  executor: QueryExecutor,
  input: ClaimDigestAttemptInput,
): Promise<DigestAttemptClaimOutcome> {
  const normalized = normalizeClaimInput(input);
  const profile = await requireProfile(executor, normalized.profileConfigKey);
  // This transaction-scoped lock turns the two partial-unique invariants into
  // deterministic claim outcomes instead of relying on a failed INSERT, which
  // would abort a caller-owned PostgreSQL transaction.
  await acquireDigestLifecycleLock(executor, profile.id);
  if (normalized.triggerKind === 'scheduled') {
    const scheduled = await executor.query<{ readonly id: unknown }>(
      `SELECT id FROM distribution_profile_digest_attempts
        WHERE profile_id = $1 AND trigger_kind = 'scheduled' AND scheduled_slot = $2`,
      [profile.id, normalized.scheduledSlot],
    );
    if (scheduled.rows[0] !== undefined)
      return Object.freeze({ kind: 'scheduled_slot_claimed' });
  }
  const running = await executor.query<{ readonly id: unknown }>(
    `SELECT id FROM distribution_profile_digest_attempts
      WHERE profile_id = $1 AND state = 'running'`,
    [profile.id],
  );
  if (running.rows[0] !== undefined)
    return Object.freeze({ kind: 'already_running' });
  const result = await executor.query<AttemptRow>(
    `INSERT INTO distribution_profile_digest_attempts
       (id, profile_id, trigger_kind, scheduled_slot, state, started_at)
     VALUES ($1, $2, $3, $4, 'running', $5)
     RETURNING id, profile_id, $6::text AS config_key, trigger_kind, scheduled_slot,
               state, terminal_outcome, started_at, completed_at,
               digest_input_identity, input_article_count, failure_category,
               provider, model, url_context_succeeded_count, url_context_failed_count,
               NULL::boolean AS digest_enabled, 1 AS digest_lookback_days,
               1 AS digest_max_article_count, started_at AS created_at, started_at AS updated_at`,
    [
      randomUUID(),
      profile.id,
      normalized.triggerKind,
      normalized.scheduledSlot,
      normalized.startedAt,
      profile.configKey,
    ],
  );
  return Object.freeze({
    kind: 'claimed',
    attempt: mapAttempt(requiredRow(result.rows)),
  });
}

export async function recoverStaleRunningAttemptAndClaim(
  database: Pick<Database, 'transaction'>,
  input: RecoverAndClaimDigestAttemptInput,
): Promise<RecoverAndClaimDigestAttemptOutcome> {
  return database.transaction(async (transaction) => {
    const normalized = normalizeRecoveryInput(input);
    const profile = await requireProfile(
      transaction,
      normalized.profileConfigKey,
    );
    await acquireDigestLifecycleLock(transaction, profile.id);
    const recovered = await transaction.query<{ readonly id: unknown }>(
      `UPDATE distribution_profile_digest_attempts
          SET state = 'completed', terminal_outcome = 'abandoned',
              failure_category = 'abandoned', completed_at = $3
        WHERE id = $1 AND profile_id = $2 AND state = 'running'
          AND started_at <= $4
        RETURNING id`,
      [
        normalized.staleAttemptId,
        profile.id,
        normalized.recoveredAt,
        normalized.staleBefore,
      ],
    );
    if (recovered.rows[0] === undefined)
      return Object.freeze({ kind: 'stale_attempt_not_recovered' });
    const claim = await claimDigestAttemptInTransaction(
      transaction,
      normalized,
    );
    if (claim.kind === 'claimed')
      return Object.freeze({
        kind: 'recovered_and_claimed',
        attempt: claim.attempt,
      });
    return claim;
  });
}

export async function findRunningDigestAttempt(
  executor: QueryExecutor,
  profileConfigKey: unknown,
): Promise<PersistedDigestAttempt | undefined> {
  const profile = await requireProfile(executor, profileConfigKey);
  return findDigestAttempt(executor, profile, "state = 'running'", true);
}

export async function findLatestDigestAttempt(
  executor: QueryExecutor,
  profileConfigKey: unknown,
): Promise<PersistedDigestAttempt | undefined> {
  const profile = await requireProfile(executor, profileConfigKey);
  return findDigestAttempt(executor, profile, 'TRUE');
}

export async function completeDigestAttempt(
  database: Pick<Database, 'transaction'>,
  input: CompleteDigestAttemptInput,
): Promise<PersistedDigestAttempt> {
  return database.transaction((transaction) =>
    completeDigestAttemptInTransaction(transaction, input),
  );
}

/** Caller owns the transaction so P3 can atomically activate/suppress and complete. */
export async function completeDigestAttemptInTransaction(
  executor: QueryExecutor,
  input: CompleteDigestAttemptInput,
): Promise<PersistedDigestAttempt> {
  const completion = normalizeCompletionInput(input);
  const profile = await requireProfile(executor, completion.profileConfigKey);
  await acquireDigestLifecycleLock(executor, profile.id);
  const result = await executor.query<AttemptRow>(
    `UPDATE distribution_profile_digest_attempts
        SET state = 'completed', terminal_outcome = $3, completed_at = $4,
            digest_input_identity = $5, input_article_count = $6,
            failure_category = $7, provider = $8, model = $9,
            url_context_succeeded_count = $10, url_context_failed_count = $11
      WHERE id = $1 AND profile_id = $2 AND state = 'running'
      RETURNING id, profile_id, $12::text AS config_key, trigger_kind,
                scheduled_slot, state, terminal_outcome, started_at,
                completed_at, digest_input_identity, input_article_count,
                failure_category, provider, model, url_context_succeeded_count,
                url_context_failed_count, NULL::boolean AS digest_enabled,
                1 AS digest_lookback_days, 1 AS digest_max_article_count,
                started_at AS created_at, started_at AS updated_at`,
    [
      completion.attemptId,
      profile.id,
      completion.terminalOutcome,
      completion.completedAt,
      completion.digestInputIdentity,
      completion.inputArticleCount,
      completion.failureCategory,
      completion.provider,
      completion.model,
      completion.urlContextSucceededCount,
      completion.urlContextFailedCount,
      profile.configKey,
    ],
  );
  const row = result.rows[0];
  if (row === undefined) throw configurationError('attempt_not_running');
  return mapAttempt(row);
}

async function findDigestAttempt(
  executor: QueryExecutor,
  profile: Readonly<{ id: string; configKey: string }>,
  predicate: string,
  requireUnique = false,
): Promise<PersistedDigestAttempt | undefined> {
  const result = await executor.query<AttemptRow>(
    `SELECT attempt.id, attempt.profile_id, $2::text AS config_key,
            attempt.trigger_kind, attempt.scheduled_slot, attempt.state,
            attempt.terminal_outcome, attempt.started_at, attempt.completed_at,
            attempt.digest_input_identity, attempt.input_article_count,
            attempt.failure_category, attempt.provider, attempt.model,
            attempt.url_context_succeeded_count,
            attempt.url_context_failed_count, NULL::boolean AS digest_enabled,
            1 AS digest_lookback_days, 1 AS digest_max_article_count,
            attempt.started_at AS created_at, attempt.started_at AS updated_at
       FROM distribution_profile_digest_attempts attempt
      WHERE attempt.profile_id = $1 AND ${predicate}
      ORDER BY attempt.started_at DESC, attempt.id ASC
      LIMIT $3`,
    [profile.id, profile.configKey, requireUnique ? 2 : 1],
  );
  if (requireUnique && result.rows.length > 1)
    throw new Error('Persisted digest running-attempt state is invalid.');
  const row = result.rows[0];
  return row === undefined ? undefined : mapAttempt(row);
}

async function acquireDigestLifecycleLock(
  executor: QueryExecutor,
  profileId: string,
): Promise<void> {
  await executor.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
    [profileId],
  );
}

async function requireDigestGeneration(
  executor: QueryExecutor,
  id: string,
): Promise<PersistedSuccessfulDigest> {
  const result = await executor.query<GenerationRow>(
    `SELECT generation.id, generation.profile_id, profile.config_key,
            generation.digest_input_identity, generation.generated_at,
            generation.provider, generation.model, generation.input_article_count,
            generation.overview
       FROM distribution_profile_digest_generations generation
       JOIN distribution_profiles profile ON profile.id = generation.profile_id
      WHERE generation.id = $1`,
    [id],
  );
  const generation = requiredRow(result.rows);
  const mapped = mapGeneration(generation);
  const [inputs, highlights, supports] = await Promise.all([
    executor.query<InputRow>(
      `SELECT position, article_id FROM distribution_profile_digest_inputs
        WHERE generation_id = $1 ORDER BY position ASC`,
      [mapped.id],
    ),
    executor.query<HighlightRow>(
      `SELECT id, position, title, explanation
         FROM distribution_profile_digest_highlights
        WHERE generation_id = $1 ORDER BY position ASC`,
      [mapped.id],
    ),
    executor.query<SupportRow>(
      `SELECT highlight_id, position, article_id
         FROM distribution_profile_digest_highlight_supports
        WHERE generation_id = $1 ORDER BY highlight_id ASC, position ASC`,
      [mapped.id],
    ),
  ]);
  const inputArticleIds = orderedArticleIds(
    inputs.rows,
    mapped.inputArticleCount,
  );
  const inputSet = new Set(inputArticleIds);
  const mappedHighlights = highlights.rows.map((row, position) => {
    const id = requiredUuid(row.id);
    if (requiredInteger(row.position, 0, 2) !== position) throw new Error();
    const supportingArticleIds = supports.rows
      .filter((support) => requiredUuid(support.highlight_id) === id)
      .map((support, supportPosition) => {
        if (requiredInteger(support.position, 0, 2) !== supportPosition)
          throw new Error();
        const articleId = requiredUuid(support.article_id);
        if (!inputSet.has(articleId)) throw new Error();
        return articleId;
      });
    if (new Set(supportingArticleIds).size !== supportingArticleIds.length)
      throw new Error();
    return Object.freeze({
      title: boundedText(row.title, 1, 200),
      explanation: boundedText(row.explanation, 1, 500),
      supportingArticleIds: Object.freeze(supportingArticleIds),
    });
  });
  if (mappedHighlights.length > 3) throw new Error();
  return Object.freeze({
    ...mapped,
    inputArticleIds: Object.freeze(inputArticleIds),
    highlights: Object.freeze(mappedHighlights),
  });
}

async function requireProfile(
  executor: QueryExecutor,
  configKey: unknown,
): Promise<Readonly<{ id: string; configKey: string }>> {
  const key = normalizeConfigKey(configKey);
  const result = await executor.query<{
    readonly id: unknown;
    readonly config_key: unknown;
  }>('SELECT id, config_key FROM distribution_profiles WHERE config_key = $1', [
    key,
  ]);
  const row = result.rows[0];
  if (row === undefined) throw configurationError('profile_not_found');
  return Object.freeze({
    id: requiredUuid(row.id),
    configKey: normalizeConfigKey(row.config_key),
  });
}

function normalizeSuccessfulDigestDraft(
  input: SuccessfulDigestDraft,
): SuccessfulDigestDraft {
  const profileConfigKey = normalizeConfigKey(input.profileConfigKey);
  const digestInputIdentity = identity(input.digestInputIdentity);
  const generatedAt = requiredDate(input.generatedAt);
  const provider = boundedText(input.provider, 1, 100);
  const model = boundedText(input.model, 1, 100);
  const inputArticleIds = uniqueArticleIds(input.inputArticleIds, 1, 20);
  const overview = boundedText(input.overview, 1, 2000);
  if (!Array.isArray(input.highlights) || input.highlights.length > 3)
    throw configurationError('highlights_invalid');
  const highlights = input.highlights.map((highlight) => {
    const supportingArticleIds = uniqueArticleIds(
      highlight.supportingArticleIds,
      0,
      3,
    );
    if (!supportingArticleIds.every((id) => inputArticleIds.includes(id)))
      throw configurationError('support_not_in_input');
    return Object.freeze({
      title: boundedText(highlight.title, 1, 200),
      explanation: boundedText(highlight.explanation, 1, 500),
      supportingArticleIds: Object.freeze(supportingArticleIds),
    });
  });
  return Object.freeze({
    profileConfigKey,
    digestInputIdentity,
    generatedAt,
    provider,
    model,
    inputArticleIds: Object.freeze(inputArticleIds),
    overview,
    highlights: Object.freeze(highlights),
  });
}

function normalizeClaimInput(
  input: ClaimDigestAttemptInput,
): Readonly<Required<ClaimDigestAttemptInput>> {
  const profileConfigKey = normalizeConfigKey(input.profileConfigKey);
  if (input.triggerKind !== 'scheduled' && input.triggerKind !== 'manual')
    throw configurationError('attempt_trigger_invalid');
  const startedAt = requiredDate(input.startedAt);
  if (input.triggerKind === 'scheduled') {
    if (input.scheduledSlot === undefined)
      throw configurationError('scheduled_slot_required');
    return Object.freeze({
      profileConfigKey,
      triggerKind: input.triggerKind,
      scheduledSlot: requiredDate(input.scheduledSlot),
      startedAt,
    });
  }
  if (input.scheduledSlot !== undefined)
    throw configurationError('manual_slot_forbidden');
  return Object.freeze({
    profileConfigKey,
    triggerKind: input.triggerKind,
    scheduledSlot: undefined as never,
    startedAt,
  });
}

function normalizeRecoveryInput(
  input: RecoverAndClaimDigestAttemptInput,
): RecoverAndClaimDigestAttemptInput {
  return Object.freeze({
    ...normalizeClaimInput(input),
    staleAttemptId: requiredUuid(input.staleAttemptId),
    staleBefore: requiredDate(input.staleBefore),
    recoveredAt: requiredDate(input.recoveredAt),
  });
}

function normalizeCompletionInput(input: CompleteDigestAttemptInput): Readonly<{
  profileConfigKey: string;
  attemptId: string;
  terminalOutcome: Exclude<DigestAttemptTerminalOutcome, 'abandoned'>;
  completedAt: Date;
  digestInputIdentity: string | null;
  inputArticleCount: number | null;
  failureCategory: Exclude<DigestAttemptFailureCategory, 'abandoned'> | null;
  provider: string | null;
  model: string | null;
  urlContextSucceededCount: number;
  urlContextFailedCount: number;
}> {
  const terminalOutcome = input.terminalOutcome;
  if (
    terminalOutcome !== 'success' &&
    terminalOutcome !== 'skipped_disabled' &&
    terminalOutcome !== 'skipped_no_input' &&
    terminalOutcome !== 'skipped_unchanged' &&
    terminalOutcome !== 'failed'
  ) {
    throw configurationError('attempt_outcome_invalid');
  }
  const normalized = Object.freeze({
    profileConfigKey: normalizeConfigKey(input.profileConfigKey),
    attemptId: requiredUuid(input.attemptId),
    terminalOutcome,
    completedAt: requiredDate(input.completedAt),
    digestInputIdentity:
      input.digestInputIdentity === undefined
        ? null
        : identity(input.digestInputIdentity),
    inputArticleCount:
      input.inputArticleCount === undefined
        ? null
        : requiredInteger(input.inputArticleCount, 0, 20),
    failureCategory:
      input.failureCategory === undefined
        ? null
        : completionFailureCategory(input.failureCategory),
    provider:
      input.provider === undefined ? null : boundedText(input.provider, 1, 100),
    model: input.model === undefined ? null : boundedText(input.model, 1, 100),
    urlContextSucceededCount:
      input.urlContextSucceededCount === undefined
        ? 0
        : requiredInteger(input.urlContextSucceededCount, 0, 20),
    urlContextFailedCount:
      input.urlContextFailedCount === undefined
        ? 0
        : requiredInteger(input.urlContextFailedCount, 0, 20),
  });
  validateAttemptTerminalShape(normalized);
  return normalized;
}

function completionFailureCategory(
  value: unknown,
): Exclude<DigestAttemptFailureCategory, 'abandoned'> {
  if (
    value === 'provider_failure' ||
    value === 'timeout' ||
    value === 'rate_limit' ||
    value === 'malformed_output' ||
    value === 'safety_rejection' ||
    value === 'dependency_failure'
  ) {
    return value;
  }
  throw configurationError('attempt_failure_invalid');
}

function validateAttemptTerminalShape(
  input: Readonly<{
    terminalOutcome: DigestAttemptTerminalOutcome;
    digestInputIdentity: string | null;
    inputArticleCount: number | null;
    failureCategory: DigestAttemptFailureCategory | null;
    provider: string | null;
    model: string | null;
    urlContextSucceededCount: number;
    urlContextFailedCount: number;
  }>,
): void {
  const hasProviderFacts =
    input.provider !== null ||
    input.model !== null ||
    input.urlContextSucceededCount !== 0 ||
    input.urlContextFailedCount !== 0;
  if (input.terminalOutcome === 'success') {
    if (
      input.digestInputIdentity === null ||
      input.inputArticleCount === null ||
      input.inputArticleCount === 0 ||
      input.provider === null ||
      input.model === null ||
      input.failureCategory !== null
    ) {
      throw configurationError('attempt_terminal_metadata_invalid');
    }
    return;
  }
  if (input.terminalOutcome === 'skipped_disabled') {
    if (
      input.digestInputIdentity !== null ||
      input.inputArticleCount !== null ||
      input.failureCategory !== null ||
      hasProviderFacts
    ) {
      throw configurationError('attempt_terminal_metadata_invalid');
    }
    return;
  }
  if (input.terminalOutcome === 'skipped_no_input') {
    if (
      input.inputArticleCount !== 0 ||
      input.failureCategory !== null ||
      hasProviderFacts
    ) {
      throw configurationError('attempt_terminal_metadata_invalid');
    }
    return;
  }
  if (input.terminalOutcome === 'skipped_unchanged') {
    if (
      input.digestInputIdentity === null ||
      input.inputArticleCount === null ||
      input.inputArticleCount === 0 ||
      input.failureCategory !== null ||
      hasProviderFacts
    ) {
      throw configurationError('attempt_terminal_metadata_invalid');
    }
    return;
  }
  if (input.terminalOutcome === 'failed') {
    if (input.failureCategory === null) {
      throw configurationError('attempt_terminal_metadata_invalid');
    }
    return;
  }
  if (
    input.digestInputIdentity !== null ||
    input.inputArticleCount !== null ||
    input.failureCategory !== 'abandoned' ||
    hasProviderFacts
  ) {
    throw new Error('Persisted digest attempt terminal metadata is invalid.');
  }
}

function mapSettings(row: SettingsRow): ProfileAiSettings {
  try {
    if (typeof row.digest_enabled !== 'boolean') throw new Error();
    return Object.freeze({
      profileId: requiredUuid(row.profile_id),
      profileConfigKey: normalizeConfigKey(row.config_key),
      digestEnabled: row.digest_enabled,
      digestLookbackDays: requiredInteger(row.digest_lookback_days, 1, 30),
      digestMaxArticleCount: requiredInteger(
        row.digest_max_article_count,
        1,
        20,
      ),
      digestStyleGuidance: normalizeDigestStyleGuidance(
        row.digest_style_guidance,
      ),
      createdAt: requiredDate(row.created_at),
      updatedAt: requiredDate(row.updated_at),
    });
  } catch {
    throw new Error('Persisted Profile AI settings are invalid.');
  }
}

function mapGeneration(row: GenerationRow): Omit<
  PersistedSuccessfulDigest,
  'inputArticleIds' | 'highlights'
> & {
  readonly inputArticleCount: number;
} {
  return Object.freeze({
    id: requiredUuid(row.id),
    profileId: requiredUuid(row.profile_id),
    profileConfigKey: normalizeConfigKey(row.config_key),
    digestInputIdentity: identity(row.digest_input_identity),
    generatedAt: requiredDate(row.generated_at),
    provider: boundedText(row.provider, 1, 100),
    model: boundedText(row.model, 1, 100),
    inputArticleCount: requiredInteger(row.input_article_count, 1, 20),
    overview: boundedText(row.overview, 1, 2000),
  });
}

function mapAttempt(row: AttemptRow): PersistedDigestAttempt {
  const triggerKind =
    row.trigger_kind === 'scheduled' || row.trigger_kind === 'manual'
      ? row.trigger_kind
      : fail();
  const state =
    row.state === 'running' || row.state === 'completed' ? row.state : fail();
  const terminalOutcome = nullableTerminalOutcome(row.terminal_outcome);
  const completedAt = nullableDate(row.completed_at);
  if (
    (state === 'running') !==
    (terminalOutcome === null && completedAt === null)
  )
    throw new Error('Persisted digest attempt state is invalid.');
  const digestInputIdentity =
    row.digest_input_identity === null
      ? null
      : identity(row.digest_input_identity);
  const inputArticleCount =
    row.input_article_count === null
      ? null
      : requiredInteger(row.input_article_count, 0, 20);
  const failureCategory = nullableFailureCategory(row.failure_category);
  const provider =
    row.provider === null ? null : boundedText(row.provider, 1, 100);
  const model = row.model === null ? null : boundedText(row.model, 1, 100);
  const urlContextSucceededCount = requiredInteger(
    row.url_context_succeeded_count,
    0,
    20,
  );
  const urlContextFailedCount = requiredInteger(
    row.url_context_failed_count,
    0,
    20,
  );
  if (state === 'running') {
    if (
      digestInputIdentity !== null ||
      inputArticleCount !== null ||
      failureCategory !== null ||
      provider !== null ||
      model !== null ||
      urlContextSucceededCount !== 0 ||
      urlContextFailedCount !== 0
    ) {
      throw new Error('Persisted digest attempt running metadata is invalid.');
    }
  } else {
    validateAttemptTerminalShape({
      terminalOutcome: terminalOutcome ?? fail(),
      digestInputIdentity,
      inputArticleCount,
      failureCategory,
      provider,
      model,
      urlContextSucceededCount,
      urlContextFailedCount,
    });
  }
  return Object.freeze({
    id: requiredUuid(row.id),
    profileId: requiredUuid(row.profile_id),
    profileConfigKey: normalizeConfigKey(row.config_key),
    triggerKind,
    scheduledSlot: nullableDate(row.scheduled_slot),
    state,
    terminalOutcome,
    startedAt: requiredDate(row.started_at),
    completedAt,
    digestInputIdentity,
    inputArticleCount,
    failureCategory,
    provider,
    model,
    urlContextSucceededCount,
    urlContextFailedCount,
  });
}

function orderedArticleIds(
  rows: readonly InputRow[],
  expectedCount: number,
): string[] {
  if (rows.length !== expectedCount)
    throw new Error('Persisted digest input is incomplete.');
  const ids = rows.map((row, position) => {
    if (requiredInteger(row.position, 0, 19) !== position) throw new Error();
    return requiredUuid(row.article_id);
  });
  if (new Set(ids).size !== ids.length)
    throw new Error('Persisted digest input is duplicated.');
  return ids;
}

function uniqueArticleIds(
  value: unknown,
  minimum: number,
  maximum: number,
): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
    throw configurationError('input_invalid');
  const ids = value.map((item) => requiredUuid(item));
  if (new Set(ids).size !== ids.length)
    throw configurationError('input_duplicated');
  return ids;
}
function boundedText(value: unknown, minimum: number, maximum: number): string {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    value.length < minimum ||
    value.length > maximum
  )
    throw configurationError('text_invalid');
  return value;
}
function identity(value: unknown): string {
  if (typeof value !== 'string' || !IDENTITY.test(value))
    throw configurationError('identity_invalid');
  return value;
}
function requiredUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value))
    throw configurationError('identifier_invalid');
  return value;
}
function requiredDate(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime()))
    throw configurationError('timestamp_invalid');
  return new Date(value.getTime());
}
function nullableDate(value: unknown): Date | null {
  return value === null ? null : requiredDate(value);
}
function requiredInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number {
  if (!integerBetween(value, minimum, maximum))
    throw configurationError('number_invalid');
  return value;
}
function integerBetween(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function codePointLength(value: string): number {
  return [...value].length;
}
function requiredRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Persisted digest row is missing.');
  return row;
}
function nullableTerminalOutcome(
  value: unknown,
): DigestAttemptTerminalOutcome | null {
  if (value === null) return null;
  if (
    value === 'success' ||
    value === 'skipped_disabled' ||
    value === 'skipped_no_input' ||
    value === 'skipped_unchanged' ||
    value === 'failed' ||
    value === 'abandoned'
  )
    return value;
  throw new Error('Persisted digest attempt outcome is invalid.');
}
function nullableFailureCategory(
  value: unknown,
): DigestAttemptFailureCategory | null {
  if (value === null) return null;
  if (
    value === 'provider_failure' ||
    value === 'timeout' ||
    value === 'rate_limit' ||
    value === 'malformed_output' ||
    value === 'safety_rejection' ||
    value === 'dependency_failure' ||
    value === 'abandoned'
  )
    return value;
  throw new Error('Persisted digest attempt failure is invalid.');
}
function fail(): never {
  throw new Error('Persisted digest attempt is invalid.');
}
function configurationError(reason: string): ConfigurationValidationError {
  return new ConfigurationValidationError('profile_ai', reason);
}
