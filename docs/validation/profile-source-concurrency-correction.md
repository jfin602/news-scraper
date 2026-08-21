# Profile/Source concurrency correction validation

## Result and identity

- Status: **Correction GREEN — HUMAN REVIEW REQUIRED**.
- Correction: `c1-profile-source-concurrency`.
- Correction base: `ea98ed9d02af72eac83a764649df54c5fc08d993`.
- Accepted executable source commit: `2027707a98fef17dfd763fbab6af018bc41849ca`.
- Package version: `1.1.4` (unchanged).
- Closeout added only this validation artifact; no bounded source/test repair and no Terra High remediation handoff occurred. Human acceptance and a separate artifact commit are still required.
- Observed environment: Node `v24.11.1`, npm `11.6.2`, PostgreSQL client `18.3`; the database suite provisioned real disposable PostgreSQL databases and completed without prerequisite skips.

This artifact clears only the correction. It does not make Phase 1 GREEN, close Phase 1, advance the roadmap, or authorize `/closeout`.

## Reviewed scope and protocol

The complete P1 diff and current consumers were reviewed in:

- `src/admin/distribution-profile-administration.ts`
- `src/admin/source-administration.ts`
- `src/distribution/profiles/repository.ts`
- `src/distribution/profiles/source-validity-lock.ts`
- `test/database/distribution-profile-administration.test.ts`
- `test/unit/distribution-profile-source-validity-lock.test.ts`

All mutations that can reduce active-Profile usable-Source validity were traced. The final protocol is:

- activation/reactivation: lock the inactive Profile row; read its associated stable Source IDs; validate, normalize, deduplicate, and sort those IDs; acquire each namespaced Source-validity `pg_advisory_xact_lock`; lock/re-read associated Source rows; validate at least one approved+active Source; mutate lifecycle and audit atomically;
- Source unapproval/archive: resolve stable Source identity; acquire its Source-validity transaction advisory guard; discover/lock currently active referencing Profiles; lock/re-read their Source rows; validate the proposed Source state; mutate or reject atomically;
- active association removal: retain Profile-row then Source-row locking and acquire no validity advisory guard, avoiding an advisory/Profile-row reverse cycle;
- disabling and usability-improving Source transitions do not acquire unnecessary validity guards.

The helper uses a dedicated versioned namespace, normalized UUID input, deterministic signed-bigint SHA-256 keys, transaction-scoped advisory locks, and no manual unlock, retry, polling, process mutex, or installation-global lock.

## Deterministic Level 4 evidence

The activation/unapproval test deliberately observed Source invalidation acquire the guard and complete empty active-Profile discovery while the target remained draft. It paused invalidation, started activation, observed activation attempt but not pass the same guard, released invalidation to commit unapproval, then observed activation re-read current Source state and reject with `profile_requires_usable_source`. Final SQL found zero invalid active Profiles, the Profile remained draft, and no activation success audit existed.

The association-removal/archive test paused removal after Profile-owned Source rows were locked, then observed archival acquire the other Source's validity guard and block attempting the active Profile row. Releasing removal allowed it to commit; archival resumed against current membership and rejected with `source_required_by_active_profile`. The Profile remained active with one usable Source, final SQL found no invalid state, and no archive-side success audit was introduced.

Additional PostgreSQL evidence showed overlapping two-Source activations terminate under deterministic multi-lock order and concurrent invalidation of two different final usable Sources permits at most one loss. The complete database suite also retained transaction/audit rollback coverage.

## Review passes

### Pass 1 — contract and evidence

The correction preserves usable Source semantics as exactly approved plus active; operational state remains irrelevant; draft/disabled incompleteness, activation/reactivation validation, active final-association removal rejection, and Source invalidation rejection remain unchanged. Advisory acquisition is inside the owning mutation transactions and active-Profile discovery occurs only after the Source guard. Repository code owns association-ID loading; application services retain business validation. No schema, migration, API, UI, collection, outward behavior, or Phase 2 capability changed.

### Pass 2 — adversarial hypotheses

The reviewed lock graph disposes the required races without an unresolved stale-discovery or deadlock concern. Same-Source invalidations serialize on one advisory key. Different-Source invalidations sharing a Profile serialize on the Profile row without requiring each other's advisory key. Activation may own an inactive Profile while invalidation owns a Source guard because invalidation locks only active Profiles; after invalidation commits, activation re-reads Source state. Multiple activations use one normalized Source-ID ordering and duplicate IDs are removed. Addition/removal, draft edits, disabling, no-op/invalid Source requests, transaction failures, and audit failures introduce no reversed advisory acquisition or partial commit. Malformed identities are rejected, the namespace is distinct from Article and endpoint locks, and the test checkpoints wrap real transactions rather than mocking locks. No plausible concern required a bounded repair, structural handoff, or deeper concurrency replanning.

### Pass 3 — structural review

One Profile-owned helper contains key derivation and ordering. Raw association-ID SQL remains in the Profile repository. Advisory locking is not hidden in generic Source-row helpers and is limited to activation/reactivation and usability-reducing Source transitions. Association removal deliberately retains its established row-lock protocol. Test barriers remain local to the database test, use bounded timeouts, and preserve real PostgreSQL transactions. No speculative lock framework, process-local synchronization, retry masking, Phase 2 stub, or unrelated cleanup was introduced.

## Exact validation results

- `npm run check` — PASS: 478 tests, 31 suites, 478 passed, 0 failed/cancelled/skipped/todo.
- `npm run test:db` — PASS: 227 tests, 5 suites, 227 passed, 0 failed/cancelled/skipped/todo; real disposable PostgreSQL proof included all four focused Profile concurrency cases.
- `npm run codex:phase:validate -- c1-profile-source-concurrency` — PASS: canonical P1 implementation plus sole final P2 closeout, fixed version `1.1.4`.
- `git diff --check ea98ed9d02af72eac83a764649df54c5fc08d993...HEAD` — PASS before this artifact write.

Migrations `0001` through `0015` were unchanged across the correction; no `0016` was added. No `package-lock.json` or `npm-shrinkwrap.json` exists. Browser, security, recovery, migration-specific, collection-fixture, live-Source, and deployment suites were not required because the correction did not touch those boundaries.

## Handoff

The corrected tree supplies the original Phase 1 P5 with the Source-validity advisory boundary, current-state activation validation, association-removal deadlock safety, deterministic PostgreSQL interleavings, and final invariant queries it previously lacked. After owner review accepts this correction and artifact, rerun `docs/tasks/p1-1/P5-distribution-profile-foundation-closeout.txt` unchanged from the beginning. Do not perform roadmap `/closeout` yet.
