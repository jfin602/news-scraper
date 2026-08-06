# Domain and Data Contract

## Canonical terminology

### Platform
The reusable software system that hosts collection, normalization, identity resolution, deduplication, administration, and public-feed capabilities.

### Publication
A configured news product with its own name, slug, branding, timezone, categories, relevance rules, sources, and public feed. Publication is the boundary for topic-specific behavior.

### Source
An administrator-approved publisher or outlet belonging to one Publication in the MVP. A Source owns one or more Source endpoints and defines public source identity.

### Source endpoint
A specific machine-readable feed, API URL, or HTML listing page belonging to a Source. Approval, operational state, polling state, HTTP cache metadata, parser settings, and health are endpoint-level concerns.

### Collection run
One attempt to collect one Source endpoint. It records timing, outcome, transport details, counters, and bounded error information.

### Raw item
Minimally interpreted parser output. Raw items are untrusted and retained only as needed for diagnostics/reprocessing.

### Article candidate
A normalized but not yet accepted record produced from a Raw item. Safety, relevance, identity, and duplicate decisions operate on candidates.

### Article
A persisted normalized source instance representing one discovered article URL or reliable source-provided item identity.

### Article observation
A provenance record linking an Article or candidate outcome to the Source endpoint and Collection run that observed it. Observations preserve run/endpoint history without duplicating the logical Article.

### Duplicate review candidate
A persisted possible true-duplicate relationship that requires or records a deterministic automatic/manual decision. It stores compared Articles, signals, confidence/reason, and review disposition so dismissed pairs do not recur indefinitely.

### Duplicate group
A set of separately stored Article instances determined to represent the same underlying published item.

### Primary article
The one Article selected to represent a Duplicate group in public output.

### Related coverage
Distinct reporting about the same event or subject. Related coverage is not a true duplicate and remains separately visible.

### Category
A Publication-owned editorial grouping.

### Relevance rule
A Publication-owned deterministic rule used to include, exclude, or categorize candidates. The MVP does not define a generic ranking/boost score.

## Ownership boundaries

- A Publication owns branding, feed settings, Categories, Relevance rules, Sources, and source-priority configuration.
- A Source belongs to exactly one Publication in the MVP.
- A Source owns one or more Source endpoints.
- A Source endpoint owns collection scheduling/cache/health state and Collection runs.
- An Article belongs to one Publication and one Source.
- Article observations link Articles/candidate outcomes to one Source endpoint and one Collection run.
- Duplicate groups and duplicate-review candidates belong to one Publication and never cross Publication boundaries.
- Administrative authorization is checked at the Publication boundary.

## State model

Approval/trust, operational state, public visibility, moderation, and health are separate concepts.

### Publication

Required states/concepts:
- `active_for_collection`: whether its Sources may be scheduled/fetched;
- `public_status`: whether its public feed is exposed;
- branding/feed configuration.

A Publication may be active for collection without being publicly exposed.

### Source

Required states/concepts:
- approval/trust state: `approved` or `unapproved`;
- operational state: `enabled`, `paused`, or `disabled`;
- source priority within its Publication;
- approved public-domain policy.

Approval authorizes trust. Operational state controls whether approved configuration is currently collectable.

### Source endpoint

Required states/concepts:
- approval/trust state: `approved` or `unapproved`;
- operational state: `enabled`, `paused`, or `disabled`;
- derived health: `unknown`, `healthy`, `delayed`, `degraded`, or `unhealthy`.

`paused` and `disabled` are not health values.

A Source-level health summary, if shown, is derived from its endpoint health/state rather than stored as a competing authority.

### Article visibility and duplicate role

These are orthogonal dimensions.

Visibility/moderation state:
- `visible`;
- `hidden`;
- `archived`.

Duplicate role:
- `ungrouped`;
- `primary` member of a Duplicate group;
- `non_primary` member of a Duplicate group.

Joining/leaving a Duplicate group does not inherently change Article visibility. Hiding/restoring an Article does not inherently change group membership.

## Logical entities

Names below define logical concepts, not final SQL.

### `publications`
- stable identifier;
- name/slug/description;
- default timezone;
- `active_for_collection`;
- `public_status`;
- branding and feed configuration;
- created/updated timestamps.

### `sources`
- Publication identifier;
- display name and website URL;
- approval state;
- operational state;
- approved-domain policy;
- Publication-scoped priority;
- default Category;
- optional source-scoped relevance settings;
- created/updated timestamps.

### `source_endpoints`
- Source identifier;
- endpoint URL/type;
- approval state;
- operational state;
- parser/adapter configuration;
- polling interval;
- next-due/last-attempt/last-success timing;
- ETag and Last-Modified values;
- consecutive failure count;
- derived health state.

Configuration inheritance:
- Source approved domains define the maximum permitted destination boundary;
- endpoint redirect/article-domain configuration may only narrow that Source boundary unless an explicit Source policy expansion is approved;
- endpoint default Category overrides Source default Category for that endpoint; Source default is fallback.

### `collection_runs`
- Source endpoint identifier;
- start/finish timestamps;
- terminal status;
- HTTP/transport metadata when applicable;
- canonical outcome counters;
- structured error code and bounded detail;
- worker/execution identifier.

Canonical candidate outcome vocabulary:
- `created` — new Article inserted;
- `updated` — existing Article source-derived fields changed;
- `unchanged` — existing Article observed without material change;
- `rejected` — invalid or unsafe candidate;
- `excluded` — deterministically excluded by relevance policy;
- `hidden` — accepted/stored but hidden by publication/moderation policy;
- `duplicate_grouped` — separately stored Article attached to a true Duplicate group;
- `failed` — item-level processing failure.

Run counters may aggregate these outcomes. Documents must not invent competing meanings for `accepted` or `skipped` without mapping them to this taxonomy.

### `articles`
- Publication and Source identifiers;
- reliable source external identifier when available;
- original discovered URL and canonical identity URL;
- display/source title and normalized title;
- author, summary/excerpt, image URL, language where available;
- source-published time and confidence;
- first-seen/last-seen time;
- source-updated time when available;
- stable identity fingerprint;
- visibility/moderation state;
- normalization/relevance reason metadata.

Source-derived normalized values remain distinct from optional administrator display overrides. A later Source observation updates the source-derived value without clobbering an active administrator override. Clearing an override reveals the latest normalized Source value.

### `article_observations`
- Article identifier when identity resolves;
- Source endpoint identifier;
- Collection run identifier;
- observed source identity/key and optional bounded Raw-item reference;
- observation time;
- processing outcome/reason;
- source-updated metadata/fingerprint when useful for change detection.

### `categories` and `article_categories`
Categories belong to one Publication. Articles may have multiple Categories; a Publication may define a preferred display Category.

### `relevance_rules`
- Publication identifier;
- optional Source scope;
- rule type/pattern;
- action: `include`, `exclude`, or `categorize`;
- deterministic priority/order;
- enabled state;
- explanatory label/reason.

Default MVP semantics:
- if no inclusion rule is configured for the applicable scope, a valid candidate is eligible by default unless excluded;
- exclusion wins over inclusion at the same or lower precedence;
- more specific Source-scoped rules may override Publication defaults when explicitly configured;
- category rules do not change inclusion unless they also carry a separate include/exclude action;
- rule evaluation order and winning reason are persisted/explainable.

Generic `boost`/ranking behavior is deferred until a relevance-score contract exists.

### `duplicate_review_candidates`
- Publication identifier;
- compared Article identifiers;
- deterministic match signals/reason codes;
- confidence;
- state such as `pending`, `dismissed`, `merged`, or `superseded`;
- automatic/manual origin;
- reviewing administrator and timestamp when applicable.

### `duplicate_groups` and memberships
- Publication identifier;
- Primary Article identifier;
- matching method/confidence;
- automatic/manual origin;
- group timestamps;
- membership records preserving each Article instance.

Exactly one member is Primary.

### `admin_users` / administrative identity
The exact authentication implementation may vary, but the data model must provide a stable administrator identity that can be referenced by audit/moderation records and scoped to authorized Publications.

### `audit_events`
Administrative changes affecting Publications, Sources, endpoints, Article visibility/overrides/categories, duplicate review/groups, and other security-sensitive configuration produce audit events referencing the administrator identity.

## Identity and uniqueness invariants

Persistence MUST enforce or transactionally guarantee:

- unique Publication slug;
- no duplicate active endpoint URL within the same Source after URL normalization;
- no duplicate Article for the same reliable immutable Source external identifier;
- no duplicate Article for the same Publication/Source canonical identity when external identifier is absent;
- one Primary Article per Duplicate group;
- no cross-Publication Duplicate membership or duplicate-review pair;
- one canonical unresolved/reviewed duplicate-candidate relationship per Article pair/method as appropriate;
- every publicly visible feed row resolves to one approved Source and one eligible stored Article;
- disabling/pausing/removing collection capability does not erase Article provenance.

## Public-feed eligibility

A feed row is eligible only when the Article is `visible` and either:

1. `ungrouped`, or
2. the `primary` member of its Duplicate group.

A visible `non_primary` member is duplicate-suppressed from ordinary feed rows but remains available to administrators. Hidden/archived Articles are not restored merely because duplicate membership changes.

## Time semantics

- `published_at` is the Source-claimed publication time when parseable/credible.
- `first_seen_at` is first successful platform observation.
- `last_seen_at` is latest observation.
- platform `updated_at` is record-change time and is never presented as publication time.
- Public feed uses trusted `published_at`; otherwise `first_seen_at` with a detectable fallback marker.
- Persist timestamps in UTC; render according to Publication/viewer presentation rules.

## Retention and deletion principles

- Provenance needed for audit, identity, or duplicate handling is not discarded because an Article is hidden or duplicate-suppressed.
- Source/endpoint administration uses create, update, pause/enable/disable, and archive/state management rather than unconstrained physical deletion.
- Hard deletion is allowed only under an explicit deletion policy that preserves referential/audit requirements or when no retained provenance depends on the object.
- Raw responses/items may have bounded retention.
- Error bodies are bounded and scrubbed of secrets.
- Deletion policy distinguishes administrative hiding, configuration retirement, legal takedown, and physical data deletion.
