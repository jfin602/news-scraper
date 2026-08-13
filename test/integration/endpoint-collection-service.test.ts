import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  CollectionCapacityRequest,
  CollectionCapacityResult,
} from '../../src/collection/concurrency/collection-capacity.ts';
import { executeEndpointCollection } from '../../src/collection/endpoint-collection-service.ts';
import type { CollectEndpointDependencies } from '../../src/collection/collect-endpoint.ts';
import type { ArticleCandidate } from '../../src/collection/normalization/article-candidate.ts';
import type {
  EffectiveRelevanceConfiguration,
  RelevanceDecision,
} from '../../src/collection/relevance/evaluator.ts';
import type { Database, QueryExecutor } from '../../src/database/database.ts';
import type { EndpointConfigurationAggregate } from '../../src/sources/repository.ts';

test('manual and scheduled triggers use one production collection composition', async () => {
  const base = aggregate();
  const configuration: EndpointConfigurationAggregate = {
    ...base,
    endpoint: {
      ...base.endpoint,
      endpointUrl: {
        ...base.endpoint.endpointUrl,
        hostname: 'Feeds.Example.TEST.',
      },
    },
  };
  const observed: CollectEndpointDependencies[] = [];
  const capacityInputs: unknown[] = [];
  const compositionEvents: string[] = [];
  const database = {} as Database;
  const snapshot = Object.freeze({
    sourceId: configuration.source.id,
    sourceEndpointId: configuration.endpoint.id,
    rules: Object.freeze([]),
  });
  const candidate = {} as ArticleCandidate;
  const includedDecision = {
    included: true,
    candidate,
    decisionReason: { kind: 'default_include' },
    categoryAssignments: [],
    categoryReasons: [],
  } as RelevanceDecision;
  const excludedDecision = {
    included: false,
    decisionReason: {
      kind: 'rule_exclude',
      ruleConfigKey: 'exclude_fixture',
      ruleReason: 'Fixture exclusion.',
    },
    categoryAssignments: [],
    categoryReasons: [],
  } as RelevanceDecision;
  const overrides = {
    async findByKeys() {
      return configuration;
    },
    async findById() {
      return configuration;
    },
    async runWithCapacity<T>(
      _database: Pick<Database, 'withSession'>,
      input: CollectionCapacityRequest,
      work: (executor: QueryExecutor) => Promise<T>,
    ): Promise<CollectionCapacityResult<T>> {
      capacityInputs.push(input);
      return {
        status: 'acquired' as const,
        value: await work({} as QueryExecutor),
      };
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
      const loaded = await dependencies.loadRelevanceConfiguration();
      assert.equal(loaded, snapshot);
      dependencies.evaluateRelevance(candidate, loaded);
      await dependencies.persistArticle(
        candidate,
        new Date('2026-08-11T12:00:00.000Z'),
        includedDecision as Extract<
          RelevanceDecision,
          { readonly included: true }
        >,
      );
      await dependencies.persistExcludedArticle(
        candidate,
        new Date('2026-08-11T12:00:00.000Z'),
        excludedDecision as Extract<
          RelevanceDecision,
          { readonly included: false }
        >,
      );
      return {
        status: 'blocked' as const,
        stage: 'lock' as const,
        reason: 'endpoint_locked' as const,
      };
    },
    async applyRuntimeState() {
      throw new Error('blocked work has no runtime state');
    },
    async loadRelevanceConfiguration(
      receivedDatabase: QueryExecutor,
      sourceId: unknown,
      endpointId: unknown,
    ) {
      assert.equal(receivedDatabase, database);
      assert.equal(sourceId, configuration.source.id);
      assert.equal(endpointId, configuration.endpoint.id);
      compositionEvents.push('snapshot');
      return snapshot;
    },
    evaluateRelevance(
      receivedCandidate: ArticleCandidate,
      receivedSnapshot?: EffectiveRelevanceConfiguration,
    ) {
      assert.equal(receivedCandidate, candidate);
      assert.equal(receivedSnapshot, snapshot);
      compositionEvents.push('evaluate');
      return includedDecision;
    },
    async persistIncludedArticle(
      receivedDatabase: Pick<Database, 'transaction'>,
      receivedCandidate: ArticleCandidate,
      _observationTime: Date,
      receivedDecision?: RelevanceDecision,
    ) {
      assert.equal(receivedDatabase, database);
      assert.equal(receivedCandidate, candidate);
      assert.equal(receivedDecision, includedDecision);
      compositionEvents.push('included');
      return { outcome: 'created' as const } as never;
    },
    async persistExcludedArticle(
      receivedDatabase: Pick<Database, 'transaction'>,
      receivedCandidate: ArticleCandidate,
      _observationTime: Date,
      receivedDecision: RelevanceDecision,
    ) {
      assert.equal(receivedDatabase, database);
      assert.equal(receivedCandidate, candidate);
      assert.equal(receivedDecision, excludedDecision);
      compositionEvents.push('excluded');
      return { outcome: 'excluded' as const } as never;
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
  assert.deepEqual(compositionEvents, [
    'snapshot',
    'evaluate',
    'included',
    'excluded',
    'snapshot',
    'evaluate',
    'included',
    'excluded',
  ]);
  assert.deepEqual(capacityInputs, [
    {
      sourceId: configuration.source.id,
      destinationHost: 'feeds.example.test',
    },
    {
      sourceId: configuration.source.id,
      destinationHost: 'feeds.example.test',
    },
  ]);
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
    assert.equal(typeof dependencies.loadRelevanceConfiguration, 'function');
    assert.equal(typeof dependencies.evaluateRelevance, 'function');
    assert.equal(typeof dependencies.persistArticle, 'function');
    assert.equal(typeof dependencies.persistExcludedArticle, 'function');
  }
});

test('capacity blocks each limiting scope before collection or runtime state', async () => {
  const configuration = aggregate();
  for (const limitingScope of ['global', 'source', 'host'] as const) {
    let collectCalls = 0;
    let runtimeCalls = 0;
    let fetcherCalls = 0;
    const result = await executeEndpointCollection(
      {} as Database,
      {
        triggerKind: 'manual',
        sourceConfigKey: 'source',
        endpointConfigKey: 'feed',
        executionId: `blocked-${limitingScope}`,
      },
      {
        async findByKeys() {
          return configuration;
        },
        async runWithCapacity(_database, input) {
          assert.deepEqual(input, {
            sourceId: configuration.source.id,
            destinationHost: 'feeds.example.test',
          });
          return {
            status: 'blocked' as const,
            stage: 'capacity' as const,
            reason: 'collection_capacity_limited' as const,
            limitingScope,
          };
        },
        createFetcher() {
          fetcherCalls += 1;
          throw new Error('capacity-blocked work must not create a fetcher');
        },
        async collect() {
          collectCalls += 1;
          throw new Error('capacity-blocked work must not collect');
        },
        async applyRuntimeState() {
          runtimeCalls += 1;
          throw new Error('capacity-blocked work has no runtime state');
        },
      },
    );

    assert.deepEqual(result, {
      status: 'capacity_blocked',
      stage: 'capacity',
      reason: 'collection_capacity_limited',
      limitingScope,
      sourceId: configuration.source.id,
      endpointId: configuration.endpoint.id,
    });
    assert.equal(fetcherCalls, 0);
    assert.equal(collectCalls, 0);
    assert.equal(runtimeCalls, 0);
  }
});

test('ineligible configuration is blocked before host normalization or capacity', async () => {
  const base = aggregate();
  const configuration: EndpointConfigurationAggregate = {
    ...base,
    endpoint: {
      ...base.endpoint,
      approvalState: 'unapproved',
      endpointUrl: {
        value: 'https://draft.invalid/feed.xml',
        hostname: 'invalid draft host:443',
      },
    },
  };
  let capacityCalls = 0;
  let collectCalls = 0;
  const result = await executeEndpointCollection(
    {} as Database,
    {
      triggerKind: 'manual',
      sourceConfigKey: 'source',
      endpointConfigKey: 'feed',
    },
    {
      async findByKeys() {
        return configuration;
      },
      async runWithCapacity() {
        capacityCalls += 1;
        throw new Error('ineligible work must not acquire capacity');
      },
      async collect() {
        collectCalls += 1;
        throw new Error('ineligible work must not collect');
      },
    },
  );

  assert.deepEqual(result, {
    status: 'resolved',
    sourceId: configuration.source.id,
    endpointId: configuration.endpoint.id,
    collection: {
      status: 'blocked',
      stage: 'eligibility',
      reason: 'endpoint_unapproved',
    },
  });
  assert.equal(capacityCalls, 0);
  assert.equal(collectCalls, 0);
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
    async runWithCapacity<T>(
      _database: Pick<Database, 'withSession'>,
      _input: CollectionCapacityRequest,
      work: (executor: QueryExecutor) => Promise<T>,
    ): Promise<CollectionCapacityResult<T>> {
      return {
        status: 'acquired' as const,
        value: await work({} as QueryExecutor),
      };
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
      description: null,
      logoPath: null,
      accentColor: null,
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
