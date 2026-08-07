# Phase 1 — Application foundation validation

## Source and environment

- Validation completed: 2026-08-07T11:03:48-05:00 (2026-08-07T16:03:48Z)
- Branch: `main`
- Authoritative package version: `0.1.4`, read from `package.json` at the validated source SHA
- Phase 1 base SHA: `9c228a706d6ae8138e8d79ae27b26b42d9b21dc0`
- Validated source SHA: `ddd77b0dd083ec27c73ab288a5df3afdf9d66f66`
- Platform: Microsoft Windows 10.0.22631, x64
- Node: `v24.14.0`
- npm: `11.6.2`

`VALIDATED_SOURCE_SHA` is the clean, committed P1–P3 implementation plus the P4 version-metadata transition, before this evidence artifact was created. The later documentation-only evidence commit is not represented as runtime-tested source.

The system-installed Node was `v24.11.1`, below the declared `>=24.12.0 <25` engine. Validation therefore prepended Codex's bundled Node `v24.14.0` directory to `PATH` and invoked npm through that compliant runtime. `Get-Command node` resolved to the bundled executable before the accepted matrix was run.

## Install, static checks, and automated tests

All commands below ran locally against the clean validated source tree and passed:

| Command                                                                                                | Result                                                                                |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `npm ci`                                                                                               | PASS — 165 packages added from the committed lockfile; 166 audited; 0 vulnerabilities |
| `npm run format:check`                                                                                 | PASS — all matched files use Prettier style                                           |
| `npm run lint`                                                                                         | PASS                                                                                  |
| `npm run typecheck`                                                                                    | PASS                                                                                  |
| `npm test`                                                                                             | PASS — 31 passed, 0 failed, 0 skipped                                                 |
| `npm run test:unit`                                                                                    | PASS — 25 passed, 0 failed, 0 skipped                                                 |
| `npm run test:integration`                                                                             | PASS — 6 passed, 0 failed, 0 skipped                                                  |
| `npm run check`                                                                                        | PASS — aggregate formatting, lint, typecheck, and 31-test suite                       |
| `git diff --check 9c228a706d6ae8138e8d79ae27b26b42d9b21dc0...ddd77b0dd083ec27c73ab288a5df3afdf9d66f66` | PASS — no whitespace errors in the committed Phase 1 range                            |

The first commit adding `package.json` was `76944b2c75c8b07f7e0b05f29d2a34782abcc5e7`; its parent is the recorded Phase 1 base SHA.

### Zero-selection negative

`node scripts/run-tests.mjs 'test/closeout-deliberately-no-match/**/*.test.ts'` exited `1` and printed `No test files matched: test/closeout-deliberately-no-match/**/*.test.ts`. The required selection path did not false-green.

## Physical runtime observations

The Windows closeout harness invoked each real TypeScript entrypoint with the compliant `node` resolved from `PATH`. It used IPC only to deliver the named `SIGTERM` process event because Windows does not provide POSIX signal delivery; application startup, HTTP, lifecycle output, and exit behavior came from the actual entrypoints.

### Web/API

- Startup: `node src/app/web/main.ts` with `NODE_ENV=test`, `NEWS_SCRAPER_WEB_HOST=127.0.0.1`, and `NEWS_SCRAPER_WEB_PORT=0`.
- Observed `{"event":"web.listening","host":"127.0.0.1","port":52052}` while no Worker was running.
- `GET /health/live`: HTTP 200, `{"status":"ok","role":"web"}`.
- `GET /health/ready`: HTTP 200, `{"status":"ready","role":"web"}`. Phase 1 has no PostgreSQL dependency.
- Delivered `SIGTERM`; observed `{"event":"web.stopped","role":"web"}` and exit code 0.
- Negative: `NEWS_SCRAPER_WEB_PORT=not-a-port-closeout` emitted only the bounded `web.start_failed` event, never listened, did not expose the synthetic value or environment, and exited 1.

### Worker

- Startup: `node src/app/worker/main.ts` with `NODE_ENV=test` and Web host/port variables absent, while no Web process was running.
- Observed `{"event":"worker.ready","role":"worker"}` and confirmed the process remained running after 300 ms. No Worker HTTP server was created or required.
- Delivered `SIGTERM`; observed `{"event":"worker.stopped","role":"worker"}` and exit code 0.
- Negative: `NODE_ENV=unsupported-closeout-value` emitted only the bounded `worker.start_failed` event, never became ready, did not expose the synthetic value or environment, and exited 1.

These observations establish process isolation: Web served health without Worker, and Worker became ready without Web or Web-only configuration.

## Evidence levels and exit gates

Established evidence:

- Level 1: formatting, lint, type/static, committed-range whitespace, version/lock synchronization, and topic-independence source scan.
- Level 2: automated configuration and runtime unit coverage.
- Level 3: Web HTTP/component/process and Worker process integration/runtime behavior, including physical lifecycle and negative cases.

Not established or claimed in Phase 1: Level 4 PostgreSQL/concurrency persistence, Level 5 collection fixtures, Level 6 browser, Level 7 approved live Source, or Level 8 reference deployment evidence.

Phase 1 exit-gate mapping:

- `package.json` is authoritatively `0.1.4`; lockfile top-level and root package metadata are synchronized.
- Web/API and Worker each start independently, remain available as appropriate, and shut down cleanly.
- Web liveness/readiness reflects only Phase 1 dependencies; Worker readiness requires neither Web nor a Worker HTTP server.
- Malformed Web and common Worker configuration fail predictably, safely, and nonzero before readiness.
- Install, format, lint, type, full/unit/integration tests, aggregate check, committed-range diff, and physical runtime checks passed on the exact validated tree.
- A deliberately empty required test selection failed clearly and nonzero.
- A case-insensitive scan for `indie`, `author`, `publishing-industry`, `publisher-specific`, and `publication-specific` found no matches in `src/`; shared runtime/engine source contains no initial-Publication topic condition or data.
- This artifact records source identity, commands, environment, evidence levels, results, and limitations without advancing the roadmap to Phase 2.
