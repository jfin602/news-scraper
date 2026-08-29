# Product Scope and Users

**Status:** Current post-2.0 product scope; 3.0 roadmap active in Phase 2 at `2.2.0`  
**Adopted:** 2026-08-19  
**Updated:** 2026-08-29 for Phase 1 closeout and bounded Profile digest writing-style guidance  
**Historical MVP scope:** `docs/contracts/mvp-scope-and-users.md`

## Product objective

News Scraper is a reusable, topic-independent **headless news aggregation and distribution Platform**.

Its primary job is to:

1. collect Article metadata from administrator-approved Sources;
2. normalize Source-specific input into one governed Article model;
3. persist Articles idempotently with provenance;
4. apply deterministic editorial/Relevance/Category rules;
5. detect and suppress true duplicates without deleting Source instances;
6. give operators an administrative control plane for Source, Article, duplicate, health, Publication, Distribution Profile, and implemented Profile AI configuration; and
7. expose governed normalized Article output to supported downstream consumers while preserving the original publisher destination.

The bundled first-party public feed remains a supported reference/standalone consumer of the same outward read semantics. It is not the defining product boundary, and a client may instead integrate the Platform's distribution output into an existing website or other supported consumer.

A deployed installation hosts exactly one Publication. The Publication represents one customer/editorial property and governed content universe and MAY contain multiple related subject verticals or feed sections. Distribution Profiles are the supported mechanism for exposing independently configured feeds within that singleton Publication. Topic independence is a reusable-code/configuration property and does not require relational multi-Publication tenancy or dormant tenant keys throughout persistence.

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
- implemented Distribution Profile configuration: persisted Profiles with immutable keys, mutable display names, lifecycle, bounded result/history limits, Source associations, bounded association filters, protected administration, and transactional change history;
- implemented Distribution Credential administration: protected create/list/rotate/revoke controls with labels and lifecycle metadata, one-time plaintext issue/rotation behavior, and strict separation from human administrator authority; and
- Profile AI administration: digest enable/disable, bounded lookback, bounded maximum input Article count, optional bounded digest writing-style guidance, digest cadence/status visibility, manual Generate now, active digest status/freshness, and latest bounded attempt diagnostics as governed by `ai-assistance-contract.md`.

Digest writing-style guidance is optional Profile configuration for tone, voice, audience, formality, and similar writing qualities. It remains subordinate to fixed News Scraper AI grounding/security/schema/URL rules and therefore permits subject-specific editorial wording without introducing subject-specific shared-engine prompt logic.

Gemini credentials/provider secrets remain deployment/operator secrets rather than Profile fields.

The administrator surface is the instance-owned Platform control plane. Current managed/reference administrative routes remain protected by Cloudflare Access under the accepted admin-perimeter ADR. Future self-hosted deployments require a governed secure perimeter, but Cloudflare is not a universal runtime dependency.

### Website/CMS integrator

An integrator wants to consume one or more governed streams of normalized Articles and render them inside an existing website, CMS, publication section, or other supported delivery surface without reimplementing collection, Source trust, duplicate suppression, moderation, or Article-selection logic.

The integrator should be able to rely on stable outward semantics for:

- Article identity exposed for integration purposes;
- effective feed date/order;
- display headline;
- Source identity;
- stored `original_url` as the reader destination;
- ordinary visibility/duplicate suppression;
- explicitly supported Profile filters/distribution selection;
- bounded safe metadata made public by the relevant outward contract;
- independent local state for multiple synchronized Profiles; and
- when AI is enabled, normalized Profile-scoped digest/chat surfaces without taking custody of Gemini secrets or reimplementing Profile grounding.

The implemented 2.0 integration is the authenticated versioned distribution API plus scheduled generic PHP synchronization, validated last-known-good local data, normalized local-read access, and server-rendered customer output. Completed Phase 1 extends that path with a bounded nullable digest in the same complete Profile snapshot; it does not introduce a second customer synchronization protocol.

### Operator/developer

An operator/developer needs telemetry to diagnose Source failures, parser changes, delayed collection, identity behavior, duplicate decisions, failed jobs, outward-delivery failures, Profile synchronization issues, and AI digest/chat failures without manual database inspection or secret-bearing logs.

### Reference-frontend reader

A public reader may still use the bundled first-party `/` feed when a deployment exposes it. That reader experience remains supported, but it is a consumer of the Platform core rather than the product's primary architectural identity.

### Customer-site AI user

A customer-site user may read a synchronized AI-generated digest for one selected Distribution Profile after the Phase 1/Phase 2 integration path is shipped. Later, the user may explicitly invoke "Ask this feed" under the separately governed interactive AI phase. That user does not receive administrator authority, Gemini credentials, unrestricted database access, or cross-Profile context merely by using the public customer site.

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

- singleton Publication configuration;
- Source/endpoint lifecycle, approval, operational state, domain policy, and health controls;
- Category and Relevance management;
- Article visibility/display/category moderation;
- Duplicate review/group/Primary controls;
- Distribution Profile configuration;
- Profile-level digest configuration/operations governed by `ai-assistance-contract.md`;
- bounded change history;
- operational collection visibility.

A Publication may contain Sources serving different subject verticals. Subject differences do not create Publication tenancy or Article ownership scopes. Operators use Profile Source membership and bounded Profile filters to expose independently configured feeds while keeping collection and canonical editorial authority centralized.

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

The existing `GET /api/feed` and bundled `GET /` reference frontend are current consumers of these semantics. Distribution adapters and AI assistance must consume the same authority rather than introducing adapter/model-specific Article SQL, duplicate rules, moderation rules, or destination rewriting.

### Distribution configuration boundary

Collection trust and distribution selection are separate concerns.

A Source being approved means it may participate in governed collection and ordinary outward eligibility. It does not automatically mean every downstream integration or Profile must receive every Article from that Source.

A Distribution Profile is a named administrator-controlled outward selection over already canonically eligible Articles. One Publication may have multiple Profiles representing different feeds, sections, or subject verticals without becoming relational tenancy. Profiles MAY use disjoint or overlapping Source membership. Profile selection can only narrow eligibility; its lifecycle, Source associations, and bounded filters are governed by `distribution-and-integration-contract.md`. The permanent wire/auth contract is `distribution-api-contract.md`.

The completed 2.0 work implemented the Distribution Profile, canonical read-model, machine credential/authentication/security, permanent authenticated v1 distribution HTTP API, generic PHP synchronization/LKG, normalized local/customer server-rendered integration, and accepted managed customer integration path.

### AI assistance boundary

Completed 3.0 Phase 1 adds AI only downstream of governed Profile output.

Scheduled Profile digests and later interactive "Ask this feed" chat are governed by `ai-assistance-contract.md`. The same AI implementation must work across materially different Profile subjects without hard-coded topic prompts or shared-engine subject rules.

Phase 1 digest grounding uses a deterministic bounded narrowing of canonical Profile output. Defaults are a 7-day lookback and at most 20 Articles, preserving canonical Profile order. The accepted N6WD correction already bounds persisted Article summaries to 4,000 Unicode code points. Gemini URL Context may receive only the exact stored `originalUrl` values for the bounded governed input, with no Google Search grounding or arbitrary/model-selected browsing.

Profile digest writing-style guidance is optional bounded Profile AI configuration. It may influence presentation qualities of generated prose but cannot change canonical Article input, URL allowlists, supporting-reference validation, structured-output rules, security, or other application-owned instructions. Its validated value/no-guidance state participates in `digestInputIdentity`, so changing the guidance requires digest reevaluation even when the Article set is unchanged. The configuration itself remains server-side rather than part of the public v1/PHP digest payload.

The digest is durable Profile-owned AI state with immutable successful generations, a separate active reference, bounded attempt history, and internal `digestInputIdentity`. Visible active digest state is part of the same outward Profile snapshot/revision delivered by the permanent v1 API and existing PHP complete-snapshot/LKG/local-read path.

Downstream digest data is normalized as `current`, `older`, or absent (`null`) under the lifecycle in `ai-assistance-contract.md`. Provider failure does not become a dependency for ordinary Articles, and canonical invalidation cannot be hidden by preserving a formerly valid digest.

AI does not authorize or perform Source approval, collection, Relevance, Category, moderation, Article identity, duplicate decisions, ordering, or destination rewriting. Gemini failure or an inaccessible/paywalled publisher URL cannot become a dependency for ordinary non-AI collection, canonical distribution, PHP Article LKG, or customer Article rendering.

### Deployment architecture

Managed integration is the proven 2.0 operating path. News Scraper remains self-hostable by design under the Project Contract and managed/self-hostable ADR. Packaging the complete stack into a lightweight Linux VPS/Docker Compose installation remains outside the current 3.0 commitment unless explicitly promoted.

Deferring packaging does not permit a mandatory central News Scraper dependency or weaken instance isolation. The existing managed Profile/API/PHP integration remains the baseline on which the 3.0 AI and multi-feed work is built.

### Presentation ownership

News Scraper owns governed Article selection, normalized output, and `original_url` semantics. Customers own and may replace HTML, CSS, typography, layout, responsive behavior, placement, and custom UI. AI-generated output is also presentation input rather than publisher metadata.

Completed Phase 1 exposes normalized digest data safely without creating a new authoritative customer-facing digest renderer or CSS system. Existing duplicated PHP renderer cleanup is assigned to Phase 2 / `2.2.x`; customer-specific digest markup remains customer-owned. Supported examples should make AI origin clear and must escape/sanitize model output as untrusted plain text.

## Current customer Publication configuration

The first deployed customer editorial property began as publishing-industry news relevant to independent authors. Its Sources, Categories, Relevance rules, branding, admission phrases, and editorial decisions are configuration rather than shared-engine behavior.

The same customer property now intends to expose at least three materially different feeds through Distribution Profiles:

```text
publishing-news
opportunities
indie-filmmaking
```

That expansion is a configuration/use-case proof of the singleton multi-vertical Publication model. It MUST NOT become indie-author-, opportunity-, filmmaking-, or customer-specific shared-engine behavior.

## Completed 2.0 scope boundary

`2.0.0` established the managed Profile → authenticated v1 API → generic PHP complete-snapshot sync → atomic last-known-good cache → normalized local-read → customer server-rendered integration path, together with the governing operational/security/data-compatibility boundaries.

The historical seven-phase 2.0 roadmap is complete under `docs/roadmap/post-1.0-roadmap.md`.

## Active owner-approved 3.0 direction

`docs/roadmap/3.0-roadmap.md` is **ACTIVE — PHASE 2** at package `2.2.0`. Phase 1 Gemini Profile digest foundation is GREEN/owner-accepted with live qualification recorded in `docs/validation/phase-1-gemini-live-qualification.md`. Before normal Phase 2 prompts begin, owner-approved correction `c1-digest-style` adds bounded Profile digest writing-style guidance while preserving package `2.2.0`. After that correction, the current executable roadmap task family is `p2-2`, beginning at `2.2.1`.

The current sequence is:

1. `2.1.x` — Gemini Profile digest foundation — **COMPLETE / OWNER-ACCEPTED**;
2. unchanged-version `c1-digest-style` at `2.2.0` — bounded Profile digest writing-style guidance before normal Phase 2 prompts;
3. `2.2.x` — PHP integration correction/customer package refresh, including the packaged `run-sync.php`, presentation-boundary cleanup, package/version/upgrade workflow, and production customer deployment of the Gemini-capable package;
4. `2.3.x` — Profile-grounded "Ask this feed" chat;
5. `2.4.x` — real three-feed publishing/opportunities/indie-filmmaking integration proof;
6. `2.5.x+` — remaining admin/PHP integration tightening based on observed deployment friction; and
7. terminal `3.0.0` only after the owner explicitly locks and satisfies the final release gate.

The final `3.0.0` exit gate remains intentionally owner-controlled/TBD until those capabilities have been exercised in the real customer integration.

WordPress-specific productization, public RSS/Atom output, Linux VPS/Docker Compose self-host packaging, native/default self-host administrator authentication, production-grade autonomous public self-hosting, SSO/multi-admin identity, visitor/click/referral/backlink analytics, advanced SEO tooling, browser widgets, Kubernetes/multi-node deployment, delta synchronization, autonomous AI editorial decisions, a News Scraper-owned Article-body crawler/persisted Article-body RAG corpus, arbitrary web browsing/search or model-selected URL retrieval beyond application-selected governed `originalUrl` URL Context, and additional adapter families remain outside the current commitment unless explicitly promoted.

## Quality targets

The Platform SHOULD be judged by:

- correctness and freshness of collected normalized Article metadata;
- visible/outward duplicate rate;
- Source-publication to first-observation delay;
- enabled-endpoint collection health;
- operator intervention frequency;
- percentage of outward links resolving to the intended original Article;
- ability to add ordinary approved Sources without code changes;
- ability to add materially different subject verticals/Profiles within one customer Publication without aggregation-engine changes;
- ability to deploy another customer/editorial property without aggregation-engine changes;
- ability for supported downstream consumers to reuse canonical Article-selection semantics without duplicating business logic;
- independent correctness/failure isolation of multiple Profile feeds;
- when AI is enabled, grounded/citable Profile assistance that cannot break ordinary non-AI operation;
- operational observability of collection, distribution, synchronization, and AI failures when those delivery methods are implemented.

No SEO-performance guarantee or numerical service-level objective is locked by this product direction.