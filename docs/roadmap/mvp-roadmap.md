# MVP Roadmap

This roadmap prioritizes the fastest safe path to a working product demonstration: collect real Articles from administrator-approved Sources, normalize and persist them idempotently, and display them in a public rolling feed whose headlines link to the original publishers.

Phases are intentionally narrow. Each phase represents one cohesive implementation boundary that can be implemented, tested, reviewed, and closed without bundling unrelated feature domains.

## Roadmap principles

- The first implementation milestone is a real end-to-end aggregation vertical slice, not a complete administrative control plane.
- Initial Publication/Source configuration may be bootstrapped through operator-maintained seed/configuration tooling so collection can be proven before full admin UX exists.
- Bootstrap approval is explicit operator approval; it never bypasses whitelist eligibility or silently expands approved domains.
- The aggregation engine remains topic independent; the initial indie-author Publication is configuration only.
- Network safety, Source approval boundaries, Collection-run provenance, normalization, Relevance ordering, and idempotent Article identity are not deferred for the tech demo because they are expensive and risky to retrofit.
- Before configurable Relevance rules exist, the canonical Relevance boundary runs with an empty rule set and deterministically includes safe candidates by default.
- Native application-managed administrator accounts, passwords/passkeys, sessions, roles, account recovery, Publication-scoped user authorization, and identity-linked audit attribution are outside MVP.
- MVP admin UI/API routes use Cloudflare Access as the external perimeter; supported deployments MUST prevent direct-origin bypass.
- Cloudflare Access does not replace request-integrity, resource-validation, fetch/network-safety, output/content-safety, secrets, or origin protections.
- Public-feed and collection behavior should become useful before admin convenience and moderation workflows are expanded.

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
- domain, collection, Article, feed, and security contracts are internally coherent.

### Out of scope
- application implementation;
- Source collection;
- public UI implementation;
- native administrator identity/account implementation.

### Exit gate
- No unresolved contradiction exists among Phase 0 documents.
- Implementation tasks can cite measurable contract behavior.
- Approval/trust, lifecycle, operational state, health, Article identity, duplicate role, provenance, Relevance ordering, and feed eligibility are unambiguous.
- Native administrator authentication/identity requirements are not MVP blockers.

## Phase 1 — Application foundation

### Goal
Create the independently runnable application skeleton without business behavior.

### Depends on
- Phase 0.

### Deliverables
- Node.js/TypeScript scaffold;
- Web/API entry point;
- Worker entry point;
- environment validation;
- Publication-aware module boundaries;
- linting, formatting, type checking, test foundation;
- health/readiness endpoints;
- basic CI.

### Out of scope
- domain persistence;
- durable jobs;
- Source fetching;
- Article persistence;
- admin UI.

### Exit gate
- Web/API and Worker start independently.
- CI rejects formatting/type/test failures.
- Shared engine modules contain no indie-author-specific condition.

## Phase 2 — Database foundation

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
- migration validation in CI.

### Out of scope
- complete domain schema;
- Source collection;
- Article identity;
- durable scheduler/jobs.

### Exit gate
- A clean database can be migrated reproducibly.
- Web/API and Worker connect through the shared database boundary.
- Migration/test failures are surfaced by CI.

## Phase 3 — Publication and Source configuration core

### Goal
Represent the minimum trusted configuration required to collect approved feeds without waiting for admin UI.

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
- idempotent seed/bootstrap mechanism for initial Publication and approved Sources.

### Bootstrap rules
- bootstrap may explicitly create `approved` Source/endpoint state as deliberate operator approval;
- no discovery/auto-approval;
- no approval inferred from fetch success;
- no silent domain widening;
- bootstrap must not overwrite later operator-managed state on ordinary startup.

### Out of scope
- admin CRUD screens;
- configurable Categories/Relevance rules;
- Source health UI;
- collection scheduling;
- outbound HTTP.

### Exit gate
- A generic Publication and at least two approved RSS/Atom endpoints can be configured without engine-topic logic.
- Invalid state/domain configurations are rejected.
- Initial indie-author configuration exists only as Publication-owned bootstrap data.

## Phase 4 — Collection eligibility and network safety

### Goal
Guarantee that only eligible, approved, safe Source endpoints may reach the outbound fetch boundary.

### Depends on
- Phase 3.

### Deliverables
- Publication collection-active eligibility;
- Source/endpoint approval, lifecycle, operational checks;
- HTTP/HTTPS scheme policy;
- approved-domain validation;
- DNS/address/port safety validation;
- loopback/private/link-local/multicast/cloud-metadata rejection;
- redirect destination revalidation primitives;
- endpoint run-lock primitive;
- explicit skip/rejection reasons.

### Out of scope
- RSS parsing;
- Article normalization;
- automated polling scheduler;
- public feed.

### Exit gate
- Eligible test endpoints reach the fetch boundary.
- Unapproved, archived, paused, disabled, or unsafe endpoints cannot produce outbound requests.
- Redirects cannot bypass safety.
- Overlapping work for one endpoint can be prevented.

## Phase 5 — RSS/Atom transport, parsing, and minimal Collection runs

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
- isolated endpoint transport/parser failures.

### Out of scope
- automated due-endpoint scheduler;
- Article persistence;
- configurable Relevance rules;
- duplicate detection.

### Exit gate
- At least two real approved active enabled feeds fetch/parse independently through Worker execution.
- Every real fetch attempt has a persisted truthful Collection run.
- One broken feed does not prevent another run from completing.
- Re-fetching unchanged content is transport-safe and deterministic at the Raw-item boundary.

## Phase 6 — Article normalization

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

## Phase 7 — Default Relevance, Article identity, and persistence

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
- configured stable identity-key support where required;
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
- Every persisted observation traces to endpoint and Collection run.
- Item failures do not require unrelated Articles from the same run to be lost when integrity permits isolation.

## Phase 8 — Basic public-feed backend

### Goal
Expose the smallest useful Publication-scoped rolling feed from real stored Articles.

### Depends on
- Phase 7.

### Deliverables
- Publication-scoped read model/endpoint;
- reverse-chronological canonical feed-date ordering;
- visible ungrouped Article eligibility baseline;
- date/headline/Source/original destination data;
- safe output shaping;
- explicit error-compatible API behavior.

### Out of scope
- keyword search;
- Source/Category filters;
- elaborate pagination UX;
- duplicate grouping;
- public theme/branding polish.

### Exit gate
- Public HTTP request returns real persisted Articles deterministically.
- Every row traces to approved active Source and normalized stored Article.
- Headline destination is the original/canonical publisher URL.

## Phase 9 — Basic public-feed UI and tech demo

### Goal
Produce the first customer-visible working product using real collected data.

### Depends on
- Phase 8.

### Deliverables
- database-backed public feed page;
- core desktop `Date | Headline | Source` presentation;
- sane basic mobile rendering;
- Publication name/identity;
- linked original-publisher headlines;
- loading, empty, error states.

### Out of scope
- final responsive/accessibility polish;
- dark-mode completion;
- filters/search;
- duplicate moderation;
- admin UI.

### Exit gate — tech-demo milestone
- At least two real approved RSS/Atom Sources collect through the Worker.
- Collection runs record the attempts.
- Raw items normalize, pass default Relevance, and persist idempotently with observations.
- Current Articles appear in the public feed with intended publisher links.
- Re-running collection does not create duplicate Article records for one Source identity.

## Phase 10 — Automated polling, durable jobs, and endpoint health

### Goal
Turn the manually proven endpoint execution unit into a continuously updating aggregator without creating a second collection path.

### Depends on
- Phase 9.

### Deliverables
- durable job mechanism;
- due-endpoint scheduler;
- independent endpoint jobs reusing the canonical Worker execution path;
- locking integrated with jobs;
- polling intervals;
- conditional-fetch state persistence;
- bounded retries/backoff/jitter;
- expanded Collection-run lifecycle/telemetry;
- baseline endpoint health derivation;
- failure isolation.

### Out of scope
- admin Source screens;
- production alert dashboards;
- HTML collection;
- duplicate grouping.

### Exit gate
- Due approved endpoints collect automatically.
- One failing endpoint does not interrupt unrelated collection.
- Overlapping runs are prevented.
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
- A second unrelated Publication can use unrelated Categories/rules without engine-topic conditionals.
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
- Core public workflows are usable on supported desktop/mobile layouts.
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
- Direct-origin admin bypass is prevented in the supported deployment.

## Phase 15 — Publication and Relevance administration

### Goal
Expose Publication editorial configuration through the Cloudflare-protected control plane.

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
- native administrator identity;
- per-user Publication permissions;
- automatic historical Relevance reprocessing;
- Article moderation;
- duplicate review.

### Exit gate
- Authorized operator configures branding/Categories/Relevance without code changes.
- Second unrelated Publication remains generic.

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
- Parser failure is isolated/diagnosable.

## Phase 19 — Reliability, observability, and production operations

### Goal
Make the completed MVP safe to operate continuously and recoverably.

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
- explicit Cloudflare Access/origin-protection validation.

### Out of scope
- native administrator accounts;
- self-service tenancy;
- unrelated post-MVP features.

### Exit gate
- Restore is tested.
- Source failures/queue delay are observable.
- Security coverage includes SSRF, unsafe content, secret leakage, fetch limits, admin perimeter/origin assumptions, and request integrity.
- Deployment/rollback and failure runbooks are usable.

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
- documented known limitations.

### Out of scope
- new foundational engine behavior;
- native administrator account system;
- deferred product features.

### Exit gate
- Customer/operator can manage Sources and moderate feed through Cloudflare-protected admin interface.
- Public links, dates, Sources, and duplicate suppression are accurate in sampled validation.
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

Deferred features reuse normalized Articles and Publication boundaries rather than bypassing them.
