# News Aggregation Platform Documentation

This directory is the source of truth for product and engineering contracts in `jfin602/news-scraper`.

Each deployed installation hosts exactly one Publication/topic. The first configured deployment is an indie-author publishing news feed, but the Platform codebase is topic independent. Topic vocabulary, Sources, Relevance rules, Categories, and branding belong to singleton Publication configuration rather than shared aggregation-engine code. A different topic reuses the same codebase through a separately configured deployment rather than another concurrently hosted Publication.

Publication is an editorial/configuration concept, not a relational tenancy key. Sources, Articles, observations, jobs, Categories, Relevance rules, and duplicate state use installation/Source relationships directly rather than Publication tenant scoping.

The canonical customer-visible feed route is `/`; the canonical basic feed API is `/api/feed`. Public readers and ordinary runtime flows do not select a Publication by slug.

Before production database compatibility is established, the supported persistence setup is a fresh database built from the repository's current migration chain and bootstrap/configuration. Pre-production schema corrections are allowed to destroy/recreate databases and MUST remove legacy-only migration/runtime/config/test structure when retaining it would serve only superseded compatibility. Git history, superseded ADRs, historical prompts, and validation artifacts preserve the history instead.

Phase 19 established and validated production backup/restore, deployment/rollback, and schema-upgrade procedures. Acceptance of Phase 20 customer launch establishes the first supported production schema/data baseline. From that point forward, customer production data is durable supported state and normal upgrades/refactors are governed by `decisions/production-data-and-schema-compatibility.md`; the pre-production destructive-reset rule no longer applies to that supported customer state.

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
│   ├── security-reliability-and-operations.md
│   ├── source-onboarding.md
│   ├── database-backup-and-restore.md
│   └── deployment-and-incident-runbook.md
├── roadmap/
│   ├── mvp-roadmap.md
│   └── post-1.0-roadmap.md
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
- `contracts/domain-and-data-contract.md` — canonical terminology, singleton Publication configuration, real entity relationships, endpoint-owned HTML profile semantics, Source RSS/Atom item-admission configuration/accounting, Category/Relevance persistence and deterministic rule semantics, identity/provenance invariants, pre-production fresh-schema policy, production schema lifecycle, and public-row semantics.
- `contracts/testing-and-validation-contract.md` — project-wide regression law, evidence levels, test isolation, local/final-tree execution, PostgreSQL/fixture/browser/live-Source validation, Phase 18 HTML evidence, production-upgrade validation, later phase-specific matrices, and completion gates.
- `architecture/system-architecture.md` — deployment/process/module boundaries, singleton configuration, staged Worker execution, endpoint-selected RSS/Atom/static-HTML adapters, conditional RSS/Atom-only admission, shared downstream flow, durable scheduling/jobs, transactions, and pre/post-production schema policy.
- `contracts/source-and-collection-contract.md` — approval/bootstrap rules, network safety, bounded static HTML profiles/preview, collection adapters, RSS/Atom-only Source item admission, normalization, installation/Source-scoped Relevance execution, Source-scoped identity/idempotency, and Collection-run accounting.
- `contracts/article-lifecycle-and-deduplication.md` — Article visibility, Source-scoped identity, duplicate roles/review/groups, Primary selection, feed eligibility.
- `contracts/public-feed-and-admin-contract.md` — canonical root public page, singleton public-feed API/read model, search/filtering, themes, external links, and Cloudflare-protected admin UX including HTML profile/preview behavior and change history. Accepted Phase 8/9 slug-addressed routes remain recorded in validation artifacts for their accepted SHAs.
- `design/README.md` — design-document authority/routing and the entry point for the parallel UI workstream.
- `design/public-feed-presentation.md` — durable public-feed layout, typography, themes, states, responsive behavior, accessibility presentation, and design-token guidance for Phase 13 and later presentation work.
- `design/ui-workflow.md` — permanent `ui-polish` branch/worktree rules, presentation task boundaries, conditional `/ui-review` → `/ui-apply` design-guidance workflow, and targeted `/ui-plan` → `/ui-write` prompt workflow.
- `operations/security-reliability-and-operations.md` — admin perimeter, fetch security, real resource validation, failure isolation, observability, recovery requirements, deployment security, and the production-operations boundary established and hardened through Phase 19.
- `operations/source-onboarding.md` — operator-facing Source/endpoint onboarding procedure, field-by-field purpose, approved-domain configuration, RSS/Atom admission-phrase semantics, state model, HTML listing profile guidance, approval/enablement sequence, and Check-now/run interpretation.
- `operations/database-backup-and-restore.md` — governed PostgreSQL backup, restore verification, managed-backup retention, recovery validation, and Phase 20 launch reconfirmation procedure.
- `operations/deployment-and-incident-runbook.md` — ordered deployment/schema-upgrade/rollback procedure, reference-deployment validation, incident response, and the deployment-specific operations record that Phase 20 must reconfirm before launch acceptance.
- `roadmap/mvp-roadmap.md` — historical completed Phase 0–21 MVP sequence, tech-demo critical path, completed Phase 20 customer launch validation/production-baseline handoff, and the terminal Phase 21 transition that closed the MVP at `1.0.0`.
- `roadmap/post-1.0-roadmap.md` — current owner-approved roadmap beginning at post-1.0 Phase 0 on baseline `1.0.0`; it maps versions as `1.<phase>.<prompt>` and sequences SSR, crawlable pagination/page-size configuration, SEO, summaries, historical archives, thumbnails, and scale validation.
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
- Phase 21 was behavior-preserving maintainability/optimization work and is complete. Post-1.0 product work is governed by `roadmap/post-1.0-roadmap.md` while preserving the same locked Platform boundaries and production-data compatibility.
- Foundational architecture changes require an Accepted/superseding ADR where appropriate.
- Design guidance under `design/` is subordinate to product/domain contracts, ADRs, roadmap, and the testing contract; it may refine presentation but may not redefine supported product behavior.

## Phase completion discipline

An implementation phase or gating correction closes only after its exit gate and the inherited testing contract are verified against the exact final tree. Source inspection, partial implementation, stale results, or silently skipped suites are not completion evidence.

The MVP roadmap is complete through Phase 21. Phase 9 and Phase 14 retain their explicit owner-acceptance evidence limitations, and later proof does not rewrite those artifacts. The terminal Phase 21 closeout advanced only top-level `package.json` from the validated `0.21.11` candidate to the current `1.0.0` release baseline.

**Current roadmap state:** post-1.0 **Phase 0 — Server-rendered public feed**, baseline `1.0.0`.

Before Phase 0 task generation/execution, the documented runner-compatibility gate must be completed because the current pre-1.0 parser does not yet support Phase 0 / `1.<phase>.<prompt>` roadmap grammar. That gate is non-versioned tooling work and must leave `package.json` at `1.0.0` without consuming a Phase 0 patch number.

Historical validation artifacts describe only the source tree, environment, and observations they record. They do not redefine current contracts.
