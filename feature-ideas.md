# Feature Ideas

This file is the running feature idea log for ideas proposed in this chat.

## Proposed Ideas

### +7KQW — 2026-08-11 — UI worktree helper commands

- **Status:** Proposed
- Add two lightweight local operator helpers for the permanent `ui-polish` worktree workflow:
  - `ui-sync` — verify the command is running in the UI worktree on `ui-polish`, require a clean working tree, fetch remote state, incorporate current `origin/main` with the repository-approved non-destructive synchronization strategy, and finish by showing the resulting branch/status summary. It should fail safely rather than syncing from the wrong repository/branch or over local changes.
  - `ui-status` — print a compact UI-workstream status summary including current branch, working-tree cleanliness, and how many commits `ui-polish` is ahead of or behind `main`/`origin/main` so the operator can immediately see whether synchronization or integration is needed.
- These are operator conveniences for moving safely between the main roadmap worktree and the parallel UI worktree. They should not become part of `codex:phase`, change project versioning, advance roadmap state, or automate merging UI work into `main`.

## Shipped Ideas

## Maintenance Notes

- Add newly proposed feature ideas under **Proposed Ideas** with a short description, date, status, and any relevant context.
- Move shipped feature ideas to **Shipped Ideas** with the implementation summary and shipped date.
- Every feature idea title must begin with a plus symbol followed by a unique 4-character ID, followed by the date and title: `### +ID — YYYY-MM-DD — Feature title`.
- Feature idea IDs use this restricted Base32 alphabet after the plus symbol: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. The characters I, O, 0, and 1 are excluded to reduce confusion.
- Assign IDs pseudo-randomly rather than sequentially. IDs are permanent and are never changed or reused, including after a feature idea is shipped.
- Include enough detail that the idea can be converted into an implementation prompt later.
