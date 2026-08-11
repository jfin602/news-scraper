# News Aggregation Platform Documentation

This directory is the source of truth for product and engineering contracts in `jfin602/news-scraper`.

Each deployed installation hosts exactly one Publication/topic. The first configured deployment is an indie-author publishing news feed, but the Platform codebase is topic-independent. Topic vocabulary, Sources, Relevance rules, Categories, and branding belong to Publication configuration rather than shared aggregation-engine code. A different topic reuses the same codebase through a separately configured deployment rather than another concurrently hosted Publication.

The canonical customer-visible feed route is `/`. Publication identifiers/slugs may remain stable internal configuration/persistence scoping fields; they are not public topic selectors.

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

- `contracts/project-contract.md` — locked Platform laws, one-Publication-per-deployment boundary, authority hierarchy, product boundaries, contract-change process.
- `contracts/mvp-scope-and-users.md` — MVP users, demo-first capability ordering, single-Publication deployment scope, exclusions, quality targets.
- `contracts/domain-and-data-contract.md` — canonical terminology, ownership, state models, logical entities, identity/provenance invariants, public-row state/date semantics.
- `contracts/testing-and-validation-contract.md` — project-wide regression law, evidence levels, test isolation, local/final-tree execution, PostgreSQL/fixture/browser/live-Source validation, and implementation-phase/prompt completion gates.
- `architecture/system-architecture.md` — deployment/process/module boundaries, staged Worker execution, safety-gated pipeline, scheduling, transaction baseline.
- `contracts/source-and-collection-contract.md` — approval/bootstrap rules, network safety, collection adapters, normalization, Relevance, identity/idempotency, Collection-run accounting.
- `contracts/article-lifecycle-and-deduplication.md` — Article visibility, duplicate roles, review candidates/groups, Primary selection, feed eligibility.
- `contracts/public-feed-and-admin-contract.md` — canonical root public page, installation-scoped public-feed API/read model, completed-MVP public feed, search/filtering, themes, external links, and Cloudflare-protected admin UX/change history. Historical Phase 8/9 slug-addressed routes remain recorded in their validation artifacts.
- `operations/security-reliability-and-operations.md` — admin perimeter, fetch security, failure isolation, observability, recovery, production hardening.
- `roadmap/mvp-roadmap.md` — Phase 0–20 implementation sequence, tech-demo critical path, the pre-Phase-10 single-Publication correction gate, dependencies, non-goals, exit gates.
- `decisions/topic-independent-publication-model.md` — topic-independent code reuse across separate single-Publication deployments and rejection of concurrent multi-topic hosting.
- `decisions/original-link-and-normalized-metadata.md` — stored `original_url` public-destination decision and normalized-metadata boundary.
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
- New Sources, Categories, or separately deployed Publication configurations must not silently redefine Platform-wide behavior.
- Concurrent multi-Publication hosting inside one installation is not inferred from the Publication abstraction and requires a new explicit locked contract/ADR decision if ever promoted.
- Foundational architecture changes require an Accepted/superseding ADR where appropriate.

## Phase completion discipline

An implementation roadmap phase is complete only when its documented exit gate and the inherited requirements in `contracts/testing-and-validation-contract.md` are actually verified against the final source tree. Implementation-phase closeout requires executed local validation evidence and a durable `docs/validation/` artifact tied to the exact accepted commit/source tree. Do not infer completion from partial implementation, source inspection, stale earlier test results, or silently skipped suites.

Phase 0 documentation alignment, Phase 1 Application foundation, Phase 2 Database foundation, Phase 3 Publication and Source configuration, Phase 4 Collection eligibility and network safety, Phase 5 RSS/Atom transport, parsing, and minimal Collection runs, Phase 6 Article normalization, Phase 7 Default Relevance/Article identity/persistence, and Phase 8 Basic public-feed backend are complete with durable closeout validation. Phase 9 Basic public-feed UI and tech demo is complete by explicit repository-owner acceptance on August 11, 2026; its durable validation artifact remains authoritative that the required two-Source Level 7 live-source gate was not observed in that run because The Creative Penn timed out under the recorded execution environment.

The repository is currently in Phase 10 — Automated polling, durable jobs, and endpoint health — but ordinary Phase 10 implementation is gated until the owner-approved post-Phase-9 single-Publication correction makes `/` canonical, removes public/runtime topic-selection assumptions, and receives focused automated/browser regression evidence. This correction remains in the `0.10.x` version family and is not a new numbered roadmap phase.
