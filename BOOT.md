# News Scraper Boot Document

This is the session initialization contract for repository-aware work in `jfin602/news-scraper`. Read it first in a new ChatGPT/Codex session.

It establishes project identity, authority, routing, workflow gates, task grammar, version transitions, and repository safety rails. It is a router/interpreter, not a substitute for the narrow governing contracts, ADRs, implementation, tests, or observed validation evidence.

## Project identity

- Repository: `jfin602/news-scraper`
- Default branch: `main`
- Parallel UI branch: `ui-polish`
- Product: reusable, topic-independent **headless news aggregation and distribution Platform**
- Deployment cardinality: exactly one Publication/topic per deployed installation
- Publication: singleton editorial/configuration state, not a relational tenant key
- Product core: approved Sources → collection → normalization → persistence/provenance → Relevance/Categories → duplicate/moderation → canonical outward Article semantics → governed distribution
- Control plane: protected administrator UI/API
- Current implemented outward surfaces: `GET /api/feed` and bundled/reference `GET /`
- Required 2.0 path: canonical eligibility → Distribution Profile → authenticated v1 API → scheduled generic PHP complete-snapshot sync → validated local LKG → customer server-rendered output
- Permanent machine interface contract: `docs/contracts/distribution-api-contract.md`
- Distribution/Profile/PHP contract: `docs/contracts/distribution-and-integration-contract.md`
- Current roadmap: `docs/roadmap/post-1.0-roadmap.md`
- Current roadmap state: **ACTIVE**
- Current implementation phase: **Phase 2 — Canonical distribution read model**
- Current package baseline: **`1.2.0`**
- Current Phase 2 task folder: **`p1-2`** when written
- Next roadmap prompt version: **`1.2.1`**
- Terminal release target: **`2.0.0`**
- Accepted production baseline: customer-launch `1.0.0`; supported customer data is durable
- Former post-1.0 Phase 0 P1: server-rendered reference root shipped at `1.0.1`
- Former Phase 0 P2/`1.0.2`: retired unexecuted and never reserved
- Initial Publication: publishing-industry news relevant to indie authors; topic behavior remains configuration

The owner-approved 2.0 roadmap keeps all implementation development in the `1.x.x` series and performs one terminal release transition from the final validated `1.7.x` candidate to `2.0.0`.

Linux VPS/Docker Compose self-host packaging, autonomous self-host production support, native self-host administrator authentication, WordPress, RSS/Atom, browser widgets, click/referral analytics, advanced SEO tooling, delta sync, and additional adapters are **post-2.0** unless a later owner-approved decision promotes them.

Self-hostability remains a locked architectural direction under Project Contract Law 12. Deferring packaging changes sequencing only; it does not permit a mandatory central News Scraper runtime dependency.

## New-session startup

For substantial project-wide repository-aware work read, in order:

1. `BOOT.md`
2. `README.md`
3. `AGENTS.md`
4. `docs/contracts/project-contract.md`
5. `docs/contracts/product-scope-and-users.md`
6. `docs/decisions/headless-distribution-product-boundary.md`
7. `docs/decisions/managed-first-self-hostable-distribution-architecture.md`
8. `docs/contracts/distribution-and-integration-contract.md`
9. `docs/contracts/distribution-api-contract.md` when machine/API behavior is relevant
10. `docs/roadmap/post-1.0-roadmap.md`
11. narrowest governing contract/ADR plus `docs/contracts/testing-and-validation-contract.md` for implementation/review work
12. relevant implementation/tests and recent changes when repository state matters

Use `docs/contracts/mvp-scope-and-users.md`, `docs/roadmap/mvp-roadmap.md`, and `docs/validation/` only when historical MVP intent/evidence matters.

For UI work also read `docs/design/README.md` and `docs/design/ui-workflow.md`. `docs/design/public-feed-presentation.md` governs only the bundled/reference frontend.

Do not read every document indiscriminately unless performing a full `/docs-review`.

## Authority and conflicts

Canonical authority is `docs/contracts/project-contract.md`:

1. locked laws;
2. explicit Project Contract invariants;
3. domain and lifecycle contracts;
4. architecture, interface, security/operations contracts, and Accepted ADRs;
5. current roadmap and implementation notes;
6. root summaries/routing (`AGENTS.md`, `README.md`, `BOOT.md`);
7. implementation;
8. historical prompts;
9. comments, commit messages, and stale notes.

`docs/contracts/testing-and-validation-contract.md` governs proof. It does not redefine product behavior or outrank the behavioral contract being tested.

Historical validation proves only what was observed against the recorded tree/environment. Existing implementation does not outrank current contracts.

Current user instruction controls task scope. A requested locked-law change is a contract-change request, not permission to silently override higher authority.

Report authoritative conflicts rather than choosing silently.

## Canonical terminology

- `Platform` — reusable headless aggregation/distribution software configured and deployed separately for topics
- `Publication` — the one configured news/editorial product for an installation; not a tenant key
- `control plane` — protected administrator UI/API
- `News Scraper instance` — independently bounded single-Publication Web/Admin + Worker + PostgreSQL + scheduler/jobs + config/secrets + interfaces
- `Distribution Profile` — named administrator-controlled post-eligibility selection that can only narrow canonically eligible Articles
- `distribution consumer` — supported API/site/adapter consuming governed normalized output
- `integration adapter` — thin transport/sync/cache/rendering layer, never an editorial/query authority
- `canonical outward Article semantics` — shared trust/visibility/duplicate/order/destination authority used by outward consumers
- `reference frontend` — bundled `GET /` consumer; supported but not the primary product identity
- `Source` — configured publisher/outlet; approval determines collection trust
- `Source endpoint` — concrete feed/API/HTML location owned by a Source
- `Collection run` — one attempt to collect one endpoint
- `Raw item` — minimally interpreted parser output
- `Article candidate` — normalized but not yet accepted
- `Article` — persisted normalized Source instance; identity is Source-scoped
- `Article observation` — endpoint/run provenance for an Article/candidate outcome
- `Duplicate group` — separately retained Articles representing one underlying published item
- `Primary article` — one group member representing that group in ordinary outward output
- `Related coverage` — distinct reporting, not a duplicate
- `Category` — installation-wide editorial grouping with immutable `config_key`
- `Relevance rule` — deterministic installation-wide include/exclude/categorize rule, optionally Source-scoped
- `Source RSS/Atom item admission filter` — Source-owned pre-normalization collection gate, distinct from Relevance and Profile filtering
- `contract` — behavior implementation must preserve
- `ADR` — decision record under `docs/decisions/`
- `task` — roadmap/correction implementation prompt under `docs/tasks/`
- `validation artifact` — durable record of evidence actually observed

Keep these distinctions explicit: Source vs endpoint; approval vs lifecycle/operational state vs health; collection admission vs Relevance vs Distribution Profile filtering; Article identity vs duplicate identity; Article visibility vs duplicate role; reference `public_status` vs canonical distribution eligibility; human admin access vs machine distribution authentication; source inspection vs executed evidence.

## Document routing

| Area                                                                      | Read first                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Locked laws / authority                                                   | `docs/contracts/project-contract.md`                                      |
| Current product scope / 2.0 boundary                                      | `docs/contracts/product-scope-and-users.md`                               |
| Distribution Profiles / filters / PHP/LKG / presentation/link policy      | `docs/contracts/distribution-and-integration-contract.md`                 |
| Permanent v1 API / schema / cursors / machine credentials / errors / CORS | `docs/contracts/distribution-api-contract.md`                             |
| Terminology / entities / persistence                                      | `docs/contracts/domain-and-data-contract.md`                              |
| Collection / safety / normalization / Relevance / identity                | `docs/contracts/source-and-collection-contract.md`                        |
| Article visibility / duplicates / Primary                                 | `docs/contracts/article-lifecycle-and-deduplication.md`                   |
| Existing `/api/feed`, `/`, current admin UX                               | `docs/contracts/public-feed-and-admin-contract.md`                        |
| Testing / evidence / DB/browser/live/deployment proof                     | `docs/contracts/testing-and-validation-contract.md`                       |
| Process/module architecture                                               | `docs/architecture/system-architecture.md`                                |
| Security / reliability / observability                                    | `docs/operations/security-reliability-and-operations.md`                  |
| Backup / restore                                                          | `docs/operations/database-backup-and-restore.md`                          |
| Deployment / rollback / incidents                                         | `docs/operations/deployment-and-incident-runbook.md`                      |
| Active 2.0 phases / versions                                              | `docs/roadmap/post-1.0-roadmap.md`                                        |
| Completed MVP history                                                     | `docs/roadmap/mvp-roadmap.md`                                             |
| Historical 2.0 planning record                                            | `docs/roadmap/2.0-planning-questions.md`                                  |
| Product-boundary ADR                                                      | `docs/decisions/headless-distribution-product-boundary.md`                |
| Managed/self-hostable architecture ADR                                    | `docs/decisions/managed-first-self-hostable-distribution-architecture.md` |
| Production data/schema compatibility                                      | `docs/decisions/production-data-and-schema-compatibility.md`              |
| Admin perimeter                                                           | `docs/decisions/cloudflare-access-admin-perimeter.md`                     |
| UI workflow                                                               | `docs/design/README.md`, then `docs/design/ui-workflow.md`                |
| Codex model selection                                                     | `docs/codex-model-selection.md`                                           |
| Documentation index                                                       | `docs/README.md`                                                          |

If a path does not exist, search for its current equivalent before assuming intentional deletion.

## High-risk project invariants

- Shared aggregation/distribution logic remains topic independent.
- One deployed installation hosts exactly one Publication/topic; multiple Profiles do not imply tenancy.
- The administrator surface is the control plane. `/` and `/api/feed` remain supported reference/legacy consumers.
- Collection trust and distribution selection are separate. Source approval does not automatically make a Source part of every Profile.
- Canonical distribution eligibility is independent of reference `public_status`; Profile selection occurs after canonical eligibility and can only narrow it.
- Every outward consumer uses the same governed Article eligibility/order/duplicate/destination authority. Adapters/controllers must not invent competing SQL or interpretation.
- Source configuration/collection is singular; Profiles do not duplicate Source collection, Article identity, or provenance.
- Source and endpoint approval/lifecycle/operational/health concepts remain distinct.
- Every fetch/redirect passes approval plus DNS/address/port/SSRF validation before contact. Article-link policy is a separate post-normalization gate.
- Parsers produce Raw items and never persist Articles.
- Normalization precedes link policy, Relevance/Categories, identity, duplicate processing, and outward use.
- Article identity is Source-scoped and transactionally idempotent.
- True-duplicate grouping retains every Source Article/provenance and has exactly one Primary.
- Article visibility is orthogonal to duplicate role.
- Web/API never collects Sources inline; Source failures remain isolated.
- Stored `original_url` remains the reader/headline destination.
- Machine `distribution:read` credentials never grant administrator authority.
- Current managed administrator access remains protected by Cloudflare Access plus direct-origin/request-integrity/resource-validation controls.
- Supported production customer data is durable from the accepted `1.0.0` baseline. Clean migration from zero does not prove production upgrade safety.
- WordPress/RSS/self-host packaging/native self-host auth and other post-2.0 capabilities must not be pulled into the current roadmap without explicit owner approval.

## Active 2.0 roadmap

The roadmap is **ACTIVE**.

| Phase   | Baseline      | Prompt versions | Goal                                                   |
| ------- | ------------- | --------------- | ------------------------------------------------------ |
| 1       | `1.1.0`       | `1.1.x`         | Distribution Profile persistence + admin control plane |
| 2       | `1.2.0`       | `1.2.x`         | Canonical distribution read model                      |
| 3       | `1.3.0`       | `1.3.x`         | Machine credentials + distribution security            |
| 4       | `1.4.0`       | `1.4.x`         | Versioned v1 distribution API                          |
| 5       | `1.5.0`       | `1.5.x`         | Generic PHP synchronization + LKG core                 |
| 6       | `1.6.0`       | `1.6.x`         | PHP local data API + customer SSR integration          |
| 7       | `1.7.0`       | `1.7.x`         | Managed integration + 2.0 release qualification        |
| Release | final `1.7.x` | —               | terminal version-only transition to `2.0.0`            |

The complete detailed phase scope/exit gates live in `docs/roadmap/post-1.0-roadmap.md` and must be re-read before phase planning.

Current phase is Phase 2. Its implementation may create the transport-independent canonical distribution Article eligibility/Profile read-model boundary, effective outward Category semantics, bounded results/history, keyset continuation positions, and deterministic snapshot revisions. It does **not** expose the v1 API, implement machine authentication or PHP/LKG, or add post-2.0 capabilities.

## Production compatibility

The accepted Phase 20 customer launch defines the first supported production source/version/schema/data baseline at `1.0.0`. Post-launch customer state is durable.

Whenever schema/persisted representation changes:

- migration from zero still passes for new/disposable installations;
- supported production state is upgraded through the real migration chain;
- governed data/relationships/provenance/editorial/moderation/duplicate state are preserved;
- backup/restore/rollback planning remains compatible;
- supported migration history is not rewritten merely for cosmetic cleanup.

Phase 1 Profile persistence required Level 4 production-forward migration proof in addition to zero-to-latest migration.

## Validation honesty

- Every implementation prompt owns focused tests and appropriate broader regression coverage.
- Producer boundaries must prove every capability later consumers require; consumers must not invent producer-owned SQL/query/cursor/state/transaction/validation/topology semantics.
- Use the narrowest useful focused command during iteration and the smallest non-overlapping final command set covering the applicable evidence.
- Evidence applies only to the exact tree/environment actually tested.
- Source inspection is not runtime/browser/database/live proof.
- Mocks do not prove PostgreSQL constraints, transactions, migrations, locks, or races.
- Required specialized suites fail clearly when prerequisites are unavailable; skips/zero-match/flakiness do not satisfy an exit gate.
- Phase/correction closeout requires a durable validation artifact tied to the accepted source tree.

Historical Phase 9 and Phase 14 evidence limitations remain historical; later evidence never rewrites what was observed earlier.

# Conversation commands

Commands are conversational shorthand, not shell commands.

## Context

### `/boot`

Refresh BOOT, root summaries, Project Contract, current product scope/ADRs, active roadmap, and the narrow governing docs for the requested work.

### `/refresh <area>`

Re-read relevant source/docs/tests/recent commits.

### `/state`

Summarize implementation state, current phase, completed work, constraints, and next logical work.

### `/route <topic>`

Identify governing contracts/ADRs/source/tests/tasks.

## Analysis

### `/audit <area>`

Compare contracts, ADRs, source, tests, recent changes, and observable behavior; report disagreements/risks.

### `/contract-check <area>`

Check implementation/tests against governing contracts/laws.

### `/doc-check <area>`

Narrow documentation consistency check; does not replace full `/docs-review`.

### `/source-trace <source or behavior>`

Trace Publication configuration → Source → endpoint → state → job/run → safety → fetch → parse/admission → normalization/link policy → Relevance → identity/observation → duplicate → health/consumers/tests.

### `/article-trace <field or concept>`

Trace Raw item → candidate → Relevance/Category → Article identity/persistence → observations → overrides → duplicate role → canonical outward semantics → consumers/tests.

### `/blast-radius <change>`

Identify affected contracts, ADRs, schema/migrations, jobs/services/routes/read models/UI/tests/docs.

### `/regression <behavior>`

Trace suspected regression to likely change, affected invariants, missing test protection, and required evidence.

# Documentation workflow

## `/docs-review`

Read-only. Default scope is tracked `.md`/`.txt` excluding task and validation artifacts unless narrowed. Report contradictions, drift, stale statements, duplicated authority, missing references, and recommended changes. Never modify files.

## `/docs-apply`

Apply only approved documentation findings after re-reading current targets. Do not alter source, migrations, tests, dependencies, runtime config, or package version unless separately explicitly authorized.

## `/docs-prompt`

Docs-only prompt-generation alternative after an approved `/docs-review`. Normally uses `npm run docs:snapshot` and the supplied docs snapshot. It emits one implementation-ready Codex docs prompt and does not implement product work.

# Implementation prompt workflow

Strict order:

```text
/prompt-ass
→ /prompt-plan
→ /prompt-write <folder name>
```

The roadmap is now active, so this workflow is authorized for the current phase. Do not skip stages.

Current invocation target:

```text
/prompt-ass Phase 2
→ /prompt-plan
→ /prompt-write p1-2
```

If requirements/docs/repository state materially conflict, return `Planning needed` rather than silently changing the roadmap.

## `/prompt-ass`

Determine safe task boundaries from the active roadmap and governing contracts. No writes.

Return target behavior, constraints, roadmap phase, stack type, prompt count/order, goal/summary/dependencies/boundary rationale/deferred behavior, closeout task, and provisional model/usage recommendations.

Explicitly assess producer→consumer boundaries. Split transactional/state-machine work from separately consumed read/API work when consumers, tests, or failure risks differ materially. Testing is part of task decomposition.

For current Phase 2, plan only the canonical distribution read-model foundation and its downstream handoff to the machine-authentication and API phases.

## `/prompt-plan`

Requires completed `/prompt-ass`. Inspect contracts/ADRs, implementation, migrations, helpers/consumers/tests, recent changes, likely file scope, preserved behavior, risks, focused/broader tests, evidence levels, docs effects, acceptance, and non-goals.

For every producer→consumer dependency record:

`downstream-required capability → owning implementation/export → focused proof`

If the consumer would need to invent producer-owned semantics, return `Planning needed`.

Reassess model/effort using the minimum-cost-adequate rule and produce the smallest non-overlapping final validation command set.

## `/prompt-write <folder name>`

Requires an unblocked `/prompt-plan`. Revalidate current repo/docs and write ordered prompts under `docs/tasks/<folder name>/`.

Current Phase 2 folder is `p1-2`.

Each roadmap prompt includes exact runner metadata, finalized model/reasoning/usage block, focused iterative validation, smallest non-overlapping final validation, downstream handoff gates where relevant, package-version rules, acceptance, and non-goals.

When local execution is available run:

```text
npm run codex:phase:validate -- p1-2
```

before reporting the stack ready.

# Codex phase-runner grammar

The shared parser is `scripts/codex-phase-core.mjs`.

## Common

- every `.txt` in a task folder is a prompt;
- filenames: `P<number>-<lower-kebab-slug>.txt`;
- numbering one-based, contiguous from P1;
- exactly one final closeout prompt;
- closeout filename and `TASK:` title both signal `closeout`;
- every prompt has exactly one valid `- Recommended configuration: `<MODEL_CONFIGS label>`.` line.

## Post-1.0 roadmap phases

- folder: `p1-<phase>`;
- header: `TASK: Phase <phase> / P<number> — <title>`;
- exactly one phrase `assigned project version is` followed by `1.<phase>.<prompt number>`;
- no correction unchanged-version metadata.

The runner detects completed implementation prompts from exact reachable commit subjects and requires package version to match the Git-proven completed prefix. With no completed Phase 2 prompt, `p1-2` expects baseline `1.2.0`.

## Corrections

- folder: `c<phase>-<lower-kebab-slug>`;
- header: `TASK: Correction <phase> / P<number> — <title>`;
- exactly one unchanged-version metadata line matching `package.json`;
- no assigned-version phrase;
- correction closeout does not advance roadmap version.

Corrections are only for genuine bounded regressions/repairs and must not smuggle roadmap product capability.

# Phase handoff and `/closeout`

After a non-terminal phase has passed its final closeout prompt and durable validation gate:

```text
phase implementation
→ final phase closeout prompt
→ human review
→ /closeout
→ /docs-review
→ /docs-apply
→ /prompt-ass next phase
→ /prompt-plan
→ /prompt-write p1-<next phase>
```

## Non-terminal `/closeout`

`/closeout` is a bounded version/state transition, not a fresh audit.

Fast path:

1. read BOOT plus the completed/next roadmap entries;
2. read the completed phase durable validation artifact and accepted source SHA;
3. read `package.json` and task/version sequence;
4. compare accepted SHA to current `main` for relevant unvalidated executable drift;
5. if green, update only top-level `package.json` to the exact successor baseline in the roadmap;
6. compare transition and require package-version-only change;
7. report GREEN, transition SHA, next P1 version, and freshly read next phase entry.

Successor baselines are:

- Phase 1 → `1.2.0`
- Phase 2 → `1.3.0`
- Phase 3 → `1.4.0`
- Phase 4 → `1.5.0`
- Phase 5 → `1.6.0`
- Phase 6 → `1.7.0`

Do not rerun full validation during `/closeout`; use the recorded accepted evidence and one drift comparison. Relevant executable drift blocks transition.

## Terminal Phase 7 `/closeout`

Phase 7 is terminal for this roadmap.

After its final closeout prompt is reviewed and its durable validation artifact proves the complete managed external-site 2.0 gate against the exact accepted final `1.7.x` tree, `/closeout` performs exactly one version-only release transition:

```text
final validated 1.7.x
→ top-level package.json version only
→ 2.0.0
```

It MUST:

- create no `1.8.0` baseline;
- create no `2.0.1` development candidate;
- change no source, migration, test, dependency, config, or docs in the version transition itself;
- verify the complete transition diff is package-version-only;
- report `Roadmap status: COMPLETE` and final `2.0.0` state.

This terminal rule is the 2.0 analogue of the already-completed historical Phase 21 transition to `1.0.0`.

# Versioning

- `package.json` is the sole current-version authority.
- Current version is `1.2.0`.
- Phase prompt versions are `1.<phase>.<prompt>`.
- Non-terminal baseline transitions are `1.<next phase>.0`.
- Final release only is `2.0.0`.
- There are no planned `2.0.x` development builds before the release.
- `1.0.2` remains retired/unassigned historical space and is not reused.
- UI/docs/correction work is non-versioned unless explicitly authorized otherwise.

# Parallel UI workflow

UI presentation work uses permanent branch `ui-polish` and a separate worktree when roadmap/correction work is active. It is non-versioned and never advances roadmap state.

Normal path:

```text
/ui-plan
→ /ui-write
```

If durable design guidance must change:

```text
/ui-review
→ explicit approval
→ /ui-apply
→ rerun /ui-plan
→ /ui-write
```

The bundled/reference frontend UI work does not govern customer-site integration presentation.

# Working preferences

- Inspect current source/docs before planning.
- Prefer the smallest coherent, independently reviewable task boundaries.
- State preserved behavior and non-goals.
- Trace shared producers and all important consumers before changing shared behavior.
- Treat database constraints/transactions, idempotency, provenance, security, failure behavior, and backward compatibility as first-class review concerns.
- Do not substitute stronger models for oversized task boundaries.
- Keep adapters thin; do not let later consumers invent producer-owned SQL/query/state/cursor semantics.
- Use focused iteration and non-overlapping final validation.
- Do not claim tests/runtime/browser/database/live behavior unless actually observed.
- Never invent repository state, Source behavior, or validation results.

# Decision and review commands

- `/review <commit, PR, task, implementation>` — review against contracts/architecture/tests, not only happy path
- `/prove <behavior>` — identify/execute appropriate evidence when tools/environment allow
- `/test-matrix <feature>` — map behavior to focused/regression/evidence levels
- `/lock <decision>` — treat decision as authoritative and identify docs that must reflect it; no write unless instructed
- `/recommend` — choose best option using current contracts/roadmap/value/risk
- `/status` — return Completed / Current / Blocked / Next
- `/next` — recommend one logical next task

## Current next action

The roadmap is active and Phase 2 is authorized. The next normal implementation-planning command is:

```text
/prompt-ass Phase 2
```

which should decompose the canonical distribution read model into the smallest safe `p1-2` prompt stack before `/prompt-plan` and `/prompt-write p1-2`.
