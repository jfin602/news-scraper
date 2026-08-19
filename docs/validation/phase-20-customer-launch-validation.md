# Phase 20 customer launch validation

## Status

**PHASE 20 GREEN — CUSTOMER LAUNCH ACCEPTED; FIRST SUPPORTED PRODUCTION BASELINE ESTABLISHED**

Stage 1 certified the executable launch candidate. Stage 2 was then completed through operator-controlled deployment, live admin curation, live-Source/feed review, moderation review, deployed browser/perimeter validation, operational handoff, and explicit owner acceptance. Phase 20 acceptance establishes the first supported production schema/data baseline described below.

## Candidate and environments

- Phase 20 closeout base: `8013523b24743694d46efc80f544efeef84ec287` (tree `b2f9a3aacf02f55578e8ac956dbcd6f7f39efbd7`).
- Exact accepted executable candidate commit: `3870970f5581a13c521565993cbb573d9d39e029`.
- Exact accepted executable candidate tree: `7b4bb1032f23f57dea4ace2d2b3beef8d7c60ecc`.
- Package version: `0.20.1`.
- Stage 1 completed: 2026-08-17, America/Chicago.
- Stage 1 environment: Windows local validation, controlled fixtures, disposable PostgreSQL, local Chromium, and approved public live feeds.
- Stage 1 versions: Node `v24.11.1`; npm `11.6.2`; PostgreSQL client/server `18.3`; Playwright `1.56.1`; Chromium `141.0.7390.37`.
- Stage 2 completed: 2026-08-18, America/Chicago.
- Stage 2 reference deployment: `/www/news-scraper`, public deployment `https://news.jfin.dev`, PM2 Web/Worker, PostgreSQL, Cloudflare Access-protected admin perimeter.
- Stage 2 observed versions where relevant: Node `v24.15.0`; npm `11.12.1`; PostgreSQL client/tools `16.14`.

Documentation-only commits after the executable candidate do not replace the accepted executable identity above.

## Accepted schema baseline

Migration-from-zero and the pre-launch `0013` to `0014` upgrade/restore exercise passed in Stage 1. Stage 2 observed the deployed database at current schema state before and after candidate deployment. The accepted migration ledger is ordered `0001` through `0014`:

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

**Documentation erratum:** The original Phase 20 artifact transcribed the `0010_endpoint_collection_job_trigger_kind.sql` SHA-256 with prefix `1583c4ab…`. Verification against the exact accepted Phase 20 executable commit and current unchanged migration bytes confirms the correct checksum is `1583c4af4379d63aedc89260d0f38d5bb1006d118fa9d47268df8a3db7e02f01`. This correction changes documentation only; the accepted migration bytes, schema, executable baseline, and production state are unchanged.

From this acceptance forward, customer production state is durable supported state under `docs/decisions/production-data-and-schema-compatibility.md`; the earlier disposable pre-production reset rule no longer applies to the accepted production database.

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

`git diff --check 8013523b24743694d46efc80f544efeef84ec287...3870970f5581a13c521565993cbb573d9d39e029` passed, and the candidate commit left a clean working tree. No subordinate deterministic suite was rerun separately from `check`.

## Product and authority inspection

Source and test inspection confirmed that protected `/admin` and `/admin/api` surfaces own singleton Publication presentation/public/collection state; Sources, approval/lifecycle/operational state, priority, domains, and RSS admission phrases; endpoints, polling, type/profile/default Category, check-now, health, and recent runs; Categories/Relevance; Article and duplicate moderation; and Operations. Web owns canonical `/` and `/api/feed` reads and performs no Source collection. Worker owns scheduling and collection.

Bootstrap JSON remains initialization input, not production authority. The accepted production configuration is the governed live database/admin state observed and accepted during Stage 2.

The Stage 1 live suite directly proved only:

- Author Media — `author_media/site_rss`, `https://www.authormedia.com/feed/`;
- The Creative Penn — `the_creative_penn/podcast_rss`, `https://www.thecreativepenn.com/feed/podcast/`.

Each live test observed fresh content, repeat polling/idempotency with valid conditional `304 not_modified` behavior, persisted run/Article provenance, and exact original-publisher links rendered through the public feed. Stage 2 separately covered the actual launch inventory and feed-quality review.

## Stage 2 deployment evidence

### Candidate deployment and pre-launch recovery point

The operator created the pre-launch managed backup:

`/home/deploy/news-scraper-backups/news-scraper-2026-08-18T03-39-01.934Z-8e6f62c4.dump`

The backup completed in approximately 929 ms. The Worker was stopped before Web, the exact candidate was checked out, dependencies were installed, candidate SHA/tree/version were rechecked, and schema status remained current with no migration required.

Web was then started before Worker. The deployment emitted `web.listening` on `127.0.0.1:4069`. Local and public requests to `/health/live`, `/health/ready`, `/`, and `/api/feed` all returned HTTP 200. Worker startup emitted `worker.ready`; the observed scheduler pass reported `considered:0`, `enqueued:0`, `alreadyOutstanding:0`. Both PM2 processes were online and the database remained current.

### Final governed launch configuration

The operator reviewed and accepted the final Publication, Source/endpoint, Category/Relevance, moderation, and duplicate configuration through the protected admin UI. The final approved launch Source inventory is:

| Source | Source key | Endpoint key | Type | Endpoint URL | Launch state |
| --- | --- | --- | --- | --- | --- |
| Author Media | `author_media` | `site_rss` | `rss_atom` | `https://www.authormedia.com/feed/` | approved / active / enabled |
| Jane Friedman | `jane_friedman` | `site_rss` | `rss_atom` | `https://janefriedman.com/feed/` | approved / active / enabled |
| The Creative Penn | `the_creative_penn` | `podcast_rss` | `rss_atom` | `https://www.thecreativepenn.com/feed/podcast/` | approved / active / enabled |

Source/endpoint priorities, polling/default-Category settings, domain policy, and RSS/Atom admission-phrase settings were reviewed in the live admin as part of the operator-confirmed launch configuration. No launch-blocking configuration exception was recorded. Jane Friedman was added entirely through the production admin workflow with Source priority `0`, endpoint poll interval `3600` seconds, inherited Source domain policy, no default Category, and no RSS/Atom admission phrases for the initial launch pull.

The current bootstrap files remain non-authoritative initialization inputs. They are not rewritten to mirror the live database.

### Approved live-Source and feed-quality validation

The operator confirmed the final per-Source feed-quality sample gate GREEN for every launch Source, checking the required sample of at least five eligible rows per Source or all rows when fewer were available. Review covered Source/headline/date presentation, Category/eligibility, and original-publisher navigation. No launch-blocking feed-quality issue was observed.

Jane Friedman was additionally exercised through the admin workflow during Stage 2. Its first live collection run was Healthy and succeeded through transport, parser, normalization, and processing with:

- raw items: 5;
- Source-filtered: 0;
- normalized: 5;
- normalization failures: 0;
- link rejections: 0;
- created: 5;
- rejected/excluded/failed: 0.

The five-item count reflects the publisher feed payload; the Platform RSS/Atom parser does not impose a five-item cap.

### Duplicate and moderation gate

The operator completed the final moderation review and confirmed it GREEN. Pending duplicate reviews were zero, existing duplicate/Primary choices were reviewed, Article visibility and manual display/Category override state were checked, and the public feed showed no launch-blocking unresolved duplicate or moderation problem.

### Deployed public/admin and perimeter gate

The operator confirmed the deployed browser/perimeter gate GREEN against the accepted candidate. This included the required real public desktop/mobile presentation, theme, keyboard/focus, overflow/state/date/original-link review, authorized admin access through Cloudflare Access, unauthenticated protection, and failed direct-origin bypass/reference-deployment expectations. No launch-blocking presentation/accessibility or perimeter issue was reported.

### Operational baseline and handoff

The observed deployment baseline had healthy public liveness/readiness, current database schema, both Web and Worker online, Worker ready, no outstanding scheduler work in the recorded scheduler pass, and healthy collection behavior on the newly added Jane Friedman endpoint. No launch-blocking operational alert or endpoint-health issue was reported by the operator during final acceptance.

The repository owner explicitly confirmed the existing Phase 19 operational policy remains unchanged and accepted it for production launch:

- owner for monitoring: repository/deployment owner;
- owner for database: repository/deployment owner;
- owner for recovery/backup: repository/deployment owner;
- owner for Cloudflare/origin: repository/deployment owner;
- ordinary RPO: 24 hours;
- ordinary RTO: 4 hours;
- total VPS/storage loss: no guaranteed recovery point or recovery time;
- existing logging/audit/metadata retention and access policy remains unchanged;
- existing documented launch limitations and risks are explicitly accepted.

Phase 19 remains the governing validated backup/restore procedure evidence. On 2026-08-18 the repository owner explicitly removed the Phase 20 launch-time post-curation backup/restore exit gate. No post-curation restore is claimed by this artifact.

## Operator training and launch checklist

The operator exercised the protected Publication/Source administration workflow directly and successfully onboarded the first new Source through the production UI:

`Source -> trust/domain boundary -> RSS endpoint -> explicit approval -> enable -> Check now -> inspect health/run -> inspect feed`

This included Jane Friedman's public RSS endpoint and demonstrated that admin curation, governed collection, health/run inspection, and persistence are usable without seed-file edits. The operator confirmed the final launch configuration, feed-quality review, moderation gate, deployed browser/perimeter gate, and operational ownership/limitations.

Launch checklist outcome: GREEN under the owner-approved Phase 20 exit gate.

## Pass 2 adversarial review

The Stage 1 review challenged bootstrap/database divergence, approval/domain widening, partial live-suite coverage, stale runs, `304` interpretation, prospective editorial edits, bad-row moderation, duplicate false positives/Primary choice, pending review backlog, timezone dates, stale assets/SHA, Access versus origin paths, Web/Worker split health, backup-policy continuity, local-only recovery risk, secret-bearing evidence, executable/evidence commit identity, and premature baseline acceptance.

One classification-3 defect was found: the Phase 5 live test required a second conditional poll to return fresh `200` content and misclassified valid `304 not_modified` as failure. It was repaired so content is required on the first poll while the second truthfully accepts either content or a zero-item `304`. One related Windows-only live-test lifecycle defect was repaired by requiring `web.stopped` and disconnecting the test IPC wrapper before process-exit assertion. The final `check` and live suite passed after those repairs. No unresolved classification 2–5 finding remained.

Stage 2 operator review did not expose executable-source drift or another launch-blocking defect.

## Pass 3 structural review

Inspection found one database/admin configuration authority, one canonical Worker collection path, one public-feed read model, server-owned operational semantics, canonical migration/status/backup/restore tooling, and current runbook routes. No indie-author conditional exists in shared runtime code; the topic appears only as configured content. No obsolete `/api/admin` runtime route, Publication tenancy selector, broadened live-test claim, launch-only adapter, unsafe recovery target behavior, or meaningful launch-blocking N+1/unbounded read was found. No Terra High remediation handoff occurred.

## Accepted production baseline and limitations

The first supported production baseline is the combination of:

- executable commit `3870970f5581a13c521565993cbb573d9d39e029`;
- executable tree `7b4bb1032f23f57dea4ace2d2b3beef8d7c60ecc`;
- package `0.20.1`;
- accepted migration ledger `0001` through `0014` with the checksums recorded above;
- governed live customer database/admin configuration, moderation, and provenance state observed and accepted during Stage 2;
- the deployment ownership, recovery policy, and accepted limitations recorded above.

The accepted limitations include local-only backup durability under the existing Phase 19 policy, 24-hour ordinary RPO, four-hour ordinary RTO, and no guaranteed recovery point/time for total VPS/storage loss. No stronger recovery guarantee is implied.

Future schema, persisted-representation, or data-access changes must preserve this supported production baseline under `docs/decisions/production-data-and-schema-compatibility.md`. Clean migration-from-zero alone is no longer sufficient production-upgrade evidence.

## Next phase

Phase 20 is GREEN. The intended next roadmap phase is **Phase 21 — Codebase simplification and maintainability hardening**.

Conversational `/closeout` remains required for the separate version-only Phase 21 baseline transition to `0.21.0`.
