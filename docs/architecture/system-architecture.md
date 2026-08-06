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
    W --> G[Pre-fetch Approval + Network Safety Gate]
    G --> F[Fetcher]
    F --> S[Approved Source Endpoint]
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
- **Worker process:** schedules/performs collection, network safety checks, parsing, normalization, validation, relevance, identity resolution, duplicate evaluation, and persistence.

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
- Publication relevance/categories enter through configuration interfaces.
- Article observations preserve endpoint/run provenance independently from Article cardinality.

## Collection pipeline

```mermaid
flowchart TD
    A[Endpoint becomes due] --> B{Publication active + Source/endpoint approved and enabled?}
    B -- No --> Z[Skip scheduling with reason]
    B -- Yes --> C[Acquire endpoint run lock]
    C --> G[Validate configured URL + DNS/address/port safety]
    G --> D[Conditional fetch]
    D --> E{Transport result}
    E -- Not modified --> F[Successful no-change run]
    E -- Failure --> H[Record isolated failure + retry policy]
    E -- Content --> I[Parse Raw items]
    I --> J[Normalize Article candidates]
    J --> K[Validate normalized article-link/source-domain policy]
    K --> L[Evaluate Publication relevance/categories]
    L --> M[Resolve Article identity idempotently]
    M --> N[Persist/update Article + Article observation transactionally]
    N --> O[Evaluate duplicate candidate/grouping where applicable]
    O --> P[Update run counters + endpoint health]
```

Every redirect returns through the pre-request network safety gate before being followed.

## Scheduling model

- Polling is endpoint-specific.
- Scheduler identifies due approved/enabled endpoints and enqueues independent jobs.
- Distributed/database-backed locking prevents overlapping runs for one endpoint.
- Bounded jitter avoids synchronized spikes.
- Manual `check now` uses the same approval, state, locking, network-safety, timeout, concurrency, and rate-limit rules.
- Push/webhook adapters are not MVP work; a future push ingress must reuse the same normalized pipeline rather than bypass it.

## Persistence and transactions

- Article identity resolution and insert/update occur transactionally with critical uniqueness constraints.
- An Article observation is recorded/update-linked to the Collection run as part of successful identity processing.
- Duplicate-group changes preserve exactly one Primary Article.
- Duplicate-review decisions persist independently from the group itself.
- A failed candidate does not roll back unrelated candidates from the same run unless database integrity requires it.
- Collection-run accounting uses the canonical outcome taxonomy from the domain contract.
- Database constraints are preferred over application-only assumptions for critical identity/uniqueness rules.

## Initial technical baseline

Unless superseded by an Accepted ADR:

- Node.js with TypeScript;
- Express-compatible HTTP structure;
- PostgreSQL as system of record;
- durable scheduler/job mechanism suitable for retries and separate workers;
- server-rendered or lightweight client-rendered web UI;
- container-friendly configuration through environment variables/secrets.

The architecture contract matters more than a specific library choice.

## Scale path

MVP does not require microservices, but it must not prevent:

- multiple Worker processes;
- bounded global/per-host/per-Source concurrency;
- public-feed read caching;
- moving collection execution away from the web host;
- adding Publications without duplicating the application;
- evolving durable jobs/object storage where justified.
