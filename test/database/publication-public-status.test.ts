import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { createDatabase, type Database } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import { ConfigurationValidationError } from '../../src/publication/configuration.ts';
import {
  insertPublicationSettings,
  readPublicationSettings,
  setPublicationPublicStatus,
} from '../../src/publication/repository.ts';
import {
  insertSource,
  insertSourceEndpoint,
} from '../../src/sources/repository.ts';
import { parseBootstrapDocument } from '../../src/publication/bootstrap.ts';
import { bootstrapPublicationTree } from '../../src/publication/bootstrap.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const execFileAsync = promisify(execFile);
const fixtureUrl = new URL(
  '../fixtures/generic-bootstrap.json',
  import.meta.url,
);

test('setPublicationPublicStatus updates singleton settings and preserves Source configuration', async () => {
  await withMigratedDatabase(async (database) => {
    const target = await insertPublicationSettings(
      database,
      publicationInput('Target', 'private'),
    );
    const source = await insertSource(database, sourceInput());
    const endpoint = await insertSourceEndpoint(
      database,
      source.id,
      endpointInput(),
    );
    const sourceBefore = await database.query(
      'SELECT * FROM sources WHERE id = $1',
      [source.id],
    );
    const endpointBefore = await database.query(
      'SELECT * FROM source_endpoints WHERE id = $1',
      [endpoint.id],
    );
    const sourceDomainRulesBefore = await database.query(
      'SELECT * FROM source_approved_domain_rules WHERE source_id = $1',
      [source.id],
    );
    const endpointDomainRulesBefore = await database.query(
      'SELECT * FROM source_endpoint_domain_rules WHERE source_endpoint_id = $1',
      [endpoint.id],
    );

    await database.query('SELECT pg_sleep(0.01)');
    const madePublic = await setPublicationPublicStatus(database, 'public');
    assert.ok(madePublic);
    assert.equal(madePublic.publicStatus, 'public');
    assert.equal(madePublic.name, target.name);
    assert.equal(madePublic.activeForCollection, target.activeForCollection);
    assert.deepEqual(madePublic.createdAt, target.createdAt);
    assert.ok(madePublic.updatedAt > target.updatedAt);
    assert.deepEqual(
      await database.query('SELECT * FROM sources WHERE id = $1', [source.id]),
      sourceBefore,
    );
    assert.deepEqual(
      await database.query('SELECT * FROM source_endpoints WHERE id = $1', [
        endpoint.id,
      ]),
      endpointBefore,
    );
    assert.deepEqual(
      await database.query(
        'SELECT * FROM source_approved_domain_rules WHERE source_id = $1',
        [source.id],
      ),
      sourceDomainRulesBefore,
    );
    assert.deepEqual(
      await database.query(
        'SELECT * FROM source_endpoint_domain_rules WHERE source_endpoint_id = $1',
        [endpoint.id],
      ),
      endpointDomainRulesBefore,
    );

    const madePrivate = await setPublicationPublicStatus(database, 'private');
    assert.equal(madePrivate?.publicStatus, 'private');
    assert.equal(
      (await readPublicationSettings(database))?.publicStatus,
      'private',
    );
  });
});

test('setPublicationPublicStatus rejects invalid states and reports absent settings', async () => {
  await withMigratedDatabase(async (database) => {
    const publication = await insertPublicationSettings(
      database,
      publicationInput('Existing', 'private'),
    );
    await assert.rejects(
      setPublicationPublicStatus(database, 'published'),
      ConfigurationValidationError,
    );
    assert.deepEqual(await readPublicationSettings(database), publication);
    await database.query('DELETE FROM publication_settings');
    assert.equal(
      await setPublicationPublicStatus(database, 'public'),
      undefined,
    );
    assert.equal(
      (await database.query('SELECT 1 FROM publication_settings')).rowCount,
      0,
    );
  });
});

test('publication:set-public-status changes both canonical states through the actual command', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const document = parseBootstrapDocument(await readFile(fixtureUrl, 'utf8'));
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await bootstrapPublicationTree(database, document);
    } finally {
      await database.close();
    }

    const madePrivate = await runCommand(databaseUrl, 'private');
    assert.match(madePrivate.stdout, /public_status=private/u);
    assert.doesNotMatch(madePrivate.stdout, /slug=/u);
    const madePublic = await runCommand(databaseUrl, 'public');
    assert.match(madePublic.stdout, /public_status=public/u);
    assert.doesNotMatch(madePublic.stdout, /slug=/u);

    const inspector = createDatabase({ connectionString: databaseUrl });
    try {
      assert.equal(
        (await readPublicationSettings(inspector))?.publicStatus,
        'public',
      );
    } finally {
      await inspector.close();
    }
  });
});

test('publication:set-public-status rejects invalid input and does not leak database credentials', async () => {
  const missingArguments = await runCommandFailure();
  assert.match(
    missingArguments.stderr,
    /Usage: set-publication-public-status\.ts/u,
  );
  const legacyArguments = await runCommandFailure(
    undefined,
    'technology-bulletin',
    'public',
  );
  assert.match(
    legacyArguments.stderr,
    /Usage: set-publication-public-status\.ts/u,
  );

  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const invalidStatus = await runCommandFailure(databaseUrl, 'published');
    assert.match(invalidStatus.stderr, /Invalid publication public status\./u);
    const missingPublication = await runCommandFailure(databaseUrl, 'public');
    assert.match(missingPublication.stderr, /Publication not found\./u);
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      assert.equal(
        (await database.query('SELECT 1 FROM publication_settings')).rowCount,
        0,
      );
    } finally {
      await database.close();
    }
  });

  const secret = 'not-for-output';
  const unavailable = await runCommandFailure(
    `postgresql://invalid:${secret}@127.0.0.1:1/missing`,
    'public',
  );
  assert.match(unavailable.stderr, /Database operation failed\./u);
  assert.doesNotMatch(
    `${unavailable.message}${unavailable.stdout}${unavailable.stderr}`,
    new RegExp(secret, 'u'),
  );
});

async function runCommand(databaseUrl: string, status: string) {
  return runNpmCommand(databaseUrl, [status]);
}

async function runCommandFailure(
  databaseUrl?: string,
  ...arguments_: string[]
): Promise<{ message: string; stdout: string; stderr: string }> {
  try {
    await runNpmCommand(databaseUrl, arguments_);
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    return {
      message: failure.message,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    };
  }
  throw new Error('Expected command to fail.');
}

function runNpmCommand(databaseUrl: string | undefined, arguments_: string[]) {
  const command = ['npm run publication:set-public-status'];
  if (arguments_.length > 0) command.push(`-- ${arguments_.join(' ')}`);
  const isWindows = process.platform === 'win32';
  return execFileAsync(
    isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'npm',
    isWindows
      ? ['/d', '/s', '/c', command.join(' ')]
      : ['run', 'publication:set-public-status', '--', ...arguments_],
    {
      cwd: process.cwd(),
      env:
        databaseUrl === undefined
          ? process.env
          : { ...process.env, NEWS_SCRAPER_DATABASE_URL: databaseUrl },
    },
  );
}

async function withMigratedDatabase(
  work: (database: Database) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await work(database);
    } finally {
      await database.close();
    }
  });
}

function publicationInput(name: string, publicStatus: 'private' | 'public') {
  return {
    name: `Publication ${name}`,
    activeForCollection: true,
    publicStatus,
  } as const;
}

function sourceInput() {
  return {
    configKey: 'primary_source',
    displayName: 'Primary source',
    siteUrl: 'https://www.example.com/about',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    domainRules: [{ hostname: 'example.com', includeSubdomains: true }],
  } as const;
}

function endpointInput() {
  return {
    configKey: 'main_feed',
    endpointUrl: 'https://feeds.example.com/feed.xml',
    endpointType: 'rss_atom',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    pollIntervalSeconds: 300,
  } as const;
}
