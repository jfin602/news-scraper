# Phase 19 reliability, observability, and production operations validation

## Status

**PHASE 19 GREEN — STAGE 1 AND OPERATOR STAGE 2 COMPLETE**

Stage 1 certified the exact executable candidate identified below in controlled local environments. Stage 2 then deployed and exercised that same executable candidate on the project VPS and through the real Cloudflare perimeter. The Stage 2 evidence recorded here is operator-observed; no Cloudflare Access identity, VPS result, external-origin result, or recovery result is inferred from local automation.

Phase 19 validates the procedure intended to govern production. It does **not** establish the first supported production schema/data baseline. Phase 20 customer-launch acceptance remains the boundary that establishes that baseline.

Evidence-only documentation commits after the executable candidate do not change the executable candidate identity and do not require a Stage 1 rerun. During Stage 2 the deployment runbook was clarified, by owner-approved documentation-only change, so that backup durability is deployment-specific and local-only backup may be an explicitly accepted policy. No executable source, migration, package version, runtime behavior, or governed deployment configuration changed as part of that clarification.

## Candidate and environments

### Exact executable candidate

- Executable base commit: `148db43fdcda7f8b8230e5d733b2a22bf9f96db2`.
- Exact executable candidate commit: `829e7eae81d8d353bc7dc1ffdf8c7e927546fd69`.
- Exact executable candidate tree: `c121e8f836ad530e40226d466c1f92283a466f4e`.
- Package version: `0.19.7`.
- Phase 19 implementation base/range: `e1911fb6be5b5dc0632e2bc61c7ba30f08d92368..829e7eae81d8d353bc7dc1ffdf8c7e927546fd69`.

### Stage 1 environment

- Stage 1 rerun completed: 2026-08-17 12:07:29 -05:00 (America/Chicago).
- Environment: Windows, local controlled HTTP fixtures, disposable PostgreSQL, and local Chromium.
- Node: `v24.11.1`; npm: `11.6.2`.
- PostgreSQL client tools: `18.3`; disposable PostgreSQL server: `18.3`.
- Playwright: `1.56.1`; Chromium: `141.0.7390.37`.

### Stage 2 environment

- Operator validation date: 2026-08-17.
- Deployment host: project VPS, repository at `/www/news-scraper`.
- Public deployment: `https://news.jfin.dev`.
- VPS Node: `v24.15.0`; npm: `11.12.1`.
- VPS PostgreSQL client tools observed for deployment/recovery: Ubuntu PostgreSQL client `16.14` (`psql`, `pg_dump`, and `pg_restore`).
- Process manager: PM2 with `news-scraper-web` and `news-scraper-worker`.
- Public reverse proxy/origin: Nginx behind Cloudflare.
- Admin perimeter: Cloudflare Access for `/admin*` plus per-hostname Cloudflare Authenticated Origin Pulls enforced by Nginx.
- External direct-origin proof was performed from a separate Windows client rather than from the VPS itself.

## Stage 1 commands and results

All required selections were non-zero and reported zero skipped, cancelled, or todo tests.

| Command/procedure | Result | Evidence |
| --- | --- | --- |
| `npm install --ignore-scripts` | PASS; 216 packages audited, 0 vulnerabilities; no package lock created | Level 1 |
| `npm run codex:phase:validate -- p19` | PASS; P1–P7 contiguous, P7 is the sole manual closeout, version `0.19.7` | Level 1 |
| `npm run check` | PASS: formatting, lint, typecheck, 455/455 deterministic unit/integration/collection tests | Levels 1–5 as exercised |
| `npm run test:db` | PASS: 218/218 tests against disposable PostgreSQL, including operational snapshot, concurrency/pool headroom, Worker/job recovery, migrations, and the representative `0013` to `0014` pre-launch upgrade/restore | Level 4 |
| `npm run test:security` | PASS: 3/3 specialized integrated security tests; the broader deterministic matrix supplied the network/parser/fetch/error cases listed below | Levels 2–3 and 5 |
| `npm run test:recovery` | PASS: 1/1 native `pg_dump`/`pg_restore` controlled recovery procedure; 11.890 seconds for the test case (15.075 seconds total runner duration) | Level 4 |
| `npm run test:browser` | PASS: 61/61 Chromium tests, including Operations and retained Publication/Sources/Editorial/Articles/public workspaces | Level 6 |
| P6 upgrade/reference-validator proof | Covered without duplicate execution by `test:db` (`0013` to `0014`, 11.789 seconds) and `check` reference-validator tests | Levels 2–4 |
| `git diff --check e1911fb` and final working-diff check | PASS across the executable candidate plus evidence-only artifact updates | Level 1 |

The controlled Stage 1 recovery procedure asserted nonnegative individual backup and restore durations; its output did not emit those two values separately. Stage 2 therefore recorded separate real deployment backup/restore timing where available.

The Stage 1 rerun was required by executable commit `829e7ea`, which moved the admin API from `/api/admin` to `/admin/api` beneath the configured admin perimeter. The final deterministic, database, security, and browser suites all exercised the relocated routes; focused integration coverage also proved that the obsolete route is neither registered nor redirected.

## Stage 1 Pass 1 conclusions

### Operational snapshot and dashboard

`src/observability/operational-snapshot.ts` is the one server-owned read-only boundary for endpoint health, ready/future/running/expired work, oldest-ready queued timing, capacity/timing facts, status, and bounded ordered alerts. It calls the canonical endpoint-health derivation, uses three bounded aggregate queries without N+1 lookups, and performs no mutations. Dependency failure maps to bounded unavailable behavior rather than fabricated green state. The protected admin API exposes bounded non-secret facts.

Chromium observed the Operations workspace, healthy/empty and failure/recovery presentations, delayed/degraded/unhealthy and ready-queue facts, hostile inert text, non-overlapping/stale-safe refresh, keyboard/focus/live-region behavior, mobile containment, endpoint navigation, and retained Publication, Sources, Editorial, and Articles workspaces. The browser consumes server-owned status and alert fields and does not calculate health, readiness, lease expiry, or severity.

### Selected runtime policy

P3 retained the evidence-supported policy rather than changing values ceremonially:

- collection capacity: global `4`, per Source `2`, per destination host `2`;
- database pool: `10`; two pinned sessions per execution; eight pinned at the global limit; two connections remain available, exceeding the one-connection minimum headroom;
- scheduler pass `15s`; idle job poll `1s`; job lease `120s`; lease renewal `30s`; stale recovery pass `30s`; stale recovery batch `25`; local execution limit `4`;
- endpoint delayed boundary remains strictly after next-due plus one poll interval.

Real PostgreSQL tests showed exact cross-session global/Source/host capacity, unrelated progress under localized saturation, release after errors/session termination, endpoint-lock independence, safe capacity deferral without run/attempt consumption, and pool progress at full capacity. Deterministic timing tests showed lease-renewal, shutdown, scheduler, recovery, and delayed-health relationships remain valid.

### Security and abuse

The final matrix covered approval/lifecycle/operational gating before transport; scheme/domain/port/DNS/address/special-use/mapped-address policy; mixed-answer failure; redirect revalidation/loops/limits; validated-address binding; timeout/header/wire/decompression/parser bounds; RSS/HTML media isolation; static HTML no-subresource/no-Article-page behavior; preview no-network/no-persistence behavior; inert public/admin content; request integrity, JSON/body bounds, and real resource relationships; CSP/bounded errors; and Web/Worker structured diagnostics.

Pass 2 identified one concrete bounded defect: PostgreSQL native-tool stderr used pattern redaction and could disclose a hostile secret embedded outside recognized URL/password syntax. The candidate now replaces every non-empty native-tool diagnostic with a fixed redacted marker while retaining tool identity and exit status. `PostgreSQL tool diagnostics cannot disclose hostile secret sentinels` is the focused regression. The final `check` and recovery procedure passed after this repair.

No local result was counted as Cloudflare Access, authorized-operator, or direct-origin Level 8 proof.

### Backup, restore, retention, and upgrade

The native-tool recovery procedure created a managed custom-format backup with manifest/checksum, restored into a distinct fresh disposable database, verified the current ledger and semantic Publication/Source/endpoint/Category/Relevance/Article/observation/run/job/duplicate/moderation/history relationships through application repositories, and exercised queued plus expired attached-run recovery without unsafe replay. Corrupt/unmanaged restore failed closed. Unit coverage proved dry-run retention, deterministic managed-pair pruning, invalid-policy no-delete behavior, foreign-file preservation, and secret-safe failures. Partial artifacts use temporary names and are removed on failure; existing completed targets are not overwritten.

The database suite built repository-defined migration `0013` state, seeded governed data, created a real pre-upgrade backup, applied actual `0014`, verified ledger/checksum/current status and application reads/writes, then restored the pre-upgrade archive into a fresh rollback target. This proves the intended procedure only; it does not promote arbitrary pre-production databases to supported inputs.

The deployment and incident runbooks identify exact source/version, prerequisites and secret presence checks, backup, schema status, migration-only application, safe Web/Worker order, readiness/public/admin/Operations checks, rollback decisions, fresh-target restore, and existing controls for Source/parser, duplicate, job, database/schema, Cloudflare lockout, unsafe Source, and takedown incidents. The provider-neutral validator distinguishes observations from conclusions, rejects missing/secret-bearing configuration, does not follow redirects, and does not automate authorized Access identity.

## Stage 1 Pass 2 adversarial review

Classification uses: (1) protected with meaningful evidence; (2) governed but coverage strengthened; (3) bounded defect repaired; (4) structural refactor handoff; (5) material ambiguity.

- Empty DB, paused resources, queued-only backlog, expired jobs, database interruption, simultaneous alerts, clock boundaries, and stale dashboard responses: classification 1.
- Capacity saturation with unrelated work, pool pressure, scheduler/recovery, shutdown with in-flight work, lease loss, and recovery: classification 1.
- Approval/network/parser/content/request-integrity assumptions and browser inertness: classification 1 across the deterministic, database, security, and browser matrices.
- Backup collision, partial names, foreign files, invalid retention, symlink guards, absent tools, separate/non-empty target checks, corrupt archive, restore/cleanup failure, and post-restore mixed work: classification 1.
- Hostile secrets in PostgreSQL tool stderr: classification 3; repaired and covered as described above.
- Migration checksum/missing-history, failure rollback, concurrent migration serialization, pre/post-migration deployment stops, application rollback compatibility, and fresh restore policy: classification 1.
- Cloudflare lockout/public independence, alternate-origin exposure, unauthenticated redirect interpretation, authorized-path identity, monitoring ownership, and real RPO/RTO were intentionally deferred to Stage 2.
- Secret-bearing artifact text and premature Phase 20 baseline wording: classification 1 after artifact inspection; no secrets are recorded and Phase 20 remains the baseline boundary.

No unresolved classification 2–5 finding remained at the Stage 1 handoff.

The 2026-08-17 rerun independently repeated this review against the relocated `/admin/api` boundary. It found no new classification 2–5 issue; obsolete-route non-registration, mutation integrity, disabled-admin behavior, hostile content, stale refresh handling, and provider-neutral Stage 2 classification all retained meaningful evidence.

## Stage 1 Pass 3 structural review

The Phase 19 diff and important producers/consumers were independently inspected. Health/alert/queue SQL remains server-owned; observability does not mutate workflow; capacity and timing values have one production authority; the browser is a thin consumer; the measurement proof remains in tests; native PostgreSQL tooling is used through one small process boundary; restore and migration status reuse the existing migration engine; the validator is provider-neutral; runbook commands and routes exist; outputs are bounded and secret-safe; no legacy Publication tenancy, topic logic, vendor framework, custom backup format, second semaphore/lease architecture, or premature production-baseline claim was introduced.

No meaningful behavior-preserving structural refactor was found. No Terra High remediation handoff occurred.

The rerun also found no duplicated legacy/admin router, browser-owned security calculation, provider-specific validator assumption, stale runbook command, secret-bearing diagnostic, or premature Phase 20 production-baseline claim introduced by `829e7ea`.

## Stage 2 operator evidence

Stage 2 was executed one bounded action at a time against the exact executable candidate. Material mismatches were treated as stop conditions. No credentials, database URLs, Access cookies/tokens, origin private keys, or other secrets are recorded here.

### 1. Pre-deployment state and prerequisites — PASS

The VPS initially ran the prior candidate, then the operator verified the repaired candidate was present and deployable. Runtime prerequisites, required environment-variable presence, current schema state, PM2 process state, Nginx listeners, and Authenticated Origin Pulls configuration were checked without dumping secrets. The repaired candidate identity was later verified exactly as commit `829e7eae81d8d353bc7dc1ffdf8c7e927546fd69`, tree `c121e8f836ad530e40226d466c1f92283a466f4e`, version `0.19.7`.

### 2. Real pre-deployment backup and bounded duration — PASS

A fresh current-schema application backup was created before deployment:

- archive: `/home/deploy/news-scraper-backups/news-scraper-2026-08-17T18-46-37.212Z-363fdc46.dump`;
- matching manifest: same managed basename with `.json` suffix;
- archive size: `3,601,789` bytes;
- SHA-256: `a96ff7c4c898fb377b41614936cde4f6fd1adc6d7297c181f288e30ad52c09c2`;
- application backup duration: `845 ms`;
- measured wall duration: `1,131 ms`;
- `pg_restore --list`: PASS;
- database status before and after: current.

The manual P7 backup files were explicitly hardened to mode `600` after creation and their containing directory was mode `700`. Separately, the deployed automated backup script writes its managed backups under `/var/backups/postgresql/news-scraper`, explicitly applies mode `600`, and prunes only managed backups older than its configured retention window.

### 3. Real schema status/preflight — PASS

`npm run db:status` reported `{"state":"current"}` before deployment, after installing the exact candidate, after startup, after recovery proof, and during final smoke. No production migration was pending for this deployment, so no unnecessary migration was applied.

### 4. Safe quiescence, deployment, and Web/Worker startup order — PASS

The operator stopped Worker first and then Web, verified the application listener was closed, checked out the exact executable candidate, installed dependencies with `npm install --ignore-scripts`, rechecked candidate identity and schema state, then started Web first and validated it before starting Worker. Worker was started only after Web/admin-perimeter checks were green. No package lock was created.

### 5. Public feed, liveness, and readiness — PASS

After Web startup and again during final smoke, the public Cloudflare path returned HTTP `200` for:

- `/health/live`;
- `/health/ready`;
- `/`;
- `/api/feed`.

Local Web checks on `127.0.0.1:4069` returned the same expected public/readiness statuses.

### 6. Worker, scheduler/recovery diagnostics, PostgreSQL connectivity/current schema — PASS

PM2 showed `news-scraper-web` and `news-scraper-worker` online. Worker logs showed a fresh `worker.ready` event and clean scheduler passes with no observed failure loop. Database status remained current. During final smoke the Web process was online with restart count `9` and Worker was online with restart count `0`; these counts were recorded as observations, not interpreted as failures by themselves.

### 7. Real Operations state and Source/endpoint truthfulness — PASS

The operator read the real admin operational snapshot. It reported:

- status `healthy`;
- endpoint health: unknown `0`, healthy `2`, delayed `0`, degraded `0`, unhealthy `0`;
- queued/running/ready/future/expired work all `0` at the recorded operational read;
- alert count `0`;
- actionable endpoint count `0`.

Two configured Sources were observed as approved, active, and enabled, each with an approved/active/enabled endpoint and a six-hour (`21,600s`) poll interval. The final smoke repeated the operational snapshot and again observed `STATUS=healthy`, two healthy endpoints, all unhealthy/degraded/delayed/unknown counts zero, and `ALERT_COUNT=0`.

### 8. Real backup restore into a fresh non-production target — PASS

The current pre-deployment archive above was restored into a newly created separate disposable PostgreSQL database. The repository restore command returned:

`Backup restored and verified into the explicit target (663 ms).`

Measured restore wall duration was `939 ms`.

Semantic reads against the restored target observed:

- `publication_settings=1`;
- `sources=2`;
- `source_endpoints=2`;
- `collection_runs=12`;
- `articles=405`;
- `endpoint_collection_jobs=8`;
- singleton Publication count `1`;
- Publication collection state `active=true`.

The restored database passed current-schema/application verification. The live database remained current and both live processes remained online. The disposable restore database was then dropped and absence was verified. The source database was never overwritten or cut over.

### 9. Deployment/rollback decision points and incident runbooks — PASS

A final read-only control proof confirmed the exact candidate contains all required package commands: `db:status`, `db:migrate`, `db:backup`, `db:restore`, `deployment:validate`, `start:web`, and `start:worker`. Required implementation/runbook files and admin control surfaces for Operations, Sources, Articles, and Duplicates were present. Current schema and all public/readiness probes were green, both News Scraper PM2 processes were online, and the operator explicitly acknowledged the governed rollback stop conditions:

- incompatible or failed schema state;
- failed readiness or Worker cycling;
- unexpected admin behavior;
- successful direct-origin bypass;
- failed governed-data verification;
- material operational regression.

The reference deployment validator also ran successfully against the deployed candidate. It returned `ok: true`, with public root/API/readiness passing, the admin perimeter observed as an unauthenticated Cloudflare Access redirect, and direct origin not reachable over the supplied validator route. Because that validator's direct-origin check is deliberately bounded, the separate external SNI-correct direct-origin test below is the decisive origin-security evidence.

### 10. External unauthenticated Cloudflare Access challenge — PASS

Unauthenticated public requests to `/admin` and `/admin/api/operations/snapshot` returned HTTP `302` to the Cloudflare Access perimeter rather than returning the application admin UI/API. The obsolete `/api/admin/operations/snapshot` route remained unregistered and returned local HTTP `404`.

### 11. External authorized operator through Access — PASS

The operator authenticated through Cloudflare Access in a normal browser and confirmed that:

- the Administration UI loaded;
- Operations loaded and Refresh worked;
- Sources loaded;
- an authenticated direct GET of `/admin/api/operations/snapshot` returned the intended bounded JSON response.

No Access cookie/token is recorded. A direct GET of the snapshot endpoint inside an already authorized Access session is expected by the current design; state-changing admin methods retain the application's separate request-integrity controls.

### 12. External direct-origin/IP bypass — PASS, Level 8 observed

From an external Windows client, SNI-correct direct-origin requests using `curl --resolve` against the deployment origin returned HTTP `400` with no successful TLS/application response for:

- `/`;
- `/admin`;
- `/admin/api/operations/snapshot`.

The normal Cloudflare public root returned HTTP `200`, and unauthenticated public `/admin` returned the expected Access `302` challenge. Nginx configuration on the origin was independently observed with:

- `ssl_verify_client on;`;
- `ssl_client_certificate /etc/nginx/certs/news-jfin-aop-ca.crt;`.

This establishes the actual origin-protection mechanism as per-hostname Cloudflare Authenticated Origin Pulls enforced by Nginx, with Cloudflare Access additionally protecting `/admin*`. The external direct-origin observation is the decisive Level 8 bypass proof.

### 13. Operational ownership and policy — PASS, owner approved

The repository/deployment owner explicitly approved the following deployment policy record:

- **Monitoring/alert owner:** deployment owner. Primary application surface is Admin Operations; PM2, systemd, Nginx, and PostgreSQL are used as appropriate for diagnosis.
- **Recovery incident commander:** deployment owner.
- **Database owner:** deployment owner.
- **Cloudflare/Access/origin owner:** deployment owner.
- **Automated backup schedule:** daily at `02:30 America/Chicago` (`07:30 UTC` at the observed date), persistent systemd timer.
- **Automated backup location:** `/var/backups/postgresql/news-scraper` on the VPS.
- **Automated backup retention:** `90` days.
- **Automated backup access:** service runs as `postgres`; managed archive/checksum files are mode `600`; backup/restore-check scripts are root-owned mode `755`.
- **Automated restore check:** Sunday `03:15 America/Chicago`, persistent systemd timer, using a disposable database. The most recent observed backup service and restore-check service both had `Result=success` and exit status `0`.
- **Backup durability:** local-only by design. Off-host replication is not required for this deployment. Complete database loss caused by total VPS/storage loss is explicitly accepted; public Article/feed content may be recollected from approved public Sources, while configuration/moderation/operator-created state may require manual reconstruction.
- **RPO:** 24-hour target for incidents recoverable from surviving local backups; no guaranteed recovery point for total-host loss.
- **RTO:** four-hour target for ordinary application/database recovery when host/storage remain available. No guaranteed RTO for total-host loss. The target includes diagnosis, provisioning/repair, validation, and restart; the measured sub-second database restore itself is not treated as the incident RTO.
- **Cloudflare/admin access logs:** provider/account-default retention; deployment-owner access; no routine export required.
- **Application `audit_events`:** retain for the lifetime of the current database; authorized administration/database access only; no separate pruning policy. At the Stage 2 inventory read, `audit_events` contained zero rows.
- **PM2 application logs:** `/home/deploy/.pm2/logs/news-scraper-web-out.log`, `/home/deploy/.pm2/logs/news-scraper-web-error.log`, `/home/deploy/.pm2/logs/news-scraper-worker-out.log`, `/home/deploy/.pm2/logs/news-scraper-worker-error.log`; observed `pm2-logrotate` settings were max size `10M`, retain `7`, compression enabled, and daily rotation.
- **Nginx/network logs:** deployment uses the host Nginx access/error logs and host-managed rotation policy; access is limited to the deployment owner/root and there is no routine external export requirement.
- **Source metadata / Raw-item policy:** retain only bounded Source metadata/provenance deliberately persisted by the application. Do not create a separate long-term raw-feed/body archive. Transient Raw items remain processing inputs; administrative/database access is restricted to the deployment owner.
- **Origin protection owner/mechanism:** deployment owner; per-hostname Cloudflare Authenticated Origin Pulls enforced by Nginx plus Cloudflare Access for `/admin*`.
- **Application process location:** `/www/news-scraper`; PM2 processes `news-scraper-web` and `news-scraper-worker`.

The runbook was subsequently clarified by an evidence-only documentation change to make backup durability deployment-specific and to require an explicit accepted loss posture when backups are local-only. This policy change did not alter the executable candidate.

### 14. Final exact-candidate post-deployment smoke — PASS

The final corrected smoke observed:

- SHA exactly `829e7eae81d8d353bc7dc1ffdf8c7e927546fd69`;
- tree exactly `c121e8f836ad530e40226d466c1f92283a466f4e`;
- version exactly `0.19.7`;
- clean worktree;
- no `package-lock.json` or `npm-shrinkwrap.json`;
- database `{"state":"current"}`;
- pre-deployment backup present, checksum exactly `a96ff7c4c898fb377b41614936cde4f6fd1adc6d7297c181f288e30ad52c09c2`, and readable by `pg_restore --list`;
- Web and Worker both online;
- local `/health/live`, `/health/ready`, `/`, `/api/feed`, `/admin`, and `/admin/api/operations/snapshot` returned expected HTTP `200` statuses;
- obsolete local `/api/admin/operations/snapshot` returned HTTP `404`;
- final Operations snapshot shape valid, status `healthy`, healthy endpoints `2`, all other endpoint-health counts `0`, alerts `0`;
- public `/health/live`, `/health/ready`, `/`, and `/api/feed` returned HTTP `200`;
- public unauthenticated `/admin` and `/admin/api/operations/snapshot` returned Access HTTP `302`;
- Nginx Authenticated Origin Pulls enforcement remained configured;
- final marker: `FINAL_STAGE2_SMOKE=PASS`.

The first version of the final smoke script produced a false-negative `OPERATIONS_FINAL=FAIL` because the operator script incorrectly looked for `status` and `alerts` at the top level of the API response. The candidate API correctly returns `{ "snapshot": { ... } }`. Repository inspection confirmed that contract, the smoke script was corrected to read `response.snapshot`, and the entire smoke was rerun from the beginning. The corrected run passed. This was a validation-script defect only; no application/runtime change was required and Stage 1 was not invalidated.

## Stage 2 backup/retention operational inventory

Separate from the manual P7 backup used for restore proof, the deployed automated backup system was observed as follows:

- `news-scraper-db-backup.timer`: daily `02:30 America/Chicago`, `Persistent=true`;
- `news-scraper-db-restore-check.timer`: Sunday `03:15 America/Chicago`, `Persistent=true`;
- both services run as `postgres`;
- automated backup directory: `/var/backups/postgresql/news-scraper`;
- configured retention: `90` days;
- completed managed archive/checksum files: mode `600`;
- backup script explicitly prunes managed artifacts older than the configured retention;
- restore-check script selects a managed backup, creates a disposable restore database, performs restore/verification, and drops the disposable database;
- no remote backup mount, rclone/restic/borg configuration, additional sync service/timer, or relevant cron job was observed;
- local-only durability was then explicitly accepted by the deployment owner and documented as deployment policy rather than treated as an unrecorded exception.

## Final Phase 19 conclusion

Stage 1 and Stage 2 are GREEN against the same executable candidate.

The final evidence establishes:

- one bounded server-owned operational snapshot and truthful real deployment Operations state;
- tested/tuned capacity, lease, recovery, and delayed-health policy;
- specialized and broad security/abuse regression coverage;
- real backup creation and checksum/readability proof;
- a real fresh-target restore with semantic data preservation and measured deployment restore duration;
- deployed backup/retention and scheduled restore-check behavior;
- deployment/schema/rollback decision controls and real process startup order;
- public feed/liveness/readiness through Cloudflare;
- authorized admin operation through Cloudflare Access;
- unauthenticated admin interception at the Access perimeter;
- real external direct-origin bypass failure with Authenticated Origin Pulls identified as the origin mechanism;
- explicit monitoring/recovery/log/retention/RPO/RTO ownership and an owner-approved local-only catastrophic-loss posture;
- final exact-candidate identity, current schema, healthy Operations state, verified backup, and final smoke.

No executable defect was discovered during the successful Stage 2 run. The only Stage 2 retry was caused by an operator smoke-script parser that assumed the wrong JSON envelope; the application contract was correct and the corrected full rerun passed.

## Remaining limitations and lifecycle boundary

- The deployment's backup durability is intentionally local-only. Total VPS/storage loss has no guaranteed recovery point or recovery time; this is an explicit owner-approved deployment risk, not an unobserved assumption.
- Source/public Article content is substantially recollectable, but not every database row is reconstructible from public feeds. Configuration, moderation, audit, and other operator-created state may require manual reconstruction after catastrophic host loss.
- Cloudflare/admin and hosting/network log retention use the approved provider/host policy rather than an application-owned archival/export subsystem.
- Stage 2 did not claim a new application release or production compatibility baseline. The executable remains `0.19.7`.
- Phase 20 customer-launch acceptance, not this Phase 19 artifact, establishes the first supported production source/version/schema/data baseline.

The intended next phase is **Phase 20 — Customer launch validation**.

A separate conversational `/closeout` remains required after this final Phase 19 GREEN result to perform the version-only `0.20.0` transition governed by the project workflow.
