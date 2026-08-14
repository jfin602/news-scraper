import type { QueryExecutor } from '../database/database.ts';
import type {
  ArticlePersistenceResult,
  ExcludedArticlePersistenceResult,
} from '../articles/repository.ts';
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
import type { FeedParser, ParserResult } from './parsers/parser.ts';
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
  readonly rssAtomParser: FeedParser;
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
  readonly persistArticle: (
    candidate: ArticleCandidate,
    observationTime: Date,
    decision: Extract<RelevanceDecision, { readonly included: true }>,
  ) => Promise<ArticlePersistenceResult>;
  readonly processIncludedArticle?: (
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

interface AttemptDraft {
  readonly result: Omit<
    EndpointCollectionAttemptResult,
    'collectionRunId' | 'executionId'
  >;
  readonly finalization: FinalizeCollectionRunInput;
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
      const draft = await executeAttempt(
        configuration,
        running.id,
        dependencies,
      );
      const attemptedResult = resultFromDraft(running, draft);

      try {
        const finalized = await dependencies.runs.finalize(
          running.id,
          draft.finalization,
        );
        return resultFromFinalized(attemptedResult, finalized);
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
): Promise<AttemptDraft> {
  let fetchResult: HttpFetcherResult;
  try {
    fetchResult = await dependencies.fetcher.fetch({
      configuration,
      ...dependencies.fetchOptions,
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
      result: Object.freeze({
        status: 'succeeded',
        outcome: 'not_modified',
        endpointId: configuration.endpoint.id,
        runStatus: 'succeeded',
        transportStatus: 'not_modified',
        parserStatus: 'not_run',
        rawItemCount: 0,
        ...normalizationNotRun,
        ...processingNotRun,
        ...metadata,
      }),
      finalization: Object.freeze({
        runStatus: 'succeeded',
        transportStatus: 'not_modified',
        parserStatus: 'not_run',
        rawItemCount: 0,
        ...normalizationNotRun,
        ...processingNotRun,
        ...persistenceMetadata(metadata),
        outcomeCode: 'not_modified',
      }),
    });
  }

  const parser = parserForEndpoint(
    configuration.endpoint.endpointType,
    dependencies.rssAtomParser,
  );
  let parserResult: ParserResult;
  if (parser === undefined) {
    parserResult = Object.freeze({
      ok: false,
      reason: 'unsupported_feed',
      detail: 'Configured endpoint type has no parser adapter.',
    });
  } else {
    try {
      parserResult = parser.parse({
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
    );
  }

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
        !isSourceRssAtomItemAdmitted(
          rawItem,
          configuration.source.rssAtomAdmissionPhrases,
        )
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
    result: Object.freeze({
      status: processingFailed ? 'failed' : 'succeeded',
      outcome: processingFailed ? 'processing_failed' : 'content',
      endpointId: configuration.endpoint.id,
      runStatus: processingFailed ? 'failed' : 'succeeded',
      transportStatus: 'succeeded',
      parserStatus: 'succeeded',
      rawItemCount: rawItems.length,
      sourceItemFilteredCount,
      normalizationStatus: 'succeeded',
      normalizedCandidateCount: normalizedCandidates.length,
      normalizationFailureCount,
      articleLinkRejectionCount,
      ...processing.accounting,
      candidates,
      ...(processing.failure === undefined ? {} : processing.failure),
      ...(processingFailed
        ? { retryClassification: 'permanent' as const }
        : {}),
      ...metadata,
    }),
    finalization: Object.freeze({
      runStatus: processingFailed ? 'failed' : 'succeeded',
      transportStatus: 'succeeded',
      parserStatus: 'succeeded',
      rawItemCount: rawItems.length,
      sourceItemFilteredCount,
      normalizationStatus: 'succeeded',
      normalizedCandidateCount: normalizedCandidates.length,
      normalizationFailureCount,
      articleLinkRejectionCount,
      ...processing.accounting,
      ...persistenceMetadata(metadata),
      outcomeCode: processingFailed ? 'processing_failed' : 'content',
      ...(processingFailed
        ? { retryClassification: 'permanent' as const }
        : {}),
      ...(processing.failure === undefined
        ? {}
        : { error: processing.failureError }),
    }),
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

    let persistence: ArticlePersistenceResult | IncludedArticleProcessingResult;
    try {
      persistence = await (
        dependencies.processIncludedArticle ?? dependencies.persistArticle
      )(relevance.candidate, observationTime, relevance);
      if (!isArticlePersistenceResult(persistence)) {
        throw new TypeError('Invalid Article persistence result.');
      }
    } catch {
      return processingFailure(
        counters,
        candidates.length - index,
        'article_persistence_execution_failed',
        'Article persistence failed outside its bounded result contract.',
      );
    }

    if (persistence.outcome !== 'failed') {
      try {
        const effects = includedProcessingEffects(persistence);
        counters.duplicateReviewCreatedCount +=
          effects.duplicateReviewCreatedCount;
        counters.duplicateGroupedCount += effects.duplicateGroupedCount;
      } catch {
        return processingFailure(
          counters,
          candidates.length - index,
          'included_article_processing_result_invalid',
          'Included Article processing returned invalid duplicate effects.',
        );
      }
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

function isArticlePersistenceResult(
  value: unknown,
): value is ArticlePersistenceResult {
  if (value === null || typeof value !== 'object') return false;
  const outcome = Reflect.get(value, 'outcome');
  if (
    outcome === 'created' ||
    outcome === 'updated' ||
    outcome === 'unchanged'
  ) {
    return true;
  }
  if (outcome !== 'failed') return false;
  const reason = Reflect.get(value, 'reason');
  return reason === 'identity_conflict' || reason === 'provenance_mismatch';
}

function includedProcessingEffects(
  value: ArticlePersistenceResult | IncludedArticleProcessingResult,
): {
  readonly duplicateReviewCreatedCount: number;
  readonly duplicateGroupedCount: number;
} {
  const duplicateReviewCreatedCount = Reflect.get(
    value,
    'duplicateReviewCreatedCount',
  );
  const duplicateGroupedCount = Reflect.get(value, 'duplicateGroupedCount');
  return {
    duplicateReviewCreatedCount:
      duplicateReviewCreatedCount === undefined
        ? 0
        : requiredEffectCount(duplicateReviewCreatedCount),
    duplicateGroupedCount:
      duplicateGroupedCount === undefined
        ? 0
        : requiredEffectCount(duplicateGroupedCount),
  };
}

function requiredEffectCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('Invalid included Article effect count.');
  }
  return value;
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
): AttemptDraft {
  const reason = 'normalization_execution_failed';
  const detail =
    'Article normalization failed outside its bounded result contract.';
  return Object.freeze({
    result: Object.freeze({
      status: 'failed',
      outcome: 'normalization_failed',
      endpointId,
      runStatus: 'failed',
      transportStatus: 'succeeded',
      parserStatus: 'succeeded',
      normalizationStatus: 'failed',
      rawItemCount,
      sourceItemFilteredCount,
      normalizedCandidateCount: 0,
      normalizationFailureCount: 0,
      articleLinkRejectionCount: 0,
      ...processingNotRun,
      reason,
      detail,
      retryClassification: 'permanent',
      ...metadata,
    }),
    finalization: Object.freeze({
      runStatus: 'failed',
      transportStatus: 'succeeded',
      parserStatus: 'succeeded',
      normalizationStatus: 'failed',
      rawItemCount,
      sourceItemFilteredCount,
      normalizedCandidateCount: 0,
      normalizationFailureCount: 0,
      articleLinkRejectionCount: 0,
      ...processingNotRun,
      ...persistenceMetadata(metadata),
      outcomeCode: 'normalization_failed',
      retryClassification: 'permanent',
      error: Object.freeze({ code: reason, detail }),
    }),
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
): AttemptDraft {
  const reason = 'article_link_policy_execution_failed';
  const detail =
    'Article-link policy failed outside its bounded decision contract.';
  return Object.freeze({
    result: Object.freeze({
      status: 'failed',
      outcome: 'article_link_policy_failed',
      endpointId,
      runStatus: 'failed',
      transportStatus: 'succeeded',
      parserStatus: 'succeeded',
      normalizationStatus: 'succeeded',
      rawItemCount,
      sourceItemFilteredCount,
      normalizedCandidateCount,
      normalizationFailureCount,
      articleLinkRejectionCount,
      ...processingNotRun,
      reason,
      detail,
      retryClassification: 'permanent',
      ...metadata,
    }),
    finalization: Object.freeze({
      runStatus: 'failed',
      transportStatus: 'succeeded',
      parserStatus: 'succeeded',
      normalizationStatus: 'succeeded',
      rawItemCount,
      sourceItemFilteredCount,
      normalizedCandidateCount,
      normalizationFailureCount,
      articleLinkRejectionCount,
      ...processingNotRun,
      ...persistenceMetadata(metadata),
      outcomeCode: 'article_link_policy_failed',
      retryClassification: 'permanent',
      error: Object.freeze({ code: reason, detail }),
    }),
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
    >
  > = {},
  retryClassification: RetryClassification = 'permanent',
): AttemptDraft {
  return Object.freeze({
    result: Object.freeze({
      status: 'failed',
      outcome,
      endpointId,
      runStatus: 'failed',
      transportStatus,
      parserStatus,
      rawItemCount: 0,
      ...normalizationNotRun,
      ...processingNotRun,
      reason,
      detail,
      retryClassification,
      ...metadata,
    }),
    finalization: Object.freeze({
      runStatus: 'failed',
      transportStatus,
      parserStatus,
      rawItemCount: 0,
      ...normalizationNotRun,
      ...processingNotRun,
      ...persistenceMetadata(metadata),
      outcomeCode: outcome,
      retryClassification,
      error: Object.freeze({ code: reason, detail }),
    }),
  });
}

function resultFromDraft(
  running: PersistedCollectionRun,
  draft: AttemptDraft,
): EndpointCollectionAttemptResult {
  return Object.freeze({
    ...draft.result,
    collectionRunId: running.id,
    executionId: running.executionId,
  });
}

function resultFromFinalized(
  attempted: EndpointCollectionAttemptResult,
  finalized: PersistedCollectionRun,
): EndpointCollectionAttemptResult {
  if (
    finalized.id !== attempted.collectionRunId ||
    finalized.sourceEndpointId !== attempted.endpointId ||
    finalized.executionId !== attempted.executionId ||
    finalized.runStatus === 'running' ||
    finalized.runStatus !== attempted.runStatus ||
    finalized.transportStatus !== attempted.transportStatus ||
    finalized.parserStatus !== attempted.parserStatus ||
    finalized.rawItemCount !== attempted.rawItemCount ||
    finalized.sourceItemFilteredCount !== attempted.sourceItemFilteredCount ||
    finalized.normalizationStatus !== attempted.normalizationStatus ||
    finalized.processingStatus !== attempted.processingStatus ||
    finalized.normalizedCandidateCount !== attempted.normalizedCandidateCount ||
    finalized.normalizationFailureCount !==
      attempted.normalizationFailureCount ||
    finalized.articleLinkRejectionCount !==
      attempted.articleLinkRejectionCount ||
    finalized.createdCount !== attempted.createdCount ||
    finalized.updatedCount !== attempted.updatedCount ||
    finalized.unchangedCount !== attempted.unchangedCount ||
    finalized.rejectedCount !== attempted.rejectedCount ||
    finalized.excludedCount !== attempted.excludedCount ||
    finalized.failedCount !== attempted.failedCount ||
    finalized.duplicateReviewCreatedCount !==
      attempted.duplicateReviewCreatedCount ||
    finalized.duplicateGroupedCount !== attempted.duplicateGroupedCount ||
    finalized.outcomeCode !== attempted.outcome ||
    finalized.retryClassification !== attempted.retryClassification ||
    finalized.responseEtag !== attempted.responseValidators?.etag ||
    finalized.responseLastModified !==
      attempted.responseValidators?.lastModified
  ) {
    throw new Error('Collection run finalization returned inconsistent state.');
  }
  return Object.freeze({
    ...attempted,
    collectionRunId: finalized.id,
    executionId: finalized.executionId,
    runStatus: finalized.runStatus,
    transportStatus: finalized.transportStatus,
    parserStatus: finalized.parserStatus,
    rawItemCount: finalized.rawItemCount,
    sourceItemFilteredCount: finalized.sourceItemFilteredCount,
    normalizationStatus: finalized.normalizationStatus,
    processingStatus: finalized.processingStatus,
    normalizedCandidateCount: finalized.normalizedCandidateCount,
    normalizationFailureCount: finalized.normalizationFailureCount,
    articleLinkRejectionCount: finalized.articleLinkRejectionCount,
    createdCount: finalized.createdCount,
    updatedCount: finalized.updatedCount,
    unchangedCount: finalized.unchangedCount,
    rejectedCount: finalized.rejectedCount,
    excludedCount: finalized.excludedCount,
    failedCount: finalized.failedCount,
    ...(finalized.retryClassification === undefined
      ? {}
      : { retryClassification: finalized.retryClassification }),
    ...(finalized.responseEtag === undefined &&
    finalized.responseLastModified === undefined
      ? {}
      : {
          responseValidators: Object.freeze({
            ...(finalized.responseEtag === undefined
              ? {}
              : { etag: finalized.responseEtag }),
            ...(finalized.responseLastModified === undefined
              ? {}
              : { lastModified: finalized.responseLastModified }),
          }),
        }),
    ...(finalized.httpStatusCode === undefined
      ? {}
      : { httpStatusCode: finalized.httpStatusCode }),
    ...(finalized.wireByteCount === undefined
      ? {}
      : { wireByteCount: finalized.wireByteCount }),
    ...(finalized.decompressedByteCount === undefined
      ? {}
      : { decompressedByteCount: finalized.decompressedByteCount }),
  });
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

function parserForEndpoint(
  endpointType: string,
  rssAtomParser: FeedParser,
): FeedParser | undefined {
  return endpointType === 'rss_atom' ? rssAtomParser : undefined;
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

function persistenceMetadata(
  metadata: Partial<
    Pick<
      EndpointCollectionAttemptResult,
      | 'httpStatusCode'
      | 'wireByteCount'
      | 'decompressedByteCount'
      | 'redirectCount'
      | 'elapsedMilliseconds'
      | 'responseValidators'
    >
  >,
): Pick<
  FinalizeCollectionRunInput,
  'httpStatusCode' | 'wireByteCount' | 'decompressedByteCount'
> {
  return {
    ...(metadata.httpStatusCode === undefined
      ? {}
      : { httpStatusCode: metadata.httpStatusCode }),
    ...(metadata.wireByteCount === undefined
      ? {}
      : { wireByteCount: metadata.wireByteCount }),
    ...(metadata.decompressedByteCount === undefined
      ? {}
      : { decompressedByteCount: metadata.decompressedByteCount }),
    ...(metadata.redirectCount === undefined
      ? {}
      : { redirectCount: metadata.redirectCount }),
    ...(metadata.elapsedMilliseconds === undefined
      ? {}
      : { transportElapsedMilliseconds: metadata.elapsedMilliseconds }),
    ...(metadata.responseValidators === undefined
      ? {}
      : { responseValidators: metadata.responseValidators }),
  };
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
