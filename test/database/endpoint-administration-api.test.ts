import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';

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
} from '../../src/app/web/admin-api-security.ts';
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
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

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
        htmlListingProfile: null,
        htmlListingProfileRevision: null,
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

  it('persists canonical HTML profile revisions across create, replacement, and type switches', async () => {
    await withEndpointAdministration(async ({ database, endpoints }) => {
      await insertPublicationSettings(database, {
        name: 'HTML endpoint administration',
        activeForCollection: true,
        publicStatus: 'private',
      });
      const source = await insertAdminSource(database, 'journal');
      const created = await endpoints.createEndpoint(
        'journal',
        endpointCreateInput({
          endpointType: 'html_listing',
          endpointUrl: 'https://feeds.example.com/listing',
          htmlListingProfile: htmlListingProfile(),
        }),
      );
      assert.equal(created.endpointType, 'html_listing');
      assert.deepEqual(created.htmlListingProfile, htmlListingProfile());
      assert.equal(created.htmlListingProfileRevision, 1);

      const same = await endpoints.replaceEndpointConfiguration(
        'journal',
        'main_feed',
        endpointConfigurationInput({
          endpointType: 'html_listing',
          endpointUrl: 'https://feeds.example.com/listing',
          htmlListingProfile: htmlListingProfile(),
        }),
      );
      assert.equal(same.htmlListingProfileRevision, 1);

      const changed = await endpoints.replaceEndpointConfiguration(
        'journal',
        'main_feed',
        endpointConfigurationInput({
          endpointType: 'html_listing',
          endpointUrl: 'https://feeds.example.com/listing',
          htmlListingProfile: htmlListingProfile({ title: { selector: 'h3' } }),
        }),
      );
      assert.equal(changed.htmlListingProfileRevision, 2);

      const rss = await endpoints.replaceEndpointConfiguration(
        'journal',
        'main_feed',
        endpointConfigurationInput({ endpointType: 'rss_atom' }),
      );
      assert.equal(rss.htmlListingProfile, null);
      assert.equal(rss.htmlListingProfileRevision, null);

      const restored = await endpoints.replaceEndpointConfiguration(
        'journal',
        'main_feed',
        endpointConfigurationInput({
          endpointType: 'html_listing',
          endpointUrl: 'https://feeds.example.com/relisted',
          htmlListingProfile: htmlListingProfile(),
        }),
      );
      assert.equal(restored.htmlListingProfileRevision, 1);
      const persistedHtml = await requireEndpoint(
        database,
        source.id,
        'main_feed',
      );
      const run = await startCollectionRun(database, {
        sourceEndpointId: persistedHtml.id,
        executionId: 'html-admin-diagnostics',
      });
      await finalizeCollectionRun(database, run.id, {
        runStatus: 'succeeded',
        transportStatus: 'succeeded',
        parserStatus: 'succeeded',
        parserDiagnostics: {
          kind: 'html_listing',
          version: '1',
          htmlListingProfileRevision: 1,
          itemFailureCount: 2,
          code: 'required_field_missing',
          detail: 'A matched item is missing a required extracted value.',
        },
        normalizationStatus: 'succeeded',
        processingStatus: 'succeeded',
        rawItemCount: 1,
        sourceItemFilteredCount: 0,
        normalizedCandidateCount: 1,
        normalizationFailureCount: 0,
        articleLinkRejectionCount: 0,
        createdCount: 0,
        updatedCount: 0,
        unchangedCount: 1,
        rejectedCount: 0,
        excludedCount: 0,
        failedCount: 0,
        duplicateReviewCreatedCount: 0,
        duplicateGroupedCount: 0,
      });
      const diagnostics = await endpoints.listRecentRuns(
        'journal',
        'main_feed',
      );
      const diagnostic = diagnostics.runs[0];
      assert.equal(diagnostic?.parserKind, 'html_listing');
      assert.equal(diagnostic?.parserVersion, '1');
      assert.equal(diagnostic?.htmlListingProfileRevision, 1);
      assert.equal(diagnostic?.parserItemFailureCount, 2);
      assert.equal(diagnostic?.parserDiagnosticCode, 'required_field_missing');
      assert.equal(
        diagnostic?.parserDiagnosticDetail,
        'A matched item is missing a required extracted value.',
      );
      const job = await endpoints.checkNow('journal', 'main_feed');
      assert.equal(job.disposition, 'queued');
      assert.equal(
        (await requireEndpoint(database, source.id, 'main_feed'))
          .htmlListingProfileRevision,
        1,
      );

      const beforeInvalid = await endpoints.getEndpoint('journal', 'main_feed');
      await assertEndpointError(
        endpoints.replaceEndpointConfiguration(
          'journal',
          'main_feed',
          endpointConfigurationInput({ endpointType: 'html_listing' }),
        ),
        'invalid_request',
      );
      await assertEndpointError(
        endpoints.replaceEndpointConfiguration(
          'journal',
          'main_feed',
          endpointConfigurationInput({
            endpointType: 'rss_atom',
            htmlListingProfile: htmlListingProfile(),
          }),
        ),
        'invalid_request',
      );
      assert.deepEqual(
        await endpoints.getEndpoint('journal', 'main_feed'),
        beforeInvalid,
      );
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

  it('keeps a real database unchanged when the HTTP HTML sample preview succeeds', async () => {
    await withEndpointAdministration(async ({ database, endpoints }) => {
      await insertAdminSource(database, 'journal');
      await endpoints.createEndpoint('journal', endpointCreateInput());
      const before = await database.query<{
        readonly endpoints: number;
        readonly runs: number;
        readonly jobs: number;
        readonly articles: number;
        readonly observations: number;
      }>(
        `SELECT
           (SELECT count(*)::integer FROM source_endpoints) AS endpoints,
           (SELECT count(*)::integer FROM collection_runs) AS runs,
           (SELECT count(*)::integer FROM endpoint_collection_jobs) AS jobs,
           (SELECT count(*)::integer FROM articles) AS articles,
           (SELECT count(*)::integer FROM article_observations) AS observations`,
      );
      await withEndpointAdminServer(endpoints, async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/admin/api/html-listing/preview`,
          {
            method: 'POST',
            headers: adminJsonHeaders(),
            body: JSON.stringify({
              html: '<article class="item"><h2>Preview</h2><a href="/preview">Read</a></article>',
              profile: htmlListingProfile(),
            }),
          },
        );
        assert.equal(response.status, 200);
      });
      const after = await database.query<{
        readonly endpoints: number;
        readonly runs: number;
        readonly jobs: number;
        readonly articles: number;
        readonly observations: number;
      }>(
        `SELECT
           (SELECT count(*)::integer FROM source_endpoints) AS endpoints,
           (SELECT count(*)::integer FROM collection_runs) AS runs,
           (SELECT count(*)::integer FROM endpoint_collection_jobs) AS jobs,
           (SELECT count(*)::integer FROM articles) AS articles,
           (SELECT count(*)::integer FROM article_observations) AS observations`,
      );
      assert.deepEqual(after.rows[0], before.rows[0]);
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
          `${baseUrl}/admin/api/sources/other/endpoints/main_feed`,
        );
        assert.equal(wrongDetail.status, 404);
        assert.deepEqual(await wrongDetail.json(), {
          error: 'endpoint_not_found',
        });

        for (const suffix of ['health', 'runs']) {
          const response = await fetch(
            `${baseUrl}/admin/api/sources/other/endpoints/main_feed/${suffix}`,
          );
          assert.equal(response.status, 404, suffix);
          assert.deepEqual(await response.json(), {
            error: 'endpoint_not_found',
          });
        }

        const wrongCheckNow = await fetch(
          `${baseUrl}/admin/api/sources/other/endpoints/main_feed/check-now`,
          {
            method: 'POST',
            headers: adminJsonHeaders(),
            body: '{}',
          },
        );
        assert.equal(wrongCheckNow.status, 404);
        assert.deepEqual(await wrongCheckNow.json(), {
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
            `${baseUrl}/admin/api/sources/other/endpoints/main_feed/${suffix}`,
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
          `${baseUrl}/admin/api/sources/owner/endpoints/main_feed/approval`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approvalState: 'unapproved' }),
          },
        );
        assert.equal(rejectedByIntegrity.status, 403);

        const rejectedCheckNowByIntegrity = await fetch(
          `${baseUrl}/admin/api/sources/owner/endpoints/main_feed/check-now`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          },
        );
        assert.equal(rejectedCheckNowByIntegrity.status, 403);

        const ownerDetail = await fetch(
          `${baseUrl}/admin/api/sources/owner/endpoints/main_feed`,
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
      const jobs = await database.query<{ readonly count: number }>(
        'SELECT count(*)::integer AS count FROM endpoint_collection_jobs',
      );
      assert.equal(jobs.rows[0]?.count, 0);
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

      const historyBase = Date.now() - 60_000;
      const lastAttemptAt = new Date(historyBase + 3_600_000);
      await updateEndpointRuntimeState(database, endpoint.id, {
        completion: { at: lastAttemptAt, outcome: 'succeeded' },
        consecutiveFailureCount: 0,
        nextDueAt: new Date(historyBase + 3_900_000),
        validators: { mode: 'replace', values: { etag: '"history"' } },
      });

      const enqueued = await enqueueEndpointCollectionJob(database, {
        sourceEndpointId: endpoint.id,
        triggerKind: 'scheduled',
        availableAt: new Date(historyBase),
        attemptNumber: 1,
      });
      const claimed = await claimNextEndpointCollectionJob(database, {
        workerId: 'endpoint-admin-test-worker',
        claimedAt: new Date(historyBase + 60_000),
        leaseExpiresAt: new Date(historyBase + 660_000),
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
        [articleId, source.id, new Date(historyBase + 180_000)],
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
          new Date(historyBase + 180_000),
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
        duplicateReviewCreatedCount: 0,
        duplicateGroupedCount: 0,
      });
      assert.ok(
        await terminalizeEndpointCollectionJob(
          database,
          enqueued.job.id,
          claimed.claimToken,
          {
            status: 'succeeded',
            terminalAt: new Date(historyBase + 240_000),
            outcomeCode: 'content',
          },
        ),
      );

      assert.deepEqual(
        (
          await listDueEndpoints(
            database,
            new Date(historyBase + 7_200_000),
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

  it('enqueues manual check-now durably, idempotently, and without inline collection work', async () => {
    await withEndpointAdministration(async ({ database, endpoints }) => {
      await insertPublicationSettings(database, {
        name: 'Check now administration',
        activeForCollection: true,
        publicStatus: 'private',
      });
      const source = await insertAdminSource(database, 'journal');
      await insertAdminSource(database, 'other');
      await endpoints.createEndpoint('journal', endpointCreateInput());
      const endpoint = await requireEndpoint(database, source.id, 'main_feed');

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
        // A deliberately unsafe persisted URL makes accidental Web-side DNS,
        // safety, fetch, or execution observable. The Worker owns that gate.
        await database.query(
          'UPDATE source_endpoints SET endpoint_url = $2 WHERE id = $1',
          [
            endpoint.id,
            `http://127.0.0.1:${String(address.port)}/must-not-fetch.xml`,
          ],
        );

        const requestedAt = new Date('2026-08-13T14:00:00.000Z');
        const checkNow = createEndpointAdministrationService(database, {
          now: () => requestedAt,
        });
        const results = await Promise.all([
          checkNow.checkNow('journal', 'main_feed'),
          checkNow.checkNow('journal', 'main_feed'),
        ]);
        assert.deepEqual(results.map(({ disposition }) => disposition).sort(), [
          'already_outstanding',
          'queued',
        ]);
        assert.equal(results[0]?.job.id, results[1]?.job.id);
        assert.equal(results[0]?.job.triggerKind, 'manual');
        assert.equal(results[1]?.job.triggerKind, 'manual');
        assert.equal(results[0]?.job.attemptNumber, 1);
        assert.equal(
          results[0]?.job.availableAt.toISOString(),
          requestedAt.toISOString(),
        );
        assert.equal(contactCount, 0);

        const persisted = await database.query<{
          readonly job_count: number;
          readonly run_count: number;
          readonly trigger_kind: string | null;
        }>(
          `SELECT
             count(job.id)::integer AS job_count,
             (SELECT count(*)::integer FROM collection_runs run
              WHERE run.source_endpoint_id = $1) AS run_count,
             min(job.trigger_kind) AS trigger_kind
           FROM endpoint_collection_jobs job
           WHERE job.source_endpoint_id = $1`,
          [endpoint.id],
        );
        assert.deepEqual(persisted.rows[0], {
          job_count: 1,
          run_count: 0,
          trigger_kind: 'manual',
        });

        await assertEndpointError(
          checkNow.checkNow('other', 'main_feed'),
          'endpoint_not_found',
        );

        await endpoints.createEndpoint(
          'journal',
          endpointCreateInput({
            configKey: 'paused_feed',
            endpointUrl: 'https://feeds.example.com/paused.xml',
            operationalState: 'paused',
          }),
        );
        await assert.rejects(
          checkNow.checkNow('journal', 'paused_feed'),
          (error: unknown) => {
            assert.ok(error instanceof EndpointAdministrationError);
            assert.equal(error.code, 'endpoint_not_collectable');
            assert.equal(error.reason, 'endpoint_paused');
            return true;
          },
        );

        await endpoints.createEndpoint(
          'journal',
          endpointCreateInput({
            configKey: 'scheduled_feed',
            endpointUrl: 'https://feeds.example.com/scheduled.xml',
          }),
        );
        const scheduledEndpoint = await requireEndpoint(
          database,
          source.id,
          'scheduled_feed',
        );
        const scheduled = await enqueueEndpointCollectionJob(database, {
          sourceEndpointId: scheduledEndpoint.id,
          triggerKind: 'scheduled',
          availableAt: requestedAt,
          attemptNumber: 1,
        });
        const occupied = await checkNow.checkNow('journal', 'scheduled_feed');
        assert.equal(occupied.disposition, 'already_outstanding');
        assert.equal(occupied.job.id, scheduled.job.id);
        assert.equal(occupied.job.triggerKind, 'scheduled');

        const blockedJobCount = await database.query<{
          readonly count: number;
        }>(
          `SELECT count(*)::integer AS count
           FROM endpoint_collection_jobs job
           JOIN source_endpoints endpoint ON endpoint.id = job.source_endpoint_id
           WHERE endpoint.config_key = 'paused_feed'`,
        );
        assert.equal(blockedJobCount.rows[0]?.count, 0);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    });
  });

  it('reports state-aware health and bounded newest-first endpoint run history', async () => {
    await withEndpointAdministration(async ({ database, endpoints }) => {
      await insertPublicationSettings(database, {
        name: 'Endpoint visibility',
        activeForCollection: true,
        publicStatus: 'private',
      });
      const source = await insertAdminSource(database, 'journal');
      await insertAdminSource(database, 'other');
      await endpoints.createEndpoint('journal', endpointCreateInput());
      await endpoints.createEndpoint('other', endpointCreateInput());
      const endpoint = await requireEndpoint(database, source.id, 'main_feed');
      await updateEndpointRuntimeState(database, endpoint.id, {
        completion: {
          at: new Date('2026-08-13T13:00:00.000Z'),
          outcome: 'succeeded',
        },
        consecutiveFailureCount: 0,
        nextDueAt: new Date('2026-08-13T13:05:00.000Z'),
      });
      await endpoints.setEndpointOperationalState('journal', 'main_feed', {
        operationalState: 'paused',
      });

      const visibility = createEndpointAdministrationService(database, {
        now: () => new Date('2026-08-13T14:00:00.000Z'),
      });
      const health = await visibility.getEndpointHealth('journal', 'main_feed');
      assert.equal(health.endpointOperationalState, 'paused');
      assert.equal(health.derivedHealth, 'healthy');
      assert.equal(health.publicationActiveForCollection, true);
      assert.equal(
        health.lastAttemptAt?.toISOString(),
        '2026-08-13T13:00:00.000Z',
      );
      assert.equal(
        health.lastSuccessAt?.toISOString(),
        '2026-08-13T13:00:00.000Z',
      );
      assert.equal(health.lastFailureAt, null);
      assert.equal(health.pollIntervalSeconds, 300);
      const otherHealth = await visibility.getEndpointHealth(
        'other',
        'main_feed',
      );
      assert.equal(otherHealth.sourceConfigKey, 'other');
      assert.equal(otherHealth.derivedHealth, 'unknown');
      assert.equal(otherHealth.lastAttemptAt, null);
      await assertEndpointError(
        visibility.getEndpointHealth('missing_source', 'main_feed'),
        'source_not_found',
      );

      const runTimes = [
        new Date('2026-08-13T10:00:00.000Z'),
        new Date('2026-08-13T11:00:00.000Z'),
        new Date('2026-08-13T12:00:00.000Z'),
      ];
      const runs = [];
      for (const [index, startedAt] of runTimes.entries()) {
        const run = await startCollectionRun(database, {
          sourceEndpointId: endpoint.id,
          executionId: `visibility-${String(index + 1)}`,
          triggerKind: index === 1 ? 'scheduled' : 'manual',
        });
        await finalizeCollectionRun(database, run.id, {
          runStatus: 'succeeded',
          transportStatus: 'succeeded',
          parserStatus: 'succeeded',
          normalizationStatus: 'succeeded',
          processingStatus: 'succeeded',
          httpStatusCode: 200,
          wireByteCount: 120 + index,
          decompressedByteCount: 240 + index,
          redirectCount: index,
          transportElapsedMilliseconds: 20 + index,
          outcomeCode: 'content',
          rawItemCount: 2 + index,
          sourceItemFilteredCount: index,
          normalizedCandidateCount: 2,
          normalizationFailureCount: 0,
          articleLinkRejectionCount: 0,
          createdCount: 0,
          updatedCount: 0,
          unchangedCount: 2,
          rejectedCount: 0,
          excludedCount: 0,
          failedCount: 0,
          duplicateReviewCreatedCount: 0,
          duplicateGroupedCount: 0,
        });
        await database.query(
          `UPDATE collection_runs
           SET started_at = $2, finished_at = $3
           WHERE id = $1`,
          [run.id, startedAt, new Date(startedAt.getTime() + 30_000)],
        );
        runs.push(run);
      }

      const newestTwo = await visibility.listRecentRuns(
        'journal',
        'main_feed',
        '2',
      );
      assert.equal(newestTwo.limit, 2);
      assert.deepEqual(
        newestTwo.runs.map(({ id }) => id),
        [runs[2]?.id, runs[1]?.id],
      );
      assert.equal(newestTwo.runs[0]?.sourceItemFilteredCount, 2);
      assert.equal(newestTwo.runs[0]?.rawItemCount, 4);
      assert.equal(newestTwo.runs[0]?.httpStatusCode, 200);
      assert.equal(newestTwo.runs[0]?.redirectCount, 2);
      assert.equal(newestTwo.runs[0]?.transportElapsedMilliseconds, 22);
      assert.equal(
        newestTwo.runs[0]?.finishedAt?.toISOString(),
        '2026-08-13T12:00:30.000Z',
      );
      assert.equal(newestTwo.runs[1]?.triggerKind, 'scheduled');

      const defaultWindow = await visibility.listRecentRuns(
        'journal',
        'main_feed',
      );
      assert.equal(defaultWindow.limit, 20);
      assert.equal(defaultWindow.runs.length, 3);
      assert.equal(
        (await visibility.listRecentRuns('other', 'main_feed')).runs.length,
        0,
      );
      await assertEndpointError(
        visibility.listRecentRuns('missing_source', 'main_feed'),
        'source_not_found',
      );
      for (const invalidLimit of [0, 101, '01', '1.5', '', ['1']]) {
        await assertEndpointError(
          visibility.listRecentRuns('journal', 'main_feed', invalidLimit),
          'invalid_request',
        );
      }
      assert.equal(
        (await visibility.listRecentRuns('journal', 'main_feed', 100)).limit,
        100,
      );
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
  await databaseTestScope.use(async ({ databaseUrl }) => {
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

function htmlListingProfile(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    itemSelector: '.item',
    title: { selector: 'h2' },
    articleLink: { selector: 'a' },
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
