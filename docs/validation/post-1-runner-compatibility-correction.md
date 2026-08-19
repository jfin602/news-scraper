# Post-1 runner compatibility correction validation

## Disposition

**GREEN.** The non-versioned `c21-post-1-runner-compatibility` correction is accepted at source SHA `b2091b4`. It preserves package version `1.0.0`, consumes no Phase 0 prompt/version number, and clears the Pre-Phase-0 runner compatibility gate. Normal Phase 0 `/prompt-ass` -> `/prompt-plan` -> `/prompt-write` may proceed.

This artifact records evidence for this exact source tree and environment. It does not validate or implement Phase 0 product behavior.

## Scope and accepted range

The correction makes retained historical and new post-1.0 task stacks executable through one parser/version authority and adds optional final-prompt invocation without machine acceptance. The folder uses roadmap context `c21-...` because the pre-P1 parser required a positive correction phase; P1 subsequently made canonical `c0-...` correction folders valid.

- Pre-P1 executable baseline: `f4baccc` (`docs: add post-1 runner correction closeout`).
- P1 implementation: `530fcce` (`c21-post-1-runner-compatibility/P1: Post-1 roadmap grammar and version compatibility`).
- P2 implementation and final accepted source SHA: `b2091b4` (`c21-post-1-runner-compatibility/P2: Optional final-prompt automation and terminal handoff`).
- Accepted executable range: `f4baccc...b2091b4`.
- Package version: `1.0.0` before and after correction; no `package-lock.json` or `npm-shrinkwrap.json` exists.
- P3 was launched manually and was not invoked through `--closeout`.

Observed environment:

- Node.js `v24.11.1`.
- npm `11.6.2`.
- Codex CLI `0.147.0`.

## Final machine behavior

Historical roadmap folders remain positive canonical `p<number>` and map to `0.<phase>.<prompt>`. Post-1.0 roadmap folders are exactly `p1-<phase>`, where phase is a canonical non-negative decimal, and map to `1.<phase>.<prompt>`; Phase 0 is `p1-0`, never `p0`. TASK headers remain `TASK: Phase <phase> / P<number> — <title>`, and prompt numbers remain one-based.

Correction folders are `c<phase>-<lower-kebab-slug>` with canonical non-negative phase syntax, including `c0-...`. Their phase is contextual only: every prompt retains the same explicit unchanged semantic version.

`buildPlan()` normalizes roadmap family and major once. `roadmapVersionFor()` is the owning target/resume derivation used both for prompt target validation and `detectCompletedPromptPrefix()` package-version reconstruction. P2 consumes the parsed plan and prompt metadata; it does not reparse task folders or reconstruct a post-1.0 version formula. Exact roadmap/correction commit subjects, duplicate detection, completion-gap rejection, unrelated-newer-commit tolerance after exact-prefix proof, and package/history agreement remain intact.

Without `--closeout`, the runner executes and commits only implementation prompts, records the final prompt as manual, and finishes in `implementation_complete`. With explicit `--closeout`, it first proves/completes the implementation prefix, then invokes the parsed closeout with its own model, reasoning, and text. The closeout never passes through `commitPromptChanges()` and is never classified from prose, committed, or accepted automatically.

Auto-run captures clean pre-closeout state, HEAD, and version; rejects HEAD drift, lockfile creation, incoherent diffs, interruption/process/structured-output failure, and out-of-bound version changes; and permits either a read-only result or uncommitted review changes. Correction versions must remain exact. Roadmap closeout versions may remain at the implementation-complete version or become exactly the parsed closeout target. Successful runner execution records `review_required` and `closeout_executed_review_required`, not `passed` or GREEN.

Dashboard and failure output distinguish waiting, running, review-required, failed, and interrupted closeout states without inflating implementation counts. After a final response is captured, runner diagnostics and display finalization occur first, and the complete response is the final terminal content. A later runner-level safety failure remains nonzero while still ending with that response. The raw `P<number>.final.txt` content remains intact.

## Three-pass review

### Pass 1 — contract and evidence

The P1/P2 implementation matches current BOOT, AGENTS, model-selection, testing, and post-1.0 roadmap requirements. Source inspection traced parser -> normalized plan -> target version -> Git resume -> CLI/run state -> Codex execution -> implementation commit path -> optional final-prompt path -> dashboard/failure/final response. No Phase 0 product prompt has executed, and the working tree was clean before P3 writes.

### Pass 2 — adversarial cases

The focused tests and source boundaries protect the required realistic failures:

- collisions and malformed forms (`p1` versus `p1-0`, `p0`, `p1-00`, `p1-01`, empty/negative/uppercase variants), folder/header mismatch, P0, and wrong target major/minor/patch fail closed;
- historical and post-1 baselines, including Phase 0 with no completion at `1.0.0`, use the same version authority; duplicate subjects, gaps, package/history mismatch, and malformed correction phases fail closed;
- implementation failure or dirty state prevents closeout; already-complete implementation prefixes can launch only closeout;
- read-only and review-change closeouts are allowed, while HEAD drift/self-commit, lockfile creation, whitespace-conflicted output, correction version drift, and unrelated roadmap versions fail;
- nonzero, malformed structured output, and interruption remain runner failures; attempted closeouts are not reported as unexecuted;
- no semantic GREEN/RED/BLOCKED classifier exists, and a subsequent ordinary run remains blocked by unreviewed dirty closeout changes.

No executable defect was found during P3. The final gate-state documentation initially introduced one Markdown trailing-whitespace line; the final `git diff --check` caught it and it was removed before acceptance. No test change was needed.

### Pass 3 — structure and maintainability

The change retains one folder/version parser in the core plan boundary and one roadmap semantic-version helper. The closeout path reuses Codex event/final-response machinery while keeping the stronger implementation commit boundary unchanged. State vocabulary separates execution from acceptance, and focused tests cover observable Git, run-state, display, failure, and terminal-output behavior. No speculative future-major abstraction, compatibility alias, product/dependency change, or meaningful behavior-preserving structural refactor was found.

No Terra High remediation handoff occurred.

## Executed final-tree evidence

All commands ran on the exact accepted `b2091b4` executable tree before this artifact/gate-state documentation was written:

- `npm run check` — GREEN: Prettier, ESLint, TypeScript, and the ordinary unit/integration/collection matrix completed; 464 tests passed, 0 failed, 0 skipped.
- `npm run codex:phase:validate -- c21-post-1-runner-compatibility` — GREEN: P1/P2 implementations and the single final P3 closeout parsed at unchanged version `1.0.0`.
- `git diff --check f4baccc...HEAD` — GREEN for the committed executable correction range.
- Read-only environment/version and lockfile checks — GREEN; versions are recorded above and both npm lockfiles were absent.

These are static/process and controlled test evidence appropriate to tooling-only scope. PostgreSQL, browser, live-Source, recovery, and deployment evidence was not applicable because P1/P2 changed no product, persistence, network, or deployment boundary.

## Remaining limitations

Auto-run proves runner/process/repository safety only. Human review must still interpret and accept the closeout response and any uncommitted changes. Historical evidence remains specific to its recorded SHAs. No unresolved correction finding remains.
