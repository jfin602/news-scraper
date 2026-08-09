# Phase 5 — RSS/Atom Transport, Parsing, and Collection Runs Validation

## Current determination

**PARTIAL — VPS LEVEL 7 EVIDENCE PENDING.**

Stage 1 local validation is green for Levels 0–5 after correction of response-bound defects exposed by two VPS Level 7 attempts. Phase 5 is not complete, the roadmap exit gate is not yet satisfied, and conversational `/closeout` is not authorized. Fresh Level 7 evidence for both approved live Sources must be executed in the repository-owner-designated VPS environment against the corrected candidate implementation tree below.

This artifact records observed evidence; it does not redefine contracts.

## Candidate implementation tree

- Candidate implementation source SHA: `4787b91fcd0f2e1b3ca6042d9790f76cf1726c70`
- Branch: `main`
- Package version: `0.5.6`
- Validation time: 2026-08-09 14:59:18 -05:00 (America/Chicago)
- Working-tree relationship: the executable candidate was committed before this documentation artifact. A later docs-only artifact commit does not redefine the candidate executable tree.
- Phase 5 committed-change whitespace check: `git diff --check bb63f50..4787b91fcd0f2e1b3ca6042d9790f76cf1726c70` passed.

## Stage 1 environment and dependency record

- Operating system: Microsoft Windows 10.0.22631
- Node.js: `v24.11.1`
- npm: `11.6.2`
- PostgreSQL client: `18.3`
- PostgreSQL server used for Level 4 evidence: `18.3`
- Resolved XML parser: `fast-xml-parser@5.10.1`
- npm policy: `.npmrc` contains `package-lock=false`; `npm install` was used; no `package-lock.json` exists. With no lockfile, installation is not claimed to be byte-for-byte reproducible.
- Database prerequisite: a safe disposable-test-capable `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` was available. No credential value is recorded here.

## Commands and results

All commands below ran against the final executable content represented by the candidate SHA. The commit operation itself did not alter that content.

| Command | Result | Evidence |
| --- | --- | --- |
| `npm install` | Passed; dependencies already current, 189 packages audited, no lockfile created | dependency preflight |
| `npm run format:check` | Passed | Level 1 |
| `npm run lint` | Passed | Level 1 |
| `npm run typecheck` | Passed | Level 1 |
| `npm run test:unit` | 98 passed; 0 failed/skipped/todo | Level 2 |
| `npm run test:integration` | 31 passed; 0 failed/skipped/todo | Level 3/process |
| `npm run test:collection` | 37 passed; 0 failed/skipped/todo | Level 5 |
| `npm test` | 166 passed; 0 failed/skipped/todo | Levels 2, 3, and 5 aggregate |
| `npm run check` | Passed; aggregate test portion 166 passed with 0 failed/skipped/todo | Levels 1–5 deterministic aggregate |
| `npm run test:db` | 37 passed; 0 failed/skipped/todo against real PostgreSQL 18.3 | Level 4 |
| `git diff --check bb63f50..4787b91fcd0f2e1b3ca6042d9790f76cf1726c70` | Passed | committed Phase 5 range whitespace check |

The required filtered suites selected nonzero tests. Ordinary deterministic commands did not require live publisher access.

## Evidence summary

### Levels 0–1: structure, scope, and static safety

Inspection found one coherent Phase 5 execution path: the Worker command loads one configured endpoint aggregate and invokes the canonical collection service, which owns eligibility, endpoint lock, run start/finalization, redirect-aware fetch, and RSS/Atom parsing. Web/API code does not collect Sources inline. Parsers return untrusted Raw items and do not persist Articles.

Every initial request and redirect returns through the Phase 4 static policy and DNS/address safety boundary. The transport consumes the validated concrete address while retaining request hostname and TLS verification semantics. No TLS bypass, production SSRF bypass, independent unchecked transport DNS path, credential/body logging, or topic-specific aggregation conditional was found.

Run creation occurs after eligibility and lock acquisition and before safety/fetch. Ineligible and contended attempts create no run. Attempted safety, transport, parser, 304, and finalization paths retain truthful bounded accounting. No persistent endpoint validator/cache state was introduced.

No Phase 6+ Article normalization/candidate/link-policy behavior, Relevance, Article/observation persistence, duplicate behavior, scheduler/jobs/retry state, endpoint health/cache state, public feed, admin collection route, HTML adapter, browser automation, or topic-specific engine rule was found.

### Levels 2–3: focused, integration, and process evidence

Focused and broader tests cover runtime/database configuration, Web liveness/readiness, Worker readiness/lifecycle/clean shutdown, command argument and missing-endpoint behavior, bounded structured output, startup failure, resource shutdown, eligibility ordering, run/fetch/parser/finalization ordering, truthful terminal outcomes, and isolated later-endpoint execution after failure.

The controlled manual command evidence uses `npm run collect:endpoint -- <publication-slug> <source-config-key> <endpoint-config-key>`. Invalid arguments exit before database creation, missing configuration and startup failures are bounded, successful output excludes Raw-item bodies, and the database closes on success and failure.

### Level 4: real PostgreSQL

The full database suite used unique disposable databases and verified cleanup. It passed production migrations from zero and repeat/current behavior; collection-run schema constraints and repository lifecycle; double-finalization protection; transaction behavior; canonical execution with real locks and truthful persisted runs; lock contention, unrelated execution, release/reacquisition, and failure release; Phase 3 configuration constraints and bootstrap idempotency/no-overwrite; and Web/Worker database readiness regressions.

### Level 5: deterministic collection fixtures

The collection and integration suites passed representative RSS and Atom parsing, zero-item and missing-field cases, namespaces, malformed/unsupported/hostile XML, parser bounds, repeat determinism, validated-address binding, hostname/TLS semantics, request/conditional headers, validators, 2xx/304/status classification, timeouts, wire/decompressed bounds, supported compression, malformed/unsupported encoding, reset cleanup, allowed and rejected redirects, per-hop fresh DNS safety, redirect limits/loops/deadline, 304 after redirect, and canonical orchestration/failure-isolation cases. Explicit assertions prove the 32 MiB wire, decompressed, and parser-input defaults. Small injected limits prove wire and decompressed enforcement independently below, exactly at, and above configured boundaries; a compact synthetic gzip and RSS regression proves content materially above the former 2 MiB ceiling is accepted. Parser input remains explicitly bounded with an above-limit rejection, while item, field, category, and nesting bounds remain covered. Compressed-bomb rejection remains proven.

## VPS Level 7 attempts and response-bound corrections

Candidate `a1ac53d5439be9af0f10cf36238f60b38842e445` failed the repository-owner VPS Level 7 validation. Author Media passed twice through the real Worker collection path. The Creative Penn endpoint `https://www.thecreativepenn.com/feed/podcast/` was contacted successfully and returned HTTP 200, but the attempt failed before parsing with `decompressed_size_limit`: 417693 wire bytes expanded to 1057505 decompressed bytes, exceeding the former 1048576-byte default. The Worker and persisted Collection-run provenance both reported `failed` / `fetch_failed`, transport `failed`, parser `not_run`, zero Raw items, and zero redirects. Disposable diagnostic PostgreSQL cleanup succeeded.

Candidate `27956be85e05d33e0df85b398157c32de69603fa` also failed the repository-owner VPS Level 7 validation at the corrected 2 MiB decompressed ceiling. The Creative Penn endpoint returned HTTP 200, but transport aborted immediately after crossing the ceiling: 728403 wire bytes and 2113536 decompressed bytes were observed. The Worker result and persisted Collection-run provenance both reported run `failed`, outcome `fetch_failed`, transport `failed`, parser `not_run`, error code `decompressed_size_limit`, zero Raw items, and zero redirects. The byte count is the bounded abort measurement, not the complete feed body. Disposable PostgreSQL cleanup succeeded.

A separate bounded VPS diagnostic measured only the complete approved feed for sizing; it is diagnostic evidence and not a substitute for Level 7 production-path evidence. It observed HTTP 200, `application/rss+xml; charset=UTF-8`, gzip encoding, zero redirects, 4722843 compressed/wire bytes, 15807171 decompressed bytes, 300 RSS items, zero Atom entries, ETag and Last-Modified present, and successful completion below its 16 MiB diagnostic hard ceiling. It did not print or commit publisher content.

The final generic policy sets the HTTP wire ceiling, HTTP decompressed ceiling, and RSS/Atom parser input ceiling to 33554432 bytes (32 MiB). The approved live feed is currently about 15.07 MiB decompressed, so 16 MiB has insufficient growth headroom. At approximately linear current density, the unchanged 500-item structural ceiling projects to roughly 26 MiB; 32 MiB provides bounded headroom consistent with that ceiling. Matching wire and decompressed ceilings avoids coupling compatibility to publisher compression behavior. Item-count, per-item field/content/category, XML nesting, timeout, redirect, approval, DNS/address, TLS, SSRF, Collection-run, Source configuration, cache/validator, scheduler, and other safety/semantic limits remain unchanged. No endpoint-specific behavior or Source-specific engine condition was added.

The live-source test harness now preserves up to 8192 bytes of the failed child Worker's bounded stdout in its validation error. It deliberately omits stderr and the original child-process error object so credentials, database URLs, and unbounded output are not surfaced. The production Worker output contract is unchanged.

The complete Stage 1 matrix recorded above was rerun against the corrected final executable content before candidate commit. Previous candidate evidence was not substituted for the corrected tree.

## Live-source command added

`npm run test:live-sources` is a substantive environment-requiring command and is intentionally outside `npm test` and `npm run check`. It loads optional `.env`, creates a uniquely named disposable PostgreSQL database, runs production migrations and the committed approved bootstrap, invokes the real manual Worker command twice for each approved endpoint, verifies persisted terminal Collection-run rows, emits bounded metadata only, and verifies database cleanup. Missing database/network prerequisites or either Source failure fail the suite rather than skip green.

This command was not executed on local Windows because the repository owner designated the VPS as the Phase 5 Level 7 closeout environment. No Level 7 or Level 8 claim is made here.

## VPS handoff

Before execution, inspect this artifact and deploy executable tree `4787b91fcd0f2e1b3ca6042d9790f76cf1726c70`. A VPS `HEAD` may include only later documentation-only artifact commits above that candidate. Verify with a commit-range diff that no source, tests, migrations, dependency metadata, package scripts, or committed Publication configuration changed. Any such executable drift invalidates this handoff and requires affected local validation plus a new candidate SHA.

Required prerequisites, without secret values:

- Node.js compatible with `>=24.10.0 <25` and npm;
- PostgreSQL client/server access able to create and force-drop unique disposable test databases;
- `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` pointing to that safe administrative test boundary;
- outbound DNS and HTTPS access to the two approved endpoints;
- repository dependencies installed with `npm install` under the lockfile-disabled policy.

Do **not** point `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` at the production `news_scraper` application database or use production application data as the disposable target.

Run:

```text
npm install
npm run test:live-sources
```

The procedure must exercise exactly:

1. Author Media — Publication `indie-author-publishing-news`, Source `author_media`, endpoint `site_rss`, `https://www.authormedia.com/feed/`.
2. The Creative Penn — Publication `indie-author-publishing-news`, Source `the_creative_penn`, endpoint `podcast_rss`, `https://www.thecreativepenn.com/feed/podcast/`.

Capture and return:

- VPS `HEAD`, its relationship to the candidate SHA, branch, timestamp/timezone, OS, Node/npm versions, PostgreSQL client/server versions, and resolved `fast-xml-parser` version;
- exact command and exit status;
- for each of both independent attempts and refetches: Source/endpoint identity, outcome, Collection-run ID, run/transport/parser statuses, HTTP status, redirect count, wire/decompressed byte counts, Raw-item count, and elapsed milliseconds;
- confirmation that every reported attempt has a matching persisted terminal Collection run;
- bounded Raw-item plausibility metadata if separately inspected, without bodies or credentials;
- observed refetch behavior and its limitations (304/no parser if validators are used and honored, or repeat content/count behavior if the publisher returns content);
- confirmation the second Source was attempted independently regardless of the first result;
- disposable database name pattern and verified cleanup outcome, without credentials.

Do not weaken safety/approval rules, substitute publishers, print full publisher content, or claim Level 8. If either approved feed does not successfully fetch and parse, record the failure honestly; the Phase 5 exit gate remains blocked.

## Exit-gate status and limitations

Levels 0–5 are satisfied on the corrected candidate implementation tree. Both prior VPS attempts exposed the documented response-bound defects and do not satisfy Level 7; the separate complete-feed measurement is diagnostic sizing evidence only. Fresh VPS Level 7 evidence has not yet been supplied for the new 32 MiB candidate, so the requirement for two real approved feeds to fetch/parse successfully through independent Worker executions with persisted truthful runs remains unproven. Fixture evidence is authoritative for deterministic conditional/no-change and broken-feed isolation behavior; the VPS run must record only the live behavior actually observed.

**Current Phase 5 roadmap exit gate: NOT SATISFIED — VPS LEVEL 7 EVIDENCE PENDING.**

Do not run conversational `/closeout` yet.
