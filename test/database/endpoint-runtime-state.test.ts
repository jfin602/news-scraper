import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createDatabase } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  bootstrapPublicationTree,
  parseBootstrapDocument,
} from '../../src/publication/bootstrap.ts';
import {
  findSourceByConfigKey,
  findSourceEndpointBySourceAndConfigKey,
  updateEndpointRuntimeState,
} from '../../src/sources/repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const fixtureUrl = new URL(
  '../fixtures/generic-bootstrap.json',
  import.meta.url,
);

test('persists endpoint runtime state without bootstrap or configuration overwrite', async () => {
  await withMigratedDatabase(async (database) => {
    const document = parseBootstrapDocument(await readFile(fixtureUrl, 'utf8'));
    await bootstrapPublicationTree(database, document);
    const source = await findSourceByConfigKey(database, 'circuit_journal');
    assert.ok(source);
    const endpoint = await findSourceEndpointBySourceAndConfigKey(
      database,
      source.id,
      'main_feed',
    );
    assert.ok(endpoint);
    assert.equal(endpoint.nextDueAt, undefined);
    assert.equal(endpoint.lastAttemptAt, undefined);
    assert.equal(endpoint.lastSuccessAt, undefined);
    assert.equal(endpoint.lastFailureAt, undefined);
    assert.equal(endpoint.consecutiveFailureCount, 0);
    assert.equal(endpoint.cooldownUntil, undefined);
    assert.equal(endpoint.etag, undefined);
    assert.equal(endpoint.lastModified, undefined);

    const failedAt = new Date('2026-08-11T12:00:00.000Z');
    const scheduledAt = new Date('2026-08-11T12:05:00.000Z');
    const cooldownUntil = new Date('2026-08-11T12:10:00.000Z');
    const failed = await updateEndpointRuntimeState(database, endpoint.id, {
      completion: { at: failedAt, outcome: 'failed' },
      consecutiveFailureCount: 3,
      nextDueAt: scheduledAt,
      cooldownUntil,
      validators: {
        mode: 'replace',
        values: {
          etag: '"fixture-etag"',
          lastModified: 'Tue, 11 Aug 2026 12:00:00 GMT',
        },
      },
    });
    assert.equal(failed.lastAttemptAt?.toISOString(), failedAt.toISOString());
    assert.equal(failed.lastFailureAt?.toISOString(), failedAt.toISOString());
    assert.equal(failed.lastSuccessAt, undefined);
    assert.equal(failed.consecutiveFailureCount, 3);
    assert.equal(failed.nextDueAt?.toISOString(), scheduledAt.toISOString());
    assert.equal(
      failed.cooldownUntil?.toISOString(),
      cooldownUntil.toISOString(),
    );

    const succeededAt = new Date('2026-08-11T12:15:00.000Z');
    const succeeded = await updateEndpointRuntimeState(database, endpoint.id, {
      completion: { at: succeededAt, outcome: 'succeeded' },
      consecutiveFailureCount: 0,
      cooldownUntil: null,
      validators: {
        mode: 'merge',
        values: { etag: '"fresh-etag"' },
      },
    });
    assert.equal(
      succeeded.lastAttemptAt?.toISOString(),
      succeededAt.toISOString(),
    );
    assert.equal(
      succeeded.lastSuccessAt?.toISOString(),
      succeededAt.toISOString(),
    );
    assert.equal(
      succeeded.lastFailureAt?.toISOString(),
      failedAt.toISOString(),
    );
    assert.equal(succeeded.consecutiveFailureCount, 0);
    assert.equal(succeeded.cooldownUntil, undefined);
    assert.equal(succeeded.etag, '"fresh-etag"');
    assert.equal(succeeded.lastModified, 'Tue, 11 Aug 2026 12:00:00 GMT');

    const replaced = await updateEndpointRuntimeState(database, endpoint.id, {
      validators: {
        mode: 'replace',
        values: { lastModified: 'Tue, 11 Aug 2026 12:15:00 GMT' },
      },
    });
    assert.equal(replaced.etag, undefined);
    assert.equal(replaced.lastModified, 'Tue, 11 Aug 2026 12:15:00 GMT');

    await bootstrapPublicationTree(database, document);
    const preserved = await findSourceEndpointBySourceAndConfigKey(
      database,
      source.id,
      'main_feed',
    );
    assert.equal(
      preserved?.nextDueAt?.toISOString(),
      scheduledAt.toISOString(),
    );
    assert.equal(preserved?.etag, undefined);
    assert.equal(preserved?.lastModified, 'Tue, 11 Aug 2026 12:15:00 GMT');
    assert.equal(preserved?.approvalState, 'approved');
    assert.equal(preserved?.lifecycleState, 'active');
    assert.equal(preserved?.operationalState, 'enabled');
  });
});

test('rejects unsafe endpoint validators and negative runtime counters in repository and schema', async () => {
  await withMigratedDatabase(async (database) => {
    const document = parseBootstrapDocument(await readFile(fixtureUrl, 'utf8'));
    await bootstrapPublicationTree(database, document);
    const source = await findSourceByConfigKey(database, 'circuit_journal');
    assert.ok(source);
    const endpoint = await findSourceEndpointBySourceAndConfigKey(
      database,
      source.id,
      'main_feed',
    );
    assert.ok(endpoint);

    for (const input of [
      { consecutiveFailureCount: -1 },
      { validators: { mode: 'replace', values: { etag: 'unsafe\nvalue' } } },
      {
        validators: {
          mode: 'replace',
          values: { lastModified: 'x'.repeat(1025) },
        },
      },
    ] as const) {
      await assert.rejects(
        updateEndpointRuntimeState(database, endpoint.id, input),
      );
    }
    await assert.rejects(
      database.query(
        'UPDATE source_endpoints SET consecutive_failure_count = -1 WHERE id = $1',
        [endpoint.id],
      ),
    );
    await assert.rejects(
      database.query(
        "UPDATE source_endpoints SET etag = E'unsafe\\nvalue' WHERE id = $1",
        [endpoint.id],
      ),
    );
    await assert.rejects(
      database.query(
        'UPDATE source_endpoints SET last_modified = $1 WHERE id = $2',
        ['x'.repeat(1025), endpoint.id],
      ),
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
