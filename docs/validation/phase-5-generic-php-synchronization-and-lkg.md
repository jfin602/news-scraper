# Phase 5 — Generic PHP synchronization and LKG validation

## Result and identity

- Status: **Phase 5 GREEN — HUMAN REVIEW REQUIRED**.
- Exact pre-P1 Phase 5 base: `53f3d88bf4db755095e44f63b256c8ba823a5ab8` (`Write Phase 5 closeout prompt`).
- P1: `c69738d2ffd5406838b07d1093431f956216c12e` (`1.5.1`).
- P2: `b70ebe2a33e2e639e99350f005e6743db2078bac` (`1.5.2`).
- P3: `bbdcac11bdd2a7df78fcb5353caa2db8ccb9bb8a` (`1.5.3`, current committed `HEAD`).
- Final closeout candidate: that `HEAD` plus the uncommitted `package.json`, `integrations/php/tests/run.php`, and this artifact. The phase runner owns the eventual closeout commit boundary.
- Package version: `1.5.4`. No migration, schema, dependency, lockfile, vendor, or generated state changed.

## Environment and final validation

- PHP `8.5.9` CLI, NTS, Visual C++ 2022 x64. Exercised native modules include Core, date, hash, json, PCRE, random, SPL, standard, and zlib; the complete observed module list was emitted by `php -m` during closeout. The portable runtime did not enable the OpenSSL extension, so controlled native transport proof was loopback HTTP and production TLS behavior remains source/configuration evidence rather than a live TLS handshake claim.
- Node `v24.11.1`; npm `11.6.2`; Windows 11 host filesystem/process environment.
- `npm run check` — PASS on the final tree: formatting, lint, typecheck, 514 Node tests in 34 suites, PHP syntax checks, and 21 substantive PHP tests.
- `npm run codex:phase:validate -- p1-5` — PASS: contiguous P1–P4 grammar, versions `1.5.1`–`1.5.4`, supported model labels, and one final manual P4 closeout.
- `git diff --check 53f3d88...HEAD` — PASS for the committed Phase 5 prefix.
- `git diff --check` — PASS for the final uncommitted closeout candidate.

The evidence is Levels 1–4: source/static/unit/component evidence plus real local filesystem and actual cross-process PHP locking on this Windows host. Controlled loopback HTTP exercised the concrete native PHP stream transport without weakening production HTTPS-only client configuration. No public internet was used by the deterministic suite. Database, browser, recovery, live-Source, and deployment suites were not run because Phase 5 changed no Node behavior, schema, database representation, customer browser surface, collection adapter, or deployment topology.

## Pass 1 — contract and evidence review

- Product boundary: `integrations/php` is a generic downstream adapter over authenticated `/api/v1/distribution/{profile_key}`. It contains no PostgreSQL access, Node repository import, Profile selector interpretation, Source inference, editorial eligibility, filtering, sorting, deduplication, moderation, ranking, destination rewriting, customer rendering, or public local API.
- P1: `ClientConfiguration`, `DistributionClient`, and `NativeHttpTransport` require an absolute HTTPS base, reject credentials/query/fragment, use bearer only in the Authorization header, encode Profile/cursor components, disable redirects, verify TLS, bound timeout/body size, validate the exact required additive-compatible v1 shape and requested identity, preserve timestamps and opaque values, and return bounded typed outcomes for every contracted status/failure. Continuations omit ETag/`304`. Controlled loopback proof now covers the concrete transport's status/header/body path, redirect non-following, response bound, and secret-safe failure.
- P2: `ProfileSynchronizer` acquires one per-Profile lease for the full load/fetch/retry/restart/commit attempt; uses active ETag only initially; traverses every cursor in order; checks Profile/API/revision/display identity; bounds pages/items/cursor loops/retries/Retry-After/restarts; discards candidates on failure or snapshot churn; activates once only after completion; preserves active LKG on all terminal and persistence failures; and writes disabled state only for typed authenticated `profile_disabled`.
- P3: `FilesystemProfileStateStore` writes immutable generation bytes separately, exposes them only through atomic `manifest.json` rename, retains the prior generation, ignores orphans, validates manifest/generation identity together, bounds corrupt/missing state, hashes Profile path identity, rejects unsafe link/file types, and stores no credential/cursor/raw diagnostic. Disable/re-enable and health facts use the same manifest authority. `FilesystemProfileLock` uses nonblocking OS `flock` with handle-scoped ownership and distinct hashed Profile paths; actual PHP processes proved same-Profile exclusion, different-Profile independence, release/reacquisition, and harmless stale lock files.
- Freshness/cadence: last successful local synchronization—not Article dates—drives freshness; disabled wins; never-synced/corrupt state is unavailable; stale valid data has no default cutoff; an optional positive bounded cutoff uses `age > threshold`; future timestamps clamp to zero. Cadence defaults to 900 seconds, is bounded/configurable, anchors on last attempt to avoid cron-frequency hammering, performs no request when not due, and force still uses the same synchronizer/lock.
- Operations/security: CLI configuration comes from environment, accepts only `--force`, emits bounded secret-free results, and performs no rendering. State root is explicit/absolute and documented for non-public placement. Permissions are requested only where the host supports them; claims are limited to host-local/same-filesystem atomic visibility and locking, not distributed or power-loss durability.
- Preserved scope: the exact Phase 5 diff adds only the PHP package, its runner/script wiring, and package versions. It changes no Node source, `/`, `/api/feed`, admin, Worker, Phase 2–4 producer, machine credential, migration, schema, collection, moderation, duplicate, Category, ordering, or stored `originalUrl` behavior.

## Pass 2 — adversarial review

Representative disposition 1 hypotheses protected by coherent source plus executed evidence include encoded slash/query-like Profile text; cursor-only continuation; HTTP/userinfo/query/fragment base rejection; additive fields; malformed JSON/types/timestamps/identities; bodyful or initial-invalid `304`; malformed/error-status mismatch; invalid `Retry-After`; native redirect non-following and body bounds; mixed revision/Profile/API traversal; repeated cursors, page/item limits, partial traversal, retry exhaustion, excessive delay, snapshot restart without candidate splice; activation/manifest failure with old LKG preservation; corrupt manifest and orphan generation non-promotion; disabled/transient/re-enabled transitions; no-cutoff stale and cutoff boundaries; not-due/force behavior; secret-free outcomes/state; and same/different-Profile real process locks.

Filesystem link/type validation, hashed Profile paths, strict generation filename grammar, and manifest-only visibility bound traversal, symlink, crafted manifest, wrong-type, missing/truncated, and newest-file attacks. Atomic rename is intentionally claimed only inside one configured host filesystem. A process interruption after generation rename but before manifest rename leaves an orphan that cannot become active; cleanup failure is best-effort after commit and cannot alter the manifest authority.

Disposition 2 contained three bounded test-only closeout repairs: add missing concrete native transport coverage; replace a request-construction fixture whose whitespace was correctly rejected before transport with slash/query-delimiter opaque input; and correct a health assertion to expect the latest committed `unchanged` result after `recordUnchanged`. No production behavior changed.

No disposition 3 behavior-preserving structural refactor or disposition 4 contract/architecture/new-scope problem was found. No Terra High refactor handoff occurred.

## Pass 3 — structural review

Ownership remains explicit: P1 owns HTTP construction, TLS/redirect/bounds, schema parsing, and typed transport outcomes; P2 owns retry/restart/candidate/disable synchronization policy; P3 owns manifest/generation persistence, locks, cadence, usability, health, and the validated internal loader. The CLI is thin composition. There is no Composer/framework/vendor state, service locator, generic scheduler/daemon, duplicated selector/business-rule implementation, competing mutable activation authority, test-only insecure client mode, provider-specific branch, or customer-facing Phase 6 implementation. No structural refactor is required.

## Phase 6 producer handoff

| Downstream-required Phase 6 capability | Owning Phase 5 implementation/export | Focused proof |
| --- | --- | --- |
| validated committed active Profile/Publication state | `FilesystemProfileStateStore::readForPhase6()` / `LocalProfileRead` | filesystem round-trip and corrupt-manifest tests |
| complete ordered active Article items | `ActiveProfileSnapshot::items` from the validated loader | multi-page synchronizer order and generation round-trip tests |
| exact stored `originalUrl` values | `DistributionPage` → `ProfileCandidate` → generation → `ActiveProfileSnapshot` | client preservation, synchronization order, and filesystem destination round-trip tests |
| revision/ETag/generatedAt/last-success facts | `ActiveProfileSnapshot` plus committed manifest/`LocalProfileHealth` | activation and metadata round-trip tests |
| never-synced state | `LocalProfileUsabilityResolver` / `readForPhase6()` | missing-state and no-active resolver tests |
| stale usable with no default cutoff | `LocalProfileUsabilityResolver` | default stale-usability test |
| configured stale cutoff | `LocalProfileUsabilityResolver` | exact/above cutoff boundary tests |
| authoritative disabled state | committed manifest plus resolver precedence | disable, transient preservation, and `200`/`304` re-enable tests |
| bounded local unavailable/corrupt state | `readForPhase6()` | corrupt/missing/mismatched manifest/generation tests |
| bounded sync/cache health | `FilesystemProfileStateStore::health()` / `LocalProfileHealth` | health/cadence/redaction tests |

Phase 6 does not need generation names, manifests, lock/temp files, raw HTTP, retry transitions, bearer location, cursors, or upstream editorial/Profile rules. This internal loader is not the future customer-facing local API or renderer.

## Limitations and owner transition

This phase has no managed external/customer-browser/HostGator, public-network, live-Source, deployment, distributed-lock, cross-host, cross-filesystem, or power-loss proof. Customer rendering/local public data APIs, HTML escaping/templates, publisher anchors in returned HTML, and visitor-path behavior remain Phase 6/7. Host-local locking and rename evidence applies to the observed Windows/PHP runtime; POSIX permission behavior was not claimed as executed Windows proof.

Conversational `/closeout` to `1.6.0` was not performed. It remains a separate human-owner acceptance and package-only transition after review of this exact closeout candidate.
