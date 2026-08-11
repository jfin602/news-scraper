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

## Version and roadmap rules

UI work is non-versioned parallel work:

- it MUST NOT modify `package.json` project version;
- it MUST NOT consume or reserve roadmap prompt numbers;
- it MUST NOT advance or close a roadmap phase or correction;
- it MUST NOT create a phase/correction closeout task;
- it is not a third `codex:phase` stack type.

UI prompts under `docs/design/tasks/` are single targeted prompts and are not subject to the phase/correction task-stack parser grammar.

## Workflow

Use:

```text
/ui-plan <task>
→ /ui-write <lower-kebab-slug>
→ execute the single prompt in the ui-polish worktree
→ review and validate
→ commit/integrate when accepted
```

Most UI work should be one focused prompt. If the requested change is too broad for one safe task, `/ui-plan` should return `Planning needed` and recommend a smaller UI task sequence or route cross-cutting work into the normal roadmap/correction planning pipeline. Do not manufacture a multi-prompt phase stack merely to fit UI work into existing automation.

### `/ui-plan <task>`

`/ui-plan` is read-only and combines task-boundary assessment with source-level planning for one targeted UI task.

Before planning:

1. read `BOOT.md`;
2. read `docs/design/README.md` and this workflow;
3. read the narrowest governing product/design/testing contracts;
4. inspect current relevant `ui-polish` implementation, tests, and recent changes;
5. inspect relevant drift from current `main` when branch freshness could affect the task.

Return at minimum:

- task goal and why it belongs in the UI workstream;
- current relevant behavior and desired presentation behavior;
- likely/allowed file scope and any shared-file boundary;
- behavior/contracts that must remain unchanged;
- explicit forbidden backend/domain changes;
- responsive and accessibility considerations when applicable;
- focused tests and broader regression/browser checks;
- runtime/browser evidence needed for acceptance;
- acceptance criteria and non-goals;
- one recommended lower-kebab task slug;
- recommended model/reasoning configuration, complexity/quality floor, estimated usage, alternative considered, efficiency rationale, and estimate confidence using the repository quality-first policy.

If branch/source drift, unclear design authority, or a required behavior change makes the proposed boundary unsafe, return `Planning needed` rather than silently widening the UI task.

`/ui-plan` never writes files, modifies branches, changes version, or implements source.

### `/ui-write <lower-kebab-slug>`

`/ui-write` requires a completed, unblocked `/ui-plan` in the current conversation.

Before writing, re-read the relevant `ui-polish` source/docs/tests and check whether relevant `main` drift has invalidated the plan. If the approved boundary or quality floor materially changed, return `Planning needed`.

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

`/ui-write` writes only the approved prompt file. It does not execute Codex, implement source, invoke `codex:phase`, change package version, advance roadmap state, or merge branches.

## UI prompt execution and review

Execute the generated prompt as a targeted single Codex task in the `ui-polish` worktree. The implementation must remain inside the prompt boundary and leave project version unchanged.

Review UI work against both visual intent and preserved behavior. Browser/runtime claims require actually observed browser/runtime evidence; source inspection alone is not proof. Run focused tests and relevant public-feed/browser regression coverage identified by `/ui-plan` or the prompt.

When `main` has changed concurrently, re-synchronize and resolve conflicts on the UI branch before integration, then re-run the validation affected by those conflict resolutions. Do not treat validation from the pre-sync UI tree as proof for the integrated final tree.

## Relationship to Phase 13

Early UI work does not automatically complete or redefine Phase 13 — Public presentation polish. It may satisfy portions of that future roadmap work. When Phase 13 is reached, assess the then-current integrated implementation against the Phase 13 roadmap exit gate and governing contracts, crediting already-completed compliant presentation work rather than rebuilding it by default.
