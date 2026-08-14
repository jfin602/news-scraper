# Phase 15 — Publication and Relevance Administration Validation

## Closeout status

**GREEN — 2026-08-14 04:57:14 -05:00.**

Phase 15 satisfies its governed exit gate on the exact source commit recorded below. The intended next phase is Phase 16 — True duplicate detection and grouping. The separate conversational `/closeout` command is still required to establish the `0.16.0` baseline; P7 did not perform that transition.

## Candidate, range, and environment

- Accepted Phase 15 source commit: `500ce44f3cd6692ca52a37e18e6923e8929296d7` on `main`.
- Phase implementation base: `b1a700a` (`0.15.0` baseline); implementation range inspected and whitespace-checked: `b1a700a...500ce44`.
- Package version: `0.15.7`.
- Windows desktop environment; Node.js `v24.11.1`; npm `11.6.2`.
- PostgreSQL `18.3`, exercised through the repository's real disposable-database harness.
- Playwright `1.56.1` with its supported bundled Chromium. The Chromium product version was not separately captured.
- No `package-lock.json` or `npm-shrinkwrap.json` was created.

## Final command evidence

| Command | Final result |
| --- | --- |
| `npm run format:check` | Passed. |
| `npm run lint` | Passed. |
| `npm run typecheck` | Passed. |
| `npm run test:unit` | Passed, including 2 new stale-reference error-mapping regressions; 0 failed/skipped/todo. |
| `npm run test:integration` | 75 passed; 0 failed/skipped/todo. |
| `npm run test:collection` | 38 passed; 0 failed/skipped/todo. |
| `npm run test:db` | 178 passed against disposable PostgreSQL; 0 failed/skipped/todo. |
| `npm run test:browser` | 55 passed in real Chromium; 0 failed/skipped/todo. |
| `npm test` | 411 passed; 0 failed/skipped/todo. |
| `npm run check` | Passed; its aggregate `npm test` also passed 411 tests with 0 failed/skipped/todo. |
| `npm run codex:phase:validate -- p15` | Passed; P1–P7 grammar/version/configuration valid and P7 is the sole manual closeout. |
| `git diff --check b1a700a...500ce44` | Passed. |

No required filtered suite selected zero tests. The database and browser prerequisites were available; no prerequisite was replaced with mocks or inspection.

## Evidence and governed behavior

### Levels 0–3

The final P1–P6 implementation and tests, complete migration chain, singleton Publication configuration/repository/bootstrap, canonical public read model and date formatter, Publication and editorial admin services/routes, Source/endpoint consumers, collection Relevance evaluator, request-integrity middleware, admin browser resources, and public/collection regressions were inspected.

Unit/component evidence covered exact-key and bounded input validation; nullable valid-IANA timezone behavior and UTC fallback; Publication state separation; immutable Category/rule keys; the three literal predicates and three actions; action/target compatibility; Source scope; deterministic include/exclude precedence; additive categorization; endpoint-then-Source fallback; prospective edits; bounded HTTP errors; JSON/header/body-size request integrity; disabled-admin fail-closed behavior; and preservation of public and Worker paths.

### Level 4 — disposable PostgreSQL

The 178-test database suite proved migration from zero with nullable `presentation_timezone`; singleton Publication persistence and bootstrap no-overwrite behavior; public metadata without ordering/cursor changes; atomic Publication replacement; Category and Relevance CRUD; immutable keys; real Source/Category validation; guarded Category removal for rule targets, Source defaults, endpoint defaults, Article membership, observations, and retained category reasons; guarded rule removal for retained winning/category provenance; rollback without null/cascade/history rewrite; prospective collection outcomes; canonical precedence/default behavior; scheduler collection-active gating; and earlier identity, provenance, job, recovery, feed, and Source-admin regressions.

### Level 6 — Chromium

The 55-test browser suite observed the deterministic admin and public workflows at representative 1280x900 desktop and 390x844 mobile viewports. Evidence included disabled-admin routing; keyboard navigation and visible focus; Publication load/edit/save/error-state retention; distinct collection/public controls; branding/timezone editing and UTC-fallback guidance; Category create/edit/unreferenced removal and bounded blocked removal; refreshed Category choices in Source/endpoint defaults and categorize rules; installation-wide and Source-scoped Relevance forms for all bounded predicates/actions; target clearing, enable/disable, successful and blocked removal; canonical request-integrity headers; preserved Source/endpoint/check-now/health/run workflows; long-content wrapping and no mobile document overflow; and unchanged public discovery, themes, loading, external links, and configured-timezone rendering.

## Error and edge-case adversarial pass

The fresh pass considered omitted/null/empty/extra/boundary Publication and editorial inputs; unsupported timezone identifiers and boundary calendar dates; missing singleton and missing/stale Source/Category references; repeated saves, creates, deletes, enables, and disables; Category relationships across defaults, membership, observations, and reasons; transaction rollback; equal-priority/scope/action/key ties and additive categorize matches; prospective edits versus retained history; all public/collection state combinations; browser stale-choice/error preservation; request-integrity/content-type/body-size failures; dependency failures; and shared Phase 10–14 consumers.

One bounded defect was found. A Source or Category removed in the narrow interval after Relevance-rule reference resolution but before its write could surface PostgreSQL's FK error as `relevance_rule_in_use`, although the governed condition is a missing/stale reference. The final implementation maps only `relevance_rules_source_id_fkey` and `relevance_rules_category_id_fkey` to the corresponding bounded not-found codes while retaining generic FK mapping for real retained-provenance conflicts. Two focused regressions prove the mappings do not leak database detail. All invalidated static, unit, integration, collection, database, browser, aggregate, and grammar evidence was rerun after the repair.

All other hypotheses were protected by implementation plus meaningful automated evidence. No material ambiguity or hard defect remained.

## Code-quality and structural pass

The separate third pass reviewed the complete `b1a700a...500ce44` implementation range and the important Publication, Category, Relevance, Source/default, collection, public-feed, admin-router, and browser consumers. It found one canonical Publication path, one Phase 11 Relevance model/evaluator, transaction ownership in services with repository operations using caller-owned executors, bounded route error shaping, and shared request-integrity enforcement. No Publication ID/slug/FK/selector or topic-specific engine/admin logic was introduced; Web/API still performs no publisher collection; no automatic historical reprocessing, Article moderation, duplicate grouping, or Phase 16 behavior was added.

No meaningful behavior-preserving refactor was required, so no Terra High refactor handoff occurred. No unresolved structural finding requires replanning or a correction stack.

## Limitations and conclusion

- No Level 7 live-publisher collection was performed; Phase 15 did not change publisher transport semantics and deterministic collection regressions passed.
- Level 8 Cloudflare Access/direct-origin observation was not a Phase 15 requirement and was not performed or claimed. It remains explicitly owned by Phase 19.
- The Chromium product version was not separately recorded; Playwright `1.56.1` successfully launched and completed the repository's supported real-browser suite.

Phase 15 is **GREEN** at evidence Levels 1–4 and 6 for the required behaviors on source commit `500ce44f3cd6692ca52a37e18e6923e8929296d7`. Phase 16 is next only after the separate conversational `/closeout` advances the package baseline to `0.16.0`.
