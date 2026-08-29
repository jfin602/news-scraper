# Distribution and Integration Contract

**Status:** Current approved 2.0/Phase 1 distribution behavior plus owner-approved Phase 2 / `2.2.x` PHP package target where explicitly stated below  
**Adopted:** 2026-08-20  
**Completed 2.0 baseline:** 2026-08-27  
**Updated:** 2026-08-29 for Phase 2 PHP integration/package alignment

## Authority and required path

A **Distribution Profile** is a first-class installation-owned, administrator-controlled selection over the singleton Publication's canonically eligible Articles. Profiles and Sources are peer top-level resources; multiple Profiles do not create Publications, customers, or tenancy.

Under the 2026-08-27 Publication amendment, one singleton Publication may contain multiple related subject verticals or feed sections belonging to one customer/editorial property. Distribution Profiles are the supported independently configured feed/section boundary for those verticals and MAY use disjoint or overlapping Source membership. This changes no Profile eligibility, persistence, or tenancy semantics.

```text
approved Sources → collection / normalization / persistence → canonical outward eligibility
→ Distribution Profile → authenticated GET /api/v1/distribution/{profile_key}
→ scheduled generic PHP synchronization → validated local last-known-good snapshot
→ normalized local-read → customer server-rendered website → direct stored publisher originalUrl links
```

The completed Phase 1 digest state composes into that same Profile snapshot path after canonical Profile selection. It does not create another distribution protocol.

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

The generic PHP integration is the implemented 2.0 customer integration core and has a synchronization/cache client plus normalized local Profile-data access. Phase 2 / `2.2.x` is the approved hardening target for that package. Until the Phase 2 implementation lands, `integrations/php/README.md` remains the implementation-truth guide for the currently shipped package; this contract defines the behavior the Phase 2 package must satisfy.

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

The active digest is part of the same complete outward Profile snapshot and the same PHP LKG candidate/activation lifecycle as Articles. The integration MUST NOT introduce a parallel digest cache, separate digest state directory, second digest sync file, digest-specific customer cron, or visitor-time upstream read.

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

## Phase 2 configuration and customer-entry boundaries

The supported package layout separates replaceable package code from durable customer-owned private state:

```text
<customer home>/
├── ns-integration/        # replaceable package-owned code
└── ns-private/            # durable customer-owned private configuration/state
    ├── local-read.env
    ├── sync.env
    ├── state/
    └── logs/
```

`ns-private/local-read.env` is the single authoritative source for shared non-secret integration settings needed by both synchronization and visitor local-read behavior, including the Profile key, state root, cadence/freshness settings, and other explicitly shared non-secret values. `ns-private/sync.env` contains synchronization-only upstream URL, bearer credential, transport limits, and other sync-only values.

The stable packaged `ns-integration/run-sync.php` launcher MUST load both the authoritative shared `local-read.env` and synchronization-only `sync.env`, then delegate to the canonical packaged synchronization entrypoint while preserving supported CLI arguments such as `--force`. Ordinary visitor/local-read code MUST load only `local-read.env` and MUST NOT require read access to `sync.env`, the bearer credential, upstream URL, or other synchronization-only secrets.

For upgrade compatibility, legacy duplicated shared keys in `sync.env` MAY be recognized temporarily only as validation aliases. If present, each duplicated value MUST exactly agree with the authoritative `local-read.env` value or configuration loading fails clearly. Legacy aliases MUST NOT become a second source of truth, and the canonical documented layout removes them.

The package MUST expose a stable package-owned customer local-read entry boundary over normalized local data. Customer code, including the shipped `top-tag.php`, MUST NOT need to require `src/bootstrap.php`, individual internal source files, cache/generation/manifest paths, or other package-internal layout. Internal organization MAY evolve behind the stable customer boundary without changing canonical local-read semantics.

## Adapter, presentation, and link boundaries

Adapters MAY own connection settings, credentials, synchronization, local storage/locking, normalized customer-data access, diagnostics, and safe instructional fallback/example presentation. They MUST NOT own Source trust/admission, Relevance or Category semantics, moderation, eligibility, Primary selection, Profile interpretation, ordering, or destination semantics.

Customer presentation code consumes normalized local-read data. News Scraper/integration code owns synchronization, LKG persistence, validation, normalization, configuration loading, and safe data exposure; the customer owns final HTML, CSS/classes, layout, placement, surrounding copy, and site-specific composition.

Phase 2 removes the bundled/local `LocalProfileRenderer` / `FallbackHtmlRenderer` abstraction as a supported authoritative customer presentation API. The package instead supplies a customer-editable root-level `top-tag.php` as its safe first-party fallback/reference presentation required by Project Contract Law 13. That file is instructional customer-owned markup rather than a renderer authority: it consumes only the stable normalized local-read boundary, produces a minimal useful server-rendered Article/digest presentation, escapes untrusted content for the HTML context, preserves canonical Profile order, and links through exact stored `originalUrl` values.

`top-tag.php` MUST be intentionally easy to inspect and change. Its PHP/HTML should expose actual HTML elements directly on separate source lines rather than hiding the presentation inside one opaque concatenated renderer string. Customers may copy, edit, or replace it without reimplementing collection, synchronization, trust, eligibility, duplicate suppression, Profile semantics, or destination selection.

Customer presentation code and examples MUST NOT merge, re-filter, rerank, deduplicate, reinterpret Source trust, re-run Relevance/Category logic, or otherwise become a competing editorial/eligibility authority.

Core anchors use exact stored `originalUrl`, require no JavaScript, and do not use News Scraper tracking redirects. For digest supporting Articles, headline, Source display name, `effectiveFeedDate`, and exact `originalUrl` are application-resolved canonical data, never trusted model-authored metadata.

Ordinary editorial external links are unqualified by default; externality alone does not add `nofollow`. Customers own sponsored/UGC/nofollow treatment, canonical tags, sitemap, robots directives, page titles, surrounding copy, site architecture, and SEO strategy.

News Scraper MUST NOT guarantee SEO improvement, backlink value, or PageRank transfer; automate reciprocal links; condition inclusion on backlinks; impose backlink quotas; or keyword-stuff anchors. The supported claim is limited to crawlable server-rendered direct publisher links.

A customer MAY render several Profiles on separate pages, separate sections, or one page. Presentation composition does not authorize PHP/customer code to merge, re-filter, rerank, or reinterpret Article eligibility outside the normalized Profile results it receives.

When local `digest === null`, the default integration semantics are simply absence of digest data. Provider errors are not injected into public presentation. When a digest is `older`, customer markup MAY identify it honestly as an older AI summary using its truthful original generation timestamp.

## AI assistance extension

Optional AI assistance is governed exclusively by `ai-assistance-contract.md`.

AI consumes canonical Profile output downstream of the rules in this contract. It MUST NOT be used as a Profile selector, Relevance rule, Category rule, moderation rule, duplicate rule, ordering authority, or Source trust/admission mechanism.

Phase 1 propagates the active nullable Profile digest through the existing v1/PHP/LKG/local-read path as part of the complete Profile snapshot. Ordinary public Article/digest rendering remains local-only and non-AI-dependent.

Interactive chat is a later separate explicit user action and must use its separately governed authorization/cost/failure boundary. It does not change the ordinary complete-snapshot digest delivery contract.

## Phase 2 package, version, preflight, upgrade, and rollback contract

The protected administrator surface supplies one version-matched PHP integration ZIP whose extraction creates a replaceable `ns-integration` directory directly. The package contains at minimum authoritative `VERSION` and `integration-package.json` metadata, package documentation including `UPGRADE.md`, stable `run-sync.php`, customer-editable root `top-tag.php`, the canonical synchronization/local-read runtime, and configuration examples. Durable `ns-private` configuration/state is never included in or overwritten by package extraction.

The exact offered package version has one authority. The ZIP filename, packaged `VERSION`, `integration-package.json`, protected admin download label, and installed diagnostic/preflight result MUST all derive from the same package-owned authoritative version metadata rather than separately typed constants. The protected admin download control must visibly identify the exact package version directly in or immediately adjacent to the download action.

The package MUST provide a bounded non-secret, non-destructive preflight/diagnostic path that can verify package identity/version, required PHP/runtime prerequisites, private configuration readability/shape, authoritative shared/sync configuration consistency, and state-root usability before cutover. Preflight MUST NOT print bearer credentials, Authorization values, secret-bearing configuration, raw LKG payloads, or sensitive filesystem internals. Any upstream connectivity/authentication check is explicit/opt-in and remains secret-safe. Preflight success proves setup only; it is not synchronization/LKG/customer-rendering evidence.

The supported remote upgrade is whole-directory replacement while preserving `ns-private`, credentials, LKG/state, customer markup, and the stable cron target. To minimize missing-package and mixed-file windows, the preferred File-Manager/cPanel-compatible procedure is staged cutover:

1. download the exact versioned ZIP from the protected admin surface and note its displayed version;
2. extract the new package into a sibling staging directory without modifying the live `ns-integration` or durable `ns-private`;
3. verify staged `VERSION` and diagnostic/preflight report the same exact admin-displayed version against the existing private configuration/state;
4. verify the staged package contains the stable `run-sync.php` and supported local-read/customer entry boundary;
5. rename the current live `ns-integration` to a bounded backup name;
6. rename the fully extracted/preflighted staged package directory to `ns-integration`;
7. verify the unchanged cron target, existing customer page, ordinary Article output, and direct stored publisher destinations through the new package;
8. leave the cron schedule, machine credential value, state root, and LKG/state data unchanged; any one-time legacy private-config normalization must preserve values and be explicitly documented;
9. allow the next normal synchronization to consume the current digest-capable snapshot.

If the hosting/File-Manager environment cannot stage under the final directory name, documentation MAY adapt the mechanical extraction/rename steps while preserving the same invariants: never overlay mixed old/new package files, do not overwrite `ns-private`, minimize the period without a live `ns-integration`, and preflight the complete replacement before final cutover whenever the host permits it.

Rollback is directory-level: remove/rename the failed new `ns-integration`, restore the immediately prior backup as `ns-integration`, leave `ns-private` intact, and preserve the same cron target. Upgraded local state MUST remain additive/backward-readable enough that restoring the immediately previous supported package does not require deleting or reconstructing private configuration/LKG merely because digest-capable state was synchronized.

The package refresh requires no customer Gemini key, no new News Scraper machine credential, no customer database, no second synchronization system, and no new digest cron.

## Later adapters and telemetry

WordPress and RSS/Atom were post-2.0 and remain outside the currently committed 3.0 scope unless explicitly promoted. A later WordPress adapter builds on the WordPress-independent generic PHP core and owns only CMS concerns. Later RSS/Atom is an optional bare-bones public fallback per Profile, explicitly enabled and disabled by default, using the same read model. It is not a selector engine; secret-bearing feed URLs are prohibited and authenticated consumers use JSON.

2.0 telemetry is operational, not visitor analytics. Bounded API facts SHOULD include Profile key, API version, status, duration, item/page information, non-secret credential identity, auth/rate/missing/disabled/failure categories, and client version. PHP health SHOULD include attempts/success, duration, items/pages, freshness/stale age, unchanged result, failure category, and exact installed package/adapter version where exposed. Tokens, Authorization headers, secrets, and sensitive payloads MUST NOT be logged. Click, referral, visitor, page-view, reader-identity, backlink-performance, and tracking-redirect analytics are excluded. Telemetry remains locally operable.

AI telemetry additions are governed by `ai-assistance-contract.md` and remain bounded/secret-safe rather than becoming visitor analytics. Digest attempt/provider failure diagnostics remain in the protected operator plane; public/customer presentation does not expose raw provider errors.

## Completed 2.0 boundary

The 2.0 consumer baseline is the v1 API plus generic PHP scheduled sync, last-known-good cache, normalized local-read access, and customer server-rendered output. Browser widgets, WordPress, RSS/Atom, Linux VPS/Docker Compose self-host packaging, native/default self-host admin authentication, autonomous public self-host production readiness, SSO/multi-admin identity, visitor analytics, advanced SEO tooling, Kubernetes/multi-node deployment, delta synchronization, and additional adapters were not required for `2.0.0`.

`2.0.0` established administrator-configurable Profiles with immutable keys, lifecycle, explicit Source associations and bounded filters; one canonical distribution read model; bearer credential generation/rotation/revocation and `distribution:read`; rate/abuse protection; stable v1 schema and snapshot/cursor consistency; generic PHP complete-snapshot traversal, per-Profile locking, atomic LKG activation, optional stale cutoff and fallback SSR; operational telemetry; and supported production forward migration plus backup/restore compatibility.

The accepted customer integration and Phase 7 owner exception are recorded in the durable 2.0 validation history. Historical qualification claims remain limited to the evidence actually recorded there.

Self-hostability remains a locked architectural direction under Project Contract Law 12 and the managed/self-hostable ADR. Deferring installable VPS/Compose packaging beyond 2.0 changes release sequencing only; it does not authorize a mandatory central service or weaken independent-instance architecture.

The completed 2.0 implementation sequence remains in `docs/roadmap/post-1.0-roadmap.md`. Current post-2.0 direction and sequencing are governed by `docs/roadmap/3.0-roadmap.md` once routed through `BOOT.md`.