# Project Contract

**Status:** Locked baseline  
**Platform:** Reusable News Aggregation Platform  
**Repository:** `jfin602/news-scraper`  
**Initial Publication:** Indie-author publishing industry news  
**Established:** 2026-08-06

## Product definition

The system is a reusable, topic-independent news aggregation Platform. It collects Article metadata from administrator-approved Sources, normalizes that metadata, persists Source instances idempotently, suppresses true duplicates without destroying provenance, and presents a rolling public feed whose headlines send readers to original publishers.

The indie-author Publication is the first configuration of the Platform, not the identity of the aggregation engine. Reuse occurs by configuring and deploying another installation of the same codebase for another topic; one deployed installation does not concurrently host multiple topic Publications.

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
11. **Each deployed installation hosts exactly one Publication/topic. Topic independence means the same shared codebase can be configured and deployed for different topics without topic-specific engine changes; it does not mean one installation concurrently hosts multiple Publications. The root public route `/` is the canonical public feed surface for that installation.**

## Derived invariants

- Collector code operates on generic Sources, endpoints, candidates, Articles, observations, Duplicate groups, and singleton Publication configuration.
- A deployed installation has one Publication configuration as its application-level editorial/topic boundary; public readers and ordinary runtime flows do not select a Publication.
- Publication is not a tenancy or relational ownership key. Publication UUIDs, slugs, foreign keys, joins, uniqueness scopes, API parameters, or compatibility paths MUST NOT be retained solely for hypothetical concurrent multi-Publication hosting.
- The singleton Publication configuration owns installation-wide editorial settings such as name, collection/public state, branding, Categories, Relevance rules, Sources, Source priority, and presentation settings without requiring those resources to carry a Publication foreign key.
- Real domain relationships remain explicit: a Source owns endpoints and Articles; an endpoint owns Collection runs; observations preserve the endpoint/run and Article/Source provenance needed for integrity.
- A Source or endpoint cannot be collected while unapproved, archived, paused, or disabled, and global collection is disabled when the singleton Publication configuration is not active for collection.
- Approval/trust, configuration lifecycle, operational state, public visibility, moderation, duplicate role, and derived health are distinct concepts.
- Public records are created only from normalized data.
- Fetching the same unchanged Source repeatedly produces no additional logical Article.
- Article identity and true-duplicate grouping are separate concerns.
- Source failures are isolated by Source endpoint and Collection run.
- Duplicate suppression never destroys Article instances or provenance.
- Topic-specific settings are data/configuration, not topic conditionals in shared engine code.
- Polling-only Sources are not described as literally real-time.
- Network-safety validation occurs before each outbound request/redirect; Article-link validation occurs after parsing/normalization before acceptance.
- Before production database compatibility is established, pre-production architecture favors the smallest canonical model for supported behavior. Migration files, source files, APIs, types, tests, fixtures, configuration paths, and compatibility layers that exist only to support superseded pre-production architecture MUST be removed rather than retained for historical compatibility or speculative future use. Git history, superseded ADRs, historical task prompts, and validation artifacts preserve that history.
- Before production database compatibility is established, the supported persistence setup is a fresh database built from the repository's current migration chain and bootstrap/configuration data. In-place preservation of data created by older pre-production source trees is not a product requirement.

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
- a reusable shell for different subject areas through separate configured deployments;
- a single-Publication public discovery feed backed by an administrative control plane per deployment;
- a collection system with observable endpoint health and duplicate handling.

### The Platform is not

- a multi-topic/multi-Publication host within one deployed installation;
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
- singleton Publication configuration plus Source, endpoint, Article, observation, and duplicate relationship boundaries are defined;
- collection and Article lifecycles have no contradictory state models;
- public-feed eligibility and admin requirements are explicit;
- security, reliability, and observability baselines are defined;
- implementation phases have measurable, internally consistent completion gates.
