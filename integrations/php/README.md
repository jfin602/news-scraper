# News Scraper PHP synchronization core

This package is a library-first, host-local cache adapter for the authenticated News Scraper v1 distribution API. It is not a visitor-path endpoint and does not render customer HTML.

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

Phase 6 consumers must use `FilesystemProfileStateStore::readForPhase6()` and its `LocalProfileRead` result, not cache paths or JSON. It exposes only a validated committed active snapshot, usability classification, and bounded local health.
