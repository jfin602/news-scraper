# Project Contract

**Status:** Locked baseline  
**Platform:** Reusable News Aggregation Platform  
**Repository:** `jfin602/news-scraper`  
**Initial Publication:** Indie-author publishing industry news  
**Established:** 2026-08-06

## Product definition

The system is a reusable, topic-independent news aggregation Platform. It collects Article metadata from administrator-approved Sources, normalizes that metadata, persists Source instances idempotently, suppresses true duplicates without destroying provenance, and presents a rolling public feed whose headlines send readers to original publishers.

The indie-author Publication is the first configuration of the Platform, not the identity of the aggregation engine.

## Locked project laws

1. **The aggregation engine must never contain indie-author-specific business logic.**
2. **Every collected Article must originate from an administrator-approved Source.**
3. **RSS or other structured feeds are preferred over HTML scraping.**
4. **The original Article URL remains the primary public destination.**
5. **All Source-specific data must be normalized before reaching the public feed.**
6. **Repeated collection must be idempotent and must not create duplicate Article records.**
7. **True duplicates are hidden behind one Primary Article, but all Source instances remain stored.**
8. **Categories, Relevance rules, branding, and Sources belong to Publication configuration.**
9. **A failing Source must not interrupt collection from other Sources.**
10. **Near-real-time means configurable polling unless a Source explicitly supports push delivery.**

## Derived invariants

- Collector code operates on generic Publications, Sources, endpoints, candidates, Articles, observations, and Duplicate groups.
- A Source or endpoint cannot be collected while unapproved, archived, paused, or disabled.
- Approval/trust, configuration lifecycle, operational state, public visibility, moderation, duplicate role, and derived health are distinct concepts.
- Public records are created only from normalized data.
- Fetching the same unchanged Source repeatedly produces no additional logical Article.
- Article identity and true-duplicate grouping are separate concerns.
- Source failures are isolated by Source endpoint and Collection run.
- Duplicate suppression never destroys Article instances or provenance.
- Publication-specific settings are data, not topic conditionals in shared engine code.
- Polling-only Sources are not described as literally real-time.
- Network-safety validation occurs before each outbound request/redirect; Article-link validation occurs after parsing/normalization before acceptance.

## Authority order

When repository sources conflict:

1. Locked project laws in this document.
2. Explicit invariants in this document.
3. Domain and lifecycle contracts.
4. Architecture, interface, security/operations contracts, and Accepted ADRs.
5. Current roadmap and implementation notes.
6. Root `AGENTS.md`, `README.md`, and `BOOT.md` summaries/routing.
7. Existing implementation.
8. Historical task prompts.
9. Comments, commit messages, and stale planning notes.

A current user instruction controls requested task scope. If it proposes changing a locked law, treat it as a contract-change request rather than allowing lower-authority work to override this document silently.

Existing code does not become authoritative merely because it already exists.

## Contract change process

A locked law may change only through an explicit project decision that:

- identifies the exact law being amended;
- explains the product reason;
- documents compatibility/migration effects;
- updates every affected contract;
- adds or supersedes an ADR when a foundational architectural decision changes;
- is intentionally accepted by the repository owner.

Ordinary implementation work must not weaken a law indirectly.

## Product boundaries

### The Platform is

- a controlled-Source headline and Article-metadata aggregator;
- a reusable shell for multiple subject areas;
- a public discovery feed backed by an administrative control plane;
- a collection system with observable endpoint health and duplicate handling.

### The Platform is not

- an unrestricted web crawler;
- a full-content republishing system;
- an open-web search engine;
- a social network/commenting Platform;
- an automated plagiarism/copyright-ownership judge;
- a guarantee that every Source update is delivered instantly.

## Phase 0 acceptance criteria

Phase 0 is accepted when:

- foundational laws are represented consistently in repository docs;
- terminology is topic-independent and internally consistent;
- MVP scope/exclusions are explicit;
- Publication, Source, endpoint, Article, observation, and duplicate ownership boundaries are defined;
- collection and Article lifecycles have no contradictory state models;
- public-feed eligibility and admin requirements are explicit;
- security, reliability, and observability baselines are defined;
- implementation phases have measurable, internally consistent completion gates.
