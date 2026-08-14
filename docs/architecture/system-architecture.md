# System Architecture

## Architectural goal

Keep topic-specific Publication configuration at the edges while the core collection, identity, Article, duplicate, feed, scheduling, and administration behavior remains reusable across topics and deployments.

Each deployed installation hosts exactly one Publication. The reusable unit is the codebase: a different topic is configured and deployed as another installation rather than added as another concurrently hosted Publication.

Publication is singleton editorial configuration, not relational tenancy. Real Source/endpoint/run/Article/observation relationships remain explicit.

## Logical components

```mermaid
flowchart LR
    A[Cloudflare Access-protected Admin UI/API] --> B[Web/API Application]
    P[Root Public Feed] --> B
    B --> D[(PostgreSQL)]
    B --> Q[Durable Job Queue / Scheduler]
    Q --> W[Collection Worker]
    M[Manual Worker Invocation] --> W
    W --> G[Eligibility + Pre-fetch Network Safety Gate]
    G --> F[Fetcher]
    F --> S[Approved Active Enabled Source Endpoint]
    F --> R[Parser Adapter]
    R --> A[Optional Source RSS/Atom Item Admission Filter]
    A --> N[Normalizer]
    N --> L[Article-link / Source Policy Validation]
    L --> V[Installation Relevance + Categories]
    V --> I[Source-scoped Article Identity Resolution]
    I --> X[Duplicate Candidate / Grouping when implemented]
    X --> D
    W --> O[Metrics + Structured Logs]
    B --> O
```

## Deployment boundary

One installation contains one singleton Publication configuration and its Sources/endpoints/Articles/editorial state.

The singleton Publication configuration carries the installation-wide news-product settings actually used by implemented phases, such as name, `active_for_collection`, `public_status`, and later branding/presentation/Relevance/Category settings.

Publication is not a tenant key:

- Sources, Articles, Categories, Relevance rules, duplicate records, jobs, and admin commands do not need a Publication UUID/slug/foreign key to scope the one installation;
- Source `config_key` is installation-wide;
- Source-endpoint `config_key` remains Source-scoped;
- Article identity remains Source-scoped;
- endpoint/Collection-run and Source/Article/observation relationships remain explicit because they protect real provenance/integrity;
- no supported runtime path selects among Publications.

The canonical public page is `GET /`. The canonical basic public feed API is `GET /api/feed`.

A second topic uses another configured deployment of the same codebase and therefore has separate deployment/runtime state unless a later explicit architecture decision defines shared infrastructure without changing the one-Publication-per-installation product boundary.

## Process boundaries

The initial deployment may use one repository/database, but it MUST support at least two independently runnable process roles:

- **Web/API process:** serves the installation's public/admin interfaces, validates commands, reads normalized data, and may request/enqueue jobs. It does not perform Source collection inline.
- **Worker process:** performs scheduled/manual collection execution, eligibility/network-safety checks, parsing, normalization, validation, Relevance, identity resolution, duplicate evaluation where implemented, and persistence.

A slow/crashed Source request in the Worker must not block normal public-feed requests.

During the tech-demo critical path before durable jobs/scheduling existed, collection was invoked manually through the Worker process once transport existed. Phase 10 added durable scheduling around that same endpoint execution unit rather than creating a second collection path.

Operator/Worker entry points select Sources/endpoints directly and MUST NOT require Publication selection merely to choose among topics.

### Phase 1 process bootstrap contract

Phase 1 establishes the process/lifecycle boundary without implementing collection or persistence.

- The Web/API process owns the HTTP listener and exposes liveness/readiness endpoints.
- Web/API liveness means the process/server is responsive. Readiness means startup initialization has completed and every critical dependency implemented in the current phase is usable.
- Phase 1 has no PostgreSQL dependency. Phase 2 extends readiness to cover the shared database dependency.
- The Worker is an independently executable process role with a testable bootstrap/startup and clean-shutdown contract.
- Phase 1 does not require a separate Worker HTTP server merely to expose health probes. Worker readiness is proven through startup/configuration/dependency validation until a concrete deployment requirement justifies an HTTP probe.
- Phase 5 added manual endpoint execution behind this same Worker boundary. Phase 10 added durable job consumption/scheduling around the same endpoint execution unit rather than creating another Worker path.
- Phase 1 runtime configuration is centralized and typed/validated. Malformed or out-of-range startup configuration must fail predictably; database, Source, scheduler, and collection secrets/configuration are not invented early merely to make validation non-empty.

Publication-aware structure means generic naming and separation of topic configuration from shared engine behavior; it does not imply relational Publication tenancy.

### Phase 4 execution boundary

Phase 4 introduces the reusable pre-transport gate without introducing transport itself.

- Eligibility reads singleton Publication collection-active state plus persisted Source/endpoint state and approved-domain policy established in Phase 3.
- A shared cross-process per-endpoint run lock prevents overlapping ownership for one endpoint and is available to every Worker process. PostgreSQL or an equivalently shared coordination mechanism is required; process-local locking alone is insufficient.
- Network safety may resolve DNS and classifies the concrete destination before transport. Eligible results carry validated destination/address information forward so later transport cannot silently make a second unchecked DNS decision.
- Eligible execution stops at an injected/controlled outbound-fetch boundary in Phase 4. No publisher HTTP request, real HTTP redirect following, persisted Collection run, or manual endpoint collection command exists yet.
- Redirect destination revalidation is exposed as a reusable primitive in Phase 4; Phase 5 is the first phase that follows actual HTTP redirects through it.

## Module boundaries

Canonical ownership layout:

```text
src/
  app/
  publication/      # singleton installation/editorial configuration
  sources/
  collection/
    scheduler/       # due-endpoint scheduling and scheduler policy/runtime
    fetchers/
    parsers/
    normalization/
    relevance/
    safety/
  articles/
  deduplication/
  public-feed/
  admin/
  jobs/              # durable endpoint collection jobs/retry/recovery execution
  database/
  observability/
  shared/
```

The exact implementation may keep or rename an existing module only when that choice produces the smallest coherent canonical design. It MUST NOT retain plural/selector-oriented APIs solely as a compatibility bridge. Legacy-only source modules, wrappers, types, tests, fixtures, configuration paths, and other artifacts from superseded pre-production architecture MUST be deleted when the canonical implementation no longer has an independent use for them.

Native application authentication/account modules are deferred beyond MVP unless a later decision promotes them.

The layout above is a target ownership map, not a requirement to create empty directories or placeholder modules before substantive code exists.

Rules:

- Source-specific retrieval/parsing lives behind fetcher/parser adapter interfaces established with the first RSS/Atom implementation.
- The optional Source RSS/Atom item admission filter is Source-owned include-only configuration evaluated over existing parsed RSS/Atom Raw-item text before Article-candidate normalization; it is distinct from downstream Relevance.
- Public-feed code consumes normalized Article read models only.
- Admin controllers do not perform collection inline; manual check-now requests the same governed endpoint execution/job path rather than a second collector.
- Deduplication logic does not depend on topic-specific keywords.
- Relevance/Categories enter through singleton Publication configuration interfaces and may use Source scope where defined.
- Before configurable Relevance rules exist, the same Relevance boundary runs with an empty rule set and returns deterministic default `include`.
- Article observations preserve endpoint/run provenance independently from Article cardinality.
- Publication identifiers/slugs are not passed through domain/application layers merely as an installation scope token.

## Maintainability and simplification principles

Architecture quality is judged by clear ownership, preserved invariants, and understandable behavior rather than by minimizing raw line count, file count, module count, or abstraction count.

- Prefer simple explicit ownership and control flow over speculative abstraction.
- Introduce or retain an abstraction only when it represents a real stable boundary, isolates a meaningful dependency, or owns genuinely shared semantic behavior; similar-looking code alone is not sufficient justification.
- A governed business rule SHOULD have one canonical implementation path. Consolidate duplicated semantic behavior when doing so removes competing authorities without creating an overly generic helper.
- Keep orchestration readable: coordinating modules should expose the high-level sequence while stage-specific validation, persistence, network, and transformation behavior remains owned by the narrowest appropriate module.
- Transaction, connection, endpoint-lock, timer, listener, stream, child-process, and other resource ownership MUST be explicit enough that acquisition, release, interruption, retry, and failure behavior can be reasoned about locally.
- Production modules MUST NOT carry helpers or branches whose only purpose is test convenience; test-only support belongs in test infrastructure unless the same boundary is genuinely part of production design.
- Dead code, obsolete compatibility-only code, superseded wrappers, commented-out implementations, and unused dependencies SHOULD be removed rather than retained as informal history. Git and durable documentation provide history.
- Do not add a third-party dependency merely to replace a small, clear, well-tested local behavior unless the dependency materially improves correctness, safety, interoperability, or maintenance.
- Optimize runtime, database, Worker, Web/API, startup, and resource behavior from observed measurements and real bottlenecks rather than speculative caching, concurrency, batching, or complexity.
- Behavior-preserving simplification MUST NOT flatten or weaken genuine Source/endpoint/run/Article/observation, transaction, security, provenance, idempotency, or duplicate-integrity boundaries merely because fewer types/joins/modules would result.

Phase 21 performs the deliberate whole-codebase application of these principles after customer launch. Later feature work inherits them; Phase 21 is not a one-time permission to simplify at the expense of governed behavior.

## Collection pipeline

```mermaid
flowchart TD
    A[Manual Worker invocation or due endpoint] --> B{Publication collection active + Source/endpoint approved, active, enabled?}
    B -- No --> Z[Skip with reason]
    B -- Yes --> C[Acquire endpoint run lock]
    C --> R0[Create Collection run]
    R0 --> G[Validate configured URL + DNS/address/port safety]
    G --> D[Conditional fetch]
    D --> E{Transport result}
    E -- Not modified --> F[Successful no-change transport result]
    E -- Failure --> H[Record isolated failure]
    E -- Content --> I[Parse Raw items]
    I --> A[Apply optional Source RSS/Atom item admission filter]
    A --> J[Normalize admitted Article candidates]
    J --> K[Validate normalized Article-link/source-domain policy]
    K --> L[Evaluate installation/Source-scoped Relevance + Categories]
    L --> M[Resolve Article identity within Source]
    M --> N[Persist/update Article + Article observation transactionally]
    N --> O[Evaluate duplicate candidate/grouping where applicable]
    O --> P[Update run counters + endpoint health]
```

This is the completed staged pipeline through Phase 11 plus the contracted later duplicate node; it is not a claim that every node existed in Phase 4. Every redirect returns through the pre-request network-safety gate before being followed.

The pipeline grew by phase without inventing outcomes for stages that did not exist yet:

- Phase 4 established eligibility, the shared endpoint lock, network-safety decisions, and the controlled outbound-fetch boundary only.
- Phase 5 added manual endpoint execution, real HTTP transport/redirect following, minimal persisted Collection runs, and transport/parser status/counts.
- Phase 6 added normalization status/counts and validated candidates.
- Before configurable Relevance rules exist, candidates pass the empty-rule/default-include Relevance boundary.
- Phase 7 added Article identity/persistence, observations, and canonical post-identity outcomes.
- Phase 10 added durable scheduling/jobs, conditional-fetch state, retry/recovery, concurrency controls, and endpoint health around the same endpoint execution unit.
- Phase 11 extended the existing pre-identity Relevance boundary with persisted installation-wide/Source-scoped include/exclude/categorize rules, Category/default assignment, deterministic persisted reasons, exact pre-identity `excluded` accounting, and the explicit pre-admin editorial-configuration path.
- Phase 14 adds the optional Source RSS/Atom item admission filter before normalization, with distinct `source_item_filtered_count` accounting and no Article observation or Relevance `excluded` outcome for a mismatch.
- Later duplicate phases add duplicate effects/grouping without redefining Article identity.

## Scheduling model

### Tech-demo execution

During Phases 5–9 before durable scheduling existed:

- collection was manually invoked in the Worker for one configured endpoint at a time;
- eligibility, the Phase 4 shared lock, network safety, fetch/redirect, parsing, normalization, Relevance, identity/persistence, and run accounting used the canonical pipeline stages that existed;
- separate endpoint runs failed independently;
- Web/API did not fetch Sources inline.

Phase 4 itself stopped at the controlled outbound-fetch boundary and did not yet create endpoint Collection runs.

Implementation-level Publication selectors that remained from earlier source trees were obsolete plumbing and were removed by the completed Phase 10 entry singleton correction.

### Automated polling

From Phase 10 onward:

- polling is endpoint-specific within the installation;
- scheduler identifies due approved + active + enabled endpoints when singleton Publication collection is active and enqueues independent jobs;
- jobs reuse the Phase 4 shared/database-backed endpoint lock to prevent overlapping runs for one endpoint;
- bounded jitter avoids synchronized spikes;
- manual `check now` uses the same approval, lifecycle, operational, locking, network-safety, timeout, concurrency, and rate-limit rules and requests the same endpoint execution unit;
- no scheduler/job design chooses among multiple topic Publications in one installation;
- push/webhook adapters are not MVP work; a future push ingress must reuse the normalized downstream pipeline.

## Persistence and transactions

- Git-tracked migrations and migration infrastructure are authoritative for the supported database schema.
- Runtime processes do not make ad hoc schema changes; Web/API and Worker startup do not automatically apply migrations.
- Before production upgrade compatibility is established, supported databases are created fresh from the repository's current migration chain and bootstrap/configuration workflow.
- Foundational pre-production schema corrections MUST remove, squash, replace, or consolidate superseded migration steps when doing so yields the smaller canonical migration-from-zero model. The active migration tree is not retained as a historical record of disposable schemas; Git history and documentation serve that purpose.
- Existing development/pre-production databases created by superseded source trees are destroyed/recreated and bootstrapped rather than migrated through compatibility transformations.
- Migration-from-zero MUST deterministically create the complete canonical singleton schema.
- Publication tenancy/scoping is absent; Source/endpoint/run/Article/observation relationships and critical uniqueness remain explicit.
- The Phase 4 endpoint lock is shared across Worker processes and requires real persistence/concurrency evidence when implemented through PostgreSQL or another shared coordination store.
- Minimal Collection-run persistence begins with real transport in Phase 5; it does not wait for Article persistence.
- Article identity resolution plus Article create/update and the corresponding successful identity-resolving observation form one atomic per-candidate transaction with critical uniqueness constraints.
- `created`, `updated`, and `unchanged` observations reference the resolved Article; pre-identity outcomes such as `rejected` or `excluded` may persist provenance without an Article identifier as governed by the domain contract.
- An Article observation is linked to the actual Source endpoint and existing Collection run that produced the candidate; endpoint/run and Article Source relationships must remain consistent.
- A failed candidate does not roll back unrelated successful candidates from the same Collection run unless integrity requires it; Article persistence does not wrap an entire feed batch in one all-or-nothing Article transaction.
- Collection-run finalization occurs after the bounded candidate batch finishes and canonical processing-outcome counters are known.
- Duplicate-group changes preserve exactly one Primary Article.
- Duplicate-review decisions persist independently from groups.
- Once Article persistence exists, Collection-run accounting uses the canonical post-identity outcome taxonomy from the domain contract.
- Database constraints are preferred over application-only assumptions for critical identity/uniqueness rules.

Phase 19 establishes and validates the production backup/restore, deployment/rollback, and schema-upgrade procedures. Acceptance of Phase 20 establishes the first supported production schema/data baseline. From that baseline forward, `docs/decisions/production-data-and-schema-compatibility.md` governs upgrades: supported production state is preserved, supported migration history remains upgrade-capable, and clean migration-from-zero continues for new/disposable installations but is not sufficient evidence for production upgrade safety.

## Administrative perimeter

MVP administrative UI/API routes are protected by Cloudflare Access according to `docs/decisions/cloudflare-access-admin-perimeter.md`.

- Supported deployments prevent direct-origin bypass of the Access perimeter.
- Application-managed accounts/sessions/roles are not part of MVP architecture.
- State-changing admin browser actions still require applicable CSRF/equivalent request-integrity protection.
- Admin commands validate real resource relationships and domain invariants regardless of external access control.
- Admin navigation/commands operate on the installation's singleton Publication configuration and resources rather than exposing a multi-Publication topic selector.

## Initial technical baseline

Unless superseded by an Accepted ADR:

- Node.js with TypeScript;
- Express-compatible HTTP structure;
- PostgreSQL as system of record;
- one Publication/topic per deployed installation;
- singleton Publication configuration without relational tenancy;
- root `/` as the canonical customer-visible feed route;
- manual Worker collection preserved as an operator path established during the tech-demo critical path;
- durable scheduler/job mechanism suitable for retries and separate Workers from Phase 10 onward;
- server-rendered or lightweight client-rendered web UI;
- container-friendly environment/secrets configuration.

The architecture contract matters more than a specific library choice.

## Scale path

MVP does not require microservices, but must not prevent:

- multiple Worker processes for the same installation;
- bounded global/per-host/per-Source concurrency;
- public-feed read caching;
- moving collection execution away from the web host;
- deploying additional topic instances from the same codebase without duplicating or topic-forking engine logic;
- evolving durable jobs/object storage where justified.

Scaling infrastructure across deployments in the future MUST preserve the product boundary that one installation presents one Publication/topic unless a new explicit contract/ADR changes that decision.

A future concurrent multi-Publication requirement is a deliberate architecture/data-model project; the MVP does not carry dormant tenant fields to make that hypothetical change appear incremental.
