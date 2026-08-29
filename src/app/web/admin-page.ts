import { readFileSync } from 'node:fs';

import type { Router } from 'express';

const adminStylesheet = readFileSync(
  new URL('./admin/admin.css', import.meta.url),
  'utf8',
);
const adminClient = readFileSync(
  new URL('./admin/admin.js', import.meta.url),
  'utf8',
);
const adminModuleAssets = Object.fromEntries(
  [
    'catalog.js',
    'credentials.js',
    'core.js',
    'editorial.js',
    'moderation.js',
    'operations.js',
    'profiles.js',
    'publication.js',
    'sources.js',
  ].map((name) => [
    name,
    {
      content: readFileSync(
        new URL(`./admin/${name}`, import.meta.url),
        'utf8',
      ),
      type: 'js',
    },
  ]),
);
const adminPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>News Scraper administration</title>
    <link rel="stylesheet" href="/admin/assets/admin.css">
    <script type="module" src="/admin/assets/admin.js"></script>
  </head>
  <body>
    <header class="admin-masthead">
      <div>
        <p class="admin-eyebrow">News Scraper</p>
        <h1>Administration</h1>
        <p>Manage this installation's Publication and approved collection Sources.</p>
      </div>
      <button type="button" class="button secondary" data-refresh-all>Refresh all</button>
    </header>

    <div class="admin-status" role="status" aria-live="polite" data-admin-status>
      Loading administration…
    </div>

    <main class="admin-shell">
      <nav class="panel workspace-navigation" aria-label="Admin workspaces">
        <p class="section-kicker">Configuration</p>
        <div class="workspace-tabs" role="tablist" aria-label="Admin workspaces">
          <button type="button" class="workspace-tab" role="tab" aria-selected="false" aria-controls="publication-workspace" data-workspace="publication">
            <span>Publication</span>
            <span class="workspace-tab-description">Identity, branding, and feed state</span>
          </button>
          <button type="button" class="workspace-tab" role="tab" aria-selected="false" aria-controls="operations-workspace" data-workspace="operations">
            <span>Operations</span>
            <span class="workspace-tab-description">Current health and collection backlog</span>
          </button>
          <button type="button" class="workspace-tab" role="tab" aria-selected="true" aria-controls="sources-workspace" data-workspace="sources">
            <span>Sources</span>
            <span class="workspace-tab-description">Publishers and collection endpoints</span>
          </button>
          <button type="button" class="workspace-tab" role="tab" aria-selected="false" aria-controls="editorial-workspace" data-workspace="editorial">
            <span>Editorial</span>
            <span class="workspace-tab-description">Categories and Relevance</span>
          </button>
          <button type="button" class="workspace-tab" role="tab" aria-selected="false" aria-controls="profiles-workspace" data-workspace="profiles">
            <span>Profiles</span>
            <span class="workspace-tab-description">Distribution filters and lifecycle</span>
          </button>
          <button type="button" class="workspace-tab" role="tab" aria-selected="false" aria-controls="credentials-workspace" data-workspace="credentials">
            <span>Credentials</span>
            <span class="workspace-tab-description">Machine distribution access</span>
          </button>
          <button type="button" class="workspace-tab" role="tab" aria-selected="false" aria-controls="articles-workspace" data-workspace="articles">
            <span>Articles</span>
            <span class="workspace-tab-description">Moderation and duplicate review</span>
          </button>
        </div>
      </nav>

      <section class="admin-content">
        <section class="workspace-panel" id="operations-workspace" data-workspace-panel="operations" aria-labelledby="operations-heading" hidden>
          <section class="panel operations-panel">
            <div class="panel-heading">
              <div>
                <p class="section-kicker">Current installation state</p>
                <h2 id="operations-heading" tabindex="-1">Operations</h2>
              </div>
              <button type="button" class="button secondary" data-refresh-operations>Refresh Operations</button>
            </div>
            <p class="section-help">A read-only snapshot of current endpoint health, queued work, and active alerts.</p>
            <div class="workspace-state" tabindex="-1" data-operations-state="idle" role="status" aria-live="polite">Open Operations to load the current snapshot.</div>
            <div data-operations-content hidden>
              <div class="operations-summary" data-operations-summary></div>
              <div class="operations-grid">
                <section>
                  <h3>Endpoint health</h3>
                  <dl class="operations-facts" data-operations-health-counts></dl>
                </section>
                <section>
                  <h3>Collection work</h3>
                  <dl class="operations-facts" data-operations-queue></dl>
                </section>
              </div>
              <section>
                <h3>Actionable endpoints</h3>
                <div class="bounded-list" data-operations-endpoints></div>
              </section>
              <section>
                <h3>Current alerts</h3>
                <div class="bounded-list" data-operations-alerts></div>
              </section>
              <section>
                <h3>Collection policy</h3>
                <dl class="operations-facts operations-policy" data-operations-policy></dl>
              </section>
            </div>
          </section>
        </section>

        <section class="workspace-panel" id="publication-workspace" data-workspace-panel="publication" aria-labelledby="publication-heading" hidden>
          <section class="panel editor-panel publication-panel">
            <div class="panel-heading">
              <div>
                <p class="section-kicker">Singleton configuration</p>
                <h2 id="publication-heading">Publication</h2>
              </div>
            </div>
            <div class="workspace-state" data-publication-state="loading" role="status" aria-live="polite">Loading Publication…</div>
            <form data-publication-form hidden>
              <fieldset>
                <legend>Publication identity</legend>
                <div class="form-grid">
                  <label class="wide-field">Name
                    <input name="name" autocomplete="organization" required>
                  </label>
                  <label class="wide-field">Description
                    <textarea name="description" rows="4" maxlength="500"></textarea>
                    <span class="field-help">Optional plain-text description shown with the public feed.</span>
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Collection and public exposure</legend>
                <label class="choice-row">
                  <input name="activeForCollection" type="checkbox">
                  Collection is active
                </label>
                <p class="field-help">When active, eligible approved Sources and endpoints may run. This does not make the public feed visible.</p>
                <label>Public feed status
                  <select name="publicStatus">
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </label>
                <p class="field-help">Private hides the public feed; it does not pause collection. These two global controls are independent.</p>
              </fieldset>

              <fieldset>
                <legend>Presentation</legend>
                <div class="form-grid">
                  <label>Logo path
                    <input name="logoPath" autocomplete="off" placeholder="/logo.svg">
                    <span class="field-help">Optional same-origin path.</span>
                  </label>
                  <label>Accent color
                    <input name="accentColor" autocomplete="off" placeholder="#164E63">
                    <span class="field-help">Optional six-digit sRGB color.</span>
                  </label>
                  <label class="wide-field">Presentation timezone
                    <input name="presentationTimezone" autocomplete="off" placeholder="America/Chicago">
                    <span class="field-help" data-timezone-hint>No timezone configured; calendar dates use UTC. This changes presentation only, not stored timestamps or feed order.</span>
                  </label>
                </div>
              </fieldset>

              <div class="form-message" role="alert" tabindex="-1" data-publication-form-error hidden></div>
              <div class="form-actions">
                <button type="submit" class="button primary" data-publication-submit>Save Publication</button>
              </div>
            </form>
          </section>
        </section>

        <section class="workspace-panel" id="sources-workspace" data-workspace-panel="sources" aria-labelledby="sources-heading">
          <div class="source-workspace-layout">
            <nav class="panel source-navigation" aria-labelledby="sources-heading">
              <div class="panel-heading">
                <div>
                  <p class="section-kicker">Collection configuration</p>
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
              <legend>RSS/Atom Include phrases</legend>
              <p class="field-help" data-admission-explanation>Optional. Empty means all otherwise-valid RSS/Atom items pass the Include side. Any phrase may match title, summary/content, or Source Category labels. HTML listing selectors decide which HTML rows become Raw items; this is not an HTML keyword filter or Relevance rule.</p>
              <div class="repeatable-list" data-admission-include-phrases></div>
              <button type="button" class="button quiet compact" data-add-admission-include-phrase>Add Include phrase</button>
            </fieldset>

            <fieldset>
              <legend>RSS/Atom Exclude phrases</legend>
              <p class="field-help">Optional. Any matching phrase rejects an RSS/Atom item, even if it passes Include. This is not an HTML keyword filter, Relevance rule, public search, or Profile filter.</p>
              <div class="repeatable-list" data-admission-exclude-phrases></div>
              <button type="button" class="button quiet compact" data-add-admission-exclude-phrase>Add Exclude phrase</button>
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
                      <option value="html_listing">HTML listing</option>
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

              <fieldset data-html-profile hidden>
                <legend>Static HTML listing profile</legend>
                <p class="field-help">Use bounded CSS selectors for a static HTML listing. This configuration does not crawl Article pages, follow pagination, or run browser scripts. Article links may be relative because real collection resolves them against the fetched endpoint URL.</p>
                <div class="form-grid">
                  <label class="wide-field">Item/root CSS selector
                    <input name="htmlItemSelector" data-html-required autocomplete="off">
                  </label>
                  <label>Title selector
                    <input name="htmlTitleSelector" data-html-required autocomplete="off">
                  </label>
                  <label>Article-link selector
                    <input name="htmlArticleLinkSelector" data-html-required autocomplete="off">
                    <span class="field-help">The parser extracts the governed link href.</span>
                  </label>
                  <label>Published date selector
                    <input name="htmlPublishedAtSelector" autocomplete="off">
                  </label>
                  <label>Published date extraction
                    <select name="htmlPublishedAtMode">
                      <option value="text">Text</option>
                      <option value="attribute">Allowlisted attribute</option>
                    </select>
                  </label>
                  <label data-html-date-attribute="publishedAt" hidden>Published date attribute
                    <select name="htmlPublishedAtAttribute">
                      <option value="datetime">datetime</option>
                      <option value="data-published-at">data-published-at</option>
                      <option value="data-updated-at">data-updated-at</option>
                    </select>
                  </label>
                  <label>Updated date selector
                    <input name="htmlUpdatedAtSelector" autocomplete="off">
                  </label>
                  <label>Updated date extraction
                    <select name="htmlUpdatedAtMode">
                      <option value="text">Text</option>
                      <option value="attribute">Allowlisted attribute</option>
                    </select>
                  </label>
                  <label data-html-date-attribute="updatedAt" hidden>Updated date attribute
                    <select name="htmlUpdatedAtAttribute">
                      <option value="datetime">datetime</option>
                      <option value="data-published-at">data-published-at</option>
                      <option value="data-updated-at">data-updated-at</option>
                    </select>
                  </label>
                  <label>Author selector
                    <input name="htmlAuthorSelector" autocomplete="off">
                  </label>
                  <label>Summary selector
                    <input name="htmlSummarySelector" autocomplete="off">
                  </label>
                  <label>Category-label selector
                    <input name="htmlCategoriesSelector" autocomplete="off">
                  </label>
                </div>
                <p class="field-help" data-endpoint-profile-revision hidden></p>
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

            <section class="html-preview-panel" data-html-preview-panel hidden aria-labelledby="html-preview-heading">
              <div class="panel-heading nested-heading">
                <div>
                  <h3 id="html-preview-heading">HTML sample preview</h3>
                  <p class="section-help">Paste a bounded sample to test the draft profile. Preview parses only this sample, performs no network request, and does not save the endpoint or prove collection.</p>
                </div>
              </div>
              <label>Operator-supplied HTML sample
                <textarea data-html-preview-sample rows="8" spellcheck="false"></textarea>
              </label>
              <div class="form-actions">
                <button type="button" class="button secondary" data-html-preview>Preview draft</button>
              </div>
              <div class="form-message" role="status" aria-live="polite" data-html-preview-status hidden></div>
              <div class="html-preview-results" data-html-preview-results></div>
            </section>

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
          </div>
        </section>

        <section class="workspace-panel" id="profiles-workspace" data-workspace-panel="profiles" aria-labelledby="profiles-heading" hidden>
          <div class="profiles-workspace-layout">
            <nav class="panel profiles-navigation" aria-labelledby="profiles-heading">
              <div class="panel-heading">
                <div>
                  <p class="section-kicker">Distribution configuration</p>
                  <h2 id="profiles-heading">Profiles</h2>
                </div>
                <div class="panel-actions">
                  <button type="button" class="button secondary compact" data-refresh-profiles>Refresh Profiles</button>
                  <button type="button" class="button secondary compact" data-new-profile>New Profile</button>
                </div>
              </div>
              <div class="list-state" data-profile-list-state="idle" role="status" aria-live="polite">Open Profiles to load configured Profiles.</div>
              <ul class="selection-list" data-profile-list></ul>
            </nav>

            <section class="admin-workspace" aria-label="Selected Distribution Profile workspace">
              <section class="panel editor-panel" data-profile-editor>
                <div class="panel-heading">
                  <div>
                    <p class="section-kicker">Distribution Profile</p>
                    <h2 data-profile-editor-heading>Select a Profile</h2>
                  </div>
                  <div class="state-summary" data-profile-state-summary hidden></div>
                </div>
                <p class="section-help" data-profile-editor-help>Choose a Profile to configure its distribution filters and lifecycle.</p>
                <form data-profile-create-form hidden>
                  <fieldset>
                    <legend>Create draft Profile</legend>
                    <div class="form-grid">
                      <label>Configuration key
                        <input name="configKey" autocomplete="off" required>
                        <span class="field-help">Immutable after creation.</span>
                      </label>
                      <label>Display name
                        <input name="displayName" autocomplete="off" required>
                      </label>
                      <label>Result limit
                        <input name="resultLimit" type="number" min="1" step="1" required value="100">
                      </label>
                    </div>
                  </fieldset>
                  <div class="form-message" role="alert" tabindex="-1" data-profile-create-error hidden></div>
                  <div class="form-actions">
                    <button type="submit" class="button primary">Create draft Profile</button>
                    <button type="button" class="button secondary" data-profile-create-cancel>Cancel</button>
                  </div>
                </form>

                <form data-profile-configuration-form hidden>
                  <fieldset>
                    <legend>Profile configuration</legend>
                    <div class="form-grid">
                      <label>Configuration key
                        <input name="configKey" autocomplete="off" disabled>
                        <span class="field-help">Immutable Profile identity.</span>
                      </label>
                      <label>Display name
                        <input name="displayName" autocomplete="off" required>
                      </label>
                      <label>Result limit
                        <input name="resultLimit" type="number" min="1" step="1" required>
                      </label>
                    </div>
                  </fieldset>
                  <div class="form-message" role="alert" tabindex="-1" data-profile-configuration-error hidden></div>
                  <div class="form-actions">
                    <button type="submit" class="button primary">Save Profile configuration</button>
                  </div>
                </form>
                <div class="state-actions" data-profile-lifecycle-actions hidden></div>
              </section>

              <section class="panel" data-profile-ai hidden>
                <div class="panel-heading">
                  <div>
                    <p class="section-kicker">Optional assistance</p>
                    <h2>AI digest</h2>
                  </div>
                </div>
                <p class="section-help">Digest evaluations run twice daily at 00:00 and 12:00 UTC. Gemini credentials are deployment configuration and are never entered here.</p>
                <div class="workspace-state" data-profile-ai-state="idle" role="status" aria-live="polite">Select a Profile to load its AI digest state.</div>
                <form data-profile-ai-configuration-form hidden>
                  <fieldset>
                    <legend>Digest configuration</legend>
                    <label class="choice-row">
                      <input name="digestEnabled" type="checkbox">
                      Enable this Profile's digest
                    </label>
                    <div class="form-grid">
                      <label>Lookback days
                        <input name="lookbackDays" type="number" min="1" max="30" step="1" required>
                        <span class="field-help">One to 30 days; default 7.</span>
                      </label>
                      <label>Maximum input Articles
                        <input name="maxArticles" type="number" min="1" max="20" step="1" required>
                        <span class="field-help">One to 20 governed Articles; default 20.</span>
                      </label>
                    </div>
                    <div class="form-grid">
                      <label class="wide-field">Digest writing style
                        <textarea name="digestStyleGuidance" rows="4" aria-describedby="profile-ai-style-help"></textarea>
                        <span class="field-help" id="profile-ai-style-help">Optional; blank uses the normal/default digest writing style. Up to 500 Unicode code points.</span>
                      </label>
                    </div>
                  </fieldset>
                  <div class="form-message" role="alert" tabindex="-1" data-profile-ai-configuration-error hidden></div>
                  <div class="form-actions">
                    <button type="submit" class="button primary">Save AI settings</button>
                    <button type="button" class="button secondary" data-profile-ai-generate>Generate now</button>
                  </div>
                </form>
                <div class="form-message" role="status" aria-live="polite" data-profile-ai-generation-result hidden></div>
                <dl class="operations-facts" data-profile-ai-active-digest hidden></dl>
                <dl class="operations-facts" data-profile-ai-latest-attempt hidden></dl>
              </section>

              <section class="panel" data-profile-associations hidden>
                <div class="panel-heading">
                  <div>
                    <p class="section-kicker">Profile membership</p>
                    <h2>Source associations</h2>
                  </div>
                </div>
                <p class="section-help">Filters narrow this Profile's distribution output only. They do not change Source RSS/Atom collection admission.</p>
                <div class="form-message" role="alert" tabindex="-1" data-profile-association-error hidden></div>
                <div class="bounded-list" data-profile-association-list></div>
                <form data-profile-association-form>
                  <fieldset>
                    <legend data-profile-association-heading>Add Source association</legend>
                    <label>Source
                      <select name="sourceConfigKey" data-profile-source-select required></select>
                    </label>
                    <div class="form-grid profile-filter-grid">
                      <label class="wide-field">Include phrases
                        <textarea name="includeAnyPhrases" rows="3"></textarea>
                        <span class="field-help">One phrase per line. Any configured include phrase may match; leave empty for no include restriction.</span>
                      </label>
                      <label class="wide-field">Exclude phrases
                        <textarea name="excludeAnyPhrases" rows="3"></textarea>
                        <span class="field-help">One phrase per line. An exclude match wins; leave empty for no exclude restriction.</span>
                      </label>
                    </div>
                    <fieldset class="nested-fieldset">
                      <legend>Category restrictions</legend>
                      <p class="field-help">Choose configured Categories to restrict this association. Leave all clear for no Category restriction.</p>
                      <div class="category-option-list" data-profile-category-options></div>
                    </fieldset>
                  </fieldset>
                  <div class="form-actions">
                    <button type="submit" class="button primary" data-profile-association-submit>Add Source association</button>
                    <button type="button" class="button secondary" data-profile-association-cancel hidden>Cancel association edit</button>
                  </div>
                </form>
              </section>
            </section>
          </div>
        </section>

        <section class="workspace-panel" id="editorial-workspace" data-workspace-panel="editorial" aria-labelledby="editorial-heading" hidden>
          <div class="editorial-workspace-layout">
            <nav class="panel editorial-navigation" aria-label="Editorial resources">
              <div class="panel-heading"><div><p class="section-kicker">Editorial configuration</p><h2 id="editorial-heading">Editorial</h2></div></div>
              <button type="button" class="button secondary compact" data-new-category>New Category</button>
              <div class="list-state" data-category-list-state="loading">Loading Categories…</div><ul class="selection-list" data-category-list></ul>
              <button type="button" class="button secondary compact" data-new-rule>New Relevance rule</button>
              <div class="list-state" data-rule-list-state="loading">Loading Relevance rules…</div><ul class="selection-list" data-rule-list></ul>
            </nav>
            <section class="admin-workspace" aria-label="Editorial editor">
              <section class="panel editor-panel"><div class="panel-heading"><div><p class="section-kicker">Categories</p><h2 data-category-editor-heading>Select a Category</h2></div></div><p class="section-help" data-category-editor-help>Create a bounded editorial grouping for default and rule assignments.</p><form data-category-form hidden><fieldset><legend>Category configuration</legend><div class="form-grid"><label>Configuration key<input name="configKey" required autocomplete="off"><span class="field-help">Immutable after creation.</span></label><label>Display name<input name="displayName" required autocomplete="off"></label></div></fieldset><div class="form-message" role="alert" tabindex="-1" data-category-form-error hidden></div><div class="form-actions"><button type="submit" class="button primary" data-category-submit>Save Category</button><button type="button" class="button secondary" data-category-cancel>Cancel</button><button type="button" class="button danger" data-category-delete hidden>Remove Category</button></div></form></section>
              <section class="panel editor-panel"><div class="panel-heading"><div><p class="section-kicker">Bounded literal rules</p><h2 data-rule-editor-heading>Select a Relevance rule</h2></div></div><p class="section-help" data-rule-editor-help>Rules are applied prospectively during collection.</p><form data-rule-form hidden><fieldset><legend>Rule configuration</legend><div class="form-grid"><label>Configuration key<input name="configKey" required autocomplete="off"><span class="field-help">Immutable after creation.</span></label><label>Predicate<select name="predicateType"><option value="title_contains">Title contains</option><option value="summary_contains">Summary contains</option><option value="source_category_equals">Source category equals</option></select></label><label>Action<select name="action"><option value="include">Include</option><option value="exclude">Exclude</option><option value="categorize">Categorize</option></select></label><label>Priority<input name="priority" type="number" step="1" value="0" required></label><label class="wide-field">Literal pattern<input name="pattern" required autocomplete="off"></label><label class="wide-field">Reason / label<input name="reason" required autocomplete="off"></label></div></fieldset><fieldset><legend>Scope and Category target</legend><label>Scope<select name="scope"><option value="installation">Installation-wide</option><option value="source">One Source</option></select></label><label data-rule-source-field hidden>Source<select name="sourceConfigKey" data-rule-source-select></select></label><label data-rule-category-field hidden>Category target<select name="categoryConfigKey" data-rule-category-select></select></label></fieldset><div class="form-message" role="alert" tabindex="-1" data-rule-form-error hidden></div><div class="form-actions"><button type="submit" class="button primary" data-rule-submit>Save Relevance rule</button><button type="button" class="button secondary" data-rule-cancel>Cancel</button><button type="button" class="button secondary" data-rule-enabled hidden></button><button type="button" class="button danger" data-rule-delete hidden>Remove rule</button></div></form><aside class="precedence-guidance"><h3>How rules apply</h3><p>All applicable enabled literal rules are evaluated deterministically. Include/exclude precedence uses priority, Source scope, action, then immutable key tie rules. Matching categorize rules all add their Categories. If none assigns a Category, the endpoint default wins over the Source default. Edits apply prospectively and do not rescan historical Articles.</p></aside></section>
            </section>
          </div>
        </section>

        <section class="workspace-panel" id="credentials-workspace" data-workspace-panel="credentials" aria-labelledby="credentials-heading" hidden>
          <section class="panel credentials-panel">
            <div class="panel-heading">
              <div>
                <p class="section-kicker">Machine distribution access</p>
                <h2 id="credentials-heading" tabindex="-1">Distribution Credentials</h2>
              </div>
              <div class="panel-actions">
                <a class="button primary" href="/admin/api/php-integration/download">Download PHP Integration __PHP_INTEGRATION_VERSION__</a>
                <button type="button" class="button secondary" data-refresh-credentials>Refresh Credentials</button>
              </div>
            </div>
            <p class="section-help">Credentials grant only <code>distribution:read</code>. They never grant administrator access.</p>
            <div class="workspace-state" data-credentials-state="idle" role="status" aria-live="polite">Open Credentials to load the current credential records.</div>
            <div class="form-message" role="alert" tabindex="-1" data-credentials-error hidden></div>
            <section class="one-time-secret" data-credential-secret hidden aria-labelledby="credential-secret-heading">
              <h3 id="credential-secret-heading" tabindex="-1">Copy this token now</h3>
              <p>This plaintext token cannot be shown again. Copy it to the intended consumer's secret configuration, then clear it from this page.</p>
              <output class="credential-token" data-credential-token></output>
              <div class="form-actions">
                <button type="button" class="button primary" data-copy-credential-token>Copy token</button>
                <button type="button" class="button secondary" data-dismiss-credential-token>Dismiss and clear</button>
              </div>
              <p class="field-help" role="status" aria-live="polite" data-credential-copy-result></p>
            </section>
            <form data-credential-create-form>
              <fieldset>
                <legend>Create credential</legend>
                <div class="form-grid">
                  <label>Label
                    <input name="label" autocomplete="off" required>
                  </label>
                  <label>Expiration (optional)
                    <input name="expiresAt" type="datetime-local">
                    <span class="field-help">Leave blank for no expiry. Use a future date and time.</span>
                  </label>
                </div>
              </fieldset>
              <div class="form-actions"><button type="submit" class="button primary">Create credential</button></div>
            </form>
            <section aria-labelledby="credentials-list-heading">
              <h3 id="credentials-list-heading">Credential records</h3>
              <div class="bounded-list" data-credentials-list></div>
            </section>
          </section>
        </section>

        <section class="workspace-panel" id="articles-workspace" data-workspace-panel="articles" aria-labelledby="articles-heading" hidden>
          <div class="articles-workspace-layout">
            <div class="articles-sidebar">
              <section class="panel articles-filter-panel" aria-labelledby="articles-heading">
                <div class="panel-heading">
                  <div>
                    <p class="section-kicker">Stored Article instances</p>
                    <h2 id="articles-heading">Articles</h2>
                  </div>
                </div>
                <p class="section-help">Searches retained Articles, including hidden, archived, and duplicate-suppressed instances.</p>
                <form data-article-filter-form>
                  <label>Search headline or metadata
                    <input name="q" type="search" autocomplete="off" maxlength="200">
                  </label>
                  <label>Source
                    <select name="sourceConfigKey" data-article-source-filter></select>
                  </label>
                  <label>Visibility
                    <select name="visibilityState">
                      <option value="">Any visibility</option>
                      <option value="visible">Visible</option>
                      <option value="hidden">Hidden</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                  <label>Effective Category
                    <select name="categoryConfigKey" data-article-category-filter></select>
                  </label>
                  <label>Duplicate role
                    <select name="duplicateRole">
                      <option value="">Any duplicate role</option>
                      <option value="ungrouped">Ungrouped</option>
                      <option value="primary">Primary</option>
                      <option value="non_primary">Non-Primary</option>
                    </select>
                  </label>
                  <label>Review state
                    <select name="duplicateReviewState">
                      <option value="">Any review state</option>
                      <option value="pending">Pending</option>
                      <option value="dismissed">Dismissed</option>
                      <option value="merged">Merged</option>
                      <option value="superseded">Superseded</option>
                    </select>
                  </label>
                  <label class="choice-row">
                    <input name="duplicateReviewParticipating" type="checkbox">
                    Participating in duplicate review
                  </label>
                  <div class="form-actions">
                    <button type="submit" class="button primary">Apply filters</button>
                    <button type="button" class="button secondary" data-article-filter-reset>Reset</button>
                  </div>
                </form>
              </section>

              <section class="panel article-list-panel" aria-labelledby="article-list-heading">
                <div class="panel-heading">
                  <div>
                    <p class="section-kicker">Bounded results</p>
                    <h3 id="article-list-heading">Article list</h3>
                  </div>
                </div>
                <div class="list-state" tabindex="-1" data-article-list-state="ready" role="status" aria-live="polite"></div>
                <ul class="selection-list article-selection-list" data-article-list></ul>
                <button type="button" class="button secondary load-more-button" data-article-load-more hidden>Load more Articles</button>
              </section>

              <section class="panel review-queue-panel" aria-labelledby="review-queue-heading">
                <div class="panel-heading">
                  <div>
                    <p class="section-kicker">Duplicate review</p>
                    <h3 id="review-queue-heading">Review queue</h3>
                  </div>
                </div>
                <form class="review-filter-form" data-review-filter-form>
                  <label>State
                    <select name="state">
                      <option value="pending">Pending</option>
                      <option value="dismissed">Dismissed</option>
                      <option value="merged">Merged</option>
                      <option value="superseded">Superseded</option>
                    </select>
                  </label>
                  <label>Confidence
                    <select name="confidence">
                      <option value="">Any confidence</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                  </label>
                  <div class="form-actions">
                    <button type="submit" class="button secondary">Refresh queue</button>
                  </div>
                </form>
                <div class="list-state" tabindex="-1" data-review-list-state="ready" role="status" aria-live="polite"></div>
                <ul class="selection-list review-selection-list" data-review-list></ul>
                <button type="button" class="button secondary load-more-button" data-review-load-more hidden>Load more reviews</button>
              </section>
            </div>

            <div class="articles-main">
              <section class="panel article-detail-panel" data-article-detail-panel aria-labelledby="article-detail-heading">
                <div class="panel-heading">
                  <div>
                    <p class="section-kicker">Read-only evidence and moderation</p>
                    <h2 id="article-detail-heading" tabindex="-1" data-article-detail-heading>Select an Article</h2>
                  </div>
                  <div class="state-summary" data-article-state-summary hidden></div>
                </div>
                <p class="section-help" data-article-detail-help>Select a stored Article to inspect its Source values, provenance, and moderation state.</p>
                <div class="workspace-state" tabindex="-1" data-article-detail-state="empty" role="status" aria-live="polite">No Article selected.</div>
                <div data-article-detail-content hidden>
                  <div class="article-overview-grid" data-article-overview></div>
                  <div class="article-moderation-actions">
                    <fieldset>
                      <legend>Visibility</legend>
                      <p class="field-help">Visibility is independent from duplicate membership. Archived Articles are read-only here.</p>
                      <div class="form-actions">
                        <button type="button" class="button danger" data-article-hide>Hide Article</button>
                        <button type="button" class="button secondary" data-article-restore>Restore Article</button>
                      </div>
                    </fieldset>
                    <form data-article-display-form>
                      <fieldset>
                        <legend>Display-title override</legend>
                        <p class="field-help">Source-derived headline remains stored underneath an active override. Clearing reveals the latest Source value.</p>
                        <label>Override headline
                          <input name="displayTitleOverride" maxlength="2048" autocomplete="off">
                        </label>
                        <div class="form-message" role="alert" tabindex="-1" data-article-display-error hidden></div>
                        <div class="form-actions">
                          <button type="submit" class="button primary">Save display override</button>
                          <button type="button" class="button secondary" data-article-display-clear>Clear override</button>
                        </div>
                      </fieldset>
                    </form>
                    <form data-article-category-form>
                      <fieldset>
                        <legend>Manual Category override</legend>
                        <p class="field-help">Select none and save to intentionally use an active empty set. Use Clear manual override to return to automatic Categories.</p>
                        <div class="category-option-list" data-article-category-options></div>
                        <div class="form-message" role="alert" tabindex="-1" data-article-category-error hidden></div>
                        <div class="form-actions">
                          <button type="submit" class="button primary">Save manual Categories</button>
                          <button type="button" class="button secondary" data-article-category-clear>Clear manual override</button>
                        </div>
                      </fieldset>
                    </form>
                  </div>
                  <div class="article-evidence-grid">
                    <section>
                      <h3>Observation provenance</h3>
                      <div class="bounded-list" data-article-observations></div>
                    </section>
                    <section>
                      <h3>Change history</h3>
                      <div class="bounded-list" data-article-history></div>
                    </section>
                  </div>
                </div>
              </section>

              <section class="panel review-detail-panel" aria-labelledby="review-detail-heading">
                <div class="panel-heading">
                  <div>
                    <p class="section-kicker">Server-owned evidence</p>
                    <h2 id="review-detail-heading" tabindex="-1" data-review-detail-heading>Select a review candidate</h2>
                  </div>
                </div>
                <p class="section-help" data-review-detail-help>Select a candidate to compare both stored Articles and make an explicit decision.</p>
                <div class="workspace-state" tabindex="-1" data-review-detail-state="empty" role="status" aria-live="polite">No review candidate selected.</div>
                <div data-review-detail-content hidden>
                  <div class="form-message" role="alert" tabindex="-1" data-review-conflict-message hidden></div>
                  <div class="duplicate-evidence-grid" data-review-articles></div>
                  <section>
                    <h3>Signals and decision context</h3>
                    <div class="bounded-list" data-review-signals></div>
                  </section>
                  <form data-review-action-form>
                    <label>Optional decision reason
                      <textarea name="reason" rows="3" maxlength="2000"></textarea>
                    </label>
                    <div class="form-actions">
                      <button type="button" class="button secondary" data-review-dismiss>Dismiss candidate</button>
                      <button type="button" class="button primary" data-review-merge>Merge candidate Articles</button>
                    </div>
                  </form>
                  <section class="duplicate-group-actions" data-review-group-actions>
                    <h3>Group actions</h3>
                    <label>Group
                      <select data-review-group-select></select>
                    </label>
                    <label>Explicit Primary for merge
                      <select data-review-merge-primary></select>
                      <span class="field-help">Choose one when the server reports conflicting manual Primaries.</span>
                    </label>
                    <div class="split-member-list" data-review-split-members></div>
                    <div class="form-actions">
                      <button type="button" class="button secondary" data-review-split>Split selected members</button>
                      <button type="button" class="button secondary" data-review-primary>Choose selected Primary</button>
                    </div>
                  </section>
                </div>
              </section>
            </div>
          </div>
        </section>
      </section>
    </main>
  </body>
</html>`;

const adminAssets = new Map<
  string,
  { readonly content: string; readonly type: string }
>([
  ['admin.css', { content: adminStylesheet, type: 'css' }],
  ['admin.js', { content: adminClient, type: 'js' }],
  ...Object.entries(adminModuleAssets),
]);

/**
 * Registers the finite same-origin admin page and asset surface.
 *
 * Asset names are manifest keys rather than filesystem paths so future browser
 * modules can be added here without changing API security middleware.
 */
export function registerAdminPageRoutes(
  router: Router,
  phpIntegrationPackageVersion: string,
): void {
  router.get('/', (_request, response) => {
    response
      .status(200)
      .type('html')
      .send(
        adminPage.replace(
          '__PHP_INTEGRATION_VERSION__',
          escapeHtml(phpIntegrationPackageVersion),
        ),
      );
  });
  router.get('/assets/:assetName', (request, response) => {
    const asset = adminAssets.get(request.params.assetName);
    if (asset === undefined) {
      response.status(404).send();
      return;
    }
    response.status(200).type(asset.type).send(asset.content);
  });
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );
}
