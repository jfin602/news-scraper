# News Scraper PHP synchronization core

This package is a host-local cache adapter for the authenticated News Scraper v1 distribution API. Synchronization is scheduled work, not a visitor-path endpoint. Customer presentation reads the normalized `LocalReadResult` through the stable root `local-read.php` entrypoint.

The News Scraper application produces a versioned generic customer package from an explicit manifest. The ZIP extracts to `ns-integration/` and contains its runtime files, root `top-tag.php`, `config/sync.env.example`, `config/local-read.env.example`, and generated `VERSION` and `integration-package.json` metadata. Tests, cache state, credentials, `ns-private`, and unrelated repository files are not package inputs. The package producer returns the complete download result to its protected application consumer; it does not write an archive into this repository or a public directory.

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
the stable root `local-read.php` boundary. The package internally consumes the
validated local-state handoff; customer markup must not require `src/bootstrap.php`,
instantiate state stores, or parse cache paths, generation/manifest JSON, or
other state internals.

When the v1 Profile snapshot contains a valid optional digest, it is synchronized inside that same complete Profile LKG generation and is available as nullable `$result->digest`. The normalized digest contains only its generated time, `current`/`older` freshness, input count, provider/model, overview, highlights, and resolved supporting Article metadata. Missing or malformed optional digest data fails open to `null`; valid Articles still activate. Older local generations that predate digest support also read as `null`. A newer valid Article revision with no usable digest replaces the previous digest with `null`; it does not retain stale AI content.

The customer-facing read path is local-only and does not require the upstream
URL or bearer token:

```php
require_once __DIR__ . '/path/to/ns-integration/local-read.php';
$result = news_scraper_local_read();
```

`top-tag.php` is the first-party, editable server-rendered reference markup. It
loads the normalized local result once, then has clearly marked optional AI
Digest and independent Article Feed blocks. Customers may copy, move, restyle,
or remove the digest block without changing synchronization, local-read
configuration, or ordinary Article rendering. It is reference markup rather
than a required visual template or presentation API.

The former `LocalProfileRenderer` / `FallbackHtmlRenderer` path is not shipped
or supported. There is no separate digest template, digest runtime, visitor-time
upstream request, Gemini key, or digest cron. Digest text is rendered as escaped
plain text and its supporting destinations are application-resolved stored
Article URLs; final customer styling and layout remain customer-owned.

Package upgrade and preflight procedures are documented with the package
release workflow when available; this reference intentionally does not define
those future mechanics.
