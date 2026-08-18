# Source and Collection Contract

## Approval boundary

Only configured Sources/endpoints that are currently trusted and operationally eligible may be contacted.

An endpoint is collectable only when all are true:

- the singleton Publication configuration is active for collection;
- its Source approval state is `approved`;
- its Source lifecycle state is `active`;
- its Source operational state is `enabled`;
- its endpoint approval state is `approved`;
- its endpoint lifecycle state is `active`;
- its endpoint operational state is `enabled`;
- the endpoint URL passes pre-fetch scheme/host/DNS/address/port safety validation;
- the shared per-endpoint run lock can be acquired.

`paused`, `disabled`, and `archived` are not health values. The Platform MUST NOT use public submissions or discovered links to expand the whitelist silently.

## Bootstrap configuration and approval

Operator-maintained seed/bootstrap tooling MAY create the initial singleton Publication, Source, and endpoint configuration, including explicitly setting approval state to `approved`.

Bootstrap approval counts as deliberate operator approval; it is not a bypass of the approval boundary.

Bootstrap is an explicit operator action. Web/API and Worker ordinary startup MUST NOT implicitly apply bootstrap configuration.

Bootstrap identity is stable and configuration-owned:

- the Publication portion is singleton installation configuration and does not require a slug or dynamic identifier;
- each Source has an immutable `config_key` unique across the installation;
- each Source endpoint has an immutable `config_key` unique within its Source.

Ordinary bootstrap execution is create-if-absent by those stable identities. If singleton Publication settings or a matching Source/endpoint already exist, bootstrap MUST leave the existing record unchanged, including later operator-managed collection/public state, approval, lifecycle, operational state, approved domains, Source RSS/Atom item admission phrases, endpoint URL, and polling configuration. A rerun therefore MUST NOT recreate an obsolete seeded endpoint merely because an operator later changed its URL.

Bootstrap tooling:

- MUST NOT discover Sources/endpoints and auto-approve them;
- MUST NOT infer approval from a successful fetch;
- MUST NOT silently widen Source approved-domain policy;
- MUST be idempotent;
- MUST NOT blindly overwrite later operator-managed Publication/Source/endpoint state or other existing configuration.

Bootstrap data is initialization input rather than competing runtime authority for the admin-managed state.

Bootstrap/runtime commands operate on the installation's singleton Publication configuration and MUST NOT require a Publication slug or selector.

### Explicit editorial configuration path

An explicit topic-independent operator mechanism creates and edits Categories, Relevance rules, and Source/endpoint default Category references outside ordinary bootstrap semantics. Protected administration exposes the same governed model.

That operator path is distinct from ordinary Source/endpoint bootstrap semantics:

- it runs only when explicitly invoked and MUST NOT be applied implicitly during Web/API or Worker startup;
- Category and Relevance-rule identities use their immutable installation-wide `config_key` values;
- it MAY deliberately create/update/enable/disable governed editorial configuration because configuration edits are the purpose of the operation;
- it MUST validate referenced Source and Category identities and all domain invariants before commit;
- it MUST NOT auto-discover topic vocabulary, infer rules from collected content, or inject indie-author-specific behavior into shared engine code;
- it MUST NOT weaken ordinary bootstrap's create-if-absent/no-overwrite guarantee for existing Publication/Source/endpoint configuration;
- it MUST NOT perform automatic bulk historical Article reprocessing as a side effect of a rule edit.

That path remains explicit and MUST never run implicitly at Web/Worker startup. The protected admin control plane does not create a second rule model: it manages the same valid Category set used by Source/endpoint default-Category selectors without duplicating Source administration or Source-priority controls. There remains exactly one Relevance model.

## Approved-domain policy

Each Source defines the maximum approved public-domain boundary. Endpoint configuration may narrow that boundary for redirects/Article links but may not silently widen it.

Configuration representation is intentionally structural and deterministic:

- an approved-domain rule stores a normalized DNS hostname, not a scheme/path/query/credential-bearing URL;
- exact-host matching is the default;
- subdomain inclusion is explicit rather than inferred from a parent hostname;
- free-form wildcard strings are not a domain-policy primitive;
- absent endpoint narrowing means the endpoint inherits the Source maximum boundary;
- when endpoint narrowing exists, every endpoint rule MUST be equal to or narrower than an approved Source rule;
- an endpoint cannot enter `approved` state when its configured hostname falls outside the Source approved-domain policy.

### Pre-fetch network-safety policy

Before every outbound request, including every redirect hop, the destination MUST pass the same safety gate:

- only `http:` and `https:` schemes are permitted;
- the normalized hostname MUST remain inside the effective Source/endpoint approved-domain policy;
- the effective port MUST be 80 for HTTP or 443 for HTTPS; an explicit or derived non-default port is rejected until a later deliberately approved configuration mechanism defines otherwise;
- DNS resolution MUST succeed with at least one address;
- every resolved address considered for the request MUST be public unicast; if any returned address is non-public or special-use, the destination is rejected rather than selecting a different answer silently;
- loopback, RFC1918 private space, IPv6 unique-local space, link-local, multicast, unspecified, carrier-grade/shared address space, reserved/special-use destinations, and cloud-metadata destinations are rejected;
- IPv4-mapped IPv6 addresses MUST be classified according to their embedded IPv4 address so representation cannot bypass policy;
- redirects MUST resolve relative locations safely and rerun scheme, domain, port, DNS, and resolved-address validation before any redirected network contact;
- redirect limits are enforced by the transport phase that follows redirects and do not weaken per-hop safety validation.

The validated safety result consumed by transport MUST retain enough concrete destination information to prevent a second unchecked DNS decision. Transport MUST connect to a validated address, or use an equivalent resolver-binding mechanism that guarantees the actual destination is one of the validated addresses, while preserving the original hostname for HTTP Host/TLS semantics where required. A transport that independently re-resolves the hostname after safety approval is not compliant.

### Endpoint run lock

The endpoint run lock is a shared, cross-process exclusivity primitive keyed by Source endpoint identity. It MUST prevent two Worker processes from simultaneously owning execution for the same endpoint while permitting unrelated endpoints to proceed independently.

The lock MUST use PostgreSQL or another equivalently shared/durable coordination mechanism available to all Worker processes; a process-local mutex alone is insufficient. Acquisition failure is a normal non-execution outcome, and lock release MUST be safe on success and failure paths. Durable jobs, scheduling, and manual checks reuse this same lock.

### Eligibility and safety decision reasons

Eligibility and network-safety decisions MUST expose stable machine-readable reason codes rather than relying on free-form text. Bounded human detail MAY accompany the code but MUST NOT replace it.

The eligibility/safety reason vocabulary MUST distinguish at least:

- `publication_inactive` — singleton Publication collection is disabled;
- `source_unapproved`;
- `source_archived`;
- `source_paused`;
- `source_disabled`;
- `endpoint_unapproved`;
- `endpoint_archived`;
- `endpoint_paused`;
- `endpoint_disabled`;
- `endpoint_locked`;
- `unsupported_scheme`;
- `domain_not_approved`;
- `port_not_allowed`;
- `dns_resolution_failed`;
- `unsafe_resolved_address`.

Redirect revalidation uses the same destination-safety reason vocabulary with redirect-stage context rather than inventing a weaker second policy.

After normalization has resolved the Source-provided Article URL, Article-link acceptance MUST separately:

- consume the absolute normalized original Article URL produced by normalization rather than independently re-resolving relative input;
- normalize internationalized/case-insensitive hostnames safely for policy comparison;
- validate Article-link domains against Source/endpoint policy;
- record unexpected cross-domain Article links rather than automatically following/accepting them;
- avoid fetching or following the Article URL as part of link acceptance.

Pre-fetch network safety and post-parse Article-link validation are different gates and both are required.

## Source-type priority

Preferred order:

1. RSS or Atom.
2. Stable structured API or JSON feed.
3. Configurable HTML listing extraction.
4. Custom adapter.
5. Browser automation only when ordinary HTTP cannot reliably collect an approved Source.

A lower-priority method requires an operational reason. Convenience alone does not justify browser automation.

The fetcher/parser adapter boundary is established with the first structured-feed implementation. Later HTML/custom collectors implement that existing boundary rather than redefining it.

### Endpoint type and polling configuration

The structured-feed endpoint type is `rss_atom`; the parser determines whether fetched content is RSS or Atom rather than requiring an operator to pre-classify the XML dialect correctly.

The canonical basic polling field is `poll_interval_seconds`. It MUST be a positive bounded value. `0` MUST NOT mean disabled because operational state already owns `enabled`, `paused`, and `disabled` semantics. Only implemented endpoint types and their governed adapter-specific configuration are accepted.

### Configurable HTML listing collection

Endpoint type `html_listing` exists beside `rss_atom`. Its canonical path is:

```text
configured approved html_listing endpoint
→ ordinary eligibility and endpoint lock
→ existing destination/network-safety gate
→ existing bounded HTTP transport and redirect validation
→ static HTML listing parser adapter
→ RawItem[]
→ Article-candidate normalization
→ Article-link policy
→ existing Relevance/Categories
→ Source-scoped identity/persistence/observation
→ existing duplicate processing
→ existing run/job/health behavior
```

There is no HTML-specific normalization, Relevance, Article repository, duplicate, or public-feed path. Endpoint type selects the parser adapter; every adapter rejoins the same Raw-item boundary and downstream pipeline.

#### Endpoint and transport behavior

An HTML run fetches only the explicitly configured listing endpoint URL. It does not crawl or follow listing pagination, discover or fetch Article pages, load images/stylesheets/scripts/frames/embeds or other subresources, or discover additional Sources/endpoints. Conditional requests, redirect limits, timeouts, response/decompression bounds, retry classification, scheduling, locking, and failure isolation remain owned by the canonical collection path.

HTTP `Accept` and response media-type validation are endpoint-type-aware. `html_listing` supports ordinary static HTML such as `text/html`; standards-compatible XHTML MAY be accepted only when the selected static parser deliberately supports it. RSS/Atom retains its existing supported feed media types and MUST NOT be globally weakened to admit HTML responses.

#### Static parsing

The HTML adapter parses only the fetched response bytes/string. It never executes JavaScript, instantiates browser automation, or loads subresources. Selector length/complexity, document processing, matched item count, extracted field sizes, and returned diagnostics are bounded. Selector/profile syntax errors are configuration errors rejected before collection.

Runtime markup/profile drift produces a bounded stable parser diagnostic rather than silent success. For matched item roots:

- emit a Raw item only when required title and Article URL extraction succeeds;
- reject and count an individual malformed item without necessarily failing unrelated valid items;
- zero matched roots, or a result in which no matched item produces a valid required title and URL, is a diagnosable parser failure rather than successful empty content;
- absent optional fields remain absent unless a separately defined bound or invariant is violated.

Relative Article URLs remain Raw-item input and normalization resolves them against the terminal successfully fetched endpoint URL after approved redirects. Generic HTML parsing never synthesizes `RawItem.externalId` from list position, selector path, title/date/content hashes, DOM markup, or another generated HTML fingerprint; canonical-URL fallback remains the generic HTML identity path.

#### RSS/Atom admission-filter boundary

The Source RSS/Atom item admission filter does not apply to HTML listings. When a Source owns both endpoint types, Source admission phrases apply only to supported RSS/Atom Raw items; the HTML profile determines which DOM items become HTML Raw items, and those items proceed directly to Article-candidate normalization. This does not create a second HTML keyword filter or another Relevance model.

#### Browser fallback gate

Browser automation remains unsupported. There is no browser endpoint type, Playwright/Puppeteer/headless-browser collector, or automatic escalation from static parsing. Static-parser diagnostics may inform an operator, but selector failure alone does not prove that browser automation is required. A later browser collector requires an explicit future promotion/decision for a specifically approved Source after ordinary HTTP extraction is shown insufficient.

#### Safe selector preview

Selector preview is a pure parsing operation over a bounded operator-supplied HTML sample and draft HTML profile. It performs no outbound network request or DNS lookup; creates no Collection run; acquires no endpoint lock; changes no conditional validator/cache, scheduler timing, or endpoint health; and persists no Article, Article observation, duplicate state, or Relevance outcome. It executes no scripts/subresources and returns only bounded extracted preview rows plus safe diagnostics without echoing an unbounded/raw HTML document.

A protected admin endpoint MAY use POST because sample/profile data is request input. Existing request-integrity rules still apply to browser-originating unsafe requests even though preview is non-persistent. Network-backed verification remains the governed manual check-now path after a persisted endpoint is collectable; preview is not a fetcher. Sample preview proves parser/profile behavior only, while check-now proves the real governed collection path. Neither is Level 7 live-Source evidence unless the Level 7 procedure is intentionally performed.

## Configuration precedence

Singleton Publication configuration owns installation-wide editorial/global controls including:

- collection-active/public state;
- name and later branding/presentation settings;
- installation-wide Categories and Relevance rules;
- Source priority ordering.

Source configuration owns:

- approval/trust and lifecycle/operational states;
- approved-domain maximum boundary;
- Source priority value within the installation;
- optional default Category fallback;
- optional Source RSS/Atom item admission phrases;
- Source scope for otherwise installation-defined Relevance rules.

Endpoint configuration owns:

- endpoint type/URL;
- approval/trust and lifecycle/operational states;
- polling interval;
- timeout;
- parser profile/adapter key;
- redirect/Article-domain restrictions that only narrow Source policy;
- optional endpoint default Category override;
- optional parser/header settings that do not leak secrets to logs.

Default Category resolution is fallback-only: if no matching categorize rule assigns a Category, endpoint default wins when present and Source default is the fallback. A matching categorize rule set suppresses default fallback for that candidate rather than automatically adding a generic default Category alongside specific rule assignments.

## Source RSS/Atom item admission filter

One optional, topic-independent Source-level admission filter applies to parsed RSS/Atom Raw items. It is Source configuration, not endpoint configuration, a Publication tenancy mechanism, a public-feed search filter, or a second Relevance-rule engine. HTML listing endpoints do not use it; any future adoption by another adapter requires an explicit contract change rather than unconditional application by endpoint type.

A configured filter contains one or more bounded, trimmed, non-empty keyword/phrase literals:

- no configured phrases means admit every otherwise-valid parsed RSS/Atom Raw item, preserving collect-all behavior;
- when phrases are configured, an item is admitted when any configured phrase matches;
- matching is deterministic case-insensitive literal substring matching, not regex, glob, fuzzy, stemming, semantic/AI, or general-expression behavior;
- matching may inspect only existing RSS/Atom parser editorial text corresponding to title, summary/content text, and Source-provided category labels;
- missing fields do not match, and the filter does not fetch or inspect the Article page or full Article body;
- text may be normalized only as needed for deterministic safe comparison at this boundary; canonical Article-candidate normalization remains a later stage.

There is no exclude-phrase list and no independently persisted enabled toggle. Absence of phrase configuration is the disabled/collect-all state.

The canonical supported order is:

```text
fetch
→ RSS/Atom parse
→ Raw item
→ optional Source RSS/Atom item admission filter
→ Article-candidate normalization
→ Article-link policy
→ governed Relevance/Categories
→ Source-scoped Article identity/persistence
→ downstream behavior
```

The feed is still fetched and safely parsed before item text can be evaluated. The filter controls only whether an individual successfully parsed Raw item enters candidate processing. It does not bypass Source/endpoint approval or lifecycle/operational eligibility, endpoint locking, network safety, redirect validation, fetch bounds, parser safety, Article-link validation for admitted candidates, Relevance, Source-scoped identity, provenance, scheduling, or jobs.

A mismatching Raw item terminates before Article-candidate normalization. It is not a normalized candidate, does not receive the Relevance outcome `excluded`, does not run Article identity, and does not create an Article observation. It does not create, update, hide, delete, or recategorize an Article, including an Article persisted by an earlier admitted observation. Existing Relevance predicates remain exactly `title_contains`, `summary_contains`, and `source_category_equals`; Source admission does not add a Relevance predicate.

Source-filter edits are prospective. Creating, changing, or removing the filter affects future RSS/Atom collection attempts only and MUST NOT automatically bulk reprocess historical Articles, delete/hide/recategorize Articles, alter earlier observations, or rewrite historical Collection runs. Persisted Articles remain governed by ordinary Article/public-feed lifecycle behavior unless a later admitted observation or separately authorized moderation capability changes them.

## Fetch contract

Fetcher MUST provide:

- explicit connect/total timeouts;
- bounded response size;
- redirect limit plus pre-request destination revalidation;
- compressed-response handling with decompressed-size limits;
- conditional requests using ETag/Last-Modified when supplied;
- identifiable user-agent configuration;
- transport metrics;
- content-type validation;
- safe retry classification.

Fetcher SHOULD respect published Source guidance and avoid unnecessary traffic.

## Worker execution ownership

Manual checks and durable scheduled jobs use the same Worker-owned endpoint execution unit: eligibility → run lock → network safety → fetch/redirect → parse → conditional RSS/Atom admission → normalize → Article-link validation → Relevance/Categories → identity/persistence/observation → duplicate processing → run/health finalization. One endpoint invocation creates one isolated Collection run, and its failure does not invalidate an unrelated endpoint run. Web/API never performs collection inline.

Worker/manual/scheduler execution selects the Source/endpoint directly. It MUST NOT require a Publication slug or identifier to choose among topics in one installation.

## Retry and backoff

Automated polling/job retries obey these rules:

- retries apply only to transient failures;
- attempts are bounded;
- backoff includes jitter;
- authentication, validation, parser-contract, and permanent client errors are not retried indefinitely;
- repeated failures influence derived endpoint health and may trigger cooldown/circuit-breaking;
- one endpoint's retry loop cannot monopolize Worker capacity.

Manual checks report the same retry classification without creating a separate retry policy.

## Parser contract

A parser converts fetched content into Raw items and MUST NOT write directly to Article persistence.

Raw items SHOULD expose, when available:

- Source-provided identifier;
- title;
- URL;
- publication/update timestamps;
- author;
- summary/excerpt;
- image URL;
- category labels;
- language;
- bounded Source-specific diagnostic metadata.

Parser output is untrusted input.

When an adapter emits `RawItem.externalId`, it designates that field as the adapter's strong Source-item identity signal for downstream Article identity. Downstream identity logic MUST NOT invent reliability heuristics from title, summary, dates, or fuzzy fingerprints to reinterpret that field. For the current RSS/Atom adapter, RSS `guid` and Atom `id` are the designated `externalId` inputs.

## Normalization contract

Before Relevance, identity, duplicate, or public-feed logic, normalization MUST:

- trim/normalize text without changing intended human meaning;
- resolve relative Article URLs against the terminal successfully fetched endpoint URL after approved redirects; when no redirect occurred, the configured endpoint URL is that terminal base;
- preserve the resulting absolute Source-provided Article destination as the original discovered URL separately from the canonical identity URL;
- derive canonical identity URLs conservatively with a standards-based URL representation: remove fragments and strip only the exact recognized tracking-parameter names `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`, `gclid`, `dclid`, `fbclid`, `msclkid`, `mc_cid`, and `mc_eid`; preserve all other query names, values, multiplicity, path information, and semantics, and do not invent heuristic query stripping, path rewriting, or trailing-slash normalization;
- parse recognized credible Source dates to UTC while preserving confidence/reason/fallback metadata and the distinction from missing or invalid Source dates; normalization MUST NOT manufacture `first_seen_at` or substitute a Collection-run timestamp as a Source publication time;
- sanitize/strip unsafe markup;
- bound field lengths;
- normalize title representation for matching while preserving display/source title;
- attach Source, endpoint, and Collection-run provenance; Publication tenancy is not part of the candidate contract;
- hand the absolute normalized Article URL to the separate Article-link domain-policy gate before acceptance.

The original discovered URL remains the future public destination unless a later explicit Source-derived canonical/public-destination field is governed separately; canonical identity cleanup exists for identity comparison and MUST NOT silently replace the preserved original destination.

## Relevance evaluation

Relevance belongs to singleton Publication configuration, not engine code.

MVP actions are `include`, `exclude`, and `categorize`. Persisted Categories and Relevance rules use immutable installation-wide `config_key` identities; a rule may optionally scope itself to one Source.

MVP rule matching uses only these deterministic literal predicates:

- `title_contains` — case-insensitive literal substring match against normalized title;
- `summary_contains` — case-insensitive literal substring match against the normalized/sanitized summary, with absent summary treated as no match;
- `source_category_equals` — case-insensitive literal equality against any normalized Source-provided category label, with absent Source categories treated as no match.

Every rule contains one bounded non-empty literal pattern. Patterns are not regexes or globs. MVP does not add stemming, fuzzy matching, semantic/AI relevance, arbitrary metadata expressions, compound Boolean expressions, generic ranking, or boost scoring.

Deterministic include/exclude procedure:

1. Collect applicable enabled matching include/exclude rules.
2. Highest explicit priority wins.
3. At equal priority, Source-scoped rule wins over installation-wide rule.
4. At equal priority and scope specificity, `exclude` wins over `include`.
5. At equal priority, scope specificity, and action, lexicographically lower immutable rule `config_key` wins so both decision and winning reason are deterministic.
6. If no include/exclude rule decides the candidate, include by default.
7. Persist the winning include/exclude reason once persistence for those reasons exists.

Categorization is independent from inclusion:

1. Evaluate every applicable enabled matching `categorize` rule.
2. All matching categorize rules apply; deduplicate Category targets by immutable Category `config_key`.
3. Categorize-rule priority orders reasons but does not suppress another matching Category assignment.
4. Order applied rule reasons by priority descending, Source-scoped before installation-wide at equal priority, then immutable rule `config_key` ascending.
5. If at least one categorize rule assigns a Category, do not add a default Category.
6. If none assigns a Category, use endpoint default Category when configured; otherwise Source default Category.
7. If neither a rule nor a default assigns a Category, an included Article may remain uncategorized.
8. Default reasons must distinguish endpoint default from Source fallback.

An `exclude` result terminates candidate processing before Article identity and produces the canonical `excluded` processing outcome with persisted endpoint/run provenance and exclusion reason. It MUST NOT perform Article identity lookup merely to find/hide/delete/recategorize an Article stored by an earlier included observation.

With an empty rule set, normalized safe candidates still pass through this canonical boundary and receive deterministic default `include`. The pipeline never bypasses Relevance merely because no rule matches or is configured.

Relevance-rule edits are prospective by default in MVP. They affect future candidate processing. Automatic bulk retroactive re-evaluation of already persisted Articles is deferred unless a dedicated reprocessing operation is explicitly added later. Existing Articles retain prior persisted state until ordinary later included observations, explicit moderation, or a dedicated future reprocessing operation changes it. Applying then-current Category rules during an ordinary later included observation is normal candidate processing, not a bulk historical scan.

When manual Category moderation is active, ordinary included observations continue evaluating and persisting the latest automatic Relevance/default Category assignment and reasons, but MUST NOT overwrite or clear the active operator-selected effective Category set. Automatic state remains recoverable, and clearing the override returns effective control to the latest automatic assignment. Likewise, normal collection continues updating governed Source-derived display values without overwriting or clearing an active display override. Collection never rewrites historical runs/observations, Source ownership, identity fields, or `original_url` as a moderation shortcut.

Generic `boost` ranking is deferred until a ranking/scoring contract exists.

## Article identity and idempotency

Reprocessing the same Source item MUST converge on the same logical Article identity.

Identity resolution order is:

1. adapter-designated reliable immutable Source external identifier within the same Source;
2. normalized/canonical URL identity within the same Source when a strong external identifier does not resolve the candidate;
3. an explicitly configured stable endpoint identity key only when a concrete approved adapter/endpoint actually requires one;
4. conservative fingerprints only as secondary corroboration, never as a primary resolver.

A matching strong external identifier resolves the existing Article even when its Source-derived URL changes. A candidate without a strong external identifier falls back to canonical URL identity. If an Article was originally created through canonical-URL fallback and a later observation supplies a strong external identifier with no contradictory strong identity, the existing Article MAY be promoted by attaching that external identifier rather than creating a second Article.

Two different strong external identifiers MUST NOT be silently merged, overwritten, or reassigned solely because their canonical URLs match. Canonical-only fallback that encounters multiple Articles distinguished by different strong external identifiers is an explicit identity conflict and MUST NOT choose one arbitrarily. Fuzzy-title similarity or fingerprint evidence alone never overwrites or resolves an Article.

Do not invent a speculative generic stable-identity-key configuration mechanism merely because future adapters may require one. Such configuration is introduced only with a concrete adapter/endpoint requirement.

Transactional uniqueness constraints are required where practical. Repeated observation may add/update Article observations and run counters, but Article cardinality must not increase for the same Source identity.

True duplicate grouping between separately stored Articles is governed by the Article lifecycle/deduplication contract and is not the same as idempotent identity resolution.

## Collection runs and accounting

A minimal persisted Collection run begins with the first real transport/parser phase. It records the endpoint, start/finish timing, transport/parser status, bounded errors, and stage counts that actually exist.

The same run model records normalization stage status plus bounded pre-persistence item counts:

- `source_item_filtered_count` counts successfully parsed Raw items rejected by the configured Source RSS/Atom item admission filter before Article-candidate normalization;
- normalization stage status uses `not_run`, `succeeded`, or `failed`;
- `normalized_candidate_count` counts Raw items that complete normalization into an Article candidate before the separate Article-link policy decision;
- `normalization_failure_count` counts Raw items that cannot produce an Article candidate because normalization fails or required candidate data is malformed/invalid/out of bounds;
- `article_link_rejection_count` counts normalized Article candidates rejected by the separate Article-link/domain policy gate.

For a parsed content run that completes the bounded batch, `raw_item_count` MUST equal `source_item_filtered_count + normalized_candidate_count + normalization_failure_count`, `source_item_filtered_count` MUST NOT exceed `raw_item_count`, and `article_link_rejection_count` MUST NOT exceed `normalized_candidate_count`. The number of candidates safe to hand to the next pipeline stage is therefore `normalized_candidate_count - article_link_rejection_count`. Source-filter mismatches are not normalization failures. Item-level normalization failures or link-policy rejections do not by themselves make the normalization stage `failed`; stage-level `failed` is reserved for an execution failure that prevents the normalizer from completing its bounded batch contract. Unrelated Raw items continue processing when safely possible, and accounting remains truthful when every Raw item is filtered.

After Article persistence is active, every successfully normalized candidate has exactly one processing outcome:

- `created`;
- `updated`;
- `unchanged`;
- `rejected`;
- `excluded`;
- `failed`.

The post-normalization outcome counters MUST therefore satisfy:

`created + updated + unchanged + rejected + excluded + failed = normalized_candidate_count`.

Normalization failures do not receive a processing outcome because no Article candidate exists. Article-link-policy rejection remains counted in `article_link_rejection_count` and maps that same candidate to processing outcome `rejected`. Link-accepted candidates then pass Relevance before identity. Before configurable rules exist, the empty-rule decision is deterministic `include`, so `excluded = 0`. Once configurable rules exist, every deterministic Relevance exclusion maps exactly one normalized candidate to `excluded`; it does not also count as `rejected`, `failed`, or an identity-resolving outcome.

Source-filter mismatches count only in `source_item_filtered_count`. They do not enter the downstream processing-outcome equation, do not count as Relevance `excluded` or normalization failures, and do not create Article observations solely for accounting.

Accepted Article processing may additionally produce zero or more orthogonal effects:

- `visibility_hidden`;
- `duplicate_review_created`;
- `duplicate_grouped`.

Effects do not replace outcomes. For example, a candidate may be `created` and also cause `duplicate_grouped` in the same run.

Collection runs aggregate processing outcomes and effects separately, plus transport/run-level status. Run finalization occurs after the bounded candidate batch has completed and the canonical outcome counters are known; item-level persistence failures do not erase successful unrelated candidate work when integrity permits isolation.

During pre-persistence collection/normalization, runs record transport/parser stage status/counts plus normalization status and normalization/Article-link item counts, but MUST NOT use post-identity outcome names as though Article persistence exists.

Generic terms such as `accepted` or `skipped` require explicit mapping rather than competing counter definitions.

## Source health

Endpoint health is derived from recent collection behavior and uses:

- `unknown`;
- `healthy`;
- `delayed`;
- `degraded`;
- `unhealthy`.

Lifecycle (`active/archived`) and operational state (`enabled/paused/disabled`) remain separate from health.

Once health UI/telemetry exists, operators must be able to distinguish transport, parse, validation, Relevance, and persistence failures. A Source-level health indicator, if displayed, is a derived summary of endpoint states/health.

## Push delivery

The Platform model may support push-capable Sources in the future, consistent with the near-real-time law. **Push/webhook adapters are deferred beyond MVP unless explicitly promoted by a later project decision.** MVP collection uses configurable polling even when a Source happens to offer push.
