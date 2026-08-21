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
- Carry the value through the normal Raw item → Article candidate → persisted Article pipeline, validate and normalize it as untrusted Source-derived metadata, persist it as nullable Article metadata, and expose it through the canonical outward distribution/read-model boundary.
- Let supported consumers, including integrations and the bundled reference UI, render the remote image when available with a clean text-only fallback. The headline must continue linking to stored `original_url`.
- Initial scope stores the remote image URL only; it does not download, proxy, cache, transform, or host publisher image bytes. A controlled image proxy/cache may be considered separately if hotlink reliability, privacy, or content-delivery requirements justify it.
- Keep extraction and normalization topic independent and preserve existing Source approval, provenance, network-safety, idempotency, and feed behavior.

### +H5QZ — 2026-08-18 — Public Article summaries from Source descriptions

- **Status:** Proposed
- The existing collection pipeline already captures available RSS/Atom description/summary/content metadata, normalizes it into bounded plain-text `Article.summary`, and persists it with the Article. This proposal does **not** add a second description collector or duplicate persisted field.
- Phase 2 now supplies nullable `Article.summary` through the transport-independent distribution read model; permanent v1 HTTP exposure remains Phase 4 work. Visible summary presentation in the bundled/reference frontend remains this Proposed presentation enhancement.
- Preserve the existing bounded/plain-text normalization and treat the value as untrusted Source-derived metadata. Do not render publisher-supplied HTML directly.
- Missing summaries remain normal and must produce a clean headline-only fallback.
- Do not fetch Article pages merely to manufacture missing summaries, and do not introduce AI-generated summaries or full Article-body republication.
- The exact visible treatment can be decided during later UI/design work; possibilities include short excerpts beneath headlines or use in appropriate semantic/SEO presentation without changing the headline's direct `original_url` destination.
- Keep the behavior topic independent and preserve Source approval, provenance, Article identity, duplicate handling, moderation, and public-feed ordering.
- **Required documentation work when implemented:** review the governing collection/data/public-feed/design/testing documentation and record the now-public role and presentation rules for `Article.summary`. Those changes are deferred until this feature is promoted for implementation.

### +R8VN — 2026-08-19 — Source RSS/Atom admission include/exclude operators

- **Status:** Proposed
- Expand the existing Source-owned RSS/Atom item admission filter from include-only `ANY` matching into a bounded structured policy with separate Include and Exclude phrase groups.
- Each group may use `ANY` (`OR`) or `ALL` (`AND`) matching. The final admission rule is fixed as `include_passes AND NOT exclude_matches`, with Exclude winning when both sides match.
- Empty Include means all otherwise-valid RSS/Atom Raw items pass the include side; empty Exclude means nothing is excluded. Existing Sources with legacy include phrases must preserve their current behavior as Include + `ANY` after upgrade.
- Preserve the existing deterministic case-insensitive literal substring matching, plain-text preparation, and bounded RSS/Atom editorial fields: title, summary/content text, and Source-provided category labels. Do not introduce regex, glob, fuzzy, semantic/AI, arbitrary-expression, or Article-page-fetch behavior.
- Keep this filter RSS/Atom-only and pre-normalization. HTML listing endpoints continue to bypass it. Filtered Raw items continue to count only in `source_item_filtered_count`, not as Relevance `excluded`, normalization failures, Articles, or Article observations.
- Treat this as topic-independent base-engine behavior with Source-level configuration. The admin UI should expose separate Include/Exclude phrase lists and clear `Any (OR)` / `All (AND)` selectors rather than a free-form query language.
- Because the existing phrase persistence is part of the supported `1.0.0` production baseline, implementation must use a forward-compatible migration that preserves existing customer configuration rather than rewriting supported migration history.
- **Required documentation work when implemented:** revise the governing Source/collection, domain/data, architecture, admin/onboarding, testing, and routing summaries that currently define the filter as include-only/ANY-match; historical Phase 14 roadmap and validation evidence must remain unchanged.

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
