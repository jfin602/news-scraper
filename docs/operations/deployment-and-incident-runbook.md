# Deployment, upgrade, rollback, and incident runbook

This provider-neutral procedure covers the implemented Node Web process, Node Worker process, and PostgreSQL database. Hosting process-control commands and Cloudflare/origin controls are deployment-specific. Linux VPS/Docker Compose self-host packaging, Kubernetes, systemd packaging, and automatic zero-downtime orchestration are post-2.0 work rather than current release requirements.

Phase 19 completed the pre-production operational validation. The `0013` to `0014` exercise proved this procedure against a repository-defined pre-launch state only and did not make older pre-production databases supported inputs. Phase 20 was subsequently accepted and established the first supported production SHA, package version, schema ledger, and customer data baseline.

Managed operation is the required 2.0 release path. Self-hostability remains an architectural direction for the same complete single-Publication stack, but productized self-host packaging and native self-host admin authentication are post-2.0. Cloudflare-specific steps below describe current managed deployments.

## Ordered deployment procedure

Use a change record that never contains secrets.

1. Record the exact Git SHA (`git rev-parse HEAD`) and `package.json` version. Confirm the intended commit is reviewed and the worktree is clean.
2. Confirm Node satisfies `package.json` `engines`, npm is available, and PostgreSQL plus `psql`, `pg_dump`, and `pg_restore` are compatible with the target. Install from `package.json`; this project intentionally has no npm lockfile.
3. Check that `NODE_ENV`, `NEWS_SCRAPER_DATABASE_URL`, Web host/port, and deployment-specific process/origin configuration exist. When admin is intended, confirm `NEWS_SCRAPER_ADMIN_ENABLED=true`. Check presence only; never print environment dumps, URLs, tokens, cookies, or credentials.
4. Confirm the most recent tested backup and restore record satisfy the deployment's recorded recovery policy. Backup durability is deployment-specific rather than universally off-host. When backups are intentionally local-only, record the accepted total-host-loss posture and which state would require reconstruction. If schema/data risk exceeds the recorded recovery point, run `npm run db:backup -- <private-directory>` and protect both dump and manifest. Follow [database-backup-and-restore.md](database-backup-and-restore.md).
5. Review every pending migration. Decide and record whether its locks/data changes are compatible with running processes. If not proven, stop scheduling, gracefully stop Worker, then gracefully stop Web. The safe default for an unknown migration is quiescence.
6. Run `npm run db:status`. Save its bounded JSON (`uninitialized`, `current`, `pending`, or `incompatible`). Incompatible is a stop condition. Uninitialized is a production stop unless this is an approved new installation.
7. Apply migrations only with `npm run db:migrate`. Run status again and require `{"state":"current"}`. Record ordered filenames and ledger state; never edit migration files or the ledger.
8. Start Web first and require `web.listening`. Verify `/health/live`, `/health/ready`, `/`, and `/api/feed`; an empty public feed is valid and a private/absent Publication uses bounded unavailable behavior.
9. Start Worker and require `worker.ready`. Observe scheduler, dispatcher, lease, and stale-recovery diagnostics. Startup failure or repeated scheduler/job/recovery failures is a stop/rollback signal.
10. Through authorized Cloudflare Access, load `/admin`, Operations, Sources/endpoints, Distribution Profiles, and a harmless read. Do not automate an authorized Access identity in the shared validator.
11. Require no unexplained unhealthy endpoints, scheduling delay, queue age, capacity saturation, expired jobs, or growing failures in Operations. Compare with the pre-deploy snapshot.
12. Run `npm run deployment:validate -- <private-reference-config.json>` and retain its observations. Phase 20 launch validation repeated the authorized-operator and actual origin-protection observations manually against its launched-tree candidate; later deployments must repeat evidence appropriate to their own perimeter.
13. Record SHA, package version, runtime/database versions, migration state, backup identifier, process observations, validator output, timestamp, and approver. Phase 20 acceptance already owns the initial production-baseline record; this step records the current deployment event.

## 2.0 managed distribution checks

The Distribution Profile foundation is implemented. As later roadmap phases introduce machine credentials, canonical distribution read delivery, the v1 API, and the generic PHP integration, managed deployment validation expands without creating a separate deployment topology.

The final 2.0 managed integration must observe, as applicable:

- distribution API liveness/readiness through the existing managed Web/API deployment;
- unusable/valid/revoked machine authentication without credential leakage;
- active, missing, and disabled Profile behavior;
- complete PHP synchronization across required pages/revisions;
- atomic last-known-good preservation under upstream/sync failure;
- no live News Scraper call during ordinary visitor rendering;
- direct stored publisher destinations on the external customer-style page;
- supported production forward migration/data preservation for 2.0 schema additions;
- compatibility with the established backup/restore/rollback procedure.

The final release claim is governed by the testing contract and active roadmap. It does **not** require Linux VPS/Docker Compose packaging or a self-host deployment observation.

## Rollback decisions

Stop rollout for incompatible/failed migration status, failed readiness or Worker cycling, unexpected admin behavior, successful direct-origin bypass, failed governed-data verification, or material operational regression.

- Application-only rollback is allowed only when the prior application is explicitly compatible with the current schema/data. Stop Worker then Web, deploy the prior SHA/version, start Web then Worker, and repeat verification.
- Do not reverse schema in place unless a separately reviewed and tested forward repair owns that operation. The migration engine intentionally has no down-migration path.
- If the prior application cannot safely use the upgraded state, preserve the failed database, provision a fresh empty database, restore the pre-upgrade P5 archive, verify against the restored application's migration set, switch the database secret through the hosting mechanism, and start Web then Worker. Never restore over a source or non-empty target.
- Record post-backup writes as potential recovery-point loss. Reconcile only through an approved data-integrity procedure, never improvised SQL.

## Reference-deployment validator

Use a private credential-free configuration:

```json
{
  "publicBaseUrl": "https://publication.example/",
  "directOriginBaseUrl": "https://origin-candidate.example/",
  "timeoutMilliseconds": 5000
}
```

Run `npm run deployment:validate -- <path>`. Both distinct targets are required. Redirects are not followed. Output contains check, classification, status, and safe redirect origin only; paths, queries, bodies, cookies, and credentials are omitted. A public redirect needs review. A public-host admin redirect is an observed unauthenticated challenge, not proof of authorized access. A direct-origin redirect is inconclusive and fails; an unreachable or denied origin passes this bounded check. Phase 20 launch validation reconfirmed the real Tunnel/firewall/authenticated-origin/equivalent mechanism and observed authorized access against its launched-tree candidate; later deployment claims require equivalent current evidence.

## Incident runbooks

### Failing Source or parser/profile breakage

Use Admin Operations and endpoint health/recent runs to separate transport, parser, normalization, policy, and processing failures. Pause the narrowest Source/endpoint with its existing operational-state control. For HTML, use the existing no-network preview with controlled markup, correct the endpoint profile, resume, and use Check now. For RSS/Atom, correct approved endpoint/filter configuration. Never widen approved domains from fetch success. Confirm unrelated endpoints continue.

### Unsafe or compromised Source/domain response

Pause immediately. Preserve bounded run diagnostics without browsing or redistributing hostile content. Review approved Source/endpoint domains, redirects, DNS/address findings, Article-link rejections, and change history. Correct or archive through existing admin controls; resume only after approval and publisher ownership are re-established.

### Duplicate false positive

In Admin Articles/Duplicates, locate all stored instances. Use existing split or Primary-selection moderation; dismiss weak review evidence when appropriate. Do not delete Articles/observations. Verify visibility independently and confirm intended public representation.

### Stuck, overlapping, or expired job

Check Operations queue/running/expired/capacity state and Worker diagnostics. Never edit lease/job rows. Confirm expected Worker processes/capacity. A healthy Worker reconciles expired leases; restart gracefully if loops stopped, then observe stale-job and terminal diagnostics. Use Check now only when no outstanding job exists. Escalate repeated lease loss before changing timing.

### PostgreSQL backup/restore or schema incident

Use [database-backup-and-restore.md](database-backup-and-restore.md) and the rollback rules above. Preserve the failed database/logs, restore only to a fresh explicit target, verify manifest/checksum/schema/application tables, and record recovery-point loss and duration.

### Cloudflare Access lockout/admin-perimeter incident

Keep admin disabled or origin-inaccessible instead of bypassing Access. Through the deployment owner, inspect Access policy/identity group, DNS, certificate/Tunnel or equivalent control, and audit logs. Use recorded break-glass authority only. Never expose the origin or add native credentials. Repeat unauthenticated denial, authorized browser access, and direct-origin observations after recovery.

### Legal/editorial Article takedown

Find the stable Article ID in Admin and use existing visibility moderation to hide it with a reason. Do not delete Source instances, observations, duplicate membership, or audit history. Confirm removal from the ordinary feed. Restore only through the same governed authority.

## Reference operations record established for Phase 20 launch

Phase 20 reconfirmed the deployment-specific values recorded during Phase 19. Later deployments must maintain/reconfirm their applicable record; shared engine code intentionally defines no universal defaults:

- monitoring/alert owner and escalation path;
- recovery incident commander and database/Cloudflare owners;
- backup frequency/location/durability model/encryption/access, retention count/period, last tested restore, and accepted loss posture;
- chosen RPO/RTO, rationale, and measurement method;
- Cloudflare/admin access-log retention/access/export policy;
- application `audit_events` retention/access policy;
- hosting/network/IP log retention/access policy;
- bounded Source author metadata and transient Raw-item/evidence retention/access handling;
- actual origin-protection mechanism and owner;
- adopted hosting platform's exact process commands and log locations.
