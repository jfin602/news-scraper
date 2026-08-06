# Security, Reliability, and Operations

## 1. Security model

The highest-risk surfaces are administrator access and server-side fetching of externally configured URLs. Both require explicit controls from the first implementation phase.

## 2. Administrative security

The MVP MUST provide:

- secure password handling or a trusted external identity mechanism;
- session cookies with appropriate secure, HTTP-only, and same-site settings;
- CSRF protection for state-changing browser actions;
- rate limiting for authentication attempts;
- authorization checks at every admin operation;
- audit events for configuration and moderation changes;
- secret values supplied outside source control.

Administrative error responses must not expose secrets, stack traces, or raw database details.

## 3. Fetching and SSRF defenses

Every fetch and redirect hop MUST be validated against:

- allowed HTTP/HTTPS schemes;
- approved endpoint/domain policy;
- DNS and resolved-address restrictions;
- loopback, private, link-local, multicast, and cloud-metadata address restrictions;
- port policy;
- redirect-count limits;
- response-size and decompression limits.

DNS rebinding and redirects must not bypass address validation.

## 4. Content safety

Collected content is untrusted.

The system MUST:

- sanitize or strip HTML before display;
- escape text in the correct output context;
- validate media and article URLs;
- avoid proxying arbitrary remote content through privileged infrastructure by default;
- set an appropriate content security policy;
- bound stored text and metadata sizes;
- prevent parser payloads from becoming executable configuration.

## 5. Failure isolation

- Each endpoint run is an independent job.
- One failed source cannot abort unrelated queued work.
- Item-level failures should be recorded and skipped when safe.
- Circuit-breaking or automatic cooldown should protect repeatedly failing endpoints.
- Worker concurrency must be bounded globally and per host/source.
- Public-feed reads must remain available during collection failures.

## 6. Observability

The MVP MUST emit structured information sufficient to answer:

- Which endpoints are due, running, delayed, or failing?
- When was each endpoint last successfully collected?
- How long did fetching, parsing, normalization, and persistence take?
- How many items were discovered, created, updated, skipped, excluded, or grouped?
- Why was a candidate rejected or hidden?
- Why were articles grouped as duplicates?
- Which administrator changed a source, article, or duplicate group?

Required foundations:

- structured logs with correlation/run identifiers;
- metrics for job counts, durations, failures, queue delay, and article outcomes;
- health endpoints for web and worker dependencies;
- bounded collection-run history;
- alert-ready unhealthy-source states.

## 7. Logging constraints

Logs MUST NOT contain:

- passwords, session tokens, API keys, or authorization headers;
- unbounded response bodies;
- sensitive environment variables;
- full database connection strings containing credentials.

URLs may need query-string redaction where sources place credentials or private tokens in query parameters.

## 8. Backup and recovery

Before production use, operations must define:

- automated PostgreSQL backups;
- retention period;
- restoration procedure tested against a non-production environment;
- acceptable recovery point and recovery time targets;
- handling of queued/in-flight jobs after recovery;
- reconciliation strategy for collection runs interrupted by restoration.

Because collection is idempotent, safe replay should be the preferred recovery mechanism.

## 9. Deployment configuration

- Environment-specific settings live outside committed source.
- Database migrations are versioned and forward-safe.
- Web and worker process versions must be compatible with the active schema.
- Deployments should support graceful shutdown so active jobs can finish or become safely retryable.
- Readiness must fail when critical dependencies are unavailable.

## 10. Operational runbooks required before launch

- failing source triage;
- parser breakage and temporary source pause;
- duplicate false-positive correction;
- stuck or overlapping job recovery;
- database backup restoration;
- administrator account recovery;
- unsafe or compromised source response;
- legal or editorial article takedown.

## 11. Privacy and retention

The public MVP should collect minimal personal data. Administrative account data, audit records, IP logs, and source-provided author metadata must have documented retention and access rules before production launch.
