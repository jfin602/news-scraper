# News Scraper

Reusable, topic-independent news aggregation Platform for collecting Article metadata from administrator-approved Sources, normalizing it, preserving Source/run provenance, suppressing true duplicates, and publishing rolling headline feeds that send readers to original publishers.

The first configured Publication focuses on publishing-industry news relevant to indie authors. That topic is configuration, not shared Platform logic.

## Current project state

Current phase: **Phase 1 — Application foundation**.

Phase 0 is complete. The final pre-code documentation review aligned the contracts around the demo-first delivery strategy, Cloudflare Access admin perimeter, staged Worker collection path, Collection-run provenance, default-include Relevance bridge, bootstrap approval rules, focused Phase 0–20 roadmap, and project-wide testing/regression policy.

Phase 1 implementation is in progress.

## Delivery priority

Phases 1–9 are the tech-demo critical path.

The first demonstrable milestone is reached when at least two real approved RSS/Atom Sources are collected through the Worker, recorded in Collection runs, normalized, passed through the canonical default-include Relevance boundary, persisted idempotently with Article-observation provenance, and displayed in the public rolling feed with headlines linking to the original publishers.

Full admin UX follows after that vertical slice is working.

## MVP objective

Prove both:

1. The initial indie-author Publication is useful as a rolling industry-news feed.
2. A second unrelated topic can be configured without changing aggregation-engine business logic.

## Public feed

Core desktop concept:

```text
Date | Headline | Source
```

Completed MVP adds:

- reverse-chronological eligibility for visible ungrouped Articles and visible Primary Articles;
- original/canonical Article destination links;
- clear Source identity;
- accessible stacked mobile layout;
- Category/Source filtering and keyword search;
- deterministic pagination/load-more;
- light/dark presentation.

The Phase 9 tech demo intentionally reaches a useful basic feed before discovery/presentation polish is complete.

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
8. Categories, Relevance rules, branding, and Sources belong to Publication configuration.
9. Source failures are isolated.
10. Near-real-time means configurable polling unless a Source explicitly supports push; push adapters are deferred beyond MVP unless promoted.

## Canonical state model

The contracts deliberately separate:

- approval/trust state;
- configuration lifecycle state;
- operational collection state;
- Publication public visibility;
- Article moderation visibility;
- duplicate-group role;
- derived endpoint health.

An approved Source can therefore be paused without becoming “unhealthy,” and a hidden Article can remain a member of a Duplicate group without duplicate membership forcing it visible again.

## Collection architecture

```text
Cloudflare Access-protected Admin UI/API       Public Feed
                    \                           /
                     -------- Web/API ----------
                              |
                          PostgreSQL
                              |
            durable jobs/scheduler (Phase 10+)
                              |
                           Worker
                              |
       eligibility + run lock + network safety
                              |
             Fetcher -> approved endpoint
                              |
                  Parser -> Raw item
                              |
            Normalizer -> Article candidate
                              |
             Article-link policy validation
                              |
            Publication Relevance/Categories
                              |
             Article identity + persistence
                              |
               Article observation provenance
                              |
          duplicate review/grouping when built
                              |
             public-feed read model -> publisher
```

During Phases 5–9 the Worker is invoked manually for configured endpoints. Phase 10 places the same proven endpoint execution unit behind durable jobs/scheduling; Web/API never performs Source collection inline.

Minimal Collection runs begin with the first real fetch in Phase 5. Before configurable Relevance rules exist, safe candidates pass through the canonical empty-rule/default-include decision before identity.

## Identity versus duplicates

- **Article identity:** have we already stored this Source instance? Solved transactionally in Phase 7 using reliable Source external IDs, canonical URLs, and constrained fallback evidence.
- **True duplicate identity:** do two separately stored Articles represent the same underlying published item? Added in Phase 16.

Weak duplicate evidence becomes a persisted review candidate rather than silently hiding an Article.

## Administration

Initial Publication/Source configuration may be supplied through idempotent operator-maintained bootstrap data. Bootstrap approval is explicit operator approval and never bypasses whitelist/state/network-safety rules.

MVP Source admin UI begins in Phase 14, after the working public vertical slice.

MVP admin UI/API routes:

- are protected by Cloudflare Access;
- require supported deployment/origin configuration that prevents direct-origin bypass;
- use CSRF or equivalent request-integrity controls for state-changing browser actions;
- validate Publication/resource ownership in application commands.

Native application-managed administrator accounts, sessions, roles, account recovery, per-user Publication authorization, and identity-linked audit attribution are deferred beyond MVP.

## Testing and regression policy

`docs/contracts/testing-and-validation-contract.md` is the project-wide testing authority.

Core rules:

- automated behavioral regression coverage is the primary defense against regressions;
- every implementation change requires focused tests plus relevant broader regression coverage for its blast radius;
- validation evidence applies to the exact final source tree tested;
- source inspection is not runtime proof and browser/database/live-Source claims require the corresponding evidence level;
- persistence guarantees use real disposable PostgreSQL where practical from Phase 2 onward;
- ordinary deterministic local regression validation does not depend on live public publishers;
- collection behavior is tested with controlled fixtures/servers without weakening production whitelist/SSRF policy;
- explicitly invoked required suites fail clearly when prerequisites are missing and cannot silently skip green;
- flaky/skipped tests do not satisfy phase exit gates;
- implementation-roadmap phase closeout uses executed local terminal evidence and a durable `docs/validation/` record tied to the exact accepted commit/source tree.

Every implementation roadmap phase inherits that contract even when its phase entry does not repeat the complete test matrix.

## Security and reliability

Baseline controls are implemented with the surfaces they protect, not postponed to production hardening:

- SSRF-resistant validation before every request/redirect;
- response/decompression limits and timeouts;
- untrusted-content sanitization/escaping;
- Source/endpoint run isolation;
- transactionally idempotent Article identity;
- secret-safe structured logs and truthful Collection-run telemetry;
- Cloudflare Access/origin/request-integrity controls when admin surfaces arrive;
- focused and regression testing for contract-critical security/reliability behavior as each capability is introduced.

Phase 19 hardens/operationalizes these controls with dashboards, alerts, restore testing, abuse regression tests, retention jobs, deployment/rollback validation, and runbooks.

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
│   ├── public-feed-and-admin-contract.md
│   └── testing-and-validation-contract.md
├── architecture/
│   └── system-architecture.md
├── operations/
│   └── security-reliability-and-operations.md
├── roadmap/
│   └── mvp-roadmap.md
└── decisions/
    ├── topic-independent-publication-model.md
    ├── whitelist-and-structured-feed-first.md
    ├── original-link-and-normalized-metadata.md
    └── cloudflare-access-admin-perimeter.md
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

See `docs/roadmap/mvp-roadmap.md` for full deliverables/dependencies/non-goals/exit gates.

Tech-demo critical path:

1. Phase 1 — Application foundation
2. Phase 2 — Database foundation
3. Phase 3 — Publication and Source configuration core
4. Phase 4 — Collection eligibility and network safety
5. Phase 5 — RSS/Atom transport, parsing, and minimal Collection runs
6. Phase 6 — Article normalization
7. Phase 7 — Default Relevance, Article identity, and persistence
8. Phase 8 — Basic public-feed backend
9. Phase 9 — Basic public-feed UI and tech demo

Then:

10. Phase 10 — Automated polling, durable jobs, and endpoint health
11. Phase 11 — Categories and configurable Relevance execution
12. Phase 12 — Feed discovery features
13. Phase 13 — Public presentation polish
14. Phase 14 — Source administration
15. Phase 15 — Publication and Relevance administration
16. Phase 16 — True duplicate detection and grouping
17. Phase 17 — Article and duplicate moderation
18. Phase 18 — Configurable HTML collection
19. Phase 19 — Reliability, observability, and production operations
20. Phase 20 — Customer launch validation

Deferred: native administrator identity/accounts, historical Relevance bulk reprocessing, push/webhook adapters, AI summaries, related-story clustering, public personalization, outbound publishing, self-service tenancy, generic ranking/boost scoring, pinning/featured ordering, API access, multilingual feeds.

## Repository

`jfin602/news-scraper` — default branch `main`.
