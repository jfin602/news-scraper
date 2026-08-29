# News Scraper PHP synchronization core

This package is a library-first, host-local cache adapter for the authenticated News Scraper v1 distribution API. It is not a visitor-path endpoint. Customer code may read the normalized `LocalReadResult` directly, implement `LocalProfileRenderer`, or use the optional `FallbackHtmlRenderer` for safe server-rendered reference HTML.

The News Scraper application produces a versioned generic customer package from an explicit manifest. It contains the runtime files, `config/sync.env.example`, `config/local-read.env.example`, and generated `VERSION` and `integration-package.json` metadata. Tests, cache state, credentials, and unrelated repository files are not package inputs. The package producer returns the complete download result to its protected application consumer; it does not write an archive into this repository or a public directory.

Set these runtime secrets/configuration values outside the public document root:

```text
NEWS_SCRAPER_BASE_URL=https://news-scraper.example
NEWS_SCRAPER_PROFILE_KEY=weekly-desk
NEWS_SCRAPER_STATE_ROOT=/absolute/non-public/news-scraper-state
NEWS_SCRAPER_BEARER_TOKEN=replace-with-runtime-secret
NEWS_SCRAPER_SYNC_CADENCE_SECONDS=900
# Optional: NEWS_SCRAPER_MAX_STALE_AGE_SECONDS=86400
```

Run it from cron more frequently than the desired cadence; the local manifest's `lastAttemptAt` anchors due decisions, so failed runs do not hammer the upstream API. A successful `synced`, `unchanged`, `not_due`, or `already_running` command exits zero. `--force` bypasses due calculation but still uses the same per-Profile nonblocking lock.

```text
* * * * * /usr/bin/php /path/to/integrations/php/bin/sync.php
```

State uses a SHA-256 Profile identity, an immutable `generations/g-*.json` payload, and `manifest.json` as the sole activation point. Generation and manifest temporary files are written and flushed in their destination directories before atomic rename. Atomic visibility is host-local/same-filesystem only; the package does not claim distributed locking, cross-host coordination, or power-loss durability. Permissions are requested as `0700` directories and `0600` files where POSIX hosts support them; customers must ensure the configured root is non-public and owned appropriately.

Ordinary customer/integration code uses `LocalProfileReader` and receives normalized `LocalReadResult`; it may implement `LocalProfileRenderer`, use `FallbackHtmlRenderer`, or render custom HTML from that model. `LocalProfileReader` internally consumes the validated `FilesystemProfileStateStore::readForPhase6()` / `LocalProfileRead` handoff. Customers must not parse cache paths, generation/manifest JSON, or other state internals; the boundary exposes only a validated committed active snapshot, usability classification, and bounded local health.

When the v1 Profile snapshot contains a valid optional digest, it is synchronized inside that same complete Profile LKG generation and is available as nullable `$result->digest`. The normalized digest contains only its generated time, `current`/`older` freshness, input count, provider/model, overview, highlights, and resolved supporting Article metadata. Missing or malformed optional digest data fails open to `null`; valid Articles still activate. Older local generations that predate digest support also read as `null`. A newer valid Article revision with no usable digest replaces the previous digest with `null`; it does not retain stale AI content.

The customer-facing read path is local-only and does not require the upstream URL or bearer token:

```php
$reader = new LocalProfileReader($localConfiguration);
$result = $reader->read();
$html = (new FallbackHtmlRenderer())->render($result);
```

`example/index.php` is a deliberately small, framework-free customer-style
server-rendered composition. Serve that directory with the local-read values
(`NEWS_SCRAPER_PROFILE_KEY`, `NEWS_SCRAPER_STATE_ROOT`, cadence, and optional
stale-age) only. It never needs `NEWS_SCRAPER_BASE_URL` or
`NEWS_SCRAPER_BEARER_TOKEN` on the visitor process; those belong solely to the
separate scheduled synchronization process.

`FallbackHtmlRenderer` is optional presentation. A customer renderer can implement `LocalProfileRenderer` and receive only `$result`, or bypass the fallback and build its own HTML from the normalized local model.

Digest presentation remains customer-owned. This package does not add digest HTML/CSS, a Gemini key, a visitor-time upstream request, or another digest cron. The Phase 2 package/launcher and presentation refresh remains separate; all non-digest package mechanics documented here are unchanged.
