# Correction 7 PHP integration download validation

## Candidate identity

- Correction: `c7-php-dl`, P1 through independent P3 closeout.
- Pre-closeout candidate: `d4e53e2837df396472bf91391f391870c17b14e0` on `main`, with P1 `8770213` immediately followed by P2 `d4e53e2` and no intervening commit.
- P3 evidence applies to the final worktree containing this record and the focused test-only hardening described below. The final P3 commit identity is not available from inside its own committed record.
- Top-level package version remained `1.7.0`; this correction consumed no Phase 7 patch number.

## Reviewed boundary

The review covered the complete committed `b2bbceb..d4e53e2` P1/P2 range, the P1 and P2 prompts and reports, the package producer and independent ZIP test parser, every allowlisted PHP/config/README input, the protected download registrar and Web composition, admin security middleware, Credentials HTML/CSS/JavaScript, focused HTTP/browser tests, and existing credential and PHP consumers implicated by those boundaries. Git status, history, repository archive/lockfile patterns, and package metadata were also inspected.

The implemented ownership chain is:

```text
deployed repository root
  -> top-level news-scraper package version
  -> explicit PHP customer manifest + generated VERSION/metadata
  -> bounded Node-core ZIP producer result
  -> protected /admin/api/php-integration/download route
  -> native page-level Credentials download link
```

The producer remains the sole manifest, version, filename, metadata, bounds, CRC, and ZIP authority. The HTTP route consumes only `{ filename, contentType, version, bytes }`; the UI uses a fixed same-origin link and does not enter credential JavaScript state.

## Three-pass findings and disposition

### Contract and evidence

- The archive uses an explicit 15-source-file allowlist plus generated `VERSION` and `integration-package.json`. It does not recursively package `integrations/php`.
- Version parsing is bounded semantic-version parsing from the same root `package.json` that anchors the allowlisted source files. The exact version reaches generated metadata and `news-scraper-php-integration-<version>.zip`.
- Every path component is checked without following symbolic links; only ordinary files are read. Per-entry, aggregate-entry, archive, metadata, filename, ZIP32 offset/size, and entry-count bounds are explicit.
- The stored ZIP is deterministic, relative, slash-separated, UTF-8 flagged, CRC-protected, and built with Node core only. No npm archive dependency or external executable was introduced.
- Sync and local-read templates match the supported defaults. The visitor template has no base URL or bearer-token field.
- The route is mounted only within the existing admin-enabled `/admin/api` router, inherits no-store/security headers, rejects query selectors, returns exact binary headers/body, and maps only package-domain failures to a redacted `503` response. Other errors retain the existing bounded admin error handling.
- The page-level action exists with zero credentials and is independent of create/list/rotate/revoke and transient plaintext-token state. Existing `credentials.js` was unchanged.
- Evidence is substantive but local: unit tests independently parse central/local ZIP records and verify CRC/content; HTTP tests exercise binary response, security headers, disabled-admin behavior, query rejection, and redacted failure; browser tests observe filename/body, zero-credential availability, mobile width, and token-independent URL/storage.

Disposition: no contract defect or ownership duplication found.

### Error and edge cases

Reviewed malformed/missing metadata; hostile semantic versions and header injection; missing, renamed, directory, and symlinked manifest entries; Windows/Linux path normalization; absolute/traversal ZIP paths; empty and oversized inputs; aggregate/archive growth; ZIP CRC, offsets, central-directory bounds, and ZIP32 assumptions; partial reads; repeated and simultaneous stateless builds; package failure isolation; Web startup behavior; disabled administration; machine-bearer versus administrator authority; error redaction; transient credential-token state; zero/revoked/rotated credential independence; mobile wrapping; and accidental tests, state, secrets, logs, backups, lockfiles, dependencies, or generated archives.

The producer allocates fresh local entries and buffers for every build and has no mutable cache. Producer construction performs no filesystem build, so an unavailable package does not prevent Web startup. A changed allowlisted file fails closed when missing/non-ordinary/oversized; ordinary deployment mutation during one build is not claimed as an atomic deployment-snapshot guarantee and deployment coordination remains outside this correction.

P3 added direct negative coverage for a CRLF/header-injection version string and for the final archive-byte limit independently of the entry and aggregate limits. No production-code repair was required.

Disposition: all plausible in-scope failures are protected by source invariants and executed focused evidence; no unresolved security, archive, or credential-secrecy defect was found. The final PHP-dependent regression evidence remains blocked as recorded below.

### Code quality and structure

The producer is isolated under `src/integrations`, with no credential, Profile, database, API-read-model, or PHP synchronization dependency. ZIP/version/manifest behavior does not leak into Express or UI modules. The dedicated 44-line route registrar is a thin consumer; the native link avoids unnecessary credential JavaScript. No general artifact framework, installer, updater, registry, shared mutable cache, production dependency, external process, or test helper entered production source.

Disposition: no meaningful behavior-preserving refactor is required. No Terra High remediation handoff occurred; this is the original final closeout run.

## Bounded P3 changes

- Strengthened `test/unit/php-integration-package.test.ts` with hostile-version/header-injection rejection and independent archive-ceiling rejection.
- Added this durable validation record.
- No production behavior, dependency, schema, roadmap state, PHP/distribution semantics, or package version changed.

## Executed evidence

- Focused unit/component/browser command: `node scripts/run-tests.mjs --test-concurrency=1 test/unit/php-integration-package.test.ts test/integration/distribution-credential-administration-http.test.ts test/browser/distribution-credential-admin-page.test.ts` — PASS, 16/16, after the additional negative assertions.
- `npm run check` — NOT PASS: formatting, lint, typecheck, and all 524 Node tests passed; the required PHP suite then failed closed because the PHP CLI executable was unavailable.
- `npm run test:security` — PASS, 11/11.
- `npm run test:browser` — NOT PASS, 45/53; all non-PHP browser tests, including the three credential/download cases, passed, while all eight PHP customer-example cases failed because the PHP CLI/server prerequisite was unavailable.
- `npm run codex:phase:validate -- c7-php-dl` — PASS; the correction grammar, unchanged `1.7.0` version, and manual P3 closeout classification were valid.
- `git diff --check b2bbceb..HEAD` and the P3 worktree `git diff --check` — PASS; a final complete-range worktree check is recorded below.

Evidence levels are static review, unit, component/HTTP integration, and local Playwright browser behavior. No database, live-Source, recovery, managed reference-deployment, or customer-host proof is claimed by this correction closeout.

## Final matrix results

The static, focused, security, and non-PHP browser evidence is green. The required matrix as a whole is **NOT GREEN** because this environment has no runnable PHP CLI/server. Repository policy forbids treating absent prerequisites as a skip or inferring PHP runtime/browser behavior from source inspection. The final P3 tree therefore cannot satisfy the correction GREEN gate in this run.

## Limitations and blockers

The closeout does not claim a real managed/reference-host or customer-host download/install exercise. Existing tracked historical ZIP documentation artifacts and the ignored local `.env`/documentation snapshot were inspected as repository state; none is an input to the explicit PHP package manifest and none was introduced by this correction.

Blocker: install or otherwise provide a runnable PHP CLI on `PATH`, then rerun P3 from the final validation matrix (at minimum `npm run check` and `npm run test:browser`) on the unchanged candidate. Until both commands pass, this correction remains NOT GREEN and HUMAN REVIEW REQUIRED.
