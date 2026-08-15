# Duplicate review read surface correction validation

## Accepted correction tree

- Validated: 2026-08-14 22:23 CDT (America/Chicago), local Windows development environment with the repository's disposable PostgreSQL test setup.
- Package version: `0.17.4` (unchanged).
- Implementation base: `67c86b6961ea4e454a31d4ff022a2b99fdc978b0` (`docs: add c17 duplicate review read surface closeout`).
- P1 implementation commit/tree: `4d523d5b78a0106786d64c29d0177c3d79494351` / `7ad1ab63c783e89dc4d47bee4c5964df9fb7daf5`.
- Final accepted source amendment is the bounded working-tree patch against that P1 tree with binary patch identity `a73d941518c5b526dc833fafbd1103a239615f63`: sequential canonical Article mapping plus strengthened duplicate-administration PostgreSQL coverage. No schema or migration changed.

The correction repairs the original P3-to-P5 producer gap: P3's earlier queue had no continuation or candidate-centric detail boundary, so P5 would have needed to create cursor/domain SQL and topology/manual-authority inference. The accepted surface is now:

`HTTP request parsing -> duplicate administration service -> bounded response/error mapping`

`src/admin/duplicate-administration.ts` owns duplicate-review request normalization, opaque criteria-bound cursor encoding/decoding, queue pagination, and candidate-centric composition. It reuses the canonical moderated-Article repository for effective Article state and group-member summaries.

## Pass 1 — contract and evidence review

- Queue requests accept only optional `state`, `confidence`, `pageSize`, and `cursor`; the default/max page sizes are 50/100. Unknown, malformed, oversized, and criteria-mismatched input produces `invalid_request`.
- The queue orders by `candidate.updated_at DESC, candidate.id DESC`, uses keyset continuation and `pageSize + 1`, and exposes a next cursor only if another row exists. The cursor is bounded base64url JSON, versioned, and bound to normalized state, confidence, and page size criteria.
- Real PostgreSQL coverage proves tied-time multi-page traversal with no repeat or omission in static data, exact-page termination, filter composition, malformed/oversized cursor rejection, and criteria mismatch rejection.
- Candidate detail includes the canonical pair, state/origin/confidence/fingerprint/manual decision metadata, signal order/reason/strength, both canonical moderated Article details, current role/group/Primary state, bounded deterministic group members, member totals/truncation, manual-separation state, and manual-Primary conflict state.
- Detail coverage proves ordered signals, effective title reuse, a 101-member group returning 100 members with truthful truncation, ungrouped/same-group/one-group/two-group contexts, direct and indirect manual separation, and conflicting manual Primaries.
- The manual-separation query expands both candidate components before checking persisted separations. The tested indirect case is a separation between members from the two would-be combined groups; the direct candidate pair is separately covered. Conflicting manual Primaries are reported only for two different groups with different manual Primary IDs.
- The service has no DML, `FOR UPDATE`, audit call, or topology advisory-lock call. The focused test snapshots candidate/topology/separation/Article/audit counts across reads and proves no mutation. Existing P3 real-PostgreSQL tests remain green for grouping, manual split/merge/dismiss, Primary choice, conflict policy, concurrency, and rollback.
- P5 remains unimplemented: no duplicate-review route/registrar exists in `src` or `test`. Its required GET queue/detail routes can validate route/query values, call `searchReviews`/`getReview`, and serialize bounded results. It does not need SQL, cursor design, raw-table inspection, topology inference, or manual-authority policy.

## Pass 2 — adversarial review

The following plausible cases were reviewed against source and meaningful executed evidence:

- Zero, one, exact-page, and page-plus-one queue behavior: bounded source logic; exact-page and page-plus-one are executed. Empty/one-row behavior follows the same `rows.at(-1)` and `hasMore` branch without an unbounded path.
- Tied timestamps, first/middle/final pages, criteria reuse, malformed/truncated/oversized input: protected by the keyset predicate/validated cursor and focused PostgreSQL evidence.
- A candidate changing after an earlier queue read has normal fresh keyset-read semantics rather than a snapshot promise. Its cursor remains bounded and criteria-bound; no read lock, mutation, or new domain policy is required.
- Missing candidate maps only to `duplicate_review_not_found`; missing/impossible persisted Article/group rows remain internal invariant failures rather than false user input/resource results.
- No-group/grouped combinations, direct/indirect separation, automatic/manual Primary authority combinations, and group member limits are covered by the strengthened real PostgreSQL fixture and existing P3 topology tests.
- Hidden/archived Article state and display/category overrides remain inspectable through the canonical Article moderation mapping; existing Article-administration database coverage proves that mapper's effective-state behavior.
- Repeated reads preserve candidate/topology/separation/Article/audit counts. No query calls the mutation helper or topology lock.

No unresolved behavior defect or product/contract ambiguity was found.

## Pass 3 — structural review

The service does not duplicate complete Article SQL/mapping, create a competing read abstraction, expose repository cursor state to P5, use mutation helpers, introduce unbounded reads, or add speculative P6/Phase 18/19 behavior.

One bounded correction defect was found while testing a 100-member detail result: `readModeratedArticles` issued canonical Article mapping work concurrently through one PostgreSQL executor, producing a `pg` deprecation warning. It now maps those rows sequentially. This preserves the same canonical data/result contract, removes the warning, and was rerun through focused Article/duplicate tests plus the final ordinary and database matrices. It was a local read-path repair, not a meaningful structural refactor; no Terra High remediation handoff was needed.

## Executed validation

- `npm run test:db:focused -- test/database/duplicate-administration.test.ts test/database/duplicate-grouping.test.ts test/database/article-administration.test.ts` — PASS: 14 tests, 0 failures.
- `npm run check` — PASS: formatting, lint, typecheck, and ordinary unit/integration/collection matrix; 423 tests, 27 suites, 0 failures/skips, exit 0.
- `npm run test:db` — PASS: 212 tests, 5 suites, 0 failures/skips, exit 0.
- `npm run codex:phase:validate -- c17-duplicate-review-read-surface` — PASS: parser-valid correction stack; P2 is the sole/final manual closeout and package version is `0.17.4`.
- `git diff --check 67c86b6..HEAD` and `git diff --check` — PASS, including the committed correction range and final working-tree amendment.

Evidence levels achieved: source/structural review, real PostgreSQL persistence and pagination validation, and full ordinary/database automated regression matrices. No browser, live-Source, or deployment run was required because this correction adds no Web/UI/collection/network behavior.

## Scope and conclusion

No P5 route, P6 UI, schema/migration, duplicate mutation policy, public-feed behavior, roadmap/version transition, package lockfile, or root phase summary was added or changed. Package version remains `0.17.4`.

**Correction conclusion: GREEN.** The duplicate-review read producer is complete enough for P5 to remain a strict HTTP adapter. The next action is to resume the Phase 17 runner at P5, not conversational `/closeout`.
