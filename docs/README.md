# News Aggregation Platform Documentation

This directory is the source of truth for product and engineering contracts in `jfin602/news-scraper`.

News Scraper is now governed as a reusable, topic-independent **headless news aggregation and distribution Platform**. Each deployed installation hosts exactly one Publication/topic. The first configured deployment is an indie-author publishing news product, but the Platform codebase is topic independent. Topic vocabulary, Sources, Relevance rules, Categories, branding, and later distribution configuration belong to singleton Publication/configuration state rather than shared aggregation-engine code. A different topic reuses the same codebase through a separately configured deployment rather than another concurrently hosted Publication.

Publication is an editorial/configuration concept, not a relational tenancy key. Sources, Articles, observations, jobs, Categories, Relevance rules, and duplicate state use installation/Source relationships directly rather than Publication tenant scoping.

The administrator surface is the instance-owned Platform control plane. The approved, unimplemented 2.0 path is canonical eligibility → Distribution Profile → authenticated v1 API → generic PHP complete-snapshot synchronization → local last-known-good data → customer server-rendered output. WordPress, RSS/Atom, and native self-host admin authentication are post-2.0. Current implemented outward surfaces remain `GET /api/feed` plus bundled/reference `GET /`.

The accepted `1.0.0` customer launch established the first supported production schema/data baseline. Current package version is `1.0.1`. The 2.0 architecture/contracts are established, but the roadmap remains paused pending an owner-approved replacement implementation roadmap; there is no active phase or assigned next version.

Before production database compatibility was established, the supported persistence setup was a fresh database built from the repository's current migration chain and bootstrap/configuration. That historical pre-production destructive-reset policy no longer applies to accepted customer production state. Current production upgrades are governed by `decisions/production-data-and-schema-compatibility.md`.

## Folder structure

```text
docs/
├── README.md
├── codex-model-selection.md
├── contracts/
│   ├── project-contract.md
│   ├── product-scope-and-users.md
│   ├── mvp-scope-and-users.md              # historical 1.0.0 scope
│   ├── domain-and-data-contract.md
│   ├── source-and-collection-contract.md
│   ├── article-lifecycle-and-deduplication.md
│   ├── public-feed-and-admin-contract.md
│   ├── distribution-and-integration-contract.md
│   ├── distribution-api-contract.md
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
│   ├── headless-distribution-product-boundary.md
│   ├── managed-first-self-hostable-distribution-architecture.md
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
├── history/
│   └── superseded-post-1.0-phase-0-closeout.md
├── testing/         # created only when specialized validation plans become substantive
├── tasks/           # active roadmap/correction implementation prompt stacks only
└── validation/      # durable observed validation artifacts / implementation closeout evidence
```

Git does not track empty directories, so `testing/`, `tasks/`, `design/tasks/`, and `validation/` may not exist until substantive files are created there. Do not create placeholder testing plans or empty validation artifacts.

## Document routing

- `contracts/project-contract.md` — locked Platform laws, authority hierarchy, one-Publication-per-deployment boundary, headless product/output law, original-publisher destination law, and derived production-data invariant.
- `contracts/product-scope-and-users.md` — **current post-1.0 product scope** and approved 2.0 managed-integration boundary.
- `contracts/distribution-and-integration-contract.md` — Distribution Profiles, filters, PHP/LKG behavior, adapter/presentation/link boundaries, later adapters, and telemetry.
- `contracts/distribution-api-contract.md` — permanent v1 Profile API, schema, revisions/cursors, machine credentials, response classes, rate limits, and CORS stance.
- `contracts/mvp-scope-and-users.md` — **historical** scope for the accepted `1.0.0` standalone-feed MVP; useful for interpreting completed MVP work but not current product direction.
- `contracts/domain-and-data-contract.md` — canonical terminology, singleton Publication configuration, real entity relationships, endpoint-owned HTML profile semantics, Source RSS/Atom item-admission configuration/accounting, Category/Relevance persistence and deterministic rule semantics, identity/provenance invariants, schema lifecycle, and current public-row semantics.
- `contracts/testing-and-validation-contract.md` — project-wide regression law, evidence levels, test isolation, local/final-tree execution, PostgreSQL/fixture/browser/live-Source validation, production-upgrade validation, and completion gates.
- `architecture/system-architecture.md` — implemented deployment/process/module boundaries, singleton configuration, staged Worker execution, endpoint-selected RSS/Atom/static-HTML adapters, shared downstream flow, durable scheduling/jobs, transactions, and current Web/API consumers. Product-wide surface interpretation is governed by the headless-distribution ADR.
- `contracts/source-and-collection-contract.md` — approval/bootstrap rules, network safety, bounded static HTML profiles/preview, collection adapters, RSS/Atom-only Source item admission, normalization, installation/Source-scoped Relevance execution, Source-scoped identity/idempotency, and Collection-run accounting.
- `contracts/article-lifecycle-and-deduplication.md` — Article visibility, Source-scoped identity, duplicate roles/review/groups, Primary selection, and current outward/public eligibility semantics.
- `contracts/public-feed-and-admin-contract.md` — existing `GET /`, `GET /api/feed`, search/filter/theme behavior, external links, and Cloudflare-protected admin UX. Its statements treating `/` as the Platform's universal customer-facing product surface are narrowed by `decisions/headless-distribution-product-boundary.md`; it remains authoritative for the bundled/reference frontend and current JSON feed behavior until a later distribution contract deliberately changes those surfaces.
- `design/README.md` — design-document authority/routing and the entry point for the parallel UI workstream.
- `design/public-feed-presentation.md` — durable presentation guidance for the bundled/reference public frontend. It does not define the presentation of consuming client websites.
- `design/ui-workflow.md` — permanent `ui-polish` branch/worktree rules, presentation task boundaries, conditional `/ui-review` → `/ui-apply` design-guidance workflow, and targeted `/ui-plan` → `/ui-write` prompt workflow.
- `operations/security-reliability-and-operations.md` — managed admin perimeter, machine credential separation, distribution LKG/telemetry security, fetch safety, failure isolation, observability, recovery, and deployment security.
- `operations/source-onboarding.md` — operator-facing Source/endpoint onboarding procedure, field-by-field purpose, approved-domain configuration, RSS/Atom admission-phrase semantics, state model, HTML listing profile guidance, approval/enablement sequence, and Check-now/run interpretation.
- `operations/database-backup-and-restore.md` — governed PostgreSQL backup, restore verification, managed-backup retention, recovery validation, and launch reconfirmation procedure.
- `operations/deployment-and-incident-runbook.md` — ordered deployment/schema-upgrade/rollback procedure, reference-deployment validation, incident response, and current deployed-surface checks.
- `roadmap/mvp-roadmap.md` — historical completed Phase 0–21 MVP sequence and production-baseline handoff.
- `roadmap/2.0-planning-questions.md` — completed non-normative planning record; governing 2.0 rules have been promoted into contracts.
- `roadmap/post-1.0-roadmap.md` — **current roadmap authority**. Architecture is complete; implementation remains paused pending an owner-approved replacement sequence, with no next version assigned.
- `decisions/headless-distribution-product-boundary.md` — **Accepted ADR** for the headless product boundary and its historical 2026-08-19 decision context.
- `decisions/managed-first-self-hostable-distribution-architecture.md` — **Accepted ADR** for isolated managed/self-hostable instances, complete-stack portability, Distribution Profiles, thin integration families, and presentation ownership.
- `decisions/single-publication-simplified-data-model.md` — **Accepted ADR** for topic-independent separate deployments and singleton Publication configuration without relational tenancy. Its data-model decision remains current; route/product-surface wording is narrowed by the headless-distribution ADR.
- `decisions/production-data-and-schema-compatibility.md` — **Accepted ADR** for the Phase 20 production-baseline boundary, durable customer-data preservation, supported production migration history, and post-launch schema-upgrade evidence.
- `decisions/topic-independent-publication-model.md` — **Superseded historical ADR** retained only as decision history.
- `decisions/whitelist-and-structured-feed-first.md` — whitelist/trust and structured-feed priority.
- `decisions/original-link-and-normalized-metadata.md` — stored `original_url` reader-destination decision and normalized-metadata boundary.
- `decisions/cloudflare-access-admin-perimeter.md` — admin access boundary and deferred native identity/account system.
- `decisions/README.md` — ADR status/index.
- `history/superseded-post-1.0-phase-0-closeout.md` — tombstone for the retired unexecuted Phase 0 P2/`1.0.2` closeout; the original prompt remains available in Git history.
- `codex-model-selection.md` — detailed minimum-cost-adequate model-family/reasoning policy for `/prompt-ass`, `/prompt-plan`, `/prompt-write`, `/revalidate`, usage estimates, prompt-token discipline, and the current runner matrix. `BOOT.md` remains authoritative for executable task grammar.

Use root `BOOT.md` as the session router; it points to the narrowest authoritative document for a task.

## Normative language

**MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative.

- **MUST / MUST NOT**: required for contract compliance.
- **SHOULD / SHOULD NOT**: expected unless a documented reason justifies deviation.
- **MAY**: optional.

## Change discipline

- Locked laws are changeable only through the explicit process in `contracts/project-contract.md`; they are **locked**, not literally immutable.
- Contract changes update all affected current authorities in the same logical change.
- Code that knowingly violates a locked law is invalid even if tests pass.
- Tests that pass only because a contract-critical invariant was weakened are invalid evidence.
- New Sources, Categories, or separately deployed Publication configurations must not silently redefine Platform-wide behavior.
- Concurrent multi-Publication hosting inside one installation is not inferred from Publication configuration and requires a new explicit locked contract/ADR decision plus deliberate data-model work if ever promoted.
- Multiple distribution consumers for one Publication do not imply multi-Publication tenancy.
- Source approval/trust and consumer-specific distribution selection remain separate concerns.
- Do not introduce Publication tenant IDs/slugs/FKs/scopes solely as speculative future compatibility.
- After Phase 20 production-baseline acceptance, customer production state must be preserved under `decisions/production-data-and-schema-compatibility.md`.
- Do not implement distribution work outside the completed contracts or before the owner-approved replacement roadmap; do not promote post-2.0 adapters, native self-host auth, analytics, browser widgets, or SEO guarantees into 2.0.
- Foundational architecture changes require an Accepted/superseding ADR where appropriate.
- Design guidance under `design/` is subordinate to product/domain contracts, ADRs, roadmap, and the testing contract; it may refine the reference frontend but may not redefine supported product behavior.

## Roadmap / implementation discipline

The MVP roadmap is complete through Phase 21. Former post-1.0 Phase 0 P1 shipped the server-rendered root at package `1.0.1`. Its planned P2 closeout was retired unexecuted when the product direction changed.

**Current roadmap state:** PAUSED — 2.0 architecture/contracts complete; replacement roadmap pending owner approval.
**Current package version:** `1.0.1`.  
**Current implementation phase:** none.  
**Next roadmap version:** unassigned.

Do not run the old `p1-0` stack or infer a new phase/version from the retired frontend-centric roadmap. Write and obtain owner approval for the replacement 2.0 roadmap before normal `/prompt-ass` → `/prompt-plan` → `/prompt-write` resumes.

Historical validation artifacts describe only the source tree, environment, and observations they record. They do not redefine current contracts.
