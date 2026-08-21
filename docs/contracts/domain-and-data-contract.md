# Domain and Data Contract

## Canonical terminology

### Platform

The reusable software system that hosts collection, normalization, identity resolution, deduplication, administration, and public-feed capabilities.

### News Scraper instance

One independently bounded deployment of the complete single-Publication stack: Web/Admin, Worker, PostgreSQL state, scheduler/jobs, configuration/secrets, and distribution interfaces. Managed instances MAY share physical infrastructure without sharing customer domain/application state or creating relational tenancy.

### Publication

The one configured news product for a deployed installation. Publication owns topic-specific editorial configuration such as name, collection/public state, branding, optional presentation timezone, Categories, Relevance rules, Sources, Source priority, and public-feed settings.

A supported installation has exactly one Publication configuration. Publication is an editorial/configuration boundary, **not** a tenancy or relational ownership key.

### Source

A configured publisher or outlet in the installation. Approval state determines whether the Platform trusts/collects it. A Source owns one or more Source endpoints, defines public Source identity for accepted Articles, and may own optional topic-independent collection configuration such as the Source RSS/Atom item admission filter.

### Source endpoint

A configured machine-readable feed, API URL, or HTML listing page belonging to a Source. Approval, lifecycle/operational state, polling state, HTTP cache metadata, parser settings, and derived health are endpoint-level concerns. Supported endpoint types are `rss_atom` and `html_listing`.

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

A persisted possible true-duplicate relationship over a canonical unordered Article pair. It stores deterministic bounded signals, confidence/reasons, evidence identity, and disposition so unchanged dismissed evidence remains dismissed rather than recurring indefinitely.

### Duplicate group

A set of separately stored Article instances determined to represent the same underlying published item.

### Primary article

The one Article selected to represent a Duplicate group in public output.

### Related coverage

Distinct reporting about the same event or subject. Related coverage is not a true duplicate and remains separately visible.

### Category

An installation-wide editorial grouping owned by the singleton Publication configuration. Each persisted Category has an immutable installation-wide `config_key` so configuration, rule targets, and reasons do not depend on mutable display labels or database-generated identifiers.

### Relevance rule

An installation-wide deterministic rule used to include, exclude, or categorize candidates, optionally scoped to one Source. Each persisted rule has an immutable installation-wide `config_key`. MVP uses a deliberately bounded literal predicate vocabulary rather than a generic expression, fuzzy, regex, semantic, or ranking engine.

### Distribution Profile

A first-class installation-owned administrator-controlled outward selection over the singleton Publication's canonically eligible Article corpus. It has immutable `config_key`, mutable `display_name`, `draft`/`active`/`disabled` lifecycle, and a bounded result/history limit. A first-class Profile↔Source association selects participating approved Sources and may hold the bounded filters governed by `distribution-and-integration-contract.md`. Multiple Profiles do not create tenancy.

### Distribution consumer and integration adapter

A distribution consumer receives supported normalized profile output. An integration adapter is a thin transport, synchronization, cache, or rendering layer; it is not an authority for Source trust, Article eligibility, moderation, duplicate selection, or profile interpretation.

## Relationship boundaries

- The singleton Publication configuration owns installation-wide editorial settings but does not provide a tenant foreign key for other entities.
- A Source owns one or more Source endpoints.
- A Source endpoint owns collection scheduling/cache/health state and Collection runs.
- An Article belongs to one Source.
- Article observations link Articles/candidate outcomes to the Source endpoint and Collection run that produced them and preserve Source consistency where stored directly.
- Duplicate groups and Duplicate review candidates relate Articles within the one installation; an Article belongs to at most one Duplicate group, and cross-Publication checks are structurally unnecessary because the installation cannot contain another Publication domain.
- Administrative commands validate real resource relationships and domain invariants even though MVP does not implement per-user authorization.
- Distribution Profiles belong conceptually to the singleton Publication configuration, operate only over canonically eligible Articles, and do not add Publication/customer tenant keys.
- Distribution Profile operation is independent of Publication `public_status`, which controls only the bundled reference surfaces.

Do not introduce Publication UUIDs, slugs, foreign keys, composite uniqueness scopes, repository arguments, or compatibility aliases solely to model concurrent Publications that the supported product does not host.

## State model

Approval/trust, configuration lifecycle, operational state, public visibility, moderation, and derived health are separate concepts.

### Publication configuration

Required concepts:

- `active_for_collection`: whether eligible Sources may be scheduled/fetched;
- `public_status`: whether the public feed is exposed;
- required Publication name;
- optional public presentation configuration: `description`, `logo_path`, and `accent_color`;
- optional valid-IANA `presentation_timezone` administrator configuration.

The singleton Publication may collect while its public feed is not exposed. Public feed reads require `public_status = public`; `active_for_collection` is a collection-state control and does not independently expose or suppress already-persisted feed rows.

The persisted representation MUST enforce singleton semantics. It does not expose a dynamic Publication identifier or slug to other domain records merely for scoping.

### Source

Required concepts:

- approval/trust state: `approved` or `unapproved`;
- lifecycle state: `active` or `archived`;
- operational state while active: `enabled`, `paused`, or `disabled`;
- Source priority within the installation;
- approved public-domain policy.
- optional Source RSS/Atom item admission phrase configuration.

Approval authorizes trust. Lifecycle controls whether configuration is current/retired. Operational state controls whether active approved configuration currently runs.

### Source endpoint

Required concepts:

- approval/trust state: `approved` or `unapproved`;
- lifecycle state: `active` or `archived`;
- operational state while active: `enabled`, `paused`, or `disabled`;
- derived health: `unknown`, `healthy`, `delayed`, `degraded`, or `unhealthy`.

`paused`, `disabled`, and `archived` are not health values. A Source-level health summary, if shown, is derived from endpoint state/health rather than stored as competing authority.

Endpoint/profile compatibility is part of endpoint configuration validity:

- an `html_listing` endpoint owns one bounded persisted HTML listing profile and requires a valid compatible profile before it can become collectable;
- an `rss_atom` endpoint rejects HTML-only profile configuration;
- HTML profile configuration belongs to the Source endpoint, not the Source, Publication tenancy, Article, or public-feed configuration;
- profile edits are prospective and do not rewrite historical Articles, Article observations, or Collection runs;
- each persisted profile has a version/revision identity sufficient for a Collection run and diagnostics to identify the exact configuration used;
- the profile is inert declarative data, never executable code.

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

Persisted Article visibility uses the canonical states above. Existing Articles were initialized to `visible`, which remains the default for new Articles unless a governed policy deliberately produces another state.

Articles outside a Duplicate group are `ungrouped`; group/role state exists only for actual duplicate behavior, not as a separate feed-only mechanism.

## Logical entities

Names below define current logical concepts, not final SQL. Persist only fields owned by implemented behavior; this contract is not permission to front-load speculative state.

### Singleton Publication configuration

One persisted Publication/settings record contains the governed fields used by the installation, including:

- name;
- `active_for_collection`;
- `public_status`;
- optional `description`, `logo_path`, and `accent_color` public-presentation values;
- optional valid-IANA `presentation_timezone` configuration;
- created/updated timestamps where useful.

Public-presentation field semantics are deliberately small and topic independent:

- `description` is nullable bounded plain text, trimmed at the configuration boundary, with no HTML/markup interpretation; an absent value is distinct from invented generic editorial copy;
- `logo_path` is nullable bounded same-origin asset-path data beginning with `/`; it is not an arbitrary external URL, data URL, scriptable URL, Publication selector, or HTML fragment;
- `accent_color` is nullable and normalized/validated as one canonical six-digit sRGB hexadecimal color in `#RRGGBB` form; it is presentation input, not raw CSS;
- missing optional values are valid and MUST allow a complete generic public presentation using safe application defaults;
- these values are public presentation configuration once exposed through the canonical feed read model, but they do not create another public routing/scoping identity.

Protected administration edits these values; ordinary bootstrap no-overwrite behavior remains unchanged.

`presentation_timezone` is optional and, when configured, MUST be a valid IANA time-zone identifier. Its absence preserves the UTC calendar-date fallback. It changes presentation/calendar-date interpretation only: it MUST NOT rewrite persisted timestamps, change canonical feed ordering, create locale or arbitrary date/time-format configuration, or become Publication routing or tenancy identity.

The concrete table name is an implementation detail. The schema MUST enforce singleton semantics and MUST NOT require a Publication UUID or slug for relational scoping.

### `sources`

- stable identifier;
- immutable `config_key` unique across the installation;
- display name/site URL;
- approval state;
- lifecycle state/archive timestamp as appropriate;
- operational state;
- approved-domain policy;
- installation-wide Source priority;
- optional default Category reference;
- optional Source-scoped Relevance settings;
- optional bounded Source RSS/Atom item admission phrases;
- created/updated timestamps.

The optional Source RSS/Atom item admission filter is Source configuration, not endpoint configuration or Publication tenancy. No configured phrases means collect all otherwise-valid parsed RSS/Atom Raw items. One or more phrases use deterministic case-insensitive literal any-match semantics over existing parsed title, summary/content text, and Source-provided category labels. The logical contract does not require a particular SQL representation.

### `source_endpoints`

- Source identifier;
- stable immutable `config_key` unique within the Source;
- endpoint URL/type;
- approval state;
- lifecycle state/archive timestamp as appropriate;
- operational state;
- parser/adapter configuration;
- polling interval;
- next-due/last-attempt/last-success timing;
- ETag/Last-Modified;
- consecutive failure count;
- derived health;
- optional default Category reference.

For `html_listing`, the endpoint-owned profile defines the smallest deterministic extraction surface:

- one required repeated item/root CSS selector;
- required title extraction;
- required Article-link extraction;
- optional Source publication/update date extraction;
- optional author extraction;
- optional summary/excerpt extraction;
- optional Source category-label extraction.

The persisted representation MAY use bounded structured field descriptors. CSS selectors are the supported selector language. XPath, JavaScript, regex-driven DOM extraction, template expressions, arbitrary code, and generic expression engines are not profile features. Attribute extraction is narrowly allowlisted for the field being extracted rather than exposing arbitrary DOM-property execution.

The generic HTML listing adapter MUST NOT synthesize `RawItem.externalId` from list position, selector path, normalized title, title/date hashes, content fingerprints, DOM markup, or any other generated HTML fingerprint. Generic HTML Article identity therefore uses the existing canonical-URL fallback unless a later explicit adapter contract supplies a genuinely trustworthy Source-provided strong identifier.

Configuration inheritance:

- Source approved domains define the maximum permitted destination boundary;
- Source RSS/Atom item admission phrases apply consistently to supported RSS/Atom endpoints owned by that Source; endpoint configuration does not override them;
- endpoint redirect/Article-domain configuration may only narrow the Source boundary unless Source policy itself is explicitly expanded/approved;
- endpoint default Category overrides Source default for that endpoint; Source default is fallback.

### `collection_runs`

- Source endpoint identifier;
- start/finish timestamps;
- terminal run/transport status;
- parser/normalization stage status/counts where applicable;
- `source_item_filtered_count` when Source RSS/Atom item admission filtering exists;
- HTTP/transport metadata where applicable;
- processing-outcome counters once Article persistence exists;
- orthogonal effect counters once those effects exist;
- structured error code/bounded detail;
- worker/execution identifier.

For HTML collection, bounded run diagnostics identify the parser/adapter kind and version, persisted HTML profile revision, and bounded item/extraction failure codes/detail. Collection-run diagnostics MUST NOT retain raw response bodies merely to explain parser behavior.

A Collection run begins with the first real fetch phase and records only stages/outcomes that actually occurred; it MUST NOT pretend post-identity outcomes occurred when processing terminated earlier.

Pre-normalization accounting uses the stage vocabulary defined by the Source/collection contract:

- `source_item_filtered_count` counts successfully parsed Raw items rejected by the configured Source RSS/Atom item admission filter before Article-candidate normalization;
- normalization status is `not_run`, `succeeded`, or `failed`;
- `normalized_candidate_count` counts Raw items that complete normalization into an Article candidate before the separate Article-link policy decision;
- `normalization_failure_count` counts Raw items that cannot produce an Article candidate because normalization fails or required candidate data is malformed, invalid, or out of bounds;
- `article_link_rejection_count` counts normalized Article candidates rejected by the separate Article-link/domain policy gate;
- when a parsed content batch completes, `raw_item_count = source_item_filtered_count + normalized_candidate_count + normalization_failure_count`, `source_item_filtered_count <= raw_item_count`, and `article_link_rejection_count <= normalized_candidate_count`;
- the candidate count safe for the next stage is `normalized_candidate_count - article_link_rejection_count`;
- item-level normalization failures or link rejections do not by themselves mean the normalization stage failed; stage-level failure means the bounded batch could not complete.

These values are stage accounting only. They are not aliases for the post-identity processing outcomes introduced when Article persistence exists. A Source-filtered Raw item never becomes an Article candidate, does not receive a Relevance `excluded` outcome, and does not create an Article observation solely for accounting.

Once Article persistence exists, every successfully normalized candidate has exactly one **processing outcome**:

- `created` — new Article inserted;
- `updated` — existing Article Source-derived fields changed;
- `unchanged` — existing Article observed without material change;
- `rejected` — invalid or unsafe before acceptance;
- `excluded` — deterministically excluded by Relevance policy;
- `failed` — item-level processing failed.

Therefore:

`created + updated + unchanged + rejected + excluded + failed = normalized_candidate_count`.

Normalization failures remain pre-candidate stage failures and do not receive a post-normalization processing outcome. An Article-link-policy rejection is retained in `article_link_rejection_count` and maps that same candidate to processing outcome `rejected`; the values describe different accounting dimensions rather than two candidates. Before configurable Relevance rules exist, safe link-accepted candidates pass the empty-rule boundary and `excluded` is zero.

Source-item filter mismatches are also pre-candidate outcomes. They count only in `source_item_filtered_count`, not in `normalization_failure_count`, `excluded`, or any Article-observation outcome. Accounting remains truthful when every parsed Raw item is filtered.

Accepted Article processing may also produce zero or more **orthogonal effects**, which do not replace the processing outcome:

- `visibility_hidden`;
- `duplicate_review_created`;
- `duplicate_grouped`.

### `articles`

- Source identifier;
- reliable Source external identifier where available;
- original discovered URL and canonical identity URL;
- display/source title and normalized title;
- author, summary/excerpt, image URL, language where available;
- Source-published time/confidence;
- first-seen/last-seen time;
- Source-updated time where available;
- stable identity fingerprint where implemented;
- visibility/moderation state;
- normalization/Relevance reasons.

`original_url` is the preserved absolute Source-provided Article destination and public headline destination. `canonical_identity_url` exists for identity comparison/cleanup and MUST NOT silently replace `original_url` as a public destination. A different Source-derived public/canonical destination field requires a separately governed future contract.

Source-derived normalized values remain distinct from optional administrator display overrides. An active override takes precedence only for its explicitly governed human-facing display field. Later Source observations continue updating the underlying Source-derived value without overwriting or clearing the override, and clearing the override immediately reveals the latest Source-derived value rather than a snapshot captured when the override began.

Ordinary display overrides MUST NOT replace or redefine Article Source ownership, reliable Source external identity, `canonical_identity_url`, normalized identity/matching fields, Collection-run/observation provenance, or Source-derived publication timestamps. In particular, `original_url` remains the stored publisher destination and is not a casual administrator display override. Public presentation may use an effective display value while headline navigation continues to use stored `original_url`.

### `article_observations`

- Article identifier when identity resolves;
- Source identifier where retained for direct provenance/validation;
- Source endpoint identifier;
- Collection run identifier;
- observed Source identity/key and optional bounded Raw-item reference;
- observation time;
- processing outcome/reason;
- Source-updated metadata/fingerprint where useful.

Observation invariants:

- `created`, `updated`, and `unchanged` observations MUST reference the resolved Article;
- pre-identity terminal outcomes such as `rejected` or `excluded` MAY have no Article identifier because identity was intentionally not reached;
- every observation MUST reference the Source endpoint and existing Collection run that actually produced that candidate outcome, and that Collection run MUST belong to that endpoint;
- when an Article is referenced, the Article Source MUST match the candidate and endpoint provenance;
- any directly stored observation Source identifier MUST agree with the endpoint/Article Source relationships rather than act as an independent ownership dimension;
- Article identity resolution plus Article create/update and its successful identity-resolving observation are atomic for that candidate.

A Raw item rejected by the Source RSS/Atom item admission filter is not a candidate outcome and MUST NOT create a synthetic Article observation.

### `categories` and `article_categories`

Categories are installation-wide Publication configuration. Each Category has an immutable installation-wide `config_key` and a mutable bounded display label. Articles may have multiple Categories; the singleton Publication may define a preferred display Category. Administration supports Category creation, read, and update without inventing a Category archive/lifecycle state.

Article/Category membership is unique per Article + Category. A Category referenced by a Relevance rule or Source/endpoint default MUST exist in the same installation. No Publication foreign key is required because another Publication cannot exist in the same supported installation.

Phase 17 manual Category moderation distinguishes automatic assignment from an active operator override. An active override is the operator-selected effective current Category set exposed by admin/public behavior and Category filtering; an intentionally empty set, if represented, means no effective Categories and is distinct from clearing the override. Automatic Relevance/default assignment and reasons continue to advance and remain recoverable while an override is active. Clearing the override returns effective control to the latest current automatic assignment, not an obsolete snapshot. The persistence representation is implementation-defined.

Physical Category removal is permitted only when transactionally shown to be unreferenced. Removal MUST be atomically rejected while any retained relationship requires the Category, including a `categorize` rule target, Source or endpoint default, current Article/Category membership, or retained observation/category-reason provenance. A removal path MUST NOT silently null, cascade away, or rewrite retained Article, provenance, or editorial relationships; operators first explicitly clear or change removable configuration references. Article moderation/manual recategorization remains Phase 17.

For ordinary candidate processing, Category assignment is determined as follows:

1. Evaluate every applicable enabled `categorize` rule independently.
2. All matching categorize rules apply; Category targets are deduplicated by immutable Category `config_key` rather than mutable label.
3. Categorize-rule priority orders persisted/explanatory reasons but does not suppress another matching Category assignment.
4. If at least one categorize rule assigns a Category, do not add a Source/endpoint default Category.
5. If no categorize rule assigns a Category, use the endpoint default Category when configured; otherwise use the Source default Category.
6. If no rule or default assigns a Category, the included Article may remain uncategorized.

### `relevance_rules`

- immutable `config_key` unique across the installation;
- optional Source scope;
- predicate type: `title_contains`, `summary_contains`, or `source_category_equals`;
- one bounded non-empty literal pattern;
- action: `include`, `exclude`, or `categorize`;
- Category target when action is `categorize`;
- explicit integer priority/order;
- enabled state;
- explanatory label/reason.

MVP predicate semantics are intentionally narrow and deterministic:

- `title_contains` matches the candidate's normalized title by case-insensitive literal substring comparison;
- `summary_contains` matches the normalized/sanitized candidate summary by case-insensitive literal substring comparison and does not match when summary is absent;
- `source_category_equals` matches any normalized Source-provided category label by case-insensitive literal equality and does not match when Source categories are absent;
- patterns are literal data, not regular expressions or globs;
- MVP does not provide stemming, fuzzy matching, semantic/AI matching, arbitrary metadata predicates, compound Boolean expressions, or generic ranking/boost behavior;
- missing candidate fields do not match rather than being coerced to empty strings with special meaning.

Deterministic MVP include/exclude procedure:

1. Collect applicable enabled matching include/exclude rules.
2. Highest explicit priority wins.
3. At equal priority, Source-scoped rule wins over installation-wide rule.
4. At equal priority and scope specificity, `exclude` wins over `include`.
5. At equal priority, scope specificity, and action, lexicographically lower immutable rule `config_key` wins so the selected reason is stable.
6. If no include/exclude rule decides the candidate, include by default.
7. Category rules are evaluated independently and do not alter inclusion unless a separate include/exclude rule does so.
8. Persist the winning include/exclude reason and applied Category-rule/default reasons in deterministic order once persistence for those reasons exists.

Applied categorize-rule reasons are ordered by priority descending, Source-scoped before installation-wide at equal priority, then immutable rule `config_key` ascending. Default-Category reasons are explicit and distinguish endpoint default from Source fallback.

An empty configured Relevance-rule set still executes the canonical boundary and gives safe normalized candidates deterministic default `include` rather than bypassing evaluation.

MVP Relevance-rule edits are prospective by default. They affect future candidate processing and MUST NOT cause automatic bulk retroactive re-evaluation of previously persisted Articles. Because Relevance precedes Article identity, a newly excluded future observation terminates before Article identity and MUST NOT look up an earlier Article merely to hide, delete, or recategorize it. A previously persisted Article remains in its prior persisted state unless an explicit moderation or dedicated future reprocessing capability changes it. A later included observation may apply then-current Category assignment through the ordinary candidate pipeline; that normal observation is not a bulk historical scan.

Administrator mutation exposes only this bounded model. A Source scope, when set, MUST reference a real Source. A `categorize` action MUST reference a real Category; `include` and `exclude` MUST NOT carry a Category target. Multi-resource changes validate relationships transactionally and roll back invalid combinations. Enabled/disabled is the ordinary non-destructive rule operation; no archive state is implied. Physical rule removal, if exposed, is permitted only when retained relationships, reasons, and provenance permit it. If retained history references the rule, removal MUST be rejected rather than cascading or rewriting history.

Generic `boost`/ranking behavior is deferred until a ranking/scoring contract exists.

### Distribution Profiles and Source associations

Logical persistence preserves Profile immutable `config_key`, display name, lifecycle, bounded result/history setting, and activation history sufficient to protect stable integration identity. Profile↔Source associations reference real Sources and store only the bounded `include_any_phrases[]`, `exclude_any_phrases[]`, and `category_config_keys[]` selection configuration. Category keys reference real Categories. An active Profile has at least one usable approved Source association; draft Profiles may be incomplete. Profile persistence does not duplicate Source configuration, Articles, identity, or provenance.

### Machine distribution credentials

Logical credential records store a non-secret lookup identity, secure verifier/digest, label, lifecycle/audit timestamps, optional expiration, revocation state, and `distribution:read` capability. Plaintext credentials are never persisted. Credentials belong to the isolated instance and do not require Profile permission rows in 2.0. Their persistence remains distinct from human administrator identity and authority.

### `duplicate_review_candidates`

- canonically ordered compared Article identifiers, preventing `(A, B)` and `(B, A)` from becoming distinct logical candidates;
- deterministic signals/reason codes;
- confidence;
- deterministic evidence/signals identity sufficient to distinguish materially changed from unchanged evidence without prescribing a hash algorithm;
- state such as `pending`, `dismissed`, `merged`, `superseded`;
- automatic/manual origin;
- manual decision time/reason where applicable.

### `duplicate_groups` and memberships

- Primary Article identifier;
- matching method/confidence;
- automatic/manual origin;
- group timestamps;
- membership records preserving every Article instance.

Each Article belongs to at most one group. Exactly one member is Primary, and the Primary identifier MUST reference a member of that same group. Repeated same-group evidence is idempotent. Strong-evidence merging of two groups is atomic/idempotent, preserves all Articles/observations/memberships, and leaves one deterministic Primary; weak evidence cannot merge groups automatically. Membership and Primary changes do not alter Article visibility or delete provenance. Phase 17 manual split/merge/Primary authority is retained until intentionally revised and cannot be silently undone by materially unchanged automatic evidence. Prefer database constraints for expressible uniqueness/integrity and transactions for the complete topology invariant. No Publication foreign key or cross-Publication membership check is needed in the supported singleton installation.

### `audit_events`

MVP persists append-only application change history for successful material Phase 17 moderation mutations. Records use bounded action, target, timestamp, reason, and bounded prior/new state where appropriate. Where atomic explanation is required, the record is written transactionally with the mutation and MUST NOT claim success when validation or the governed mutation rolls back. Ordinary Phase 17 administration cannot edit these records, and reads are bounded/paginated. MVP does not require a native administrator identifier or canonical per-user attribution; retention/pruning policy remains Phase 19 work.

Native administrator accounts/identity, roles, per-user authorization, account recovery, and identity-linked audit attribution are outside MVP and require a later contract/ADR if promoted.

## Identity and uniqueness invariants

Persistence MUST enforce or transactionally guarantee:

- singleton Publication/settings configuration;
- unique immutable Source `config_key` across the installation;
- unique immutable Source-endpoint `config_key` within a Source;
- unique immutable Category `config_key` across the installation;
- unique immutable Relevance-rule `config_key` across the installation;
- unique immutable Distribution Profile `config_key` across the installation;
- valid Profile↔Source and Profile-filter Category relationships;
- no duplicate Article/Category membership for one Article and Category;
- no duplicate non-archived normalized endpoint URL within the same Source;
- no duplicate Article for the same reliable immutable external identifier within the same Source;
- no duplicate Article for the same Source canonical identity when external identifier is absent;
- one Primary Article per Duplicate group;
- one canonical unresolved/reviewed Duplicate-candidate relationship per Article pair/method as appropriate;
- every public feed row resolves to an approved active Source and an eligible stored Article while singleton Publication `public_status = public`;
- pausing/disabling/archiving Source configuration never erases retained Article provenance.

For Article identity, an `ArticleCandidate.externalId` that is present is an adapter-designated strong Source identity signal; downstream identity code MUST NOT infer or downgrade its reliability by applying title, summary, date, or fuzzy-fingerprint heuristics. The current RSS/Atom adapter designates RSS `guid` and Atom `id` as that field.

Identity resolution uses that strong external identifier first and canonical URL fallback second within the same Source:

- a matching strong external identifier resolves the existing Article even when its Source-derived URL changes;
- a candidate without a strong external identifier falls back to canonical identity URL within the same Source;
- when an Article previously created through canonical-URL fallback is later observed with a strong external identifier and no contradictory strong identity exists, the existing Article MAY be promoted by attaching that external identifier rather than creating a second Article;
- two different strong external identifiers MUST NOT be silently merged, overwritten, or reassigned solely because their canonical URLs match;
- canonical-only fallback that encounters multiple Articles distinguished by different strong external identifiers is an explicit identity conflict and MUST NOT choose one arbitrarily;
- fuzzy title/fingerprint evidence is secondary corroboration only and MUST NOT resolve Article identity by itself.

An additional configured stable endpoint identity key is introduced only when a concrete approved adapter/endpoint requires one. Do not invent a speculative generic identity-key system merely because future adapters might use one.

## Public-feed eligibility

A feed row is eligible only when all of the following are true:

- singleton Publication configuration has `public_status = public`;
- the owning Source is `approved` and lifecycle `active`;
- the Article is `visible`; and
- the Article is either logically/persistently `ungrouped` or the `primary` member of its Duplicate group.

Articles outside groups are `ungrouped`. A visible `non_primary` member is duplicate-suppressed from ordinary rows but remains administratively available. Hidden/archived Articles are not restored merely because duplicate membership changes.

Collection and presentation state remain separate. Publication `active_for_collection`, Source operational state, and endpoint approval/lifecycle/operational/health state govern whether collection work runs; they do not by themselves suppress retained Articles that otherwise satisfy the public-row rule. Source approval/lifecycle and singleton Publication public exposure remain explicit public-row gates.

The public headline destination is `articles.original_url`; `canonical_identity_url` is not substituted merely because it is the identity-normalized URL.

## Time semantics

- `published_at` = Source-claimed publication time when credible.
- `first_seen_at` = first successful Platform observation.
- `last_seen_at` = latest observation.
- Platform `updated_at` = record-change time, never publication time.
- Public feed uses trusted `published_at`; otherwise `first_seen_at` with detectable fallback metadata.
- Persist UTC; render according to singleton Publication presentation rules when implemented.

The optional singleton `presentation_timezone` setting and administrator control accept only a valid IANA identifier. Absence retains the deterministic UTC calendar-date fallback; configuration changes presentation only and must not reinterpret stored timestamps or canonical feed ordering.

Normalization may parse Source publication/update values into UTC and attach confidence/reason/fallback metadata, but it does not create persistence observation times. Missing or invalid Source publication dates remain distinguishable, and normalization MUST NOT substitute a Collection-run timestamp as `published_at`. Article/observation persistence establishes `first_seen_at`/`last_seen_at` from actual Platform observations.

Processing semantics:

- a newly `created` Article sets `first_seen_at` and `last_seen_at` from the successful observation time;
- `first_seen_at` never moves forward on later observations;
- `updated` means at least one material normalized Source-derived Article field changed;
- `unchanged` means no material normalized Source-derived Article field changed;
- both `updated` and `unchanged` advance `last_seen_at` to the successful observation time;
- advancing `last_seen_at`, adding an observation, or changing only persistence-maintenance timestamps does not by itself convert an otherwise unchanged observation into `updated`.

For public-feed ordering, the effective feed date is trusted parsed `published_at` when available and otherwise `first_seen_at`. The read model identifies that source explicitly. Reverse-chronological ordering is deterministic: effective feed date descending, then `first_seen_at` descending, then stable Article identifier as the final tie-breaker.

## Pre-production database schema contract

Before production database compatibility is established:

- the repository's current migration chain defines the complete supported schema from zero;
- the active migration chain MUST be the smallest coherent representation of the current canonical schema. Foundational corrections delete, squash, replace, or consolidate superseded pre-production migration steps instead of retaining them solely as evolution history;
- fresh disposable PostgreSQL migrated from zero is the required persistence baseline for validation;
- databases created by older pre-production source trees are unsupported upgrade inputs and are destroyed/recreated and bootstrapped from current configuration;
- compatibility columns, dual schemas, data-copy bridges, transformation migrations, upgrade fixtures/tests, or other compatibility machinery MUST NOT be retained solely to preserve disposable pre-production database contents;
- migration-from-zero MUST establish singleton Publication semantics, installation-wide Source uniqueness, Source-scoped Article identity, and all Source/endpoint/run/Article/observation integrity constraints required by implemented behavior.

The pre-production rule governed only disposable pre-launch databases. Phase 19 established and validated the operational schema-upgrade/rollback/restore procedures required for production; accepted Phase 20 customer launch established the first supported production schema/data baseline.

## Production database schema contract

From the accepted Phase 20 production baseline forward, `docs/decisions/production-data-and-schema-compatibility.md` governs schema/data compatibility.

At minimum:

- customer production data and governed relationships are durable supported state and MUST be preserved by normal upgrades/refactors;
- supported production migration history MUST remain capable of upgrading supported deployed state and MUST NOT be squashed, reordered, deleted, or rewritten in a way that breaks that upgrade path;
- migration-from-zero remains required for new installations and disposable tests, but clean-install evidence does not substitute for production-upgrade evidence;
- schema changes after the production baseline require forward migration and data-preservation validation from the supported deployed baseline;
- development/test databases may remain disposable when they are not supported production state;
- destructive customer-data reset or incompatible data/schema transitions require a separately explicit approved decision rather than ordinary refactor/cleanup authority.

The production compatibility boundary protects supported persisted state; it does not require retaining unrelated dead code, obsolete wrappers, speculative aliases, or unsupported pre-production compatibility artifacts.

## Retention and deletion principles

These rules govern data managed inside a supported current database. Before the production baseline they do not restrict destroying/recreating an entire development or pre-production database under the pre-production rebuild-from-zero policy above. After the production baseline, customer production data is additionally governed by the production compatibility contract above.

- Provenance needed for change history, identity, or duplicate handling is not discarded because an Article is hidden/suppressed.
- Source/endpoint administration uses create/update, approval, enable/pause/disable, and archive lifecycle management rather than unconstrained physical deletion.
- Hard deletion requires explicit deletion policy preserving referential/change-history requirements or proof that no retained provenance depends on the object.
- Raw responses/items may have bounded retention.
- Error bodies are bounded/scrubbed.
- Deletion policy distinguishes moderation hiding, configuration archival, legal takedown, and physical deletion.
