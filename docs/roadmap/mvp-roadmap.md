# MVP Roadmap

This roadmap establishes contracts and a secure vertical collection path before adding complex Source types.

## Phase 0 — Contracts and product foundation

### Deliverables
- locked project laws;
- MVP scope/exclusions;
- domain/data contract;
- architecture contract;
- Source/collection contract;
- Article lifecycle/deduplication contract;
- public/admin interface contract;
- security/operations baseline;
- foundational ADRs.

### Exit gate
- No unresolved contradiction exists among Phase 0 documents.
- Implementation tasks can cite measurable contract behavior.
- Topic-specific behavior is explicitly located in Publication configuration.
- Approval/trust, configuration lifecycle, operational state, health, Article identity, duplicate role, provenance, and feed eligibility are unambiguous.

## Phase 1 — Repository and application foundation

### Deliverables
- Node.js/TypeScript project scaffold;
- Web/API and Worker entry points;
- environment validation;
- linting, formatting, type checking, and test foundation;
- PostgreSQL connection and migration workflow;
- Publication-aware module boundaries;
- health/readiness endpoints;
- basic CI.

### Exit gate
- Web/API and Worker start independently.
- CI rejects formatting/type/migration/test failures.
- No indie-author-specific condition exists in shared engine modules.

## Phase 2 — Authentication, Publication, and Source administration

### Deliverables
- administrator authentication/session foundation;
- administrator identity + audit-event foundation;
- Publication configuration;
- Categories and deterministic include/exclude/categorize Relevance rules;
- Source and Source-endpoint create/update/archive lifecycle management;
- separate approval/trust state;
- separate active/archived lifecycle state;
- separate enabled/paused/disabled operational state;
- approved-domain policy and endpoint narrowing validation;
- Source priority configuration;
- admin shell and Source/endpoint screens.

### Exit gate
- An administrator can configure a Publication and approved RSS/Atom endpoint without code changes.
- Unapproved, archived, paused, or disabled Sources/endpoints cannot be scheduled/fetched.
- Publication collection-active state is independent from public-feed exposure.
- State changes are audited.

## Phase 3 — RSS/Atom collection and normalization vertical slice

### Deliverables
- fetcher/parser adapter interfaces;
- due-endpoint scheduler;
- durable jobs and endpoint locking;
- eligibility checks for approved + active + enabled Sources/endpoints;
- pre-fetch/redirect approval + SSRF/network safety;
- HTTP fetcher with timeouts, conditional requests, response/decompression limits;
- RSS/Atom parser;
- Raw-item to Article-candidate normalization;
- post-parse Article-link/domain validation;
- Collection-run records with transport/parser/normalization status and counts appropriate to pre-persistence processing;
- isolated retries/backoff;
- manual check-now operation;
- baseline structured telemetry.

### Exit gate
- At least two approved, active, enabled feeds fetch/parse/normalize independently.
- Re-fetching unchanged feeds is safe and produces deterministic normalized candidate identities/output without creating persistence side effects.
- One broken feed does not interrupt another.
- No request or redirect can bypass eligibility or network-safety gates.

## Phase 4 — Article identity, persistence, relevance, and public feed

### Deliverables
- Article schema + Article-observation provenance;
- reliable external-ID/canonical-URL identity resolution;
- transactional uniqueness/idempotent Article persistence;
- administrator display-override model preserving Source-derived values;
- deterministic include/exclude/categorize relevance reasons;
- Category assignment;
- reverse-chronological public feed;
- feed eligibility for visible ungrouped Articles and visible Primary Articles;
- desktop three-column/mobile stacked layouts;
- Source/Category filters, search, pagination;
- light/dark presentation;
- original-link behavior.

### Exit gate
- Repeated unchanged collection does not increase Article cardinality for the same Source identity.
- Every Article observation traces to endpoint/run provenance.
- Every visible row traces to an approved active Source and normalized stored Article.
- The initial Publication provides a useful rolling feed.
- A second unrelated test Publication renders unrelated Categories/branding without engine-topic conditionals.

## Phase 5 — True duplicate detection and moderation

### Deliverables
- cross-Article true-duplicate candidate detection using deterministic signals;
- persisted Duplicate review candidates and dismissal decisions;
- Duplicate groups/memberships;
- Primary selection using original-publisher metadata, Source priority, completeness/time/tie-break rules;
- automatic reason/confidence records;
- admin merge, split, dismiss, and choose-Primary actions;
- Article hide/restore/edit/category override behavior with audit trail;
- visible non-primary duplicate suppression without destroying Article visibility/provenance state.

### Exit gate
- Separately stored true-duplicate Source instances produce one ordinary public row while all Article instances/observations remain stored.
- Ungrouped Articles remain feed-eligible.
- Related coverage remains separate.
- Dismissed unchanged duplicate candidates do not recur indefinitely.
- Administrators can reverse incorrect automatic decisions.

## Phase 6 — Configurable HTML collection

### Deliverables
- HTML listing parser profiles implemented behind the existing adapter interface;
- selector validation and safe preview/testing;
- parser-version/failure diagnostics;
- approved non-feed Source support;
- browser-automation fallback decision gate, not default implementation.

### Exit gate
- An approved non-feed Source collects without contaminating normalized downstream code.
- HTML parsing uses the same approval/lifecycle/operational, safety, normalization, identity, provenance, retry, and failure-isolation boundaries as RSS/Atom.
- Parser failure is isolated/diagnosable.

## Phase 7 — Reliability, observability, and production hardening

### Deliverables
- metrics dashboards and alerts;
- tuned unhealthy/delayed endpoint detection;
- concurrency/per-host rate-limit tuning;
- backup/restore procedure and test;
- operational runbooks;
- security/abuse tests;
- data-retention jobs;
- deployment/rollback process.

### Exit gate
- Restore is tested.
- Source failures/queue delay are observable.
- Security tests cover authentication, authorization, CSRF/session boundaries, SSRF, unsafe content, secret leakage, and fetch limits.
- Earlier baseline security controls remain enforced.

## Phase 8 — Customer launch validation

### Deliverables
- curated initial Source configuration;
- Category/relevance tuning;
- duplicate-quality review;
- responsive/accessibility pass;
- administrator training notes;
- launch checklist;
- post-launch metric baseline.

### Exit gate
- Customer can operate Source list and moderate the feed.
- Public links, dates, Sources, and duplicate suppression are accurate in sampled validation.
- Known limitations are documented.
- Production monitoring/recovery ownership is assigned.

## Deferred roadmap candidates

After MVP evidence supports them:

- email newsletters;
- Source push/webhook adapters;
- AI-assisted summaries with clear attribution/controls;
- related-story/event clustering;
- public accounts/personalized feeds;
- outbound newsletter/social publishing;
- multi-Publication roles and self-service tenancy;
- generic relevance ranking/boost scoring;
- pinning/editorial featured-story ordering;
- API access;
- multilingual feeds.

Deferred features reuse normalized Articles and Publication boundaries rather than bypassing them.
