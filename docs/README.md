# News Aggregation Platform Documentation

This directory is the source of truth for product and engineering contracts in `jfin602/news-scraper`.

Each deployed installation hosts exactly one Publication/topic. The first configured deployment is an indie-author publishing news feed, but the Platform codebase is topic independent. Topic vocabulary, Sources, Relevance rules, Categories, and branding belong to singleton Publication configuration rather than shared aggregation-engine code. A different topic reuses the same codebase through a separately configured deployment rather than another concurrently hosted Publication.

Publication is an editorial/configuration concept, not a relational tenancy key. Sources, Articles, observations, jobs, Categories, Relevance rules, and duplicate state use installation/Source relationships directly rather than Publication tenant scoping.

The canonical customer-visible feed route is `/`; the canonical basic feed API is `/api/feed`. Public readers and ordinary runtime flows do not select a Publication by slug.

Before production database compatibility is established, the supported persistence setup is a fresh database built from the repository's current migration chain and bootstrap/configuration. Pre-production schema corrections are allowed to destroy/recreate databases and MUST remove legacy-only migration/runtime/config/test structure when retaining it would serve only superseded compatibility. Git history, superseded ADRs, historical prompts, and validation artifacts preserve the history instead.

Phase 19 establishes and validates production backup/restore, deployment/rollback, and schema-upgrade procedures. Acceptance of Phase 20 customer launch establishes the first supported production schema/data baseline. From that point forward, customer production data is durable supported state and normal upgrades/refactors are governed by `decisions/production-data-and-schema-compatibility.md`; the pre-production destructive-reset rule no longer applies to that supported customer state.

## Folder structure

```text
docs/
├── README.md
├── codex-model-selection.md
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
│   ├── production-data-and-schema-compatibility.md
│   ├── topic-independent-publication-model.md        # superseded historical ADR
│   ├── whitelist-and-structured-feed-first.md
│   ├── original-link-and-normalized-metadata.md
│   └── cloudflare-access-admin-perimeter.md
├── design/
│   ├── README.md
│   ├── public-feed-presentation.md
│   ├── ui-workflow.md
│   └── tasks/       # created only when /ui-write emits targeted UI prompts
├── testing/         # created only when specialized validation plans become substantive
├── tasks/           # roadmap/correction implementation prompt stacks
└── validation/      # durable observed validation artifacts / implementation closeout evidence
```

Git does not track empty directories, so `testing/`, `tasks/`, `design/tasks/`, and `validation/` may not exist until substantive files are created there. Do not create placeholder testing plans or empty validation artifacts.

## Document routing

- `codex-model-selection.md` — detailed minimum-cost-adequate model-family/reasoning policy for `/prompt-ass`, `/prompt-plan`, `/prompt-write`, `/revalidate`, usage estimates, prompt-token discipline, and the current Luna/Terra/Sol runner matrix. `BOOT.md` remains authoritative for executable task grammar, and current `MODEL_CONFIGS` remains authoritative for labels that may actually be written/executed.
- `contracts/project-contract.md` — locked Platform laws, one-Publication-per-deployment boundary, singleton/configuration-vs-tenancy invariant, authority hierarchy, product boundaries, contract-change process, and the derived post-launch production-data preservation invariant.
- `contracts/mvp-scope-and-users.md` — MVP users, demo-first capability ordering, single-Publication deployment scope, exclusions, quality targets.
- `contracts/domain-and-data-contract.md` — canonical terminology, singleton Publication configuration, real entity relationships, state models, Source RSS/Atom item-admission configuration/accounting, Category/Relevance persistence and deterministic rule semantics, identity/provenance invariants, pre-production fresh-schema policy, production schema lifecycle, and public-row semantics.
- `contracts/testing-and-validation-contract.md` — project-wide regression law, evidence levels, test isolation, local/final-tree execution, PostgreSQL/fixture/browser/live-Source validation, production-upgrade validation, phase-specific matrices including Phase 21, and completion gates.
- `architecture/system-architecture.md` — deployment/process/module boundaries, singleton configuration, staged Worker execution, safety-gated pipeline including optional Source RSS/Atom item admission, durable scheduling/jobs, transactions, maintainability/simplification principles, and pre/post-production schema policy.
- `contracts/source-and-collection-contract.md` — approval/bootstrap rules, network safety, collection adapters, Source RSS/Atom item admission, normalization, installation/Source-scoped Relevance execution, pre-admin editorial configuration, Source-scoped identity/idempotency, Collection-run accounting.
- `contracts/article-lifecycle-and-deduplication.md` — Article visibility, Source-scoped identity, duplicate roles/review/groups, Primary selection, feed eligibility.
- `contracts/public-feed-and-admin-contract.md` — canonical root public page, singleton public-feed API/read model, search/filtering, themes, external links, and Cloudflare-protected admin UX/change history. Accepted Phase 8/9 slug-addressed routes remain recorded in validation artifacts for their accepted SHAs.
- `design/README.md` — design-document authority/routing and the entry point for the parallel UI workstream.
- `design/public-feed-presentation.md` — durable public-feed layout, typography, themes, states, responsive behavior, accessibility presentation, and design-token guidance for Phase 13 and later presentation work.
- `design/ui-workflow.md` — permanent `ui-polish` branch/worktree rules, presentation task boundaries, conditional `/ui-review` → `/ui-apply` design-guidance workflow, and targeted `/ui-plan` → `/ui-write` prompt workflow.
- `operations/security-reliability-and-operations.md` — admin perimeter, fetch security, real resource validation, failure isolation, observability, recovery, pre-production database deployment, production hardening, and the Phase 19 production upgrade/restore/rollback preparation boundary.
- `roadmap/mvp-roadmap.md` — Phase 0–21 sequence, tech-demo critical path, completed Phase 10 entry singleton correction and later completed phases, dependencies, non-goals, exit gates, current Phase 17 moderation/correction gate, Phase 20 production-baseline handoff, and terminal Phase 21 codebase simplification/maintainability hardening.
- `decisions/single-publication-simplified-data-model.md` — **Accepted ADR** for topic-independent separate deployments, singleton Publication configuration without relational tenancy, and the pre-production rebuild-from-zero database rule.
- `decisions/production-data-and-schema-compatibility.md` — **Accepted ADR** for the Phase 20 production-baseline boundary, durable customer-data preservation, supported production migration history, and post-launch schema-upgrade evidence.
- `decisions/topic-independent-publication-model.md` — **Superseded historical ADR** retained only as decision history.
- `decisions/whitelist-and-structured-feed-first.md` — whitelist/trust and structured-feed priority.
- `decisions/original-link-and-normalized-metadata.md` — stored `original_url` public-destination decision and normalized-metadata boundary.
- `decisions/cloudflare-access-admin-perimeter.md` — MVP admin access boundary and deferred native identity/account system.
- `decisions/README.md` — ADR status/index.

Use root `BOOT.md` as the session router; it points to the narrowest authoritative document for a task. For model/reasoning/usage assessment, use `codex-model-selection.md` as the detailed workflow refinement while preserving BOOT's executable grammar and current runner-label constraints.

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
- After Phase 20 production-baseline acceptance, do not apply that destructive pre-production reset policy to supported customer state. Production schema/persistence changes preserve supported data and upgradeability under `decisions/production-data-and-schema-compatibility.md`.
- Phase 21 is behavior-preserving maintainability/optimization work. It does not authorize new product capability, arbitrary rewrites, flattening real integrity/provenance/security boundaries, or structural-metric quotas as substitutes for maintainability evidence.
- Foundational architecture changes require an Accepted/superseding ADR where appropriate.
- Design guidance under `design/` is subordinate to product/domain contracts, ADRs, roadmap, and the testing contract; it may refine presentation but may not redefine supported product behavior.

## Phase completion discipline

An implementation roadmap phase is complete only when its documented exit gate and inherited requirements in `contracts/testing-and-validation-contract.md` are actually verified against the final source tree. Gating correction stacks inherit the same evidence discipline and may require their own durable validation artifact before roadmap work resumes.

Implementation-phase/correction closeout requires executed local validation evidence tied to the exact accepted source tree. Do not infer completion from partial implementation, source inspection, stale earlier test results, or silently skipped suites.

Phase 0 documentation alignment, Phase 1 Application foundation, Phase 2 Database foundation, Phase 3 Publication and Source configuration, Phase 4 Collection eligibility and network safety, Phase 5 RSS/Atom transport, parsing, and minimal Collection runs, Phase 6 Article normalization, Phase 7 Default Relevance/Article identity/persistence, and Phase 8 Basic public-feed backend are complete with durable closeout validation. Phase 9 Basic public-feed UI and tech demo is complete by explicit repository-owner acceptance on August 11, 2026; its durable validation artifact remains authoritative that the required two-Source Level 7 live-source gate was not observed in that run because The Creative Penn timed out under the recorded execution environment.

The Phase 10 entry singleton implementation correction is complete with durable validation in `validation/single-publication-simplification-correction.md`. Phase 10 — Automated polling, durable jobs, and endpoint health — is complete with durable validation in `validation/phase-10-automated-polling-durable-jobs-endpoint-health.md`. Phase 11 — Categories and configurable Relevance execution — is complete with durable validation in `validation/phase-11-categories-configurable-relevance-execution.md`. Phase 12 — Feed discovery features — is complete with durable validation in `validation/phase-12-feed-discovery-features.md`. Phase 13 — Public presentation polish — is complete with durable validation in `validation/phase-13-public-presentation-polish.md`.

Phase 16 — True duplicate detection and grouping — is complete with durable validation in `validation/phase-16-true-duplicate-detection-and-grouping.md`. The repository is currently in **Phase 17 — Article and duplicate moderation**. Phase 17 owns reversible Article visibility/display/Category moderation, stored-Article and provenance inspection, governed duplicate review/manual decisions, and bounded change history while preserving the completed identity, grouping, and public-feed model.

The remaining documented roadmap is Phase 18 configurable HTML collection → Phase 19 reliability/observability/production operations → Phase 20 customer launch validation → **Phase 21 codebase simplification and maintainability hardening**. Phase 20 acceptance establishes the production data/schema baseline and feature freeze; Phase 21 closes that freeze and is terminal unless the repository owner explicitly approves a later roadmap extension. Deferred ideas do not implicitly create Phase 22.
