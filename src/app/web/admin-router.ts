import { readFileSync } from 'node:fs';

import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
  type Router,
} from 'express';

export const ADMIN_REQUEST_HEADER = 'X-News-Scraper-Admin-Request';
export const ADMIN_REQUEST_HEADER_VALUE = '1';
export const ADMIN_API_JSON_BODY_LIMIT_BYTES = 64 * 1024;
export const adminContentSecurityPolicy =
  "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'";

export type AdminApiRouteRegistrar = (router: Router) => void;

const unsafeAdminMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const adminStylesheet = readFileSync(
  new URL('./admin/admin.css', import.meta.url),
  'utf8',
);
const adminJsonParser = express.json({
  limit: ADMIN_API_JSON_BODY_LIMIT_BYTES,
  strict: true,
  type: 'application/json',
});

const adminPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Administration</title>
    <link rel="stylesheet" href="/admin/assets/admin.css">
  </head>
  <body>
    <main class="admin-shell">
      <h1>Administration</h1>
      <p>The Source administration workspace is being prepared.</p>
    </main>
  </body>
</html>`;

export function createAdminPageRouter(): Router {
  const router = express.Router();
  router.use(setAdminSecurityHeaders);
  router.get('/', (_request, response) => {
    response.status(200).type('html').send(adminPage);
  });
  router.get('/assets/admin.css', (_request, response) => {
    response.status(200).type('css').send(adminStylesheet);
  });
  return router;
}

export function createAdminApiRouter(
  registerRoutes?: AdminApiRouteRegistrar,
): Router {
  const router = express.Router();
  router.use(setAdminSecurityHeaders);
  router.use(enforceAdminMutationIntegrity);
  registerRoutes?.(router);
  router.use((_request, response) => {
    response.status(404).json({ error: 'not_found' });
  });
  router.use(adminApiErrorHandler);
  return router;
}

function setAdminSecurityHeaders(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': adminContentSecurityPolicy,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  next();
}

function enforceAdminMutationIntegrity(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (!unsafeAdminMethods.has(request.method)) {
    next();
    return;
  }

  if (request.get(ADMIN_REQUEST_HEADER) !== ADMIN_REQUEST_HEADER_VALUE) {
    response.status(403).json({ error: 'request_integrity_required' });
    return;
  }
  if (request.is('application/json') !== 'application/json') {
    response.status(415).json({ error: 'json_content_type_required' });
    return;
  }
  adminJsonParser(request, response, next);
}

const adminApiErrorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  void next;
  const errorType = reflectedString(error, 'type');
  if (errorType === 'entity.too.large') {
    response.status(413).json({ error: 'request_too_large' });
    return;
  }
  if (errorType === 'entity.parse.failed') {
    response.status(400).json({ error: 'invalid_json' });
    return;
  }
  response.status(500).json({ error: 'internal_error' });
};

function reflectedString(value: unknown, property: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const reflected = Reflect.get(value, property);
  return typeof reflected === 'string' ? reflected : undefined;
}
