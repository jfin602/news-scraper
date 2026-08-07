# Security, Reliability, and Operations

## Security model

The highest-risk surfaces are administrative access and server-side fetching of externally configured URLs. Controls appear with the first implementation of each affected surface; Phase 19 hardens and operationalizes them rather than introducing them for the first time.

Testing/validation for these controls is governed project-wide by `docs/contracts/testing-and-validation-contract.md`. Phase 19 is not the first time security, recovery, persistence, or failure behavior is tested; every earlier phase adds focused and regression evidence for the controls it introduces.

## Administrative security

MVP administrative UI/API routes use Cloudflare Access as the external authentication/access-control perimeter under `docs/decisions/cloudflare-access-admin-perimeter.md`.

When administrator functionality is introduced, MVP MUST provide:

- Cloudflare Access protection for all admin UI/API routes;
- supported deployment/origin configuration that prevents direct unauthenticated bypass of that perimeter;
- CSRF protection or an equivalent request-integrity control for state-changing browser actions;
- Publication/resource ownership and domain-invariant validation for every admin command;
- bounded configuration/moderation change history where required by the governing contracts;
- secrets outside source control.

The MVP application does not implement native administrator accounts, passwords/passkeys, application login/logout sessions, account recovery, roles, per-user Publication authorization, or canonical internal administrator identity.

Cloudflare identity/access logs may provide operational evidence but are not the application's canonical domain identity/audit attribution.

Administrative errors must not expose secrets, stack traces, or raw database details.

## Fetching and SSRF defenses

Before the first outbound request and before every redirect hop, Worker/fetch logic MUST validate:

- Publication collection-active state;
- Source/endpoint approval state = approved;
- Source/endpoint lifecycle state = active;
- Source/endpoint operational state = enabled;
- HTTP/HTTPS scheme policy;
- approved endpoint/domain policy;
- DNS and resolved-address restrictions;
- loopback/private/link-local/multicast/cloud-metadata restrictions;
- port policy;
- redirect-count limits;
- response/decompression size limits.

DNS rebinding and redirects must not bypass address validation.

After parsing/normalization, Article URLs are separately validated against Source/endpoint Article-domain policy before acceptance. Post-parse Article-link validation does not replace pre-fetch network safety.

## Content safety

Collected content is untrusted. The system MUST:

- sanitize/strip HTML before display;
- escape text for output context;
- validate media/Article URLs;
- avoid proxying arbitrary remote content through privileged infrastructure by default;
- set appropriate content security policy;
- bound stored text/metadata;
- prevent parser payloads from becoming executable configuration.

## Failure isolation

Before durable jobs exist, each manually invoked endpoint Collection run in the Worker is an independent execution unit and one endpoint failure must not invalidate another run.

Once Phase 10 durable scheduling exists:

- each endpoint Collection run is an independent job;
- one failed Source cannot abort unrelated queued work;
- item-level failures are recorded/skipped when safe;
- circuit-breaking/cooldown protects repeatedly failing endpoints;
- Worker concurrency is bounded globally and per host/Source;
- public-feed reads remain available during collection failures.

Failure-isolation claims require executed tests at the lowest evidence level capable of proving the actual boundary. A test that only asserts an exception occurred is insufficient when the contract requires unrelated work/state to remain intact.

## State and health observability

Approval/trust, lifecycle, operational state, and health are emitted/reported separately.

- approval: `approved` / `unapproved`;
- lifecycle: `active` / `archived`;
- operational: `enabled` / `paused` / `disabled`;
- derived health: `unknown` / `healthy` / `delayed` / `degraded` / `unhealthy`.

An archived or paused endpoint is not labeled unhealthy merely because it is intentionally not running.

## Observability

MVP MUST emit enough structured information, as the relevant stages are introduced, to answer:

- Which endpoints are running/due/delayed/degraded/unhealthy/paused/disabled/archived/unapproved once those scheduling/health concepts exist?
- When was each endpoint last successfully collected once that state exists?
- How long did eligibility/network validation, fetch, parse, normalize, identity, duplicate evaluation, and persistence take where those stages exist?
- Before persistence exists, what transport/parser/normalization counts/statuses occurred?
- Once persistence exists, how many candidates had processing outcomes `created`, `updated`, `unchanged`, `rejected`, `excluded`, or `failed`?
- How many orthogonal effects occurred, including `visibility_hidden`, `duplicate_review_created`, and `duplicate_grouped` once those effects exist?
- Why was a candidate rejected/excluded or left hidden?
- Why was a duplicate candidate created, dismissed, or grouped?
- What material administrative configuration/moderation change occurred, when, and to which resource?

Foundations grow incrementally with the roadmap:

- structured logs with run/correlation identifiers;
- minimal persisted Collection-run transport/parser history from the first real fetch phase;
- normalization stage accounting when normalization exists;
- processing outcomes when Article persistence exists;
- job/queue metrics when durable scheduling exists;
- Web/API liveness/readiness endpoints plus Worker startup/dependency readiness checks appropriate to the process role;
- bounded Collection-run history;
- alert-ready unhealthy endpoint states before production launch.

In Phase 1, Web/API liveness means the HTTP process is responsive and readiness means initialization plus all currently implemented critical dependencies are usable. The Worker proves readiness through independent startup/configuration/dependency validation and clean shutdown; Phase 1 does not require a separate Worker HTTP health server. Phase 2 extends dependency readiness to PostgreSQL.

## Logging constraints

Logs MUST NOT contain:

- passwords, access/session tokens, API keys, authorization headers;
- unbounded response bodies;
- sensitive environment values;
- credential-bearing database connection strings.

Query strings are redacted when they may contain credentials/private tokens.

Security/redaction tests MUST use synthetic credentials/secrets and MUST NOT require real production credentials.

## Backup and recovery

Before production launch, operations define:

- automated PostgreSQL backups;
- retention period;
- tested non-production restore procedure;
- recovery point/time targets;
- queued/in-flight job handling after recovery;
- interrupted Collection-run reconciliation.

Because Article identity is idempotent, safe replay is the preferred recovery mechanism.

Recovery claims require observed or injected recovery validation under the testing contract. Documentation of a restore procedure alone is not restore proof.

## Deployment configuration

- Secrets and environment-specific settings, including database connection details, live outside committed source.
- Git-tracked migrations and migration infrastructure are authoritative for database schema structure and schema evolution; PostgreSQL is authoritative for persisted runtime data and applied database state.
- The same versioned migration history is used across local development, disposable test, and deployed environments.
- Web/API and Worker versions are compatible with active schema.
- Graceful shutdown lets jobs finish or become safely retryable.
- Readiness fails when critical dependencies are unavailable.
- MVP deployments with admin routes prevent direct-origin bypass of the Cloudflare Access perimeter.

## Phase 19 hardening boundary

Baseline controls above are implemented and tested alongside the features they protect. Phase 19 adds production hardening and stronger integrated evidence such as:

- dashboards/alert integrations;
- tuned unhealthy/delayed detection;
- concurrency/rate-limit tuning;
- backup/restore verification;
- security/abuse regression testing;
- retention jobs;
- deployment/rollback runbooks and observed validation;
- production monitoring ownership;
- explicit validation of Cloudflare Access/origin protection for deployed admin surfaces;
- reference-deployment validation at the appropriate evidence level.

Phase 19 MUST NOT be interpreted as permission to build earlier fetching, persistence, scheduling, or admin mutations without their required controls and regression coverage.

## Operational runbooks required before launch

- failing Source triage;
- parser breakage and temporary Source/endpoint pause;
- duplicate false-positive correction;
- stuck/overlapping job recovery;
- database restore;
- Cloudflare Access/admin-perimeter incident or lockout handling;
- unsafe/compromised Source response;
- legal/editorial Article takedown.

## Privacy and retention

The public MVP collects minimal personal data. Cloudflare/admin access logs, application change records, IP logs, Source-provided author metadata, and bounded Raw-item payloads require documented retention/access rules before production launch. Native administrator account data is not part of MVP.