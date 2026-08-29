# News Aggregation Platform Documentation

This directory is the source of truth for product and engineering contracts in `jfin602/news-scraper`.

News Scraper is governed as a reusable, topic-independent **headless news aggregation and distribution Platform**. Each deployed installation hosts exactly one singleton Publication representing one customer/editorial property and governed content universe. A Publication may contain multiple related subjects, verticals, or feed sections exposed through Distribution Profiles. Subject vocabulary, Sources, Relevance rules, Categories, branding, Profile composition, and distribution configuration belong to singleton Publication/configuration state rather than shared aggregation-engine code.

Publication is an editorial/configuration concept, not a relational tenancy key. Sources, Articles, observations, jobs, Categories, Relevance rules, duplicate state, and Profiles use installation/Source relationships directly rather than Publication tenant scoping. Several Profile feeds within one Publication do not introduce vertical tenant keys or concurrent Publications.

The administrator surface is the instance-owned Platform control plane. The implemented 2.0 path is canonical eligibility → Distribution Profile → authenticated v1 API → generic PHP complete-snapshot synchronization → local last-known-good data → normalized local-read → customer server-rendered output. Current implemented outward surfaces are authenticated `GET /api/v1/distribution/{profile_key}`, legacy/reference `GET /api/feed`, and bundled/reference `GET /`.

The accepted `1.0.0` customer launch established the first supported production schema/data baseline. The seven-phase 2.0 roadmap is complete at release baseline `2.0.0`. The owner-approved 3.0 roadmap is **active in Phase 2** at `2.2.0`. Phase 1 Gemini Profile digest foundation is GREEN/owner-accepted after live qualification; owner-approved correction `c1-digest-style` is the immediate unchanged-version stack before normal Phase 2 prompts begin at `2.2.1` in `p2-2`. Phase 2 is the mandatory PHP integration release-hardening/customer-package gate before later chatbot and multi-feed work; Phase 3 adds Profile-grounded chat, Phase 4 proves the multi-feed customer deployment, and Phase 5 owns remaining observed admin/PHP hardening. The accepted N6WD correction already owns the bounded persisted Article-summary invariant consumed by the completed digest foundation.

The completed owner-approved Phase 1 Gemini worksheet has been incorporated into the governing AI/distribution contracts and current roadmap. It is retained as the detailed historical decision record used to resolve cadence, input/output bounds, digest lifecycle, API/PHP propagation, admin controls, freshness, supporting references, and the later customer package handoff. Later approved amendments such as `c1-digest-style` belong in current contracts/roadmap rather than rewriting that worksheet.

The 3.0 AI behavior is governed by `contracts/ai-assistance-contract.md`. Gemini is optional and downstream of canonical Profile output; ordinary non-AI collection/distribution/PHP Article rendering must remain independently operable when AI is unavailable.

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
│   ├── ai-assistance-contract.md
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
│   ├── 2.0-planning-questions.md
│   ├── post-1.0-roadmap.md                  # completed 2.0 history
│   ├── 3.0-roadmap.md                       # owner-approved / active Phase 2
│   ├── phase-1-gemini-summary-worksheet.md # completed owner-approved Phase 1 decisions
│   └── 3.0-changelog.md                     # brief accepted-history companion
├── decisions/
│   ├── README.md
│   ├── headless-distribution-product-boundary.md
│   ├── managed-first-self-hostable-distribution-architecture.md
│   ├── single-publication-multi-vertical-editorial-property.md
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
├── tasks/           # roadmap/correction implementation prompt stacks, including completed history
└── validation/      # durable observed validation artifacts / implementation closeout evidence
```

Git does not track empty directories, so `testing/`, `tasks/`, `design/tasks/`, and `validation/` may not exist until substantive files are created there. Do not create placeholder testing plans or empty validation artifacts.

The tracked docs-maintenance handoff lives outside `docs/` at repository-root `.codex/docs-prompt.txt`. `/docs-prompt` creates or replaces that single file and commits it on `main`; it is a transient handoff slot with durable Git history, not a roadmap/correction task and not input to `codex:phase`. The generated prompt must require its consumer to fetch/check `origin/main` and stop before editing if the local checkout is stale or does not contain the current prompt-file commit.

## Document routing

- `contracts/project-contract.md` — locked Platform laws, authority hierarchy, singleton Publication/editorial-property boundary, headless product/output law, original-publisher destination law, and derived production-data/AI invariants.
- `contracts/product-scope-and-users.md` — **current post-2.0 product scope**, multi-vertical Publication interpretation, implemented distribution baseline, and active 3.0 direction.
- `contracts/ai-assistance-contract.md` — **current owner-approved 3.0 AI contract** for the completed Phase 1 Gemini Profile digest, bounded Profile digest writing-style amendment, and later Profile-grounded chat: bounded Profile grounding, digest input/output/lifecycle, Profile AI administration, prompt/content trust, citations/supporting references, secrets, later chat authorization/cost controls, failure isolation, and topic independence.
- `contracts/distribution-and-integration-contract.md` — Distribution Profiles, filters, PHP/LKG/local-read behavior, multi-Profile isolation, adapter/presentation/link boundaries, completed Phase 1 digest propagation, and the owner-approved active Phase 2 package/configuration/customer-integration target.
- `integrations/php/README.md` — implemented PHP synchronization/LKG/local-read/customer-consumption operational and library guide; ordinary customer code consumes its normalized local-read boundary rather than cache file formats. This remains implementation-truth documentation and changes when the corresponding Phase 2 package behavior actually ships.
- `contracts/distribution-api-contract.md` — permanent v1 Profile API, schema, revisions/cursors, machine credentials, response classes, rate limits, CORS stance, and the compatible additive top-level Phase 1 `digest` field.
- `contracts/mvp-scope-and-users.md` — **historical** scope for the accepted `1.0.0` standalone-feed MVP; useful for interpreting completed MVP work but not current product direction.
- `contracts/domain-and-data-contract.md` — canonical terminology, singleton Publication/editorial-property configuration, real entity relationships, Source/Article identity/provenance, Category/Relevance persistence, Source RSS/Atom admission Include/Exclude configuration, Distribution Profiles, and schema lifecycle.
- `contracts/testing-and-validation-contract.md` — project-wide regression law, evidence levels, Test Necessity Matrix, Test Environment Matrix, `RUN`/`DEFER`/`N/A` selection, qualification-gate ownership, exact-tree cross-environment evidence, command containment, prerequisite/retry policy, PostgreSQL/fixture/browser/live-provider validation, production-upgrade validation, and completion gates. The final integrated Phase 2 candidate is the explicit earlier PHP/VPS/reference-customer qualification exception before package replacement.
- `architecture/system-architecture.md` — implemented deployment/process/module boundaries, completed downstream digest ownership, and the active Phase 2 PHP package/configuration target while distinguishing current implementation truth from planned hardening.
- `contracts/source-and-collection-contract.md` — approval/bootstrap rules, network safety, bounded static HTML profiles/preview, collection adapters, RSS/Atom-only Source Include/Exclude item admission, normalization, installation/Source-scoped Relevance execution, Source-scoped identity/idempotency, and Collection-run accounting.
- `contracts/article-lifecycle-and-deduplication.md` — Article visibility, Source-scoped identity, duplicate roles/review/groups, Primary selection, and current outward/public eligibility semantics.
- `contracts/public-feed-and-admin-contract.md` — existing `GET /`, `GET /api/feed`, search/filter/theme behavior, external links, and Cloudflare-protected admin UX, including the Phase 2 Source Exclude controls and version-coherent PHP package download requirement. Its historical one-topic wording is narrowed by Project Contract Law 11 and `decisions/single-publication-multi-vertical-editorial-property.md`; the reference frontend remains a singleton-Publication consumer and does not become a Profile/Publication selector automatically.
- `design/README.md` — design-document authority/routing and the entry point for the parallel UI workstream.
- `design/public-feed-presentation.md` — durable presentation guidance for the bundled/reference public frontend. It does not define the presentation of consuming client websites.
- `design/ui-workflow.md` — permanent `ui-polish` branch/worktree rules, presentation task boundaries, conditional `/ui-review` → `/ui-apply` design-guidance workflow, and targeted `/ui-plan` → `/ui-write` prompt workflow.
- `operations/security-reliability-and-operations.md` — managed admin perimeter, machine credential separation, distribution LKG/telemetry security, fetch safety, Gemini secret/content/digest-lifecycle failure isolation, observability, recovery, and deployment security without treating active roadmap requirements as already-observed runtime behavior.
- `operations/source-onboarding.md` — operator-facing Source/endpoint onboarding procedure, field-by-field purpose, approved-domain configuration, RSS/Atom Include/Exclude admission semantics, state model, HTML listing profile guidance, approval/enablement sequence, and Check-now/run interpretation.
- `operations/database-backup-and-restore.md` — governed PostgreSQL backup, restore verification, managed-backup retention, recovery validation, and launch reconfirmation procedure.
- `operations/deployment-and-incident-runbook.md` — ordered deployment/schema-upgrade/rollback procedure, reference-deployment validation, incident response, and deployed-surface checks. Self-host packaging remains outside current scope unless promoted.
- `roadmap/mvp-roadmap.md` — historical completed Phase 0–21 MVP sequence and production-baseline handoff.
- `roadmap/2.0-planning-questions.md` — completed non-normative planning record; later owner decisions and governing contracts/roadmaps control current scope.
- `roadmap/post-1.0-roadmap.md` — **completed historical 2.0 roadmap authority**: seven 1.x development phases and the owner-accepted terminal `2.0.0` release transition.
- `roadmap/3.0-roadmap.md` — **current owner-approved active roadmap authority**; Phase 1 is complete, Phase 2 is current at `2.2.0`, `c1-digest-style` is the immediate unchanged-version correction before normal `p2-2` work begins at `2.2.1`, and the terminal `3.0.0` gate remains owner-controlled/TBD.
- `roadmap/phase-1-gemini-summary-worksheet.md` — **completed owner-approved Phase 1 planning record** whose decisions were promoted into the current AI/distribution contracts and roadmap before implementation; later amendments remain in current contracts/roadmap rather than rewriting the historical worksheet.
- `roadmap/3.0-changelog.md` — **brief non-authoritative accepted-history companion** for material 3.0 roadmap work, decisions, transitions, and closeouts; it summarizes accepted changes but never substitutes for contracts, roadmap authority, or validation evidence.
- `decisions/single-publication-multi-vertical-editorial-property.md` — **Accepted current Publication interpretation**: one customer/editorial property may contain multiple subject verticals/feeds through Profiles without tenancy.
- `decisions/headless-distribution-product-boundary.md` — **Accepted ADR** for the headless product boundary and its historical 2026-08-19 decision context.
- `decisions/managed-first-self-hostable-distribution-architecture.md` — **Accepted ADR** for isolated managed/self-hostable instances, complete-stack portability, Distribution Profiles, thin integration families, presentation ownership, and later AI direction.
- `decisions/single-publication-simplified-data-model.md` — **Accepted ADR** for singleton Publication configuration without relational tenancy. The 2026-08-27 multi-vertical ADR amends only its historical one-Publication/one-topic interpretation.
- `decisions/production-data-and-schema-compatibility.md` — **Accepted ADR** for the Phase 20 production-baseline boundary, durable customer-data preservation, supported production migration history, and post-launch schema-upgrade evidence.
- `decisions/topic-independent-publication-model.md` — **Superseded historical ADR** retained only as decision history.
- `decisions/whitelist-and-structured-feed-first.md` — whitelist/trust and structured-feed priority.
- `decisions/original-link-and-normalized-metadata.md` — stored `original_url` reader-destination decision and normalized-metadata boundary.
- `decisions/cloudflare-access-admin-perimeter.md` — admin access boundary and deferred native identity/account system.
- `decisions/README.md` — ADR status/index.
- `history/superseded-post-1.0-phase-0-closeout.md` — tombstone for the retired unexecuted Phase 0 P2/`1.0.2` closeout; the original prompt remains available in Git history.
- `codex-model-selection.md` — detailed minimum-cost-adequate model-family/reasoning policy for `/prompt-ass`, `/prompt-plan`, `/prompt-write`, `/revalidate`, usage estimates, prompt-token discipline, and the required prompt validation manifest. `BOOT.md` remains authoritative for executable task grammar.
- repository-root `.codex/docs-prompt.txt` — tracked transient docs-maintenance execution handoff written by `/docs-prompt`; consumers must update/check `main` before running it, and it is outside roadmap/correction task grammar.

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
- New Sources, Categories, subject verticals, or Distribution Profiles must not silently redefine Platform-wide shared-engine behavior.
- Concurrent multi-Publication hosting inside one installation is not inferred from multi-vertical Publication configuration and requires a new explicit locked contract/ADR decision plus deliberate data-model work if ever promoted.
- Multiple Distribution Profiles/verticals for one Publication do not imply multi-Publication tenancy or vertical Article ownership keys.
- Source approval/trust and consumer-specific distribution selection remain separate concerns.
- Do not introduce Publication tenant IDs/slugs/FKs/scopes solely as speculative future compatibility or merely to distinguish Profile feeds.
- After Phase 20 production-baseline acceptance, customer production state must be preserved under `decisions/production-data-and-schema-compatibility.md`.
- The 2.0 roadmap is complete. Follow `roadmap/3.0-roadmap.md` for the active post-2.0 direction; Phase 1 is complete and Phase 2 is current at `2.2.0` before chatbot/multi-feed expansion.
- Do not promote self-host packaging, WordPress, RSS/Atom, native self-host auth, analytics, browser widgets, advanced SEO, or other deferred product families into 3.0 without a new owner-approved contract/roadmap decision.
- AI must remain downstream of canonical Profile output and optional for ordinary operation; it cannot become an editorial/eligibility authority or a secret-bearing browser feature.
- Foundational architecture changes require an Accepted/superseding/amending ADR where appropriate.
- Design guidance under `design/` is subordinate to product/domain contracts, ADRs, roadmap, and the testing contract; it may refine the reference frontend but may not redefine supported product behavior.

## Roadmap / implementation discipline

The MVP roadmap is complete through Phase 21. Former post-1.0 Phase 0 P1 shipped the server-rendered root at package `1.0.1`. Its planned P2 closeout was retired unexecuted when the product direction changed.

The seven-phase 2.0 roadmap is COMPLETE at release baseline `2.0.0`.

**Current roadmap state:** OWNER-APPROVED / ACTIVE — PHASE 2.  
**Current package baseline:** `2.2.0`.  
**Completed Phase 1:** Gemini Profile digest foundation — GREEN / OWNER-ACCEPTED.  
**Immediate implementation stack:** `c1-digest-style` at unchanged `2.2.0`.  
**Current roadmap task folder after correction:** `p2-2`.  
**First Phase 2 prompt version:** `2.2.1`.  
**Phase 2 gate:** PHP integration release hardening and customer package refresh/deployment with final integrated PHP/VPS/reference-customer qualification.  
**Planned terminal release:** `3.0.0`, with terminal exit gate intentionally owner-controlled/TBD.

The active task family is `p2-<phase>` / `2.<phase>.<prompt>`. The runner compatibility correction is GREEN/owner-accepted and preserves historical major-0, major-1, and correction behavior.

The accepted `c1-n6wd` correction already owns the normalized/persisted 4,000-code-point Article-summary invariant and additive production migration. Later AI work consumes that producer boundary rather than duplicating it.

The completed Phase 1 worksheet has already been promoted into the governing AI/distribution contracts and roadmap. Current work uses those promoted semantics plus later accepted amendments; the historical worksheet is not reopened to make later decisions appear original.

After `c1-digest-style` closes, normal Phase 2 implementation planning proceeds with `/prompt-ass` → `/prompt-plan` → `/prompt-write p2-2`.

Historical validation artifacts describe only the source tree, environment, and observations they record. They do not redefine current contracts. In particular, the Phase 7 artifact truthfully records the owner's explicit release-evidence exception rather than proving the unexecuted formal Phase 7 prompt sequence.