# Phase 18 configurable HTML collection validation

## Result

**GREEN.** Phase 18 — Configurable HTML collection satisfies its documented exit gate on the accepted candidate tree below. The next intended roadmap phase is Phase 19 — Reliability, observability, and production operations. Conversational `/closeout` is still required to perform the separate `0.19.0` baseline transition.

## Accepted tree and environment

- Validation completed: 2026-08-15 10:18 CDT (`America/Chicago`).
- Branch and committed source head: `main` at `168ce474749290c6d0729369b7336bba6786498c` (`0.18.5`).
- Accepted implementation candidate tree: `7fb52f57dc16d382beccc755f5a8b843367783cb`, consisting of the committed head plus the P6 package-version change. The durable validation artifact records that accepted source tree and is not part of its self-referential identifier.
- Phase 18 implementation inspection base/range: documentation-aligned base `d4cf61a4687bf213c77d33f0477660896f44480f` through `168ce474749290c6d0729369b7336bba6786498c`, plus the P6 candidate-tree changes. Runner-owned implementation commits are `7b6ab52` (P1), `51ad81d` (P2), `1f3d841` (P3), `6e3cb6f` (P4), and `168ce47` (P5); prompt-writing commits were not treated as implementation evidence.
- Package version: `0.18.6`.
- Windows/PowerShell local environment; Node `v24.11.1`; npm `11.6.2`; PostgreSQL client/server test prerequisite `18.3` as reported by `psql`; Playwright `1.56.1`; Chromium revision `1194`, browser version `141.0.7390.37`.
- Static parser dependencies actually installed: Cheerio `1.2.0` and css-what `7.0.0`. No Playwright/Puppeteer/browser runtime is imported by Worker collection code.
- No `package-lock.json` or `npm-shrinkwrap.json` was created.

## Commands and observed results

1. `npm run codex:phase:validate -- p18` before writes: PASS; P1–P5 implementation prompts complete, P6 recognized as the sole final manual closeout, versions `0.18.1` through `0.18.6` contiguous.
2. `npm install --ignore-scripts`: PASS; 216 packages audited, zero vulnerabilities, no lockfile created under repository policy.
3. `npm run check`: PASS; formatting, ESLint, TypeScript, and aggregate unit/integration/collection suite passed. Test result: 437 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo. This included the specialized deterministic HTML parser, fixture, HTTP transport, destination-safety, canonical-pipeline, preview/API, RSS/Atom, scheduler/job, identity, Relevance, duplicate, feed, and admin integration coverage; subordinate suites were not redundantly rerun.
4. `npm run test:db`: PASS against real disposable PostgreSQL. Test result: 215 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo.
5. `npm run test:browser`: PASS in real Playwright Chromium. Test result: 60 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo.
6. `npm run codex:phase:validate -- p18` on the P6 candidate: PASS; grammar and manual-closeout identity remain valid at `0.18.6`.
7. `git diff --check d4cf61a`: PASS for the accepted Phase 18 change range.
8. Static dependency/search inspection of preview, parser, Worker collection, browser rendering, migrations, repositories, tests, fixtures, and the complete Phase 18 diff: PASS. The preview dependency chain is parser-only; browser preview output uses safe DOM construction/text content; the only browser `fetch` is the shared protected API helper.

No hidden retries, skipped prerequisites, or zero-test required suites were used.

## Pass 1 — contract and evidence

### Profile/parser and static fixture evidence (Levels 2 and 5)

`src/collection/parsers/html-listing-profile.ts` is the single topic-independent validator/normalizer. It accepts the required item/title/link selectors and only the governed optional date, author, summary, and category fields. It enforces serialized-profile, selector byte/token/combinator, input-document, matched-item, required/optional field, category, and diagnostic bounds. The css-what validation allowlist fails closed on selector lists, unsupported combinators/pseudos/namespaces/actions, malformed placement, and excessive complexity.

Cheerio/parse5 parsing is inert: it executes no JavaScript and loads no resources. Executed deterministic fixtures proved ordered bounded Raw items, relative-link preservation, no synthetic `externalId`, mixed valid/invalid row continuation with bounded diagnostics, stable zero-match/all-invalid failures, strict UTF-8 and size handling, inert hostile markup, and no raw-body/sentinel leakage. RSS/Atom parser and transport regressions passed unchanged.

### Endpoint/profile/run persistence (Level 4)

Migration-from-zero and real database evidence proved `rss_atom`/`html_listing` type/profile compatibility, required normalized HTML profile plus positive revision, revision 1 on first HTML profile, no increment for a semantically unchanged profile, one atomic increment for material replacement, RSS↔HTML clearing/reinitialization semantics, coherent aggregate reads, and rollback of invalid multi-resource changes. Unrelated runtime/domain/default-Category behavior remained independent. Bootstrap remained create-if-absent/no-overwrite.

Collection runs persisted bounded parser kind/version/profile revision/item-failure diagnostics without response bodies. Run lifecycle/arithmetic, interruption/retry, retained Source/endpoint/run/Article/observation provenance, and transaction constraints passed in the real database suite.

### Canonical collection/network/downstream evidence (Levels 3, 4, and 5)

Endpoint type explicitly selects the small HTTP content policy and parser. RSS/Atom media/Accept behavior remained intact; HTML accepts only the governed static HTML media types. Both types use the same validated destination/address binding, redirect, conditional request/304, compression, timeout, header, retry, and response-size boundaries.

Executed redirected HTML fixtures proved that the terminal URL is the normalization base, that Source RSS/Atom admission phrases are bypassed only for HTML (`source_item_filtered_count = 0`), and that HTML Raw items rejoin the canonical normalization → Article-link policy → Relevance/Category → Source-scoped identity/persistence/observation → duplicate pipeline. Repeated HTML collection converged through canonical URL fallback. Manual/check-now and durable jobs used the same endpoint execution unit, runtime state remained coherent, and failures remained endpoint-isolated.

Fixture request logs and production parser design proved no Article-page, pagination, image, stylesheet, script, frame/embed, discovered feed/Source, subresource, or browser request occurred.

### Admin API/preview and browser evidence (Levels 3, 4, and 6)

Endpoint administration transactionally creates, reads, and replaces HTML profile state; the repository owns profile revision. Recent-run DTOs expose only bounded diagnostics. The protected POST preview accepts exactly a bounded pasted sample plus draft profile, invokes the canonical pure validator/parser, and has no DNS, fetcher, job, lock, run, runtime-state, database, Article, Relevance, or duplicate dependency. It neither persists nor revisions draft state. Central mutation integrity runs before the route; malformed, unknown, oversized, parser-failing, and sentinel-bearing input maps to bounded errors without raw sample, parser exception, stack, SQL, or secret leakage. Check-now remains the sole network-backed verification route.

Real Chromium observed RSS/Atom and HTML type controls, structured profile load/save, server-owned revisions, stale-state removal on type switch, RSS-only admission help, protected sample-only preview, safe mixed/error rendering, stale response suppression and recovery, truthful historical run diagnostics, durable queued check-now language, keyboard/focus/live-region behavior, mobile containment, and the full existing Publication/Source/Editorial/Article/duplicate/public-feed workflows.

### Architecture inspection (Level 1)

The engine remains topic independent and singleton Publication configuration remains non-tenant configuration. HTML profiles are endpoint-owned. One parser interface and downstream persistence pipeline serves RSS/Atom and HTML; Source admission remains explicitly RSS/Atom-only. Web/API performs no inline Source collection, preview is pure and outside Worker collection, and no crawler, Article-page fetch, pagination, browser endpoint, browser fallback, XPath/general expression engine, executable scraping script, synthetic HTML identity, or HTML-specific Relevance/identity/duplicate/feed repository was introduced. No Phase 19+ capability was pulled forward.

## Pass 2 — adversarial error and edge-case review

Fresh source review challenged the prompt's boundary set. Dispositions:

- Classification 1, protected by implementation and executed evidence: empty/whitespace/malformed/non-UTF input; multibyte byte limits; huge/deep documents; selector length/token/combinator limits and unsupported pseudo/list/general-expression features; inert script/event/src/srcset/style/frame/embed/link markup; missing/blank/overlong href/title and downstream rejection of javascript/data/mailto/fragment/unsafe destinations; mixed/all-invalid/zero-match rows; missing/repeated/overbound optional values/categories; RSS phrases with HTML endpoints; redirected relative URLs; cross-type media rejection; 304; historical profile revision truth; no-op saves/type switches; interrupted/retried jobs; canonical same-Source idempotency and cross-Source duplicate processing; exact/over preview bounds and sentinel redaction; stale preview/type/source changes; duplicate-submit recovery; bounded diagnostics; no package lock or Worker browser dependency.
- Classification 1 by transaction/query inspection plus real-database evidence: profile replacement/revision ownership, atomic row updates, rollback, coherent run/profile snapshots, and preservation of older run revisions while newer endpoint configuration exists.
- Classification 1 by dependency and browser-client inspection: preview cannot reach DNS/network/database through its import graph; response rendering does not use `innerHTML`; browser calculates neither parser validity nor persisted profile revision.
- N+1/unbounded read hypothesis: endpoint/recent-run reads are bounded and use existing aggregate/list queries appropriate to MVP; no new per-row profile query was introduced.
- Race combinations among save/check-now/preview remain separated by existing request sequencing and durable job idempotency; the executed database and browser suites covered the governing state rather than inventing a second client authority.

No classification 2 coverage weakness requiring a new closeout regression, classification 3 bounded defect, classification 4 refactor, or classification 5 ambiguity/hard defect remained.

## Pass 3 — structural/code-quality review

The complete Phase 18 diff and important producers/consumers were inspected independently. Canonical profile normalization is reused across persistence/admin/preview; parser dispatch is single and explicit; content policy is a small endpoint-type value; RSS admission has one endpoint-type boundary; typed mappings prevent raw profile JSON from becoming UI/domain authority; revision calculation exists only in persistence; run diagnostics use canonical bounded fields; preview imports only parser modules; the browser builds payloads/renders text but does not parse HTML or calculate revisions; and no generic plugin/expression/browser abstraction or compatibility-only legacy path was added.

The static libraries are proportionate to inert HTML/CSS parsing. No unsafe preview DOM injection, material N+1 profile/run pattern, hidden downstream path, or misleading browser-fallback/admission/identity documentation was found. No Terra High remediation handoff occurred and no structural finding remains unresolved.

## Evidence levels and limitations

- Achieved: Level 1 static/architecture inspection; Level 2 deterministic unit/parser evidence; Level 3 component/integration/API evidence; Level 4 real disposable PostgreSQL evidence; Level 5 deterministic static HTML/HTTP fixture evidence; Level 6 real Chromium browser evidence.
- Ordinary Phase 18 deterministic validation does **not** claim approved live-publisher Level 7 behavior. Level 7 was not required or run.
- It also does **not** claim reference-deployment/Cloudflare Access/direct-origin Level 8 behavior. Level 8 was not required or run and remains a Phase 19 responsibility.

## Exit-gate conclusion

Phase 18 is **GREEN** on implementation candidate tree `7fb52f57dc16d382beccc755f5a8b843367783cb`: required Levels 1–6 passed with no unresolved adversarial or structural findings, RSS/Atom/shared downstream regressions are green, preview and HTML network behavior remain bounded, and package version is `0.18.6`.
