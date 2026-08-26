# Customer HTML integration worksheet

**Status:** working manual integration worksheet; not release validation evidence by itself.  
**Purpose:** take an existing static customer-style HTML page, preserve its presentation, and integrate the version-matched News Scraper PHP package so the page renders synchronized local Profile data as server-rendered HTML.  
**Scope:** customer-site HTML/PHP integration only. This worksheet does not redesign synchronization, Profile semantics, the v1 API, or the customer website. It assumes the HostGator-like PHP environment has already been prepared or is being prepared separately.

## Target model

The integration path being exercised is:

```text
managed News Scraper
→ authenticated scheduled PHP synchronization
→ validated host-local LKG state
→ LocalProfileReader
→ existing customer page converted from HTML to PHP
→ customer-owned server-rendered article markup
→ direct stored publisher originalUrl links
```

The visitor request path must remain local-only. It must not receive the News Scraper bearer token and must not make a synchronous request to the managed News Scraper instance.

Current test-environment defaults:

```text
Customer account:      news-scraper-php-test
Public document root:  /home/news-scraper-php-test/public_html
Working HTML page:     /home/news-scraper-php-test/public_html/index.html
Frozen baseline copy:  /home/news-scraper-php-test/baseline/index.html
Package root:          /home/news-scraper-php-test/news-scraper-integration
Private root:          /home/news-scraper-php-test/private
State root:            /home/news-scraper-php-test/private/state
Sync env:              /home/news-scraper-php-test/private/sync.env
```

If the actual test paths differ, record the replacements in Step 1 and use them consistently for the rest of the worksheet.

## Working rules

- Walk through the worksheet strictly in order and record each result before continuing.
- Keep the frozen baseline immutable. Never edit `baseline/index.html` during the integration.
- Make the smallest possible change at each step so failures can be isolated.
- Do not redesign the mock/customer page while proving integration plumbing.
- Do not copy the News Scraper bearer token, sync environment, cache/LKG state, or private logs beneath the public document root.
- The visitor page receives only local-read configuration. The scheduled sync process alone receives the upstream base URL and bearer token.
- Use the integration ZIP generated for the exact deployed News Scraper version being tested. Do not hand-assemble a different package when the supported download path is available.
- Do not parse manifest/generation files directly from customer code. Read through `LocalProfileReader` / `LocalReadResult` only.
- Do not reinterpret Source trust, Profile filters, Categories, duplicate suppression, ordering, or destination semantics in customer presentation code.
- Article headline links use the exact local `originalUrl` value. Do not introduce News Scraper redirects or tracking URLs.
- Treat every upstream article value as untrusted output data and escape it for its final HTML context.
- JavaScript may enhance presentation, but the core article list and publisher links must already exist in the server-rendered HTML response.

---

## Step 1 — Confirm prerequisites and freeze the test baseline

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Confirm the customer-style test page, package/runtime environment, and rollback baseline are known before integration work changes the public page.

### Record

- Test hostname:
- Public document root:
- Current public page path:
- Frozen baseline path:
- SHA-256 of current public `index.html`:
- SHA-256 of frozen baseline `index.html`:
- PHP CLI version:
- PHP web runtime/version:
- News Scraper managed base URL:
- Deployed News Scraper version:
- Target Distribution Profile key:
- HostGator-like environment worksheet status:

### Required checks

- current public page and frozen baseline are byte-identical before integration;
- frozen baseline is outside the public document root or otherwise protected from accidental serving/editing;
- existing static page loads successfully through the real test hostname;
- PHP >= 8.1 is available to the test account;
- private package/state/config locations exist or have been reserved outside `public_html`;
- exact deployed News Scraper version is known.

### Pass condition

The starting page is reproducible and rollback can restore the exact original HTML without depending on memory or Git.

### Evidence / notes

```text

```

---

## Step 2 — Inventory the HTML integration target before editing

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Identify exactly which existing HTML region will become dynamic and which surrounding customer-owned presentation must remain unchanged.

### Record

- Page title / purpose:
- Dynamic news section start marker or selector:
- Dynamic news section end marker or selector:
- Existing section heading:
- Existing article/card wrapper class(es):
- Existing headline class(es):
- Existing source/byline class(es):
- Existing date class(es):
- Existing summary class(es):
- Existing image class(es), if any:
- Existing category/tag class(es), if any:
- Existing empty-state content, if any:
- Existing JS that targets the news section:
- Existing CSS that targets the news section:
- Static content immediately before the section:
- Static content immediately after the section:

### Presentation decisions

Record the desired first integration behavior without changing product semantics:

- Number of locally available Articles to display:
- Display Source name?:
- Display author?:
- Display summary?:
- Display image when `imageUrl` exists?:
- Display Categories?:
- Display published/effective date?:
- Desired date format:
- Open publisher links in same tab or new tab?:
- Desired empty-state message:
- Desired unavailable/initializing message:
- Desired stale-content indicator, if any:

### Boundary checks

The customer page may choose which supplied fields to display and how to style them. It must not locally re-filter Articles, re-sort them, infer duplicate winners, rewrite destinations, or reconstruct Profile rules.

### Pass condition

There is one clearly bounded HTML region to replace dynamically, and every surrounding section/class/script that must remain unchanged has been recorded.

### Evidence / notes

```text

```

---

## Step 3 — Download the version-matched PHP integration ZIP

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Exercise the supported customer distribution path instead of assembling PHP files manually from the repository.

### Intended workflow

From the News Scraper administrator machine-credential/integration surface, download the PHP integration package generated for the currently deployed server version.

If the supported download control is not yet implemented or cannot produce a package, mark this step `Blocked`. Do not silently substitute a hand-built ZIP and then treat the result as proof of the supported workflow.

### Record

- News Scraper deployed version:
- Downloaded filename:
- Download timestamp:
- Downloaded file size:
- SHA-256 of downloaded ZIP:
- Package-reported version/revision, if present:
- Default configuration/template files included:

### Required checks

- package is generated/downloaded from the intended admin workflow;
- package corresponds to the deployed News Scraper version;
- ZIP opens cleanly;
- expected PHP source/bootstrap/sync entrypoint are present;
- default/example configuration contains placeholders/defaults only, never a real bearer token;
- package does not require Node or Composer on the customer host unless the current package contract explicitly changes later.

### Pass condition

One exact, shareable, version-matched PHP integration ZIP is available and its checksum/version have been recorded.

### Evidence / notes

```text

```

---

## Step 4 — Install the package outside the public document root

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Install the downloaded package using the same public/private separation expected on a customer host.

### Intended destination

```text
/home/news-scraper-php-test/news-scraper-integration
```

### Required checks

- extract the package outside `public_html`;
- preserve package-relative paths expected by `src/bootstrap.php` and `bin/sync.php`;
- package files are readable by the PHP test identity;
- public web requests cannot browse or retrieve package source files;
- no bearer token is written into package source;
- no customer-page HTML/CSS changes are made yet.

### Record

- Installed package root:
- Installed package version/revision:
- Bootstrap path:
- Sync entrypoint path:
- Configuration/default file paths:

### Pass condition

The downloaded package loads from CLI PHP in its private installation path without changing the public page.

### Evidence / notes

```text

```

---

## Step 5 — Prepare sync-only and visitor-only configuration

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Keep upstream secrets/process configuration separate from ordinary visitor rendering configuration.

### Sync-only values

The scheduled CLI process may receive:

```text
NEWS_SCRAPER_BASE_URL=<managed HTTPS URL>
NEWS_SCRAPER_PROFILE_KEY=<profile key>
NEWS_SCRAPER_STATE_ROOT=/home/news-scraper-php-test/private/state
NEWS_SCRAPER_BEARER_TOKEN=<dedicated machine credential>
NEWS_SCRAPER_SYNC_CADENCE_SECONDS=900
# Optional: NEWS_SCRAPER_MAX_STALE_AGE_SECONDS=...
```

### Visitor/local-read values

The PHP web process/page may receive only:

```text
NEWS_SCRAPER_PROFILE_KEY=<profile key>
NEWS_SCRAPER_STATE_ROOT=/home/news-scraper-php-test/private/state
NEWS_SCRAPER_SYNC_CADENCE_SECONDS=900
# Optional: NEWS_SCRAPER_MAX_STALE_AGE_SECONDS=...
```

The visitor process must not receive:

```text
NEWS_SCRAPER_BASE_URL
NEWS_SCRAPER_BEARER_TOKEN
```

### Required checks

- sync secrets live outside `public_html` with restrictive permissions;
- visitor PHP can read the local state root;
- visitor PHP cannot read or inherit the sync bearer token/base URL;
- state root is writable by the sync process and readable by the visitor process under the intended account model;
- no credentials are copied into HTML/PHP source.

### Pass condition

Sync and visitor configuration are mechanically separate before a real machine credential is used.

### Evidence / notes

```text

```

---

## Step 6 — Prove synchronization and local state before touching HTML

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Prove the package can create a valid local active snapshot independently of customer-page presentation.

### Procedure

1. Run the package sync command manually as the customer test identity using sync-only configuration.
2. Use `--force` for the initial setup when appropriate.
3. Record the bounded sync result without printing the bearer token.
4. Read the same Profile locally using the package's supported local-read boundary or example harness.

### Record

- Sync command path:
- Sync result:
- Item count:
- Page count:
- Active revision:
- Last successful sync time:
- Local-read state:
- Local article count:

### Required checks

- sync succeeds against the intended managed Profile;
- a complete active LKG exists;
- local read reports `usable` or the expected renderable state;
- local Article data includes direct publisher `originalUrl` values;
- no public HTML change was required to establish local data.

### Pass condition

A valid local snapshot can be read before any modification to the customer page. If this step fails, stop here; do not debug synchronization through page markup.

### Evidence / notes

```text

```

---

## Step 7 — Create a PHP working copy with zero presentation changes

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Prove the existing customer HTML can execute as PHP without changing its rendered page before News Scraper code is introduced.

### Procedure

Create `public_html/index.php` from the frozen/current baseline HTML. Do not edit the baseline copy.

Before making PHP logic changes, confirm which file the web server serves when both `index.html` and `index.php` exist. Avoid a hidden routing mistake where the untouched `index.html` continues winning the directory index.

Use a reversible approach such as temporarily moving the working `index.html` out of the document root or configuring the intended directory index order. Do not delete the frozen baseline.

### Record

- Working PHP page path:
- Original HTML retained at:
- Effective directory-index order:
- HTTP status before conversion:
- HTTP status after conversion:
- Visual/browser differences observed:
- Response-body diff result, if compared:

### Required checks

- `index.php` executes through PHP;
- page remains visually equivalent to the frozen HTML baseline;
- existing CSS, JS, images, navigation, and static sections continue to load;
- no News Scraper bootstrap/read/render code has been added yet;
- rollback to the original static HTML has been tested or is immediately available.

### Pass condition

The site is now PHP-capable while remaining functionally/presentationally equivalent to the original HTML baseline.

### Evidence / notes

```text

```

---

## Step 8 — Add the local-read bootstrap without changing visible HTML

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Load the private PHP integration and read the local Profile successfully before injecting dynamic markup into the page.

### Required behavior

At the top of the working PHP page, before normal HTML output:

1. require the installed package `src/bootstrap.php`;
2. create `LocalReadConfiguration` from visitor-safe environment values;
3. create `LocalProfileReader`;
4. read one `LocalReadResult` for the request;
5. catch unexpected local-read/bootstrap errors at the customer boundary without exposing filesystem paths, environment values, stack traces, or secrets.

Do not render Articles yet in this step.

### Record

- Bootstrap path used:
- Local-read Profile key:
- Local-read state observed:
- Article count observed internally:
- PHP/server log result:
- Any visible page difference:

### Required checks

- the page still renders its original HTML;
- local-read bootstrap does not require upstream URL/token;
- no visitor-path network request to News Scraper occurs;
- failure handling does not leak configuration/state details into HTML;
- page-level read happens once rather than repeatedly per Article/component.

### Pass condition

The unchanged-looking page can successfully obtain a normalized `LocalReadResult` from host-local state.

### Evidence / notes

```text

```

---

## Step 9 — Replace only the target section with fallback renderer output

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Prove end-to-end server-rendered insertion using the package's known-safe fallback HTML before writing customer-specific rendering logic.

### Procedure

Within only the dynamic section identified in Step 2, temporarily render the existing `LocalReadResult` through `FallbackHtmlRenderer`.

Do not alter unrelated layout or CSS merely to make fallback output look production-ready. This is a plumbing smoke test.

### Required checks

- fallback Article HTML appears exactly where the old/static news region existed;
- surrounding customer content remains unchanged;
- page source from a plain HTTP request contains Article headlines and publisher anchors without JavaScript execution;
- headline anchors point directly to exact publisher `originalUrl` values;
- no News Scraper API/tracking URL appears in Article anchors;
- special characters in upstream fields are safely escaped;
- visitor render succeeds entirely from local state.

### Pass condition

The complete managed→sync→LKG→local-reader→server-rendered-page path works before custom presentation code is introduced.

### Evidence / notes

```text

```

---

## Step 10 — Map `LocalReadResult` into the customer's existing article markup

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Replace fallback presentation with customer-owned markup that preserves the site's existing design while consuming only the normalized local model.

### Supported local Article fields

Customer presentation may consume fields such as:

```text
articleId
headline
originalUrl
effectiveFeedDate
feedDateSource
publishedAt
author
summary
imageUrl
source.configKey
source.displayName
categories[].configKey
categories[].displayName
```

The page may choose not to display some fields. It must not use those fields to rebuild upstream eligibility/filtering/ordering semantics.

### Rendering requirements

- preserve the existing article/card DOM structure and class names recorded in Step 2 where practical;
- iterate Articles in the order supplied by `LocalReadResult`;
- do not locally sort or deduplicate;
- use exact `originalUrl` for the primary headline link;
- escape all text and attribute values for their final HTML context;
- handle nullable `author`, `summary`, `publishedAt`, and `imageUrl` without broken empty markup;
- if images are displayed, treat `imageUrl` as optional external content and preserve safe HTML attribute escaping;
- customer-owned link target behavior (`_self`/`_blank`) must not rewrite the destination;
- no JavaScript is required to create the core links/content.

### Record final field mapping

- Card wrapper:
- Headline:
- Destination URL:
- Source:
- Author:
- Date source/format:
- Summary:
- Image:
- Categories:
- Other local fields used:

### Pass condition

The dynamic section visually matches the intended customer-page style while the data/order/destinations remain exactly those supplied by the normalized local read model.

### Evidence / notes

```text

```

---

## Step 11 — Define every local state in the customer page

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Ensure the page behaves deliberately when local data is empty, stale, disabled, initializing, or unavailable.

### States to handle

| Local state | Required customer-page behavior |
| --- | --- |
| `usable` | Render supplied Articles normally. |
| `stale_usable` | Keep rendering valid local Articles; optionally show the customer-chosen stale indicator. |
| usable with zero Articles | Render the chosen empty-state presentation without fabricating content. |
| `never_synced` | Render the chosen safe initializing/unavailable state. |
| `stale_cutoff` | Do not render expired Articles; render the safe fallback state. |
| `disabled` | Do not render cached Articles; show the chosen disabled/empty presentation. |
| `unavailable` | Render the safe unavailable presentation without leaking internals. |
| unexpected exception | Render the safe page-level fallback and keep the rest of the customer page usable where practical. |

### Record customer copy/presentation

- Empty:
- Initializing:
- Stale usable indicator:
- Stale cutoff:
- Disabled:
- Unavailable:
- Unexpected exception:

### Pass condition

Every supported local state has one intentional visible behavior and no state causes the visitor request to contact News Scraper synchronously.

### Evidence / notes

```text

```

---

## Step 12 — Restore/preserve customer presentation around the dynamic section

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Verify integration changed only the intended news content boundary rather than accidentally changing the customer's surrounding page.

### Compare against frozen baseline

Check at minimum:

- page header/navigation;
- hero/banner content;
- fonts and global CSS;
- page widths/grid/container behavior;
- static content before the news section;
- static content after the news section;
- footer;
- existing images/assets;
- existing JavaScript behavior unrelated to the news section;
- responsive/mobile behavior;
- document title/meta/canonical/robots markup;
- any customer analytics already present outside this integration.

### Pass condition

All deliberate differences from the frozen baseline are limited to PHP bootstrap/local-read code and the intended dynamic news region. Any other difference is either reverted or explicitly recorded as customer-owned presentation work.

### Evidence / notes

```text

```

---

## Step 13 — Verify server-rendering, direct links, escaping, and SEO boundary

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Prove the properties the integration actually promises without overclaiming SEO outcomes.

### Required checks

Using a simple HTTP client such as `curl`, without executing JavaScript:

- Article headlines are present in returned HTML;
- Article anchors are present in returned HTML;
- Article anchors use exact publisher `originalUrl` destinations;
- there are no News Scraper redirect/tracking links for ordinary Article headlines;
- the page does not require client-side fetch/XHR to populate core content;
- upstream headline/source/author/summary/category values are HTML-escaped;
- nullable fields do not produce broken elements/attributes;
- customer-owned canonical/robots/meta/title behavior remains under customer control;
- no claim is made that server-rendering guarantees rankings, backlinks, PageRank, or reciprocal-link value.

### Record

- Number of Article anchors observed in raw HTML:
- Example publisher host observed:
- JavaScript required for core content?:
- Any escaping defect found?:
- Any destination rewrite found?:

### Pass condition

The raw server response is crawlable HTML containing direct publisher links, with safe rendering and no visitor-side population requirement.

### Evidence / notes

```text

```

---

## Step 14 — Prove visitor rendering is local-only during upstream failure

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Show the existing customer page remains usable from the active LKG when the managed News Scraper API is unavailable to the customer host.

### Procedure

After at least one successful synchronization:

1. establish a controlled way for the test host/sync path to fail reaching the managed News Scraper API without destroying local state;
2. do not remove the active local snapshot;
3. load the customer page repeatedly as a normal visitor;
4. inspect page result and relevant logs/network evidence;
5. restore upstream connectivity afterward.

### Required checks

- ordinary visitor requests do not attempt an upstream News Scraper API call;
- the page continues rendering valid local Articles under the stale policy;
- Article links still point to their publisher destinations;
- the existing surrounding customer page remains available;
- sync failure does not replace/corrupt the active local snapshot;
- recovery sync can later succeed without page-code changes.

### Pass condition

Upstream News Scraper unavailability affects scheduled synchronization/health, not the ordinary visitor rendering path while valid LKG content remains usable.

### Evidence / notes

```text

```

---

## Step 15 — Exercise authoritative disable and re-enable behavior

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Verify that the customer page respects the local result produced by an authenticated Profile disable instead of continuing to display cached Articles indefinitely.

### Procedure

1. start from a successfully synchronized/rendering Profile;
2. disable the Profile through the protected News Scraper admin control plane;
3. run synchronization so the authenticated disabled response is observed locally;
4. load the customer page;
5. reactivate the Profile;
6. run a later successful synchronization;
7. load the customer page again.

### Required checks

- disabled state suppresses cached public Articles;
- customer page shows the selected disabled/empty safe presentation;
- visitor path does not query upstream to learn the state;
- reactivation alone does not bypass local state; rendering resumes after later successful synchronization;
- customer page code does not need modification for disable/re-enable.

### Pass condition

The page follows the normalized local state across disable and re-enable without inventing lifecycle rules.

### Evidence / notes

```text

```

---

## Step 16 — Rollback test

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Prove customer integration can be removed without reconstructing the original website by hand.

### Procedure

Temporarily restore the frozen baseline as the served page, using the recorded directory-index behavior from Step 7.

### Required checks

- original static page returns successfully;
- original visual presentation is restored;
- package/private state can remain installed without being publicly reachable;
- re-enabling the PHP-integrated page restores dynamic rendering without rebuilding local state;
- rollback does not require deleting LKG or machine credentials unless intentionally decommissioning the integration.

### Pass condition

The exact pre-integration customer page can be restored quickly and reversibly from the frozen baseline.

### Evidence / notes

```text

```

---

## Step 17 — HTML integration readiness gate

**Status:** [ ] Not started  [ ] READY  [ ] Blocked

The customer HTML integration is ready for formal Phase 7 external-site qualification only when all of the following are true:

- [ ] starting HTML baseline is frozen and checksum-recorded;
- [ ] target dynamic section and preserved surrounding markup are recorded;
- [ ] integration ZIP was obtained through the supported admin download workflow;
- [ ] downloaded package matches the deployed News Scraper version;
- [ ] package is installed outside the public document root;
- [ ] sync-only and visitor-only configuration are separate;
- [ ] initial complete synchronization and local read succeed before page integration;
- [ ] static `index.html` was converted to working `index.php` with baseline parity first;
- [ ] local-read bootstrap works without changing visible presentation;
- [ ] fallback renderer insertion proved the end-to-end local rendering path;
- [ ] customer-specific markup consumes only `LocalReadResult` and preserves upstream order/destinations;
- [ ] every local usability state has defined customer-page behavior;
- [ ] surrounding customer HTML/CSS/JS remains preserved outside the intended section;
- [ ] raw HTTP response contains server-rendered headlines and direct publisher links;
- [ ] no visitor-path News Scraper API call occurs;
- [ ] upstream failure preserves valid LKG visitor rendering under the stale policy;
- [ ] authenticated Profile disable suppresses cached public Articles;
- [ ] later successful synchronization restores rendering after re-enable;
- [ ] rollback to the exact frozen static baseline has been exercised;
- [ ] no bearer token/private state/package internals are publicly retrievable;
- [ ] all observed versions, paths, checksums, and relevant evidence have been recorded.

### Readiness result

```text
READY / BLOCKED:
Reason:
```

---

## After this worksheet

If this worksheet reaches `READY`, the HTML/PHP customer-side mechanics are suitable inputs to the formal Phase 7 managed external-site release qualification.

This worksheet itself is not durable release evidence. Formal qualification must still record the exact accepted News Scraper source/version, exact integration package/version, managed/external deployment topology, real Profile/credential path, observed synchronization/LKG behavior, raw server-rendered output, failure/disable/recovery behavior, and the applicable release-validation artifact required by the Phase 7 prompt stack.

If any step exposes a genuine product defect, stop and record the smallest failing boundary. Fix the product/package boundary through the normal correction or Phase 7 workflow rather than compensating with customer-specific logic that would hide the defect.