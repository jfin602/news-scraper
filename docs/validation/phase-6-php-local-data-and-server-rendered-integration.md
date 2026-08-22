# Phase 6 — PHP local data and server-rendered integration validation

## Result and identity

- Status: **Phase 6 GREEN — HUMAN REVIEW REQUIRED**.
- Exact pre-P1 Phase 6 base: `04a87e13c81e788745b816f1ae233fd6e2889334` (`Write Phase 6 closeout prompt`).
- P1: `8d38da85d556352c331a24e587211877a3b38ef8` (`1.6.1`).
- P2: `de4cd2158be02466401d7d43455483f224c4416e` (`1.6.2`).
- P3: `98f8d3cbc2185aa8773a8bec07b084d4f6e3a82b` (`1.6.3`, current committed `HEAD`).
- Final closeout candidate: that `HEAD` plus the uncommitted `package.json`, `integrations/php/tests/run.php`, `test/browser/php-customer-example.test.ts`, and this artifact. The phase runner owns the eventual P4 closeout commit and therefore its final commit SHA does not exist at artifact-writing time.
- Package versions: baseline `1.6.0`; P1 `1.6.1`; P2 `1.6.2`; P3 `1.6.3`; closeout candidate `1.6.4`. The candidate was not advanced to `1.7.0`.
- The Phase 6 range added no migration, schema, dependency, lockfile, Composer vendor state, Node production behavior, or database representation.

## Environment and final validation

- Microsoft Windows 11 Home, version `10.0.22631`, build `22631`, 64-bit.
- Node `v24.11.1`; npm `11.6.2`.
- PHP `8.5.9` CLI, NTS, Visual C++ 2022 x64. The required runtime was not initially resolvable from `PATH`; the final evidence used an official portable PHP for Windows runtime from a temporary directory and did not add repository or system dependency state. Observed modules: bcmath, calendar, Core, ctype, date, dom, filter, hash, iconv, json, lexbor, libxml, mysqlnd, pcre, PDO, Phar, random, readline, Reflection, session, SimpleXML, SPL, standard, tokenizer, uri, xml, xmlreader, xmlwriter, Zend OPcache, and zlib.
- Playwright `1.56.1`; bundled Chromium `141.0.7390.37`, headless.
- `npm run check` — PASS on the final executable tree: formatting, lint, typecheck, 514 Node tests in 34 suites, PHP syntax checks, and 29 substantive PHP tests.
- `npm run test:browser` — PASS: 52 tests in 8 suites, including the real PHP customer server matrix and JavaScript-disabled proof.
- `npm run codex:phase:validate -- p1-6` — PASS: contiguous P1–P4 grammar, versions `1.6.1`–`1.6.4`, supported configurations, and one final manual P4 closeout.
- `git diff --check 04a87e13c81e788745b816f1ae233fd6e2889334...HEAD` — PASS for the committed Phase 6 P1–P3 range.
- `git diff --check` — PASS for the final uncommitted closeout candidate.

The achieved evidence is Levels 0–3 and 6: contract/source inspection, static checks, deterministic unit/component integration, real local filesystem and PHP process behavior, and a real browser against a real loopback PHP server. No database, recovery, approved-live-Source, public-network, managed external, or reference-deployment suite was required because Phase 6 changed none of those surfaces.

## Pass 1 — contract and evidence review

### P1 local API handoff

`LocalProfileReader::read()` is the sole customer data/state reader. It constructs the governed resolver and calls `FilesystemProfileStateStore::readForPhase6()` once. Customer configuration contains only Profile key, absolute state root, cadence, and optional maximum stale age; it has no upstream URL or bearer field.

`LocalReadResult` and its immutable Profile, Publication, Article, Source, Category, and health DTOs preserve Profile/Publication values, Article and Category order, nullable metadata, exact `originalUrl`, explicit usability state, stale age, and bounded health. They do not expose filesystem paths, manifest/generation/lock names, cursors, raw responses, Authorization state, or credentials. Health cannot make a non-renderable state renderable.

Only `usable` and `stale_usable` map the validated active snapshot. `never_synced`, `stale_cutoff`, `disabled`, and `unavailable` return null Profile/Publication and an empty Article list even when the Phase 5 store retains recoverable active bytes. Valid zero-item active state remains renderable and distinct from unavailable.

### P2 renderer and presentation proof

`LocalProfileRenderer` receives only `LocalReadResult`; the optional `FallbackHtmlRenderer` owns the one fallback state/link/escaping implementation. A customer implementation and direct DTO consumption are both proven without store, client, synchronization, or cache knowledge.

Every rendered editorial value is passed through `htmlspecialchars` with `ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5` and UTF-8. The deterministic suite covers quotes, ampersands, invalid UTF-8, script-like headline/summary text, malicious author text, and Source/Profile/Publication/Category markup. Nullable optional values are omitted rather than emitted as placeholder or malformed markup.

Headline anchors use only the stored logical `originalUrl`, escaped for the HTML attribute. Tests decode the attribute back to the exact original value and preserve Article order. The renderer adds no canonicalization, News Scraper redirect, tracking parameter, JavaScript handler, beacon, `target`, `rel`, `nofollow`, sponsored/UGC policy, reciprocal-link behavior, analytics, or SEO claim.

### P3 server/browser composition

The provider-neutral `integrations/php/example/index.php` constructs only `LocalReadConfiguration`, `LocalProfileReader`, and `FallbackHtmlRenderer`. It contains no upstream client, synchronizer, sync CLI, bearer/base configuration, cache JSON parsing, filter/editorial logic, CMS, or provider branch. Its response is server-rendered UTF-8 HTML with a bounded exception fallback.

The browser suite creates deterministic temporary state through the real public Phase 5 `ProfileSynchronizer` and `FilesystemProfileStateStore` producer path, then starts a real `php -S` loopback server with upstream base URL and bearer token removed. Readiness is bounded to five seconds; temporary state and child processes are cleaned in `finally`; missing PHP/browser prerequisites fail rather than skip; no public internet is used.

### Required state matrix

| State/case | Deterministic PHP proof | Real PHP server/browser observation |
| --- | --- | --- |
| populated usable | complete DTO mapping, exact order/null/link preservation, escaping | two ordered Articles, Profile/Publication context, exact direct hrefs, inert malicious text |
| empty usable | active zero-item result remains renderable | explicit empty message, no anchors, not unavailable |
| stale usable/no cutoff | stale state retains active data and positive age | 901-second-old LKG renders with stale message and Articles using 900-second cadence and no hard cutoff |
| never synced | no Profile/Publication/Articles | initializing fallback and no anchors |
| configured stale cutoff | retained active state suppressed above strict cutoff | too-old fallback and no retained anchors |
| authoritative disabled | retained active state suppressed | disabled fallback and no retained anchors |
| unavailable/corrupt | corrupt committed state maps to empty unavailable result | bounded temporary-unavailable response with no path/error/partial Article leakage |
| nullable metadata | nulls and empty Categories preserved; renderer omits optionals | populated content remains valid; component proof owns detailed null assertions |
| malicious Source-derived text | text/attribute escaping and invalid UTF-8 substitution | strings appear as text, no script element or execution |
| exact publisher links | escaped href decodes exactly to stored `originalUrl` | browser DOM returns both exact stored URLs in order |
| local freshness/health | bounded redacted health and stale age | fresh/stale messages only; no secret/cache internals |

## No visitor-path News Scraper call

The evidence proves the bounded local claim, not a real external outage:

1. `integrations/php/tests/example-state.php` produces local state through the real Phase 5 synchronizer/store boundary before the visitor server starts.
2. The visitor PHP process is started after removing `NEWS_SCRAPER_BASE_URL` and `NEWS_SCRAPER_BEARER_TOKEN`; populated and stale valid LKG still render.
3. No synchronization process is launched in response to any visitor request; setup synchronization completes in a separate process before server startup.
4. Source inspection and a deterministic boundary assertion show the production visitor route constructs only local configuration/reader/presentation and contains no upstream client or sync composition.
5. Browser request observation records no browser-direct non-example request, News Scraper request, tracking endpoint, script, or beacon.
6. JavaScript-disabled Chromium observes the synchronized Article content and exact direct headline anchor.

This does not claim that a real managed News Scraper service or customer host was taken offline. It proves credential/configuration removal and the absence of visitor-path sync/API fallback in the observed local process/browser environment.

## Pass 2 — adversarial review and bounded repairs

Protected failures include retained disabled/cutoff/corrupt payload leakage; empty-state misclassification; future-age clamping and strict stale/cutoff boundaries inherited from the Phase 5 resolver; corrupt manifest partial exposure; text-versus-attribute escaping; quotes, ampersands, invalid UTF-8, and script-like values; malformed nullable output; URL rewriting/tracking; customer override coupling; visitor credential dependence; hidden server-side sync/API fallback; browser-direct requests; stale LKG blanking; local path/secret leakage; second persistence truth; order/Category/null drift; and hidden JavaScript dependence.

Closeout made four bounded evidence-only repairs:

1. changed the dedicated no-JavaScript browser test to actually disable JavaScript;
2. corrected one renderer fixture to pass the public activation boundary's ISO `generatedAt` string rather than a `DateTimeImmutable`;
3. narrowed the nullable-placeholder assertion so the legitimate word `nullable` does not falsely match the substring `null`;
4. configured the browser stale scenario with the 900-second cadence, no hard cutoff, and a 901-second-old successful snapshot so it genuinely exercises `stale_usable`.

No production behavior changed. The first `npm run check` attempt failed honestly because PHP was unavailable on `PATH`; after supplying the temporary official runtime, the next run exposed the two PHP fixture assertions. The first browser run exposed the stale-scenario mismatch. Each finding was repaired and the invalidated focused/full evidence was rerun to green.

No unresolved adversarial finding requires escalation, replanning, or a correction stack.

## Pass 3 — structural review

Responsibilities remain narrow: Phase 5 owns upstream transport, synchronization, locking, validation, atomic activation, and local usability; P1 alone maps its validated combined read to customer DTOs; P2 alone owns fallback rendering; P3 owns only example composition and process/browser proof. There is no duplicated local-state interpretation, cache-file parsing, adapter-side eligibility/order/filter logic, second escaping/link owner, framework/Composer/vendor addition, CMS/provider abstraction, visitor synchronization fallback, schema change, or production test helper.

The shared PHP bootstrap loads library class definitions but performs no runtime construction or environment parsing. The visitor route itself constructs only the local read/presentation boundary, and executed credential-free server evidence proves bootstrap loading does not require upstream configuration. Splitting Phase 5 DTO declarations or bootstrap topology would move ownership across modules without a demonstrated behavioral defect, so no such refactor is warranted.

No meaningful behavior-preserving structural refactor was found. No Terra High refactor handoff occurred.

## Preserved behavior and limitations

The Phase 6 range does not modify Phase 5 retry/restart, lock, atomic activation, disable/re-enable, cadence, stale, or store-validation behavior; Phase 4 API/auth/security; canonical/Profile/credential authorities; collection/Source trust; normalization, persistence, provenance, Relevance/Categories, moderation, duplicates, ordering, or `originalUrl`; `/`, `/api/feed`, admin, Worker, health, migrations, database state, topic independence, or singleton Publication architecture.

This artifact makes no managed external-site, HostGator/cPanel, Cloudflare, public-network, approved-live-Source, deployment, database, recovery, distributed-lock, cross-host, or production-readiness claim. Those applicable integrated release proofs remain Phase 7. No unresolved correctness, security, state, process, or structural finding blocks human review of this Phase 6 candidate.

After human acceptance, conversational `/closeout` may transition only top-level `package.json` from `1.6.4` to the Phase 7 `1.7.0` baseline, subject to its required accepted-SHA drift check.
