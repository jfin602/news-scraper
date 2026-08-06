# Domain and Data Contract

## 1. Canonical terminology

### Platform

The reusable software system that hosts collection, normalization, deduplication, administration, and public-feed capabilities.

### Publication

A configured news product with its own name, slug, branding, timezone, categories, relevance rules, sources, and public feed. A publication is the boundary for topic-specific behavior.

### Source

An administrator-approved publisher or outlet. A source owns one or more collection endpoints and defines the public source identity displayed with articles.

### Source endpoint

A specific machine-readable feed, API URL, or HTML listing page belonging to a source. Polling state, HTTP cache metadata, parser settings, and health are endpoint-level concerns.

### Collection run

One attempt to collect one source endpoint. It records timing, outcome, transport details, counts, and errors.

### Raw item

The minimally interpreted item produced by a source parser. Raw items are retained only as needed for diagnostics and safe reprocessing.

### Article candidate

A normalized but not yet accepted record produced from a raw item. Relevance, identity, and duplicate decisions operate on candidates.

### Article

A persisted normalized source instance representing one discovered article URL or source-provided item identity.

### Primary article

The article instance selected to represent a true duplicate group in the public feed.

### Duplicate group

A set of article instances determined to represent the same underlying published item. One member is primary; all members remain stored.

### Related coverage

Different articles about the same event or subject. Related coverage is not a true duplicate and remains separately visible in the MVP.

### Category

A publication-owned editorial grouping. Categories are never assumed to have the same meaning across publications.

### Relevance rule

A publication-owned rule used to include, exclude, boost, or categorize candidates. Rules must be explainable and auditable.

## 2. Ownership boundaries

- A publication owns categories, relevance rules, branding, sources, and feed settings.
- A source belongs to exactly one publication in the MVP.
- A source owns one or more endpoints.
- An endpoint owns collection state and collection runs.
- An article belongs to one publication and one source.
- A duplicate group belongs to one publication and cannot combine articles from different publications.
- Administrative users may later span publications, but authorization must be checked at the publication boundary.

## 3. Core entities

The names below describe logical entities rather than a final SQL migration.

### `publications`

Required concepts:

- stable identifier;
- name and slug;
- description;
- default timezone;
- public status;
- branding configuration;
- feed configuration;
- created and updated timestamps.

### `sources`

Required concepts:

- publication identifier;
- display name and website URL;
- approved-domain policy;
- enabled state;
- default category;
- source-level relevance settings;
- created, updated, and administrative audit timestamps.

### `source_endpoints`

Required concepts:

- source identifier;
- endpoint URL and type;
- enabled state;
- parser configuration;
- polling interval;
- next-due and last-attempt timing;
- last-success timing;
- ETag and Last-Modified values;
- consecutive failure count;
- current health state.

### `collection_runs`

Required concepts:

- endpoint identifier;
- start and finish timestamps;
- terminal status;
- HTTP status and response metadata where applicable;
- discovered, accepted, updated, skipped, and duplicate counts;
- structured error code and bounded error detail;
- worker or execution identifier.

### `articles`

Required concepts:

- publication and source identifiers;
- source-provided external identifier when available;
- original and canonical URLs;
- title and normalized title;
- author, summary, image URL, and language when available;
- source-published time and confidence;
- first-seen and last-seen times;
- source-updated time when available;
- content/identity fingerprint;
- visibility and moderation state;
- normalization and relevance decision metadata.

### `categories` and `article_categories`

Categories belong to one publication. Articles may have more than one category, while a publication may define one preferred primary category for display.

### `duplicate_groups` and memberships

Required concepts:

- publication identifier;
- primary article identifier;
- matching method and confidence;
- automatic or manual origin;
- group creation and update timestamps;
- membership records preserving each article instance.

### `relevance_rules`

Required concepts:

- publication identifier;
- optional source scope;
- rule type and pattern;
- action: include, exclude, boost, or categorize;
- priority or weight;
- enabled state;
- explanatory label.

### `audit_events`

Administrative changes affecting sources, endpoints, publication settings, article visibility, categories, and duplicate groups must produce audit events.

## 4. Identity and uniqueness invariants

The persistence layer MUST enforce or transactionally guarantee:

- unique publication slug;
- no duplicate active endpoint URL within the same source after URL normalization;
- no duplicate article for the same source-provided immutable external identifier;
- no duplicate article for the same publication/source canonical identity when an external identifier is absent;
- one primary member per duplicate group;
- duplicate-group membership cannot cross publication boundaries;
- every publicly visible row resolves to one stored primary article and one approved source;
- disabling a source prevents future collection but does not erase existing provenance.

## 5. Time semantics

- `published_at` is the source-claimed publication time when parseable and credible.
- `first_seen_at` is the first successful platform observation.
- `last_seen_at` is the latest run in which the item remained present or was encountered again.
- `updated_at` is a platform record-change timestamp and must not be presented as publication time.
- The public feed uses `published_at` when trusted, otherwise `first_seen_at` with a detectable fallback marker in data.
- Dates are stored in UTC and rendered using publication or viewer presentation rules.

## 6. Data retention principles

- Provenance required for duplicate handling and auditability must not be discarded merely because an article is hidden.
- Raw responses or raw item payloads may have bounded retention to control storage and sensitive-data exposure.
- Error bodies must be bounded and scrubbed of secrets.
- Deletion policies must distinguish administrative hiding, source removal, legal takedown, and physical data deletion.
