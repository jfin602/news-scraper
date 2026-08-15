import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DatabaseBackupError,
  prunePostgresBackups,
  redactToolError,
} from '../../src/database/backup.ts';

test('PostgreSQL tool diagnostics cannot disclose hostile secret sentinels', () => {
  const sentinel = 'operator-secret-sentinel';
  const result = redactToolError(
    `pg_restore: host=${sentinel} user=${sentinel} dbname=${sentinel}`,
  );

  assert.equal(result, '[tool diagnostics redacted]');
  assert.equal(result.includes(sentinel), false);
  assert.equal(redactToolError('   '), '');
});

test('backup retention is dry-run by default and removes only validated managed pairs', async (context) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'news-scraper-retention-'),
  );
  context.after(async () => {
    await import('node:fs/promises').then(({ rm }) =>
      rm(directory, { recursive: true, force: true }),
    );
  });
  const older = await managedBackup(
    directory,
    '2026-08-14T01-00-00.000Z',
    'aaaaaaaa',
  );
  await managedBackup(directory, '2026-08-15T01-00-00.000Z', 'bbbbbbbb');
  await writeFile(path.join(directory, 'foreign.dump'), 'foreign');

  assert.deepEqual(await prunePostgresBackups({ directory, keep: 1 }), [
    path.basename(older),
  ]);
  assert.equal(await readFile(older, 'utf8'), 'archive');
  assert.deepEqual(
    await prunePostgresBackups({ directory, keep: 1, dryRun: false }),
    [path.basename(older)],
  );
  await assert.rejects(readFile(older, 'utf8'));
  assert.equal(
    await readFile(path.join(directory, 'foreign.dump'), 'utf8'),
    'foreign',
  );
});

test('invalid retention and invalid managed metadata delete nothing', async (context) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'news-scraper-retention-'),
  );
  context.after(async () => {
    await import('node:fs/promises').then(({ rm }) =>
      rm(directory, { recursive: true, force: true }),
    );
  });
  const archive = await managedBackup(
    directory,
    '2026-08-14T01-00-00.000Z',
    'aaaaaaaa',
  );
  await assert.rejects(
    prunePostgresBackups({ directory, keep: -1, dryRun: false }),
    DatabaseBackupError,
  );
  await writeFile(`${archive}.json`, '{}');
  await assert.rejects(
    prunePostgresBackups({ directory, keep: 0, dryRun: false }),
    DatabaseBackupError,
  );
  assert.equal(await readFile(archive, 'utf8'), 'archive');
});

async function managedBackup(
  directory: string,
  stamp: string,
  suffix: string,
): Promise<string> {
  const archiveFile = `news-scraper-${stamp}-${suffix}.dump`;
  const archivePath = path.join(directory, archiveFile);
  const content = 'archive';
  await writeFile(archivePath, content);
  await writeFile(
    `${archivePath}.json`,
    JSON.stringify({
      format: 1,
      application: 'news-scraper',
      createdAt: stamp.replace(/-(\d{2})-(\d{2})\./u, ':$1:$2.'),
      projectVersion: '0.19.5',
      postgresTool: 'pg_dump',
      archiveFile,
      sha256: createHash('sha256').update(content).digest('hex'),
    }),
  );
  return archivePath;
}
