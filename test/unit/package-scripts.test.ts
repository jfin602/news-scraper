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
      'test:db:focused',
      'test:live-sources',
      'db:migrate',
      'db:bootstrap',
      'editorial:apply',
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
      'test:browser',
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

  it('boots the singleton deployment from the canonical config path', async () => {
    const manifest = await readJson<PackageManifest>('package.json');

    assert.equal(
      manifest.scripts['db:bootstrap'],
      'node --env-file-if-exists=.env scripts/bootstrap-database.ts config/publication.json',
    );
  });

  it('applies editorial configuration from the canonical explicit path', async () => {
    const manifest = await readJson<PackageManifest>('package.json');

    assert.equal(
      manifest.scripts['editorial:apply'],
      'node --env-file-if-exists=.env scripts/apply-editorial-configuration.ts config/editorial.json',
    );
  });

  it('keeps package.json as the sole version source under lockfile-disabled npm policy', async () => {
    const manifest = await readJson<PackageManifest>('package.json');

    assert.match(manifest.version, /^\d+\.\d+\.\d+$/u);
    assert.match(await readFile('.npmrc', 'utf8'), /^package-lock=false$/mu);
    await assert.rejects(access('package-lock.json'));
  });

  it('assigns explicit conservative file concurrency to every test suite', async () => {
    const manifest = await readJson<PackageManifest>('package.json');

    const expectedConcurrency: Record<string, number> = {
      test: 4,
      'test:unit': 4,
      'test:integration': 4,
      'test:collection': 4,
      'test:browser': 2,
      'test:db': 2,
      'test:db:focused': 1,
      'test:live-sources': 1,
    };

    for (const [command, concurrency] of Object.entries(expectedConcurrency))
      assert.match(
        manifest.scripts[command] ?? '',
        new RegExp(`--test-concurrency=${String(concurrency)}(?: |$)`, 'u'),
      );
  });

  it('keeps focused database execution target-only and on the canonical real-database path', async () => {
    const manifest = await readJson<PackageManifest>('package.json');
    const command = manifest.scripts['test:db:focused'] ?? '';

    assert.match(command, /node --env-file-if-exists=\.env /u);
    assert.match(
      command,
      /--test-global-setup=test\/support\/database\/database-test-global-setup\.ts/u,
    );
    assert.doesNotMatch(command, /test\/database\/\*\*\/\*\.test\.ts/u);
  });
});

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}
