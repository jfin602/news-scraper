# Distribution and Integration Contract

**Status:** Current approved 2.0 architecture; implementation roadmap active
**Adopted:** 2026-08-20
**Completed:** 2026-08-20

## Authority and required path

A **Distribution Profile** is a first-class installation-owned, administrator-controlled selection over the singleton Publication's canonically eligible Articles. Profiles and Sources are peer top-level resources; multiple Profiles do not create Publications, customers, or tenancy.

```text
approved Sources → collection / normalization / persistence → canonical outward eligibility
→ Distribution Profile → authenticated GET /api/v1/distribution/{profile_key}
→ scheduled generic PHP synchronization → validated local last-known-good snapshot
→ server-rendered customer website → direct stored publisher originalUrl links
```

Wire, authentication, cursor, and compatibility details are governed by `distribution-api-contract.md`.

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

## Generic PHP integration and last-known-good state

The generic PHP integration is required for 2.0 and has a synchronization/cache client, normalized local Profile-data access, and an optional safe fallback server-rendered renderer. It synchronizes complete bounded Profile snapshots:

```text
start candidate → fetch every cursor page → validate schema/profile/API version/snapshotRevision
→ validate complete candidate → atomically activate → preserve prior recoverable state where practical
```

Partial, invalid, or mixed-revision candidates MUST NOT become visible. Synchronization locks per Profile, prevents overlap, uses bounded retries, respects `Retry-After`, and supports conditional initial requests. Default cadence is 15 minutes and is customer-configurable. `snapshot_changed` discards the candidate, preserves active state, and restarts within bounded retry rules.

Each Profile has independent candidate and active state. Cache metadata SHOULD include Profile key, API version, `snapshotRevision`/ETag, upstream `generatedAt`, last successful local sync, and health/freshness facts. Credentials MUST NOT be stored in cache payloads.

Freshness and usability are distinct. Stale valid output remains renderable by default with no hard cutoff. Customers MAY configure a maximum stale age; once exceeded, or before any valid snapshot exists, render the configured safe empty/unavailable fallback. Public rendering reads local active state only and MUST NOT make a synchronous News Scraper API request.

Network errors, timeouts, `401`, `429`, `5xx`, malformed/partial candidates, and exhausted `snapshot_changed` retries preserve active state under the stale policy. Only authenticated `409 profile_disabled` suppresses otherwise usable cached public output.

## Adapter, presentation, and link boundaries

Adapters MAY own connection settings, credentials, synchronization, local storage/locking, rendering, CSS/classes, fallback templates, and presentation extension points. They MUST NOT own Source trust/admission, Relevance or Category semantics, moderation, eligibility, Primary selection, Profile interpretation, ordering, or destination semantics.

Fallback output SHOULD be normal server-rendered HTML. Core anchors use exact stored `originalUrl`, require no JavaScript, and do not use News Scraper tracking redirects. Ordinary editorial external links are unqualified by default; externality alone does not add `nofollow`. Customers own sponsored/UGC/nofollow treatment, canonical tags, sitemap, robots directives, page titles, surrounding copy, site architecture, and SEO strategy.

News Scraper MUST NOT guarantee SEO improvement, backlink value, or PageRank transfer; automate reciprocal links; condition inclusion on backlinks; impose backlink quotas; or keyword-stuff anchors. The supported claim is limited to crawlable server-rendered direct publisher links.

## Later adapters and telemetry

WordPress and RSS/Atom are post-2.0. A later WordPress adapter builds on the WordPress-independent generic PHP core and owns only CMS concerns. Later RSS/Atom is an optional bare-bones public fallback per Profile, explicitly enabled and disabled by default, using the same read model. It is not a selector engine; secret-bearing feed URLs are prohibited and authenticated consumers use JSON.

2.0 telemetry is operational, not visitor analytics. Bounded API facts SHOULD include Profile key, API version, status, duration, item/page information, non-secret credential identity, auth/rate/missing/disabled/failure categories, and client version. PHP health SHOULD include attempts/success, duration, items/pages, freshness/stale age, unchanged result, failure category, and adapter version. Tokens, Authorization headers, secrets, and sensitive payloads MUST NOT be logged. Click, referral, visitor, page-view, reader-identity, backlink-performance, and tracking-redirect analytics are excluded. Telemetry remains locally operable.

## 2.0 boundary

The required 2.0 consumer is the v1 API plus generic PHP scheduled sync, last-known-good cache, and customer-style server-rendered output. Browser widgets, WordPress, RSS/Atom, Linux VPS/Docker Compose self-host packaging, native self-host admin authentication, autonomous public self-host production readiness, SSO/multi-admin identity, visitor analytics, advanced SEO tooling, Kubernetes/multi-node deployment, delta synchronization, and additional adapters are post-2.0.

`2.0.0` requires administrator-configurable Profiles with immutable keys, lifecycle, explicit Source associations and bounded filters; one canonical distribution read model; bearer credential generation/rotation/revocation and `distribution:read`; rate/abuse protection; stable v1 schema and snapshot/cursor consistency; generic PHP complete-snapshot traversal, per-Profile locking, atomic LKG activation, optional stale cutoff and fallback SSR; operational telemetry; and supported production forward migration plus backup/restore compatibility.

Release proof requires a real managed external customer-style integration from approved Source collection through canonical/Profile selection, authenticated pagination, complete validated PHP activation, local server rendering with no visitor-path API request, and direct stored publisher links. It must also show that upstream failure, invalid/partial candidates, and revision changes do not replace active LKG, while authoritative Profile disable suppresses cached public rendering.

Self-hostability remains a locked architectural direction under Project Contract Law 12 and the managed/self-hostable ADR. Deferring the installable VPS/Compose package beyond 2.0 changes release sequencing only; it does not authorize a mandatory central service or weaken independent-instance architecture.

The active implementation sequence and version lifecycle are governed by `docs/roadmap/post-1.0-roadmap.md`.
