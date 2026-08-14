# Testing and Validation Contract

## Purpose

Automated behavioral regression coverage is the Platform's primary protection against implementation regressions.

No implementation phase, prompt, fix, refactor, correction stack, or review is complete merely because requested behavior appears to exist. New behavior requires focused proof, and changed behavior requires the relevant existing regression matrix to pass against the final source tree.

This document is the project-wide authority for testing and validation. Narrow phase- or feature-specific validation plans MAY add requirements but MUST NOT weaken this contract.

## Scope

This contract governs:

- static and structural checks;
- unit, component, integration, database, recovery, fixture, browser, live-Source, and deployment validation;
- focused and regression-test obligations;
- PostgreSQL and network isolation;
- deterministic fixtures and controlled time/randomness;
- local execution and final-tree validation expectations;
- test command conventions;
- flaky-test and skipped-test policy;
- evidence levels and reporting language;
- defect regression coverage;
- implementation-roadmap phase and correction-stack completion evidence.

It does not choose a test framework before Phase 1 implementation evaluates the smallest suitable TypeScript-compatible tooling. Tool choice does not weaken the behavior or evidence requirements below.

## Core regression law

Every implementation change MUST satisfy both:

1. **Focused coverage** — tests that directly prove the new or corrected behavior, including realistic negative, boundary, error, and failure cases where applicable.
2. **Regression coverage** — tests for existing behavior that could reasonably be affected by the change, including important producers, consumers, persistence constraints, public/admin surfaces, and security boundaries.

A passing focused test does not replace the broader regression suite for the blast radius of the change.

Shared helpers and cross-cutting contracts require broader consumer coverage than isolated leaf changes.

Every reproducible defect SHOULD receive an automated regression test when technically practical. The regression SHOULD demonstrate the failed invariant rather than only asserting implementation details.

Tests MUST be run against the final source tree being claimed as validated. Earlier passing evidence does not automatically validate later source changes.

## Evidence levels

Evidence is cumulative only when the higher-level procedure actually includes the lower-level behavior. A lower evidence level MUST NOT be reported as proof of a higher one.

### Level 0 — Source and documentation inspection

Examples:

- reading implementation or contracts;
- tracing imports/configuration;
- checking apparent schema or route behavior.

Permitted claim:

> The source appears to implement or require the behavior.

Source inspection is not runtime proof.

### Level 1 — Static and structural checks

Examples:

- formatting/lint/type checks;
- import/module-boundary checks;
- forbidden dependency or topic-coupling checks;
- configuration/schema shape checks;
- deterministic repository/path checks;
- committed-change whitespace/diff validation, such as `git diff --check <base>...HEAD`, or an equivalent command that actually inspects the accepted change range.

Permitted claim:

> The repository structure passed the named checks.

### Level 2 — Unit tests

Examples:

- configuration/state validation;
- URL normalization;
- Relevance precedence;
- date/title normalization;
- retry/backoff calculations;
- feed-date calculations;
- duplicate-signal logic.

Permitted claim:

> The isolated behavior passed the named automated unit tests.

### Level 3 — Component and integration tests

Examples:

- Express routes/middleware/services;
- Worker pipeline composition with controlled boundaries;
- parser-to-normalizer flow;
- feed read-model/API behavior;
- controlled HTTP servers or injected transport adapters;
- admin command validation.

Permitted claim:

> The participating components passed in the named test environment.

### Level 4 — Real persistence, concurrency, and recovery validation

Uses real disposable PostgreSQL where database behavior is part of the claim.

Examples:

- migrations from zero;
- migration of existing supported state when a production/compatibility contract actually requires it;
- uniqueness constraints;
- Article identity/idempotency;
- Article observations and Collection-run accounting;
- transactions/rollback;
- endpoint locks;
- race/concurrency behavior;
- exactly-one-Primary constraints;
- scheduler/job recovery;
- database outage/retry behavior.

Permitted claim:

> The named persistence/concurrency/recovery behavior passed against disposable PostgreSQL or the described observed failure environment.

Mocks alone do not prove PostgreSQL constraints, transactions, locks, migrations, or race behavior.

### Level 5 — Deterministic collection-fixture validation

Uses controlled, versioned RSS/Atom/HTTP fixtures or controlled local/injected servers to prove collection behavior without depending on the public internet.

Examples:

- valid/malformed RSS and Atom;
- redirects;
- conditional requests/304;
- response/decompression bounds;
- content-type handling;
- relative Article URLs;
- parser failures;
- partial item failures;
- normalized output and run accounting.

Permitted claim:

> The collection behavior passed against the named deterministic fixtures.

Fixture validation does not prove that a live publisher endpoint currently behaves the same way.

### Level 6 — Browser validation

Requires a real browser environment.

Examples:

- public feed rendering/navigation;
- desktop/mobile responsive behavior;
- keyboard/focus/accessibility interaction;
- filters/search/pagination;
- admin browser mutations and request-integrity behavior when implemented;
- light/dark presentation.

HTTP integration or HTML-source inspection alone is not browser proof.

Permitted claim:

> The behavior was observed in the named browser/viewports.

### Level 7 — Approved live-Source validation

Uses explicitly approved real publisher endpoints outside ordinary deterministic regression validation.

It proves only the named Source/endpoints, environment, time, and procedure observed. It does not redefine the whitelist or allow uncontrolled public-network dependencies in ordinary tests.

Permitted claim:

> The collection behavior was observed against the named approved live Sources.

### Level 8 — Reference-deployment validation

Covers the deployed Web/API, Worker, PostgreSQL, scheduler/jobs when present, public feed, Cloudflare Access/admin perimeter when present, backup/recovery, and approved live Sources as applicable.

This is the strongest integrated MVP evidence level.

Permitted claim:

> The named behavior was observed in the reference deployment under the recorded conditions.

## Reporting language

Validation reports MUST distinguish what was actually observed.

Preferred verbs:

- `Inspected`
- `Checked structurally`
- `Tested automatically`
- `Tested against disposable PostgreSQL`
- `Validated against deterministic collection fixtures`
- `Observed in a browser`
- `Observed against approved live Sources`
- `Observed in the reference deployment`

Do not report behavior as verified, working, passing, supported, production-ready, browser-tested, or database-safe without the corresponding executed evidence.

Durable validation records SHOULD identify:

- commit SHA/source tree;
- command or procedure;
- relevant environment/tool versions;
- result;
- important limitations;
- evidence level.

An implementation-roadmap phase closeout validation artifact MUST identify those items for the exact commit/source tree being accepted. A correction-stack closeout that gates further roadmap implementation MUST do the same when its governing correction entry requires a durable artifact.

Historical passing evidence remains historical after later source changes until the applicable matrix is rerun. Later source corrections do not retroactively change what earlier validation artifacts observed.

## Test naming and ownership

Test names SHOULD describe observable behavior and durable outcomes.

Prefer names such as:

- `rejects an unapproved endpoint before transport is invoked`
- `reprocessing the same external id does not increase article cardinality`
- `rolls back article creation when observation persistence fails`
- `preserves unrelated endpoint runs when one parser fails`
- `keeps visible related coverage separate when duplicate evidence is weak`

Avoid vague names such as `works`, `basic test`, or names coupled only to private implementation functions.

Tests SHOULD live with clear module/feature ownership and shared helpers SHOULD remain outside production source when they exist only for tests.

Do not create empty test directories, empty fixture directories, placeholder suites, or no-op npm scripts. Add them with the first substantive test they own.

Tests, fixtures, and helpers that exist only to exercise superseded pre-production compatibility or migration history MUST be removed when that compatibility surface is removed. Historical validation evidence belongs under `docs/validation/`; active tests protect current supported behavior.

## Standard command contract

The project reserves these root command names as capabilities are introduced:

```text
npm run check
npm test
npm run test:unit
npm run test:integration
npm run test:db
npm run test:collection
npm run test:fixtures
npm run test:security
npm run test:recovery
npm run test:browser
npm run test:live-sources
```

A command is added only with its first substantive suite. Empty/no-op commands are prohibited.

`npm test` MUST represent the ordinary deterministic development regression matrix suitable for local development and final-tree validation. Specialized environment-requiring suites MAY remain separate, but final implementation-phase/correction validation MUST explicitly run every specialized deterministic suite required by the behavior being accepted.

If a named/filtered test command is invoked and zero tests match, it MUST fail rather than report success, unless the command is explicitly a discovery/listing operation whose contract says otherwise.

An explicitly invoked database, browser, collection-fixture, security, or other specialized suite MUST fail clearly when its required prerequisite is unavailable. It MUST NOT silently skip and report a passing result.

The exact test runner/framework is selected during Phase 1. Prefer the smallest toolchain that satisfies TypeScript, coverage, isolation, and browser/integration needs; do not add a large framework solely to wrap behavior already supported adequately by the chosen runner.

## Local execution and final-tree validation

Phase 1 establishes the repeatable local validation workflow used for implementation review and implementation-phase closeout.

News Scraper intentionally does not use npm package locks. `package.json` is the dependency manifest, and repository npm configuration disables `package-lock.json` generation. Clean dependency installation uses `npm install`, not `npm ci`. Because declared dependency ranges may resolve to different compatible versions over time, validation MUST NOT describe installation as byte-for-byte dependency reproducibility; evidence applies to the exact source tree and recorded Node/npm environment actually exercised.

Final-tree validation MUST, as applicable:

- perform a clean dependency installation from `package.json` using the repository npm configuration;
- run applicable static/type/lint/format checks;
- run the complete deterministic test matrix required by the current implemented behavior;
- fail when a required selected suite contains zero tests;
- validate the committed change range for whitespace/diff errors rather than relying on an empty clean-working-tree diff;
- execute any required runtime/database/fixture/browser/recovery procedures at the evidence level needed for the acceptance claim;
- avoid hidden automatic retries that mask flaky tests;
- preserve terminal output or an accurate concise result summary sufficient to show the command/procedure actually executed and its result.

Routine implementation review may use observed terminal output in the review session. Implementation-roadmap phase closeout MUST create a durable record under `docs/validation/` tied to the exact accepted source tree and listing the executed commands/procedures, relevant environment/tool versions, results, evidence levels, and limitations. The artifact records evidence; it does not redefine contracts.

At minimum:

- Phase 1: startup/config/static/test-runner/local-validation foundation;
- Phase 2: disposable PostgreSQL, migration-from-zero, cleanup verification;
- Phase 3: singleton Publication/Source/endpoint schema from zero plus real-PostgreSQL state/uniqueness/bootstrap-idempotency/no-overwrite/rollback evidence;
- Phase 4: deterministic eligibility/domain/scheme/port/DNS/address/redirect/rebinding negatives through injected boundaries, plus real-disposable-PostgreSQL evidence for cross-process endpoint-lock contention and release;
- Phase 5: deterministic HTTP/RSS/Atom/Collection-run fixture coverage;
- Phase 6: normalization fixture matrix;
- Phase 7: deterministic proof that every safe candidate passes the empty-rule/default-include Relevance boundary before identity, plus real-disposable-PostgreSQL coverage for Source-scoped strong-external-ID and canonical-URL identity/fallback/promotion/conflict behavior, idempotent create/update/unchanged semantics, concurrent/racing uniqueness, endpoint/run observation provenance and ownership consistency, first-seen/last-seen behavior, Article/observation transaction rollback, unrelated-candidate isolation, and exact Collection-run processing-outcome accounting;
- Phase 8: feed eligibility/order/read-model/API coverage;
- Phase 9: Level 6 browser validation for the public tech-demo workflow at representative desktop/mobile viewports plus Level 7 approved live-Source validation demonstrating at least two real approved RSS/Atom Sources through the Worker; ordinary deterministic regression remains independent of live publishers;
- **Phase 10 entry singleton implementation correction:** fresh migration-from-zero to the canonical singleton schema using the smallest current migration baseline; absence of Publication tenancy columns/scopes/slug-selection plumbing; absence of legacy-only migrations, upgrade fixtures/tests, compatibility wrappers, and obsolete selector/config paths; singleton Publication enforcement; installation-wide Source uniqueness; preserved Source/endpoint/run/Article/observation referential integrity; Source-scoped Article identity/idempotency including race/conflict coverage; preserved Collection-run accounting and network-safety/whitelist behavior; canonical `/api/feed` and `/` semantics; and Level 6 browser evidence for direct navigation/refresh, loading/empty/unavailable/error, external-link, desktop, and mobile behavior. No populated legacy-database upgrade/preservation test is required because earlier pre-production database contents are not a supported compatibility surface. The correction closeout MUST create a durable validation artifact under `docs/validation/` tied to the exact accepted corrected source tree before ordinary Phase 10 implementation begins;
- Phase 10: scheduler/retry/overlap/recovery coverage;
- Phase 11: deterministic literal-predicate matching and missing-field behavior; the complete include/exclude priority → Source-scope → exclude-over-include → immutable-rule-`config_key` tie-break matrix; deterministic all-matching categorize behavior and reason ordering; endpoint-default → Source-default fallback only when no categorize rule matches; stable Category/Relevance-rule `config_key` uniqueness and Article/Category membership integrity; persisted winning Relevance/category reasons; exact `excluded` observation/run accounting before identity; prospective edit behavior proving a newly excluded observation does not retroactively hide/delete/recategorize an earlier Article; and real disposable-PostgreSQL migration/schema/foreign-key/uniqueness/reason-membership evidence for the persistence introduced by the phase;
- Phase 12: focused input/API coverage for absent, valid, repeated, malformed, unsupported, and out-of-bound `q`/`source`/`category`/`cursor` forms; Source filtering by immutable public `config_key`; Category filtering by immutable public `config_key` and current `article_categories` membership rather than historical observation reasons; combined `q + source + category` AND behavior; unchanged singleton/Source/Article feed eligibility; deterministic case-insensitive literal search including missing optional searchable metadata; unchanged effective-date → `first_seen_at` → stable-Article-ID chronological ordering; opaque/versioned cursor validation and cursor/query mismatch rejection; tie-heavy keyset pagination proving no duplicates or omissions across a static result set; preservation of the unfiltered first-page `/api/feed` contract; bounded public Source/Category discovery metadata without internal IDs/private Source leakage; real disposable-PostgreSQL proof for filter/category joins, keyset query behavior, and any Phase 12 query indexes/migration-from-zero; and Level 6 browser proof for direct URL/refreshed discovery state, search/filter changes, pagination reset, Reset, load-more, back/forward restoration, empty filtered results, and bounded discovery errors;
- Phase 13: final responsive/accessibility/light-dark/branding/external-navigation browser regressions;
- Phase 14: Source-admin application-side perimeter/request-integrity/resource-relationship/API/database/browser regressions; deterministic unit/integration/collection-fixture coverage for absent-filter collect-all behavior, bounded trimmed non-empty include-phrase validation, case-insensitive literal any-match behavior across RSS/Atom title/summary-content/Source-category text, missing fields, and rejection of exclude/toggle/regex/glob/fuzzy/semantic/general-expression semantics; pipeline proof that filtering occurs after parse and before normalization/Relevance/identity; exact `source_item_filtered_count` and raw/normalized/failure accounting including all-items-filtered runs; no Relevance `excluded` outcome or Article observation for mismatches; prospective configuration edits without historical Article/observation/run mutation; and preservation of approval/network-safety/jobs/idempotency/provenance/public-feed behavior. Level 8 Cloudflare Access/direct-origin reference-deployment observation is not a Phase 14 closeout requirement and is deferred to Phase 19;
- Phase 15: Publication/Relevance admin perimeter/request-integrity/resource-relationship regressions;
- Phase 16: duplicate corpus, Primary invariants, and false-positive safeguards;
- Phase 17: reversible moderation and provenance regressions;
- Phase 18: HTML adapter parity with existing downstream collection tests;
- Phase 19: security, restore, deployment, and reference-operations validation, including Level 8 observation that unauthenticated admin access is challenged or denied by Cloudflare Access, an authorized operator can reach the admin surface, direct-origin bypass fails, and the actual deployed origin-protection mechanism is identified;
- Phase 20: launch validation against the final deployment and approved Sources.

Live public-network Source validation is not part of the ordinary deterministic local regression matrix.

## PostgreSQL test isolation

From Phase 2 onward, persistence claims use real PostgreSQL where practical.

The reserved administrative test environment variable is:

```text
NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL
```

It MUST refer only to a dedicated test-capable PostgreSQL administrative connection and MUST NOT point at development or production application data.

Database suites SHOULD:

1. create a unique disposable database such as `news_scraper_test_<unique-id>`;
2. apply migrations from zero;
3. execute tests against actual constraints, transactions, locks, timestamps, migrations, and errors;
4. clean up the disposable database;
5. verify cleanup.

Migration work that transforms already-populated **supported** state MUST additionally exercise representative fixtures through the real migration path. The current pre-production singleton correction has no such supported old-data input; its contract is fresh rebuild from zero. Tests/fixtures whose only purpose is to migrate or preserve superseded disposable schemas are removed rather than retained as regression obligations.

Parallel database tests MUST NOT share mutable schemas/databases unless concurrency between those actors is the behavior under test. Phase 4 endpoint-lock validation is such an intentional concurrency case: independent clients/process-equivalent actors MUST contend for the same endpoint lock against the same disposable PostgreSQL database, prove that only one owner succeeds at a time, prove unrelated endpoint locks can proceed independently, and prove release/reacquisition on relevant success/failure paths.

An explicit `test:db` invocation without a safe usable test-admin prerequisite MUST fail clearly. Database tests MUST NOT silently downgrade to mocked or skipped persistence while reporting success.

Tests MUST NOT use the ordinary development database as their cleanup strategy.

## Collection and network isolation

Ordinary deterministic test/regression suites MUST NOT depend on live public publishers or uncontrolled public DNS.

Use controlled fixtures, injected fetch/resolution boundaries, or controlled local servers to test network behavior. Phase 4 address-safety tests SHOULD inject deterministic DNS answers rather than weakening production policy or depending on the machine's current resolver/network environment.

The testing harness MUST NOT require a production SSRF, whitelist, approved-domain, redirect, or Article-domain bypass merely to make local fixtures convenient. Production safety policy remains intact in test composition.

Network-safety tests MUST cover both allowed and denied paths, including where applicable:

- HTTP/HTTPS scheme restrictions and unsupported schemes;
- approved-domain boundaries and endpoint narrowing;
- hostname normalization;
- effective default ports and rejection of non-default HTTP/HTTPS ports under the MVP policy;
- successful public-unicast DNS resolution;
- zero-answer/resolution failures;
- mixed DNS answers where any unsafe address causes rejection;
- IPv4 and IPv6 loopback/private-or-unique-local/link-local/multicast/unspecified/shared-or-CGNAT/reserved-or-special-use/cloud-metadata rejection;
- IPv4-mapped IPv6 forms of unsafe IPv4 destinations;
- redirect destination revalidation through the same safety gate;
- DNS rebinding-resistant handoff showing that the outbound boundary receives validated concrete destination information rather than performing an unchecked second resolution;
- stable machine-readable eligibility/network-safety rejection reasons;
- Article-link domain validation separately from fetch validation once that later stage exists.

Phase 4 tests stop at an injected/controlled outbound-fetch boundary and MUST NOT require real publisher HTTP requests or real redirect following. Phase 5 deterministic transport fixtures exercise actual HTTP/redirect behavior while reusing the Phase 4 gate.

Live-Source validation may contact only explicitly approved Source/endpoints and MUST be isolated from ordinary deterministic regression validation.

## Fixture policy

Fixtures MUST be:

- authorized;
- deterministic;
- minimal;
- sanitized;
- versioned with the repository when durable;
- free of production credentials/secrets;
- bounded to the metadata needed for the test.

Do not commit uncontrolled full publisher responses or full Article bodies merely for convenience. A live response used as a fixture SHOULD be reduced/sanitized to the smallest representation that preserves the behavior under test.

RSS/Atom fixture corpora SHOULD grow to cover valid, edge, malformed, duplicate, and adversarial inputs as those behaviors are implemented.

## Time, randomness, and determinism

Inject or otherwise control time, UUID/random generation, jitter/backoff, ports, and other nondeterministic values when stable assertions depend on them.

Avoid arbitrary sleeps. Prefer controlled clocks, state advancement, events/barriers, or bounded polling.

Boundary behavior SHOULD be tested immediately below, exactly at, and immediately above important limits.

Fixture runs SHOULD produce deterministic normalized results when relevant providers are fixed.

## Failure and recovery testing

Happy-path coverage is insufficient for contract-critical behavior.

As the relevant phases arrive, tests MUST cover realistic failures such as:

- invalid configuration;
- unavailable dependencies;
- endpoint/network timeout;
- redirect rejection;
- malformed parser input;
- item-level normalization/persistence failure;
- transaction rollback;
- duplicate/race insert attempts;
- unsupported migration state where an upgrade contract exists;
- lost/failed job execution;
- overlapping-run prevention;
- PostgreSQL interruption/recovery;
- failed admin mutation/request-integrity checks;
- backup/restore and interrupted-run reconciliation before production launch.

Failure tests MUST verify preserved invariants and recovery state, not only that an exception was thrown.

## Browser validation

Browser behavior requires browser evidence.

When UI behavior exists, applicable validation includes:

- direct navigation and refresh;
- loading/empty/error states;
- external Article destination behavior;
- desktop and mobile viewport behavior;
- keyboard/focus/accessibility interaction;
- filters/search/pagination when implemented;
- light/dark modes when implemented;
- admin request-integrity and protected mutation flows when implemented.

For Phase 14 Source administration specifically, Level 6 evidence MUST cover Source/endpoint list/detail/create/update and lifecycle/operational actions, validation errors, manual check-now through the canonical job path, recent run/health visibility, and Source RSS/Atom admission-phrase viewing/editing with clear collect-all versus any-match semantics. Browser evidence complements rather than replaces real database and deterministic collection-fixture proof. Phase 14 browser evidence does not claim deployed Cloudflare Access/origin protection. Those claims require Level 8 reference-deployment evidence and are explicitly deferred to Phase 19; local browser substitution remains insufficient.

For Phase 12 discovery specifically, Level 6 evidence MUST cover direct navigation/refresh with URL-reflected `q`/`source`/`category`, user changes to those criteria, pagination reset after criteria changes, Reset to the unfiltered first page, load-more continuation, browser back/forward restoration, empty filtered/search results, and bounded error handling for invalid discovery state. Browser tests MUST also show that headline navigation continues to use the stored publisher `original_url` and that discovery does not create a second page-side eligibility/order path.

Source/DOM string assertions alone MUST NOT be used as complete proof for behavior that depends on browser layout, navigation, focus, JavaScript, or responsive interaction.

## Coverage policy

The project does not use an arbitrary global line-coverage percentage as its primary quality gate.

Coverage tooling MAY be used to identify gaps, but contract compliance is behavioral:

> Every contract-critical invariant touched by implemented behavior must have direct automated protection at the lowest evidence level capable of actually proving it.

Increasing or gaming a line percentage does not substitute for missing idempotency, concurrency, security, provenance, failure-isolation, duplicate, migration, or browser tests.

## Flaky and skipped-test policy

A flaky test is a defect in the test or product until understood.

- Do not automatically retry tests merely to obtain a passing result.
- Fix nondeterminism or document an explicit bounded environmental limitation.
- `skip`, `todo`, quarantine, or temporary disablement MUST NOT satisfy an implementation-roadmap/correction exit gate for the behavior they would have proved.
- Required specialized suites MUST fail clearly when prerequisites are missing rather than silently becoming green.
- If the available local/reference environment cannot execute a required evidence level, report the limitation and keep the corresponding claim unverified.

## Phase and prompt completion gate

Every implementation roadmap phase and correction stack inherits this contract even when its roadmap/correction entry does not repeat the full matrix.

A phase or correction cannot close until:

- each implemented deliverable has appropriate focused tests;
- relevant earlier regression suites pass against the final tree;
- contract-critical negative/failure cases are covered at the correct level;
- required database/browser/fixture/recovery evidence has actually been executed;
- the complete required local final-tree validation matrix has been executed with terminal evidence for the accepted tree;
- the required durable closeout validation artifact records the exact accepted commit/source tree, commands/procedures, results, evidence levels, and limitations;
- known skipped/flaky tests do not hide exit-gate behavior;
- validation limitations are reported explicitly.

Every Codex implementation prompt MUST specify focused tests, broader regression tests, and any runtime/browser/database/fixture validation needed for acceptance.

A reviewer MUST NOT approve a change solely because its requested feature appears present in source.

## Specialized validation plans

Create `docs/testing/` plans only when a feature or phase has enough specialized validation detail to justify one.

Do not create empty placeholders. Specialized plans may define concrete fixture matrices, browser viewport matrices, live-Source procedures, security attack cases, or release/reference-deployment checklists, but they remain subordinate to this contract.

Durable observed evidence may be stored under `docs/validation/` when useful. Implementation-phase and gating correction closeout validation artifacts are required by the completion gates above. Validation artifacts record what was actually observed; they do not redefine contracts.
