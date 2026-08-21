# Phase 1 — Distribution Profile foundation validation

## Result and identity

- Status: **Phase 1 GREEN — HUMAN REVIEW REQUIRED**.
- Phase implementation base: `d0c0be46c5f5762183e6f1107ff35718b4d7100e`.
- P1: `58b849974431ff4654e86a20d0764471b882fe2a` (`1.1.1`).
- P2: `10ea8a5f75d2f1ea9930f578e236728feec1a672` (`1.1.2`).
- P3: `62c6ef2f39e487e9a64f3df88a3e547672473af4` (`1.1.3`).
- P4: `f2f741f5f7fffac67df123c437f89221906e64cb` (`1.1.4`).
- Accepted correction executable commit: `2027707a98fef17dfd763fbab6af018bc41849ca`; correction artifact commit: `56e19c1a063e39968e9de3c02855ec8c865096dd`.
- Validated closeout tree: HEAD `56e19c1a063e39968e9de3c02855ec8c865096dd` plus the uncommitted `package.json` and `test/browser/admin-page.test.ts` diff whose Git binary-diff object identity is `2cf1fbfa20a4327f77146b486bc50753e833d93e`, plus this artifact. Human acceptance and commit remain required.
- Package version: `1.1.5`. No `package-lock.json` or `npm-shrinkwrap.json` exists.
- Environment: Node `v24.11.1`; npm `11.6.2`; PostgreSQL client and native backup tools `18.3`; Playwright `1.56.1`; bundled Chromium `141.0.7390.37`.
- Migration `0015_distribution_profiles.sql` SHA-256: `68896237B6AF41EF91F982FB7B7C34A9A0B532C19C9400EF7BAE4E80ED66496F`.
- Migrations `0001`–`0014` have no diff from the Phase implementation base and remain the accepted supported production history.

## Final validation

- `npm install` — PASS; 216 packages audited, no lockfile created, 0 vulnerabilities.
- `npm run check` — PASS on the final repaired tree; formatting, lint, typecheck, and 478 tests in 31 suites passed; 0 failed/cancelled/skipped/todo.
- `npm run test:db` — PASS; 227 tests in 5 suites passed against real disposable PostgreSQL; 0 failed/cancelled/skipped/todo.
- `npm run test:security` — PASS; 3 tests passed; 0 failed/cancelled/skipped/todo.
- `npm run test:recovery` — PASS; 1 native PostgreSQL backup/restore test passed; 0 failed/cancelled/skipped/todo.
- `npm run test:browser` — initial run exposed the bounded test race described below; rerun after repair PASS with 42 tests in 6 suites; 0 failed/cancelled/skipped/todo.
- `npm run codex:phase:validate -- p1-1` — PASS; P1–P5 are contiguous with exactly one final P5 closeout and assigned versions `1.1.1`–`1.1.5`.
- `git diff --check d0c0be4...HEAD` and `git diff --check` — PASS.

The database suite proved migration from zero and a genuine accepted `0001`–`0014` production baseline upgrade through `0015`. Representative Publication, Source/domain/endpoint, Category/Relevance, Article/observation, duplicate, audit, and durable-job state and relationships remained intact. The native recovery suite proved Profile configuration survives backup and restore.

## Pass 1 — contract and evidence review

- Product/domain: Profiles are installation-owned peer resources without Publication/customer/tenant scoping. Profile configuration does not alter collection trust, Article identity/provenance, Relevance, moderation, duplicate state, `/`, or `/api/feed`. No topic-specific behavior or duplicated Source collection was introduced.
- Persistence: the sole additive `0015` migration provides immutable unique Profile keys, bounded relational configuration, peer Source/Category foreign keys, deterministic ordered phrases/Categories, and retained Category integrity. The repository returns one complete Profile aggregate by immutable key.
- Lifecycle/relationships: creation is draft; only draft→active, active→disabled, and disabled→active are accepted. Activation/reactivation requires an approved+active associated Source; operational state is orthogonal. Active association removal and Source unapproval/archive cannot strand an active Profile. Mutations and append-only audit events share transactions; Profile deletion is absent.
- Concurrency: the accepted correction adds deterministic transaction-scoped Source-validity advisory guards for activation/reactivation and usability-reducing Source transitions, followed by locked current-state reads. Real PostgreSQL tests proved activation/unapproval, association-removal/archive, overlapping activation, and two-Source invalidation interleavings terminate without deadlock and never commit an active Profile with zero usable Sources.
- HTTP/UI: only protected `/admin/api/distribution-profiles` control-plane routes were added. Routes delegate to the application service, inherit admin enablement/request-integrity/JSON/no-store/security controls, map bounded failures, and do not expose machine API/auth. Chromium proved create/configure/association/lifecycle, conflict preservation, reload/state reconstruction, keyboard behavior, and narrow viewport behavior without Article-selection logic.
- Phase 2 handoff: Profile key/name/lifecycle/result limit, ordered Source memberships, include/exclude/Category selectors, and Source stable identity/current approval+lifecycle all come from the Profile repository aggregate and its round-trip database proof. Lifecycle and activation validity remain owned by the Phase 1 administration authority; Phase 2 need not query child tables or invent state/relationship semantics.

## Pass 2 — adversarial review

Executed unit/database/integration/browser evidence covers blank/control/overlong phrases, case-insensitive duplicates, allowed include/exclude overlap, entry/count bounds, duplicate Categories, integer/result bounds, database key immutability, late child replacement rollback, missing/archived/unapproved Source combinations, operational-state orthogonality, Category retention, atomic audit rollback, strict JSON keys, request integrity, bounded error disclosure, authoritative browser state, ordered reload, stable Source keys, and retained existing admin/public behavior. The correction evidence covers stale pre-lock reads, final-usable-Source races, deterministic multi-lock ordering, and deadlock termination. No unresolved integrity, migration, security, or producer-handoff concern remains.

## Pass 3 — structural review

Profile SQL remains in the Profile repository; lifecycle/usability authority remains in the application service; routes and browser code do not duplicate it. The Source-validity helper owns only normalized namespaced advisory-key derivation/order, while association SQL remains repository-owned. Existing `audit_events` are reused. No collection coupling, tenant abstraction, Profile-specific history store, Phase 2 read model/API/auth/PHP stub, adapter, deletion feature, or speculative framework was introduced. Migration and production-upgrade tests use the real accepted baseline rather than nominal fixtures.

## Bounded closeout repair

The first full browser run failed an existing endpoint-editor test because the harness observed POST persistence before the browser completed its authoritative create refresh. The test began editing `1200`, the pending create render restored persisted `600`, and the subsequent PUT truthfully submitted `600`. The bounded repair makes the test await the existing `Endpoint created.` completion signal before editing. No runtime behavior changed. The complete browser suite and `npm run check` were rerun green on the repaired tree. No Terra High refactor handoff occurred during this successful rerun; the earlier accepted `c1-profile-source-concurrency` correction was the prerequisite concurrency remediation.

## Scope qualification and handoff

No Level 7 live-Source or Level 8 deployed/customer integration proof is claimed or required because Phase 1 adds no live distribution consumer. No canonical distribution Article-selection/read model, machine credentials/API, PHP/LKG, WordPress/RSS adapter, self-host packaging, analytics, or widget capability was pulled forward.

After human acceptance and commit of this closeout tree/artifact, the next step is conversational `/closeout` to the documented `1.2.0` Phase 2 baseline, not additional Phase 1 feature work.
