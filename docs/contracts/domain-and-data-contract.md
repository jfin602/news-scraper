# Domain and Data Contract

## Canonical terminology

### Platform
The reusable software system that hosts collection, normalization, identity resolution, deduplication, administration, and public-feed capabilities.

### Publication
A configured news product with its own name, slug, branding, timezone, Categories, Relevance rules, Sources, and public feed. Publication is the boundary for topic-specific behavior.

### Source
A configured publisher or outlet belonging to one Publication in the MVP. Approval state determines whether the Platform trusts/collects it. A Source owns one or more Source endpoints and defines public Source identity for accepted Articles.

### Source endpoint
A configured machine-readable feed, API URL, or HTML listing page belonging to a Source. Approval, lifecycle/operational state, polling state, HTTP cache metadata, parser settings, and derived health are endpoint-level concerns.

### Collection run
One attempt to collect one Source endpoint. It records timing, outcome, transport details, counters, and bounded error information.

### Raw item
Minimally interpreted parser output. Raw items are untrusted and retained only as needed for diagnostics/reprocessing.

### Article candidate
A normalized but not yet accepted record produced from a Raw item. Safety, relevance, identity, and duplicate decisions operate on candidates.

### Article
A persisted normalized Source instance representing one discovered Article URL or reliable Source-provided item identity.

### Article observation
A provenance record linking an Article or candidate outcome to the Source endpoint and Collection run that observed it. Observations preserve run/endpoint history without duplicating the logical Article.

### Duplicate review candidate
A persisted possible true-duplicate relationship that requires or records a deterministic automatic/manual decision. It stores compared Articles, signals, confidence/reason, and disposition so dismissed pairs do not recur indefinitely.

### Duplicate group
A set of separately stored Article instances determined to represent the same underlying published item.

### Primary article
The one Article selected to represent a Duplicate group in public output.

### Related coverage
Distinct reporting about the same event or subject. Related coverage is not a true duplicate and remains separately visible.

### Category
A Publication-owned editorial grouping.

### Relevance rule
A Publication-owned deterministic rule used to include, exclude, or categorize candidates. MVP does not define a generic ranking/boost score.

## Ownership boundaries

- A Publication owns branding, feed settings, Categories, Relevance rules, Sources, and Source-priority configuration.
- A Source belongs to exactly one Publication in MVP.
- A Source owns one or more Source endpoints.
- A Source endpoint owns collection scheduling/cache/health state and Collection runs.
- An Article belongs to one Publication and one Source.
- Article observations link Articles/candidate outcomes to one Source endpoint and one Collection run.
- Duplicate groups and Duplicate review candidates belong to one Publication and never cross Publication boundaries.
- Administrative authorization is checked at the Publication boundary.

## State model

Approval/trust, configuration lifecycle, operational state, public visibility, moderation, and derived health are separate concepts.

### Publication
Required concepts:
- `active_for_collection`: whether its eligible Sources may be scheduled/fetched;
- `public_status`: whether its public feed is exposed;
- branding/feed configuration.

A Publication may collect while its public feed is not exposed.

### Source
Required concepts:
- approval/trust state: `approved` or `unapproved`;
- lifecycle state: `active` or `archived`;
- operational state while active: `enabled`, `paused`, or `disabled`;
- Source priority within its Publication;
- approved public-domain policy.

Approval authorizes trust. Lifecycle controls whether configuration is current/retired. Operational state controls whether active approved configuration currently runs.

### Source endpoint
Required concepts:
- approval/trust state: `approved` or `unapproved`;
- lifecycle state: `active` or `archived`;
- operational state while active: `enabled`, `paused`, or `disabled`;
- derived health: `unknown`, `healthy`, `delayed`, `degraded`, or `unhealthy`.

`paused`, `disabled`, and `archived` are not health values. A Source-level health summary, if shown, is derived from endpoint state/health rather than stored as competing authority.

### Article visibility and duplicate role

These are orthogonal.

Visibility/moderation state:
- `visible`;
- `hidden`;
- `archived`.

Duplicate role:
- `ungrouped`;
- `primary` member of a Duplicate group;
- `non_primary` member of a Duplicate group.

Joining/leaving a Duplicate group does not inherently change Article visibility. Hiding/restoring does not inherently change group membership.

## Logical entities

Names below define logical concepts, not final SQL.

### `publications`
- stable identifier;
- name/slug/description;
- default timezone;
- `active_for_collection`;
- `public_status`;
- branding/feed configuration;
- created/updated timestamps.

### `sources`
- Publication identifier;
- display name/site URL;
- approval state;
- lifecycle state/archive timestamp as appropriate;
- operational state;
- approved-domain policy;
- Publication-scoped priority;
- default Category;
- optional Source-scoped relevance settings;
- created/updated timestamps.

### `source_endpoints`
- Source identifier;
- endpoint URL/type;
- approval state;
- lifecycle state/archive timestamp as appropriate;
- operational state;
- parser/adapter configuration;
- polling interval;
- next-due/last-attempt/last-success timing;
- ETag/Last-Modified;
- consecutive failure count;
- derived health.

Configuration inheritance:
- Source approved domains define the maximum permitted destination boundary;
- endpoint redirect/Article-domain configuration may only narrow the Source boundary unless Source policy itself is explicitly expanded/approved;
- endpoint default Category overrides Source default for that endpoint; Source default is fallback.

### `collection_runs`
- Source endpoint identifier;
- start/finish timestamps;
- terminal status;
- HTTP/transport metadata where applicable;
- canonical outcome counters;
- structured error code/bounded detail;
- worker/execution identifier.

Canonical post-identity candidate outcomes:
- `created` — new Article inserted;
- `updated` — existing Article Source-derived fields changed;
- `unchanged` — existing Article observed without material change;
- `rejected` — invalid or unsafe candidate;
- `excluded` — deterministically excluded by relevance policy;
- `hidden` — accepted/stored but hidden by policy/moderation;
- `duplicate_grouped` — separately stored Article attached to a true Duplicate group;
- `failed` — item-level processing failure.

Before Article persistence exists, Collection runs may report transport/parser/normalization stage counts/statuses, but they MUST NOT misuse the post-identity outcome names above. Once persistence is active, run counters derive from this canonical outcome taxonomy. Generic terms such as `accepted` or `skipped` require explicit mapping rather than competing semantics.

### `articles`
- Publication/Source identifiers;
- reliable Source external identifier where available;
- original discovered URL and canonical identity URL;
- display/source title and normalized title;
- author, summary/excerpt, image URL, language where available;
- Source-published time/confidence;
- first-seen/last-seen time;
- Source-updated time where available;
- stable identity fingerprint;
- visibility/moderation state;
- normalization/relevance reasons.

Source-derived normalized values remain distinct from optional administrator display overrides. Later Source observations update Source-derived values without clobbering an active override. Clearing an override reveals the latest normalized Source value.

### `article_observations`
- Article identifier when identity resolves;
- Source endpoint identifier;
- Collection run identifier;
- observed Source identity/key and optional bounded Raw-item reference;
- observation time;
- processing outcome/reason;
- Source-updated metadata/fingerprint where useful.

### `categories` and `article_categories`
Categories belong to one Publication. Articles may have multiple Categories; a Publication may define a preferred display Category.

### `relevance_rules`
- Publication identifier;
- optional Source scope;
- rule type/pattern;
- action: `include`, `exclude`, or `categorize`;
- explicit integer priority/order;
- enabled state;
- explanatory label/reason.

Deterministic MVP decision procedure:
1. Collect applicable enabled include/exclude rules.
2. Highest explicit priority wins.
3. At equal priority, Source-scoped rule wins over Publication-wide rule.
4. At equal priority and scope specificity, `exclude` wins over `include`.
5. If no include/exclude rule decides the candidate, include by default.
6. Category rules are evaluated independently and do not alter inclusion unless a separate include/exclude rule does so.
7. Persist the winning include/exclude reason and applied Category-rule reasons.

Generic `boost`/ranking behavior is deferred until a ranking/scoring contract exists.

### `duplicate_review_candidates`
- Publication identifier;
- compared Article identifiers;
- deterministic signals/reason codes;
- confidence;
- state such as `pending`, `dismissed`, `merged`, `superseded`;
- automatic/manual origin;
- reviewing administrator/time where applicable.

### `duplicate_groups` and memberships
- Publication identifier;
- Primary Article identifier;
- matching method/confidence;
- automatic/manual origin;
- group timestamps;
- membership records preserving every Article instance.

Exactly one member is Primary.

### `admin_users` / administrative identity
The authentication implementation may vary, but the system provides stable administrator identity referenced by audit/moderation records and scoped to authorized Publications.

### `audit_events`
Administrative changes affecting Publications, Sources, endpoints, Article visibility/overrides/Categories, duplicate review/groups, and other security-sensitive configuration produce audit events referencing administrator identity.

## Identity and uniqueness invariants

Persistence MUST enforce or transactionally guarantee:

- unique Publication slug;
- no duplicate non-archived normalized endpoint URL within the same Source;
- no duplicate Article for the same reliable immutable Source external identifier;
- no duplicate Article for the same Publication/Source canonical identity when external identifier is absent;
- one Primary Article per Duplicate group;
- no cross-Publication Duplicate membership/review pair;
- one canonical unresolved/reviewed duplicate-candidate relationship per Article pair/method as appropriate;
- every public feed row resolves to an approved active Source and eligible stored Article;
- pausing/disabling/archiving Source configuration never erases retained Article provenance.

## Public-feed eligibility

A feed row is eligible only when the Article is `visible` and either:

1. `ungrouped`, or
2. the `primary` member of its Duplicate group.

A visible `non_primary` member is duplicate-suppressed from ordinary rows but remains administratively available. Hidden/archived Articles are not restored merely because duplicate membership changes.

## Time semantics

- `published_at` = Source-claimed publication time when credible.
- `first_seen_at` = first successful Platform observation.
- `last_seen_at` = latest observation.
- Platform `updated_at` = record-change time, never publication time.
- Public feed uses trusted `published_at`; otherwise `first_seen_at` with detectable fallback metadata.
- Persist UTC; render according to Publication/viewer presentation rules.

## Retention and deletion principles

- Provenance needed for audit, identity, or duplicate handling is not discarded because an Article is hidden/suppressed.
- Source/endpoint administration uses create/update, approval, enable/pause/disable, and archive lifecycle management rather than unconstrained physical deletion.
- Hard deletion requires explicit deletion policy preserving referential/audit requirements or proof that no retained provenance depends on the object.
- Raw responses/items may have bounded retention.
- Error bodies are bounded/scrubbed.
- Deletion policy distinguishes moderation hiding, configuration archival, legal takedown, and physical deletion.
