import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

import { createDatabase } from '../../src/database/database.ts';
import {
  discoverMigrations,
  inspectSchemaStatus,
  migrateDatabase,
} from '../../src/database/migrations.ts';
import { createDisposableDatabase } from '../support/database/disposable-database.ts';

test('database-status reports incompatible checksum history without applying work', async (context) => {
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
