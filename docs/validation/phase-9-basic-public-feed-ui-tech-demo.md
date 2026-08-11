# Phase 9 — Basic public-feed UI and tech demo validation

## Determination

**PHASE 9 NOT GREEN — LIVE-SOURCE EXIT GATE BLOCKED**

The exact Phase 9 executable candidate passes the complete deterministic static, unit, integration, collection, real-PostgreSQL, and real-Chromium matrix. Phase 9 cannot be accepted because the required second approved live Source, The Creative Penn podcast RSS endpoint, repeatedly exceeded the unchanged production 15-second total fetch deadline. The required two-Source Level 7 gate and integrated two-Source Worker-to-page milestone were therefore not observed. No retry, timeout relaxation, Source substitution, whitelist change, or safety-policy weakening was used.

## Candidate identity and environment

- Branch: `main`.
- Accepted deterministic executable candidate SHA: `dbbc396ca5cea21c15ba91b0f2dc2b249007dfe0`.
- Actual P1 parent / implementation-range base: `331849a59473861ce7e11c2ce71fbb510fd281ee`.
- Validated committed range: `331849a59473861ce7e11c2ce71fbb510fd281ee...dbbc396ca5cea21c15ba91b0f2dc2b249007dfe0`.
- Package version: `0.9.4`.
- Validation observation time: 2026-08-11 at approximately 12:02 CDT (UTC-05:00).
- Platform: Windows `10.0.22631`, x64.
- Node.js: `v24.11.1`; npm: `11.6.2`.
- PostgreSQL client: `18.3`; PostgreSQL server used by the disposable database tests: `18.3`.
- Playwright: `1.56.1`; launched Chromium: `141.0.7390.37`.
- The root `.env` supplied `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` to the established database/live commands; its value is not recorded. The real PostgreSQL suites ran rather than skipping.
- Public DNS/network contact reached both configured publisher endpoints. Chromium was installed and launchable.
- `npm install` completed successfully: 191 packages audited, 65 packages seeking funding, 0 vulnerabilities. This is not a byte-for-byte reproducibility claim.
- No `package-lock.json` or `npm-shrinkwrap.json` was generated, present, or tracked.

## Executed final-tree validation

All commands below ran after executable candidate commit `dbbc396ca5cea21c15ba91b0f2dc2b249007dfe0` was established. No executable file changed afterward.

| Evidence | Command or procedure | Observed result |
| --- | --- | --- |
| Level 1 | `npm run format:check` | Passed; all matched files use Prettier formatting. |
| Level 1 | `npm run lint` | Passed. |
| Level 1 | `npm run typecheck` | Passed. |
| Level 2 | `npm run test:unit` | 182/182 passed; 0 failed, 0 skipped. |
| Level 3 | `npm run test:integration` | 46/46 passed; 0 failed, 0 skipped. |
| Level 5 | `npm run test:collection` | 38/38 passed; 0 failed, 0 skipped. |
| Level 4 | `npm run test:db` | 72/72 passed against real disposable PostgreSQL; 0 failed, 0 skipped; cleanup completed through the established harness. |
| Levels 2/3/5 | `npm test` | 266/266 passed; 0 failed, 0 skipped. |
| Levels 1/2/3/5 | `npm run check` | Format, lint, typecheck, and 266/266 ordinary tests passed. |
| Level 6 | `npm run test:browser` | 8/8 passed in Chromium `141.0.7390.37`; 0 failed, 0 skipped. |
| Level 7 | `npm run test:live-sources` | Failed explicitly: 0/2 test cases passed. Author Media qualified, but The Creative Penn timed out in both independently attempted live suites; no prerequisite was skipped. |
| Level 1 | `git diff --check 331849a...dbbc396` | Passed with no whitespace errors. |

Every deterministic required suite selected substantive tests and used no acceptance retry. The live suite also selected both substantive test files and failed rather than silently skipping or reducing its required Source count.

## Level 4 — deterministic real PostgreSQL evidence

The 72-test database suite used disposable PostgreSQL and preserved migration-from-zero and rerun safety, configuration/bootstrap behavior, transactional Article identity, repeated observation provenance, Collection-run stage and processing accounting, visibility, public-feed eligibility/date/order/bounds/read-model semantics, production HTTP delivery from persisted rows, and verified database cleanup. Fixed-input tests therefore provide the deterministic idempotency and provenance proof inherited from Phases 7 and 8.

## Level 6 — deterministic browser evidence

Playwright launched Chromium `141.0.7390.37` against the actual Express application. The eight browser cases observed:

- direct canonical page navigation, refresh/static-resource loading under the production CSP, and loading while the canonical API remained unresolved;
- populated, empty, indistinguishable missing/private unavailable, and bounded dependency-error states;
- API-provided Publication identity, server ordering, Source names, headlines, and exact `originalUrl` link attributes;
- markup-looking Publication, headline, and Source strings remaining inert text;
- UTC calendar-date rendering under browser timezone `America/Los_Angeles` for a near-midnight UTC timestamp;
- desktop `1440x900` Date | Headline | Source presentation;
- mobile `390x844` stacked presentation without feed-caused horizontal overflow;
- intercepted external navigation, logical keyboard Tab focus, visible focus styling, and meaningful headline-link text.

The deterministic browser never contacted a publisher Article destination.

## Level 7 — approved live-Source observations

The specialized suite used production Worker endpoint invocation, disposable PostgreSQL, production bootstrap configuration, and the two required administrator-approved endpoints:

| Source | Approved endpoint | Observation |
| --- | --- | --- |
| Author Media | `https://www.authormedia.com/feed/` | Qualified twice. First run: HTTP 200, 100 Raw items, 100 normalized candidates, 0 normalization failures, 0 Article-link rejections, 100 Articles created, and successful processing. Second run: the same 100 identities produced 0 created and 100 unchanged, proving live identity convergence with persisted observations/runs. |
| The Creative Penn | `https://www.thecreativepenn.com/feed/podcast/` | Failed independently with persisted `fetch_failed` / `total_timeout` Collection runs. The endpoint returned HTTP 200, but the unchanged production 15-second deadline expired after roughly 1.07 MB wire / 3.55 MB decompressed data. Parser, normalization, Relevance, and Article persistence correctly remained `not_run`. |

Both Source attempts were isolated: Author Media succeeded despite The Creative Penn failure, and The Creative Penn failures were truthfully persisted. However, the contract requires both Sources to qualify. One successful Source cannot satisfy the Level 7 exit gate.

## Vertical-slice synthesis

The observed Author Media path reached:

`approved configuration -> production Worker -> Collection runs -> Raw items -> parser/normalizer -> Article-link policy -> default Relevance -> transactional Article identity/persistence -> Article observations/provenance`.

Deterministic Level 4 and Level 6 suites separately prove the canonical persisted PostgreSQL -> Phase 8 feed -> Phase 9 page -> stored original-publisher link path. The required combined two-live-Source path was not reached because The Creative Penn stopped truthfully at production transport timeout. Consequently this run does not claim that real Articles from both Sources appeared through the canonical feed or rendered together in Chromium.

## Content-security and scope inspection

Inspection of the production page and client confirms:

- shared UI contains no indie-author-specific business logic or topic conditional;
- the client fetches only `/api/publications/:publicationSlug/feed`; it contains no SQL, parallel eligibility query, or Source collection path;
- Web page delivery does not fetch Sources inline;
- collected Publication/headline/Source values are assigned with `textContent`, never executed as HTML;
- static delivery is limited to the explicit page CSS/JavaScript resources under the page CSP rather than a repository-wide static mount;
- headline `href` uses the validated API `originalUrl` exactly;
- calendar formatting explicitly uses UTC and does not use viewer-local calendar fields.

The committed Phase 9 range contains the page shell/client/styles, bounded route/static wiring, browser/integration/live tests, TypeScript/phase-runner support needed by P1, and prompt-owned version changes. It contains no npm lockfile, migration or timezone schema, frontend framework/build server, duplicate public-feed SQL path, Web/API Source fetch, scheduler/jobs/endpoint health, configurable Relevance/Categories, search/filter/pagination, theme system, admin/auth, duplicate grouping/moderation, or HTML adapter.

## Exit-gate conclusion and limitations

Deterministic exit conditions 1–11 and inherited deterministic condition 18 are green at their required evidence levels. Source failure isolation and truthful failed-run accounting are also observed. Conditions 12–17 are not fully satisfied because only one of the two required approved Sources qualified and the combined real two-Source feed/page path could not execute.

Phase 9 therefore remains blocked and must not be labeled accepted. The live observation is time-bound publisher behavior, not a universal reproducibility claim. No Level 8 reference-deployment or Cloudflare validation was required or performed; that remains later roadmap work.

Once the approved live-Source gate is resolved and the complete final-tree matrix is rerun successfully, the next roadmap phase is Phase 10 — Automated polling, durable jobs, and endpoint health. The later conversational `/closeout` command, not this P4 run, owns any transition to the Phase 10 `0.10.0` baseline.
