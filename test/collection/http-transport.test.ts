import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ClientRequest } from 'node:http';
import { describe, it } from 'node:test';

import {
  HTTP_TRANSPORT_DEFAULTS,
  resolveFetchRequest,
  type FetchRequest,
  type FetchResult,
} from '../../src/collection/fetchers/fetcher.ts';
import {
  buildValidatedRequestOptions,
  createHttpTransport,
  httpTransport,
  type HttpRequestFunction,
} from '../../src/collection/fetchers/http-transport.ts';
import type { ValidatedDestination } from '../../src/collection/safety/destination-safety.ts';
import {
  startHttpFixtureServer,
  type HttpFixtureServer,
} from '../support/collection/http-fixture-server.ts';

describe('one-hop HTTP transport', () => {
  it('keeps explicit bounded 32 MiB response defaults', () => {
    assert.equal(HTTP_TRANSPORT_DEFAULTS.maxWireBytes, 33_554_432);
    assert.equal(HTTP_TRANSPORT_DEFAULTS.maxDecompressedBytes, 33_554_432);
  });

  it('binds lookup to one validated address while preserving HTTP and TLS hostname semantics', async () => {
    const destination = {
      ...validatedDestination(80, '/xml'),
      addresses: Object.freeze([
        Object.freeze({ address: '127.0.0.1', family: 4 as const }),
        Object.freeze({ address: '::1', family: 6 as const }),
      ]),
    } as ValidatedDestination;
    const options = buildValidatedRequestOptions(
      resolveFetchRequest({ destination, userAgent: 'Test Collector/1' }),
    );

    assert.equal(options.hostname, 'feeds.example.test');
    assert.equal(options.method, 'GET');
    assert.equal(options.path, '/xml');
    assert.equal(options.agent, false);
    assert.equal(options.family, 4);
    assert.equal(options.autoSelectFamily, false);
    assert.equal('rejectUnauthorized' in options, false);

    const httpsOptions = buildValidatedRequestOptions(
      resolveFetchRequest({
        destination: {
          ...destination,
          requestUrl: 'https://feeds.example.test/xml',
          protocol: 'https:',
          port: 443,
        },
      }),
    );
    assert.equal(httpsOptions.hostname, 'feeds.example.test');
    assert.equal(httpsOptions.servername, 'feeds.example.test');
    assert.equal('rejectUnauthorized' in httpsOptions, false);

    const selected = await invokeLookup(options.lookup, 'feeds.example.test');
    assert.deepEqual(selected, { address: '127.0.0.1', family: 4 });
    await assert.rejects(
      invokeLookup(options.lookup, 'unvalidated.example.test'),
      /Unexpected hostname/u,
    );
  });

  it('performs one GET through the supplied address with bounded feed headers and no ambient credentials', async () => {
    await withServer(async (server) => {
      const result = await fetchPath(server, '/xml', {
        userAgent: 'News Scraper Transport Test/1.0',
        validators: {
          etag: '"caller-etag"',
          lastModified: 'Fri, 07 Aug 2026 12:00:00 GMT',
        },
      });

      assert.equal(result.outcome, 'content');
      if (result.outcome !== 'content') return;
      assert.equal(
        new TextDecoder().decode(result.content).includes('<rss>'),
        true,
      );
      assert.equal(result.mediaType, 'application/rss+xml');
      assert.equal(result.metrics.httpStatus, 200);
      assert.equal(result.metrics.wireBytes, result.content.byteLength);
      assert.equal(result.metrics.decompressedBytes, result.content.byteLength);
      assert.deepEqual(
        {
          address: result.metrics.selectedAddress,
          family: result.metrics.selectedAddressFamily,
        },
        { address: '127.0.0.1', family: 4 },
      );

      assert.equal(server.requests.length, 1);
      const request = server.requests[0]!;
      assert.equal(request.method, 'GET');
      assert.equal(request.url, '/xml');
      assert.equal(
        request.headers.host,
        `feeds.example.test:${String(server.port)}`,
      );
      assert.equal(
        request.headers['user-agent'],
        'News Scraper Transport Test/1.0',
      );
      assert.equal(
        request.headers.accept,
        'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8',
      );
      assert.equal(request.headers['accept-encoding'], 'gzip, deflate, br');
      assert.equal(request.headers['if-none-match'], '"caller-etag"');
      assert.equal(
        request.headers['if-modified-since'],
        'Fri, 07 Aug 2026 12:00:00 GMT',
      );
      assert.equal(request.headers.authorization, undefined);
      assert.equal(request.headers.cookie, undefined);
    });
  });

  it('captures response validators and returns 304 without parser content', async () => {
    await withServer(async (server) => {
      const content = await fetchPath(server, '/validators');
      assert.equal(content.outcome, 'content');
      assert.deepEqual(content.response, {
        etag: '"fixture-etag"',
        lastModified: 'Sat, 08 Aug 2026 12:00:00 GMT',
        contentType: 'application/rss+xml',
      });

      const notModified = await fetchPath(server, '/not-modified');
      assert.equal(notModified.outcome, 'not_modified');
      if (notModified.outcome !== 'not_modified') return;
      assert.equal('content' in notModified, false);
      assert.equal(notModified.metrics.httpStatus, 304);
      assert.deepEqual(notModified.response, {
        etag: '"fixture-etag"',
        lastModified: 'Sat, 08 Aug 2026 12:00:00 GMT',
      });
    });
  });

  it('surfaces every supported redirect status without following Location', async () => {
    await withServer(async (server) => {
      for (const status of [301, 302, 303, 307, 308]) {
        const before = server.requests.length;
        const result = await fetchPath(
          server,
          `/redirect?status=${String(status)}`,
        );
        assert.equal(result.outcome, 'redirect');
        if (result.outcome !== 'redirect') continue;
        assert.equal(result.location, '/xml');
        assert.equal(result.metrics.httpStatus, status);
        assert.equal(server.requests.length, before + 1);
      }

      const absent = await fetchPath(server, '/redirect-without-location');
      assert.equal(absent.outcome, 'redirect');
      if (absent.outcome === 'redirect')
        assert.equal(absent.location, undefined);

      const overlong = await fetchPath(server, '/redirect-long-location');
      assertFailure(overlong, 'response_header_limit', 'permanent');
    });
  });

  it('classifies permanent and transient HTTP statuses without exposing response bodies', async () => {
    await withServer(async (server) => {
      const permanent = await fetchPath(server, '/not-found');
      assertFailure(permanent, 'http_status', 'permanent');
      if (permanent.outcome === 'failure') {
        assert.equal(permanent.metrics.httpStatus, 404);
        assert.equal(permanent.detail.includes('SYNTHETIC_SECRET'), false);
      }

      for (const path of [
        '/request-timeout',
        '/rate-limited',
        '/server-error',
      ]) {
        const result = await fetchPath(server, path);
        assertFailure(result, 'http_status', 'transient');
        if (result.outcome === 'failure') {
          assert.equal(result.detail.includes('SYNTHETIC_SECRET'), false);
          assert.ok(result.detail.length <= 160);
        }
      }
    });
  });

  it('enforces Content-Length and streaming wire limits below, at, and above the boundary', async () => {
    await withServer(async (server) => {
      const obvious = await fetchPath(server, '/content-length-oversize', {
        maxWireBytes: 20,
      });
      assertFailure(obvious, 'wire_size_limit', 'permanent');

      for (const [bytes, expected] of [
        [9, 'content'],
        [10, 'content'],
        [11, 'failure'],
      ] as const) {
        const result = await fetchPath(
          server,
          `/identity?bytes=${String(bytes)}`,
          {
            maxWireBytes: 10,
            maxDecompressedBytes: 20,
          },
        );
        assert.equal(result.outcome, expected);
        if (bytes === 11) assertFailure(result, 'wire_size_limit', 'permanent');
      }
      await server.waitForNoOpenSockets();
      assert.equal(server.openSocketCount(), 0);
    });
  });

  it('decodes identity, gzip, deflate, and Brotli with independent output metrics', async () => {
    await withServer(async (server) => {
      for (const path of ['/identity', '/gzip', '/deflate', '/br']) {
        const result = await fetchPath(server, `${path}?bytes=128`);
        assert.equal(result.outcome, 'content', path);
        if (result.outcome !== 'content') continue;
        assert.equal(result.content.byteLength, 128);
        assert.equal(result.metrics.decompressedBytes, 128);
        assert.ok(result.metrics.wireBytes > 0);
      }
    });
  });

  it('enforces decompressed limits below, at, and above the boundary and rejects compressed bombs', async () => {
    await withServer(async (server) => {
      const aboveOldDefault = await fetchPath(
        server,
        `/gzip?bytes=${String(2_097_152 + 1)}`,
      );
      assert.equal(aboveOldDefault.outcome, 'content');

      for (const [bytes, expected] of [
        [9, 'content'],
        [10, 'content'],
        [11, 'failure'],
      ] as const) {
        const result = await fetchPath(server, `/gzip?bytes=${String(bytes)}`, {
          maxWireBytes: 1_000,
          maxDecompressedBytes: 10,
        });
        assert.equal(result.outcome, expected);
        if (bytes === 11) {
          assertFailure(result, 'decompressed_size_limit', 'permanent');
        }
      }

      const bomb = await fetchPath(server, '/gzip?bytes=10000', {
        maxWireBytes: 500,
        maxDecompressedBytes: 100,
      });
      assertFailure(bomb, 'decompressed_size_limit', 'permanent');
      if (bomb.outcome === 'failure') assert.ok(bomb.metrics.wireBytes <= 500);
      await server.waitForNoOpenSockets();
    });
  });

  it('returns bounded typed failures for malformed and unsupported content encodings', async () => {
    await withServer(async (server) => {
      const malformed = await fetchPath(server, '/malformed-gzip');
      assertFailure(malformed, 'decompression_failed', 'permanent');
      const unsupported = await fetchPath(server, '/unsupported-encoding');
      assertFailure(unsupported, 'unsupported_content_encoding', 'permanent');
      await server.waitForNoOpenSockets();
    });
  });

  it('accepts only the explicit XML feed media types including parameters', async () => {
    await withServer(async (server) => {
      for (const path of ['/xml', '/atom', '/application-xml', '/text-xml']) {
        assert.equal((await fetchPath(server, path)).outcome, 'content', path);
      }
      const plain = await fetchPath(server, '/plain');
      assertFailure(plain, 'unsupported_content_type', 'permanent');
    });
  });

  it('uses the HTML-only terminal media policy without weakening RSS/Atom', async () => {
    await withServer(async (server) => {
      const html = await fetchPath(server, '/html-listing', {
        contentPolicy: 'html_listing',
      });
      assert.equal(html.outcome, 'content');
      if (html.outcome === 'content') assert.equal(html.mediaType, 'text/html');
      assert.equal(server.requests.at(-1)?.headers.accept, 'text/html');

      const rssAgainstHtml = await fetchPath(server, '/html-listing');
      assertFailure(rssAgainstHtml, 'unsupported_content_type', 'permanent');
      const htmlAgainstXml = await fetchPath(server, '/xml', {
        contentPolicy: 'html_listing',
      });
      assertFailure(htmlAgainstXml, 'unsupported_content_type', 'permanent');
    });
  });

  it('distinguishes total timeout during a stalled response and closes resources', async () => {
    await withServer(async (server) => {
      const result = await fetchPath(server, '/stall', {
        connectTimeoutMs: 100,
        totalTimeoutMs: 150,
      });
      assertFailure(result, 'total_timeout', 'transient');
      await server.waitForNoOpenSockets();
      assert.equal(server.openSocketCount(), 0);
    });
  });

  it('classifies a deterministic stalled connection as connect timeout and destroys the request', async () => {
    const hanging = new HangingRequest();
    const request: HttpRequestFunction = () =>
      hanging as unknown as ClientRequest;
    const transport = createHttpTransport({ request });
    const result = await transport.fetch({
      destination: validatedDestination(80, '/xml'),
      connectTimeoutMs: 20,
      totalTimeoutMs: 100,
    });

    assertFailure(result, 'connect_timeout', 'transient');
    assert.equal(hanging.ended, true);
    assert.equal(hanging.destroyed, true);
    assert.equal(hanging.socket.listenerCount('connect'), 0);
  });

  it('classifies TLS certificate validation failures as permanent without weakening verification', async () => {
    const tlsFailure = Object.assign(
      new Error('synthetic certificate detail'),
      {
        code: 'ERR_TLS_CERT_ALTNAME_INVALID',
      },
    );
    const failedRequest = new ImmediateErrorRequest(tlsFailure);
    const transport = createHttpTransport({
      request: () => failedRequest as unknown as ClientRequest,
    });
    const result = await transport.fetch({
      destination: validatedDestination(80, '/xml'),
    });

    assertFailure(result, 'tls_validation_error', 'permanent');
    if (result.outcome === 'failure') {
      assert.equal(
        result.detail.includes('synthetic certificate detail'),
        false,
      );
    }
  });

  it('returns a bounded transient network failure when the peer resets', async () => {
    await withServer(async (server) => {
      const result = await fetchPath(server, '/reset');
      assertFailure(result, 'network_error', 'transient');
      if (result.outcome === 'failure') {
        assert.ok(result.detail.length <= 160);
        assert.equal(result.detail.includes('/reset'), false);
      }
      await server.waitForNoOpenSockets();
    });
  });

  it('rejects invalid timeout, size, user-agent, and conditional-header configuration before I/O', async () => {
    const destination = validatedDestination(80, '/xml');
    await assert.rejects(
      httpTransport.fetch({ destination, connectTimeoutMs: 0 }),
      /connectTimeoutMs/u,
    );
    await assert.rejects(
      httpTransport.fetch({
        destination,
        connectTimeoutMs: 20,
        totalTimeoutMs: 10,
      }),
      /must not exceed/u,
    );
    await assert.rejects(
      httpTransport.fetch({ destination, maxWireBytes: -1 }),
      /maxWireBytes/u,
    );
    await assert.rejects(
      httpTransport.fetch({
        destination,
        userAgent: 'unsafe\r\nHeader: value',
      }),
      /userAgent/u,
    );
    await assert.rejects(
      httpTransport.fetch({
        destination,
        validators: { etag: 'unsafe\nvalue' },
      }),
      /validators.etag/u,
    );
  });
});

class HangingRequest extends EventEmitter {
  ended = false;
  destroyed = false;
  readonly socket = Object.assign(new EventEmitter(), { connecting: true });

  end(): void {
    this.ended = true;
    this.emit('socket', this.socket);
  }

  destroy(error?: Error): this {
    this.destroyed = true;
    if (error !== undefined) queueMicrotask(() => this.emit('error', error));
    return this;
  }
}

class ImmediateErrorRequest extends EventEmitter {
  private readonly error: Error;

  constructor(error: Error) {
    super();
    this.error = error;
  }

  end(): void {
    queueMicrotask(() => this.emit('error', this.error));
  }

  destroy(): this {
    return this;
  }
}

async function withServer(
  work: (server: HttpFixtureServer) => Promise<void>,
): Promise<void> {
  const server = await startHttpFixtureServer();
  try {
    await work(server);
  } finally {
    await server.close();
  }
}

function fetchPath(
  server: HttpFixtureServer,
  path: string,
  overrides: Omit<FetchRequest, 'destination'> = {},
): Promise<FetchResult> {
  return httpTransport.fetch({
    ...overrides,
    destination: validatedDestination(server.port, path),
  });
}

function validatedDestination(
  port: number,
  path: string,
): ValidatedDestination {
  return Object.freeze({
    status: 'validated',
    context: 'initial',
    requestUrl: `http://feeds.example.test${path}`,
    protocol: 'http:',
    hostname: 'feeds.example.test',
    // Direct transport-fixture tests intentionally exercise the post-validation
    // primitive on an ephemeral local port without weakening Phase 4 policy.
    port,
    addresses: Object.freeze([
      Object.freeze({ address: '127.0.0.1', family: 4 as const }),
    ]),
  }) as ValidatedDestination;
}

function assertFailure(
  result: FetchResult,
  reason: string,
  retry: string,
): void {
  assert.equal(result.outcome, 'failure');
  if (result.outcome !== 'failure') return;
  assert.equal(result.reason, reason);
  assert.equal(result.retry, retry);
  assert.ok(result.detail.length <= 160);
}

type Lookup = (
  hostname: string,
  options: { readonly all: false },
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string,
    family: number,
  ) => void,
) => void;

function invokeLookup(
  lookup: unknown,
  hostname: string,
): Promise<{ address: string; family: number }> {
  return new Promise((resolve, reject) => {
    (lookup as Lookup)(hostname, { all: false }, (error, address, family) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve({ address, family });
    });
  });
}
