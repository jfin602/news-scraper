# News Scraper Boot Document

This is the session initialization contract for repository-aware work in `jfin602/news-scraper`. Read it first in a new ChatGPT/Codex session.

It establishes project identity, authority, routing, workflow gates, task grammar, version transitions, and repository safety rails. It is a router/interpreter, not a substitute for the narrow governing contracts, ADRs, implementation, tests, or observed validation evidence.

## Project identity

- Repository: `jfin602/news-scraper`
- Default branch: `main`
- Parallel UI branch: `ui-polish`
- Product: reusable, topic-independent **headless news aggregation and distribution Platform**
- Deployment cardinality: exactly one singleton Publication/editorial property per deployed installation; one Publication MAY contain multiple related subject verticals/feeds through Distribution Profiles
- Publication: singleton customer/editorial configuration state, not a relational tenant key
- Product core: approved Sources → collection → normalization → persistence/provenance → Relevance/Categories → duplicate/moderation → canonical outward Article semantics → governed distribution
- Control plane: protected administrator UI/API
- Current implemented outward surfaces: authenticated `GET /api/v1/distribution/{profile_key}`, legacy/reference `GET /api/feed`, and bundled/reference `GET /`
- Implemented 2.0 path: canonical eligibility → Distribution Profile → authenticated v1 API → scheduled generic PHP complete-snapshot sync → validated local LKG → normalized local-read → customer server-rendered output
- Permanent machine interface contract: `docs/contracts/distribution-api-contract.md`
- Distribution/Profile/PHP contract: `docs/contracts/distribution-and-integration-contract.md`
- AI assistance contract: `docs/contracts/ai-assistance-contract.md`
- Current roadmap: `docs/roadmap/3.0-roadmap.md`
- Current roadmap changelog: `docs/roadmap/3.0-changelog.md`
- Current Phase 1 planning record: `docs/roadmap/phase-1-gemini-summary-worksheet.md` — COMPLETE / OWNER-APPROVED
- Current roadmap state: **OWNER-APPROVED / ACTIVE — PHASE 1**
- Current package baseline: **`2.1.0`**
- Current implementation phase: **Phase 1 — Gemini Profile digest foundation**
- Current roadmap grammar: `p2-<phase>` with target versions `2.<phase>.<prompt>`, implemented and owner-accepted
- Next prompt version: **`2.1.1`**
- Planned Phase 2: PHP integration correction and Gemini-capable customer package refresh/deployment
- Planned Phase 3: Profile-grounded "Ask this feed" chatbot
- Planned Phase 4: multi-feed customer proof for publishing news, opportunities, and indie filmmaking from one singleton Publication/editorial property
- Planned Phase 5: admin/PHP integration tightening based on real observed friction
- Planned terminal release target: **`3.0.0`**, with terminal exit gate intentionally owner-controlled/TBD
- Completed prior roadmap: `docs/roadmap/post-1.0-roadmap.md` reached `2.0.0` on 2026-08-27
- Accepted production baseline: customer-launch `1.0.0`; supported customer data is durable
- Former post-1.0 Phase 0 P1: server-rendered root shipped at `1.0.1`
- Former Phase 0 P2/`1.0.2`: retired unexecuted and never reserved
- Initial customer Publication began with publishing-industry news relevant to indie authors; shared behavior remains topic independent and the same Publication may now contain related opportunities/filmmaking verticals through Profiles

The owner-approved 2.0 roadmap is complete. Its historical task grammar and validation artifacts remain authoritative only for the trees/evidence they recorded. The terminal `2.0.0` transition was package-version-only and did not itself add new runtime behavior.

The owner-approved 3.0 roadmap is active at `2.1.0`. The post-2.0 runner compatibility correction is GREEN/owner-accepted and the `p2-<phase>` / `2.<phase>.<prompt>` family is executable. Correction `c1-n6wd` is likewise GREEN/owner-accepted, so Phase 1 consumes the existing 4,000-code-point persisted Article summary invariant rather than re-implementing it.

The completed Phase 1 Gemini worksheet has been incorporated into the governing AI/distribution contracts and roadmap. Phase 1 planning must use its locked cadence, input bounds, output schema, digest identity/lifecycle, v1/PHP propagation, admin-control, freshness, supporting-link, and presentation-boundary decisions rather than inventing alternatives.

Linux VPS/Docker Compose self-host packaging, autonomous self-host production support, native self-host administrator authentication, WordPress, RSS/Atom, browser widgets, click/referral analytics, advanced SEO tooling, delta sync, and additional adapters remain outside the current committed 3.0 scope unless a later owner-approved decision promotes them.

Self-hostability remains a locked architectural direction under Project Contract Law 12. Deferring packaging changes sequencing only; it does not permit a mandatory central News Scraper runtime dependency. Optional Gemini assistance must likewise remain non-mandatory for ordinary non-AI operation.

## New-session startup

For substantial project-wide repository-aware work read, in order:

1. `BOOT.md`
2. `README.md`
3. `AGENTS.md`
4. `docs/contracts/project-contract.md`
5. `docs/contracts/product-scope-and-users.md`
6. `docs/decisions/single-publication-multi-vertical-editorial-property.md`
7. `docs/decisions/headless-distribution-product-boundary.md`
8. `docs/decisions/managed-first-self-hostable-distribution-architecture.md`
9. `docs/contracts/distribution-and-integration-contract.md`
10. `docs/contracts/distribution-api-contract.md` when machine/API behavior is relevant
11. `docs/contracts/ai-assistance-contract.md` when Gemini/digest/chat behavior is relevant
12. `docs/roadmap/3.0-roadmap.md`
13. `docs/roadmap/phase-1-gemini-summary-worksheet.md` when Phase 1 planning/history is relevant
14. `docs/roadmap/post-1.0-roadmap.md` only when completed 2.0 history/version sequencing is relevant
15. narrowest governing contract/ADR plus `docs/contracts/testing-and-validation-contract.md` for implementation/review work
16. relevant implementation/tests and recent changes when repository state matters

Use `docs/contracts/mvp-scope-and-users.md`, `docs/roadmap/mvp-roadmap.md`, and `docs/validation/` only when historical MVP intent/evidence matters. Historical 2.0 task/validation documents remain useful for interpreting implemented boundaries but do not override the current 3.0 contracts/roadmap.

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

- `Platform` — reusable headless aggregation/distribution software; shared behavior remains topic independent
- `Publication` — the one configured customer/editorial property and governed content universe for an installation; not a tenant key and not necessarily one narrow topic
- `subject vertical` / `feed section` — a customer-facing subject/feed concept inside the singleton Publication; does not create Article ownership or tenancy
- `control plane` — protected administrator UI/API
- `News Scraper instance` — independently bounded single-Publication Web/Admin + Worker + PostgreSQL + scheduler/jobs + config/secrets + interfaces
- `Distribution Profile` — named administrator-controlled post-eligibility selection that can only narrow canonically eligible Articles; supported independent feed/section boundary within the singleton Publication
- `distribution consumer` — supported API/site/adapter consuming governed normalized output
- `integration adapter` — thin transport/sync/cache/rendering layer, never an editorial/query authority
- `AI assistance` — optional downstream Profile-grounded digest/chat behavior; never an editorial/eligibility authority
- `Profile digest` — optional durable AI summary state for one Profile, generated only from bounded canonical Profile input and distributed as part of the complete Profile snapshot
- `digestInputIdentity` — internal identity of exact bounded governed digest input plus relevant Profile AI configuration; distinct from outward `snapshotRevision`
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

Keep these distinctions explicit: Publication vs subject vertical vs Profile; Source vs endpoint; approval vs lifecycle/operational state vs health; collection admission vs Relevance vs Distribution Profile filtering; Article identity vs duplicate identity; Article visibility vs duplicate role; reference `public_status` vs canonical distribution eligibility; `digestInputIdentity` vs outward `snapshotRevision`; local Profile/LKG stale age vs digest freshness; human admin access vs machine distribution authentication vs later AI spending authority; source inspection vs executed evidence; local orchestration test vs live Gemini proof.

## Document routing

| Area                                                                      | Read first                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Locked laws / authority                                                   | `docs/contracts/project-contract.md`                                      |
| Current product scope / post-2.0 direction                                | `docs/contracts/product-scope-and-users.md`                               |
| Singleton Publication / multi-vertical interpretation                     | `docs/decisions/single-publication-multi-vertical-editorial-property.md`  |
| Distribution Profiles / filters / PHP/LKG / presentation/link policy      | `docs/contracts/distribution-and-integration-contract.md`                 |
| PHP synchronization / LKG / local-read implementation details             | `integrations/php/README.md`                                               |
| Permanent v1 API / schema / cursors / machine credentials / errors / CORS | `docs/contracts/distribution-api-contract.md`                             |
| Gemini digest / chat / grounding / AI security                            | `docs/contracts/ai-assistance-contract.md`                                |
| Phase 1 Gemini planning decisions                                         | `docs/roadmap/phase-1-gemini-summary-worksheet.md`                        |
| Terminology / entities / persistence                                      | `docs/contracts/domain-and-data-contract.md`                              |
| Collection / safety / normalization / Relevance / identity                | `docs/contracts/source-and-collection-contract.md`                        |
| Article visibility / duplicates / Primary                                 | `docs/contracts/article-lifecycle-and-deduplication.md`                   |
| Existing `/api/feed`, `/`, current admin UX                               | `docs/contracts/public-feed-and-admin-contract.md`                        |
| Testing / necessity / environments / evidence / completion gates          | `docs/contracts/testing-and-validation-contract.md`                       |
| Process/module architecture                                               | `docs/architecture/system-architecture.md`                                |
| Security / reliability / observability                                    | `docs/operations/security-reliability-and-operations.md`                  |
| Backup / restore                                                          | `docs/operations/database-backup-and-restore.md`                          |
| Deployment / rollback / incidents                                         | `docs/operations/deployment-and-incident-runbook.md`                      |
| Current 3.0 roadmap / versions                                            | `docs/roadmap/3.0-roadmap.md`                                             |
| Current 3.0 accepted-history summary                                      | `docs/roadmap/3.0-changelog.md`                                           |
| Completed 2.0 roadmap history                                             | `docs/roadmap/post-1.0-roadmap.md`                                        |
| Completed MVP history                                                     | `docs/roadmap/mvp-roadmap.md`                                             |
| Historical 2.0 planning record                                            | `docs/roadmap/2.0-planning-questions.md`                                  |
| Product-boundary ADR                                                      | `docs/decisions/headless-distribution-product-boundary.md`                |
| Managed/self-hostable architecture ADR                                    | `docs/decisions/managed-first-self-hostable-distribution-architecture.md` |
| Production data/schema compatibility                                      | `docs/decisions/production-data-and-schema-compatibility.md`              |
| Admin perimeter                                                           | `docs/decisions/cloudflare-access-admin-perimeter.md`                     |
| UI workflow                                                               | `docs/design/README.md`, then `docs/design/ui-workflow.md`                |
| Codex model selection / prompt validation manifest                        | `docs/codex-model-selection.md`                                           |
| Documentation index                                                       | `docs/README.md`                                                          |

If a path does not exist, search for its current equivalent before assuming intentional deletion.

## High-risk project invariants

- Shared aggregation/distribution/AI orchestration remains topic independent.
- One deployed installation hosts exactly one singleton Publication/editorial property. The Publication MAY contain multiple related subject verticals/feeds; multiple Profiles/verticals do not imply tenancy.
- Distribution Profiles are the supported independently configured feed/section boundary and can only narrow canonically eligible Articles.
- The administrator surface is the control plane. `/` and `/api/feed` remain supported reference/legacy consumers.
- Collection trust and distribution selection are separate. Source approval does not automatically make a Source part of every Profile.
- Canonical distribution eligibility is independent of reference `public_status`; Profile selection occurs after canonical eligibility and can only narrow it.
- Every outward consumer uses the same governed Article eligibility/order/duplicate/destination authority. Adapters/controllers/AI services must not invent competing SQL or interpretation.
- Source configuration/collection is singular; Profiles do not duplicate Source collection, Article identity, or provenance.
- Source and endpoint approval/lifecycle/operational/health concepts remain distinct.
- Every fetch/redirect passes approval plus DNS/address/port/SSRF validation before contact. Article-link policy is a separate post-normalization gate.
- Parsers produce Raw items and never persist Articles.
- Normalization precedes link policy, Relevance/Categories, identity, duplicate processing, outward use, and AI grounding.
- Article identity is Source-scoped and transactionally idempotent.
- True-duplicate grouping retains every Source Article/provenance and has exactly one Primary.
- Article visibility is orthogonal to duplicate role.
- Web/API never collects Sources inline; Source failures remain isolated.
- Stored `original_url` remains the reader/headline destination.
- Machine `distribution:read` credentials never grant administrator authority or silently authorize unlimited billable interactive AI.
- Current managed administrator access remains protected by Cloudflare Access plus direct-origin/request-integrity/resource-validation controls.
- Supported production customer data is durable from the accepted `1.0.0` baseline. Clean migration from zero does not prove production upgrade safety.
- AI is optional. Gemini failure/disablement cannot break ordinary collection, administration, persistence, canonical distribution, PHP Article LKG, or non-AI rendering.
- Phase 1 digest input is a deterministic bounded narrowing of canonical Profile output; no AI-owned selector/ranker may replace Profile order.
- Phase 1 defaults are 7-day lookback and at most 20 Articles, with two scheduled evaluations/day and unchanged-input skip behavior.
- Active digest state participates in outward `snapshotRevision`; `digestInputIdentity` remains a separate internal provenance/idempotency identity.
- Digest persistence uses immutable successful records plus a separate active reference and bounded attempt history; partial digest state is never outward-visible.
- Digest downstream state is `current`, `older`, or absent (`null`) under the governed overlap/canonical-validity lifecycle; age alone does not make a digest stale.
- Optional digest invalidity fails open relative to valid Article distribution and PHP LKG activation.
- Gemini/API secrets never enter browser JavaScript, public PHP state, cache payloads, URLs, or logs. Source/user/model text is untrusted.
- AI citations/supporting references resolve only after application validation to governed Articles and exact stored `originalUrl` values; model-generated URLs are not trusted destinations.
- Customer presentation remains customer-owned; Phase 1 does not create an authoritative digest renderer.
- WordPress/RSS/self-host packaging/native self-host auth and other unpromoted capabilities must not be pulled into the current roadmap without explicit owner approval.

## Completed 2.0 roadmap

`docs/roadmap/post-1.0-roadmap.md` is **COMPLETE** at package `2.0.0`.

Historical sequence:

| Phase   | Baseline      | Prompt versions | Goal                                                   |
| ------- | ------------- | --------------- | ------------------------------------------------------ |
| 1       | `1.1.0`       | `1.1.x`         | Distribution Profile persistence + admin control plane |
| 2       | `1.2.0`       | `1.2.x`         | Canonical distribution read model                      |
| 3       | `1.3.0`       | `1.3.x`         | Machine credentials + distribution security            |
| 4       | `1.4.0`       | `1.4.x`         | Versioned v1 distribution API                          |
| 5       | `1.5.0`       | `1.5.x`         | Generic PHP synchronization + LKG core                 |
| 6       | `1.6.0`       | `1.6.x`         | PHP local data API + customer SSR integration          |
| 7       | `1.7.0`       | planned `1.7.x` | Managed integration + 2.0 release qualification        |
| Release | `1.7.0`       | —               | owner-accepted terminal version-only transition to `2.0.0` |

The full planned Phase 7 prompt sequence was not executed. The owner explicitly accepted the live customer integration and waived the formal Phase 7 P1–P4 evidence sequence; `docs/validation/phase-7-managed-integration-and-2.0-release-qualification.md` records that exception. Do not report unexecuted tests/failure injection as observed.

## Owner-approved 3.0 roadmap — active Phase 1

`docs/roadmap/3.0-roadmap.md` is **OWNER-APPROVED / ACTIVE — PHASE 1**.

Current/planned sequence:

| Phase   | Baseline | Prompt versions | Goal                                                    |
| ------- | -------- | --------------- | ------------------------------------------------------- |
| 1       | `2.1.0`  | `2.1.x`         | Gemini Profile digest foundation                        |
| 2       | `2.2.0`  | `2.2.x`         | PHP integration correction + customer package refresh  |
| 3       | `2.3.0`  | `2.3.x`         | Profile-grounded "Ask this feed" chatbot              |
| 4       | `2.4.0`  | `2.4.x`         | Multi-feed customer integration proof                   |
| 5       | `2.5.0`  | `2.5.x+`        | Remaining admin + PHP integration tightening            |
| Release | final accepted `2.x.x` | — | terminal `3.0.0` only after owner locks final exit gate |

The current next implementation work is **Phase 1** at baseline `2.1.0`. The accepted runner supports the `p2-<phase>` family and target versions `2.<phase>.<prompt>` while preserving the historical major-0, major-1, and correction grammars.

The first Phase 1 prompt target is `2.1.1` in task folder `p2-1`.

### Phase 1 direction

Phase 1 implements the completed worksheet decisions: two scheduled evaluations/day, change-aware Gemini invocation, default 7-day/max-20 canonical Profile input, governed URL Context, bounded structured output/support references, internal `digestInputIdentity`, immutable digest history plus separate active pointer/attempt history, `current | older | null` lifecycle, Profile AI admin controls, one additive v1 digest field per complete Profile snapshot, and PHP/LKG/local-read fail-open digest propagation. Production customer package replacement remains deferred to Phase 2.

### Phase 2 direction

Phase 2 fixes the observed PHP integration/package issues and deploys the coherent Gemini-capable package. It owns the stable packaged `ns-integration/run-sync.php`, whole-folder `ns-integration` replacement while preserving sibling `ns-private`, authoritative package-version display, `UPGRADE.md`, cPanel/File Manager upgrade/rollback path, renderer-authority cleanup, `M6SX`, and real customer package deployment.

### Phase 3 direction

Phase 3 implements Profile-grounded "Ask this feed" chat with bounded context/history, validated Article citations, exact stored destination resolution, server-side Gemini secrets, explicit AI authorization/rate/cost controls, and no cross-Profile/admin leakage.

### Phase 4 direction

Phase 4 proves one singleton customer Publication/editorial property can expose publishing-news, opportunities, and indie-filmmaking Profiles through the full canonical Profile/API/PHP/local-read/customer SSR chain using the corrected Phase 2 package.

### Phase 5 direction

Phase 5 is intentionally open-ended remaining admin/PHP integration hardening based on observed real use. It is not permission to smuggle unrelated product families into 3.0. The terminal `3.0.0` exit gate remains intentionally TBD until the owner explicitly locks it.

## Production compatibility

The accepted Phase 20 customer launch defines the first supported production source/version/schema/data baseline at `1.0.0`. Post-launch customer state is durable.

Whenever schema/persisted representation changes:

- migration from zero still passes for new/disposable installations;
- supported production state is upgraded through the real migration chain;
- governed data/relationships/provenance/editorial/moderation/duplicate/Profile/credential state are preserved;
- backup/restore/rollback planning remains compatible;
- supported migration history is not rewritten merely for cosmetic cleanup.

Distribution Profile persistence already required Level 4 production-forward migration proof in addition to zero-to-latest migration. Any later persisted AI/auth/integration state inherits the same production compatibility requirements.

## Validation honesty

- Every implementation prompt owns focused tests and appropriate broader regression coverage.
- Validation selection is change-aware and environment-aware: resolve the testing contract's Test Necessity Matrix and Test Environment Matrix before writing commands; crossing multiple surfaces takes the union and shared helpers inherit important-consumer obligations.
- Every implementation/closeout prompt carries a `RUN` / `DEFER` / `N/A` validation manifest. `DEFER` is required later in its assigned environment, never a skip/pass/waiver.
- Use the narrowest useful focused command during iteration and the smallest non-overlapping `RUN` command set covering the applicable evidence.
- Do not knowingly run VPS-required/live-external evidence from a normal Windows prompt merely to rediscover a missing prerequisite. Explicitly invoked specialized suites remain fail-closed when their expected prerequisite is unavailable, and deterministic prerequisite/environment failures are not automatically retried.
- Cross-environment exact-tree matching applies when multiple environments are combined for the same acceptance/qualification claim. Ordinary prompts and ordinary phase/correction closeouts may finish GREEN with correctly deferred VPS/live/reference evidence when that evidence belongs to the later full-system/project release qualification gate.
- Evidence applies only to the exact tree/environment actually tested.
- Source inspection is not runtime/browser/database/live proof.
- Mocks do not prove PostgreSQL constraints, transactions, migrations, locks, races, or live Gemini behavior.
- Required specialized suites fail clearly when explicitly invoked and prerequisites are unavailable; skips/zero-match/flakiness do not satisfy an exit gate.
- Phase/correction closeout requires a durable validation artifact tied to the accepted source tree when the governing roadmap/test contract requires it.
- Live-provider AI claims require an actually executed Gemini request against the relevant tree/environment; mocked provider behavior is not provider proof.

Historical Phase 9, Phase 14, and Phase 7 evidence limitations remain historical; later evidence never rewrites what was observed earlier.

# Conversation commands

Commands are conversational shorthand, not shell commands.

## Command chaining

Use `+` as the canonical conversational chaining operator when multiple commands should run sequentially in one request.

```text
/command-a + /command-b + /command-c
```

means execute the commands strictly left to right: complete `/command-a`, then run `/command-b` using the resulting current state, then run `/command-c`.

- `+` means sequential execution only. It never means merge, parallelize, or combine command semantics.
- Arguments belong to the command immediately before the next `+`.
- Each command must satisfy its own prerequisites, authority rules, and validation requirements before the next command starts.
- A failure, blocker, required approval, or other workflow gate stops the chain at that point; later commands do not run until the gate is satisfied.
- Chaining never bypasses explicit approval gates. For example, `/docs-review + /docs-apply` stops after `/docs-review` until the owner explicitly approves the findings.
- Natural-language `then` may still be understood, but `+` is the documented invocation shorthand.
- `→` remains documentation/workflow notation for showing order and handoffs; it is not the canonical conversational chaining operator.

Example:

```text
/boot + /closeout phase 2
```

means finish `/boot` first, then perform `/closeout phase 2` against the refreshed state.

## Context

### `/boot`

Refresh BOOT, root summaries, Project Contract, current product scope/ADRs, current roadmap state, and the narrow governing docs for the requested work.

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

Trace Raw item → candidate → Relevance/Category → Article identity/persistence → observations → overrides → duplicate role → canonical outward semantics → Profile/consumers/AI/tests.

### `/blast-radius <change>`

Identify affected contracts, ADRs, schema/migrations, jobs/services/routes/read models/UI/tests/docs.

### `/regression <behavior>`

Trace suspected regression to likely change, affected invariants, missing test protection, and required evidence.

# Documentation workflow

## `/docs-review`

Read-only. Default scope is tracked `.md`/`.txt` excluding task and validation artifacts unless narrowed. Report contradictions, drift, stale statements, duplicated authority, missing references, and recommended changes. Never modify files.

For the current roadmap, also assess whether already accepted work, version/state transitions, phase closeouts, or material owner-approved roadmap/contract decisions require a brief entry in its companion changelog. Do not propose changelog entries for merely planned work, and do not treat the changelog as behavioral authority or validation evidence.

## `/docs-apply`

Apply only approved documentation findings after re-reading current targets. Do not alter source, migrations, tests, dependencies, runtime config, or package version unless separately explicitly authorized.

When an approved finding includes current-roadmap changelog impact, update the companion changelog in the same docs-only application. Keep entries brief—normally date, package version when relevant, and one to three bullets—and summarize accepted outcomes without duplicating validation evidence.

## `/docs-prompt [<model configuration>]`

Docs-only prompt-generation alternative after an approved `/docs-review`.

Default context path: reuse the approved review findings and document context already present in the current conversation; do not request or require a docs snapshot merely to generate the prompt. Before prompt generation, re-read only the specific current target documents needed to guard against review→prompt drift; do not rerun the full docs review.

Fallback context path: when the approved review context is unavailable or insufficient (for example, a fresh conversation), or when the owner explicitly requests it, use `npm run docs:snapshot` and a supplied docs snapshot to restore the required docs context.

Model resolution happens before prompt generation and uses only currently supported executable configuration labels governed by `docs/codex-model-selection.md` and the runner's current `MODEL_CONFIGS`:

- If a model configuration argument is supplied, match it case-insensitively and normalize it to the canonical supported label. For example, `/docs-prompt terra medium` means `/docs-prompt` with owner-selected target configuration `Terra Medium` and the generated prompt must be optimized for Terra Medium.
- A valid explicit model argument is an owner-selected target, not a model recommendation request. Do not silently replace it with another model. Identify it in the generated prompt as `Target configuration: <canonical label>` with selection basis owner-specified.
- If the explicit target is clearly below the correctness floor for the approved docs work, report the conflict instead of silently escalating or pretending the target is adequate.
- If the supplied argument does not resolve to a currently supported executable configuration label, fail closed rather than guessing.
- If no model configuration is supplied, run the existing repository model-selection/rating policy from `docs/codex-model-selection.md`, choose the minimum-cost adequate supported configuration for the approved docs task, identify it as `Recommended configuration: <canonical label>`, and optimize the generated prompt for that configuration.

Explicit valid model argument takes precedence over automatic model recommendation. The model argument does not alter the context/snapshot rules above.

After resolving context and model configuration, `/docs-prompt` MUST write or replace the single tracked handoff file `.codex/docs-prompt.txt` on `main` and commit that file. The handoff file is transient by path but durable in Git history: each invocation replaces the slot rather than creating a growing docs-prompt task archive. It is not a `docs/tasks/` phase/correction prompt and must never be consumed by `codex:phase` grammar.

The generated `.codex/docs-prompt.txt` MUST include a repository-freshness preflight before any documentation edits:

- verify that the checkout contains the commit that introduced the current `.codex/docs-prompt.txt`;
- fetch `origin/main`;
- stop and report that the repository must be updated if the checkout is behind `origin/main` or otherwise does not contain the current prompt-file commit;
- do not modify documentation from a stale checkout.

The chat response is a handoff summary, not a copy/paste execution path. Do not print the full executable prompt as the primary handoff. Report the tracked path, resolved target/recommended configuration, prompt commit SHA, and instruction to pull/update `main` before running `.codex/docs-prompt.txt`.

The prompt file itself remains after execution and is overwritten by the next `/docs-prompt`; do not auto-delete it. Emit no product implementation work, expand beyond the approved documentation scope, or change product/runtime/version behavior.

# Implementation prompt workflow

Strict order:

```text
/prompt-ass
→ /prompt-plan
→ /prompt-write <folder name>
```

Do not skip stages.

### Current state

The 3.0 roadmap is active at `2.1.0`, the post-2.0 task grammar is executable, and Phase 1 is the current implementation phase.

The completed Phase 1 worksheet is already promoted into governing contracts/roadmap. Prompt planning must consume those decisions rather than reopen them.

The next planning sequence is:

```text
/prompt-ass Phase 1
→ /prompt-plan
→ /prompt-write p2-1
```

Phase 1 prompts target `2.1.1 ... 2.1.x`. If requirements/docs/repository state materially conflict, return `Planning needed` rather than silently changing the roadmap.

## `/prompt-ass`

Determine safe task boundaries from the active/current roadmap or correction need and governing contracts. No writes.

Return target behavior, constraints, roadmap phase or correction scope, stack type, prompt count/order, goal/summary/dependencies/boundary rationale/deferred behavior, closeout task, and provisional model/usage recommendations.

Explicitly assess producer→consumer boundaries. Split transactional/state-machine work from separately consumed read/API work when consumers, tests, or failure risks differ materially. Testing is part of task decomposition.

For current Phase 1, the AI layer must consume bounded canonical Profile Articles and must not reconstruct or reinterpret Source trust, canonical eligibility, Profile selectors, Categories, moderation, duplicate semantics, ordering, `originalUrl`, cursor/revision semantics, synchronization, LKG activation, local usability, or presentation safety. The accepted N6WD summary bound/migration is an existing producer prerequisite and must not be duplicated. Phase 1 prompt decomposition must preserve the worksheet-owned contracts for evaluation cadence, input bounds, output shape, digest state machine, v1 snapshot participation, PHP fail-open behavior, Profile AI admin controls, and customer-presentation boundary.

## `/prompt-plan`

Requires completed `/prompt-ass`. Inspect contracts/ADRs, implementation, migrations, helpers/consumers/tests, recent changes, likely file scope, preserved behavior, risks, focused/broader tests, evidence levels, docs effects, acceptance, and non-goals.

For every producer→consumer dependency record:

`downstream-required capability → owning implementation/export → focused proof`

If the consumer would need to invent producer-owned semantics, return `Planning needed`.

Reassess model/effort using the minimum-cost-adequate rule. Resolve the testing contract's Test Necessity Matrix and Test Environment Matrix into an explicit prompt validation manifest with `RUN` / `DEFER` / `N/A`, assigned environments, exact-tree handoff requirements when evidence is combined for the same qualification claim, and the smallest non-overlapping final `RUN` command set.

## `/prompt-write <folder name>`

Requires an unblocked `/prompt-plan`. Revalidate current repo/docs and write ordered prompts under `docs/tasks/<folder name>/`.

For corrections, use the established correction grammar and current unchanged package version.

For the active 3.0 roadmap, use `p2-<phase>` folders with `2.<phase>.<prompt>` assigned versions. Phase 1 uses `p2-1` and starts at `2.1.1`.

Each written prompt MUST inherit the finalized validation manifest rather than rediscovering or broadening the repository test matrix. Do not instruct the normal Windows prompt environment to execute `DEFER` items assigned to VPS/live/reference environments; keep explicit specialized-suite prerequisite failures fail-closed when those suites are actually invoked.

Before reporting a stack ready, run `npm run codex:phase:validate -- <folder>` when local execution is available.

# Codex phase-runner grammar

The shared parser is `scripts/codex-phase-core.mjs`.

## Common

- every `.txt` in a task folder is a prompt;
- filenames: `P<number>-<lower-kebab-slug>.txt`;
- numbering one-based, contiguous from P1;
- exactly one final closeout prompt;
- closeout filename and `TASK:` title both signal `closeout`;
- every prompt has exactly one valid `- Recommended configuration:` `<MODEL_CONFIGS label>`.` line.

## Historical pre-1.0 roadmap phases

- folder: `p<phase>`;
- header: `TASK: Phase <phase> / P<number> — <title>`;
- target version: `0.<phase>.<prompt number>`.

## Historical post-1.0 / 2.0 roadmap phases

- folder: `p1-<phase>`;
- header: `TASK: Phase <phase> / P<number> — <title>`;
- exactly one phrase `assigned project version is` followed by `1.<phase>.<prompt number>`;
- no correction unchanged-version metadata.

These semantics remain supported so historical task stacks and Git-proven prefix detection are not reinterpreted.

## Active post-2.0 / 3.0 roadmap family

- folder: `p2-<phase>`;
- header: `TASK: Phase <phase> / P<number> — <title>`;
- target version: `2.<phase>.<prompt number>`;
- no correction unchanged-version metadata.

This family is executable and protected by the accepted runner compatibility correction. Historical `p2` remains historical Phase 2; only `p2-<phase>` selects the post-2.0 family.

## Corrections

- folder: `c<phase>-<lower-kebab-slug>`;
- header: `TASK: Correction <phase> / P<number> — <title>`;
- exactly one unchanged-version metadata line matching `package.json`;
- no assigned-version phrase;
- correction closeout does not advance roadmap version.

Corrections are only for genuine bounded regressions/repairs and must not smuggle roadmap product capability.

# Phase handoff and `/closeout`

After an activated non-terminal roadmap phase has passed its final closeout prompt and durable validation gate:

```text
phase implementation
→ final phase closeout prompt
→ human review
→ /closeout
→ /docs-review
→ /docs-apply
→ /prompt-ass next phase
→ /prompt-plan
→ /prompt-write <next phase folder>
```

## Non-terminal `/closeout`

`/closeout` is a bounded version/state transition, not a fresh audit.

Fast path:

1. read BOOT plus the completed/next current-roadmap entries;
2. read the completed phase durable validation artifact and accepted source SHA when the roadmap requires it;
3. read `package.json` and task/version sequence;
4. compare accepted SHA to current `main` for relevant unvalidated executable drift;
5. if green, update only top-level `package.json` to the exact successor baseline in the current roadmap;
6. compare transition and require package-version-only change;
7. report GREEN, transition SHA, next P1 version, and freshly read next phase entry.

The historical 2.0 successor baselines remain recorded in `docs/roadmap/post-1.0-roadmap.md` and are no longer current transition targets.

The active 3.0 successor baselines are:

- Phase 1 → `2.2.0`
- Phase 2 → `2.3.0`
- Phase 3 → `2.4.0`
- Phase 4 → `2.5.0`
- Phase 5 terminal/successor behavior remains owner-controlled until the final 3.0 exit gate is explicitly locked.

Do not rerun full validation during `/closeout`; use the recorded accepted evidence and one drift comparison. Relevant executable drift blocks transition.

## Historical terminal 2.0 `/closeout`

The 2.0 roadmap is complete. The terminal transition performed on 2026-08-27 was:

```text
accepted 1.7.0 baseline under explicit Phase 7 owner exception
→ top-level package.json version only
→ 2.0.0
```

Commit `58a5387fba23a3ae3e14cccfd92c062817351ca0` changed only the package version. This historical transition created no `1.8.0` or `2.0.x` development line.

Do not use the historical Phase 7 terminal rule to infer a current 3.0 release gate.

## Future terminal 3.0 `/closeout`

The intended terminal release is `3.0.0`, but the exit gate is deliberately **TBD** until the owner locks it after the digest, corrected customer package, chatbot, multi-feed, and integration-hardening experience.

Until `docs/roadmap/3.0-roadmap.md` is explicitly amended with that gate, `/closeout` MUST NOT infer or perform a terminal `3.0.0` transition from package version alone.

# Versioning

- `package.json` is the sole current-version authority.
- Current version is `2.1.0`.
- The completed 2.0 roadmap used `1.<phase>.<prompt>` phase versions and terminated at `2.0.0`.
- The active 3.0 roadmap uses `2.<phase>.<prompt>` phase versions.
- The runner compatibility correction and N6WD/test-topology corrections were accepted at unchanged package `2.0.0` before activation.
- Roadmap activation was the version-only `2.0.0` → `2.1.0` transition on 2026-08-28.
- Phase 1 prompts begin at `2.1.1`; a GREEN Phase 1 `/closeout` advances to `2.2.0`.
- Final release target is `3.0.0`, but its terminal gate is not yet locked.
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
- Treat database constraints/transactions, idempotency, provenance, security, failure behavior, AI failure isolation, and backward compatibility as first-class review concerns.
- Do not substitute stronger models for oversized task boundaries.
- Keep adapters and AI consumers thin; do not let later consumers invent producer-owned SQL/query/state/cursor/selection semantics.
- Use focused iteration, change-aware/environment-aware validation manifests, and non-overlapping final `RUN` commands.
- Do not execute deferred VPS/live/reference evidence in the wrong environment merely to collect a prerequisite failure.
- Do not claim tests/runtime/browser/database/live-Source/live-Gemini behavior unless actually observed.
- Never invent repository state, Source behavior, provider behavior, or validation results.

# Decision and review commands

- `/review <commit, PR, task, implementation>` — review against contracts/architecture/tests, not only happy path
- `/prove <behavior>` — identify/execute appropriate evidence when tools/environment allow
- `/test-matrix <feature>` — resolve affected validation surfaces, required evidence, execution environments, and `RUN` / `DEFER` / `N/A`
- `/lock <decision>` — treat decision as authoritative and identify docs that must reflect it; no write unless instructed
- `/recommend` — choose best option using current contracts/roadmap/value/risk
- `/status` — return Completed / Current / Blocked / Next
- `/next` — recommend one logical next task

## Current next action

The 2.0 roadmap is complete and the 3.0 roadmap is active at package `2.1.0`.

The next implementation work is **Phase 1 — Gemini Profile digest foundation**. The accepted runner supports `p2-1` and the first prompt target is `2.1.1`. The accepted N6WD correction is an existing prerequisite rather than Phase 1 implementation scope. The completed Phase 1 worksheet has already been consumed into the governing docs.

Normal planning sequence:

```text
/prompt-ass Phase 1
→ /prompt-plan
→ /prompt-write p2-1
```

Phase 1 is governed by `docs/contracts/ai-assistance-contract.md`, `docs/contracts/distribution-api-contract.md`, `docs/contracts/distribution-and-integration-contract.md`, and `docs/roadmap/3.0-roadmap.md`.
