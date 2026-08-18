# Phase 20 customer launch validation

## Status

**STAGE 1 GREEN — OPERATOR CUSTOMER-LAUNCH VALIDATION REQUIRED**

Stage 1 certifies a launch candidate for operator-controlled deployment. It does not accept the customer launch or establish the first supported production baseline. Stage 2 evidence must be observed against the exact candidate identified below; no Cloudflare, VPS, production database, authorized browser, operator, or recovery observation is inferred from local evidence.

## Candidate and environments

- Phase 20 closeout base: `8013523b24743694d46efc80f544efeef84ec287` (tree `b2f9a3aacf02f55578e8ac956dbcd6f7f39efbd7`).
- Exact executable candidate: the direct Stage 1 commit containing this provisional artifact. Its SHA and tree are recorded by the immediate evidence-only follow-up after commit; that follow-up does not change executable source, migrations, package, or runtime configuration.
- Package version: `0.20.1`.
- Stage 1 completed: 2026-08-17, America/Chicago.
- Environment: Windows local validation, controlled fixtures, disposable PostgreSQL, local Chromium, and approved public live feeds.
- Node `v24.11.1`; npm `11.6.2`; PostgreSQL client/server `18.3`; Playwright `1.56.1`; Chromium `141.0.7390.37`.

## Schema baseline candidate

Migration-from-zero and the pre-launch `0013` to `0014` upgrade/restore exercise passed. The candidate migration ledger is ordered `0001` through `0014`:

| Migration | SHA-256 |
| --- | --- |
| `0001_initial_schema.sql` | `2b8d18729270a06f8d1aa2c6a0ef5db47754bdc03ee4bf6803e48c39d1422920` |
| `0002_endpoint_runtime_and_run_transport_telemetry.sql` | `2c903a9cfd9dbb7a4497781b0639e54da1150e1eb7e604f73c4c94f742a49012` |
| `0003_endpoint_collection_jobs.sql` | `fa9ae7fe234d75f90d272e2c2de7de79296e466d5d5a7d62d071f9634c5ab1be` |
| `0004_canonical_scheduled_execution.sql` | `41724ff9cc884a0c0f3dd7449a85a0fbb77fcb7b2a6cc52a42692d912f4315e1` |
| `0005_categories_and_relevance.sql` | `b35297e96e3b4e587d8d0d11543dd6fe8d50d2ff04ca09213b8750c72894dd16` |
| `0006_mutable_relevance_rule_history.sql` | `eb5ce3691a1979ee7ce0b77b7e2bd1f728b234d296f63864d6044a05fee80099` |
| `0007_public_feed_discovery_indexes.sql` | `d38bb5edbda42f36aa0774bd5b6ae0707d81f3cd15008e9907ebf670435400c3` |
| `0008_publication_presentation.sql` | `43a83533381bfce7600c83c22aaf86017b7f5ec8c0aa7beae684939979fbe3fa` |
| `0009_source_administration_foundation.sql` | `488a1846e211113b3ecaafa6f7844e70ed579edbc6a8d26f7211557c80c10024` |
| `0010_endpoint_collection_job_trigger_kind.sql` | `1583c4af4379d63aedc89260d0f38d5bb1006d118fa9d47268df8a3db7e02f01` |
| `0011_publication_presentation_timezone.sql` | `5d02b30c67a1ed4457afc593b58214f8ce40d051686483d7fc4372dfd2c3cf15` |
| `0012_duplicate_persistence_foundation.sql` | `8bd5fe18c2e45f68de7c395e4a08f796c6bc3ad1200584c542469049c99f969c` |
| `0013_article_duplicate_moderation.sql` | `4322b27b444bae5de1bcdc954b8b7c71364165819430954b6222cf8093e6c30f` |
| `0014_html_endpoint_profile_and_run_diagnostics.sql` | `6f90bb2bcfb8fe6009849922601fbfe26eae1d9fc28d3e7505f62d2720b8c385` |

This is only the schema candidate until Stage 2 confirms the launched ledger and post-curation recovery point.

## Stage 1 command evidence

All passing selections reported zero skipped, cancelled, or todo tests.

| Command | Result |
| --- | --- |
| `npm install --ignore-scripts` | PASS; 216 packages audited, 0 vulnerabilities, no package lock created |
| `npm run codex:phase:validate -- p20` | PASS; one P1 manual closeout, zero implementation prompts, target `0.20.1` |
| `npm run check` | PASS on final tree; formatting, lint, typecheck, 455/455 deterministic tests |
| `npm run test:db` | PASS; 218/218 real disposable-PostgreSQL tests |
| `npm run test:security` | PASS; 3/3 specialized tests |
| `npm run test:recovery` | PASS; 1/1 native backup/restore test |
| `npm run test:browser` | PASS; 61/61 Chromium tests |
| `npm run test:live-sources` | PASS on final live-test tree; 2/2 tests for the two Sources named below |

The final candidate commit and range `git diff --check` are recorded after the commit is created. No subordinate deterministic suite was rerun separately from `check`.

## Product and authority inspection

Source and test inspection confirmed that protected `/admin` and `/admin/api` surfaces own singleton Publication presentation/public/collection state; Sources, approval/lifecycle/operational state, priority, domains, and RSS admission phrases; endpoints, polling, type/profile/default Category, check-now, health, and recent runs; Categories/Relevance; Article and duplicate moderation; and Operations. Web owns canonical `/` and `/api/feed` reads and performs no Source collection. Worker owns scheduling and collection. Bootstrap JSON is initialization input, not production authority; the accepted production configuration must be the governed database/admin state.

The current live suites prove only:

- Author Media — `author_media/site_rss`, `https://www.authormedia.com/feed/`;
- The Creative Penn — `the_creative_penn/podcast_rss`, `https://www.thecreativepenn.com/feed/podcast/`.

Both were explicitly approved/active/enabled in the disposable bootstrap state. Final Stage 2 launch inventory may differ and must be recorded from the production database. Each live test observed fresh content for both Sources, repeat polling/idempotency with valid conditional `304 not_modified` behavior, persisted run/Article provenance, and exact original publisher links rendered through the public feed. This does not substitute for Stage 2 per-Source feed-quality sampling.

## Pass 2 adversarial review

The review challenged bootstrap/database divergence, approval/domain widening, partial live-suite coverage, stale runs, `304` interpretation, prospective editorial edits, bad-row moderation, duplicate false positives/Primary choice, pending review backlog, timezone dates, stale assets/SHA, Access versus origin paths, Web/Worker split health, pre-curation backup misuse, restore semantics, local-only recovery risk, secret-bearing evidence, executable/evidence commit identity, and premature baseline acceptance.

One classification-3 defect was found: the Phase 5 live test required a second conditional poll to return fresh `200` content and misclassified valid `304 not_modified` as failure. It now requires content on the first poll and truthfully validates either content or a zero-item `304` on the second. One related Windows-only live-test lifecycle defect was repaired by requiring `web.stopped` and disconnecting the test IPC wrapper before process-exit assertion. The final `check` and live suite passed after these repairs. No unresolved classification 2–5 finding remains in Stage 1.

## Pass 3 structural review

Inspection found one database/admin configuration authority, one canonical Worker collection path, one public-feed read model, server-owned operational semantics, canonical migration/status/backup/restore tooling, and current runbook routes. No indie-author conditional exists in shared runtime code; the topic appears only as configured content. No obsolete `/api/admin` runtime route, Publication tenancy selector, broadened live-test claim, launch-only adapter, unsafe recovery target behavior, or meaningful launch-blocking N+1/unbounded read was found. No Terra High remediation handoff occurred.

## Stage 2 operator evidence required

Stage 2 is not yet executed. Before final acceptance, the operator must deploy the exact executable candidate and record all items below against one coherent deployment:

- runtime/source identity, pre-launch backup, current launched migration ledger, Web-first/Worker-second smoke, and candidate asset/API identity;
- final database-owned Publication, Source/endpoint, Category/Relevance, moderation, and duplicate state, including explicit Source approval and every non-secret configuration fact required by the closeout prompt;
- current health/runs for every launch endpoint and at least five eligible rows per Source (or all rows if fewer), with Source/headline/date/timezone/Category/eligibility/original-link checks;
- zero pending duplicate reviews or an explicit owner-approved exception;
- real desktop `1280x900`, mobile `390x844`, theme, keyboard/focus, overflow, loading/error/empty, date, and original-navigation observations;
- authorized operator training through Cloudflare Access and unauthenticated/direct-origin/reference-validator evidence against the exact candidate;
- final Operations/queue/alert/endpoint-health baseline;
- post-curation backup and fresh non-production restore with semantic verification and duration;
- monitoring, recovery, database, Cloudflare/origin ownership; backup frequency/location/durability/encryption/access/retention; RPO/RTO; total-host-loss posture; log/audit/metadata retention/access; operator checklist; known limitations and accepted risk.

Phase 19 recorded local-only backups, a 24-hour ordinary RPO, four-hour ordinary RTO, and no guaranteed recovery point/time for total VPS/storage loss. Stage 2 must reconfirm or deliberately amend that policy; it cannot silently disappear from launch handoff.

The exact post-curation recovery point, final approved inventory, feed-quality sample counts, duplicate disposition, operator training notes, metrics, ownership, limitations, and Stage 2 dates/environments remain unverified and must not be inferred from this Stage 1 artifact.

## Lifecycle boundary

Stage 1 GREEN does not establish production compatibility. Only final Stage 2 acceptance may change the status to `PHASE 20 GREEN — CUSTOMER LAUNCH ACCEPTED; FIRST SUPPORTED PRODUCTION BASELINE ESTABLISHED`. The accepted baseline will combine the launched executable SHA/tree and `0.20.1`, launched migration ledger, governed customer state represented by the post-curation recovery point, and recorded deployment ownership/limitations.

If Stage 2 is GREEN, the intended next roadmap phase is **Phase 21 — Codebase simplification and maintainability hardening**. Conversational `/closeout` remains separately required for the version-only `0.21.0` baseline transition.
