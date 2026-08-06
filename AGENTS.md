# AGENTS.md

## Project Name

News Scraper

## Project Goal

Build a reusable, topic-independent news aggregation Platform that collects article metadata only from administrator-approved Sources, normalizes Source-specific input, persists Articles idempotently with endpoint/run provenance, suppresses true duplicates without destroying Source instances, and serves Publication-specific rolling feeds whose headlines link to original publishers.

The first configured Publication is publishing-industry news relevant to indie authors. That is Publication configuration, not aggregation-engine identity.

## Documentation Workflow

Follow `BOOT.md`.

- `/docs-review` is always a read-only first pass.
- Do not modify documentation during review/cleanup/alignment until findings are approved or `/docs-apply` is invoked.
- `/docs-apply` authorizes only the approved documentation changes. Under this project workflow those documentation-only edits may be committed directly to `main` unless the user requests a branch/PR.
- Preserve unrelated wording during scoped documentation fixes.
- Prompt creation follows `/prompt-ass` → `/prompt-plan` → `/prompt-write <folder name>`.

## Canonical documents

Use `BOOT.md` as router and read the narrowest governing document.

```text
docs/contracts/project-contract.md
docs/contracts/mvp-scope-and-users.md
docs/contracts/domain-and-data-contract.md
docs/contracts/source-and-collection-contract.md
docs/contracts/article-lifecycle-and-deduplication.md
docs/contracts/public-feed-and-admin-contract.md
docs/architecture/system-architecture.md
docs/operations/security-reliability-and-operations.md
docs/roadmap/mvp-roadmap.md
docs/decisions/topic-independent-publication-model.md
docs/decisions/whitelist-and-structured-feed-first.md
docs/decisions/original-link-and-normalized-metadata.md
```

`docs/README.md` indexes the structure and normative language.

If a task conflicts with a locked law in `docs/contracts/project-contract.md`, identify the conflict. Do not silently weaken the law, invent compatibility bridges, or treat existing code as higher authority.

## Locked project laws

1. The aggregation engine must never contain indie-author-specific business logic.
2. Every collected Article must originate from an administrator-approved Source.
3. RSS or other structured feeds are preferred over HTML scraping.
4. The original Article URL remains the primary public destination.
5. Source-specific data is normalized before public-feed use.
6. Repeated collection is idempotent and does not create duplicate Article records for one Source identity.
7. True duplicates are hidden behind one Primary Article while all Source instances/provenance remain stored.
8. Categories, relevance rules, branding, and Sources belong to Publication configuration.
9. A failing Source must not interrupt unrelated collection.
10. Near-real-time means configurable polling unless a Source explicitly supports push delivery; push adapters are deferred beyond MVP unless promoted explicitly.

## Canonical domain law

Use terminology from `docs/contracts/domain-and-data-contract.md`.

High-risk distinctions:

- Publication is the topic-specific configuration boundary.
- Source is a configured publisher/outlet whose approval state determines trust; Source endpoint is the concrete feed/API/HTML location.
- Approval/trust state, configuration lifecycle, operational state, public visibility, moderation state, duplicate role, and derived health are separate.
- Active configuration may be enabled/paused/disabled; archived configuration is retired and not collectable.
- Collection run is one endpoint attempt.
- Raw item is parser output; Article candidate is normalized but not yet accepted.
- Article is a persisted normalized Source instance.
- Article observation preserves endpoint/run provenance without increasing Article cardinality.
- Article identity and true-duplicate identity are separate questions.
- Duplicate review candidate persists uncertain/dismissed duplicate decisions.
- Duplicate group contains separately stored true-duplicate Articles with exactly one Primary.
- Article visibility (`visible/hidden/archived`) is separate from duplicate role (`ungrouped/primary/non_primary`).
- Ordinary feed eligibility is visible + (`ungrouped` or `primary`).

## Collection law

Governed by `docs/contracts/source-and-collection-contract.md`, `docs/architecture/system-architecture.md`, and `docs/operations/security-reliability-and-operations.md`.

- Only collection-active Publications with approved, active, operationally enabled Sources/endpoints are collectable.
- Pre-fetch and every redirect hop pass approval + DNS/address/port/SSRF validation before network contact.
- Parsed Article links pass a separate post-normalization Source/domain policy gate.
- Source approved domains are the maximum boundary; endpoint policy may narrow, not silently widen.
- Structured-first order: RSS/Atom → stable API/feed → HTML extraction → custom adapter → browser fallback.
- Adapter interfaces are established with RSS/Atom and reused by later Source types.
- Parsers produce Raw items and never persist Articles directly.
- Normalization precedes relevance, identity, duplicate, and feed behavior.
- MVP relevance actions are deterministic include/exclude/categorize with explicit priority/scope tie-breaks; generic boost/ranking is deferred.
- Repeated Source observations converge transactionally on one Article identity.
- Endpoint jobs/retries fail independently and public-feed reads remain available.

## Article and duplicate law

Governed by `docs/contracts/article-lifecycle-and-deduplication.md`.

- Article identity prevents repeated polling from inserting the same Source instance.
- True duplicate grouping applies to separately stored Articles.
- Fuzzy title alone never overwrites an Article.
- Weak duplicate evidence becomes a persisted review candidate.
- Dismissed unchanged review evidence must not recur indefinitely.
- Duplicate group has exactly one Primary.
- Changing Primary does not delete members or erase provenance.
- Hiding/restoring is independent from duplicate membership.
- Related coverage remains separate.
- When uncertain, preserve distinct visible reporting rather than suppress aggressively.

## Public/admin law

Governed by `docs/contracts/public-feed-and-admin-contract.md`.

Public MVP:

- reverse chronological rolling feed;
- desktop `Date | Headline | Source`;
- accessible stacked mobile layout;
- original Article destination;
- Category/Source filters, keyword search, deterministic pagination;
- light/dark modes;
- no MVP pinning/featured ordering.

Admin MVP includes authentication/Publication-aware authorization, Source/endpoint approval/lifecycle/operational management, Source priority, health/run history, Article visibility/display overrides/Categories, duplicate review/group corrections, and auditability.

## Roadmap law

Use `docs/roadmap/mvp-roadmap.md`.

Current phase: **Phase 0 — Contracts and product foundation**.

Do not claim completion until the Phase 0 gate has been evaluated after documentation alignment. Do not pull later-phase/deferred behavior into earlier tasks without an explicit decision or true dependency.

## Working preferences

- Inspect current source/docs before implementation prompts.
- Prefer file-scoped, regression-safe Codex prompts.
- Include non-goals and preserved behavior.
- Require focused + broader regression tests.
- Do not claim runtime/browser behavior unless observed.
- Prefer smallest correct changes over speculative refactors.
- Trace shared helpers/consumers before changing data or collection semantics.
- Make a concrete recommendation when asked for the recommended option.
- Never invent repository state, test results, Source behavior, or history.

## Pre-production compatibility rule

Use one canonical design. Do not add old/new aliases, synchronized duplicate fields, fallback compatibility paths, or speculative migration bridges unless a task explicitly requires a one-time migration.

## Repository identity

`the repo` / `the source code` = `jfin602/news-scraper`.
