# Product Scope and Users

**Status:** Current post-1.0 product scope  
**Adopted:** 2026-08-19  
**Historical MVP scope:** `docs/contracts/mvp-scope-and-users.md`

## Product objective

News Scraper is a reusable, topic-independent **headless news aggregation and distribution Platform**.

Its primary job is to:

1. collect Article metadata from administrator-approved Sources;
2. normalize Source-specific input into one governed Article model;
3. persist Articles idempotently with provenance;
4. apply deterministic editorial/Relevance/Category rules;
5. detect and suppress true duplicates without deleting Source instances;
6. give operators an administrative control plane for Source, Article, duplicate, health, and Publication configuration; and
7. expose governed normalized Article output to supported downstream consumers while preserving the original publisher destination.

The bundled first-party public feed remains a supported reference/standalone consumer of the same outward read semantics. It is not the defining product boundary, and a client may instead integrate the Platform's distribution output into an existing website or other supported consumer.

A deployed installation hosts exactly one Publication/topic. Topic independence is a reusable-code/configuration property, not a requirement for one live installation to host multiple selectable Publications or carry dormant tenant keys throughout persistence.

## Primary users

### Publication administrator/operator

An authorized operator controls the installation's collection and editorial state, including:

- singleton Publication name, branding, public/reference-frontend state, and collection state;
- approved Sources/endpoints and their operational states;
- polling frequency;
- Categories and deterministic Relevance rules;
- Source priority;
- Article visibility/display overrides/categories;
- Duplicate review/group corrections;
- Source/endpoint health and Collection-run history;
- implemented Distribution Profile configuration: persisted Profiles with immutable keys, mutable display names, lifecycle, bounded result/history limits, Source associations, bounded association filters, protected administration, and transactional change history.
- implemented Distribution Credential administration: protected create/list/rotate/revoke controls with labels and lifecycle metadata, one-time plaintext issue/rotation behavior, and strict separation from human administrator authority.

The administrator surface is the instance-owned Platform control plane. Current managed/reference administrative routes remain protected by Cloudflare Access under the accepted admin-perimeter ADR. Future self-hosted deployments require a governed secure perimeter, but Cloudflare is not a universal runtime dependency.

### Website/CMS integrator

An integrator wants to consume a governed stream of normalized Articles and render it inside an existing website, CMS, publication section, or other supported delivery surface without reimplementing collection, Source trust, duplicate suppression, moderation, or Article-selection logic.

The integrator should be able to rely on stable outward semantics for:

- Article identity exposed for integration purposes;
- effective feed date/order;
- display headline;
- Source identity;
- stored `original_url` as the reader destination;
- ordinary visibility/duplicate suppression;
- explicitly supported filters/distribution selection;
- bounded safe metadata made public by the relevant outward contract.

The required 2.0 integration is the authenticated versioned distribution API plus scheduled generic PHP synchronization, validated last-known-good local data, and server-rendered customer output. Custom server applications may consume the same API. WordPress and RSS/Atom are planned post-2.0 adapters; browser widgets are outside 2.0.

### Operator/developer

An operator/developer needs telemetry to diagnose Source failures, parser changes, delayed collection, identity behavior, duplicate decisions, failed jobs, and outward-delivery failures without manual database inspection.

### Reference-frontend reader

A public reader may still use the bundled first-party `/` feed when a deployment exposes it. That reader experience remains supported, but it is a consumer of the Platform core rather than the product's primary architectural identity.

## Core product capabilities

### Collection engine

The Platform continues to provide:

- approved-Source RSS/Atom collection;
- bounded optional Source RSS/Atom item admission filtering;
- configurable static HTML listing extraction where configured;
- conditional HTTP fetching where supported;
- configurable polling;
- pre-fetch/redirect SSRF and approved-domain validation;
- normalized Article candidates;
- Article observation provenance;
- idempotent Source-scoped Article identity/persistence;
- conservative duplicate detection/grouping;
- isolated Source failures;
- bounded retry/backoff;
- Collection metrics and structured error records.

### Editorial and moderation control plane

The Platform continues to provide:

- Publication configuration;
- Source/endpoint lifecycle, approval, operational state, domain policy, and health controls;
- Category and Relevance management;
- Article visibility/display/category moderation;
- Duplicate review/group/Primary controls;
- bounded change history;
- operational collection visibility.

### Canonical outward Article semantics

All supported outward consumers must reuse one governed selection/read boundary rather than reimplementing eligibility independently.

At minimum, ordinary outward output preserves:

- singleton Publication exposure/configuration rules appropriate to the selected outward surface;
- Source approval/lifecycle trust gates;
- Article visibility;
- duplicate suppression to ungrouped Articles plus the Primary member of a true Duplicate group;
- deterministic effective-feed-date ordering where chronological output is used;
- stored `original_url` as the reader destination;
- bounded, normalized, escaped/safe public metadata;
- topic independence.

The existing `GET /api/feed` and bundled `GET /` reference frontend are current consumers of these semantics. Future distribution adapters must consume the same authority rather than introducing adapter-specific Article SQL, duplicate rules, moderation rules, or destination rewriting.

### Distribution configuration boundary

Collection trust and distribution selection are separate concerns.

A Source being approved means it may participate in governed collection and ordinary outward eligibility. It does not automatically mean every future downstream integration must receive every Article from that Source.

A Distribution Profile is a named administrator-controlled outward selection over already canonically eligible Articles. One Publication may have multiple profiles without becoming relational tenancy. Profile selection can only narrow eligibility; its lifecycle, Source associations, and bounded filters are governed by `distribution-and-integration-contract.md`. The permanent wire/auth contract is `distribution-api-contract.md`.

Phase 3 implemented the reusable machine credential/authentication/security foundation required by the permanent machine API. It is separate from human administrator authority and does not yet expose the v1 HTTP interface.

### Deployment architecture

Managed integration is the required 2.0 operating path. News Scraper remains self-hostable by design under the Project Contract and managed/self-hostable ADR, but packaging that complete stack into a lightweight Linux VPS/Docker Compose installation is post-2.0 work. Native/default self-host administrator authentication and autonomous public self-host production readiness are likewise post-2.0.

Deferring packaging does not permit a mandatory central News Scraper dependency or weaken instance isolation. It only removes self-host productization from the 2.0 release gate so the managed Profile/API/PHP integration can be validated first.

### Presentation ownership

News Scraper owns governed Article selection, normalized output, and `original_url` semantics. Customers may own and replace HTML, CSS, typography, layout, responsive behavior, placement, and custom UI. First-party PHP/WordPress templates are safe functional fallbacks, not mandatory presentation.

## Initial Publication configuration

The first deployment remains publishing-industry news relevant to independent authors. Its Sources, Categories, Relevance rules, branding, admission phrases, and editorial decisions are configuration rather than shared-engine behavior.

The original client now intends to integrate collected news into an existing website and explore lawful/appropriate cross-source outbound-link distribution. That client use case motivates the current product-direction change but MUST NOT become indie-author-specific shared-engine behavior.

## 2.0 scope boundary

`2.0.0` proves the managed Profile → authenticated v1 API → generic PHP complete-snapshot sync → atomic last-known-good cache → customer-style server-rendered integration path. It includes the operational distribution telemetry, production migration/backup compatibility, and real managed failure/reliability proof needed to support that path.

WordPress, RSS/Atom, Linux VPS/Docker Compose self-host packaging, native/default self-host administrator authentication, production-grade autonomous public self-hosting, SSO/multi-admin identity, visitor/click/referral/backlink analytics, advanced SEO tooling, browser widgets, Kubernetes/multi-node deployment, delta synchronization, and additional adapter families are post-2.0. News Scraper guarantees neither SEO nor backlink performance.

The seven-phase 2.0 implementation roadmap is active under `docs/roadmap/post-1.0-roadmap.md`; Phases 1–3 foundations are implemented: Distribution Profiles, the canonical distribution/Profile read model, and machine credential/authentication/security. The permanent distribution HTTP API is current Phase 4 work; PHP and external distribution consumers remain later work. Consult `BOOT.md` and the active roadmap for current phase/version routing.

## Quality targets

The Platform SHOULD be judged by:

- correctness and freshness of collected normalized Article metadata;
- visible/outward duplicate rate;
- Source-publication to first-observation delay;
- enabled-endpoint collection health;
- operator intervention frequency;
- percentage of outward links resolving to the intended original Article;
- ability to add ordinary approved Sources without code changes;
- ability to deploy a different topic without aggregation-engine changes;
- ability for supported downstream consumers to reuse canonical Article-selection semantics without duplicating business logic;
- operational observability of collection and outward-delivery failures when those delivery methods are implemented.

No SEO-performance guarantee or numerical service-level objective is locked by this product-direction change.
