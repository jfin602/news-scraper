import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { createDatabase, type Database } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import { ConfigurationValidationError } from '../../src/publications/configuration.ts';
import {
  findPublicationBySlug,
  insertPublication,
  setPublicationPublicStatus,
} from '../../src/publications/repository.ts';
import {
  insertSource,
  insertSourceEndpoint,
} from '../../src/sources/repository.ts';
import { parseBootstrapDocument } from '../../src/publications/bootstrap.ts';
import { bootstrapPublicationTree } from '../../src/publications/bootstrap.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const execFileAsync = promisify(execFile);
const fixtureUrl = new URL(
  '../fixtures/generic-bootstrap.json',
  import.meta.url,
);

test('setPublicationPublicStatus updates only the requested Publication and preserves its owned configuration', async () => {
  await withMigratedDatabase(async (database) => {
    const target = await insertPublication(
      database,
      publicationInput('target', 'private'),
    );
    const other = await insertPublication(
      database,
      publicationInput('other', 'public'),
    );
    const source = await insertSource(database, target.id, sourceInput());
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
    const madePublic = await setPublicationPublicStatus(
      database,
      target.slug,
      'public',
    );
    assert.ok(madePublic);
    assert.equal(madePublic.publicStatus, 'public');
    assert.equal(madePublic.id, target.id);
    assert.equal(madePublic.name, target.name);
    assert.equal(madePublic.slug, target.slug);
    assert.equal(madePublic.activeForCollection, target.activeForCollection);
    assert.deepEqual(madePublic.createdAt, target.createdAt);
    assert.ok(madePublic.updatedAt > target.updatedAt);
    assert.deepEqual(await findPublicationBySlug(database, other.slug), other);
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

    const madePrivate = await setPublicationPublicStatus(
      database,
      target.slug,
      'private',
    );
    assert.equal(madePrivate?.publicStatus, 'private');
    assert.equal(
      (await findPublicationBySlug(database, other.slug))?.publicStatus,
      'public',
    );
  });
});

test('setPublicationPublicStatus rejects invalid states and leaves a missing slug unchanged', async () => {
  await withMigratedDatabase(async (database) => {
    const publication = await insertPublication(
      database,
      publicationInput('existing', 'private'),
    );
    await assert.rejects(
      setPublicationPublicStatus(database, publication.slug, 'published'),
      ConfigurationValidationError,
    );
    assert.deepEqual(
      await findPublicationBySlug(database, publication.slug),
      publication,
    );
    assert.equal(
      await setPublicationPublicStatus(
        database,
        'missing-publication',
        'public',
      ),
      undefined,
    );
    assert.equal(
      (await database.query('SELECT 1 FROM publications')).rowCount,
      1,
    );
    assert.deepEqual(
      await findPublicationBySlug(database, publication.slug),
      publication,
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

    const madePrivate = await runCommand(
      databaseUrl,
      'technology-bulletin',
      'private',
    );
    assert.match(
      madePrivate.stdout,
      /slug=technology-bulletin, public_status=private/u,
    );
    const madePublic = await runCommand(
      databaseUrl,
      'technology-bulletin',
      'public',
    );
    assert.match(
      madePublic.stdout,
      /slug=technology-bulletin, public_status=public/u,
    );

    const inspector = createDatabase({ connectionString: databaseUrl });
    try {
      assert.equal(
        (await findPublicationBySlug(inspector, 'technology-bulletin'))
          ?.publicStatus,
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

  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const invalidStatus = await runCommandFailure(
      databaseUrl,
      'missing-publication',
      'published',
    );
    assert.match(invalidStatus.stderr, /Invalid publication public status\./u);
    const missingPublication = await runCommandFailure(
      databaseUrl,
      'missing-publication',
      'public',
    );
    assert.match(missingPublication.stderr, /Publication not found\./u);
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      assert.equal(
        (await database.query('SELECT 1 FROM publications')).rowCount,
        0,
      );
    } finally {
      await database.close();
    }
  });

  const secret = 'not-for-output';
  const unavailable = await runCommandFailure(
    `postgresql://invalid:${secret}@127.0.0.1:1/missing`,
    'missing-publication',
    'public',
  );
  assert.match(unavailable.stderr, /Database operation failed\./u);
  assert.doesNotMatch(
    `${unavailable.message}${unavailable.stdout}${unavailable.stderr}`,
    new RegExp(secret, 'u'),
  );
});

async function runCommand(databaseUrl: string, slug: string, status: string) {
  return runNpmCommand(databaseUrl, [slug, status]);
}

async function runCommandFailure(
  databaseUrl?: string,
  slug?: string,
  status?: string,
): Promise<{ message: string; stdout: string; stderr: string }> {
  try {
    await runNpmCommand(
      databaseUrl,
      slug === undefined || status === undefined ? [] : [slug, status],
    );
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

function publicationInput(slug: string, publicStatus: 'private' | 'public') {
  return {
    name: `Publication ${slug}`,
    slug,
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
