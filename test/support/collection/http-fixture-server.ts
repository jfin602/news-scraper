import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { Socket } from 'node:net';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';

const XML = '<rss><channel><title>Fixture</title></channel></rss>';

export interface FixtureRequest {
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly headers: Readonly<
    Record<string, string | readonly string[] | undefined>
  >;
}

export interface HttpFixtureServer {
  readonly address: '127.0.0.1';
  readonly port: number;
  readonly requests: readonly FixtureRequest[];
  readonly openSocketCount: () => number;
  readonly waitForNoOpenSockets: (timeoutMs?: number) => Promise<void>;
  readonly close: () => Promise<void>;
}

export async function startHttpFixtureServer(): Promise<HttpFixtureServer> {
  const requests: FixtureRequest[] = [];
  const sockets = new Set<Socket>();
  const idleWaiters = new Set<() => void>();
  const server = createServer((request, response) => {
    requests.push(
      Object.freeze({
        method: request.method,
        url: request.url,
        headers: Object.freeze({ ...request.headers }),
      }),
    );
    route(request, response);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => {
      sockets.delete(socket);
      if (sockets.size === 0) {
        for (const resolve of idleWaiters) resolve();
        idleWaiters.clear();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('HTTP fixture did not bind to a TCP port');
  }

  return Object.freeze({
    address: '127.0.0.1' as const,
    port: address.port,
    requests,
    openSocketCount: () => sockets.size,
    waitForNoOpenSockets(timeoutMs = 1_000): Promise<void> {
      if (sockets.size === 0) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const onIdle = (): void => {
          clearTimeout(timeout);
          idleWaiters.delete(onIdle);
          resolve();
        };
        const timeout = setTimeout(() => {
          idleWaiters.delete(onIdle);
          reject(
            new Error('Fixture sockets did not close within the deadline'),
          );
        }, timeoutMs);
        idleWaiters.add(onIdle);
      });
    },
    async close(): Promise<void> {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      });
    },
  });
}

function route(request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? '/', 'http://fixture.test');
  const bytes = boundedQueryNumber(url.searchParams.get('bytes'), XML.length);
  const body = Buffer.from('x'.repeat(bytes));

  switch (url.pathname) {
    case '/xml':
      xmlResponse(
        response,
        Buffer.from(XML),
        'application/rss+xml; charset=utf-8',
      );
      return;
    case '/atom':
      xmlResponse(response, Buffer.from(XML), 'application/atom+xml');
      return;
    case '/application-xml':
      xmlResponse(response, Buffer.from(XML), 'application/xml; charset=UTF-8');
      return;
    case '/text-xml':
      xmlResponse(response, Buffer.from(XML), 'text/xml');
      return;
    case '/identity':
      xmlResponse(response, body, 'application/xml');
      return;
    case '/gzip':
      encodedResponse(response, gzipSync(body), 'gzip');
      return;
    case '/deflate':
      encodedResponse(response, deflateSync(body), 'deflate');
      return;
    case '/br':
      encodedResponse(response, brotliCompressSync(body), 'br');
      return;
    case '/malformed-gzip':
      encodedResponse(response, Buffer.from('not a gzip stream'), 'gzip');
      return;
    case '/unsupported-encoding':
      encodedResponse(response, Buffer.from(XML), 'compress');
      return;
    case '/plain':
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end(XML);
      return;
    case '/validators':
      response.writeHead(200, {
        'Content-Type': 'application/rss+xml',
        ETag: '"fixture-etag"',
        'Last-Modified': 'Sat, 08 Aug 2026 12:00:00 GMT',
      });
      response.end(XML);
      return;
    case '/not-modified':
      response.writeHead(304, {
        ETag: '"fixture-etag"',
        'Last-Modified': 'Sat, 08 Aug 2026 12:00:00 GMT',
      });
      response.end();
      return;
    case '/redirect':
      response.writeHead(redirectStatus(url.searchParams.get('status')), {
        Location: '/xml',
      });
      response.end('redirect body');
      return;
    case '/redirect-without-location':
      response.writeHead(308);
      response.end();
      return;
    case '/redirect-long-location':
      response.writeHead(301, { Location: `/${'x'.repeat(8_193)}` });
      response.end();
      return;
    case '/not-found':
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('SYNTHETIC_SECRET_RESPONSE_BODY');
      return;
    case '/request-timeout':
      response.writeHead(408);
      response.end();
      return;
    case '/rate-limited':
      response.writeHead(429);
      response.end();
      return;
    case '/server-error':
      response.writeHead(503);
      response.end('SYNTHETIC_SECRET_RESPONSE_BODY');
      return;
    case '/content-length-oversize':
      response.writeHead(200, {
        'Content-Type': 'application/xml',
        'Content-Length': '1000000',
      });
      response.flushHeaders();
      return;
    case '/stall':
      response.writeHead(200, { 'Content-Type': 'application/xml' });
      response.write('<rss>');
      return;
    case '/reset':
      request.socket.destroy();
      return;
    default:
      response.writeHead(404);
      response.end();
  }
}

function xmlResponse(
  response: ServerResponse,
  body: Buffer,
  contentType: string,
): void {
  response.writeHead(200, { 'Content-Type': contentType });
  response.end(body);
}

function encodedResponse(
  response: ServerResponse,
  body: Buffer,
  contentEncoding: string,
): void {
  response.writeHead(200, {
    'Content-Type': 'application/xml',
    'Content-Encoding': contentEncoding,
  });
  response.end(body);
}

function boundedQueryNumber(value: string | null, fallback: number): number {
  if (value === null || !/^\d{1,7}$/u.test(value)) return fallback;
  return Math.min(Number(value), 2_000_000);
}

function redirectStatus(value: string | null): 301 | 302 | 303 | 307 | 308 {
  const status = Number(value ?? 302);
  return status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
    ? status
    : 302;
}
