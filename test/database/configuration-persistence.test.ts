import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDatabase } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  findPublicationBySlug,
  insertPublication,
} from '../../src/publications/repository.ts';
import { ConfigurationValidationError } from '../../src/publications/configuration.ts';
import {
  findEndpointConfigurationByKeys,
  findSourceByPublicationAndConfigKey,
  findSourceEndpointBySourceAndConfigKey,
  insertSource,
  insertSourceEndpoint,
  loadEndpointDomainRules,
  loadSourceApprovedDomainRules,
} from '../../src/sources/repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

test('configuration repositories round-trip a complete scoped endpoint aggregate', async () => {
  await withMigratedDatabase(async (database) => {
    const publication = await insertPublication(database, {
      name: 'General news',
      slug: 'general-news',
      activeForCollection: true,
      publicStatus: 'private',
    });
    const source = await insertSource(
      database,
      publication.id,
      sourceInput({
        approvalState: 'unapproved',
        lifecycleState: 'archived',
        operationalState: 'paused',
        domainRules: [
          { hostname: 'z.example.com' },
          { hostname: 'example.com', includeSubdomains: true },
        ],
      }),
    );
    const endpoint = await insertSourceEndpoint(
      database,
      source.id,
      endpointInput({
        approvalState: 'unapproved',
        lifecycleState: 'archived',
        operationalState: 'disabled',
        endpointDomainRules: [{ hostname: 'feeds.example.com' }],
      }),
    );

    assert.deepEqual(
      await findPublicationBySlug(database, publication.slug),
      publication,
    );
    assert.deepEqual(
      await findSourceByPublicationAndConfigKey(
        database,
        publication.id,
        source.configKey,
      ),
      source,
    );
    assert.deepEqual(
      await findSourceEndpointBySourceAndConfigKey(
        database,
        source.id,
        endpoint.configKey,
      ),
      endpoint,
    );
    assert.deepEqual(await loadSourceApprovedDomainRules(database, source.id), [
      { hostname: 'example.com', includeSubdomains: true },
      { hostname: 'z.example.com', includeSubdomains: false },
    ]);
    assert.deepEqual(await loadEndpointDomainRules(database, endpoint.id), [
      { hostname: 'feeds.example.com', includeSubdomains: false },
    ]);

    assert.deepEqual(
      await findEndpointConfigurationByKeys(
        database,
        'general-news',
        'primary_source',
        'main_feed',
      ),
      {
        publication,
        source,
        sourceDomainRules: [
          { hostname: 'example.com', includeSubdomains: true },
          { hostname: 'z.example.com', includeSubdomains: false },
        ],
        endpoint,
        endpointDomainRules: [
          { hostname: 'feeds.example.com', includeSubdomains: false },
        ],
      },
    );
  });
});

test('stable configuration keys remain isolated by their owning Publication and Source', async () => {
  await withMigratedDatabase(async (database) => {
    const firstPublication = await insertPublication(
      database,
      publicationInput('first'),
    );
    const secondPublication = await insertPublication(
      database,
      publicationInput('second'),
    );
    const firstSource = await insertSource(
      database,
      firstPublication.id,
      sourceInput(),
    );
    const secondSource = await insertSource(
      database,
      secondPublication.id,
      sourceInput(),
    );
    const firstEndpoint = await insertSourceEndpoint(
      database,
      firstSource.id,
      endpointInput(),
    );
    const secondEndpoint = await insertSourceEndpoint(
      database,
      secondSource.id,
      endpointInput({ endpointUrl: 'https://feeds.example.com/second.xml' }),
    );

    assert.equal(
      (
        await findSourceByPublicationAndConfigKey(
          database,
          firstPublication.id,
          'primary_source',
        )
      )?.id,
      firstSource.id,
    );
    assert.equal(
      (
        await findSourceByPublicationAndConfigKey(
          database,
          secondPublication.id,
          'primary_source',
        )
      )?.id,
      secondSource.id,
    );
    assert.equal(
      (
        await findSourceEndpointBySourceAndConfigKey(
          database,
          firstSource.id,
          'main_feed',
        )
      )?.id,
      firstEndpoint.id,
    );
    assert.equal(
      (
        await findSourceEndpointBySourceAndConfigKey(
          database,
          secondSource.id,
          'main_feed',
        )
      )?.id,
      secondEndpoint.id,
    );
    assert.equal(
      await findEndpointConfigurationByKeys(
        database,
        'missing',
        'primary_source',
        'main_feed',
      ),
      undefined,
    );
    assert.equal(
      await findEndpointConfigurationByKeys(
        database,
        'first',
        'missing_source',
        'main_feed',
      ),
      undefined,
    );
  });
});

test('repository writes validate policy before insertion while constraints remain authoritative', async () => {
  await withMigratedDatabase(async (database) => {
    await assert.rejects(
      insertPublication(database, {
        ...publicationInput('invalid'),
        slug: 'Invalid',
      }),
      ConfigurationValidationError,
    );
    assert.equal(
      (await database.query('SELECT 1 FROM publications')).rowCount,
      0,
    );

    const publication = await insertPublication(
      database,
      publicationInput('valid'),
    );
    const source = await insertSource(database, publication.id, sourceInput());
    await assert.rejects(
      insertSourceEndpoint(
        database,
        source.id,
        endpointInput({
          endpointUrl: 'https://outside.example.net/feed.xml',
        }),
      ),
      ConfigurationValidationError,
    );
    await assert.rejects(
      insertSourceEndpoint(
        database,
        source.id,
        endpointInput({
          endpointDomainRules: [{ hostname: 'example.net' }],
        }),
      ),
      ConfigurationValidationError,
    );
    assert.equal(
      (await database.query('SELECT 1 FROM source_endpoints')).rowCount,
      0,
    );

    const endpoint = await insertSourceEndpoint(
      database,
      source.id,
      endpointInput(),
    );
    assert.deepEqual(await loadEndpointDomainRules(database, endpoint.id), []);
    await assert.rejects(
      insertSourceEndpoint(database, source.id, endpointInput()),
    );
    await assert.rejects(
      insertSource(
        database,
        '00000000-0000-0000-0000-000000000099',
        sourceInput({ configKey: 'orphan_source' }),
      ),
    );
    await assert.rejects(
      insertSourceEndpoint(
        database,
        '00000000-0000-0000-0000-000000000099',
        endpointInput({
          configKey: 'orphan_endpoint',
          approvalState: 'unapproved',
        }),
      ),
    );
    await assert.rejects(
      database.query(
        `INSERT INTO source_endpoints (
           id, source_id, config_key, endpoint_url, endpoint_type,
           approval_state, lifecycle_state, operational_state, poll_interval_seconds
         ) VALUES (
           '00000000-0000-0000-0000-000000000001', $1, 'raw_invalid',
           'https://feeds.example.com/raw.xml', 'rss_atom', 'invalid', 'active', 'enabled', 59
         )`,
        [source.id],
      ),
    );
    await assert.rejects(
      database.query(
        `INSERT INTO source_endpoints (
           id, source_id, config_key, endpoint_url, endpoint_type,
           approval_state, lifecycle_state, operational_state, poll_interval_seconds
         ) VALUES (
           '00000000-0000-0000-0000-000000000002', $1, 'second_feed',
           $2, 'rss_atom', 'approved', 'active', 'enabled', 300
         )`,
        [source.id, endpoint.endpointUrl.value],
      ),
    );
  });
});

test('caller-owned transactions roll configuration trees back without independent repository commits', async () => {
  await withMigratedDatabase(async (database) => {
    const expectedFailure = new Error('synthetic failure');
    await assert.rejects(
      database.transaction(async (transaction) => {
        const publication = await insertPublication(
          transaction,
          publicationInput('rolled-back'),
        );
        const source = await insertSource(
          transaction,
          publication.id,
          sourceInput(),
        );
        await insertSourceEndpoint(transaction, source.id, endpointInput());
        throw expectedFailure;
      }),
      expectedFailure,
    );
    assert.equal(
      (await database.query('SELECT 1 FROM publications')).rowCount,
      0,
    );
    assert.equal((await database.query('SELECT 1 FROM sources')).rowCount, 0);
    assert.equal(
      (await database.query('SELECT 1 FROM source_approved_domain_rules'))
        .rowCount,
      0,
    );
    assert.equal(
      (await database.query('SELECT 1 FROM source_endpoints')).rowCount,
      0,
    );
    assert.equal(
      (await database.query('SELECT 1 FROM source_endpoint_domain_rules'))
        .rowCount,
      0,
    );
  });
});

async function withMigratedDatabase(
  work: (database: ReturnType<typeof createDatabase>) => Promise<void>,
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

function publicationInput(slug: string) {
  return {
    name: `Publication ${slug}`,
    slug,
    activeForCollection: true,
    publicStatus: 'public',
  } as const;
}

function sourceInput(overrides: Record<string, unknown> = {}) {
  return {
    configKey: 'primary_source',
    displayName: 'Primary source',
    siteUrl: 'https://www.example.com/about',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    domainRules: [{ hostname: 'example.com', includeSubdomains: true }],
    ...overrides,
  };
}

function endpointInput(overrides: Record<string, unknown> = {}) {
  return {
    configKey: 'main_feed',
    endpointUrl: 'https://feeds.example.com/feed.xml',
    endpointType: 'rss_atom',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    pollIntervalSeconds: 300,
    ...overrides,
  };
}
