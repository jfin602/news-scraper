import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { createDatabase, type Database } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  bootstrapPublicationTree,
  parseBootstrapDocument,
  type BootstrapDocument,
} from '../../src/publication/bootstrap.ts';
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
const bootstrapConfigUrl = new URL(
  '../../config/publication.json',
  import.meta.url,
);

test('committed initial Publication bootstrap persists exactly the approved tree and preserves operator changes', async () => {
  await withMigratedDatabase(async (database) => {
    const document = await initialBootstrapDocument();
    assert.deepEqual(await bootstrapPublicationTree(database, document), {
      publicationCreated: true,
      sourcesCreated: 2,
      endpointsCreated: 2,
    });
    await assertInitialPublicationTree(database);

    assert.deepEqual(await bootstrapPublicationTree(database, document), {
      publicationCreated: false,
      sourcesCreated: 0,
      endpointsCreated: 0,
    });
    await assertInitialPublicationTree(database);

    const publication = await readPublicationSettings(database);
    assert.ok(publication);
    assert.equal(
      (await setPublicationPublicStatus(database, 'private'))?.publicStatus,
      'private',
    );
    const source = await findSourceByConfigKey(database, 'author_media');
    assert.ok(source);
    const endpoint = await findSourceEndpointBySourceAndConfigKey(
      database,
      source.id,
      'site_rss',
    );
    assert.ok(endpoint);

    await database.query(
      "UPDATE sources SET operational_state = 'disabled' WHERE id = $1",
      [source.id],
    );
    await database.query(
      `UPDATE source_endpoints
       SET endpoint_url = 'https://operator.example/managed-feed/',
           poll_interval_seconds = 1800
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
    const preservedSource = await findSourceByConfigKey(
      database,
      'author_media',
    );
    assert.equal(
      (await readPublicationSettings(database))?.publicStatus,
      'private',
    );
    const preservedEndpoint = await findSourceEndpointBySourceAndConfigKey(
      database,
      source.id,
      'site_rss',
    );
    assert.equal(preservedSource?.operationalState, 'disabled');
    assert.equal(
      preservedEndpoint?.endpointUrl.value,
      'https://operator.example/managed-feed/',
    );
    assert.equal(preservedEndpoint?.pollIntervalSeconds, 1800);
    assert.deepEqual(await loadEndpointDomainRules(database, endpoint.id), [
      { hostname: 'operator.example', includeSubdomains: false },
    ]);
    assert.equal(
      (
        await database.query(
          'SELECT 1 FROM source_endpoints WHERE source_id = $1 AND endpoint_url = $2',
          [source.id, 'https://www.authormedia.com/feed/'],
        )
      ).rowCount,
      0,
    );
    assert.deepEqual(await cardinalities(database), [1, 2, 2, 2, 2]);
  });
});

test('db:bootstrap invokes the committed config through the root command', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const first = await runRootBootstrap(databaseUrl);
    const second = await runRootBootstrap(databaseUrl);
    assert.match(first.stdout, /publication=created/u);
    assert.match(second.stdout, /publication=existing/u);
    assert.doesNotMatch(
      `${first.stdout}${first.stderr}`,
      /postgres(?:ql)?:\/\//u,
    );
    assert.doesNotMatch(
      `${second.stdout}${second.stderr}`,
      /postgres(?:ql)?:\/\//u,
    );

    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await assertInitialPublicationTree(database);
    } finally {
      await database.close();
    }
  });
});

async function assertInitialPublicationTree(database: Database): Promise<void> {
  assert.deepEqual(await cardinalities(database), [1, 2, 2, 2, 2]);
  const publication = await readPublicationSettings(database);
  assert.ok(publication);
  assert.equal(publication.name, 'Indie Author Publishing News');
  assert.equal(publication.activeForCollection, true);
  assert.equal(publication.publicStatus, 'public');
  assert.equal(publication.presentationTimezone, null);

  await assertSource(
    database,
    'author_media',
    'Author Media',
    'https://www.authormedia.com/',
    'www.authormedia.com',
    'site_rss',
    'https://www.authormedia.com/feed/',
  );
  await assertSource(
    database,
    'the_creative_penn',
    'The Creative Penn',
    'https://www.thecreativepenn.com/',
    'www.thecreativepenn.com',
    'podcast_rss',
    'https://www.thecreativepenn.com/feed/podcast/',
  );

  const withheld = await database.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM sources
     WHERE config_key = ANY($1::text[])
        OR display_name = ANY($2::text[])
        OR site_url = ANY($3::text[])`,
    [
      ['jane_friedman', 'authors_publish', 'sub_club', 'upstream_reviews'],
      ['Jane Friedman', 'Authors Publish', 'Sub Club', 'Upstream Reviews'],
      [
        'https://janefriedman.com/',
        'https://janefriedman.substack.com/',
        'https://authorspublish.com/',
        'https://subclub.com/',
        'https://upstreamreviews.com/',
      ],
    ],
  );
  assert.equal(Number(withheld.rows[0]?.count), 0);
}

async function assertSource(
  database: Database,
  configKey: string,
  displayName: string,
  siteUrl: string,
  hostname: string,
  endpointConfigKey: string,
  endpointUrl: string,
): Promise<void> {
  const source = await findSourceByConfigKey(database, configKey);
  assert.ok(source);
  assert.equal(source.displayName, displayName);
  assert.equal(source.siteUrl.value, siteUrl);
  assert.equal(source.approvalState, 'approved');
  assert.equal(source.lifecycleState, 'active');
  assert.equal(source.operationalState, 'enabled');
  assert.deepEqual(await loadSourceApprovedDomainRules(database, source.id), [
    { hostname, includeSubdomains: false },
  ]);

  const endpoint = await findSourceEndpointBySourceAndConfigKey(
    database,
    source.id,
    endpointConfigKey,
  );
  assert.ok(endpoint);
  assert.equal(endpoint.endpointUrl.value, endpointUrl);
  assert.equal(endpoint.endpointType, 'rss_atom');
  assert.equal(endpoint.approvalState, 'approved');
  assert.equal(endpoint.lifecycleState, 'active');
  assert.equal(endpoint.operationalState, 'enabled');
  assert.equal(endpoint.pollIntervalSeconds, 21600);
  assert.deepEqual(await loadEndpointDomainRules(database, endpoint.id), [
    { hostname, includeSubdomains: false },
  ]);
}

async function initialBootstrapDocument(): Promise<
  Readonly<BootstrapDocument>
> {
  return parseBootstrapDocument(await readFile(bootstrapConfigUrl, 'utf8'));
}

async function runRootBootstrap(databaseUrl: string) {
  const isWindows = process.platform === 'win32';
  return execFileAsync(
    isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'npm',
    isWindows
      ? ['/d', '/s', '/c', 'npm run db:bootstrap']
      : ['run', 'db:bootstrap'],
    {
      cwd: process.cwd(),
      env: { ...process.env, NEWS_SCRAPER_DATABASE_URL: databaseUrl },
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
