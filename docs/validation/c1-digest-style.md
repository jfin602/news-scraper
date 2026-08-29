# Digest style correction validation

## Result and identity

- Status: **Correction GREEN — HUMAN REVIEW REQUIRED**.
- Correction: `c1-digest-style`.
- Package version: `2.2.0` (unchanged); no Phase 2 patch number was consumed.
- P1 implementation: `f7a665d` (`c1-digest-style/P1: Digest style generation foundation`).
- P2 implementation and specialized-test candidate: `1430a3de2c75ef8ead9640faba8417a977c9f48b` (`c1-digest-style/P2: Digest style admin client`).
- Final accepted executable/documentation candidate: `1deb9b100ce38f3b0962db43e184c71a4a1e0ef1` (`docs: format README for digest style closeout`).
- The first closeout review found no behavioral or structural defect and required no bounded product repair or Terra High refactor handoff. It was blocked only because committed `README.md` lacked the final newline required by the current Prettier configuration.
- The owner-authorized one-off repair added only that final newline. It made no wording or semantic documentation change and changed no executable source, migration, test, integration, script, dependency, or package metadata.
- This artifact is the only post-candidate closeout write and remains subject to human acceptance.

## Purpose and accepted semantics

The correction adds optional Profile-level `digestStyleGuidance` as bounded, protected server-side AI configuration. One canonical normalizer produces `string | null`, trims surrounding whitespace, maps blank input to `null`, applies Unicode normalization, and enforces a maximum of 500 Unicode code points. Additive migration `0020_profile_digest_style_guidance.sql` stores the nullable value on `distribution_profile_ai_settings`, preserves existing Profile/settings/digest/customer-governed state, defaults existing and new rows to `NULL`, and enforces nonblank and maximum-length database constraints.

Default/null guidance preserves the exact historical `v1` digest-input representation and identity. Non-null canonical guidance participates deterministically in `digestInputIdentity`; real style changes therefore use the existing settings-change regeneration and post-provider revalidation paths without a style-specific scheduler, claim, transaction, or lifecycle state machine. In-flight output for superseded settings cannot activate.

The fixed application-owned Gemini system instruction remains authoritative. Optional guidance is clearly separated as subordinate untrusted request input, embedded URL-looking text is neutralized, and exact governed Article `originalUrl` values remain the only raw URL Context allowlist. Model, tools, Search-disabled state, schema, storage, thinking, timeout, one-request behavior, output validation, and support-reference rules remain unchanged.

The existing protected Profile AI administration route reads and saves the nullable field. Omitted legacy payloads preserve stored guidance; explicit blank/null clears it; canonical no-op saves avoid duplicate audit; saving does not synchronously invoke Gemini. The bundled administrator client exposes an accessible **Digest writing style** textarea, renders server-canonical state, keeps Save separate from Generate now, retains mutation integrity, and prevents delayed Profile responses from painting another Profile. Raw guidance does not enter permanent v1, PHP/LKG/local-read, public/reference feed, customer cache, generation/attempt output, or provider diagnostics.

## Three-pass closeout review

### Pass 1 — contract and evidence

Protected. The reviewed implementation preserves package `2.2.0`, topic independence, additive supported-production migration history, canonical Unicode/null behavior, default identity compatibility, generic lifecycle revalidation, fixed provider/tool/URL authority, protected administration, and outward non-leakage. No Phase 2 PHP work, dependency, public endpoint, topic-specific engine behavior, customer deployment, or package transition was introduced.

### Pass 2 — adversarial hypotheses

Protected. Source and tests dispositioned the required cases: 500 astral code points are accepted and 501 rejected by the application/database boundaries; blank input cannot create phantom identity; omitted payloads do not clear style; injection and URL-looking guidance remain subordinate data; style persists in identity while null retains the legacy hash; clearing restores default identity; in-flight superseded generations cannot activate; disabled/no-input saves do not call Gemini; stale Profile responses cannot cross-paint; bounded errors and audit/provider diagnostics do not expose secrets or raw prompt authority; raw style does not leak outward; and supported production-forward preservation is exercised rather than inferred from clean migration alone.

### Pass 3 — structure and maintainability

Protected. One server normalizer owns canonical validation, the repository owns complete settings persistence, identity uses a small compatible optional-field extension, the existing lifecycle owns change/revalidation behavior, provider composition retains fixed authority, and the browser remains a thin protected consumer. No generic prompt framework, duplicated production validation authority, public/PHP leakage, migration churn, dead transitional structure, bounded product repair, or meaningful refactor remains.

## Validation evidence

### Final candidate commands

Executed after the README-only formatting repair on the executable/documentation tree committed as `1deb9b100ce38f3b0962db43e184c71a4a1e0ef1`, before this artifact was written:

- `npm run check` — PASS: Prettier, ESLint, TypeScript, and the portable unit/integration/collection matrix completed; 563 tests passed, 0 failed, 0 skipped.
- `npm run codex:phase:validate -- c1-digest-style` — PASS: canonical P1/P2 implementations plus the sole final P3 closeout parsed at required unchanged version `2.2.0`.
- `git diff --check 1430a3de2c75ef8ead9640faba8417a977c9f48b -- README.md` — PASS.
- Manual normal and word-diff inspection confirmed the README change added only the missing final newline.
- Package/version, generated-file, and range inspection confirmed `2.2.0`, no npm lockfile, and no source, migration, test, integration, package, or script change after the specialized-test candidate.

### Carried-forward specialized evidence

These commands executed and passed on candidate `1430a3de2c75ef8ead9640faba8417a977c9f48b` during the first closeout. They were not rerun after the non-semantic README-only formatting commit:

- `npm run test:db` — PASS: 250/250 tests against real disposable PostgreSQL, including migration from zero, supported production-forward preservation, repository/admin persistence, schema bounds, default-identity behavior, and in-flight style revalidation.
- `npm run test:recovery` — PASS: 1/1 real PostgreSQL backup/restore test.
- `npm run test:browser` — PASS: 47/47 browser tests, including protected style load/save/clear, separate generation, per-Profile isolation, stale-response protection, mutation integrity, bounded errors, secret-control absence, and layout regression coverage.
- Independent portable evidence before repair — PASS: ESLint, TypeScript, and 563/563 portable tests. The same portable matrix subsequently passed through final-candidate `npm run check`.

Carrying this specialized evidence forward is valid because the only intervening change was the non-semantic README final-newline repair; executable source, migrations, tests, integrations, scripts, and package metadata are byte-for-byte unchanged from the specialized-test candidate.

## Deferred and not applicable evidence

- `npm run test:live-gemini` remains **DEFERRED**. This closeout proves deterministic safe request construction, not subjective external-model tone adherence. Phase 2 integrated qualification may execute configured-style live-provider evidence if its release gate requires it.
- PHP CLI, browser-PHP, live Sources, and customer/reference deployment qualification were not run because outward PHP/local-read shape, collection behavior, and customer deployment were unchanged.
- No PHP/customer deployment, Phase 2 implementation, live Gemini request, or package transition occurred.

## Handoff

`c1-digest-style` is GREEN subject to owner review. Owner acceptance clears only this correction at unchanged package `2.2.0`. Normal Phase 2 work may then begin in `p2-2` at `2.2.1`; this artifact does not itself accept the correction or start Phase 2.
