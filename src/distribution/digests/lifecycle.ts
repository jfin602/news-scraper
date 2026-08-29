import type { Database } from '../../database/database.ts';
import { ConfigurationValidationError } from '../../publication/configuration.ts';
import { normalizeConfigKey } from '../../sources/configuration.ts';
import type { CanonicalOutwardArticle } from '../canonical-outward-articles.ts';
import {
  activateSuccessfulDigestGeneration,
  claimDigestAttempt,
  completeDigestAttemptInTransaction,
  createSuccessfulDigestGeneration,
  findActiveDigest,
  findLatestDigestAttempt,
  findRunningDigestAttempt,
  recoverStaleRunningAttemptAndClaim,
  suppressActiveDigest,
  suppressActiveDigestInTransaction,
  type DigestAttemptFailureCategory,
  type DigestAttemptTriggerKind,
  type PersistedDigestAttempt,
  type PersistedSuccessfulDigest,
} from './repository.ts';
import {
  createDigestInputService,
  digestInputIdentity,
  type DigestInputArticle,
  type DigestInputService,
  type ResolvedDigestInput,
} from './input.ts';
import {
  GEMINI_DIGEST_TIMEOUT_MILLISECONDS,
  type DigestGenerationResult,
  type DigestProvider,
  type DigestProviderFailureCategory,
  type UrlContextRetrievalFacts,
  type ValidatedDigestCandidate,
} from './provider.ts';

/** A short extra window prevents recovering an attempt at the exact provider timeout. */
export const DIGEST_STALE_RUNNING_ATTEMPT_MARGIN_MILLISECONDS = 5_000;

export type DigestFreshness = 'current' | 'older';

export interface ActiveProfileDigestSupport {
  readonly articleId: string;
  readonly headline: string;
  readonly sourceDisplayName: string;
  readonly effectiveFeedDate: Date;
  readonly originalUrl: string;
}

export interface ActiveProfileDigestHighlight {
  readonly title: string;
  readonly explanation: string;
  readonly supportingArticles: readonly ActiveProfileDigestSupport[];
}

/**
 * The provider-neutral, validated read model for downstream v1/PHP/admin
 * consumers. It intentionally excludes attempt state, identity, and provider
 * diagnostics.
 */
export interface ActiveProfileDigest {
  readonly generatedAt: Date;
  readonly freshness: DigestFreshness;
  readonly inputArticleCount: number;
  readonly provider: string;
  readonly model: string;
  readonly overview: string;
  readonly highlights: readonly ActiveProfileDigestHighlight[];
}

export interface DigestLifecycleStatus {
  readonly digest: ActiveProfileDigest | null;
  readonly latestAttempt: PersistedDigestAttempt | null;
}

export type DigestEvaluationFailureCategory =
  DigestProviderFailureCategory | 'lifecycle_state_changed';

interface DigestEvaluationBase {
  readonly claimed: boolean;
  readonly recoveredStaleAttempt: boolean;
}

export type DigestEvaluationResult =
  | Readonly<
      DigestEvaluationBase & {
        readonly kind: 'generated';
        readonly attemptId: string;
      }
    >
  | Readonly<
      DigestEvaluationBase & {
        readonly kind:
          'skipped_disabled' | 'skipped_no_input' | 'skipped_unchanged';
        readonly attemptId: string;
      }
    >
  | Readonly<
      DigestEvaluationBase & {
        readonly kind: 'failed';
        readonly attemptId?: string;
        readonly failureCategory: DigestEvaluationFailureCategory;
      }
    >
  | Readonly<
      DigestEvaluationBase & {
        readonly kind: 'already_running' | 'scheduled_slot_claimed';
      }
    >
  | Readonly<
      DigestEvaluationBase & {
        readonly kind: 'not_found';
      }
    >;

export interface DigestLifecycleService {
  evaluateScheduled(
    profileConfigKey: unknown,
    scheduledSlot: Date,
  ): Promise<DigestEvaluationResult>;
  forceGenerate(profileConfigKey: unknown): Promise<DigestEvaluationResult>;
  readActiveDigest(
    profileConfigKey: unknown,
  ): Promise<ActiveProfileDigest | null>;
  readStatus(profileConfigKey: unknown): Promise<DigestLifecycleStatus>;
}

export interface DigestLifecycleDependencies {
  readonly database: Database;
  readonly provider: DigestProvider;
  readonly input?: DigestInputService;
  readonly now?: () => Date;
  readonly providerAttemptTimeoutMilliseconds?: number;
  readonly staleRecoveryMarginMilliseconds?: number;
}

interface ClaimedDigestAttempt {
  readonly attempt: PersistedDigestAttempt;
  readonly recoveredStaleAttempt: boolean;
}

interface LifecycleContext {
  readonly input: ResolvedDigestInput;
  readonly canonicalArticles: readonly CanonicalOutwardArticle[];
}

/**
 * Owns every Profile digest generation/freshness decision. The only Provider
 * call is deliberately made after a durable claim and outside database work.
 */
export function createDigestLifecycleService(
  dependencies: DigestLifecycleDependencies,
): DigestLifecycleService {
  const database = dependencies.database;
  const input = dependencies.input ?? createDigestInputService(database);
  const now = dependencies.now ?? (() => new Date());
  const providerAttemptTimeoutMilliseconds = validPositiveMilliseconds(
    dependencies.providerAttemptTimeoutMilliseconds ??
      GEMINI_DIGEST_TIMEOUT_MILLISECONDS,
    'Digest provider attempt timeout',
  );
  const staleRecoveryMarginMilliseconds = validPositiveMilliseconds(
    dependencies.staleRecoveryMarginMilliseconds ??
      DIGEST_STALE_RUNNING_ATTEMPT_MARGIN_MILLISECONDS,
    'Digest stale recovery margin',
  );

  return Object.freeze({
    async evaluateScheduled(
      profileConfigKey: unknown,
      scheduledSlot: Date,
    ): Promise<DigestEvaluationResult> {
      let key: string;
      let slot: Date;
      try {
        key = normalizeConfigKey(profileConfigKey);
        slot = normalizeDigestScheduledSlot(scheduledSlot);
      } catch {
        return failedWithoutClaim('lifecycle_state_changed');
      }
      return evaluate({
        database,
        input,
        provider: dependencies.provider,
        profileConfigKey: key,
        triggerKind: 'scheduled',
        scheduledSlot: slot,
        force: false,
        now,
        providerAttemptTimeoutMilliseconds,
        staleRecoveryMarginMilliseconds,
      });
    },
    async forceGenerate(
      profileConfigKey: unknown,
    ): Promise<DigestEvaluationResult> {
      let key: string;
      try {
        key = normalizeConfigKey(profileConfigKey);
      } catch {
        return failedWithoutClaim('lifecycle_state_changed');
      }
      return evaluate({
        database,
        input,
        provider: dependencies.provider,
        profileConfigKey: key,
        triggerKind: 'manual',
        force: true,
        now,
        providerAttemptTimeoutMilliseconds,
        staleRecoveryMarginMilliseconds,
      });
    },
    async readActiveDigest(
      profileConfigKey: unknown,
    ): Promise<ActiveProfileDigest | null> {
      return readActiveDigest(
        database,
        input,
        profileConfigKey,
        requiredNow(now),
      );
    },
    async readStatus(
      profileConfigKey: unknown,
    ): Promise<DigestLifecycleStatus> {
      const digest = await readActiveDigest(
        database,
        input,
        profileConfigKey,
        requiredNow(now),
      );
      let latestAttempt: PersistedDigestAttempt | null = null;
      try {
        latestAttempt =
          (await findLatestDigestAttempt(database, profileConfigKey)) ?? null;
      } catch {
        // Optional AI status is fail-open relative to normal Profile reads.
      }
      return Object.freeze({ digest, latestAttempt });
    },
  });
}

interface EvaluationDependencies {
  readonly database: Database;
  readonly input: DigestInputService;
  readonly provider: DigestProvider;
  readonly profileConfigKey: string;
  readonly triggerKind: DigestAttemptTriggerKind;
  readonly scheduledSlot?: Date;
  readonly force: boolean;
  readonly now: () => Date;
  readonly providerAttemptTimeoutMilliseconds: number;
  readonly staleRecoveryMarginMilliseconds: number;
}

async function evaluate(
  dependencies: EvaluationDependencies,
): Promise<DigestEvaluationResult> {
  const startedAt = requiredNow(dependencies.now);
  let claimed: ClaimedDigestAttempt;
  try {
    const claim = await claimWithRecovery(dependencies, startedAt);
    if ('kind' in claim) return claim;
    claimed = claim;
  } catch (error) {
    return isMissingProfileError(error)
      ? notFound()
      : failedWithoutClaim('lifecycle_state_changed');
  }

  try {
    return await evaluateClaimedAttempt(dependencies, claimed);
  } catch {
    await completeFailure(
      dependencies.database,
      claimed.attempt,
      undefined,
      'lifecycle_state_changed',
      false,
      requiredNow(dependencies.now),
    );
    return failed(claimed, 'lifecycle_state_changed');
  }
}

async function claimWithRecovery(
  dependencies: EvaluationDependencies,
  startedAt: Date,
): Promise<ClaimedDigestAttempt | DigestEvaluationResult> {
  const running = await findRunningDigestAttempt(
    dependencies.database,
    dependencies.profileConfigKey,
  );
  if (running !== undefined) {
    const staleBefore = new Date(
      startedAt.getTime() -
        dependencies.providerAttemptTimeoutMilliseconds -
        dependencies.staleRecoveryMarginMilliseconds,
    );
    if (running.startedAt.getTime() > staleBefore.getTime())
      return alreadyRunning();
    const recovered = await recoverStaleRunningAttemptAndClaim(
      dependencies.database,
      {
        profileConfigKey: dependencies.profileConfigKey,
        triggerKind: dependencies.triggerKind,
        ...(dependencies.scheduledSlot === undefined
          ? {}
          : { scheduledSlot: dependencies.scheduledSlot }),
        startedAt,
        staleAttemptId: running.id,
        staleBefore,
        recoveredAt: startedAt,
      },
    );
    if (recovered.kind === 'recovered_and_claimed') {
      return Object.freeze({
        attempt: recovered.attempt,
        recoveredStaleAttempt: true,
      });
    }
    return claimOutcome(recovered);
  }

  return claimOutcome(
    await claimDigestAttempt(dependencies.database, {
      profileConfigKey: dependencies.profileConfigKey,
      triggerKind: dependencies.triggerKind,
      ...(dependencies.scheduledSlot === undefined
        ? {}
        : { scheduledSlot: dependencies.scheduledSlot }),
      startedAt,
    }),
  );
}

function claimOutcome(
  claim:
    | Awaited<ReturnType<typeof claimDigestAttempt>>
    | Exclude<
        Awaited<ReturnType<typeof recoverStaleRunningAttemptAndClaim>>,
        Readonly<{
          kind: 'recovered_and_claimed';
          attempt: PersistedDigestAttempt;
        }>
      >,
): ClaimedDigestAttempt | DigestEvaluationResult {
  if (claim.kind === 'claimed')
    return Object.freeze({
      attempt: claim.attempt,
      recoveredStaleAttempt: false,
    });
  if (claim.kind === 'already_running') return alreadyRunning();
  if (claim.kind === 'scheduled_slot_claimed') return scheduledSlotClaimed();
  return failedWithoutClaim('lifecycle_state_changed');
}

async function evaluateClaimedAttempt(
  dependencies: EvaluationDependencies,
  claimed: ClaimedDigestAttempt,
): Promise<DigestEvaluationResult> {
  const contextResult = await dependencies.input.readForLifecycle(
    dependencies.profileConfigKey,
    requiredNow(dependencies.now),
  );
  if (contextResult.kind !== 'active') {
    await completeSkip(
      dependencies.database,
      claimed.attempt,
      'skipped_no_input',
      undefined,
      true,
      requiredNow(dependencies.now),
    );
    return skipped(claimed, 'skipped_no_input');
  }
  const context = lifecycleContext(
    contextResult.input,
    contextResult.canonicalArticles,
  );
  if (!context.input.settings.digestEnabled) {
    await completeSkip(
      dependencies.database,
      claimed.attempt,
      'skipped_disabled',
      undefined,
      true,
      requiredNow(dependencies.now),
    );
    return skipped(claimed, 'skipped_disabled');
  }
  if (context.input.articles.length === 0) {
    await completeSkip(
      dependencies.database,
      claimed.attempt,
      'skipped_no_input',
      context.input,
      true,
      requiredNow(dependencies.now),
    );
    return skipped(claimed, 'skipped_no_input');
  }

  let active: PersistedSuccessfulDigest | undefined;
  try {
    active = await findActiveDigest(
      dependencies.database,
      context.input.profile.configKey,
    );
  } catch {
    // A malformed persisted optional digest must not remain outward-visible.
    await suppressActiveDigest(
      dependencies.database,
      context.input.profile.configKey,
    );
  }

  let suppressedBeforeProvider = false;
  if (
    active !== undefined &&
    (!isCanonicallyValid(active, context) ||
      !hasInputOverlap(active, context.input))
  ) {
    await suppressActiveDigest(
      dependencies.database,
      context.input.profile.configKey,
    );
    active = undefined;
    suppressedBeforeProvider = true;
  }

  if (
    active !== undefined &&
    !generationRequired(active, context.input, dependencies.force)
  ) {
    await completeSkip(
      dependencies.database,
      claimed.attempt,
      'skipped_unchanged',
      context.input,
      false,
      requiredNow(dependencies.now),
    );
    return skipped(claimed, 'skipped_unchanged');
  }

  let generated: DigestGenerationResult;
  try {
    generated = await dependencies.provider.generate(context.input);
  } catch {
    generated = Object.freeze({
      kind: 'failure' as const,
      category: 'provider_dependency_failure' as const,
    });
  }
  if (generated.kind === 'failure') {
    const suppress =
      suppressedBeforeProvider ||
      (await activeSuppressionRequired(
        dependencies.database,
        dependencies.input,
        context.input.profile.configKey,
        requiredNow(dependencies.now),
      ));
    await completeFailure(
      dependencies.database,
      claimed.attempt,
      context.input,
      generated.category,
      suppress,
      requiredNow(dependencies.now),
    );
    return failed(claimed, generated.category);
  }

  const activation = await candidateActivationState(
    dependencies.database,
    dependencies.input,
    context.input.profile.configKey,
    context.input,
    requiredNow(dependencies.now),
  );
  if (!activation.activate) {
    await completeFailure(
      dependencies.database,
      claimed.attempt,
      context.input,
      'lifecycle_state_changed',
      activation.suppress || suppressedBeforeProvider,
      requiredNow(dependencies.now),
      generated.candidate,
    );
    return failed(claimed, 'lifecycle_state_changed');
  }

  try {
    await persistActivateAndComplete(
      dependencies.database,
      claimed.attempt,
      context.input,
      generated.candidate,
      requiredNow(dependencies.now),
    );
    return Object.freeze({
      kind: 'generated',
      attemptId: claimed.attempt.id,
      claimed: true,
      recoveredStaleAttempt: claimed.recoveredStaleAttempt,
    });
  } catch {
    await completeFailure(
      dependencies.database,
      claimed.attempt,
      context.input,
      'lifecycle_state_changed',
      suppressedBeforeProvider,
      requiredNow(dependencies.now),
      generated.candidate,
    );
    return failed(claimed, 'lifecycle_state_changed');
  }
}

/**
 * Scheduled regeneration is based on new bounded input/settings, rather than
 * an age cutoff. Reconstructing an identity with historical ordered IDs and
 * current settings lets P3 distinguish a settings change from simple age-out.
 */
export function generationRequired(
  active: Pick<
    PersistedSuccessfulDigest,
    'profileConfigKey' | 'digestInputIdentity' | 'inputArticleIds'
  >,
  input: Pick<ResolvedDigestInput, 'settings'> & {
    readonly profile: Readonly<{ configKey: string }>;
    readonly articles: readonly Pick<DigestInputArticle, 'articleId'>[];
  },
  force: boolean,
): boolean {
  if (force) return true;
  const activeInputIds = new Set(active.inputArticleIds);
  if (input.articles.some((article) => !activeInputIds.has(article.articleId)))
    return true;
  return (
    digestInputIdentity({
      profileConfigKey: active.profileConfigKey,
      settings: input.settings,
      orderedArticleIds: active.inputArticleIds,
    }) !== active.digestInputIdentity
  );
}

export function normalizeDigestScheduledSlot(value: Date): Date {
  const slot = requiredDate(value, 'Digest scheduled slot');
  if (
    slot.getUTCMinutes() !== 0 ||
    slot.getUTCSeconds() !== 0 ||
    slot.getUTCMilliseconds() !== 0 ||
    (slot.getUTCHours() !== 0 && slot.getUTCHours() !== 12)
  ) {
    throw new TypeError('Digest scheduled slot must begin a UTC half-day.');
  }
  return slot;
}

async function persistActivateAndComplete(
  database: Database,
  attempt: PersistedDigestAttempt,
  input: ResolvedDigestInput,
  candidate: ValidatedDigestCandidate,
  completedAt: Date,
): Promise<void> {
  const retrieval = representableUrlContextFacts(candidate.urlContext);
  await database.transaction(async (transaction) => {
    const digest = await createSuccessfulDigestGeneration(transaction, {
      profileConfigKey: input.profile.configKey,
      digestInputIdentity: input.digestInputIdentity,
      generatedAt: completedAt,
      provider: candidate.provider,
      model: candidate.model,
      inputArticleIds: input.articles.map((article) => article.articleId),
      overview: candidate.overview,
      highlights: candidate.highlights,
    });
    await activateSuccessfulDigestGeneration(
      transaction,
      input.profile.configKey,
      digest.id,
      completedAt,
    );
    await completeDigestAttemptInTransaction(transaction, {
      profileConfigKey: input.profile.configKey,
      attemptId: attempt.id,
      terminalOutcome: 'success',
      completedAt,
      digestInputIdentity: input.digestInputIdentity,
      inputArticleCount: input.articles.length,
      provider: candidate.provider,
      model: candidate.model,
      ...(retrieval === undefined ? {} : retrieval),
    });
  });
}

async function completeSkip(
  database: Database,
  attempt: PersistedDigestAttempt,
  outcome: 'skipped_disabled' | 'skipped_no_input' | 'skipped_unchanged',
  input: ResolvedDigestInput | undefined,
  suppress: boolean,
  completedAt: Date,
): Promise<void> {
  await database.transaction(async (transaction) => {
    if (suppress)
      await suppressActiveDigestInTransaction(
        transaction,
        attempt.profileConfigKey,
      );
    await completeDigestAttemptInTransaction(transaction, {
      profileConfigKey: attempt.profileConfigKey,
      attemptId: attempt.id,
      terminalOutcome: outcome,
      completedAt,
      ...(outcome === 'skipped_disabled' || input === undefined
        ? {}
        : {
            digestInputIdentity: input.digestInputIdentity,
            inputArticleCount: input.articles.length,
          }),
      ...(outcome === 'skipped_no_input' && input === undefined
        ? { inputArticleCount: 0 }
        : {}),
    });
  });
}

async function completeFailure(
  database: Database,
  attempt: PersistedDigestAttempt,
  input: ResolvedDigestInput | undefined,
  failureCategory: DigestEvaluationFailureCategory,
  suppress: boolean,
  completedAt: Date,
  candidate?: ValidatedDigestCandidate,
): Promise<void> {
  const retrieval =
    candidate === undefined
      ? undefined
      : representableUrlContextFacts(candidate.urlContext);
  try {
    await database.transaction(async (transaction) => {
      if (suppress)
        await suppressActiveDigestInTransaction(
          transaction,
          attempt.profileConfigKey,
        );
      await completeDigestAttemptInTransaction(transaction, {
        profileConfigKey: attempt.profileConfigKey,
        attemptId: attempt.id,
        terminalOutcome: 'failed',
        completedAt,
        ...(input === undefined
          ? {}
          : {
              digestInputIdentity: input.digestInputIdentity,
              inputArticleCount: input.articles.length,
            }),
        failureCategory: persistedFailureCategory(failureCategory),
        ...(candidate === undefined
          ? {}
          : { provider: candidate.provider, model: candidate.model }),
        ...(retrieval === undefined ? {} : retrieval),
      });
    });
  } catch {
    // A database outage leaves the durable running claim for bounded stale
    // recovery; do not mask it by fabricating a terminal attempt locally.
  }
}

async function candidateActivationState(
  database: Database,
  inputService: DigestInputService,
  profileConfigKey: unknown,
  generatedInput: ResolvedDigestInput,
  now: Date,
): Promise<Readonly<{ activate: boolean; suppress: boolean }>> {
  const current = await inputService.readForLifecycle(profileConfigKey, now);
  if (current.kind !== 'active')
    return Object.freeze({ activate: false, suppress: true });
  const context = lifecycleContext(current.input, current.canonicalArticles);
  if (
    !context.input.settings.digestEnabled ||
    context.input.articles.length === 0
  )
    return Object.freeze({ activate: false, suppress: true });
  const generatedInputIds = generatedInput.articles.map(
    (article) => article.articleId,
  );
  if (!allPresent(generatedInputIds, context.canonicalArticles))
    return Object.freeze({ activate: false, suppress: true });
  if (!hasOverlap(generatedInputIds, context.input.articles))
    return Object.freeze({ activate: false, suppress: true });
  const currentSettingsForGeneratedInput = digestInputIdentity({
    profileConfigKey: generatedInput.profile.configKey,
    settings: context.input.settings,
    orderedArticleIds: generatedInputIds,
  });
  if (currentSettingsForGeneratedInput !== generatedInput.digestInputIdentity)
    return Object.freeze({ activate: false, suppress: false });
  return Object.freeze({ activate: true, suppress: false });
}

async function activeSuppressionRequired(
  database: Database,
  inputService: DigestInputService,
  profileConfigKey: unknown,
  now: Date,
): Promise<boolean> {
  try {
    const current = await inputService.readForLifecycle(profileConfigKey, now);
    if (current.kind !== 'active') return true;
    const context = lifecycleContext(current.input, current.canonicalArticles);
    if (
      !context.input.settings.digestEnabled ||
      context.input.articles.length === 0
    )
      return true;
    const active = await findActiveDigest(database, profileConfigKey);
    return (
      active !== undefined &&
      (!isCanonicallyValid(active, context) ||
        !hasInputOverlap(active, context.input))
    );
  } catch {
    // Preserve a previously valid digest when current validity cannot be read.
    return false;
  }
}

async function readActiveDigest(
  database: Database,
  inputService: DigestInputService,
  profileConfigKey: unknown,
  now: Date,
): Promise<ActiveProfileDigest | null> {
  try {
    const active = await findActiveDigest(database, profileConfigKey);
    if (active === undefined) return null;
    const current = await inputService.readForLifecycle(profileConfigKey, now);
    if (current.kind !== 'active') return null;
    const context = lifecycleContext(current.input, current.canonicalArticles);
    if (
      !context.input.settings.digestEnabled ||
      context.input.articles.length === 0
    )
      return null;
    if (
      !isCanonicallyValid(active, context) ||
      !hasInputOverlap(active, context.input)
    )
      return null;
    const freshness: DigestFreshness =
      active.digestInputIdentity === context.input.digestInputIdentity
        ? 'current'
        : 'older';
    return materializeActiveDigest(
      active,
      context.canonicalArticles,
      freshness,
    );
  } catch {
    // Optional malformed/unavailable AI state fails closed without affecting
    // ordinary canonical Article reads.
    return null;
  }
}

function lifecycleContext(
  input: ResolvedDigestInput,
  canonicalArticles: readonly CanonicalOutwardArticle[],
): LifecycleContext {
  return Object.freeze({ input, canonicalArticles });
}

function isCanonicallyValid(
  active: PersistedSuccessfulDigest,
  context: LifecycleContext,
): boolean {
  const requiredIds = [
    ...active.inputArticleIds,
    ...active.highlights.flatMap((highlight) => highlight.supportingArticleIds),
  ];
  return allPresent(requiredIds, context.canonicalArticles);
}

function hasInputOverlap(
  active: Pick<PersistedSuccessfulDigest, 'inputArticleIds'>,
  input: Pick<ResolvedDigestInput, 'articles'>,
): boolean {
  return hasOverlap(active.inputArticleIds, input.articles);
}

function hasOverlap(
  articleIds: readonly string[],
  articles: readonly Pick<DigestInputArticle, 'articleId'>[],
): boolean {
  const current = new Set(articles.map((article) => article.articleId));
  return articleIds.some((articleId) => current.has(articleId));
}

function allPresent(
  articleIds: readonly string[],
  articles: readonly Pick<CanonicalOutwardArticle, 'articleId'>[],
): boolean {
  const current = new Set(articles.map((article) => article.articleId));
  return articleIds.every((articleId) => current.has(articleId));
}

function materializeActiveDigest(
  active: PersistedSuccessfulDigest,
  canonicalArticles: readonly CanonicalOutwardArticle[],
  freshness: DigestFreshness,
): ActiveProfileDigest {
  const articles = new Map(
    canonicalArticles.map((article) => [article.articleId, article]),
  );
  const highlights = active.highlights.map((highlight) =>
    Object.freeze({
      title: highlight.title,
      explanation: highlight.explanation,
      supportingArticles: Object.freeze(
        highlight.supportingArticleIds.map((articleId) => {
          const article = articles.get(articleId);
          if (article === undefined)
            throw new Error('Active digest support is not canonical.');
          return Object.freeze({
            articleId: article.articleId,
            headline: article.headline,
            sourceDisplayName: article.source.displayName,
            effectiveFeedDate: new Date(article.effectiveFeedDate.getTime()),
            originalUrl: article.originalUrl,
          });
        }),
      ),
    }),
  );
  return Object.freeze({
    generatedAt: new Date(active.generatedAt.getTime()),
    freshness,
    inputArticleCount: active.inputArticleIds.length,
    provider: active.provider,
    model: active.model,
    overview: active.overview,
    highlights: Object.freeze(highlights),
  });
}

function representableUrlContextFacts(
  facts: UrlContextRetrievalFacts | undefined,
):
  | Readonly<{
      urlContextSucceededCount: number;
      urlContextFailedCount: number;
    }>
  | undefined {
  if (facts === undefined) return undefined;
  const failed =
    facts.errorCount +
    facts.paywallCount +
    facts.unsafeCount +
    facts.unknownCount;
  if (!boundedCount(facts.successCount) || !boundedCount(failed))
    return undefined;
  return Object.freeze({
    urlContextSucceededCount: facts.successCount,
    urlContextFailedCount: failed,
  });
}

export function persistedFailureCategory(
  category: DigestEvaluationFailureCategory,
): Exclude<DigestAttemptFailureCategory, 'abandoned'> {
  switch (category) {
    case 'provider_unconfigured':
    case 'provider_dependency_failure':
    case 'lifecycle_state_changed':
      return 'dependency_failure';
    case 'provider_timeout':
      return 'timeout';
    case 'provider_rate_limited':
      return 'rate_limit';
    case 'provider_safety_rejected':
      return 'safety_rejection';
    case 'provider_invalid_response':
      return 'malformed_output';
    case 'provider_transport_failure':
      return 'provider_failure';
  }
}

function skipped(
  claimed: ClaimedDigestAttempt,
  kind: 'skipped_disabled' | 'skipped_no_input' | 'skipped_unchanged',
): DigestEvaluationResult {
  return Object.freeze({
    kind,
    attemptId: claimed.attempt.id,
    claimed: true,
    recoveredStaleAttempt: claimed.recoveredStaleAttempt,
  });
}

function failed(
  claimed: ClaimedDigestAttempt,
  failureCategory: DigestEvaluationFailureCategory,
): DigestEvaluationResult {
  return Object.freeze({
    kind: 'failed',
    attemptId: claimed.attempt.id,
    failureCategory,
    claimed: true,
    recoveredStaleAttempt: claimed.recoveredStaleAttempt,
  });
}

function failedWithoutClaim(
  failureCategory: DigestEvaluationFailureCategory,
): DigestEvaluationResult {
  return Object.freeze({
    kind: 'failed',
    failureCategory,
    claimed: false,
    recoveredStaleAttempt: false,
  });
}

function alreadyRunning(): DigestEvaluationResult {
  return Object.freeze({
    kind: 'already_running',
    claimed: false,
    recoveredStaleAttempt: false,
  });
}

function scheduledSlotClaimed(): DigestEvaluationResult {
  return Object.freeze({
    kind: 'scheduled_slot_claimed',
    claimed: false,
    recoveredStaleAttempt: false,
  });
}

function notFound(): DigestEvaluationResult {
  return Object.freeze({
    kind: 'not_found',
    claimed: false,
    recoveredStaleAttempt: false,
  });
}

function validPositiveMilliseconds(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 600_000)
    throw new TypeError(`${name} must be a positive bounded integer.`);
  return value;
}

function requiredNow(clock: () => Date): Date {
  return requiredDate(clock(), 'Digest lifecycle clock');
}

function requiredDate(value: Date, name: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new TypeError(`${name} is invalid.`);
  return new Date(value.getTime());
}

function boundedCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 20;
}

function isMissingProfileError(error: unknown): boolean {
  return (
    error instanceof ConfigurationValidationError &&
    error.field === 'profile_ai' &&
    error.reason === 'profile_not_found'
  );
}
