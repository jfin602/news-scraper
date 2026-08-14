import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';

import {
  createEndpointAdministrationService,
  EndpointAdministrationError,
  type EndpointAdministrationService,
} from '../../src/admin/endpoint-administration.ts';
import {
  createSourceAdministrationService,
  type SourceAdministrationService,
} from '../../src/admin/source-administration.ts';
import {
  ADMIN_REQUEST_HEADER,
  ADMIN_REQUEST_HEADER_VALUE,
} from '../../src/app/web/admin-router.ts';
import { createWebApp } from '../../src/app/web/create-app.ts';
import { registerEndpointAdministrationRoutes } from '../../src/app/web/endpoint-administration-router.ts';
import { startWebServer } from '../../src/app/web/server.ts';
import { createCategory } from '../../src/collection/relevance/repository.ts';
import { evaluateCollectionEligibility } from '../../src/collection/eligibility.ts';
import {
  finalizeCollectionRun,
  startCollectionRun,
} from '../../src/collection/runs/repository.ts';
import { listDueEndpoints } from '../../src/collection/scheduler/due-endpoint-repository.ts';
import { createDatabase } from '../../src/database/database.ts';
import { migrateDatabase } from '../../src/database/migrations.ts';
import {
  attachCollectionRunToEndpointCollectionJob,
  claimNextEndpointCollectionJob,
  enqueueEndpointCollectionJob,
  terminalizeEndpointCollectionJob,
} from '../../src/jobs/endpoint-collection-job-repository.ts';
import { insertPublicationSettings } from '../../src/publication/repository.ts';
import { readEndpointHealth } from '../../src/sources/endpoint-health.ts';
import {
  findSourceByConfigKey,
  findSourceEndpointBySourceAndConfigKey,
  insertSource,
  updateEndpointRuntimeState,
} from '../../src/sources/repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

describe('Endpoint administration database service', () => {
  it('creates Source-scoped endpoints and reuses the existing default Category relationship', async () => {
    await withEndpointAdministration(async ({ database, endpoints }) => {
      await createCategory(database, {
        configKey: 'industry',
        displayName: 'Industry',
      });
      const firstSource = await insertAdminSource(database, 'first_source');
      const secondSource = await insertAdminSource(database, 'second_source');

      const created = await endpoints.createEndpoint(
        firstSource.configKey,
        endpointCreateInput({ defaultCategoryConfigKey: 'industry' }),
      );
      assert.deepEqual(created, {
        sourceConfigKey: 'first_source',
        configKey: 'main_feed',
        endpointUrl: 'https://feeds.example.com/rss.xml',
        endpointType: 'rss_atom',
        approvalState: 'approved',
        lifecycleState: 'active',
        operationalState: 'enabled',
        pollIntervalSeconds: 300,
        endpointDomainRules: [],
        inheritsSourceDomainPolicy: true,
        defaultCategory: {
          configKey: 'industry',
          displayName: 'Industry',
        },
      });
      assert.deepEqual(await endpoints.listEndpoints('first_source'), [
        created,
      ]);
      assert.deepEqual(
        await endpoints.getEndpoint('first_source', 'main_feed'),
        created,
      );

      await assertEndpointError(
        endpoints.createEndpoint('first_source', endpointCreateInput()),
        'endpoint_config_key_conflict',
      );
      const sameKeyOtherSource = await endpoints.createEndpoint(
        secondSource.configKey,
        endpointCreateInput(),
      );
      assert.equal(sameKeyOtherSource.configKey, 'main_feed');
      assert.equal(sameKeyOtherSource.sourceConfigKey, 'second_source');

      await database.query(
        `UPDATE sources
         SET lifecycle_state = 'archived', operational_state = 'disabled'
         WHERE id = $1`,
        [secondSource.id],
      );
      await assertEndpointError(
        endpoints.createEndpoint(
          'second_source',
          endpointCreateInput({
            configKey: 'another_feed',
            endpointUrl: 'https://feeds.example.com/another.xml',
          }),
        ),
        'source_archived',
      );
    });
  });

  it('validates exact input, domain narrowing, polling, Category references, and preserves runtime state on replacement', async () => {
    await withEndpointAdministration(async ({ database, endpoints }) => {
      const source = await insertAdminSource(database, 'journal');
      await createCategory(database, {
        configKey: 'old_category',
        displayName: 'Old category',
      });
      await createCategory(database, {
        configKey: 'new_category',
        displayName: 'New category',
      });

      const malformed: readonly unknown[] = [
        { ...endpointCreateInput(), typo: true },
        { ...endpointCreateInput(), endpointUrl: '/relative.xml' },
        { ...endpointCreateInput(), endpointType: 'html' },
        { ...endpointCreateInput(), pollIntervalSeconds: 59 },
        { ...endpointCreateInput(), pollIntervalSeconds: 2_592_001 },
      ];
      for (const input of malformed) {
        await assertEndpointError(
          endpoints.createEndpoint('journal', input),
          'invalid_request',
        );
      }
      await assertEndpointError(
        endpoints.createEndpoint(
          'journal',
          endpointCreateInput({
            endpointDomainRules: [{ hostname: 'outside.example.net' }],
          }),
        ),
        'endpoint_domain_policy_conflict',
      );
      await assertEndpointError(
        endpoints.createEndpoint(
          'journal',
          endpointCreateInput({
            endpointUrl: 'https://other.example.com/rss.xml',
            endpointDomainRules: [{ hostname: 'feeds.example.com' }],
          }),
        ),
        'endpoint_domain_policy_conflict',
      );

      const created = await endpoints.createEndpoint(
        'journal',
        endpointCreateInput({ defaultCategoryConfigKey: 'old_category' }),
      );
      const persisted = await findSourceEndpointBySourceAndConfigKey(
        database,
        source.id,
        created.configKey,
      );
      assert.ok(persisted !== undefined);
      const attemptedAt = new Date('2026-08-13T12:00:00.000Z');
      await updateEndpointRuntimeState(database, persisted.id, {
        completion: { at: attemptedAt, outcome: 'failed' },
        consecutiveFailureCount: 2,
        nextDueAt: new Date('2026-08-13T12:05:00.000Z'),
        cooldownUntil: new Date('2026-08-13T12:10:00.000Z'),
        validators: {
          mode: 'replace',
          values: {
            etag: '"retained"',
            lastModified: 'Thu, 13 Aug 2026 12:00:00 GMT',
          },
        },
      });

      const updated = await endpoints.replaceEndpointConfiguration(
        'journal',
        'main_feed',
        endpointConfigurationInput({
          endpointUrl: 'https://feeds.example.com/updated.xml',
          pollIntervalSeconds: 900,
          endpointDomainRules: [{ hostname: 'feeds.example.com' }],
          defaultCategoryConfigKey: 'new_category',
        }),
      );
      assert.equal(updated.inheritsSourceDomainPolicy, false);
      assert.deepEqual(updated.endpointDomainRules, [
        { hostname: 'feeds.example.com', includeSubdomains: false },
      ]);
      assert.deepEqual(updated.defaultCategory, {
        configKey: 'new_category',
        displayName: 'New category',
      });
      const runtime = await findSourceEndpointBySourceAndConfigKey(
        database,
        source.id,
        'main_feed',
      );
      assert.equal(
        runtime?.lastAttemptAt?.toISOString(),
        attemptedAt.toISOString(),
      );
      assert.equal(runtime?.consecutiveFailureCount, 2);
      assert.equal(runtime?.etag, '"retained"');
      assert.equal(runtime?.lastModified, 'Thu, 13 Aug 2026 12:00:00 GMT');

      await assertEndpointError(
        endpoints.replaceEndpointConfiguration('journal', 'main_feed', {
          ...endpointConfigurationInput(),
          configKey: 'changed_key',
        }),
        'invalid_request',
      );
      await assertEndpointError(
        endpoints.replaceEndpointConfiguration(
          'journal',
          'main_feed',
          endpointConfigurationInput({
            defaultCategoryConfigKey: 'missing_category',
          }),
        ),
        'category_not_found',
      );
      await assertEndpointError(
        endpoints.replaceEndpointConfiguration(
          'journal',
          'main_feed',
          endpointConfigurationInput({
            endpointUrl: 'https://outside.example.net/rss.xml',
          }),
        ),
        'endpoint_domain_policy_conflict',
      );
      assert.deepEqual(
        await endpoints.getEndpoint('journal', 'main_feed'),
        updated,
      );

      const cleared = await endpoints.replaceEndpointConfiguration(
        'journal',
        'main_feed',
        endpointConfigurationInput({
          endpointUrl: updated.endpointUrl,
          pollIntervalSeconds: updated.pollIntervalSeconds,
          endpointDomainRules: [],
          defaultCategoryConfigKey: null,
        }),
      );
      assert.equal(cleared.defaultCategory, null);
      assert.equal(cleared.inheritsSourceDomainPolicy, true);
    });
  });

  it('allows safe unapproved edits but never approves an endpoint outside effective policy or contacts it', async () => {
    await withEndpointAdministration(async ({ database, endpoints }) => {
      await insertAdminSource(database, 'journal');
      let contactCount = 0;
      const server = createServer((_request, response) => {
        contactCount += 1;
        response.statusCode = 204;
        response.end();
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      try {
        const address = server.address() as AddressInfo;
        const created = await endpoints.createEndpoint(
          'journal',
          endpointCreateInput({
            configKey: 'draft_feed',
            endpointUrl: `http://127.0.0.1:${String(address.port)}/draft.xml`,
            approvalState: 'unapproved',
            operationalState: 'disabled',
          }),
        );
        assert.equal(created.approvalState, 'unapproved');
        const edited = await endpoints.replaceEndpointConfiguration(
          'journal',
          'draft_feed',
          endpointConfigurationInput({
            endpointUrl: `http://127.0.0.1:${String(address.port)}/edited.xml`,
          }),
        );
        assert.match(edited.endpointUrl, /edited\.xml$/u);
        await assertEndpointError(
          endpoints.setEndpointApproval('journal', 'draft_feed', {
            approvalState: 'approved',
          }),
          'endpoint_domain_policy_conflict',
        );
        assert.equal(contactCount, 0);
        assert.equal(
          (
            await findSourceEndpointBySourceAndConfigKey(
              database,
              (await requireSource(database, 'journal')).id,
              'draft_feed',
            )
          )?.approvalState,
          'unapproved',
        );
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    });
  });

  it('treats endpoint identity as owned by the Source path for every read and mutation', async () => {
    await withEndpointAdministration(async ({ database, endpoints }) => {
      const owner = await insertAdminSource(database, 'owner');
      await insertAdminSource(database, 'other');
      const original = await endpoints.createEndpoint(
        'owner',
        endpointCreateInput(),
      );

      await assertEndpointError(
        endpoints.getEndpoint('other', 'main_feed'),
        'endpoint_not_found',
      );
      await assertEndpointError(
        endpoints.replaceEndpointConfiguration(
          'other',
          'main_feed',
          endpointConfigurationInput(),
        ),
        'endpoint_not_found',
      );
      await assertEndpointError(
        endpoints.setEndpointApproval('other', 'main_feed', {
          approvalState: 'unapproved',
        }),
        'endpoint_not_found',
      );
      await assertEndpointError(
        endpoints.setEndpointOperationalState('other', 'main_feed', {
          operationalState: 'disabled',
        }),
        'endpoint_not_found',
      );
      await assertEndpointError(
        endpoints.setEndpointLifecycle('other', 'main_feed', {
          lifecycleState: 'archived',
        }),
        'endpoint_not_found',
      );
      await assertEndpointError(
        endpoints.getEndpoint('missing_source', 'main_feed'),
        'source_not_found',
      );

      assert.deepEqual(
        await endpoints.getEndpoint('owner', 'main_feed'),
        original,
      );
      const persisted = await findSourceEndpointBySourceAndConfigKey(
        database,
        owner.id,
        'main_feed',
      );
      assert.equal(persisted?.approvalState, 'approved');
      assert.equal(persisted?.lifecycleState, 'active');
      assert.equal(persisted?.operationalState, 'enabled');
    });
  });

  it('returns not found for wrong-Source HTTP requests and keeps P3 integrity ahead of real mutations', async () => {
    await withEndpointAdministration(async ({ database, endpoints }) => {
      const owner = await insertAdminSource(database, 'owner');
      await insertAdminSource(database, 'other');
      await endpoints.createEndpoint('owner', endpointCreateInput());
      const before = await endpoints.getEndpoint('owner', 'main_feed');

      await withEndpointAdminServer(endpoints, async (baseUrl) => {
        const wrongDetail = await fetch(
          `${baseUrl}/api/admin/sources/other/endpoints/main_feed`,
        );
        assert.equal(wrongDetail.status, 404);
        assert.deepEqual(await wrongDetail.json(), {
          error: 'endpoint_not_found',
        });

        for (const [suffix, body] of [
          [
            'configuration',
            endpointConfigurationInput({ pollIntervalSeconds: 600 }),
          ],
          ['approval', { approvalState: 'unapproved' }],
          ['operational-state', { operationalState: 'disabled' }],
          ['lifecycle', { lifecycleState: 'archived' }],
        ] as const) {
          const response = await fetch(
            `${baseUrl}/api/admin/sources/other/endpoints/main_feed/${suffix}`,
            {
              method: 'PUT',
              headers: adminJsonHeaders(),
              body: JSON.stringify(body),
            },
          );
          assert.equal(response.status, 404, suffix);
          assert.deepEqual(await response.json(), {
            error: 'endpoint_not_found',
          });
        }

        const rejectedByIntegrity = await fetch(
          `${baseUrl}/api/admin/sources/owner/endpoints/main_feed/approval`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approvalState: 'unapproved' }),
          },
        );
        assert.equal(rejectedByIntegrity.status, 403);

        const ownerDetail = await fetch(
          `${baseUrl}/api/admin/sources/owner/endpoints/main_feed`,
        );
        const ownerBody = await ownerDetail.text();
        assert.equal(ownerDetail.status, 200);
        assert.deepEqual(JSON.parse(ownerBody), { endpoint: before });
        assert.doesNotMatch(ownerBody, new RegExp(owner.id, 'u'));
        assert.doesNotMatch(
          ownerBody,
          /etag|lastModified|consecutiveFailure/iu,
        );
      });

      assert.deepEqual(
        await endpoints.getEndpoint('owner', 'main_feed'),
        before,
      );
    });
  });

  it('keeps approval, operational state, lifecycle, runtime health, and retained provenance orthogonal', async () => {
    await withEndpointAdministration(async ({ database, endpoints }) => {
      const publication = await insertPublicationSettings(database, {
        name: 'Endpoint administration',
        activeForCollection: true,
        publicStatus: 'private',
      });
      const source = await insertAdminSource(database, 'journal');
      await endpoints.createEndpoint('journal', endpointCreateInput());
      const endpoint = await requireEndpoint(database, source.id, 'main_feed');

      assert.equal(
        (
          await endpoints.setEndpointApproval('journal', 'main_feed', {
            approvalState: 'unapproved',
          })
        ).approvalState,
        'unapproved',
      );
      assert.equal(
        (
          await endpoints.setEndpointApproval('journal', 'main_feed', {
            approvalState: 'approved',
          })
        ).approvalState,
        'approved',
      );
      await assertEndpointError(
        endpoints.setEndpointApproval('journal', 'main_feed', {
          approvalState: 'unapproved',
          operationalState: 'disabled',
        }),
        'invalid_request',
      );
      for (const operationalState of [
        'paused',
        'disabled',
        'enabled',
      ] as const) {
        assert.equal(
          (
            await endpoints.setEndpointOperationalState(
              'journal',
              'main_feed',
              { operationalState },
            )
          ).operationalState,
          operationalState,
        );
      }

      const lastAttemptAt = new Date('2026-08-13T13:00:00.000Z');
      await updateEndpointRuntimeState(database, endpoint.id, {
        completion: { at: lastAttemptAt, outcome: 'succeeded' },
        consecutiveFailureCount: 0,
        nextDueAt: new Date('2026-08-13T13:05:00.000Z'),
        validators: { mode: 'replace', values: { etag: '"history"' } },
      });

      const enqueued = await enqueueEndpointCollectionJob(database, {
        sourceEndpointId: endpoint.id,
        availableAt: new Date('2026-08-13T12:00:00.000Z'),
        attemptNumber: 1,
      });
      const claimed = await claimNextEndpointCollectionJob(database, {
        workerId: 'endpoint-admin-test-worker',
        claimedAt: new Date('2026-08-13T12:01:00.000Z'),
        leaseExpiresAt: new Date('2026-08-13T12:11:00.000Z'),
      });
      assert.equal(claimed?.id, enqueued.job.id);
      assert.ok(claimed?.claimToken !== undefined);
      const run = await startCollectionRun(database, {
        sourceEndpointId: endpoint.id,
        executionId: enqueued.job.id,
        triggerKind: 'scheduled',
      });
      assert.ok(
        await attachCollectionRunToEndpointCollectionJob(
          database,
          enqueued.job.id,
          claimed.claimToken,
          run.id,
          new Date('2026-08-13T12:02:00.000Z'),
        ),
      );
      const articleId = randomUUID();
      await database.query(
        `INSERT INTO articles (
           id, source_id, external_id, original_url, canonical_identity_url,
           display_title, normalized_title, published_at_status,
           source_updated_at_status, first_seen_at, last_seen_at, visibility_state
         ) VALUES (
           $1, $2, 'retained-item', 'https://example.com/article',
           'https://example.com/article', 'Retained article', 'retained article',
           'missing', 'missing', $3, $3, 'visible'
         )`,
        [articleId, source.id, new Date('2026-08-13T12:03:00.000Z')],
      );
      await database.query(
        `INSERT INTO article_observations (
           id, source_id, source_endpoint_id, collection_run_id, article_id,
           observed_at, processing_outcome
         ) VALUES ($1, $2, $3, $4, $5, $6, 'created')`,
        [
          randomUUID(),
          source.id,
          endpoint.id,
          run.id,
          articleId,
          new Date('2026-08-13T12:03:00.000Z'),
        ],
      );
      await finalizeCollectionRun(database, run.id, {
        runStatus: 'succeeded',
        transportStatus: 'succeeded',
        parserStatus: 'succeeded',
        normalizationStatus: 'succeeded',
        processingStatus: 'succeeded',
        rawItemCount: 1,
        sourceItemFilteredCount: 0,
        normalizedCandidateCount: 1,
        normalizationFailureCount: 0,
        articleLinkRejectionCount: 0,
        createdCount: 1,
        updatedCount: 0,
        unchangedCount: 0,
        rejectedCount: 0,
        excludedCount: 0,
        failedCount: 0,
      });
      assert.ok(
        await terminalizeEndpointCollectionJob(
          database,
          enqueued.job.id,
          claimed.claimToken,
          {
            status: 'succeeded',
            terminalAt: new Date('2026-08-13T12:04:00.000Z'),
            outcomeCode: 'content',
          },
        ),
      );

      assert.deepEqual(
        (
          await listDueEndpoints(
            database,
            new Date('2026-08-13T14:00:00.000Z'),
            10,
          )
        ).map(({ id }) => id),
        [endpoint.id],
      );
      const archived = await endpoints.setEndpointLifecycle(
        'journal',
        'main_feed',
        { lifecycleState: 'archived' },
      );
      assert.equal(archived.lifecycleState, 'archived');
      assert.equal(archived.operationalState, 'disabled');
      assert.equal(archived.approvalState, 'approved');
      await assertEndpointError(
        endpoints.setEndpointOperationalState('journal', 'main_feed', {
          operationalState: 'enabled',
        }),
        'endpoint_archived',
      );
      assert.deepEqual(
        await listDueEndpoints(
          database,
          new Date('2026-08-13T14:00:00.000Z'),
          10,
        ),
        [],
      );

      const retained = await requireEndpoint(database, source.id, 'main_feed');
      assert.equal(
        retained.lastAttemptAt?.toISOString(),
        lastAttemptAt.toISOString(),
      );
      assert.equal(retained.etag, '"history"');
      const eligibility = evaluateCollectionEligibility({
        publication,
        source,
        endpoint: retained,
      });
      assert.equal(eligibility.status, 'blocked');
      if (eligibility.status === 'blocked') {
        assert.equal(eligibility.reason, 'endpoint_archived');
      }
      const health = await readEndpointHealth(
        database,
        endpoint.id,
        new Date('2026-08-13T14:00:00.000Z'),
      );
      assert.equal(health?.configuration.endpointLifecycleState, 'archived');
      assert.equal(health?.configuration.endpointOperationalState, 'disabled');
      assert.equal(
        health?.runtime.lastAttemptAt?.toISOString(),
        lastAttemptAt.toISOString(),
      );
      assert.equal(health?.health, 'healthy');

      const provenance = await database.query<{
        readonly runs: number;
        readonly jobs: number;
        readonly observations: number;
      }>(
        `SELECT
           (SELECT count(*)::integer FROM collection_runs WHERE source_endpoint_id = $1) AS runs,
           (SELECT count(*)::integer FROM endpoint_collection_jobs WHERE source_endpoint_id = $1) AS jobs,
           (SELECT count(*)::integer FROM article_observations WHERE source_endpoint_id = $1) AS observations`,
        [endpoint.id],
      );
      assert.deepEqual(provenance.rows[0], {
        runs: 1,
        jobs: 1,
        observations: 1,
      });

      const restored = await endpoints.setEndpointLifecycle(
        'journal',
        'main_feed',
        { lifecycleState: 'active' },
      );
      assert.equal(restored.lifecycleState, 'active');
      assert.equal(restored.operationalState, 'disabled');
      assert.equal(restored.approvalState, 'approved');
    });
  });

  it('serializes Source-domain and endpoint-policy edits without committing a transient invalid relationship', async () => {
    await withEndpointAdministration(async ({ endpoints, sources }) => {
      await sources.createSource(sourceCreateInput());
      await endpoints.createEndpoint('journal', endpointCreateInput());
      const beforeSource = await sources.getSource('journal');
      const beforeEndpoint = await endpoints.getEndpoint(
        'journal',
        'main_feed',
      );

      const [sourceResult, endpointResult] = await Promise.allSettled([
        sources.replaceSourceConfiguration('journal', {
          displayName: 'Journal changed',
          siteUrl: 'https://new.example.net/',
          approvedDomains: [
            { hostname: 'new.example.net', includeSubdomains: true },
          ],
          priority: 10,
          defaultCategoryConfigKey: null,
          rssAtomAdmissionPhrases: [],
        }),
        endpoints.replaceEndpointConfiguration(
          'journal',
          'main_feed',
          endpointConfigurationInput({
            endpointUrl: 'https://feeds.new.example.net/rss.xml',
            endpointDomainRules: [],
          }),
        ),
      ]);
      assert.equal(sourceResult.status, 'rejected');
      assert.equal(endpointResult.status, 'rejected');
      assert.deepEqual(await sources.getSource('journal'), beforeSource);
      assert.deepEqual(
        await endpoints.getEndpoint('journal', 'main_feed'),
        beforeEndpoint,
      );
    });
  });
});

async function withEndpointAdministration(
  work: (context: {
    database: ReturnType<typeof createDatabase>;
    endpoints: EndpointAdministrationService;
    sources: SourceAdministrationService;
  }) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    await migrateDatabase({ connectionString: databaseUrl });
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await work({
        database,
        endpoints: createEndpointAdministrationService(database),
        sources: createSourceAdministrationService(database),
      });
    } finally {
      await database.close();
    }
  });
}

async function insertAdminSource(
  database: ReturnType<typeof createDatabase>,
  configKey: string,
) {
  return insertSource(database, {
    configKey,
    displayName: configKey,
    siteUrl: 'https://www.example.com/',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    domainRules: [{ hostname: 'example.com', includeSubdomains: true }],
  });
}

function sourceCreateInput(): Record<string, unknown> {
  return {
    configKey: 'journal',
    displayName: 'Journal',
    siteUrl: 'https://www.example.com/',
    approvedDomains: [{ hostname: 'example.com', includeSubdomains: true }],
    priority: 1,
    defaultCategoryConfigKey: null,
    rssAtomAdmissionPhrases: [],
    approvalState: 'approved',
    operationalState: 'enabled',
  };
}

function endpointCreateInput(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    configKey: 'main_feed',
    ...endpointConfigurationInput(),
    approvalState: 'approved',
    operationalState: 'enabled',
    ...overrides,
  };
}

function endpointConfigurationInput(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    endpointUrl: 'https://feeds.example.com/rss.xml',
    endpointType: 'rss_atom',
    pollIntervalSeconds: 300,
    endpointDomainRules: [],
    defaultCategoryConfigKey: null,
    ...overrides,
  };
}

async function assertEndpointError(
  promise: Promise<unknown>,
  code: EndpointAdministrationError['code'],
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof EndpointAdministrationError);
    assert.equal(error.code, code);
    return true;
  });
}

async function requireSource(
  database: ReturnType<typeof createDatabase>,
  configKey: string,
) {
  const source = await findSourceByConfigKey(database, configKey);
  assert.ok(source !== undefined);
  return source;
}

async function requireEndpoint(
  database: ReturnType<typeof createDatabase>,
  sourceId: string,
  configKey: string,
) {
  const endpoint = await findSourceEndpointBySourceAndConfigKey(
    database,
    sourceId,
    configKey,
  );
  assert.ok(endpoint !== undefined);
  return endpoint;
}

async function withEndpointAdminServer(
  service: EndpointAdministrationService,
  work: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = await startWebServer(
    createWebApp(
      {
        readiness: { checkReady: async () => true },
        publicFeed: { read: async () => undefined },
      },
      {
        adminEnabled: true,
        registerAdminApiRoutes: registerEndpointAdministrationRoutes(service),
      },
    ),
    { host: '127.0.0.1', port: 0 },
  );
  try {
    await work(`http://${server.host}:${String(server.port)}`);
  } finally {
    await server.close();
  }
}

function adminJsonHeaders(): Record<string, string> {
  return {
    [ADMIN_REQUEST_HEADER]: ADMIN_REQUEST_HEADER_VALUE,
    'Content-Type': 'application/json',
  };
}
