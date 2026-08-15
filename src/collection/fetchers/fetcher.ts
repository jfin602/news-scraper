import type { ValidatedDestination } from '../safety/destination-safety.ts';

export const HTTP_TRANSPORT_DEFAULTS = Object.freeze({
  connectTimeoutMs: 5_000,
  totalTimeoutMs: 15_000,
  maxWireBytes: 33_554_432,
  maxDecompressedBytes: 33_554_432,
  userAgent: 'NewsScraper feed collector',
});

export const HTTP_TRANSPORT_HEADER_LIMITS = Object.freeze({
  requestValidator: 1_024,
  responseValidator: 1_024,
  responseMetadata: 1_024,
  redirectLocation: 8_192,
  errorDetail: 160,
});

export interface ConditionalRequestValidators {
  readonly etag?: string;
  readonly lastModified?: string;
}

/**
 * A deliberately small terminal-response policy.  The endpoint collection
 * layer chooses it from persisted endpoint type; transport never needs an
 * endpoint aggregate to make media decisions.
 */
export type HttpContentPolicy = 'rss_atom' | 'html_listing';

export const HTTP_CONTENT_POLICIES = Object.freeze({
  rss_atom: Object.freeze({
    accept:
      'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8',
    acceptedMediaTypes: Object.freeze([
      'application/rss+xml',
      'application/atom+xml',
      'application/xml',
      'text/xml',
    ]),
  }),
  html_listing: Object.freeze({
    accept: 'text/html',
    acceptedMediaTypes: Object.freeze(['text/html']),
  }),
});

export interface FetchOptions {
  readonly connectTimeoutMs?: number;
  readonly totalTimeoutMs?: number;
  readonly maxWireBytes?: number;
  readonly maxDecompressedBytes?: number;
  readonly userAgent?: string;
  readonly validators?: ConditionalRequestValidators;
  readonly contentPolicy?: HttpContentPolicy;
}

export interface FetchRequest extends FetchOptions {
  readonly destination: ValidatedDestination;
}

export interface ResolvedFetchOptions {
  readonly connectTimeoutMs: number;
  readonly totalTimeoutMs: number;
  readonly maxWireBytes: number;
  readonly maxDecompressedBytes: number;
  readonly userAgent: string;
  readonly validators: ConditionalRequestValidators;
  readonly contentPolicy: HttpContentPolicy;
}

export interface ResolvedFetchRequest extends ResolvedFetchOptions {
  readonly destination: ValidatedDestination;
}

export interface TransportMetrics {
  readonly elapsedMilliseconds: number;
  readonly httpStatus?: number;
  readonly wireBytes: number;
  readonly decompressedBytes: number;
  readonly selectedAddress: string;
  readonly selectedAddressFamily: 4 | 6;
}

export interface ResponseMetadata {
  readonly etag?: string;
  readonly lastModified?: string;
  readonly contentType?: string;
  readonly contentEncoding?: string;
}

export interface ContentFetchResult {
  readonly outcome: 'content';
  readonly content: Uint8Array;
  readonly mediaType: string;
  readonly response: ResponseMetadata;
  readonly metrics: TransportMetrics;
}

export interface NotModifiedFetchResult {
  readonly outcome: 'not_modified';
  readonly response: ResponseMetadata;
  readonly metrics: TransportMetrics;
}

export interface RedirectFetchResult {
  readonly outcome: 'redirect';
  readonly location?: string;
  readonly response: ResponseMetadata;
  readonly metrics: TransportMetrics;
}

export type TransportFailureReason =
  | 'connect_timeout'
  | 'total_timeout'
  | 'network_error'
  | 'tls_validation_error'
  | 'http_status'
  | 'wire_size_limit'
  | 'decompressed_size_limit'
  | 'unsupported_content_encoding'
  | 'decompression_failed'
  | 'unsupported_content_type'
  | 'response_header_limit';

export type RetryClassification = 'transient' | 'permanent';

export interface FailedFetchResult {
  readonly outcome: 'failure';
  readonly reason: TransportFailureReason;
  readonly retry: RetryClassification;
  readonly detail: string;
  readonly response?: ResponseMetadata;
  readonly metrics: TransportMetrics;
}

export type FetchResult =
  | ContentFetchResult
  | NotModifiedFetchResult
  | RedirectFetchResult
  | FailedFetchResult;

export interface Fetcher {
  fetch(request: FetchRequest): Promise<FetchResult>;
}

export function resolveFetchRequest(
  request: FetchRequest,
): ResolvedFetchRequest {
  return Object.freeze({
    destination: request.destination,
    ...resolveFetchOptions(request),
  });
}

export function resolveFetchOptions(
  request: FetchOptions,
): ResolvedFetchOptions {
  const resolved = {
    connectTimeoutMs:
      request.connectTimeoutMs ?? HTTP_TRANSPORT_DEFAULTS.connectTimeoutMs,
    totalTimeoutMs:
      request.totalTimeoutMs ?? HTTP_TRANSPORT_DEFAULTS.totalTimeoutMs,
    maxWireBytes: request.maxWireBytes ?? HTTP_TRANSPORT_DEFAULTS.maxWireBytes,
    maxDecompressedBytes:
      request.maxDecompressedBytes ??
      HTTP_TRANSPORT_DEFAULTS.maxDecompressedBytes,
    userAgent: request.userAgent ?? HTTP_TRANSPORT_DEFAULTS.userAgent,
    validators: request.validators ?? {},
    contentPolicy: request.contentPolicy ?? 'rss_atom',
  };

  positiveInteger(resolved.connectTimeoutMs, 'connectTimeoutMs');
  positiveInteger(resolved.totalTimeoutMs, 'totalTimeoutMs');
  positiveInteger(resolved.maxWireBytes, 'maxWireBytes');
  positiveInteger(resolved.maxDecompressedBytes, 'maxDecompressedBytes');
  if (resolved.connectTimeoutMs > resolved.totalTimeoutMs) {
    throw new RangeError('connectTimeoutMs must not exceed totalTimeoutMs');
  }
  validateHeaderValue(resolved.userAgent, 'userAgent', 256);
  if (
    resolved.contentPolicy !== 'rss_atom' &&
    resolved.contentPolicy !== 'html_listing'
  ) {
    throw new TypeError('contentPolicy is not supported');
  }
  if (resolved.validators.etag !== undefined) {
    validateHeaderValue(
      resolved.validators.etag,
      'validators.etag',
      HTTP_TRANSPORT_HEADER_LIMITS.requestValidator,
    );
  }
  if (resolved.validators.lastModified !== undefined) {
    validateHeaderValue(
      resolved.validators.lastModified,
      'validators.lastModified',
      HTTP_TRANSPORT_HEADER_LIMITS.requestValidator,
    );
  }

  return Object.freeze({
    ...resolved,
    validators: Object.freeze({ ...resolved.validators }),
  });
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function validateHeaderValue(value: string, name: string, limit: number): void {
  if (value.length === 0 || value.length > limit || /[\r\n\0]/u.test(value)) {
    throw new TypeError(`${name} is not a valid bounded HTTP header value`);
  }
}
