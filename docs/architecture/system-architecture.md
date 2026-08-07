# System Architecture

## Architectural goal

Keep Publication-specific configuration at the edges while the core collection, identity, Article, and duplicate pipeline remains reusable across topics.

## Logical components

```mermaid
flowchart LR
    A[Cloudflare Access-protected Admin UI/API] --> B[Web/API Application]
    P[Public Feed] --> B
    B --> D[(PostgreSQL)]
    B --> Q[Durable Job Queue / Scheduler - Phase 10+]
    Q --> W[Collection Worker]
    M[Manual Worker Invocation - Tech Demo] --> W
    W --> G[Eligibility + Pre-fetch Network Safety Gate]
    G --> F[Fetcher]
    F --> S[Approved Active Enabled Source Endpoint]
    F --> R[Parser Adapter]
    R --> N[Normalizer]
    N --> L[Article-link / Source Policy Validation]
    L --> V[Publication Relevance + Categories]
    V --> I[Article Identity Resolution]
    I --> X[Duplicate Candidate / Grouping when implemented]
    X --> D
    W --> O[Metrics + Structured Logs]
    B --> O
```

## Process boundaries

The initial deployment may use one repository/database, but it MUST support at least two independently runnable process roles:

- **Web/API process:** serves public/admin interfaces, validates commands, reads normalized data, and later requests/enqueues jobs. It does not perform Source collection inline.
- **Worker process:** performs collection execution, eligibility/network-safety checks, parsing, normalization, validation, Relevance, identity resolution, duplicate evaluation where implemented, and persistence.

A slow/crashed Source request in the Worker must not block normal public-feed requests.

During the tech-demo critical path before durable jobs/scheduling exist, collection is invoked manually through the Worker process. Phase 10 adds durable scheduling around the same endpoint execution unit; it does not create a second collection path.

### Phase 1 process bootstrap contract

Phase 1 establishes the process/lifecycle boundary without implementing collection or persistence.

- The Web/API process owns the HTTP listener and exposes liveness/readiness endpoints.
- Web/API liveness means the process/server is responsive. Readiness means startup initialization has completed and every critical dependency implemented in the current phase is usable.
- Phase 1 has no PostgreSQL dependency. Phase 2 extends readiness to cover the shared database dependency.
- The Worker is an independently executable process role with a testable bootstrap/startup and clean-shutdown contract.
- Phase 1 does not require a separate Worker HTTP server merely to expose health probes. Worker readiness is proven through startup/configuration/dependency validation until a concrete deployment requirement justifies an HTTP probe.
- Phase 5 adds manual endpoint execution behind this same Worker boundary. Phase 10 adds durable job consumption/scheduling around the same endpoint execution unit rather than creating another Worker path.
- Phase 1 runtime configuration is centralized and typed/validated. Malformed or out-of-range startup configuration must fail predictably; database, Source, Publication-data, scheduler, and collection secrets/configuration are not invented early merely to make validation non-empty.

## Module boundaries

Recommended initial layout:

```text
src/
  app/
  publications/
  sources/
  collection/
    scheduler/       # populated when automated polling arrives
    fetchers/
    parsers/
    normalization/
    relevance/
    safety/
  articles/
  deduplication/
  public-feed/
  admin/
  jobs/              # populated when durable jobs arrive
  database/
  observability/
  shared/
```

Native application authentication/account modules are deferred beyond MVP unless a later decision promotes them.

The layout above is a target ownership map, not a requirement to create empty directories or placeholder modules before substantive code exists.

Phase 1 Publication-awareness is structural only: generic naming, dependency direction, and module placement must preserve Publication as the future topic/configuration scoping boundary. Phase 1 does not implement Publication persistence, Source configuration, bootstrap/seed data, Categories, Relevance rules, or the initial indie-author Publication.

Rules:

- Source-specific retrieval/parsing lives behind fetcher/parser adapter interfaces established with the first RSS/Atom implementation.
- Public-feed code consumes normalized Article read models only.
- Admin controllers do not perform collection inline; once manual check-now exists they invoke/request the Worker collection path and later enqueue the same endpoint execution unit.
- Deduplication logic does not depend on Publication-specific keywords.
- Publication Relevance/Categories enter through configuration interfaces.
- Before configurable Relevance rules exist, the same Relevance boundary runs with an empty rule set and returns the deterministic default `include` decision.
- Article observations preserve endpoint/run provenance independently from Article cardinality.

## Collection pipeline

```mermaid
flowchart TD
    A[Manual Worker invocation or due endpoint] --> B{Publication collection-active + Source/endpoint approved, active, enabled?}
    B -- No --> Z[Skip with reason]
    B -- Yes --> C[Acquire endpoint run lock]
    C --> R0[Create Collection run]
    R0 --> G[Validate configured URL + DNS/address/port safety]
    G --> D[Conditional fetch]
    D --> E{Transport result}
    E -- Not modified --> F[Successful no-change transport result]
    E -- Failure --> H[Record isolated failure]
    E -- Content --> I[Parse Raw items]
    I --> J[Normalize Article candidates]
    J --> K[Validate normalized Article-link/source-domain policy]
    K --> L[Evaluate Publication Relevance/Categories]
    L --> M[Resolve Article identity idempotently]
    M --> N[Persist/update Article + Article observation transactionally]
    N --> O[Evaluate duplicate candidate/grouping where applicable]
    O --> P[Update run counters + endpoint health where implemented]
```

Every redirect returns through the pre-request network-safety gate before being followed.

The pipeline grows by phase without inventing outcomes for stages that do not exist yet:

- Phase 5 creates minimal persisted Collection runs and records transport/parser status/counts.
- Phase 6 adds normalization status/counts and validated candidates.
- Before configurable Relevance rules exist, candidates pass the empty-rule/default-include Relevance boundary.
- Phase 7 adds Article identity/persistence, observations, and canonical post-identity outcomes.
- Later duplicate phases add duplicate effects/grouping without redefining Article identity.

## Scheduling model

### Tech-demo execution

Before Phase 10:

- collection is manually invoked in the Worker for one configured endpoint at a time;
- eligibility, locking, network safety, fetch/redirect, parsing, normalization, Relevance, identity/persistence, and run accounting use the canonical pipeline stages that exist;
- separate endpoint runs fail independently;
- Web/API does not fetch Sources inline.

### Automated polling

From Phase 10 onward:

- polling is endpoint-specific;
- scheduler identifies due approved + active + enabled endpoints under collection-active Publications and enqueues independent jobs;
- distributed/database-backed locking prevents overlapping runs for one endpoint;
- bounded jitter avoids synchronized spikes;
- manual `check now` uses the same approval, lifecycle, operational, locking, network-safety, timeout, concurrency, and rate-limit rules and requests the same endpoint execution unit;
- push/webhook adapters are not MVP work; a future push ingress must reuse the normalized downstream pipeline.

## Persistence and transactions

- Minimal Collection-run persistence begins with real transport; it does not wait for Article persistence.
- Article identity resolution and insert/update occur transactionally with critical uniqueness constraints.
- An Article observation is linked to the Collection run as part of successful identity processing.
- Duplicate-group changes preserve exactly one Primary Article.
- Duplicate-review decisions persist independently from groups.
- A failed candidate does not roll back unrelated candidates from the same run unless integrity requires it.
- Once Article persistence exists, Collection-run accounting uses the canonical post-identity outcome taxonomy from the domain contract.
- Database constraints are preferred over application-only assumptions for critical identity/uniqueness rules.

## Administrative perimeter

MVP administrative UI/API routes are protected by Cloudflare Access according to `docs/decisions/cloudflare-access-admin-perimeter.md`.

- Supported deployments prevent direct-origin bypass of the Access perimeter.
- Application-managed accounts/sessions/roles are not part of MVP architecture.
- State-changing admin browser actions still require applicable CSRF/equivalent request-integrity protection.
- Admin commands validate Publication/resource ownership regardless of external access control.

## Initial technical baseline

Unless superseded by an Accepted ADR:

- Node.js with TypeScript;
- Express-compatible HTTP structure;
- PostgreSQL as system of record;
- manual Worker collection during the tech-demo critical path;
- durable scheduler/job mechanism suitable for retries and separate Workers from Phase 10 onward;
- server-rendered or lightweight client-rendered web UI;
- container-friendly environment/secrets configuration.

The architecture contract matters more than a specific library choice.

## Scale path

MVP does not require microservices, but must not prevent:

- multiple Worker processes;
- bounded global/per-host/per-Source concurrency;
- public-feed read caching;
- moving collection execution away from the web host;
- adding Publications without duplicating the application;
- evolving durable jobs/object storage where justified.