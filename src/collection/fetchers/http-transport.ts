import { request as requestHttp } from 'node:http';
import type {
  ClientRequest,
  IncomingHttpHeaders,
  IncomingMessage,
  RequestOptions,
} from 'node:http';
import { request as requestHttps } from 'node:https';
import type { LookupFunction, Socket } from 'node:net';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

import {
  HTTP_TRANSPORT_HEADER_LIMITS,
  resolveFetchRequest,
  type FailedFetchResult,
  type Fetcher,
  type FetchRequest,
  type FetchResult,
  HTTP_CONTENT_POLICIES,
  type ResolvedFetchRequest,
  type ResponseMetadata,
  type RetryClassification,
  type TransportFailureReason,
  type TransportMetrics,
} from './fetcher.ts';

const ACCEPT_ENCODING = 'gzip, deflate, br';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type HttpRequestFunction = (
  protocol: 'http:' | 'https:',
  options: BoundRequestOptions,
  responseListener: (response: IncomingMessage) => void,
) => ClientRequest;

export interface HttpTransportDependencies {
  readonly request?: HttpRequestFunction;
  readonly now?: () => number;
}

interface MutableMetrics {
  httpStatus?: number;
  wireBytes: number;
  decompressedBytes: number;
}

class ExpectedTransportError extends Error {
  readonly reason: TransportFailureReason;

  constructor(reason: TransportFailureReason) {
    super(reason);
    this.reason = reason;
  }
}

type BoundRequestOptions = RequestOptions & {
  readonly autoSelectFamily?: boolean;
  servername?: string;
};

export function createHttpTransport(
  dependencies: HttpTransportDependencies = {},
): Fetcher {
  const issueRequest = dependencies.request ?? defaultRequest;
  const now = dependencies.now ?? Date.now;
  return Object.freeze({
    async fetch(request: FetchRequest): Promise<FetchResult> {
      return fetchOneHop(resolveFetchRequest(request), issueRequest, now);
    },
  });
}

export const httpTransport = createHttpTransport();

export function buildValidatedRequestOptions(
  request: ResolvedFetchRequest,
): BoundRequestOptions {
  const destination = request.destination;
  const url = new URL(destination.requestUrl);
  if (
    url.protocol !== destination.protocol ||
    url.hostname !== destination.hostname ||
    destination.addresses.length === 0
  ) {
    throw new TypeError('Validated destination is internally inconsistent');
  }

  const selectedAddress = destination.addresses[0]!;
  const headers: Record<string, string> = {
    Accept: HTTP_CONTENT_POLICIES[request.contentPolicy].accept,
    'Accept-Encoding': ACCEPT_ENCODING,
    'User-Agent': request.userAgent,
  };
  if (request.validators.etag !== undefined) {
    headers['If-None-Match'] = request.validators.etag;
  }
  if (request.validators.lastModified !== undefined) {
    headers['If-Modified-Since'] = request.validators.lastModified;
  }

  const options: BoundRequestOptions = {
    protocol: destination.protocol,
    hostname: destination.hostname,
    port: destination.port,
    method: 'GET',
    path: `${url.pathname}${url.search}`,
    headers,
    agent: false,
    family: selectedAddress.family,
    lookup: createValidatedLookup(destination.hostname, selectedAddress),
    autoSelectFamily: false,
  };
  if (destination.protocol === 'https:') {
    options.servername = destination.hostname;
  }
  return options;
}

export function createValidatedLookup(
  expectedHostname: string,
  selectedAddress: Readonly<{ address: string; family: 4 | 6 }>,
): LookupFunction {
  return ((hostname, options, callback) => {
    if (hostname !== expectedHostname) {
      callback(
        new Error('Unexpected hostname at validated lookup boundary'),
        '',
        selectedAddress.family,
      );
      return;
    }
    if (typeof options === 'object' && options.all === true) {
      callback(null, [selectedAddress]);
      return;
    }
    callback(null, selectedAddress.address, selectedAddress.family);
  }) as LookupFunction;
}

async function fetchOneHop(
  input: ResolvedFetchRequest,
  issueRequest: HttpRequestFunction,
  now: () => number,
): Promise<FetchResult> {
  const selectedAddress = input.destination.addresses[0]!;
  const startedAt = now();
  const counters: MutableMetrics = { wireBytes: 0, decompressedBytes: 0 };

  return new Promise<FetchResult>((resolve, reject) => {
    let settled = false;
    let response: IncomingMessage | undefined;
    let connectTimer: NodeJS.Timeout | undefined = undefined;
    let totalTimer: NodeJS.Timeout | undefined = undefined;
    let connectingSocket: Socket | undefined;
    let connectionEvent: 'connect' | 'secureConnect' | undefined;
    let clientRequest: ClientRequest;

    const markConnected = (): void => {
      if (connectTimer !== undefined) clearTimeout(connectTimer);
      if (connectingSocket !== undefined && connectionEvent !== undefined) {
        connectingSocket.removeListener(connectionEvent, markConnected);
      }
      connectingSocket = undefined;
      connectionEvent = undefined;
    };

    const metrics = (): TransportMetrics =>
      Object.freeze({
        elapsedMilliseconds: Math.max(0, now() - startedAt),
        ...(counters.httpStatus === undefined
          ? {}
          : { httpStatus: counters.httpStatus }),
        wireBytes: counters.wireBytes,
        decompressedBytes: counters.decompressedBytes,
        selectedAddress: selectedAddress.address,
        selectedAddressFamily: selectedAddress.family,
      });

    const cleanTimers = (): void => {
      if (connectTimer !== undefined) clearTimeout(connectTimer);
      if (totalTimer !== undefined) clearTimeout(totalTimer);
      if (connectingSocket !== undefined && connectionEvent !== undefined) {
        connectingSocket.removeListener(connectionEvent, markConnected);
      }
      connectingSocket = undefined;
      connectionEvent = undefined;
    };
    const finish = (result: FetchResult): void => {
      if (settled) return;
      settled = true;
      cleanTimers();
      resolve(result);
    };
    const fail = (
      reason: TransportFailureReason,
      retry: RetryClassification,
      detail: string,
      metadata?: ResponseMetadata,
    ): void => {
      finish(failureResult(reason, retry, detail, metrics(), metadata));
    };
    const abort = (
      reason: TransportFailureReason,
      retry: RetryClassification,
      detail: string,
    ): void => {
      if (settled) return;
      const error = new ExpectedTransportError(reason);
      response?.destroy(error);
      clientRequest.destroy(error);
      fail(reason, retry, detail);
    };

    try {
      clientRequest = issueRequest(
        input.destination.protocol,
        buildValidatedRequestOptions(input),
        (incoming) => {
          response = incoming;
          markConnected();
          void handleResponse(incoming, input, counters)
            .then((result) =>
              finish(
                Object.freeze({ ...result, metrics: metrics() }) as FetchResult,
              ),
            )
            .catch((error: unknown) => {
              if (settled) return;
              const classified = classifyStreamError(error);
              fail(
                classified.reason,
                classified.retry,
                classified.detail,
                responseMetadata(incoming.headers),
              );
            });
        },
      );
    } catch (error) {
      reject(error);
      return;
    }

    connectTimer = setTimeout(() => {
      abort(
        'connect_timeout',
        'transient',
        'Connection establishment exceeded the configured timeout.',
      );
    }, input.connectTimeoutMs);
    connectTimer.unref();

    totalTimer = setTimeout(() => {
      abort(
        'total_timeout',
        'transient',
        'HTTP operation exceeded the configured total timeout.',
      );
    }, input.totalTimeoutMs);
    totalTimer.unref();

    clientRequest.once('socket', (socket) => {
      if (!socket.connecting) {
        markConnected();
        return;
      }
      connectingSocket = socket;
      connectionEvent =
        input.destination.protocol === 'https:' ? 'secureConnect' : 'connect';
      socket.once(connectionEvent, markConnected);
    });
    clientRequest.once('error', (error) => {
      if (settled) return;
      if (error instanceof ExpectedTransportError) {
        const retry: RetryClassification =
          error.reason === 'connect_timeout' || error.reason === 'total_timeout'
            ? 'transient'
            : 'permanent';
        fail(error.reason, retry, safeFailureDetail(error.reason));
        return;
      }
      const classified = classifyRequestError(error);
      fail(classified.reason, classified.retry, classified.detail);
    });
    clientRequest.end();
  });
}

async function handleResponse(
  response: IncomingMessage,
  input: ResolvedFetchRequest,
  counters: MutableMetrics,
): Promise<Omit<FetchResult, 'metrics'>> {
  const status = response.statusCode;
  if (status === undefined) {
    response.destroy();
    return failureWithoutMetrics(
      'network_error',
      'transient',
      'The server response did not include an HTTP status.',
    );
  }
  counters.httpStatus = status;
  const metadata = responseMetadata(response.headers);
  const contentLength = boundedContentLength(response.headers);
  if (contentLength !== undefined && contentLength > input.maxWireBytes) {
    response.destroy();
    return failureWithoutMetrics(
      'wire_size_limit',
      'permanent',
      'Response Content-Length exceeds the configured wire-size limit.',
      metadata,
    );
  }

  if (status >= 200 && status < 300) {
    const mediaType = acceptedMediaType(
      metadata.contentType,
      input.contentPolicy,
    );
    if (mediaType === undefined) {
      response.destroy();
      return failureWithoutMetrics(
        'unsupported_content_type',
        'permanent',
        'Terminal response Content-Type is not accepted for this endpoint type.',
        metadata,
      );
    }
    const encoding = contentEncoding(metadata.contentEncoding);
    if (encoding === undefined) {
      response.destroy();
      return failureWithoutMetrics(
        'unsupported_content_encoding',
        'permanent',
        'Terminal response Content-Encoding is not supported.',
        metadata,
      );
    }
    const content = await readContent(response, input, counters, encoding);
    return Object.freeze({
      outcome: 'content' as const,
      content,
      mediaType,
      response: metadata,
    });
  }

  await drainBounded(response, input.maxWireBytes, counters);
  if (status === 304) {
    return Object.freeze({
      outcome: 'not_modified' as const,
      response: metadata,
    });
  }
  if (REDIRECT_STATUSES.has(status)) {
    const location = singleHeader(response.headers.location);
    if (
      location !== undefined &&
      location.length > HTTP_TRANSPORT_HEADER_LIMITS.redirectLocation
    ) {
      return failureWithoutMetrics(
        'response_header_limit',
        'permanent',
        'Redirect Location exceeds the configured header limit.',
        metadata,
      );
    }
    return Object.freeze({
      outcome: 'redirect' as const,
      ...(location === undefined ? {} : { location }),
      response: metadata,
    });
  }
  return failureWithoutMetrics(
    'http_status',
    retryForStatus(status),
    `HTTP status ${String(status)} is not a terminal content response.`,
    metadata,
  );
}

async function readContent(
  response: IncomingMessage,
  input: ResolvedFetchRequest,
  counters: MutableMetrics,
  encoding: 'identity' | 'gzip' | 'deflate' | 'br',
): Promise<Uint8Array> {
  const wireLimit = byteLimitTransform(
    input.maxWireBytes,
    'wire_size_limit',
    (bytes) => {
      counters.wireBytes = bytes;
    },
  );
  const chunks: Buffer[] = [];
  const collector = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      const nextSize = counters.decompressedBytes + chunk.length;
      counters.decompressedBytes = nextSize;
      if (nextSize > input.maxDecompressedBytes) {
        callback(new ExpectedTransportError('decompressed_size_limit'));
        return;
      }
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  const decoder = decoderFor(encoding);
  if (decoder === undefined) {
    await pipeline(response, wireLimit, collector);
  } else {
    await pipeline(response, wireLimit, decoder, collector);
  }
  return Buffer.concat(chunks, counters.decompressedBytes);
}

async function drainBounded(
  response: IncomingMessage,
  maxWireBytes: number,
  counters: MutableMetrics,
): Promise<void> {
  await pipeline(
    response,
    byteLimitTransform(maxWireBytes, 'wire_size_limit', (bytes) => {
      counters.wireBytes = bytes;
    }),
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
  );
}

function byteLimitTransform(
  limit: number,
  reason: TransportFailureReason,
  observe: (bytes: number) => void,
): Transform {
  let bytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      observe(bytes);
      if (bytes > limit) {
        callback(new ExpectedTransportError(reason));
        return;
      }
      callback(null, chunk);
    },
  });
}

function decoderFor(encoding: 'identity' | 'gzip' | 'deflate' | 'br') {
  switch (encoding) {
    case 'identity':
      return undefined;
    case 'gzip':
      return createGunzip();
    case 'deflate':
      return createInflate();
    case 'br':
      return createBrotliDecompress();
  }
}

function responseMetadata(headers: IncomingHttpHeaders): ResponseMetadata {
  const etag = boundedResponseValidator(singleHeader(headers.etag));
  const lastModified = boundedResponseValidator(
    singleHeader(headers['last-modified']),
  );
  const contentType = boundedResponseMetadata(
    singleHeader(headers['content-type']),
  );
  const contentEncoding = boundedResponseMetadata(
    singleHeader(headers['content-encoding']),
  );
  return Object.freeze({
    ...(etag === undefined ? {} : { etag }),
    ...(lastModified === undefined ? {} : { lastModified }),
    ...(contentType === undefined ? {} : { contentType }),
    ...(contentEncoding === undefined ? {} : { contentEncoding }),
  });
}

function boundedResponseValidator(value: string | undefined) {
  return value !== undefined &&
    value.length <= HTTP_TRANSPORT_HEADER_LIMITS.responseValidator
    ? value
    : undefined;
}

function boundedResponseMetadata(value: string | undefined) {
  return value !== undefined &&
    value.length <= HTTP_TRANSPORT_HEADER_LIMITS.responseMetadata
    ? value
    : undefined;
}

function singleHeader(value: string | readonly string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function boundedContentLength(headers: IncomingHttpHeaders) {
  const value = singleHeader(headers['content-length']);
  if (value === undefined || !/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function acceptedMediaType(
  contentType: string | undefined,
  contentPolicy: import('./fetcher.ts').HttpContentPolicy,
) {
  if (contentType === undefined) return undefined;
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType !== undefined &&
    HTTP_CONTENT_POLICIES[contentPolicy].acceptedMediaTypes.includes(mediaType)
    ? mediaType
    : undefined;
}

function contentEncoding(
  value: string | undefined,
): 'identity' | 'gzip' | 'deflate' | 'br' | undefined {
  const normalized = value?.trim().toLowerCase() ?? 'identity';
  return normalized === 'identity' ||
    normalized === 'gzip' ||
    normalized === 'deflate' ||
    normalized === 'br'
    ? normalized
    : undefined;
}

function retryForStatus(status: number): RetryClassification {
  return status === 408 || status === 429 || (status >= 500 && status <= 599)
    ? 'transient'
    : 'permanent';
}

function classifyRequestError(error: unknown): {
  reason: TransportFailureReason;
  retry: RetryClassification;
  detail: string;
} {
  const code =
    typeof error === 'object' && error !== null
      ? Reflect.get(error, 'code')
      : undefined;
  if (
    typeof code === 'string' &&
    [
      'CERT_HAS_EXPIRED',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'ERR_TLS_CERT_ALTNAME_INVALID',
      'SELF_SIGNED_CERT_IN_CHAIN',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    ].includes(code)
  ) {
    return {
      reason: 'tls_validation_error',
      retry: 'permanent',
      detail: 'TLS certificate validation failed for the approved hostname.',
    };
  }
  return {
    reason: 'network_error',
    retry: 'transient',
    detail: 'The HTTP connection failed before the response completed.',
  };
}

function classifyStreamError(error: unknown): {
  reason: TransportFailureReason;
  retry: RetryClassification;
  detail: string;
} {
  if (error instanceof ExpectedTransportError) {
    return {
      reason: error.reason,
      retry: 'permanent',
      detail: safeFailureDetail(error.reason),
    };
  }
  const code =
    typeof error === 'object' && error !== null
      ? Reflect.get(error, 'code')
      : undefined;
  if (typeof code !== 'string' || !code.startsWith('Z_')) {
    return {
      reason: 'network_error',
      retry: 'transient',
      detail: 'The HTTP response stream ended unexpectedly.',
    };
  }
  return {
    reason: 'decompression_failed',
    retry: 'permanent',
    detail: 'Compressed response content could not be decoded.',
  };
}

function safeFailureDetail(reason: TransportFailureReason): string {
  const details: Record<TransportFailureReason, string> = {
    connect_timeout:
      'Connection establishment exceeded the configured timeout.',
    total_timeout: 'HTTP operation exceeded the configured total timeout.',
    network_error: 'The HTTP connection failed before the response completed.',
    tls_validation_error:
      'TLS certificate validation failed for the approved hostname.',
    http_status: 'HTTP response status did not contain terminal content.',
    wire_size_limit: 'Response exceeded the configured wire-size limit.',
    decompressed_size_limit:
      'Response exceeded the configured decompressed-size limit.',
    unsupported_content_encoding:
      'Terminal response Content-Encoding is not supported.',
    decompression_failed: 'Compressed response content could not be decoded.',
    unsupported_content_type:
      'Terminal response Content-Type is not accepted for this endpoint type.',
    response_header_limit: 'Response header exceeds the configured limit.',
  };
  return details[reason].slice(0, HTTP_TRANSPORT_HEADER_LIMITS.errorDetail);
}

function failureWithoutMetrics(
  reason: TransportFailureReason,
  retry: RetryClassification,
  detail: string,
  response?: ResponseMetadata,
): Omit<FailedFetchResult, 'metrics'> {
  return Object.freeze({
    outcome: 'failure',
    reason,
    retry,
    detail: detail.slice(0, HTTP_TRANSPORT_HEADER_LIMITS.errorDetail),
    ...(response === undefined ? {} : { response }),
  });
}

function failureResult(
  reason: TransportFailureReason,
  retry: RetryClassification,
  detail: string,
  metrics: TransportMetrics,
  response?: ResponseMetadata,
): FailedFetchResult {
  return Object.freeze({
    ...failureWithoutMetrics(reason, retry, detail, response),
    metrics,
  });
}

function defaultRequest(
  protocol: 'http:' | 'https:',
  options: BoundRequestOptions,
  responseListener: (response: IncomingMessage) => void,
): ClientRequest {
  return protocol === 'https:'
    ? requestHttps(options, responseListener)
    : requestHttp(options, responseListener);
}
