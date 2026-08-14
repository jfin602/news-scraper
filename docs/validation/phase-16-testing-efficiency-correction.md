# Phase 16 testing-efficiency correction validation

## Result

**GREEN.** The non-versioned `c16-test-efficiency` correction materially reduced the real-PostgreSQL bottleneck while preserving required ordinary, database, browser, migration, cleanup, isolation, and Phase 16 product evidence. Package version `0.16.6` is unchanged. The correction consumed no roadmap prompt number; P7 remains unexecuted.

## Scope and source range

- Executable baseline: `49959da4ac4050915777ddb8e1c8e89d5ad7b353`, the immediate parent of runner-owned P1 commit `735da56ba84154b2f60485dd2423208b87cf45dd`.
- Final implementation candidate: `38c71b56df67a9ea5f7c684b46aafc8fbdf51a49`.
- Accepted range: `49959da4ac4050915777ddb8e1c8e89d5ad7b353..38c71b56df67a9ea5f7c684b46aafc8fbdf51a49`.
- The baseline already contained Phase 16 P1–P6 product behavior and package `0.16.6`. The correction changes only package scripts, the test runner/type seam, test support, and tests; no production source or migration changed.
- This artifact and GREEN routing alignment are documentation-only closeout writes based on that candidate.

## Environment and timing

- Windows 11 Home 10.0.22631, 64-bit; Intel Core i3-1115G4, 2 cores/4 logical processors; 8 GB RAM.
- Node `v24.11.1`; npm `11.6.2`.
- PostgreSQL `18.3`, x86-64 Windows, local `127.0.0.1:5432`, `max_connections=100`.
- `playwright-core 1.56.1`; Chromium/headless shell build `1194`.
- Baseline ran in a detached temporary worktree on the same host, shared the final tree's installed `node_modules`, and used the same `.env` PostgreSQL administrator. Dependency-install time was excluded. With no lockfile, this records the actual environment rather than claiming byte-for-byte dependency reproducibility.
- Each complete `npm run ...` process was timed sequentially with `System.Diagnostics.Stopwatch`. No automatic retry was used.

## Benchmark and coverage

| Command | Baseline | Final | Change |
| --- | --- | --- | --- |
| `npm run check` | 415 passed, 0 failed/skipped; 71.241 s | 421 passed, 0 failed/skipped; 74.874 s | +3.633 s (+5.1%) |
| `npm run test:db` | 196 passed, 0 failed/skipped; 244.970 s | 202 passed, 0 failed/skipped; 143.193 s | -101.777 s (-41.5%) |
| `npm run test:browser` | 55 passed, 0 failed/skipped; 32.837 s | 55 passed, 0 failed/skipped; 46.957 s | +14.120 s (+43.0%) |
| Complete matrix | 666 passes; 349.048 s | 678 passes; 265.024 s | -84.024 s (-24.1%) |

The primary DB bottleneck improved materially while adding six real-PostgreSQL harness tests. Final DB time remained above the prompt's non-portable roughly-one-minute aspiration; conservative concurrency and host resources remain relevant. Ordinary timing was broadly stable with six added runner tests. Browser timing regressed in this single observation despite unchanged count and green evidence, so no browser-speed claim is made. The aggregate matrix improved 24.1%; no portable wall-clock threshold was treated as a correctness gate.

There are 43 DB test files before and after, no deleted test file, no introduced skip/retry masking, and no production/migration change. Textual counts increased from 662 to 676 `test`/`it` declarations and from 3,688 to 3,732 `assert` uses. Rewritten Worker tests retain prior behavioral assertions with explicit resource ownership. Phase 16 PostgreSQL tests still cover duplicate topology/concurrency, atomic rollback/effect accounting, feed duplicate suppression/keyset behavior, and Source/Category filtering.

## Runner and focused-command policy

- Wrapper default 1; ordinary aggregate/unit/integration/collection 4; browser 2; full DB 2; focused DB 1; live Source 1.
- Discovery is sorted and de-duplicated. No-pattern, zero-match, malformed/duplicate concurrency, and duplicate/empty global-setup input fail before execution.
- The runner strips inherited `NODE_TEST_CONTEXT`, forwards global setup once, and propagates launch errors and nonzero child status. Barrier fixtures prove overlap without assuming output completion order.
- `npm run check` remains format check, lint, typecheck, then ordinary `npm test`.
- `npm run test:db:focused -- <file-or-glob>` keeps optional `.env`, the real-PostgreSQL global prerequisite, concurrency 1, required target, deterministic discovery, and visible zero-match failure.
- Correction prompt validation identifies P1–P3 as implementation and P4 as the sole manual closeout with unchanged version `0.16.6`.

## Database lifecycle classification

- Migrated reusable (27): `article-schema`, `canonical-durable-job-execution`, `category-administration-api`, `collection-article-processing`, `collection-execution`, `collection-normalization-run-accounting`, `collection-pretransport`, `collection-runs`, `configuration-bootstrap`, `configuration-persistence`, `duplicate-grouping`, `duplicate-review-repository`, `editorial-configuration-apply`, `endpoint-administration-api`, `endpoint-collection-jobs`, `endpoint-runtime-state`, `initial-publication-bootstrap`, `public-feed-discovery-repository`, `public-feed-http`, `public-feed-repository`, `publication-administration-api`, `publication-public-status`, `relevance-configuration`, `relevance-rule-administration-api`, `scheduler-pass`, `source-administration-api`, `worker-runtime-orchestration`.
- Bare reusable (1): `collection-capacity`.
- Hybrid (4): `configuration-schema`, `duplicate-persistence-foundation`, `process-readiness`, `source-administration-foundation`.
- Fresh/standalone (11): `article-persistence`, `database`, `database-session`, `database-test-scope`, `disposable-database`, `endpoint-collection-job-policy`, `endpoint-run-lock`, `migrations`, `relevance-article-persistence`, `relevance-schema`, `transactions`.

Fresh paths remain for migration ordering/from-zero/history/checksum/rollback, disposable creation/isolation/forced cleanup, uninitialized readiness, transaction/session behavior, advisory locks, and schema-level trigger/function mutation. Hybrid files retain explicit fresh subcases. The harness self-test remains standalone.

Each reusable file owns a lazy unique physical database. Migrated mode runs production migrations once per scope, then dynamically discovers public base tables except `news_scraper_schema_migrations` and uses safely quoted `TRUNCATE ... RESTART IDENTITY CASCADE`. Current/future application tables, including Phase 16 duplicate tables, reset while ledger, schema, indexes, and constraints persist. There is no universal outer rollback transaction.

Cases close owned clients, pools, runtimes, and processes before returning. A 500 ms lock timeout makes leaked blocking transactions fail visibly; reset failure poisons the scope. Overlapping callbacks and disposal during use are rejected. Callback plus reset/cleanup failures cannot become silent green. Final disposal force-drops the unique database and verifies absence. Post-matrix inspection found no remaining `news_scraper_test_*` databases.

## PASS 1 — contract/evidence review

**PASS.** Runner/package behavior, PostgreSQL lifecycle, file classification, and evidence preservation match the testing contract and P1–P3 design. Global setup, prerequisite and child failure, bounded concurrency, real PostgreSQL, reset/identity/ledger/schema preservation, unique ownership, timeout failure, and verified cleanup are covered. Baseline/final counts and diffs show added harness/runner coverage rather than test removal. All final aggregates passed without skips.

## PASS 2 — adversarial review

**PASS; no bounded fix required.** Required hypotheses were investigated as follows:

- Row, identity, and failed-callback contamination: post-callback dynamic truncation and follow-up-case tests protect these.
- Open transaction/client: converted cases close resources in `finally`; an intentional leaked-lock test proves bounded failure, poisoning, force-drop, and absence verification.
- Ledger/schema/table discovery: ledger exclusion/count, dynamic base-table discovery, safe quoting/order, a created identity table, and fresh/hybrid paths protect migration and schema claims.
- Concurrent callback/file collision and cleanup race: one scope rejects overlap; independent scopes prove distinct UUID database names and verified cleanup; full DB concurrency is capped at 2.
- Advisory locks and process tests: lock-sensitive cases remain fresh; Worker/readiness cases close owned processes/runtimes before reset.
- Hybrid/fresh routing: uninitialized readiness, foundation migrations, lifecycle, lock, transaction, and schema mutation remain fresh.
- Focused runner hazards: tests cover malformed/duplicate options, missing target, no match, de-duplication, global setup, launch failure, and child nonzero propagation.
- Browser/live Source: browser is bounded at 2 and passed 55 tests; live Source remains serial and was not required because publisher behavior did not change.
- Aggregate containment: `check`, DB, and browser scripts still contain the evidence assumed by this closeout.

No hidden child failure, output-order dependency, collision, or oversubscription failure was observed. DB cap 2 is conservative on this host. Browser variability is recorded, not hidden.

## PASS 3 — structural review

**PASS; no Terra High handoff occurred.** Database create/drop and row-reset SQL are centralized; metadata avoids a drifting table list; scope state is file-local; concurrency is declared in package commands and tested; fresh/reusable lifecycles coexist only for distinct evidence; no generic framework, compatibility bridge, or production change was added. Stale pre-P4 routing text was the only documentation issue and was aligned after GREEN evidence.

## Final evidence

Executed on unchanged candidate `38c71b56df67a9ea5f7c684b46aafc8fbdf51a49`:

- `npm run check` — PASS, 421/0/0; Level 1 static/type and ordinary deterministic evidence.
- `npm run test:db` — PASS, 202/0/0; Level 4 real disposable PostgreSQL evidence.
- `npm run test:browser` — PASS, 55/0/0; Level 6 browser evidence.
- `git diff --check 49959da4ac4050915777ddb8e1c8e89d5ad7b353..38c71b56df67a9ea5f7c684b46aafc8fbdf51a49` — PASS for the committed correction range.
- `npm run codex:phase:validate -- c16-test-efficiency` — PASS; valid grammar and sole P4 closeout.
- PostgreSQL disposable-database inventory after validation — empty.

No live-Source command ran; inspection confirms it remains serial. No failure was retried. An initial streamed baseline `check` observation was discarded because its final summary was not captured; the recorded result is the subsequent complete successful timed execution.

## Conclusion

The test system remains trustworthy and the primary bottleneck improved materially without lost evidence. Result: **GREEN**. Package remains `0.16.6`; no npm lockfile or shrinkwrap exists. P7 is unchanged and pending. Next: revalidate Phase 16 P7 under the validation-efficiency/command-containment policy before manual execution.
