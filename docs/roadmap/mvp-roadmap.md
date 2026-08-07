# MVP Roadmap

This roadmap prioritizes the fastest safe path to a working product demonstration: collect real Articles from administrator-approved Sources, normalize and persist them idempotently, and display them in a public rolling feed whose headlines link to the original publishers.

Phases are intentionally narrow. Each phase should represent one cohesive implementation boundary that can be implemented, tested, reviewed, and closed without bundling unrelated feature domains.

## Roadmap principles

- The first implementation milestone is a real end-to-end aggregation vertical slice, not a complete administrative control plane.
- Initial Publication/Source configuration may be bootstrapped through seed/configuration tooling so collection can be proven before full admin UX exists.
- The aggregation engine remains topic independent; the initial indie-author Publication is configuration only.
- Network safety, Source approval boundaries, normalization, provenance, and idempotent Article identity are not deferred for the tech demo because they are expensive and risky to retrofit.
- Native application-managed administrator accounts, passwords, sessions, roles, account recovery, Publication-scoped user authorization, and identity-linked audit attribution are outside MVP. MVP admin routes are deployed behind Cloudflare Access as the external access perimeter.
- Cloudflare Access does not replace fetch/network-safety controls, output/content safety, secrets handling, or origin/deployment protections.
- Public-feed and collection behavior should become useful before admin convenience and moderation workflows are expanded.

## Tech-demo critical path

Phases 1 through 9 form the critical path to the first demonstrable product.

The tech-demo milestone is reached when at least two real approved RSS/Atom Sources can be collected through the Worker, normalized, persisted idempotently with provenance, and displayed as current public feed rows with headlines linking to the original publishers.

## Phase 0 — Contracts and roadmap alignment

### Goal
Align the governing documentation around the demo-first delivery strategy while preserving the locked aggregation laws.

### Depends on
- none.

### Deliverables
- locked project laws remain intact;
- MVP scope/exclusions reflect Cloudflare Access rather than native application authentication;
- roadmap uses focused implementation phases;
- tech-demo critical path is explicit;
- topic-specific behavior remains located in Publication configuration;
- domain, collection, Article, feed, and security contracts remain internally coherent.

### Out of scope
- application implementation;
- Source collection;
- public UI implementation;
- native administrator identity/account implementation.

### Exit gate
- No unresolved contradiction exists among Phase 0 documents.
- Implementation tasks can cite measurable contract behavior.
- Approval/trust, lifecycle, operational state, health, Article identity, duplicate role, provenance, and feed eligibility remain unambiguous.
- Native administrator authentication/identity requirements are no longer blockers for MVP implementation.

## Phase 1 — Application foundation

### Goal
Create the independently runnable application skeleton without introducing business behavior.

### Depends on
- Phase 0.

### Deliverables
- Node.js/TypeScript project scaffold;
- Web/API entry point;
- Worker entry point;
- environment validation;
- Publication-aware module boundaries;
- linting, formatting, type checking, and test foundation;
- health/readiness endpoints;
- basic CI.

### Out of scope
- domain persistence;
- durable collection jobs;
- Source fetching;
- Article persistence;
- admin UI.

### Exit gate
- Web/API and Worker start independently.
- CI rejects formatting/type/test failures.
- No indie-author-specific condition exists in shared engine modules.

## Phase 2 — Database foundation

### Goal
Establish durable PostgreSQL infrastructure before adding domain models.

### Depends on
- Phase 1.

### Deliverables
- PostgreSQL connection/configuration;
- migration workflow;
- development/test database workflow;
- transaction utilities;
- dependency health/readiness checks;
- migration validation in CI.

### Out of scope
- complete domain schema;
- Source collection;
- Article identity rules;
- durable scheduler/job behavior.

### Exit gate
- A clean database can be migrated reproducibly.
- Web/API and Worker can connect through the shared database boundary.
- Migration/test failures are surfaced by CI.

## Phase 3 — Publication and Source configuration core

### Goal
Represent the minimum trusted configuration required to collect approved feeds without waiting for a full admin interface.

### Depends on
- Phase 2.

### Deliverables
- Publication persistence with collection/public state needed by the pipeline;
- Source persistence;
- Source-endpoint persistence;
- separate approval/trust state;
- separate active/archived lifecycle state;
- separate enabled/paused/disabled operational state;
- Source approved-domain policy;
- endpoint URL/type and narrowing policy;
- basic polling configuration fields;
- seed/bootstrap mechanism for initial Publication and approved Sources.

### Out of scope
- admin CRUD screens;
- Categories/Relevance rules;
- Source health UI;
- collection scheduling;
- outbound HTTP.

### Exit gate
- A generic Publication and at least two approved RSS/Atom endpoints can be configured without changing aggregation-engine business logic.
- Invalid state/domain configurations are rejected.
- Initial indie-author Source configuration exists only as Publication-owned data/bootstrap input.

## Phase 4 — Collection eligibility and network safety

### Goal
Guarantee that only eligible, approved, safe Source endpoints may reach the outbound fetch boundary.

### Depends on
- Phase 3.

### Deliverables
- Publication collection-active eligibility checks;
- Source/endpoint approval, lifecycle, and operational eligibility checks;
- HTTP/HTTPS scheme policy;
- approved-domain validation;
- DNS/address/port safety validation;
- loopback/private/link-local/multicast/cloud-metadata rejection;
- redirect destination revalidation primitives;
- endpoint run-lock primitive sufficient to prevent overlapping collection work;
- explicit skip/rejection reasons.

### Out of scope
- RSS parsing;
- Article normalization;
- automated polling scheduler;
- public feed.

### Exit gate
- Eligible test endpoints can reach the fetch boundary.
- Unapproved, archived, paused, disabled, or unsafe endpoints cannot produce outbound requests.
- Redirects cannot bypass the same safety boundary.
- Overlapping work for one endpoint can be prevented.

## Phase 5 — RSS/Atom transport and parsing

### Goal
Fetch real approved structured feeds and convert them into Raw items behind reusable adapter boundaries.

### Depends on
- Phase 4.

### Deliverables
- fetcher adapter interface;
- parser adapter interface;
- HTTP fetcher with connect/total timeouts;
- response and decompression limits;
- bounded redirect handling through Phase 4 safety checks;
- conditional request support where Source metadata permits;
- content-type handling;
- RSS parser;
- Atom parser;
- Raw-item representation;
- manual Worker collection invocation for development/demo validation;
- isolated transport/parser errors.

### Out of scope
- automated due-endpoint scheduler;
- Article persistence;
- Relevance rules;
- duplicate detection.

### Exit gate
- At least two real approved, active, enabled feeds fetch and parse independently.
- One broken feed does not prevent another from completing.
- Re-fetching an unchanged feed is transport-safe and deterministic at the Raw-item boundary.

## Phase 6 — Article normalization

### Goal
Convert untrusted Source-shaped Raw items into safe, deterministic Article candidates.

### Depends on
- Phase 5.

### Deliverables
- text normalization while preserving intended human meaning;
- relative URL resolution;
- original discovered URL preservation;
- canonical identity URL normalization and recognized tracking-parameter removal;
- date parsing with confidence/fallback metadata;
- unsafe markup stripping/sanitization;
- field-length bounds;
- normalized title representation for later identity/matching;
- Publication/Source/endpoint/run provenance attachment;
- post-parse Article-link/domain validation.

### Out of scope
- Article persistence;
- Relevance execution;
- duplicate grouping;
- public rendering.

### Exit gate
- The same Raw item produces deterministic normalized Article-candidate output.
- Unsafe or out-of-policy Article destinations are rejected before persistence.
- Real RSS/Atom entries can be inspected as normalized candidates with provenance.

## Phase 7 — Article identity and persistence

### Goal
Persist normalized Source instances transactionally and idempotently without conflating Article identity with true-duplicate detection.

### Depends on
- Phase 6.

### Deliverables
- Article schema;
- Article-observation provenance schema;
- Collection-run persistence sufficient for endpoint/run provenance and candidate outcomes;
- reliable Source external-ID identity resolution;
- canonical-URL identity resolution within the required Publication/Source scope;
- configured stable identity-key support where required;
- transactional uniqueness constraints;
- idempotent create/update/unchanged behavior;
- Article observation linkage to endpoint and Collection run;
- canonical processing outcome accounting for persisted candidates.

### Out of scope
- cross-Article true-duplicate grouping;
- Relevance-rule engine;
- Article moderation UI;
- search/filter UI.

### Exit gate
- Reprocessing the same unchanged Source item does not increase Article cardinality for that Source identity.
- Every persisted Article observation traces to its endpoint and Collection run.
- Item-level failures do not require unrelated Articles from the same run to be lost when integrity permits isolation.

## Phase 8 — Basic public-feed backend

### Goal
Expose the smallest useful Publication-scoped rolling feed from real stored Articles.

### Depends on
- Phase 7.

### Deliverables
- Publication-scoped public-feed read model/endpoint;
- reverse-chronological ordering using canonical feed-date semantics;
- visible ungrouped Article eligibility baseline;
- data required for date, headline, Source, and original/canonical destination;
- safe output shaping from normalized stored data;
- explicit loading/error-compatible API behavior.

### Out of scope
- keyword search;
- Source/Category filters;
- elaborate pagination UX;
- duplicate grouping;
- public theme/branding polish.

### Exit gate
- A public HTTP request returns real persisted Article rows in deterministic reverse-chronological order.
- Every returned row traces to an approved active Source and normalized stored Article.
- The headline destination is the original/canonical publisher URL.

## Phase 9 — Basic public-feed UI and tech demo

### Goal
Produce the first customer-visible working product using real collected data.

### Depends on
- Phase 8.

### Deliverables
- database-backed public feed page;
- core desktop `Date | Headline | Source` presentation;
- sane basic mobile rendering without forcing an unusable compressed desktop table;
- Publication name/identity display;
- linked headlines opening the original publisher destination;
- loading, empty, and error states.

### Out of scope
- full responsive/accessibility polish;
- dark-mode completion;
- filters/search;
- duplicate moderation;
- admin configuration UI.

### Exit gate — tech-demo milestone
- At least two real approved RSS/Atom Sources are collected through the Worker.
- Their Raw items are normalized and persisted idempotently with endpoint/run provenance.
- Current Articles appear in the public rolling feed.
- Headlines link to the intended original publishers.
- Re-running collection does not create duplicate Article records for the same Source identity.

## Phase 10 — Automated polling and Collection runs

### Goal
Turn the manually provable pipeline into a continuously updating aggregator.

### Depends on
- Phase 9.

### Deliverables
- durable job mechanism;
- due-endpoint scheduler;
- independent endpoint jobs;
- endpoint locking integrated with job execution;
- configurable polling intervals;
- conditional-fetch state persistence;
- bounded retries/backoff with jitter;
- Collection-run lifecycle/status records;
- transport/parser/normalization/persistence timing and outcome telemetry;
- baseline endpoint health derivation;
- failure isolation between Sources/endpoints.

### Out of scope
- admin Source screens;
- production dashboards/alerts;
- HTML collection;
- duplicate grouping.

### Exit gate
- Due approved endpoints collect automatically according to configured intervals.
- One failing endpoint does not interrupt unrelated collection.
- Overlapping runs are prevented.
- Recent run outcomes and failures can be diagnosed without relying on console-only output.

## Phase 11 — Categories and Relevance execution

### Goal
Add deterministic Publication-specific editorial inclusion/exclusion/categorization without topic logic in the aggregation engine.

### Depends on
- Phase 10.

### Deliverables
- Category persistence;
- Relevance-rule persistence;
- include/exclude/categorize actions;
- explicit priority ordering;
- Publication-wide and Source-scoped rule behavior;
- deterministic precedence/tie-break implementation;
- Source/endpoint default Category precedence;
- persisted inclusion/exclusion/category reasons;
- excluded candidate outcome accounting.

### Out of scope
- generic boost/ranking scores;
- semantic AI relevance;
- admin rule-builder polish;
- duplicate grouping.

### Exit gate
- Identical candidate plus configuration produces the same Relevance result and reasons.
- A second unrelated test Publication can use unrelated Categories/rules without engine-topic conditionals.
- Relevance configuration changes do not redefine Article identity.

## Phase 12 — Feed discovery features

### Goal
Make a growing rolling feed easy to explore without changing its eligibility semantics.

### Depends on
- Phase 11.

### Deliverables
- Category filter;
- Source filter;
- keyword search over safe normalized/display metadata;
- deterministic pagination/load-more cursor behavior;
- URL-reflected filter/search state where practical;
- clear reset behavior;
- query/index tuning appropriate to MVP scale.

### Out of scope
- personalized feeds;
- ranking/boost scoring;
- featured/pinned ordering;
- public user accounts.

### Exit gate
- Search, filters, and pagination return only feed-eligible Articles.
- Pagination is stable and deterministic under the documented ordering rules.
- Reset/navigation behavior is predictable on desktop and mobile.

## Phase 13 — Public presentation polish

### Goal
Turn the working feed into a polished customer-facing publication experience.

### Depends on
- Phase 12.

### Deliverables
- final desktop three-column presentation;
- accessible stacked mobile layout;
- responsive refinement;
- light/dark presentation;
- Publication branding/configuration integration;
- contrast, focus, keyboard, wrapping, and tap-target accessibility pass;
- clear external-link semantics;
- browser validation of supported layouts/states.

### Out of scope
- admin UX;
- duplicate moderation;
- public Article-body republishing;
- pinning/featured ordering.

### Exit gate
- Core public-feed workflows are usable on supported desktop/mobile layouts.
- Light/dark and Publication branding do not introduce topic-specific shared-engine behavior.
- Original publisher navigation remains the primary read action.

## Phase 14 — Source administration

### Goal
Replace bootstrap/manual Source configuration with a practical Source/endpoint control surface protected by Cloudflare Access.

### Depends on
- Phase 13.

### Deliverables
- admin shell behind the deployment's Cloudflare Access perimeter;
- Source list/detail/create/update flows;
- endpoint list/detail/create/update flows;
- approve/unapprove actions;
- enable/pause/disable actions;
- archive lifecycle actions;
- Source approved-domain and endpoint narrowing configuration;
- polling interval/configuration controls;
- Source priority configuration;
- manual check-now action using the same collection safety/locking path;
- recent Collection-run and endpoint-health visibility.

### Out of scope
- application-managed login/accounts/sessions;
- native administrator roles/permissions;
- account recovery;
- identity-linked audit attribution;
- Article/duplicate moderation.

### Exit gate
- A Cloudflare-authorized operator can add and operate an ordinary RSS/Atom Source without code or direct database changes.
- Admin actions cannot bypass approval, lifecycle, operational, lock, or network-safety boundaries.
- Unprotected direct-origin access to admin surfaces is not part of the supported deployment model.

## Phase 15 — Publication and Relevance administration

### Goal
Expose Publication editorial configuration through the Cloudflare-protected admin control plane.

### Depends on
- Phase 14.

### Deliverables
- Publication identity/settings management;
- collection-active/public-status controls;
- branding/feed configuration;
- Category management;
- Relevance-rule management;
- Source priority/default Category configuration where not already surfaced;
- validation/explanation of deterministic rule precedence.

### Out of scope
- application-managed administrator identity;
- per-user Publication permissions;
- Article moderation;
- duplicate review.

### Exit gate
- A Cloudflare-authorized operator can configure Publication branding, Categories, and deterministic Relevance behavior without code changes.
- A second unrelated Publication remains configurable without shared-engine topic conditionals.

## Phase 16 — True duplicate detection and grouping

### Goal
Suppress true duplicate public rows while preserving every separately collected Article instance and its provenance.

### Depends on
- Phase 15.

### Deliverables
- deterministic cross-Article duplicate candidate signals;
- persisted Duplicate review candidates and dismissal decisions;
- Duplicate groups/memberships;
- Primary selection using original-publisher metadata, Source priority, completeness/time/tie-break rules;
- automatic reason/confidence records;
- ordinary-feed suppression for visible non-primary duplicates;
- exactly-one-Primary invariants;
- related-coverage safeguards.

### Out of scope
- human review UI;
- Article display overrides;
- semantic event clustering;
- deletion of non-primary Article instances/provenance.

### Exit gate
- Separately stored true-duplicate Source instances produce one ordinary public row while all Article instances/observations remain stored.
- Ungrouped Articles remain feed-eligible.
- Related coverage remains separate.
- Dismissed unchanged duplicate evidence does not recur indefinitely.

## Phase 17 — Article and duplicate moderation

### Goal
Give Cloudflare-authorized operators reversible control over Article presentation and duplicate decisions.

### Depends on
- Phase 16.

### Deliverables
- Article search/filter across stored instances;
- Source/endpoint/run provenance inspection;
- Article hide/restore;
- Category overrides;
- administrator display overrides preserving Source-derived normalized values;
- duplicate review queue;
- merge, split, dismiss, and choose-Primary actions;
- bounded change/event history sufficient to explain material configuration/moderation changes without requiring native administrator accounts.

### Out of scope
- native administrator identity/account system;
- per-user attribution guarantees;
- public comments/community moderation;
- related-story clustering.

### Exit gate
- Important automatic Article/duplicate decisions can be inspected and reversed where appropriate.
- Source updates do not silently clobber active display overrides.
- Moderation does not erase Article/observation provenance.

## Phase 18 — Configurable HTML collection

### Goal
Add approved non-feed Sources without creating a second downstream aggregation pipeline.

### Depends on
- Phase 17.

### Deliverables
- HTML listing parser profiles behind the existing parser adapter boundary;
- selector validation and safe preview/testing;
- parser-version/failure diagnostics;
- approved non-feed Source support;
- browser-automation fallback decision gate, not default implementation.

### Out of scope
- unrestricted crawling;
- silent Source discovery;
- browser automation as default collection behavior;
- parser-specific downstream Article persistence logic.

### Exit gate
- An approved non-feed Source collects through the same approval/lifecycle/operational, safety, normalization, Relevance, identity, provenance, retry, and failure-isolation boundaries as RSS/Atom.
- Parser failure is isolated and diagnosable.

## Phase 19 — Reliability, observability, and production operations

### Goal
Make the completed MVP safe to operate continuously and recoverably in production.

### Depends on
- Phase 18.

### Deliverables
- metrics dashboards and alerts;
- tuned unhealthy/delayed endpoint detection;
- concurrency/per-host rate-limit tuning;
- security/abuse regression tests for the implemented MVP boundaries;
- backup/restore procedure and tested non-production restore;
- data-retention jobs/policies;
- deployment and rollback process;
- operational runbooks;
- production monitoring/recovery ownership;
- Cloudflare Access/origin-protection deployment validation for admin surfaces.

### Out of scope
- native administrator accounts;
- self-service tenancy;
- unrelated post-MVP feature work.

### Exit gate
- Restore is tested.
- Source failures and queue delay are observable.
- Security regression coverage includes SSRF/network safety, unsafe content, secret leakage, fetch limits, admin perimeter assumptions, and request-integrity controls applicable to deployed admin actions.
- Deployment/rollback and core failure runbooks are usable by the operator.

## Phase 20 — Customer launch validation

### Goal
Configure, validate, and hand off the first real Publication without introducing new engine capability during launch work.

### Depends on
- Phase 19.

### Deliverables
- curated initial Source configuration;
- Category/Relevance tuning;
- duplicate-quality review;
- responsive/accessibility validation;
- administrator/operator training notes;
- launch checklist;
- production monitoring/recovery ownership confirmation;
- post-launch metric baseline;
- documented known limitations.

### Out of scope
- new foundational engine behavior;
- native administrator account system;
- deferred product features.

### Exit gate
- Customer/operator can manage Sources and moderate the feed through the Cloudflare-protected admin interface.
- Public links, dates, Sources, and duplicate suppression are accurate in sampled validation.
- Known limitations are documented.
- Production monitoring and recovery ownership are assigned.

## Deferred roadmap candidates

After MVP evidence supports them:

- native application-managed administrator accounts and identity;
- passwords/passkeys or application-managed identity-provider integration;
- application session/account recovery workflows;
- administrator roles and Publication-aware per-user authorization;
- multi-administrator identity-linked audit attribution;
- email newsletters;
- Source push/webhook adapters;
- AI-assisted summaries with clear attribution/controls;
- related-story/event clustering;
- public accounts/personalized feeds;
- outbound newsletter/social publishing;
- multi-Publication roles and self-service tenancy;
- generic relevance ranking/boost scoring;
- pinning/editorial featured-story ordering;
- API access;
- multilingual feeds.

Deferred features reuse normalized Articles and Publication boundaries rather than bypassing them.
