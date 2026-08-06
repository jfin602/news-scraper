# Project Contract

**Status:** Locked baseline  
**Platform:** Reusable News Aggregation Platform  
**Repository:** `jfin602/news-scraper`  
**Initial publication:** Indie-author publishing industry news  
**Established:** 2026-08-06

## Product definition

The system is a reusable, topic-independent news aggregation platform. It collects article metadata from administrator-approved sources, normalizes that metadata, persists source instances idempotently, suppresses true duplicates without destroying provenance, and presents a rolling public feed whose headlines send readers to original publishers.

The indie-author publication is the first configuration of the platform, not the identity of the aggregation engine.

## Locked project laws

1. **The aggregation engine must never contain indie-author-specific business logic.**
2. **Every collected article must originate from an administrator-approved source.**
3. **RSS or other structured feeds are preferred over HTML scraping.**
4. **The original article URL remains the primary public destination.**
5. **All source-specific data must be normalized before reaching the public feed.**
6. **Repeated collection must be idempotent and must not create duplicate article records.**
7. **True duplicates are hidden behind one primary record, but all source instances remain stored.**
8. **Categories, relevance rules, branding, and sources belong to publication configuration.**
9. **A failing source must not interrupt collection from other sources.**
10. **Near-real-time means configurable polling unless a source explicitly supports push delivery.**

## Derived invariants

- Collector code operates on generic publications, sources, endpoints, candidates, articles, observations, and duplicate groups.
- A source or endpoint cannot be collected while unapproved or operationally disabled.
- Approval/trust state is distinct from operational collection state and from derived health.
- Public records are created only from normalized data.
- Fetching the same unchanged source repeatedly produces no additional logical Article.
- Article identity and true-duplicate grouping are separate concerns.
- Source failures are isolated by Source endpoint and Collection run.
- Duplicate suppression never destroys Article instances or provenance.
- Publication-specific settings are data, not topic conditionals in shared engine code.
- The system does not claim literal real-time delivery for polling-only sources.
- Network-safety validation occurs before each outbound request/redirect; article-link validation occurs after parsing/normalization before acceptance.

## Authority order

When repository sources conflict, use this order:

1. Locked project laws in this document.
2. Explicit invariants in this document.
3. Domain and lifecycle contracts.
4. Architecture, interface, security/operations contracts, and Accepted ADRs.
5. Current roadmap and implementation notes.
6. Root `AGENTS.md`, `README.md`, and `BOOT.md` summaries/routing.
7. Existing implementation.
8. Historical task prompts.
9. Comments, commit messages, and stale planning notes.

A current user instruction controls the requested task scope. If it proposes changing a locked law, treat it as a contract-change request rather than allowing lower-authority work to override this document silently.

Existing code does not become authoritative merely because it is already implemented.

## Contract change process

A locked law may change only through an explicit project decision that:

- identifies the exact law being amended;
- explains the product reason;
- documents compatibility and migration effects;
- updates every affected contract;
- adds or supersedes an ADR when a foundational architectural decision changes;
- is intentionally accepted by the repository owner.

Ordinary implementation work must not weaken a law indirectly.

## Product boundaries

### The platform is

- a controlled-source headline and article-metadata aggregator;
- a reusable shell for multiple subject areas;
- a public discovery feed backed by an administrative control plane;
- a collection system with observable endpoint health and duplicate handling.

### The platform is not

- an unrestricted web crawler;
- a full-content republishing system;
- an open-web search engine;
- a social network or commenting platform;
- an automated plagiarism/copyright-ownership judge;
- a guarantee that every source update is delivered instantly.

## Phase 0 acceptance criteria

Phase 0 is accepted when:

- all foundational laws are represented in repository documentation;
- terminology is topic-independent and internally consistent;
- MVP scope and exclusions are explicit;
- publication, source, endpoint, article, observation, and duplicate ownership boundaries are defined;
- collection and article lifecycles are defined without contradictory state models;
- public-feed eligibility and admin requirements are explicit;
- security, reliability, and observability baselines are defined;
- implementation phases have measurable, internally consistent completion gates.
