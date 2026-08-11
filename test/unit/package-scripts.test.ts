import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts: Record<string, string>;
  version: string;
}

describe('package command environment contract', () => {
  it('loads optional .env only for environment-requiring commands', async () => {
    const manifest = await readJson<PackageManifest>('package.json');
    const envCommands = [
      'test:db',
      'test:live-sources',
      'db:migrate',
      'db:bootstrap',
      'publication:set-public-status',
      'collect:endpoint',
      'start:web',
      'start:worker',
    ];
    const deterministicCommands = [
      'test',
      'test:unit',
      'test:integration',
      'test:collection',
      'codex:phase',
      'codex:phase:validate',
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

  it('exposes a parse-only Codex phase prompt validator', async () => {
    const manifest = await readJson<PackageManifest>('package.json');

    assert.equal(
      manifest.scripts['codex:phase:validate'],
      'node scripts/validate-codex-phase.mjs',
    );
  });

  it('keeps package.json as the sole version source under lockfile-disabled npm policy', async () => {
    const manifest = await readJson<PackageManifest>('package.json');

    assert.match(manifest.version, /^\d+\.\d+\.\d+$/u);
    assert.match(await readFile('.npmrc', 'utf8'), /^package-lock=false$/mu);
    await assert.rejects(access('package-lock.json'));
  });
});

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}
