import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { Socket } from 'node:net';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';

const XML = '<rss><channel><title>Fixture</title></channel></rss>';
const RSS_WITH_ITEM = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Fixture</title><item>
<guid>fixture-1</guid><title>Canonical fixture item</title>
<link>https://feeds.example.test/articles/fixture-1</link>
</item></channel></rss>`;
const PHASE_6_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Phase 6 fixture</title>
<item><guid>phase6-rss-1</guid>
<title><![CDATA[Safe <b>Title</b> &amp; Entities]]></title>
<link>https://feeds.example.test/articles/one?utm_source=fixture&amp;edition=pro#section</link>
<description><![CDATA[<p>Hello &amp; <strong>world</strong></p><script>SYNTHETIC_SCRIPT_SECRET</script><style>.hidden{display:none}</style>]]></description>
<pubDate>Mon, 10 Aug 2026 07:00:00 -0500</pubDate></item>
<item><guid>phase6-rss-2</guid><title>Missing date</title>
<link>https://feeds.example.test/articles/two</link></item>
<item><guid>phase6-rss-3</guid><title>Invalid date</title>
<link>https://feeds.example.test/articles/three</link><pubDate>not-a-date</pubDate></item>
<item><guid>phase6-rss-4</guid><link>https://feeds.example.test/articles/missing-title</link></item>
<item><guid>phase6-rss-5</guid><title>Outside policy</title>
<link>https://outside.example/articles/five</link></item>
</channel></rss>`;
const PHASE_6_ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Phase 6 Atom</title>
<entry><id>phase6-atom-1</id><title>Atom candidate</title>
<link rel="alternate" href="https://feeds.example.test/articles/atom-one" />
<published>2026-08-10T12:30:00-05:00</published></entry>
</feed>`;
const PHASE_6_RELATIVE_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Redirected fixture</title><item>
<guid>phase6-relative-1</guid><title>Redirect-relative candidate</title>
<link>../articles/redirected?utm_medium=fixture&amp;edition=semantic#fragment</link>
</item></channel></rss>`;
const PHASE_6_ZERO_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Zero fixture</title></channel></rss>`;
const HTML_LISTING = `<!doctype html><html><body>
<main class="listing">
  <article class="item"><h2 class="title">Static fixture</h2><a class="article" href="../articles/static?utm_source=fixture">Read</a></article>
  <article class="item"><h2 class="title">Malformed row</h2></article>
</main>
<a href="/next-page">Next</a><img src="/image.png"><script src="/script.js"></script>
</body></html>`;

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
    case '/rss-items':
      xmlResponse(
        response,
        Buffer.from(RSS_WITH_ITEM),
        'application/rss+xml; charset=utf-8',
      );
      return;
    case '/phase6/rss':
      xmlResponse(
        response,
        Buffer.from(PHASE_6_RSS),
        'application/rss+xml; charset=utf-8',
      );
      return;
    case '/phase6/atom':
      xmlResponse(
        response,
        Buffer.from(PHASE_6_ATOM),
        'application/atom+xml; charset=utf-8',
      );
      return;
    case '/phase6/redirect':
      redirectResponse(response, '/phase6/feeds/final.xml');
      return;
    case '/phase6/feeds/final.xml':
      xmlResponse(
        response,
        Buffer.from(PHASE_6_RELATIVE_RSS),
        'application/rss+xml; charset=utf-8',
      );
      return;
    case '/phase6/zero':
      xmlResponse(
        response,
        Buffer.from(PHASE_6_ZERO_RSS),
        'application/rss+xml; charset=utf-8',
      );
      return;
    case '/html-listing':
      htmlResponse(
        response,
        Buffer.from(HTML_LISTING),
        'text/html; charset=utf-8',
      );
      return;
    case '/redirect-html-listing':
      redirectResponse(response, '/lists/current/index.html');
      return;
    case '/lists/current/index.html':
      htmlResponse(
        response,
        Buffer.from(HTML_LISTING),
        'text/html; charset=utf-8',
      );
      return;
    case '/html-not-modified':
      response.writeHead(304, { ETag: '"html-fixture-etag"' });
      response.end();
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
    case '/redirect-rss-items':
      redirectResponse(response, '/rss-items');
      return;
    case '/redirect-relative':
      redirectResponse(response, '../xml');
      return;
    case '/redirect-absolute':
      redirectResponse(response, 'http://feeds.example.test/xml');
      return;
    case '/redirect-two':
      redirectResponse(response, '/redirect-relative');
      return;
    case '/redirect-not-modified':
      redirectResponse(response, '/not-modified');
      return;
    case '/redirect-server-error':
      redirectResponse(response, '/server-error');
      return;
    case '/redirect-oversized':
      redirectResponse(response, '/content-length-oversize');
      return;
    case '/redirect-malformed':
      redirectResponse(response, 'http://[malformed');
      return;
    case '/redirect-blank-location':
      redirectResponse(response, ' ');
      return;
    case '/redirect-loop-a':
      redirectResponse(response, '/redirect-loop-b');
      return;
    case '/redirect-loop-b':
      redirectResponse(response, '/redirect-loop-a');
      return;
    case '/redirect-chain': {
      const remaining = boundedQueryNumber(
        url.searchParams.get('remaining'),
        0,
      );
      redirectResponse(
        response,
        remaining === 0
          ? '/xml'
          : `/redirect-chain?remaining=${String(remaining - 1)}`,
      );
      return;
    }
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

function htmlResponse(
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

function redirectResponse(response: ServerResponse, location: string): void {
  response.writeHead(302, { Location: location });
  response.end();
}

function boundedQueryNumber(value: string | null, fallback: number): number {
  if (value === null || !/^\d{1,7}$/u.test(value)) return fallback;
  return Math.min(Number(value), 3_000_000);
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
