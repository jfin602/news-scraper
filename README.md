# News Scraper

Reusable, topic-independent news aggregation platform for collecting article metadata from administrator-approved sources, normalizing it, suppressing true duplicates, and publishing rolling headline feeds that send readers to the original publishers.

The first configured publication focuses on publishing-industry news relevant to indie authors. That topic is configuration, not platform logic: the same aggregation engine must be able to power an unrelated publication without introducing topic-specific conditionals into shared collection, normalization, deduplication, or feed code.

## Current project state

Current phase: **Phase 0 — Contracts and product foundation**.

The Phase 0 contract set has been drafted under `docs/`. The repository is still pre-production and implementation has not yet entered Phase 1. Phase 0 is complete only when the documented exit gate in `docs/08-mvp-roadmap.md` is satisfied.

## MVP objective

Deliver a dependable publication website and administrative control plane that continuously collects recent headlines from a whitelist of approved sources, suppresses true duplicates, and sends readers to the original article.

The MVP must prove both:

1. The initial indie-author publication is useful as a rolling industry-news feed.
2. A second unrelated topic can be configured without changing aggregation-engine business logic.

## Public feed

The customer's core desktop concept is intentionally simple:

```text
Date | Headline | Source
```

The MVP contract expands that baseline with:

- reverse-chronological visible primary articles;
- headline links to the original/canonical public destination;
- clear source identity;
- responsive desktop and mobile layouts;
- category and source filtering;
- basic keyword search;
- deterministic pagination or load-more behavior;
- light and dark presentation support;
- accessible external-link behavior.

Mobile should use a compact stacked item rather than compressing the desktop table.

## Locked project laws

`docs/00-project-contract.md` defines ten foundational laws that apply to every phase:

1. The aggregation engine must never contain indie-author-specific business logic.
2. Every collected article must originate from an administrator-approved source.
3. RSS or other structured feeds are preferred over HTML scraping.
4. The original article URL remains the primary public destination.
5. All source-specific data must be normalized before reaching the public feed.
6. Repeated collection must be idempotent and must not create duplicate article records.
7. True duplicates are hidden behind one primary record, but all source instances remain stored.
8. Categories, relevance rules, branding, and sources belong to publication configuration.
9. A failing source must not interrupt collection from other sources.
10. Near-real-time means configurable polling unless a source explicitly supports push delivery.

These are product laws, not implementation suggestions.

## Canonical terminology

The domain model is defined in `docs/02-domain-and-data-contract.md`.

Core concepts include:

- **Publication** — configured news product and boundary for topic-specific behavior.
- **Source** — administrator-approved publisher/outlet.
- **Source endpoint** — specific feed, API URL, or HTML listing belonging to a source.
- **Collection run** — one attempt to collect one source endpoint.
- **Raw item** — minimally interpreted parser output.
- **Article candidate** — normalized but not yet accepted record.
- **Article** — persisted normalized source instance.
- **Primary article** — article selected to represent a true duplicate group publicly.
- **Duplicate group** — true duplicate article instances with one primary; all members remain stored.
- **Related coverage** — separate reporting about the same subject/event; not a true duplicate.
- **Category / Relevance rule** — publication-owned editorial configuration.

## System architecture

The baseline architecture in `docs/03-system-architecture.md` keeps publication-specific configuration at the edges while shared engine modules remain reusable.

```text
Admin UI / Public Feed
        ↓
Web/API process
        ↓
PostgreSQL + durable jobs
        ↓
Worker process
        ↓
Fetcher
        ↓
Approved source endpoint
        ↓
Parser adapter
        ↓
Normalizer
        ↓
Relevance evaluator
        ↓
Identity + deduplication
        ↓
Persisted normalized articles / duplicate groups
```

The Web/API and Worker roles must be independently runnable so a slow or failed source request cannot block normal public-feed requests.

The initial technical baseline is Node.js + TypeScript, an Express-compatible HTTP structure, PostgreSQL, a durable scheduler/job mechanism, and a server-rendered or lightweight client-rendered web UI unless superseded by an ADR.

## Collection strategy

Collection is whitelist-first and structured-feed-first.

Preferred source order:

1. RSS or Atom.
2. Stable structured API or JSON feed.
3. Configurable HTML listing extraction.
4. Custom adapter.
5. Browser automation only when ordinary HTTP cannot reliably collect an approved source.

Source-specific adapters stay behind parser/fetcher boundaries. Parsers produce raw items and never write directly to article tables. Normalization and URL safety checks happen before relevance, identity, deduplication, or public-feed logic.

Polling is endpoint-specific. Near-real-time behavior is configurable polling for ordinary sources; supported push sources may enter the same normalized pipeline through a separate ingress adapter later.

## Identity and duplicate strategy

The system treats two questions separately:

- **Article identity:** have we already stored this source instance?
- **Duplicate identity:** does this separately stored source instance represent the same underlying published item as another article?

Repeated polling must converge on the same logical article identity. True duplicate article instances may be grouped behind one primary article, but every stored member and its provenance remain available to administrators.

Related coverage stays separate. Weak similarity should not silently hide distinct reporting.

## Administration

The MVP administrative control plane is responsible for:

- publication identity and branding;
- approved sources and endpoints;
- collection frequency and endpoint state;
- categories and relevance rules;
- source health and collection history;
- article visibility, corrections, pinning, and categorization;
- duplicate merge/split/primary corrections;
- auditability of configuration and moderation changes.

Public readers do not need accounts in the MVP. Admin routes require authentication and publication-aware authorization boundaries.

## Security and reliability

Configured external fetching and administrator access are high-risk surfaces and are covered from the beginning, not deferred to launch polish.

The contracts require, where applicable:

- SSRF-resistant URL/redirect validation;
- timeouts and response/decompression limits;
- untrusted-content sanitization and output escaping;
- authenticated admin operations with session/CSRF protections;
- secret-safe structured logging;
- independent endpoint jobs and bounded retries/concurrency;
- source/run observability;
- audit events for administrative changes;
- recoverable, idempotent collection behavior.

See `docs/07-security-reliability-and-operations.md`.

## Documentation map

Start with `BOOT.md` for repository-aware session routing. The Phase 0 source-of-truth set is:

```text
docs/README.md
docs/00-project-contract.md
docs/01-mvp-scope-and-users.md
docs/02-domain-and-data-contract.md
docs/03-system-architecture.md
docs/04-source-and-collection-contract.md
docs/05-article-lifecycle-and-deduplication.md
docs/06-public-feed-and-admin-contract.md
docs/07-security-reliability-and-operations.md
docs/08-mvp-roadmap.md
docs/decisions/
```

`AGENTS.md` summarizes project-wide implementation law. Detailed behavior belongs in the contracts above rather than being duplicated in root files.

## Repository workflow

Repository-aware work follows the same gated workflow used in the GrubHub Map project.

Documentation review:

```text
/docs-review
→ explicit approval
→ /docs-apply
```

Implementation prompt workflow:

```text
/prompt-ass
→ /prompt-plan
→ /prompt-write <folder name>
```

`BOOT.md` defines the exact stage requirements, source-of-truth priority, command modifiers, validation expectations, and repository write rules.

## Roadmap

`docs/08-mvp-roadmap.md` defines the implementation sequence:

- Phase 0 — Contracts and product foundation
- Phase 1 — Repository and application foundation
- Phase 2 — Authentication, publication, and source administration
- Phase 3 — RSS/Atom collection vertical slice
- Phase 4 — Article persistence, relevance, and public feed
- Phase 5 — Duplicate detection and moderation
- Phase 6 — Configurable HTML collection
- Phase 7 — Reliability, observability, and production hardening
- Phase 8 — Customer launch validation

Deferred candidates include newsletters, push adapters, AI-assisted summaries, related-story clustering, public accounts, outbound publishing, self-service tenancy, API access, and multilingual feeds. Deferred features must reuse normalized articles and publication boundaries rather than bypassing them.

## Repository

```text
jfin602/news-scraper
```

Default branch: `main`.
