import { lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';

const PACKAGE_NAME = 'news-scraper-php-integration';
const PACKAGE_ROOT = 'ns-integration';
const PRODUCT_NAME = 'news-scraper';
const API_VERSION = 'v1';
const PACKAGE_CONTENT_TYPE = 'application/zip';
const DEFAULT_PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');
const VERSION_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const MAX_VERSION_LENGTH = 128;
const MAX_METADATA_BYTES = 1_048_576;
const ABSOLUTE_MAX_ENTRY_BYTES = 16_777_216;
const ABSOLUTE_MAX_TOTAL_ENTRY_BYTES = 67_108_864;
const ABSOLUTE_MAX_ARCHIVE_BYTES = 70_000_000;

const MANIFEST = [
  ['README.md', 'integrations/php/README.md'],
  ['UPGRADE.md', 'integrations/php/UPGRADE.md'],
  ['run-sync.php', 'integrations/php/run-sync.php'],
  ['preflight.php', 'integrations/php/preflight.php'],
  ['local-read.php', 'integrations/php/local-read.php'],
  ['top-tag.php', 'integrations/php/top-tag.php'],
  ['bin/sync.php', 'integrations/php/bin/sync.php'],
  ['src/Http.php', 'integrations/php/src/Http.php'],
  ['src/Configuration.php', 'integrations/php/src/Configuration.php'],
  ['src/PackageMetadata.php', 'integrations/php/src/PackageMetadata.php'],
  ['src/Preflight.php', 'integrations/php/src/Preflight.php'],
  ['src/Digest.php', 'integrations/php/src/Digest.php'],
  ['src/Client.php', 'integrations/php/src/Client.php'],
  ['src/Synchronizer.php', 'integrations/php/src/Synchronizer.php'],
  ['src/LocalState.php', 'integrations/php/src/LocalState.php'],
  [
    'src/FilesystemStateStore.php',
    'integrations/php/src/FilesystemStateStore.php',
  ],
  ['src/LocalRead.php', 'integrations/php/src/LocalRead.php'],
  ['src/Runtime.php', 'integrations/php/src/Runtime.php'],
  ['src/bootstrap.php', 'integrations/php/src/bootstrap.php'],
  ['config/sync.env.example', 'integrations/php/config/sync.env.example'],
  [
    'config/local-read.env.example',
    'integrations/php/config/local-read.env.example',
  ],
] as const;

const DEFAULT_LIMITS = {
  maxEntryBytes: 1_048_576,
  maxTotalEntryBytes: 8_388_608,
  maxArchiveBytes: 8_500_000,
} as const;

export interface PhpIntegrationPackage {
  readonly filename: string;
  readonly contentType: typeof PACKAGE_CONTENT_TYPE;
  readonly version: string;
  readonly bytes: Buffer;
}

export interface PhpIntegrationPackageDescription {
  readonly version: string;
}

export interface PhpIntegrationPackageProducer {
  build(): Promise<PhpIntegrationPackage>;
  describe(): Promise<PhpIntegrationPackageDescription>;
}

export interface PhpIntegrationPackageLimits {
  readonly maxEntryBytes?: number;
  readonly maxTotalEntryBytes?: number;
  readonly maxArchiveBytes?: number;
}

export class PhpIntegrationPackageError extends Error {
  public readonly code:
    | 'invalid_project'
    | 'invalid_metadata'
    | 'missing_file'
    | 'unsafe_path'
    | 'size_limit_exceeded'
    | 'archive_limit_exceeded';

  public constructor(
    code:
      | 'invalid_project'
      | 'invalid_metadata'
      | 'missing_file'
      | 'unsafe_path'
      | 'size_limit_exceeded'
      | 'archive_limit_exceeded',
  ) {
    super(`PHP integration package cannot be built (${code}).`);
    this.name = 'PhpIntegrationPackageError';
    this.code = code;
  }
}

export function createPhpIntegrationPackageProducer(
  projectRoot = DEFAULT_PROJECT_ROOT,
  limits: PhpIntegrationPackageLimits = {},
): PhpIntegrationPackageProducer {
  const root = path.resolve(projectRoot);
  const boundedLimits = validateLimits(limits);

  return {
    async describe(): Promise<PhpIntegrationPackageDescription> {
      await assertDirectory(root);
      const metadata = await readProjectMetadata(root);
      return { version: metadata.version };
    },
    async build(): Promise<PhpIntegrationPackage> {
      await assertDirectory(root);
      const packageMetadata = await readProjectMetadata(root);
      const entries: ZipEntry[] = [];
      let totalEntryBytes = 0;

      for (const [archivePath, sourcePath] of MANIFEST) {
        const remainingBytes = Math.max(
          0,
          boundedLimits.maxTotalEntryBytes - totalEntryBytes,
        );
        const data = await readManifestFile(
          root,
          sourcePath,
          Math.min(boundedLimits.maxEntryBytes, remainingBytes),
        );
        totalEntryBytes += data.length;
        assertEntrySize(data.length, boundedLimits, totalEntryBytes);
        entries.push({
          name: `${PACKAGE_ROOT}/${archivePath}`,
          data,
        });
      }

      const versionData = Buffer.from(`${packageMetadata.version}\n`, 'utf8');
      const metadataData = Buffer.from(
        `${JSON.stringify(
          {
            name: PACKAGE_NAME,
            product: PRODUCT_NAME,
            version: packageMetadata.version,
            apiVersion: API_VERSION,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
      for (const [name, data] of [
        [`${PACKAGE_ROOT}/VERSION`, versionData],
        [`${PACKAGE_ROOT}/integration-package.json`, metadataData],
      ] as const) {
        totalEntryBytes += data.length;
        assertEntrySize(data.length, boundedLimits, totalEntryBytes);
        entries.push({ name, data });
      }

      const currentMetadata = await readProjectMetadata(root);
      if (
        currentMetadata.raw.length !== packageMetadata.raw.length ||
        !currentMetadata.raw.equals(packageMetadata.raw)
      ) {
        throw new PhpIntegrationPackageError('invalid_metadata');
      }

      const bytes = createStoredZip(entries);
      if (bytes.length > boundedLimits.maxArchiveBytes) {
        throw new PhpIntegrationPackageError('archive_limit_exceeded');
      }

      return {
        filename: `${PACKAGE_NAME}-${packageMetadata.version}.zip`,
        contentType: PACKAGE_CONTENT_TYPE,
        version: packageMetadata.version,
        bytes,
      };
    },
  };
}

interface ProjectMetadata {
  readonly version: string;
  readonly raw: Buffer;
}

interface ZipEntry {
  readonly name: string;
  readonly data: Buffer;
}

interface ResolvedLimits {
  readonly maxEntryBytes: number;
  readonly maxTotalEntryBytes: number;
  readonly maxArchiveBytes: number;
}

async function readProjectMetadata(root: string): Promise<ProjectMetadata> {
  let raw: Buffer;
  try {
    raw = await readManifestFile(root, 'package.json', MAX_METADATA_BYTES);
  } catch (error) {
    if (
      error instanceof PhpIntegrationPackageError &&
      error.code === 'missing_file'
    ) {
      throw new PhpIntegrationPackageError('invalid_metadata');
    }
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new PhpIntegrationPackageError('invalid_metadata');
  }
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (value as { name?: unknown }).name !== PRODUCT_NAME ||
    typeof (value as { version?: unknown }).version !== 'string'
  ) {
    throw new PhpIntegrationPackageError('invalid_metadata');
  }

  const version = (value as { version: string }).version;
  if (version.length > MAX_VERSION_LENGTH || !VERSION_PATTERN.test(version)) {
    throw new PhpIntegrationPackageError('invalid_metadata');
  }
  return { version, raw };
}

async function readManifestFile(
  root: string,
  relativePath: string,
  maxBytes: number,
): Promise<Buffer> {
  const absolutePath = path.resolve(root, relativePath);
  if (!isWithinRoot(root, absolutePath)) {
    throw new PhpIntegrationPackageError('unsafe_path');
  }

  const parts = path.relative(root, absolutePath).split(path.sep);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    let stats;
    try {
      stats = await lstat(current);
    } catch {
      throw new PhpIntegrationPackageError('missing_file');
    }
    const finalPart = index === parts.length - 1;
    if (stats.isSymbolicLink()) {
      throw new PhpIntegrationPackageError('unsafe_path');
    }
    if (finalPart ? !stats.isFile() : !stats.isDirectory()) {
      throw new PhpIntegrationPackageError('missing_file');
    }
  }

  let handle: FileHandle | undefined;
  try {
    handle = await open(
      absolutePath,
      constants.O_NOFOLLOW === undefined
        ? 'r'
        : constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const openedStats = await handle.stat();
    if (!openedStats.isFile()) {
      throw new PhpIntegrationPackageError('missing_file');
    }
    if (openedStats.size > maxBytes) {
      throw new PhpIntegrationPackageError('size_limit_exceeded');
    }
    const data = Buffer.alloc(maxBytes + 1);
    let bytesRead = 0;
    while (bytesRead < data.length) {
      const result = await handle.read(
        data,
        bytesRead,
        data.length - bytesRead,
        bytesRead,
      );
      bytesRead += result.bytesRead;
      if (result.bytesRead === 0) break;
    }
    if (bytesRead > maxBytes) {
      throw new PhpIntegrationPackageError('size_limit_exceeded');
    }
    const boundedData = Buffer.from(data.subarray(0, bytesRead));
    const afterRead = await lstat(absolutePath);
    if (afterRead.isSymbolicLink() || !afterRead.isFile()) {
      throw new PhpIntegrationPackageError('unsafe_path');
    }
    return boundedData;
  } catch (error) {
    if (error instanceof PhpIntegrationPackageError) throw error;
    throw new PhpIntegrationPackageError('missing_file');
  } finally {
    if (handle !== undefined) {
      await handle.close().catch(() => undefined);
    }
  }
}

async function assertDirectory(root: string): Promise<void> {
  try {
    const stats = await lstat(root);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new PhpIntegrationPackageError('unsafe_path');
    }
  } catch (error) {
    if (error instanceof PhpIntegrationPackageError) throw error;
    throw new PhpIntegrationPackageError('invalid_project');
  }
}

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function validateLimits(limits: PhpIntegrationPackageLimits): ResolvedLimits {
  const result = {
    maxEntryBytes: limits.maxEntryBytes ?? DEFAULT_LIMITS.maxEntryBytes,
    maxTotalEntryBytes:
      limits.maxTotalEntryBytes ?? DEFAULT_LIMITS.maxTotalEntryBytes,
    maxArchiveBytes: limits.maxArchiveBytes ?? DEFAULT_LIMITS.maxArchiveBytes,
  };
  if (
    Object.values(result).some(
      (value) => !Number.isSafeInteger(value) || value < 1,
    ) ||
    result.maxEntryBytes > ABSOLUTE_MAX_ENTRY_BYTES ||
    result.maxTotalEntryBytes > ABSOLUTE_MAX_TOTAL_ENTRY_BYTES ||
    result.maxArchiveBytes > ABSOLUTE_MAX_ARCHIVE_BYTES
  ) {
    throw new RangeError(
      'PHP integration package limits must be positive safe integers.',
    );
  }
  return result;
}

function assertEntrySize(
  length: number,
  limits: ResolvedLimits,
  total: number,
): void {
  if (length > limits.maxEntryBytes || total > limits.maxTotalEntryBytes) {
    throw new PhpIntegrationPackageError('size_limit_exceeded');
  }
}

function createStoredZip(entries: readonly ZipEntry[]): Buffer {
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    if (
      name.length === 0 ||
      name.length > 0xffff ||
      !isSafeArchiveName(entry.name)
    ) {
      throw new PhpIntegrationPackageError('invalid_project');
    }
    if (entry.data.length > 0xffffffff || offset > 0xffffffff) {
      throw new PhpIntegrationPackageError('archive_limit_exceeded');
    }
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localRecords.push(Buffer.concat([local, name, entry.data]));

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralRecords.push(Buffer.concat([central, name]));
    offset += localRecords.at(-1)?.length ?? 0;
  }

  const localData = Buffer.concat(localRecords);
  const centralData = Buffer.concat(centralRecords);
  if (
    entries.length > 0xffff ||
    centralData.length > 0xffffffff ||
    localData.length > 0xffffffff
  ) {
    throw new PhpIntegrationPackageError('archive_limit_exceeded');
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(localData.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([localData, centralData, end]);
}

function isSafeArchiveName(name: string): boolean {
  return (
    name === name.normalize('NFC') &&
    !name.startsWith('/') &&
    !name.includes('\\') &&
    name
      .split('/')
      .every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

function crc32(data: Buffer): number {
  let checksum = 0xffffffff;
  for (const byte of data) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
}
