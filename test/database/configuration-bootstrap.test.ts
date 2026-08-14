import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  bootstrapPublicationTree,
  normalizeBootstrapDocument,
  parseBootstrapDocument,
  type BootstrapDocument,
} from '../../src/publication/bootstrap.ts';
import { createDatabase, type Database } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  readPublicationSettings,
  setPublicationPublicStatus,
} from '../../src/publication/repository.ts';
import {
  findSourceByConfigKey,
  findSourceEndpointBySourceAndConfigKey,
  loadEndpointDomainRules,
  loadSourceApprovedDomainRules,
} from '../../src/sources/repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const execFileAsync = promisify(execFile);
const fixtureUrl = new URL(
  '../fixtures/generic-bootstrap.json',
  import.meta.url,
);

test('bootstrap creates approved configuration idempotently and preserves operator changes', async () => {
  await withMigratedDatabase(async (database) => {
    const rawDocument = rawFixture();
    rawDocument.publication.description = 'Bootstrap description';
    rawDocument.publication.logoPath = '/assets/bootstrap-logo.svg';
    rawDocument.publication.accentColor = '#aBc123';
    rawDocument.publication.presentationTimezone = 'America/Chicago';
    const document = normalizeBootstrapDocument(rawDocument);
    assert.deepEqual(await bootstrapPublicationTree(database, document), {
      publicationCreated: true,
      sourcesCreated: 2,
      endpointsCreated: 2,
    });
    assert.deepEqual(await bootstrapPublicationTree(database, document), {
      publicationCreated: false,
      sourcesCreated: 0,
      endpointsCreated: 0,
    });
    assert.deepEqual(await cardinalities(database), [1, 2, 2, 2, 1]);

    const publication = await readPublicationSettings(database);
    assert.ok(publication);
    assert.equal(publication.description, 'Bootstrap description');
    assert.equal(publication.logoPath, '/assets/bootstrap-logo.svg');
    assert.equal(publication.accentColor, '#ABC123');
    assert.equal(publication.presentationTimezone, 'America/Chicago');
    const source = await findSourceByConfigKey(database, 'circuit_journal');
    assert.ok(source);
    const endpoint = await findSourceEndpointBySourceAndConfigKey(
      database,
      source.id,
      'main_feed',
    );
    assert.ok(endpoint);
    assert.equal(source.approvalState, 'approved');
    assert.equal(endpoint.approvalState, 'approved');

    await database.query(
      `UPDATE publication_settings
       SET name = 'Operator Technology Desk', active_for_collection = false,
           description = 'Operator description',
           logo_path = '/operator/logo.svg',
           accent_color = '#0A1B2C',
           presentation_timezone = 'America/Denver'`,
    );
    assert.equal(
      (await setPublicationPublicStatus(database, 'private'))?.publicStatus,
      'private',
    );
    await database.query(
      `UPDATE sources
       SET display_name = 'Operator Circuit Desk',
           site_url = 'https://operator.example/source',
           approval_state = 'unapproved', lifecycle_state = 'archived',
           operational_state = 'disabled'
       WHERE id = $1`,
      [source.id],
    );
    await database.query(
      'DELETE FROM source_approved_domain_rules WHERE source_id = $1',
      [source.id],
    );
    await database.query(
      `INSERT INTO source_approved_domain_rules
         (source_id, hostname, include_subdomains)
       VALUES ($1, 'operator.example', false)`,
      [source.id],
    );
    await database.query(
      `UPDATE source_endpoints
       SET endpoint_url = 'https://operator.example/managed.xml',
           approval_state = 'unapproved', lifecycle_state = 'archived',
           operational_state = 'paused', poll_interval_seconds = 1800
       WHERE id = $1`,
      [endpoint.id],
    );
    await database.query(
      'DELETE FROM source_endpoint_domain_rules WHERE source_endpoint_id = $1',
      [endpoint.id],
    );
    await database.query(
      `INSERT INTO source_endpoint_domain_rules
         (source_endpoint_id, hostname, include_subdomains)
       VALUES ($1, 'operator.example', false)`,
      [endpoint.id],
    );

    assert.deepEqual(await bootstrapPublicationTree(database, document), {
      publicationCreated: false,
      sourcesCreated: 0,
      endpointsCreated: 0,
    });
    const preservedPublication = await readPublicationSettings(database);
    const preservedSource = await findSourceByConfigKey(
      database,
      'circuit_journal',
    );
    const preservedEndpoint = await findSourceEndpointBySourceAndConfigKey(
      database,
      source.id,
      'main_feed',
    );
    assert.equal(preservedPublication?.name, 'Operator Technology Desk');
    assert.equal(preservedPublication?.activeForCollection, false);
    assert.equal(preservedPublication?.publicStatus, 'private');
    assert.equal(preservedPublication?.description, 'Operator description');
    assert.equal(preservedPublication?.logoPath, '/operator/logo.svg');
    assert.equal(preservedPublication?.accentColor, '#0A1B2C');
    assert.equal(preservedPublication?.presentationTimezone, 'America/Denver');
    assert.equal(preservedSource?.displayName, 'Operator Circuit Desk');
    assert.equal(
      preservedSource?.siteUrl.value,
      'https://operator.example/source',
    );
    assert.equal(preservedSource?.approvalState, 'unapproved');
    assert.equal(preservedSource?.lifecycleState, 'archived');
    assert.equal(preservedSource?.operationalState, 'disabled');
    assert.deepEqual(await loadSourceApprovedDomainRules(database, source.id), [
      { hostname: 'operator.example', includeSubdomains: false },
    ]);
    assert.equal(
      preservedEndpoint?.endpointUrl.value,
      'https://operator.example/managed.xml',
    );
    assert.equal(preservedEndpoint?.approvalState, 'unapproved');
    assert.equal(preservedEndpoint?.lifecycleState, 'archived');
    assert.equal(preservedEndpoint?.operationalState, 'paused');
    assert.equal(preservedEndpoint?.pollIntervalSeconds, 1800);
    assert.deepEqual(await loadEndpointDomainRules(database, endpoint.id), [
      { hostname: 'operator.example', includeSubdomains: false },
    ]);
    assert.equal(
      (
        await database.query(
          'SELECT 1 FROM source_endpoints WHERE endpoint_url = $1',
          ['https://feeds.circuit.example/news.xml'],
        )
      ).rowCount,
      0,
    );
    assert.deepEqual(await cardinalities(database), [1, 2, 2, 2, 1]);
  });
});

test('persisted Source policy governs new endpoints and failure rolls back the whole tree', async () => {
  await withMigratedDatabase(async (database) => {
    const original = await fixtureDocument();
    await bootstrapPublicationTree(database, original);
    const publication = await readPublicationSettings(database);
    assert.ok(publication);
    const source = await findSourceByConfigKey(database, 'circuit_journal');
    assert.ok(source);
    await database.query(
      'DELETE FROM source_approved_domain_rules WHERE source_id = $1',
      [source.id],
    );
    await database.query(
      `INSERT INTO source_approved_domain_rules
         (source_id, hostname, include_subdomains)
       VALUES ($1, 'www.circuit.example', false)`,
      [source.id],
    );

    const changed = rawFixture();
    changed.sources.unshift({
      configKey: 'early_source',
      displayName: 'Early Source',
      siteUrl: 'https://early.example/',
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
      domainRules: [{ hostname: 'early.example' }],
      endpoints: [],
    });
    changed.sources[1]!.endpoints.push({
      configKey: 'later_feed',
      endpointUrl: 'https://feeds.circuit.example/later.xml',
      endpointType: 'rss_atom',
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
      pollIntervalSeconds: 600,
    });
    const changedDocument = normalizeBootstrapDocument(changed);

    await assert.rejects(
      bootstrapPublicationTree(database, changedDocument),
      /hostname_outside_effective_domain_policy/u,
    );
    assert.equal(
      await findSourceByConfigKey(database, 'early_source'),
      undefined,
    );
    assert.equal(
      await findSourceEndpointBySourceAndConfigKey(
        database,
        source.id,
        'later_feed',
      ),
      undefined,
    );
    assert.deepEqual(await loadSourceApprovedDomainRules(database, source.id), [
      { hostname: 'www.circuit.example', includeSubdomains: false },
    ]);
  });
});

test('concurrent bootstraps converge on one complete stable tree', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const first = createDatabase({ connectionString: databaseUrl });
    const second = createDatabase({ connectionString: databaseUrl });
    try {
      const document = await fixtureDocument();
      await Promise.all([
        bootstrapPublicationTree(first, document),
        bootstrapPublicationTree(second, document),
      ]);
      assert.deepEqual(await cardinalities(first), [1, 2, 2, 2, 1]);
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });
});

test('generic CLI persists the synthetic tree and reruns idempotently', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const environment = {
      ...process.env,
      NEWS_SCRAPER_DATABASE_URL: databaseUrl,
    };
    const arguments_ = [
      'scripts/bootstrap-database.ts',
      fileURLToPath(fixtureUrl),
    ];
    const first = await execFileAsync(process.execPath, arguments_, {
      cwd: process.cwd(),
      env: environment,
    });
    const second = await execFileAsync(process.execPath, arguments_, {
      cwd: process.cwd(),
      env: environment,
    });
    assert.match(first.stdout, /publication=created/u);
    assert.match(second.stdout, /publication=existing/u);

    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'news-scraper-bootstrap-'),
    );
    try {
      const malformedPath = join(temporaryDirectory, 'malformed.json');
      await writeFile(malformedPath, '{"publication":', 'utf8');
      const malformed = await execFailure(
        process.execPath,
        ['scripts/bootstrap-database.ts', malformedPath],
        environment,
      );
      assert.match(malformed.stderr, /invalid_json/u);
    } finally {
      await rm(temporaryDirectory, { recursive: true });
    }

    const database = createDatabase({ connectionString: databaseUrl });
    try {
      assert.deepEqual(await cardinalities(database), [1, 2, 2, 2, 1]);
    } finally {
      await database.close();
    }
  });
});

test('CLI failures are bounded and do not leak invalid database credentials', async () => {
  const missing = await execFailure(
    process.execPath,
    ['scripts/bootstrap-database.ts'],
    process.env,
  );
  assert.match(missing.stderr, /Usage: bootstrap-database/u);

  const secret = 'not-for-output';
  const failure = await execFailure(
    process.execPath,
    ['scripts/bootstrap-database.ts', fixturePath()],
    {
      ...process.env,
      NEWS_SCRAPER_DATABASE_URL: `postgresql://invalid:${secret}@127.0.0.1:1/missing`,
    },
  );
  assert.doesNotMatch(
    `${failure.message}${failure.stdout}${failure.stderr}`,
    new RegExp(secret, 'u'),
  );
});

async function execFailure(
  file: string,
  arguments_: string[],
  environment: NodeJS.ProcessEnv,
): Promise<{ message: string; stdout: string; stderr: string }> {
  try {
    await execFileAsync(file, arguments_, {
      cwd: process.cwd(),
      env: environment,
    });
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    return {
      message: failure.message,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    };
  }
  throw new Error('Expected process to fail.');
}

async function fixtureDocument(): Promise<Readonly<BootstrapDocument>> {
  return parseBootstrapDocument(await readFile(fixtureUrl, 'utf8'));
}

function rawFixture(): {
  publication: Record<string, unknown>;
  sources: Array<
    Record<string, unknown> & { endpoints: Array<Record<string, unknown>> }
  >;
} {
  return JSON.parse(requireFixtureText) as ReturnType<typeof rawFixture>;
}

const requireFixtureText = await readFile(fixtureUrl, 'utf8');

function fixturePath(): string {
  return fileURLToPath(fixtureUrl);
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

async function cardinalities(database: Database): Promise<number[]> {
  const tables = [
    'publication_settings',
    'sources',
    'source_endpoints',
    'source_approved_domain_rules',
    'source_endpoint_domain_rules',
  ];
  const counts: number[] = [];
  for (const table of tables) {
    const result = await database.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${table}`,
    );
    counts.push(Number(result.rows[0]?.count));
  }
  return counts;
}
