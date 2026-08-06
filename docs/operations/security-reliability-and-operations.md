# Security, Reliability, and Operations

## Security model

The highest-risk surfaces are administrator access and server-side fetching of externally configured URLs. Controls must appear with the first implementation of each affected surface; Phase 7 hardens and operationalizes them rather than introducing them for the first time.

## Administrative security

When administrator functionality is introduced, MVP MUST provide:

- secure password handling or trusted external identity;
- secure, HTTP-only, appropriate same-site session cookies;
- CSRF protection for state-changing browser actions;
- authentication rate limiting;
- authorization at every admin operation and Publication boundary;
- stable administrator identity for audit references;
- audit events for configuration/moderation changes;
- secrets outside source control.

Administrative errors must not expose secrets, stack traces, or raw database details.

## Fetching and SSRF defenses

Before the first outbound request and before every redirect hop, the Worker/fetch layer MUST validate:

- Source/endpoint approval and operational eligibility;
- HTTP/HTTPS scheme policy;
- approved endpoint/domain policy;
- DNS and resolved-address restrictions;
- loopback/private/link-local/multicast/cloud-metadata restrictions;
- port policy;
- redirect-count limits;
- response/decompression size limits.

DNS rebinding and redirects must not bypass address validation.

After parsing/normalization, Article URLs are separately validated against Source/endpoint article-domain policy before acceptance. Post-parse Article-link validation does not replace pre-fetch network safety.

## Content safety

Collected content is untrusted. The system MUST:

- sanitize/strip HTML before display;
- escape text for the output context;
- validate media and Article URLs;
- avoid proxying arbitrary remote content through privileged infrastructure by default;
- set an appropriate content security policy;
- bound stored text/metadata;
- prevent parser payloads from becoming executable configuration.

## Failure isolation

- Each endpoint Collection run is an independent job.
- One failed Source cannot abort unrelated queued work.
- Item-level failures are recorded/skipped when safe.
- Circuit-breaking/cooldown protects repeatedly failing endpoints.
- Worker concurrency is bounded globally and per host/Source.
- Public-feed reads remain available during collection failures.

## Observability

The MVP MUST emit structured information sufficient to answer:

- Which endpoints are due, running, delayed, degraded, unhealthy, paused, or disabled?
- What is each endpoint's separate operational state and derived health?
- When was each endpoint last successfully collected?
- How long did network validation, fetching, parsing, normalization, identity resolution, duplicate evaluation, and persistence take?
- How many candidate outcomes were `created`, `updated`, `unchanged`, `rejected`, `excluded`, `hidden`, `duplicate_grouped`, or `failed`?
- Why was a candidate rejected/excluded/hidden?
- Why was a duplicate candidate created, dismissed, or grouped?
- Which administrator changed Publication/Source/Article/duplicate configuration?

Foundations:

- structured logs with run/correlation identifiers;
- metrics for jobs, durations, failures, queue delay, and canonical candidate outcomes;
- health/readiness endpoints for Web/API and Worker dependencies;
- bounded Collection-run history;
- alert-ready unhealthy endpoint states.

## Logging constraints

Logs MUST NOT contain:

- passwords, session tokens, API keys, authorization headers;
- unbounded response bodies;
- sensitive environment values;
- credential-bearing database connection strings.

Query strings are redacted when they may contain credentials/private tokens.

## Backup and recovery

Before production launch, operations define:

- automated PostgreSQL backups;
- retention period;
- tested non-production restore procedure;
- recovery point/time targets;
- queued/in-flight job handling after recovery;
- interrupted Collection-run reconciliation.

Because Article identity is idempotent, safe replay is the preferred recovery mechanism.

## Deployment configuration

- Environment settings live outside committed source.
- Database migrations are versioned and forward-safe.
- Web/API and Worker versions are compatible with active schema.
- Graceful shutdown lets jobs finish or become safely retryable.
- Readiness fails when critical dependencies are unavailable.

## Phase 7 hardening boundary

Baseline controls above are implemented alongside the features they protect. Phase 7 adds production hardening such as:

- dashboards and alert integrations;
- tuned unhealthy/delayed detection;
- concurrency/rate-limit tuning;
- backup/restore verification;
- security/abuse testing;
- retention jobs;
- deployment/rollback runbooks;
- production monitoring ownership.

Phase 7 MUST NOT be interpreted as permission to build earlier fetching/authentication without their required security controls.

## Operational runbooks required before launch

- failing Source triage;
- parser breakage and temporary Source/endpoint pause;
- duplicate false-positive correction;
- stuck/overlapping job recovery;
- database restore;
- administrator account recovery;
- unsafe/compromised Source response;
- legal/editorial Article takedown.

## Privacy and retention

The public MVP collects minimal personal data. Administrative account data, audit records, IP logs, Source-provided author metadata, and bounded Raw-item payloads require documented retention/access rules before production launch.
