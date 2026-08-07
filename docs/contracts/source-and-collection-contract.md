# Source and Collection Contract

## Approval boundary

Only configured Sources/endpoints that are currently trusted and operationally eligible may be contacted.

An endpoint is collectable only when all are true:

- its Publication is active for collection;
- its Source approval state is `approved`;
- its Source lifecycle state is `active`;
- its Source operational state is `enabled`;
- its endpoint approval state is `approved`;
- its endpoint lifecycle state is `active`;
- its endpoint operational state is `enabled`;
- the endpoint URL passes pre-fetch scheme/host/DNS/address/port safety validation;
- no active run lock already exists for the endpoint.

`paused`, `disabled`, and `archived` are not health values. The Platform MUST NOT use public submissions or discovered links to expand the whitelist silently.

## Bootstrap configuration and approval

Before Source administration UI exists, operator-maintained seed/bootstrap tooling MAY create Publication, Source, and endpoint configuration, including explicitly setting approval state to `approved`.

Bootstrap approval counts as deliberate operator approval; it is not a bypass of the approval boundary.

Bootstrap is an explicit operator action. Web/API and Worker ordinary startup MUST NOT implicitly apply bootstrap configuration.

Bootstrap identity is stable and configuration-owned:

- Publication bootstrap identity uses the Publication slug;
- each Source has an immutable `config_key` unique within its Publication;
- each Source endpoint has an immutable `config_key` unique within its Source.

Ordinary bootstrap execution is create-if-absent by those stable identities. If a matching Publication/Source/endpoint already exists, bootstrap MUST leave the existing record unchanged, including later operator-managed approval, lifecycle, operational state, approved domains, endpoint URL, and polling configuration. A rerun therefore MUST NOT recreate an obsolete seeded endpoint merely because an operator later changed its URL.

Bootstrap tooling:

- MUST NOT discover Sources/endpoints and auto-approve them;
- MUST NOT infer approval from a successful fetch;
- MUST NOT silently widen Source approved-domain policy;
- MUST be idempotent;
- MUST NOT blindly overwrite later operator-managed approval/lifecycle/operational state or other existing configuration.

Once admin UI becomes the normal management surface, bootstrap data is initialization input rather than competing runtime authority.

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

Phase 3 validates and persists these configuration relationships only. It does not resolve DNS, classify resolved addresses, enforce runtime port policy, follow redirects, or contact endpoints. Those pre-request network-safety behaviors begin in Phase 4.

Before every outbound request, including every redirect hop, the fetch layer MUST:

- allow only approved HTTP/HTTPS schemes;
- validate configured host/domain policy;
- resolve and reject loopback, link-local, private, multicast, and cloud-metadata destinations unless a documented deployment-only exception exists;
- enforce port policy;
- defend against DNS rebinding by validating the actual resolved destination used for the request;
- enforce redirect limits and revalidate each redirect before following it.

After parsing/normalization, Article-link acceptance MUST separately:

- resolve relative URLs against the approved endpoint;
- normalize internationalized/case-insensitive hostnames safely;
- validate Article-link domains against Source/endpoint policy;
- record unexpected cross-domain Article links rather than automatically following/accepting them.

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

Phase 3 persists only the structured-feed type needed for the initial critical path. The canonical initial endpoint type is `rss_atom`; the later parser determines whether fetched content is RSS or Atom rather than requiring an operator to pre-classify the XML dialect correctly.

The canonical basic polling field is `poll_interval_seconds`. It MUST be a positive bounded value. `0` MUST NOT mean disabled because operational state already owns `enabled`, `paused`, and `disabled` semantics. Other endpoint types and their adapter-specific configuration arrive only with the roadmap phase that implements them.

## Configuration precedence

Source configuration owns:

- approval/trust and lifecycle/operational states;
- approved-domain maximum boundary;
- Publication-scoped Source priority;
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

Phase 10 places this already-proven endpoint execution unit behind durable jobs and due-endpoint scheduling.

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

## Normalization contract

Before Relevance, identity, duplicate, or public-feed logic, normalization MUST:

- trim/normalize text without changing intended human meaning;
- resolve relative URLs;
- remove fragments and recognized tracking parameters from canonical identity URLs;
- preserve original discovered URL separately;
- parse dates with confidence/fallback metadata;
- sanitize/strip unsafe markup;
- bound field lengths;
- normalize title representation for matching while preserving display/source title;
- attach Publication, Source, endpoint, and Collection-run provenance;
- validate normalized Article URLs against Article-link domain policy before acceptance.

## Relevance evaluation

Relevance belongs to Publication configuration, not engine code.

MVP actions are `include`, `exclude`, and `categorize`.

Deterministic include/exclude procedure:

1. Collect applicable enabled include/exclude rules.
2. Highest explicit priority wins.
3. At equal priority, Source-scoped rule wins over Publication-wide rule.
4. At equal priority and scope specificity, `exclude` wins over `include`.
5. If no include/exclude rule decides the candidate, include by default.
6. Category rules are evaluated independently and do not alter inclusion unless a separate include/exclude rule does so.
7. Persist the winning include/exclude reason and applied Category reasons once persistence for those reasons exists.

Before configurable Relevance rules are implemented, normalized safe candidates still pass through this canonical boundary with an empty rule set and therefore receive the deterministic default `include` decision. The pipeline never bypasses Relevance merely because configuration UI/rule persistence has not arrived yet.

Relevance-rule edits are prospective by default in MVP. They affect future candidate processing. Automatic bulk retroactive re-evaluation of already persisted Articles is deferred unless a dedicated reprocessing operation is explicitly added later. Article moderation may correct existing presentation independently.

Generic `boost` ranking is deferred until a ranking/scoring contract exists.

## Article identity and idempotency

Reprocessing the same Source item MUST converge on the same logical Article identity.

Identity resolution combines:

1. reliable immutable Source external identifiers within the same Source;
2. normalized/canonical URL identity within Publication/Source scope;
3. explicitly configured stable endpoint identity keys;
4. conservative fingerprints only as secondary corroboration.

Fuzzy-title similarity alone never overwrites an existing Article.

Transactional uniqueness constraints are required where practical. Repeated observation may add/update Article observations and run counters, but Article cardinality must not increase for the same Source identity.

True duplicate grouping between separately stored Articles is governed by the Article lifecycle/deduplication contract and is not the same as idempotent identity resolution.

## Collection runs and accounting

A minimal persisted Collection run begins with the first real transport/parser phase. It records the endpoint, start/finish timing, transport/parser status, bounded errors, and stage counts that actually exist.

When normalization is introduced, the same run model gains normalization stage status/counts.

After Article persistence is active, every processed candidate has exactly one processing outcome:

- `created`;
- `updated`;
- `unchanged`;
- `rejected`;
- `excluded`;
- `failed`.

Accepted Article processing may additionally produce zero or more orthogonal effects:

- `visibility_hidden`;
- `duplicate_review_created`;
- `duplicate_grouped`.

Effects do not replace outcomes. For example, a candidate may be `created` and also cause `duplicate_grouped` in the same run.

Collection runs aggregate processing outcomes and effects separately, plus transport/run-level status.

During pre-persistence collection/normalization, runs record transport, parser, and normalization stage counts/statuses but MUST NOT use post-identity outcome names as though Article persistence exists.

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
