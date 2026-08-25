# HostGator-like PHP test environment worksheet

**Status:** working manual setup checklist; not validation evidence by itself.  
**Purpose:** build one disposable/shared-host-style PHP environment on the existing VPS so the completed generic PHP package can be exercised manually under realistic hosting constraints.  
**Scope:** environment setup only. This worksheet does not depend on the current Phase 7 prompt stack and does not automate the final release qualification.

## Target model

We are modeling the constraints of ordinary shared PHP hosting, not reproducing HostGator/cPanel internals or adding HostGator-specific product behavior.

Target layout:

```text
existing VPS
├── existing News Scraper managed deployment           # unchanged
└── isolated shared-PHP test account
    ├── ~/public_html/                                 # public web root
    │   └── customer-style PHP page only
    ├── ~/news-scraper-integration/                    # generic PHP package/source
    └── ~/private/
        ├── state/                                     # non-public LKG state
        ├── sync.env                                   # sync-only upstream configuration/secret
        └── logs/                                      # bounded test/sync logs if needed
```

The test site should use the existing VPS web server plus a dedicated PHP-FPM/shared-PHP execution boundary where practical. Do not install a competing web stack merely to imitate HostGator branding. The important properties are public/private filesystem separation, ordinary PHP web execution, PHP CLI/cron execution, local LKG state, and visitor rendering without upstream credentials.

The PHP package already expects:

- PHP with support for `readonly` properties (PHP 8.1+; Ubuntu 24.04's PHP 8.3 is suitable);
- HTTPS stream access through PHP's native stream wrapper (`allow_url_fopen` available and OpenSSL/CA validation working);
- JSON support;
- writable host-local filesystem state;
- no Composer dependency;
- no Node dependency in the visitor request path.

## Working rules

- Walk through this worksheet strictly in order.
- Do one step at a time and record the result before continuing.
- Do not modify the existing News Scraper deployment unless a later integration step explicitly requires it.
- Keep the shared-PHP test account, document root, PHP-FPM pool/site configuration, cron entry, state, and logs independently removable.
- Never place a bearer token, sync environment file, LKG state, or private log beneath `public_html`.
- The visitor PHP process receives only local-read configuration. The sync CLI/cron process receives the upstream URL and bearer token.
- Use an exact committed News Scraper/PHP package revision when the package is copied into the test account.
- Do not use this same-VPS environment as proof that an independent external HostGator/customer host has been tested. It is a controlled compatibility/preflight environment.

---

## Step 1 — Inventory the VPS before changing anything

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Identify the existing web/PHP/runtime layout so the test environment can be added without colliding with the managed News Scraper deployment.

### Record

- Ubuntu version:
- Active web server (`nginx`, `apache2`, other):
- Existing listeners on ports 80/443:
- PHP CLI installed/version:
- PHP-FPM installed/version/service:
- Existing PHP-FPM pools:
- `allow_url_fopen` value:
- OpenSSL extension available:
- JSON extension available:
- Existing firewall/reverse-proxy/TLS arrangement:
- Candidate test hostname/subdomain available:

### Pass condition

We know which existing web server to reuse, whether PHP/PHP-FPM must be installed, and which hostname/listener approach can be added without disturbing production.

### Evidence / notes

```text

```

---

## Step 2 — Choose the isolated test identity and hostname

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Lock the names/paths before creating anything.

### Proposed defaults

```text
Linux user:          news-scraper-php-test
Home:                /home/news-scraper-php-test
Public document root:/home/news-scraper-php-test/public_html
Package root:        /home/news-scraper-php-test/news-scraper-integration
Private root:        /home/news-scraper-php-test/private
State root:          /home/news-scraper-php-test/private/state
Sync env:            /home/news-scraper-php-test/private/sync.env
Private logs:        /home/news-scraper-php-test/private/logs
Test hostname:       <choose during walkthrough>
```

The account is for the simulated shared-host customer environment only. It should not receive `sudo`, production database access, News Scraper deployment ownership, or admin authority.

### Pass condition

The identity, paths, and hostname are chosen and do not overlap existing deployment paths.

### Evidence / notes

```text

```

---

## Step 3 — Create the isolated shared-host-style filesystem

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Create the dedicated account and public/private directory split before installing PHP application files.

### Required properties

- dedicated non-privileged Unix user;
- `public_html` is the only configured document root;
- package/private/state/log directories are siblings of `public_html`, never children of it;
- private directory is not world-readable;
- state directory is writable by the PHP test identity;
- no access to the managed News Scraper `.env` or PostgreSQL credentials is granted.

### Pass condition

Filesystem ownership/permissions prove public and private roots are separate and the test user can write state without sudo.

### Evidence / notes

```text

```

---

## Step 4 — Verify or install the minimum PHP runtime

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Provide only the ordinary PHP capabilities required by the package.

### Required checks

- PHP CLI >= 8.1;
- PHP-FPM or equivalent web PHP execution available;
- `allow_url_fopen` enabled for the sync CLI environment;
- `openssl` loaded and CA verification functional;
- `json` available;
- PHP can create/write/rename files beneath the private state root;
- no Composer requirement;
- no Node requirement for web requests.

### Pass condition

A trivial CLI check and a trivial web PHP page both execute under the intended test identity/runtime, and HTTPS stream support is available.

### Evidence / notes

```text

```

---

## Step 5 — Create an isolated PHP web execution boundary

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Make the visitor process look like a normal shared-host PHP site without affecting the existing News Scraper web process.

### Preferred approach

Reuse the VPS's existing reverse proxy/web server and create a dedicated PHP-FPM pool (or equivalent isolated PHP site configuration) running as `news-scraper-php-test`.

Visitor configuration must contain only local-read values such as:

```text
NEWS_SCRAPER_PROFILE_KEY=<later validation profile>
NEWS_SCRAPER_STATE_ROOT=/home/news-scraper-php-test/private/state
NEWS_SCRAPER_SYNC_CADENCE_SECONDS=900
# optional later: NEWS_SCRAPER_MAX_STALE_AGE_SECONDS=...
```

The visitor process must not receive:

```text
NEWS_SCRAPER_BASE_URL
NEWS_SCRAPER_BEARER_TOKEN
```

### Pass condition

A PHP page under `public_html` loads through the test hostname and executes as the isolated test site, with no route/path conflict with the managed News Scraper deployment.

### Evidence / notes

```text

```

---

## Step 6 — Configure public HTTPS for the test hostname

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Expose the PHP test page through a real HTTPS hostname while keeping the managed News Scraper origin untouched.

### Required properties

- DNS/subdomain points to the VPS;
- web-server vhost/server block maps only the selected hostname to `public_html`;
- valid TLS certificate/chain;
- HTTP may redirect to HTTPS;
- no private directory aliases;
- no directory listing of package/private/state paths;
- existing `news.jfin.dev` or other managed routes remain unchanged.

### Pass condition

A browser/curl request to the test hostname returns the isolated PHP page over HTTPS, and existing managed endpoints still resolve normally.

### Evidence / notes

```text

```

---

## Step 7 — Install the exact generic PHP package revision

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Copy the already-implemented PHP integration into the isolated account without creating a second implementation.

### Required properties

- record the exact source commit SHA being tested;
- copy/use `integrations/php/` unchanged except for customer-owned presentation files if explicitly needed;
- package code lives outside `public_html` where practical;
- public page may be a minimal wrapper/example that requires the package's `src/bootstrap.php`;
- no bearer token or environment file is copied into public files;
- no `vendor/`/Composer install is introduced.

### Record

- News Scraper commit SHA:
- PHP package source path:
- Installed package path:
- Public page path:

### Pass condition

PHP syntax/load checks succeed from both CLI and web contexts using the installed package copy.

### Evidence / notes

```text

```

---

## Step 8 — Create sync-only private configuration

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Prepare the scheduled sync process without exposing upstream credentials to visitor configuration.

### Private sync values

```text
NEWS_SCRAPER_BASE_URL=<managed HTTPS URL>
NEWS_SCRAPER_PROFILE_KEY=<validation profile key>
NEWS_SCRAPER_STATE_ROOT=/home/news-scraper-php-test/private/state
NEWS_SCRAPER_BEARER_TOKEN=<dedicated test credential>
NEWS_SCRAPER_SYNC_CADENCE_SECONDS=900
```

Optional test-specific values may later include timeout/response-size/stale-age settings.

### Required properties

- private file outside `public_html`;
- restrictive permissions;
- token never printed into worksheet/evidence;
- visitor PHP-FPM/site configuration does not import this file wholesale;
- dedicated test credential only; do not use an unrelated customer credential.

### Pass condition

The test user can load the private sync configuration for CLI/cron, while a normal visitor request has no bearer/base-URL environment value.

### Evidence / notes

```text

```

---

## Step 9 — Create a cron-like synchronization command

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Model a normal shared-host control-panel cron job: PHP CLI runs independently of visitor requests.

### Intended package entrypoint

```text
/usr/bin/php /home/news-scraper-php-test/news-scraper-integration/bin/sync.php
```

The cron wrapper/job may load `private/sync.env`, but secrets must not be embedded in the crontab command line or public logs.

For setup, install the cron entry disabled/commented or at a harmless cadence until the first manual synchronization has succeeded.

### Pass condition

The exact command can be run manually as the shared-host test user, and the scheduled form is ready without requiring a visitor request or Node process.

### Evidence / notes

```text

```

---

## Step 10 — Verify public/private isolation before using a real token

**Status:** [ ] Not started  [ ] Pass  [ ] Blocked

### Goal

Prove the hosting layout is safe before live synchronization.

### Checks

- direct HTTP requests cannot retrieve `private/sync.env`;
- direct HTTP requests cannot retrieve LKG state files;
- direct HTTP requests cannot retrieve package-private test logs;
- public HTML/PHP source contains no token;
- visitor process environment lacks `NEWS_SCRAPER_BEARER_TOKEN` and `NEWS_SCRAPER_BASE_URL`;
- package/state roots are outside the document root;
- filesystem permissions are not world-readable for sync secrets/state;
- test site has no access to production database configuration.

### Pass condition

Every private-path probe is inaccessible and the visitor configuration contains only local-read settings.

### Evidence / notes

```text

```

---

## Step 11 — Environment readiness gate

**Status:** [ ] Not started  [ ] READY  [ ] Blocked

The HostGator-like environment is ready for the actual PHP integration test only when all of the following are true:

- [ ] existing managed News Scraper deployment remained healthy throughout setup;
- [ ] dedicated shared-PHP Unix identity exists with no sudo/admin/database privileges;
- [ ] public document root and private state/config roots are separate;
- [ ] PHP CLI and web execution work under the intended environment;
- [ ] PHP native HTTPS stream/CA validation works;
- [ ] isolated HTTPS test hostname works;
- [ ] exact PHP package revision is installed;
- [ ] visitor configuration contains no upstream URL/bearer credential;
- [ ] sync-only private configuration is ready;
- [ ] cron-like CLI synchronization path is ready;
- [ ] private files/state cannot be fetched from the test website;
- [ ] all relevant paths, versions, and the tested commit SHA have been recorded.

### Readiness result

```text
READY / BLOCKED:
Reason:
```

---

## After this worksheet

Once the environment is `READY`, use a separate manual integration worksheet/procedure to:

1. create/use a dedicated Distribution Profile and machine credential;
2. perform the first forced synchronization;
3. inspect bounded LKG/local-health results;
4. render the customer page from local state;
5. prove direct original publisher links;
6. prove visitor requests do not call News Scraper;
7. exercise stale/failure/disable/re-enable behavior;
8. record the actual observed evidence.

Do not expand this environment-setup worksheet into a new automation framework. If setup exposes a real PHP portability defect, record the exact defect and fix that product boundary directly.