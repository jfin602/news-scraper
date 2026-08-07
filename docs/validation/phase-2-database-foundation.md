# Phase 2 — Database foundation validation

## Source and environment

- Validation completed: 2026-08-07T15:21:53-05:00
- Branch: `main`
- Authoritative package version: `0.2.6`, read from `package.json` at the validated source SHA
- Phase 2 base SHA: `becb967c1d255b23da0e908b2aeda18d298b3147`
- Validated source SHA: `38d18b75b4ab7929088b3ef5f6e3eba1e94cb6b7`
- Platform: Microsoft Windows 10.0.22631, x64
- Node: `v24.14.0`
- npm: `11.6.2`
- PostgreSQL server: `18.3`
- Prerequisite variable names: `NEWS_SCRAPER_DATABASE_URL`, `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL`

`VALIDATED_SOURCE_SHA` is the clean committed P1–P5 implementation, P6 version transition, and the corrective removal of a stale hard-coded version assertion, before this evidence artifact was created. The later documentation-only evidence commit is not represented as runtime-tested source.

The root `.env` existed, was ignored by `.gitignore`, and was untracked. Its contents and all connection strings remained undisclosed. The system Node `v24.11.1` was below the declared `>=24.12.0 <25` engine, so accepted commands used the bundled Node `v24.14.0` executable and npm CLI through that runtime.

## Install, static checks, and deterministic tests

| Command                                                                                                | Result                                                                                                                             |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                                                               | PASS — 180 packages added from the committed lockfile; 181 audited; 0 vulnerabilities                                              |
| `npm run format:check`                                                                                 | PASS — all matched files used Prettier style                                                                                       |
| `npm run lint`                                                                                         | PASS                                                                                                                               |
| `npm run typecheck`                                                                                    | PASS                                                                                                                               |
| `npm test`                                                                                             | PASS after the corrective test-only change — 51 passed, 0 failed, 0 skipped                                                        |
| focused `test/unit/package-scripts.test.ts`                                                            | PASS on validated SHA — 2 passed, 0 failed                                                                                         |
| `npm run test:unit` / `npm run test:integration`                                                       | Covered by the same ordinary wrapper selections; the owner directed reuse of already-passing evidence rather than redundant reruns |
| `npm run check`                                                                                        | Component commands passed; the owner directed that already-passing commands not be rerun                                           |
| `git diff --check becb967c1d255b23da0e908b2aeda18d298b3147...38d18b75b4ab7929088b3ef5f6e3eba1e94cb6b7` | PASS — no committed-range whitespace errors                                                                                        |

The only corrective change after the initial static passes deleted a hard-coded `0.2.5` assertion from the version-synchronization test. The test continues to compare both lockfile version locations to the authoritative package version. The focused test and complete 51-test ordinary suite passed on the corrected tree. Per the repository owner's explicit instruction, checks already passed and unaffected by that deletion were reused rather than rerun.

Ordinary `test`, `test:unit`, `test:integration`, and `check` scripts do not load `.env`. `test:db`, `db:migrate`, `start:web`, and `start:worker` use Node's optional root env-file command boundary. No `dotenv` dependency or production application-level env loader exists.

### Required negative controls

- An explicit single-space `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` override took precedence over the valid ignored `.env` value. `npm run test:db` exited 1 with clear required-prerequisite failures, selected 15 tests rather than skipping, and disclosed no URL or credential.
- `node scripts/run-tests.mjs 'test/does-not-exist/**/*.test.ts'` exited 1 and printed a clear `No test files matched` message.

## Real PostgreSQL evidence

`npm run test:db` completed and returned control to PowerShell without manual or forced termination: 15 passed, 0 failed, 0 skipped. It used real disposable PostgreSQL databases and established Level 4 evidence for:

- production database ping/query behavior and safe connection failures;
- disposable creation, isolation, forced connection cleanup, drop, and verified absence;
- transactions that commit, roll back, propagate failures, and release clients;
- migration from zero, repeat-safe reruns, pending status, failed-migration rollback/not-recorded behavior, and changed/missing applied-history incompatibility;
- current and uninitialized schema readiness through real Web and Worker processes.

The Windows `test/database/process-readiness.test.ts` current-schema and uninitialized-schema cases both completed. Web and Worker lifecycle events were observed, children exited with expected codes, the test process exited, and PowerShell regained control without a manual kill.

### Explicit migration workflows

With `NEWS_SCRAPER_DATABASE_URL` absent from the parent shell, `npm run db:migrate` used the ignored local environment boundary and reported `Database schema is current.` twice. No startup process applied migrations and no URL was printed.

A separate disposable physical procedure created `news_scraper_test_e20d12c9a6804f84b918a53349bf24ef`, verified its existence, explicitly overrode `NEWS_SCRAPER_DATABASE_URL`, ran the migration command twice, observed `current` schema status and one repeat-safe ledger state, closed all connections, dropped the database, and verified that the test-admin catalog returned to its pre-procedure set. An earlier harness-attempt database was also verified absent. One unrelated pre-existing `news_scraper_test_*` database existed both before and after; it was not created or modified by this validation and was left untouched.

## Physical process observations

Against the migrated disposable database:

- Web emitted `web.listening` on `127.0.0.1:53825`; `/health/live` returned HTTP 200 with `{"status":"ok","role":"web"}` and `/health/ready` returned HTTP 200 with `{"status":"ready","role":"web"}`.
- Worker emitted `worker.ready` without Web host/port configuration and remained active until termination.
- Graceful Windows termination produced `web.stopped` and `worker.stopped`; both processes exited 0 and returned control to the harness.

Against a syntactically valid synthetic unavailable PostgreSQL target that explicitly overrode `.env`:

- Web emitted `web.listening` on `127.0.0.1:53839`; liveness remained HTTP 200 and readiness returned HTTP 503 with `{"status":"not_ready","role":"web"}`.
- Worker emitted only `worker.start_failed`, never became ready, and exited 1.
- Web emitted `web.stopped` and exited 0. Output disclosed neither the synthetic password nor raw URL/error.

The real database suite separately established the reachable-uninitialized case: Web listened with live 200 and ready 503, Worker emitted `worker.start_failed` and exited 1, no migration was applied, and Web shut down cleanly.

## Structural boundaries

Source inspection confirmed:

- production `src/` never consumes `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` or parses `.env`;
- Web and Worker both use the canonical `src/database` configuration, pool, and readiness boundary;
- neither process imports or depends on the other, and Worker has no HTTP listener;
- application startup does not call `migrateDatabase`;
- no Publication, Source, Article, Collection-run, Category, duplicate-domain schema, or topic-specific indie-author/publishing logic was introduced;
- Windows IPC/process helpers remain under `test/support/`;
- `package.json`, lockfile top-level metadata, and lockfile root package metadata all equal `0.2.6`.

## Evidence levels, limitations, and exit gates

Established: Level 1 static/version/diff/environment-boundary evidence; Level 2 configuration, migration discovery/status, command, and lifecycle-helper behavior; Level 3 controlled Web HTTP/process and Worker process behavior; Level 4 real PostgreSQL lifecycle, query, transaction, migration, compatibility, readiness, cleanup, and Windows process-completion evidence.

Not established or claimed: Level 5 collection fixtures, Level 6 browser, Level 7 approved live Source, or Level 8 reference deployment evidence.

Phase 2 exit gates are satisfied: shared PostgreSQL configuration and transactions work; clean disposable databases are reproducible and cleaned; explicit development and disposable migrations are repeat-safe; migration/database/schema/prerequisite failures surface safely and nonzero; Web remains live while readiness truthfully fails; Worker never becomes ready on database/schema failure; startup is non-migrating; Windows waits and child termination complete; `.env` remains optional, local, and overrideable; ordinary suites remain independent of automatic `.env` loading; and this durable record identifies the accepted source tree, procedures, evidence levels, results, and limitations.
