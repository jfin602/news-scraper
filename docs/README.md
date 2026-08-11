# News Aggregation Platform Documentation

This directory is the source of truth for product and engineering contracts in `jfin602/news-scraper`.

Each deployed installation hosts exactly one Publication/topic. The first configured deployment is an indie-author publishing news feed, but the Platform codebase is topic independent. Topic vocabulary, Sources, Relevance rules, Categories, and branding belong to singleton Publication configuration rather than shared aggregation-engine code. A different topic reuses the same codebase through a separately configured deployment rather than another concurrently hosted Publication.

Publication is an editorial/configuration concept, not a relational tenancy key. Sources, Articles, observations, jobs, Categories, Relevance rules, and duplicate state use installation/Source relationships directly rather than Publication tenant scoping.

The canonical customer-visible feed route is `/`; the canonical basic feed API is `/api/feed`. Public readers and ordinary runtime flows do not select a Publication by slug.

Before production database compatibility is established, the supported persistence setup is a fresh database built from the repository's current migration chain and bootstrap/configuration. Pre-production schema corrections are allowed to destroy/recreate databases and MUST remove legacy-only migration/runtime/config/test structure when retaining it would serve only superseded compatibility. Git history, superseded ADRs, historical prompts, and validation artifacts preserve the history instead.

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
│   ├── single-publication-simplified-data-model.md
│   ├── topic-independent-publication-model.md        # superseded historical ADR
│   ├── whitelist-and-structured-feed-first.md
│   ├── original-link-and-normalized-metadata.md
│   └── cloudflare-access-admin-perimeter.md
├── design/
│   ├── README.md
│   ├── ui-workflow.md
│   └── tasks/       # created when targeted single UI prompts are written
├── testing/      # created only when specialized validation plans become substantive
├── tasks/        # created when roadmap/correction implementation prompt stacks are written
└── validation/   # durable observed validation artifacts / implementation closeout evidence
```

Git does not track empty directories, so `design/tasks/`, `testing/`, `tasks/`, and `validation/` may not exist until substantive files are created there. Do not create placeholder design tasks, testing plans, or empty validation artifacts.

## Document routing

- `contracts/project-contract.md` — locked Platform laws, one-Publication-per-deployment boundary, singleton/configuration-vs-tenancy invariant, authority hierarchy, product boundaries, contract-change process.
- `contracts/mvp-scope-and-users.md` — MVP users, demo-first capability ordering, single-Publication deployment scope, exclusions, quality targets.
- `contracts/domain-and-data-contract.md` — canonical terminology, singleton Publication configuration, real entity relationships, state models, logical entities, identity/provenance invariants, fresh-schema policy, and public-row semantics.
- `contracts/testing-and-validation-contract.md` — project-wide regression law, evidence levels, test isolation, local/final-tree execution, PostgreSQL/fixture/browser/live-Source validation, singleton correction matrix, and completion gates.
- `architecture/system-architecture.md` — deployment/process/module boundaries, singleton configuration, staged Worker execution, safety-gated pipeline, scheduling, transactions, and pre-production schema policy.
- `contracts/source-and-collection-contract.md` — approval/bootstrap rules, network safety, collection adapters, normalization, installation/Source-scoped Relevance, Source-scoped identity/idempotency, Collection-run accounting.
- `contracts/article-lifecycle-and-deduplication.md` — Article visibility, Source-scoped identity, duplicate roles/review/groups, Primary selection, feed eligibility.
- `contracts/public-feed-and-admin-contract.md` — canonical root public page, singleton public-feed API/read model, search/filtering, themes, external links, and Cloudflare-protected admin UX/change history. Accepted Phase 8/9 slug-addressed routes remain recorded in validation artifacts for their accepted SHAs.
- `operations/security-reliability-and-operations.md` — admin perimeter, fetch security, real resource validation, failure isolation, observability, recovery, pre-production database deployment, production hardening.
- `roadmap/mvp-roadmap.md` — Phase 0–20 sequence, tech-demo critical path, Phase 10 entry singleton implementation correction, dependencies, non-goals, exit gates.
- `decisions/single-publication-simplified-data-model.md` — **current Accepted ADR** for topic-independent separate deployments, singleton Publication configuration without relational tenancy, and the pre-production rebuild-from-zero database rule.
- `decisions/topic-independent-publication-model.md` — **Superseded historical ADR** retained only as decision history.
- `decisions/whitelist-and-structured-feed-first.md` — whitelist/trust and structured-feed priority.
- `decisions/original-link-and-normalized-metadata.md` — stored `original_url` public-destination decision and normalized-metadata boundary.
- `decisions/cloudflare-access-admin-perimeter.md` — MVP admin access boundary and deferred native identity/account system.
- `decisions/README.md` — ADR status/index.
- `design/README.md` — design-document authority/routing and the boundary between presentation guidance and product/domain contracts.
- `design/ui-workflow.md` — permanent `ui-polish` branch/worktree rules and the lightweight `/ui-plan` → `/ui-write` targeted single-prompt workflow.
- `design/tasks/` — non-roadmap, non-versioned targeted UI prompts written by `/ui-write`; not parsed or executed by `codex:phase`.

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
- Concurrent multi-Publication hosting inside one installation is not inferred from Publication configuration and requires a new explicit locked contract/ADR decision plus deliberate data-model work if ever promoted.
- Do not introduce Publication tenant IDs/slugs/FKs/scopes solely as speculative future compatibility.
- Before production compatibility exists, do not retain migration/code/API/type/test/fixture/configuration artifacts solely to preserve superseded pre-production behavior; delete them when the current canonical system no longer needs them.
- Design documents may refine presentation but must not silently redefine behavior owned by higher-authority contracts/ADRs/roadmap.
- UI workstream prompts are non-versioned and do not advance roadmap state or substitute for future roadmap exit gates such as Phase 13.
- Foundational architecture changes require an Accepted/superseding ADR where appropriate.

## Phase completion discipline

An implementation roadmap phase is complete only when its documented exit gate and inherited requirements in `contracts/testing-and-validation-contract.md` are actually verified against the final source tree. Gating correction stacks inherit the same evidence discipline and may require their own durable validation artifact before roadmap work resumes.

Implementation-phase/correction closeout requires executed local validation evidence tied to the exact accepted source tree. Do not infer completion from partial implementation, source inspection, stale earlier test results, or silently skipped suites.

Phase 0 documentation alignment, Phase 1 Application foundation, Phase 2 Database foundation, Phase 3 Publication and Source configuration, Phase 4 Collection eligibility and network safety, Phase 5 RSS/Atom transport, parsing, and minimal Collection runs, Phase 6 Article normalization, Phase 7 Default Relevance/Article identity/persistence, and Phase 8 Basic public-feed backend are complete with durable closeout validation. Phase 9 Basic public-feed UI and tech demo is complete by explicit repository-owner acceptance on August 11, 2026; its durable validation artifact remains authoritative that the required two-Source Level 7 live-source gate was not observed in that run because The Creative Penn timed out under the recorded execution environment.

The repository is currently in Phase 10 — Automated polling, durable jobs, and endpoint health — but ordinary Phase 10 implementation is gated until the singleton implementation correction removes obsolete Publication tenancy/selectors from the current source/schema, makes `/` and `/api/feed` canonical, establishes the canonical migration-from-zero schema, and receives the required database/regression/browser closeout evidence. Databases created by older pre-production source trees are rebuilt rather than preserved through compatibility migration code. This correction remains in the `0.10.x` version family and is not a new numbered roadmap phase.
