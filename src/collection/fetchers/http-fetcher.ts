import { performance } from 'node:perf_hooks';

import type { EndpointConfigurationAggregate } from '../../sources/repository.ts';
import {
  validateInitialDestination,
  validateRedirectDestination,
  type DestinationSafetyDecision,
  type ValidatedDestination,
} from '../safety/destination-safety.ts';
import type { DestinationResolver } from '../safety/resolver.ts';
import type { StaticDestinationPolicy } from '../safety/static-destination.ts';
import {
  HTTP_TRANSPORT_HEADER_LIMITS,
  resolveFetchOptions,
  type ContentFetchResult,
  type FailedFetchResult,
  type Fetcher,
  type FetchOptions,
  type NotModifiedFetchResult,
  type ResponseMetadata,
  type RetryClassification,
  type TransportFailureReason,
  type TransportMetrics,
} from './fetcher.ts';
import { httpTransport } from './http-transport.ts';

export const HTTP_FETCHER_DEFAULTS = Object.freeze({ maxRedirects: 5 });

export type HttpFetcherFailureReason =
  | TransportFailureReason
  | 'redirect_missing_location'
  | 'redirect_limit_exceeded'
  | 'redirect_loop';

export interface HttpFetcherRequest extends FetchOptions {
  readonly configuration: EndpointConfigurationAggregate;
  readonly maxRedirects?: number;
}

export interface HttpFetchMetrics {
  readonly elapsedMilliseconds: number;
  readonly hopCount: number;
  readonly wireBytes: number;
  readonly decompressedBytes: number;
  readonly hops: readonly TransportMetrics[];
}

interface HttpTerminalMetadata {
  readonly finalUrl: string;
  readonly redirectCount: number;
  readonly metrics: HttpFetchMetrics;
}

export interface HttpContentFetchResult
  extends Omit<ContentFetchResult, 'metrics'>, HttpTerminalMetadata {}

export interface HttpNotModifiedFetchResult
  extends Omit<NotModifiedFetchResult, 'metrics'>, HttpTerminalMetadata {}

export interface HttpFailedFetchResult
  extends Omit<FailedFetchResult, 'reason' | 'metrics'>, HttpTerminalMetadata {
  readonly reason: HttpFetcherFailureReason;
}

export type HttpFetcherResult =
  | Exclude<DestinationSafetyDecision, ValidatedDestination>
  | HttpContentFetchResult
  | HttpNotModifiedFetchResult
  | HttpFailedFetchResult;

export interface HttpFetcher {
  fetch(request: HttpFetcherRequest): Promise<HttpFetcherResult>;
}

export interface HttpFetcherDependencies {
  readonly resolver: DestinationResolver;
  readonly transport?: Fetcher;
  readonly now?: () => number;
}

class OverallDeadlineExceeded extends Error {}

export function createHttpFetcher(
  dependencies: HttpFetcherDependencies,
): HttpFetcher {
  const transport = dependencies.transport ?? httpTransport;
  const now = dependencies.now ?? performance.now.bind(performance);

  return Object.freeze({
    async fetch(request: HttpFetcherRequest): Promise<HttpFetcherResult> {
      const options = resolveFetchOptions(request);
      const maxRedirects = resolvedRedirectLimit(request.maxRedirects);
      const startedAt = now();
      const deadline = startedAt + options.totalTimeoutMs;
      const policy: StaticDestinationPolicy = request.configuration;
      const hops: TransportMetrics[] = [];
      const contactedUrls = new Set<string>();
      let redirectCount = 0;

      let decision = await validateWithDeadline(
        deadline,
        now,
        dependencies.resolver,
        (resolver) =>
          validateInitialDestination(
            policy,
            request.configuration.endpoint.endpointUrl.value,
            resolver,
          ),
      );
      if (decision.timedOut) {
        return fetcherFailure(
          'total_timeout',
          'transient',
          'Feed fetch exceeded the configured overall deadline.',
          request.configuration.endpoint.endpointUrl.value,
          redirectCount,
          startedAt,
          now,
          hops,
        );
      }
      if (decision.value.status === 'blocked') return decision.value;

      let destination = decision.value;
      for (;;) {
        const remaining = remainingMilliseconds(deadline, now());
        if (remaining <= 0) {
          return fetcherFailure(
            'total_timeout',
            'transient',
            'Feed fetch exceeded the configured overall deadline.',
            destination.requestUrl,
            redirectCount,
            startedAt,
            now,
            hops,
          );
        }

        contactedUrls.add(destination.requestUrl);
        const result = await transport.fetch({
          destination,
          connectTimeoutMs: Math.min(options.connectTimeoutMs, remaining),
          totalTimeoutMs: remaining,
          maxWireBytes: options.maxWireBytes,
          maxDecompressedBytes: options.maxDecompressedBytes,
          userAgent: options.userAgent,
          validators: options.validators,
          contentPolicy: options.contentPolicy,
        });
        hops.push(result.metrics);

        if (result.outcome !== 'redirect') {
          if (remainingMilliseconds(deadline, now()) <= 0) {
            return fetcherFailure(
              'total_timeout',
              'transient',
              'Feed fetch exceeded the configured overall deadline.',
              destination.requestUrl,
              redirectCount,
              startedAt,
              now,
              hops,
            );
          }
          return terminalResult(
            result,
            destination.requestUrl,
            redirectCount,
            startedAt,
            now,
            hops,
          );
        }

        if (
          result.location === undefined ||
          result.location.trim().length === 0
        ) {
          return fetcherFailure(
            'redirect_missing_location',
            'permanent',
            'Redirect response did not include a usable Location header.',
            destination.requestUrl,
            redirectCount,
            startedAt,
            now,
            hops,
            result.response,
          );
        }
        if (redirectCount >= maxRedirects) {
          return fetcherFailure(
            'redirect_limit_exceeded',
            'permanent',
            'Redirect response exceeded the configured redirect limit.',
            destination.requestUrl,
            redirectCount,
            startedAt,
            now,
            hops,
            result.response,
          );
        }

        decision = await validateWithDeadline(
          deadline,
          now,
          dependencies.resolver,
          (resolver) =>
            validateRedirectDestination(
              policy,
              destination.requestUrl,
              result.location!,
              resolver,
            ),
        );
        if (decision.timedOut) {
          return fetcherFailure(
            'total_timeout',
            'transient',
            'Feed fetch exceeded the configured overall deadline.',
            destination.requestUrl,
            redirectCount,
            startedAt,
            now,
            hops,
          );
        }
        if (decision.value.status === 'blocked') return decision.value;
        if (contactedUrls.has(decision.value.requestUrl)) {
          return fetcherFailure(
            'redirect_loop',
            'permanent',
            'Redirect target repeats a URL already contacted by this fetch.',
            destination.requestUrl,
            redirectCount,
            startedAt,
            now,
            hops,
            result.response,
          );
        }
        destination = decision.value;
        redirectCount += 1;
      }
    },
  });
}

function resolvedRedirectLimit(value: number | undefined): number {
  const resolved = value ?? HTTP_FETCHER_DEFAULTS.maxRedirects;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError('maxRedirects must be a nonnegative safe integer');
  }
  return resolved;
}

async function validateWithDeadline(
  deadline: number,
  now: () => number,
  resolver: DestinationResolver,
  validate: (
    deadlineResolver: DestinationResolver,
  ) => Promise<DestinationSafetyDecision>,
): Promise<
  | Readonly<{ timedOut: true }>
  | Readonly<{ timedOut: false; value: DestinationSafetyDecision }>
> {
  const state = { timedOut: false };
  const deadlineResolver: DestinationResolver = Object.freeze({
    async resolve(hostname: string) {
      const remaining = remainingMilliseconds(deadline, now());
      if (remaining <= 0) {
        state.timedOut = true;
        throw new OverallDeadlineExceeded();
      }
      return raceResolver(resolver.resolve(hostname), remaining, state);
    },
  });
  const value = await validate(deadlineResolver);
  return state.timedOut
    ? Object.freeze({ timedOut: true as const })
    : Object.freeze({ timedOut: false as const, value });
}

function raceResolver(
  resolution: Promise<
    readonly import('../safety/resolver.ts').ResolvedAddress[]
  >,
  timeoutMs: number,
  state: { timedOut: boolean },
): Promise<readonly import('../safety/resolver.ts').ResolvedAddress[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.timedOut = true;
      reject(new OverallDeadlineExceeded());
    }, timeoutMs);
    void resolution.then(
      (answers) => {
        clearTimeout(timer);
        resolve(answers);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function remainingMilliseconds(deadline: number, now: number): number {
  return Math.max(0, Math.ceil(deadline - now));
}

function terminalResult(
  result: ContentFetchResult | NotModifiedFetchResult | FailedFetchResult,
  finalUrl: string,
  redirectCount: number,
  startedAt: number,
  now: () => number,
  hops: readonly TransportMetrics[],
): HttpContentFetchResult | HttpNotModifiedFetchResult | HttpFailedFetchResult {
  return Object.freeze({
    ...result,
    finalUrl,
    redirectCount,
    metrics: aggregateMetrics(startedAt, now, hops),
  });
}

function fetcherFailure(
  reason: HttpFetcherFailureReason,
  retry: RetryClassification,
  detail: string,
  finalUrl: string,
  redirectCount: number,
  startedAt: number,
  now: () => number,
  hops: readonly TransportMetrics[],
  response?: ResponseMetadata,
): HttpFailedFetchResult {
  const boundedDetail = detail.slice(
    0,
    HTTP_TRANSPORT_HEADER_LIMITS.errorDetail,
  );
  return Object.freeze({
    outcome: 'failure',
    reason,
    retry,
    detail: boundedDetail,
    ...(response === undefined ? {} : { response }),
    finalUrl,
    redirectCount,
    metrics: aggregateMetrics(startedAt, now, hops),
  });
}

function aggregateMetrics(
  startedAt: number,
  now: () => number,
  hops: readonly TransportMetrics[],
): HttpFetchMetrics {
  const frozenHops = Object.freeze([...hops]);
  return Object.freeze({
    elapsedMilliseconds: Math.max(0, now() - startedAt),
    hopCount: frozenHops.length,
    wireBytes: frozenHops.reduce((total, hop) => total + hop.wireBytes, 0),
    decompressedBytes: frozenHops.reduce(
      (total, hop) => total + hop.decompressedBytes,
      0,
    ),
    hops: frozenHops,
  });
}
