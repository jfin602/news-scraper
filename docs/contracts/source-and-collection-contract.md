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

Before Source administration UI exists, operator-maintained seed/bootstrap tooling MAY create the singleton Publication configuration plus Source and endpoint configuration, including explicitly setting approval state to `approved`.

Bootstrap approval counts as deliberate operator approval; it is not a bypass of the approval boundary.

Bootstrap is an explicit operator action. Web/API and Worker ordinary startup MUST NOT implicitly apply bootstrap configuration.

Bootstrap identity is stable and configuration-owned:

- the Publication portion is singleton installation configuration and does not require a slug or dynamic identifier;
- each Source has an immutable `config_key` unique across the installation;
- each Source endpoint has an immutable `config_key` unique within its Source.

Ordinary bootstrap execution is create-if-absent by those stable identities. If singleton Publication settings or a matching Source/endpoint already exist, bootstrap MUST leave the existing record unchanged, including later operator-managed collection/public state, approval, lifecycle, operational state, approved domains, endpoint URL, and polling configuration. A rerun therefore MUST NOT recreate an obsolete seeded endpoint merely because an operator later changed its URL.

Bootstrap tooling:

- MUST NOT discover Sources/endpoints and auto-approve them;
- MUST NOT infer approval from a successful fetch;
- MUST NOT silently widen Source approved-domain policy;
- MUST be idempotent;
- MUST NOT blindly overwrite later operator-managed Publication/Source/endpoint state or other existing configuration.

Once admin UI becomes the normal management surface, bootstrap data is initialization input rather than competing runtime authority.

Bootstrap/runtime commands operate on the installation's singleton Publication configuration and MUST NOT require a Publication slug or selector.

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

Phase 3 validated and persisted these configuration relationships only. It did not resolve DNS, classify resolved addresses, enforce runtime port policy, follow redirects, or contact endpoints. Those pre-request network-safety behaviors begin in Phase 4.

### Phase 4 pre-fetch network-safety policy

Before every outbound request, including every redirect hop once transport exists, the destination MUST pass the same safety gate:

- only `http:` and `https:` schemes are permitted;
- the normalized hostname MUST remain inside the effective Source/endpoint approved-domain policy;
- the effective port MUST be 80 for HTTP or 443 for HTTPS; an explicit or derived non-default port is rejected until a later deliberately approved configuration mechanism defines otherwise;
- DNS resolution MUST succeed with at least one address;
- every resolved address considered for the request MUST be public unicast; if any returned address is non-public or special-use, the destination is rejected rather than selecting a different answer silently;
- loopback, RFC1918 private space, IPv6 unique-local space, link-local, multicast, unspecified, carrier-grade/shared address space, reserved/special-use destinations, and cloud-metadata destinations are rejected;
- IPv4-mapped IPv6 addresses MUST be classified according to their embedded IPv4 address so representation cannot bypass policy;
- redirects MUST resolve relative locations safely and rerun scheme, domain, port, DNS, and resolved-address validation before any redirected network contact;
- redirect limits are enforced by the transport phase that follows redirects and do not weaken per-hop safety validation.

The validated safety result consumed by transport MUST retain enough concrete destination information to prevent a second unchecked DNS decision. Phase 5 transport MUST connect to an address that was validated by the Phase 4 gate, or use an equivalent resolver-binding mechanism that guarantees the actual destination is one of the validated addresses, while preserving the original hostname for HTTP Host/TLS semantics where required. A transport that independently re-resolves the hostname after safety approval is not compliant.

Phase 4 may perform DNS resolution because address classification is part of the safety decision. It does **not** issue publisher HTTP requests, follow real HTTP redirects, create Collection runs, or add the manual Worker collection command. An eligible endpoint reaches an injected/controlled outbound-fetch boundary with a validated destination; Phase 5 is the first phase that performs real HTTP transport and follows redirects through this gate.

### Phase 4 endpoint run lock

The endpoint run lock is a shared, cross-process exclusivity primitive keyed by Source endpoint identity. It MUST prevent two Worker processes from simultaneously owning execution for the same endpoint while permitting unrelated endpoints to proceed independently.

The lock MUST use PostgreSQL or another equivalently shared/durable coordination mechanism available to all Worker processes; a process-local mutex alone is insufficient. Acquisition failure is a normal non-execution outcome, and lock release MUST be safe on success and failure paths. Phase 10 durable jobs/scheduling reuse this Phase 4 primitive rather than introducing the first distributed endpoint lock.

### Phase 4 decision reasons

Eligibility and network-safety decisions MUST expose stable machine-readable reason codes rather than relying on free-form text. Bounded human detail MAY accompany the code but MUST NOT replace it.

The Phase 4 reason vocabulary MUST distinguish at least:

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

### Phase 3 endpoint type and polling configuration

Phase 3 persisted only the structured-feed type needed for the initial critical path. The canonical initial endpoint type is `rss_atom`; the parser determines whether fetched content is RSS or Atom rather than requiring an operator to pre-classify the XML dialect correctly.

The canonical basic polling field is `poll_interval_seconds`. It MUST be a positive bounded value. `0` MUST NOT mean disabled because operational state already owns `enabled`, `paused`, and `disabled` semantics. Other endpoint types and their adapter-specific configuration arrive only with the roadmap phase that implements them.

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
- default Category fallback;
- optional Source-scoped Relevance defaults.

Endpoint configuration owns:

- endpoint type/URL;
- approval/trust and lifecycle/operational states;
- polling interval;
- timeout;
- parser profile/adapter key;
- redirect/Article-domain restrictions that only narrow Source policy;
- endpoint default Category override;
- optional parser/header settings that do not leak secrets to logs.

If both Source and endpoint specify a default Category, endpoint wins for that endpoint; Source is fallback.

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

## Pre-scheduler Worker execution

The tech-demo critical path performs real collection before durable scheduling exists.

During this pre-scheduler period:

- collection is invoked manually through the Worker process, not inline inside Web/API request handling;
- one endpoint invocation creates one isolated Collection run;
- the same eligibility → run lock → network-safety → fetch/redirect → parse → normalize → Article-link validation → Relevance → identity/persistence stages are used as they become available;
- a failure for one endpoint does not invalidate an unrelated endpoint run;
- no temporary second parser/persistence path is introduced.

Phase 4 establishes eligibility, the shared endpoint lock, and network-safety primitives only. Manual Worker endpoint execution and Collection-run creation begin in Phase 5. Phase 10 later places the already-proven endpoint execution unit behind durable jobs and due-endpoint scheduling while reusing the Phase 4 lock.

Worker/manual/scheduler execution selects the Source/endpoint directly. It MUST NOT require a Publication slug or identifier to choose among topics in one installation.

## Retry and backoff

Once automated polling/jobs exist:

- retries apply only to transient failures;
- attempts are bounded;
- backoff includes jitter;
- authentication, validation, parser-contract, and permanent client errors are not retried indefinitely;
- repeated failures influence derived endpoint health and may trigger cooldown/circuit-breaking;
- one endpoint's retry loop cannot monopolize Worker capacity.

Manual pre-scheduler runs may report retry classification, but they do not need to implement the durable automated retry scheduler early.

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
- resolve relative Article URLs against the terminal successfully fetched feed URL after approved redirects; when no redirect occurred, the configured endpoint URL is that terminal base;
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

MVP actions are `include`, `exclude`, and `categorize`.

Deterministic include/exclude procedure:

1. Collect applicable enabled include/exclude rules.
2. Highest explicit priority wins.
3. At equal priority, Source-scoped rule wins over installation-wide rule.
4. At equal priority and scope specificity, `exclude` wins over `include`.
5. If no include/exclude rule decides the candidate, include by default.
6. Category rules are evaluated independently and do not alter inclusion unless a separate include/exclude rule does so.
7. Persist the winning include/exclude reason and applied Category reasons once persistence for those reasons exists.

Before configurable Relevance rules are implemented, normalized safe candidates still pass through this canonical boundary with an empty rule set and therefore receive the deterministic default `include` decision. The pipeline never bypasses Relevance merely because configuration UI/rule persistence has not arrived yet.

Relevance-rule edits are prospective by default in MVP. They affect future candidate processing. Automatic bulk retroactive re-evaluation of already persisted Articles is deferred unless a dedicated reprocessing operation is explicitly added later. Article moderation may correct existing presentation independently.

Generic `boost` ranking is deferred until a ranking/scoring contract exists.

## Article identity and idempotency

Reprocessing the same Source item MUST converge on the same logical Article identity.

Identity resolution order is:

1. adapter-designated reliable immutable Source external identifier within the same Source;
2. normalized/canonical URL identity within the same Source when a strong external identifier does not resolve the candidate;
3. an explicitly configured stable endpoint identity key only when a concrete approved adapter/endpoint actually requires one;
4. conservative fingerprints only as secondary corroboration, never as a primary resolver.

A matching strong external identifier resolves the existing Article even when its Source-derived URL changes. A candidate without a strong external identifier falls back to canonical URL identity. If an Article was originally created through canonical-URL fallback and a later observation supplies a strong external identifier with no contradictory strong identity, the existing Article MAY be promoted by attaching that identifier rather than creating a second Article.

Two different strong external identifiers MUST NOT be silently merged, overwritten, or reassigned solely because their canonical URLs match. Canonical-only fallback that encounters multiple Articles distinguished by different strong external identifiers is an explicit identity conflict and MUST NOT choose one arbitrarily. Fuzzy-title similarity or fingerprint evidence alone never overwrites or resolves an Article.

Do not invent a speculative generic stable-identity-key configuration mechanism merely because future adapters may require one. Such configuration is introduced only with a concrete adapter/endpoint requirement.

Transactional uniqueness constraints are required where practical. Repeated observation may add/update Article observations and run counters, but Article cardinality must not increase for the same Source identity.

True duplicate grouping between separately stored Articles is governed by the Article lifecycle/deduplication contract and is not the same as idempotent identity resolution.

## Collection runs and accounting

A minimal persisted Collection run begins with the first real transport/parser phase. It records the endpoint, start/finish timing, transport/parser status, bounded errors, and stage counts that actually exist.

When normalization is introduced, the same run model gains a normalization stage status plus bounded pre-persistence item counts:

- normalization stage status uses `not_run`, `succeeded`, or `failed`;
- `normalized_candidate_count` counts Raw items that complete normalization into an Article candidate before the separate Article-link policy decision;
- `normalization_failure_count` counts Raw items that cannot produce an Article candidate because normalization fails or required candidate data is malformed/invalid/out of bounds;
- `article_link_rejection_count` counts normalized Article candidates rejected by the separate Article-link/domain policy gate.

For a parsed content run that completes the Phase 6 batch, `raw_item_count` MUST equal `normalized_candidate_count + normalization_failure_count`, and `article_link_rejection_count` MUST NOT exceed `normalized_candidate_count`. The number of candidates safe to hand to the next pipeline stage is therefore `normalized_candidate_count - article_link_rejection_count`. Item-level normalization failures or link-policy rejections do not by themselves make the normalization stage `failed`; stage-level `failed` is reserved for an execution failure that prevents the normalizer from completing its bounded batch contract. Unrelated Raw items continue processing when safely possible.

After Article persistence is active, every successfully normalized candidate has exactly one processing outcome:

- `created`;
- `updated`;
- `unchanged`;
- `rejected`;
- `excluded`;
- `failed`.

The post-normalization outcome counters MUST therefore satisfy:

`created + updated + unchanged + rejected + excluded + failed = normalized_candidate_count`.

Normalization failures do not receive a processing outcome because no Article candidate exists. Article-link-policy rejection remains counted in `article_link_rejection_count` and maps that same candidate to processing outcome `rejected`. Link-accepted candidates then pass Relevance before identity. Until configurable Relevance rules exist, the empty-rule decision is deterministic `include`, so `excluded = 0`; included candidates end as `created`, `updated`, `unchanged`, or `failed`.

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
