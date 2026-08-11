# MVP Roadmap

This roadmap prioritizes the fastest safe path to a working product demonstration: collect real Articles from administrator-approved Sources, normalize and persist them idempotently, and display them in a public rolling feed whose headlines link to the original publishers.

Phases are intentionally narrow. Each phase represents one cohesive implementation boundary that can be implemented, tested, reviewed, and closed without bundling unrelated feature domains.

## Roadmap principles

- The first implementation milestone is a real end-to-end aggregation vertical slice, not a complete administrative control plane.
- Initial Publication/Source configuration may be bootstrapped through operator-maintained seed/configuration tooling so collection can be proven before full admin UX exists.
- Bootstrap approval is explicit operator approval; it never bypasses whitelist eligibility or silently expands approved domains.
- The aggregation engine remains topic independent; the initial indie-author Publication is configuration only.
- Each deployed installation hosts exactly one Publication/topic. Reuse for another topic means another configured deployment of the same codebase, not concurrently hosting multiple topic Publications in one installation.
- The canonical customer-visible feed route is the deployment root `/`; public readers do not select a Publication by slug.
- Publication identifiers/slugs may remain internal configuration/persistence identity and scoping fields without implying multi-Publication hosting.
- Network safety, Source approval boundaries, Collection-run provenance, normalization, Relevance ordering, and idempotent Article identity are not deferred for the tech demo because they are expensive and risky to retrofit.
- Before configurable Relevance rules exist, the canonical Relevance boundary runs with an empty rule set and deterministically includes safe candidates by default.
- Native application-managed administrator accounts, passwords/passkeys, sessions, roles, account recovery, Publication-scoped user authorization, and identity-linked audit attribution are outside MVP.
- MVP admin UI/API routes use Cloudflare Access as the external perimeter; supported deployments MUST prevent direct-origin bypass.
- Cloudflare Access does not replace request-integrity, resource-validation, fetch/network-safety, output/content-safety, secrets, or origin protections.
- Public-feed and collection behavior should become useful before admin convenience and moderation workflows are expanded.
- Automated behavioral regression coverage is the primary defense against regressions. Every implementation phase inherits `docs/contracts/testing-and-validation-contract.md`.

## Global phase validation gate

The exit gate written inside each implementation phase is necessary but not sufficient by itself.

Every implementation phase MUST also satisfy the testing and validation contract against the final source tree before it can close. That means, as applicable:

- focused automated tests for new/corrected behavior;
- relevant broader regression suites for the change's blast radius;
- negative/failure/boundary coverage for contract-critical behavior;
- real disposable PostgreSQL evidence for persistence/concurrency claims;
- deterministic collection-fixture evidence rather than live-public-network dependence in ordinary deterministic validation;
- browser evidence for browser-dependent behavior;
- repeatable local static/test/runtime validation executed against the exact final tree;
- no skipped/flaky/zero-selected suite standing in for required proof;
- terminal evidence and limitations reported explicitly;
- a durable implementation-phase closeout validation artifact tied to the exact accepted commit/source tree.

Earlier passing evidence does not automatically validate later source changes. An implementation phase closes only on evidence for the final tree being accepted.

## Tech-demo critical path

Phases 1 through 9 form the critical path to the first demonstrable product.

The tech-demo milestone is reached when at least two real approved RSS/Atom Sources can be collected through the Worker, recorded in Collection runs, normalized, passed through the default-include Relevance boundary, persisted idempotently with Article-observation provenance, and displayed as current public feed rows with headlines linking to the original publishers.

## Phase 0 — Contracts and roadmap alignment

### Goal

Align governing documentation around the demo-first delivery strategy while preserving locked aggregation laws.

### Depends on

- none.

### Deliverables

- locked project laws remain intact;
- MVP scope reflects Cloudflare Access rather than native application authentication;
- focused roadmap phases and explicit tech-demo critical path;
- topic-specific behavior remains Publication configuration;
- domain, collection, Article, feed, security, and testing contracts are internally coherent.

### Out of scope

- application implementation;
- Source collection;
- public UI implementation;
- native administrator identity/account implementation.

### Exit gate

- No unresolved contradiction exists among Phase 0 documents.
- Implementation tasks can cite measurable contract behavior.
- Approval/trust, lifecycle, operational state, health, Article identity, duplicate role, provenance, Relevance ordering, feed eligibility, and validation expectations are unambiguous.
- Native administrator authentication/identity requirements are not MVP blockers.

## Phase 1 — Application foundation

**Status:** Complete with durable validation recorded in `docs/validation/phase-1-application-foundation.md`.

### Goal

Create the independently runnable application skeleton and the regression-testing/local-validation foundation without business behavior.

### Depends on

- Phase 0.

### Deliverables

- Node.js/TypeScript scaffold;
- Web/API entry point;
- Worker entry point with independently testable startup/bootstrap and clean shutdown;
- centralized typed environment/runtime configuration validation with substantive malformed/out-of-range failure coverage;
- Publication-aware structural module boundaries only;
- formatting, linting, and type-checking foundation;
- smallest suitable TypeScript-compatible automated test runner/toolchain;
- substantive startup/configuration/health tests;
- root test/check commands as they become substantive under the testing contract;
- Web/API liveness/readiness endpoints;
- Worker startup/dependency readiness validation without requiring a separate Worker HTTP probe in Phase 1;
- repeatable local static/test/runtime validation procedure for implementation review and phase closeout;
- required zero-test-selection protection where filtering is used;
- durable Phase 1 closeout record under `docs/validation/` tied to the exact accepted commit/source tree.

### Boundary clarification

- Phase 1 Publication-awareness means generic naming, dependency direction, and module placement preserve Publication as the future topic/configuration boundary.
- Phase 1 does not implement Publication persistence, Source configuration, bootstrap/seed data, Categories, Relevance rules, or the initial indie-author Publication.
- Future module directories/components are created only when substantive code first needs them; placeholder directories/modules are not required.
- Web/API owns HTTP liveness/readiness. Worker readiness is startup/configuration/dependency validation until a concrete deployment requirement justifies a Worker HTTP probe.
- Phase 1 readiness has no PostgreSQL dependency; Phase 2 extends dependency readiness to the shared database.

### Out of scope

- domain persistence;
- Publication/Source persistence or bootstrap data;
- durable jobs;
- Source fetching;
- Article persistence;
- admin UI;
- placeholder/no-op test suites, scripts, directories, or modules.

### Exit gate

- Web/API and Worker start independently under automated/runtime validation and shut down cleanly where applicable.
- Web/API liveness/readiness behavior is exercised and reflects only dependencies implemented in Phase 1.
- Worker startup/configuration/dependency readiness is exercised independently without requiring a Worker HTTP server.
- Invalid or malformed Phase 1 environment/runtime configuration fails predictably.
- Formatting, linting, type checking, deterministic tests, committed-change whitespace/diff validation, and required startup/runtime checks are executed locally and pass against the exact final Phase 1 tree.
- Required filtered test commands cannot pass with zero selected tests.
- Shared engine modules contain no indie-author-specific condition.
- A durable Phase 1 validation artifact records the accepted commit/source tree, commands/procedures, results, evidence levels, environment/tool versions, and limitations.

## Phase 2 — Database foundation

**Status:** Complete with durable validation recorded in `docs/validation/phase-2-database-foundation.md`.

### Goal

Establish durable PostgreSQL infrastructure before domain models.

### Depends on

- Phase 1.

### Deliverables

- PostgreSQL connection/configuration;
- migration workflow;
- development/test DB workflow;
- transaction utilities;
- dependency health/readiness checks;
- migration validation in the local final-tree regression matrix;
- safe `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` test-admin boundary;
- unique disposable PostgreSQL database creation/migration/cleanup helpers;
- cleanup verification and clear failure when required DB-test prerequisites are unavailable.

### Out of scope

- complete domain schema;
- Source collection;
- Article identity;
- durable scheduler/jobs;
- using development/production data as a test database;
- silently skipped database suites reported as passing.

### Exit gate

- A clean disposable PostgreSQL database can be created and migrated reproducibly from zero.
- Web/API and Worker connect through the shared database boundary.
- Database test runs exercise real PostgreSQL and verify cleanup.
- Migration/test failures or missing explicit DB-test prerequisites are surfaced rather than silently skipped.

## Phase 3 — Publication and Source configuration core

**Status:** Complete with durable validation recorded in `docs/validation/phase-3-publication-source-configuration.md`.

### Goal

Represent the minimum trusted configuration required to collect approved feeds without waiting for admin UI.

### Depends on

- Phase 2.

### Deliverables

- Publication persistence with only the collection/public state needed by the pipeline at this phase;
- Source persistence with an immutable Publication-scoped configuration key;
- Source-endpoint persistence with an immutable Source-scoped configuration key;
- separate approval/trust state;
- separate active/archived lifecycle state;
- separate enabled/paused/disabled operational state;
- Source approved-domain policy using deterministic normalized-host rules;
- endpoint URL, initial `rss_atom` type, and optional policy narrowing that cannot widen Source policy;
- positive bounded `poll_interval_seconds` configuration, with operational state rather than sentinel values controlling disablement;
- explicit idempotent operator-invoked seed/bootstrap mechanism for the initial Publication and approved Sources.

### Bootstrap rules

- bootstrap may explicitly create `approved` Source/endpoint state as deliberate operator approval;
- Publication slug, Source `config_key`, and endpoint `config_key` provide stable bootstrap identity;
- ordinary bootstrap is create-if-absent and leaves already-existing configuration unchanged;
- bootstrap is not an implicit Web/API or Worker startup mutation;
- no discovery/auto-approval;
- no approval inferred from fetch success;
- no silent domain widening;
- a rerun must not recreate obsolete seeded configuration merely because an operator later changed mutable fields such as an endpoint URL;
- bootstrap must not overwrite later operator-managed approval, lifecycle, operational, domain, URL, polling, or other existing state.

### Boundary clarification

- Phase 3 performs structural/configuration validation only for endpoint URL/domain relationships; DNS/address/port/redirect/runtime SSRF enforcement begins in Phase 4.
- The complete logical domain model contains later parser/cache/health/scheduling/Category/Relevance/branding fields, but Phase 3 persists only fields required by its current behavior.
- The later single-Publication deployment decision does not erase Publication persistence/scoping introduced here; it constrains supported installation cardinality and routing.

### Out of scope

- admin CRUD screens;
- configurable Categories/Relevance rules or initial Category data;
- final Publication branding/feed configuration;
- parser profile/cache metadata, due/attempt/success timing, failure counters, or derived endpoint health;
- Source health UI;
- collection scheduling;
- DNS/address/port/redirect network-safety execution;
- outbound HTTP.

### Exit gate

- The Phase 3 domain migration applies reproducibly from zero on a disposable PostgreSQL database.
- A generic Publication and at least two approved `rss_atom` endpoints can be configured without engine-topic logic.
- Database constraints and focused configuration validation reject invalid state/domain relationships owned by Phase 3.
- Repeating bootstrap does not increase logical Publication/Source/endpoint cardinality.
- Operator-modified existing configuration remains unchanged after another ordinary bootstrap run.
- Bootstrap/database failure paths preserve coherent state and rollback where transactional integrity requires it.
- Initial indie-author configuration exists only as Publication-owned bootstrap data.
- The focused and broader regression matrix includes the real-PostgreSQL evidence required by `docs/contracts/testing-and-validation-contract.md`.

## Phase 4 — Collection eligibility and network safety

**Status:** Complete with durable validation recorded in `docs/validation/phase-4-collection-eligibility-network-safety.md`.

### Goal

Guarantee that only eligible, approved, safe Source endpoints may reach the outbound fetch boundary.

### Depends on

- Phase 3.

### Deliverables

- Publication collection-active eligibility;
- Source/endpoint approval, lifecycle, operational checks;
- HTTP/HTTPS scheme policy;
- approved-domain validation;
- DNS/address safety validation using the public-unicast-only policy from the Source/collection contract;
- default-port enforcement for HTTP 80 and HTTPS 443;
- loopback/private/unique-local/link-local/multicast/unspecified/shared-or-CGNAT/reserved-or-special-use/cloud-metadata rejection, including equivalent IPv4-mapped IPv6 forms;
- rebinding-resistant validated-destination handoff to the future transport boundary;
- redirect destination revalidation primitives;
- shared cross-process endpoint run-lock primitive;
- stable machine-readable skip/rejection reasons.

### Boundary clarification

- Phase 4 may resolve DNS because concrete address classification is part of pre-fetch safety.
- Phase 4 stops at an injected/controlled outbound-fetch boundary. It does not issue publisher HTTP requests, follow real HTTP redirects, create Collection runs, or add the manual Worker collection command.
- Redirect revalidation in this phase proves reusable destination-safety primitives with controlled candidate destinations. Phase 5 is the first phase that follows actual HTTP redirects through them.
- The endpoint lock introduced here prevents overlapping ownership across Worker processes for the same endpoint. PostgreSQL or an equivalently shared coordination mechanism is required; Phase 10 durable jobs reuse this primitive rather than introducing the first distributed lock.
- An eligible network-safety result carries validated concrete destination/address information forward so future transport cannot silently perform a second unchecked DNS decision.

### Out of scope

- outbound publisher HTTP transport;
- real HTTP redirect following;
- persisted Collection runs;
- manual Worker endpoint collection invocation;
- RSS parsing;
- Article normalization;
- automated polling scheduler;
- public feed.

### Exit gate

- Eligible test endpoints reach the injected/controlled outbound-fetch boundary with a validated destination result.
- Unapproved, archived, paused, disabled, or unsafe endpoints cannot invoke that outbound boundary.
- Scheme/domain/port/DNS/address decisions produce the documented stable machine-readable reasons.
- Controlled redirect destinations cannot bypass the same safety policy.
- Concurrent process-equivalent actors cannot own the same endpoint lock simultaneously, unrelated endpoint locks remain independent, and required release/reacquisition behavior is proven against real disposable PostgreSQL or an equivalently capable shared store.
- Safety tests use controlled/injected resolution and outbound boundaries without weakening production SSRF/whitelist rules or depending on live public publishers/DNS.
- Phase 4 validation performs no publisher HTTP collection and creates no Collection runs.

## Phase 5 — RSS/Atom transport, parsing, and minimal Collection runs

**Status:** Complete with durable validation recorded in `docs/validation/phase-5-rss-atom-transport-parsing-collection-runs.md`.

### Goal

Fetch real approved structured feeds through the Worker, persist truthful run provenance, and convert responses into Raw items behind reusable adapter boundaries.

### Depends on

- Phase 4.

### Deliverables

- fetcher adapter interface;
- parser adapter interface;
- HTTP fetcher with connect/total timeouts;
- response/decompression limits;
- bounded redirects through Phase 4 safety;
- conditional request support where metadata permits;
- content-type handling;
- RSS parser;
- Atom parser;
- Raw-item representation;
- manual Worker collection invocation;
- minimal persisted Collection run with endpoint, start/finish, transport/parser status/counts, bounded errors, execution identifier;
- isolated endpoint transport/parser failures;
- deterministic controlled HTTP/RSS/Atom fixture corpus for the ordinary local regression matrix.

### Out of scope

- automated due-endpoint scheduler;
- Article persistence;
- configurable Relevance rules;
- duplicate detection;
- making live publisher endpoints an ordinary deterministic regression dependency.

### Exit gate

- At least two real approved active enabled feeds fetch/parse independently through Worker execution for the tech-demo/live-Source evidence.
- Every real fetch attempt has a persisted truthful Collection run.
- Deterministic fixture tests cover representative success, malformed, conditional/no-change, redirect, bounds, and isolated-failure behavior.
- One broken feed does not prevent another run from completing.
- Re-fetching unchanged content is transport-safe and deterministic at the Raw-item boundary.

## Phase 6 — Article normalization

**Status:** Complete with durable validation recorded in `docs/validation/phase-6-article-normalization.md`.

### Goal

Convert untrusted Source-shaped Raw items into safe deterministic Article candidates.

### Depends on

- Phase 5.

### Deliverables

- text normalization preserving intended meaning;
- relative URL resolution;
- original discovered URL preservation;
- canonical identity URL normalization/tracking cleanup;
- date parsing with confidence/fallback metadata;
- unsafe markup stripping/sanitization;
- field bounds;
- normalized title representation;
- Publication/Source/endpoint/Collection-run provenance attachment;
- post-parse Article-link/domain validation;
- normalization status/counts added to the existing Collection run.

### Out of scope

- Article persistence;
- configurable Relevance rules;
- duplicate grouping;
- public rendering.

### Exit gate

- Same Raw item produces deterministic normalized output.
- Unsafe/out-of-policy Article destinations are rejected before persistence.
- Real entries are inspectable as normalized candidates with endpoint/run provenance.
- Normalization fixture coverage includes important malformed, boundary, URL, date, markup, and determinism cases.

## Phase 7 — Default Relevance, Article identity, and persistence

**Status:** Complete with durable validation recorded in `docs/validation/phase-7-default-relevance-article-identity-persistence.md`.

### Goal

Preserve canonical pipeline order and persist normalized Source instances transactionally/idempotently without conflating Article identity with true duplicates.

### Depends on

- Phase 6.

### Deliverables

- canonical Relevance boundary executing the empty-rule/default-include decision until configurable rules exist;
- Article schema;
- Article-observation provenance schema;
- reliable Source external-ID identity;
- canonical-URL identity within Publication/Source scope;
- explicit stable identity-key support only when a concrete approved adapter/endpoint requires it; Phase 7 does not invent a speculative generic identity-key configuration system;
- transactional uniqueness constraints;
- idempotent create/update/unchanged behavior;
- Article observation linked to endpoint and existing Collection run;
- canonical processing outcomes added to Collection-run accounting.

### Out of scope

- configurable include/exclude/categorize rules;
- cross-Article true-duplicate grouping;
- Article moderation UI;
- search/filter UI.

### Exit gate

- Every safe candidate passes Relevance before identity; with no configured rules the result is deterministic default `include`.
- Reprocessing the same unchanged Source item does not increase Article cardinality.
- Concurrent/racing identity attempts preserve required uniqueness under real disposable PostgreSQL.
- Every persisted observation traces to endpoint and Collection run.
- Transaction failures preserve database invariants and item failures do not require unrelated Articles from the same run to be lost when integrity permits isolation.

## Phase 8 — Basic public-feed backend

**Status:** Complete with durable validation recorded in `docs/validation/phase-8-basic-public-feed-backend.md`.

### Goal

Expose the smallest useful Publication-backed rolling feed from real stored Articles through the Web/API process without pulling Phase 9 presentation or later discovery/deduplication features forward.

### Depends on

- Phase 7.

### Historical deliverables and forward correction

Phase 8 originally introduced a Publication-scoped database read model behind `GET /api/publications/:publicationSlug/feed`. That historical route remains accurately recorded in the Phase 8 validation artifact. The August 11, 2026 single-Publication deployment decision supersedes the public routing contract before Phase 10 implementation continues: the same canonical read model/eligibility semantics must be exposed as installation-scoped `GET /api/feed`, resolving the installation's one Publication internally rather than accepting a reader-supplied slug.

The underlying Phase 8 behavior remains:

- persisted Article `visibility_state` using `visible` / `hidden` / `archived`, with existing Phase 7 Articles migrated to `visible` and `visible` as the baseline for newly persisted Articles;
- public-exposure gate requiring Publication `public_status = public`;
- Source trust/lifecycle gate requiring Source `approved` + `active` for ordinary public rows;
- baseline Article eligibility requiring `visible`; before Phase 16 Articles are logically `ungrouped` and no speculative duplicate-group persistence is added;
- canonical effective feed date using trusted parsed `published_at`, otherwise `first_seen_at`, with the date source exposed explicitly;
- deterministic reverse-chronological ordering by effective feed date, then `first_seen_at` descending, then stable Article identifier;
- bounded server-defined recent result window;
- minimal safe item shaping: stable Article identifier, effective feed date/date source, `display_title`, Source display name, and stored `original_url`;
- `original_url` as the headline destination; `canonical_identity_url` remains an identity field and is not substituted as the public destination;
- explicit public error behavior: public Publication with zero eligible rows returns `200` + empty list; absent/non-public installation Publication yields the same generic `404`; dependency/read failures are bounded and secret-safe;
- smallest explicit topic-independent operator mechanism needed to transition an existing pre-admin Publication's `public_status` deliberately for the tech demo while preserving ordinary create-if-absent bootstrap semantics;
- fresh initial Publication configuration may be aligned to the intended public tech-demo state without making ordinary bootstrap overwrite existing persisted state.

### Boundary clarification

- Publication collection activity and public exposure are separate: `active_for_collection` does not substitute for `public_status`.
- Source operational state and endpoint approval/lifecycle/operational/health state govern collection execution, not historical public-row eligibility; paused/disabled/failing collection does not by itself hide an already-persisted otherwise-eligible Article.
- Source approval and Source lifecycle remain public trust/lifecycle gates.
- Phase 8 introduces visibility persistence because public-feed behavior first consumes it, but it does not introduce Article moderation controls.
- Before true Duplicate grouping exists, Articles are logically `ungrouped`; Phase 8 does not add duplicate groups, memberships, Primary selection, or duplicate roles merely to implement feed reads.
- The pre-admin Publication public-status transition must be explicit and generic. Changing committed bootstrap JSON alone is insufficient for an already-created Publication and MUST NOT weaken create-if-absent bootstrap behavior.
- Collection remains Worker-owned; the Web/API endpoint is read-only with respect to Source collection and MUST NOT fetch publishers inline.
- Publication slug remains valid configuration/persistence identity but is not a public topic selector.

### Out of scope

- public feed page/UI;
- keyword search;
- Source/Category filters;
- client-controlled pagination/load-more cursors or elaborate pagination UX;
- duplicate detection/grouping/Primary selection;
- Article moderation controls;
- full Publication administration UI/API;
- public theme/branding polish.

### Exit gate

- A public HTTP request for the installation's public Publication returns real persisted eligible Articles deterministically through the Web/API process.
- Every returned row resolves to the installation Publication, an approved active Source, and a visible stored normalized Article; before duplicate grouping that Article is logically ungrouped.
- An absent/non-public installation Publication does not expose feed data and uses generic `404` behavior.
- A public Publication with no eligible Articles returns a successful empty feed.
- Feed date uses parsed `published_at` when available and `first_seen_at` otherwise, exposes the fallback source, and preserves deterministic tie ordering.
- Every headline destination is the Article's stored `original_url`; `canonical_identity_url` is not silently exposed as the replacement destination.
- Existing Phase 7 Articles migrate to `visible`, new Article persistence remains idempotent, and visibility/schema behavior passes against real disposable PostgreSQL.
- Feed eligibility/order/read-model/error-shaping regressions and relevant Web/API + database regression suites pass against the final tree.
- The operator-controlled Publication exposure transition is explicit, topic independent, and does not make ordinary bootstrap overwrite existing state.

## Phase 9 — Basic public-feed UI and tech demo

**Status:** Complete by explicit repository-owner acceptance on August 11, 2026, with the recorded live-source limitation preserved in `docs/validation/phase-9-basic-public-feed-ui-tech-demo.md`.

The Phase 9 durable validation artifact records that the deterministic/static/database/browser matrix passed but the required two-Source Level 7 live-source gate was not observed because The Creative Penn exceeded the unchanged production fetch deadline in the recorded environment. The repository owner attributed that timeout to the slow phone-hotspot Internet connection, explicitly accepted Phase 9, and directed the Phase 10 handoff to continue. This roadmap acceptance does not convert the failed Level 7 observation into passing evidence or alter the validation artifact's original determination.

### Goal

Produce the first customer-visible working product using real collected data.

### Depends on

- Phase 8.

### Historical deliverables and forward correction

Phase 9 originally delivered and browser-validated the database-backed public feed page at `GET /publications/:publicationSlug`. That route and its evidence remain historical truth.

Before Phase 10 implementation proceeds, the accepted single-Publication deployment model requires a focused correction so that:

- the database-backed public feed page is canonical at `GET /`;
- the page consumes the same canonical feed read model through installation-scoped semantics, with lightweight clients using `GET /api/feed` rather than extracting a Publication slug from the URL;
- the installation resolves its one configured Publication internally;
- public readers are not exposed to a Publication/topic selector;
- shared UI remains topic independent and Publication identity still comes from configuration/read-model data rather than hard-coded indie-author values;
- the core desktop `Date | Headline | Source` presentation, sane stacked mobile rendering, stored-`original_url` links, deterministic UTC calendar-date rendering, and loading/empty/unavailable/error behavior are preserved;
- historical Phase 8/9 validation artifacts are not rewritten to claim root-route behavior that was not observed.

### Out of scope

- final responsive/accessibility polish;
- dark-mode completion;
- filters/search;
- client-controlled pagination/load-more;
- duplicate moderation;
- admin UI;
- multi-Publication routing or compatibility aliases whose only purpose is supporting the superseded hosting model.

### Exit gate — tech-demo milestone

The historical Phase 9 milestone remains accepted with its recorded limitation. The root-route correction must additionally receive focused automated/browser regression evidence before Phase 10 implementation starts, proving that:

- direct navigation/refresh at `/` renders the installation Publication's current Articles through the canonical feed boundary;
- loading, empty, error/unavailable, external-link, desktop, and mobile behavior remain intact;
- topic-independent shared behavior is preserved;
- reader-supplied Publication selection is no longer required;
- the applicable deterministic regression matrix remains green.

## Phase 10 — Automated polling, durable jobs, and endpoint health

**Status:** Current, implementation gated on the post-Phase-9 single-Publication routing/runtime correction above.

### Goal

Turn the manually proven endpoint execution unit into a continuously updating single-Publication installation without creating a second collection path.

### Depends on

- accepted Phase 9;
- completed and validated single-Publication correction making `/` the canonical public page and removing reader/runtime topic-selection assumptions that Phase 10 scheduling would otherwise reinforce.

### Deliverables

- durable job mechanism;
- due-endpoint scheduler for the installation Publication;
- independent endpoint jobs reusing the canonical Worker execution path;
- locking integrated with jobs;
- polling intervals;
- conditional-fetch state persistence;
- bounded retries/backoff/jitter;
- expanded Collection-run lifecycle/telemetry;
- baseline endpoint health derivation;
- failure isolation.

### Out of scope

- multi-Publication scheduling within one installation;
- admin Source screens;
- production alert dashboards;
- HTML collection;
- duplicate grouping.

### Exit gate

- Due approved endpoints for the installation Publication collect automatically.
- One failing endpoint does not interrupt unrelated collection.
- Overlapping runs are prevented.
- Retry/recovery tests are deterministic and verify preserved state, not merely thrown errors.
- Recent outcomes/failures can be diagnosed without console-only output.

## Phase 11 — Categories and configurable Relevance execution

### Goal

Add deterministic Publication-specific inclusion/exclusion/categorization without topic logic in the engine.

### Depends on

- Phase 10.

### Deliverables

- Category persistence;
- Relevance-rule persistence;
- include/exclude/categorize actions;
- explicit priority;
- Publication-wide and Source-scoped behavior;
- deterministic precedence/tie-breaks;
- Source/endpoint default Category precedence;
- persisted Relevance/category reasons;
- excluded outcome accounting.

### Behavioral boundary

- the existing default-include Relevance boundary is extended, not replaced;
- rule changes are prospective by default;
- automatic bulk retroactive re-evaluation of already persisted Articles is deferred unless a dedicated reprocessing capability is explicitly added.

### Out of scope

- generic boost/ranking;
- semantic AI relevance;
- admin rule-builder polish;
- duplicate grouping;
- automatic bulk historical reprocessing.

### Exit gate

- Identical candidate + configuration produces identical Relevance result/reasons.
- The complete documented priority/scope/tie-break/default/category matrix has deterministic automated coverage.
- A separately deployed unrelated Publication can use unrelated Categories/rules without engine-topic conditionals.
- Relevance changes do not redefine Article identity.

## Phase 12 — Feed discovery features

### Goal

Make the growing feed easy to explore without changing eligibility semantics.

### Depends on

- Phase 11.

### Deliverables

- Category filter;
- Source filter;
- keyword search over safe metadata;
- deterministic pagination/load-more cursors;
- URL-reflected state where practical;
- reset behavior;
- MVP-scale query/index tuning.

### Out of scope

- personalization;
- ranking/boost scoring;
- featured/pinned ordering;
- public accounts.

### Exit gate

- Search/filters/pagination return only feed-eligible Articles.
- Pagination is stable under documented ordering.
- Browser/API regression coverage preserves URL/reset/navigation behavior.

## Phase 13 — Public presentation polish

### Goal

Turn the working feed into a polished customer-facing publication experience.

### Depends on

- Phase 12.

### Deliverables

- final desktop three-column presentation;
- accessible stacked mobile layout;
- responsive refinement;
- light/dark modes;
- Publication branding integration;
- contrast/focus/keyboard/wrapping/tap-target pass;
- external-link semantics;
- browser validation.

### Out of scope

- admin UX;
- duplicate moderation;
- Article-body republishing;
- featured ordering.

### Exit gate

- Core public workflows are usable on supported desktop/mobile layouts with browser evidence.
- Light/dark/accessibility/navigation regressions pass.
- Branding remains Publication configuration.
- Original publisher remains primary read action.

## Phase 14 — Source administration

### Goal

Replace bootstrap/manual Source configuration with a practical control surface protected by Cloudflare Access.

### Depends on

- Phase 13.

### Deliverables

- admin shell with all admin UI/API routes behind Cloudflare Access;
- supported deployment prevents direct-origin bypass;
- CSRF/equivalent request-integrity protection for state-changing browser actions;
- Publication/resource ownership validation on admin commands;
- Source/endpoint list/detail/create/update;
- approve/unapprove;
- enable/pause/disable;
- archive lifecycle;
- approved-domain/narrowing configuration;
- polling controls;
- Source priority;
- manual check-now reusing the canonical Worker/job path;
- recent Collection-run/health visibility.

### Out of scope

- application-managed accounts/sessions;
- native roles/permissions;
- account recovery;
- identity-linked audit attribution;
- Article/duplicate moderation.

### Exit gate

- Cloudflare-authorized operator can add/operate RSS/Atom Source without code/DB changes.
- Admin actions cannot bypass state, ownership, locking, or network safety.
- Request-integrity/resource-boundary regressions pass.
- Direct-origin admin bypass is prevented in the supported deployment.

## Phase 15 — Publication and Relevance administration

### Goal

Expose the installation Publication's editorial configuration through the Cloudflare-protected control plane.

### Depends on

- Phase 14.

### Deliverables

- Publication identity/settings;
- collection/public controls;
- branding/feed configuration;
- Category management;
- Relevance-rule management;
- Source priority/default Category controls;
- deterministic rule-precedence explanation/validation.

### Out of scope

- switching among multiple Publications in one installation;
- native administrator identity;
- per-user Publication permissions;
- automatic historical Relevance reprocessing;
- Article moderation;
- duplicate review.

### Exit gate

- Authorized operator configures branding/Categories/Relevance without code changes.
- Admin browser/API validation preserves ownership/request-integrity boundaries.
- A separately deployed unrelated Publication remains generic and requires no aggregation-engine topic changes.

## Phase 16 — True duplicate detection and grouping

### Goal

Suppress true duplicate public rows while preserving every Article instance/provenance.

### Depends on

- Phase 15.

### Deliverables

- deterministic duplicate signals;
- persisted review candidates/dismissals;
- Duplicate groups/memberships;
- Primary selection with original-publisher metadata, Source priority, completeness/time/tie-breaks;
- reason/confidence records;
- ordinary-feed suppression for visible non-primary duplicates;
- exactly-one-Primary invariant;
- related-coverage safeguards.

### Out of scope

- human review UI;
- display overrides;
- event clustering;
- deletion of non-primary provenance.

### Exit gate

- True duplicates produce one ordinary row while every Article/observation remains stored.
- Ungrouped Articles remain eligible.
- Related coverage remains separate.
- Unchanged dismissed evidence does not recur indefinitely.
- Duplicate fixture/case coverage includes false-positive safeguards and real-PostgreSQL Primary/group invariants.

## Phase 17 — Article and duplicate moderation

### Goal

Give Cloudflare-authorized operators reversible control over Article presentation and duplicate decisions.

### Depends on

- Phase 16.

### Deliverables

- Article search/filter across stored instances;
- provenance inspection;
- hide/restore;
- Category overrides;
- display overrides preserving Source-derived values;
- duplicate review queue;
- merge/split/dismiss/choose-Primary;
- bounded change history with action/target/time/reason as applicable, without requiring native administrator identity.

### Out of scope

- native identity/account system;
- per-user attribution guarantees;
- public community moderation;
- related-story clustering.

### Exit gate

- Important automatic decisions are inspectable/reversible.
- Source updates do not clobber active display overrides.
- Moderation does not erase provenance.
- Reversible mutation and change-history regressions pass across API/database/browser surfaces as applicable.

## Phase 18 — Configurable HTML collection

### Goal

Add approved non-feed Sources without creating another downstream pipeline.

### Depends on

- Phase 17.

### Deliverables

- HTML listing profiles behind existing parser adapter;
- selector validation/safe preview;
- parser-version/failure diagnostics;
- approved non-feed Source support;
- browser-automation fallback decision gate only.

### Out of scope

- unrestricted crawling;
- silent Source discovery;
- default browser automation;
- parser-specific downstream persistence.

### Exit gate

- Approved HTML Source uses the same state, safety, normalization, Relevance, identity, provenance, retry, and failure-isolation boundaries as RSS/Atom.
- HTML adapters pass shared downstream regression suites rather than a separate weaker path.
- Parser failure is isolated/diagnosable.

## Phase 19 — Reliability, observability, and production operations

### Goal

Make the completed MVP safe to operate continuously and recoverably, strengthening integrated evidence for controls already tested throughout earlier phases.

### Depends on

- Phase 18.

### Deliverables

- metrics dashboards/alerts;
- tuned health/delay detection;
- concurrency/per-host rate-limit tuning;
- security/abuse regression tests;
- backup/restore procedure and tested restore;
- retention jobs/policies;
- deployment/rollback process;
- operational runbooks;
- monitoring/recovery ownership;
- explicit Cloudflare Access/origin-protection validation;
- reference-deployment validation at the appropriate evidence level.

### Out of scope

- native administrator accounts;
- self-service tenancy;
- unrelated post-MVP features;
- deferring basic security/recovery tests that belonged to earlier phases.

### Exit gate

- Restore is tested, not merely documented.
- Source failures/queue delay are observable.
- Security coverage includes SSRF, unsafe content, secret leakage, fetch limits, admin perimeter/origin assumptions, and request integrity.
- Deployment/rollback and failure runbooks are usable and validated where practical.
- Required deterministic regression suites remain green on the final tree.

## Phase 20 — Customer launch validation

### Goal

Configure, validate, and hand off the first real Publication without adding new engine capability during launch work.

### Depends on

- Phase 19.

### Deliverables

- curated initial Source configuration;
- Category/Relevance tuning;
- duplicate-quality review;
- responsive/accessibility validation;
- operator training notes;
- launch checklist;
- monitoring/recovery ownership confirmation;
- post-launch metric baseline;
- documented known limitations;
- final validation record tied to the launched commit/deployment.

### Out of scope

- new foundational engine behavior;
- native administrator account system;
- deferred product features.

### Exit gate

- Customer/operator can manage Sources and moderate feed through Cloudflare-protected admin interface.
- Public links, dates, Sources, and duplicate suppression are accurate in sampled approved-live-Source validation.
- Final deterministic regression, browser, recovery, and reference-deployment evidence required by the testing contract is recorded for the launched tree.
- Known limitations and production ownership are documented.

## Deferred roadmap candidates

After MVP evidence supports them:

- native application-managed administrator accounts/identity;
- passwords/passkeys or application-managed identity-provider integration;
- application sessions/account recovery;
- administrator roles and Publication-aware per-user authorization;
- multi-administrator identity-linked audit attribution;
- automatic/bulk historical Relevance reprocessing tooling;
- email newsletters;
- Source push/webhook adapters;
- AI-assisted summaries with attribution/controls;
- related-story/event clustering;
- public accounts/personalized feeds;
- outbound newsletter/social publishing;
- self-service tenancy;
- generic relevance ranking/boost scoring;
- pinning/editorial featured-story ordering;
- API access;
- multilingual feeds.

Deferred features reuse normalized Articles and Publication boundaries rather than bypassing them. Any future proposal for concurrent multi-Publication hosting within one installation requires an explicit contract/ADR change rather than being inferred from the reusable Publication abstraction.
