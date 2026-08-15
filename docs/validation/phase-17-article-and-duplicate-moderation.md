# Phase 17 Article and Duplicate Moderation Validation

## Result

- Validation status: **GREEN**
- Validation completed: 2026-08-14 23:21 CDT (America/Chicago)
- Accepted implementation SHA: `85ac987e87e6eab187e83cf54c8f44b73971f0c7`
- Implementation inspection range: `a572212418e6fba4dffcdf16ff77ac6d1527d59a..85ac987e87e6eab187e83cf54c8f44b73971f0c7`
- Package version: `0.17.7`
- Environment: Windows, Node `v24.11.1`, npm `11.6.2`, PostgreSQL client/server test prerequisite `18.3`, Playwright `1.56.1` with Chromium

The Phase 17 exit gate is satisfied. Important automatic Article and duplicate decisions are inspectable and reversible; Source-derived and automatic state continues beneath active overrides; duplicate manual authority survives automatic processing; provenance is retained; the canonical public feed consumes effective state; and the protected administration API and browser workflows are green.

## Final validation matrix

| Command or procedure | Result |
| --- | --- |
| `npm install --no-package-lock` | GREEN; 191 packages audited, 0 vulnerabilities, no lockfile created |
| `npm run check` | GREEN on the final implementation tree; formatting, lint, typecheck, and 423 unit/integration/collection tests passed with 0 failed/skipped/todo |
| `npm run test:db` | GREEN; 212 PostgreSQL tests passed with 0 failed/skipped/todo |
| `npm run test:browser` | GREEN after the bounded fix; 58 Chromium tests passed with 0 failed/skipped/todo |
| `npm run codex:phase:validate -- p17` | GREEN; P1-P7 grammar/version sequence valid and P7 is the sole manual closeout |
| `git diff --check a572212418e6fba4dffcdf16ff77ac6d1527d59a` | GREEN for the accepted implementation range |

The successful aggregate `npm run check` contains the ordinary unit, integration, and collection suites, so those subordinate commands were not rerun separately. No required suite matched zero tests or silently skipped required coverage.

## Pass 1 — contract and evidence

### Moderation persistence and effective state (Level 4)

Real disposable PostgreSQL evidence covered migration from zero, retained Phase 16 constraints, Source-title/override separation, override survival across later Source updates, clear-to-latest-Source behavior, automatic Category reconciliation beneath manual nonempty and active-empty sets, clear-to-latest-automatic behavior, manual separation/Primary constraints, bounded append-only audit events, audit-failure rollback, and retention of Article/observation/Relevance/Category provenance.

### Stored Article administration and provenance (Levels 2, 3, and 4)

Executed unit, HTTP, PostgreSQL, and Chromium evidence covered bounded criteria-bound search and keyset pagination over stored Articles; visible, hidden, archived, ungrouped, Primary, non-Primary, and review-participating discovery; fail-closed malformed criteria; Source-versus-effective headline and automatic-versus-effective Category detail; read-only endpoint/run/observation/Relevance/Category provenance; reversible visibility; transactional override commands; coherent material-only history; rollback/no-op behavior; and cross-connection Worker-like updates.

### Duplicate moderation and manual authority (Level 4)

PostgreSQL evidence covered durable dismissals, manual split and singleton cleanup, separation authority, directly affected candidate disposition, materially changed evidence handling, indirect merge protection, manual Primary retention, automatic merge refusal between conflicting manual Primaries, explicit manual conflict resolution, choose-Primary durability, deterministic residual Primary selection, shared topology-gate concurrency, and injected audit/candidate-write rollback without provenance loss.

### Canonical public feed and discovery (Levels 3, 4, and 6 regression)

Database, HTTP, and Chromium evidence covered visibility and Primary eligibility/suppression, hidden-Primary behavior, manual Primary representation, effective display headlines with unchanged publisher `original_url`, literal keyword composition, effective manual Category membership including active-empty and clear behavior, Source/Category/query AND composition, chronological keyset pagination, canonical `/` and `/api/feed`, loading/empty/error/discovery/external-link behavior, and responsive presentation.

### Administration API and browser (Levels 3 and 6)

Executed evidence covered disabled-admin unavailability, the central request-integrity header on unsafe moderation routes, bounded validation and 400/404/409/error behavior, Article detail/provenance/history, display/Category/visibility controls, duplicate queue/evidence/dismiss/merge/split/choose-Primary controls, explicit Primary conflict handling, stale-action recovery, focus/error/mobile containment, and regression coverage for Publication, Source, endpoint, and Editorial administration.

### Earlier-phase regression and static architecture

The aggregate/database/browser matrices retained Article identity/idempotency/observation rollback, Relevance and automatic Category reconciliation, Phase 16 detection/grouping/effect accounting, public discovery/keysets, administration relationships/request integrity, and Worker/scheduler/collection behavior.

Static inspection confirmed a topic-independent singleton-deployment engine; no Publication tenancy key; separation of Source identity/provenance from moderation state; read-only publisher destinations; automatic `article_categories` layered beneath manual overrides; `duplicate_groups.primary_article_id` as the sole Primary ID authority; one shared PostgreSQL duplicate-topology ownership boundary; service-owned SQL/transactions rather than controller-owned business logic; one canonical public-feed eligibility path; and no generic editor, native identity, semantic duplicate engine, public moderation, related-story clustering, or Phase 18+ scope.

## Pass 2 — adversarial edge-case review

The fresh review challenged all required title/Category override transitions, stale/deleted Category references, no-op audit cardinality, cursor ties/staleness, bounded malformed inputs/errors, Worker/moderation races, crossing duplicate operations, indirect separation, changed evidence, conflicting manual Primaries, merge/split permutations, hidden/archived topology members, candidate disposition, audit failure, stale browser actions, effective-state feed joins, provenance immutability, error leakage, and bounded read behavior.

One concrete bounded defect was found. A duplicate mutation displayed its success announcement before the required review queue, detail, and Article-list refreshes completed. This allowed a following operator action to race the unfinished refresh and caused the Chromium service-error/focus scenario to time out. `runReviewCommand` now publishes the success message only after all required reads settle. The focused Article moderation browser file then passed 3/3, followed by the final aggregate and full browser reruns above. All other hypotheses were already protected by implementation plus meaningful executed evidence; no unresolved ambiguity or hard defect remains.

## Pass 3 — structural review

The complete Phase 17 diff and important producers/consumers were inspected for drifting effective-value calculations, competing topology locks, duplicate Primary authority, generic abstractions, controller SQL leakage, unbounded/N+1 reads, duplicated browser mutation handling, tangled workspaces, compatibility-only code, weak rollback/concurrency proof, error leakage, unnecessary dependencies, and misleading terminology.

No meaningful behavior-preserving structural refactor was identified. The bounded browser sequencing fix above was sufficient. No Terra High remediation handoff occurred, and no material structural finding remains open.

## Limitations and phase boundary

Local Chromium evidence does not prove Cloudflare Access or direct-origin deployment protection. Ordinary Level 7 live-Source evidence and Level 8 reference-deployment evidence were not required solely for Phase 17 moderation and were not performed or claimed here. No unavailable prerequisite, retry masking, required skip, or zero-test condition remains.

The intended next roadmap phase is Phase 18 — Configurable HTML collection. Conversational `/closeout` is still required to perform the separate version-only transition to the `0.18.0` Phase 18 baseline; this P7 closeout did not perform that transition.
