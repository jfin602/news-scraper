import { randomUUID } from 'node:crypto';

import { persistExcludedArticleObservation } from '../articles/repository.ts';
import {
  processIncludedArticle,
  type IncludedArticleProcessingResult,
} from './included-article-processing.ts';
import type { Database } from '../database/database.ts';
import {
  attachCollectionRunToEndpointCollectionJob,
  type EndpointCollectionJobTriggerKind,
} from '../jobs/endpoint-collection-job-repository.ts';
import {
  applyTerminalCollectionRunToEndpointRuntime,
  findEndpointConfigurationById,
  findEndpointConfigurationByKeys,
  type EndpointConfigurationAggregate,
} from '../sources/repository.ts';
import { normalizeDomainHostname } from '../sources/configuration.ts';
import { applyArticleLinkPolicy } from './article-links/policy.ts';
import {
  collectEndpoint,
  createCollectionRunStore,
  type CollectEndpointDependencies,
  type CollectEndpointResult,
  type CollectionRunStore,
} from './collect-endpoint.ts';
import { createEndpointExecutionLockRunner } from './execution.ts';
import { evaluateCollectionEligibility } from './eligibility.ts';
import {
  withCollectionCapacity,
  type CollectionCapacityBlocked,
} from './concurrency/collection-capacity.ts';
import {
  createHttpFetcher,
  type HttpFetcher,
} from './fetchers/http-fetcher.ts';
import { normalizeArticleCandidate } from './normalization/normalizer.ts';
import type { ArticleCandidate } from './normalization/article-candidate.ts';
import { RssAtomParser } from './parsers/rss-atom-parser.ts';
import {
  evaluateRelevance,
  type RelevanceDecision,
} from './relevance/evaluator.ts';
import { loadEffectiveRelevanceConfiguration } from './relevance/repository.ts';
import {
  finalizeCollectionRun,
  startCollectionRun,
} from './runs/repository.ts';
import { createNodeResolver } from './safety/resolver.ts';

export type EndpointCollectionExecutionRequest =
  | Readonly<{
      executionKind: 'direct_manual';
      triggerKind: 'manual';
      sourceConfigKey: string;
      endpointConfigKey: string;
      executionId?: string;
    }>
  | Readonly<{
      executionKind: 'durable_job';
      triggerKind: EndpointCollectionJobTriggerKind;
      sourceEndpointId: string;
      jobId: string;
      claimToken: string;
      attemptNumber: number;
      now: Date;
    }>;

export type EndpointCollectionServiceResult =
  | Readonly<{
      status: 'resolved';
      sourceId: string;
      endpointId: string;
      collection: CollectEndpointResult;
    }>
  | Readonly<{
      status: 'not_found';
      reason: 'endpoint_not_found';
    }>
  | Readonly<{
      status: 'skipped';
      endpointId: string;
      reason: 'no_longer_due';
    }>
  | (Omit<CollectionCapacityBlocked, 'status'> &
      Readonly<{
        status: 'capacity_blocked';
        sourceId: string;
        endpointId: string;
      }>);

type LoadedEndpointCollectionServiceResult = Exclude<
  EndpointCollectionServiceResult,
  Readonly<{ status: 'not_found' | 'capacity_blocked' }>
>;

export interface EndpointCollectionServiceDependencies {
  readonly findByKeys: typeof findEndpointConfigurationByKeys;
  readonly findById: typeof findEndpointConfigurationById;
  readonly runWithCapacity: typeof withCollectionCapacity;
  readonly createFetcher: () => HttpFetcher;
  readonly collect: typeof collectEndpoint;
  readonly executionId: () => string;
  readonly applyRuntimeState: typeof applyTerminalCollectionRunToEndpointRuntime;
  readonly loadRelevanceConfiguration: typeof loadEffectiveRelevanceConfiguration;
  readonly evaluateRelevance: typeof evaluateRelevance;
  readonly processIncludedArticle: typeof processIncludedArticle;
  readonly persistExcludedArticle: typeof persistExcludedArticleObservation;
}

const DEFAULT_DEPENDENCIES: EndpointCollectionServiceDependencies =
  Object.freeze({
    findByKeys: findEndpointConfigurationByKeys,
    findById: findEndpointConfigurationById,
    runWithCapacity: withCollectionCapacity,
    createFetcher: () => createHttpFetcher({ resolver: createNodeResolver() }),
    collect: collectEndpoint,
    executionId: randomUUID,
    applyRuntimeState: applyTerminalCollectionRunToEndpointRuntime,
    loadRelevanceConfiguration: loadEffectiveRelevanceConfiguration,
    evaluateRelevance,
    processIncludedArticle,
    persistExcludedArticle: persistExcludedArticleObservation,
  });

export async function executeEndpointCollection(
  database: Database,
  request: EndpointCollectionExecutionRequest,
  overrides: Partial<EndpointCollectionServiceDependencies> = {},
): Promise<EndpointCollectionServiceResult> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const configuration =
    request.executionKind === 'direct_manual'
      ? await dependencies.findByKeys(
          database,
          request.sourceConfigKey,
          request.endpointConfigKey,
        )
      : await dependencies.findById(database, request.sourceEndpointId);
  if (configuration === undefined) {
    return Object.freeze({
      status: 'not_found' as const,
      reason: 'endpoint_not_found' as const,
    });
  }

  const eligibility = evaluateCollectionEligibility(configuration);
  if (eligibility.status === 'blocked') {
    return resolvedCollection(configuration, eligibility);
  }

  const capacity = await dependencies.runWithCapacity(
    database,
    {
      sourceId: configuration.source.id,
      destinationHost: normalizeDomainHostname(
        configuration.endpoint.endpointUrl.hostname,
      ),
    },
    () =>
      executeLoadedEndpointCollection(
        database,
        request,
        configuration,
        dependencies,
      ),
  );
  if (capacity.status === 'blocked') {
    return Object.freeze({
      ...capacity,
      status: 'capacity_blocked' as const,
      sourceId: configuration.source.id,
      endpointId: configuration.endpoint.id,
    });
  }
  return capacity.value;
}

async function executeLoadedEndpointCollection(
  database: Database,
  request: EndpointCollectionExecutionRequest,
  configuration: EndpointConfigurationAggregate,
  dependencies: EndpointCollectionServiceDependencies,
): Promise<LoadedEndpointCollectionServiceResult> {
  const eligibility = evaluateCollectionEligibility(configuration);
  if (eligibility.status === 'blocked') {
    return resolvedCollection(configuration, eligibility);
  }

  if (
    request.executionKind === 'durable_job' &&
    request.triggerKind === 'scheduled' &&
    request.attemptNumber === 1 &&
    configuration.endpoint.nextDueAt !== undefined &&
    configuration.endpoint.nextDueAt > request.now
  ) {
    return Object.freeze({
      status: 'skipped' as const,
      endpointId: configuration.endpoint.id,
      reason: 'no_longer_due' as const,
    });
  }

  const result = await dependencies.collect(
    configuration,
    collectionDependencies(database, configuration, request, dependencies),
  );
  if (result.status === 'succeeded' || result.status === 'failed') {
    await dependencies.applyRuntimeState(database, result.collectionRunId);
  }
  return Object.freeze({
    status: 'resolved' as const,
    sourceId: configuration.source.id,
    endpointId: configuration.endpoint.id,
    collection: result,
  });
}

function resolvedCollection(
  configuration: EndpointConfigurationAggregate,
  collection: CollectEndpointResult,
): Extract<EndpointCollectionServiceResult, { status: 'resolved' }> {
  return Object.freeze({
    status: 'resolved',
    sourceId: configuration.source.id,
    endpointId: configuration.endpoint.id,
    collection,
  });
}

function collectionDependencies(
  database: Database,
  configuration: EndpointConfigurationAggregate,
  request: EndpointCollectionExecutionRequest,
  dependencies: EndpointCollectionServiceDependencies,
): CollectEndpointDependencies {
  const runs =
    request.executionKind === 'durable_job'
      ? createDurableJobCollectionRunStore(database, request)
      : createCollectionRunStore(database);
  return Object.freeze({
    lockRunner: createEndpointExecutionLockRunner(database),
    runs,
    fetcher: dependencies.createFetcher(),
    rssAtomParser: new RssAtomParser(),
    normalizeArticleCandidate,
    applyArticleLinkPolicy,
    async loadRelevanceConfiguration() {
      const snapshot = await dependencies.loadRelevanceConfiguration(
        database,
        configuration.source.id,
        configuration.endpoint.id,
      );
      if (snapshot === undefined) {
        throw new Error('Endpoint Relevance configuration was not found.');
      }
      return snapshot;
    },
    evaluateRelevance: dependencies.evaluateRelevance,
    processIncludedArticle: (
      candidate: ArticleCandidate,
      observationTime: Date,
      decision: Extract<RelevanceDecision, { readonly included: true }>,
    ): Promise<IncludedArticleProcessingResult> =>
      dependencies.processIncludedArticle(
        database,
        candidate,
        observationTime,
        decision,
      ),
    persistExcludedArticle: (
      candidate: ArticleCandidate,
      observationTime: Date,
      decision: Extract<RelevanceDecision, { readonly included: false }>,
    ) =>
      dependencies.persistExcludedArticle(
        database,
        candidate,
        observationTime,
        decision,
      ),
    observationTime: () => new Date(),
    executionId: () =>
      request.executionKind === 'durable_job'
        ? request.jobId
        : (request.executionId ?? dependencies.executionId()),
    triggerKind: request.triggerKind,
    fetchOptions: Object.freeze({
      validators: Object.freeze({
        ...(configuration.endpoint.etag === undefined
          ? {}
          : { etag: configuration.endpoint.etag }),
        ...(configuration.endpoint.lastModified === undefined
          ? {}
          : { lastModified: configuration.endpoint.lastModified }),
      }),
    }),
  });
}

function createDurableJobCollectionRunStore(
  database: Database,
  request: Extract<
    EndpointCollectionExecutionRequest,
    { executionKind: 'durable_job' }
  >,
): CollectionRunStore {
  const store: CollectionRunStore = {
    start(input) {
      return database.transaction(async (transaction) => {
        const run = await startCollectionRun(transaction, input);
        const attached = await attachCollectionRunToEndpointCollectionJob(
          transaction,
          request.jobId,
          request.claimToken,
          run.id,
        );
        if (attached === undefined) {
          throw new Error(
            'Durable endpoint job Collection run attachment was rejected.',
          );
        }
        return run;
      });
    },
    finalize(collectionRunId, input) {
      return finalizeCollectionRun(database, collectionRunId, input);
    },
  };
  return Object.freeze(store);
}
