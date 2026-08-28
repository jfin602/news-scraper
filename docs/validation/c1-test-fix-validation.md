# c1-test-fix validation

**Correction:** `c1-test-fix`, Correction 1  
**Disposition:** **GREEN — OWNER ACCEPTED**  
**Package:** `2.0.0`  
**Correction base:** `1b2f891425ebd10d0a4305c00c8826bcfe26d56c`  
**Accepted executable/test correction commit:** `c72d8238ca2179d18eea4491a9113c1fde07e7fb`

## Purpose

This correction removes environment-incompatible PHP execution from the ordinary local validation path without deleting or weakening PHP/PHP-browser coverage.

The accepted topology is:

- `npm test` = portable deterministic Node unit + integration + collection regression;
- `npm run check` = format + lint + typecheck + portable `npm test`;
- `npm run test:php` = separate fail-closed PHP CLI/runtime suite;
- `npm run test:browser` = ordinary non-PHP browser suite;
- `npm run test:browser:php` = separate PHP-backed customer/server browser suite.

No product behavior, database behavior, roadmap capability, or package version changed.

## Evidence reuse and tree identity

The implementation runner recorded the following successful evidence against commit `c72d8238ca2179d18eea4491a9113c1fde07e7fb`:

- focused command-contract regression — **PASS, 2/2**;
- `npm run check` — **PASS, 530 Node tests**, with no PHP invocation;
- `npm run test:browser` — **PASS, 45 tests across 7 suites**;
- `npm run codex:phase:validate -- c1-test-fix` — **PASS**;
- `git diff --check` — **PASS**.

These commands were **not rerun during this documentation closeout**. The testing contract is coverage-set based, and repeating unchanged successful evidence does not strengthen the claim.

Repository comparison from accepted P1 commit `c72d8238ca2179d18eea4491a9113c1fde07e7fb` to closeout-policy head `1b59061187f30e08cd3c4acd9690278247ed6c82` showed only four documentation/task-policy files changed:

- `docs/contracts/testing-and-validation-contract.md`;
- `docs/roadmap/3.0-changelog.md`;
- `docs/tasks/c1-test-fix/P2-test-validation-topology-closeout.txt`;
- `known-issues.md`.

No executable source, package script, or test implementation changed after the P1 evidence, so the recorded P1 runtime evidence remains applicable to the current executable/test tree.

## Pass 1 — contract and evidence review

Source inspection confirms:

- `package.json` keeps package version `2.0.0`;
- `npm test` selects `test/unit/**/*.test.ts`, `test/integration/**/*.test.ts`, and `test/collection/**/*.test.ts` only and contains no PHP invocation;
- `npm run check` composes `format:check`, `lint`, `typecheck`, and portable `npm test` only;
- `test:php` still invokes `scripts/run-php-tests.mjs`;
- `test:browser` selects `test/browser/**/*.test.ts`;
- `test:browser:php` separately selects `test/browser-php/**/*.test.ts`;
- the ordinary browser directory contains the seven non-PHP browser test files exercised by the recorded 45-test P1 browser pass;
- `test/unit/test-command-contract.test.ts` directly protects portable aggregate containment and verifies ordinary/PHP browser selections are nonempty and disjoint;
- `scripts/run-php-tests.mjs` still probes the PHP CLI, exits nonzero when PHP cannot start, syntax-checks PHP files, and executes `integrations/php/tests/run.php` when the prerequisite exists;
- the PHP customer browser test remains substantive and uses a real PHP server plus Playwright. Its blob content is unchanged from its pre-correction browser location; the correction changed ownership/path rather than behavior.

Result: **PASS** for the correction's current local gate.

## Pass 2 — adversarial review

The correction was challenged for the primary regression risks:

- PHP leaking back into `npm test` or `npm run check` — protected by current scripts plus the focused command-contract test;
- accidental deletion/empty selection of PHP browser evidence — protected by the separate nonempty `test:browser:php` selection and focused ownership assertions;
- ordinary browser coverage loss — current ordinary browser directory retains seven non-PHP suites and P1 recorded 45 passing browser tests;
- fail-open PHP prerequisite handling — not present; `scripts/run-php-tests.mjs` remains fail-closed;
- hidden retry/environment-sniffing machinery — not introduced by P1;
- unnecessary shared-runner exclusion behavior — not introduced; `scripts/run-tests.mjs` was left unchanged;
- package/version/product scope drift — not present.

No unresolved correction defect was found.

Result: **PASS**.

## Pass 3 — code quality and structure

The resulting topology is intentionally simple:

- one portable ordinary aggregate;
- explicit specialized PHP and PHP-browser commands;
- one structural test-directory split;
- one focused command-contract regression;
- no new remote-execution framework;
- no negative-glob/exclusion language;
- no broad always-run `check:vps`/`check:all` aggregate;
- no automatic prerequisite retry or pass-on-missing behavior.

No Terra High structural-remediation handoff is required.

Result: **PASS**.

## Deferred qualification evidence

Under the current Qualification-gate policy, the following remain intentionally deferred:

- `npm run test:php` — `VPS-REQUIRED`;
- `npm run test:browser:php` — `VPS-REQUIRED`.

They are **not** required for this ordinary correction closeout and were not run or claimed as passing here. Their default owning gate is the later explicitly designated **full-system/project release qualification** for the final integrated release candidate. At that gate, applicable local and VPS evidence must apply to the exact integrated candidate being accepted.

## Closeout

`c1-test-fix` is **GREEN** for its governed correction scope. The ordinary Windows validation path is portable, PHP/PHP-browser evidence remains separately addressable and fail-closed, repeated invalid-environment retries are no longer structurally forced by the ordinary aggregates, and final VPS proof remains preserved for release qualification rather than per-prompt execution.

The repository owner explicitly accepted this correction as GREEN and requested creation of this durable closeout artifact on 2026-08-28.

This artifact records observed/reused evidence and source inspection. It does not claim deferred VPS runtime evidence occurred, does not activate the 3.0 roadmap, and does not change package version.