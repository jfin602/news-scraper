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
const adminClient = readFileSync(
  new URL('./admin/admin.js', import.meta.url),
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
    <title>Source administration</title>
    <link rel="stylesheet" href="/admin/assets/admin.css">
    <script src="/admin/assets/admin.js" defer></script>
  </head>
  <body>
    <header class="admin-masthead">
      <div>
        <p class="admin-eyebrow">News Scraper</p>
        <h1>Source administration</h1>
        <p>Manage approved RSS/Atom publishers and collection endpoints.</p>
      </div>
      <button type="button" class="button secondary" data-refresh-all>Refresh all</button>
    </header>

    <div class="admin-status" role="status" aria-live="polite" data-admin-status>
      Loading Source administration…
    </div>

    <main class="admin-shell">
      <nav class="panel source-navigation" aria-labelledby="sources-heading">
        <div class="panel-heading">
          <div>
            <p class="section-kicker">Configuration</p>
            <h2 id="sources-heading">Sources</h2>
          </div>
          <button type="button" class="button secondary compact" data-new-source>New Source</button>
        </div>
        <div class="list-state" data-source-list-state="loading">Loading Sources…</div>
        <ul class="selection-list" data-source-list></ul>
      </nav>

      <section class="admin-workspace" aria-label="Selected Source workspace">
        <section class="panel editor-panel" data-source-editor>
          <div class="panel-heading">
            <div>
              <p class="section-kicker">Source</p>
              <h2 data-source-editor-heading>Select a Source</h2>
            </div>
            <div class="state-summary" data-source-state-summary hidden></div>
          </div>
          <p class="section-help" data-source-editor-help>
            Choose a Source from the list or create a new approved publisher configuration.
          </p>
          <form data-source-form hidden>
            <fieldset>
              <legend>Identity and display</legend>
              <div class="form-grid">
                <label>Configuration key
                  <input name="configKey" autocomplete="off" required>
                  <span class="field-help">Immutable after creation.</span>
                </label>
                <label>Display name
                  <input name="displayName" autocomplete="off" required>
                </label>
                <label class="wide-field">Site URL
                  <input name="siteUrl" type="url" autocomplete="url" required>
                </label>
                <label>Priority
                  <input name="priority" type="number" min="0" step="1" required>
                </label>
                <label>Default Category
                  <select name="defaultCategoryConfigKey" data-category-select></select>
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Approved Source domains</legend>
              <p class="field-help">This is the maximum collection boundary. Endpoints may inherit it or narrow it, but cannot widen it.</p>
              <div class="repeatable-list" data-source-domains></div>
              <button type="button" class="button quiet compact" data-add-source-domain>Add domain</button>
            </fieldset>

            <fieldset>
              <legend>RSS/Atom item admission phrases</legend>
              <p class="field-help" data-admission-explanation>
                No phrases means all otherwise-valid RSS/Atom items are admitted. With phrases, any phrase may match the title, summary/content, or Source category labels.
              </p>
              <div class="repeatable-list" data-admission-phrases></div>
              <button type="button" class="button quiet compact" data-add-admission-phrase>Add include phrase</button>
            </fieldset>

            <fieldset data-source-create-state>
              <legend>Initial state</legend>
              <div class="form-grid">
                <label>Approval
                  <select name="approvalState">
                    <option value="unapproved">Unapproved</option>
                    <option value="approved">Approved</option>
                  </select>
                </label>
                <label>Operational state
                  <select name="operationalState">
                    <option value="disabled">Disabled</option>
                    <option value="paused">Paused</option>
                    <option value="enabled">Enabled</option>
                  </select>
                </label>
              </div>
            </fieldset>

            <div class="form-message" role="alert" data-source-form-error hidden></div>
            <div class="form-actions">
              <button type="submit" class="button primary" data-source-submit>Save Source</button>
              <button type="button" class="button secondary" data-source-cancel>Cancel</button>
            </div>
          </form>

          <div class="state-actions" data-source-state-actions hidden>
            <div class="action-group" aria-label="Source approval actions" data-source-approval-actions></div>
            <div class="action-group" aria-label="Source operational-state actions" data-source-operational-actions></div>
            <div class="action-group" aria-label="Source lifecycle actions" data-source-lifecycle-actions></div>
          </div>
        </section>

        <section class="panel endpoint-section" data-endpoint-section hidden>
          <div class="panel-heading">
            <div>
              <p class="section-kicker">Selected Source</p>
              <h2>Endpoints</h2>
            </div>
            <button type="button" class="button secondary compact" data-new-endpoint>New endpoint</button>
          </div>
          <div class="list-state" data-endpoint-list-state="loading">Loading endpoints…</div>
          <ul class="selection-list endpoint-list" data-endpoint-list></ul>

          <section class="nested-editor" data-endpoint-editor>
            <div class="panel-heading nested-heading">
              <h3 data-endpoint-editor-heading>Select an endpoint</h3>
              <div class="state-summary" data-endpoint-state-summary hidden></div>
            </div>
            <p class="section-help" data-endpoint-editor-help>Select an endpoint to edit its configuration and operational state.</p>
            <form data-endpoint-form hidden>
              <fieldset>
                <legend>Endpoint configuration</legend>
                <div class="form-grid">
                  <label>Configuration key
                    <input name="configKey" autocomplete="off" required>
                    <span class="field-help">Immutable after creation.</span>
                  </label>
                  <label>Type
                    <select name="endpointType">
                      <option value="rss_atom">RSS / Atom</option>
                    </select>
                  </label>
                  <label class="wide-field">Endpoint URL
                    <input name="endpointUrl" type="url" autocomplete="url" required>
                  </label>
                  <label>Poll interval (seconds)
                    <input name="pollIntervalSeconds" type="number" min="1" step="1" required>
                  </label>
                  <label>Default Category
                    <select name="defaultCategoryConfigKey" data-category-select></select>
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Endpoint domain policy</legend>
                <label class="choice-row">
                  <input type="radio" name="domainPolicyMode" value="inherit" checked>
                  Inherit the Source maximum
                </label>
                <label class="choice-row">
                  <input type="radio" name="domainPolicyMode" value="narrow">
                  Narrow the Source policy for this endpoint
                </label>
                <p class="field-help">Endpoint rules can only reduce the Source-approved boundary; they cannot add domains.</p>
                <div data-endpoint-domain-editor hidden>
                  <div class="repeatable-list" data-endpoint-domains></div>
                  <button type="button" class="button quiet compact" data-add-endpoint-domain>Add narrowing rule</button>
                </div>
              </fieldset>

              <fieldset data-endpoint-create-state>
                <legend>Initial state</legend>
                <div class="form-grid">
                  <label>Approval
                    <select name="approvalState">
                      <option value="unapproved">Unapproved</option>
                      <option value="approved">Approved</option>
                    </select>
                  </label>
                  <label>Operational state
                    <select name="operationalState">
                      <option value="disabled">Disabled</option>
                      <option value="paused">Paused</option>
                      <option value="enabled">Enabled</option>
                    </select>
                  </label>
                </div>
              </fieldset>

              <div class="form-message" role="alert" data-endpoint-form-error hidden></div>
              <div class="form-actions">
                <button type="submit" class="button primary" data-endpoint-submit>Save endpoint</button>
                <button type="button" class="button secondary" data-endpoint-cancel>Cancel</button>
              </div>
            </form>

            <div class="state-actions" data-endpoint-state-actions hidden>
              <div class="action-group" aria-label="Endpoint approval actions" data-endpoint-approval-actions></div>
              <div class="action-group" aria-label="Endpoint operational-state actions" data-endpoint-operational-actions></div>
              <div class="action-group" aria-label="Endpoint lifecycle actions" data-endpoint-lifecycle-actions></div>
            </div>
          </section>
        </section>

        <section class="panel operational-panel" data-operational-panel hidden>
          <div class="panel-heading">
            <div>
              <p class="section-kicker">Endpoint operations</p>
              <h2>Health and recent runs</h2>
            </div>
            <div class="panel-actions">
              <button type="button" class="button primary" data-check-now>Check now</button>
              <button type="button" class="button secondary" data-refresh-operational>Refresh operational data</button>
            </div>
          </div>
          <p class="section-help">Check now queues durable Worker work. An accepted response does not mean collection has finished.</p>
          <div class="form-message" role="status" aria-live="polite" data-check-now-result hidden></div>
          <div class="operational-state" data-operational-state="loading">Loading operational data…</div>
          <dl class="health-grid" data-health-grid></dl>
          <div class="runs-heading">
            <h3>Recent Collection runs</h3>
            <span>Newest first</span>
          </div>
          <div class="runs-list" data-runs-list></div>
        </section>
      </section>
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
  router.get('/assets/admin.js', (_request, response) => {
    response.status(200).type('js').send(adminClient);
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
