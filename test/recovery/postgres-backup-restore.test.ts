import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createPostgresBackup,
  restorePostgresBackup,
} from '../../src/database/backup.ts';
import { createDatabase } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  createDistributionProfile,
  findDistributionProfileByConfigKey,
  replaceDistributionProfileSourceAssociation,
} from '../../src/distribution/profiles/repository.ts';
import {
  findDistributionCredentialForAuthentication,
  issueDistributionCredential,
} from '../../src/distribution/credentials/repository.ts';
import { reconcileExpiredEndpointCollectionJob } from '../../src/jobs/execute-endpoint-collection-job.ts';
import {
  claimNextEndpointCollectionJob,
  enqueueEndpointCollectionJob,
  findEndpointCollectionJobById,
} from '../../src/jobs/endpoint-collection-job-repository.ts';
import { findCollectionRunById } from '../../src/collection/runs/repository.ts';
import { createDisposableDatabase } from '../support/database/disposable-database.ts';

test('real PostgreSQL backup restores governed state and existing recovery semantics', async (context) => {
  const source = await createDisposableDatabase();
  const target = await createDisposableDatabase();
  const corruptTarget = await createDisposableDatabase();
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'news-scraper-recovery-'),
  );
  context.after(async () => {
    await Promise.allSettled([
      source.dispose(),
      target.dispose(),
      corruptTarget.dispose(),
      rm(directory, { recursive: true, force: true }),
    ]);
  });
  await migrateDatabase({ connectionString: source.databaseUrl });
  const seeded = await seedRepresentativeState(source.databaseUrl);
  const backup = await createPostgresBackup({
    database: { connectionString: source.databaseUrl },
    outputDirectory: directory,
    projectVersion: '0.19.5',
  });

  const sourceDatabase = createDatabase({
    connectionString: source.databaseUrl,
  });
  await sourceDatabase.query('DELETE FROM audit_events');
  await sourceDatabase.close();
  const restored = await restorePostgresBackup({
    sourceDatabase: { connectionString: source.databaseUrl },
    targetDatabase: { connectionString: target.databaseUrl },
    archivePath: backup.archivePath,
  });
  assert.ok(backup.durationMilliseconds >= 0);
  assert.ok(restored.durationMilliseconds >= 0);

  const database = createDatabase({ connectionString: target.databaseUrl });
  const semantic = await database.query<{
    publication_name: string;
    source_key: string;
    endpoint_etag: string;
    category_key: string;
    rule_key: string;
    article_title: string;
    observation_outcome: string;
    primary_origin: string;
    audit_action: string;
  }>(
    `SELECT p.name AS publication_name, s.config_key AS source_key, e.etag AS endpoint_etag,
             c.config_key AS category_key, r.config_key AS rule_key, a.display_title_override AS article_title,
             o.processing_outcome AS observation_outcome, g.primary_selection_origin AS primary_origin,
             ae.action AS audit_action
        FROM publication_settings p, sources s
        JOIN source_endpoints e ON e.source_id=s.id
        JOIN relevance_rules r ON r.source_id=s.id
        JOIN categories c ON c.id=r.category_id
        JOIN articles a ON a.source_id=s.id
        JOIN article_observations o ON o.article_id=a.id
        JOIN duplicate_group_memberships gm ON gm.article_id=a.id
        JOIN duplicate_groups g ON g.id=gm.group_id
        JOIN audit_events ae ON ae.target_id=a.id
       WHERE a.id=$1`,
    [seeded.articleId],
  );
  assert.deepEqual(semantic.rows[0], {
    publication_name: 'Recovery Publication',
    source_key: 'recovery_source',
    endpoint_etag: '"recovery"',
    category_key: 'recovery_category',
    rule_key: 'recovery_rule',
    article_title: 'Operator headline',
    observation_outcome: 'created',
    primary_origin: 'manual',
    audit_action: 'article_title_changed',
  });
  assert.deepEqual(
    await findDistributionProfileByConfigKey(database, seeded.profileConfigKey),
    {
      id: seeded.profileId,
      configKey: 'recovery_profile',
      displayName: 'Recovery Profile',
      lifecycle: 'active',
      resultLimit: 321,
      createdAt: seeded.profileCreatedAt,
      updatedAt: seeded.profileUpdatedAt,
      sources: [
        {
          sourceId: seeded.sourceId,
          sourceConfigKey: 'recovery_source',
          sourceDisplayName: 'Recovery Source',
          sourceApprovalState: 'approved',
          sourceLifecycleState: 'active',
          includeAnyPhrases: ['Recovery include'],
          excludeAnyPhrases: ['Recovery exclude'],
          categoryConfigKeys: ['recovery_category'],
        },
      ],
    },
  );
  const restoredCredential = await findDistributionCredentialForAuthentication(
    database,
    seeded.credentialLookupId,
  );
  assert.ok(restoredCredential !== undefined);
  assert.deepEqual(restoredCredential.verifier, seeded.credentialVerifier);
  assert.equal(
    restoredCredential.expiresAt?.toISOString(),
    '2027-01-02T03:04:05.006Z',
  );
  assert.equal(restoredCredential.revokedAt, null);
  assert.equal(
    (await findEndpointCollectionJobById(database, seeded.queuedJobId))?.status,
    'queued',
  );
  const claimed = await claimNextEndpointCollectionJob(database, {
    workerId: 'restored-worker',
    claimedAt: new Date('2026-08-15T12:00:00Z'),
    leaseExpiresAt: new Date('2026-08-15T12:05:00Z'),
  });
  assert.equal(claimed?.id, seeded.queuedJobId);
  const recovery = await reconcileExpiredEndpointCollectionJob(database, {
    jobId: seeded.expiredJobId,
    workerId: 'recovery-worker',
    expiredAt: new Date('2026-08-15T11:00:00Z'),
    recoveredAt: new Date('2026-08-15T12:00:00Z'),
    leaseExpiresAt: new Date('2026-08-15T12:05:00Z'),
    availableAt: new Date('2026-08-15T12:00:00Z'),
  });
  assert.equal(recovery.status, 'reconciled');
  assert.equal(
    (await findCollectionRunById(database, seeded.runId))?.outcomeCode,
    'worker_interrupted',
  );
  await database.close();

  const corruptArchive = path.join(
    directory,
    'news-scraper-2026-08-15T12-00-00.000Z-deadbeef.dump',
  );
  await writeFile(corruptArchive, await readFile(backup.archivePath));
  await writeFile(`${corruptArchive}.json`, '{}');
  await assert.rejects(
    restorePostgresBackup({
      sourceDatabase: { connectionString: source.databaseUrl },
      targetDatabase: { connectionString: corruptTarget.databaseUrl },
      archivePath: corruptArchive,
    }),
  );
  const corruptDatabase = createDatabase({
    connectionString: corruptTarget.databaseUrl,
  });
  assert.equal(
    (
      await corruptDatabase.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pg_tables WHERE schemaname='public'",
      )
    ).rows[0]?.count,
    '0',
  );
  await corruptDatabase.close();
});

async function seedRepresentativeState(databaseUrl: string) {
  const database = createDatabase({ connectionString: databaseUrl });
  const sourceId = randomUUID(),
    endpointId = randomUUID(),
    articleId = randomUUID(),
    categoryId = randomUUID(),
    runId = randomUUID(),
    groupId = randomUUID(),
    auditId = randomUUID();
  try {
    await database.query(
      `INSERT INTO publication_settings (name, active_for_collection, public_status, description, accent_color, presentation_timezone) VALUES ('Recovery Publication', false, 'public', 'Preserved branding', '#123456', 'America/Chicago')`,
    );
    await database.query(
      `INSERT INTO sources (id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state, priority) VALUES ($1,'recovery_source','Recovery Source','https://recovery.example/','approved','active','enabled',7)`,
      [sourceId],
    );
    await database.query(
      `INSERT INTO source_approved_domain_rules (source_id,hostname,include_subdomains) VALUES ($1,'recovery.example',true)`,
      [sourceId],
    );
    await database.query(
      `INSERT INTO source_endpoints (id,source_id,config_key,endpoint_url,endpoint_type,approval_state,lifecycle_state,operational_state,poll_interval_seconds,etag,next_due_at) VALUES ($1,$2,'recovery_feed','https://recovery.example/feed','rss_atom','approved','active','enabled',300,'"recovery"','2026-08-15T13:00:00Z')`,
      [endpointId, sourceId],
    );
    await database.query(
      `INSERT INTO categories (id,config_key,display_name) VALUES ($1,'recovery_category','Recovery Category')`,
      [categoryId],
    );
    const profile = await createDistributionProfile(database, {
      configKey: 'recovery_profile',
      displayName: 'Recovery Profile',
      lifecycle: 'active',
      resultLimit: 321,
    });
    const credential = await issueDistributionCredential(database, {
      label: 'Recovery credential',
      expiresAt: '2027-01-02T03:04:05.006Z',
    });
    const credentialAuthentication =
      await findDistributionCredentialForAuthentication(
        database,
        credential.credential.lookupId,
      );
    assert.ok(credentialAuthentication !== undefined);
    await database.transaction(async (transaction) => {
      await replaceDistributionProfileSourceAssociation(
        transaction,
        profile.configKey,
        'recovery_source',
        {
          includeAnyPhrases: ['Recovery include'],
          excludeAnyPhrases: ['Recovery exclude'],
          categoryConfigKeys: ['recovery_category'],
        },
      );
    });
    await database.query(
      `INSERT INTO relevance_rules (id,config_key,action,predicate_type,pattern,priority,source_id,category_id,reason) VALUES ($1,'recovery_rule','categorize','title_contains','recovery',10,$2,$3,'Recovery category')`,
      [randomUUID(), sourceId, categoryId],
    );
    await database.query(
      `INSERT INTO articles (id,source_id,external_id,original_url,canonical_identity_url,display_title,normalized_title,summary,published_at_status,published_at,source_updated_at_status,first_seen_at,last_seen_at,display_title_override) VALUES ($1,$2,'external-1','https://recovery.example/a','https://recovery.example/a','Recovery headline','recovery headline','Preserved summary','parsed','2026-08-15T10:00:00Z','missing','2026-08-15T10:01:00Z','2026-08-15T10:02:00Z','Operator headline')`,
      [articleId, sourceId],
    );
    await database.query(
      `INSERT INTO article_categories (article_id,category_id) VALUES ($1,$2)`,
      [articleId, categoryId],
    );
    await database.query(
      `INSERT INTO article_category_overrides(article_id) VALUES ($1)`,
      [articleId],
    );
    await database.query(
      `INSERT INTO article_category_override_memberships(article_id,category_id) VALUES ($1,$2)`,
      [articleId, categoryId],
    );
    await database.query(
      `INSERT INTO collection_runs (id,source_endpoint_id,execution_id,trigger_kind,started_at,finished_at,run_status,transport_status,parser_status,normalization_status,processing_status) VALUES ($1,$2,$3,'scheduled','2026-08-15T10:00:00Z','2026-08-15T10:01:00Z','succeeded','succeeded','succeeded','succeeded','succeeded')`,
      [runId, endpointId, randomUUID()],
    );
    await database.query(
      `INSERT INTO article_observations (id,source_id,source_endpoint_id,collection_run_id,article_id,processing_outcome,observed_external_id,observed_canonical_identity_url) VALUES ($1,$2,$3,$4,$5,'created','external-1','https://recovery.example/a')`,
      [randomUUID(), sourceId, endpointId, runId, articleId],
    );
    await database.transaction(async (tx) => {
      await tx.query(
        `SET CONSTRAINTS duplicate_groups_primary_membership_fk DEFERRED`,
      );
      await tx.query(
        `INSERT INTO duplicate_groups(id,primary_article_id,primary_selection_origin) VALUES ($1,$2,'manual')`,
        [groupId, articleId],
      );
      await tx.query(
        `INSERT INTO duplicate_group_memberships(group_id,article_id) VALUES ($1,$2)`,
        [groupId, articleId],
      );
    });
    await database.query(
      `INSERT INTO audit_events(id,action,target_type,target_id,reason,prior_state,new_state) VALUES ($1,'article_title_changed','article',$2,'Recovery proof','{"title":"old"}','{"title":"Operator headline"}')`,
      [auditId, articleId],
    );
    const queued = await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpointId,
      triggerKind: 'manual',
      availableAt: new Date('2026-08-15T12:00:00Z'),
      attemptNumber: 1,
    });
    const secondEndpoint = randomUUID();
    await database.query(
      `INSERT INTO source_endpoints (id,source_id,config_key,endpoint_url,endpoint_type,approval_state,lifecycle_state,operational_state,poll_interval_seconds) VALUES ($1,$2,'recovery_feed_2','https://recovery.example/feed2','rss_atom','approved','active','enabled',300)`,
      [secondEndpoint, sourceId],
    );
    const expired = await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: secondEndpoint,
      triggerKind: 'scheduled',
      availableAt: new Date('2026-08-15T09:00:00Z'),
      attemptNumber: 1,
    });
    const claimed = await claimNextEndpointCollectionJob(database, {
      workerId: 'interrupted-worker',
      claimedAt: new Date('2026-08-15T10:00:00Z'),
      leaseExpiresAt: new Date('2026-08-15T10:05:00Z'),
    });
    assert.equal(claimed?.id, expired.job.id);
    const interruptedRunId = randomUUID();
    await database.query(
      `INSERT INTO collection_runs (id,source_endpoint_id,execution_id,trigger_kind,started_at,run_status,transport_status,parser_status,normalization_status,processing_status) VALUES ($1,$2,$3,'scheduled','2026-08-15T10:00:00Z','running','not_run','not_run','not_run','not_run')`,
      [interruptedRunId, secondEndpoint, expired.job.id],
    );
    await database.query(
      `UPDATE endpoint_collection_jobs SET collection_run_id=$2 WHERE id=$1`,
      [expired.job.id, interruptedRunId],
    );
    return {
      articleId,
      sourceId,
      profileId: profile.id,
      profileConfigKey: profile.configKey,
      profileCreatedAt: profile.createdAt,
      profileUpdatedAt: profile.updatedAt,
      credentialLookupId: credential.credential.lookupId,
      credentialVerifier: Buffer.from(credentialAuthentication.verifier),
      runId: interruptedRunId,
      queuedJobId: queued.job.id,
      expiredJobId: expired.job.id,
    };
  } finally {
    await database.close();
  }
}
