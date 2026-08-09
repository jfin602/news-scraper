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
One attempt to collect one Source endpoint. It records timing, transport/stage status, processing outcomes/effects where those stages exist, and bounded error information.

### Raw item
Minimally interpreted parser output. Raw items are untrusted and retained only as needed for diagnostics/reprocessing.

### Article candidate
A normalized but not yet accepted record produced from a Raw item. Safety, Relevance, identity, and duplicate decisions operate on candidates.

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
- Administrative commands validate Publication/resource ownership and scoping even though MVP does not implement per-user Publication authorization.

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

Archival makes Source/endpoint configuration non-collectable regardless of retained approval or operational values. Archiving does not implicitly revoke approval. Restoring archived configuration MUST NOT implicitly resume collection; active/enabled operation must be explicitly established.

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

Names below define logical concepts, not final SQL. They describe the completed MVP domain model; roadmap phases introduce only the fields needed by behavior that exists in that phase. An earlier phase MUST NOT front-load later scheduling/cache/health/parser/Relevance/Category/branding fields merely because they appear in the logical entity descriptions below.

### Phase 3 minimum persisted configuration boundary

Phase 3 introduces only the trusted configuration needed by later collection eligibility:

- Publication: stable identifier, name, unique slug, `active_for_collection`, `public_status`, and timestamps;
- Source: stable identifier, Publication identifier, immutable Publication-scoped configuration key, display name/site URL, approval state, lifecycle state, operational state, approved-domain policy, and timestamps;
- Source endpoint: stable identifier, Source identifier, immutable Source-scoped configuration key, endpoint URL/type, approval state, lifecycle state, operational state, basic polling interval, optional policy narrowing, and timestamps.

Runtime parser/cache fields, due/attempt/success timing, derived health, Categories/Relevance persistence, and final branding/feed configuration are introduced by the roadmap phase that first uses them.

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
- stable immutable configuration key unique within the Publication;
- display name/site URL;
- approval state;
- lifecycle state/archive timestamp as appropriate;
- operational state;
- approved-domain policy;
- Publication-scoped priority;
- default Category;
- optional Source-scoped Relevance settings;
- created/updated timestamps.

### `source_endpoints`
- Source identifier;
- stable immutable configuration key unique within the Source;
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
- terminal run/transport status;
- parser/normalization stage status/counts where applicable;
- HTTP/transport metadata where applicable;
- processing-outcome counters once Article persistence exists;
- orthogonal effect counters once those effects exist;
- structured error code/bounded detail;
- worker/execution identifier.

A minimal Collection run exists from the first real transport implementation. Before Article persistence exists it records only the stages that actually exist and MUST NOT pretend post-identity outcomes have occurred.

Phase 6 pre-persistence accounting uses the normalization stage vocabulary defined by the Source/collection contract:

- normalization status is `not_run`, `succeeded`, or `failed`;
- `normalized_candidate_count` counts Raw items that complete normalization into an Article candidate before the separate Article-link policy decision;
- `normalization_failure_count` counts Raw items that cannot produce an Article candidate because normalization fails or required candidate data is malformed, invalid, or out of bounds;
- `article_link_rejection_count` counts normalized Article candidates rejected by the separate Article-link/domain policy gate;
- when a parsed content batch completes, `raw_item_count = normalized_candidate_count + normalization_failure_count`, and `article_link_rejection_count <= normalized_candidate_count`;
- the candidate count safe for the next stage is `normalized_candidate_count - article_link_rejection_count`;
- item-level normalization failures or link rejections do not by themselves mean the normalization stage failed; stage-level failure means the bounded batch could not complete.

These Phase 6 values are stage accounting only. They are not aliases for the post-identity processing outcomes introduced when Article persistence exists.

Once Article persistence exists, every processed candidate has exactly one **processing outcome**:

- `created` — new Article inserted;
- `updated` — existing Article Source-derived fields changed;
- `unchanged` — existing Article observed without material change;
- `rejected` — invalid or unsafe before acceptance;
- `excluded` — deterministically excluded by Relevance policy;
- `failed` — item-level processing failed.

Accepted Article processing may also produce zero or more **orthogonal effects**, which do not replace the processing outcome:

- `visibility_hidden` — resulting Article is hidden by policy/moderation;
- `duplicate_review_created` — new/persisted weak-match review work was created;
- `duplicate_grouped` — Article was newly attached to or materially changed within a true Duplicate group.

Example: one candidate may be counted as `created` and also increment `duplicate_grouped`; these are not competing outcomes.

Before Article persistence exists, Collection runs may report transport/parser/normalization stage counts/statuses, but MUST NOT use post-identity processing outcomes as though Articles already exist. Generic terms such as `accepted` or `skipped` require explicit mapping rather than competing semantics.

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
- normalization/Relevance reasons.

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

Before configurable Relevance-rule persistence exists, the canonical Relevance boundary still executes with an empty rule set. Safe normalized candidates therefore receive the deterministic default `include` decision rather than bypassing Relevance evaluation.

MVP Relevance-rule edits are prospective by default. Editing rules affects future candidate processing; automatic bulk retroactive re-evaluation of previously persisted Articles is deferred unless a dedicated reprocessing capability is explicitly invoked/implemented later. Article moderation remains available for corrections.

Generic `boost`/ranking behavior is deferred until a ranking/scoring contract exists.

### `duplicate_review_candidates`
- Publication identifier;
- compared Article identifiers;
- deterministic signals/reason codes;
- confidence;
- state such as `pending`, `dismissed`, `merged`, `superseded`;
- automatic/manual origin;
- manual decision time/reason where applicable.

### `duplicate_groups` and memberships
- Publication identifier;
- Primary Article identifier;
- matching method/confidence;
- automatic/manual origin;
- group timestamps;
- membership records preserving every Article instance.

Exactly one member is Primary.

### `audit_events`
MVP may persist bounded administrative configuration/moderation change history for security-sensitive or editorially significant changes. Records may include action, target, prior/new state, timestamp, and reason where applicable. MVP does not require a native administrator identifier or canonical per-user attribution.

Native administrator accounts/identity, roles, per-user Publication authorization, account recovery, and identity-linked audit attribution are outside MVP and require a later contract/ADR if promoted.

## Identity and uniqueness invariants

Persistence MUST enforce or transactionally guarantee:

- unique Publication slug;
- unique immutable Source configuration key within a Publication;
- unique immutable Source-endpoint configuration key within a Source;
- no duplicate non-archived normalized endpoint URL within the same Source;
- no duplicate Article for the same reliable immutable external identifier within the same Source;
- no duplicate Article for the same Publication/Source canonical identity when external identifier is absent;
- one Primary Article per Duplicate group;
- no cross-Publication Duplicate membership/review pair;
- one canonical unresolved/reviewed Duplicate-candidate relationship per Article pair/method as appropriate;
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

Phase 6 may parse Source publication/update values into UTC and attach confidence/reason/fallback metadata, but it does not create persistence observation times. Missing or invalid Source publication dates remain distinguishable, and normalization MUST NOT substitute a Collection-run timestamp as `published_at`. Phase 7 Article/observation persistence establishes `first_seen_at`/`last_seen_at` from actual Platform observations.

## Retention and deletion principles

- Provenance needed for change history, identity, or duplicate handling is not discarded because an Article is hidden/suppressed.
- Source/endpoint administration uses create/update, approval, enable/pause/disable, and archive lifecycle management rather than unconstrained physical deletion.
- Hard deletion requires explicit deletion policy preserving referential/change-history requirements or proof that no retained provenance depends on the object.
- Raw responses/items may have bounded retention.
- Error bodies are bounded/scrubbed.
- Deletion policy distinguishes moderation hiding, configuration archival, legal takedown, and physical deletion.
