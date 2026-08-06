# MVP Roadmap

This roadmap is ordered to establish contracts and vertical functionality before adding complex source types.

## Phase 0 — Contracts and product foundation

### Deliverables

- locked project laws;
- MVP scope and exclusions;
- domain and data contract;
- architecture contract;
- source/collection contract;
- article lifecycle and duplicate contract;
- public/admin interface contract;
- security and operations baseline;
- foundational ADRs.

### Exit gate

- No unresolved contradiction exists among Phase 0 documents.
- Implementation tasks can cite a contract and measurable acceptance criteria.
- Topic-specific behavior is explicitly located in publication configuration.

## Phase 1 — Repository and application foundation

### Deliverables

- Node.js/TypeScript project scaffold;
- web and worker entry points;
- environment validation;
- linting, formatting, type checking, and test foundation;
- PostgreSQL connection and migration workflow;
- publication-aware module boundaries;
- health/readiness endpoints;
- basic CI.

### Exit gate

- Web and worker processes start independently.
- CI rejects formatting, type, migration, and test failures.
- No indie-author-specific condition exists in engine modules.

## Phase 2 — Authentication, publication, and source administration

### Deliverables

- administrator authentication and sessions;
- publication configuration;
- categories and relevance-rule storage;
- source and endpoint CRUD;
- approved-domain validation;
- audit-event foundation;
- admin shell and source-list screens.

### Exit gate

- An administrator can configure a publication and approved RSS endpoint without code changes.
- Disabled/unapproved endpoints cannot be scheduled or fetched.

## Phase 3 — RSS/Atom collection vertical slice

### Deliverables

- due-endpoint scheduler;
- durable job execution and endpoint locking;
- HTTP fetcher with timeouts, conditional requests, limits, and SSRF defenses;
- RSS/Atom parser;
- normalization pipeline;
- collection-run records;
- isolated retries/backoff;
- manual check-now operation.

### Exit gate

- At least two approved feeds collect independently.
- Repeated unchanged collection creates no duplicate logical articles.
- One broken feed does not interrupt another.

## Phase 4 — Article persistence, relevance, and public feed

### Deliverables

- article identity resolution;
- configurable relevance actions and reason records;
- category assignment;
- reverse-chronological public feed;
- desktop three-column and mobile stacked layouts;
- source/category filters, search, and pagination;
- light/dark presentation;
- original-link behavior.

### Exit gate

- The initial publication provides a useful rolling feed.
- Every visible item traces to an approved source and normalized stored article.
- A second test publication can render unrelated categories and branding.

## Phase 5 — Duplicate detection and moderation

### Deliverables

- canonical URL and exact identifier checks;
- normalized-title/fingerprint candidate detection;
- duplicate groups and primary selection;
- automatic reason/confidence records;
- admin merge, split, and choose-primary actions;
- article hide, restore, pin, edit, and audit behavior.

### Exit gate

- True duplicate source instances produce one public row while all instances remain stored.
- Related coverage can remain separate.
- Administrators can reverse an incorrect automatic decision.

## Phase 6 — Configurable HTML collection

### Deliverables

- HTML listing parser profiles;
- selector validation and safe preview/testing;
- parser-version and failure diagnostics;
- source-specific adapter interface;
- browser automation fallback decision gate, not default implementation.

### Exit gate

- An approved non-feed source can be collected without contaminating normalized public-feed code.
- Parser failure is isolated and clearly diagnosable.

## Phase 7 — Reliability, observability, and production hardening

### Deliverables

- metrics and dashboards;
- unhealthy/delayed source detection;
- alert integration points;
- concurrency and per-host rate limits;
- backup and restore procedure;
- operational runbooks;
- security review and abuse tests;
- data-retention jobs;
- deployment and rollback process.

### Exit gate

- Restore is tested.
- Source failures and queue delay are observable.
- Security tests cover authentication, authorization, SSRF, unsafe content, and secret leakage.

## Phase 8 — Customer launch validation

### Deliverables

- curated initial source configuration;
- category and relevance tuning;
- duplicate-quality review;
- responsive and accessibility pass;
- administrator training notes;
- launch checklist;
- post-launch metric baseline.

### Exit gate

- The customer can operate the source list and moderate the feed.
- Public links, dates, and sources are accurate in sampled validation.
- Known limitations are documented.
- Production monitoring and recovery ownership are assigned.

## Deferred roadmap candidates

After MVP evidence supports them:

- email newsletters;
- source push/webhook adapters;
- AI-assisted summaries with clear attribution and controls;
- related-story/event clustering;
- public accounts and personalized feeds;
- outbound newsletter/social publishing;
- multi-publication roles and self-service tenancy;
- API access;
- multilingual feeds.

Deferred features must reuse normalized articles and publication boundaries rather than bypassing them.
