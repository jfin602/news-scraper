# News Scraper PHP synchronization core

This package is a library-first, host-local cache adapter for the authenticated News Scraper v1 distribution API. It is not a visitor-path endpoint. Customer code may read the normalized `LocalReadResult` directly, implement `LocalProfileRenderer`, or use the optional `FallbackHtmlRenderer` for safe server-rendered reference HTML.

The News Scraper application produces a versioned generic customer package from an explicit manifest. It contains the runtime files, `config/sync.env.example`, `config/local-read.env.example`, and generated `VERSION` and `integration-package.json` metadata. Tests, cache state, credentials, and unrelated repository files are not package inputs. The package producer returns the complete download result to its protected application consumer; it does not write an archive into this repository or a public directory.

Install the replaceable package as `ns-integration` beside a durable,
non-public `ns-private` directory. The package owns a deliberately small,
literal `KEY=value` parser; it does not evaluate shell syntax, PHP, commands,
or variable interpolation. `local-read.env` is the authoritative source for
shared non-secret settings, while `sync.env` is readable only by the scheduled
synchronization process.

`ns-private/local-read.env`:

```text
NEWS_SCRAPER_PROFILE_KEY=weekly-desk
NEWS_SCRAPER_STATE_ROOT=/absolute/non-public/news-scraper-state
NEWS_SCRAPER_SYNC_CADENCE_SECONDS=900
# Optional: NEWS_SCRAPER_MAX_STALE_AGE_SECONDS=86400
```

`ns-private/sync.env`:

```text
NEWS_SCRAPER_BASE_URL=https://news-scraper.example
NEWS_SCRAPER_BEARER_TOKEN=replace-with-runtime-secret
NEWS_SCRAPER_TIMEOUT_SECONDS=20
NEWS_SCRAPER_MAX_RESPONSE_BYTES=2097152
```

Older `sync.env` files may retain duplicated shared keys only when they agree
with `local-read.env`; they are validation aliases, never authority. Remove
them after a successful upgrade.

Run it from cron more frequently than the desired cadence; the local manifest's `lastAttemptAt` anchors due decisions, so failed runs do not hammer the upstream API. A successful `synced`, `unchanged`, `not_due`, or `already_running` command exits zero. `--force` bypasses due calculation but still uses the same per-Profile nonblocking lock.

```text
* * * * * /usr/bin/php /path/to/ns-integration/run-sync.php
```

State uses a SHA-256 Profile identity, an immutable `generations/g-*.json` payload, and `manifest.json` as the sole activation point. Generation and manifest temporary files are written and flushed in their destination directories before atomic rename. Atomic visibility is host-local/same-filesystem only; the package does not claim distributed locking, cross-host coordination, or power-loss durability. Permissions are requested as `0700` directories and `0600` files where POSIX hosts support them; customers must ensure the configured root is non-public and owned appropriately.

Ordinary customer/integration code receives normalized `LocalReadResult` through
the stable root `local-read.php` boundary. It may render custom HTML from that
model or use `FallbackHtmlRenderer`. The package internally consumes the
validated local-state handoff; customers must not require `src/bootstrap.php`,
instantiate state stores, or parse cache paths, generation/manifest JSON, or
other state internals.

When the v1 Profile snapshot contains a valid optional digest, it is synchronized inside that same complete Profile LKG generation and is available as nullable `$result->digest`. The normalized digest contains only its generated time, `current`/`older` freshness, input count, provider/model, overview, highlights, and resolved supporting Article metadata. Missing or malformed optional digest data fails open to `null`; valid Articles still activate. Older local generations that predate digest support also read as `null`. A newer valid Article revision with no usable digest replaces the previous digest with `null`; it does not retain stale AI content.

The customer-facing read path is local-only and does not require the upstream
URL or bearer token:

```php
require_once __DIR__ . '/path/to/ns-integration/local-read.php';
$result = news_scraper_local_read();
$html = (new FallbackHtmlRenderer())->render($result);
```

`example/index.php` is a deliberately small, framework-free customer-style
server-rendered composition. It calls the stable local-read boundary only. It
never reads `sync.env`, `NEWS_SCRAPER_BASE_URL`, or
`NEWS_SCRAPER_BEARER_TOKEN`; those belong solely to the separate scheduled
synchronization process.

`FallbackHtmlRenderer` is optional presentation. A customer renderer can implement `LocalProfileRenderer` and receive only `$result`, or bypass the fallback and build its own HTML from the normalized local model.

Digest presentation remains customer-owned. This package does not add digest HTML/CSS, a Gemini key, a visitor-time upstream request, or another digest cron. The Phase 2 package/launcher and presentation refresh remains separate; all non-digest package mechanics documented here are unchanged.
