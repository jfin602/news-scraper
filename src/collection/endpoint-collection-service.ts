import { randomUUID } from 'node:crypto';

import {
  persistIncludedArticle,
  type ArticlePersistenceResult,
} from '../articles/repository.ts';
import type { Database } from '../database/database.ts';
import { attachCollectionRunToEndpointCollectionJob } from '../jobs/endpoint-collection-job-repository.ts';
import {
  applyTerminalCollectionRunToEndpointRuntime,
  findEndpointConfigurationById,
  findEndpointConfigurationByKeys,
  type EndpointConfigurationAggregate,
} from '../sources/repository.ts';
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
  createHttpFetcher,
  type HttpFetcher,
} from './fetchers/http-fetcher.ts';
import { normalizeArticleCandidate } from './normalization/normalizer.ts';
import type { ArticleCandidate } from './normalization/article-candidate.ts';
import { RssAtomParser } from './parsers/rss-atom-parser.ts';
import { evaluateRelevance } from './relevance/evaluator.ts';
import {
  finalizeCollectionRun,
  startCollectionRun,
} from './runs/repository.ts';
import { createNodeResolver } from './safety/resolver.ts';

export type EndpointCollectionExecutionRequest =
  | Readonly<{
      triggerKind: 'manual';
      sourceConfigKey: string;
      endpointConfigKey: string;
      executionId?: string;
    }>
  | Readonly<{
      triggerKind: 'scheduled';
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
    }>;

export interface EndpointCollectionServiceDependencies {
  readonly findByKeys: typeof findEndpointConfigurationByKeys;
  readonly findById: typeof findEndpointConfigurationById;
  readonly createFetcher: () => HttpFetcher;
  readonly collect: typeof collectEndpoint;
  readonly executionId: () => string;
  readonly applyRuntimeState: typeof applyTerminalCollectionRunToEndpointRuntime;
}

const DEFAULT_DEPENDENCIES: EndpointCollectionServiceDependencies =
  Object.freeze({
    findByKeys: findEndpointConfigurationByKeys,
    findById: findEndpointConfigurationById,
    createFetcher: () => createHttpFetcher({ resolver: createNodeResolver() }),
    collect: collectEndpoint,
    executionId: randomUUID,
    applyRuntimeState: applyTerminalCollectionRunToEndpointRuntime,
  });

export async function executeEndpointCollection(
  database: Database,
  request: EndpointCollectionExecutionRequest,
  overrides: Partial<EndpointCollectionServiceDependencies> = {},
): Promise<EndpointCollectionServiceResult> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const configuration =
    request.triggerKind === 'manual'
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

  if (request.triggerKind === 'scheduled') {
    const eligibility = evaluateCollectionEligibility(configuration);
    if (eligibility.status === 'blocked') {
      return Object.freeze({
        status: 'resolved' as const,
        sourceId: configuration.source.id,
        endpointId: configuration.endpoint.id,
        collection: eligibility,
      });
    }
  }

  if (
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

function collectionDependencies(
  database: Database,
  configuration: EndpointConfigurationAggregate,
  request: EndpointCollectionExecutionRequest,
  dependencies: EndpointCollectionServiceDependencies,
): CollectEndpointDependencies {
  const runs =
    request.triggerKind === 'scheduled'
      ? createScheduledCollectionRunStore(database, request)
      : createCollectionRunStore(database);
  return Object.freeze({
    lockRunner: createEndpointExecutionLockRunner(database),
    runs,
    fetcher: dependencies.createFetcher(),
    rssAtomParser: new RssAtomParser(),
    normalizeArticleCandidate,
    applyArticleLinkPolicy,
    evaluateRelevance,
    persistArticle: (
      candidate: ArticleCandidate,
      observationTime: Date,
    ): Promise<ArticlePersistenceResult> =>
      persistIncludedArticle(database, candidate, observationTime),
    observationTime: () => new Date(),
    executionId: () =>
      request.triggerKind === 'scheduled'
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

function createScheduledCollectionRunStore(
  database: Database,
  request: Extract<
    EndpointCollectionExecutionRequest,
    { triggerKind: 'scheduled' }
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
          request.now,
        );
        if (attached === undefined) {
          throw new Error('Scheduled Collection run attachment was rejected.');
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
