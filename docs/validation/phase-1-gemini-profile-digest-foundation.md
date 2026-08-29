# Phase 1 Gemini Profile Digest Foundation Validation

**Status:** BLOCKED / LIVE GEMINI EVIDENCE REQUIRED  
**Review date:** 2026-08-28  
**Package candidate:** `2.1.7`  
**Human review:** Required

## Exact source identity

- Pre-P1 `2.1.0` base: `d4c05c3bf513fb9191f12430cf9bd4fab6a0320d`.
- P1 / `2.1.1`: `069013b49912a74ac4eb84858ca0627ec644384e`.
- P2 / `2.1.2`: `4ffe68108feacf0f93dc94b0816a39061b48e3fe`.
- Accepted lifecycle producer correction implementation: `d9b56b65debfce886d5b31395e2f58d9f96f90e5`.
- Accepted lifecycle producer correction closeout: `3132ac6c24e9783ea3f10e93df8dfd051b4bc303`.
- P3 / `2.1.3`: `aa8aabf31dea213e7efbdbd55854901195910ecd`.
- P4 / `2.1.4`: `278486e05ddd7d54890dca3d4e8502cb505001d7`.
- P5 / `2.1.5`: `af250e2fd84ff4dc6fbca6ec0f89b320a15c1f0b`.
- P6 / `2.1.6` and final committed source inspected before closeout-only edits: `c376681a9cf38a1c1c88f77c34fd8efb2fda3f58`.
- The closeout changes are intentionally uncommitted because the phase runner owns the implementation commit boundary. The final commit SHA is therefore pending runner commit; this artifact and the top-level package-version change are the complete closeout working-tree delta from `c376681a9cf38a1c1c88f77c34fd8efb2fda3f58`.

Git history proved the runner-recognizable P1-P6 prefix and versions `2.1.1` through `2.1.6`. The lifecycle handoff correction between P2 and P3 is the planned accepted producer correction, not unexpected feature work. No unrelated implementation commit was found in the prefix.

## Environment and evidence levels

- Windows 11 Home 64-bit, build `22631`.
- Node.js `v24.11.1`; npm `11.6.2`; PostgreSQL client `18.3`.
- A dedicated PostgreSQL administrative test prerequisite was present through local ignored configuration; no connection string or credential was recorded.
- No `NEWS_SCRAPER_GEMINI_API_KEY` or `NEWS_SCRAPER_GEMINI_TEST_URL` was available. No live Gemini request was executed.
- Local deterministic evidence covers Levels 1-5 and repository browser evidence. PHP CLI/VPS/customer runtime and live provider evidence remain separately classified below.

## Integrated contract review

### P1 — persistence and canonical input

Additive migrations `0018_profile_ai_digest_foundation.sql` and `0019_digest_lifecycle_handoff.sql` leave `0001`-`0017` intact. Migration-from-zero, supported production-forward upgrade, defaults, relationships, cross-Profile constraints, immutable successful-generation update protection, separate active pointers, attempts, scheduled-slot uniqueness, and one-running-attempt-per-Profile constraints have real PostgreSQL coverage. Input is derived from the canonical Profile snapshot, applies lookback then bounded prefix in canonical order, consumes normalized Article summaries without another truncator, and hashes a versioned Profile/settings/ordered-ID identity distinct from outward revision.

### P2 — provider boundary

The official `@google/genai` Interactions path uses default `gemini-3.7-flash`, `store=false`, low thinking, the current polymorphic structured `response_format`, and only the URL Context tool. The prompt treats metadata/page content as untrusted and forbids URL expansion. Application validation bounds JSON depth/size/prose/highlights/supports, accepts only input Article IDs, discards provider destinations, classifies failures boundedly, and performs no automatic retry. Ordinary startup does not parse or require a Gemini key. Current Google primary documentation was inspected for the Interactions request, May 2026 response-format change, URL Context result shape, and `gemini-3.7-flash` thinking levels; this is source/documentation verification, not live evidence.

### P3 — lifecycle, scheduling, and failure isolation

Scheduling owns deterministic `00:00Z` and `12:00Z` slots independently of Source jobs. PostgreSQL advisory locking plus unique constraints coordinate multi-Worker scheduled/manual claims, stale recovery is bounded, and provider I/O occurs outside transactions. The lifecycle covers disabled/zero-input suppression, unchanged skip, bounded-input/settings regeneration, manual force through the same path, pre-provider canonical invalidation, post-provider state revalidation, atomic persist/activate/attempt completion, safe failure retention, and `current | older | null` materialization. Profile failures are isolated from Worker endpoint loops and other Profiles.

### P4 — v1 complete snapshot

The canonical Article-only snapshot remains upstream. A read-only repeatable-read representation composes normalized active digest state, and the digest participates in the shared snapshot revision, ETag, every continuation page, and ordinary `snapshot_changed` behavior. Optional malformed digest state becomes `null` without breaking valid Articles. Only bounded rendering fields and application-resolved stored `originalUrl` support destinations are serialized. V1 reads neither invoke nor enqueue Gemini work and retain `distribution:read` as read-only machine authority.

### P5 — PHP LKG and local read

Portable implementation and deterministic tests show optional digest validation fails open independently of strict required Profile/Publication/Article validation; inconsistent continuation-page digest state becomes `null`; digest/null activates inside the same Profile generation; pre-digest state rehydrates with `null`; and a newer null digest cannot retain an older digest. `LocalProfileReader` exposes only normalized digest rendering fields while `staleAgeSeconds` remains local LKG age. Visitor reads stay local and require no Gemini key. This is not a claim of executed PHP CLI, VPS, browser-PHP, or production customer behavior.

### P6 — protected administration

The protected Profile AI surface exposes enablement, 1-30 day lookback, 1-20 Article maximum, twice-daily cadence, active status, bounded latest attempt, and Generate now. It has no secret/model/prompt/URL inputs. Configuration is validated and audited without calling the provider; disabling normalizes outward state to null without deleting history. Generate now uses the P3 manual-force path. Existing admin/request-integrity protections remain authoritative, machine credentials cannot invoke admin routes, failures are bounded, and browser tests protect against cross-Profile stale-response painting.

### Preserved laws and topic independence

The complete Phase 1 diff and important producers/consumers were searched for customer- and topic-specific branching. No publishing, indie-author, opportunity, filmmaking, or customer-specific AI behavior was found. Canonical trust, normalization, Source-scoped identity/provenance, moderation, duplicate authority, stored publisher destinations, singleton Publication/multi-Profile boundaries, machine/admin separation, and ordinary non-AI `/`, `/api/feed`, v1, collection Worker, and PHP Article behavior remain preserved.

## Adversarial review dispositions

- **Protected:** Profile default backfill; cross-Profile active/support references; generation-row mutation; scheduled-slot and running-claim uniqueness; manual/scheduled collision; stale-running recovery; canonical cutoff/order/result-limit/filter reuse; N6WD summary reuse; prompt injection and URL expansion; out-of-input/duplicate support IDs; fake URLs/HTML/oversized/deep JSON; bounded provider errors and attempt metadata; simultaneous Workers; crash-before/during/after provider handling; config/disable/canonical changes during generation; top-20 entry and natural age-out behavior; overlap/canonical invalidation; immutable generation time; digest pagination/ETag/fail-open/internal-field exclusion; PHP continuation/null/pre-digest behavior; local-only visitor reads; Profile-switch stale response; Generate-now collision; machine-token separation; missing-key startup; arbitrary admin fields; and disabled public digest suppression.
- **Bounded repair required:** none found.
- **Terra refactor handoff required:** none. The accepted lifecycle producer correction already established the shared claim/completion/activation seams before P3-P6. No later meaningful responsibility-moving duplication was found.
- **Replanning/contract change required:** none found.
- **Residual uncertainty:** an uncertain provider-side outcome can be billed before the application knows whether it completed; the design intentionally performs no hidden automatic retry and relies on bounded stale recovery. Exactly-once external billing is not claimed.

## Structural review

Canonical Profile selection remains owned by the existing snapshot producer; `current | older | null` is owned by the digest lifecycle; SDK/request knowledge remains in `provider.ts`; v1/admin/PHP consume normalized boundaries rather than raw AI tables; representation composition is acyclic; endpoint jobs were not repurposed; provider I/O is outside database transactions; and no speculative generic AI/plugin framework, topic branch, test-only production API, accidental lockfile, or Phase 2 renderer/package work was introduced. No behavior-preserving multi-file refactor is required before Phase 2. No earlier closeout run was interrupted by a Terra High handoff.

## Validation manifest and observed results

The final-tree local matrix below was executed after the closeout version/artifact edits were applied. Aggregate commands were used without redundant subordinate reruns. An initial `npm run check` executed concurrently with the database and browser suites had one transient `missing_file` result in the PHP package fixture. Source/fixture inspection found every manifest source present; the exact failing file passed 7/7 in an isolated diagnostic run, and the complete aggregate was then rerun without competing matrix filesystem load and passed 558/558. No product or test change was made to obtain that result.

- `npm run check` — PASS: formatting, lint, typecheck, and 558 aggregate tests; 558 passed, 0 failed, 0 skipped.
- `npm run test:db` — PASS with disposable real PostgreSQL: 248 passed, 0 failed, 0 skipped.
- `npm run test:recovery` — PASS with real PostgreSQL backup/restore: 1 passed, 0 failed, 0 skipped.
- `npm run test:security` — PASS: 11 passed, 0 failed, 0 skipped.
- `npm run test:browser` — PASS: 47 passed, 0 failed, 0 skipped.
- `npm run codex:phase:validate -- p2-1` — RUN; post-2.0 Phase 1 grammar valid and P7 recognized as manual closeout targeting `2.1.7`.
- `git diff --check d4c05c3bf513fb9191f12430cf9bd4fab6a0320d...HEAD` plus `git diff --check` for the uncommitted closeout delta — PASS.
- `npm run test:live-gemini` — FAIL-CLOSED PREREQUISITE BLOCK: the suite selected one test and failed because the required non-production key and governed test URL were absent. No provider request, result, URL retrieval fact, integrated persistence/activation, admin reflection, or v1 live digest was observed.

## Mandatory live Gemini blocker

Phase 1 cannot claim provider integration and cannot be GREEN until a real request is executed on the exact accepted candidate through the production provider and integrated lifecycle/admin/v1 path. The required proof must record, without secrets, the exact tested commit, `gemini-3.7-flash`, Interactions, `store=false`, low thinking, structured output, an application-selected governed `originalUrl` URL Context attempt when available, production-validator success, immutable persistence and atomic activation, bounded successful attempt state, protected admin status, digest-participating v1 revision/support destinations, and log/evidence redaction. The present environment supplied neither required live credential nor URL, so no part of that proof is inferred from mocks or source inspection.

## Explicit Phase 2 deferrals

- `npm run test:php` — DEFER, VPS-REQUIRED Phase 2 exact integrated package candidate.
- `npm run test:browser:php` — DEFER, VPS-REQUIRED Phase 2.
- Whole-folder `ns-integration` upgrade/rollback/preflight/version/config/renderer/customer-presentation proof — DEFER, VPS-REQUIRED/REFERENCE Phase 2.
- Actual production customer Gemini-capable package installation — DEFER, REFERENCE Phase 2.

No production customer package/deployment claim is made.

## N/A at this gate

- Live Source collection proof.
- Public reference `/` browser behavior unrelated to the shared admin shell.
- Chatbot authorization/rate/cost controls.
- Multi-feed production rollout.

## Closeout disposition

**BLOCKED / LIVE GEMINI EVIDENCE REQUIRED.** Local implementation review found P1-P6 contract boundaries intact with no bounded repair or structural handoff. Conversational `/closeout` must not transition `package.json` to `2.2.0` until the exact-candidate live Gemini and integrated application evidence is executed, added here, and human-approved.
