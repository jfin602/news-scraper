# PostgreSQL backup, restore, and retention

This procedure was established and validated during Phase 19 and was reconfirmed for the accepted Phase 20 launch. Phase 20 acceptance established the first supported production baseline; this runbook preserves that governed backup/restore/retention behavior.

Deployment ordering, schema rollback decisions, and incident procedures are in [deployment-and-incident-runbook.md](deployment-and-incident-runbook.md).

## Prerequisites

- Install `pg_dump` and `pg_restore` from a PostgreSQL client release compatible with the server.
- Set `NEWS_SCRAPER_DATABASE_URL` to the source database. The tools receive connection credentials through a narrow child-process environment and do not print the URL or password.
- Use a private, access-controlled local backup directory. This repository does not upload or encrypt archives and does not choose a deployment retention period.

## Create a backup

Run `npm run db:backup -- <backup-directory>`. The command writes a PostgreSQL custom-format archive and a bounded JSON manifest containing its SHA-256 checksum, creation time, project version, and tool identity. Partial files use a temporary suffix and are removed after failure; existing completed paths are never silently overwritten.

## Restore and verify

Create a separate, empty target database. Keep `NEWS_SCRAPER_DATABASE_URL` pointed at the source and set `NEWS_SCRAPER_RESTORE_DATABASE_URL` to that explicit target, then run:

```text
npm run db:restore -- <managed-backup.dump>
```

The command refuses a target with the same host, port, and database name as the configured source. It also refuses a non-empty target, an unmanaged/missing archive, an invalid manifest/checksum, PostgreSQL restore failure, or a restored schema that is not current and application-readable. It never drops, recreates, or cuts over the configured source database. Cutover remains a separate deployment decision after operator validation.

The Phase 19 pre-upgrade proof supplies its exact repository migration subset to the code-level restore verifier so the fresh rollback target is verified as current for the restored application. The ordinary operator command always verifies against the full current migration directory. Never substitute an arbitrary subset to conceal missing or incompatible production history.

After restore, use the existing job recovery path for expired work. Queued work remains claimable; expired unstarted jobs requeue; expired jobs attached to terminal or interrupted Collection runs reconcile without replaying the attached run. Source-scoped Article identity continues to make later safe collection retries idempotent.

## Prune managed backups

Retention is an explicit count of newest archives to keep. Preview is the default:

```text
npm run db:backup:prune -- <backup-directory> <keep-count>
npm run db:backup:prune -- <backup-directory> <keep-count> --apply
```

Only archive/manifest pairs matching the managed filename format and valid checksum are candidates. Foreign files are ignored. Symlinked directories or artifacts, malformed metadata, and invalid counts fail before deletion. Phase 19 recorded the reference deployment's retention count, storage/encryption controls, backup schedule, RPO, RTO, monitoring, and recovery ownership; accepted Phase 20 launch validation reconfirmed those deployment-specific values. Later operators record intentional changes through the governed operations process.

## Recovery validation

`npm run test:recovery` requires the ordinary disposable-test administrator URL plus installed PostgreSQL tools. It fails when prerequisites are absent. The suite migrates and seeds a disposable database, creates a real backup through the operator implementation, mutates the source, restores into a separate empty disposable database, verifies the migration ledger and semantic governed relationships through application repositories, including durable machine credential verifier/lifecycle state, exercises queued and expired attached-run recovery, rejects a corrupt restore, and cleans up all disposable databases and files. Plaintext bearer credentials are never persisted and therefore are not recoverable from backup or restore.
