# Project Contract

**Status:** Locked baseline  
**Platform:** Reusable News Aggregation and Distribution Platform  
**Repository:** `jfin602/news-scraper`  
**Initial Publication:** Indie-author publishing industry news  
**Established:** 2026-08-06  
**Product-direction amendments:** 2026-08-19 and 2026-08-20

## Product definition

The system is a reusable, topic-independent **headless news aggregation and distribution Platform**. It collects Article metadata from administrator-approved Sources, normalizes that metadata, persists Source instances idempotently, suppresses true duplicates without destroying provenance, and exposes governed normalized Article output for downstream consumers while preserving the original publisher destination.

The Platform core is the collection, normalization, persistence, editorial/moderation, and distribution system. The protected administrator surface is its control plane. A bundled first-party public feed may consume the same canonical outward read semantics as a reference/standalone frontend, but that frontend is not the identity of the aggregation engine and downstream websites do not need to adopt its presentation.

The indie-author Publication is the first configuration of the Platform, not the identity of the aggregation engine. Reuse occurs by configuring and deploying another installation of the same codebase for another topic; one deployed installation does not concurrently host multiple topic Publications.

The approved 2.0 contracts now define Distribution Profile selectors/lifecycle, the permanent v1 machine API, machine authentication, generic PHP synchronization/cache behavior, link/SEO limits, telemetry, and the Linux VPS/Docker Compose evaluation route. They remain unimplemented. WordPress, RSS/Atom, native self-host admin authentication, and autonomous public self-host production readiness are post-2.0.

## Locked project laws

1. **The aggregation engine must never contain indie-author-specific business logic.**
2. **Every collected Article must originate from an administrator-approved Source.**
3. **RSS or other structured feeds are preferred over HTML scraping.**
4. **The original Article URL remains the primary public/outward reader destination.**
5. **All Source-specific data must be normalized before reaching any public or distribution consumer.**
6. **Repeated collection must be idempotent and must not create duplicate Article records.**
7. **True duplicates are hidden behind one Primary Article in ordinary outward output, but all Source instances remain stored.**
8. **Categories, Relevance rules, branding, and Sources belong to Publication configuration.**
9. **A failing Source must not interrupt collection from other Sources.**
10. **Near-real-time means configurable polling unless a Source explicitly supports push delivery.**
11. **Each deployed installation hosts exactly one Publication/topic. Topic independence means the same shared codebase can be configured and deployed for different topics without topic-specific engine changes; it does not mean one installation concurrently hosts multiple Publications. The Platform's primary product boundary is the governed collection, normalization, persistence, editorial control, and distribution of normalized Article metadata. Supported outward consumers must reuse canonical distribution eligibility/selection semantics rather than introduce competing Article-selection authorities. A bundled first-party public frontend may consume that same boundary but is not the aggregation engine's primary product identity.**
12. **News Scraper must remain deployable as a complete, independently operable single-Publication stack. The managed service is one deployment model of that same stack, not a separate cloud-dependent product architecture. The managed product is the self-hostable product operated on the customer's behalf. Customer installations must not require a central News Scraper service for ordinary collection, administration, persistence, moderation, or distribution.**
13. **Customers must retain maximum practical control over presentation of distributed Article data. First-party rendering integrations must provide a safe, functional fallback presentation while also exposing stable extension points or normalized distribution data that allow the customer to replace or bypass the default markup and build a custom presentation without reimplementing collection, eligibility, moderation, duplicate suppression, or Distribution Profile semantics.**

## Derived invariants

- Collector code operates on generic Sources, endpoints, candidates, Articles, observations, Duplicate groups, singleton Publication configuration, and topic-independent outward read semantics.
- A deployed installation has one Publication configuration as its application-level editorial/topic boundary; ordinary runtime flows do not select a Publication.
- Publication is not a tenancy or relational ownership key. Publication UUIDs, slugs, foreign keys, joins, uniqueness scopes, API parameters, or compatibility paths MUST NOT be retained solely for hypothetical concurrent multi-Publication hosting.
- The singleton Publication configuration owns installation-wide editorial settings such as name, collection/public state, branding, Categories, Relevance rules, Sources, Source priority, and presentation/distribution settings when those settings are explicitly implemented, without requiring those resources to carry a Publication foreign key.
- Real domain relationships remain explicit: a Source owns endpoints and Articles; an endpoint owns Collection runs; observations preserve the endpoint/run and Article/Source provenance needed for integrity.
- A Source or endpoint cannot be collected while unapproved, archived, paused, or disabled, and global collection is disabled when the singleton Publication configuration is not active for collection.
- Approval/trust, configuration lifecycle, operational state, outward visibility, moderation, duplicate role, distribution selection, and derived health are distinct concepts.
- **Collection trust and distribution selection are separate concerns.** Source approval authorizes governed collection/trust; it does not by itself require every downstream consumer to receive or advertise every eligible Article from that Source.
- Public/outward records are created only from normalized data.
- Fetching the same unchanged Source repeatedly produces no additional logical Article.
- Article identity and true-duplicate grouping are separate concerns.
- Source failures are isolated by Source endpoint and Collection run.
- Duplicate suppression never destroys Article instances or provenance.
- Topic-specific settings are data/configuration, not topic conditionals in shared engine code.
- Any outward adapter or integration that presents ordinary Article results MUST consume one governed Article-selection/read boundary for eligibility, ordering, moderation, duplicate suppression, and stored `original_url` destination semantics rather than reimplementing those rules independently.
- The existing `GET /api/feed` JSON endpoint and bundled `GET /` reference frontend remain supported current consumers of the canonical public/outward read semantics. Their existence does not require future client sites to use the bundled frontend.
- Managed and future self-hosted deployments are modes of the same complete, independently operable single-Publication stack; the approved architecture does not claim self-host packaging is implemented today.
- Managed customer instances keep configuration, secrets, editorial/persistence state, jobs, human access, and machine credentials independently bounded even when physical infrastructure is shared; this isolation MUST NOT be modeled as relational customer/Publication tenancy.
- The instance-owned control plane remains authoritative for collection, editorial/moderation, operational configuration, and Distribution Profiles.
- Distribution Profile selection occurs after canonical outward eligibility and can only narrow it. All serializers and adapters consume that same profile/read-model authority.
- PHP, WordPress, RSS/Atom, and custom integrations are thin consumers, never competing editorial or eligibility authorities.
- Customers control integration presentation; safe first-party templates are fallbacks, not mandatory markup.
- Ordinary collection, administration, persistence, moderation, and distribution MUST NOT depend on a mandatory central News Scraper cloud service.
- Polling-only Sources are not described as literally real-time.
- Network-safety validation occurs before each outbound request/redirect; Article-link validation occurs after parsing/normalization before acceptance.
- Before production database compatibility is established, pre-production architecture favors the smallest canonical model for supported behavior. Migration files, source files, APIs, types, tests, fixtures, configuration paths, and compatibility layers that exist only to support superseded pre-production architecture MUST be removed rather than retained for historical compatibility or speculative future use. Git history, superseded ADRs, historical task prompts, and validation artifacts preserve that history.
- Before production database compatibility is established, the supported persistence setup is a fresh database built from the repository's current migration chain and bootstrap/configuration data. In-place preservation of data created by older pre-production source trees is not a product requirement.
- Phase 19 establishes and validates production backup/restore, deployment/rollback, and schema-upgrade procedures; acceptance of Phase 20 customer launch establishes the first supported production schema/data baseline.
- From the accepted Phase 20 production baseline forward, customer production data is durable supported state. Normal upgrades and refactors MUST preserve governed persisted data and relationships, and supported production migration history MUST remain capable of upgrading supported deployed state. Clean migration-from-zero remains required for new/disposable installations but does not by itself prove production upgrade safety. Detailed lifecycle and migration requirements are governed by `docs/decisions/production-data-and-schema-compatibility.md`.

## Authority order

When repository sources conflict:

1. Locked project laws in this document.
2. Explicit invariants in this document.
3. Domain and lifecycle contracts.
4. Architecture, interface, security/operations contracts, and Accepted ADRs.
5. Current roadmap and implementation notes.
6. Root `AGENTS.md`, `README.md`, and `BOOT.md` summaries/routing.
7. Existing implementation.
8. Historical task prompts.
9. Comments, commit messages, and stale planning notes.

A current user instruction controls requested task scope. If it proposes changing a locked law, treat it as a contract-change request rather than allowing lower-authority work to override this document silently.

Existing code does not become authoritative merely because it already exists.

## Contract change process

A locked law may change only through an explicit project decision that:

- identifies the exact law being amended;
- explains the product reason;
- documents compatibility/migration effects;
- updates every affected contract;
- adds or supersedes an ADR when a foundational architectural decision changes;
- is intentionally accepted by the repository owner.

Ordinary implementation work must not weaken a law indirectly.

### 2026-08-19 product-direction amendment

The repository owner explicitly amended Law 11 after the original client identified integration with an existing website and cross-source outbound-link distribution as the primary product use case. This amendment changes the product/output boundary from "standalone public website as the product" to "headless collection/control/distribution core with supported consumers." It does not change the one-Publication-per-deployment data model, Source trust law, normalization/idempotency/provenance/deduplication laws, original-publisher destination rule, or supported production-data boundary.

The foundational architecture rationale is recorded in `docs/decisions/headless-distribution-product-boundary.md`.

### 2026-08-20 managed-first/self-hostable distribution amendment

The owner added Laws 12 and 13 to lock complete-stack portability and customer presentation freedom. The architectural rationale is recorded in `docs/decisions/managed-first-self-hostable-distribution-architecture.md`; behavioral distribution authority is `docs/contracts/distribution-and-integration-contract.md`. This amendment preserves Laws 1–11 and does not assert that future adapters or self-host packaging are implemented.

## Product boundaries

### The Platform is

- a controlled-Source Article-metadata aggregator and distribution core;
- a reusable shell for different subject areas through separate configured deployments;
- a single-Publication collection/editorial domain with an administrative control plane per deployment;
- a managed-first, self-hostable-by-design complete stack whose customer instances remain independently bounded;
- a system that exposes governed normalized outward Article data to supported consumers/integrations;
- a collection system with observable endpoint health and duplicate handling;
- optionally a standalone/reference public discovery feed through the bundled first-party frontend.

### The Platform is not

- a requirement that the customer's public website be hosted or visually controlled by News Scraper;
- a multi-topic/multi-Publication host within one deployed installation;
- an unrestricted web crawler;
- a full-content republishing system;
- an open-web search engine;
- a social network/commenting Platform;
- an automated plagiarism/copyright-ownership judge;
- a guarantee that every Source update is delivered instantly;
- a guarantee that any integration or backlink pattern provides SEO value; the distribution contract permits only the bounded technical claim of crawlable server-rendered direct publisher links.
- a conventional multi-tenant SaaS or a detached self-hosted frontend dependent on a mandatory central engine.

## Historical MVP Phase 0 acceptance criteria

The original MVP Phase 0 was accepted when:

- foundational laws were represented consistently in repository docs;
- terminology was topic-independent and internally consistent;
- MVP scope/exclusions were explicit;
- singleton Publication configuration plus Source, endpoint, Article, observation, and duplicate relationship boundaries were defined;
- collection and Article lifecycles had no contradictory state models;
- public-feed eligibility and admin requirements were explicit;
- security, reliability, and observability baselines were defined;
- implementation phases had measurable, internally consistent completion gates.

This historical acceptance section does not define the current post-1.0 roadmap state.
