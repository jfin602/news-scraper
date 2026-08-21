# Public Feed and Admin Contract

## Current product-role interpretation

This contract governs the **existing outward/public surfaces** implemented through `1.0.1`: `GET /api/feed`, the bundled/reference `GET /` frontend, and the current managed/reference Cloudflare-protected administrator UX described below.

The 2026-08-19 headless product shift does not remove these surfaces or weaken their Article-selection rules. It changes their product role. Under the amended Project Contract and `docs/decisions/headless-distribution-product-boundary.md`, `/` is canonical **for the bundled reference/standalone frontend**, not every customer website. `GET /api/feed` remains the supported reference/legacy JSON feed and is not the permanent integration API.

Distribution Profiles and PHP/custom integrations are governed by `distribution-and-integration-contract.md`; the permanent `GET /api/v1/distribution/{profile_key}` interface is governed by `distribution-api-contract.md`. They reuse canonical eligibility but are independent of Publication `public_status`. WordPress and RSS/Atom are post-2.0. None may redefine Source trust, visibility, duplicate, moderation, ordering, or `original_url` semantics.

## Public-feed purpose

The bundled public experience is a fast, readable index of recent relevant headlines. It promotes discovery and sends readers to the original publisher.

A deployed installation hosts exactly one Publication. The deployment itself identifies the news product/topic; public readers do not select among Publications.

## Feed eligibility

Ordinary public rows require all of the following:

- the singleton Publication configuration has `public_status = public`;
- the owning Source has approval state `approved` and lifecycle state `active`;
- the Article is `visible`; and
- the Article is either `ungrouped` or the `primary` member of a Duplicate group.

Visible `non_primary` members remain stored and administratively accessible but are duplicate-suppressed from ordinary rows. Hidden/archived Articles are not feed-eligible.

Source/Category filters, literal keyword search, and keyset pagination operate only over this canonical feed-eligible stream. They MUST NOT resurrect a visible `non_primary` member, and duplicate processing MUST NOT create a parallel public-feed query or eligibility path. Related coverage remains separate and stored `original_url` remains the headline destination.

Articles outside Duplicate groups are `ungrouped` and use the same eligibility rule rather than a feed-only exception.

Collection eligibility and public-feed eligibility are separate. `active_for_collection`, Source operational state (`enabled`/`paused`/`disabled`), endpoint operational/lifecycle/health state, and the success/failure of current collection attempts do not by themselves suppress an already-persisted otherwise-eligible Article. Retained provenance remains readable while collection is paused or failing. Source approval and Source lifecycle remain public-row trust/lifecycle gates as stated above.

## Single-Publication deployment boundary

Each deployed installation contains one singleton Publication configuration as its topic/editorial boundary.

- Publication configuration owns installation-wide name, collection/public state, branding/feed settings, Categories, Relevance rules, Sources, Source priority, and presentation settings.
- Publication is not a relational tenant/ownership key. Public-feed, Source, Article, Category, Relevance, duplicate, scheduler, admin, and future distribution-consumer behavior MUST NOT require a Publication UUID/slug/foreign key merely to scope the one installation.
- Public/reference routing MUST NOT require a Publication slug or expose a topic-selection surface.
- Concurrent multi-Publication/topic hosting inside one installation is not supported behavior.
- A different topic is served by another configured deployment of the same topic-independent codebase.
- Multiple outward consumers for one Publication do not imply or authorize Publication tenancy.

## Basic public-feed backend

The current canonical JSON public/feed endpoint is:

`GET /api/feed`

The endpoint MUST:

- use the installation's singleton Publication configuration without requiring a reader-supplied Publication identifier or slug;
- expose rows only when `public_status = public`;
- apply the canonical feed-eligibility rule above in the database-backed read path;
- return a bounded server-defined recent window rather than an unbounded Article set;
- use deterministic effective-feed-date ordering;
- return `200` with an empty item list when the configured public Publication exists but has no eligible Articles;
- return a generic `404` when singleton Publication configuration is absent or non-public, without revealing private configuration detail;
- return bounded generic dependency/read failures without SQL, stack traces, database connection details, or other secrets;
- require no reader authentication.

The basic item read model is intentionally small. Each item exposes only the fields needed by the basic feed:

- stable Article identifier;
- effective feed date;
- feed-date source: `published_at` or fallback `first_seen_at`;
- Article `display_title` as the headline;
- Source display name;
- stored Article `original_url` as the external destination.

The canonical public response exposes the bounded public Publication presentation values required by the bundled `/` frontend: required `name` plus nullable `description`, `logoPath`, and `accentColor` corresponding to the singleton persisted configuration defined by the domain contract. These values are inert presentation data, not HTML/CSS/code, and do not create a reader-selectable Publication identity. The response MUST NOT expose or depend on a Publication UUID/slug as a routing/scoping identity, and MUST NOT expose Raw items, Article observations, internal identity digests, normalized-title matching fields, database internals, unbounded summaries/content, or other fields merely because they are stored.

Deterministic discovery and pagination extend this same endpoint/read-model boundary. They do not create a parallel feed query, eligibility rule, or alternate Article-selection authority. Ranking and presentation/theme behavior remain separate concerns.

The accepted Phase 8 validation artifact remains evidence for the slug-scoped endpoint that existed at its accepted source SHA. The Phase 10 entry singleton implementation correction removes that implementation drift and supplies new evidence for this canonical endpoint; the historical artifact is not rewritten.

## Basic public-feed UI

The canonical route for the bundled/reference frontend is:

`GET /`

The `1.0.1` server-rendering implementation makes the initial root response server-rendered. The page MUST:

- represent the installation's singleton Publication configuration and remain topic independent in shared code;
- obtain the initial public state through the same canonical public-feed application/read-model boundary used by `GET /api/feed`, rather than introducing a second Article-eligibility, ordering, filtering, cursor, or database-query authority;
- preserve the same Publication public-exposure, Source trust/lifecycle, Article visibility, bounded-window, effective-date, ordering, duplicate suppression, discovery, and `original_url` destination rules as the canonical feed endpoint;
- render configured Publication name and available bounded public presentation data directly into the initial HTML response when the public read succeeds;
- render the canonical first page of current Article rows directly into the initial HTML response, including effective date, headline, Source name, and exact stored `original_url` headline destination;
- render supported root discovery criteria (`q`, `source`, and `category`) server-side when supplied, using the same normalized request semantics as the canonical public feed;
- require no reader authentication;
- render explicit populated, empty, unavailable/not-found, invalid-discovery, and bounded dependency/error states without leaking private Publication configuration or backend details;
- treat absent singleton Publication configuration and non-public configuration as the same generic unavailable/not-found public-page state, consistent with the API's generic `404` behavior;
- escape untrusted Publication, Article, Source, and discovery text for its HTML output context and preserve the content-safety/CSP requirements in the operations contract;
- link each headline directly to the stored Article `original_url` supplied by the public-feed read model;
- provide the core desktop `Date | Headline | Source` presentation and an accessible responsive stacked mobile presentation;
- remain useful for first-page reading and discovery navigation when JavaScript is unavailable or delayed;
- avoid Source collection in Web/API page handling; collection remains Worker-owned.

The successful initial page MUST NOT depend on client JavaScript or a secondary HTTP request to construct its Publication identity or first Article page. JavaScript MAY progressively enhance the already-rendered state for discovery transitions, history behavior, theme controls, load-more continuation, and other interaction, but it MUST NOT create a competing feed interpretation or discard correct server-rendered content merely to refetch the same first page.

### Root HTML status semantics

The root HTML surface mirrors the public feed's bounded outcome classes rather than returning a successful shell for every condition:

- a populated or empty valid public result returns `200`;
- malformed, repeated/ambiguous, unsupported, or out-of-bound discovery input returns bounded generic `400` HTML;
- absent singleton Publication configuration or non-public Publication state returns bounded generic `404` HTML without revealing private state;
- dependency/read failure returns bounded generic `503` HTML without SQL, stack traces, connection details, or other secrets.

The body for each outcome remains useful and presentation-consistent, but HTTP status is not hidden behind JavaScript state.

The obsolete pre-production route `GET /publications/:publicationSlug` is not a supported public product surface. The Phase 10 entry correction removes that implementation path rather than preserving a compatibility alias without an explicit requirement.

Optional singleton `presentation_timezone` is persisted and editable through the protected Phase 15 administrator surface. When configured it MUST be a valid IANA time-zone identifier; absence preserves UTC calendar-date presentation from `effectiveFeedDate`. It changes presentation only and MUST NOT rewrite stored timestamps, change canonical feed ordering, create routing/tenancy identity, or introduce locale, arbitrary date-template, time-format, or general formatting configuration.

The discovery controls and navigation behavior below preserve this same page/read-model boundary.

The accepted Phase 9 validation artifact remains authoritative evidence for the slug-addressed route that was actually tested at its source SHA. It MUST NOT be edited to claim root-route evidence that was not observed; the singleton implementation correction owns the new root-route evidence.

## Feed date and ordering

The canonical effective feed date is:

1. trusted parsed `published_at` when present;
2. otherwise `first_seen_at`.

The read model MUST expose which source produced the effective date so fallback use is detectable. Missing or invalid Source publication dates do not become fabricated `published_at` values.

Ordinary rolling-feed ordering is deterministic and reverse chronological by effective feed date. For equal effective dates, Phase 8 orders by `first_seen_at` descending and then stable Article identifier as the final deterministic tie-breaker. Phase 12 search/filtering and pagination MUST preserve this same ordering; discovery criteria filter the eligible chronological stream rather than reranking it.

Pinning/featured-story ordering is deferred beyond MVP. MVP chronological ordering therefore has no pin exception.

## Desktop feed

The default desktop presentation MUST support the customer's core three-column concept:

| Date         | Headline                 | Source      |
| ------------ | ------------------------ | ----------- |
| Aug. 6, 2026 | Linked original headline | Source name |

Requirements:

- reverse-chronological ordering by effective feed date;
- headline is dominant interactive element;
- headline links directly to the Article's stored `original_url`;
- Source identity is clear;
- until Publication presentation settings exist, calendar-date rendering uses the UTC fallback defined above;
- empty and error states are explicit, while a successful initial response is already resolved in server-rendered HTML rather than beginning in an application loading state.

## Mobile feed

Mobile MUST not force a compressed desktop table. A compact stacked item is appropriate:

```text
AUG 6 · SOURCE NAME
Linked article headline
```

Tap targets, wrapping, Source identification, and external-link behavior must remain accessible.

The completed presentation provides the governed responsive/accessibility behavior below.

## Search, filters, and pagination

`GET /api/feed` and the bundled root page provide deterministic discovery while preserving the feed-eligibility and chronological-order laws above.

### Public discovery inputs

The current API supports these optional query parameters:

- `q` — bounded keyword search;
- `source` — one Source filter;
- `category` — one Category filter;
- `cursor` — opaque continuation cursor for load-more/keyset pagination.

The root page accepts the supported first-page discovery dimensions `q`, `source`, and `category` and server-renders their corresponding initial result state. The current `1.0.1` reference frontend does not promote cursor-depth continuation into crawlable/no-JavaScript navigation. Any later evolution of reference-frontend continuation is subject to the replacement roadmap rather than the retired former Phase 1 plan.

Each discovery parameter represents one logical value. Repeated/ambiguous forms, malformed encodings, unsupported values, invalid cursors, or values outside the implementation's documented bounds MUST fail with bounded generic `400` behavior rather than being silently reinterpreted. Existing generic `404` behavior for absent/non-public singleton Publication state and bounded dependency-error behavior remain unchanged.

When no discovery parameter is supplied, `GET /api/feed` represents the unfiltered first page of the same canonical feed and preserves the established eligibility, ordering, public-state, and error semantics. `GET /` server-renders that same first-page state.

### Source and Category filters

- Public Source and Category filter identity MUST use immutable `config_key` values, not database UUIDs or mutable display labels.
- The current feed supports at most one Source filter and one Category filter at a time.
- When multiple discovery dimensions are supplied, `q`, `source`, and `category` compose with logical AND: a returned Article must satisfy every supplied criterion in addition to ordinary feed eligibility.
- Category filtering uses the Article's effective current Category membership, including an active Phase 17 manual Category override. Historical observation/category reasons alone do not make an Article currently match a Category filter. Clearing an override restores the latest current automatic membership; an intentionally empty active manual set, if represented, matches no Category.
- Source filtering MUST NOT weaken the ordinary Source approval/lifecycle eligibility gates.
- Public discovery metadata may expose bounded Source/Category choices needed by the UI using only stable public identity and display data such as `{ configKey, displayName }`. Internal database IDs, rule internals, observations, or private configuration are not public filter metadata. Public Source choices MUST NOT expose unapproved or archived Sources.

### Keyword search

Keyword search is a filtering operation, not a ranking operation.

- `q` is trimmed/normalized at the public-input boundary and bounded before it reaches the database query.
- Matching is deterministic case-insensitive literal substring matching, not regular expression, glob, stemming, fuzzy, semantic/AI, or general expression behavior.
- Search may inspect the Article headline representations and other explicitly safe normalized textual Article metadata available to the canonical feed query, such as author or summary when present. Missing optional metadata simply does not match.
- Search MUST NOT expose those internal searchable fields merely because they participate in matching.
- Search MUST NOT alter the canonical chronological ordering of matching rows.

### Keyset cursor contract

Public discovery uses bounded keyset/load-more pagination rather than offset-based pagination.

- Page size remains server-defined and bounded; there is no public `limit` parameter.
- A response with more matching rows available exposes a nullable opaque `nextCursor` or equivalent continuation value.
- Cursor contents are an implementation detail but MUST be versioned/validated and encode enough state to continue strictly after the last returned row under the canonical order tuple: effective feed date descending, `first_seen_at` descending, then stable Article identifier.
- A cursor MUST be bound to the normalized `q`/`source`/`category` criteria under which it was issued. Reusing it with different discovery criteria is invalid rather than silently continuing a different result set.
- Under a static database snapshot/result set, walking pages with returned cursors MUST neither repeat nor omit matching rows because of ordering ties.
- Newly arriving Articles may appear on a later fresh first-page request; pagination does not promise a frozen historical snapshot across concurrent collection. It MUST still preserve keyset ordering and must not reintroduce offset-style instability.

### Browser URL and reset behavior

- The root public page reflects active `q`, `source`, and `category` discovery state in the URL where those controls are active, so direct navigation/refresh server-renders the same filters/search before JavaScript enhancement.
- The discovery form MUST remain usable as ordinary root `GET` navigation without JavaScript for `q`, `source`, and `category`; JavaScript MAY intercept/enhance the same navigation when available.
- A no-JavaScript Reset path returns to `/` and the unfiltered first page.
- Current no-JavaScript scope is first-page reading, direct publisher navigation, first-page `q`/Source/Category discovery, and Reset. No-JavaScript continuation to older results is not part of the current `1.0.1` reference frontend.
- Load-more cursor depth does not currently become canonical shareable root URL state. Existing JavaScript continuation remains governed by the opaque cursor contract unless a future approved roadmap changes that reference-frontend behavior.
- Changing `q`, `source`, or `category` starts again from the first page and discards any previous continuation cursor/items from the earlier criteria.
- A clear Reset action removes all discovery criteria and returns the page to the unfiltered first-page feed state.
- Browser back/forward navigation restores the URL-reflected discovery criteria and corresponding feed state rather than leaving stale controls/results.
- Empty filtered/search results remain a normal public `200` feed state and do not become Publication-unavailable behavior.

## Theme, branding, and Phase 13 presentation behavior

The bundled/reference frontend requires configuration-driven public presentation without changing feed semantics.

### Publication presentation configuration

The public page uses the singleton Publication presentation fields defined by the domain contract:

- required Publication `name`;
- optional bounded plain-text `description`;
- optional bounded same-origin `logo_path`, exposed publicly as `logoPath`;
- optional canonical sRGB `accent_color` in `#RRGGBB` form, exposed publicly as `accentColor`;
- Category labels already supplied by the canonical public discovery metadata.

Missing optional branding values MUST degrade to a complete generic presentation rather than causing page/API failure. Publication branding is data/configuration; shared engine/UI code MUST NOT embed indie-author-specific names, copy, logos, colors, or topic conditionals.

The canonical read model exposes these minimum public values, and Cloudflare-protected administration edits them.

### Theme selection

The public page supports three reader theme selections: `system`, `light`, and `dark`.

- With no saved reader choice, effective presentation follows the browser/OS `prefers-color-scheme` value (`system`).
- An explicit reader choice overrides the current system preference and is persisted locally in that browser/device.
- Choosing `system` removes the fixed light/dark override and resumes following the current browser/OS preference.
- Theme preference is presentation-only local state. It MUST NOT change Publication configuration, feed queries, URL discovery criteria, server-side reader identity, or Article eligibility/order.
- Both effective light and dark presentations must satisfy the accessibility requirements below.

### Accessibility and responsive target

Phase 13 established the WCAG 2.2 Level AA target for the bundled root public-feed experience. At minimum:

- interactive controls use appropriate native/semantic elements and are operable by keyboard without a keyboard trap;
- focus order remains coherent and `:focus-visible` or equivalent focus indication is clearly visible in both themes;
- text, interactive controls, state indicators, and focus treatments satisfy applicable AA contrast requirements;
- desktop/mobile layouts wrap long headlines, Source names, Category labels, and discovery values without destructive overlap or horizontal page overflow under the supported responsive range;
- tap/click controls satisfy the applicable WCAG 2.2 AA target-size requirement or permitted spacing exception;
- status/loading/error presentation remains understandable to assistive technology and does not rely only on color;
- animation honors `prefers-reduced-motion`; any loading indicator used for enhanced transitions remains understandable without requiring continuous motion.

The exact typography, spacing, visual hierarchy, token values, component shapes, and approved aesthetic treatment belong to durable `docs/design/` guidance and remain subordinate to this behavioral contract.

### Initial server-rendered presentation and later loading states

A successful initial `GET /` response MUST already contain the configured Publication presentation and first feed page. It MUST NOT begin by visibly painting generic/unset Publication copy or an application-owned loading shell that waits for `/api/feed` before useful content appears.

JavaScript initialization MUST preserve the correct server-rendered state rather than clearing it for a duplicate first-page fetch. Loading presentation remains applicable to later JavaScript-owned search/filter transitions or continuation requests. Those later pending states may use the established accessible loading treatment, must preserve already-known appropriate Publication content, and must honor reduced-motion behavior.

Populated, empty, unavailable, invalid-discovery, continuation-error, and dependency-error behavior remain distinguishable. Server-rendered errors use the HTTP status semantics defined above; enhanced transition errors remain bounded and must not destroy unrelated already-rendered valid content.

### Presentation preservation boundary

Presentation changes may refine markup around the discovery controls/feed but MUST NOT redefine discovery behavior. In particular they preserve:

- `GET /api/feed` as the current canonical JSON feed/discovery endpoint and `/` as the bundled server-rendered reference page using the same read-model semantics;
- canonical feed eligibility and effective-date/`first_seen_at`/Article-ID chronological ordering;
- bounded literal `q`, Source, and Category filtering semantics and immutable `config_key` public identities;
- opaque query-bound keyset cursor behavior and server-defined page size;
- URL-reflected `q`/`source`/`category`, criteria-reset behavior, direct navigation/refresh, browser Back/Forward restoration, and current non-URL load-more depth;
- stale request/continuation protection and safe continuation retry behavior;
- exact stored `original_url` headline destinations.

Presentation work must keep the relevant API/database/browser regressions green rather than replacing those contracts with visually convenient alternatives.

## External destination behavior

- The Article's stored `original_url` is the primary public/outward reader destination.
- `canonical_identity_url` is an identity-comparison field and MUST NOT silently replace `original_url` as the public headline destination.
- A future separately governed Source-derived public/canonical destination field may change this only through an explicit contract decision; none exists in the basic feed.
- The default headline activation is an ordinary direct same-context browser navigation to stored `original_url`; presentation code MUST NOT force a new browsing context merely for polish. Readers retain their normal browser controls for opening links in another tab/window when desired.
- UI must not imply Platform authorship of linked content.
- External navigation is visually/accessibly understandable.
- Redirector/tracking links are not current reference-frontend behavior unless separately approved/documented.
- Broken-link handling never silently substitutes another Article.

## Public Article detail pages

A Platform-hosted detail page is not part of the current `1.0.1` reference frontend. If later implemented through an approved roadmap, it may show normalized metadata, Source attribution, Categories, and duplicate provenance, but the primary read action remains the Article's stored `original_url`. Full Article content is not reproduced without a separate rights/content contract.

## Admin delivery model

The aggregation vertical slice and basic public feed were implemented before the full administrative control plane.

Initial singleton Publication/Source configuration MAY be supplied through approved operator-maintained bootstrap/seed tooling. That mechanism does not bypass Source approval or other collection eligibility rules or compete with later operator-managed state.

Ordinary bootstrap remains create-if-absent and MUST NOT overwrite existing operator-managed Publication state. Changing committed bootstrap input alone is not a state-transition mechanism for already-created state.

Bootstrap/deployment configuration supplies one singleton Publication configuration; it MUST NOT require a slug selector or choose among multiple Publication records. Before production database compatibility was established, older pre-production databases could be recreated and bootstrapped rather than supported through an in-place upgrade path; accepted production state is now governed separately by the production-data compatibility ADR.

Administrative UI/API routes are protected by Cloudflare Access under `docs/decisions/cloudflare-access-admin-perimeter.md`.

## Admin information architecture

Administrative area SHOULD contain:

- Dashboard;
- Publication;
- Sources;
- Articles;
- Duplicate review;
- Categories and Relevance rules;
- Collection runs;
- change/audit history;
- Settings.

Navigation is single-Publication and does not expose a topic switcher. Application commands validate actual Source/endpoint/run/Article/observation/duplicate relationships and domain invariants rather than a Publication tenancy boundary.

Distribution Profiles are a governed, not-yet-implemented control-plane resource defined by `distribution-and-integration-contract.md`. They operate independently of the reference frontend's `public_status`.

## Source management UI

Authorized operators MUST be able to view/change:

- Source name/site URL/approved domains/Source priority/default Category;
- optional Source-level RSS/Atom item admission phrases;
- Source approval state and operational state;
- endpoint URL/type/parser configuration/poll interval;
- endpoint approval state and operational state;
- endpoint domain restrictions/default Category override;
- last attempt/last success/next expected check;
- derived endpoint health separately from operational state;
- recent Collection-run outcomes and bounded errors;
- manual check-now;
- approve/unapprove, enable, pause, disable, and archive/state-management actions as permitted.

The Source editor/API presents the admission filter as an include-only Source setting: no configured phrases means collect/process all otherwise-valid RSS/Atom items, while one or more bounded non-empty phrases admit an item when any phrase matches. It MUST NOT expose an exclude-phrase list or an independent enabled toggle, and MUST NOT store the configuration on individual endpoints. This is collection admission before normalization, not outward-feed filtering or Relevance management.

The Source/endpoint administration surface supports `html_listing` endpoint configuration, bounded endpoint-owned HTML listing profiles, deterministic profile-validation errors, and safe sample preview. Endpoint detail exposes the parser/adapter version, persisted profile revision, and bounded latest parser-failure diagnostics. Existing approval, lifecycle, operational, approved-domain, polling, default-Category, health, recent-run, and manual check-now controls remain governing.

The UI/API makes clear that Source RSS/Atom admission phrases apply to RSS/Atom endpoints and are not an HTML-listing admission mechanism. It exposes no Publication selector, browser collector control, arbitrary scraping script, or generic expression editor.

### Phase 18 safe selector preview

Preview accepts only a bounded operator-supplied HTML sample and draft HTML profile and invokes the pure profile-validation/static-parser path. It performs no outbound request or DNS lookup, creates no Collection run, acquires no collection lock, changes no conditional-fetch state/scheduler timing/endpoint health, and persists no Article, observation, duplicate, or Relevance state. Scripts and subresources remain inert. Responses contain only bounded extracted preview rows and safe bounded diagnostics, never an echoed unbounded/raw HTML document.

A protected preview API MAY use POST for its bounded request body. Existing request-integrity policy applies to browser-originating unsafe requests despite preview being non-persistent. Real endpoint verification remains manual check-now through the canonical governed endpoint collection path; no second preview fetcher exists. Preview proves selectors/parser behavior only, while check-now proves collection behavior. Neither is reported as Level 7 live-Source evidence unless that separate procedure is actually performed.

Physical deletion is not generic CRUD behavior when retained provenance depends on the Source/endpoint. An endpoint with no retained dependent history MAY be physically removed if the implementation supports removal. Once Collection runs, observations, or other retained provenance depend on an endpoint, an operator-facing remove action MUST preserve the record through archive/retirement semantics rather than destroying referenced provenance. Restoring archived Source/endpoint configuration continues to obey the ordinary approval, lifecycle, operational, and collectability laws and MUST NOT implicitly resume collection.

## Phase 15 Publication, Category, and Relevance administration

Authorized administrators can manage the singleton Publication `name`, `active_for_collection`, `public_status`, existing optional `description`, `logo_path`, and `accent_color` values, and optional valid-IANA `presentation_timezone`. Existing Phase 13 bounds remain in force. Absent timezone preserves UTC calendar-date presentation; a configured timezone changes presentation only, not timestamps, canonical ordering, routing, or tenancy.

Administrators can create, read, and update Categories with immutable installation-wide `config_key` and mutable bounded display labels. No Category archive state is introduced. Physical removal is allowed only when unreferenced; commands reject removal atomically while a rule target, Source/endpoint default, Article membership, retained category reason, or other retained relationship requires it. They never null, cascade, or rewrite retained Article/provenance/editorial relationships to make deletion succeed.

Administrators can manage the existing Relevance rules with immutable installation-wide `config_key`, optional real-Source scope, the existing literal predicate vocabulary, action, pattern, priority, enabled state, explanatory label/reason, and a Category target only for `categorize`. `include` and `exclude` have no Category target. Existing deterministic precedence, categorization/default fallback, and prospective-only behavior remain unchanged. Enable/disable is the ordinary non-destructive operation; destructive removal must preserve retained reason/provenance history and is rejected when it cannot. All multi-resource mutations validate relationships transactionally and roll back invalid combinations.

The managed Category set integrates with Source/endpoint default-Category controls: endpoint default overrides Source default, and defaults apply only when no categorize rule assigns a Category. Source priority remains owned by Source administration. Publication/Category/Relevance administration adds no Publication switcher, tenant scope, or native accounts/sessions/roles; Article/duplicate moderation remains a separate governed surface.

## Article management UI

Phase 17 Article administration is a bounded, deterministic, paginated read surface over stored Article instances, not the public-feed-eligible stream. Public suppression MUST NOT make a stored Article inaccessible to authorized moderation. Applicable filters include bounded literal text, Source, visibility, effective Category, and duplicate role/group/review state. Authorized operators MUST be able to:

- search/filter visible, hidden, and archived stored Article instances;
- distinguish ungrouped Articles, Primary members, non-Primary members, and Articles participating in Duplicate review state;
- inspect owning Source, endpoint, Collection-run/Article-observation provenance, retained Relevance/Category reasons, necessary identity information, duplicate signals/confidence/reasons, and current group/Primary state;
- edit optional display overrides without replacing/loss of current normalized Source-derived values;
- clear an override to reveal latest normalized Source value;
- hide/restore and categorize Articles;
- enter Duplicate review/merge/split workflows.

An active display override is separate from and takes precedence only for its governed human-facing field. Source updates continue maintaining the latest underlying normalized value and never silently overwrite or clear the override; clearing it reveals that latest value. Display overrides cannot mutate Source ownership, external/normalized identity, provenance, Source-derived publication timestamps, or `canonical_identity_url`. They do not turn `original_url` into an editable display field: outward/public output may use the effective display value while continuing to navigate to stored publisher `original_url`.

An active manual Category override is the operator-selected effective current set used by admin/public behavior and filtering. Automatic assignment/reasons continue updating underneath it; clearing returns to the latest automatic set. An intentionally empty override, if supported, is distinct from clearing.

## Duplicate review UI

Review SHOULD place candidate Articles side-by-side with:

- titles/normalized titles;
- Source names;
- URLs;
- publication times;
- summaries where available;
- match signals/confidence/reasons;
- current duplicate role/Primary selection;
- merge, split, dismiss, and choose-Primary controls.

Dismissed decisions persist so unchanged evidence does not repeatedly recreate the same review work. Manual split and choose-Primary decisions likewise outrank materially unchanged automatic evidence until intentionally revised, while all topology, Primary, visibility, Article, and provenance invariants remain intact.

## Administrative access and request integrity

- Public readers do not authenticate in the current bundled/reference frontend.
- All current managed/reference admin UI and admin API routes require the Cloudflare Access perimeter.
- The current managed/reference deployment MUST prevent direct-origin access from bypassing that perimeter.
- The application does not currently implement native administrator accounts, login/logout sessions, account recovery, roles, or per-user Publication authorization.
- State-changing admin browser actions MUST use CSRF protection or an equivalent request-integrity control.
- Administrative commands MUST validate real resource relationships and domain invariants even without per-user permissions.
- Administrative errors must not expose secrets, stack traces, or raw database details.

Cloudflare Access is not a mandatory self-hosted runtime dependency. Native/default self-host admin authentication is post-2.0; machine distribution authentication is governed separately by `distribution-api-contract.md` and MUST NOT grant administrator authority.

## Change history

Successful material moderation changes produce append-only application change/audit records sufficient to explain the action, including bounded action, target, time, reason, and bounded prior/new state where appropriate. A required record is written transactionally with its mutation and cannot claim success after validation failure or rollback. Ordinary administration cannot edit history; reads are bounded/paginated and retention/pruning follows the governed operations policy.

Current change records do not require a stable native administrator identifier or guaranteed per-user attribution. Cloudflare identity/access logs are operational evidence rather than the application's canonical domain identity.
