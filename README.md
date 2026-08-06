# News Scraper

Reusable, topic-independent news aggregation Platform for collecting Article metadata from administrator-approved Sources, normalizing it, preserving Source/run provenance, suppressing true duplicates, and publishing rolling headline feeds that send readers to original publishers.

The first configured Publication focuses on publishing-industry news relevant to indie authors. That topic is configuration, not shared Platform logic.

## Current project state

Current phase: **Phase 0 — Contracts and product foundation**.

The Phase 0 contracts have been reorganized by purpose under `docs/` and aligned through the documentation-review workflow. Implementation has not yet entered Phase 1.

## MVP objective

Prove both:

1. The initial indie-author Publication is useful as a rolling industry-news feed.
2. A second unrelated topic can be configured without changing aggregation-engine business logic.

## Public feed

Core desktop concept:

```text
Date | Headline | Source
```

MVP adds:

- reverse-chronological feed eligibility for visible ungrouped Articles and visible Primary Articles;
- original/canonical Article destination links;
- clear Source identity;
- accessible stacked mobile layout;
- Category/Source filtering and keyword search;
- deterministic pagination/load-more;
- light/dark presentation.

Pinning/featured-story ordering is deferred beyond MVP.

## Locked project laws

See `docs/contracts/project-contract.md`.

1. Shared aggregation-engine code remains topic independent.
2. Every collected Article originates from an administrator-approved Source.
3. Structured feeds are preferred over HTML scraping.
4. Original Article URL remains the primary public destination.
5. Source-specific data is normalized before public-feed use.
6. Repeated collection is idempotent.
7. True duplicates suppress redundant public rows without deleting Source instances/provenance.
8. Categories, relevance rules, branding, and Sources belong to Publication configuration.
9. Source failures are isolated.
10. Near-real-time means configurable polling unless a Source explicitly supports push; push adapters are deferred beyond MVP unless promoted.

## Canonical state model

The contracts deliberately separate:

- approval/trust state;
- operational collection state;
- Publication public visibility;
- Article moderation visibility;
- duplicate-group role;
- derived endpoint health.

An approved Source can therefore be paused without becoming “unhealthy,” and a hidden Article can remain a member of a Duplicate group without duplicate membership forcing it visible again.

## Collection architecture

```text
Admin UI / Public Feed
        ↓
Web/API
        ↓
PostgreSQL + durable jobs
        ↓
Worker
        ↓
Pre-fetch approval + network-safety gate
        ↓
Fetcher → approved Source endpoint
        ↓
Parser adapter → Raw item
        ↓
Normalizer → Article candidate
        ↓
Article-link / Source-domain validation
        ↓
Publication relevance + Categories
        ↓
Article identity + idempotent persistence
        ↓
Article observation provenance
        ↓
Duplicate review/grouping
        ↓
Public-feed read model → original Article URL
```

Web/API and Worker roles are independently runnable so slow/failing Sources do not block normal feed requests.

## Identity versus duplicates

- **Article identity:** have we already stored this Source instance? This is solved transactionally in Phase 4 using reliable Source external IDs, canonical URLs, and constrained fallback evidence.
- **True duplicate identity:** do two separately stored Articles represent the same underlying published item? This is Phase 5 duplicate-review/grouping behavior.

Weak duplicate evidence becomes a persisted review candidate rather than silently hiding an Article.

## Administration

MVP administration covers:

- Publication identity/branding/collection/public state;
- Source/endpoint approval and enable/pause/disable/archive state;
- Source priority and approved-domain policy;
- collection intervals and endpoint health/run history;
- deterministic include/exclude/categorize rules;
- Article visibility, Categories, and display overrides preserving normalized Source values;
- Duplicate review, merge/split/dismiss/Primary controls;
- audit events tied to administrator identity.

## Security and reliability

Baseline controls are implemented with the surfaces they protect, not postponed to Phase 7:

- authenticated/authorized admin operations with session/CSRF protections;
- SSRF-resistant validation before every request/redirect;
- response/decompression limits and timeouts;
- untrusted-content sanitization/escaping;
- independent endpoint jobs and bounded retries/concurrency;
- secret-safe structured logs and Collection-run telemetry.

Phase 7 hardens/operationalizes those controls with dashboards, alerts, restore testing, abuse tests, retention jobs, and runbooks.

## Documentation map

Start with `BOOT.md`.

```text
docs/
├── contracts/
│   ├── project-contract.md
│   ├── mvp-scope-and-users.md
│   ├── domain-and-data-contract.md
│   ├── source-and-collection-contract.md
│   ├── article-lifecycle-and-deduplication.md
│   └── public-feed-and-admin-contract.md
├── architecture/
│   └── system-architecture.md
├── operations/
│   └── security-reliability-and-operations.md
├── roadmap/
│   └── mvp-roadmap.md
└── decisions/
    ├── topic-independent-publication-model.md
    ├── whitelist-and-structured-feed-first.md
    └── original-link-and-normalized-metadata.md
```

`docs/README.md` is the documentation index. `AGENTS.md` is the compact project-law summary. Detailed behavior belongs to specialized documents.

## Repository workflow

Documentation:

```text
/docs-review
→ explicit approval or /docs-apply
→ /docs-apply
```

Implementation prompt workflow:

```text
/prompt-ass
→ /prompt-plan
→ /prompt-write <folder name>
```

`BOOT.md` defines exact workflow gates, source-of-truth routing, validation expectations, and repository modification rules.

## Roadmap

See `docs/roadmap/mvp-roadmap.md`:

- Phase 0 — Contracts and product foundation
- Phase 1 — Repository and application foundation
- Phase 2 — Authentication, Publication, and Source administration
- Phase 3 — RSS/Atom collection and normalization vertical slice
- Phase 4 — Article identity, persistence, relevance, and public feed
- Phase 5 — True duplicate detection and moderation
- Phase 6 — Configurable HTML collection
- Phase 7 — Reliability, observability, and production hardening
- Phase 8 — Customer launch validation

Deferred: push/webhook adapters, AI summaries, related-story clustering, user personalization, outbound publishing, self-service tenancy, generic ranking/boost scoring, pinning/featured ordering, API access, multilingual feeds.

## Repository

`jfin602/news-scraper` — default branch `main`.
