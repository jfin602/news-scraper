import type { QueryExecutor } from '../database/database.ts';
import type { ExcludedArticlePersistenceResult } from '../articles/repository.ts';
import type { IncludedArticleProcessingResult } from './included-article-processing.ts';
import type { EndpointConfigurationAggregate } from '../sources/repository.ts';
import { isSourceRssAtomItemAdmitted } from './admission/source-rss-atom-item-filter.ts';
import type { CollectionBlockedDecision } from './decision.ts';
import {
  withEligibleEndpointExecution,
  type EndpointExecutionLockRunner,
} from './execution.ts';
import type {
  HttpFetcher,
  HttpFetcherRequest,
  HttpFetcherResult,
} from './fetchers/http-fetcher.ts';
import type {
  ConditionalRequestValidators,
  RetryClassification,
} from './fetchers/fetcher.ts';
import type { EndpointRunLockBlocked } from './locks/endpoint-run-lock.ts';
import {
  type ArticleLinkPolicyContext,
  type ArticleLinkPolicyDecision,
} from './article-links/policy.ts';
import type {
  ArticleCandidate,
  ArticleNormalizationContext,
  ArticleNormalizationResult,
} from './normalization/article-candidate.ts';
import {
  HtmlListingParser,
  HTML_LISTING_PARSER_VERSION,
} from './parsers/html-listing-parser.ts';
import type {
  CollectionParser,
  ParserAdapterIdentity,
  ParserDiagnosticSummary,
  ParserResult,
} from './parsers/parser.ts';
import type { RawItem } from './raw-item.ts';
import type {
  EffectiveRelevanceConfiguration,
  RelevanceDecision,
} from './relevance/evaluator.ts';
import {
  finalizeCollectionRun,
  startCollectionRun,
  type FinalizeCollectionRunInput,
  type PersistedCollectionRun,
  type CollectionRunProcessingStatus,
  type CollectionRunTriggerKind,
} from './runs/repository.ts';

export interface CollectionRunStore {
  start(input: {
    readonly sourceEndpointId: string;
    readonly executionId: string;
    readonly triggerKind?: CollectionRunTriggerKind;
  }): Promise<PersistedCollectionRun>;
  finalize(
    collectionRunId: string,
    input: FinalizeCollectionRunInput,
  ): Promise<PersistedCollectionRun>;
}

export interface CollectEndpointDependencies {
  readonly lockRunner: EndpointExecutionLockRunner;
  readonly runs: CollectionRunStore;
  readonly fetcher: HttpFetcher;
  readonly rssAtomParser: CollectionParser;
  readonly normalizeArticleCandidate: (
    rawItem: RawItem,
    context: ArticleNormalizationContext,
  ) => ArticleNormalizationResult;
  readonly applyArticleLinkPolicy: (
    candidate: ArticleCandidate,
    context: ArticleLinkPolicyContext,
  ) => ArticleLinkPolicyDecision;
  readonly loadRelevanceConfiguration: () => Promise<EffectiveRelevanceConfiguration>;
  readonly evaluateRelevance: (
    candidate: ArticleCandidate,
    configuration: EffectiveRelevanceConfiguration,
  ) => RelevanceDecision;
  readonly processIncludedArticle: (
    candidate: ArticleCandidate,
    observationTime: Date,
    decision: Extract<RelevanceDecision, { readonly included: true }>,
  ) => Promise<IncludedArticleProcessingResult>;
  readonly persistExcludedArticle: (
    candidate: ArticleCandidate,
    observationTime: Date,
    decision: Extract<RelevanceDecision, { readonly included: false }>,
  ) => Promise<ExcludedArticlePersistenceResult>;
  readonly observationTime: () => Date;
  readonly executionId: () => string;
  readonly triggerKind?: CollectionRunTriggerKind;
  readonly fetchOptions?: Omit<HttpFetcherRequest, 'configuration'>;
}

export type CollectionAttemptOutcome =
  | 'content'
  | 'not_modified'
  | 'network_safety_blocked'
  | 'fetch_failed'
  | 'parser_failed'
  | 'normalization_failed'
  | 'article_link_policy_failed'
  | 'processing_failed';

export interface EndpointCollectionAttemptResult {
  readonly status: 'succeeded' | 'failed';
  readonly outcome: CollectionAttemptOutcome;
  readonly endpointId: string;
  readonly collectionRunId: string;
  readonly executionId: string;
  readonly runStatus: 'succeeded' | 'failed';
  readonly transportStatus: 'not_run' | 'succeeded' | 'not_modified' | 'failed';
  readonly parserStatus: 'not_run' | 'succeeded' | 'failed';
  readonly normalizationStatus: 'not_run' | 'succeeded' | 'failed';
  readonly processingStatus: CollectionRunProcessingStatus;
  readonly rawItemCount: number;
  readonly sourceItemFilteredCount: number;
  readonly normalizedCandidateCount: number;
  readonly normalizationFailureCount: number;
  readonly articleLinkRejectionCount: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly rejectedCount: number;
  readonly excludedCount: number;
  readonly failedCount: number;
  readonly duplicateReviewCreatedCount: number;
  readonly duplicateGroupedCount: number;
  readonly candidates?: readonly ArticleCandidate[];
  readonly reason?: string;
  readonly detail?: string;
  readonly safetyContext?: 'initial' | 'redirect';
  readonly httpStatusCode?: number;
  readonly wireByteCount?: number;
  readonly decompressedByteCount?: number;
  readonly redirectCount?: number;
  readonly elapsedMilliseconds?: number;
  readonly retryClassification?: RetryClassification;
  readonly responseValidators?: ConditionalRequestValidators;
}

export type CollectEndpointResult =
  | CollectionBlockedDecision
  | EndpointRunLockBlocked
  | EndpointCollectionAttemptResult;

/**
 * The single terminal truth for a collector-owned attempt. Persistence and
 * caller-facing results are deliberately projected from this snapshot rather
 * than authored alongside one another.
 */
interface TerminalAttempt {
  readonly outcome: CollectionAttemptOutcome;
  readonly endpointId: string;
  readonly runStatus: 'succeeded' | 'failed';
  readonly transportStatus: EndpointCollectionAttemptResult['transportStatus'];
  readonly parserStatus: EndpointCollectionAttemptResult['parserStatus'];
  readonly parserDiagnostics?: FinalizeCollectionRunInput['parserDiagnostics'];
  readonly normalizationStatus: EndpointCollectionAttemptResult['normalizationStatus'];
  readonly processingStatus: CollectionRunProcessingStatus;
  readonly rawItemCount: number;
  readonly sourceItemFilteredCount: number;
  readonly normalizedCandidateCount: number;
  readonly normalizationFailureCount: number;
  readonly articleLinkRejectionCount: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly rejectedCount: number;
  readonly excludedCount: number;
  readonly failedCount: number;
  readonly duplicateReviewCreatedCount: number;
  readonly duplicateGroupedCount: number;
  readonly error?: Readonly<{ readonly code: string; readonly detail: string }>;
  readonly candidates?: readonly ArticleCandidate[];
  readonly safetyContext?: 'initial' | 'redirect';
  readonly httpStatusCode?: number;
  readonly wireByteCount?: number;
  readonly decompressedByteCount?: number;
  readonly redirectCount?: number;
  readonly elapsedMilliseconds?: number;
  readonly retryClassification?: RetryClassification;
  readonly responseValidators?: ConditionalRequestValidators;
}

export class CollectionRunFinalizationError extends Error {
  readonly attemptedResult: EndpointCollectionAttemptResult;

  constructor(
    attemptedResult: EndpointCollectionAttemptResult,
    cause: unknown,
  ) {
    super('Collection run finalization failed.', { cause });
    this.name = 'CollectionRunFinalizationError';
    this.attemptedResult = attemptedResult;
  }
}

export function createCollectionRunStore(
  executor: QueryExecutor,
): CollectionRunStore {
  return Object.freeze({
    start(input: {
      readonly sourceEndpointId: string;
      readonly executionId: string;
    }) {
      return startCollectionRun(executor, input);
    },
    finalize(collectionRunId: string, input: FinalizeCollectionRunInput) {
      return finalizeCollectionRun(executor, collectionRunId, input);
    },
  });
}

export async function collectEndpoint(
  configuration: EndpointConfigurationAggregate,
  dependencies: CollectEndpointDependencies,
): Promise<CollectEndpointResult> {
  const execution = await withEligibleEndpointExecution(
    configuration,
    dependencies.lockRunner,
    async () => {
      const executionId = dependencies.executionId();
      const running = await dependencies.runs.start({
        sourceEndpointId: configuration.endpoint.id,
        executionId,
        triggerKind: dependencies.triggerKind ?? 'manual',
      });
      const attempt = await executeAttempt(
        configuration,
        running.id,
        dependencies,
      );
      const attemptedResult = resultFromAttempt(running, attempt);

      try {
        const finalized = await dependencies.runs.finalize(
          running.id,
          finalizationFromAttempt(attempt),
        );
        assertFinalizedAttempt(running, attempt, finalized);
        return attemptedResult;
      } catch (error) {
        throw new CollectionRunFinalizationError(attemptedResult, error);
      }
    },
  );

  return execution.status === 'acquired' ? execution.value : execution;
}

async function executeAttempt(
  configuration: EndpointConfigurationAggregate,
  collectionRunId: string,
  dependencies: CollectEndpointDependencies,
): Promise<TerminalAttempt> {
  let fetchResult: HttpFetcherResult;
  try {
    fetchResult = await dependencies.fetcher.fetch({
      ...dependencies.fetchOptions,
      configuration,
      contentPolicy: configuration.endpoint.endpointType,
    });
  } catch {
    return failedDraft(
      configuration.endpoint.id,
      'fetch_failed',
      'failed',
      'not_run',
      'fetch_execution_failed',
      'Feed fetch failed outside its bounded result contract.',
      {},
      'transient',
    );
  }

  if (isSafetyBlock(fetchResult)) {
    return failedDraft(
      configuration.endpoint.id,
      'network_safety_blocked',
      'not_run',
      'not_run',
      fetchResult.reason,
      safetyDetail(fetchResult.reason),
      { safetyContext: fetchResult.context },
    );
  }

  const metadata = fetchMetadata(fetchResult);
  if (fetchResult.outcome === 'failure') {
    return failedDraft(
      configuration.endpoint.id,
      'fetch_failed',
      'failed',
      'not_run',
      fetchResult.reason,
      fetchResult.detail,
      metadata,
      fetchResult.retry,
    );
  }
  if (fetchResult.outcome === 'not_modified') {
    return Object.freeze({
      outcome: 'not_modified',
      endpointId: configuration.endpoint.id,
      runStatus: 'succeeded',
      transportStatus: 'not_modified',
      parserStatus: 'not_run',
      rawItemCount: 0,
      ...normalizationNotRun,
      ...processingNotRun,
      ...metadata,
    });
  }

  const parser = parserForEndpoint(configuration, dependencies);
  let parserResult: ParserResult;
  if (parser === undefined) {
    parserResult = Object.freeze({
      ok: false,
      reason: 'unsupported_feed',
      detail: 'Configured endpoint type has no parser adapter.',
    });
  } else {
    try {
      parserResult = parser.parser.parse({
        content: fetchResult.content,
        mediaType: fetchResult.mediaType,
      });
    } catch {
      return failedDraft(
        configuration.endpoint.id,
        'parser_failed',
        'succeeded',
        'failed',
        'parser_execution_failed',
        'Feed parser failed outside its bounded result contract.',
        metadata,
        'permanent',
        parserDiagnosticsFor(parser),
      );
    }
  }

  if (!parserResult.ok) {
    const reason =
      parser === undefined ? 'unsupported_endpoint_type' : parserResult.reason;
    return failedDraft(
      configuration.endpoint.id,
      'parser_failed',
      'succeeded',
      'failed',
      reason,
      parserResult.detail,
      metadata,
      'permanent',
      parserDiagnosticsFor(parser, parserResult),
    );
  }

  const parserDiagnostics = parserDiagnosticsFor(parser, parserResult);
  const rawItems = immutableRawItems(parserResult.items);
  const normalizationContext = Object.freeze({
    sourceId: configuration.source.id,
    sourceEndpointId: configuration.endpoint.id,
    collectionRunId,
    terminalFeedUrl: fetchResult.finalUrl,
  });
  const normalizedCandidates: ArticleCandidate[] = [];
  let sourceItemFilteredCount = 0;
  let normalizationFailureCount = 0;
  try {
    for (const rawItem of rawItems) {
      if (
        configuration.endpoint.endpointType === 'rss_atom' &&
        !isSourceRssAtomItemAdmitted(rawItem, configuration.source)
      ) {
        sourceItemFilteredCount += 1;
        continue;
      }
      const normalization = dependencies.normalizeArticleCandidate(
        rawItem,
        normalizationContext,
      );
      if (normalization.ok) normalizedCandidates.push(normalization.candidate);
      else normalizationFailureCount += 1;
    }
  } catch {
    return normalizationExecutionFailedDraft(
      configuration.endpoint.id,
      rawItems.length,
      sourceItemFilteredCount,
      metadata,
      parserDiagnostics,
    );
  }

  const policyContext = Object.freeze({
    sourceDomainRules: configuration.sourceDomainRules,
    endpointDomainRules: configuration.endpointDomainRules,
  });
  const acceptedCandidates: ArticleCandidate[] = [];
  let articleLinkRejectionCount = 0;
  try {
    for (const candidate of normalizedCandidates) {
      const decision = dependencies.applyArticleLinkPolicy(
        candidate,
        policyContext,
      );
      if (decision.accepted) acceptedCandidates.push(decision.candidate);
      else articleLinkRejectionCount += 1;
    }
  } catch {
    return articleLinkPolicyExecutionFailedDraft(
      configuration.endpoint.id,
      rawItems.length,
      sourceItemFilteredCount,
      normalizedCandidates.length,
      normalizationFailureCount,
      articleLinkRejectionCount,
      metadata,
      parserDiagnostics,
    );
  }

  const candidates = immutableArticleCandidates(acceptedCandidates);
  const processing = await processCandidates(
    candidates,
    articleLinkRejectionCount,
    dependencies,
  );
  const processingFailed = processing.failure !== undefined;
  return Object.freeze({
    outcome: processingFailed ? 'processing_failed' : 'content',
    endpointId: configuration.endpoint.id,
    runStatus: processingFailed ? 'failed' : 'succeeded',
    transportStatus: 'succeeded',
    parserStatus: 'succeeded',
    ...(parserDiagnostics === undefined ? {} : { parserDiagnostics }),
    rawItemCount: rawItems.length,
    sourceItemFilteredCount,
    normalizationStatus: 'succeeded',
    normalizedCandidateCount: normalizedCandidates.length,
    normalizationFailureCount,
    articleLinkRejectionCount,
    ...processing.accounting,
    candidates,
    ...(processing.failure === undefined
      ? {}
      : { error: processing.failureError }),
    ...(processingFailed ? { retryClassification: 'permanent' as const } : {}),
    ...metadata,
  });
}

interface ProcessingAccounting {
  readonly processingStatus: 'succeeded' | 'failed';
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly rejectedCount: number;
  readonly excludedCount: number;
  readonly failedCount: number;
  readonly duplicateReviewCreatedCount: number;
  readonly duplicateGroupedCount: number;
}

interface ProcessingResult {
  readonly accounting: ProcessingAccounting;
  readonly failure?: Readonly<{ reason: string; detail: string }>;
  readonly failureError?: Readonly<{ code: string; detail: string }>;
}

async function processCandidates(
  candidates: readonly ArticleCandidate[],
  articleLinkRejectionCount: number,
  dependencies: CollectEndpointDependencies,
): Promise<ProcessingResult> {
  const counters = {
    createdCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    rejectedCount: articleLinkRejectionCount,
    excludedCount: 0,
    failedCount: 0,
    duplicateReviewCreatedCount: 0,
    duplicateGroupedCount: 0,
  };

  if (candidates.length === 0) {
    return Object.freeze({
      accounting: Object.freeze({ processingStatus: 'succeeded', ...counters }),
    });
  }

  let relevanceConfiguration: EffectiveRelevanceConfiguration;
  try {
    relevanceConfiguration = await dependencies.loadRelevanceConfiguration();
    if (
      relevanceConfiguration === null ||
      typeof relevanceConfiguration !== 'object' ||
      !Array.isArray(relevanceConfiguration.rules)
    ) {
      throw new TypeError('Invalid Relevance configuration snapshot.');
    }
  } catch {
    return processingFailure(
      counters,
      candidates.length,
      'relevance_configuration_load_execution_failed',
      'Relevance configuration loading failed outside its bounded snapshot contract.',
    );
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    let relevance: RelevanceDecision;
    try {
      relevance = dependencies.evaluateRelevance(
        candidate,
        relevanceConfiguration,
      );
      if (
        relevance === null ||
        typeof relevance !== 'object' ||
        typeof relevance.included !== 'boolean'
      ) {
        throw new TypeError('Invalid Relevance decision.');
      }
    } catch {
      return processingFailure(
        counters,
        candidates.length - index,
        'relevance_execution_failed',
        'Relevance evaluation failed outside its bounded decision contract.',
      );
    }

    let observationTime: Date;
    try {
      observationTime = dependencies.observationTime();
      if (
        !(observationTime instanceof Date) ||
        Number.isNaN(observationTime.getTime())
      ) {
        throw new TypeError('Invalid Article observation time.');
      }
    } catch {
      return processingFailure(
        counters,
        candidates.length - index,
        'observation_clock_execution_failed',
        'Article observation clock failed outside its bounded contract.',
      );
    }

    if (!relevance.included) {
      let persistence: ExcludedArticlePersistenceResult;
      try {
        persistence = await dependencies.persistExcludedArticle(
          candidate,
          observationTime,
          relevance,
        );
        if (!isExcludedArticlePersistenceResult(persistence)) {
          throw new TypeError('Invalid excluded Article persistence result.');
        }
      } catch {
        return processingFailure(
          counters,
          candidates.length - index,
          'relevance_exclusion_persistence_execution_failed',
          'Relevance exclusion persistence failed outside its bounded result contract.',
        );
      }

      if (persistence.outcome === 'excluded') counters.excludedCount += 1;
      else counters.failedCount += 1;
      continue;
    }

    let persistence: IncludedArticleProcessingResult;
    try {
      persistence = await dependencies.processIncludedArticle(
        relevance.candidate,
        observationTime,
        relevance,
      );
    } catch {
      return processingFailure(
        counters,
        candidates.length - index,
        'article_persistence_execution_failed',
        'Article persistence failed outside its bounded result contract.',
      );
    }

    if (!isIncludedArticleProcessingResult(persistence)) {
      return processingFailure(
        counters,
        candidates.length - index,
        'included_article_processing_result_invalid',
        'Included Article processing returned invalid duplicate effects.',
      );
    }

    if (persistence.outcome !== 'failed') {
      counters.duplicateReviewCreatedCount +=
        persistence.duplicateReviewCreatedCount;
      counters.duplicateGroupedCount += persistence.duplicateGroupedCount;
    }
    if (persistence.outcome === 'failed') {
      counters.failedCount += 1;
    } else if (persistence.outcome === 'created') {
      counters.createdCount += 1;
    } else if (persistence.outcome === 'updated') {
      counters.updatedCount += 1;
    } else {
      counters.unchangedCount += 1;
    }
  }

  return Object.freeze({
    accounting: Object.freeze({ processingStatus: 'succeeded', ...counters }),
  });
}

function isExcludedArticlePersistenceResult(
  value: unknown,
): value is ExcludedArticlePersistenceResult {
  if (value === null || typeof value !== 'object') return false;
  const outcome = Reflect.get(value, 'outcome');
  if (outcome === 'excluded') return true;
  if (outcome !== 'failed') return false;
  const reason = Reflect.get(value, 'reason');
  return reason === 'identity_conflict' || reason === 'provenance_mismatch';
}

function isIncludedArticleProcessingResult(
  value: unknown,
): value is IncludedArticleProcessingResult {
  if (value === null || typeof value !== 'object') return false;
  const outcome = Reflect.get(value, 'outcome');
  if (
    outcome === 'created' ||
    outcome === 'updated' ||
    outcome === 'unchanged'
  ) {
    return (
      isEffectCount(Reflect.get(value, 'duplicateReviewCreatedCount')) &&
      isEffectCount(Reflect.get(value, 'duplicateGroupedCount'))
    );
  }
  if (outcome !== 'failed') return false;
  const reason = Reflect.get(value, 'reason');
  return reason === 'identity_conflict' || reason === 'provenance_mismatch';
}

function isEffectCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function processingFailure(
  counters: Omit<ProcessingAccounting, 'processingStatus'>,
  unaccountedCandidateCount: number,
  reason: string,
  detail: string,
): ProcessingResult {
  const failure = Object.freeze({ reason, detail });
  return Object.freeze({
    accounting: Object.freeze({
      processingStatus: 'failed',
      ...counters,
      failedCount: counters.failedCount + unaccountedCandidateCount,
    }),
    failure,
    failureError: Object.freeze({ code: reason, detail }),
  });
}

function normalizationExecutionFailedDraft(
  endpointId: string,
  rawItemCount: number,
  sourceItemFilteredCount: number,
  metadata: ReturnType<typeof fetchMetadata>,
  parserDiagnostics: FinalizeCollectionRunInput['parserDiagnostics'],
): TerminalAttempt {
  const reason = 'normalization_execution_failed';
  const detail =
    'Article normalization failed outside its bounded result contract.';
  return Object.freeze({
    outcome: 'normalization_failed',
    endpointId,
    runStatus: 'failed',
    transportStatus: 'succeeded',
    parserStatus: 'succeeded',
    ...(parserDiagnostics === undefined ? {} : { parserDiagnostics }),
    normalizationStatus: 'failed',
    rawItemCount,
    sourceItemFilteredCount,
    normalizedCandidateCount: 0,
    normalizationFailureCount: 0,
    articleLinkRejectionCount: 0,
    ...processingNotRun,
    error: Object.freeze({ code: reason, detail }),
    retryClassification: 'permanent',
    ...metadata,
  });
}

function articleLinkPolicyExecutionFailedDraft(
  endpointId: string,
  rawItemCount: number,
  sourceItemFilteredCount: number,
  normalizedCandidateCount: number,
  normalizationFailureCount: number,
  articleLinkRejectionCount: number,
  metadata: ReturnType<typeof fetchMetadata>,
  parserDiagnostics: FinalizeCollectionRunInput['parserDiagnostics'],
): TerminalAttempt {
  const reason = 'article_link_policy_execution_failed';
  const detail =
    'Article-link policy failed outside its bounded decision contract.';
  return Object.freeze({
    outcome: 'article_link_policy_failed',
    endpointId,
    runStatus: 'failed',
    transportStatus: 'succeeded',
    parserStatus: 'succeeded',
    ...(parserDiagnostics === undefined ? {} : { parserDiagnostics }),
    normalizationStatus: 'succeeded',
    rawItemCount,
    sourceItemFilteredCount,
    normalizedCandidateCount,
    normalizationFailureCount,
    articleLinkRejectionCount,
    ...processingNotRun,
    error: Object.freeze({ code: reason, detail }),
    retryClassification: 'permanent',
    ...metadata,
  });
}

function failedDraft(
  endpointId: string,
  outcome: Extract<
    CollectionAttemptOutcome,
    `${string}failed` | 'network_safety_blocked'
  >,
  transportStatus: 'not_run' | 'succeeded' | 'failed',
  parserStatus: 'not_run' | 'failed',
  reason: string,
  detail: string,
  metadata: Partial<
    Pick<
      EndpointCollectionAttemptResult,
      | 'safetyContext'
      | 'httpStatusCode'
      | 'wireByteCount'
      | 'decompressedByteCount'
      | 'redirectCount'
      | 'elapsedMilliseconds'
      | 'responseValidators'
    >
  > = {},
  retryClassification: RetryClassification = 'permanent',
  parserDiagnostics?: FinalizeCollectionRunInput['parserDiagnostics'],
): TerminalAttempt {
  return Object.freeze({
    outcome,
    endpointId,
    runStatus: 'failed',
    transportStatus,
    parserStatus,
    ...(parserDiagnostics === undefined ? {} : { parserDiagnostics }),
    rawItemCount: 0,
    ...normalizationNotRun,
    ...processingNotRun,
    error: Object.freeze({ code: reason, detail }),
    retryClassification,
    ...metadata,
  });
}

function resultFromAttempt(
  running: PersistedCollectionRun,
  attempt: TerminalAttempt,
): EndpointCollectionAttemptResult {
  return Object.freeze({
    status: attempt.runStatus,
    outcome: attempt.outcome,
    endpointId: attempt.endpointId,
    collectionRunId: running.id,
    executionId: running.executionId,
    runStatus: attempt.runStatus,
    transportStatus: attempt.transportStatus,
    parserStatus: attempt.parserStatus,
    normalizationStatus: attempt.normalizationStatus,
    processingStatus: attempt.processingStatus,
    rawItemCount: attempt.rawItemCount,
    sourceItemFilteredCount: attempt.sourceItemFilteredCount,
    normalizedCandidateCount: attempt.normalizedCandidateCount,
    normalizationFailureCount: attempt.normalizationFailureCount,
    articleLinkRejectionCount: attempt.articleLinkRejectionCount,
    createdCount: attempt.createdCount,
    updatedCount: attempt.updatedCount,
    unchangedCount: attempt.unchangedCount,
    rejectedCount: attempt.rejectedCount,
    excludedCount: attempt.excludedCount,
    failedCount: attempt.failedCount,
    duplicateReviewCreatedCount: attempt.duplicateReviewCreatedCount,
    duplicateGroupedCount: attempt.duplicateGroupedCount,
    ...(attempt.candidates === undefined
      ? {}
      : { candidates: attempt.candidates }),
    ...(attempt.error === undefined
      ? {}
      : { reason: attempt.error.code, detail: attempt.error.detail }),
    ...(attempt.safetyContext === undefined
      ? {}
      : { safetyContext: attempt.safetyContext }),
    ...(attempt.httpStatusCode === undefined
      ? {}
      : { httpStatusCode: attempt.httpStatusCode }),
    ...(attempt.wireByteCount === undefined
      ? {}
      : { wireByteCount: attempt.wireByteCount }),
    ...(attempt.decompressedByteCount === undefined
      ? {}
      : { decompressedByteCount: attempt.decompressedByteCount }),
    ...(attempt.redirectCount === undefined
      ? {}
      : { redirectCount: attempt.redirectCount }),
    ...(attempt.elapsedMilliseconds === undefined
      ? {}
      : { elapsedMilliseconds: attempt.elapsedMilliseconds }),
    ...(attempt.retryClassification === undefined
      ? {}
      : { retryClassification: attempt.retryClassification }),
    ...(attempt.responseValidators === undefined
      ? {}
      : { responseValidators: attempt.responseValidators }),
  });
}

function finalizationFromAttempt(
  attempt: TerminalAttempt,
): FinalizeCollectionRunInput {
  return Object.freeze({
    runStatus: attempt.runStatus,
    transportStatus: attempt.transportStatus,
    parserStatus: attempt.parserStatus,
    ...(attempt.parserDiagnostics === undefined
      ? {}
      : { parserDiagnostics: attempt.parserDiagnostics }),
    normalizationStatus: attempt.normalizationStatus,
    processingStatus: attempt.processingStatus,
    ...(attempt.httpStatusCode === undefined
      ? {}
      : { httpStatusCode: attempt.httpStatusCode }),
    ...(attempt.wireByteCount === undefined
      ? {}
      : { wireByteCount: attempt.wireByteCount }),
    ...(attempt.decompressedByteCount === undefined
      ? {}
      : { decompressedByteCount: attempt.decompressedByteCount }),
    ...(attempt.redirectCount === undefined
      ? {}
      : { redirectCount: attempt.redirectCount }),
    ...(attempt.elapsedMilliseconds === undefined
      ? {}
      : { transportElapsedMilliseconds: attempt.elapsedMilliseconds }),
    ...(attempt.retryClassification === undefined
      ? {}
      : { retryClassification: attempt.retryClassification }),
    outcomeCode: attempt.outcome,
    ...(attempt.responseValidators === undefined
      ? {}
      : { responseValidators: attempt.responseValidators }),
    rawItemCount: attempt.rawItemCount,
    sourceItemFilteredCount: attempt.sourceItemFilteredCount,
    normalizedCandidateCount: attempt.normalizedCandidateCount,
    normalizationFailureCount: attempt.normalizationFailureCount,
    articleLinkRejectionCount: attempt.articleLinkRejectionCount,
    createdCount: attempt.createdCount,
    updatedCount: attempt.updatedCount,
    unchangedCount: attempt.unchangedCount,
    rejectedCount: attempt.rejectedCount,
    excludedCount: attempt.excludedCount,
    failedCount: attempt.failedCount,
    duplicateReviewCreatedCount: attempt.duplicateReviewCreatedCount,
    duplicateGroupedCount: attempt.duplicateGroupedCount,
    ...(attempt.error === undefined ? {} : { error: attempt.error }),
  });
}

function assertFinalizedAttempt(
  running: PersistedCollectionRun,
  attempt: TerminalAttempt,
  finalized: PersistedCollectionRun,
): void {
  const expected = finalizationFromAttempt(attempt);
  const parserDiagnostics = expected.parserDiagnostics;
  if (
    running.runStatus !== 'running' ||
    finalized.id !== running.id ||
    finalized.sourceEndpointId !== attempt.endpointId ||
    finalized.executionId !== running.executionId ||
    finalized.runStatus === 'running' ||
    finalized.finishedAt === undefined ||
    finalized.runStatus !== expected.runStatus ||
    finalized.transportStatus !== expected.transportStatus ||
    finalized.parserStatus !== expected.parserStatus ||
    finalized.parserKind !== parserDiagnostics?.kind ||
    finalized.parserVersion !== parserDiagnostics?.version ||
    finalized.htmlListingProfileRevision !==
      parserDiagnostics?.htmlListingProfileRevision ||
    finalized.parserItemFailureCount !==
      (parserDiagnostics?.itemFailureCount ?? 0) ||
    finalized.parserDiagnosticCode !== parserDiagnostics?.code ||
    finalized.parserDiagnosticDetail !== parserDiagnostics?.detail ||
    finalized.normalizationStatus !== expected.normalizationStatus ||
    finalized.processingStatus !== expected.processingStatus ||
    finalized.httpStatusCode !== expected.httpStatusCode ||
    finalized.wireByteCount !== expected.wireByteCount ||
    finalized.decompressedByteCount !== expected.decompressedByteCount ||
    finalized.redirectCount !== expected.redirectCount ||
    finalized.transportElapsedMilliseconds !==
      expected.transportElapsedMilliseconds ||
    finalized.retryClassification !== expected.retryClassification ||
    finalized.outcomeCode !== expected.outcomeCode ||
    finalized.responseEtag !== expected.responseValidators?.etag ||
    finalized.responseLastModified !==
      expected.responseValidators?.lastModified ||
    finalized.rawItemCount !== expected.rawItemCount ||
    finalized.sourceItemFilteredCount !== expected.sourceItemFilteredCount ||
    finalized.normalizedCandidateCount !== expected.normalizedCandidateCount ||
    finalized.normalizationFailureCount !==
      expected.normalizationFailureCount ||
    finalized.articleLinkRejectionCount !==
      expected.articleLinkRejectionCount ||
    finalized.createdCount !== expected.createdCount ||
    finalized.updatedCount !== expected.updatedCount ||
    finalized.unchangedCount !== expected.unchangedCount ||
    finalized.rejectedCount !== expected.rejectedCount ||
    finalized.excludedCount !== expected.excludedCount ||
    finalized.failedCount !== expected.failedCount ||
    finalized.duplicateReviewCreatedCount !==
      expected.duplicateReviewCreatedCount ||
    finalized.duplicateGroupedCount !== expected.duplicateGroupedCount ||
    finalized.errorCode !== expected.error?.code ||
    finalized.errorDetail !== expected.error?.detail
  ) {
    throw new Error('Collection run finalization returned inconsistent state.');
  }
}

const normalizationNotRun = Object.freeze({
  normalizationStatus: 'not_run' as const,
  sourceItemFilteredCount: 0,
  normalizedCandidateCount: 0,
  normalizationFailureCount: 0,
  articleLinkRejectionCount: 0,
});

const processingNotRun = Object.freeze({
  processingStatus: 'not_run' as const,
  createdCount: 0,
  updatedCount: 0,
  unchangedCount: 0,
  rejectedCount: 0,
  excludedCount: 0,
  failedCount: 0,
  duplicateReviewCreatedCount: 0,
  duplicateGroupedCount: 0,
});

interface ParserSelection {
  readonly parser: CollectionParser;
  readonly adapter: ParserAdapterIdentity;
  readonly htmlListingProfileRevision?: number;
}

const RSS_ATOM_ADAPTER: ParserAdapterIdentity = Object.freeze({
  kind: 'rss_atom',
  version: '1',
});

function parserForEndpoint(
  configuration: EndpointConfigurationAggregate,
  dependencies: Pick<CollectEndpointDependencies, 'rssAtomParser'>,
): ParserSelection | undefined {
  if (configuration.endpoint.endpointType === 'rss_atom') {
    return Object.freeze({
      parser: dependencies.rssAtomParser,
      adapter: RSS_ATOM_ADAPTER,
    });
  }
  if (configuration.endpoint.endpointType === 'html_listing') {
    const profile = configuration.endpoint.htmlListingProfile;
    const revision = configuration.endpoint.htmlListingProfileRevision;
    if (profile === undefined || revision === undefined) return undefined;
    return Object.freeze({
      parser: new HtmlListingParser(profile),
      adapter: Object.freeze({
        kind: 'html_listing',
        version: HTML_LISTING_PARSER_VERSION,
      }),
      htmlListingProfileRevision: revision,
    });
  }
  return undefined;
}

function parserDiagnosticsFor(
  selection: ParserSelection | undefined,
  result?: ParserResult,
): FinalizeCollectionRunInput['parserDiagnostics'] {
  if (selection === undefined || selection.adapter.kind !== 'html_listing')
    return undefined;
  const adapter = selection.adapter;
  const summary = result?.diagnostics;
  const sample = summary?.samples[0];
  const terminalFailure = result !== undefined && !result.ok;
  const itemFailureCount = parserItemFailureCount(summary);
  const diagnostic = terminalFailure
    ? { code: result.reason, detail: result.detail }
    : sample;
  return Object.freeze({
    kind: adapter.kind,
    version: adapter.version,
    ...(selection.htmlListingProfileRevision === undefined
      ? {}
      : { htmlListingProfileRevision: selection.htmlListingProfileRevision }),
    ...(itemFailureCount === 0 ? {} : { itemFailureCount }),
    ...(diagnostic === undefined
      ? {}
      : { code: diagnostic.code, detail: diagnostic.detail }),
  });
}

function parserItemFailureCount(
  summary: ParserDiagnosticSummary | undefined,
): number {
  if (summary === undefined) return 0;
  const count = summary.rejectedItemCount + summary.malformedOptionalFieldCount;
  return Number.isSafeInteger(count) && count >= 0 && count <= 250
    ? count
    : 250;
}

function fetchMetadata(
  result: Exclude<HttpFetcherResult, { readonly status: 'blocked' }>,
): Pick<
  EndpointCollectionAttemptResult,
  | 'wireByteCount'
  | 'decompressedByteCount'
  | 'redirectCount'
  | 'elapsedMilliseconds'
> & {
  readonly httpStatusCode?: number;
  readonly responseValidators?: ConditionalRequestValidators;
} {
  const httpStatusCode = result.metrics.hops.at(-1)?.httpStatus;
  return Object.freeze({
    wireByteCount: result.metrics.wireBytes,
    decompressedByteCount: result.metrics.decompressedBytes,
    redirectCount: result.redirectCount,
    elapsedMilliseconds: result.metrics.elapsedMilliseconds,
    ...(!('response' in result) ||
    result.response === undefined ||
    (result.response.etag === undefined &&
      result.response.lastModified === undefined)
      ? {}
      : {
          responseValidators: Object.freeze({
            ...(result.response.etag === undefined
              ? {}
              : { etag: result.response.etag }),
            ...(result.response.lastModified === undefined
              ? {}
              : { lastModified: result.response.lastModified }),
          }),
        }),
    ...(httpStatusCode === undefined ? {} : { httpStatusCode }),
  });
}

function isSafetyBlock(
  result: HttpFetcherResult,
): result is Extract<HttpFetcherResult, { readonly status: 'blocked' }> {
  return 'status' in result && result.status === 'blocked';
}

function immutableRawItems(items: readonly RawItem[]): readonly RawItem[] {
  return Object.freeze(
    items.map((item) =>
      Object.freeze({
        ...item,
        ...(item.categories === undefined
          ? {}
          : { categories: Object.freeze([...item.categories]) }),
        ...(item.diagnostics === undefined
          ? {}
          : { diagnostics: Object.freeze({ ...item.diagnostics }) }),
      }),
    ),
  );
}

function immutableArticleCandidates(
  candidates: readonly ArticleCandidate[],
): readonly ArticleCandidate[] {
  return Object.freeze(
    candidates.map((candidate) =>
      Object.freeze({
        ...candidate,
        publishedAt: Object.freeze({ ...candidate.publishedAt }),
        updatedAt: Object.freeze({ ...candidate.updatedAt }),
        provenance: Object.freeze({ ...candidate.provenance }),
        ...(candidate.sourceCategories === undefined
          ? {}
          : {
              sourceCategories: Object.freeze([...candidate.sourceCategories]),
            }),
      }),
    ),
  );
}

function safetyDetail(reason: string): string {
  return `Destination safety rejected the collection request (${reason}).`;
}
