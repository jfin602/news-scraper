# Security, Reliability, and Operations

## Security model

The highest-risk surfaces are administrative access, machine distribution credentials, local adapter cache integrity, server-side fetching of externally configured URLs, and—once 3.0 AI work is implemented—external AI-provider secrets, governed provider URL retrieval, untrusted prompt/context content, interactive AI abuse/cost control, and model-output validation. Controls appear with the first implementation of each affected surface; historical Phase 19 hardened and operationalized the production deployment boundary rather than introducing those controls for the first time.

Testing/validation for these controls is governed project-wide by `docs/contracts/testing-and-validation-contract.md`. AI-specific behavior is additionally governed by `docs/contracts/ai-assistance-contract.md`.

## Administrative security

Cloudflare Access remains the accepted administrator perimeter for current managed deployments, including direct-origin protection and request-integrity/resource validation. Native/default self-host administrator authentication remains deferred unless explicitly promoted. Linux VPS/Docker Compose self-host packaging likewise remains outside the current committed 3.0 scope unless promoted.

Human administrator credentials and machine distribution credentials are separate security boundaries. Machine credentials MUST be least-capability for integration use and MUST NOT implicitly grant administrator authority; compromise of an adapter credential must not authorize Source, editorial, moderation, duplicate, Profile, AI-administration, or operations mutations.

Managed administrative UI/API routes use Cloudflare Access as the external authentication/access-control perimeter under `docs/decisions/cloudflare-access-admin-perimeter.md`.

The application MUST preserve:

- Cloudflare Access protection for managed admin UI/API routes;
- deployment/origin configuration that prevents direct unauthenticated bypass of that perimeter;
- CSRF protection or equivalent request-integrity control for state-changing browser actions;
- real resource-relationship and domain-invariant validation for every admin command;
- bounded configuration/moderation change history where required by governing contracts;
- secrets outside source control.

The current application does not require native administrator accounts, passwords/passkeys, application login/logout sessions, account recovery, roles, per-user Publication authorization, or canonical internal administrator identity.

Cloudflare identity/access logs may provide operational evidence but are not the application's canonical domain identity/audit attribution.

Administrative errors must not expose secrets, stack traces, or raw database details.

The singleton Publication is one customer/editorial property and installation configuration boundary, not an application tenant key. It may contain multiple related subject verticals/Profiles. Administrative security therefore validates actual Source/endpoint/run/Article/observation/duplicate/Profile relationships and invariants rather than cross-Publication or vertical ownership.

## Machine distribution security

The v1 distribution API uses dedicated high-entropy bearer credentials governed by `docs/contracts/distribution-api-contract.md`.

The completed 2.0 baseline implemented the credential lifecycle, authenticator, request guard, trusted HTTP client-network/proxy interpretation, production HTTPS fail-closed behavior, v1 status/error mapping including `429`/`Retry-After`, cache/security headers, bounded distribution telemetry, PHP synchronization/LKG consumption, normalized local read, safe escaping/fallback rendering, direct links, and local-only visitor-path/no-secret/no-live-visitor-call boundaries.

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

`distribution:read` does **not** silently authorize unlimited billable interactive AI. The 3.0 AI contract requires a separately governed server-side authorization/capability, request-size, rate, and cost-abuse boundary before interactive chat ships. That AI capability must remain separate from human administrator authority.

## AI provider and chat security

The owner-approved 3.0 direction initially uses Google Gemini. Until implemented, these requirements are contract targets rather than observed runtime behavior.

Gemini/provider secrets MUST remain server-side and MUST NOT appear in:

- browser JavaScript or HTML;
- public customer PHP configuration/document roots;
- URLs or query strings;
- cache/LKG payloads;
- logs or telemetry;
- persisted Article/Source metadata.

Source-derived Article text, publisher-page content retrieved through governed provider URL Context, customer chat input, conversation history, and model output are all untrusted data.

AI orchestration MUST:

- separate system/developer instructions from Source/user/retrieved-page content;
- treat Article or retrieved publisher-page text such as “ignore previous instructions” as data with no authority;
- bound Article context, user input, conversation history, provider URL count, and output sizes;
- permit provider URL Context only for a bounded application-selected set of exact stored `originalUrl` values belonging to the already-selected governed Profile Articles;
- reject any attempt for Source text, user text, conversation history, retrieved page text, or model output to add arbitrary destinations or activate general web search;
- validate structured model output before persistence/distribution/use;
- validate model-proposed Article references against the actual Profile context;
- resolve visible citation destinations from exact stored `originalUrl`, never from untrusted model-generated URLs;
- avoid sending unrelated Profiles, private admin configuration, credentials, Raw bodies, Collection-run payloads, internal persistence fields, or arbitrary URLs merely because they exist or appear in untrusted text;
- log only bounded non-secret operational facts.

An explicit customer chat action MAY make a live server-side upstream request. Ordinary Article rendering and synchronized digest display MUST NOT expose the provider key or require a live Gemini call.

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

AI provider requests are not Source collection and do not authorize arbitrary URLs supplied by Source/user/model text. The configured Gemini URL Context exception is narrow: application code may submit only a bounded set of exact stored `originalUrl` values from Articles already selected through canonical Profile semantics. Provider endpoints/configuration use a bounded application-owned path; News Scraper does not expose a generic model-directed fetcher, general web-search authority, or a Source/user-controlled URL retrieval surface.

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

AI prompt context uses only bounded safe normalized outward Article metadata selected through canonical Profile semantics plus the bounded provider-retrieved publisher-page content explicitly allowed by `ai-assistance-contract.md`. It MUST NOT use unbounded Raw items/full feed bodies merely because they are stored. Normalized persisted `Article.summary` is governed by the owner-approved N6WD invariant: plain-text normalize first, then cap the final value at 4,000 characters with deterministic complete-word truncation plus `...`, or a 3,997-character hard fallback plus `...` when no usable word boundary exists. Larger Raw parser ceilings remain separate ingestion-safety bounds.

Provider-retrieved publisher-page content is untrusted transient AI context. It is not persisted as Article metadata/body merely because URL Context retrieved it, and instructions embedded in that content have no authority over policy, secrets, URL selection, tools, or Profile scope.

AI-generated text is untrusted output and must be escaped/sanitized for its rendering context. It must not be rendered as trusted executable HTML/markup unless a separately governed safe renderer is implemented.

## Failure isolation

The generic PHP adapter synchronizes complete Profile snapshots into independent per-Profile candidate state and atomically activates only a fully validated revision. Failed, invalid, partial, or mixed-revision candidates preserve active last-known-good state. Stale valid output remains usable by default without a hard cutoff; configured expiry uses a safe fallback and never a visitor-path live API call. Authenticated `409 profile_disabled` is authoritative and suppresses cached rendering until a later successful synchronization.

Each Profile has independent local candidate/active state. Publishing-news, opportunities, indie-filmmaking, or other Profiles on the same customer host must not share locks/manifests/failure state in a way that lets one failed/disabled/stale Profile corrupt another.

Each endpoint Collection run is an independent execution unit and one endpoint failure must not invalidate another run.

For durable scheduling:

- each endpoint Collection run is an independent job;
- one failed Source cannot abort unrelated queued work;
- item-level failures are recorded/skipped when safe;
- circuit-breaking/cooldown protects repeatedly failing endpoints;
- Worker concurrency is bounded globally and per host/Source;
- public/reference reads remain available during collection failures.

AI failure isolation is additional:

- Gemini/provider timeout, error, rate limit, malformed/invalid structured output, or safety rejection cannot interrupt Source collection, Article persistence, canonical Profile distribution, PHP Article LKG, or ordinary customer Article rendering;
- failure to retrieve an individual governed `originalUrl`, including unavailable/paywalled/unsupported content, is bounded Article-context degradation and does not by itself fail the whole digest when sufficient normalized metadata/summary context remains;
- a failed scheduled digest may preserve a prior valid digest with truthful age/freshness metadata or expose an explicit unavailable AI state;
- a failed interactive chat request fails that chat action only and does not suppress feed/digest state;
- AI disablement leaves the non-AI product independently operable.

Failure-isolation claims require executed tests at the lowest evidence level capable of proving the actual boundary. A test that only asserts an exception occurred is insufficient when the contract requires unrelated work/state to remain intact.

## State and health observability

Approval/trust, lifecycle, operational state, and health are emitted/reported separately.

- approval: `approved` / `unapproved`;
- lifecycle: `active` / `archived`;
- operational: `enabled` / `paused` / `disabled`;
- derived health: `unknown` / `healthy` / `delayed` / `degraded` / `unhealthy`.

An archived or paused endpoint is not labeled unhealthy merely because it is intentionally not running.

When AI is implemented, AI generation/chat health is a separate operational concern and must not be folded into Source health or canonical Article eligibility.

## Observability

The implemented distribution telemetry records bounded Profile key, API version, response status/duration, item/page information, non-secret credential identity, authentication/rate/missing/disabled/failure categories, and supplied adapter version. PHP health exposes last attempt/success, duration, items/pages, freshness and stale age, unchanged result, last failure category, and adapter version. This is operational diagnostics, not click, referral, visitor, page-view, reader-identity, or backlink analytics. Telemetry remains locally operable; central aggregation cannot become a runtime dependency.

Collection/operations telemetry remains sufficient to answer:

- which endpoints are running/due/delayed/degraded/unhealthy/paused/disabled/archived/unapproved;
- when each endpoint last succeeded;
- how long major collection stages take where measured;
- canonical transport/parser/normalization/processing outcome counts;
- why a candidate was rejected/excluded or left hidden;
- why a duplicate candidate was created, dismissed, or grouped;
- what material administrative configuration/moderation change occurred and to which resource.

AI telemetry, when implemented, MAY record bounded Profile key, provider/model, duration, safe token/usage facts when available, result/failure category, bounded URL-retrieval status/count facts, and non-secret correlation identifiers. It MUST NOT become reader profiling or unbounded prompt/response/retrieved-page logging.

Foundations include structured logs with run/correlation identifiers, bounded Collection-run history, job/queue metrics, Web/API liveness/readiness, Worker startup/dependency checks, and alert-ready endpoint health.

## Logging constraints

Logs MUST NOT contain:

- passwords, access/session tokens, Gemini/API keys, bearer credential plaintext, or Authorization headers;
- unbounded prompts, Article corpora, retrieved publisher-page content, chat histories, model responses, response bodies, or sensitive distribution payloads;
- sensitive environment values;
- credential-bearing database connection strings.

Query strings are redacted when they may contain credentials/private tokens.

Security/redaction tests MUST use synthetic credentials/secrets and MUST NOT require real production credentials. Live Gemini integration proof may use safely provisioned non-production credentials, but those credentials still must not appear in evidence/logs.

## Backup and recovery

Historical Phase 19 established and validated the production backup/restore, schema-upgrade, deployment, and rollback procedures. The current operator contract remains in `docs/operations/database-backup-and-restore.md` and `docs/operations/deployment-and-incident-runbook.md`.

Because Article identity is idempotent, safe replay is the preferred recovery mechanism where collection work can be replayed safely.

Recovery claims require observed or injected recovery validation under the testing contract. Documentation of a restore procedure alone is not restore proof.

Any persisted AI digest/auth state introduced later must follow supported production migration/backup/restore requirements. AI output must not become the only copy of canonical Article facts.

## Deployment configuration

- Secrets and environment-specific settings, including database connection details and later Gemini/provider credentials, live outside committed source.
- Git-tracked migrations and migration infrastructure are authoritative for the supported database schema.
- Web/API and Worker startup do not silently apply schema changes.
- Web/API and Worker versions remain compatible with the active schema.
- Graceful shutdown lets jobs finish or become safely retryable.
- Readiness fails when critical required dependencies are unavailable; optional Gemini failure must not make non-AI readiness falsely fail unless an explicitly AI-specific readiness surface is being checked.
- Managed deployments with admin routes prevent direct-origin bypass of the Cloudflare Access perimeter.

From the accepted production baseline forward, `docs/decisions/production-data-and-schema-compatibility.md` applies:

- customer production data is durable supported state;
- normal upgrades preserve governed data/relationships rather than rebuilding the customer database;
- supported production migration history remains usable as an upgrade path from supported deployed state;
- clean migration-from-zero continues for new/disposable installations but is not production-upgrade proof;
- post-launch schema changes require explicit forward-upgrade/data-preservation validation and compatible rollback/restore planning.

The completed 2.0 managed release established the existing deployment/backup boundary. The owner-approved 3.0 roadmap builds on it; self-host packaging and its separate deployment/support perimeter remain outside current scope unless promoted.

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
- distribution authentication/Profile/PHP synchronization/LKG/local-read failures.

3.0 implementation should add bounded operator guidance for Gemini digest/chat failure, key rotation/revocation, cost/rate-limit incidents, governed URL-retrieval failures, and multi-Profile customer integration only when those behaviors actually ship. Historical Phase 7 qualification procedures remain historical evidence/workflow rather than current roadmap routing.

## Privacy and retention

The Platform collects minimal reader data and the current product does not introduce visitor/click analytics. Cloudflare/admin access logs, application change records, IP logs, Source-provided author metadata, bounded Raw-item payloads, machine-credential audit metadata, distribution operational logs, and later bounded AI operational telemetry require bounded retention/access appropriate to the deployment.

Interactive chat should send only the minimum bounded Profile/user context and application-selected governed Article URLs needed for the request. News Scraper documentation must not invent provider retention/privacy claims; operators remain responsible for provider terms/configuration appropriate to their deployment.

Native administrator account data remains deferred unless later promoted.
