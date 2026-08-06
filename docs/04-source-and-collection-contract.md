# Source and Collection Contract

## 1. Approval boundary

Only administrator-approved sources and endpoints may be contacted.

A source is collectable only when all of the following are true:

- its publication is active;
- the source is approved and enabled;
- the endpoint is enabled;
- the endpoint URL passes scheme, host, and network-safety validation;
- the source has not been administratively paused;
- no active run lock already exists for the endpoint.

The platform MUST NOT use public submissions or discovered links to silently expand the whitelist.

## 2. Approved-domain policy

Each source defines one or more approved public domains. The collector and normalizer MUST:

- reject unsafe URL schemes;
- reject loopback, link-local, private-network, and cloud-metadata destinations unless an explicit deployment-only exception exists;
- revalidate redirect destinations;
- distinguish feed host approval from article-link host approval;
- normalize internationalized and case-insensitive hostnames safely;
- record, rather than automatically follow, unexpected cross-domain article links.

This protects the whitelist boundary and reduces server-side request forgery risk.

## 3. Source-type priority

Preferred order:

1. RSS or Atom.
2. Stable structured API or JSON feed.
3. Configurable HTML listing extraction.
4. Custom adapter.
5. Browser automation only when ordinary HTTP cannot reliably collect an approved source.

A lower-priority method requires an operational reason. Convenience alone is not sufficient justification for browser automation.

## 4. Endpoint configuration

An endpoint configuration SHOULD support:

- endpoint type;
- URL;
- polling interval;
- timeout;
- parser profile or adapter key;
- allowed redirect and article domains;
- default category;
- optional source-scoped relevance rules;
- optional user-agent or header profile that does not contain secrets in logs;
- enabled/paused state.

## 5. Fetch contract

The fetcher MUST provide:

- explicit connect and total timeouts;
- bounded response size;
- redirect limit and destination revalidation;
- compressed-response handling with decompressed-size limits;
- conditional requests using ETag and Last-Modified when supplied;
- identifiable user-agent configuration;
- transport metrics;
- response-content type validation;
- safe retry classification.

The fetcher SHOULD respect published source guidance and avoid unnecessary traffic.

## 6. Retry and backoff

- Retries apply only to failures classified as transient.
- Retry attempts are bounded.
- Backoff includes jitter.
- Authentication, validation, parser-contract, and permanent client errors are not retried indefinitely.
- Repeated failures move an endpoint through observable degraded and unhealthy states.
- One endpoint's retry loop must not monopolize worker capacity.

## 7. Parser contract

A parser converts fetched content into raw items and MUST NOT write directly to article tables.

Each raw item SHOULD expose, when available:

- source-provided identifier;
- title;
- URL;
- publication and update timestamps;
- author;
- summary or excerpt;
- image URL;
- category labels;
- language;
- source-specific metadata required for diagnostics.

Parser output is untrusted input and must be normalized and validated.

## 8. Normalization contract

Before an item reaches relevance or public-feed logic, normalization MUST:

- trim and normalize text safely without changing human meaning;
- resolve relative URLs against the approved endpoint;
- remove fragments and recognized tracking parameters from canonical identity URLs;
- preserve the original discovered URL separately;
- parse dates with confidence and fallback metadata;
- sanitize or strip unsafe markup;
- bound field lengths;
- normalize title representation for matching while preserving the display title;
- attach publication, source, endpoint, and collection-run provenance.

## 9. Relevance evaluation

Relevance is publication configuration, not engine code.

The evaluator may use:

- inclusion and exclusion terms;
- source defaults;
- category mappings;
- rule weights and priorities;
- administrator overrides.

Every automatic exclusion, category assignment, or boost must be explainable through stored rule identifiers or a deterministic reason code.

## 10. Idempotency

Reprocessing the same item MUST converge on the same logical article identity.

The implementation must combine:

- source external identifiers where reliable;
- normalized/canonical URLs;
- publication and source scope;
- transactional uniqueness constraints;
- stable fingerprints as a secondary signal.

Collection-run counters may change on repeated observation, but article cardinality must not increase for the same identity.

## 11. Source health

Endpoint health is derived from recent collection behavior and SHOULD include:

- healthy;
- delayed;
- degraded;
- unhealthy;
- paused;
- disabled.

Health is not based on one undifferentiated boolean. Administrators must be able to distinguish transport, parse, validation, relevance, and persistence failures.
