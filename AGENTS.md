# AGENTS.md

## Project Name

News Scraper

## Project Goal

Build a reusable, topic-independent news aggregation platform that collects article metadata only from administrator-approved sources, normalizes source-specific input, persists articles idempotently, suppresses true duplicates without destroying provenance, and serves publication-specific rolling news feeds whose headlines link to the original publishers.

The first configured publication is publishing-industry news relevant to indie authors. That is publication configuration, not aggregation-engine identity.

## Documentation Workflow

Follow the repository workflow in `BOOT.md`.

- `/docs-review` is always a read-only first pass.
- Do not modify documentation during a review, cleanup, alignment, or correction request until the user approves the findings or invokes `/docs-apply`.
- During `/docs-apply`, preserve unrelated wording and limit edits to the approved findings.
- Documentation-only changes may be committed directly to `main` unless the user asks for a branch or pull request.
- Prompt creation follows the enforced `/prompt-ass` → `/prompt-plan` → `/prompt-write <folder name>` workflow in `BOOT.md`.

## Core Contracts

Use `BOOT.md` as the document router. Read the narrowest current contract for the behavior being changed rather than relying on duplicated summaries.

Primary source-of-truth documents are:

```text
docs/00-project-contract.md
docs/01-mvp-scope-and-users.md
docs/02-domain-and-data-contract.md
docs/03-system-architecture.md
docs/04-source-and-collection-contract.md
docs/05-article-lifecycle-and-deduplication.md
docs/06-public-feed-and-admin-contract.md
docs/07-security-reliability-and-operations.md
docs/08-mvp-roadmap.md
docs/decisions/0001-topic-independent-publication-model.md
docs/decisions/0002-whitelist-and-structured-feed-first.md
docs/decisions/0003-original-link-and-normalized-metadata.md
```

`docs/README.md` indexes the Phase 0 documentation set and its normative language.

If a task conflicts with a locked law in `docs/00-project-contract.md`, stop and identify the conflict. Do not silently weaken the law, invent a compatibility bridge, or treat existing code as higher authority.

## Project Laws

The ten locked laws in `docs/00-project-contract.md` govern every phase:

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

Ordinary implementation work must not weaken these laws indirectly.

## Canonical Domain Law

Use the terminology in `docs/02-domain-and-data-contract.md`.

High-risk distinctions:

- `Publication` is the boundary for topic-specific behavior.
- `Source` is an administrator-approved publisher/outlet and owns one or more endpoints.
- `Source endpoint` is the actual feed/API/HTML listing location and owns polling state, parser configuration, HTTP cache metadata, health, and collection runs.
- `Collection run` is one attempt to collect one endpoint.
- `Raw item` is parser output and must not write directly to article tables.
- `Article candidate` is normalized but not yet accepted.
- `Article` is a persisted normalized source instance.
- `Primary article` is the article selected to represent a true duplicate group in the public feed.
- `Duplicate group` contains true duplicate article instances; one member is primary and all members remain stored.
- `Related coverage` is not a true duplicate and remains separately visible.
- `Category` and `Relevance rule` are publication-owned configuration.

Do not create alternate terminology for these concepts without a contract change.

## Collection Law

Collection behavior is governed by `docs/04-source-and-collection-contract.md` and `docs/07-security-reliability-and-operations.md`.

High-risk invariants:

- Only approved and enabled sources/endpoints belonging to an active publication may be contacted.
- The collector must not silently expand the whitelist from discovered links or public submissions.
- Fetch and redirect destinations must preserve approved-domain and network-safety/SSRF boundaries.
- Source preference is structured-first: RSS/Atom, then stable structured API/JSON feed, then configurable HTML extraction, then custom adapter, with browser automation only as a justified fallback.
- Parsers produce raw items; they do not persist articles directly.
- Normalization occurs before relevance, identity, deduplication, or public-feed behavior.
- Relevance evaluation is publication configuration and must be explainable.
- Reprocessing the same item must converge on the same logical article identity.
- Endpoint jobs and retries are isolated so one failing source cannot monopolize or abort unrelated work.
- Public-feed reads must remain available during collection failures.

## Article and Deduplication Law

Article lifecycle and duplicate behavior are governed by `docs/05-article-lifecycle-and-deduplication.md`.

High-risk invariants:

- Article identity and duplicate identity are different questions.
- Repeated polling of the same source item is identity resolution, not a new duplicate-group member.
- Fuzzy-title similarity alone must not overwrite an existing article.
- Weak duplicate evidence should become a review candidate rather than silently suppressing a possibly distinct article.
- A duplicate group has exactly one primary article.
- Changing the primary does not delete or rewrite group membership.
- Manual merge/split/primary decisions are auditable and override automatic grouping until intentionally revised.
- When uncertain, preserving two visible articles is preferable to hiding distinct reporting.

## Public Feed and Admin Law

The public/admin experience is governed by `docs/06-public-feed-and-admin-contract.md`.

Public MVP invariants:

- Reverse-chronological rolling feed of visible primary articles.
- Desktop supports the core `Date | Headline | Source` presentation.
- Mobile uses an accessible stacked presentation rather than forcing a compressed desktop table.
- The headline links to the stored original/canonical public destination.
- Category filter, source filter, keyword search, deterministic pagination/load-more, light mode, and dark mode are MVP requirements.
- Branding and topic-specific labels come from publication configuration.
- The platform must not imply authorship of linked source articles.

Admin MVP invariants include authenticated publication/source management, source health and run history, article moderation, category/relevance controls, duplicate correction, and auditability.

## Architecture Law

Use `docs/03-system-architecture.md` for process and module boundaries.

High-risk invariants:

- The Web/API process and Worker process must be independently runnable roles.
- Slow or failed collection work must not block normal public-feed requests.
- Source-specific adapters remain behind fetcher/parser interfaces.
- Public-feed code consumes normalized article read models only.
- Admin controllers request/enqueue collection work; they do not perform collection inline.
- Deduplication must not depend on publication-specific keywords.
- Publication-specific relevance and categorization enter through configuration interfaces.
- Critical uniqueness guarantees should use database constraints/transactions rather than application-only assumptions.

## Security and Operations Law

Security and reliability requirements in `docs/07-security-reliability-and-operations.md` are first-class implementation constraints.

Do not postpone the following as optional polish when the affected surface is implemented:

- admin authentication/authorization boundaries;
- CSRF/session protections for browser administration;
- SSRF and redirect validation for configured source URLs;
- bounded response/decompression sizes and timeouts;
- untrusted-content sanitization/escaping;
- secret-safe structured logging;
- failure isolation and bounded concurrency;
- run/source observability;
- audit events for administrative changes.

## Roadmap Law

Use `docs/08-mvp-roadmap.md` as the current implementation sequence.

Current phase: **Phase 0 — Contracts and product foundation**.

Do not claim Phase 0 complete until its documented exit gate is satisfied: no unresolved contradictions among Phase 0 documents, implementation tasks can cite measurable contracts, and topic-specific behavior is explicitly located in publication configuration.

Future phases are ordered Phase 1 through Phase 8. Do not pull later-phase behavior into an earlier task merely because it is nearby unless the user explicitly changes the roadmap or a dependency requires it.

## Working Preferences

- Inspect current source and documentation before drafting implementation prompts.
- Prefer file-scoped, regression-safe Codex prompts.
- State exact files that may be modified whenever scope is knowable.
- Include non-goals and behavior that must remain unchanged.
- Require focused tests plus the relevant broader regression suite.
- Do not claim completion based only on code inspection when runtime or browser validation is required.
- Separate confirmed facts, inferred behavior, recommendations, and unresolved questions.
- Favor incremental tasks that can be reviewed independently.
- Prefer the smallest correct change over speculative architecture work.
- Trace shared helpers and data semantics across all consumers before changing them.
- When recommending sequencing, choose a single best next task unless alternatives are materially different.
- When the user says `recommended`, make a concrete choice using current contracts and architecture.
- Do not invent repository state, file contents, source behavior, test results, browser results, or commit history.

## No Compatibility Bridge Rule

The project is pre-production. Use canonical names and architecture only. Do not add old/new aliases, duplicate synchronized fields, fallback compatibility paths, or speculative migration bridges unless a current task explicitly requires a one-time migration path.

## Repository Identity

When the user says `the repo` or `the source code` in this project, interpret it as:

```text
jfin602/news-scraper
```
