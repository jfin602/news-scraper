# News Scraper Boot Document

This is the session initialization contract for repository-aware work in `jfin602/news-scraper`. Read it first in a new ChatGPT/Codex session.

It establishes project identity, canonical terminology, authority, document routing, workflow gates, shorthand commands, and repository safety rails. It is a router/interpreter, not a substitute for specialized contracts, ADRs, implementation docs, tests, or observed validation evidence.

## Project identity

- Repository: `jfin602/news-scraper`
- Default branch: `main`
- Parallel UI branch: `ui-polish` for non-versioned presentation work; use a separate worktree when UI work runs concurrently with roadmap/correction implementation
- Working product/repository name: News Scraper
- Platform: reusable, topic-independent news aggregation Platform
- Deployment cardinality: exactly one Publication/topic per deployed installation
- Topic reuse model: configure and deploy another installation of the same shared codebase; do not concurrently host multiple topic Publications in one installation
- Publication data-model role: singleton editorial/configuration state, **not** a relational tenant/ownership key
- Current phase: **Phase 18 — Configurable HTML collection**
- Current implementation direction: **bounded static HTML listing profiles behind the existing approved/whitelisted endpoint parser and shared Raw-item/downstream pipeline; no browser collector and no generic application of the RSS/Atom Source admission filter**
- Production status: pre-production
- Pre-production database policy: destructive fresh rebuild from the repository's smallest current canonical migration chain and bootstrap/configuration; databases from older source trees are disposable and legacy-only migration/runtime/test/config structure is removed rather than preserved for compatibility
- Production compatibility boundary: Phase 19 establishes/validates upgrade/restore/rollback procedures; acceptance of Phase 20 customer launch establishes the first supported production schema/data baseline, after which `docs/decisions/production-data-and-schema-compatibility.md` governs preservation and upgrades
- Initial Publication: publishing-industry news relevant to indie authors
- Public direction: canonical root `/` rolling recent-headline feed plus canonical basic API `/api/feed`, sending readers to original publishers
- Admin direction: Cloudflare Access-protected singleton Publication/Source/endpoint/Relevance/Category/Article/duplicate/health/change-history control plane, built after the tech-demo vertical slice
- Core constraint: Publication-specific behavior is configuration; shared engine logic remains topic independent

Phase 0 documentation alignment, Phase 1 Application foundation, Phase 2 Database foundation, Phase 3 Publication/Source configuration, Phase 4 Collection eligibility and network safety, Phase 5 RSS/Atom transport, parsing, and minimal Collection runs, Phase 6 Article normalization, Phase 7 Default Relevance/Article identity/persistence, and Phase 8 Basic public-feed backend implementation/validation are complete with durable validation. Phase 9 Basic public-feed UI and tech demo is complete by explicit repository-owner acceptance on August 11, 2026. Its durable validation artifact remains authoritative that the required two-Source Level 7 live-source gate was not observed in the recorded run because The Creative Penn timed out under the recorded execution environment; owner acceptance advances roadmap state without rewriting that evidence.

The Phase 10 entry singleton implementation correction is complete with durable validation in `docs/validation/single-publication-simplification-correction.md`. It removed obsolete Publication tenancy/scoping/selectors from the supported source/schema/configuration/public/Worker paths and established the canonical singleton migration-from-zero model, `/api/feed`, and root `/` without rewriting historical evidence.

Phase 10 — Automated polling, durable jobs, and endpoint health — is complete with durable validation in `docs/validation/phase-10-automated-polling-durable-jobs-endpoint-health.md`. Durable jobs, due-endpoint scheduling, retry/recovery, conditional-fetch state, shared capacity/locking, Worker orchestration, and baseline endpoint health now surround the same canonical endpoint execution unit proven during the tech-demo path.

Phase 11 — Categories and configurable Relevance execution — is complete with durable validation in `docs/validation/phase-11-categories-configurable-relevance-execution.md`. Persisted installation-wide Categories, deterministic include/exclude/categorize rules, Source/endpoint default Category fallback, stable reasons, prospective exclusions, and the explicit pre-admin editorial configuration path now extend the same pre-identity Relevance boundary.

Phase 12 — Feed discovery features — is complete with durable validation in `docs/validation/phase-12-feed-discovery-features.md`. Deterministic Source/Category filters, bounded literal search, stable keyset pagination/load-more, URL/reset navigation behavior, and MVP-scale query/index behavior now extend the canonical public-feed boundary without changing feed eligibility or chronological ordering.

Phase 13 — Public presentation polish — is complete with durable validation in `docs/validation/phase-13-public-presentation-polish.md`. Minimum singleton Publication public-presentation/branding support, polished responsive desktop/mobile presentation, system/light/dark modes, accessibility behavior, intentional pending/loading presentation including resolved issue R7KM, and preserved Phase 12 discovery semantics now form the integrated public-presentation baseline.

Phase 14 — Source administration — is complete by explicit repository-owner acceptance on August 14, 2026. Its historical validation artifact remains truthful evidence of the recorded passing local/static/unit/integration/database/fixture/browser evidence and its original BLOCKED/RED determination: the then-required Level 8 Cloudflare Access/direct-origin deployment observation was unavailable. The governing roadmap and testing contract subsequently moved that observation to Phase 19; owner acceptance advanced the roadmap without rewriting the historical artifact or claiming Level 8 was observed.

Phase 15 — Publication and Relevance administration — is complete with durable validation in `docs/validation/phase-15-publication-relevance-administration.md`. Phase 16 — True duplicate detection and grouping — is complete with durable GREEN validation in `docs/validation/phase-16-true-duplicate-detection-and-grouping.md`; its non-versioned testing-efficiency correction remains completed historical work. Phase 17 — Article and duplicate moderation — is complete with durable GREEN validation in `docs/validation/phase-17-article-and-duplicate-moderation.md`. Phase 18 — Configurable HTML collection — is current.

The canonical architecture is one Publication/topic per installation, singleton Publication editorial configuration without relational tenancy, Source-scoped identity/provenance, persisted Relevance/Categories, canonical `/api/feed`, canonical root `/`, and durable endpoint scheduling/jobs. Historical validation artifacts remain evidence only for the exact SHAs and environments they recorded.

## Delivery priority

Phases 1–9 are the historical tech-demo critical path.

The first demonstrable milestone is: at least two real approved RSS/Atom Sources are collected through the Worker, recorded in Collection runs, normalized, passed through the canonical default-include Relevance boundary, persisted idempotently with Article-observation provenance, and displayed in the public feed with original-publisher headline links.

Phase 11 completed deterministic persisted Categories and configurable Relevance execution. Phase 12 completed deterministic Source/Category filters, bounded literal search, keyset/load-more cursors, and URL/reset navigation behavior. Phase 13 completed the governed public-presentation work while preserving those discovery semantics. Phase 14 completed Source administration and the Source RSS/Atom item admission filter by owner acceptance on August 14, 2026, with the historical Level 8 deployment-proof limitation preserved and now governed by Phase 19. Phase 15 completed Publication/Category/Relevance administration, Phase 16 completed true duplicate detection/grouping plus its non-versioned testing-efficiency correction, and Phase 17 completed reversible Article and duplicate moderation. Phase 18 now extends the existing adapter boundary with approved static HTML listing profiles while keeping every downstream stage shared.

Because the project is currently pre-production, databases from superseded source trees remain disposable. Current implementation work may rebuild development/pre-production databases from the canonical migration chain rather than preserving unsupported old schema/data compatibility. That destructive reset policy does not apply to accepted customer production state after the Phase 20 production baseline; post-baseline upgrades are governed by `docs/decisions/production-data-and-schema-compatibility.md`.

After Phase 20 customer launch, new product-feature work is frozen until Phase 21 closes. Critical production defects, security fixes, data-integrity fixes, and required operational repairs may use an appropriately bounded fix/correction path; unrelated deferred capability does not. Phase 21 is the terminal roadmap phase unless the repository owner explicitly approves a later roadmap extension.

Every implementation phase and correction inherits `docs/contracts/testing-and-validation-contract.md`. Fast delivery does not permit regression protection, persistence proof, network-safety tests, or final-tree validation to be deferred when the corresponding behavior is introduced or changed. Validation efficiency means eliminating redundant execution and repeated setup while preserving the same applicable evidence coverage.

## New-session startup

For project-wide work refresh:

1. `BOOT.md`
2. `README.md`
3. `AGENTS.md`
4. `docs/contracts/project-contract.md`
5. `docs/roadmap/mvp-roadmap.md`
6. narrowest governing contract/ADR, including `docs/contracts/testing-and-validation-contract.md` for implementation/review work
7. relevant implementation/tests
8. recent commits affecting the area when recency matters

For UI-workstream tasks, additionally read `docs/design/README.md` and `docs/design/ui-workflow.md` before planning, design review/application, or writing a UI prompt.

Do not read every document indiscriminately. Use routing below. A full `/docs-review` is the intentional exception.

## Canonical terminology

Governed by `docs/contracts/domain-and-data-contract.md` plus `docs/decisions/single-publication-simplified-data-model.md`.

- `repo` / `source code` = `jfin602/news-scraper`
- `Platform` = reusable aggregation software deployed/configured separately for different topics
- `Publication` = the singleton configured news product/editorial configuration for one installation; **not** a relational tenant/ownership key
- `legacy Publication selector` = obsolete pre-production implementation plumbing such as Publication IDs/slugs/FKs/scopes that the canonical model does not use
- `production baseline` = the accepted Phase 20 launched source/version/schema state after which customer production data is durable supported state and normal upgrades must preserve it
- `Source` = configured publisher/outlet; approval state determines whether it is trusted for collection
- `Source endpoint` = configured feed/API/HTML location owned by a Source
- `Collection run` = one attempt to collect one endpoint; persisted provenance begins with the first real fetch phase
- `Raw item` = minimally interpreted parser output
- `Source RSS/Atom item admission filter` = optional Source-owned include-phrase gate over parsed RSS/Atom Raw-item editorial text, before Article-candidate normalization and distinct from Relevance
- `Article candidate` = normalized but not yet accepted; provenance is Source + endpoint + Collection run
- `Article` = persisted normalized Source instance; identity is Source-scoped
- `Article observation` = endpoint/run provenance for an Article/candidate outcome, preserving Source consistency
- `Duplicate review candidate` = persisted possible true-duplicate decision/review record
- `Duplicate group` = separately stored Articles representing the same underlying published item
- `Primary article` = one member selected to represent a Duplicate group publicly
- `Related coverage` = distinct reporting about same subject/event; not a true duplicate
- `Category` = installation-wide editorial grouping from singleton Publication configuration, identified by immutable installation-wide `config_key` once persisted
- `Relevance rule` = deterministic installation-wide include/exclude/categorize rule, optionally Source-scoped, identified by immutable installation-wide `config_key` once persisted
- `contract` = behavior implementation must preserve
- `ADR` = decision record in `docs/decisions/`
- `task` = roadmap/correction implementation prompt under `docs/tasks/`
- `UI task` = non-roadmap, non-versioned targeted presentation prompt under `docs/design/tasks/`
- `validation artifact` = durable record under `docs/validation/` of evidence actually observed against a specific source tree/environment; it does not redefine contracts
- `refresh` = re-read current repository sources before answering
- `lock` = treat a decision as authoritative and identify documents that must reflect it

Do not blur removal of relational Publication tenancy with removal of the singleton Publication editorial/configuration concept. Also keep Source vs endpoint, approval vs lifecycle/operational state, operational state vs health, Relevance vs Article identity, Category assignment vs inclusion, Article identity vs duplicate identity, Article visibility vs duplicate role, external admin access control vs application resource validation, and source inspection vs executed validation evidence distinct.

## Authority and conflicts

Canonical authority is `docs/contracts/project-contract.md`:

1. locked laws;
2. explicit project-contract invariants;
3. domain and lifecycle contracts;
4. architecture, interface, security/operations contracts, and Accepted ADRs;
5. roadmap/implementation notes;
6. root summaries/routing (`AGENTS.md`, `README.md`, `BOOT.md`);
7. implementation;
8. historical task prompts;
9. comments/commit messages/stale notes.

`docs/contracts/testing-and-validation-contract.md` governs how implementation behavior is proven and when implementation/correction work may be considered complete. It does not redefine product/domain behavior or outrank the governing behavioral contract being tested.

Design documents under `docs/design/` are presentation/workflow guidance subordinate to the applicable product/domain contracts, ADRs, roadmap, and testing contract. They may refine presentation, but they do not silently redefine supported behavior or roadmap exit gates.

Observed validation evidence proves behavior only for the source tree/environment/procedure actually tested; it does not outrank or redefine a governing contract. Earlier Phase 3–9 artifacts may accurately describe Publication-scoped schema/routes at their accepted SHAs even though the canonical current architecture does not use those shapes.

Current user instruction controls task scope. A proposed locked-law change is a contract-change request, not permission for lower-authority work to override it silently.

Report authoritative conflicts rather than choosing silently.

## Document routing

| Area                                                                                                                                                         | Read first                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Locked laws / authority / product boundaries                                                                                                                 | `docs/contracts/project-contract.md`                         |
| MVP users / demo-first capabilities / exclusions                                                                                                             | `docs/contracts/mvp-scope-and-users.md`                      |
| Terminology / singleton model / entities / identity / provenance / Category/Relevance schema                                                                 | `docs/contracts/domain-and-data-contract.md`                 |
| Testing / regression / evidence / DB/fixture/browser/live validation                                                                                         | `docs/contracts/testing-and-validation-contract.md`          |
| Process/module architecture / deployment / Worker / scheduling / transactions                                                                                | `docs/architecture/system-architecture.md`                   |
| Approval / bootstrap / collection / safety / Source RSS/Atom item admission / normalization / Relevance / operator configuration / identity / run accounting | `docs/contracts/source-and-collection-contract.md`           |
| Article visibility / duplicate role / review/groups / Primary                                                                                                | `docs/contracts/article-lifecycle-and-deduplication.md`      |
| Public feed / root routing / search / themes / admin UX / change history                                                                                     | `docs/contracts/public-feed-and-admin-contract.md`           |
| UI design / presentation workflow / parallel UI branch                                                                                                       | `docs/design/README.md`, then `docs/design/ui-workflow.md`   |
| Admin perimeter / SSRF / content safety / isolation / observability / recovery                                                                               | `docs/operations/security-reliability-and-operations.md`     |
| Phase sequence / correction history / exit gates                                                                                                             | `docs/roadmap/mvp-roadmap.md`                                |
| Singleton Publication data-model decision                                                                                                                    | `docs/decisions/single-publication-simplified-data-model.md` |
| Production data/schema compatibility / supported upgrade boundary                                                                                            | `docs/decisions/production-data-and-schema-compatibility.md` |
| Historical superseded data-model decision                                                                                                                    | `docs/decisions/topic-independent-publication-model.md`      |
| Whitelist/structured-feed decision                                                                                                                           | `docs/decisions/whitelist-and-structured-feed-first.md`      |
| Original-link/normalization decision                                                                                                                         | `docs/decisions/original-link-and-normalized-metadata.md`    |
| Cloudflare Access admin perimeter                                                                                                                            | `docs/decisions/cloudflare-access-admin-perimeter.md`        |
| Codex model/reasoning selection and prompt efficiency                                                                                                        | `docs/codex-model-selection.md`                              |
| Documentation index                                                                                                                                          | `docs/README.md`                                             |
| Specialized validation plans                                                                                                                                 | `docs/testing/` when present                                 |
| Roadmap/correction implementation prompts                                                                                                                    | `docs/tasks/` when present                                   |
| Targeted UI prompts                                                                                                                                          | `docs/design/tasks/` when present                            |
| Durable validation artifacts                                                                                                                                 | `docs/validation/` when present                              |

If a path does not exist, search for its current equivalent before assuming intentional deletion.

## High-risk project invariants

- Shared engine code remains topic independent.
- Each supported deployed installation hosts exactly one Publication/topic; another topic uses another configured deployment of the same codebase.
- Singleton Publication configuration owns installation-wide name, collection/public state, branding/presentation, Categories, Relevance, Sources, and Source priority conceptually.
- Publication is not a relational tenant key. Do not introduce Publication UUIDs, slugs, FKs, joins, composite uniqueness scopes, API/repository parameters, admin authorization scopes, or compatibility aliases solely for hypothetical concurrent hosting.
- Source `config_key` is installation-wide; endpoint `config_key` remains Source-scoped. Category and Relevance-rule `config_key` values are installation-wide and immutable once persisted.
- Source owns endpoints and Articles; endpoints own Collection runs; observations preserve endpoint/run and Article/Source consistency. Simplification MUST NOT weaken these real relationships.
- Article candidate provenance excludes Publication identity and retains Source + endpoint + Collection run.
- Article identity is Source-scoped: strong external ID first, canonical URL fallback second, explicit adapter key only when concrete need exists.
- Before production database compatibility is established, the active migration chain is the smallest supported schema-from-zero authority. Legacy-only pre-production migration steps and compatibility-only source/API/type/test/fixture/config paths MUST be removed when the canonical current system no longer needs them; older pre-production database contents are disposable and are rebuilt rather than migrated.
- Phase 19 establishes/validates production backup/restore/deployment/rollback/schema-upgrade procedures; accepted Phase 20 customer launch establishes the first supported production baseline. After that baseline, customer data is durable supported state, supported production migration history remains upgrade-capable, and normal changes preserve governed persisted data under `docs/decisions/production-data-and-schema-compatibility.md`.
- After Phase 20, new product-feature implementation is frozen until terminal Phase 21 closes; only critical production defect/security/data-integrity/operational fixes may interrupt through a bounded fix/correction path. Deferred features do not implicitly create Phase 22.
- Canonical public page is `GET /`; canonical basic public feed API is `GET /api/feed`.
- Accepted Phase 8/9 slug-addressed route evidence remains historical truth for its recorded SHAs and is not rewritten to claim root-route validation.
- The Phase 10 entry singleton implementation correction, Phase 10 scheduler/job/health implementation, and Phase 11 Category/Relevance implementation are complete with durable validation; do not treat them as active gates.
- Source/endpoint approval/trust, lifecycle (`active/archived`), operational state (`enabled/paused/disabled`), and derived health are distinct.
- Bootstrap may explicitly create approved configuration as operator input but may not auto-discover/auto-approve, infer approval from fetch success, widen domains silently, or overwrite later operator-managed state on normal startup.
- Bootstrap/Worker/runtime paths do not select a Publication slug/id; singleton Publication state is installation configuration.
- Only approved + active + operationally enabled Sources/endpoints are contacted while singleton Publication `active_for_collection` is true.
- Every request/redirect passes pre-fetch network-safety validation before contact.
- Parsed Article links pass a separate post-normalization Source/domain gate.
- Source approved domains are the maximum boundary; endpoint rules may narrow, not silently widen.
- Parsers output Raw items and never persist Articles directly.
- An optional Source RSS/Atom item admission filter uses bounded non-empty phrases with deterministic case-insensitive literal any-match semantics over existing parsed title, summary/content text, and Source-provided category labels. No configured phrases preserves collect-all behavior. A mismatch terminates before normalization and is not a Relevance `excluded` outcome or Article observation.
- Source-shaped data is normalized before Relevance, identity, duplicate, or feed use.
- Relevance ordering is never bypassed: before configurable rules exist the empty rule set deterministically returns `include`; Phase 11 extends the same boundary rather than replacing it.
- MVP rule predicates are only literal `title_contains`, `summary_contains`, and `source_category_equals`; missing fields do not match. Regex/glob/fuzzy/stemming/semantic/AI/general-expression behavior is not implied.
- Matching include/exclude precedence is priority descending → Source-scoped before installation-wide → `exclude` before `include` → immutable rule `config_key` ascending as the final deterministic winning-reason tie-break; if no rule decides, include by default.
- Matching categorize rules are additive and deduplicated by Category `config_key`; categorize priority orders reasons but does not suppress another matching Category. Endpoint default then Source default are fallback-only when no categorize rule assigns a Category.
- An excluded candidate stops before Article identity, records the canonical `excluded` outcome with endpoint/run provenance and reason, and does not look up an earlier Article merely to hide/delete/recategorize it.
- Configurable MVP Relevance edits are prospective by default; automatic bulk historical reprocessing is deferred. An ordinary later included observation may apply then-current Category configuration without constituting a bulk historical scan.
- Phase 11 introduced the explicit pre-admin topic-independent operator mechanism for Category/Relevance/default-Category configuration. It remains explicitly invoked, validates real relationships, does not weaken ordinary bootstrap no-overwrite behavior, and does not trigger automatic bulk reprocessing; Phase 15 exposes the same governed model through the protected admin control plane.
- Article identity is transactionally idempotent.
- Article observations preserve endpoint/run provenance.
- Minimal Collection-run persistence begins with the first real fetch in Phase 5 and expands as pipeline stages are introduced.
- During Phases 5–9, collection was manually invoked through the Worker; Web/API never fetched Sources inline.
- Phase 10 added durable scheduling/jobs around the same endpoint execution unit and does not add multi-Publication scheduling or tenancy.
- True-duplicate grouping applies to separately stored Articles; duplicate state is installation-wide and preserves every Article/observation.
- Article visibility is independent from duplicate role; before Duplicate groups exist, Articles are logically `ungrouped`.
- Ordinary public-feed eligibility requires singleton `public_status = public`, an approved active Source, and a visible Article that is `ungrouped` or the `primary` member once grouping exists.
- Publication collection activity, Source operational state, and endpoint approval/lifecycle/operational/health state govern collection and do not by themselves suppress retained otherwise-eligible public rows.
- Public feed effective date uses parsed `published_at` when available and otherwise `first_seen_at`, with fallback provenance detectable and deterministic tie ordering.
- Public headline destination is stored Article `original_url`; `canonical_identity_url` remains an identity-comparison field and is not substituted silently.
- Phase 12 discovery extends the canonical `/api/feed` read path rather than creating a second eligibility/query path. Optional public discovery inputs are `q`, `source`, `category`, and `cursor`.
- Public Source/Category filters use immutable `config_key` identities. MVP supports at most one Source and one Category filter; supplied `q`/Source/Category dimensions compose with AND semantics, and Category filtering uses current `article_categories` membership.
- Phase 12 keyword search is bounded deterministic case-insensitive literal filtering over safe normalized textual Article metadata; it does not introduce regex/fuzzy/semantic/ranking behavior or alter canonical chronological order.
- Phase 12 pagination uses bounded server-defined pages and opaque/versioned keyset cursors tied to the canonical effective-date → `first_seen_at` → stable-Article-ID ordering tuple and normalized discovery criteria. Cursor/query mismatch is invalid; no public `limit` is introduced.
- Phase 12 root-page URL state reflects `q`, `source`, and `category`; criteria changes reset pagination, Reset clears discovery state, and browser back/forward restores URL-reflected discovery state. Load-more cursor depth need not be canonical shareable URL state.
- Until optional Publication `presentation_timezone` is configured, the public UI renders the calendar date from `effectiveFeedDate` in UTC; a configured valid IANA timezone changes calendar-date presentation only.
- Absent singleton Publication configuration and non-public configuration remain indistinguishable on public page/API and use the same generic unavailable/not-found behavior.
- Weak duplicate evidence persists as review state; unchanged dismissed evidence does not recur indefinitely.
- Source runs/jobs fail independently and public-feed reads remain readable during collection failures.
- MVP admin UI/API routes are behind Cloudflare Access and supported deployments prevent direct-origin bypass.
- State-changing admin browser actions use CSRF/equivalent request-integrity controls; application commands validate real resource relationships/domain invariants rather than Publication tenancy.
- Native application administrator accounts/sessions/roles/account recovery/per-user Publication authorization/identity-linked audit attribution are deferred beyond MVP.
- Push/webhook adapters and pinning/featured ordering are deferred beyond MVP unless explicitly promoted.
- Every implementation change requires focused automated coverage and relevant broader regression coverage under the testing contract.
- Iterative validation uses the narrowest useful focused suite; final-tree validation uses the smallest non-overlapping command set that covers all required evidence. Aggregate commands satisfy the subordinate checks/suites they actually execute on the same unchanged final tree.
- Persistence/concurrency/migration claims require the evidence level capable of proving real PostgreSQL behavior; mocks do not substitute for database guarantees.
- Ordinary PostgreSQL test isolation may reuse one unique migrated disposable database per independently executed test file/equivalent scope with deterministic application-state reset between cases; migration/database-lifecycle/schema-mutation claims retain the fresh-database path.
- Independently isolated test files may use bounded concurrency when semantics/resource limits remain safe; parallel database files do not share a mutable database unless shared-state concurrency is the behavior under test.
- Phase 11 is complete with deterministic predicate/precedence/category/default/prospective/excluded-accounting coverage plus real PostgreSQL proof for Category/rule schema, relationships, uniqueness, membership, and reason persistence.
- Phase 12 is complete with focused API/database/browser evidence for bounded discovery input, unchanged feed eligibility, Source/Category filtering, literal search, stable keyset pagination, cursor/query mismatch rejection, URL/reset/back-forward behavior, and relevant query/index behavior recorded in `docs/validation/phase-12-feed-discovery-features.md`.
- Phase 13 is complete with durable persistence/read-model, responsive presentation, branding, theme, accessibility, loading-state, browser, and Phase 12 regression evidence recorded in `docs/validation/phase-13-public-presentation-polish.md`.
- Ordinary deterministic validation does not rely on live public Sources and must not weaken production whitelist/SSRF policy.
- Required suites do not pass by silently skipping prerequisites or selecting zero tests.
- Validation claims apply to the exact final source tree tested; previous passing evidence does not automatically transfer to later source changes.
- Phase 9 roadmap progression was explicitly accepted on August 11, 2026 despite the durable artifact recording the incomplete two-Source Level 7 observation; this owner exception does not rewrite the evidence.
- Roadmap phase closeout and a gating correction closeout require durable `docs/validation/` evidence tied to the exact accepted source tree when required by the testing contract.

## Roadmap state

Use `docs/roadmap/mvp-roadmap.md`.

Current phase: **Phase 18 — Configurable HTML collection**.

Phase 0 documentation alignment, Phase 1 Application foundation, Phase 2 Database foundation, Phase 3 Publication and Source configuration core, Phase 4 Collection eligibility and network safety, Phase 5 RSS/Atom transport, parsing, and minimal Collection runs, Phase 6 Article normalization, Phase 7 Default Relevance/Article identity/persistence, and Phase 8 Basic public-feed backend are complete with durable closeout validation. Phase 9 Basic public-feed UI and tech demo is complete by explicit repository-owner acceptance on August 11, 2026 with the recorded live-source limitation preserved. The Phase 10 entry singleton correction and Phases 10–15 are complete. Phase 14 was accepted on August 14, 2026 while preserving its historical BLOCKED/RED Level 8 Cloudflare Access/direct-origin deployment observation; that proof is now a Phase 19 responsibility. Phase 15 has durable validation in `docs/validation/phase-15-publication-relevance-administration.md`.

### Tech-demo critical path

1. Phase 1 — Application foundation
2. Phase 2 — Database foundation
3. Phase 3 — Publication and Source configuration core
4. Phase 4 — Collection eligibility and network safety
5. Phase 5 — RSS/Atom transport, parsing, and minimal Collection runs
6. Phase 6 — Article normalization
7. Phase 7 — Default Relevance, Article identity, and persistence
8. Phase 8 — Basic public-feed backend
9. Phase 9 — Basic public-feed UI and tech demo

### Completed post-demo work

- Phase 10 entry singleton implementation correction — complete with durable correction validation.
- Phase 10 — Automated polling, durable jobs, and endpoint health — complete with durable closeout validation.
- Phase 11 — Categories and configurable Relevance execution — complete with durable closeout validation.
- Phase 12 — Feed discovery features — complete with durable closeout validation in `docs/validation/phase-12-feed-discovery-features.md`.
- Phase 13 — Public presentation polish — complete with durable closeout validation in `docs/validation/phase-13-public-presentation-polish.md`.
- Phase 14 — Source administration — complete by explicit repository-owner acceptance on August 14, 2026; its historical BLOCKED/RED Level 8 deployment-observation artifact remains unchanged, and Phase 19 owns that proof.
- Phase 15 — Publication and Relevance administration — complete with durable closeout validation in `docs/validation/phase-15-publication-relevance-administration.md`.

### Completed implementation phases

16. Phase 16 — True duplicate detection and grouping — complete with durable GREEN validation in `docs/validation/phase-16-true-duplicate-detection-and-grouping.md`.

17. Phase 17 — Article and duplicate moderation — complete with durable GREEN validation in `docs/validation/phase-17-article-and-duplicate-moderation.md`.

### Current implementation phase

18. Phase 18 — Configurable HTML collection

Phase 18 collection questions route to `docs/contracts/domain-and-data-contract.md`, `docs/contracts/source-and-collection-contract.md`, `docs/architecture/system-architecture.md`, `docs/contracts/public-feed-and-admin-contract.md`, and `docs/contracts/testing-and-validation-contract.md`. HTML collection is a bounded static adapter for approved/whitelisted endpoints, produces the shared Raw-item contract, creates no alternate downstream persistence path, and does not make the Source RSS/Atom admission filter generic.

### Remaining roadmap order

19. Phase 19 — Reliability, observability, and production operations
20. Phase 20 — Customer launch validation
21. Phase 21 — Codebase simplification and maintainability hardening

Phase 21 is the terminal documented roadmap phase. After Phase 20 launch, new product-feature implementation is frozen until Phase 21 closes. Closing Phase 21 does not create a Phase 22 or `0.22.0` baseline; any later roadmap work requires explicit repository-owner approval and documentation alignment first.

Do not advance by assumption. Verify each phase/correction exit gate plus the inherited testing-and-validation gate against the final tree before updating state.

## Working preferences

- Inspect current source/docs before implementation prompts.
- Prefer file-scoped, regression-safe prompts.
- State allowed files when knowable.
- Include non-goals and preserved behavior.
- Require focused + broader regression tests and identify evidence levels needed for acceptance.
- For a prompt with a direct downstream consumer, map every downstream-required capability to the owning implementation/export and focused proof before declaring the producer complete.
- When one proposed prompt combines a complex transactional/state-machine responsibility with a separately consumable read/service/API responsibility, explicitly assess splitting it before escalating model strength; prefer decomposition when downstream consumers, test strategies, or failure risks differ materially.
- Distinguish iterative validation from final-tree validation: use the narrowest relevant focused command during development, then the smallest non-overlapping command set that covers the full applicable final matrix.
- Do not require subordinate checks/suites alongside an aggregate command that already executes them on the same unchanged final tree unless diagnosing a failure or an intervening change invalidated earlier evidence.
- Do not claim runtime/browser/database/live-Source behavior unless observed at the corresponding evidence level.
- Prefer smallest correct incremental change and simplest supported architecture over speculative future-proofing.
- For pre-production canonicalization, prefer deletion over wrappers/aliases: remove legacy-only migrations, code, types, APIs, tests, fixtures, and configuration paths instead of preserving superseded behavior in the active tree.
- After the Phase 20 production baseline, never apply the pre-production destructive-reset rule to supported customer data; trace supported baseline → migrations/persisted representation → data/relationship preservation → backup/rollback/restore → application consumers/tests before approving post-launch persistence refactors.
- For Phase 21, derive tasks from the accepted launched final tree and observed maintainability/measurement evidence. Do not target arbitrary LOC/file/module/dependency metrics, and do not create cleanup tasks for areas already simple and well-owned.
- Trace shared helpers/consumers before changes.
- Before Phase 16 duplicate changes trace Source-scoped Article identity → separately persisted Articles → duplicate evidence/signals → canonical review pair/state → Duplicate-group membership → Primary selection → public-feed eligibility/suppression → Collection-run duplicate effects → tests.
- Before Phase 18 collection changes trace endpoint type/profile → approval/lifecycle/operational state → endpoint lock/network safety → bounded HTTP fetch/redirect → endpoint-selected parser adapter → conditional RSS/Atom-only admission stage → shared normalization/Article-link policy/Relevance/Source-scoped identity/persistence/observation/duplicate path → run/health diagnostics → admin sample preview versus check-now → focused/shared regressions.
- Before later Article/moderation changes trace visibility/overrides → existing duplicate review/group state → operator controls → feed/admin behavior → tests.
- Before admin changes trace Cloudflare Access perimeter → origin protection → request integrity → real resource relationships/domain invariants → mutation → change history → tests.
- Before public-route changes trace singleton Publication settings → canonical read model → `/api/feed` → `/` page/client → unavailable/error behavior → external links → browser tests.
- Before UI changes read `docs/design/README.md` and `docs/design/ui-workflow.md`, trace governing public/design behavior → current `ui-polish` presentation source → shared frontend consumers → relevant browser/tests, and keep backend/domain behavior unchanged unless the task is routed out of the UI workstream.
- Do not run UI implementation in the same worktree used by an active phase/correction runner.
- Before approving a change, trace testing blast radius and confirm relevant regression suites were actually executed against the reviewed final tree.
- For implementation-roadmap phase or gating correction closeout, require observed local terminal evidence and the required durable validation artifact tied to the exact accepted source tree.
- Make a concrete choice when asked for `recommended`.
- Never invent repository state, tests, browser results, Source behavior, or history.

# Conversation commands

Commands are conversational shorthand, not shell commands.

## Context

### `/boot`

Refresh BOOT, root summaries, project contract, roadmap, and narrow governing docs.

### `/refresh <area>`

Re-read relevant source/docs/tests/recent commits.

### `/state`

Summarize implementation state, active phase, completed work, constraints, next logical work.

### `/route <topic>`

Identify governing contracts/ADRs/source/tests/tasks.

## Analysis

### `/audit <area>`

Compare contracts, ADRs, source, tests, recent changes, observable behavior; report disagreements/risks.

### `/contract-check <area>`

Check implementation/tests against governing contracts/laws.

### `/doc-check <area>`

Narrow documentation consistency check; does not replace full `/docs-review`.

### `/source-trace <source or behavior>`

Trace singleton configuration → Source → endpoint → approval/lifecycle/operational state → scheduling/job/manual execution → lock/run → safety → fetch → parse/normalize → link validation → Relevance → Source-scoped identity/observation → duplicate → run/health → consumers/tests.

### `/article-trace <field or concept>`

Trace Raw item → candidate → Relevance/Category assignment → Source-scoped Article identity/persistence → observations → overrides → duplicate role → feed/admin/tests.

### `/dedupe-trace <case>`

Trace Article identity separately from true-duplicate evidence, review state, groups, Primary, safeguards, moderation, feed/tests.

### `/blast-radius <change>`

Identify affected contracts, ADRs, schema/migrations, jobs/services/routes/read models/UI/tests/docs.

### `/regression <behavior>`

Trace suspected regression to likely change, affected invariants, missing test protection, and evidence level required to prove a fix.

# Phase handoff workflow

After a non-terminal implementation roadmap phase has been formally closed by its closeout task and durable validation record, use:

```text
phase implementation / closeout task
→ /closeout
→ /docs-review
→ /docs-apply
→ /prompt-ass
→ /prompt-plan
→ /prompt-write <folder name>
```

A green non-terminal `/closeout` establishes the next implementation phase by committing its `0.<phase>.0` package baseline. Because `/closeout` is intentionally version-only in that case, roadmap/root phase summaries may still identify the just-completed phase until the immediately following `/docs-review` → `/docs-apply` alignment. This short state is expected and is not itself repository drift.

For the final documented roadmap phase, `/closeout` is terminal: it performs the same bounded structural/evidence verification but does **not** change `package.json`, create a next-phase baseline, reserve a new phase number, or report a Next P1 version. A green terminal closeout reports the accepted final SHA/version and `Roadmap status: COMPLETE`; `/docs-review` → `/docs-apply` may then align summaries to completed state. Any future implementation roadmap requires an explicit owner-approved roadmap extension before another phase baseline may be created.

A correction stack has its own final manual closeout prompt, but that prompt is **not** `/closeout`. Correction closeout validates and clears only the named correction/gate while preserving the declared unchanged package version; it does not advance the roadmap phase or create a new `.0` baseline.

## `/closeout`

`/closeout` is a bounded phase-handoff or terminal-roadmap state transition, not an audit or troubleshooting workflow. Under normal repository/tool conditions, target completion is under 60 seconds.

### Fast path

1. Read this `/closeout` section and roadmap entries needed to identify the completed phase and either its intended next phase or its explicit terminal status.
2. Read the completed phase's durable validation artifact and extract the accepted/validated implementation source SHA and exit-gate conclusion.
3. Read `package.json` as sole project-version authority and completed phase task filenames/version sequence. Do not require/search npm lockfile metadata.
4. Perform one accepted-SHA-to-current-`main` compare to classify post-validation drift. Documentation-only changes and explicitly owner-approved non-executable workflow/tooling-policy changes are non-blocking when they do not modify runtime behavior, tests, migrations, committed configuration, `package.json` dependency/script/engine metadata, or other executable product behavior. Relevant executable drift is blocking.
5. If green and a documented successor phase exists, perform only the next-phase baseline version transition below. If the completed phase is explicitly terminal and no successor phase has been approved, perform no repository write.
6. For non-terminal handoff, verify transition diff, then re-read `docs/roadmap/mvp-roadmap.md` and print the complete entry for the phase being entered. For terminal closeout, re-read the terminal roadmap entry and report final accepted state without inventing a successor.

Required structural checks:

- completed phase artifact states its exit gate is satisfied and either the intended next phase is identifiable or the roadmap explicitly marks the completed phase terminal with no approved successor;
- artifact identifies accepted/validated implementation source SHA;
- single post-validation compare shows no unvalidated executable/dependency/test/migration/runtime/config drift;
- root/roadmap phase state is coherent enough for handoff/terminal completion even if docs alignment awaits `/docs-apply`;
- `package.json` contains expected completed-phase version;
- task/version sequence is coherent with no obvious blocking stale artifacts.

The repository intentionally does not use `package-lock.json`; its absence is expected and never itself a blocker.

### Time and scope guardrails

- Do not rerun full validation, tests, runtime, database, browser, or live-Source checks during `/closeout`.
- Do not perform broad contract/document/source review; `/docs-review` owns that.
- Do not walk every post-validation commit when one range comparison can classify drift.
- If relevant unvalidated drift exists, report `Closeout check blocked` and stop without root-cause investigation.
- If required state cannot be established quickly because a safe primitive is unavailable, report blocker rather than expanding into open-ended investigation.
- A non-terminal version transition gets one predetermined safe write strategy. Do not cycle alternate write mechanisms or hand-build Git objects to overcome connector limitations.
- Do not run `npm install` merely to change version.

### Non-terminal green-path version transition

Invocation of `/closeout` constitutes explicit repository-owner authorization for this version-only transition when the structural check is green and the roadmap identifies an approved successor phase.

Capture pre-transition `main` SHA. Update exactly one JSON value to `0.<next roadmap phase>.0`:

- `package.json` top-level `version`.

Preserve every other package value. Commit version-only transition directly to `main` unless branch/PR requested. Immediately compare pre/post SHAs; complete range MUST change only `package.json` and exactly the expected version value. Otherwise report `Closeout transition invalid` and stop.

### Terminal roadmap closeout

When the completed phase is explicitly the final documented roadmap phase and no successor phase has been approved, a green `/closeout` performs **no package or repository transition**.

- Do not change `package.json`.
- Do not create `0.<next phase>.0`.
- Do not reserve or infer another phase number from deferred ideas.
- Do not create a version-only commit merely to mark completion.
- Report the accepted current `main` SHA and current package version from the validated terminal tree.

A later roadmap extension requires explicit repository-owner approval plus documentation alignment before any new `.0` baseline transition.

### Required final output

For a successful non-terminal `/closeout`, respond in order:

1. `Closeout check: GREEN`;
2. resulting baseline transition commit SHA/final SHA;
3. `Next P1 version: 0.<new phase>.1`;
4. complete roadmap entry for the phase being entered, freshly re-read rather than summarized from memory.

For a successful terminal `/closeout`, respond in order:

1. `Closeout check: GREEN`;
2. accepted/final `main` SHA;
3. `Roadmap status: COMPLETE`;
4. `Final project version: <package.json version>`;
5. complete terminal roadmap entry, freshly re-read, plus any explicitly recorded limitations from its accepted durable validation artifact.

# Documentation workflow

## `/docs-review`

Always a **read-only first pass**.

Default full scope: every tracked `.md` and `.txt` except:

- `docs/tasks/`
- `docs/design/tasks/`
- `docs/validation/`

Conversation may narrow scope explicitly.

Return interpreted scope, reviewed/excluded docs, contradictions, source/docs drift when applicable, stale statements, duplicated/misplaced authority, missing cross-references, routing issues, recommended changes by file, and application order.

Never modify files during `/docs-review`.

## `/docs-apply`

Apply only approved findings/change groups from current conversation.

Before editing, re-read targets and confirm drift has not invalidated findings.

Invoking `/docs-apply` explicitly authorizes approved **documentation-only** edits directly on `main` unless the user requests a branch/PR or explicitly requires isolation from an active runner/workstream. It does not authorize source changes, unrelated cleanup, history rewriting, or unapproved docs edits.

After applying, report changed files, addressed/unapplied findings, newly discovered conflicts, and remaining validation.

## `/docs-prompt`

`/docs-prompt` is a **docs-only, read-only** alternative application path after explicit approval of a `/docs-review` change group from the current conversation. The two approved paths are:

```text
/docs-review
→ explicit approval
→ /docs-apply (direct repository-editing path)

/docs-review
→ explicit approval
→ npm run docs:snapshot
→ provide/upload news-scraper-docs-context.zip
→ /docs-prompt
→ one implementation-ready Codex prompt
→ Codex applies locally
```

It requires the generated `news-scraper-docs-context.zip`, created with `npm run docs:snapshot` and provided/uploaded for prompt generation; arbitrary full-repository ZIPs are not a substitute. The supplied ZIP is the repository snapshot used to generate the prompt. Read its `BOOT.md` first and obey its authority and routing rules. The expected snapshot contains tracked root-level repository files and the complete tracked `docs/` tree. If the ZIP is absent, malformed, or lacks this required documentation context, stop rather than guessing.

`/docs-prompt` does not modify the ZIP, GitHub, or repository files. It does not change `package.json` version or advance roadmap, correction, or UI state. It does not invoke or substitute for `/prompt-ass`, `/prompt-plan`, `/prompt-write`, `/ui-plan`, or `/ui-write`.

Its sole implementation artifact is **exactly one implementation-ready Codex prompt**, limited to the approved documentation change. Root documentation such as `BOOT.md`, `README.md`, and `AGENTS.md` may be in scope when approved. Source code, migrations, tests, runtime configuration, dependencies, package version, and unrelated cleanup are forbidden unless separately authorized outside `/docs-prompt`.

The generated prompt must require Codex to re-read the actual local target files before editing, stop and report when repository drift materially invalidates the approved change, make the smallest coherent documentation diff, and perform relevant documentation consistency and diff validation. It must not split one approved documentation change into the normal implementation task-stack pipeline.

# Prompt workflow

Strict order:

```text
/prompt-ass
→ /prompt-plan
→ /prompt-write <folder name>
```

Do not silently run missing stages. If unstable requirements, contradictory docs, repository drift, or a material decision blocks progress, return `Planning needed` and stop before next stage.

## Codex task-stack prompt-file grammar

The phase runner and parse-only validator share the same executable parser in `scripts/codex-phase-core.mjs`. Runner supports two explicit stack modes: versioned roadmap phase stacks and non-versioned correction stacks. Parser changes MUST update this section and focused regression tests in the same change.

Use `npm run codex:phase:validate -- <task-folder>` to validate either stack type without launching Codex, changing package version, modifying working tree, or committing.

### Common grammar

Both stack types require:

- every `.txt` file in task folder is a prompt;
- filenames are canonical `P<number>-<lower-kebab-slug>.txt`, one-based/no-leading-zero, unique, contiguous from P1;
- every prompt contains exactly one literal `- Recommended configuration:` line with one backtick-delimited current `MODEL_CONFIGS` label and final period;
- exactly one prompt is closeout and it is final/highest-numbered;
- closeout classification requires both filename slug to contain a `closeout` segment and parsed `TASK:` title to contain word `closeout`; disagreement fails parsing;
- implementation prompt filename/TASK title must not signal closeout; body prose may mention closeout freely;
- closeout is parsed into plan but never executed by `codex:phase`; automation stops after implementation prompts.

### Roadmap phase stacks

- folder canonical lowercase `p<number>` with no leading zero;
- task header exactly `TASK: Phase <phase> / P<number> — <title>` and agrees with folder/filename;
- each prompt contains exactly one literal phrase `assigned project version is` followed by one backtick-delimited semantic version;
- parsed target equals `0.<folder phase>.<prompt number>`;
- roadmap prompt MUST NOT contain correction unchanged-version metadata.

### Non-versioned correction stacks

Correction stacks are for owner-approved bounded implementation gates/regressions/architectural corrections that need sequenced prompts and final manual closeout without consuming roadmap prompt versions.

- folder canonical `c<roadmap-phase>-<lower-kebab-slug>`, e.g. `c10-single-publication`; referenced phase provides context only;
- task header exactly `TASK: Correction <phase> / P<number> — <title>` matching folder numeric component;
- each prompt has exactly one `- Required unchanged project version: `<version>`.` line, every prompt in the stack declares the same version, and that version must equal `package.json` throughout execution;
- correction prompts MUST NOT contain `assigned project version is` metadata;
- correction P-numbers are local ordering and do not consume/reserve roadmap patch numbers;
- correction commit subjects identify the correction stack/prompt, e.g. `c10-single-publication/P1: <task title>`;
- correction closeout validates/clears only correction, does not invoke/substitute for `/closeout`, and does not advance package version.

Parser does not infer stack mode/model/version/order/closeout from free-form narrative prose. Machine-significant metadata must use explicit forms above.

Before `/prompt-write` reports either stack ready:

1. re-read current parser/runner if changed since planning;
2. verify folder against applicable machine grammar;
3. when repository execution available, run `npm run codex:phase:validate -- <task-folder>` and require green;
4. connector-only work performs equivalent parser-level source check and explicitly says it was source-validated rather than executed;
5. do not recommend automation while parser/validator inconsistency remains.

Runner fail-closed execution invariants: clean working tree, no `package-lock.json`, coherent `git diff --check`, actual implementation changes, clean single-successor prompt commit boundary. On a new invocation, the runner detects already completed implementation prompts from exact runner-owned commit subjects reachable from `HEAD`; unrelated committed history may appear before, between, or after those commits. Completion must be an unambiguous contiguous prefix from P1, and `package.json` must match that proven prefix (or the correction stack's unchanged version), otherwise execution stops before Codex starts. A new `.codex-runs` record marks history-detected prompts as `previously_completed` with their commit SHAs; old run metadata is not a completion source. The working tree must still be clean. Phase stacks also enforce the expected version chain from the resume point. Correction stacks enforce one unchanged package version before/after every prompt and commit.

## Prompt model/reasoning and usage selection

Every implementation and closeout task MUST carry an explicit recommended Codex model/reasoning configuration and token/credit-usage estimate. Model family and reasoning effort are separate dimensions; there is no repository-defined linear ladder such as `Terra Max` or `Sol Max`. Use `docs/codex-model-selection.md` for the detailed selection workflow.

Use exact model/reasoning labels currently available in the runner: `Luna Low`, `Luna Medium`, `Luna High`, `Terra Medium`, `Terra High`, `Terra Ultra`, `Sol Light`, `Sol Medium`, `Sol High`, and `Sol Ultra`. Never invent a name or assume a more expensive model is inherently the safer recommendation.

### Minimum-adequate usage-conservation rule

The objective is the **lowest expected total token/credit usage that still gives the task enough capability and reasoning headroom to be reliable**.

1. Establish the non-negotiable correctness floor from actual security, data-integrity, concurrency/transaction, architecture/blast-radius, failure-handling, and validation risk.
2. Start from the lowest-expected-cost current configuration that plausibly satisfies that floor; do not start from the strongest model and work downward.
3. Escalate model capability or reasoning effort only when a concrete task characteristic makes the cheaper configuration materially less reliable. Name that escalation trigger explicitly.
4. Compare expected total credits/usage, not model prestige or token count in isolation. Current official Codex rates and likely reasoning/output volume both matter.
5. Never reduce below the correctness floor merely to save usage; when the cheaper option creates material implementation/review risk, use the minimum higher configuration that removes that risk.

The following do **not** independently justify a higher rating: prompt length, phase number, number of acceptance criteria, size of the test matrix, the fact that production code is touched, or the general importance of the feature. Highly explicit prompts often need **less** reasoning because ambiguity has already been removed. A broad but mechanical validation/closeout task may consume many tokens while still needing only a workhorse model.

High-cost recommendations must therefore be earned by concrete evidence such as unresolved architectural choice, materially ambiguous contracts, difficult root-cause debugging, cross-cutting shared-state behavior, concurrency/transaction ownership, high-risk security boundaries, or review work that requires substantial independent inference. Failure or newly discovered ambiguity during execution should trigger a stop/escalation rather than pre-rating every task for a worst-case scenario.

### Complexity / quality classes

Complexity class describes the task's correctness/risk shape; it does **not** map mechanically to a model tier.

| Class      | Typical task shape                                                                                                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Standard` | Bounded implementation, leaf modules, straightforward migrations/repositories, deterministic tests, contained refactors. Expect the most economical adequate configuration.                                                                               |
| `Elevated` | Subtle validation/state behavior, security-sensitive narrow policy, meaningful persistence semantics, or difficult edge cases. Still prefer an economical workhorse when the behavior is explicit and bounded.                                            |
| `High`     | Cross-cutting integration, multiple interacting modules, concurrency/transaction ownership, shared infrastructure, high-risk security, or broad regression surface. A higher class permits escalation but does not itself prove that Sol/Ultra is needed. |
| `Critical` | Rare work combining several high-risk dimensions where the strongest available reasoning is materially justified. Treat this classification as exceptional and state why cheaper configurations are inadequate.                                           |

### Required usage estimate

`/prompt-ass` and `/prompt-plan` provide for each prompt:

- **Recommended configuration:** exact current model + reasoning choice.
- **Model-family basis:** why Luna, Terra, or Sol capability is needed.
- **Reasoning basis:** why the selected effort is needed independently of model family.
- **Complexity / quality floor:** `Standard`, `Elevated`, `High`, or `Critical`, with concise rationale.
- **Estimated usage:** `Low`, `Moderate`, `High`, or `Very High`.
- **Lower-cost alternative considered:** the most relevant cheaper configuration, or state that the recommendation is already the lowest adequate current option.
- **Escalation trigger:** the concrete reason the lower-cost alternative is inadequate; use `None` when no escalation was needed.
- **Efficiency rationale:** why this is the minimum adequate configuration rather than merely a safe/powerful choice.
- **Estimate confidence:** `Low`, `Medium`, or `High` when meaningful.

When current official OpenAI Codex token/credit rates are available, use them instead of stale repository numbers. Do not invent precise counts when uncertain. Reassess relative model pricing when it changes: a lower reasoning level on a more expensive-per-token model is not automatically cheaper than a workhorse model with more reasoning. Expensive recommendations MUST identify a specific lower-cost alternative and explain why it fails the task's actual correctness floor.

### Prompt/token discipline

Prompt quality does not require repeatedly restating the same contract. To reduce input usage while keeping tasks implementation-ready:

- reference governing contracts/ADRs by path and restate only the invariants that materially constrain this task;
- avoid duplicating the same requirement across Context, Constraints, Preserved behavior, Acceptance criteria, and Final report unless repetition prevents a real failure mode;
- inspect and list only the source/tests/consumers relevant to the task boundary rather than producing ceremonial exhaustive lists;
- keep tests explicit, but do not narrate identical test intent multiple times;
- distinguish iterative focused validation from final-tree validation rather than prescribing a full expensive suite for every implementation feedback cycle;
- final validation commands use the smallest non-overlapping set that covers the required evidence; do not list subordinate commands next to an aggregate command that already executes them unless repetition has a concrete diagnostic purpose;
- prefer concise implementation instructions over ornamental rationale once a decision is already governed;
- do not make a prompt longer merely to make the task appear safer or more sophisticated.

Correctness and validation requirements remain mandatory; this discipline removes redundancy, not evidence.

### Workflow ownership

- `/prompt-ass` starts from the lowest-cost plausible current configuration and escalates only with an explicit task-specific trigger. It records provisional task classification, model-family basis, reasoning basis, recommendation, complexity, usage, lower-cost alternative, escalation trigger/target, and rationale. It also identifies the focused iterative test boundary and the broader final regression/evidence boundary without duplicating contained command aliases.
- `/prompt-plan` is the final model gate after source-level investigation. It MUST reassess from observed source evidence, downgrade when investigation makes the task more bounded/explicit than provisionally assessed, and may upgrade only when newly observed complexity demonstrates that the cheaper configuration is inadequate. It records a `Downgraded`, `Unchanged`, or `Escalated` delta. It MUST trace current package scripts/runner containment so the planned final validation command set executes all required evidence once without redundant subordinate reruns.
- `/prompt-write` consumes the finalized `/prompt-plan` decision, validates its exact label against current `MODEL_CONFIGS`, writes the finalized minimum-adequate `MODEL / REASONING / USAGE` block, and keeps implementation prose concise under the token-discipline rules above. It MUST NOT speculate upward because of prompt length, importance, or validation volume. It MUST clearly separate focused development validation from final-tree regression validation and MUST NOT require overlapping final commands solely to reproduce the same evidence.
- Material boundary/quality change during revalidation returns `Planning needed` rather than silently changing approved implementation scope. A model-only downgrade under the same task boundary may be applied during explicit revalidation/owner-authorized task maintenance.
- `/revalidate` compares existing prompt/stack to current repo/contracts/model-usage/validation-efficiency policy and actively looks for safe downgrades, stale redundant validation commands, as well as necessary upgrades.
- Historical completed prompts may retain model/effort/validation wording in force when executed; unexecuted obsolete, over-provisioned, or materially redundant prompt instructions require revalidation before execution when governing policy has changed.

## Versioning and phase-prompt numbering

Project versions use `0.<roadmap phase>.<phase prompt number>` for roadmap phase stacks while pre-1.0.

- Prompt numbers one-based; `P0` not used.
- Roadmap task number maps to version patch number.
- `0.<phase>.0` is a non-terminal phase baseline established only by green `/closeout` from the prior roadmap phase or separately explicit owner-authorized `.0` transition.
- `package.json` is sole current-version authority; project intentionally has no npm lockfile.
- Version changes occur only through executed Codex roadmap prompt, non-terminal green `/closeout`, or separately explicit owner-authorized `.0` transition after prior phase closes.
- Terminal roadmap `/closeout` does not change `package.json`, create a successor baseline, or reserve a phase number.
- Non-versioned correction stacks MUST NOT change `package.json`; P-numbers are local sequencing only.
- Roadmap prompt reruns retain assigned version; correction reruns retain unchanged version.
- Roadmap prompts verify expected preceding/same-rerun version, update `package.json`, avoid lockfile, and validate versioned tree.
- Correction prompts state one required unchanged version, verify it, forbid changing it, avoid lockfile, and validate unchanged-version invariant.
- Roadmap closeout prompt that owns a version change commits it before final source SHA validation; later non-terminal `/closeout` performs separate next-phase `.0` transition. When that roadmap phase is terminal, `/closeout` performs verification only and preserves the final prompt-established package version.
- Correction closeout never transitions package version and is not automatically followed by `/closeout`.
- The completed Phase 10 singleton implementation correction is the historical first non-versioned correction stack.
- Parallel UI work is non-versioned, not a `codex:phase` stack, and MUST NOT modify package version or consume roadmap prompt numbers.

## `/prompt-ass`

Determine safe task boundaries from established behavior/contracts/roadmap. No writes.

Return target behavior, constraints, roadmap phase, stack type (`phase` or `correction`), prompt count/order, goal/summary/dependencies/boundary rationale/deferred behavior, closeout task when needed, and per-prompt provisional task classification, model-family basis, reasoning basis, model/effort recommendation, complexity/usage/lower-cost alternative/escalation trigger/target/confidence/rationale. For correction stacks, identify correction slug and package version that must remain unchanged from `package.json`.

Identify direct downstream consumers between planned prompts. When one proposed prompt combines a complex transactional/state-machine responsibility with a separately consumable read/service/API responsibility, explicitly determine whether those responsibilities should be split. Prefer separation when they have materially different consumers, test strategies, failure risks, or independently reviewable completion boundaries; do not substitute a stronger model for an oversized or incoherent task boundary.

Testing is part of task-boundary assessment: each prompt should own focused tests and appropriate broader regression impact without becoming monolithic. For any prompt that produces a boundary a later prompt will directly consume, include consumer-readiness testing in the producer boundary. Identify which commands are intended for fast iterative feedback versus final-tree evidence and avoid planning redundant aggregate/subordinate final execution.

For Phase 21 specifically, assessment begins from the accepted Phase 20 launched tree and its observed validation/operational evidence. Do not pre-fill a cleanup stack from earlier phases: identify only evidence-backed maintainability, ownership, dependency, resource-lifecycle, testing-structure, or measured performance problems, preserve the production-data compatibility ADR, and keep all new product capability outside the stack.

## `/prompt-plan`

Requires completed `/prompt-ass` in current conversation. Perform source-level planning for every assessed prompt: contracts/ADRs, implementation, schemas/migrations, process roles, helpers/consumers/tests/recent changes, likely file scope, preserved behavior, risks, focused tests, broader regression tests, required evidence levels, runtime/browser/database/fixture/live-Source validation, docs implications, acceptance criteria, non-goals.

For every direct producer → consumer dependency between planned prompts, inspect the downstream prompt/consumer expectations and record a handoff matrix in the form `downstream-required capability → owning implementation/export → focused proof`. The plan must establish that the later consumer can stay within its intended boundary without inventing producer-owned SQL/query composition, pagination/cursor semantics, domain transitions, topology/state inference, transaction behavior, validation policy, or equivalent upstream semantics. If that cannot be established without a material boundary revision, return `Planning needed` rather than deferring the missing design to the consumer.

Use observed source evidence to make the final model gate: reassess family, reasoning, complexity, usage, lower-cost alternative, escalation trigger/target, and rationale under the minimum-adequate usage-conservation rule, and record a `Downgraded`, `Unchanged`, or `Escalated` delta from `/prompt-ass`. Preserve the correctness floor, but do not retain an expensive provisional rating merely because it is safer in the abstract. Reconfirm stack type and correction unchanged-version invariant. Material boundary revisions produce `Planning needed`. No writes.

For validation planning, inspect current executable package scripts/runner behavior and produce the smallest non-overlapping final command set that covers the required evidence levels. Focused development commands may be narrower and repeated during iteration; they do not replace the final matrix.

For Phase 21, `/prompt-plan` is the decisive task-boundary gate: trace every proposed refactor through important producers/consumers and prove that it removes observed accidental complexity without changing governed product behavior. Persistence/schema proposals must include supported Phase 20-baseline upgrade/data-preservation evidence in addition to migration-from-zero. Optimization proposals require materially comparable before/after measurements rather than structural metrics alone.

## `/prompt-write <folder name>`

Requires completed unblocked `/prompt-plan`. Revalidate current repo/docs and write one ordered `.txt` per approved prompt under `docs/tasks/<folder name>/`.

Roadmap phase folders use `p<number>`. Correction folders use `c<roadmap-phase>-<lower-kebab-slug>`.

Each prompt includes the finalized `MODEL / REASONING / USAGE` block and its exact recommendation label MUST exist in current `MODEL_CONFIGS`. Roadmap tasks use assigned-version metadata; correction tasks use required-unchanged-version metadata. Do not upgrade only because prompt length, importance, or validation volume feels substantial.

When a prompt has a direct downstream consumer, the generated producer prompt MUST contain an explicit downstream handoff contract or equivalent acceptance gate derived from `/prompt-plan`. Before reporting the producer task complete, Codex must reread the relevant downstream consumer requirements, inventory every assumed capability, identify the concrete owning implementation/export and focused proof for each, and stop/report incomplete producer scope or planning drift if the consumer would otherwise have to invent producer-owned semantics.

Each prompt MUST distinguish focused iterative validation from final-tree validation. The final validation block MUST use the smallest non-overlapping command set established by `/prompt-plan`; do not list a subordinate check/suite alongside an aggregate command that already executes it on the same final tree unless the prompt states the concrete reason that repeated execution is required.

After writing, perform applicable runner prompt-file grammar check before reporting ready. If revalidation reveals materially changed boundary, stack type, unchanged-version invariant, quality floor, or validation containment, return `Planning needed` rather than silently changing approved plan. Do not overwrite existing tasks without explicit authorization.

Phase 21 prompts are behavior-preserving maintainability/optimization work only. They MUST identify the observed problem being removed, preserve the feature freeze and production-data compatibility boundary, forbid unrelated feature development, require the relevant blast-radius regressions, and require before/after measurements for any performance/resource claim.

## Supporting prompt commands

- `/prompt <task>` — one prompt in conversation only.
- `/stack <goal>` — legacy shorthand for `/prompt-ass`.
- `/split <task>` — narrow assessment shorthand.
- `/revalidate <task or stack>` — compare existing tasks to current repo/contracts/model-usage/validation-efficiency policy and report grammar/version/config adequacy/efficiency.

# Parallel UI workflow

The UI workstream is governed by `docs/design/README.md` and `docs/design/ui-workflow.md`. It exists so presentation work can proceed independently from roadmap/correction implementation without sharing a worktree or consuming roadmap versions.

`main` remains the authoritative integration branch. `ui-polish` is the permanent presentation branch. UI implementation MUST use a separate worktree when roadmap/correction runner work is active. Before each new UI task, refresh remote state and incorporate current `main` into `ui-polish` using a non-destructive strategy; if relevant main changes invalidate the planned task boundary, re-plan. Do not force-update shared history merely to synchronize the UI workstream, and do not merge `ui-polish` into `main` automatically.

The normal implementation path is:

```text
/ui-plan <task>
→ /ui-write <lower-kebab-slug>
→ execute the single prompt in the ui-polish worktree
→ review and validate
→ integrate when accepted
```

If `/ui-plan` determines durable design guidance is missing, contradictory, materially ambiguous, or must change, the required path is:

```text
/ui-plan <task>
→ Planning needed: UI design guidance required
→ /ui-review <area>
→ explicit approval
→ /ui-apply
→ /ui-plan <task>
→ /ui-write <lower-kebab-slug>
→ execute/review/validate
```

A previous blocked `/ui-plan` does not authorize `/ui-write`; planning must be rerun after the approved design-guidance change.

## `/ui-review <area>`

Read-only design-guidance review. It is the UI counterpart to `/docs-review`, but it is conditional rather than a required preflight for every UI task.

Review the relevant non-task design documents under `docs/design/`, the narrowest higher-authority product/domain/testing documents, and current UI implementation/observable presentation where needed. Do not perform an indiscriminate full-repository documentation review.

Return at minimum the interpreted design scope, reviewed/excluded design docs, existing relevant presentation rules, missing/ambiguous/contradictory/stale guidance, higher-authority conflicts, material implementation/design drift, recommended design-doc changes, application order, and decisions requiring explicit owner approval.

`/ui-review` never modifies files, source, branches, project version, or roadmap state.

## `/ui-apply`

Requires an approved `/ui-review` change group in the current conversation.

Before editing, re-read the approved target design documents and relevant higher-authority guidance, and confirm branch/source drift has not invalidated the review. Apply only the explicitly approved design-document changes on `ui-polish`.

`/ui-apply` may create or update substantive design guidance under `docs/design/`, excluding `docs/design/tasks/`. It MUST NOT implement source/UI changes, create implementation prompts, modify `docs/design/tasks/`, change product/domain contracts unless separately authorized through the normal documentation workflow, change package version or roadmap/correction state, merge branches, or invoke `codex:phase`.

After `/ui-apply`, the next implementation command is `/ui-plan` again, not `/ui-write`.

## `/ui-plan <task>`

Read-only normal entry point for one targeted UI implementation task. It combines task-boundary assessment with source-level planning and decides whether durable design review/application is required first.

Before planning:

1. read `BOOT.md`;
2. read `docs/design/README.md` and `docs/design/ui-workflow.md`;
3. read the narrowest governing product/design/testing contracts;
4. inspect current relevant `ui-polish` implementation, tests, and recent changes;
5. inspect relevant drift from current `main` when branch freshness could affect the task.

Return at minimum task goal/UI-workstream fit, current and desired presentation behavior, governing approved design guidance, whether existing design guidance is sufficient or `/ui-review` → `/ui-apply` is required, likely/allowed file scope and shared-file boundaries, preserved contracts/behavior, forbidden backend/domain changes, responsive/accessibility considerations, focused and broader/browser tests, runtime/browser evidence needed, acceptance criteria/non-goals, one recommended lower-kebab slug, and recommended configuration/complexity/usage/lower-cost alternative/escalation/efficiency/confidence using the repository minimum-adequate usage-conservation policy.

If design guidance is missing/conflicting/materially ambiguous or must change, return `Planning needed: UI design guidance required` and identify the required `/ui-review` area. If a required backend/domain behavior change or unsafe branch drift is discovered, return `Planning needed` and route/split the work appropriately. `/ui-plan` never writes.

## `/ui-write <lower-kebab-slug>`

Requires a completed unblocked `/ui-plan` in the current conversation. Re-read relevant `ui-polish` source/docs/tests and relevant `main` drift before writing.

Write exactly one implementation-ready prompt under `docs/design/tasks/<lower-kebab-slug>.txt`. Do not overwrite an existing UI task without explicit authorization.

The prompt MUST identify `Workstream: UI`, require execution on `ui-polish`, preserve `package.json` version and roadmap state, identify governing contracts/design docs/source, state allowed/forbidden files and behavior, include finalized model/reasoning/usage guidance, define focused and broader/browser validation, and prohibit unrelated cleanup, roadmap advancement, phase/correction closeout, or automatic merging.

`/ui-write` writes only the approved UI prompt. It does not run Codex, invoke `codex:phase`, implement source, modify project version, advance roadmap state, merge branches, or create/modify durable design guidance. If missing/contradictory design guidance is discovered during revalidation, return `Planning needed` and route through `/ui-review` → explicit approval → `/ui-apply` → rerun `/ui-plan`.

The accepted Phase 13 public-presentation implementation is the integrated presentation baseline. Later presentation-only refinements may continue through this UI workflow, but roadmap-owned administration and its domain behavior must not be recast as generic parallel UI work.

# Review and validation commands

- `/review <commit, PR, task, implementation>`
- `/prove <behavior>`
- `/test-matrix <feature>`
- `/collector-check <source or collector>`
- `/dedupe-check <rule or case>`

Honor current contracts, state separation, security, provenance, idempotency, failure isolation, feed eligibility, and testing contract. Reviews distinguish inspection from executed evidence.

# Decision commands

### `/lock <decision>`

Treat decision as authoritative direction and identify affected contracts/ADRs/root/task docs. Do not modify files unless instructed. Locked-law amendments use project-contract process.

### `/recommend`

Choose best option using contracts, architecture, roadmap, user value, security/reliability, implementation risk.

### `/status`

Return only: Completed / Current / Blocked / Next.

### `/next`

Recommend the single most logical next task.

# Command modifiers

`--deep`, `--quick`, `--docs-only`, `--code-only`, `--no-write`, `--prompt-only`, `--file-scoped`, `--regression-safe`, `--latest`, `--browser`, `--db`, `--tests`, `--contracts`, `--sources`, `--dedupe`, `--security`, `--reassess`.

# Codex prompt requirements

Finished implementation prompts normally include Task, Context, Current/Required behavior, roadmap phase, stack type, finalized `MODEL / REASONING / USAGE` block, governing contracts/ADRs/laws, inspected source, allowed/forbidden files, constraints, preserved behavior, applicable security/provenance/idempotency/failure-isolation implications, risks, focused tests, broader regression tests, required evidence levels, runtime/browser/database/fixture/live-Source validation, docs updates, acceptance criteria, and non-goals.

For a prompt that produces a boundary explicitly consumed by a later planned prompt, include a downstream handoff contract or equivalent completion gate. The producer prompt must make the handoff auditable as `downstream-required capability → owning implementation/export → focused proof`, require the implementation to reread the downstream consumer requirements before declaring completion, and fail closed when that consumer would otherwise need to invent producer-owned query/SQL, pagination/cursor, domain/state, transaction, validation, topology, or equivalent semantics.

Machine-significant fields are stricter than prose. Every roadmap/correction task uses canonical folder/filename numbering, one canonical `TASK:` header, one exact recommended-configuration line, and filename-plus-`TASK:` closeout convention. Roadmap prompts additionally use exactly one `assigned project version is ...` phrase. Correction prompts instead use exactly one required-unchanged-version line and MUST NOT use assigned-version metadata. Targeted UI prompts under `docs/design/tasks/` are outside this parser grammar and follow `docs/design/ui-workflow.md` instead.

Every implementation prompt inherits testing contract. Tests are not optional cleanup; prerequisites cannot silently skip green; claims cannot exceed evidence. Prompts distinguish focused iterative validation from final-tree validation and use the smallest non-overlapping final command set that covers all applicable evidence.

Collection prompts preserve singleton Publication global collection-active state, Source/endpoint approval/lifecycle/operational boundaries, truthful Collection runs, pre-request network safety, run isolation, retry limits, Source-domain policy, optional Source RSS/Atom item admission before normalization, and deterministic collection tests without safety bypasses. They do not add Publication selectors/tenant scopes or conflate Source admission mismatches with Relevance exclusions/Article observations.

Persistence/identity prompts preserve Source-scoped Article identity, canonical Relevance ordering, transactional idempotency, Article observations, real-PostgreSQL constraints/concurrency/migration behavior where applicable, and rollback. Publication tenancy is not introduced as future-proofing. After the Phase 20 production baseline, persistence/schema prompts additionally preserve supported customer data and prove the applicable real upgrade path under `docs/decisions/production-data-and-schema-compatibility.md`; clean migration-from-zero alone is not sufficient production-upgrade evidence.

Publication/Relevance prompts preserve topic independence, singleton Publication configuration, immutable installation-wide Category/rule configuration keys, the bounded literal predicate vocabulary, installation-wide plus Source-scoped deterministic precedence, additive categorization/default fallback, pre-identity `excluded` accounting, prospective-by-default edits, and the full Phase 11 deterministic/real-PostgreSQL validation matrix. They do not create Publication tenant FKs/scopes or generic ranking/expression engines.

Duplicate prompts preserve every Article/observation, exactly one Primary/group, review-state persistence, false-positive safeguards, manual reversibility, and regression corpus coverage; duplicate state is installation-wide.

Public-feed prompts preserve singleton public exposure, Source approval/lifecycle trust, Article visibility + ungrouped-or-Primary eligibility, deterministic published-at/first-seen semantics, bounded safe output, and stored `original_url`. Routing is `GET /` and `GET /api/feed`; no Publication selector/scoping argument.

UI prompts preserve the same public-feed/domain behavior while changing approved presentation. Shared frontend/runtime files may be changed only when explicitly planned; material backend/domain changes are routed out of the UI workstream. UI prompts never change project version or roadmap state.

Admin prompts preserve Cloudflare Access/origin protection, request integrity, real resource-relationship/domain-invariant validation, singleton Publication configuration, Source-owned include-only RSS/Atom admission semantics where applicable, and prohibition on unnecessary native identity/account work, multi-Publication selectors, or Publication tenant authorization.

Phase 21 prompts preserve the complete launched product behavior and supported production data while removing observed accidental complexity or measured inefficiency. They do not add deferred features, do not use arbitrary structural-reduction quotas as acceptance criteria, and require comparable before/after evidence for performance/resource claims.

Historical Phase 10 singleton-correction prompts established the smallest canonical migration-from-zero schema, deleted/squashed/replaced superseded pre-production migrations, removed Publication tenancy/selectors and legacy-only compatibility source/API/type/test/fixture/config paths throughout the active tree, and required database/regression/browser proof before correction closeout. Do not reintroduce that superseded compatibility surface.

# Repository modification rules

- Do not modify/commit unless authorized by current request/command.
- `/closeout` performs bounded handoff/terminal verification; on a green non-terminal phase it performs only the version-only `package.json` successor-baseline transition, while on the final documented roadmap phase it performs no repository write and reports roadmap completion.
- A correction stack's final manual closeout validates/clears correction while preserving unchanged package version/active phase.
- `/docs-review` never writes.
- `/docs-apply` writes only approved docs; invocation authorizes documentation-only changes on `main` unless branch/PR/isolation is requested.
- `/docs-prompt` never writes repository files; from an approved docs review and supplied docs snapshot, it emits only one docs-only Codex implementation prompt.
- `/prompt-ass` and `/prompt-plan` never write.
- `/prompt-write` writes only approved task files in established phase/correction folder.
- `/ui-review` never writes.
- `/ui-apply` writes only approved substantive design guidance under `docs/design/` excluding `docs/design/tasks/`, on the `ui-polish` workstream; it does not implement source, write prompts, change version/roadmap state, or merge branches.
- `/ui-plan` never writes.
- `/ui-write` writes only the approved single UI prompt under `docs/design/tasks/` on the `ui-polish` workstream.
- UI implementation is non-versioned: it MUST NOT change `package.json` version, consume roadmap prompt numbers, advance roadmap/correction state, or create a phase/correction closeout.
- Do not run UI implementation in the same working tree used by an active phase/correction runner; keep concurrent work isolated on `ui-polish`/its worktree.
- Do not merge `ui-polish` into `main` automatically; integration requires review and explicit authorization.
- Documentation/prompt/review activity, including `/docs-prompt`, does not change package version or roadmap/correction/UI state except for an explicit non-terminal `/closeout` baseline transition; correction execution, terminal `/closeout`, and UI work are non-versioned.
- No task writes while `Planning needed` remains unresolved.
- No speculative compatibility bridges or permanent dual schemas.
- Before production compatibility is established, delete legacy-only migration/code/API/type/test/fixture/configuration artifacts rather than preserving superseded pre-production behavior in the active tree.
- After the accepted Phase 20 production baseline, preserve supported customer data and supported migration upgradeability under `docs/decisions/production-data-and-schema-compatibility.md`; do not use the earlier destructive-reset rule for customer production state.
- No topic conditionals in shared engine code.
- No concurrent multi-topic/multi-Publication hosting behavior inside one installation unless later explicit locked contract/ADR authorizes it.
- Do not introduce relational Publication tenancy, IDs, slugs, FKs, uniqueness scopes, selector parameters, or authorization scopes solely because concurrent hosting might be useful someday.
- Do not remove singleton Publication editorial/configuration behavior or genuine Source/endpoint/run/Article/observation integrity while removing tenancy plumbing.
- No public/Worker/bootstrap runtime Publication selector whose purpose is choosing among topics in one installation.
- No Source/endpoint approval/state bypass or silent whitelist expansion.
- No parser-to-Article direct persistence.
- No Web/API inline Source fetching.
- No bypass of Relevance boundary even before configurable rules exist.
- No Phase 11 Relevance path that runs after identity merely to make exclusion easier; excluded candidates terminate before identity under the governing contract.
- No automatic historical Article mutation caused merely by editing a Relevance rule.
- No deletion of Article/observation provenance because duplicate suppression exists.
- No weakening identity/duplicate/security/testing boundaries to make tests pass.
- No silent-green required suite caused by missing prerequisites, skipped coverage, or zero matches.
- No MVP native administrator account/session/role subsystem unless explicitly promoted.
- Search all references before renames.
- Do not report tests/runtime/browser/database/live-Source behavior as verified unless observed at appropriate evidence level.
- Do not create PRs, merge, force-update history, or perform non-document history changes unless explicitly instructed.
- Preserve smallest viable diff for scoped fixes.

# Pre-production compatibility rule

Prefer one canonical design. Do not add old/new aliases, duplicate synchronized fields, fallback paths, dormant tenant columns, or speculative migration compatibility. Before production database compatibility is established, databases created by older source trees are disposable and the active migration/runtime/test/config tree MUST be reduced to the smallest current canonical design. Delete/squash/replace legacy-only migrations, compatibility wrappers/APIs/types, obsolete tests/fixtures, slug-addressed public/runtime routing, Publication-scoped repository APIs, and obsolete configuration paths when they have no independent current purpose. Historical implementation detail remains available in Git history, superseded ADRs, historical task prompts, and validation artifacts instead of active compatibility machinery.

This rule governs only the pre-production lifecycle. It MUST NOT be extended to accepted customer production state after the Phase 20 production baseline.

# Production compatibility rule

Phase 19 establishes and validates the upgrade/backup/restore/rollback procedures required for production. Acceptance of Phase 20 customer launch establishes the first supported production source/version/schema baseline. From that point forward, normal upgrades/refactors preserve supported customer data and governed relationships, supported production migration history remains upgrade-capable, and clean migration-from-zero is required for new/disposable installations but does not substitute for production-upgrade proof. Detailed authority is `docs/decisions/production-data-and-schema-compatibility.md`.

Phase 21 operates entirely under this production compatibility rule. It may simplify source structure aggressively where safe, but it may not destroy the launched customer database or rewrite supported migration history merely to make the final schema appear cleaner.

# Boot maintenance

Update BOOT when phase, core paths, terminology, commands, authority, locked laws, modification conventions, task-stack grammar, UI-workstream workflow/branch rules, versioning/prompt-numbering conventions, branch, repository identity, critical delivery ordering, foundational security/deployment/data-model decisions, production-compatibility boundaries, or project-wide testing/validation policy changes.
