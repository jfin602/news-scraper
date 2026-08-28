import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, test } from 'node:test';

import { createDatabase } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  finalizeCollectionRun,
  startCollectionRun,
} from '../../src/collection/runs/repository.ts';
import {
  parseBootstrapDocument,
  bootstrapPublicationTree,
} from '../../src/publication/bootstrap.ts';
import { insertPublicationSettings } from '../../src/publication/repository.ts';
import {
  findEndpointConfigurationByKeys,
  findSourceByConfigKey,
  insertSource,
  insertSourceEndpoint,
} from '../../src/sources/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

test('migrates Source administration foundation from zero with canonical constraints', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    assert.deepEqual(await migrateDatabase({ connectionString: databaseUrl }), [
      '0001_initial_schema.sql',
      '0002_endpoint_runtime_and_run_transport_telemetry.sql',
      '0003_endpoint_collection_jobs.sql',
      '0004_canonical_scheduled_execution.sql',
      '0005_categories_and_relevance.sql',
      '0006_mutable_relevance_rule_history.sql',
      '0007_public_feed_discovery_indexes.sql',
      '0008_publication_presentation.sql',
      '0009_source_administration_foundation.sql',
      '0010_endpoint_collection_job_trigger_kind.sql',
      '0011_publication_presentation_timezone.sql',
      '0012_duplicate_persistence_foundation.sql',
      '0013_article_duplicate_moderation.sql',
      '0014_html_endpoint_profile_and_run_diagnostics.sql',
      '0015_distribution_profiles.sql',
      '0016_distribution_credentials.sql',
      '0017_article_summary_bound.sql',
      '0018_profile_ai_digest_foundation.sql',
    ]);
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      const source = await sourceWithEndpoint(database, {
        priority: 7,
        rssAtomAdmissionPhrases: ['Books', 'Publishing'],
      });
      const found = await findSourceByConfigKey(database, source.configKey);
      assert.equal(found?.priority, 7);
      assert.deepEqual(found?.rssAtomAdmissionPhrases, ['Books', 'Publishing']);
      assert.ok(Object.isFrozen(found?.rssAtomAdmissionPhrases));

      const aggregate = await findEndpointConfigurationByKeys(
        database,
        source.configKey,
        'foundation_feed',
      );
      assert.equal(aggregate?.source.priority, 7);
      assert.deepEqual(aggregate?.source.rssAtomAdmissionPhrases, [
        'Books',
        'Publishing',
      ]);

      await assert.rejects(
        database.query('UPDATE sources SET priority = -1 WHERE id = $1', [
          source.id,
        ]),
      );
      for (const statement of [
        `INSERT INTO source_rss_atom_admission_phrases (source_id, position, phrase)
         VALUES ($1, -1, 'valid')`,
        `INSERT INTO source_rss_atom_admission_phrases (source_id, position, phrase)
         VALUES ($1, 3, ' padded ')`,
        `INSERT INTO source_rss_atom_admission_phrases (source_id, position, phrase)
         VALUES ($1, 0, 'x')`,
      ]) {
        await assert.rejects(database.query(statement, [source.id]));
      }
      await assert.rejects(
        database.query(
          `INSERT INTO source_rss_atom_admission_phrases (source_id, position, phrase)
           VALUES ($1, 3, $2)`,
          [source.id, `unsafe${String.fromCharCode(10)}phrase`],
        ),
      );
    } finally {
      await database.close();
    }
  });
});

test('bootstrap accepts P1 fields only on first Source creation and preserves later state', async () => {
  const existingFixture = await readFile(
    'test/fixtures/generic-bootstrap.json',
    'utf8',
  );
  const oldDocument = parseBootstrapDocument(existingFixture);
  assert.equal(oldDocument.sources[0]?.priority, 0);
  assert.deepEqual(oldDocument.sources[0]?.rssAtomAdmissionPhrases, []);

  const raw = JSON.parse(existingFixture) as {
    publication: unknown;
    sources: Array<Record<string, unknown>>;
  };
  raw.sources[0] = {
    ...raw.sources[0],
    priority: 9,
    rssAtomAdmissionPhrases: ['  Technology  ', 'Research'],
  };
  const document = parseBootstrapDocument(JSON.stringify(raw));
  await withMigratedDatabase(async (database) => {
    await bootstrapPublicationTree(database, document);
    const created = await findSourceByConfigKey(database, 'circuit_journal');
    assert.equal(created?.priority, 9);
    assert.deepEqual(created?.rssAtomAdmissionPhrases, [
      'Technology',
      'Research',
    ]);

    await database.query('UPDATE sources SET priority = 42 WHERE id = $1', [
      created?.id,
    ]);
    await database.query(
      'DELETE FROM source_rss_atom_admission_phrases WHERE source_id = $1',
      [created?.id],
    );
    await database.query(
      `INSERT INTO source_rss_atom_admission_phrases (source_id, position, phrase)
       VALUES ($1, 0, 'Operator managed')`,
      [created?.id],
    );

    await bootstrapPublicationTree(database, document);
    const preserved = await findSourceByConfigKey(database, 'circuit_journal');
    assert.equal(preserved?.priority, 42);
    assert.deepEqual(preserved?.rssAtomAdmissionPhrases, ['Operator managed']);
  });
});

test('Collection-run filtered-item accounting round-trips and preserves downstream totals', async () => {
  await withMigratedDatabase(async (database) => {
    const source = await sourceWithEndpoint(database);
    const endpoint = await findEndpointConfigurationByKeys(
      database,
      source.configKey,
      'foundation_feed',
    );
    assert.ok(endpoint !== undefined);
    const run = await startCollectionRun(database, {
      sourceEndpointId: endpoint.endpoint.id,
      executionId: 'filtered_accounting',
    });
    assert.equal(run.sourceItemFilteredCount, 0);
    const finalized = await finalizeCollectionRun(database, run.id, {
      runStatus: 'succeeded',
      transportStatus: 'succeeded',
      parserStatus: 'succeeded',
      normalizationStatus: 'succeeded',
      processingStatus: 'succeeded',
      rawItemCount: 5,
      sourceItemFilteredCount: 2,
      normalizedCandidateCount: 2,
      normalizationFailureCount: 1,
      articleLinkRejectionCount: 0,
      createdCount: 1,
      updatedCount: 1,
      unchangedCount: 0,
      rejectedCount: 0,
      excludedCount: 0,
      failedCount: 0,
      duplicateReviewCreatedCount: 0,
      duplicateGroupedCount: 0,
    });
    assert.equal(finalized.sourceItemFilteredCount, 2);

    const invalid = await startCollectionRun(database, {
      sourceEndpointId: endpoint.endpoint.id,
      executionId: 'invalid_filtered_accounting',
    });
    await assert.rejects(
      finalizeCollectionRun(database, invalid.id, {
        runStatus: 'succeeded',
        transportStatus: 'succeeded',
        parserStatus: 'succeeded',
        normalizationStatus: 'succeeded',
        processingStatus: 'not_run',
        rawItemCount: 5,
        sourceItemFilteredCount: 2,
        normalizedCandidateCount: 2,
        normalizationFailureCount: 0,
        articleLinkRejectionCount: 0,
        createdCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        rejectedCount: 0,
        excludedCount: 0,
        failedCount: 0,
        duplicateReviewCreatedCount: 0,
        duplicateGroupedCount: 0,
      }),
    );
    await assert.rejects(
      database.query(
        'UPDATE collection_runs SET source_item_filtered_count = 1 WHERE id = $1',
        [invalid.id],
      ),
    );
  });
});

async function withMigratedDatabase(
  work: (database: ReturnType<typeof createDatabase>) => Promise<void>,
): Promise<void> {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await work(database);
    } finally {
      await database.close();
    }
  });
}

async function sourceWithEndpoint(
  database: ReturnType<typeof createDatabase>,
  overrides: Readonly<{
    priority?: number;
    rssAtomAdmissionPhrases?: readonly string[];
  }> = {},
) {
  await insertPublicationSettings(database, {
    name: 'Source administration foundation',
    activeForCollection: true,
    publicStatus: 'private',
  });
  const source = await insertSource(database, {
    configKey: 'foundation_source',
    displayName: 'Foundation Source',
    siteUrl: 'https://source.example/',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    domainRules: [{ hostname: 'example', includeSubdomains: true }],
    priority: overrides.priority,
    rssAtomAdmissionPhrases: overrides.rssAtomAdmissionPhrases,
  });
  await insertSourceEndpoint(database, source.id, {
    configKey: 'foundation_feed',
    endpointUrl: 'https://feeds.example/feed.xml',
    endpointType: 'rss_atom',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    pollIntervalSeconds: 300,
  });
  return source;
}
