# Security, Reliability, and Operations

## Security model

The highest-risk surfaces are administrative access, machine distribution credentials, local adapter cache integrity, and server-side fetching of externally configured URLs. Controls appear with the first implementation of each affected surface; historical Phase 19 hardened and operationalized the production deployment boundary rather than introducing those controls for the first time.

Testing/validation for these controls is governed project-wide by `docs/contracts/testing-and-validation-contract.md`.

## Administrative security

Cloudflare Access remains the accepted administrator perimeter for current managed deployments through 2.0, including direct-origin protection and request-integrity/resource validation. Native/default self-host administrator authentication is post-2.0. Linux VPS/Docker Compose self-host packaging is also post-2.0 and therefore has no current release-perimeter requirement.

Human administrator credentials and machine distribution credentials are separate security boundaries. Machine credentials MUST be least-capability for integration use and MUST NOT implicitly grant administrator authority; compromise of an adapter credential must not authorize Source, editorial, moderation, duplicate, Profile, or operations mutations.

Managed administrative UI/API routes use Cloudflare Access as the external authentication/access-control perimeter under `docs/decisions/cloudflare-access-admin-perimeter.md`.

The application MUST preserve:

- Cloudflare Access protection for managed admin UI/API routes;
- deployment/origin configuration that prevents direct unauthenticated bypass of that perimeter;
- CSRF protection or equivalent request-integrity control for state-changing browser actions;
- real resource-relationship and domain-invariant validation for every admin command;
- bounded configuration/moderation change history where required by governing contracts;
- secrets outside source control.

The 2.0 application does not require native administrator accounts, passwords/passkeys, application login/logout sessions, account recovery, roles, per-user Publication authorization, or canonical internal administrator identity.

Cloudflare identity/access logs may provide operational evidence but are not the application's canonical domain identity/audit attribution.

Administrative errors must not expose secrets, stack traces, or raw database details.

The singleton Publication is an installation/editorial configuration boundary, not an application tenant key. Administrative security therefore validates actual Source/endpoint/run/Article/observation/duplicate/Profile relationships and invariants rather than cross-Publication ownership.

## Machine distribution security

The v1 distribution API uses dedicated high-entropy bearer credentials governed by `docs/contracts/distribution-api-contract.md`.

Phase 3 supplies the implemented credential lifecycle, authenticator, request guard, and bounded process-local rate foundation. Phase 4 supplies the implemented trusted HTTP client-network/proxy interpretation, production HTTPS fail-closed behavior, v1 status/error mapping including `429`/`Retry-After`, cache/security headers, and bounded distribution telemetry. Phase 5 implemented PHP synchronization/LKG consumption, locking, persistence, freshness/usability, and health without reproducing or weakening those upstream boundaries. Phase 6 must consume validated local state, preserve safe escaping and no-secret/no-live-visitor-call boundaries, and must not weaken upstream authentication or LKG guarantees.

- plaintext credentials are shown only at creation and never persisted;
- persisted state uses a non-secret lookup identity plus secure verifier/digest;
- tokens are accepted only through the `Authorization` header, never query strings;
- capability is limited to `distribution:read`;
- a valid credential may read active Profiles in its own isolated instance but cannot perform admin mutations;
- expiration is optional; revocation and overlapping rotation are supported;
- invalid/revoked/expired credentials fail generically without internal-state leakage;
- rate limiting is primarily per authenticated credential, with bounded IP/network protection for invalid-auth abuse;
- `429` includes `Retry-After`;
- production distribution requires HTTPS;
- browser-direct use/permissive CORS is not part of the v1 requirement.

## Fetching and SSRF defenses

The detailed destination-safety policy is governed by `docs/contracts/source-and-collection-contract.md`. Before the first outbound request and before every redirect hop, Worker/fetch logic MUST validate:

- singleton Publication `active_for_collection` state;
- Source/endpoint approval state = approved;
- Source/endpoint lifecycle state = active;
- Source/endpoint operational state = enabled;
- HTTP/HTTPS scheme policy;
- approved Source/endpoint domain policy;
- effective port policy;
- DNS resolution and concrete resolved-address restrictions;
- public-unicast-only destination policy, including rejection of loopback, private/unique-local, link-local, multicast, unspecified, shared/CGNAT, reserved/special-use, cloud-metadata, and equivalent IPv4-mapped IPv6 destinations.

DNS rebinding must not bypass validation: transport consumes the concrete destination information approved by the safety gate or an equivalent resolver-bound result, rather than independently re-resolving the hostname after approval. A DNS response containing any unsafe address is rejected rather than selectively trusting another returned answer.

Every redirect destination reruns scheme, domain, port, DNS, and resolved-address validation before contact. Redirect-count enforcement, response/decompression size limits, timeouts, and other transport controls do not weaken per-hop validation.

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

Static HTML input remains untrusted under this same model. HTML selector/profile configuration is bounded inert declarative data, not operator-supplied code. Parsing MUST NOT execute page scripts or profile code, load HTML subresources, crawl pagination, or fetch arbitrary Article pages. Safe sample preview is bounded and performs no network I/O.

HTML parser errors, logs, run diagnostics, and preview responses MUST NOT retain or emit raw page bodies, script contents, secrets, or unbounded extracted content. Ordinary HTML endpoint fetches continue through the same approval, whitelist, DNS/address/port, redirect, rebinding, timeout, and response/decompression protections as other endpoint types.

## Failure isolation

The generic PHP adapter synchronizes complete Profile snapshots into independent per-Profile candidate state and atomically activates only a fully validated revision. Failed, invalid, partial, or mixed-revision candidates preserve active last-known-good state. Stale valid output remains usable by default without a hard cutoff; configured expiry uses a safe fallback and never a visitor-path live API call. Authenticated `409 profile_disabled` is authoritative and suppresses cached rendering until a later successful synchronization.

Each endpoint Collection run is an independent execution unit and one endpoint failure must not invalidate another run.

For durable scheduling:

- each endpoint Collection run is an independent job;
- one failed Source cannot abort unrelated queued work;
- item-level failures are recorded/skipped when safe;
- circuit-breaking/cooldown protects repeatedly failing endpoints;
- Worker concurrency is bounded globally and per host/Source;
- public/reference reads remain available during collection failures.

Failure-isolation claims require executed tests at the lowest evidence level capable of proving the actual boundary. A test that only asserts an exception occurred is insufficient when the contract requires unrelated work/state to remain intact.

## State and health observability

Approval/trust, lifecycle, operational state, and health are emitted/reported separately.

- approval: `approved` / `unapproved`;
- lifecycle: `active` / `archived`;
- operational: `enabled` / `paused` / `disabled`;
- derived health: `unknown` / `healthy` / `delayed` / `degraded` / `unhealthy`.

An archived or paused endpoint is not labeled unhealthy merely because it is intentionally not running.

## Observability

2.0 distribution telemetry records bounded Profile key, API version, response status/duration, item/page information, non-secret credential identity, authentication/rate/missing/disabled/failure categories, and supplied adapter version. PHP health exposes last attempt/success, duration, items/pages, freshness and stale age, unchanged result, last failure category, and adapter version. This is operational diagnostics, not click, referral, visitor, page-view, reader-identity, or backlink analytics. Telemetry remains locally operable; central aggregation cannot become a runtime dependency.

Collection/operations telemetry remains sufficient to answer:

- which endpoints are running/due/delayed/degraded/unhealthy/paused/disabled/archived/unapproved;
- when each endpoint last succeeded;
- how long major collection stages take where measured;
- canonical transport/parser/normalization/processing outcome counts;
- why a candidate was rejected/excluded or left hidden;
- why a duplicate candidate was created, dismissed, or grouped;
- what material administrative configuration/moderation change occurred and to which resource.

Foundations include structured logs with run/correlation identifiers, bounded Collection-run history, job/queue metrics, Web/API liveness/readiness, Worker startup/dependency checks, and alert-ready endpoint health.

## Logging constraints

Logs MUST NOT contain:

- passwords, access/session tokens, API keys, bearer credential plaintext, or Authorization headers;
- unbounded response bodies or sensitive distribution payloads;
- sensitive environment values;
- credential-bearing database connection strings.

Query strings are redacted when they may contain credentials/private tokens.

Security/redaction tests MUST use synthetic credentials/secrets and MUST NOT require real production credentials.

## Backup and recovery

Historical Phase 19 established and validated the production backup/restore, schema-upgrade, deployment, and rollback procedures. The current operator contract remains in `docs/operations/database-backup-and-restore.md` and `docs/operations/deployment-and-incident-runbook.md`.

Because Article identity is idempotent, safe replay is the preferred recovery mechanism where collection work can be replayed safely.

Recovery claims require observed or injected recovery validation under the testing contract. Documentation of a restore procedure alone is not restore proof.

## Deployment configuration

- Secrets and environment-specific settings, including database connection details, live outside committed source.
- Git-tracked migrations and migration infrastructure are authoritative for the supported database schema.
- Web/API and Worker startup do not silently apply schema changes.
- Web/API and Worker versions remain compatible with the active schema.
- Graceful shutdown lets jobs finish or become safely retryable.
- Readiness fails when critical dependencies are unavailable.
- Managed deployments with admin routes prevent direct-origin bypass of the Cloudflare Access perimeter.

From the accepted production baseline forward, `docs/decisions/production-data-and-schema-compatibility.md` applies:

- customer production data is durable supported state;
- normal upgrades preserve governed data/relationships rather than rebuilding the customer database;
- supported production migration history remains usable as an upgrade path from supported deployed state;
- clean migration-from-zero continues for new/disposable installations but is not production-upgrade proof;
- post-launch schema changes require explicit forward-upgrade/data-preservation validation and compatible rollback/restore planning.

The active 2.0 managed release reuses this established deployment/backup boundary. Self-host packaging and its separate deployment/support perimeter are post-2.0.

## Operational runbooks

Current operations maintain runbooks for:

- failing Source triage;
- parser breakage and temporary Source/endpoint pause;
- duplicate false-positive correction;
- stuck/overlapping job recovery;
- database restore;
- schema upgrade and rollback;
- Cloudflare Access/admin-perimeter incident or lockout handling;
- unsafe/compromised Source response;
- legal/editorial Article takedown;
- 2.0 distribution authentication/Profile/PHP synchronization/LKG failures as those phases are implemented.

## Privacy and retention

The Platform collects minimal reader data and 2.0 does not introduce visitor/click analytics. Cloudflare/admin access logs, application change records, IP logs, Source-provided author metadata, bounded Raw-item payloads, machine-credential audit metadata, and distribution operational logs require bounded retention/access appropriate to the deployment. Native administrator account data remains post-2.0.
