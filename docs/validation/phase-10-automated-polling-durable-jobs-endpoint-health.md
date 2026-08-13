# Phase 10 Automated Polling, Durable Jobs, and Endpoint Health Validation

## Accepted source and environment

- Validation date: 2026-08-11.
- Accepted executable source SHA: `d64db4efa178bc9dca3c5cf7f48a6fa8b764c638`.
- Package version: `0.10.8`.
- Phase 10 implementation base: `0796ac118e5741f80c47104e9b2aaab5fe673c2c`, the parent of the first P1 implementation commit `401b3408134ec33d7e8b456cf008de27292b6ac6`.
- Reviewed committed range: `0796ac118e5741f80c47104e9b2aaab5fe673c2c...d64db4efa178bc9dca3c5cf7f48a6fa8b764c638`.
- Platform: Windows x64, Windows 10.0.22631.
- Node.js: 24.11.1.
- npm: 11.6.2.
- PostgreSQL client and disposable-test server: 18.3.
- Playwright: 1.56.1; bundled Chromium exercised by the browser suite: 141.0.7390.37.
- `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` was present through the local `.env` and used by the disposable PostgreSQL harness. Its value was not recorded.

The accepted executable SHA is the clean, committed P1-P8 source tree before this evidence document was added. The later documentation-only validation commit is not represented as runtime-tested executable source.

## Singleton-correction handoff

`docs/validation/single-publication-simplification-correction.md` records the accepted correction at executable SHA `2cb9b2f747957324dfa15ad12fa6535f62ed3ee4` and explicitly authorizes ordinary Phase 10 implementation to begin.

Final-tree inspection and regression evidence preserve that foundation:

- the current migration chain builds the singleton schema from zero;
- runtime, scheduler, job, and migration source contain no Publication ID, slug, selector, or tenant scope;
- Source-scoped Article identity and Source/endpoint/run/Article/observation integrity remain covered by real PostgreSQL tests;
- `GET /api/feed` and `GET /` remain the canonical selector-free public surfaces;
- the Web process contains no Source collection path; its browser-side fetch targets only `/api/feed`;
- no indie-author-specific or publisher-specific engine logic was introduced.

## Installation and exact-final-tree command evidence

`npm install` completed normally with 191 packages audited, zero reported vulnerabilities, and no `package-lock.json` or `npm-shrinkwrap.json` created.

All required commands ran against executable SHA `d64db4efa178bc9dca3c5cf7f48a6fa8b764c638`:

| Command | Observed result |
| --- | --- |
| `npm run format:check` | Passed; all matched files used Prettier formatting. |
| `npm run lint` | Passed. |
| `npm run typecheck` | Passed. |
| `npm run test:unit` | 222 passed, 0 failed, 0 skipped. |
| `npm run test:integration` | 53 passed, 0 failed, 0 skipped. |
| `npm run test:collection` | 38 passed, 0 failed, 0 skipped. |
| `npm run test:db` | 111 passed, 0 failed, 0 skipped against real disposable PostgreSQL. |
| `npm test` | 313 passed, 0 failed, 0 skipped. |
| `npm run check` | Passed formatting, lint, type checking, and the 313-test deterministic aggregate with no skips. |
| `npm run test:browser` | 9 passed, 0 failed, 0 skipped in bundled Chromium. |

Every required filtered suite selected tests. No prerequisite was silently skipped and no test retry was used to hide failure.

## Evidence conclusions

### Level 2/3 policy and component evidence

Deterministic unit and integration evidence proves bounded scheduler jitter, due/cooldown selection composition, retry classification and three-attempt cap, capped equal-jitter backoff, contention deferral without retry consumption, five-state endpoint health boundaries, capacity key/slot calculations, and the shared manual/scheduled canonical endpoint execution service.

Controlled Worker orchestration tests prove prompt and non-overlapping scheduler passes, non-busy consumer waits, bounded local dispatch, isolation after loop/job failures, periodic lease renewal, stale-token suppression, recovery-loop isolation, and idempotent shutdown ordering. Timing behavior is driven through controlled clocks/events rather than arbitrary sleeps.

### Level 4 PostgreSQL concurrency, recovery, and diagnostics

The disposable PostgreSQL suite observed:

- migration from zero through all four current migrations and safe reruns;
- endpoint runtime/cache/failure/cooldown constraints and operator bootstrap preservation;
- one outstanding queued/running job per endpoint, including competing enqueuers and schedulers;
- deterministic atomic claim exclusivity across competing clients;
- claim-token and lease enforcement for attachment, renewal, deferral, recovery, and terminalization;
- expired unstarted recovery and started-job/run-aware reconciliation without replaying or duplicating the Collection run;
- one durable job attempt correlated to at most one Collection run through database uniqueness and transactional execution;
- atomic transient-failure terminalization plus retry successor insertion, bounded retry chains, permanent/exhausted termination, and rollback if successor creation fails;
- terminal work permitting later due scheduling;
- endpoint advisory-lock overlap protection independently of capacity ownership;
- cross-process global, per-Source, and per-host advisory capacity, unrelated Source/host progress, release/reacquisition after success/failure, uncertain-unlock session discard, and backend/session-death release;
- contention deferral without a Collection run or retry-attempt consumption;
- endpoint state application idempotency, older-run protection, cooldown application, and later-success recovery;
- Source/endpoint/run/Article/observation integrity, Source-scoped Article identity, transaction rollback, and identity-race serialization;
- a real Worker automatic path that scheduled due work, isolated a failing endpoint, completed unrelated work, and left endpoint/job/run state durably diagnosable;
- real Worker graceful shutdown with controlled in-flight collection and periodic interrupted-run recovery without replay.

Durable endpoint state records last attempt, last success, next due time, cooldown, consecutive failures, and conditional validators. Durable job rows record queued/running/terminal status, bounded outcome/reason/error fields, attempt number, retry predecessor, ownership/lease state, and correlated Collection-run identity. Collection runs retain trigger, status, bounded outcome/retry classification, counters, redirects, byte and elapsed telemetry. Endpoint health is derived as `unknown`, `healthy`, `delayed`, `degraded`, or `unhealthy` while approval, lifecycle, and operational states remain separate.

### Conditional collection and network safety

Controlled transport, integration, and real PostgreSQL tests prove that persisted ETag and Last-Modified values are supplied on later requests; successful HTTP 200 processing replaces validators; HTTP 304 is a successful no-change run that merges returned validators while preserving omitted existing values; and parser/processing or transport failure does not commit response validators. Validator shape is bounded in repository and database constraints.

The same tests retain initial-request and every-redirect scheme, approved-domain, port, DNS/address, and resolver-bound transport validation. No fixture exemption weakens the production SSRF or whitelist boundary.

### Worker lifecycle and failure isolation

The real process/database and deterministic orchestration suites prove database readiness before `worker.ready`, continuously active scheduler/consumer/recovery loops without a dummy keepalive or Worker HTTP server, isolated loop and job failures, bounded dispatch, lease renewal, stale-owner protection, and SIGINT/SIGTERM-compatible idempotent shutdown. Shutdown stops new scheduling/claims, awaits active scheduler and in-flight work, emits `worker.stopped` after cleanup, and closes the database once.

One endpoint failure, endpoint-lock contention, global/Source/host saturation, retry exhaustion, permanent failure, cooldown, expired leases, stale tokens, rollback, and shutdown during work all retain durable recoverability or allow unrelated eligible work to proceed as applicable.

### Public-feed and browser regression

Real PostgreSQL/HTTP tests prove that retained eligible Articles remain readable while collection is inactive or has failed, retried, or cooled down; feed eligibility does not depend on endpoint/run operational failure state; empty/private/absent/dependency-error behavior remains bounded and secret-safe; and output preserves deterministic ordering and exact stored `original_url` destinations.

The nine-test Chromium suite proves loading, direct navigation and refresh at `/`, desktop Date/Headline/Source presentation, mobile stacking without feed-caused horizontal overflow, empty/unavailable/error states, inert untrusted text, keyboard focus, UTC date rendering, and exact external publisher links. The page requests only the canonical `/api/feed` boundary.

## Committed-range and security review

`git diff --check 0796ac118e5741f80c47104e9b2aaab5fe673c2c...d64db4efa178bc9dca3c5cf7f48a6fa8b764c638` passed. The executable range adds only Phase 10 endpoint runtime telemetry, durable endpoint jobs, scheduling, canonical scheduled execution, retries/cooldown/health, cross-process advisory capacity, Worker lifecycle/diagnostics, and their tests.

The range also contains unrelated root idea-document commits (`feature-ideas.md` and `known-issues.md`) made between Phase 10 implementation commits. They are not executable, were not introduced by P8, and were not treated as Phase 10 evidence. No Phase 11 Categories/configurable Relevance, admin/auth, HTML collection, duplicate moderation, search/pagination/presentation redesign, production dashboard, generic job framework, durable capacity table, parallel collection path, or endpoint-lock replacement is present.

Source inspection found no Publication tenant scope or topic-specific engine condition. Scheduler execution rechecks canonical eligibility and reuses the established network-safety and endpoint-lock path. Capacity ownership does not resolve or fetch destinations. Validators and job/run diagnostics are bounded; durable jobs do not store Raw response bodies; Web/API does not collect Sources inline. No npm lockfile exists.

## Limitations and live-source status

- `npm run test:live-sources` was not run. It is not a Phase 10 closeout requirement, and deterministic Phase 10 acceptance does not depend on public publisher availability.
- Evidence is local on Windows with PostgreSQL 18.3 and bundled Chromium 141.0.7390.37; it is not a production deployment, monitoring, alerting, backup/restore, or live-publisher observation.
- PostgreSQL server capability was exercised through the safe disposable harness; no connection string or credential was recorded.

## Closeout conclusion

Phase 10 is green at executable SHA `d64db4efa178bc9dca3c5cf7f48a6fa8b764c638`, package version `0.10.8`. The required static, deterministic collection, real PostgreSQL concurrency/recovery, Worker lifecycle, conditional-fetch, durable diagnostic, public-feed, and browser evidence is complete with no skips or bounded Phase 10 defect remediation required. The phase is ready for the separate conversational `/closeout` handoff; this P8 validation does not perform the Phase 11 `0.11.0` transition.
