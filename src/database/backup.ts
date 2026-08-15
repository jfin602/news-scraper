import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import type { DatabaseConfig } from './config.ts';
import { createDatabase } from './database.ts';
import { discoverMigrations, inspectSchemaStatus } from './migrations.ts';

export const BACKUP_FILENAME_PATTERN =
  /^news-scraper-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z)-([0-9a-f]{8})\.dump$/u;

export class DatabaseBackupError extends Error {
  constructor(reason: string, options?: ErrorOptions) {
    super(`Database backup operation failed: ${reason}`, options);
    this.name = 'DatabaseBackupError';
  }
}

export interface BackupManifest {
  readonly format: 1;
  readonly application: 'news-scraper';
  readonly createdAt: string;
  readonly projectVersion: string;
  readonly postgresTool: 'pg_dump';
  readonly archiveFile: string;
  readonly sha256: string;
}

export async function createPostgresBackup(input: {
  readonly database: DatabaseConfig;
  readonly outputDirectory: string;
  readonly projectVersion: string;
  readonly now?: Date;
}): Promise<{
  archivePath: string;
  manifestPath: string;
  durationMilliseconds: number;
}> {
  const directory = path.resolve(input.outputDirectory);
  await mkdir(directory, { recursive: true });
  await assertRealDirectory(directory);
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime()))
    throw new DatabaseBackupError('creation time is invalid');
  const stamp = now.toISOString().replaceAll(':', '-');
  const archiveFile = `news-scraper-${stamp}-${randomUUID().slice(0, 8)}.dump`;
  const archivePath = path.join(directory, archiveFile);
  const manifestPath = `${archivePath}.json`;
  await assertMissing(archivePath);
  await assertMissing(manifestPath);
  const temporaryArchive = `${archivePath}.${randomUUID()}.partial`;
  const temporaryManifest = `${manifestPath}.${randomUUID()}.partial`;
  const started = performance.now();
  try {
    await runPostgresTool(
      'pg_dump',
      ['--format=custom', '--file', temporaryArchive],
      input.database,
    );
    const sha256 = await fileSha256(temporaryArchive);
    const manifest: BackupManifest = {
      format: 1,
      application: 'news-scraper',
      createdAt: now.toISOString(),
      projectVersion: input.projectVersion,
      postgresTool: 'pg_dump',
      archiveFile,
      sha256,
    };
    await writeFile(
      temporaryManifest,
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: 'wx' },
    );
    await rename(temporaryArchive, archivePath);
    await rename(temporaryManifest, manifestPath);
    return {
      archivePath,
      manifestPath,
      durationMilliseconds: performance.now() - started,
    };
  } catch (error) {
    await Promise.all([
      rm(temporaryArchive, { force: true }),
      rm(temporaryManifest, { force: true }),
    ]);
    if (error instanceof DatabaseBackupError) throw error;
    throw new DatabaseBackupError('backup could not be completed', {
      cause: error,
    });
  }
}

export async function restorePostgresBackup(input: {
  readonly sourceDatabase: DatabaseConfig;
  readonly targetDatabase: DatabaseConfig;
  readonly archivePath: string;
  readonly migrationsDirectory?: string;
}): Promise<{ durationMilliseconds: number }> {
  assertSeparateDatabase(input.sourceDatabase, input.targetDatabase);
  const archivePath = path.resolve(input.archivePath);
  if (!BACKUP_FILENAME_PATTERN.test(path.basename(archivePath))) {
    throw new DatabaseBackupError('backup filename is not a managed backup');
  }
  await assertRegularFile(archivePath);
  const manifest = await readManifest(`${archivePath}.json`);
  if (
    manifest.archiveFile !== path.basename(archivePath) ||
    manifest.sha256 !== (await fileSha256(archivePath))
  ) {
    throw new DatabaseBackupError('backup manifest or checksum is invalid');
  }
  const target = createDatabase(input.targetDatabase);
  try {
    const occupied = await target.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_toast' AND c.relkind IN ('r','p','v','m','S','f')`,
    );
    if (occupied.rows[0]?.count !== '0')
      throw new DatabaseBackupError('restore target is not empty');
  } finally {
    await target.close();
  }
  const started = performance.now();
  const targetName = decodeURIComponent(
    new URL(input.targetDatabase.connectionString).pathname.slice(1),
  );
  await runPostgresTool(
    'pg_restore',
    [
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
      '--dbname',
      targetName,
      archivePath,
    ],
    input.targetDatabase,
  );
  await verifyRestoredDatabase(input.targetDatabase, input.migrationsDirectory);
  return { durationMilliseconds: performance.now() - started };
}

export async function verifyRestoredDatabase(
  config: DatabaseConfig,
  migrationsDirectory = path.resolve('migrations'),
): Promise<void> {
  const database = createDatabase(config);
  try {
    await database.ping();
    const status = await inspectSchemaStatus(
      database,
      await discoverMigrations(migrationsDirectory),
    );
    if (status.state !== 'current')
      throw new DatabaseBackupError(
        `restored schema is not current (${status.state})`,
      );
    await database.query('SELECT name FROM publication_settings LIMIT 1');
    await database.query('SELECT id FROM sources LIMIT 1');
    await database.query('SELECT id FROM endpoint_collection_jobs LIMIT 1');
    await database.query('SELECT id FROM articles LIMIT 1');
  } catch (error) {
    if (error instanceof DatabaseBackupError) throw error;
    throw new DatabaseBackupError(
      'post-restore application verification failed',
      { cause: error },
    );
  } finally {
    await database.close();
  }
}

export async function prunePostgresBackups(input: {
  readonly directory: string;
  readonly keep: number;
  readonly dryRun?: boolean;
}): Promise<readonly string[]> {
  if (!Number.isSafeInteger(input.keep) || input.keep < 0)
    throw new DatabaseBackupError(
      'retention count must be a non-negative integer',
    );
  const directory = path.resolve(input.directory);
  await assertRealDirectory(directory);
  const entries = await readdir(directory, { withFileTypes: true });
  const archives = entries
    .filter(
      (entry) => entry.isFile() && BACKUP_FILENAME_PATTERN.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const removals = archives.slice(input.keep);
  for (const archive of removals) {
    const archivePath = path.join(directory, archive);
    const manifestPath = `${archivePath}.json`;
    await assertRegularFile(archivePath);
    const manifest = await readManifest(manifestPath);
    if (
      manifest.archiveFile !== archive ||
      manifest.sha256 !== (await fileSha256(archivePath))
    )
      throw new DatabaseBackupError(
        'managed backup validation failed; nothing was pruned',
      );
  }
  if (input.dryRun !== false) return removals;
  for (const archive of removals) {
    await rm(path.join(directory, archive));
    await rm(path.join(directory, `${archive}.json`));
  }
  return removals;
}

async function runPostgresTool(
  tool: 'pg_dump' | 'pg_restore',
  args: readonly string[],
  config: DatabaseConfig,
): Promise<void> {
  const parsed = new URL(config.connectionString);
  const environment: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
  };
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'] as const) {
    const value = parsed.searchParams.get(key);
    if (value !== null) environment[`PG${key.toUpperCase()}`] = value;
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(tool, [...args], {
      env: environment,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 2_000) stderr += chunk;
    });
    child.once('error', (error: NodeJS.ErrnoException) =>
      reject(
        new DatabaseBackupError(
          error.code === 'ENOENT'
            ? `${tool} is unavailable`
            : `${tool} could not start`,
          { cause: error },
        ),
      ),
    );
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(
            new DatabaseBackupError(
              `${tool} exited unsuccessfully (status ${code ?? 'unknown'}${stderr.trim() === '' ? '' : `: ${redactToolError(stderr)}`})`,
            ),
          ),
    );
  });
}

export function redactToolError(value: string): string {
  return value.trim() === '' ? '' : '[tool diagnostics redacted]';
}

function databaseIdentity(config: DatabaseConfig): string {
  const url = new URL(config.connectionString);
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}/${decodeURIComponent(url.pathname.slice(1))}`;
}

function assertSeparateDatabase(
  source: DatabaseConfig,
  target: DatabaseConfig,
): void {
  if (databaseIdentity(source) === databaseIdentity(target))
    throw new DatabaseBackupError('restore target must be a separate database');
}

async function assertMissing(target: string): Promise<void> {
  try {
    await lstat(target);
  } catch (error) {
    if (isEnoent(error)) return;
    throw error;
  }
  throw new DatabaseBackupError('backup output already exists');
}

async function assertRealDirectory(target: string): Promise<void> {
  const stat = await lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new DatabaseBackupError('backup directory must be a real directory');
}

async function assertRegularFile(target: string): Promise<void> {
  let stat;
  try {
    stat = await lstat(target);
  } catch (error) {
    throw new DatabaseBackupError('required backup file is missing', {
      cause: error,
    });
  }
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new DatabaseBackupError('backup artifact must be a regular file');
}

async function readManifest(target: string): Promise<BackupManifest> {
  await assertRegularFile(target);
  try {
    const value = JSON.parse(
      await readFile(target, 'utf8'),
    ) as Partial<BackupManifest>;
    if (
      value.format !== 1 ||
      value.application !== 'news-scraper' ||
      value.postgresTool !== 'pg_dump' ||
      typeof value.createdAt !== 'string' ||
      typeof value.projectVersion !== 'string' ||
      typeof value.archiveFile !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(value.sha256 ?? '')
    )
      throw new Error();
    return value as BackupManifest;
  } catch {
    throw new DatabaseBackupError('backup manifest is invalid');
  }
}

async function fileSha256(target: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(target))
    .digest('hex');
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
