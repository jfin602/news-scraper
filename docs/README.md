# News Aggregation Platform Documentation

This directory is the source of truth for product and engineering contracts in `jfin602/news-scraper`.

The first configured Publication is an indie-author publishing news feed, but the Platform is topic-independent. Topic vocabulary, Sources, Relevance rules, Categories, and branding belong to Publication configuration rather than shared aggregation-engine code.

## Folder structure

```text
docs/
├── README.md
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
├── decisions/
│   ├── README.md
│   ├── topic-independent-publication-model.md
│   ├── whitelist-and-structured-feed-first.md
│   ├── original-link-and-normalized-metadata.md
│   └── cloudflare-access-admin-perimeter.md
├── testing/      # created only when specialized validation plans become substantive
├── tasks/        # created when implementation prompt stacks are written
└── validation/   # created when durable observed validation artifacts are useful or required for implementation-phase closeout
```

Git does not track empty directories, so `testing/`, `tasks/`, and `validation/` may not exist until substantive files are created there. Do not create placeholder testing plans or empty validation artifacts.

## Document routing

- `contracts/project-contract.md` — locked Platform laws, authority hierarchy, boundaries, contract-change process.
- `contracts/mvp-scope-and-users.md` — MVP users, demo-first capability ordering, exclusions, quality targets.
- `contracts/domain-and-data-contract.md` — canonical terminology, ownership, state models, logical entities, identity/provenance invariants.
- `contracts/testing-and-validation-contract.md` — project-wide regression law, evidence levels, test isolation, local/final-tree execution, PostgreSQL/fixture/browser/live-Source validation, and implementation-phase/prompt completion gates.
- `architecture/system-architecture.md` — process/module boundaries, staged Worker execution, safety-gated pipeline, scheduling, transaction baseline.
- `contracts/source-and-collection-contract.md` — approval/bootstrap rules, network safety, collection adapters, normalization, Relevance, identity/idempotency, Collection-run accounting.
- `contracts/article-lifecycle-and-deduplication.md` — Article visibility, duplicate roles, review candidates/groups, Primary selection, feed eligibility.
- `contracts/public-feed-and-admin-contract.md` — public feed, search/filtering, themes, external links, Cloudflare-protected admin UX/change history.
- `operations/security-reliability-and-operations.md` — admin perimeter, fetch security, failure isolation, observability, recovery, production hardening.
- `roadmap/mvp-roadmap.md` — Phase 0–20 implementation sequence, tech-demo critical path, dependencies, non-goals, exit gates.
- `decisions/cloudflare-access-admin-perimeter.md` — MVP admin access boundary and deferred native identity/account system.
- `decisions/` — Accepted architecture decision records explaining foundational choices.

Use root `BOOT.md` as the session router; it points to the narrowest authoritative document for a task.

## Normative language

**MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative.

- **MUST / MUST NOT**: required for contract compliance.
- **SHOULD / SHOULD NOT**: expected unless a documented reason justifies deviation.
- **MAY**: optional.

## Change discipline

- Locked laws are changeable only through the explicit process in `contracts/project-contract.md`; they are **locked**, not literally immutable.
- Contract changes update all affected documents in the same logical change.
- Code that knowingly violates a locked law is invalid even if tests pass.
- Tests that pass only because a contract-critical invariant was weakened are invalid evidence.
- New adapters, Publications, Sources, or Categories must not silently redefine Platform-wide behavior.
- Foundational architecture changes require an Accepted/superseding ADR where appropriate.

## Phase completion discipline

An implementation roadmap phase is complete only when its documented exit gate and the inherited requirements in `contracts/testing-and-validation-contract.md` are actually verified against the final source tree. Implementation-phase closeout requires executed local validation evidence and a durable `docs/validation/` artifact tied to the exact accepted commit/source tree. Do not infer completion from partial implementation, source inspection, stale earlier test results, or silently skipped suites.

Phase 0 documentation alignment, Phase 1 Application foundation, Phase 2 Database foundation, Phase 3 Publication and Source configuration, Phase 4 Collection eligibility and network safety, and Phase 5 RSS/Atom transport, parsing, and minimal Collection runs are complete with durable closeout validation. The repository is currently in Phase 6 — Article normalization.
