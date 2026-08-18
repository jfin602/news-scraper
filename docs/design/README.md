# Design documentation

`docs/design/` contains durable presentation/design guidance and the workflow for the parallel UI workstream.

Design documentation is subordinate to the product/domain contracts, Accepted ADRs, roadmap, and testing contract. It may define how supported behavior is presented, but it MUST NOT redefine routing, feed eligibility, Source/Publication semantics, persistence, collection, security, or other product/domain behavior.

For public-feed behavior, `docs/contracts/public-feed-and-admin-contract.md` remains authoritative. Design documents may specify typography, spacing, responsive layout, visual hierarchy, interaction presentation, loading/empty/error presentation, accessibility presentation, and other visual treatment around that behavior.

## Files

- `public-feed-presentation.md` — durable public-feed visual/presentation guidance for Phase 13 and later presentation work, including layout, typography, themes, states, responsive behavior, accessibility presentation, and design tokens.
- `ui-workflow.md` — permanent `ui-polish` branch/worktree rules, UI task boundaries, conditional design-guidance review/apply rules, integration/synchronization rules, and `/ui-plan` → `/ui-write` workflow.
- `tasks/` — created only when `/ui-write` emits targeted single-task Codex prompts. These are non-roadmap, non-versioned UI implementation instructions and are not parsed or executed by `codex:phase`.

Additional durable design specifications may be added here as presentation decisions become concrete. Do not create speculative design contracts or placeholder files.

## Authority and routing

When a design requirement conflicts with a higher-authority product/domain contract, report the conflict rather than silently changing behavior to satisfy the design document.

Use:

- `docs/contracts/public-feed-and-admin-contract.md` for supported public-feed behavior, routes, feed semantics, and external-link behavior;
- `docs/contracts/testing-and-validation-contract.md` for regression/evidence requirements;
- `docs/design/ui-workflow.md` for parallel UI design review/application, planning, prompt generation, branch scope, and integration discipline;
- `docs/design/public-feed-presentation.md` for public-feed layout, typography, themes, states, responsive behavior, accessibility presentation, and design tokens;
- the narrowest additional design specification under `docs/design/` when one exists for the surface being changed.

## UI workflow

`docs/design/ui-workflow.md` is the detailed authority. Targeted presentation work runs on permanent branch `ui-polish`, isolated in a separate worktree from active roadmap/correction runner work. It is non-versioned, does not advance roadmap/correction state, and is not merged merely because a prompt completes.

The normal path is `/ui-plan` → `/ui-write`. If durable guidance is missing, contradictory, materially ambiguous, or must change, use `/ui-review` → explicit approval → `/ui-apply`, then rerun `/ui-plan` before `/ui-write`. A blocked earlier plan never authorizes writing.
