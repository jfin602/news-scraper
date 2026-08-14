# Phase 13 Public Presentation Polish Validation

## Result

**GREEN** on August 13, 2026 at 20:01:23 CDT (America/Chicago).

- Accepted Phase 13 implementation source SHA: `58e2a3002e48061169986fe1bbb89326021ef85f`
- Package version: `0.13.6`
- Intended next phase: Phase 14 - Source administration
- R7KM disposition: resolved on August 13, 2026 after exact-final-source Chromium proof of the delayed initial response behavior

The later conversational `/closeout` transition to the Phase 14 baseline `0.14.0` was not performed by P6 and remains the next required phase-handoff action.

## Scope And Final-Tree Inspection

P1 added bounded singleton Publication `description`, same-origin `logo_path`, and canonical `accent_color` configuration/persistence through migration `0008_publication_presentation.sql`, while preserving create-if-absent bootstrap behavior. P2 extended the canonical public-feed repository and `GET /api/feed` response with required `name` plus explicit nullable `description`, `logoPath`, and `accentColor`. P3 added inert branding rendering and an intentional unresolved/loading lifecycle without placeholder Publication content. P4 added local System/Light/Dark reader theme selection. P5 completed the approved modern editorial/publication-desk responsive and accessibility presentation. P6 advanced only the top-level package version, inspected the exact final implementation, executed the required final-tree matrix, resolved R7KM from observed browser evidence, and wrote this artifact. No bounded source defect was found during P6.

Inspection covered:

- `migrations/0008_publication_presentation.sql`, singleton Publication configuration, repository mapping, bootstrap, and focused unit/database tests;
- the canonical public-feed repository, discovery SQL, public API serializer, production PostgreSQL-to-HTTP composition, and Phase 12 repository/API regressions;
- root HTML, explicit theme/feed resources, client request ownership, branding lifecycle, semantic theme state, CSS tokens/layout, and browser tests;
- the active migration chain, prompt/version sequence, Git history, package-lock prohibition, and final accepted change range.

The final source retains one singleton Publication without relational identity, slug, foreign key, selector, or tenancy scope. Shared source contains no indie-author/publishing-specific conditionals or default branding. The Web client makes only canonical `/api/feed` reads and has no collection/RSS/Atom path. Theme state is client-local. Public assets remain explicit same-origin resources; there is no generic filesystem serving surface or remote font dependency. No configurable timezone, Phase 14/15 admin control plane, or parallel feed query was introduced.

## Environment

- Host: Windows, working branch `main`
- Node.js `v24.11.1`
- npm `11.6.2`
- Playwright `1.56.1`
- Headless Chromium `141.0.7390.37`
- PostgreSQL client `18.3`; connected disposable-test server `18.3`
- PostgreSQL prerequisite: `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` loaded from local `.env`; the value and credentials are not recorded
- Browser contexts: isolated Playwright Chromium contexts, default `1280x720` where not overridden, explicit desktop `1280x900`, and explicit mobile `390x844`
- Browser media conditions: light and dark `colorScheme`, live light/dark emulation changes, and `reducedMotion: reduce`
- Theme-storage conditions: empty, valid Light/Dark, corrupt, and deliberately unavailable `localStorage`

## Commands And Observed Outcomes

The accepted implementation source SHA was unchanged throughout these successful runs. The durable artifact and issue-log disposition were written only after validation.

- `npm run format:check`: PASS; all matched files used Prettier style.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run test:unit`: PASS, 272 tests, 12 suites, 272 passed, 0 failed/skipped/cancelled/todo.
- `npm run test:integration`: PASS, 57 tests, 7 suites, 57 passed, 0 failed/skipped/cancelled/todo.
- `npm run test:collection`: PASS, 38 tests, 3 suites, 38 passed, 0 failed/skipped/cancelled/todo.
- `npm run test:db`: PASS against the safe disposable PostgreSQL harness, 140 tests, 1 suite, 140 passed, 0 failed/skipped/cancelled/todo.
- `npm run test:browser`: PASS in headless Chromium, 44 tests, 2 suites, 44 passed, 0 failed/skipped/cancelled/todo.
- `npm test`: PASS, 367 tests, 22 suites, 367 passed, 0 failed/skipped/cancelled/todo.
- `npm run check`: PASS; formatting, lint, typecheck, and aggregate tests all passed. Its aggregate stage reported 367 tests, 22 suites, 367 passed, 0 failed/skipped/cancelled/todo.
- `npm run codex:phase:validate -- p13`: PASS; prompt grammar was valid, P1-P5 were implementation prompts at `0.13.1` through `0.13.5`, and P6 was the sole final manual closeout at `0.13.6`.
- `git diff --check f03a028..58e2a3002e48061169986fe1bbb89326021ef85f`: PASS for the complete Phase 13 implementation range.
- Final candidate checks observed version `0.13.6`, candidate HEAD `58e2a3002e48061169986fe1bbb89326021ef85f`, a clean worktree before evidence-document writes, and no `package-lock.json` or `npm-shrinkwrap.json`.

Every required suite selected a nonzero number of tests. No required case was skipped, retried, quarantined, or replaced with inspection-only evidence.

## Publication Persistence Evidence - Levels 2 And 4

Unit coverage proved absent, blank-to-absent, trimmed, and fully populated presentation configuration; immutable normalized objects; exact 500-Unicode-code-point description acceptance and one-over rejection including non-BMP input; accepted nested same-origin logo paths; rejected external, network-path, query, fragment, backslash, control-character, and oversized logo forms; and uppercase normalization plus malformed/shorthand/alpha/function/name rejection for accent colors.

The disposable PostgreSQL suite proved migration from zero through `0008_publication_presentation.sql`, no-op rerun behavior, intact migration-history/checksum enforcement, the three intended nullable columns, and absence of Publication identity/tenant fields. Database constraints independently rejected noncanonical non-null description, logo, and accent shapes. Valid populated and all-null rows mapped through the production repository. Singleton cardinality, insert/create-if-absent behavior, bootstrap creation, preservation of operator-managed name/state/presentation values, concurrent bootstrap convergence, and CLI bootstrap idempotency all remained green.

## Public Read Model And API Evidence - Levels 3 And 4

Repository and HTTP coverage proved the stable public Publication shape `{ name, description, logoPath, accentColor }`, including all-null and fully populated persisted cases. Absent/private Publication behavior remained generic `404`; malformed rows remained bounded `invalid_row`/secret-safe failures; and synthetic extra internal configuration could not leak through the serializer. Markup-looking values remained inert JSON data. `activeForCollection`, `publicStatus`, timestamps, IDs/slugs, raw CSS/HTML, and other private settings were not exposed.

The real PostgreSQL production-reader-to-HTTP test returned the persisted presentation fields through canonical `GET /api/feed`. Discovery metadata, Article item shape, nullable opaque cursor, generic `400`/`404`/`503`, no-store behavior, exact stored `original_url`, feed eligibility, filters, cursor behavior, and chronological ordering remained unchanged.

## Loading, Branding, And R7KM Evidence - Level 6

With the initial owned `/api/feed` response deliberately held pending, Chromium observed the intentional `Loading publication...` status, zero `.feed-row` elements, a neutral unresolved document title, and no visible `News feed`, configured Publication name/description/logo, or fake headline content. Under reduced motion, the status remained present and understandable while continuous loader animation and nonessential transitions were removed.

After the response resolved, Chromium observed configured name and plain-text description, the exact same-origin logo path, restrained accent custom property, and the configured document title. Null optionals produced a complete name-led masthead; a failed logo load removed broken-image presentation; and markup-looking values remained inert without element/script injection. Later Search, Reset, and history requests preserved known public branding while pending. An owned `404` cleared it. Abort-insensitive stale success, error, and `404` responses could not mutate a newer owned state.

This exact-final-source browser evidence satisfies the R7KM resolution rule. R7KM was moved from Open to Resolved on August 13, 2026 with no claim beyond the observed delayed-response behavior.

## Theme Evidence - Level 6

Isolated Chromium contexts proved:

- System selected with light browser preference and System selected with dark browser preference;
- live browser preference changes while System remained selected;
- explicit Light against dark System preference and explicit Dark against light System preference;
- explicit choice persistence across reload;
- selecting System removed the stored fixed override and resumed live system following;
- corrupt storage cleanup/fallback and unavailable storage read/write/remove fallback;
- native keyboard theme operation;
- no pathname/query, browser-history, discovery-control, feed-request, or Article-content side effects from theme changes.

Theme behavior remained coherent across populated, empty, invalid, unavailable, and dependency-error states. Theme state remained absent from Publication persistence and the API criteria contract.

## Responsive And Accessibility Evidence - Level 6

Chromium exercised the default desktop context, explicit `1280x900` desktop, and `390x844` mobile layouts with ordinary and stress-length Publication, headline, Source, and discovery values. It observed desktop Date | Headline | Source placement, mobile DOM/visual Date - Source then Headline order, hidden mobile column headings, masthead/theme/discovery reflow, natural wrapping, contained long select values, and no horizontal document overflow.

Native controls and ordinary anchors preserved coherent keyboard traversal without a trap. Tests reached theme, keyword, Source, Category, Search, Reset, headline, and Load more controls; both effective themes showed application-owned solid focus outlines of at least three CSS pixels. Deterministic target-size/spacing and viewport-fit assertions covered important controls and headline links at desktop/mobile widths.

Deterministic WCAG contrast calculations passed application-owned normal text, muted metadata, links, error text, control text, control boundaries, and focus-ring combinations at the intended 4.5:1 or 3:1 thresholds in Light and Dark. A deliberately white Publication accent remained confined to noncritical decoration and did not replace body, focus, or error tokens.

Loading, empty, invalid, unavailable, dependency-error, continuation-loading, and continuation-error states remained semantically distinguishable. Status/error regions did not rely only on color. Continuation failure stayed local, preserved loaded rows/cursor, and supported retry. Reduced motion removed continuous/nonessential motion while retaining readable loading status. Headline links remained direct same-context anchors to the exact stored publisher URL.

## Phase 12 Preservation Evidence

The final database, integration, and browser suites retained explicit coverage for direct `q`, Source, Category, and combined URLs; refresh reconstruction; Search replacement; Reset from valid and invalid states; Back/Forward restoration without history loops; malformed root discovery; filtered empty state; stale first-page protection; opaque criteria-bound Load more; no cursor in the root URL; final-page control removal; duplicate activation and duplicate Article protection; cursor replacement; criteria/history invalidation of old continuation depth; stale continuation success/failure protection; continuation retry preserving existing rows; inert untrusted text; UTC date fallback; and exact publisher destinations.

The PostgreSQL suite additionally retained Source/Category `config_key` filtering, current `article_categories` membership, bounded literal search, AND composition, unchanged eligibility, deterministic effective-date DESC -> `first_seen_at` DESC -> Article-ID ASC ordering, tie-heavy and microsecond-precision keyset walks, bounded metadata, and public-state race protection.

## Evidence Boundary

Level 1 static/structural, Level 2 unit, Level 3 integration, Level 4 real-PostgreSQL, Level 5 deterministic collection-fixture, and Level 6 browser evidence are GREEN on the accepted implementation source SHA. Level 5 was retained as broader regression evidence; Phase 13 did not change collection behavior.

New Level 7 live-publisher evidence was not required because Phase 13 did not change Source approval, network safety, transport/parsing, normalization, Relevance execution, Article persistence, or Worker collection behavior. Level 8 reference-deployment evidence was not added by the Phase 13 roadmap/testing contract. These levels are not reported as passing or skipped evidence.

## Exit Gate

**Phase 13 closeout: GREEN.** Publication presentation persistence/read-model behavior, neutral loading and safe branding, System/Light/Dark modes, responsive editorial presentation, in-scope accessibility behavior, R7KM, and relevant Phase 12 regressions passed at their required evidence levels on the accepted source SHA.

The repository is ready for the separate conversational `/closeout` that verifies the handoff and, on its green path, advances only `package.json` to the Phase 14 baseline `0.14.0`.
