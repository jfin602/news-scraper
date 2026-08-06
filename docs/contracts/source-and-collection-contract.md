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

## Approved-domain policy

Each Source defines the maximum approved public-domain boundary. Endpoint configuration may narrow that boundary for redirects/Article links but may not silently widen it.

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

## Configuration precedence

Source configuration owns:

- approval/trust and lifecycle/operational states;
- approved-domain maximum boundary;
- Publication-scoped Source priority;
- default Category fallback;
- optional Source-scoped relevance defaults.

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

## Retry and backoff

- Retries apply only to transient failures.
- Attempts are bounded.
- Backoff includes jitter.
- Authentication, validation, parser-contract, and permanent client errors are not retried indefinitely.
- Repeated failures influence derived endpoint health and may trigger cooldown/circuit-breaking.
- One endpoint's retry loop cannot monopolize worker capacity.

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

Before relevance, identity, duplicate, or public-feed logic, normalization MUST:

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
7. Persist the winning include/exclude reason and applied Category reasons.

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

## Candidate processing and run accounting

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

During the earlier pre-persistence collection/normalization phase, runs may record transport, parser, and normalization stage counts/statuses but MUST NOT use post-identity outcome names as though Article persistence exists.

Generic terms such as `accepted` or `skipped` require explicit mapping rather than competing counter definitions.

## Source health

Endpoint health is derived from recent collection behavior and uses:

- `unknown`;
- `healthy`;
- `delayed`;
- `degraded`;
- `unhealthy`.

Lifecycle (`active/archived`) and operational state (`enabled/paused/disabled`) remain separate from health.

Administrators must be able to distinguish transport, parse, validation, relevance, and persistence failures. A Source-level health indicator, if displayed, is a derived summary of endpoint states/health.

## Push delivery

The Platform model may support push-capable Sources in the future, consistent with the near-real-time law. **Push/webhook adapters are deferred beyond MVP unless explicitly promoted by a later project decision.** MVP collection uses configurable polling even when a Source happens to offer push.
