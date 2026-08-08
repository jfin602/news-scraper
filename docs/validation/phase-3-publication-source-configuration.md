# Phase 3 — Publication and Source Configuration Validation

## Accepted implementation tree

- Validation completed: 2026-08-08 11:19:26 -05:00 (America/Chicago).
- Branch: `main`.
- Phase 3 baseline: `b3b088075862bb2b891a0c5ca35c8debdc65f8f7` (`chore: enter phase 3 baseline`).
- Validated source SHA: `1bc9f80ac551bdb03d7887578ff4e4f10a6ff015` (`0.3.6`).
- Package version at that SHA: `0.3.6`; `package-lock.json` top-level and root-package versions matched it.
- This artifact is intentionally created after validation. Its later documentation commit is not represented as the executed implementation tree.

The source tree was clean immediately before validation. The P6 version transition changed only the three required root package/lock version values, was committed before validation, and no git tag was created.

## Environment and safety preflight

- Platform: Microsoft Windows 10.0.22631 (Windows NT 10.0.22631.0).
- Node: `v24.11.1`, satisfying `package.json` `engines` (`>=24.10.0 <25`).
- npm: `11.6.2`.
- PostgreSQL used for Level 4 procedures: `18.3`.
- Root `.env` was ignored and untracked. No environment-file contents, database URLs, credentials, passwords, or query parameters were printed.
- The only relevant environment-variable names inspected were `NEWS_SCRAPER_DATABASE_URL` and `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL`.

## Install, static, and ordinary deterministic evidence

All commands below were run from the validated source SHA. They completed successfully.

| Command | Result | Evidence level |
| --- | --- | --- |
| `npm ci` | Installed from the committed lockfile; 180 packages added, 0 vulnerabilities reported. | 1 |
| `npm run format:check` | Passed: all matched files use Prettier style. | 1 |
| `npm run lint` | Passed. | 1 |
| `npm run typecheck` | Passed. | 1 |
| `npm test` | Passed: 70 tests, 0 failures/skips/todos. | 2–3 |
| `npm run test:unit` | Passed: 62 tests, 0 failures/skips/todos. | 2 |
| `npm run test:integration` | Passed: 8 tests, 0 failures/skips/todos. | 3 |
| `npm run check` | Passed (format, lint, typecheck, and the 70-test ordinary suite). | 1–3 |
| `git diff --check b3b0880...1bc9f80` | Passed with no whitespace errors across the committed Phase 3 range. | 1 |

The package-command boundary test passed: only `test:db`, `db:migrate`, `db:bootstrap`, `start:web`, and `start:worker` use optional `.env` loading. Ordinary `test`, `test:unit`, `test:integration`, and `check` do not. There is no application-level `dotenv` dependency. Ordinary deterministic validation therefore did not require PostgreSQL or public internet access.

## Required negative controls

| Procedure | Observed result | Evidence level |
| --- | --- | --- |
| Explicit synthetic blank `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` override, then `npm run test:db` | Failed nonzero (exit 7) before tests with the bounded required-prerequisite message. It did not skip green or emit a URL/credential. | 3 |
| `node scripts/run-tests.mjs 'test/required-does-not-exist/**/*.test.ts'` | Failed nonzero (exit 1) with `No test files matched`. | 3 |

The synthetic override was removed before all valid database procedures.

## Real PostgreSQL database evidence

`npm run test:db` was run through the guarded disposable-database global setup and passed: 28 tests, 0 failures/skips/todos, duration 24.6 seconds. These are Level 4 claims against real disposable PostgreSQL, not mocked persistence.

The suite exercised:

- production migration from zero and repeat-safe/current behavior; expected tables, state constraints, ownership constraints, keys, endpoint `rss_atom`, polling bounds, and domain-rule persistence;
- Phase 2 migration history, rollback, pending-status, readiness, database transaction, connection, and cleanup regressions;
- pure configuration behavior already covered at Level 2: slug/config-key validation, hostname normalization, exact/subdomain matching, policy narrowing, approved endpoint containment, and polling bounds;
- complete Publication/Source/endpoint/domain-rule round trips, stable-key ownership scoping, endpoint aggregate reads, and transaction rollback without partial configuration;
- generic bootstrap creation, repeat idempotency, concurrency convergence, no-overwrite behavior, preserved persisted policy, obsolete-endpoint non-recreation, rollback on required-insertion failure, and the generic CLI path;
- committed approved bootstrap cardinality, exact content, repeat idempotency, and simulated operator-edit preservation; and
- current and uninitialized real-database Web/Worker readiness behavior. A current database produced Web liveness/readiness 200 and a ready Worker that shut down cleanly. An uninitialized reachable database kept Web live while readiness was 503; Worker did not report ready and followed its established startup-failure path. The tests also prove startup does not apply migrations or bootstrap configuration.

## Operator command smoke on a separately created disposable database

A second, independent Level 4 procedure used a newly generated guarded `news_scraper_test_<32-hex>` database. The database name was verified in the PostgreSQL catalog after creation; the child processes were explicitly given that disposable database as `NEWS_SCRAPER_DATABASE_URL`, overriding any optional `.env` value.

1. `npm run db:migrate` from zero applied `0001_publication_source_configuration.sql`.
2. A second `npm run db:migrate` reported `Database schema is current.`
3. The first `npm run db:bootstrap` reported `publication=created, sources_created=2, endpoints_created=2`.
4. The second `npm run db:bootstrap` reported `publication=existing, sources_created=0, endpoints_created=0`.
5. Direct inspection confirmed cardinalities of 1 Publication, 2 Sources, 2 endpoints, 2 Source domain rules, and 2 endpoint domain rules; exact approved state and absence of withheld Sources matched the committed configuration.
6. All application connections were closed; the guarded helper dropped the database with forced cleanup and a final PostgreSQL-catalog query confirmed it no longer existed.

The smoke procedure performs database configuration only and made no network contact with either publisher.

## Approved bootstrap configuration proved

The real database suite and independent operator smoke both proved exactly this initial private, collection-active Publication configuration:

| Source | Endpoint | Source and endpoint states | Exact host rules | Polling |
| --- | --- | --- | --- | --- |
| `Author Media` (`author_media`) | `site_rss`, `https://www.authormedia.com/feed/`, `rss_atom` | approved / active / enabled | `www.authormedia.com`, exact host only, on Source and endpoint | 21600 seconds |
| `The Creative Penn` (`the_creative_penn`) | `podcast_rss`, `https://www.thecreativepenn.com/feed/podcast/`, `rss_atom` | approved / active / enabled | `www.thecreativepenn.com`, exact host only, on Source and endpoint | 21600 seconds |

The Publication is `Indie Author Publishing News` (`indie-author-publishing-news`), `active_for_collection=true`, and `public_status=private`. `Jane Friedman`, `Authors Publish`, `Sub Club`, and `Upstream Reviews` are absent. Rerunning bootstrap preserved all cardinalities; the database test also simulated Source/endpoint operator edits and proved a normal rerun did not overwrite them.

## Structural boundary review

Level 1 inspection of the accepted source tree found:

- Publisher names, URLs, and the initial Publication name occur only in the Publication-owned config and its direct verification tests; generic `src/`, scripts, and migrations contain no Source-specific branch.
- Normal Web/Worker startup imports neither migration nor bootstrap behavior. Migration and bootstrap are explicit operator scripts only.
- No outbound HTTP, DNS, or other network execution was added in Phase 3.
- No Source discovery or auto-approval exists.
- No Category, Relevance, branding, Source priority, parser, collection cache/health/due/attempt/success/failure counter, Article, Collection-run, observation, or duplicate persistence was introduced. Incidental existing runtime health/cache-control and database failure-handling identifiers are not those deferred domain features.

This structural review is not used as a substitute for the Level 4 database proofs above.

## Limitations and exit-gate conclusion

Level 5 is not applicable: Phase 3 has no collection fixture implementation. Level 6 is not applicable: no browser behavior exists. Level 7 is not applicable to this closeout: Phase 3 performs no live Source collection; separate reconnaissance artifacts remain point-in-time source-selection evidence only.

**Phase 3 exit gate: satisfied.** The validated tree reproducibly migrates the configuration schema from zero; configures a generic Publication with two approved `rss_atom` endpoints without topic-specific engine logic; rejects invalid configuration relationships; preserves transactional/bootstrap coherence, idempotency, concurrency convergence, and operator changes; confines the approved initial Source set to Author Media and The Creative Penn; and has focused, broader, and real-PostgreSQL final-tree evidence for the Phase 3 contract.
