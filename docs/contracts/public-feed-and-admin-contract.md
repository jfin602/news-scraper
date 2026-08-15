# Public Feed and Admin Contract

## Public-feed purpose

The public experience is a fast, readable index of recent relevant headlines. It promotes discovery and sends readers to the original publisher.

A deployed installation hosts exactly one Publication. The deployment itself identifies the news product/topic; public readers do not select among Publications.

## Feed eligibility

Ordinary public rows require all of the following:

- the singleton Publication configuration has `public_status = public`;
- the owning Source has approval state `approved` and lifecycle state `active`;
- the Article is `visible`; and
- the Article is either `ungrouped` or the `primary` member of a Duplicate group.

Visible `non_primary` members remain stored and administratively accessible but are duplicate-suppressed from ordinary rows. Hidden/archived Articles are not feed-eligible.

Source/Category filters, literal keyword search, and keyset pagination operate only over this canonical feed-eligible stream. They MUST NOT resurrect a visible `non_primary` member, and duplicate processing MUST NOT create a parallel public-feed query or eligibility path. Related coverage remains separate and stored `original_url` remains the headline destination.

Before duplicate grouping exists, visible persisted Articles are logically `ungrouped` and therefore use the same eligibility rule rather than a temporary feed-only exception. Phase 8 MUST NOT invent duplicate-group/role persistence before the duplicate-grouping roadmap phase.

Collection eligibility and public-feed eligibility are separate. `active_for_collection`, Source operational state (`enabled`/`paused`/`disabled`), endpoint operational/lifecycle/health state, and the success/failure of current collection attempts do not by themselves suppress an already-persisted otherwise-eligible Article. Retained provenance remains readable while collection is paused or failing. Source approval and Source lifecycle remain public-row trust/lifecycle gates as stated above.

## Single-Publication deployment boundary

Each deployed installation contains one singleton Publication configuration as its topic/editorial boundary.

- Publication configuration owns installation-wide name, collection/public state, branding/feed settings, Categories, Relevance rules, Sources, Source priority, and presentation settings.
- Publication is not a relational tenant/ownership key. Public-feed, Source, Article, Category, Relevance, duplicate, scheduler, and admin behavior MUST NOT require a Publication UUID/slug/foreign key merely to scope the one installation.
- Public routing MUST NOT require a Publication slug or expose a topic-selection surface.
- Concurrent multi-Publication/topic hosting inside one installation is not supported MVP behavior.
- A different topic is served by another configured deployment of the same topic-independent codebase.

## Basic public-feed backend

The canonical public endpoint is:

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

The canonical public response exposes the bounded public Publication presentation values required by `/`: required `name` plus nullable `description`, `logoPath`, and `accentColor` corresponding to the singleton persisted configuration defined by the domain contract. These values are inert presentation data, not HTML/CSS/code, and do not create a reader-selectable Publication identity. The response MUST NOT expose or depend on a Publication UUID/slug as a routing/scoping identity, and MUST NOT expose Raw items, Article observations, internal identity digests, normalized-title matching fields, database internals, unbounded summaries/content, or other fields merely because they are stored.

Phase 12 extends this same endpoint/read-model boundary with deterministic discovery and pagination. It does not create a parallel feed query, eligibility rule, or alternate public endpoint. Ranking and presentation/theme behavior remain separate concerns.

The accepted Phase 8 validation artifact remains evidence for the slug-scoped endpoint that existed at its accepted source SHA. The Phase 10 entry singleton implementation correction removes that implementation drift and supplies new evidence for this canonical endpoint; the historical artifact is not rewritten.

## Basic public-feed UI

The canonical customer-visible route is:

`GET /`

The page MUST:

- represent the installation's singleton Publication configuration and remain topic independent in shared code;
- consume the canonical public-feed read model/semantics rather than introducing a second Article-eligibility, ordering, or database-query path;
- preserve the same Publication public-exposure, Source trust/lifecycle, Article visibility, bounded-window, effective-date, ordering, and `original_url` destination rules as the canonical feed endpoint;
- use descriptive Publication configuration returned by the canonical public-feed boundary rather than hard-coding the initial topic/name into shared UI behavior;
- require no reader authentication;
- render explicit loading, empty, unavailable/not-found, and dependency/error states without leaking private Publication configuration or backend details;
- treat absent singleton Publication configuration and non-public configuration as the same generic unavailable/not-found public-page state, consistent with the API's generic `404` behavior;
- link each headline directly to the stored Article `original_url` supplied by the public-feed read model;
- provide the core desktop `Date | Headline | Source` presentation and a sane stacked mobile presentation without pulling Phase 13 presentation polish forward;
- avoid Source collection in Web/API page handling; collection remains Worker-owned.

A lightweight same-origin client that fetches `GET /api/feed` is a valid implementation. Server rendering is also valid only when it reuses the same canonical public-feed read-model boundary rather than duplicating feed eligibility/query logic.

The obsolete pre-production route `GET /publications/:publicationSlug` is not a supported public product surface. The Phase 10 entry correction removes that implementation path rather than preserving a compatibility alias without an explicit requirement.

Optional singleton `presentation_timezone` is persisted and editable through the protected Phase 15 administrator surface. When configured it MUST be a valid IANA time-zone identifier; absence preserves UTC calendar-date presentation from `effectiveFeedDate`. It changes presentation only and MUST NOT rewrite stored timestamps, change canonical feed ordering, create routing/tenancy identity, or introduce locale, arbitrary date-template, time-format, or general formatting configuration.

Phase 12 adds the discovery controls and navigation behavior defined below while preserving this same page/read-model boundary. Final accessibility/responsive polish, completed light/dark theming, duplicate moderation, and admin UI remain later work.

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
- loading, empty, and error states are explicit.

## Mobile feed

Mobile MUST not force a compressed desktop table. A compact stacked item is appropriate:

```text
AUG 6 · SOURCE NAME
Linked article headline
```

Tap targets, wrapping, Source identification, and external-link behavior must remain accessible.

The tech-demo milestone may use a basic mobile layout before the later presentation-polish phase completes the full accessibility/responsive pass.

## Search, filters, and pagination

Phase 12 extends `GET /api/feed` and the root page with deterministic discovery behavior while preserving the feed-eligibility and chronological-order laws above.

### Public discovery inputs

The canonical API supports these optional query parameters:

- `q` — bounded keyword search;
- `source` — one Source filter;
- `category` — one Category filter;
- `cursor` — opaque continuation cursor for load-more/keyset pagination.

Each discovery parameter represents one logical value. Repeated/ambiguous forms, malformed encodings, unsupported values, invalid cursors, or values outside the implementation's documented bounds MUST fail with bounded generic `400` behavior rather than being silently reinterpreted. Existing generic `404` behavior for absent/non-public singleton Publication state and bounded dependency-error behavior remain unchanged.

When no discovery parameter is supplied, `GET /api/feed` represents the unfiltered first page of the same canonical feed and preserves the established eligibility, ordering, public-state, and error semantics.

### Source and Category filters

- Public Source and Category filter identity MUST use immutable `config_key` values, not database UUIDs or mutable display labels.
- MVP supports at most one Source filter and one Category filter at a time.
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

Phase 12 uses bounded keyset/load-more pagination rather than offset-based public pagination.

- Page size remains server-defined and bounded; Phase 12 does not add a public `limit` parameter.
- A response with more matching rows available exposes a nullable opaque `nextCursor` or equivalent continuation value.
- Cursor contents are an implementation detail but MUST be versioned/validated and encode enough state to continue strictly after the last returned row under the canonical order tuple: effective feed date descending, `first_seen_at` descending, then stable Article identifier.
- A cursor MUST be bound to the normalized `q`/`source`/`category` criteria under which it was issued. Reusing it with different discovery criteria is invalid rather than silently continuing a different result set.
- Under a static database snapshot/result set, walking pages with returned cursors MUST neither repeat nor omit matching rows because of ordering ties.
- Newly arriving Articles may appear on a later fresh first-page request; pagination does not promise a frozen historical snapshot across concurrent collection. It MUST still preserve keyset ordering and must not reintroduce offset-style instability.

### Browser URL and reset behavior

- The root public page reflects active `q`, `source`, and `category` discovery state in the URL where those controls are active, so direct navigation/refresh can reconstruct the same filters/search.
- Load-more cursor depth does not need to become canonical shareable URL state in Phase 12.
- Changing `q`, `source`, or `category` starts again from the first page and discards any previous continuation cursor/items from the earlier criteria.
- A clear Reset action removes all discovery criteria and returns the page to the unfiltered first-page feed state.
- Browser back/forward navigation restores the URL-reflected discovery criteria and corresponding feed state rather than leaving stale controls/results.
- Empty filtered/search results remain a normal public `200` feed state and do not become Publication-unavailable behavior.

## Theme, branding, and Phase 13 presentation behavior

Completed MVP requires configuration-driven public presentation without changing feed semantics.

### Publication presentation configuration

Phase 13 uses the singleton Publication presentation fields defined by the domain contract:

- required Publication `name`;
- optional bounded plain-text `description`;
- optional bounded same-origin `logo_path`, exposed publicly as `logoPath`;
- optional canonical sRGB `accent_color` in `#RRGGBB` form, exposed publicly as `accentColor`;
- Category labels already supplied by the canonical public discovery metadata.

Missing optional branding values MUST degrade to a complete generic presentation rather than causing page/API failure. Publication branding is data/configuration; shared engine/UI code MUST NOT embed indie-author-specific names, copy, logos, colors, or topic conditionals.

Phase 13 introduced the persistence/read-model use of these minimum public values. Phase 15 provides Cloudflare-protected administrator editing for them; the completed Phase 13 work did not pull that admin control plane forward.

### Theme selection

The public page supports three reader theme selections: `system`, `light`, and `dark`.

- With no saved reader choice, effective presentation follows the browser/OS `prefers-color-scheme` value (`system`).
- An explicit reader choice overrides the current system preference and is persisted locally in that browser/device.
- Choosing `system` removes the fixed light/dark override and resumes following the current browser/OS preference.
- Theme preference is presentation-only local state. It MUST NOT change Publication configuration, feed queries, URL discovery criteria, server-side reader identity, or Article eligibility/order.
- Both effective light and dark presentations must satisfy the accessibility requirements below.

### Accessibility and responsive target

Phase 13 targets WCAG 2.2 Level AA for the in-scope root public-feed experience. At minimum:

- interactive controls use appropriate native/semantic elements and are operable by keyboard without a keyboard trap;
- focus order remains coherent and `:focus-visible` or equivalent focus indication is clearly visible in both themes;
- text, interactive controls, state indicators, and focus treatments satisfy applicable AA contrast requirements;
- desktop/mobile layouts wrap long headlines, Source names, Category labels, and discovery values without destructive overlap or horizontal page overflow under the supported responsive range;
- tap/click controls satisfy the applicable WCAG 2.2 AA target-size requirement or permitted spacing exception;
- status/loading/error presentation remains understandable to assistive technology and does not rely only on color;
- animation honors `prefers-reduced-motion`; a loading indicator remains understandable without requiring continuous motion.

The exact typography, spacing, visual hierarchy, token values, component shapes, and approved aesthetic treatment belong to durable `docs/design/` guidance and remain subordinate to this behavioral contract.

### Initial loading presentation

While the canonical `/api/feed` request is pending, the visible page MUST present a neutral, intentional loading state and MUST NOT visibly paint generic/unset Publication copy such as a placeholder `News feed` heading that is then replaced by configured Publication content. A centered loading indicator may be used together with an accessible status message. Reduced-motion users MUST receive an equivalent non-motion loading indication. Populated, empty, unavailable, invalid-discovery, continuation-error, and dependency-error behavior must remain distinguishable after the loading state resolves.

### Phase 12 preservation boundary

Phase 13 may refine markup and presentation around the discovery controls/feed, but MUST NOT redefine Phase 12 behavior. In particular it preserves:

- `GET /api/feed` as the one canonical public feed/discovery endpoint and `/` as the canonical page;
- canonical feed eligibility and effective-date/`first_seen_at`/Article-ID chronological ordering;
- bounded literal `q`, Source, and Category filtering semantics and immutable `config_key` public identities;
- opaque query-bound keyset cursor behavior and server-defined page size;
- URL-reflected `q`/`source`/`category`, criteria-reset behavior, direct navigation/refresh, browser Back/Forward restoration, and non-URL load-more depth;
- stale request/continuation protection and safe continuation retry behavior;
- exact stored `original_url` headline destinations.

Presentation work must keep the relevant Phase 12 API/database/browser regressions green rather than replacing those contracts with visually convenient alternatives.

## External destination behavior

- The Article's stored `original_url` is the primary public destination.
- `canonical_identity_url` is an identity-comparison field and MUST NOT silently replace `original_url` as the public headline destination.
- A future separately governed Source-derived public/canonical destination field may change this only through an explicit contract decision; none exists in the basic feed.
- The default headline activation is an ordinary direct same-context browser navigation to stored `original_url`; Phase 13 MUST NOT force a new browsing context merely for presentation polish. Readers retain their normal browser controls for opening links in another tab/window when desired.
- UI must not imply Platform authorship of linked content.
- External navigation is visually/accessibly understandable.
- Redirector/tracking links are not MVP behavior unless separately approved/documented.
- Broken-link handling never silently substitutes another Article.

## Public Article detail pages

A Platform-hosted detail page is optional in MVP. If implemented, it may show normalized metadata, Source attribution, Categories, and duplicate provenance, but the primary read action remains the Article's stored `original_url`. Full Article content is not reproduced without a separate rights contract.

## Admin delivery model

The aggregation vertical slice and basic public feed are implemented before the full administrative control plane.

Initial singleton Publication/Source configuration MAY be supplied through approved operator-maintained bootstrap/seed tooling until the corresponding admin screens exist. That mechanism does not bypass Source approval or other collection eligibility rules.

Ordinary bootstrap remains create-if-absent and MUST NOT overwrite existing operator-managed Publication state. Before Publication administration exists, the tech-demo path therefore requires an explicit operator-controlled, topic-independent way to change `public_status` deliberately. Changing committed bootstrap input alone is not a state-transition mechanism for already-created state.

Bootstrap/deployment configuration supplies one singleton Publication configuration; it MUST NOT require a slug selector or choose among multiple Publication records. Before production database compatibility is established, older pre-production databases may be recreated and bootstrapped rather than supported through an in-place upgrade path.

When administrative UI/API routes are introduced, they are protected by Cloudflare Access under `docs/decisions/cloudflare-access-admin-perimeter.md`.

## Admin information architecture

Administrative area SHOULD eventually contain:

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

## Source management UI

Once the Source-administration phase is complete, authorized operators MUST be able to view/change:

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

The Source editor/API presents the admission filter as an include-only Source setting: no configured phrases means collect/process all otherwise-valid RSS/Atom items, while one or more bounded non-empty phrases admit an item when any phrase matches. It MUST NOT expose an exclude-phrase list or an independent enabled toggle, and MUST NOT store the configuration on individual endpoints. This is collection admission before normalization, not public-feed filtering or Phase 11 Relevance management.

Phase 18 extends this existing Source/endpoint administration surface. Authorized operators can choose/configure the supported `html_listing` endpoint type, edit its bounded endpoint-owned HTML listing profile, receive deterministic profile-validation errors, and run safe sample preview. Endpoint detail exposes the parser/adapter version, persisted profile revision, and bounded latest parser-failure diagnostics relevant to that endpoint. Existing approval, lifecycle, operational, approved-domain, polling, default-Category, health, recent-run, and manual check-now controls remain the governing controls.

The UI/API makes clear that Source RSS/Atom admission phrases apply to RSS/Atom endpoints and are not an HTML-listing admission mechanism. Phase 18 adds no Publication selector, browser collector control, arbitrary scraping script, or generic expression editor.

### Phase 18 safe selector preview

Preview accepts only a bounded operator-supplied HTML sample and draft HTML profile and invokes the pure profile-validation/static-parser path. It performs no outbound request or DNS lookup, creates no Collection run, acquires no collection lock, changes no conditional-fetch state/scheduler timing/endpoint health, and persists no Article, observation, duplicate, or Relevance state. Scripts and subresources remain inert. Responses contain only bounded extracted preview rows and safe bounded diagnostics, never an echoed unbounded/raw HTML document.

A protected preview API MAY use POST for its bounded request body. Existing request-integrity policy applies to browser-originating unsafe requests despite preview being non-persistent. Real endpoint verification remains manual check-now through the canonical governed endpoint collection path; no second preview fetcher exists. Preview proves selectors/parser behavior only, while check-now proves collection behavior. Neither is reported as Level 7 live-Source evidence unless that separate procedure is actually performed.

Physical deletion is not generic CRUD behavior when retained provenance depends on the Source/endpoint. An endpoint with no retained dependent history MAY be physically removed if the implementation supports removal. Once Collection runs, observations, or other retained provenance depend on an endpoint, an operator-facing remove action MUST preserve the record through archive/retirement semantics rather than destroying referenced provenance. Restoring archived Source/endpoint configuration continues to obey the ordinary approval, lifecycle, operational, and collectability laws and MUST NOT implicitly resume collection.

## Phase 15 Publication, Category, and Relevance administration

Authorized administrators can manage the singleton Publication `name`, `active_for_collection`, `public_status`, existing optional `description`, `logo_path`, and `accent_color` values, and optional valid-IANA `presentation_timezone`. Existing Phase 13 bounds remain in force. Absent timezone preserves UTC calendar-date presentation; a configured timezone changes presentation only, not timestamps, canonical ordering, routing, or tenancy.

Administrators can create, read, and update Categories with immutable installation-wide `config_key` and mutable bounded display labels. No Category archive state is introduced. Physical removal is allowed only when unreferenced; commands reject removal atomically while a rule target, Source/endpoint default, Article membership, retained category reason, or other retained relationship requires it. They never null, cascade, or rewrite retained Article/provenance/editorial relationships to make deletion succeed.

Administrators can manage the existing Relevance rules with immutable installation-wide `config_key`, optional real-Source scope, the existing literal predicate vocabulary, action, pattern, priority, enabled state, explanatory label/reason, and a Category target only for `categorize`. `include` and `exclude` have no Category target. Existing deterministic precedence, categorization/default fallback, and prospective-only behavior remain unchanged. Enable/disable is the ordinary non-destructive operation; destructive removal must preserve retained reason/provenance history and is rejected when it cannot. All multi-resource mutations validate relationships transactionally and roll back invalid combinations.

Phase 15 integrates the managed Category set with existing Source/endpoint default-Category controls: endpoint default overrides Source default, and defaults apply only when no categorize rule assigns a Category. Source priority and Source/endpoint administration remain Phase 14-owned. Phase 15 does not add Article or duplicate moderation, a Publication switcher, tenant scope, native accounts/sessions/roles, or Level 8 Cloudflare deployment-observation work; that observation remains Phase 19.

## Article management UI

Phase 17 Article administration is a bounded, deterministic, paginated read surface over stored Article instances, not the public-feed-eligible stream. Public suppression MUST NOT make a stored Article inaccessible to authorized moderation. Applicable filters include bounded literal text, Source, visibility, effective Category, and duplicate role/group/review state. Authorized operators MUST be able to:

- search/filter visible, hidden, and archived stored Article instances;
- distinguish ungrouped Articles, Primary members, non-Primary members, and Articles participating in Duplicate review state;
- inspect owning Source, endpoint, Collection-run/Article-observation provenance, retained Relevance/Category reasons, necessary identity information, duplicate signals/confidence/reasons, and current group/Primary state;
- edit optional display overrides without replacing/loss of current normalized Source-derived values;
- clear an override to reveal latest normalized Source value;
- hide/restore and categorize Articles;
- enter Duplicate review/merge/split workflows.

An active display override is separate from and takes precedence only for its governed human-facing field. Source updates continue maintaining the latest underlying normalized value and never silently overwrite or clear the override; clearing it reveals that latest value. Display overrides cannot mutate Source ownership, external/normalized identity, provenance, Source-derived publication timestamps, or `canonical_identity_url`. They do not turn `original_url` into an editable display field: the public feed uses the effective display value but continues navigating to stored publisher `original_url`.

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

- Public readers do not authenticate in MVP.
- All MVP admin UI and admin API routes require the Cloudflare Access perimeter.
- Supported deployments MUST prevent direct-origin access from bypassing that perimeter.
- The MVP application does not implement native administrator accounts, login/logout sessions, account recovery, roles, or per-user Publication authorization.
- State-changing admin browser actions MUST use CSRF protection or an equivalent request-integrity control.
- Administrative commands MUST validate real resource relationships and domain invariants even without per-user permissions.
- Administrative errors must not expose secrets, stack traces, or raw database details.

## Change history

Successful material Phase 17 moderation changes produce append-only application change/audit records sufficient to explain the action, including bounded action, target, time, reason, and bounded prior/new state where appropriate. A required record is written transactionally with its mutation and cannot claim success after validation failure or rollback. Ordinary Phase 17 administration cannot edit history; reads are bounded/paginated. Phase 17 does not invent retention/pruning policy, which remains Phase 19 work.

MVP change records do not require a stable native administrator identifier or guaranteed per-user attribution. Cloudflare identity/access logs are operational evidence rather than the application's canonical domain identity.
