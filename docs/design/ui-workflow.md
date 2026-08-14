# Parallel UI workstream

The UI workstream exists so presentation work can proceed while the roadmap/correction runner is occupied, without sharing a working tree or consuming roadmap versions.

## Branch and worktree model

- `main` remains the authoritative integration branch for roadmap phases, correction stacks, and accepted integrated product state.
- `ui-polish` is the permanent parallel presentation branch. A dedicated local worktree such as `news-scraper-ui/` SHOULD be attached to it when main-lane Codex work is running concurrently.
- UI work MUST NOT be executed in the same working tree used by an active phase/correction runner.
- Before beginning each new UI task, refresh remote state and incorporate current `main` into `ui-polish` using a non-destructive workflow. If relevant main-lane changes materially invalidate the planned task boundary, re-plan before implementation.
- Completed UI changes remain independently reviewable. Integrate them into `main` only after review and relevant validation. After integration, synchronize `ui-polish` with the new `main` before the next task.
- Do not force-update shared history merely to synchronize the UI workstream.

The existence of `ui-polish` does not make it a second product authority. Contracts and accepted integrated behavior on `main` remain authoritative; UI work must preserve them.

## Scope

The UI workstream normally owns presentation-focused changes such as:

- CSS and design tokens;
- typography, spacing, sizing, borders, surfaces, and visual hierarchy;
- responsive/mobile presentation;
- public-feed row/table/card presentation;
- hover, focus, active, and other visual interaction states;
- loading, empty, unavailable, and error-state presentation;
- accessibility presentation and keyboard/focus affordances;
- static presentation assets; and
- minimum markup/class changes needed to support an approved presentation change.

The UI workstream does not own or redefine:

- database schema or migrations;
- persistence, Article identity, provenance, duplicate semantics, or feed eligibility;
- Source/endpoint/Publication lifecycle or configuration semantics;
- collection, Worker, scheduling, jobs, health semantics, or network safety;
- API contracts or routing semantics;
- security/authentication/authorization policy;
- roadmap state, phase completion, correction gates, or project versioning.

Some frontend files are shared boundaries rather than automatically UI-owned. Public-page JavaScript, root-page rendering, API consumption, loading lifecycle, DOM structure covered by browser tests, server-rendered presentation, and theme/configuration plumbing MAY be changed by a UI task only when `/ui-plan` explicitly identifies the need, traces the affected behavior/consumers/tests, and proves the change remains presentation-scoped. If the required change materially alters backend/domain behavior or roadmap-owned functionality, stop and route it through the normal `/prompt-ass` → `/prompt-plan` → `/prompt-write` workflow instead.

A directory name such as `public/` is not itself an authorization boundary. Every UI task must state its actual allowed/expected files and forbidden behavior.

## Design guidance authority

Durable presentation decisions belong in design documents under `docs/design/`, not inside implementation prompts alone. Examples include visual hierarchy, layout behavior, responsive rules, accessibility presentation, interaction treatment, loading/empty/error presentation, and reusable design-system conventions.

Design guidance is subordinate to higher-authority product/domain contracts, ADRs, roadmap requirements, and the testing contract. It may define how supported behavior is presented but MUST NOT redefine the supported behavior itself.

The normal implementation entry point is `/ui-plan <task>`. `/ui-review` → explicit approval → `/ui-apply` is a conditional prerequisite, not a mandatory preflight for every UI task. `/ui-plan` determines whether the existing durable design guidance is sufficient. If it is sufficient, planning proceeds directly toward `/ui-write`. If it is missing, contradictory, materially ambiguous, or the requested task requires changing durable design guidance, `/ui-plan` MUST return `Planning needed` and require `/ui-review` → explicit approval → `/ui-apply` before planning resumes.

`/ui-plan` and `/ui-write` consume approved design guidance. They MUST NOT silently create, revise, or weaken durable design rules to make an implementation task easier. After a required `/ui-apply`, return to `/ui-plan` so the implementation boundary is reassessed against the newly approved design guidance before `/ui-write` is allowed.

## Version and roadmap rules

UI work is non-versioned parallel work:

- it MUST NOT modify `package.json` project version;
- it MUST NOT consume or reserve roadmap prompt numbers;
- it MUST NOT advance or close a roadmap phase or correction;
- it MUST NOT create a phase/correction closeout task;
- it is not a third `codex:phase` stack type.

UI prompts under `docs/design/tasks/` are single targeted prompts and are not subject to the phase/correction task-stack parser grammar.

## Workflow

The normal implementation path is:

```text
/ui-plan <task>
→ /ui-write <lower-kebab-slug>
→ execute the single prompt in the ui-polish worktree
→ review and validate
→ commit/integrate when accepted
```

If `/ui-plan` determines durable design guidance must first be created or changed, the path becomes:

```text
/ui-plan <task>
→ Planning needed: UI design guidance required
→ /ui-review <area>
→ explicit approval
→ /ui-apply
→ /ui-plan <task>
→ /ui-write <lower-kebab-slug>
→ execute/review/validate
```

`/ui-review` may also be invoked directly when the user explicitly wants to establish or revise design guidance before discussing a specific implementation task.

Most UI implementation work should be one focused prompt. If the requested change is too broad for one safe task, `/ui-plan` should return `Planning needed` and recommend a smaller UI task sequence or route cross-cutting work into the normal roadmap/correction planning pipeline. Do not manufacture a multi-prompt phase stack merely to fit UI work into existing automation.

### `/ui-review <area>`

`/ui-review` is a read-only design-guidance review. It is the UI counterpart to `/docs-review`, but unlike the normal documentation phase-handoff workflow it is only required when durable UI guidance needs creation/change or when `/ui-plan` requires it.

Review the relevant non-task design documents under `docs/design/`, the narrowest higher-authority product/domain/testing documents, and the current UI implementation or observable presentation when needed to identify design drift or missing guidance. Do not perform an indiscriminate full-repository documentation review.

Return at minimum:

- interpreted UI/design review scope;
- design documents reviewed and any task files excluded;
- existing presentation rules relevant to the area;
- missing, ambiguous, contradictory, stale, or duplicated design guidance;
- conflicts with higher-authority product/domain behavior;
- current implementation/design drift when material;
- recommended design-document changes by file, including proposed new design specification files only when substantive guidance warrants them;
- application order and any decisions requiring explicit owner approval.

`/ui-review` never modifies files, source, branches, project version, or roadmap state.

### `/ui-apply`

`/ui-apply` requires an approved `/ui-review` change group in the current conversation.

Before editing, re-read the approved target design documents and relevant higher-authority guidance, and confirm branch/source drift has not invalidated the review. Apply only the explicitly approved design-document changes on `ui-polish`.

`/ui-apply` may create or update substantive design guidance under `docs/design/`, excluding `docs/design/tasks/`. It MUST NOT:

- implement source/UI changes;
- create implementation prompts;
- modify `docs/design/tasks/`;
- change product/domain contracts unless separately authorized through the normal documentation workflow;
- change package version or roadmap/correction state;
- merge branches or invoke `codex:phase`.

After applying, report changed design files, addressed and unapplied approved findings, newly discovered conflicts, and any remaining design decisions or validation needed. When `/ui-review`/`/ui-apply` was required by an implementation attempt, the next implementation command is `/ui-plan` again, not `/ui-write`.

### `/ui-plan <task>`

`/ui-plan` is the normal read-only entry point for one targeted UI implementation task. It combines task-boundary assessment with source-level planning and decides whether durable design review/application is required first.

Before planning:

1. read `BOOT.md`;
2. read `docs/design/README.md` and this workflow;
3. read the narrowest governing product/design/testing contracts;
4. inspect current relevant `ui-polish` implementation, tests, and recent changes;
5. inspect relevant drift from current `main` when branch freshness could affect the task.

Return at minimum:

- task goal and why it belongs in the UI workstream;
- current relevant behavior and desired presentation behavior;
- governing approved design guidance;
- whether existing durable design guidance is sufficient or `/ui-review` → `/ui-apply` is required first;
- likely/allowed file scope and any shared-file boundary;
- behavior/contracts that must remain unchanged;
- explicit forbidden backend/domain changes;
- responsive and accessibility considerations when applicable;
- focused tests and broader regression/browser checks;
- runtime/browser evidence needed for acceptance;
- acceptance criteria and non-goals;
- one recommended lower-kebab task slug;
- recommended model/reasoning configuration, complexity/quality floor, estimated usage, alternative considered, efficiency rationale, and estimate confidence using the repository quality-first policy.

If existing approved design guidance is sufficient, `/ui-plan` may complete normally and enable `/ui-write`. If design guidance is missing, conflicting, materially ambiguous, or must be changed to support the request, return `Planning needed: UI design guidance required`, identify the required `/ui-review` area, and stop. `/ui-write` remains blocked until `/ui-review` → explicit approval → `/ui-apply` completes and `/ui-plan` is rerun successfully.

Branch/source drift or a required backend/domain behavior change may also produce `Planning needed`; route those cases appropriately rather than silently widening the UI task.

`/ui-plan` never writes files, modifies branches, changes version, implements source, or changes durable design guidance.

### `/ui-write <lower-kebab-slug>`

`/ui-write` requires a completed, unblocked `/ui-plan` in the current conversation. A previous `/ui-plan` that required `/ui-review`/`/ui-apply` does not satisfy this prerequisite until `/ui-plan` has been rerun after the approved design changes and completes without that blocker.

Before writing, re-read the relevant `ui-polish` source/docs/tests and check whether relevant `main` drift has invalidated the plan. If the approved boundary, quality floor, or governing design guidance materially changed, return `Planning needed`.

Write exactly one implementation-ready Codex prompt at:

```text
docs/design/tasks/<lower-kebab-slug>.txt
```

Do not overwrite an existing UI task without explicit authorization.

The prompt must include:

- `Workstream: UI`;
- required execution branch/worktree: `ui-polish`;
- a requirement to synchronize/verify the task against current `main` before source implementation when needed;
- explicit statement that the task is non-versioned and `package.json` version must remain unchanged;
- finalized model/reasoning/usage recommendation;
- governing contracts/design docs and inspected source;
- exact/likely allowed files and forbidden areas;
- required behavior, preserved behavior, constraints, risks, acceptance criteria, and non-goals;
- focused tests plus relevant broader/browser regression validation;
- prohibition on roadmap advancement, phase/correction closeout, and unrelated cleanup.

`/ui-write` writes only the approved prompt file. It does not execute Codex, implement source, invoke `codex:phase`, change package version, advance roadmap state, merge branches, or create/modify durable design guidance. If missing or contradictory design guidance is discovered during prompt revalidation, return `Planning needed` and route through `/ui-review` → explicit approval → `/ui-apply` → rerun `/ui-plan`.

## UI prompt execution and review

Execute the generated prompt as a targeted single Codex task in the `ui-polish` worktree. The implementation must remain inside the prompt boundary and leave project version unchanged.

Review UI work against both visual intent and preserved behavior. Browser/runtime claims require actually observed browser/runtime evidence; source inspection alone is not proof. Run focused tests and relevant public-feed/browser regression coverage identified by `/ui-plan` or the prompt.

When `main` has changed concurrently, re-synchronize and resolve conflicts on the UI branch before integration, then re-run the validation affected by those conflict resolutions. Do not treat validation from the pre-sync UI tree as proof for the integrated final tree.

## Relationship to the integrated presentation baseline and Phase 14

Accepted Phase 13 public-presentation work is the integrated presentation baseline on `main`. Ordinary later presentation-only refinements may continue through the `ui-polish` workflow under the boundaries above.

Phase 14 Source administration is roadmap-owned implementation work, including the protected admin shell, Source/endpoint behavior, and Source RSS/Atom item admission filter. It MUST NOT be silently recast as a generic parallel UI task. A strictly presentation-only refinement to an already-governed admin surface may use the UI workstream only when `/ui-plan` proves it does not redefine roadmap-owned behavior, API contracts, security, lifecycle, collection, or configuration semantics.
