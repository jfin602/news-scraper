# c1-n6wd validation

**Correction:** `c1-n6wd`, Correction 1  
**Disposition:** **GREEN — OWNER ACCEPTED**  
**Package:** `2.0.0` at correction closeout  
**Correction base:** `8cdedd4a10c00058aa075a14cbb0f32afa58b9bf`  
**Implementation commit:** `aa69e3238919d23896a42429bbfcd3ef8ec054a2`  
**Closeout/test-strengthening commit:** `606322fd40d72945518580a1d07ff6d4882dc745`

## Purpose

This correction resolves N6WD by bounding normalized persisted `Article.summary` values to 4,000 Unicode code points while preserving the larger Raw RSS/Atom input safety limit and the existing collection/admission/normalization ordering.

Oversized normalized summaries reserve three characters for literal `...`, preserve the longest fitting complete-word prefix when possible, and fall back to the first 3,997 code points plus `...` when no usable whitespace boundary exists. The correction also adds an additive production migration that transforms already-supported persisted summaries before tightening the database constraint.

No Gemini behavior, roadmap activation, Source-specific policy, duplicate/provenance semantics, or package version change is part of this correction.

## Evidence history and recovery of the prior blocked closeout

The original P2 closeout at commit `606322fd40d72945518580a1d07ff6d4882dc745` completed its substantive review and validation but reported RED/BLOCKED solely because the then-current `npm run check` aggregate invoked PHP and the local Windows environment did not provide PHP CLI.

That closeout recorded:

- `npm install` — **PASS**, 216 packages, zero vulnerabilities;
- focused PostgreSQL matrix — **PASS, 20/20**;
- `npm run check` — formatting, lint, typecheck, and **528/528 Node tests PASS**, followed only by the unavailable PHP prerequisite;
- `npm run test:db` — **PASS, 241/241**, zero skipped;
- `npm run test:recovery` — **PASS, 1/1**;
- `npm run codex:phase:validate -- c1-n6wd` — **PASS**;
- committed-range and working-tree `git diff --check` — **PASS**.

The P2 closeout also strengthened `test/database/distribution-profile-production-upgrade.test.ts` so migration expectations no longer depended circularly on the runtime normalizer and independently proved the exact 3,997-character complete-word boundary.

Correction `c1-test-fix` later removed PHP from the ordinary portable aggregate. Its P1 commit `c72d8238ca2179d18eea4491a9113c1fde07e7fb` recorded `npm run check` **PASS with 530 Node tests and no PHP invocation** on a descendant tree containing the N6WD implementation.

Repository comparison from N6WD closeout commit `606322fd40d72945518580a1d07ff6d4882dc745` through the accepted `c1-test-fix` documentation state showed no changes to N6WD production code, migration `0017`, normalization/persistence code, or N6WD database/recovery tests. The only executable/test changes were the later portable-validation topology split (`package.json`, PHP-browser file ownership move, and the new command-contract unit test).

Therefore the prior N6WD PostgreSQL/recovery evidence remains valid for its unchanged governed implementation, while the later portable `npm run check` result closes the only former aggregate-validation blocker without repeating the same expensive matrices.

## Pass 1 — contract and evidence review

The prior closeout inspected the full N6WD implementation and established:

- plain text normalization occurs before the 4,000-character summary bound;
- values through 4,000 Unicode code points are preserved;
- oversized values reserve exactly three characters for `...`;
- a fitting complete 3,997-character prefix is preserved when followed by whitespace;
- a cut word backs up to the latest usable whitespace boundary;
- no-boundary input uses exactly 3,997 code points plus `...`;
- non-BMP characters are not split;
- direct oversized persistence candidates are rejected rather than silently truncated a second time;
- Raw RSS/Atom content retains its separate 131,072-character input bound and Source admission remains before Article normalization;
- `0017_article_summary_bound.sql` transforms only oversized non-null summaries before replacing the existing `articles_summary_shape_check` with the 4,000-character maximum;
- the migration does not rewrite `updated_at`, Article identity, URLs, provenance, Categories, moderation, duplicates, jobs, Profiles, or credentials.

The real supported-production upgrade fixture began from repository migrations `0001`–`0014`, seeded representative governed state, then applied real additive `0015`, `0016`, and `0017`. It preserved Article/Source IDs, URLs, timestamps including `updated_at`, observation provenance, Category/override state, duplicate/Primary state, audit/job state, Profile state, and credential state while transforming only the intended oversized summaries.

Result: **PASS**.

## Pass 2 — adversarial review

The prior closeout explicitly challenged boundary, Unicode, runtime/PostgreSQL parity, migration ordering, production-data preservation, idempotency, and scope-drift risks. The bounded test strengthening removed the one review concern: migration expectations are now independent of the runtime normalizer instead of reproducing the same implementation authority in both paths.

Observed/protected cases include:

- 3,999 and 4,000-character non-truncated boundaries;
- word-boundary truncation;
- exact 3,997-character fitting prefix handling;
- no-whitespace fallback;
- non-BMP/emoji character handling;
- migration of unchanged, word-boundary, and no-boundary existing summaries;
- preservation of governed Article relationships and timestamps through the supported forward-upgrade path;
- unchanged migrations `0001`–`0016`.

No unresolved correctness or data-integrity defect remains.

Result: **PASS**.

## Pass 3 — code quality and structure

The correction keeps ownership narrow:

- no duplicate TypeScript production truncation framework;
- no migration-history rewrite;
- no permanent SQL helper or compatibility layer;
- no Source/topic-specific exception;
- no Gemini coupling;
- no broad refactor outside the Article summary invariant;
- no package-version or roadmap transition.

The closeout found no meaningful behavior-preserving structural refactor requiring a Terra High handoff.

Result: **PASS**.

## Validation disposition

Current testing policy assigns PHP runtime and PHP-backed browser proof to the later explicitly designated full-system/project release qualification gate rather than ordinary correction closeouts.

N6WD does not change PHP integration behavior or PHP-backed browser behavior. Those suites are therefore not part of this correction's current GREEN gate and are not claimed as executed here.

The correction's required evidence is satisfied by:

- prior exact N6WD focused/database/recovery/structural evidence on the unchanged N6WD implementation;
- later portable `npm run check` success on a descendant tree containing the same unchanged N6WD implementation;
- source/history comparison proving no intervening N6WD implementation or governed-test drift.

## Closeout

`c1-n6wd` is **GREEN** for its governed correction scope.

The durable 4,000-character normalized/persisted Article summary invariant is implemented, supported production data is transformed additively through migration `0017`, and focused plus full PostgreSQL/recovery evidence protects the change. The former RED/BLOCKED status was caused only by a validation-topology prerequisite that has since been corrected without changing N6WD behavior.

The repository owner explicitly accepted this correction as GREEN during the consolidated `/closeout` on 2026-08-28. The later roadmap activation to `2.1.0` is a separate version-only transition and does not alter the correction evidence recorded here.

This artifact records existing observed evidence plus repository drift inspection; it does not claim new PHP, live-Source, browser, deployed-customer, or Gemini runtime evidence.