import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createEditorialAdministrationService } from '../../src/admin/editorial-administration.ts';
import {
  createSourceAdministrationService,
  SourceAdministrationError,
  type SourceAdministrationService,
} from '../../src/admin/source-administration.ts';
import { createDistributionProfileAdministrationService } from '../../src/admin/distribution-profile-administration.ts';
import { createWebApp } from '../../src/app/web/create-app.ts';
import {
  ADMIN_REQUEST_HEADER,
  ADMIN_REQUEST_HEADER_VALUE,
} from '../../src/app/web/admin-api-security.ts';
import { startWebServer } from '../../src/app/web/server.ts';
import { registerEditorialAdministrationRoutes } from '../../src/app/web/editorial-administration-router.ts';
import { registerSourceAdministrationRoutes } from '../../src/app/web/source-administration-router.ts';
import { createCategory } from '../../src/collection/relevance/repository.ts';
import { createDatabase } from '../../src/database/database.ts';
import {
  findSourceByConfigKey,
  insertSourceEndpoint,
  loadEndpointDomainRules,
  loadSourceApprovedDomainRules,
} from '../../src/sources/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

describe('Source administration database service', () => {
  it('creates and reads complete Source configuration with immutable identity and Category reuse', async () => {
    await withSourceAdministration(async ({ database, service }) => {
      await createCategory(database, {
        configKey: 'industry',
        displayName: 'Industry',
      });
      assert.deepEqual(
        await createEditorialAdministrationService(database).listCategories(),
        [{ configKey: 'industry', displayName: 'Industry' }],
      );

      const created = await service.createSource(
        sourceCreateInput({
          defaultCategoryConfigKey: 'industry',
          approvalState: 'unapproved',
          operationalState: 'disabled',
        }),
      );
      assert.deepEqual(created, {
        configKey: 'journal',
        displayName: 'The Journal',
        siteUrl: 'https://journal.example/about',
        approvalState: 'unapproved',
        lifecycleState: 'active',
        operationalState: 'disabled',
        priority: 8,
        approvedDomains: [
          { hostname: 'journal.example', includeSubdomains: true },
        ],
        defaultCategory: {
          configKey: 'industry',
          displayName: 'Industry',
        },
        rssAtomAdmissionIncludePhrases: ['Books', 'Publishing'],
        rssAtomAdmissionExcludePhrases: [],
        endpointCount: 0,
      });
      assert.deepEqual(await service.listSources(), [created]);
      assert.deepEqual(await service.getSource('journal'), created);

      await assertAdminError(
        service.createSource(sourceCreateInput()),
        'source_config_key_conflict',
      );
      await assertAdminError(
        service.replaceSourceConfiguration('journal', {
          ...sourceConfigurationInput(),
          configKey: 'replacement_key',
        }),
        'invalid_request',
      );
      assert.equal((await service.getSource('journal')).configKey, 'journal');
    });
  });

  it('rejects invalid Source values and missing Category references without partial creation', async () => {
    await withSourceAdministration(async ({ service }) => {
      const invalidInputs: readonly unknown[] = [
        { ...sourceCreateInput(), typo: true },
        { ...sourceCreateInput(), siteUrl: '/relative' },
        {
          ...sourceCreateInput(),
          approvedDomains: [{ hostname: 'https://journal.example' }],
        },
        { ...sourceCreateInput(), priority: -1 },
        { ...sourceCreateInput(), rssAtomAdmissionIncludePhrases: [' '] },
      ];
      for (const input of invalidInputs) {
        await assertAdminError(service.createSource(input), 'invalid_request');
      }
      await assertAdminError(
        service.createSource(
          sourceCreateInput({ defaultCategoryConfigKey: 'missing' }),
        ),
        'category_not_found',
      );
      assert.deepEqual(await service.listSources(), []);
    });
  });

  it('consumes separate admission lists with compatible omission, explicit clears, and bounded audit state', async () => {
    await withSourceAdministration(async ({ database, service }) => {
      const legacy = sourceCreateInput();
      delete legacy.rssAtomAdmissionIncludePhrases;
      delete legacy.rssAtomAdmissionExcludePhrases;
      legacy.rssAtomAdmissionPhrases = ['Legacy include'];
      const created = await service.createSource(legacy);
      assert.deepEqual(created.rssAtomAdmissionIncludePhrases, [
        'Legacy include',
      ]);
      assert.deepEqual(created.rssAtomAdmissionExcludePhrases, []);

      const base = sourceConfigurationInput();
      delete base.rssAtomAdmissionIncludePhrases;
      delete base.rssAtomAdmissionExcludePhrases;
      const includeOnly = await service.replaceSourceConfiguration('journal', {
        ...base,
        rssAtomAdmissionIncludePhrases: ['Books only'],
      });
      assert.deepEqual(includeOnly.rssAtomAdmissionIncludePhrases, [
        'Books only',
      ]);
      assert.deepEqual(includeOnly.rssAtomAdmissionExcludePhrases, []);

      const excludeOnly = await service.replaceSourceConfiguration('journal', {
        ...base,
        rssAtomAdmissionExcludePhrases: ['Gossip'],
      });
      assert.deepEqual(excludeOnly.rssAtomAdmissionIncludePhrases, [
        'Books only',
      ]);
      assert.deepEqual(excludeOnly.rssAtomAdmissionExcludePhrases, ['Gossip']);

      const cleared = await service.replaceSourceConfiguration('journal', {
        ...base,
        rssAtomAdmissionExcludePhrases: [],
      });
      assert.deepEqual(cleared.rssAtomAdmissionIncludePhrases, ['Books only']);
      assert.deepEqual(cleared.rssAtomAdmissionExcludePhrases, []);
      const audit = await database.query<{
        readonly prior_state: unknown;
        readonly new_state: unknown;
      }>(
        `SELECT prior_state, new_state FROM audit_events
         WHERE action = 'source_rss_atom_admission_policy_updated'
         ORDER BY occurred_at ASC`,
      );
      assert.equal(audit.rows.length, 3);
      assert.match(JSON.stringify(audit.rows), /Gossip/u);
      assert.doesNotMatch(JSON.stringify(audit.rows), /configKey|siteUrl/u);
    });
  });

  it('validates retained endpoint policies before replacement and rolls back every Source-owned value', async () => {
    await withSourceAdministration(async ({ database, service }) => {
      await createCategory(database, {
        configKey: 'old_category',
        displayName: 'Old category',
      });
      await createCategory(database, {
        configKey: 'new_category',
        displayName: 'New category',
      });
      await service.createSource(
        sourceCreateInput({
          approvedDomains: [
            { hostname: 'example.com', includeSubdomains: true },
          ],
          defaultCategoryConfigKey: 'old_category',
        }),
      );
      const source = await findSourceByConfigKey(database, 'journal');
      assert.ok(source !== undefined);
      const approvedEndpoint = await insertSourceEndpoint(database, source.id, {
        configKey: 'approved_feed',
        endpointUrl: 'https://feeds.example.com/rss.xml',
        endpointType: 'rss_atom',
        approvalState: 'approved',
        lifecycleState: 'active',
        operationalState: 'enabled',
        pollIntervalSeconds: 300,
        endpointDomainRules: [{ hostname: 'feeds.example.com' }],
      });
      const draftEndpoint = await insertSourceEndpoint(database, source.id, {
        configKey: 'draft_feed',
        endpointUrl: 'https://draft.example.com/rss.xml',
        endpointType: 'rss_atom',
        approvalState: 'unapproved',
        lifecycleState: 'active',
        operationalState: 'disabled',
        pollIntervalSeconds: 600,
        endpointDomainRules: [{ hostname: 'draft.example.com' }],
      });
      const before = await service.getSource('journal');

      await assertAdminError(
        service.replaceSourceConfiguration('journal', {
          displayName: 'Should roll back',
          siteUrl: 'https://changed.example.net/',
          approvedDomains: [{ hostname: 'feeds.example.com' }],
          priority: 99,
          defaultCategoryConfigKey: 'new_category',
          rssAtomAdmissionIncludePhrases: [],
          rssAtomAdmissionExcludePhrases: [],
        }),
        'source_domain_policy_conflict',
      );
      assert.deepEqual(await service.getSource('journal'), before);

      const updated = await service.replaceSourceConfiguration('journal', {
        displayName: 'Journal Updated',
        siteUrl: 'https://journal.example/updated',
        approvedDomains: [
          { hostname: 'feeds.example.com' },
          { hostname: 'draft.example.com' },
        ],
        priority: 12,
        defaultCategoryConfigKey: null,
        rssAtomAdmissionIncludePhrases: [],
        rssAtomAdmissionExcludePhrases: [],
      });
      assert.equal(updated.displayName, 'Journal Updated');
      assert.equal(updated.priority, 12);
      assert.equal(updated.defaultCategory, null);
      assert.deepEqual(updated.rssAtomAdmissionIncludePhrases, []);
      assert.deepEqual(
        await loadSourceApprovedDomainRules(database, source.id),
        updated.approvedDomains,
      );
      assert.deepEqual(
        await loadEndpointDomainRules(database, approvedEndpoint.id),
        [{ hostname: 'feeds.example.com', includeSubdomains: false }],
      );
      assert.deepEqual(
        await loadEndpointDomainRules(database, draftEndpoint.id),
        [{ hostname: 'draft.example.com', includeSubdomains: false }],
      );
    });
  });

  it('keeps approval, operation, and lifecycle orthogonal with safe archive and restore behavior', async () => {
    await withSourceAdministration(async ({ service }) => {
      await service.createSource(sourceCreateInput());

      assert.equal(
        (
          await service.setSourceApproval('journal', {
            approvalState: 'unapproved',
          })
        ).approvalState,
        'unapproved',
      );
      assert.equal(
        (
          await service.setSourceApproval('journal', {
            approvalState: 'approved',
          })
        ).approvalState,
        'approved',
      );
      await assertAdminError(
        service.setSourceApproval('journal', {
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
            await service.setSourceOperationalState('journal', {
              operationalState,
            })
          ).operationalState,
          operationalState,
        );
      }

      const archived = await service.setSourceLifecycle('journal', {
        lifecycleState: 'archived',
      });
      assert.equal(archived.lifecycleState, 'archived');
      assert.equal(archived.operationalState, 'disabled');
      assert.equal(archived.approvalState, 'approved');
      await assertAdminError(
        service.setSourceOperationalState('journal', {
          operationalState: 'enabled',
        }),
        'source_archived',
      );

      const restored = await service.setSourceLifecycle('journal', {
        lifecycleState: 'active',
      });
      assert.equal(restored.lifecycleState, 'active');
      assert.equal(restored.operationalState, 'disabled');
      assert.equal(restored.approvalState, 'approved');
    });
  });
});

describe('Source administration HTTP API', () => {
  it('returns bounded 409 when unapproval would strand an active Distribution Profile', async () => {
    await withSourceAdministration(async ({ database, service }) => {
      await service.createSource(sourceCreateInput());
      const profiles = createDistributionProfileAdministrationService(database);
      await profiles.createProfile({
        configKey: 'distribution',
        displayName: 'Distribution',
      });
      await profiles.replaceSourceAssociation('distribution', 'journal', {});
      await profiles.setProfileLifecycle('distribution', {
        lifecycleState: 'active',
      });
      await withAdminServer(true, service, async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/admin/api/sources/journal/approval`,
          {
            method: 'PUT',
            headers: adminJsonHeaders(),
            body: JSON.stringify({ approvalState: 'unapproved' }),
          },
        );
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), {
          error: 'source_required_by_active_profile',
        });
      });
    });
  });

  it('mounts real Source commands behind admin enablement and P3 mutation integrity', async () => {
    await withSourceAdministration(async ({ database, service }) => {
      await createCategory(database, {
        configKey: 'industry',
        displayName: 'Industry',
      });
      const editorialService = createEditorialAdministrationService(database);
      await withAdminServer(
        true,
        service,
        async (baseUrl) => {
          const withoutHeader = await fetch(`${baseUrl}/admin/api/sources`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sourceCreateInput()),
          });
          assert.equal(withoutHeader.status, 403);
          assert.deepEqual(await service.listSources(), []);

          const wrongHeader = await fetch(`${baseUrl}/admin/api/sources`, {
            method: 'POST',
            headers: adminJsonHeaders('wrong'),
            body: JSON.stringify(sourceCreateInput()),
          });
          assert.equal(wrongHeader.status, 403);

          const malformed = await fetch(`${baseUrl}/admin/api/sources`, {
            method: 'POST',
            headers: adminJsonHeaders(),
            body: '{',
          });
          assert.equal(malformed.status, 400);
          assert.deepEqual(await malformed.json(), { error: 'invalid_json' });

          const created = await fetch(`${baseUrl}/admin/api/sources`, {
            method: 'POST',
            headers: adminJsonHeaders(),
            body: JSON.stringify(
              sourceCreateInput({ defaultCategoryConfigKey: 'industry' }),
            ),
          });
          assert.equal(created.status, 201);
          assert.equal((await created.json()).source.configKey, 'journal');

          const categories = await fetch(`${baseUrl}/admin/api/categories`);
          assert.equal(categories.status, 200);
          assert.deepEqual(await categories.json(), {
            categories: [{ configKey: 'industry', displayName: 'Industry' }],
          });
          const categoryMutation = await fetch(
            `${baseUrl}/admin/api/categories`,
            {
              method: 'POST',
              headers: adminJsonHeaders(),
              body: JSON.stringify({
                configKey: 'not_owned_by_phase_14',
                displayName: 'Not created',
              }),
            },
          );
          assert.equal(categoryMutation.status, 201);
          assert.deepEqual(await editorialService.listCategories(), [
            { configKey: 'industry', displayName: 'Industry' },
            {
              configKey: 'not_owned_by_phase_14',
              displayName: 'Not created',
            },
          ]);
          const detail = await fetch(`${baseUrl}/admin/api/sources/journal`);
          assert.equal(detail.status, 200);
          assert.equal((await detail.json()).source.endpointCount, 0);
          const list = await fetch(`${baseUrl}/admin/api/sources`);
          assert.equal(list.status, 200);
          assert.equal((await list.json()).sources.length, 1);

          const configured = await fetch(
            `${baseUrl}/admin/api/sources/journal/configuration`,
            {
              method: 'PUT',
              headers: adminJsonHeaders(),
              body: JSON.stringify({
                ...sourceConfigurationInput(),
                displayName: 'HTTP Updated Journal',
                defaultCategoryConfigKey: null,
                rssAtomAdmissionIncludePhrases: [],
                rssAtomAdmissionExcludePhrases: [],
              }),
            },
          );
          assert.equal(configured.status, 200);
          assert.equal(
            (await configured.json()).source.displayName,
            'HTTP Updated Journal',
          );
          const unapproved = await fetch(
            `${baseUrl}/admin/api/sources/journal/approval`,
            {
              method: 'PUT',
              headers: adminJsonHeaders(),
              body: JSON.stringify({ approvalState: 'unapproved' }),
            },
          );
          assert.equal(unapproved.status, 200);
          assert.equal(
            (await unapproved.json()).source.approvalState,
            'unapproved',
          );
          const paused = await fetch(
            `${baseUrl}/admin/api/sources/journal/operational-state`,
            {
              method: 'PUT',
              headers: adminJsonHeaders(),
              body: JSON.stringify({ operationalState: 'paused' }),
            },
          );
          assert.equal(paused.status, 200);
          assert.equal((await paused.json()).source.operationalState, 'paused');

          const duplicate = await fetch(`${baseUrl}/admin/api/sources`, {
            method: 'POST',
            headers: adminJsonHeaders(),
            body: JSON.stringify(sourceCreateInput()),
          });
          const duplicateBody = await duplicate.text();
          assert.equal(duplicate.status, 409);
          assert.deepEqual(JSON.parse(duplicateBody), {
            error: 'source_config_key_conflict',
          });
          assert.doesNotMatch(
            duplicateBody,
            /23505|sources_config_key_unique|INSERT INTO|stack/iu,
          );

          const archived = await fetch(
            `${baseUrl}/admin/api/sources/journal/lifecycle`,
            {
              method: 'PUT',
              headers: adminJsonHeaders(),
              body: JSON.stringify({ lifecycleState: 'archived' }),
            },
          );
          assert.equal(archived.status, 200);
          assert.equal(
            (await archived.json()).source.operationalState,
            'disabled',
          );
        },
        editorialService,
      );
    });
  });

  it('keeps the real Source API unavailable and non-mutating when admin is disabled', async () => {
    await withSourceAdministration(async ({ service }) => {
      await withAdminServer(false, service, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/admin/api/sources`, {
          method: 'POST',
          headers: adminJsonHeaders(),
          body: JSON.stringify(sourceCreateInput()),
        });
        assert.equal(response.status, 404);
        assert.deepEqual(await service.listSources(), []);
      });
    });
  });
});

function sourceCreateInput(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    configKey: 'journal',
    ...sourceConfigurationInput(),
    approvalState: 'approved',
    operationalState: 'enabled',
    ...overrides,
  };
}

function sourceConfigurationInput(): Record<string, unknown> {
  return {
    displayName: 'The Journal',
    siteUrl: 'https://journal.example/about',
    approvedDomains: [{ hostname: 'journal.example', includeSubdomains: true }],
    priority: 8,
    defaultCategoryConfigKey: null,
    rssAtomAdmissionIncludePhrases: ['Books', 'Publishing'],
    rssAtomAdmissionExcludePhrases: [],
  };
}

async function assertAdminError(
  promise: Promise<unknown>,
  code: SourceAdministrationError['code'],
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof SourceAdministrationError);
    assert.equal(error.code, code);
    return true;
  });
}

async function withSourceAdministration(
  work: (context: {
    database: ReturnType<typeof createDatabase>;
    service: SourceAdministrationService;
  }) => Promise<void>,
): Promise<void> {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const database = createDatabase({ connectionString: databaseUrl });
    try {
      await work({
        database,
        service: createSourceAdministrationService(database),
      });
    } finally {
      await database.close();
    }
  });
}

async function withAdminServer(
  adminEnabled: boolean,
  service: SourceAdministrationService,
  work: (baseUrl: string) => Promise<void>,
  editorialService?: ReturnType<typeof createEditorialAdministrationService>,
): Promise<void> {
  const sourceRoutes = registerSourceAdministrationRoutes(service);
  const registerAdminApiRoutes =
    editorialService === undefined
      ? sourceRoutes
      : (router: Parameters<typeof sourceRoutes>[0]) => {
          sourceRoutes(router);
          registerEditorialAdministrationRoutes(editorialService)(router);
        };
  const server = await startWebServer(
    createWebApp(
      {
        readiness: { checkReady: async () => true },
        publicFeed: { read: async () => undefined },
      },
      {
        adminEnabled,
        registerAdminApiRoutes,
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

function adminJsonHeaders(
  headerValue = ADMIN_REQUEST_HEADER_VALUE,
): Record<string, string> {
  return {
    [ADMIN_REQUEST_HEADER]: headerValue,
    'Content-Type': 'application/json',
  };
}
