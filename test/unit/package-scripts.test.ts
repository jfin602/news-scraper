import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts: Record<string, string>;
  version: string;
}

interface PackageLock {
  packages: Record<string, { version?: string }>;
  version: string;
}

describe('package command environment contract', () => {
  it('loads optional .env only for environment-requiring commands', async () => {
    const manifest = await readJson<PackageManifest>('package.json');
    const envCommands = ['test:db', 'db:migrate', 'start:web', 'start:worker'];
    const deterministicCommands = [
      'test',
      'test:unit',
      'test:integration',
      'check',
    ];

    for (const command of envCommands)
      assert.match(
        manifest.scripts[command] ?? '',
        /node --env-file-if-exists=\.env /u,
      );
    for (const command of deterministicCommands)
      assert.doesNotMatch(manifest.scripts[command] ?? '', /env-file/u);

    assert.equal(manifest.dependencies?.dotenv, undefined);
    assert.equal(manifest.devDependencies?.dotenv, undefined);
  });

  it('keeps package and lockfile root versions synchronized', async () => {
    const manifest = await readJson<PackageManifest>('package.json');
    const lock = await readJson<PackageLock>('package-lock.json');

    assert.equal(lock.version, manifest.version);
    assert.equal(lock.packages['']?.version, manifest.version);
  });
});

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}
