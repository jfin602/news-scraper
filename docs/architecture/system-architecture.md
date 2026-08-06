# System Architecture

## Architectural goal

Keep Publication-specific configuration at the edges while the core collection, identity, Article, and duplicate pipeline remains reusable across topics.

## Logical components

```mermaid
flowchart LR
    A[Admin UI] --> B[Web/API Application]
    P[Public Feed] --> B
    B --> D[(PostgreSQL)]
    B --> Q[Durable Job Queue / Scheduler]
    Q --> W[Collection Worker]
    W --> G[Eligibility + Pre-fetch Network Safety Gate]
    G --> F[Fetcher]
    F --> S[Approved Active Enabled Source Endpoint]
    F --> R[Parser Adapter]
    R --> N[Normalizer]
    N --> L[Article-link / Source Policy Validation]
    L --> V[Publication Relevance + Categories]
    V --> I[Article Identity Resolution]
    I --> X[Duplicate Candidate / Grouping]
    X --> D
    W --> O[Metrics + Structured Logs]
    B --> O
```

## Process boundaries

The initial deployment may use one repository/database, but it MUST support at least two independently runnable process roles:

- **Web/API process:** serves public/admin interfaces, validates commands, reads normalized data, and requests/enqueues jobs.
- **Worker process:** schedules/performs collection, eligibility/network-safety checks, parsing, normalization, validation, relevance, identity resolution, duplicate evaluation, and persistence.

A slow/crashed Source request in the Worker must not block normal public-feed requests.

## Module boundaries

Recommended initial layout:

```text
src/
  app/
  auth/
  publications/
  sources/
  collection/
    scheduler/
    fetchers/
    parsers/
    normalization/
    relevance/
    safety/
  articles/
  deduplication/
  public-feed/
  admin/
  jobs/
  database/
  observability/
  shared/
```

Rules:

- Source-specific retrieval/parsing lives behind fetcher/parser adapter interfaces established with the first RSS/Atom implementation.
- Public-feed code consumes normalized Article read models only.
- Admin controllers do not perform collection inline; they enqueue/request jobs.
- Deduplication logic does not depend on Publication-specific keywords.
- Publication relevance/Categories enter through configuration interfaces.
- Article observations preserve endpoint/run provenance independently from Article cardinality.

## Collection pipeline

```mermaid
flowchart TD
    A[Endpoint becomes due] --> B{Publication collection-active + Source/endpoint approved, active, enabled?}
    B -- No --> Z[Skip scheduling with reason]
    B -- Yes --> C[Acquire endpoint run lock]
    C --> G[Validate configured URL + DNS/address/port safety]
    G --> D[Conditional fetch]
    D --> E{Transport result}
    E -- Not modified --> F[Successful no-change transport result]
    E -- Failure --> H[Record isolated failure + retry policy]
    E -- Content --> I[Parse Raw items]
    I --> J[Normalize Article candidates]
    J --> K[Validate normalized Article-link/source-domain policy]
    K --> L[Evaluate Publication relevance/Categories]
    L --> M[Resolve Article identity idempotently]
    M --> N[Persist/update Article + Article observation transactionally]
    N --> O[Evaluate duplicate candidate/grouping where applicable]
    O --> P[Update run counters + endpoint health]
```

Every redirect returns through the pre-request network-safety gate before being followed.

Before Phase 4 Article persistence exists, the Phase 3 Worker stops after normalization/Article-link validation and records only transport/parser/normalization run status/counts. It does not pretend post-identity Article outcomes exist.

## Scheduling model

- Polling is endpoint-specific.
- Scheduler identifies due approved + active + enabled endpoints under collection-active Publications and enqueues independent jobs.
- Distributed/database-backed locking prevents overlapping runs for one endpoint.
- Bounded jitter avoids synchronized spikes.
- Manual `check now` uses the same approval, lifecycle, operational, locking, network-safety, timeout, concurrency, and rate-limit rules.
- Push/webhook adapters are not MVP work; a future push ingress must reuse the normalized downstream pipeline.

## Persistence and transactions

- Article identity resolution and insert/update occur transactionally with critical uniqueness constraints.
- An Article observation is linked to the Collection run as part of successful identity processing.
- Duplicate-group changes preserve exactly one Primary Article.
- Duplicate-review decisions persist independently from groups.
- A failed candidate does not roll back unrelated candidates from the same run unless integrity requires it.
- Once Article persistence exists, Collection-run accounting uses the canonical post-identity outcome taxonomy from the domain contract.
- Database constraints are preferred over application-only assumptions for critical identity/uniqueness rules.

## Initial technical baseline

Unless superseded by an Accepted ADR:

- Node.js with TypeScript;
- Express-compatible HTTP structure;
- PostgreSQL as system of record;
- durable scheduler/job mechanism suitable for retries and separate Workers;
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
