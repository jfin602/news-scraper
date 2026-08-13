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

### +W6HF — 2026-08-13 — Source item include/exclude filtering

- **Status:** Proposed
- Add an optional Source-level item filter for RSS/Atom collection. Filtering is explicitly disabled by default so newly configured Sources preserve current collect-all behavior unless an administrator turns it on.
- Store the enabled state independently from the configured patterns so an administrator may temporarily disable filtering without losing the saved include/exclude phrases.
- Support independently optional include and exclude phrase lists:
  - with only include phrases configured, admit an item when it matches any include phrase;
  - with only exclude phrases configured, admit everything except items matching any exclude phrase;
  - with both configured, require an include match and no exclude match;
  - exclude matches take precedence over include matches.
- Matching should be deterministic, case-insensitive, bounded, topic independent, and operate on appropriate normalized editorial text such as title, summary/content, and Source-provided category labels. Avoid regex, fuzzy, stemming, semantic/AI, or arbitrary-expression behavior unless deliberately introduced later.
- Apply filtering prospectively during future collection runs only. Enabling or editing a filter must not automatically delete, hide, or bulk-reprocess previously persisted Articles.
- Filtered items should terminate before Article identity/persistence while preserving truthful Collection-run/observation accounting with stable machine-readable exclusion reasons rather than disappearing silently from parser/run counts.
- Keep the filter as Source configuration rather than endpoint-specific or indie-author-specific engine logic. The initial implementation applies to RSS/Atom items, while the conceptual model should remain reusable for future structured adapters when explicitly supported.
- Before full admin UX exists, provide the smallest explicit operator configuration path needed to configure/edit the filter without weakening ordinary bootstrap create-if-absent/no-overwrite semantics.
- Expose the same Source item-filter model in the protected admin Source editor when Source administration is implemented, including an **Enable item filtering** toggle (off by default), include-phrase management, exclude-phrase management, validation, and concise explanation of effective matching behavior.

## Shipped Ideas

## Maintenance Notes

- Add newly proposed feature ideas under **Proposed Ideas** with a short description, date, status, and any relevant context.
- Move shipped feature ideas to **Shipped Ideas** with the implementation summary and shipped date.
- Every feature idea title must begin with a plus symbol followed by a unique 4-character ID, followed by the date and title: `### +ID — YYYY-MM-DD — Feature title`.
- Feature idea IDs use this restricted Base32 alphabet after the plus symbol: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. The characters I, O, 0, and 1 are excluded to reduce confusion.
- Assign IDs pseudo-randomly rather than sequentially. IDs are permanent and are never changed or reused, including after a feature idea is shipped.
- Include enough detail that the idea can be converted into an implementation prompt later.
