# Phase 19 reliability, observability, and production operations validation

## Status

**STAGE 1 GREEN — OPERATOR DEPLOYMENT VALIDATION REQUIRED**

This is not Phase 19 GREEN. Stage 1 does not claim Level 8 Cloudflare Access or direct-origin evidence. Phase 19 becomes GREEN only after the operator completes every Stage 2 observation against the executable candidate identified below and this artifact is finalized without embellishing the observations.

## Candidate and environment

- Stage 1 completed: 2026-08-15 13:54:50 -05:00 (America/Chicago).
- Environment: Windows, local controlled HTTP fixtures, disposable PostgreSQL, and local Chromium.
- Executable base commit: `148db43fdcda7f8b8230e5d733b2a22bf9f96db2`.
- Exact executable candidate tree: `871fbfd2edf53353bab70aa0e972c637fb85c3e8` (represented during validation by temporary Git object `648cf555fc9ba7863ae08862f3e661863735bcec`; the validation-artifact text itself is evidence-only and is not part of this executable tree).
- Package version: `0.19.7`.
- Phase 19 implementation base/range: `e1911fb6be5b5dc0632e2bc61c7ba30f08d92368..148db43fdcda7f8b8230e5d733b2a22bf9f96db2`, plus the bounded P7 candidate changes represented by the executable tree above.
- Node: `v24.11.1`; npm: `11.6.2`.
- PostgreSQL client tools: `18.3`; disposable PostgreSQL server: `18.3`.
- Playwright: `1.56.1`; Chromium: `141.0.7390.37`.

## Stage 1 commands and results

All required selections were non-zero and reported zero skipped, cancelled, or todo tests.

| Command/procedure | Result | Evidence |
| --- | --- | --- |
| `npm install --ignore-scripts` | PASS; 216 packages audited, 0 vulnerabilities; no package lock created | Level 1 |
| `npm run codex:phase:validate -- p19` | PASS; P1–P7 contiguous, P7 is the sole manual closeout, version `0.19.7` | Level 1 |
| `npm run check` | PASS on the repaired final executable candidate: formatting, lint, typecheck, 454/454 deterministic unit/integration/collection tests | Levels 1–5 as exercised |
| `npm run test:db` | PASS: 218/218 tests against disposable PostgreSQL, including operational snapshot, concurrency/pool headroom, Worker/job recovery, migrations, and the representative `0013` to `0014` pre-launch upgrade/restore | Level 4 |
| `npm run test:security` | PASS: 3/3 specialized integrated security tests; the broader deterministic matrix supplied the network/parser/fetch/error cases listed below | Levels 2–3 and 5 |
| `npm run test:recovery` | PASS after the P7 repair: 1/1 native `pg_dump`/`pg_restore` controlled recovery procedure; 4.649 seconds for the test case (5.760 seconds total runner duration) | Level 4 |
| `npm run test:browser` | PASS: 61/61 Chromium tests, including Operations and retained Publication/Sources/Editorial/Articles/public workspaces | Level 6 |
| P6 upgrade/reference-validator proof | Covered without duplicate execution by `test:db` (`0013` to `0014`, 11.789 seconds) and `check` reference-validator tests | Levels 2–4 |
| `git diff --check e1911fb...HEAD` and final working-diff check | PASS | Level 1 |

The recovery implementation returned and asserted nonnegative individual backup and restore durations; the test output did not emit those two values separately. The controlled combined procedure duration above is the locally retained duration evidence. Stage 2 must record real deployment backup and restore durations separately.

## Pass 1 conclusions

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

## Pass 2 adversarial review

Classification uses: (1) protected with meaningful evidence; (2) governed but coverage strengthened; (3) bounded defect repaired; (4) structural refactor handoff; (5) material ambiguity.

- Empty DB, paused resources, queued-only backlog, expired jobs, database interruption, simultaneous alerts, clock boundaries, and stale dashboard responses: classification 1.
- Capacity saturation with unrelated work, pool pressure, scheduler/recovery, shutdown with in-flight work, lease loss, and recovery: classification 1.
- Approval/network/parser/content/request-integrity assumptions and browser inertness: classification 1 across the deterministic, database, security, and browser matrices.
- Backup collision, partial names, foreign files, invalid retention, symlink guards, absent tools, separate/non-empty target checks, corrupt archive, restore/cleanup failure, and post-restore mixed work: classification 1.
- Hostile secrets in PostgreSQL tool stderr: classification 3; repaired and covered as described above.
- Migration checksum/missing-history, failure rollback, concurrent migration serialization, pre/post-migration deployment stops, application rollback compatibility, and fresh restore policy: classification 1.
- Cloudflare lockout/public independence, alternate-origin exposure, unauthenticated redirect interpretation, authorized-path identity, monitoring ownership, and real RPO/RTO: implementation/runbook is ready, but the actual result is intentionally unavailable until Stage 2; no Level 8 classification is claimed.
- Secret-bearing artifact text and premature Phase 20 baseline wording: classification 1 after artifact inspection; no secrets are recorded and Phase 20 remains the baseline boundary.

No unresolved classification 2–5 finding remains.

## Pass 3 structural review

The Phase 19 diff and important producers/consumers were independently inspected. Health/alert/queue SQL remains server-owned; observability does not mutate workflow; capacity and timing values have one production authority; the browser is a thin consumer; the measurement proof remains in tests; native PostgreSQL tooling is used through one small process boundary; restore and migration status reuse the existing migration engine; the validator is provider-neutral; runbook commands and routes exist; outputs are bounded and secret-safe; no legacy Publication tenancy, topic logic, vendor framework, custom backup format, second semaphore/lease architecture, or premature production-baseline claim was introduced.

No meaningful behavior-preserving structural refactor was found. No Terra High remediation handoff occurred.

## Limitations

- Stage 1 used controlled/local environments. It did not deploy or operate the project VPS.
- No approved live-Source result was required or claimed by this prompt.
- No Level 8 Cloudflare unauthenticated denial/challenge, authorized Access session, or external direct-origin bypass result is claimed.
- Individual local backup and restore durations were asserted but not separately emitted; Stage 2 must record deployment-specific durations.
- Monitoring/recovery owners, backup schedule/retention, RPO/RTO, origin mechanism, and log/data retention ownership remain blank until the operator records the real deployment decisions below.

## Stage 2 operator checklist

Run one safe block at a time using `docs/operations/deployment-and-incident-runbook.md` and `docs/operations/database-backup-and-restore.md`. Stop on a material mismatch. Never record credentials, database URLs, Access cookies/tokens, origin secrets, or private keys.

1. Pre-deployment state and prerequisites  
   Result:  
   Evidence/time/environment:
2. Real pre-deployment backup and bounded duration  
   Result:  
   Evidence:
3. Real schema status/preflight  
   Result:  
   Evidence:
4. Safe quiescence, migration, and Web/Worker startup order  
   Result:  
   Evidence:
5. Public `/`, `/api/feed`, liveness, and readiness observation  
   Result:  
   Evidence:
6. Worker, scheduler/recovery diagnostics, PostgreSQL connectivity/current schema  
   Result:  
   Evidence:
7. Real Operations state, Source failures/queue delay when warranted, and paused-state truthfulness  
   Result:  
   Evidence:
8. Real backup restore into a safe fresh non-production target, semantic reads, and separate durations  
   Result:  
   Evidence:
9. Deployment/rollback decision points and every required incident runbook  
   Result:  
   Evidence:
10. External unauthenticated Cloudflare Access challenge/denial; application admin UI not returned  
    Result:  
    Evidence:
11. External authorized operator reaches `/admin` and Operations through Access; no cookie/token recorded  
    Result:  
    Evidence:
12. External direct-origin/IP/alternate-host bypass fails; actual Tunnel/firewall/authenticated-origin/equivalent mechanism identified  
    Result:  
    Evidence:
13. Operational ownership and policy  
    Monitoring/alert owner:  
    Recovery/incident owner:  
    Backup schedule/location/encryption/access and retention:  
    Chosen RPO/RTO and rationale:  
    Cloudflare/admin access-log retention/access owner:  
    Application change-history retention/access owner:  
    Infrastructure/IP-log retention/access owner:  
    Bounded Raw-item/Source metadata retention/access owner:
14. Final post-deployment smoke and exact candidate/version/schema/backup confirmation  
    Result:  
    Evidence/limitations/retries:

## Lifecycle boundary

Phase 19 validates the procedure intended to govern production. Phase 20 customer-launch acceptance, not Phase 19 or this artifact, establishes the first supported production schema/data baseline.

If every Stage 2 item later becomes GREEN against this exact executable candidate, the intended next phase is Phase 20 — Customer launch validation. A separate conversational `/closeout` remains required after final Phase 19 GREEN to perform the version-only `0.20.0` baseline transition.
