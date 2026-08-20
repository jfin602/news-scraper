# Public feed presentation

## Authority and direction

This document defines the durable visual treatment of the **bundled/reference public frontend** established in Phase 13 and preserved through the `1.0.1` server-rendering work. Higher-authority product/domain contracts, the roadmap, ADRs, and testing contract remain authoritative for behavior.

The 2026-08-19 headless product shift does not remove or de-support this frontend. It changes its product role: the Platform core is collection, normalization, editorial control, persistence, deduplication, and governed distribution; this frontend is one supported consumer of that core. This document does not prescribe integration presentation. Customer freedom to replace PHP/WordPress fallback markup or consume normalized data directly is governed by Project Contract Law 13 and `docs/contracts/distribution-and-integration-contract.md`.

Visual direction for the bundled/reference frontend: **modern editorial / publication desk**. Within this frontend, the Publication and its headlines should remain the visual focus. Avoid generic SaaS-dashboard framing, card-heavy news-portal styling, sidebars, glassmorphism, heavy shadows, decorative gradients, zebra tables, and unrelated application chrome.

Presentation must preserve Phase 12 search/filter/pagination/URL semantics, feed eligibility/order, the governed date-presentation semantics (configured valid IANA `presentation_timezone` when present and UTC fallback otherwise), and exact stored `original_url` destinations.

## Composition and masthead

Use a centered editorial canvas around the existing 70–76rem content range with responsive side padding. Vertical order is masthead, discovery band, feed status/state, headline feed, then local load-more controls.

The masthead shows configured logo when present, Publication name after public data is known, optional description, and a secondary theme control. Missing logo/description collapses cleanly; do not invent placeholder branding or generic editorial copy.

Configured accent color is a restrained brand signal only: e.g. a rule, small mark, or selected-control detail. Do not make arbitrary accent color the sole body-text, error-text, or focus color because contrast is not guaranteed.

## Typography

Use a serif-forward editorial hierarchy for Publication name and Article headlines, with a neutral sans-serif layer for dates, Source names, filters, buttons, pagination, and status text. Prefer dependency-free local/system stacks in Phase 13; do not add a remote font dependency merely for styling.

## Feed layout

Desktop keeps `Date | Headline | Source` as a news index, not a spreadsheet:

- narrow muted Date column;
- dominant flexible Headline column;
- medium muted Source column;
- thin separators and comfortable vertical rhythm;
- no per-Article cards or zebra striping;
- understated column headings;
- natural wrapping for long headlines and Source names;
- clear headline link affordance and unmistakable hover/focus states.

Mobile uses the established stacked pattern:

```text
DATE · SOURCE
Linked article headline
```

Rows remain rule-separated rather than card-based. Discovery controls become a natural single-column/full-width flow when required.

## Discovery controls

Keep existing keyword, Source, Category, Search, and Reset behavior unchanged. Present them as one compact editorial filter band between masthead and feed.

Desktop target:

```text
[ Keyword........ ] [ Source ▾ ] [ Category ▾ ] [ Search ] [ Reset ]
```

Search is primary; Reset is quiet/secondary. Controls use consistent height, subtle borders, modest radius, visible focus, accessible target sizing, and must not overflow with long values. Avoid excessive pill styling.

## Theme selector and themes

Expose all three states explicitly: `System`, `Light`, `Dark`. Prefer a compact three-option segmented control on desktop; a compact select-style control is acceptable on narrow layouts. Do not reduce this to a binary sun/moon toggle.

Light theme: warm/off-white page, charcoal primary text, restrained gray metadata/rules, subtly differentiated filter surface.

Dark theme: deep charcoal rather than pure black, soft off-white text, muted readable metadata, subtle surface/rule differentiation.

Theme changes presentation tokens only, never feed requests, URL state, Publication configuration, or content structure.

Use a compact semantic token layer with equivalents of `--page-bg`, `--surface`, `--surface-subtle`, `--text-primary`, `--text-muted`, `--border`, `--link`, `--focus-ring`, `--brand-accent`, `--danger`, and `--control-bg`, with effective light/dark values and safe application-controlled contrast fallbacks.

## Server-rendered initial and enhanced loading states

The `1.0.1` server-rendering work removed the JavaScript-owned initial loading lifecycle for a successful reference-frontend request. The initial `GET /` HTML already contains the resolved Publication presentation, discovery state, and first feed page when the request succeeds.

For the initial successful page:

- do not visibly paint `News feed` or any generic/unset Publication name before configured content;
- do not show fake description/logo, skeleton headlines, or an initial loading spinner in place of available server-rendered content;
- JavaScript must treat the server-rendered DOM as the initial canonical state and must not clear or reconstruct it merely to refetch the same first page;
- delayed or unavailable JavaScript must leave the rendered first page useful and readable.

Loading presentation remains relevant to later JavaScript-enhanced transitions such as a new search/filter request or load-more continuation. Those transitions may use the established small indicator and accessible status text, and under `prefers-reduced-motion` must use an equivalent static/non-continuously-animated indication.

Empty, unavailable, invalid, and dependency-error server-rendered states share the same restrained feed-state treatment, not giant alert cards. State must not rely on color alone. Invalid discovery keeps Reset easy to find. Continuation failure remains local to pagination and must not destroy already loaded Articles.

`Load more` is visually secondary, keeps its footprint while busy, and keeps progress/error messaging local to pagination.

## Links, motion, responsive behavior, accessibility

Headline activation remains a direct same-context link to exact stored `original_url`; do not force new tabs or add redirect/tracking wrappers.

Motion stays minimal. Short focus/color transitions and a lightweight loader for enhanced transitions are acceptable; avoid row entrance animation, theme crossfades, sliding filter panels, parallax, and animated headline reflow. Honor `prefers-reduced-motion`.

Across supported widths:

- no horizontal page scrolling;
- headlines wrap naturally rather than being aggressively truncated;
- long Source/Category labels remain contained;
- discovery controls reflow before becoming cramped;
- desktop transitions cleanly to stacked mobile presentation.

The reference frontend targets WCAG 2.2 AA: semantic/native controls, coherent keyboard order, visible focus in both themes, applicable contrast, target sizing/spacing, responsive reflow, assistive-technology-understandable status/error/loading states, non-color-only state communication, and reduced-motion behavior.

## Non-goals

This specification does not authorize changes to feed eligibility/order, discovery/cursor/history semantics, Publication admin UI, configurable timezone/date behavior, duplicate moderation, featured ordering, Article-body republishing, Article thumbnails/images, remote font dependencies, or topic-specific shared-engine/UI behavior.

It also does not govern client-site integration presentation, widget styles, iframe behavior, CMS components, distribution transports, backlink/SEO behavior, or Distribution Profile semantics. Those belong to the distribution contract and its remaining lower-level decisions.

## Validation intent

Reference-frontend browser validation should preserve representative desktop/mobile layouts, effective light/dark presentation, System/Light/Dark selection and persistence, system-following behavior, keyboard/focus, reduced motion, empty/unavailable/invalid/error states, long-content reflow, direct publisher links, and preserved discovery workflows. It should also observe that the successful first page is already populated from server-rendered HTML before client JavaScript enhancement and remains useful with JavaScript disabled. Direct HTTP/source validation belongs to the testing contract and complements, rather than replaces, browser evidence.
