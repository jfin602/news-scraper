# Feature Ideas

This file is the running feature idea log for ideas proposed in this chat.

## Proposed Ideas

### +7KQW — 2026-08-11 — UI worktree helper commands

- **Status:** Proposed
- Add two lightweight local operator helpers for the permanent `ui-polish` worktree workflow:
  - `ui-sync` — verify the command is running in the UI worktree on `ui-polish`, require a clean working tree, fetch remote state, incorporate current `origin/main` with the repository-approved non-destructive synchronization strategy, and finish by showing the resulting branch/status summary. It should fail safely rather than syncing from the wrong repository/branch or over local changes.
  - `ui-status` — print a compact UI-workstream status summary including current branch, working-tree cleanliness, and how many commits `ui-polish` is ahead of or behind `main`/`origin/main` so the operator can immediately see whether synchronization or integration is needed.
- These are operator conveniences for moving safely between the main roadmap worktree and the parallel UI worktree. They should not become part of `codex:phase`, change project versioning, advance roadmap state, or automate merging UI work into `main`.

### +M7XR — 2026-08-11 — Article thumbnail image URLs

- **Status:** Proposed
- Extend structured-source collection so Articles may carry an optional normalized thumbnail/image URL when the approved Source provides one.
- Prefer image metadata already exposed by RSS/Atom or another approved structured adapter, such as Media RSS thumbnail/content fields, image enclosures, or equivalent structured fields. Do not fetch Article HTML solely to discover an image as part of the initial implementation.
- Carry the value through the normal Raw item → Article candidate → persisted Article pipeline, validate and normalize it as untrusted Source-derived metadata, persist it as nullable Article metadata, and expose it through the public feed API.
- Let the public UI render the remote image as a thumbnail beside an Article when available, with a clean text-only fallback when absent or unusable. The headline must continue linking to the stored original publisher URL.
- Initial scope stores the remote image URL only; it does not download, proxy, cache, transform, or host publisher image bytes. A controlled image proxy/cache may be considered separately if hotlink reliability, privacy, or content-delivery requirements justify it.
- Keep extraction and normalization topic independent and preserve existing Source approval, provenance, network-safety, idempotency, and feed behavior.

## Promoted Ideas

### +W6HF — 2026-08-13 — Source RSS/Atom item admission filter

- **Status:** Approved for Phase 14; governing behavior is now in the Source/collection, domain/data, admin, testing, architecture, and roadmap documents.
- The approved model is one optional Source-owned include-phrase list for RSS/Atom items. No configured phrases preserves collect-all behavior; one or more bounded, trimmed, non-empty phrases admit a parsed item when any phrase matches.
- Matching is deterministic case-insensitive literal substring matching over existing parsed title, summary/content text, and Source-provided category labels before Article-candidate normalization.
- There is no exclude-phrase list and no independent enabled toggle. The older include/exclude/toggle proposal is superseded and is not a compatibility mode.
- Filtered Raw items count in `source_item_filtered_count`; they are not normalization failures, Relevance `excluded` outcomes, or Article observations.
- Changes affect future collection only and do not automatically mutate historical Articles, observations, or Collection runs.

## Shipped Ideas

## Maintenance Notes

- Add newly proposed feature ideas under **Proposed Ideas** with a short description, date, status, and any relevant context.
- Move shipped feature ideas to **Shipped Ideas** with the implementation summary and shipped date.
- Every feature idea title must begin with a plus symbol followed by a unique 4-character ID, followed by the date and title: `### +ID — YYYY-MM-DD — Feature title`.
- Feature idea IDs use this restricted Base32 alphabet after the plus symbol: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. The characters I, O, 0, and 1 are excluded to reduce confusion.
- Assign IDs pseudo-randomly rather than sequentially. IDs are permanent and are never changed or reused, including after a feature idea is shipped.
- Include enough detail that the idea can be converted into an implementation prompt later.
