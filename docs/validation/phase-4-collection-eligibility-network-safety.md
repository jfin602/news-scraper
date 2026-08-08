# Phase 4 — Collection Eligibility and Network Safety Validation

## Accepted implementation tree

- Validation completed: 2026-08-08 17:18:16 -05:00 (America/Chicago; Windows time-zone id `Central Standard Time`).
- Branch: `main`.
- Phase 4 baseline: `cdd10297dbf3313bcc79b31b40a535df060749dc` (`chore: enter phase 4 baseline`).
- Validated source SHA: `0022d6cdd4cb8a2adf311aa8295ab3dd18cdf4c6` (`0.4.6`).
- Package version at that SHA: `0.4.6`.
- The tracked working tree was clean before validation. The committed-range whitespace check covered the Phase 4 baseline through the validated source SHA.
- This artifact was created only after validation. Its later documentation commit is not represented as the executed implementation tree.

## Environment and safety preflight

- Platform: Microsoft Windows 11 Home 10.0.22631 build 22631, x64.
- PowerShell: `5.1.22621.6133`.
- Node: `v24.11.1`, satisfying `package.json` `engines` (`>=24.10.0 <25`).
- npm: `11.6.2`.
- PostgreSQL used for Level 4 evidence: `18.3`.
- Root `.env` remained ignored and untracked. Its contents and values were not displayed.
- No real database URL, password, credential, or secret query parameter was emitted or added to this artifact. Tracked PostgreSQL URL literals were confined to existing test fixtures and process tests; no committed real credential was identified.
- `.npmrc` retained `package-lock=false`; no `package-lock.json` was present, tracked, or generated.

## Clean dependency installation

The generated local `node_modules` directory was resolved to the repository-local path and removed before installation. An initial online `npm install --loglevel=verbose` restored dependency content but did not return within the bounded command timeout. After confirming no task-owned npm child remained, `npm install --offline --no-audit --no-fund` completed successfully from the verified npm cache (`up to date in 1s`). No package lock was generated. This validates installation from the committed `package.json` under the repository's lockfile-disabled policy; it does not claim byte-for-byte dependency reproducibility.

## Static and ordinary deterministic evidence

All commands were rerun against the validated source SHA and returned control to the shell.

| Command | Result | Evidence level |
| --- | --- | --- |
| `npm run format:check` | Passed; all matched files use Prettier style. | 1 |
| `npm run lint` | Passed. | 1 |
| `npm run typecheck` | Passed. | 1 |
| `npm test` | Passed: 111 tests, 8 suites, 0 failures/skips/todos. | 2–3 |
| `npm run test:unit` | Passed: 95 tests, 5 suites, 0 failures/skips/todos. | 2 |
| `npm run test:integration` | Passed: 16 tests, 3 suites, 0 failures/skips/todos. | 3 |
| `npm run check` | Passed, including its repeated 111-test ordinary suite. | 1–3 |
| `git diff --check cdd10297...0022d6cd` | Passed across the committed Phase 4 range. | 1 |

The ordinary suites used injected resolvers and controlled outbound callbacks. They required neither PostgreSQL nor live publishers, uncontrolled public DNS, or publisher HTTP.

## Required negative controls

### Database prerequisite

The original blank-value procedure was diagnosed rather than accepted. On PowerShell 5.1, assigning an empty string removed `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` from the process environment (`Test-Path Env:NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` returned false). That allowed Node's optional `.env` loading to supply the valid local value, so the earlier green database run was an invalid shell-level negative procedure, not an application configuration defect.

The accepted procedure preserved the original process-scoped state without printing it, set the non-empty synthetic value `not-a-postgresql-url`, invoked `npm run test:db`, and restored the original state in `finally`. The synthetic value remained present and took precedence over `.env`. The command exited nonzero with status 7 during global setup and the bounded error category `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL must be a valid PostgreSQL URL.` No database tests ran, no skipped-green result occurred, and no environment or credential value was printed. This is Level 3 prerequisite-boundary evidence.

### Zero selection

`node scripts/run-tests.mjs "test/required-does-not-exist/**/*.test.ts"` exited nonzero with status 1 and `No test files matched`. It did not produce a zero-test green result. This is Level 3 wrapper evidence.

## Eligibility and staged execution evidence

Level 2 unit tests proved the immutable eligible result and every canonical blocking reason: `publication_inactive`, `source_unapproved`, `source_archived`, `source_paused`, `source_disabled`, `endpoint_unapproved`, `endpoint_archived`, `endpoint_paused`, and `endpoint_disabled`. They also proved deterministic first-blocking-state precedence and kept Source reasons distinct from endpoint reasons.

Level 3 integration tests proved eligibility runs before lock and safety. Ineligible configuration never invoked the lock, resolver, or controlled outbound boundary. Lock contention prevented resolver and outbound work, while lock infrastructure failures propagated rather than becoming configuration-state decisions.

## Static destination policy evidence

Level 2 and 3 tests proved:

- HTTP and HTTPS are the only supported request schemes; other schemes return `unsupported_scheme`.
- Malformed, hostless, and credential-bearing destinations fail with stable bounded decisions.
- Effective HTTP port 80 and HTTPS port 443 are allowed; other ports are rejected.
- Canonical exact-host and explicitly enabled DNS-label subtree matching reject suffix confusion.
- Source approved domains remain the maximum boundary; endpoint rules narrow it, and empty endpoint narrowing inherits the Source maximum.
- Initial and relative/scheme-relative redirect candidates use the same static policy.
- An outside-domain redirect cannot bypass endpoint narrowing, and a static rejection occurs before DNS.

Phase 3 structural URL parsing remains distinct from Phase 4 runtime request safety; drafting/configuration semantics were not retroactively collapsed.

## DNS, address, redirect, and rebinding evidence

Level 2 deterministic tests used injected resolution and proved public-unicast IPv4 and IPv6 success; resolver exception, zero answers, malformed answers, family mismatches, and scoped addresses fail closed. The address matrix rejected IPv4 unspecified/current-network, RFC1918, CGNAT, loopback, link-local/cloud-metadata, documentation, benchmarking, protocol/special-use, multicast, reserved/future, and broadcast ranges. It rejected IPv6 unspecified, loopback, unique-local, link-local, multicast, documentation, protocol/special-use, deprecated translation, and tunnel ranges required by the implementation policy.

IPv4-mapped IPv6 dotted and hexadecimal forms were classified by the underlying IPv4 policy, including private, loopback, link-local, special-use, and globally routable cases. A mixed public/unsafe answer set rejected the entire destination as `unsafe_resolved_address`; multiple all-public answers produced one immutable validated result with normalized concrete addresses and families.

Level 3 composition proved static policy precedes DNS, redirect candidates are independently revalidated and re-resolved, prior addresses cannot be reused for redirects, and the controlled outbound callback receives `ValidatedDestination` concrete address data. The production resolver adapter was composition-tested through an injected lower-level lookup and requested all answers without contacting public DNS. The Phase 4 boundary performs no unchecked second resolver call.

## Real PostgreSQL evidence

`npm run test:db` passed against PostgreSQL 18.3: 32 tests, 1 suite, 0 failures/skips/todos. These are Level 4 claims against real disposable PostgreSQL, not mocked persistence.

The suite proved:

- two independent database actors use different PostgreSQL backends; actor A can own endpoint A while actor B receives `endpoint_locked` and cannot execute protected work;
- actor B can acquire unrelated endpoint B while A is held;
- release permits endpoint A reacquisition; callback failure still releases; repeated alternating ownership does not leak locks;
- a leased database session remains on one backend for its callback and clients are released on success/failure;
- explicit discard and query failure prevent a possibly unsafe client from returning to the pool as clean;
- database close, query, ping, transaction, acquisition-failure, and readiness behavior remains green;
- deterministic barriers, rather than arbitrary sleeps, coordinate lock-contention proof.

The real-PostgreSQL pretransport test migrated and loaded a synthetic topic-independent Publication/Source/endpoint aggregate through the Phase 3 repository boundary. It proved fully safe execution reaches the controlled outbound callback exactly once with concrete IPv4/IPv6 data, same-endpoint concurrent execution is blocked before resolution/outbound work, release permits later execution, and callback failure releases ownership. The production composition retains the post-lock callback insertion point where Phase 5 can create a Collection run before network safety.

The broader Level 4 regression suite also proved migration from zero/current/repeat behavior; schema ownership/state/policy constraints; database transaction/close/readiness behavior; configuration aggregate round trips; Source policy enforcement; bootstrap idempotency, concurrency convergence, no-overwrite, rollback, and CLI behavior; current/uninitialized Web and Worker readiness; and absence of automatic startup migration/bootstrap.

Disposable database helpers proved unique database creation, isolation, successful cleanup, cleanup after callback failure, forced cleanup of leaked application connections, and catalog-verified drop. All database procedures returned control to the shell.

## Structural boundary review

Level 1 inspection of the validated tree found:

- generic `src/collection/**` contains no indie-author, publisher, or Source-specific branch;
- Source-domain enforcement has no test-only production bypass;
- Web/API startup does not import or invoke collection, and Worker main/runtime has no manual endpoint collection command;
- no production publisher `fetch`, HTTP request implementation, or real redirect-following loop exists;
- no RSS/Atom parser, Raw-item pipeline, persisted Collection-run schema/repository, scheduler/job/due-endpoint logic, Article normalization/Relevance/identity/persistence, or Source discovery/auto-approval exists;
- the only migration remains `0001_publication_source_configuration.sql`;
- advisory endpoint locking uses one leased `DatabaseSession` for `pg_try_advisory_lock` through confirmed `pg_advisory_unlock`; it is not implemented through unrelated pooled acquire/release calls;
- failed/uncertain acquisition or unlock discards the leased client;
- controlled outbound code accepts only a previously validated destination and contains no transport implementation;
- no `package-lock.json` exists.

## Evidence limits and Phase 4 conclusion

- Level 1: achieved for version, committed range, structural boundaries, topic independence, and absence of deferred transport/domain behavior.
- Level 2: achieved for pure eligibility, static destination, address classification, and immutable decision behavior.
- Level 3: achieved for deterministic staged eligibility/lock/static/DNS/redirect/controlled-outbound composition and required false-green controls.
- Level 4: achieved for real-PostgreSQL sessions, endpoint-lock contention/release, persisted pretransport composition, cleanup, and Phase 2/3 database regressions.
- Level 5 HTTP/RSS fixture evidence is not applicable until Phase 5 because Phase 4 has no transport or parser.
- Level 6 browser, Level 7 approved-live-Source, and Level 8 deployment evidence are not applicable. No live publisher, public DNS, real HTTP, browser, or deployment validation was performed or claimed.

**Phase 4 exit gate: satisfied.** Eligible synthetic endpoints reach the injected controlled outbound boundary only with a validated concrete destination; every configuration, static-policy, DNS/address, redirect, and endpoint-lock blocker prevents that boundary with stable reasons; same-endpoint cross-actor ownership is excluded and safely released against real PostgreSQL; broader regressions pass on the exact committed tree; and the accepted Phase 4 tree contains no publisher transport, Collection runs, parser, scheduler, Article pipeline, or topic-specific aggregation behavior.
