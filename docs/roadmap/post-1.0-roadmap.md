# Post-1.0 Roadmap

**Status:** Active owner-approved post-MVP roadmap; current phase is Phase 0 — Server-rendered public feed.  
**Current baseline:** `1.0.0`.  
**Runner gate:** The documented non-versioned Pre-Phase-0 runner compatibility correction remains required before Phase 0 roadmap prompt generation/execution.  
**Primary direction:** Improve the reusable News Scraper Platform while preserving the first indie-author Publication as configuration rather than engine behavior.

The MVP roadmap closed successfully into the `1.0.0` production baseline. This roadmap is now the active implementation roadmap; it does not reopen, renumber, or rewrite completed MVP phases.

The post-1.0 roadmap restarts phase numbering at Phase 0. Project versions map the post-1.0 phase number to the semantic-version minor component and the prompt number to the patch component:

- Phase 0 baseline = `1.0.0`;
- Phase 0 P1 = `1.0.1`;
- Phase 0 P2 = `1.0.2`;
- Phase 1 baseline = `1.1.0`;
- Phase 1 P1 = `1.1.1`;
- and so on.

Prompt numbers remain one-based. `P0` is not used.

## Roadmap principles

- Each phase is one cohesive implementation boundary that can be planned, implemented, tested, reviewed, and closed independently.
- The version pattern for roadmap work is `1.<post-1.0 phase>.<prompt number>`.
- `1.<phase>.0` is the phase baseline. Each implementation prompt consumes the matching patch number.
- A green phase closeout advances the next phase baseline from the final `1.<phase>.x` tree to `1.<next phase>.0`.
- Phase 0 is the only special baseline: its `1.0.0` baseline is inherited directly from the green terminal MVP Phase 21 release transition, so no additional baseline-only version commit is needed before Phase 0 planning begins.
- Non-versioned correction-stack work does not consume roadmap prompt numbers unless explicitly promoted into roadmap scope.
- Every phase inherits the project, domain, architecture, security, production-data compatibility, and testing contracts routed by `BOOT.md`.
- Post-1.0 schema or persisted-data changes must preserve supported production state from the accepted production baseline as well as migration from zero.
- Shared Platform behavior remains topic independent. Publication-specific choices remain configuration.
- Public-feed changes reuse the canonical public-feed eligibility/read-model boundary rather than creating parallel Article queries.
- Existing keyset pagination remains the canonical continuation mechanism unless an explicit future contract decision supersedes it.
- New infrastructure, indexes, caches, or abstractions require demonstrated need rather than speculative scale assumptions.
- Each phase should use the smallest number of independently implementable and reviewable prompts that safely covers its behavior.

## Pre-Phase-0 runner compatibility gate

The current pre-1.0 Codex phase runner/parser only accepts positive integer phase folders and hard-codes roadmap prompt targets as `0.<phase>.<prompt>`. It therefore cannot safely execute this roadmap's Phase 0 / `1.<phase>.<prompt>` convention as currently implemented.

Before `/prompt-write` emits the first Phase 0 task stack, complete one bounded **non-versioned tooling correction** that:

- extends the shared parser/runner to support the post-1.0 roadmap version family `1.<phase>.<prompt>`;
- supports post-1.0 Phase 0 without allowing `P0` prompt numbering;
- defines an unambiguous task-folder/header convention for post-1.0 roadmap stacks without colliding with retained historical task artifacts;
- preserves correction-stack unchanged-version semantics;
- preserves exact commit-subject/history-resume/version-chain safety;
- updates `BOOT.md` / `AGENTS.md` machine grammar only in the same change as the parser implementation and focused parser tests;
- leaves `package.json` at `1.0.0` throughout the tooling correction.

This gate is implementation/tooling compatibility work, not Phase 0 product scope, and consumes no Phase 0 prompt/version number.

---

# Phase 0 — Server-rendered public feed

**Baseline version:** `1.0.0`

## Goal

Replace the JavaScript-dependent initial public-feed rendering path with server-rendered HTML so the canonical root page is immediately useful to readers, crawlers, command-line HTTP clients, and browsers with JavaScript unavailable or delayed.

The server-rendered page must reuse the canonical public-feed read-model semantics rather than introducing another Article eligibility or ordering implementation.

## Depends on

- accepted `1.0.0` production baseline;
- Pre-Phase-0 runner compatibility gate before roadmap prompt generation/execution.

## Classification

- Base engine capability.
- Publication configuration supplies presentation data only.

## Deliverables

- server rendering for canonical `GET /`;
- configured Publication name and descriptive presentation data present in the initial HTML response;
- first public Article page rendered directly into initial HTML;
- real stored `original_url` headline links present in initial HTML;
- existing Source, Category, and keyword discovery criteria represented server-side where supplied through the canonical root URL;
- canonical public-feed eligibility and chronological ordering reused rather than duplicated;
- explicit populated, empty, unavailable/not-found, invalid-input, and bounded dependency-error server-rendered states;
- removal of the visible generic/unconfigured initial-content flash;
- JavaScript converted to progressive enhancement rather than being required to construct the initial feed;
- functional no-JavaScript public-feed experience for core reading/navigation behavior;
- browser and direct HTTP/curl validation proving meaningful Article content exists in the returned HTML before client JavaScript executes.

## Out of scope

- replacing keyset pagination;
- configurable page size;
- stable historical archive routes;
- sitemap generation;
- broad SEO metadata work;
- Article summary presentation;
- Article thumbnail presentation;
- unrelated visual redesign.

## Exit gate

- A direct request to `/` returns configured Publication content and current eligible Article rows in the HTML body without requiring a subsequent API request.
- JavaScript-disabled navigation still exposes a useful first public-feed page.
- JavaScript-enabled behavior progressively enhances the same canonical state without creating conflicting feed semantics.
- Public eligibility, duplicate suppression, ordering, filtering, and stored `original_url` destinations remain unchanged.
- No parallel feed database/read-model authority is introduced.
- Loading-flash behavior caused by client-only initial rendering is eliminated.
- Required focused, database, browser, and broader regression evidence is green against the exact final tree.
- Production upgrade/data-preservation requirements are satisfied for any persisted changes.

---

# Phase 1 — Crawlable pagination and configurable feed page size

**Baseline version:** `1.1.0`

## Goal

Turn the existing keyset continuation capability into normal crawlable/server-rendered navigation and allow the operator to configure the number of Articles displayed per public page.

This phase evolves the existing pagination system rather than replacing it with offset pagination.

## Depends on

- Phase 0.

## Classification

- Base engine capability.
- Page-size choice is singleton Publication configuration.

## Deliverables

- bounded Publication-configured public Article page size;
- Cloudflare-protected administrator control for the page-size setting;
- safe persisted default preserving current supported behavior unless deliberately changed;
- bounded validation preventing unreasonable page sizes;
- server-rendered continuation navigation using the existing opaque keyset cursor;
- real HTML links to older feed results rather than JavaScript-only continuation controls;
- preservation of active `q`, Source, and Category criteria when navigating continuation pages;
- criteria-bound cursor validation unchanged;
- direct navigation and refresh of a valid continuation URL;
- progressive JavaScript enhancement may preserve a smooth load-more interaction without making JavaScript mandatory;
- no reader-controlled `limit` parameter;
- production-safe migration and rollback behavior for any new Publication configuration field.

## Out of scope

- SQL offset/page-number pagination;
- frozen snapshot pagination across concurrently arriving Articles;
- historical year/month archive routes;
- Article ranking changes;
- featured/pinned ordering;
- unlimited page sizes.

## Exit gate

- An operator can configure the supported public page size through the administrator interface.
- The public reader cannot override server-controlled bounds through arbitrary request parameters.
- A direct server-rendered continuation request returns the correct next Article set.
- Walking keyset pages under a static result set neither repeats nor omits Articles because of ordering ties.
- New Articles do not introduce offset-style page drift because keyset semantics remain intact.
- Search/filter criteria remain correctly bound to cursors.
- No-JavaScript readers and crawlers can follow older-result links.
- Production migration/data preservation and required regression evidence are green.

---

# Phase 2 — SEO foundation

**Baseline version:** `1.2.0`

## Goal

Provide a coherent technical SEO foundation for the server-rendered public product without manufacturing local Article ownership or weakening the Platform's original-publisher destination model.

## Depends on

- Phase 1.

## Classification

- Base engine capability.
- Publication configuration owns publication-specific title/description/branding values.
- Deployment configuration owns trusted public-origin information where required.

## Deliverables

- server-generated document titles using configured Publication data;
- bounded meta descriptions;
- canonical URL handling;
- trusted canonical public-origin configuration that does not blindly trust arbitrary inbound `Host` headers;
- `robots.txt`;
- initial `sitemap.xml`;
- explicit indexing/canonical policy for root, search, Source-filtered, Category-filtered, and cursor-continuation pages;
- appropriate Open Graph/public sharing metadata where supported by available Publication configuration;
- extension points for later archive URLs to participate in sitemap generation;
- automated HTTP/document-head validation;
- direct HTTP/curl validation of generated metadata.

## Out of scope

- fabricated local Article-detail pages;
- replacing stored publisher URLs as the Article destination;
- copying publisher Article bodies;
- generic AI-generated SEO copy;
- speculative schema.org markup without an agreed semantic model;
- historical archive implementation itself.

## Exit gate

- Canonical public pages expose deliberate title, description, canonical, and crawl directives in their initial HTML.
- `robots.txt` and sitemap behavior are deterministic and tested.
- Public URL generation uses a trusted deployment origin.
- Search/filter/cursor indexing behavior is explicitly defined rather than accidentally determined by crawler behavior.
- External Articles remain external publisher destinations.
- No indie-author-specific SEO rule exists in shared engine code.
- Required HTTP, browser, security, configuration, and regression validation is green.

---

# Phase 3 — Public Article summaries

**Baseline version:** `1.3.0`

## Goal

Expose safe Source-provided Article summaries/descriptions through the canonical public feed when such normalized metadata is available.

## Depends on

- Phase 2.

## Classification

- Base engine capability.
- No topic-specific behavior.

## Deliverables

- verification and normalization of the existing Article-summary producer/storage path;
- extension of collection/normalization only where current approved Source adapters fail to preserve explicitly supplied summary metadata;
- bounded safe summary representation in the canonical public-feed read model;
- summary support in the public API;
- server-rendered summary presentation;
- graceful Article-card behavior when no summary exists;
- safe handling of markup, malformed content, excessive length, and unsupported input;
- preservation of headline prominence and direct publisher destination;
- regression coverage for feeds both with and without summaries.

## Out of scope

- Article-body fetching;
- scraping publisher destination pages merely to obtain summaries;
- AI-generated summaries;
- rewriting Source-provided summaries for SEO;
- thumbnail/image work;
- full-content republication.

## Exit gate

- Source-provided summaries that survive the governed normalization pipeline can appear through the canonical public read model.
- Missing summaries remain normal and do not create synthetic filler.
- Unsafe markup/content does not reach public rendering as executable content.
- API and SSR surfaces use the same normalized Article summary semantics.
- Existing Article identity, Relevance, duplicate, provenance, and external-link behavior remains intact.
- Required collection-fixture, database, API, browser, and broader regression evidence is green.

---

# Phase 4 — Historical archive discovery

**Baseline version:** `1.4.0`

## Goal

Provide stable, human-readable public discovery paths for older feed history so historical Articles remain practically browsable and crawlable beyond the rolling recent-feed experience.

## Depends on

- Phase 3.

## Classification

- Base engine capability.
- Presentation labels remain Publication configuration.

## Deliverables

- stable server-rendered historical archive navigation;
- year/month-based archive boundaries or an equivalently stable calendar hierarchy;
- deterministic archive URLs such as `/archive/YYYY/MM` where adopted by contract;
- archive queries derived from the canonical feed-eligible Article stream;
- preservation of effective-feed-date chronology and duplicate suppression;
- navigation between available historical periods;
- useful empty/nonexistent archive behavior;
- no-JavaScript archive browsing;
- sitemap expansion for stable archive surfaces;
- archive metadata/canonical behavior integrated with the Phase 2 SEO foundation;
- scale-conscious bounded archive query behavior.

## Out of scope

- offset pagination;
- local Article-detail pages;
- rewriting Article timestamps;
- separate historical Article copies;
- automatic historical Relevance reprocessing;
- changing Article identity or duplicate grouping;
- full-text search-engine infrastructure.

## Exit gate

- Readers and crawlers can reach older eligible Articles through stable local archive navigation.
- Archive membership is based on canonical effective feed dates.
- Archive queries preserve ordinary feed eligibility and duplicate suppression.
- No separate archive Article store or eligibility model exists.
- Archive pages render without JavaScript.
- Sitemap/indexing behavior includes the new stable history surfaces.
- Database and browser validation proves useful behavior across multiple historical periods and boundary dates.
- Required broader regression coverage remains green.

---

# Phase 5 — Article thumbnails and Source-provided images

**Baseline version:** `1.5.0`

## Goal

Support optional Article thumbnail imagery when approved Source metadata provides a trustworthy usable image reference, while preserving security, provenance, performance, accessibility, and the metadata-only nature of the Platform.

## Depends on

- Phase 4.

## Classification

- Base engine capability.
- Individual Publication presentation may choose whether/how supported imagery is displayed within bounded engine options.

## Deliverables

- explicit image-source and delivery/security contract before implementation;
- audit of existing Article image metadata and producer paths;
- normalized optional Article image representation;
- support for explicit RSS/Atom or configured Source metadata where permitted;
- no automatic Article-body crawling merely to discover images;
- governed URL/content safety behavior;
- deterministic missing/broken-image fallback;
- responsive public thumbnail presentation;
- reserved layout behavior that avoids destructive content shift;
- appropriate image accessibility semantics;
- API/read-model integration where public image metadata is exposed;
- security/privacy/CSP behavior consistent with the selected image-delivery model.

## Out of scope

- unrestricted image scraping;
- fetching full Article pages just to locate thumbnails;
- image-generation AI;
- claiming ownership of publisher imagery;
- unrelated media galleries;
- replacing headline links with local content pages.

## Exit gate

- Articles with supported image metadata may display a safe optional thumbnail.
- Articles without usable image metadata remain complete and visually coherent.
- Image support does not broaden Source trust or outbound-fetch boundaries silently.
- Broken or unavailable remote media does not break the feed.
- Provenance and original publisher destination remain intact.
- Required security, collection, API, browser, accessibility, and broader regression evidence is green.

---

# Phase 6 — Scale and performance validation

**Baseline version:** `1.6.0`

## Goal

Validate the post-1.0 Platform against realistic Article history and operating workloads, then make only evidence-supported database, caching, runtime, or query optimizations.

## Depends on

- Phase 5.

## Classification

- Base engine engineering/operations work.

## Deliverables

- realistic large-corpus disposable database fixtures or generation tooling;
- documented representative workload assumptions;
- before-change measurements for important paths including root SSR, filtered public feed, cursor continuation, archive queries, administrator Article search/moderation, and sitemap generation where applicable;
- PostgreSQL query-plan inspection for demonstrated hot paths;
- index changes only where measurements justify them;
- query simplification/optimization where demonstrated;
- server-render latency and resource measurements;
- caching or conditional-response strategy only where measured need justifies additional complexity;
- ETag, short-lived caching, or equivalent HTTP optimization where appropriate and contract-safe;
- validation that moderation/publication changes invalidate or bypass stale presentation correctly;
- memory/process/resource observations for Web and Worker where relevant;
- before/after measurements for every optimization claimed;
- removal or rejection of proposed optimizations that do not demonstrate meaningful benefit.

## Out of scope

- speculative Elasticsearch/OpenSearch adoption;
- distributed caching solely for hypothetical future scale;
- premature service decomposition;
- replacing PostgreSQL without evidence;
- weakening consistency, moderation freshness, provenance, or security for benchmark numbers;
- artificial micro-optimizations without measurable product or operational benefit.

## Exit gate

- Representative corpus sizes and workload assumptions are documented.
- Important public/admin queries have observed performance evidence.
- Every accepted optimization has comparable before/after measurements.
- Indexes/caches/infrastructure exist because of measured need rather than assumption.
- Performance improvements preserve feed eligibility, ordering, moderation, provenance, transaction, and production-data invariants.
- Required regression, database, browser, runtime, security, and operational validation is green on the exact final tree.
- Remaining known scale limits are explicitly documented rather than hidden.

---

# Later roadmap candidates

The following remain candidates rather than scheduled phases until separately promoted:

- native application-managed administrator accounts and roles;
- identity-linked audit attribution;
- automatic/bulk historical Relevance reprocessing;
- public aggregate RSS/Atom output;
- email newsletters;
- Source push/webhook adapters;
- related-story/event clustering;
- generic relevance ranking/boost scoring;
- pinning/editorial featured-story ordering;
- public accounts/personalized feeds;
- outbound newsletter/social publishing;
- multilingual feeds;
- self-service deployment/tenancy;
- application API expansion beyond the existing public feed contract.

A candidate becomes scheduled roadmap work only through explicit owner approval and documentation alignment.

Concurrent multi-Publication hosting inside one deployed installation remains outside the supported architecture unless a future explicit contract/ADR changes that decision.
