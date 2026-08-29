# Known Issues

This file is the running issue log for problems reported in this chat.

## Open Issues

### H3CJ — 2026-08-28 — PHP local-read configuration file is not loaded by the supported visitor path

- **Status:** Open
- **Target:** 3.0 Phase 2 / `2.2.x`
- The PHP integration package ships `config/local-read.env.example`, but the supported customer example reads local-read settings only from the PHP process environment and does not load the supplied private configuration file itself.
- This leaves the visitor-side integration dependent on web-server environment injection or customer-written loading glue even if the sync-side launcher is corrected under `T4QP`.
- Phase 2 must provide one supported package-owned local-read configuration-loading path that can consume the private customer configuration without exposing the sync bearer token, upstream URL, or other synchronization-only secrets to the visitor process.
- The supported customer tag must not require the customer to invent an environment loader merely to read `NEWS_SCRAPER_PROFILE_KEY`, `NEWS_SCRAPER_STATE_ROOT`, cadence, or stale-age configuration.
- The correction must preserve local-only visitor rendering and the existing separation between public rendering and upstream synchronization authority.

### P9BW — 2026-08-28 — PHP sync and local-read shared configuration can drift

- **Status:** Open
- **Target:** 3.0 Phase 2 / `2.2.x`
- The current `sync.env` and `local-read.env` examples duplicate shared values such as Profile key, state root, cadence, and optional stale-age settings.
- Because the two processes can be configured independently, the synchronizer and visitor reader can silently point at different Profile/state/freshness settings even though they are intended to operate on one customer integration.
- Phase 2 should establish one supported source of truth for shared non-secret integration settings while keeping synchronization-only secrets such as the bearer token and upstream base URL unavailable to ordinary visitor rendering.
- Configuration loading must fail clearly on incompatible or ambiguous configuration rather than silently choosing mismatched values.
- The design must remain suitable for the supported sibling `ns-integration` / `ns-private` layout and future multi-Profile configuration without embedding customer-specific paths or secrets into package source.

### D4NZ — 2026-08-28 — PHP integration package lacks an explicit live upgrade and rollback path

- **Status:** Open
- **Target:** 3.0 Phase 2 / `2.2.x`
- The next customer deployment is a replacement of an already-live PHP integration package rather than a fresh installation, but the current package contract primarily describes initial installation/runtime behavior.
- A whole-folder replacement must preserve private configuration, existing LKG/state, machine credentials, stable cron targets, and customer-owned presentation while allowing the package code itself to be replaced cleanly.
- Phase 2 must define and validate a supported upgrade procedure for the current `ns-integration` + sibling `ns-private` layout, including a practical rollback path to the prior package when the new package fails qualification after installation.
- Package replacement must not delete or rewrite customer state merely because runtime code is upgraded, and rollback must not require reconstructing credentials or previously valid LKG data.
- Upgrade/rollback instructions must identify which files/directories are package-owned versus customer/private state so operators do not accidentally overwrite durable configuration or state.

### Y8FK — 2026-08-28 — Installed PHP integration runtime does not expose the exact package version

- **Status:** Open
- **Target:** 3.0 Phase 2 / `2.2.x`
- Generated ZIPs contain exact `VERSION` and `integration-package.json` metadata, but the PHP runtime health model currently reports a generic adapter identity rather than the exact installed package version.
- This makes it unnecessarily difficult to confirm which customer package is actually running during upgrades, support, and post-deployment verification.
- Phase 2 should make the exact installed integration package version safely observable through the supported package/runtime diagnostic surface without exposing credentials, filesystem internals, or other secrets.
- Version reporting must be derived from package-owned version metadata rather than duplicated hand-maintained constants that can drift from the generated ZIP version.

### C2RV — 2026-08-28 — Customer local-read integration depends on internal package source layout

- **Status:** Open
- **Target:** 3.0 Phase 2 / `2.2.x`
- The current customer example directly requires `src/bootstrap.php`, coupling customer-facing integration code to the package's internal source-directory layout.
- This makes future internal refactors riskier and gives customer-owned presentation code knowledge it should not need about package internals.
- Phase 2 should provide a stable package-owned local-read entry point intended for customer integration and have the shipped default `top-tag.php` use that boundary.
- Customer presentation should receive normalized local-read data through the supported entry point without parsing cache files, reaching into individual internal source files, or reimplementing Profile/eligibility semantics.
- Internal package organization may evolve behind that boundary as long as the supported customer integration contract remains stable.

### W5GH — 2026-08-28 — PHP integration package has no supported installation preflight

- **Status:** Open
- **Target:** 3.0 Phase 2 / `2.2.x`
- The package currently relies on runtime failure to reveal several installation problems, such as unreadable private configuration, invalid package metadata, unusable state-root paths, or missing PHP/runtime prerequisites.
- This makes customer-package replacement harder to qualify safely before the live cron/tag path is switched over.
- Phase 2 should provide a bounded non-secret preflight/diagnostic path that can verify the installed package identity/version, required PHP/runtime prerequisites, private configuration readability/shape, and local state-root usability before customer cutover.
- Any explicit upstream connectivity/authentication check must remain opt-in to the synchronization diagnostic path and must never print the bearer credential or secret-bearing configuration values.
- Preflight success is setup evidence only; it must not be confused with successful synchronization, valid LKG activation, or customer-page rendering evidence.

### M6SX — 2026-08-28 — Source RSS/Atom admission filter cannot exclude unwanted items

- **Status:** Open
- **Target:** 3.0 Phase 2 / `2.2.x`
- The currently implemented Source-level RSS/Atom item admission filter is include-only: configured phrases use deterministic case-insensitive `ANY` matching. The owner-approved Phase 2 contract now requires the bounded Exclude extension, but implementation has not shipped it yet.
- This makes broad approved feeds harder to tune when a Source contains a recurring class of unwanted items that cannot be cleanly removed with positive include phrases alone.
- Phase 2 must add a bounded Source-level exclude phrase list at the existing pre-normalization RSS/Atom admission boundary. An item matching an exclude phrase must be rejected even if it also matches an existing include phrase; an empty exclude list preserves current behavior.
- Existing Source include configuration and collect-all behavior must remain backward compatible. The change must stay topic independent, RSS/Atom-only, prospective for future collection attempts, and must not become a second Relevance engine or retroactively hide/delete already-persisted Articles.
- The protected admin Source workflow should expose the exclude list alongside the existing admission phrases so operators can manage it without editing storage directly.
- This promotes only the Source-level exclude capability from proposed feature idea `+R8VN` into the `2.2.x` correction scope. The broader proposed configurable `ANY`/`ALL` operator expansion remains unpromoted unless separately owner-approved.

### Q7HF — 2026-08-28 — PHP integration duplicates customer-owned presentation through bundled renderer

- **Status:** Open
- **Target:** 3.0 Phase 2 / `2.2.x`
- The current customer integration uses the bundled PHP renderer path but then overrides that presentation in the customer's top PHP tag, leaving two presentation layers for the same feed output.
- This is unnecessarily indirect and cuts against the integration contract boundary that the customer owns feed presentation, CSS/classes, surrounding markup, and site composition while News Scraper supplies governed normalized Profile data.
- The intended correction is to remove the bundled/local renderer as a supported presentation layer and keep the PHP package focused on synchronization, last-known-good state, and normalized local-read access.
- The generated ZIP must instead include a customer-editable root-level `top-tag.php` that demonstrates the default local-read insertion directly from normalized data. The default should be a basic server-rendered table/example rather than an internal renderer abstraction.
- `top-tag.php` must keep its PHP/HTML easy to inspect and edit: HTML elements should be laid out on separate source lines rather than assembled into an opaque single-line concatenated HTML string. The file is an instructional default, not authoritative presentation.
- The replacement must preserve the existing normalized Profile results, canonical Article ordering/eligibility, exact stored publisher `originalUrl` destinations, local-only rendering, safe empty/unavailable handling, and all sync/LKG behavior. Customer markup must not become a new filtering, reranking, or editorial-interpretation layer.
- Do not fold this correction into the current Gemini Phase 1 / `2.1.x` work. Address it in the Phase 2 Gemini-capable package refresh so the customer receives one coherent updated package.

### T4QP — 2026-08-26 — PHP integration package requires a hand-created sync launcher

- **Status:** Open
- **Target:** 3.0 Phase 2 / `2.2.x`
- The generated PHP integration package includes `bin/sync.php` plus `config/sync.env.example`, but `bin/sync.php` reads configuration from the process environment and does not load the supplied private configuration files itself.
- On shared hosting such as HostGator, this forces the customer to hand-create a private wrapper such as `run-sync.php` merely to load private configuration before invoking the packaged synchronization entrypoint.
- The current production customer already uses such a custom `run-sync.php`, and the customer's existing cron job calls that launcher. A future whole-folder replacement of `ns-integration` would therefore break scheduled synchronization if the replacement package omitted the launcher or moved its path.
- The next Gemini-capable PHP package refresh must include a version-matched packaged `run-sync.php` at the stable `ns-integration/run-sync.php` path used by the supported customer layout. It must load authoritative shared non-secret settings from sibling `ns-private/local-read.env` plus synchronization-only upstream/credential/transport settings from sibling `ns-private/sync.env`, then delegate to the packaged `bin/sync.php` behavior while preserving supported CLI arguments such as `--force`.
- Legacy duplicated shared keys in `sync.env`, if temporarily tolerated for upgrade compatibility, are validation aliases only: they must exactly match `local-read.env` or fail clearly and must not become a second configuration authority.
- Replacing `ns-integration` must leave the customer's existing cron target valid; the upgrade must not require editing or recreating the cron job merely because the launcher moved from customer-created glue into the supported package.
- The launcher must keep the bearer token out of `public_html`, public PHP/HTML, and the Cron Jobs command line; preserve the existing sync entrypoint semantics; and remain generic to the supported package/private-directory model rather than embedding customer-specific credentials or presentation behavior.
- Documentation, Decision 12 of the Phase 1 Gemini worksheet, and the customer integration worksheet should use the packaged launcher once implemented rather than instructing customers to create their own wrapper.

### G7PK — 2026-08-29 — PostgreSQL client emits concurrent-query deprecation warning during digest reads

- **Status:** Open
- **Target:** Later compatibility/maintenance; not a Phase 2 blocker unless investigation shows correctness or concurrency risk
- Phase 1 VPS qualification repeatedly observed the PostgreSQL client warning that `client.query()` was called while another query was already executing during canonical digest-input inspection, integrated lifecycle generation, and fresh-process readback.
- The observed commands completed successfully and the qualification showed correct persisted/read-back state; the warning is therefore a compatibility/implementation concern, not evidence of data corruption or a failed Phase 1 contract.
- Investigate connection/query ownership and serialization for current/future `pg` compatibility, remove the deprecated usage without weakening transaction/read consistency, and add focused regression coverage if a reproducible code path is identified.
- If investigation shows an actual concurrent-use correctness, transaction, or data-integrity defect, reclassify and schedule it according to that observed risk rather than silently treating it as non-blocking maintenance.

## Resolved Issues

### N6WD — 2026-08-25 — RSS descriptions may contain excessive full-article content

- **Status:** Resolved on 2026-08-28 at package `2.0.0`
- **Resolution:** Correction `c1-n6wd` bounds normalized persisted `Article.summary` to 4,000 Unicode code points after plain-text normalization. Values at or below the limit remain unchanged; oversized values preserve the longest complete-word prefix that fits with literal `...`, with a 3,997-code-point hard fallback when no usable boundary exists.
- The larger Raw RSS/Atom parser content limit remains separate and unchanged, so Source admission still operates on its existing bounded Raw content before Article normalization.
- Additive migration `0017_article_summary_bound.sql` transforms existing supported oversized summaries before tightening `articles_summary_shape_check`, without rewriting supported migrations `0001`–`0016` or replacing Article identity/provenance.
- **Evidence:** `docs/validation/c1-n6wd-validation.md` records focused boundary/Unicode proof, real PostgreSQL production-forward migration evidence, full database/recovery regressions, the three-pass closeout review, and owner acceptance.

### V7MT — 2026-08-28 — Local validation runs environment-incompatible suites

- **Status:** Resolved on 2026-08-28 at package `2.0.0`
- **Resolution:** Correction `c1-test-fix` made the ordinary `npm test` / `npm run check` path portable, moved the PHP-backed browser case into a separate `test:browser:php` suite, preserved `test:php` as fail-closed specialized evidence, and added focused command-topology regression coverage.
- Validation planning now uses the Test Necessity Matrix plus Test Environment Matrix with `RUN`, `DEFER`, and `N/A`. VPS-required evidence is not a default per-prompt/per-phase/per-correction closeout gate; it remains deferred to an explicitly designated full-system/project release qualification gate unless the owner assigns an earlier exceptional gate.
- Deterministic missing-prerequisite/wrong-environment failures are not automatically retried, and ordinary Windows prompts do not knowingly invoke VPS-only suites merely to rediscover unavailable prerequisites.
- **Evidence:** `docs/validation/c1-test-fix-validation.md` records the accepted correction, reused exact-tree local evidence, three-pass closeout review, and deferred VPS qualification scope.

### K8VX — 2026-08-18 — Public feed content is absent from initial crawlable HTML

- **Status:** Resolved in package `1.0.1`
- The customer has identified the site as an SEO-focused project, but the canonical public root `/` currently returns a JavaScript-dependent loading shell. Publication branding and Article feed content are populated only after client JavaScript performs the public-feed request.
- A simple HTTP request such as `curl /` therefore does not receive the meaningful customer-facing content that should be directly crawlable: configured Publication identity/presentation and the initial canonical page of feed-eligible Article dates, headlines, Sources, and original-publisher links.
- The intended correction is server-rendered initial public-feed HTML. The initial request should obtain data through the existing canonical public-feed/read-model boundaries rather than introducing a competing Article query or eligibility path.
- JavaScript may remain as progressive enhancement for search/filter navigation, load-more behavior, theme controls, and other interactive behavior, but the successful initial feed must not require JavaScript or a secondary HTTP request to expose its core content.
- Direct supported discovery/query URLs should render their corresponding initial result state server-side where applicable rather than reverting to an empty shell.
- The rendered headline anchors must continue pointing directly to the stored publisher `original_url`; duplicate suppression, visibility/moderation, Source trust, ordering, date presentation, search/filter semantics, and pagination boundaries must remain unchanged.
- This correction should also eliminate the successful initial-load flash/loading phase structurally. Existing resolved issue `R7KM` remains resolved and should **not** be reopened; its former loading-state behavior may remain relevant only to later client-side transitions where loading still occurs.
- **Resolution:** The server-rendered root implementation shipped at `1.0.1`. The former Phase 0 P2 closeout was later retired unexecuted after the product pivot; it does not reopen this issue or reserve `1.0.2`.
- **Evidence note:** This documentation update adds no new runtime/browser observation. Existing implementation and validation history remain authoritative only for their recorded trees/environments.

### R7KM — 2026-08-11 — Public feed flashes unset placeholder content before loading

- **Status:** Resolved on 2026-08-13
- **Resolution:** Exact-final-source Chromium validation deliberately held the initial `/api/feed` response pending and observed an intentional neutral loading state with no visible generic/unset Publication heading, configured branding, or fake headline content. The configured Publication presentation appeared only after the owned response resolved, and later pending navigation preserved already-known public branding.
- **Regression coverage:** `npm run test:browser` covers delayed initial loading, reduced motion, populated/null/broken/inert branding, owned unavailable-state clearing, and stale success/error/404 protection.

## Maintenance Notes

- Add newly reported problems under **Open Issues** only. Refuse product ideas, feature ideas, or general enhancements for this file.
- Move solved problems to **Resolved Issues** with the fix summary and resolution date.
- Every issue title must begin with a unique 4-character ID, followed by the date and title: `### ID — YYYY-MM-DD — Issue title`.
- Issue IDs use this restricted Base32 alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. The characters I, O, 0, and 1 are excluded to reduce confusion.
- Assign IDs pseudo-randomly rather than sequentially. Issue IDs are permanent and are never changed or reused, including after an issue is resolved.