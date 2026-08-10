# News Scraper Boot Document

This is the session initialization contract for repository-aware work in `jfin602/news-scraper`. Read it first in a new ChatGPT/Codex session.

It establishes project identity, canonical terminology, authority, document routing, workflow gates, shorthand commands, and repository safety rails. It is a router/interpreter, not a substitute for specialized contracts, ADRs, implementation docs, tests, or observed validation evidence.

## Project identity

- Repository: `jfin602/news-scraper`
- Default branch: `main`
- Working product/repository name: News Scraper
- Platform: reusable, topic-independent news aggregation Platform
- Current phase: **Phase 8 — Basic public-feed backend**
- Production status: pre-production
- Initial Publication: publishing-industry news relevant to indie authors
- Public direction: rolling recent-headline feed sending readers to original publishers
- Admin direction: Cloudflare Access-protected Publication/Source/endpoint/Relevance/Category/Article/duplicate/health/change-history control plane, built after the tech-demo vertical slice
- Core constraint: Publication-specific behavior is configuration; shared engine logic remains topic independent

Phase 0 documentation alignment, Phase 1 Application foundation, Phase 2 Database foundation, Phase 3 Publication/Source configuration, Phase 4 Collection eligibility and network safety, Phase 5 RSS/Atom transport, parsing, and minimal Collection runs, Phase 6 Article normalization, and Phase 7 Default Relevance/Article identity/persistence implementation/validation are complete. The repository is ready for Phase 8 implementation planning.

## Delivery priority

Phases 1–9 are the tech-demo critical path.

The first demonstrable milestone is: at least two real approved RSS/Atom Sources are collected through the Worker, recorded in Collection runs, normalized, passed through the canonical default-include Relevance boundary, persisted idempotently with Article-observation provenance, and displayed in the public feed with original-publisher headline links.

Do not front-load admin convenience, native authentication, feed discovery polish, duplicate moderation, or HTML collection into that critical path unless a true dependency is demonstrated.

Every implementation phase inherits `docs/contracts/testing-and-validation-contract.md`. Fast delivery does not permit regression protection, persistence proof, network-safety tests, or final-tree validation to be deferred when the corresponding behavior is introduced.

## New-session startup

For project-wide work refresh:

1. `BOOT.md`
2. `README.md`
3. `AGENTS.md`
4. `docs/contracts/project-contract.md`
5. `docs/roadmap/mvp-roadmap.md`
6. narrowest governing contract/ADR, including `docs/contracts/testing-and-validation-contract.md` for implementation/review work
7. relevant implementation/tests
8. recent commits affecting the area when recency matters

Do not read every document indiscriminately. Use routing below. A full `/docs-review` is the intentional exception.

## Canonical terminology

Governed by `docs/contracts/domain-and-data-contract.md`.

- `repo` / `source code` = `jfin602/news-scraper`
- `Platform` = reusable aggregation software
- `Publication` = configured news product and topic-specific boundary
- `Source` = configured publisher/outlet; approval state determines whether it is trusted for collection
- `Source endpoint` = configured feed/API/HTML location owned by a Source
- `Collection run` = one attempt to collect one endpoint; persisted provenance begins with the first real fetch phase
- `Raw item` = minimally interpreted parser output
- `Article candidate` = normalized but not yet accepted
- `Article` = persisted normalized Source instance
- `Article observation` = endpoint/run provenance for an Article/candidate outcome
- `Duplicate review candidate` = persisted possible true-duplicate decision/review record
- `Duplicate group` = separately stored Articles representing the same underlying published item
- `Primary article` = one member selected to represent a Duplicate group publicly
- `Related coverage` = distinct reporting about same subject/event; not a true duplicate
- `Category` = Publication-owned editorial grouping
- `Relevance rule` = deterministic Publication-owned include/exclude/categorize rule
- `contract` = behavior implementation must preserve
- `ADR` = decision record in `docs/decisions/`
- `task` = implementation prompt under `docs/tasks/`
- `validation artifact` = durable record under `docs/validation/` of evidence actually observed against a specific source tree/environment; it does not redefine contracts
- `refresh` = re-read current repository sources before answering
- `lock` = treat a decision as authoritative and identify documents that must reflect it

Do not blur Source vs endpoint, approval vs lifecycle/operational state, operational state vs health, Article identity vs duplicate identity, Article visibility vs duplicate role, external admin access control vs application resource validation, or source inspection vs executed validation evidence.

## Authority and conflicts

Canonical authority is `docs/contracts/project-contract.md`:

1. locked laws;
2. explicit project-contract invariants;
3. domain and lifecycle contracts;
4. architecture, interface, security/operations contracts, and Accepted ADRs;
5. roadmap/implementation notes;
6. root summaries/routing (`AGENTS.md`, `README.md`, `BOOT.md`);
7. implementation;
8. historical task prompts;
9. comments/commit messages/stale notes.

`docs/contracts/testing-and-validation-contract.md` governs how implementation behavior is proven and when implementation work may be considered complete. It does not redefine product/domain behavior or outrank the governing behavioral contract being tested.

Observed validation evidence proves behavior only for the source tree/environment/procedure actually tested; it does not outrank or redefine a governing contract.

Current user instruction controls task scope. A proposed locked-law change is a contract-change request, not permission for lower-authority work to override it silently.

Report authoritative conflicts rather than choosing silently.

## Document routing

| Area                                                                                                         | Read first                                                |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Locked laws / authority / product boundaries                                                                 | `docs/contracts/project-contract.md`                      |
| MVP users / demo-first capabilities / exclusions                                                             | `docs/contracts/mvp-scope-and-users.md`                   |
| Terminology / states / entities / identity / provenance                                                      | `docs/contracts/domain-and-data-contract.md`              |
| Testing / regression / evidence / local execution / DB/fixture/browser/live validation                       | `docs/contracts/testing-and-validation-contract.md`       |
| Process/module architecture / staged Worker execution / scheduling / transactions                            | `docs/architecture/system-architecture.md`                |
| Approval / bootstrap / collection / safety / parsing / normalization / Relevance / identity / run accounting | `docs/contracts/source-and-collection-contract.md`        |
| Article visibility / duplicate role / review/groups / Primary                                                | `docs/contracts/article-lifecycle-and-deduplication.md`   |
| Public feed / search / themes / admin UX / change history                                                    | `docs/contracts/public-feed-and-admin-contract.md`        |
| Admin perimeter / SSRF / content safety / isolation / observability / recovery                               | `docs/operations/security-reliability-and-operations.md`  |
| Phase sequence / critical path / exit gates                                                                  | `docs/roadmap/mvp-roadmap.md`                             |
| Topic-independent decision                                                                                   | `docs/decisions/topic-independent-publication-model.md`   |
| Whitelist/structured-feed decision                                                                           | `docs/decisions/whitelist-and-structured-feed-first.md`   |
| Original-link/normalization decision                                                                         | `docs/decisions/original-link-and-normalized-metadata.md` |
| Cloudflare Access admin perimeter                                                                            | `docs/decisions/cloudflare-access-admin-perimeter.md`     |
| Documentation index                                                                                          | `docs/README.md`                                          |
| Specialized validation plans                                                                                 | `docs/testing/` when present                              |
| Implementation prompts                                                                                       | `docs/tasks/` when present                                |
| Durable validation artifacts                                                                                 | `docs/validation/` when present                           |

If a path does not exist, search for its current equivalent before assuming intentional deletion.

## High-risk project invariants

- Shared engine code remains topic independent.
- Source/endpoint approval/trust, lifecycle (`active/archived`), operational state (`enabled/paused/disabled`), and derived health are distinct.
- Bootstrap may explicitly create approved configuration as operator input but may not auto-discover/auto-approve, infer approval from fetch success, widen domains silently, or overwrite later operator-managed state on normal startup.
- Only collection-active Publications with approved + active + operationally enabled Sources/endpoints are contacted.
- Every request/redirect passes pre-fetch network-safety validation before contact.
- Parsed Article links pass a separate post-normalization Source/domain gate.
- Source approved domains are the maximum boundary; endpoint rules may narrow, not silently widen.
- Parsers output Raw items and never persist Articles directly.
- Source-shaped data is normalized before Relevance, identity, duplicate, or feed use.
- Relevance ordering is never bypassed: before configurable rules exist the empty rule set deterministically returns `include`.
- Configurable MVP Relevance uses deterministic include/exclude/categorize priority/scope rules; edits are prospective by default; automatic bulk historical reprocessing is deferred.
- Article identity is transactionally idempotent.
- Article observations preserve endpoint/run provenance.
- Minimal Collection-run persistence begins with the first real fetch in Phase 5 and expands as pipeline stages are introduced.
- During Phases 5–9, collection is manually invoked through the Worker; Web/API never fetches Sources inline.
- Phase 10 adds durable scheduling/jobs around the same endpoint execution unit.
- True-duplicate grouping applies to separately stored Articles.
- Article visibility is independent from duplicate role; Phase 8 first persists visibility because public-feed behavior consumes it.
- Before Duplicate groups exist, Articles are logically `ungrouped`; Phase 8 does not invent group/role persistence.
- Ordinary public-feed eligibility requires a Publication with `public_status = public`, an approved active Source, and a visible Article that is `ungrouped` or the `primary` member once grouping exists.
- Publication collection activity, Source operational state, and endpoint approval/lifecycle/operational/health state govern collection and do not by themselves suppress retained otherwise-eligible public rows.
- Public feed effective date uses parsed `published_at` when available and otherwise `first_seen_at`, with fallback provenance detectable and deterministic tie ordering.
- Public headline destination is the stored Article `original_url`; `canonical_identity_url` remains an identity-comparison field and is not substituted silently.
- Weak duplicate evidence persists as review state; unchanged dismissed evidence does not recur indefinitely.
- Source runs/jobs fail independently and public-feed reads remain readable during collection failures.
- MVP admin UI/API routes are behind Cloudflare Access and supported deployments prevent direct-origin bypass.
- State-changing admin browser actions use CSRF/equivalent request-integrity controls when introduced; application commands still validate Publication/resource ownership.
- Native application administrator accounts/sessions/roles/account recovery/per-user Publication authorization/identity-linked audit attribution are deferred beyond MVP.
- Push/webhook adapters and pinning/featured ordering are deferred beyond MVP unless explicitly promoted.
- Every implementation change requires focused automated coverage and relevant broader regression coverage under the testing contract.
- Persistence/concurrency claims require the evidence level capable of proving real PostgreSQL behavior; mocks do not substitute for database guarantees.
- Ordinary deterministic validation does not rely on live public Sources, and test composition must not weaken production whitelist/SSRF policy.
- Required suites do not pass by silently skipping prerequisites or selecting zero tests.
- Validation claims apply to the exact final source tree tested; previous passing evidence does not automatically transfer to later source changes.
- Implementation-roadmap phase closeout requires a durable `docs/validation/` artifact tied to the exact accepted commit/source tree and the commands/procedures actually executed.

## Roadmap state

Use `docs/roadmap/mvp-roadmap.md`.

Current phase: **Phase 8 — Basic public-feed backend**.

Phase 0 documentation alignment, Phase 1 Application foundation, Phase 2 Database foundation, Phase 3 Publication and Source configuration core, Phase 4 Collection eligibility and network safety, Phase 5 RSS/Atom transport, parsing, and minimal Collection runs, Phase 6 Article normalization, and Phase 7 Default Relevance/Article identity/persistence are complete with durable closeout validation. Phase 8 is the active implementation phase.

### Tech-demo critical path

1. Phase 1 — Application foundation
2. Phase 2 — Database foundation
3. Phase 3 — Publication and Source configuration core
4. Phase 4 — Collection eligibility and network safety
5. Phase 5 — RSS/Atom transport, parsing, and minimal Collection runs
6. Phase 6 — Article normalization
7. Phase 7 — Default Relevance, Article identity, and persistence
8. Phase 8 — Basic public-feed backend
9. Phase 9 — Basic public-feed UI and tech demo

### Remaining MVP order

10. Phase 10 — Automated polling, durable jobs, and endpoint health
11. Phase 11 — Categories and configurable Relevance execution
12. Phase 12 — Feed discovery features
13. Phase 13 — Public presentation polish
14. Phase 14 — Source administration
15. Phase 15 — Publication and Relevance administration
16. Phase 16 — True duplicate detection and grouping
17. Phase 17 — Article and duplicate moderation
18. Phase 18 — Configurable HTML collection
19. Phase 19 — Reliability, observability, and production operations
20. Phase 20 — Customer launch validation

Do not advance by assumption. Verify each phase's own exit gate plus the inherited testing-and-validation gate against the final tree before updating current phase.

## Working preferences

- Inspect current source/docs before implementation prompts.
- Prefer file-scoped, regression-safe prompts.
- State allowed files when knowable.
- Include non-goals and preserved behavior.
- Require focused + broader regression tests and identify the evidence level needed for each acceptance claim.
- Do not claim runtime/browser/database/live-Source behavior unless observed at the corresponding evidence level.
- Prefer smallest correct incremental change.
- Trace shared helpers/consumers before changes.
- Before collection changes trace bootstrap/approval → lifecycle/operational state → manual/scheduled execution → lock → Collection run → network safety → fetch/redirect → parse → normalize → Article-link validation → Relevance → identity → observation → duplicate → run accounting → health → tests.
- Before Article/duplicate changes trace external IDs/canonical URLs/uniqueness → observations → review candidates → groups → Primary → moderation → feed → tests.
- Before admin changes trace Cloudflare Access perimeter → origin protection → request integrity → Publication/resource ownership → mutation → change history → tests.
- Before approving a change, trace the testing blast radius and confirm relevant regression suites were actually executed against the reviewed final tree.
- For implementation-roadmap phase closeout, require observed local terminal evidence and a durable validation artifact tied to the exact accepted commit/source tree.
- Make a concrete choice when asked for `recommended`.
- Never invent repository state, tests, browser results, Source behavior, or history.

# Conversation commands

Commands are conversational shorthand, not shell commands.

## Context

### `/boot`

Refresh BOOT, root summaries, project contract, roadmap, and narrow governing docs.

### `/refresh <area>`

Re-read relevant source/docs/tests/recent commits.

### `/state`

Summarize implementation state, active phase, completed work, constraints, next logical work.

### `/route <topic>`

Identify governing contracts/ADRs/source/tests/tasks.

## Analysis

### `/audit <area>`

Compare contracts, ADRs, source, tests, recent changes, observable behavior; report disagreements/risks.

### `/contract-check <area>`

Check implementation/tests against governing contracts/laws.

### `/doc-check <area>`

Narrow documentation consistency check; does not replace full `/docs-review`.

### `/source-trace <source or behavior>`

Trace Publication → Source → endpoint → approval/lifecycle/operational state → execution/lock/run → safety → fetch → parse/normalize → link validation → Relevance → identity/observation → duplicate → run/health → consumers/tests.

### `/article-trace <field or concept>`

Trace Raw item → candidate → Relevance → Article identity/persistence → observations → overrides → duplicate role → feed/admin/tests.

### `/dedupe-trace <case>`

Trace Article identity separately from true-duplicate evidence, review state, groups, Primary, safeguards, moderation, feed/tests.

### `/blast-radius <change>`

Identify affected contracts, ADRs, schema/migrations, jobs/services/routes/read models/UI/tests/docs.

### `/regression <behavior>`

Trace suspected regression to likely change, affected invariants, missing test protection, and the evidence level required to prove a fix.

# Phase handoff workflow

After an implementation roadmap phase has been formally closed by its closeout task and durable validation record, use:

```text
phase implementation / closeout task
→ /closeout
→ /docs-review
→ /docs-apply
→ /prompt-ass
→ /prompt-plan
→ /prompt-write <folder name>
```

A green `/closeout` establishes the next implementation phase by committing its `0.<phase>.0` package baseline. Because `/closeout` is intentionally version-only, the roadmap and root phase summaries may still identify the just-completed phase until the immediately following `/docs-review` → `/docs-apply` alignment. This short post-closeout/pre-docs-apply state is expected and is not itself repository drift or a failed handoff.

## `/closeout`

`/closeout` is a bounded phase-handoff state transition, not an audit or troubleshooting workflow. Under normal repository and tool conditions, target completion is **under 60 seconds**.

### Fast path

Execute this sequence and do not expand it unless a material closeout blocker must be reported:

1. Read this `/closeout` section and the roadmap entries needed to identify the completed phase and intended next phase.
2. Read the completed phase's durable validation artifact and extract the accepted/validated implementation source SHA and exit-gate conclusion.
3. Read `package.json` as the sole project-version authority and read the completed phase's task filenames/version sequence. Do not require or search for npm lockfile version metadata.
4. Perform one accepted-SHA-to-current-`main` compare to classify post-validation drift. Documentation-only changes do not invalidate implementation evidence. Explicitly owner-approved repository workflow/tooling-policy changes also do not invalidate implementation evidence when they do not modify application runtime behavior, tests, migrations, committed Publication configuration, `package.json` dependency/script/engine metadata, or other executable product behavior. Dependency-manifest, implementation, test, migration, runtime, or executable-configuration drift remains blocking.
5. If green, perform only the next-phase baseline version transition described below.
6. Verify the transition diff, then re-read `docs/roadmap/mvp-roadmap.md` and print the complete roadmap entry for the phase being entered into the chat. The roadmap's status marker may still reflect the pre-alignment phase until `/docs-apply`.

The required structural checks are:

- the completed phase's durable validation artifact states that its exit gate is satisfied and the intended next roadmap phase is identifiable;
- the durable validation artifact exists and identifies the accepted/validated implementation source SHA;
- the single post-validation compare shows no unvalidated dependency-manifest, implementation, test, migration, runtime, or executable-configuration drift; documentation-only and explicitly owner-approved non-executable repository workflow/tooling-policy changes are non-blocking;
- root/roadmap phase state is coherent with the completed phase and intended next phase; it does not need to have been advanced yet because `/docs-review` and `/docs-apply` own that documentation transition;
- `package.json` contains the expected completed-phase version before transition;
- the completed phase's prompt/version sequence is coherent and there are no obvious stale phase artifacts that block handoff.

The repository intentionally does not use `package-lock.json`. Its absence is expected and is never itself a `/closeout` blocker. `/closeout` MUST NOT require, regenerate, inspect for version synchronization, or recreate an npm lockfile.

### Time and scope guardrails

- Do not rerun the full phase validation matrix, tests, runtime checks, database checks, browser checks, or live-Source checks during `/closeout`.
- Do not perform a broad contract/document/source review. `/docs-review` and the later planning workflow own that work.
- Do not walk every post-validation commit individually when one commit-range comparison can classify the changed files.
- If the range comparison reveals relevant unvalidated drift, report `Closeout check blocked` with the affected files/categories and stop. Do not perform root-cause investigation inside `/closeout`.
- If the required repository state cannot be established quickly because a tool/read/compare primitive is unavailable, report the blocker rather than expanding into an open-ended investigation.
- The version transition gets one predetermined safe write strategy. Do not cycle through alternate write mechanisms if that strategy is unavailable or unsafe.
- Do not run `npm install` or otherwise normalize dependency state merely to change the project version.
- Do not escalate into speculative Git plumbing or hand-built Git objects merely to overcome a connector limitation. If an exact targeted write cannot be performed safely, report `Closeout transition blocked: safe version-write primitive unavailable.` and stop.
- A blocked closeout should remain a fast result; use a separate command/task for investigation or remediation.

### Green-path version transition

Invocation of `/closeout` constitutes the repository owner's explicit authorization for this version-only transition when the structural check is green.

Before writing, capture the pre-transition `main` SHA. Then update exactly one JSON value to `0.<next roadmap phase>.0`:

- `package.json` top-level `version`.

Use the exact current file contents and a deterministic targeted substitution/update. Preserve every other package value. Do not change dependencies, dependency metadata, engines, formatting, or unrelated bytes as part of the transition.

Commit the version-only transition directly to `main` unless the user requests a branch/PR. Prefer one atomic version-only commit when the available tool supports it. A high-level connector may use the smallest safe file-update operation it supports, but it must not introduce any unrelated change.

Immediately compare the pre-transition SHA to the resulting `main` SHA. The complete transition range MUST:

- change only `package.json`;
- contain exactly the one expected version-value substitution;
- contain no dependency, engine, formatting, or other metadata drift.

If the transition diff contains anything else, report `Closeout transition invalid`, stop the workflow, and do not print the new phase as successfully entered until the version transition is corrected through an explicitly authorized remediation.

If a material structural closeout problem is found before writing, report `Closeout check blocked`, explain the blocker, and make no version change.

### Required final output

A successful `/closeout` response MUST contain, in this order:

1. `Closeout check: GREEN`;
2. the resulting baseline transition commit SHA (or final SHA when a high-level connector required more than one version-only commit);
3. `Next P1 version: 0.<new phase>.1`;
4. the **complete roadmap entry for the phase being entered**, copied from the freshly re-read `docs/roadmap/mvp-roadmap.md` rather than memory or a summary.

The roadmap entry is mandatory context for the next `/docs-review`; do not omit it even when the roadmap's current-status marker is intentionally awaiting documentation alignment.

# Documentation workflow

## `/docs-review`

Always a **read-only first pass**.

Default full scope: every tracked `.md` and `.txt` except:

- `docs/tasks/`
- `docs/validation/`

Conversation may narrow scope explicitly.

Return interpreted scope, reviewed/excluded docs, contradictions, source/docs drift when applicable, stale statements, duplicated/misplaced authority, missing cross-references, routing issues, recommended changes by file, and application order.

Never modify files during `/docs-review`.

## `/docs-apply`

Apply only approved findings/change groups from current conversation.

Before editing, re-read targets and confirm drift has not invalidated findings.

Invoking `/docs-apply` explicitly authorizes approved **documentation-only** edits directly on `main` unless the user requests a branch/PR. It does not authorize source changes, unrelated cleanup, history rewriting, or unapproved docs edits.

After applying, report changed files, addressed/unapplied findings, newly discovered conflicts, and remaining validation.

# Prompt workflow

Strict order:

```text
/prompt-ass
→ /prompt-plan
→ /prompt-write <folder name>
```

Do not silently run missing stages. If unstable requirements, contradictory docs, repository drift, or a material decision blocks progress, return `Planning needed` and stop before the next stage.

## Prompt model/reasoning and usage selection

Every implementation and closeout task MUST carry an explicit recommended Codex model/reasoning configuration and a token/credit-usage estimate. Model choice and reasoning effort are separate dimensions; there is no repository-defined linear ladder such as `Terra Max` or `Sol Max`.

Use the exact model and reasoning labels actually available in the current Codex surface. Do not invent a model/effort name. Examples such as `Terra High`, `Terra Ultra`, `Sol Light`, `Sol High`, or `Sol Ultra` are valid only when those exact choices are currently available to the repository owner.

### Quality-first selection rule

Selection order is mandatory:

1. Determine the task's complexity and quality floor from correctness risk, security impact, data-integrity risk, architecture/blast radius, concurrency/transaction ownership, failure handling, and validation difficulty.
2. Identify the model/reasoning configurations that provide enough reasoning headroom to satisfy that quality floor.
3. Only among configurations that satisfy the quality floor, prefer the option expected to consume fewer tokens/credits.
4. Never reduce model capability or reasoning effort solely to save tokens when doing so materially increases implementation or review risk.

Cost is therefore an optimization constraint after quality, not the objective. The repository owner prefers the highest reliable output quality without unnecessary token expenditure.

Do not assume a cheaper-per-token model at maximum reasoning is cheaper overall than a stronger model at lighter reasoning. Account for both model token rates and expected reasoning/output volume. High/Ultra reasoning can consume materially more tokens, and eligible Ultra runs may use additional agents. Conversely, a stronger model at Light or another lower reasoning setting may be the more efficient choice for a tightly specified task.

### Complexity / quality classes

Use these classes to explain the quality floor; they are not model names and do not form a pricing table:

| Class | Typical task shape |
| ----- | ------------------ |
| `Standard` | Bounded implementation, leaf modules, straightforward migrations/repositories, deterministic tests, contained refactors. |
| `Elevated` | Subtle validation/state behavior, security-sensitive but narrow policy logic, meaningful persistence semantics, difficult edge cases. |
| `High` | Cross-cutting integration, multiple interacting modules, concurrency/transaction ownership, shared infrastructure, high-risk security boundaries, broad regression surface. |
| `Critical` | Exceptional work combining several high-risk dimensions where strongest available reasoning is materially justified. |

A higher complexity class may justify a more expensive configuration. Token efficiency MUST NOT override that conclusion.

### Required usage estimate

`/prompt-ass` and `/prompt-plan` MUST provide, for each proposed prompt:

- **Recommended configuration:** exact current model + reasoning choice.
- **Complexity / quality floor:** `Standard`, `Elevated`, `High`, or `Critical`, with concise risk rationale.
- **Estimated usage:** `Low`, `Moderate`, `High`, or `Very High`.
- **Alternative considered:** the most relevant cheaper or differently balanced configuration.
- **Efficiency rationale:** why the recommendation is expected to provide the best quality/usage balance.
- **Estimate confidence:** `Low`, `Medium`, or `High` when a meaningful estimate can be made.

When current official OpenAI Codex token/credit rates are available, use them for the estimate and comparison rather than stale repository numbers. A rough credit range MAY be included when the expected context/output/reasoning volume is sufficiently understood. Do not invent precise token or credit counts when uncertainty is high.

Usage estimates are planning estimates, not guarantees. Actual usage depends on prompt/context size, cached versus uncached input, output volume, reasoning effort, tool activity, retries, and any additional agents used by the selected mode.

For an expensive recommendation, explicitly consider whether one reasoning level lower, or a stronger model at lower reasoning, is likely to preserve the required quality. Choose the cheaper alternative only when it remains safely above the task's quality floor. If the more expensive setting materially reduces risk, recommend it and say that the additional cost is intentional.

### Workflow ownership

- `/prompt-ass` assigns a provisional recommended configuration, complexity/quality class, usage estimate, relevant alternative, and concise quality/efficiency rationale to every proposed implementation/closeout prompt.
- `/prompt-plan` reassesses those fields after source-level investigation. It may raise model/reasoning when actual risk requires it. It may recommend a lower-cost configuration than the assessment only when the source-level plan shows the same quality floor is still satisfied; explain the change rather than treating it as an automatic downgrade.
- `/prompt-write` writes the finalized `MODEL / REASONING / USAGE` block into every implementation/closeout task file.
- If `/prompt-write` revalidation discovers information that materially changes the task boundary or quality floor, return `Planning needed` rather than silently changing the approved plan.
- `/revalidate` compares an existing prompt/stack to current repository reality and current model/usage policy, reporting whether its recommended configuration still satisfies the quality floor and whether a more efficient configuration can do so without meaningful quality loss.
- Historical completed task prompts may retain the model/effort wording that was in force when they were executed. Unexecuted prompts using obsolete or unsupported model/effort names MUST be revalidated before execution.

## Versioning and phase-prompt numbering

Project versions use `0.<roadmap phase>.<phase prompt number>` while the project remains in the pre-1.0 roadmap.

- Phase prompt numbers are one-based. Task filenames begin with `P1`, then `P2`, `P3`, and so on; `P0` is not used.
- The task number and version patch number match directly. Example: Phase 1 `P1` → `0.1.1`; Phase 1 `P4` → `0.1.4`; Phase 2 `P1` → `0.2.1`.
- `0.<phase>.0` is the phase baseline. After the prior roadmap phase has formally closed, `/closeout` is the canonical handoff that verifies the closeout and, only on a green result, explicitly authorizes and performs the transition to `0.<new phase>.0`. This baseline transition consumes no implementation prompt number and does not change the P1 → `.1`, P2 → `.2`, P3 → `.3` mapping.
- A phase-baseline transition is never automatic. Invoking `/closeout` constitutes explicit repository-owner authorization for its green-path version-only transition. The owner may also separately authorize a `.0` transition explicitly when needed.
- `package.json` is the sole authoritative source for the current project version.
- The project intentionally does not use npm package locks. Repository npm configuration disables `package-lock.json` generation; dependency installation uses `package.json` and clean installs use `npm install`, not `npm ci`.
- Do not duplicate the current version in README, BOOT, contracts, source constants, or other manually maintained files.
- Project version changes occur only through execution of a new Codex roadmap-phase prompt, a green `/closeout` phase-baseline transition, or another explicit repository-owner-authorized `.0` transition after the prior phase closes. Documentation review/application, prompt assessment/planning/writing, code review, validation discussion, and other ChatGPT workflow activity do not otherwise increment it.
- Re-running or correcting the same Codex prompt retains that prompt's assigned version; it does not consume a new version number.
- If a `.0` baseline exists, the first prompt in that phase advances from `0.<phase>.0` to `0.<phase>.1`. If no `.0` baseline was authorized, the first prompt advances directly from the prior phase's final version to `0.<phase>.1`.
- Each implementation/closeout task prompt MUST state its assigned target version and require Codex to verify the expected preceding version (the authorized `.0` baseline when present, otherwise the prior phase/prompt version; or the same assigned version on a rerun), update `package.json` as part of that prompt, avoid generating `package-lock.json`, and include the versioned tree in the prompt's final validation.
- A closeout task prompt that owns a version change performs and commits that prompt-numbered version metadata transition before establishing the final source SHA to be validated. The later `/closeout` command, if green, performs the separate next-phase `.0` baseline transition.

## `/prompt-ass`

Determine safe task boundaries from established behavior/contracts/roadmap. No writes.

Return target behavior, constraints, roadmap phase, prompt count/order, goal/summary/dependencies/boundary rationale/deferred behavior, closeout task when needed, and for every proposed implementation/closeout prompt the provisional recommended configuration, complexity/quality floor, estimated usage, relevant alternative, estimate confidence when meaningful, and concise quality/efficiency rationale defined above.

Testing is part of task-boundary assessment: identify whether a prompt can own its focused tests and the required broader regression impact without becoming monolithic.

## `/prompt-plan`

Requires completed `/prompt-ass` in current conversation. Perform source-level planning for every assessed prompt: contracts/ADRs, implementation, schemas/migrations, process roles, helpers/consumers/tests/recent changes, likely file scope, preserved behavior, risks, focused tests, broader regression tests, required evidence levels, runtime/browser/database/fixture/live-Source validation, docs implications, acceptance criteria, non-goals.

Reassess the provisional model/reasoning recommendation, complexity/quality floor, expected usage, alternative, and efficiency rationale against the actual source-level boundary. Complexity and correctness supersede estimated cost. A more expensive configuration is required whenever the cheaper alternative would materially reduce reasoning headroom or increase regression risk.

Material boundary revisions produce `Planning needed`. No writes.

## `/prompt-write <folder name>`

Requires completed unblocked `/prompt-plan`. Revalidate current repo/docs and write one ordered `.txt` per approved prompt under:

```text
docs/tasks/<folder name>/
```

Each implementation/closeout task file MUST include its finalized `MODEL / REASONING / USAGE` block with recommended configuration, complexity/quality floor, estimated usage, relevant alternative, efficiency rationale, and estimate confidence when meaningful.

If revalidation reveals a materially changed task boundary or quality floor, return `Planning needed` rather than silently changing the approved plan.

Do not overwrite existing tasks without explicit authorization.

Default names:

```text
P1-<short-task-slug>.txt
P2-<short-task-slug>.txt
P3-<short-task-slug>.txt
```

Continue one-based numbering for additional prompts in the same phase.

## Supporting prompt commands

- `/prompt <task>` — one prompt in conversation only.
- `/stack <goal>` — legacy shorthand for `/prompt-ass`.
- `/split <task>` — narrow assessment shorthand.
- `/revalidate <task or stack>` — compare existing task(s) to current repo/contracts/model-usage policy and report whether the recorded configuration still satisfies the quality floor and whether a more efficient configuration can preserve the same expected quality.

# Review and validation commands

- `/review <commit, PR, task, implementation>`
- `/prove <behavior>`
- `/test-matrix <feature>`
- `/collector-check <source or collector>`
- `/dedupe-check <rule or case>`

These must honor current contracts, state separation, security, provenance, idempotency, failure isolation, feed eligibility, and `docs/contracts/testing-and-validation-contract.md`.

Reviews distinguish inspection from executed evidence. Do not upgrade a claim from source inspection to unit/integration/database/browser/live/deployment proof without observing the corresponding evidence.

# Decision commands

### `/lock <decision>`

Treat decision as authoritative direction and identify affected contracts/ADRs/root/task docs. Do not modify files unless instructed. Locked-law amendments use project-contract process.

### `/recommend`

Choose best option using contracts, architecture, roadmap, user value, security/reliability, implementation risk.

### `/status`

Return only: Completed / Current / Blocked / Next.

### `/next`

Recommend the single most logical next task.

# Command modifiers

`--deep`, `--quick`, `--docs-only`, `--code-only`, `--no-write`, `--prompt-only`, `--file-scoped`, `--regression-safe`, `--latest`, `--browser`, `--db`, `--tests`, `--contracts`, `--sources`, `--dedupe`, `--security`, `--reassess`.

# Codex prompt requirements

Finished implementation prompts normally include Task, Context, Current/Required behavior, roadmap phase, assigned project version, finalized `MODEL / REASONING / USAGE` block, governing contracts/ADRs/laws, inspected source, allowed/forbidden files, constraints, preserved behavior, applicable security/provenance/idempotency/failure-isolation implications, risks, focused tests, broader regression tests, required evidence levels, runtime/browser/database/fixture/live-Source validation, docs updates, acceptance criteria, and non-goals.

Every implementation prompt inherits `docs/contracts/testing-and-validation-contract.md`. A prompt must not treat tests as optional cleanup, silently accept missing prerequisites, or claim a higher evidence level than its validation procedure can prove.

Every Codex roadmap-phase prompt also inherits the versioning rules above: it owns exactly its assigned `0.<phase>.<prompt>` version, uses `package.json` as the authority, respects the lockfile-disabled npm policy, and does not create duplicate manually maintained version constants.

Every Codex roadmap-phase implementation/closeout prompt also inherits the finalized model/reasoning/usage recommendation from the prompt workflow. The recommendation must satisfy the recorded complexity/quality floor; token efficiency may optimize among adequate configurations but must never weaken the quality requirement.

Collection prompts preserve bootstrap/approval/lifecycle/operational boundaries, truthful Collection runs, pre-request network safety, run isolation, retry limits when applicable, Source-domain policy, and controlled deterministic collection tests without production safety bypasses.

Persistence/identity prompts address canonical Relevance ordering, transactional idempotency, Article observations, real-PostgreSQL constraints/concurrency where applicable, and rollback behavior.

Duplicate prompts preserve every Article/observation, exactly one Primary/group, review-state persistence, false-positive safeguards, manual reversibility, and regression corpus coverage.

Publication/Relevance prompts preserve topic independence, deterministic rule precedence, prospective-by-default rule edits, and full precedence-matrix tests.

Public-feed prompts preserve Publication public exposure, Source approval/lifecycle trust, Article visibility + ungrouped-or-Primary eligibility, deterministic published-at/first-seen feed-date semantics, bounded safe output, and the stored Article `original_url` as the public destination; they do not use collection operational/endpoint health state as an implicit historical feed-suppression rule. Browser-dependent claims require browser evidence.

Admin prompts preserve Cloudflare Access/origin protection, request integrity, Publication/resource ownership validation, and the MVP prohibition on unnecessary native identity/account work.

# Repository modification rules

- Do not modify/commit unless authorized by current request/command.
- `/closeout` performs only the quick phase-handoff verification described above and, when green, writes/commits only `package.json` for the next `0.<phase>.0` baseline. Invocation authorizes that version-only change on `main` unless a branch/PR is requested.
- `/docs-review` never writes.
- `/docs-apply` writes only approved docs; invocation authorizes those documentation-only changes on `main` unless branch/PR requested.
- `/prompt-ass` and `/prompt-plan` never write.
- `/prompt-write` writes only approved task files in established task folder.
- Documentation/prompt/review workflow activity does not change the package version except for the explicitly defined `/closeout` phase-baseline transition. Other version changes are limited to executed Codex roadmap-phase prompts and separately explicit owner-authorized `.0` transitions after the prior phase closes.
- No task writes while `Planning needed` remains unresolved.
- No speculative migrations/compatibility bridges.
- No topic conditionals in shared engine code.
- No Source/endpoint approval/state bypass or silent whitelist expansion.
- No parser-to-Article direct persistence.
- No Web/API inline Source fetching.
- No bypass of the Relevance boundary even before configurable rules exist.
- No deletion of Article/observation provenance because duplicate suppression exists.
- No weakening identity/duplicate/security/testing boundaries to make tests pass.
- No silent-green required test suite caused by missing prerequisites, skipped coverage, or zero matched tests.
- No MVP native administrator account/session/role subsystem unless explicitly promoted.
- Search all references before renames.
- Do not report tests/runtime/browser/database/live-Source behavior as verified unless observed at the appropriate evidence level.
- Do not create PRs, merge, force-update history, or perform non-document history changes unless explicitly instructed.
- Preserve smallest viable diff for scoped fixes.

# Pre-production compatibility rule

Prefer one canonical design. Do not add old/new aliases, duplicate synchronized fields, fallback paths, or speculative migration compatibility unless explicitly required.

# Boot maintenance

Update BOOT when phase, core paths, terminology, commands, authority, locked laws, modification conventions, versioning/prompt-numbering conventions, branch, repository identity, critical delivery ordering, foundational security/deployment decisions, or project-wide testing/validation policy changes.

Detailed feature specifications belong in specialized contracts/ADRs. When BOOT conflicts with a higher-authority contract, the contract wins and BOOT must be corrected.