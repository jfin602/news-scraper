# News Aggregation Platform Documentation

This directory is the source of truth for product and engineering contracts in `jfin602/news-scraper`.

The first configured Publication is an indie-author publishing news feed, but the Platform is topic-independent. Topic vocabulary, Sources, relevance rules, Categories, and branding belong to Publication configuration rather than shared aggregation-engine code.

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
│   └── public-feed-and-admin-contract.md
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
│   └── original-link-and-normalized-metadata.md
├── tasks/        # created when implementation prompt stacks are written
└── validation/   # created when durable validation artifacts are needed
```

Git does not track empty directories, so `tasks/` and `validation/` may not exist until files are created there.

## Document routing

- `contracts/project-contract.md` — locked Platform laws, authority hierarchy, boundaries, contract-change process.
- `contracts/mvp-scope-and-users.md` — MVP users, capabilities, exclusions, quality targets.
- `contracts/domain-and-data-contract.md` — canonical terminology, ownership, state models, logical entities, identity/provenance invariants.
- `architecture/system-architecture.md` — process/module boundaries, safety-gated pipeline, scheduling, transaction baseline.
- `contracts/source-and-collection-contract.md` — approval/state rules, network safety, collection adapters, normalization, relevance, identity/idempotency, run accounting.
- `contracts/article-lifecycle-and-deduplication.md` — Article visibility, duplicate roles, review candidates/groups, Primary selection, feed eligibility.
- `contracts/public-feed-and-admin-contract.md` — public feed, search/filtering, themes, external links, admin UX/audit behavior.
- `operations/security-reliability-and-operations.md` — auth/fetch security, failure isolation, observability, recovery, production hardening.
- `roadmap/mvp-roadmap.md` — Phase 0–8 implementation sequence and exit gates.
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
- New adapters, Publications, Sources, or Categories must not silently redefine Platform-wide behavior.
- Foundational architecture changes require an Accepted/superseding ADR where appropriate.

## Phase 0 completion

Phase 0 is complete only after the documentation set is reviewed, contradictions are resolved, and implementation work can cite explicit measurable contracts rather than inferred intent.
