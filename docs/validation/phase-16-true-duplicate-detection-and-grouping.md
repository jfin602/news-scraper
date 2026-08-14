# Phase 16 — True Duplicate Detection and Grouping Validation

## Closeout status

**GREEN — 2026-08-14 (America/New_York).**

Phase 16 satisfies its governed exit gate on the exact implementation commit and final P7 tree recorded below. The intended next phase is Phase 17 — Article and duplicate moderation. The separate conversational `/closeout` command is still required to establish the `0.17.0` baseline; P7 did not perform that transition.

## Candidate, range, and environment

- Accepted Phase 16 implementation source commit: `9594294` on `main`; P7 final tree adds only the authorized `0.16.7` version transition and this evidence artifact.
- Phase implementation base: `be420da` (`0.16.0` baseline); implementation and correction range inspected: `be420da...9594294`.
- Package version: `0.16.7`.
- Windows desktop environment; Node.js `v24.11.1`; npm `11.6.2`.
- PostgreSQL `18.3` client and the repository's real disposable-PostgreSQL harness. A separate diagnostic server-version query used the wrong environment-variable name and failed safely; no server version beyond the observed PostgreSQL 18.3 environment is claimed.
- Playwright `1.56.1` with its bundled Chromium; the Chromium product version was not separately captured.
- Clean install from `package.json`: 190 packages, 0 vulnerabilities. No `package-lock.json` or `npm-shrinkwrap.json` was created.

## Final command evidence

| Command/procedure | Final result |
| --- | --- |
| `npm install --ignore-scripts` | Passed after a slow uncached registry fetch; 190 packages installed, 0 vulnerabilities. An earlier quiet attempt was interrupted after producing no progress or files. |
| `npm run format:check` | Passed as part of `npm run check`. |
| `npm run lint` | Passed as part of `npm run check`. |
| `npm run typecheck` | Passed as part of `npm run check`. |
| `npm run test:unit` / `npm run test:integration` / `npm run test:collection` | Covered by the unchanged-tree `npm test` aggregate invoked by `npm run check`; the combined aggregate passed 421 tests with 0 failed, skipped, or todo. |
| `npm test` | Passed through `npm run check`: 421/421. |
| `npm run check` | Passed: formatting, lint, typecheck, and the ordinary aggregate. |
| `npm run test:db` | Passed 202/202 against disposable PostgreSQL; 0 failed/skipped/todo. |
| `npm run test:browser` | Passed 55/55 in real Chromium; 0 failed/skipped/todo. |
| `npm run codex:phase:validate -- p16` | Passed; P1–P7 grammar, versions, recommendations, and sole manual P7 closeout are valid. |
| `git diff --check` and final range inspection | Passed; no whitespace errors. |

Aggregate-command containment was used: subordinate ordinary suites were not redundantly rerun after the unchanged-tree `npm run check` aggregate. No required filter matched zero tests and no required test was skipped.

## Pass 1 — contract and evidence

### Levels 0–3

The complete migration, duplicate evidence and Primary modules, review repository, topology service, Article transaction extraction, collection orchestration/effect accounting, canonical public-feed query, and important Source/Relevance/scheduler/admin consumers were inspected. The engine remains topic-independent and installation-wide, Article identity remains Source-scoped, visibility remains independent from duplicate role, duplicate evaluation has one post-identity Worker path, and Web/API performs no publisher collection. No semantic/AI/body-fetch/original-publisher inference, historical regrouping, or Phase 17 moderation API/UI was introduced.

Unit and controlled integration/collection evidence proves canonical unordered pairs; exact full canonical-URL strong evidence; exact title weak-only evidence; same-Source exclusion; deterministic bounded signals, confidence, and fingerprints; every ordered Primary criterion and input-order independence; post-identity composition; preserved canonical outcomes; exact orthogonal effects; pre-identity short circuits; and bounded failure translation.

### Level 4 — disposable PostgreSQL

The 202-test database suite proved migration from zero, bounded candidate/signal states, pair uniqueness and ordering, one-group membership, deferred member-Primary integrity, restrictive Article/provenance ownership, nonnegative orthogonal counters, and unchanged processing arithmetic. It exercised review dismissal and materially changed evidence, concurrent same-pair review convergence, two-member creation, add-member, same-group idempotency, atomic two-group merge, cross-connection same/crossing-pair convergence, deterministic Primary reselection, injected rollback, and retained Article observations/provenance.

Collection/database tests proved Article/observation/category/duplicate work commits in one candidate transaction; strong evidence may create both review and grouped effects; weak evidence creates review only; repeated/dismissed/same-group evidence produces zero new effects; duplicate failures roll back the current candidate while earlier candidates remain isolated; and persisted run counters match only committed effects.

Public-feed database tests proved visible ungrouped and visible Primary eligibility, non-Primary suppression, hidden-Primary non-resurrection, Source/Category/search composition over the suppressed stream, tie-heavy keyset pagination without omission/repetition, Primary-owned public fields, and retained non-Primary persistence/provenance.

### Level 5 and Level 6

Controlled collection fixtures remained green without public-network dependence. The 55-test Chromium suite preserved root-feed loading, empty/error states, branding, themes, responsive layout, accessibility/focus, exact external links, discovery URL/history behavior, pagination, and stale-response handling. No Level 7 live-Source or Level 8 deployment/Cloudflare evidence is required for Phase 16.

## Pass 2 — adversarial error and edge-case review

The fresh review considered malformed/self/reversed pairs; digest collisions; generic equal-title fanout; same-Source conflicts; repeated observations; stale dismissed/merged candidates; crossing strong relations and group merges; lock ordering; rollback during membership movement; all Primary ties and priority edits; hidden/archived combinations; filtered/search/cursor resurrection; zero/all-filtered/excluded/failed/multi-review accounting; stale references; error leakage; provenance deletion; and accidental unindexed fuzzy scanning.

All plausible hypotheses were classified as already protected by implementation plus meaningful executed evidence. Full strings are checked after digest lookup; title equality stays weak; candidate rows/signals are reloaded and locked; grouping revalidates current strong evidence; a PostgreSQL transaction-scoped global topology gate plus deterministic Article locks serializes cross-process mutation; deferred FKs and restrictive Article FKs protect topology/provenance; candidate composition owns rollback and effects; and suppression is inside `eligible_items` before filtering continuation/limit. No bounded defect or coverage gap was found, no behavior was weakened, and no escalation was required.

## Pass 3 — code-quality and structural review

The complete Phase 16 implementation diff and touched producers/consumers were reviewed for parallel logic, transaction duplication, leaky SQL/controller ownership, redundant Primary authority, process-local correctness, compatibility code, swallowed errors, brittle tests, unnecessary scans, and query-path bypasses. Evidence, Primary choice, topology mutation, collection composition, and public eligibility each have one canonical owner. The database group row is the sole Primary authority; SQL remains in repositories/services; errors are bounded; exact indexed lookups avoid fuzzy/full-table machinery; and tests assert durable invariants and rollback rather than only implementation details.

The conservative global topology advisory lock is intentional Phase 16 correctness infrastructure, not an unresolved defect. No meaningful behavior-preserving structural refactor was necessary, so no Terra High handoff occurred. No bounded cleanup or production/test change was made during closeout.

## Exit-gate conclusion and limitations

**GREEN.** Strong true duplicates yield one ordinary public row while all Article instances, observations, and provenance remain stored. Ungrouped Articles remain eligible; weak/related coverage cannot auto-suppress; unchanged dismissal is durable; group/Primary/concurrency/rollback invariants pass on real PostgreSQL; duplicate effects compose after Source-scoped identity without replacing outcomes; and discovery/keyset behavior cannot resurrect non-Primary rows.

Limitations are deliberate: Phase 17 owns human moderation UI/API; live-Source (Level 7) and deployment/Cloudflare (Level 8) observation are not Phase 16 requirements. The next conversational action is `/closeout`, which separately owns the transition to `0.17.0`.
