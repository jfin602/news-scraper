import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createPostgresBackup,
  restorePostgresBackup,
} from '../../src/database/backup.ts';
import { createDatabase } from '../../src/database/database.ts';
import {
  discoverMigrations,
  inspectSchemaStatus,
  migrateDatabase,
} from '../../src/database/migrations.ts';
import { readPublicFeed } from '../../src/public-feed/repository.ts';
import { createDisposableDatabase } from '../support/database/disposable-database.ts';

// This is a Phase 19 procedure proof from a repository-defined pre-launch state.
// It does not make arbitrary old pre-production databases supported production inputs;
// Phase 20 acceptance still establishes the first supported production baseline.
test('0013 pre-launch state upgrades through real 0014 and rolls back by fresh restore', async (context) => {
  const source = await createDisposableDatabase();
  const rollback = await createDisposableDatabase();
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), 'news-scraper-upgrade-'),
  );
  const earlierMigrations = path.join(workspace, 'migrations-through-0013');
  const backups = path.join(workspace, 'backups');
  context.after(async () => {
    await Promise.allSettled([
      source.dispose(),
      rollback.dispose(),
      rm(workspace, { recursive: true, force: true }),
    ]);
  });
  await cp('migrations', earlierMigrations, {
    recursive: true,
    filter: (sourcePath) =>
      !sourcePath.endsWith(
        '0014_html_endpoint_profile_and_run_diagnostics.sql',
      ),
  });
  assert.deepEqual(
    await migrateDatabase(
      { connectionString: source.databaseUrl },
      earlierMigrations,
    ),
    (await discoverMigrations(earlierMigrations)).map(
      (migration) => migration.filename,
    ),
  );
  const seeded = await seedEarlierGovernedState(source.databaseUrl);
  const backup = await createPostgresBackup({
    database: { connectionString: source.databaseUrl },
    outputDirectory: backups,
    projectVersion: '0.19.6',
  });

  const beforeUpgrade = createDatabase({
    connectionString: source.databaseUrl,
  });
  assert.deepEqual(
    await inspectSchemaStatus(
      beforeUpgrade,
      await discoverMigrations('migrations'),
    ),
    {
      state: 'pending',
      migrations: ['0014_html_endpoint_profile_and_run_diagnostics.sql'],
    },
  );
  assert.deepEqual(await runSchemaStatus(source.databaseUrl), {
    code: 0,
    output: {
      state: 'pending',
      migrations: ['0014_html_endpoint_profile_and_run_diagnostics.sql'],
    },
  });
  await beforeUpgrade.close();

  assert.deepEqual(
    await migrateDatabase({ connectionString: source.databaseUrl }),
    ['0014_html_endpoint_profile_and_run_diagnostics.sql'],
  );
  const upgraded = createDatabase({ connectionString: source.databaseUrl });
  assert.deepEqual(
    await inspectSchemaStatus(upgraded, await discoverMigrations('migrations')),
    { state: 'current' },
  );
  assert.deepEqual(await runSchemaStatus(source.databaseUrl), {
    code: 0,
    output: { state: 'current' },
  });
  const ledger = await upgraded.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM news_scraper_schema_migrations',
  );
  assert.equal(ledger.rows[0]?.count, '14');
  const preserved = await upgraded.query<{
    source_key: string;
    endpoint_key: string;
    title: string;
  }>(
    `SELECT s.config_key AS source_key, e.config_key AS endpoint_key, a.display_title AS title
       FROM sources s JOIN source_endpoints e ON e.source_id=s.id
       JOIN articles a ON a.source_id=s.id WHERE a.id=$1`,
    [seeded.articleId],
  );
  assert.deepEqual(preserved.rows[0], {
    source_key: 'upgrade_source',
    endpoint_key: 'upgrade_feed',
    title: 'Preserved headline',
  });
  assert.equal(
    (await readPublicFeed(upgraded))?.items[0]?.articleId,
    seeded.articleId,
  );
  await upgraded.query(
    `UPDATE source_endpoints SET endpoint_type='html_listing',
       html_listing_profile=$2::jsonb, html_listing_profile_revision=1 WHERE id=$1`,
    [
      seeded.endpointId,
      JSON.stringify({
        itemSelector: '.item',
        titleSelector: '.title',
        linkSelector: 'a',
      }),
    ],
  );
  await upgraded.close();

  await restorePostgresBackup({
    sourceDatabase: { connectionString: source.databaseUrl },
    targetDatabase: { connectionString: rollback.databaseUrl },
    archivePath: backup.archivePath,
    migrationsDirectory: earlierMigrations,
  });
  const restored = createDatabase({ connectionString: rollback.databaseUrl });
  assert.deepEqual(
    await inspectSchemaStatus(
      restored,
      await discoverMigrations(earlierMigrations),
    ),
    { state: 'current' },
  );
  assert.deepEqual(
    await inspectSchemaStatus(restored, await discoverMigrations('migrations')),
    {
      state: 'pending',
      migrations: ['0014_html_endpoint_profile_and_run_diagnostics.sql'],
    },
  );
  assert.equal(
    (await readPublicFeed(restored))?.items[0]?.articleId,
    seeded.articleId,
  );
  const oldShape = await restored.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='source_endpoints' AND column_name='html_listing_profile') AS exists`,
  );
  assert.equal(oldShape.rows[0]?.exists, false);
  await restored.close();
});

test('schema inspection reports incompatible checksum history without applying work', async (context) => {
  const databaseFixture = await createDisposableDatabase();
  context.after(() => databaseFixture.dispose());
  await migrateDatabase({ connectionString: databaseFixture.databaseUrl });
  const database = createDatabase({
    connectionString: databaseFixture.databaseUrl,
  });
  await database.query(
    `UPDATE news_scraper_schema_migrations SET checksum='tampered' WHERE filename='0014_html_endpoint_profile_and_run_diagnostics.sql'`,
  );
  assert.deepEqual(
    await inspectSchemaStatus(database, await discoverMigrations('migrations')),
    {
      state: 'incompatible',
      reason: 'checksum_mismatch',
      migration: '0014_html_endpoint_profile_and_run_diagnostics.sql',
    },
  );
  assert.deepEqual(await runSchemaStatus(databaseFixture.databaseUrl), {
    code: 1,
    output: {
      state: 'incompatible',
      reason: 'checksum_mismatch',
      migration: '0014_html_endpoint_profile_and_run_diagnostics.sql',
    },
  });
  await assert.rejects(
    migrateDatabase({ connectionString: databaseFixture.databaseUrl }),
    /incompatible history/u,
  );
  await database.close();
});

async function seedEarlierGovernedState(databaseUrl: string) {
  const database = createDatabase({ connectionString: databaseUrl });
  const sourceId = randomUUID();
  const endpointId = randomUUID();
  const articleId = randomUUID();
  try {
    await database.query(
      `INSERT INTO publication_settings(name,active_for_collection,public_status,description)
       VALUES ('Upgrade Publication',false,'public','Upgrade preservation proof')`,
    );
    await database.query(
      `INSERT INTO sources(id,config_key,display_name,site_url,approval_state,lifecycle_state,operational_state,priority)
       VALUES ($1,'upgrade_source','Upgrade Source','https://upgrade.example/','approved','active','enabled',1)`,
      [sourceId],
    );
    await database.query(
      `INSERT INTO source_approved_domain_rules(source_id,hostname,include_subdomains)
       VALUES ($1,'upgrade.example',false)`,
      [sourceId],
    );
    await database.query(
      `INSERT INTO source_endpoints(id,source_id,config_key,endpoint_url,endpoint_type,approval_state,lifecycle_state,operational_state,poll_interval_seconds)
       VALUES ($1,$2,'upgrade_feed','https://upgrade.example/feed','rss_atom','approved','active','enabled',300)`,
      [endpointId, sourceId],
    );
    await database.query(
      `INSERT INTO articles(id,source_id,external_id,original_url,canonical_identity_url,display_title,normalized_title,
         published_at_status,published_at,source_updated_at_status,first_seen_at,last_seen_at)
       VALUES ($1,$2,'upgrade-article','https://upgrade.example/article','https://upgrade.example/article',
         'Preserved headline','preserved headline','parsed','2026-08-15T10:00:00Z','missing',
         '2026-08-15T10:01:00Z','2026-08-15T10:01:00Z')`,
      [articleId, sourceId],
    );
    return { sourceId, endpointId, articleId };
  } finally {
    await database.close();
  }
}

function runSchemaStatus(
  databaseUrl: string,
): Promise<{ code: number | null; output: unknown }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/database-status.ts'], {
      env: { ...process.env, NEWS_SCRAPER_DATABASE_URL: databaseUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      const serialized = stdout.trim() || stderr.trim();
      resolve({ code, output: JSON.parse(serialized) as unknown });
    });
  });
}
