import assert from 'node:assert/strict';
import { test } from 'node:test';

import { executeEndpointCollection } from '../../src/collection/endpoint-collection-service.ts';
import type { CollectEndpointDependencies } from '../../src/collection/collect-endpoint.ts';
import type { Database } from '../../src/database/database.ts';
import type { EndpointConfigurationAggregate } from '../../src/sources/repository.ts';

test('manual and scheduled triggers use one production collection composition', async () => {
  const configuration = aggregate();
  const observed: CollectEndpointDependencies[] = [];
  const database = {} as Database;
  const overrides = {
    async findByKeys() {
      return configuration;
    },
    async findById() {
      return configuration;
    },
    createFetcher() {
      return {
        async fetch() {
          throw new Error('not reached');
        },
      };
    },
    async collect(
      _configuration: EndpointConfigurationAggregate,
      dependencies: CollectEndpointDependencies,
    ) {
      observed.push(dependencies);
      return {
        status: 'blocked' as const,
        stage: 'lock' as const,
        reason: 'endpoint_locked' as const,
      };
    },
    async applyRuntimeState() {
      throw new Error('blocked work has no runtime state');
    },
  };

  const manual = await executeEndpointCollection(
    database,
    {
      triggerKind: 'manual',
      sourceConfigKey: 'source',
      endpointConfigKey: 'feed',
      executionId: 'manual-execution',
    },
    overrides,
  );
  const scheduled = await executeEndpointCollection(
    database,
    {
      triggerKind: 'scheduled',
      sourceEndpointId: configuration.endpoint.id,
      jobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      claimToken: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      attemptNumber: 1,
      now: new Date('2026-08-11T12:00:00.000Z'),
    },
    overrides,
  );

  assert.equal(manual.status, 'resolved');
  assert.equal(scheduled.status, 'resolved');
  assert.equal(observed.length, 2);
  assert.equal(observed[0]?.triggerKind, 'manual');
  assert.equal(observed[1]?.triggerKind, 'scheduled');
  assert.deepEqual(
    observed.map((value) => value.fetchOptions?.validators),
    [
      { etag: '"old"', lastModified: 'Mon, 10 Aug 2026 12:00:00 GMT' },
      { etag: '"old"', lastModified: 'Mon, 10 Aug 2026 12:00:00 GMT' },
    ],
  );
  for (const dependencies of observed) {
    assert.equal(typeof dependencies.normalizeArticleCandidate, 'function');
    assert.equal(typeof dependencies.applyArticleLinkPolicy, 'function');
    assert.equal(typeof dependencies.evaluateRelevance, 'function');
    assert.equal(typeof dependencies.persistArticle, 'function');
  }
});

test('scheduler-root jobs skip obsolete due work while retry successors use availability', async () => {
  const base = aggregate();
  const configuration: EndpointConfigurationAggregate = {
    ...base,
    endpoint: {
      ...base.endpoint,
      nextDueAt: new Date('2026-08-11T13:00:00.000Z'),
    },
  };
  let collectionCalls = 0;
  const overrides = {
    async findById() {
      return configuration;
    },
    async collect() {
      collectionCalls += 1;
      return {
        status: 'blocked' as const,
        stage: 'lock' as const,
        reason: 'endpoint_locked' as const,
      };
    },
  };
  const request = {
    triggerKind: 'scheduled' as const,
    sourceEndpointId: configuration.endpoint.id,
    jobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    claimToken: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    now: new Date('2026-08-11T12:00:00.000Z'),
  };

  const initial = await executeEndpointCollection(
    {} as Database,
    { ...request, attemptNumber: 1 },
    overrides,
  );
  assert.deepEqual(initial, {
    status: 'skipped',
    endpointId: configuration.endpoint.id,
    reason: 'no_longer_due',
  });
  const retry = await executeEndpointCollection(
    {} as Database,
    { ...request, attemptNumber: 2 },
    overrides,
  );
  assert.equal(retry.status, 'resolved');
  assert.equal(collectionCalls, 1);
});

function aggregate(): EndpointConfigurationAggregate {
  const timestamp = new Date('2026-08-11T00:00:00.000Z');
  return {
    publication: {
      name: 'Generic news',
      activeForCollection: true,
      publicStatus: 'private',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    source: {
      id: '11111111-1111-4111-8111-111111111111',
      configKey: 'source',
      displayName: 'Source',
      siteUrl: { value: 'https://example.test/', hostname: 'example.test' },
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    sourceDomainRules: [{ hostname: 'example.test', includeSubdomains: true }],
    endpoint: {
      id: '22222222-2222-4222-8222-222222222222',
      sourceId: '11111111-1111-4111-8111-111111111111',
      configKey: 'feed',
      endpointUrl: {
        value: 'https://feeds.example.test/feed.xml',
        hostname: 'feeds.example.test',
      },
      endpointType: 'rss_atom',
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
      pollIntervalSeconds: 300,
      etag: '"old"',
      lastModified: 'Mon, 10 Aug 2026 12:00:00 GMT',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    endpointDomainRules: [
      { hostname: 'feeds.example.test', includeSubdomains: false },
    ],
  };
}
