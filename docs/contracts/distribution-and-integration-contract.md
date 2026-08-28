# Distribution and Integration Contract

**Status:** Current approved 2.0 architecture and implemented baseline; extended by active owner-approved Phase 1 / `2.1.x` digest behavior where explicitly referenced below  
**Adopted:** 2026-08-20  
**Completed 2.0 baseline:** 2026-08-27  
**Updated:** 2026-08-28 for Phase 1 Gemini worksheet alignment

## Authority and required path

A **Distribution Profile** is a first-class installation-owned, administrator-controlled selection over the singleton Publication's canonically eligible Articles. Profiles and Sources are peer top-level resources; multiple Profiles do not create Publications, customers, or tenancy.

Under the 2026-08-27 Publication amendment, one singleton Publication may contain multiple related subject verticals or feed sections belonging to one customer/editorial property. Distribution Profiles are the supported independently configured feed/section boundary for those verticals and MAY use disjoint or overlapping Source membership. This changes no Profile eligibility, persistence, or tenancy semantics.

```text
approved Sources → collection / normalization / persistence → canonical outward eligibility
→ Distribution Profile → authenticated GET /api/v1/distribution/{profile_key}
→ scheduled generic PHP synchronization → validated local last-known-good snapshot
→ server-rendered customer website → direct stored publisher originalUrl links
```

Optional Phase 1 digest state composes into that same Profile snapshot path after canonical Profile selection. It does not create another distribution protocol.

Wire, authentication, cursor, and compatibility details are governed by `distribution-api-contract.md`. AI generation/lifecycle behavior is governed by `ai-assistance-contract.md`.

## Eligibility and lifecycle

Canonical distribution eligibility is independent of Publication `public_status`. It requires an approved, active Source; a visible Article; an ungrouped Article or the Primary member of a Duplicate group; the stored `original_url` destination; and canonical chronological ordering. `public_status` controls only bundled `GET /` and `GET /api/feed`.

A Profile has at least immutable `config_key`, mutable `display_name`, lifecycle `draft`/`active`/`disabled`, and a bounded result/history limit defaulting to 100 items. A central hard maximum MAY be enforced, but consumers cannot request unbounded history. An active Profile requires at least one associated Source that is `approved` and `active`; drafts MAY be incomplete. Source operational state is orthogonal: it controls collection execution, not Profile usability or canonical distribution eligibility. Once activated, a Profile SHOULD be disabled rather than deleted so its key remains stable. Draft-only deletion MAY be supported.

Profile activation/reactivation, association removal, Source unapproval, and Source archival MUST be coordinated transactionally so none can commit an active Profile with zero usable associated Sources. Concurrent Profile/Source state changes must preserve that invariant without bypassing it or deadlocking through inconsistent lock ordering.

An authenticated `profile_disabled` response is authoritative: adapters may retain cached bytes for recovery, but mark the local Profile disabled and MUST NOT render its cached Articles. Rendering resumes only after a later successful synchronization.

## Source associations and filters

A first-class Profile↔Source association is required before that Source contributes Articles. Source configuration, collection, identity, and provenance are not duplicated into Profiles. Each association MAY contain `include_any_phrases[]`, `exclude_any_phrases[]`, and `category_config_keys[]`.

Empty lists impose no restriction for that dimension. Values within each list use OR; the three dimensions compose with AND; exclusion wins. Category matching uses effective outward moderated Category membership. Phrase matching is deterministic case-insensitive literal substring matching over safe normalized outward headline, author, and summary text; missing nullable text does not match.

Profile filtering occurs after canonical eligibility and only narrows it. It never changes trust, collection, identity, provenance, moderation, duplicate state, Relevance, Category membership, or canonical eligibility. Regex, fuzzy or semantic/AI matching, arbitrary expressions, ranking, and adapter-side selector interpretation are prohibited. The result is the canonically ordered union from all associated Sources.

There is no special “exclude self” semantic. Omit a Source association to exclude it; ownership MUST NOT be inferred from domains, names, or aliases.

Profiles may represent materially different customer-facing feed concepts—such as publishing news, opportunities, or indie filmmaking—without creating another Publication. Those labels/subjects remain configuration and presentation. Shared Profile filtering code MUST NOT contain subject-specific logic.

## Generic PHP integration and last-known-good state

The generic PHP integration is the implemented 2.0 customer integration core and has a synchronization/cache client plus normalized local Profile-data access. The existing package also contains a fallback renderer, but the active roadmap assigns removal of that duplicated presentation authority to Phase 2 / `2.2.x`; Phase 1 digest work MUST NOT expand that renderer into a new authoritative AI presentation layer.

The integration synchronizes complete bounded Profile snapshots:

```text
start candidate → fetch every cursor page → validate schema/profile/API version/snapshotRevision
→ validate complete candidate → atomically activate → preserve prior recoverable state where practical
```

Partial, invalid, or mixed-revision required candidate state MUST NOT become visible. Synchronization locks per Profile, prevents overlap, uses bounded retries, respects `Retry-After`, and supports conditional initial requests. Default cadence is 15 minutes and is customer-configurable. `snapshot_changed` discards the candidate, preserves active state, and restarts within bounded retry rules.

Each Profile has independent candidate and active state. Multiple Profiles on the same customer host MUST NOT share locks, manifests, candidate activation, freshness, disabled state, or failure state in a way that allows one Profile to corrupt or suppress another. Cache metadata SHOULD include Profile key, API version, `snapshotRevision`/ETag, upstream `generatedAt`, last successful local sync, and health/freshness facts. Credentials MUST NOT be stored in cache payloads.

Freshness and usability are distinct. Stale valid local Profile output remains renderable by default with no hard cutoff. Customers MAY configure a maximum stale age; once exceeded, or before any valid snapshot exists, render the configured safe empty/unavailable fallback. Public rendering reads local active state only and MUST NOT make a synchronous News Scraper API request.

Network errors, timeouts, `401`, `429`, `5xx`, malformed/partial required candidates, and exhausted `snapshot_changed` retries preserve active state under the stale policy. Only authenticated `409 profile_disabled` suppresses otherwise usable cached public output.

### Phase 1 digest inside the complete Profile snapshot

The active digest is part of the same complete outward Profile snapshot and the same PHP LKG candidate/activation lifecycle as Articles. Phase 1 MUST NOT introduce a parallel digest cache, separate digest state directory, second digest sync file, digest-specific customer cron, or visitor-time upstream read.

Every successful v1 page carries the same top-level `digest` value for one `snapshotRevision`: either a validated structured digest or `null`. Changing visible digest state changes the outward revision. If digest activation/suppression occurs during a multi-page traversal, the ordinary `snapshot_changed` restart behavior remains authoritative; no special digest race protocol is introduced.

The upgraded PHP integration defensively validates optional digest data independently from required Profile/Publication/Article candidate state. News Scraper remains responsible for serving only validated outward digest data, but the local integration preserves its own safe boundary.

If required Profile/Publication/Article state is valid while the digest is malformed, inconsistent, or otherwise unsafe:

```text
valid Profile + valid Articles + invalid digest
→ activate the new valid Article snapshot normally
→ normalize local digest to null
→ retain only bounded diagnostic facts where useful
```

The PHP synchronizer MUST NOT reject the complete Article candidate, preserve an older Article LKG, or make ordinary feed rendering unavailable solely because optional digest data is invalid.

For a multi-page candidate under one `snapshotRevision`, all pages MUST carry the same normalized digest value. Contradictory digest values across pages are invalid AI state for that candidate and MUST NOT be silently resolved by selecting the first/last page value. Article traversal/activation MAY still succeed with digest degraded to `null` when required Article state remains coherent.

A pre-Phase-1/pre-digest local snapshot remains a valid upgrade starting point. Replacing integration code MUST NOT require clearing/rebuilding customer private state merely to add digest awareness. Until a valid synchronized digest is present, local-read represents it as `digest = null`.

`LocalProfileReader` exposes normalized first-class digest data rather than requiring customer code to parse cache files or raw API arrays. The normalized local boundary conceptually includes:

```text
LocalReadResult
├─ profile
├─ publication
├─ digest: LocalReadDigest | null
├─ articles[]
├─ staleAgeSeconds
└─ health

LocalReadDigest
├─ generatedAt
├─ freshness: current | older
├─ inputArticleCount
├─ provider
├─ model
├─ overview
└─ highlights[]

LocalReadDigestHighlight
├─ title
├─ text
└─ supportingArticles[]

LocalReadDigestArticle
├─ articleId
├─ headline
├─ sourceDisplayName
├─ effectiveFeedDate
└─ originalUrl
```

Exact PHP class/property names MAY be refined during implementation if this normalized ownership/semantics is preserved.

Digest `generatedAt` and semantic `freshness` are separate from local Profile/LKG freshness. `LocalReadResult::$staleAgeSeconds` continues to describe the synchronized local Profile state; it MUST NOT be redefined as AI-content age. Customer presentation may derive simple age from `digest.generatedAt` and uses the server-owned `current | older` classification rather than reconstructing `digestInputIdentity` logic locally.

## Adapter, presentation, and link boundaries

Adapters MAY own connection settings, credentials, synchronization, local storage/locking, rendering, CSS/classes, fallback templates, and presentation extension points. They MUST NOT own Source trust/admission, Relevance or Category semantics, moderation, eligibility, Primary selection, Profile interpretation, ordering, or destination semantics.

Customer presentation code consumes normalized local-read data. News Scraper/integration code owns synchronization, LKG persistence, validation, normalization, and safe data exposure; the customer owns final HTML, CSS/classes, layout, placement, surrounding copy, and site-specific composition.

Phase 1 does not introduce an authoritative digest renderer, hidden customer-facing presentation layer, or AI CSS system. It MAY provide minimal instructional/example markup showing safe server-side access to normalized Articles and digest data, but that example is non-authoritative and intended to be copied/adapted. The roadmap's Phase 2 package correction will remove the existing duplicated bundled/local renderer as a supported presentation authority rather than extending it.

Core anchors use exact stored `originalUrl`, require no JavaScript, and do not use News Scraper tracking redirects. For digest supporting Articles, headline, Source display name, `effectiveFeedDate`, and exact `originalUrl` are application-resolved canonical data, never trusted model-authored metadata.

Ordinary editorial external links are unqualified by default; externality alone does not add `nofollow`. Customers own sponsored/UGC/nofollow treatment, canonical tags, sitemap, robots directives, page titles, surrounding copy, site architecture, and SEO strategy.

News Scraper MUST NOT guarantee SEO improvement, backlink value, or PageRank transfer; automate reciprocal links; condition inclusion on backlinks; impose backlink quotas; or keyword-stuff anchors. The supported claim is limited to crawlable server-rendered direct publisher links.

A customer MAY render several Profiles on separate pages, separate sections, or one page. Presentation composition does not authorize PHP/customer code to merge, re-filter, rerank, or reinterpret Article eligibility outside the normalized Profile results it receives.

When local `digest === null`, the default integration semantics are simply absence of digest data. Provider errors are not injected into public presentation. When a digest is `older`, customer markup MAY identify it honestly as an older AI summary using its truthful original generation timestamp.

## AI assistance extension

Optional AI assistance is governed exclusively by `ai-assistance-contract.md`.

AI consumes canonical Profile output downstream of the rules in this contract. It MUST NOT be used as a Profile selector, Relevance rule, Category rule, moderation rule, duplicate rule, ordering authority, or Source trust/admission mechanism.

Phase 1 specifically propagates the active nullable Profile digest through the existing v1/PHP/LKG/local-read path as part of the complete Profile snapshot. Ordinary public Article/digest rendering remains local-only and non-AI-dependent.

Interactive chat is a later separate explicit user action and must use its separately governed authorization/cost/failure boundary. It does not change the ordinary complete-snapshot digest delivery contract.

## Phase 2 customer package handoff

The completed Phase 1 Gemini worksheet locks the intended customer package model, but the active roadmap deliberately assigns the actual production package correction/deployment to Phase 2 / `2.2.x`.

The supported target layout is one replaceable versioned `ns-integration` directory beside durable customer-owned `ns-private` state. The customer upgrade must preserve existing private configuration/LKG, keep the existing cron target valid through a packaged stable `ns-integration/run-sync.php`, require no customer Gemini key/new machine credential/new database/new digest cron, and support directory-level rollback without clearing `ns-private`.

The package download/version display, archive extraction shape, `UPGRADE.md`, packaged launcher, removal of duplicated renderer authority, and real production customer package replacement are Phase 2 responsibilities. Phase 1 must leave the v1/PHP/local-read producer/consumer boundary ready for that handoff without claiming the production package update has already occurred.

## Later adapters and telemetry

WordPress and RSS/Atom were post-2.0 and remain outside the currently committed 3.0 scope unless explicitly promoted. A later WordPress adapter builds on the WordPress-independent generic PHP core and owns only CMS concerns. Later RSS/Atom is an optional bare-bones public fallback per Profile, explicitly enabled and disabled by default, using the same read model. It is not a selector engine; secret-bearing feed URLs are prohibited and authenticated consumers use JSON.

2.0 telemetry is operational, not visitor analytics. Bounded API facts SHOULD include Profile key, API version, status, duration, item/page information, non-secret credential identity, auth/rate/missing/disabled/failure categories, and client version. PHP health SHOULD include attempts/success, duration, items/pages, freshness/stale age, unchanged result, failure category, and adapter version. Tokens, Authorization headers, secrets, and sensitive payloads MUST NOT be logged. Click, referral, visitor, page-view, reader-identity, backlink-performance, and tracking-redirect analytics are excluded. Telemetry remains locally operable.

AI telemetry additions are governed by `ai-assistance-contract.md` and remain bounded/secret-safe rather than becoming visitor analytics. Digest attempt/provider failure diagnostics remain in the protected operator plane; public/customer presentation does not expose raw provider errors.

## Completed 2.0 boundary

The 2.0 consumer baseline is the v1 API plus generic PHP scheduled sync, last-known-good cache, normalized local-read access, and customer server-rendered output. Browser widgets, WordPress, RSS/Atom, Linux VPS/Docker Compose self-host packaging, native/default self-host admin authentication, autonomous public self-host production readiness, SSO/multi-admin identity, visitor analytics, advanced SEO tooling, Kubernetes/multi-node deployment, delta synchronization, and additional adapters were not required for `2.0.0`.

`2.0.0` established administrator-configurable Profiles with immutable keys, lifecycle, explicit Source associations and bounded filters; one canonical distribution read model; bearer credential generation/rotation/revocation and `distribution:read`; rate/abuse protection; stable v1 schema and snapshot/cursor consistency; generic PHP complete-snapshot traversal, per-Profile locking, atomic LKG activation, optional stale cutoff and fallback SSR; operational telemetry; and supported production forward migration plus backup/restore compatibility.

The accepted customer integration and Phase 7 owner exception are recorded in the durable 2.0 validation history. Historical qualification claims remain limited to the evidence actually recorded there.

Self-hostability remains a locked architectural direction under Project Contract Law 12 and the managed/self-hostable ADR. Deferring installable VPS/Compose packaging beyond 2.0 changes release sequencing only; it does not authorize a mandatory central service or weaken independent-instance architecture.

The completed 2.0 implementation sequence remains in `docs/roadmap/post-1.0-roadmap.md`. Current post-2.0 direction and sequencing are governed by `docs/roadmap/3.0-roadmap.md` once routed through `BOOT.md`.
