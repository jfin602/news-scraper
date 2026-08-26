# HostGator customer HTML integration worksheet

**Status:** working customer-facing manual integration worksheet; not release validation evidence by itself.  
**Purpose:** integrate a version-matched News Scraper PHP package into an existing customer website hosted on HostGator shared Linux hosting, while preserving the existing site presentation, public URLs, SEO-relevant markup, and rollback path.  
**Scope:** HostGator/cPanel customer-site installation and HTML/PHP integration only. This worksheet does not redesign News Scraper synchronization, Profile semantics, the v1 API, or the customer website.

## Target model

The customer integration path is:

```text
managed News Scraper
→ authenticated scheduled PHP synchronization from HostGator cron
→ validated HostGator-local last-known-good state
→ LocalProfileReader
→ existing customer page rendered by PHP
→ customer-owned server-rendered article markup
→ direct stored publisher originalUrl links
```

Ordinary visitor requests must remain local-only. The public page must not receive the News Scraper bearer token and must not make a synchronous request to the managed News Scraper instance.

## HostGator assumptions

This worksheet assumes a normal HostGator Linux shared-hosting account with cPanel or the equivalent HostGator Customer Portal controls.

HostGator account layouts vary. Do not assume the home directory is exactly `/home/<username>` or that one particular PHP CLI binary path exists. Record the actual account paths shown by HostGator and use those values consistently.

Typical logical layout:

```text
<HOSTGATOR_HOME>/
├── public_html/                              # primary-domain public document root
│   └── existing customer website
├── news-scraper-integration/                 # private integration package
└── news-scraper-private/
    ├── state/                                # private local LKG state
    ├── sync.env                              # sync-only upstream configuration/secret
    └── logs/                                 # optional bounded sync logs
```

For an addon domain or subdomain, the actual document root may differ from `public_html`. Record the real document root before making changes.

## Working rules

- Walk through the worksheet strictly in order and record each result before continuing.
- Never overwrite the only copy of the customer's original page. Create and preserve a rollback copy first.
- Make the smallest possible change at each step so failures can be isolated.
- Do not redesign the customer page while proving integration plumbing.
- Do not place the News Scraper bearer token, sync environment, LKG/cache state, or private logs inside any public document root.
- The visitor page receives only local-read configuration. The scheduled sync process alone receives the upstream base URL and bearer token.
- Use the integration ZIP generated for the exact deployed News Scraper version being tested. Do not hand-assemble a different package when the supported download path is available.
- Do not parse manifest/generation files directly from customer code. Read through `LocalProfileReader` / `LocalReadResult` only.
- Do not reinterpret Source trust, Profile filters, Categories, duplicate suppression, ordering, or destination semantics in customer presentation code.
- Article headline links use the exact local `originalUrl` value. Do not introduce News Scraper redirects or tracking URLs.
- Treat every upstream Article value as untrusted output data and escape it for its final HTML context.
- JavaScript may enhance presentation, but the core article list and publisher links must already exist in the server-rendered HTML response.
- Preserve the customer's public URL, `<head>` metadata, canonical behavior, robots directives, page title, and surrounding site structure unless a separate customer-approved change intentionally modifies them.

---

## Step 1 — Record the HostGator account and site layout

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Identify the exact HostGator account paths and website configuration before changing files.

### Using HostGator/cPanel

Record the site's actual home directory and document root from cPanel/File Manager or the HostGator Customer Portal. Do not infer them from examples.

### Record

- HostGator account/cPanel username:
- Website hostname/domain:
- HostGator account home directory:
- Website document root:
- Current public index file (`index.html`, `index.php`, other):
- Current public URL used by visitors/search engines:
- Existing `.htaccess` path, if present:
- Is this the primary domain, addon domain, or subdomain?:
- HostGator control surface used (`cPanel`, Customer Portal, other):

### Required checks

- the correct website/document root is known;
- private directories can be created outside the public document root;
- the existing site loads normally before integration;
- no News Scraper files have been installed yet.

### Pass condition

The customer can identify exactly where public website files live and where private integration/state files can safely live.

### Evidence / notes

```text

```

---

## Step 2 — Freeze the customer's original page and SEO baseline

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Preserve an exact rollback copy and record the public/SEO behavior that must survive the HTML→PHP integration.

### Procedure

Using cPanel File Manager, HostGator backup tools, SFTP, or another customer-controlled method:

1. make an exact copy of the current page before editing it;
2. store the rollback copy outside the public document root when practical;
3. record a checksum locally or through an available shell/terminal if the account provides one;
4. capture the current public URL and raw HTTP response behavior.

If shell access is unavailable, preserving a downloaded byte-for-byte copy is sufficient for the manual rollback baseline; record that no server-side checksum was available.

### Record

- Original page path:
- Frozen rollback copy location:
- Original filename:
- SHA-256/checksum, if available:
- Current HTTP status:
- Current public URL:
- Current `<title>`:
- Current canonical URL, if present:
- Current robots meta/directive, if present:
- Current meta description, if present:
- Existing structured-data blocks, if any:
- Existing direct links to `/index.html`, if known:

### Required checks

- rollback does not depend on reconstructing the page from memory;
- the original copy will not be edited during integration;
- the site's public URL behavior is known;
- existing SEO-relevant `<head>` markup has been recorded.

### Pass condition

The exact pre-integration customer page can be restored without depending on the modified working file.

### Evidence / notes

```text

```

---

## Step 3 — Inventory the HTML integration target

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Identify exactly which existing page region will become dynamic and which surrounding customer-owned presentation must remain unchanged.

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

- Number of locally supplied Articles to display:
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

There is one clearly bounded HTML region to replace dynamically, and surrounding presentation that must remain unchanged has been recorded.

### Evidence / notes

```text

```

---

## Step 4 — Confirm HostGator PHP compatibility

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Verify the website and scheduled CLI environment can run the generic PHP integration.

### HostGator controls

Use **MultiPHP Manager** in cPanel, or the equivalent PHP Version control in the HostGator Customer Portal, to inspect the site's PHP version.

The News Scraper integration requires PHP 8.1 or newer.

### Record

- Website PHP version:
- PHP version selected in MultiPHP Manager/Customer Portal:
- PHP CLI binary/path intended for Cron Jobs:
- `allow_url_fopen` available?:
- OpenSSL/HTTPS support available?:
- JSON support available?:
- MultiPHP INI Editor changes required?:

### Required checks

- site PHP is >= 8.1;
- HTTPS requests from PHP are possible for the scheduled synchronization process;
- JSON support is available;
- the account can write private state files;
- no Composer dependency is required;
- no Node dependency is required for visitor requests.

If a temporary `phpinfo.php` page is used to inspect runtime configuration, delete it immediately after recording the required facts.

### Pass condition

The HostGator account provides the ordinary PHP capabilities required by the integration package.

### Evidence / notes

```text

```

---

## Step 5 — Download the version-matched PHP integration ZIP

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Exercise the supported customer distribution path instead of assembling PHP files manually from the repository.

### Procedure

From the News Scraper administrator machine-credential/integration surface, download the PHP integration package generated for the currently deployed server version.

If the supported download control is unavailable or cannot produce a package, mark this step `Blocked`. Do not silently substitute a hand-built ZIP and then treat the result as proof of the supported workflow.

### Record

- News Scraper managed base URL:
- News Scraper deployed version:
- Target Distribution Profile key:
- Downloaded filename:
- Download timestamp:
- Downloaded file size:
- SHA-256 of downloaded ZIP, if available:
- Package-reported version/revision, if present:
- Default configuration/template files included:

### Required checks

- package is generated/downloaded from the intended admin workflow;
- package corresponds to the deployed News Scraper version;
- ZIP opens cleanly;
- expected PHP source/bootstrap/sync entrypoint are present;
- default/example configuration contains placeholders/defaults only, never a real bearer token;
- package does not require Node or Composer on HostGator.

### Pass condition

One exact, shareable, version-matched PHP integration ZIP is available for installation.

### Evidence / notes

```text

```

---

## Step 6 — Create private HostGator integration directories

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Create package/state/config locations outside the public website before extracting the ZIP.

### Proposed logical layout

Replace `<HOSTGATOR_HOME>` with the actual account home directory from Step 1:

```text
<HOSTGATOR_HOME>/news-scraper-integration/
<HOSTGATOR_HOME>/news-scraper-private/
<HOSTGATOR_HOME>/news-scraper-private/state/
<HOSTGATOR_HOME>/news-scraper-private/logs/
<HOSTGATOR_HOME>/news-scraper-private/sync.env
```

Use cPanel File Manager, SFTP, SSH/Terminal, or equivalent HostGator account tools.

### Required checks

- none of these paths are beneath the site's public document root;
- other hosting accounts/visitors cannot browse the private files through HTTP;
- the PHP/cron account can write the state directory;
- private configuration permissions are as restrictive as the HostGator account permits;
- no real bearer token is present yet.

### Record

- Package root:
- Private root:
- State root:
- Logs root:
- Sync configuration path:

### Pass condition

The public/private filesystem boundary exists before package installation or credential configuration.

### Evidence / notes

```text

```

---

## Step 7 — Install the downloaded package outside the document root

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Upload and extract the downloaded package into the private HostGator package root.

### Procedure

Using cPanel File Manager's upload/extract controls, SFTP, or equivalent customer access:

1. upload the version-matched ZIP;
2. extract it into the private package root;
3. preserve package-relative paths expected by `src/bootstrap.php` and `bin/sync.php`;
4. remove the uploaded ZIP from the server after extraction if it is no longer needed there.

### Record

- Installed package root:
- Installed package version/revision:
- Bootstrap path:
- Sync entrypoint path:
- Configuration/default file paths:

### Required checks

- package files are readable by the site's PHP account;
- package source is not HTTP-accessible;
- no bearer token is written into package source;
- no public HTML/CSS changes have been made yet;
- package syntax/load check succeeds if HostGator shell/Terminal is available.

### Pass condition

The supported package is installed privately without changing the customer page.

### Evidence / notes

```text

```

---

## Step 8 — Create sync-only private configuration

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Configure scheduled synchronization without exposing upstream credentials to visitors.

### Sync-only values

Store these values in the private configuration method supported by the package/account:

```text
NEWS_SCRAPER_BASE_URL=<managed HTTPS URL>
NEWS_SCRAPER_PROFILE_KEY=<profile key>
NEWS_SCRAPER_STATE_ROOT=<HOSTGATOR_HOME>/news-scraper-private/state
NEWS_SCRAPER_BEARER_TOKEN=<dedicated machine credential>
NEWS_SCRAPER_SYNC_CADENCE_SECONDS=900
# Optional: NEWS_SCRAPER_MAX_STALE_AGE_SECONDS=...
```

### Required checks

- configuration is outside every public document root;
- file permissions are restrictive;
- token is not embedded in public PHP/HTML, `.htaccess`, JavaScript, HTML comments, or the Cron Jobs command line when avoidable;
- token is never copied into worksheet evidence;
- credential is dedicated to this integration;
- the customer page does not import this sync configuration wholesale.

### Pass condition

The scheduled sync process can receive its upstream settings while the public website cannot expose them.

### Evidence / notes

```text

```

---

## Step 9 — Perform the first manual synchronization

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Prove synchronization and local LKG creation independently of customer-page presentation.

### Procedure

Run the package's `bin/sync.php` manually using the same PHP CLI/runtime that will later be used by HostGator Cron Jobs. Use `--force` for the initial setup when appropriate.

If the account has no interactive shell/Terminal, use the package's supported setup mechanism or a temporarily configured Cron Job, then inspect the resulting private state/log outcome. Do not create a public web endpoint merely to trigger synchronization.

### Record

- PHP CLI path/version:
- Sync entrypoint:
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
- no public page modification was needed to establish local data.

### Pass condition

A valid local snapshot exists before any customer-page integration work begins.

### Evidence / notes

```text

```

---

## Step 10 — Configure HostGator Cron Jobs synchronization

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Configure scheduled synchronization through HostGator's supported cron facility rather than visitor requests.

### HostGator workflow

Open **Cron Jobs** in cPanel's Advanced section or the equivalent Cron Jobs control in the HostGator Customer Portal.

Record the exact PHP CLI path appropriate for the account and selected PHP version. HostGator PHP CLI paths can vary by server/version; do not assume `/usr/bin/php` or a specific `/opt/cpanel/ea-phpXX/...` path without verifying it for the account.

Run cron more frequently than the desired synchronization cadence; the integration's own cadence logic prevents unnecessary upstream synchronization attempts.

### Required properties

- cron invokes the private package `bin/sync.php`, not a public URL;
- cron uses the sync-only private configuration;
- bearer token is not printed in the command line or public logs;
- cron output/error handling does not create unbounded public files;
- ordinary visitor requests remain independent of cron execution.

### Record

- Cron Jobs control used:
- PHP CLI path:
- Cron schedule:
- Cron command/wrapper path:
- Private log destination, if any:
- First scheduled result:

### Pass condition

HostGator can synchronize the Profile on schedule without a browser request or visitor-path News Scraper call.

### Evidence / notes

```text

```

---

## Step 11 — Choose the public filename/URL strategy before conversion

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Introduce PHP execution without unintentionally changing an indexed/public URL.

### Decision A — existing public URL is normally `/`

If visitors and search engines use the directory URL (for example `https://example.com/`) and the server currently resolves that internally to `index.html`, converting the working page to `index.php` is acceptable only if the public URL remains `/` and existing SEO metadata remains unchanged.

Before switching files, verify which file HostGator serves when both `index.html` and `index.php` exist. Do not assume directory-index precedence.

### Decision B — `/index.html` is an established public URL that must remain executable

If external links, search results, canonical behavior, scripts, or customer requirements depend on the literal `.html` URL, do not casually break it. Choose an intentional HostGator-compatible approach, such as:

- preserving/redirecting the historical URL to the canonical `/` while serving PHP there; or
- configuring PHP execution for the `.html` file through the hosting account's supported Apache/`.htaccess` mechanism when the customer explicitly wants the filename preserved.

Any `.htaccess` modification must be backed up first and must not silently change unrelated routing, redirects, or PHP handlers.

### Record

- Canonical/public URL to preserve:
- Does `/index.html` currently receive external/direct traffic?:
- Selected strategy (`index.php`, redirect, PHP-in-HTML handler, other):
- Existing `.htaccess` backup location, if modified:
- Effective directory-index behavior:

### Pass condition

There is a deliberate filename/routing strategy that preserves the customer's intended public URL and avoids accidental duplicate-content URLs.

### Evidence / notes

```text

```

---

## Step 12 — Create a PHP-capable working page with zero presentation changes

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Prove the existing customer page can execute through PHP without changing its rendered presentation before News Scraper code is introduced.

### Procedure

Using the strategy selected in Step 11, make a working PHP-executed copy of the original page while leaving the frozen rollback copy untouched.

At this stage, add no News Scraper bootstrap/read/render code.

### Record

- Working page path:
- Frozen original retained at:
- Public URL:
- HTTP status before conversion:
- HTTP status after conversion:
- Final resolved URL before conversion:
- Final resolved URL after conversion:
- Visual/browser differences observed:
- `<head>` differences observed:
- Response-body diff result, if compared:

### Required checks

- page executes through PHP;
- public URL/canonical behavior is preserved as planned;
- page remains visually equivalent to the frozen baseline;
- existing title/meta/canonical/robots/structured data remain unchanged;
- existing CSS, JS, images, navigation, and static sections continue to load;
- no News Scraper code has been introduced yet;
- rollback remains immediately available.

### Pass condition

The site is PHP-capable while remaining functionally, presentationally, and SEO-structurally equivalent to the original baseline.

### Evidence / notes

```text

```

---

## Step 13 — Add visitor-safe local-read configuration and bootstrap

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Allow the public page to read local synchronized state without receiving upstream credentials or changing visible HTML yet.

### Visitor/local-read values

The web page needs only:

```text
NEWS_SCRAPER_PROFILE_KEY=<profile key>
NEWS_SCRAPER_STATE_ROOT=<HOSTGATOR_HOME>/news-scraper-private/state
NEWS_SCRAPER_SYNC_CADENCE_SECONDS=900
# Optional: NEWS_SCRAPER_MAX_STALE_AGE_SECONDS=...
```

The visitor page/process must not receive:

```text
NEWS_SCRAPER_BASE_URL
NEWS_SCRAPER_BEARER_TOKEN
```

### Required behavior

At the customer page boundary:

1. require the private package `src/bootstrap.php`;
2. create `LocalReadConfiguration` from visitor-safe values;
3. create `LocalProfileReader`;
4. read one `LocalReadResult` for the request;
5. catch unexpected local-read/bootstrap errors without exposing filesystem paths, environment values, stack traces, or secrets.

Do not render Articles yet in this step.

### Required checks

- page still displays the original presentation;
- public page can read the private state root;
- public page does not need or receive upstream URL/token;
- no visitor-path request to News Scraper occurs;
- read happens once per page request rather than repeatedly per Article;
- failure handling does not leak private HostGator paths or secrets.

### Pass condition

The unchanged-looking page can obtain a normalized `LocalReadResult` entirely from HostGator-local state.

### Evidence / notes

```text

```

---

## Step 14 — Replace only the target news region with server-rendered output

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Prove server-rendered insertion first, then map the normalized local model into the customer's existing design.

### Part A — fallback plumbing smoke test

Temporarily render the existing `LocalReadResult` through `FallbackHtmlRenderer` inside only the dynamic section identified in Step 3.

Verify:

- fallback Article HTML appears only in the intended region;
- surrounding customer content remains unchanged;
- raw page source contains headlines and publisher anchors without JavaScript;
- anchors use exact publisher `originalUrl` values;
- no News Scraper tracking/redirect URL is used;
- special characters are safely escaped;
- visitor rendering succeeds entirely from local state.

### Part B — customer markup

After Part A passes, replace fallback presentation with customer-owned markup using only the normalized `LocalReadResult` fields required for presentation.

Supported local Article fields include:

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

### Rendering requirements

- preserve existing article/card DOM structure and class names where practical;
- iterate Articles in supplied order;
- do not locally sort, deduplicate, or re-filter;
- use exact `originalUrl` for the primary headline link;
- escape all text and attribute values for their final HTML context;
- handle nullable author/summary/publishedAt/imageUrl safely;
- customer-owned `_self`/`_blank` behavior may differ, but destination must not be rewritten;
- no JavaScript is required to create the core content or links.

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

The dynamic section matches the intended customer style while data/order/destinations remain those supplied by the local read model.

### Evidence / notes

```text

```

---

## Step 15 — Define local states and verify customer/SEO behavior

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Verify the finished page is safe, crawlable, and intentional across local states without claiming SEO outcomes News Scraper cannot guarantee.

### Local states

| Local state | Required customer-page behavior |
| --- | --- |
| `usable` | Render supplied Articles normally. |
| `stale_usable` | Keep rendering valid local Articles; optionally show the customer-chosen stale indicator. |
| usable with zero Articles | Render the chosen empty state without fabricating content. |
| `never_synced` | Render the chosen safe initializing/unavailable state. |
| `stale_cutoff` | Do not render expired Articles; render the safe fallback state. |
| `disabled` | Do not render cached Articles; show the chosen disabled/empty presentation. |
| `unavailable` | Render the safe unavailable presentation without leaking internals. |
| unexpected exception | Keep the surrounding customer page usable where practical and render a safe local fallback. |

### Raw-response / SEO checks

Using `curl`, browser View Source, or another non-JavaScript HTTP inspection method:

- Article headlines are present in returned HTML;
- Article anchors are present in returned HTML;
- Article anchors use exact publisher `originalUrl` destinations;
- no client-side fetch/XHR is required to populate core content;
- public URL remains the intended canonical URL;
- `<title>`, canonical, robots, meta description, structured data, and surrounding customer SEO markup remain preserved unless intentionally changed;
- no accidental duplicate `/`, `/index.html`, and `/index.php` public variants were introduced;
- News Scraper makes no claim that SSR guarantees rankings, backlink value, PageRank transfer, or reciprocal-link value.

### Record customer copy/presentation

- Empty:
- Initializing:
- Stale usable indicator:
- Stale cutoff:
- Disabled:
- Unavailable:
- Unexpected exception:

### Pass condition

Every local state has deliberate behavior and the raw HostGator response contains the intended crawlable server-rendered news content without visitor-side population.

### Evidence / notes

```text

```

---

## Step 16 — Prove local-only failure, disable/re-enable, and rollback

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Prove the integrated HostGator site remains correctly governed when synchronization fails, the Profile is disabled/re-enabled, or the customer needs to roll back.

### A — upstream/sync failure

After at least one successful sync, create a controlled synchronization failure without deleting active local state.

Verify:

- ordinary visitor requests do not attempt a News Scraper API call;
- valid local Articles continue rendering under the stale policy;
- sync failure does not replace/corrupt active LKG;
- later synchronization can recover without page-code changes.

### B — authoritative Profile disable/re-enable

1. disable the Profile in the protected News Scraper admin control plane;
2. run synchronization so the authenticated disabled response is observed locally;
3. verify cached public Articles are suppressed;
4. reactivate the Profile;
5. perform a later successful sync;
6. verify rendering resumes without changing customer page code.

### C — rollback

Restore the frozen pre-integration customer page using the Step 11 filename/routing strategy.

Verify:

- original page and public URL return successfully;
- original visual and SEO-relevant presentation is restored;
- private integration/state may remain installed without being HTTP-accessible;
- restoring the integrated page can resume local rendering without rebuilding state;
- rollback does not require deleting the machine credential unless decommissioning the integration.

### Pass condition

Failure, lifecycle changes, and rollback all behave without compromising visitor-path locality, private data, or the original customer site.

### Evidence / notes

```text

```

---

## Step 17 — HostGator integration readiness gate

**Status:** [ ] Not started  [ ] READY  [ ] Blocked

The customer HostGator integration is ready for formal managed external-site qualification only when all of the following are true:

- [ ] actual HostGator home/document-root paths are recorded;
- [ ] original customer page is frozen and recoverable;
- [ ] public URL and SEO-relevant baseline are recorded;
- [ ] intended dynamic news region is clearly bounded;
- [ ] HostGator site PHP is >= 8.1 and required extensions/capabilities work;
- [ ] integration ZIP was obtained through the supported News Scraper admin download workflow;
- [ ] package matches the deployed News Scraper version;
- [ ] package/private state/config live outside every public document root;
- [ ] first complete synchronization and local read succeed before page integration;
- [ ] HostGator Cron Jobs executes scheduled synchronization independently of visitors;
- [ ] sync-only and visitor-only configuration remain separate;
- [ ] filename/routing strategy preserves the intended public URL and avoids duplicate-content variants;
- [ ] PHP execution is proven with no presentation change before News Scraper markup is introduced;
- [ ] local-read bootstrap works without exposing upstream credentials;
- [ ] fallback renderer insertion proves the local SSR plumbing path;
- [ ] customer-specific markup consumes only `LocalReadResult` and preserves upstream order/destinations;
- [ ] every local usability state has defined customer-page behavior;
- [ ] surrounding customer HTML/CSS/JS and SEO-relevant `<head>` markup remain preserved outside intentional changes;
- [ ] raw HTTP response contains server-rendered headlines and direct publisher links;
- [ ] no visitor-path News Scraper API call occurs;
- [ ] upstream sync failure preserves valid LKG rendering under the stale policy;
- [ ] authenticated Profile disable suppresses cached public Articles;
- [ ] later successful synchronization restores rendering after re-enable;
- [ ] rollback to the exact frozen customer baseline has been exercised;
- [ ] no bearer token/private state/package internals are publicly retrievable;
- [ ] all observed versions, paths, checksums, and relevant evidence are recorded separately from this master worksheet.

### Readiness result

```text
READY / BLOCKED:
Reason:
```

---

## After this worksheet

If this worksheet reaches `READY`, the HostGator customer-side mechanics are suitable inputs to the formal Phase 7 managed external-site release qualification.

This worksheet itself is not durable release evidence. Formal qualification must still record the exact accepted News Scraper source/version, exact integration package/version, managed/external deployment topology, real Profile/credential path, observed synchronization/LKG behavior, raw server-rendered output, failure/disable/recovery behavior, and the applicable release-validation artifact required by the Phase 7 prompt stack.

Keep this file as the clean customer-facing master worksheet. Record one customer's completed values/evidence in a separate copy or validation artifact rather than editing the master with customer secrets, account-specific credentials, or test history.

If any step exposes a genuine product defect, stop and record the smallest failing boundary. Fix the product/package boundary through the normal correction or Phase 7 workflow rather than compensating with customer-specific logic that would hide the defect.
