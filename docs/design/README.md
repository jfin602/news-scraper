# Design documentation

`docs/design/` contains durable presentation/design guidance and the workflow for the parallel UI workstream.

Design documentation is subordinate to the product/domain contracts, Accepted ADRs, roadmap, and testing contract. It may define how supported behavior is presented, but it MUST NOT redefine routing, feed eligibility, Source/Publication semantics, persistence, collection, security, or other product/domain behavior.

For public-feed behavior, `docs/contracts/public-feed-and-admin-contract.md` remains authoritative. Design documents may specify typography, spacing, responsive layout, visual hierarchy, interaction presentation, loading/empty/error presentation, accessibility presentation, and other visual treatment around that behavior.

## Files

- `ui-workflow.md` — permanent `ui-polish` branch/worktree rules, UI task boundaries, integration/synchronization rules, and `/ui-plan` → `/ui-write` workflow.
- `tasks/` — created only when `/ui-write` emits targeted single-task Codex prompts. These are non-roadmap, non-versioned UI implementation instructions and are not parsed or executed by `codex:phase`.

Additional durable design specifications may be added here as presentation decisions become concrete. Do not create speculative design contracts or placeholder files.

## Authority and routing

When a design requirement conflicts with a higher-authority product/domain contract, report the conflict rather than silently changing behavior to satisfy the design document.

Use:

- `docs/contracts/public-feed-and-admin-contract.md` for supported public-feed behavior, routes, feed semantics, and external-link behavior;
- `docs/contracts/testing-and-validation-contract.md` for regression/evidence requirements;
- `docs/design/ui-workflow.md` for parallel UI planning, prompt generation, branch scope, and integration discipline;
- the narrowest additional design specification under `docs/design/` when one exists for the surface being changed.
