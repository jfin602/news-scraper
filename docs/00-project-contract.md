# Phase 0 Project Contract

**Status:** Locked baseline  
**Project:** Reusable News Aggregation Platform  
**Repository:** `jfin602/news-scraper`  
**Initial publication:** Indie-author publishing industry news  
**Established:** 2026-08-06

## 1. Product definition

The system is a reusable, topic-independent news aggregation platform. It collects article metadata from administrator-approved sources, normalizes that metadata, suppresses true duplicates, and presents a rolling public feed whose headlines link to the original publishers.

The indie-author publication is the first configuration of the platform, not the identity of the aggregation engine.

## 2. Locked project laws

The following rules are foundational and apply to every phase:

1. **The aggregation engine must never contain indie-author-specific business logic.**
2. **Every collected article must originate from an administrator-approved source.**
3. **RSS or other structured feeds are preferred over HTML scraping.**
4. **The original article URL remains the primary public destination.**
5. **All source-specific data must be normalized before reaching the public feed.**
6. **Repeated collection must be idempotent and must not create duplicate article records.**
7. **True duplicates are hidden behind one primary record, but all source instances remain stored.**
8. **Categories, relevance rules, branding, and sources belong to a publication configuration.**
9. **A failing source must not interrupt collection from other sources.**
10. **Near-real-time means configurable polling unless a source explicitly supports push delivery.**

## 3. Derived invariants

The laws above imply the following non-negotiable implementation invariants:

- Collector code operates on generic publications, sources, endpoints, candidates, articles, and duplicate groups.
- A source or endpoint cannot be collected while unapproved or disabled.
- Public records are created only from normalized data.
- Fetching the same unchanged source repeatedly produces no additional logical article.
- Source failures are isolated by source endpoint and collection run.
- Duplicate suppression never destroys provenance.
- Publication-specific settings are data, not conditional branches tied to the initial topic.
- The system does not claim literal real-time delivery for polling-only sources.

## 4. Authority order

When documents conflict, use this order:

1. Locked project laws in this document.
2. Explicit invariants in this document.
3. Domain and lifecycle contracts.
4. Architecture and interface contracts.
5. Roadmap and implementation notes.
6. Current code behavior.

Code is not authoritative when it contradicts a higher-level contract.

## 5. Contract change process

A locked law may change only through an explicit project decision that:

- identifies the exact law being amended;
- explains the product reason;
- documents compatibility and migration effects;
- updates every affected contract;
- adds or supersedes an ADR;
- is intentionally accepted by the repository owner.

Ordinary implementation work must not weaken a law indirectly.

## 6. Product boundaries

### The platform is

- a controlled-source headline and article-metadata aggregator;
- a reusable shell for multiple subject areas;
- a public discovery feed backed by an administrative control plane;
- a collection system with observable source health and duplicate handling.

### The platform is not

- an unrestricted web crawler;
- a full-content republishing system;
- a search engine for the open web;
- a social network or commenting platform;
- an automated plagiarism or copyright-ownership judge;
- a guarantee that every source update is delivered instantly.

## 7. Phase 0 acceptance criteria

Phase 0 is accepted when:

- all foundational laws are represented in repository documentation;
- terminology is topic-independent;
- MVP scope and exclusions are explicit;
- publication, source, article, and duplicate ownership boundaries are defined;
- collection and article lifecycles are defined;
- public-feed and admin requirements are defined;
- security, reliability, and observability baselines are defined;
- implementation phases have measurable completion gates.
