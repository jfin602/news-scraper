# News Aggregator Documentation

This directory is the source of truth for the product and engineering contracts of the reusable news aggregation platform in `jfin602/news-scraper`.

The first configured publication is an indie-author publishing news feed, but the platform itself is deliberately topic-independent. Topic vocabulary, sources, relevance rules, categories, and branding belong to publication configuration rather than aggregation-engine code.

## Document order

1. [`00-project-contract.md`](./00-project-contract.md) — immutable product laws and contract-change rules.
2. [`01-mvp-scope-and-users.md`](./01-mvp-scope-and-users.md) — MVP goals, users, capabilities, and exclusions.
3. [`02-domain-and-data-contract.md`](./02-domain-and-data-contract.md) — canonical terminology, ownership boundaries, entities, and invariants.
4. [`03-system-architecture.md`](./03-system-architecture.md) — service boundaries, processing flow, and deployment baseline.
5. [`04-source-and-collection-contract.md`](./04-source-and-collection-contract.md) — source approval, polling, fetching, parsing, normalization, and failure handling.
6. [`05-article-lifecycle-and-deduplication.md`](./05-article-lifecycle-and-deduplication.md) — article states, identity, duplicate groups, and moderation behavior.
7. [`06-public-feed-and-admin-contract.md`](./06-public-feed-and-admin-contract.md) — required public and administrative experiences.
8. [`07-security-reliability-and-operations.md`](./07-security-reliability-and-operations.md) — security boundaries, observability, recovery, and operational requirements.
9. [`08-mvp-roadmap.md`](./08-mvp-roadmap.md) — phased implementation plan and acceptance gates.
10. [`decisions/`](./decisions/) — architecture decision records explaining foundational choices.

## Normative language

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative.

- **MUST / MUST NOT**: required for contract compliance.
- **SHOULD / SHOULD NOT**: expected unless a documented reason justifies a deviation.
- **MAY**: optional.

## Change discipline

- Contract changes must update all affected documents in the same pull request or commit.
- A code change that knowingly violates a locked project law is invalid even if tests pass.
- New source adapters, publication configurations, and categories must not silently redefine platform-wide behavior.
- Architecture decisions that alter a foundational boundary require a new ADR in `docs/decisions/`.

## Phase 0 completion

Phase 0 is complete when these documents are reviewed, contradictions are resolved, and implementation work can be evaluated against explicit acceptance criteria rather than inferred intent.
