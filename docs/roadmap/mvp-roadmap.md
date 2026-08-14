# MVP Roadmap

This roadmap prioritizes the fastest safe path to a working product demonstration: collect real Articles from administrator-approved Sources, normalize and persist them idempotently, and display them in a public rolling feed whose headlines link to the original publishers.

Phases are intentionally narrow. Each phase represents one cohesive implementation boundary that can be implemented, tested, reviewed, and closed without bundling unrelated feature domains.

## Roadmap principles

- The first implementation milestone is a real end-to-end aggregation vertical slice, not a complete administrative control plane.
- Initial singleton Publication/Source configuration may be bootstrapped through operator-maintained seed/configuration tooling so collection can be proven before full admin UX exists.
- Bootstrap approval is explicit operator approval; it never bypasses whitelist eligibility or silently expands approved domains.
- The aggregation engine remains topic independent; the initial indie-author Publication is configuration only.
- Each deployed installation hosts exactly one Publication/topic. Reuse for another topic means another configured deployment of the same codebase, not concurrently hosting multiple topic Publications in one installation.
- The canonical customer-visible feed route is the deployment root `/`; public readers and ordinary runtime flows do not select a Publication by slug.
- Publication is a singleton editorial/configuration concept, not a relational tenancy key. Do not introduce Publication IDs, slugs, foreign keys, joins, uniqueness scopes, or compatibility plumbing solely for hypothetical concurrent hosting.
- Real Source/endpoint/run/Article/observation relationships remain explicit where they protect identity, provenance, safety, lifecycle, or data integrity.
- Before production database compatibility is established, the supported persistence setup is a fresh database built from the repository's current migration chain and bootstrap/configuration. Pre-production schema corrections are destructive resets: legacy-only migrations, compatibility code, selector APIs, tests/fixtures, and obsolete configuration paths are removed when the current canonical system no longer needs them, and databases created by older source trees are rebuilt rather than preserved.
- Network safety, Source approval boundaries, Collection-run provenance, normalization, Relevance ordering, and idempotent Article identity are not deferred for the tech demo because they are expensive and risky to retrofit.
- Before configurable Relevance rules exist, the canonical Relevance boundary runs with an empty rule set and deterministically includes safe candidates by default.
- The optional Source RSS/Atom item admission filter is Source-owned, topic-independent, include-only configuration evaluated over parsed Raw-item editorial text before Article-candidate normalization; it is distinct from Phase 11 Relevance.
- Native application-managed administrator accounts, passwords/passkeys, sessions, roles, account recovery, Publication-scoped user authorization, and identity-linked audit attribution are outside MVP.
- MVP admin UI/API routes use Cloudflare Access as the external perimeter; supported deployments MUST prevent direct-origin bypass.
- Cloudflare Access does not replace request-integrity, resource-validation, fetch/network-safety, output/content-safety, secrets, or origin protections.
- Observed Level 8 proof that Cloudflare Access protects deployed admin routes and that direct-origin bypass fails is deferred to Phase 19; earlier admin phases still implement and regression-test their application-side security boundaries and do not weaken the deployment invariant.
- Public-feed and collection behavior should become useful before admin convenience and moderation workflows are expanded.
- Automated behavioral regression coverage is the primary defense against regressions. Every implementation phase and gating correction inherits `docs/contracts/testing-and-validation-contract.md`.

## Global phase validation gate

The exit gate written inside each implementation phase is necessary but not sufficient by itself.

Every implementation phase MUST also satisfy the testing and validation contract against the final source tree before it can close. That means, as applicable:

- focused automated tests for new/corrected behavior;
- relevant broader regression suites for the change's blast radius;
- negative/failure/boundary coverage for contract-critical behavior;
- real disposable PostgreSQL evidence for persistence/concurrency/migration claims;
- deterministic collection-fixture evidence rather than live-public-network dependence in ordinary deterministic validation;
- browser evidence for browser-dependent behavior;
- repeatable local static/test/runtime validation executed against the exact final tree;
- no skipped/flaky/zero-selected suite standing in for required proof;
- terminal evidence and limitations reported explicitly;
- a durable closeout validation artifact when required by the phase/correction gate.

Earlier passing evidence does not automatically validate later source changes. Historical validation remains evidence for the exact tree/behavior that was observed; later implementation corrections do not rewrite it.

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
- topic-independent singleton-Publication structural module boundaries;
- formatting, linting, and type-checking foundation;
- smallest suitable TypeScript-compatible automated test runner/toolchain;
- substantive startup/configuration/health tests;
- root test/check commands as they become substantive under the testing contract;
- Web/API liveness/readiness endpoints;
- Worker startup/dependency readiness validation without requiring a separate Worker HTTP probe in Phase 1;
- repeatable local static/test/runtime validation procedure for implementation review and phase closeout;
- required zero-test-selection protection where filtering is used;
- durable Phase 1 closeout record under `docs/validation/` tied to the exact accepted commit/source tree.

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

Represent the minimum trusted singleton Publication and Source configuration required to collect approved feeds without waiting for admin UI.

### Depends on

- Phase 2.

### Canonical deliverables

- singleton Publication persistence with the collection/public state needed by the pipeline;
- Source persistence with an immutable installation-wide configuration key;
- Source-endpoint persistence with an immutable Source-scoped configuration key;
- separate approval/trust state;
- separate active/archived lifecycle state;
- separate enabled/paused/disabled operational state;
- Source approved-domain policy using deterministic normalized-host rules;
- endpoint URL, initial `rss_atom` type, and optional policy narrowing that cannot widen Source policy;
- positive bounded `poll_interval_seconds` configuration;
- explicit idempotent operator-invoked bootstrap mechanism for the singleton Publication and approved Sources without Publication selection.

The accepted Phase 3 validation artifact remains historical evidence for its accepted source SHA. The completed Phase 10 entry correction removed obsolete Publication-scoped plumbing from the current implementation/tests so the active tree matches this canonical model without rewriting that historical evidence.

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

- The current domain schema migrates reproducibly from zero on a disposable PostgreSQL database.
- A singleton Publication and at least two approved `rss_atom` endpoints can be configured without engine-topic logic.
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

- global singleton Publication collection-active eligibility;
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

### Deliverables

- text normalization preserving intended meaning;
- relative URL resolution;
- original discovered URL preservation;
- canonical identity URL normalization/tracking cleanup;
- date parsing with confidence/fallback metadata;
- unsafe markup stripping/sanitization;
- field bounds;
- normalized title representation;
- Source/endpoint/Collection-run provenance attachment without redundant Publication tenancy;
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

### Deliverables

- canonical Relevance boundary executing the empty-rule/default-include decision until configurable rules exist;
- Article schema;
- Article-observation provenance schema;
- reliable Source external-ID identity;
- canonical-URL identity within Source scope;
- explicit stable identity-key support only when a concrete approved adapter/endpoint requires it;
- transactional uniqueness constraints;
- idempotent create/update/unchanged behavior;
- Article observation linked to endpoint and existing Collection run;
- canonical processing outcomes added to Collection-run accounting.

The accepted Phase 7 validation artifact remains historical evidence for its accepted source SHA. The completed Phase 10 entry correction removed obsolete Publication-scoped identity/provenance fields from the current implementation/tests so the active tree matches the Source-scoped canonical model without rewriting that historical evidence.

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

Expose the smallest useful rolling feed from real stored Articles through the Web/API process without pulling Phase 9 presentation or later discovery/deduplication features forward.

### Canonical deliverables

- database-backed singleton public-feed read model exposed at `GET /api/feed`;
- persisted Article `visibility_state` using `visible` / `hidden` / `archived`;
- public-exposure gate requiring singleton `public_status = public`;
- Source trust/lifecycle gate requiring Source `approved` + `active` for ordinary public rows;
- baseline Article eligibility requiring `visible` and logically `ungrouped` before duplicate groups exist;
- canonical effective feed date using trusted parsed `published_at`, otherwise `first_seen_at`, with the date source exposed explicitly;
- deterministic reverse-chronological ordering by effective feed date, then `first_seen_at` descending, then stable Article identifier;
- bounded server-defined recent result window;
- minimal safe item shaping: stable Article identifier, effective feed date/date source, `display_title`, Source display name, and stored `original_url`;
- `original_url` as the headline destination;
- bounded secret-safe public error behavior;
- explicit operator-controlled `public_status` transition without making ordinary bootstrap overwrite existing state.

The accepted Phase 8 validation artifact records the slug-addressed implementation that existed at its accepted source SHA. The completed Phase 10 entry correction removed that obsolete selector plumbing and established the canonical singleton API without rewriting historical evidence.

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

- A public HTTP request returns real persisted eligible Articles deterministically through the Web/API process.
- Feed eligibility, date fallback, deterministic order, original URL destination, visibility migration, and error shaping pass the required regression/database suites.

## Phase 9 — Basic public-feed UI and tech demo

**Status:** Complete by explicit repository-owner acceptance on August 11, 2026, with the recorded live-source limitation preserved in `docs/validation/phase-9-basic-public-feed-ui-tech-demo.md`.

The Phase 9 durable validation artifact records that the deterministic/static/database/browser matrix passed but the required two-Source Level 7 live-source gate was not observed because The Creative Penn exceeded the unchanged production fetch deadline in the recorded environment. The repository owner attributed that timeout to the slow phone-hotspot Internet connection, explicitly accepted Phase 9, and directed the Phase 10 handoff to continue. This roadmap acceptance does not convert the failed Level 7 observation into passing evidence or alter the validation artifact's original determination.

### Goal

Produce the first customer-visible working product using real collected data.

### Canonical deliverables

- database-backed public feed page at `GET /`;
- core desktop `Date | Headline | Source` presentation;
- sane stacked mobile rendering;
- stored-`original_url` links;
- deterministic UTC calendar-date rendering until presentation timezone exists;
- loading/empty/unavailable/error behavior;
- topic-independent shared UI behavior.

The accepted Phase 9 validation artifact records the slug-addressed page that existed at its accepted source SHA. The completed Phase 10 entry correction removed that obsolete route plumbing and established root `/` without rewriting historical evidence.

### Out of scope

- final responsive/accessibility polish;
- dark-mode completion;
- filters/search;
- client-controlled pagination/load-more;
- duplicate moderation;
- admin UI.

### Exit gate — tech-demo milestone

The historical Phase 9 milestone remains accepted with its recorded live-source limitation. The completed Phase 10 entry correction owns the current root-route/singleton regression evidence.

## Phase 10 entry singleton implementation correction

**Status:** Complete with durable validation recorded in `docs/validation/single-publication-simplification-correction.md`. This was a non-versioned Phase 10 entry gate, not a numbered roadmap phase.

### Goal

Bring the current pre-production implementation into exact alignment with the canonical singleton model by removing obsolete Publication tenancy/selectors from code, schema, configuration, and public/Worker paths while preserving all genuine Source/endpoint/run/Article/observation behavior.

### Depends on

- accepted Phase 9;
- `docs/decisions/single-publication-simplified-data-model.md`.

### Deliverables

- singleton persisted Publication/settings configuration for name, `active_for_collection`, `public_status`, and later editorial/presentation settings without a tenant UUID/slug in other domain records;
- obsolete pre-production migration files deleted/squashed/replaced so the smallest coherent current migration baseline creates the canonical singleton schema directly from zero;
- installation-wide immutable Source `config_key` uniqueness;
- Source-scoped endpoint `config_key` and Source-scoped Article identity;
- normalized candidate provenance using Source + endpoint + Collection run without redundant Publication identity;
- preserved Source → endpoint → Collection run and Source → Article → observation integrity/provenance;
- bootstrap/configuration cleanup so ordinary setup supplies one singleton Publication configuration and Sources/endpoints without Publication slug selection;
- Worker/manual collection entry-point cleanup so endpoint execution no longer requires a Publication selector;
- canonical database-backed basic feed API at `GET /api/feed` with no Publication selector/scoping argument;
- canonical customer-visible page at `GET /` consuming the same feed boundary;
- removal of pre-production slug-addressed public/runtime compatibility aliases;
- deletion of legacy-only source modules, wrappers, types, tests, fixtures, helpers, and obsolete Publication-oriented configuration paths rather than retaining compatibility structure for superseded pre-production behavior;
- updated current-behavior tests/fixtures/helpers that preserve whitelist, network-safety, run accounting, idempotency, visibility, feed ordering/date, and original-link behavior;
- durable correction closeout validation artifact under `docs/validation/` tied to the exact corrected source tree.

### Boundary clarification

- This correction removes only the obsolete Publication tenancy/selectors. It MUST NOT flatten Source/endpoint/run/Article/observation relationships that enforce real provenance or integrity.
- Existing databases created by earlier pre-production source trees are disposable and are destroyed/recreated/bootstrapped; no in-place data-preservation or compatibility migration is required.
- The active migration tree MUST represent only the current canonical schema evolution needed by the supported source tree. Legacy migration steps whose only purpose is superseded pre-production history are removed rather than retained; Git history provides that record.
- Historical task prompts and validation artifacts remain evidence for their recorded source SHAs; they are not rewritten to claim corrected behavior was already observed.
- Obsolete Publication-oriented source/config paths, APIs, wrappers, tests, and fixtures MUST be removed when they have no independent role in the canonical singleton system. Do not preserve plural/slug APIs or ignored compatibility parameters solely for continuity.
- The correction does not add Categories/Relevance persistence, durable scheduling, admin UI, duplicate grouping, or later-phase features.
- The correction does not change `package.json` version; its P-numbers are local ordering only under the non-versioned correction-stack workflow.

### Exit gate

Before ordinary Phase 10 implementation began, the corrected final tree required the executed evidence in `docs/contracts/testing-and-validation-contract.md`, including:

- real disposable PostgreSQL migration from zero to the canonical singleton schema using the smallest current migration baseline;
- singleton Publication enforcement and installation-wide Source uniqueness;
- Source/endpoint/run/Article/observation relationship constraints;
- Source-scoped external-ID/canonical-URL identity, fallback/promotion/conflict, idempotency, transaction rollback, and concurrency/race coverage;
- unchanged collection approval/network-safety/run-accounting/failure-isolation behavior through relevant regression suites;
- `GET /api/feed` eligibility/order/error/original-link regression coverage;
- Level 6 browser evidence for direct navigation/refresh at `/`, loading/empty/unavailable/error states, external links, and representative desktop/mobile behavior;
- no reader/Worker/bootstrap/runtime Publication selector remaining in the canonical supported path;
- no compatibility schema/path retained solely for older disposable pre-production databases;
- no legacy-only migration/code/API/type/test/fixture/configuration artifact retained solely to preserve superseded pre-production implementation history;
- a durable correction validation artifact tied to the exact accepted corrected source tree.

The completed gate returned directly to Phase 10 planning; it did not invoke `/closeout`, advance the roadmap phase, or change the package version.

## Phase 10 — Automated polling, durable jobs, and endpoint health

**Status:** Complete with durable validation recorded in `docs/validation/phase-10-automated-polling-durable-jobs-endpoint-health.md`.

### Goal

Turn the manually proven endpoint execution unit into a continuously updating single-Publication installation without creating a second collection path.

### Depends on

- accepted Phase 9;
- completed and validated singleton implementation correction.

### Deliverables

- durable job mechanism;
- due-endpoint scheduler for the installation;
- scheduler respects singleton Publication `active_for_collection` as the global collection gate;
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
- Publication tenant IDs/scopes in jobs or scheduler queries;
- admin Source screens;
- production alert dashboards;
- HTML collection;
- duplicate grouping.

### Exit gate

- Due approved endpoints collect automatically when singleton Publication collection is active.
- One failing endpoint does not interrupt unrelated collection.
- Overlapping runs are prevented.
- Retry/recovery tests are deterministic and verify preserved state, not merely thrown errors.
- Recent outcomes/failures can be diagnosed without console-only output.

## Phase 11 — Categories and configurable Relevance execution

**Status:** Complete with durable validation recorded in `docs/validation/phase-11-categories-configurable-relevance-execution.md`.

### Goal

Add deterministic installation-specific inclusion/exclusion/categorization without topic logic in the engine.

### Depends on

- completed Phase 10.

### Deliverables

- Category persistence without a Publication tenant foreign key, using immutable installation-wide Category `config_key` identity;
- Relevance-rule persistence without a Publication tenant foreign key, using immutable installation-wide rule `config_key` identity;
- include/exclude/categorize actions;
- bounded literal predicates `title_contains`, `summary_contains`, and `source_category_equals`;
- explicit integer priority;
- installation-wide and optional Source-scoped behavior;
- deterministic priority → scope → exclude-over-include → rule-`config_key` tie-breaks for include/exclude decisions;
- all-matching independent categorize rules with deterministic reason ordering;
- endpoint default Category with Source default fallback only when no categorize rule assigns a Category;
- persisted winning Relevance and applied Category/default reasons;
- exact `excluded` observation/Collection-run accounting before Article identity;
- smallest explicit topic-independent pre-admin operator configuration path for Categories, Relevance rules, and Source/endpoint default Category references, without changing ordinary bootstrap no-overwrite behavior.

### Behavioral boundary

- the existing default-include Relevance boundary is extended, not replaced;
- patterns are bounded non-empty literals, not regexes/globs, and missing candidate fields simply do not match;
- no fuzzy, stemming, semantic/AI, arbitrary metadata, compound Boolean, or generic ranking/boost engine is introduced;
- categorize rules are additive and independent from inclusion; priority orders categorize reasons rather than suppressing another matching Category;
- default Category behavior is fallback-only: endpoint default first, then Source default, and only when no categorize rule matched;
- an excluded candidate terminates before Article identity, retains endpoint/run provenance and exclusion reason, and does not look up an earlier Article merely to hide/delete/recategorize it;
- rule changes are prospective by default; automatic bulk retroactive re-evaluation of already persisted Articles is deferred unless a dedicated reprocessing capability is explicitly added;
- ordinary later included observations may apply then-current Category configuration without constituting a bulk historical scan;
- pre-admin editorial configuration runs only through an explicit operator action and is never implicitly applied by Web/API or Worker startup;
- another topic uses different configuration in another deployment, not another Relevance tenant in the same database.

### Out of scope

- generic boost/ranking;
- semantic AI relevance;
- regex/glob/fuzzy/general expression rules;
- arbitrary metadata or compound Boolean rule builders;
- polished admin rule-builder UX;
- duplicate grouping;
- automatic bulk historical reprocessing.

### Exit gate

- Identical candidate + configuration produces identical Relevance result and ordered reasons.
- The complete documented literal-predicate, priority/scope/action/final-tie, categorize/default, and missing-field matrix has deterministic automated coverage.
- Real disposable PostgreSQL proves Category/rule stable-key uniqueness, relationships/default references, Article/Category membership integrity, reason persistence, migration-from-zero, and exact excluded observation/run accounting.
- A newly excluded observation is proven prospective: it stops before identity and does not retroactively mutate an earlier persisted Article.
- The explicit pre-admin operator path validates real Source/Category relationships and does not weaken ordinary bootstrap or trigger bulk reprocessing.
- A separately deployed unrelated Publication can use unrelated Categories/rules without engine-topic conditionals.
- Relevance changes do not redefine Article identity.

## Phase 12 — Feed discovery features

**Status:** Complete with durable validation recorded in `docs/validation/phase-12-feed-discovery-features.md`.

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

**Status:** Complete with durable validation recorded in `docs/validation/phase-13-public-presentation-polish.md`.

### Goal

Turn the working feed into a polished customer-facing publication experience without changing the feed/discovery semantics proven by Phase 12.

### Depends on

- Phase 12.

### Deliverables

- minimum singleton Publication public-presentation persistence/read-model support for required name plus optional bounded description, same-origin logo path, and canonical accent color;
- final desktop three-column presentation;
- accessible stacked mobile layout;
- responsive refinement;
- reader-selectable `system` / `light` / `dark` modes with system-following default and persistent local override;
- singleton Publication branding integration with safe generic fallbacks when optional values are absent;
- WCAG 2.2 Level AA pass for the in-scope root public-feed experience, including contrast, semantic controls, visible focus, keyboard operation, wrapping/reflow, target sizing, status semantics, and reduced-motion behavior;
- neutral intentional initial loading presentation that resolves tracked issue R7KM without visibly flashing unset/generic Publication content before `/api/feed` resolves;
- direct understandable external-link presentation while retaining normal same-context navigation to stored `original_url` by default;
- browser validation across supported desktop/mobile layouts, themes, accessibility interactions, loading/error states, and Phase 12 discovery workflows.

### Boundary clarification

- Phase 13 was presentation polish plus the smallest Publication presentation persistence/public-read support required by that polish. It did not create a parallel feed query, routing surface, ranking model, or reader account/session system.
- The canonical `/api/feed` eligibility/order/search/filter/keyset semantics and root URL/history/reset/load-more behavior from Phase 12 remain unchanged. Presentation/markup changes must preserve the relevant Phase 12 API, database, and browser regression coverage.
- Phase 13 introduced/used the minimum public branding data, but Phase 15 owns the Cloudflare-protected administrator editing surface for those values.
- Optional `presentation_timezone` remains deferred to Phase 15; Phase 13 preserves the established UTC calendar-date fallback.
- Earlier compliant presentation changes already integrated from the parallel `ui-polish` workstream may satisfy portions of this phase and should be credited after final-tree assessment rather than rebuilt automatically.

### Out of scope

- admin UX or branding-setting administration;
- optional `presentation_timezone` configuration;
- duplicate moderation;
- Article-body republishing;
- featured ordering;
- changes to Phase 12 discovery semantics, cursor behavior, feed eligibility, or chronological ordering.

### Exit gate

- Core public workflows are usable on supported desktop/mobile layouts with Level 6 browser evidence.
- Effective light and dark presentation, theme selection/persistence, WCAG 2.2 AA in-scope accessibility behavior, keyboard/focus navigation, responsive wrapping/reflow, target sizing, and reduced-motion behavior pass browser regression coverage.
- Initial pending-load presentation does not visibly expose unset/generic Publication content before configured public data is known, resolving R7KM only when the final implementation/browser evidence proves it.
- The relevant Phase 12 search/filter/URL/Reset/Back-Forward/load-more/stale-response/API/database regressions remain green on the exact final Phase 13 tree.
- Branding values come from bounded singleton Publication configuration/public read-model data with safe generic fallbacks, not shared-engine topic logic.
- Configurable timezone is not introduced and UTC date behavior remains unchanged.
- Original publisher remains the primary read action through an exact stored-`original_url` direct link with normal same-context activation by default.

## Phase 14 — Source administration

**Status:** Complete by explicit repository-owner acceptance on August 14, 2026.

### Goal

Replace bootstrap/manual Source configuration with a practical control surface intended for operation behind Cloudflare Access.

### Depends on

- Phase 13.

### Deliverables

- admin shell and admin UI/API routes structured for the required Cloudflare Access external perimeter;
- CSRF/equivalent request-integrity protection for state-changing browser actions;
- real resource-relationship/domain-invariant validation on admin commands;
- Source/endpoint list/detail/create/update;
- approve/unapprove;
- enable/pause/disable;
- archive lifecycle;
- approved-domain/narrowing configuration;
- polling controls;
- Source priority;
- optional Source-level RSS/Atom item admission phrases configured through the Source editor/API;
- include-only any-match behavior using bounded, trimmed, non-empty phrases with deterministic case-insensitive literal matching over parsed title, summary/content text, and Source-provided category labels;
- absent phrase configuration preserving collect-all behavior, with no exclude list or independent enabled toggle;
- pre-normalization `source_item_filtered_count` Collection-run accounting;
- manual check-now reusing the canonical Worker/job path;
- recent Collection-run/health visibility;
- preserved deployment invariant that supported deployments prevent direct-origin bypass, with observed Cloudflare Access/origin-topology proof deferred to Phase 19.

### Out of scope

- application-managed accounts/sessions;
- native roles/permissions;
- account recovery;
- identity-linked audit attribution;
- Publication tenant authorization/scoping;
- Article/duplicate moderation;
- Phase 15 Publication/Category/Relevance administration or any new Relevance predicate;
- endpoint-specific admission filters;
- regex/glob/fuzzy/stemming/semantic/AI/general-expression filtering;
- Article-body fetching for admission matching;
- automatic historical Article reprocessing or mutation;
- claiming unsupported future adapter types already use the RSS/Atom filter;
- Level 8 reference-deployment observation of Cloudflare Access and direct-origin blocking, which is a Phase 19 validation responsibility.

### Boundary clarification

- The Source RSS/Atom item admission filter runs after safe fetch and RSS/Atom parse but before Article-candidate normalization, Article-link policy, Phase 11 Relevance/Categories, Source-scoped identity, and persistence.
- A mismatch is a filtered Raw item, not a normalized candidate, Relevance `excluded` outcome, normalization failure, or Article observation. It does not run identity or mutate a previously persisted Article.
- Filter changes are prospective and do not rewrite historical Articles, observations, or Collection runs.
- The filter does not bypass approval/lifecycle/operational eligibility, endpoint locking, network/redirect/fetch/parser safety, admitted-candidate Article-link validation, scheduling, jobs, or provenance.
- Existing Phase 11 predicates and deterministic precedence/category behavior remain unchanged.
- Phase 14's recorded application-side admin, request-integrity, resource-boundary, persistence, job, collection-fixture, and browser evidence remains historical evidence of its original BLOCKED/RED closeout determination. Its sole blocker was the then-required but unavailable Level 8 Cloudflare Access/direct-origin deployment observation. That observation is now a blocking Phase 19 responsibility; owner acceptance advanced Phase 14 without rewriting the artifact or claiming deployed-perimeter proof.

### Exit gate

- The admin Source control surface can add/operate an RSS/Atom Source without code/DB changes.
- The admin Source control surface can view/change the optional Source RSS/Atom item admission phrases without code/DB hand-editing, and absent configuration preserves collect-all behavior.
- Deterministic tests prove bounded literal any-match behavior across supported parsed fields, missing/empty/invalid configuration, all-items-filtered accounting, separation from normalization/Relevance/identity/observations, and prospective non-retroactive edits.
- Admin actions cannot bypass state, real resource relationships, locking, or network safety.
- Request-integrity/resource-boundary regressions pass.
- The unobserved Level 8 Cloudflare Access/direct-origin proof is a blocking Phase 19 exit requirement before production readiness; it was not observed or retrospectively made green for Phase 14.

## Phase 15 — Publication and Relevance administration

**Status:** Current roadmap phase.

### Goal

Expose the installation's singleton Publication/editorial configuration, Categories, and the bounded existing Relevance model through the Cloudflare-protected control plane.

### Depends on

- Phase 14.

### Deliverables

- singleton Publication `name`, `active_for_collection`, `public_status`, and the existing optional `description`, `logo_path`, and `accent_color` presentation values, preserving their established bounds and ordinary bootstrap no-overwrite behavior;
- one optional `presentation_timezone`: a valid IANA time-zone identifier that changes calendar-date presentation only; absent configuration preserves UTC, and edits do not rewrite stored timestamps, feed ordering, routing, or tenancy identity;
- Category create/read/update with immutable installation-wide `config_key`, mutable bounded display label, transactional relationship validation, and physical removal only when genuinely unreferenced without nulling, cascading, or rewriting retained configuration, Article membership, or provenance;
- management of the existing bounded Relevance model: immutable installation-wide `config_key`; optional real-Source scope; only `title_contains`, `summary_contains`, and `source_category_equals` literal predicates; action, literal pattern, priority, enabled state, explanatory label/reason, and a real Category target only for `categorize`;
- preserved include/exclude/categorize semantics, deterministic precedence, additive categorization, endpoint-default then Source-default fallback, prospective edits, and no automatic bulk historical reprocessing;
- enable/disable as the ordinary non-destructive rule operation, with physical rule removal only when retained reasons/provenance permit it and never through cascade/history rewrite;
- Category-set integration for the existing Phase 14 Source/endpoint default-Category selectors; Source priority and Source administration remain Phase 14-owned;
- deterministic rule-precedence explanation and validation.

### Out of scope

- switching among multiple Publications in one installation;
- relational Publication tenancy for admin configuration;
- native administrator identity;
- per-user Publication permissions;
- automatic historical Relevance reprocessing;
- Article moderation;
- duplicate review.

### Exit gate

- Authorized operator configures the governed Publication settings, Categories, and existing Relevance rules without code changes.
- Admin browser/API/database validation preserves request integrity, real resource relationships, rollback, retained Article/provenance integrity, and Source/endpoint default-Category behavior.
- Presentation-timezone validation proves invalid IANA identifiers are rejected, absence retains UTC, and configured calendar-date rendering does not change persisted timestamps or canonical feed ordering.
- Relevance validation proves the established literal vocabulary, action/target compatibility, Source/Category relationships, prospective behavior, and deterministic precedence/default semantics remain unchanged.
- Phase 15 closeout does not require Level 8 Cloudflare Access/direct-origin deployment observation; Phase 19 remains responsible for that proof.
- A separately deployed unrelated Publication remains generic and requires no aggregation-engine topic changes.

## Phase 16 — True duplicate detection and grouping

### Goal

Suppress true duplicate public rows while preserving every Article instance/provenance.

### Depends on

- Phase 15.

### Deliverables

- deterministic duplicate signals;
- persisted review candidates/dismissals;
- installation-wide Duplicate groups/memberships without Publication tenant key;
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

Make the completed MVP safe to operate continuously and recoverably, strengthening integrated evidence for controls already tested throughout earlier phases and completing the deferred deployment-perimeter proof before production readiness.

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
- Level 8 reference-deployment validation that observes unauthenticated admin denial/challenge, authorized operator access, failed direct-origin bypass, and the actual origin-protection mechanism.

### Out of scope

- native administrator accounts;
- self-service tenancy;
- unrelated post-MVP features;
- deferring basic application-side security/recovery tests that belonged to earlier phases.

### Exit gate

- Restore is tested, not merely documented.
- Source failures/queue delay are observable.
- Security coverage includes SSRF, unsafe content, secret leakage, fetch limits, admin perimeter/origin assumptions, and request integrity.
- Deployment/rollback and failure runbooks are usable and validated where practical.
- Level 8 reference-deployment evidence confirms Cloudflare Access challenges/denies unauthenticated admin access, an authorized operator can reach the admin surface, direct-origin bypass fails, and the deployed origin-protection control is identified.
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
- administrator roles and application-level per-user authorization;
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

Deferred features reuse normalized Articles and singleton Publication configuration rather than bypassing them. Any future proposal for concurrent multi-Publication hosting within one installation requires an explicit future contract/ADR and deliberate data-model work; it is not inferred from the MVP architecture.
