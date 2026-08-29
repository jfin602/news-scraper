# PHP integration upgrade and rollback

This package replaces only `ns-integration`. Keep `ns-private` beside it; it owns your existing configuration, machine credential, state root, LKG, and logs.

## Staged cPanel/File Manager upgrade

1. Download the versioned ZIP from the protected News Scraper admin page and note its displayed version.
2. In the customer home directory, extract the ZIP completely into a sibling staging directory, for example `ns-integration-stage`. Do not extract over the live `ns-integration` directory and never extract into `ns-private`.
3. Open the staged directory and confirm `VERSION` contains the displayed version. Run `php preflight.php` there. It checks package metadata, runtime, `../ns-private/local-read.env`, and existing local state without syncing or changing files. Run `php preflight.php --sync` only when you also want to validate `../ns-private/sync.env`; it does not contact the upstream service.
4. Confirm the staged directory contains `run-sync.php`, `local-read.php`, and `top-tag.php`. `top-tag.php` is an example to copy or adapt; do not overwrite your customer page/markup with it.
5. Rename live `ns-integration` to a bounded backup name such as `ns-integration-backup-2.2.4`, then immediately rename the fully staged directory to `ns-integration`.
6. Leave the cron command unchanged: it continues to target `ns-integration/run-sync.php`. Verify the existing customer page and its Article links. The next scheduled sync uses the existing credential and state.

Do not regenerate a credential, delete/rebuild the state root or LKG, or overlay package files during a normal upgrade. If `sync.env` has legacy duplicated shared settings, remove those aliases only after a successful preflight; any retained aliases must match `local-read.env` exactly.

## Rollback

If the replacement fails, rename the failed `ns-integration` directory aside, then restore the immediately prior backup directory to exactly `ns-integration`. Leave `ns-private`, its credential, state root, LKG, cron command, and customer-owned markup untouched. The package state format is additive: the prior package can continue reading the retained Article LKG even when a newer complete snapshot contains an optional digest.
