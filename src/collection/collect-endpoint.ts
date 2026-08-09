import type { QueryExecutor } from '../database/database.ts';
import type { EndpointConfigurationAggregate } from '../sources/repository.ts';
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
import type { EndpointRunLockBlocked } from './locks/endpoint-run-lock.ts';
import type { FeedParser, ParserResult } from './parsers/parser.ts';
import type { RawItem } from './raw-item.ts';
import {
  finalizeCollectionRun,
  startCollectionRun,
  type FinalizeCollectionRunInput,
  type PersistedCollectionRun,
} from './runs/repository.ts';

export interface CollectionRunStore {
  start(input: {
    readonly sourceEndpointId: string;
    readonly executionId: string;
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
  readonly executionId: () => string;
  readonly fetchOptions?: Omit<HttpFetcherRequest, 'configuration'>;
}

export type CollectionAttemptOutcome =
  | 'content'
  | 'not_modified'
  | 'network_safety_blocked'
  | 'fetch_failed'
  | 'parser_failed';

export interface EndpointCollectionAttemptResult {
  readonly status: 'succeeded' | 'failed';
  readonly outcome: CollectionAttemptOutcome;
  readonly endpointId: string;
  readonly collectionRunId: string;
  readonly executionId: string;
  readonly runStatus: 'succeeded' | 'failed';
  readonly transportStatus: 'not_run' | 'succeeded' | 'not_modified' | 'failed';
  readonly parserStatus: 'not_run' | 'succeeded' | 'failed';
  readonly rawItemCount: number;
  readonly rawItems?: readonly RawItem[];
  readonly reason?: string;
  readonly detail?: string;
  readonly safetyContext?: 'initial' | 'redirect';
  readonly httpStatusCode?: number;
  readonly wireByteCount?: number;
  readonly decompressedByteCount?: number;
  readonly redirectCount?: number;
  readonly elapsedMilliseconds?: number;
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
      });
      const draft = await executeAttempt(configuration, dependencies);
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
        ...metadata,
      }),
      finalization: Object.freeze({
        runStatus: 'succeeded',
        transportStatus: 'not_modified',
        parserStatus: 'not_run',
        rawItemCount: 0,
        ...persistenceMetadata(metadata),
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
  return Object.freeze({
    result: Object.freeze({
      status: 'succeeded',
      outcome: 'content',
      endpointId: configuration.endpoint.id,
      runStatus: 'succeeded',
      transportStatus: 'succeeded',
      parserStatus: 'succeeded',
      rawItemCount: rawItems.length,
      rawItems,
      ...metadata,
    }),
    finalization: Object.freeze({
      runStatus: 'succeeded',
      transportStatus: 'succeeded',
      parserStatus: 'succeeded',
      rawItemCount: rawItems.length,
      ...persistenceMetadata(metadata),
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
      reason,
      detail,
      ...metadata,
    }),
    finalization: Object.freeze({
      runStatus: 'failed',
      transportStatus,
      parserStatus,
      rawItemCount: 0,
      ...persistenceMetadata(metadata),
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
    finalized.rawItemCount !== attempted.rawItemCount
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
> & { readonly httpStatusCode?: number } {
  const httpStatusCode = result.metrics.hops.at(-1)?.httpStatus;
  return Object.freeze({
    wireByteCount: result.metrics.wireBytes,
    decompressedByteCount: result.metrics.decompressedBytes,
    redirectCount: result.redirectCount,
    elapsedMilliseconds: result.metrics.elapsedMilliseconds,
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
      'httpStatusCode' | 'wireByteCount' | 'decompressedByteCount'
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

function safetyDetail(reason: string): string {
  return `Destination safety rejected the collection request (${reason}).`;
}
