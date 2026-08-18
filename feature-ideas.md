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

### +H5QZ — 2026-08-18 — Public Article summaries from Source descriptions

- **Status:** Proposed
- The existing collection pipeline already captures available RSS/Atom description/summary/content metadata, normalizes it into bounded plain-text `Article.summary`, and persists it with the Article. This proposal does **not** add a second description collector or duplicate persisted field.
- Extend the public Article/read-model boundary so the stored optional Source-derived summary can be used by public presentation and SEO-oriented server-rendered output when available.
- Preserve the existing bounded/plain-text normalization and treat the value as untrusted Source-derived metadata. Do not render publisher-supplied HTML directly.
- Missing summaries remain normal and must produce a clean headline-only fallback.
- Do not fetch Article pages merely to manufacture missing summaries, and do not introduce AI-generated summaries or full Article-body republication.
- The exact visible treatment can be decided during later UI/design work; possibilities include short excerpts beneath headlines or use in appropriate semantic/SEO presentation without changing the headline's direct `original_url` destination.
- Keep the behavior topic independent and preserve Source approval, provenance, Article identity, duplicate handling, moderation, and public-feed ordering.
- **Required documentation work when implemented:** review the governing collection/data/public-feed/design/testing documentation and record the now-public role and presentation rules for `Article.summary`. Those changes are deferred until this feature is promoted for implementation.

## Shipped Ideas

### +W6HF — 2026-08-13 — Source RSS/Atom item admission filter

- **Status:** Shipped 2026-08-14 as part of Phase 14.
- The Source-owned RSS/Atom item admission filter uses optional bounded include phrases with deterministic case-insensitive literal any-match behavior; absent phrases preserve collect-all behavior.
- Filtered Raw items are accounted in `source_item_filtered_count`, not as normalization failures, Relevance `excluded` outcomes, or Article observations.

## Maintenance Notes

- Add newly proposed feature ideas under **Proposed Ideas** with a short description, date, status, and any relevant context.
- Move shipped feature ideas to **Shipped Ideas** with the implementation summary and shipped date.
- Every feature idea title must begin with a plus symbol followed by a unique 4-character ID, followed by the date and title: `### +ID — YYYY-MM-DD — Feature title`.
- Feature idea IDs use this restricted Base32 alphabet after the plus symbol: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. The characters I, O, 0, and 1 are excluded to reduce confusion.
- Assign IDs pseudo-randomly rather than sequentially. IDs are permanent and are never changed or reused, including after a feature idea is shipped.
- Include enough detail that the idea can be converted into an implementation prompt later.
