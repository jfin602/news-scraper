import assert from 'node:assert/strict';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  createPhpIntegrationPackageProducer,
  PhpIntegrationPackageError,
} from '../../src/integrations/php-integration-package.ts';

const root = path.resolve(import.meta.dirname, '../..');
const sourceManifest = [
  ['README.md', 'integrations/php/README.md'],
  ['bin/sync.php', 'integrations/php/bin/sync.php'],
  ['example/index.php', 'integrations/php/example/index.php'],
  ['src/Http.php', 'integrations/php/src/Http.php'],
  ['src/Configuration.php', 'integrations/php/src/Configuration.php'],
  ['src/Client.php', 'integrations/php/src/Client.php'],
  ['src/Synchronizer.php', 'integrations/php/src/Synchronizer.php'],
  ['src/LocalState.php', 'integrations/php/src/LocalState.php'],
  [
    'src/FilesystemStateStore.php',
    'integrations/php/src/FilesystemStateStore.php',
  ],
  ['src/LocalRead.php', 'integrations/php/src/LocalRead.php'],
  ['src/Renderer.php', 'integrations/php/src/Renderer.php'],
  ['src/Runtime.php', 'integrations/php/src/Runtime.php'],
  ['src/bootstrap.php', 'integrations/php/src/bootstrap.php'],
  ['config/sync.env.example', 'integrations/php/config/sync.env.example'],
  [
    'config/local-read.env.example',
    'integrations/php/config/local-read.env.example',
  ],
] as const;
const packageEntries = [
  ...sourceManifest.map(
    ([archivePath]) => `news-scraper-php-integration/${archivePath}`,
  ),
  'news-scraper-php-integration/VERSION',
  'news-scraper-php-integration/integration-package.json',
];

test('produces the exact deterministic customer manifest and a consumer-ready result', async () => {
  const result = await createPhpIntegrationPackageProducer().build();
  const entries = readStoredZip(result.bytes);

  assert.deepEqual([...entries.keys()], packageEntries);
  assert.equal(result.filename, 'news-scraper-php-integration-1.7.0.zip');
  assert.equal(result.contentType, 'application/zip');
  assert.equal(result.version, '1.7.0');
  assert.equal(
    entries.get('news-scraper-php-integration/VERSION')?.toString(),
    '1.7.0\n',
  );
  assert.deepEqual(
    JSON.parse(
      entries
        .get('news-scraper-php-integration/integration-package.json')!
        .toString(),
    ),
    {
      name: 'news-scraper-php-integration',
      product: 'news-scraper',
      version: '1.7.0',
      apiVersion: 'v1',
    },
  );
  assert.equal(
    entries
      .get('news-scraper-php-integration/src/bootstrap.php')
      ?.toString()
      .match(/require_once __DIR__ \. '\/([^']+)'/gu)?.length,
    9,
  );
  assert.equal(
    [...entries.keys()].some(
      (name) => name.includes('/tests/') || name === 'package.json',
    ),
    false,
  );
});

test('keeps configuration defaults and visitor/synchronization secrets separate', async () => {
  const entries = readStoredZip(
    (await createPhpIntegrationPackageProducer().build()).bytes,
  );
  const sync = entries
    .get('news-scraper-php-integration/config/sync.env.example')!
    .toString();
  const local = entries
    .get('news-scraper-php-integration/config/local-read.env.example')!
    .toString();

  for (const expected of [
    'NEWS_SCRAPER_BASE_URL=https://your-news-scraper.example',
    'NEWS_SCRAPER_PROFILE_KEY=replace-with-profile-key',
    'NEWS_SCRAPER_STATE_ROOT=/absolute/private/path/news-scraper-state',
    'NEWS_SCRAPER_BEARER_TOKEN=replace-with-machine-credential',
    'NEWS_SCRAPER_SYNC_CADENCE_SECONDS=900',
    'NEWS_SCRAPER_TIMEOUT_SECONDS=20',
    'NEWS_SCRAPER_MAX_RESPONSE_BYTES=2097152',
    '# Optional: NEWS_SCRAPER_MAX_STALE_AGE_SECONDS=86400',
  ])
    assert.match(sync, new RegExp(`^${escapeRegExp(expected)}$`, 'mu'));
  for (const expected of [
    'NEWS_SCRAPER_PROFILE_KEY=replace-with-profile-key',
    'NEWS_SCRAPER_STATE_ROOT=/absolute/private/path/news-scraper-state',
    'NEWS_SCRAPER_SYNC_CADENCE_SECONDS=900',
    '# Optional: NEWS_SCRAPER_MAX_STALE_AGE_SECONDS=86400',
  ])
    assert.match(local, new RegExp(`^${escapeRegExp(expected)}$`, 'mu'));
  assert.doesNotMatch(
    local,
    /NEWS_SCRAPER_BASE_URL|NEWS_SCRAPER_BEARER_TOKEN/u,
  );
});

test('derives metadata from the same fixture tree and remains stable without secret/state leakage', async () => {
  const fixture = await createFixture('9.8.7');
  try {
    const producer = createPhpIntegrationPackageProducer(fixture);
    const first = await producer.build();
    const second = await producer.build();
    assert.deepEqual(first.bytes, second.bytes);
    assert.equal(first.filename, 'news-scraper-php-integration-9.8.7.zip');
    assert.equal(first.version, '9.8.7');
    const bytes = first.bytes.toString('utf8');
    assert.doesNotMatch(
      bytes,
      /synthetic-bearer-token|private-state-sentinel/u,
    );
    assert.doesNotMatch(
      bytes,
      /fixture-secret.txt|unrelated.txt|integrations\/php\/tests/u,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('fails closed for malformed or missing project metadata', async () => {
  for (const mutation of [
    async (fixture: string) =>
      await writeFile(path.join(fixture, 'package.json'), '{'),
    async (fixture: string) =>
      await writeFile(
        path.join(fixture, 'package.json'),
        JSON.stringify({ name: 'news-scraper', version: '1.7' }),
      ),
    async (fixture: string) =>
      await writeFile(
        path.join(fixture, 'package.json'),
        JSON.stringify({ name: 'other', version: '1.7.0' }),
      ),
    async (fixture: string) => await rm(path.join(fixture, 'package.json')),
  ]) {
    const fixture = await createFixture('1.7.0');
    try {
      await mutation(fixture);
      await assert.rejects(
        () => createPhpIntegrationPackageProducer(fixture).build(),
        isPackageError('invalid_metadata'),
      );
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  }
});

test('fails closed for missing and non-ordinary allowlisted files', async () => {
  const missing = await createFixture('1.7.0');
  try {
    await rm(path.join(missing, 'integrations/php/src/Renderer.php'));
    await assert.rejects(
      () => createPhpIntegrationPackageProducer(missing).build(),
      isPackageError('missing_file'),
    );
  } finally {
    await rm(missing, { recursive: true, force: true });
  }

  const directory = await createFixture('1.7.0');
  try {
    await rm(path.join(directory, 'integrations/php/src/Renderer.php'));
    await mkdir(path.join(directory, 'integrations/php/src/Renderer.php'));
    await assert.rejects(
      () => createPhpIntegrationPackageProducer(directory).build(),
      isPackageError('missing_file'),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('fails closed for symlinked allowlisted paths when the fixture filesystem supports symlinks', async () => {
  const fixture = await createFixture('1.7.0');
  const target = path.join(fixture, 'integrations/php/src/Http.php');
  const outside = path.join(fixture, 'outside-secret.php');
  try {
    await writeFile(outside, 'private-state-sentinel');
    await rm(target);
    try {
      await symlink(outside, target, 'file');
    } catch (error) {
      if (isUnsupportedSymlinkError(error)) return;
      throw error;
    }
    await assert.rejects(
      () => createPhpIntegrationPackageProducer(fixture).build(),
      isPackageError('unsafe_path'),
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }

  const parentFixture = await createFixture('1.7.0');
  const sourceDirectory = path.join(parentFixture, 'integrations/php/src');
  const outsideDirectory = path.join(parentFixture, 'outside-source');
  try {
    await mkdir(outsideDirectory);
    await rm(sourceDirectory, { recursive: true, force: true });
    try {
      await symlink(
        outsideDirectory,
        sourceDirectory,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    } catch (error) {
      if (isUnsupportedSymlinkError(error)) return;
      throw error;
    }
    await assert.rejects(
      () => createPhpIntegrationPackageProducer(parentFixture).build(),
      isPackageError('unsafe_path'),
    );
  } finally {
    await rm(parentFixture, { recursive: true, force: true });
  }
});

test('fails closed when package entry or aggregate bounds are exceeded', async () => {
  const fixture = await createFixture('1.7.0');
  try {
    await assert.rejects(
      () =>
        createPhpIntegrationPackageProducer(fixture, {
          maxEntryBytes: 1,
        }).build(),
      isPackageError('size_limit_exceeded'),
    );
    await assert.rejects(
      () =>
        createPhpIntegrationPackageProducer(fixture, {
          maxEntryBytes: 1_000_000,
          maxTotalEntryBytes: 1,
        }).build(),
      isPackageError('size_limit_exceeded'),
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

async function createFixture(version: string): Promise<string> {
  const fixture = await mkdtemp(
    path.join(os.tmpdir(), 'news-scraper-php-package-'),
  );
  for (const [, sourcePath] of sourceManifest) {
    await mkdir(path.dirname(path.join(fixture, sourcePath)), {
      recursive: true,
    });
  }
  await mkdir(path.join(fixture, 'integrations/php/tests'), {
    recursive: true,
  });
  const packageJson = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  ) as Record<string, unknown>;
  packageJson.version = version;
  await writeFile(
    path.join(fixture, 'package.json'),
    `${JSON.stringify(packageJson)}\n`,
  );
  for (const [, sourcePath] of sourceManifest) {
    await cp(path.join(root, sourcePath), path.join(fixture, sourcePath));
  }
  await writeFile(
    path.join(fixture, 'integrations/php/tests/fixture-secret.txt'),
    'synthetic-bearer-token private-state-sentinel',
  );
  await writeFile(
    path.join(fixture, 'unrelated.txt'),
    'synthetic-bearer-token private-state-sentinel',
  );
  await writeFile(
    path.join(fixture, '.env'),
    'NEWS_SCRAPER_BEARER_TOKEN=synthetic-bearer-token',
  );
  return fixture;
}

function isPackageError(code: PhpIntegrationPackageError['code']) {
  return (error: unknown): boolean =>
    error instanceof PhpIntegrationPackageError && error.code === code;
}

function isUnsupportedSymlinkError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    ['EACCES', 'EPERM', 'UNKNOWN'].includes(String(error.code))
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function readStoredZip(bytes: Buffer): Map<string, Buffer> {
  const endSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const endOffset = bytes.lastIndexOf(endSignature);
  assert.ok(endOffset >= 0, 'ZIP end record is present');
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  assert.equal(
    centralOffset + centralSize,
    endOffset,
    'central directory bounds',
  );

  const entries = new Map<string, Buffer>();
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50, 'central signature');
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const crc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString('utf8');
    assert.equal(flags, 0x800, 'UTF-8 flag');
    assert.equal(method, 0, 'stored entry');
    assert.equal(
      bytes.readUInt32LE(localOffset),
      0x04034b50,
      'local signature',
    );
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    assert.equal(
      bytes
        .subarray(localOffset + 30, localOffset + 30 + localNameLength)
        .toString('utf8'),
      name,
      'local name',
    );
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    assert.equal(compressedSize, uncompressedSize, 'stored size');
    assert.equal(data.length, uncompressedSize, 'entry bounds');
    assert.equal(crc32ForTest(data), crc, 'entry CRC');
    assert.equal(entries.has(name), false, 'no duplicate names');
    entries.set(name, Buffer.from(data));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(
    cursor,
    centralOffset + centralSize,
    'central directory records',
  );
  return entries;
}

function crc32ForTest(data: Buffer): number {
  let checksum = 0xffffffff;
  for (const byte of data) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++)
      checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}
