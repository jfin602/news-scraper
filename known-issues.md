# Known Issues

This file is the running issue log for problems reported in this chat.

## Open Issues

### Q7HF — 2026-08-28 — PHP integration duplicates customer-owned presentation through bundled renderer

- **Status:** Open
- The current customer integration uses the bundled PHP renderer path but then overrides that presentation in the customer's top PHP tag, leaving two presentation layers for the same feed output.
- This is unnecessarily indirect and cuts against the integration contract boundary that the customer owns feed presentation, CSS/classes, surrounding markup, and site composition while News Scraper supplies governed normalized Profile data.
- The intended correction is to remove the bundled/local renderer as a supported presentation layer and keep the PHP package focused on synchronization, last-known-good state, and normalized local-read access.
- The default/example customer PHP tag should instead demonstrate a minimal server-rendered table directly from normalized local-read data. That example is instructional rather than authoritative presentation, so the customer can clearly see and modify the exact markup used on their site without overriding an internal renderer.
- The replacement must preserve the existing normalized Profile results, canonical Article ordering/eligibility, exact stored publisher `originalUrl` destinations, local-only rendering, safe empty/unavailable handling, and all sync/LKG behavior. Customer markup must not become a new filtering, reranking, or editorial-interpretation layer.
- Do not fold this correction into the current Gemini Phase 1 / `2.1.x` work. Address it when the PHP integration package is next revised, preferably alongside the later Gemini-capable package refresh so the customer receives one coherent updated package.

### T4QP — 2026-08-26 — PHP integration package requires a hand-created sync launcher

- **Status:** Open
- The generated PHP integration package includes `bin/sync.php` plus `config/sync.env.example`, but `bin/sync.php` reads configuration from the process environment and does not load the supplied `sync.env` file itself.
- On shared hosting such as HostGator, this forces the customer to hand-create a private wrapper such as `run-sync.php` merely to load the private sync configuration before invoking the packaged synchronization entrypoint.
- The supported integration package should include a version-matched launcher/wrapper that safely loads the private `sync.env` configuration and invokes `bin/sync.php`, so the normal installation path does not require customers to write integration glue code.
- The launcher must keep the bearer token out of `public_html`, public PHP/HTML, and the Cron Jobs command line; preserve the existing sync entrypoint semantics including CLI options such as `--force`; and remain generic rather than HostGator-specific.
- Documentation and the customer integration worksheet should use the packaged launcher once implemented rather than instructing customers to create their own wrapper.

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
