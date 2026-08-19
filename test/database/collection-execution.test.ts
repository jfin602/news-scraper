import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import {
  collectEndpoint,
  createCollectionRunStore,
} from '../../src/collection/collect-endpoint.ts';
import { applyArticleLinkPolicy } from '../../src/collection/article-links/policy.ts';
import type { IncludedArticleProcessingResult } from '../../src/collection/included-article-processing.ts';
import { createEndpointExecutionLockRunner } from '../../src/collection/execution.ts';
import type {
  HttpFetcher,
  HttpFetcherResult,
} from '../../src/collection/fetchers/http-fetcher.ts';
import { RssAtomParser } from '../../src/collection/parsers/rss-atom-parser.ts';
import { normalizeArticleCandidate } from '../../src/collection/normalization/normalizer.ts';
import { evaluateRelevance } from '../../src/collection/relevance/evaluator.ts';
import { createDatabase, type Database } from '../../src/database/database.ts';
import {
  bootstrapPublicationTree,
  parseBootstrapDocument,
} from '../../src/publication/bootstrap.ts';
import {
  findEndpointConfigurationByKeys,
  type EndpointConfigurationAggregate,
} from '../../src/sources/repository.ts';
import { createDatabaseTestScope } from '../support/database/database-test-scope.ts';

const databaseTestScope = createDatabaseTestScope('migrated');

after(async () => databaseTestScope.dispose());

test('canonical collection coordinates real endpoint locks, aggregate loading, and truthful runs', async () => {
  await databaseTestScope.use(async ({ databaseUrl }) => {
    const actorA = createDatabase({ connectionString: databaseUrl });
    const actorB = createDatabase({ connectionString: databaseUrl });
    const releaseOwner = deferred<void>();
    let ownerPromise: ReturnType<typeof execute> | undefined;

    try {
      await bootstrapPublicationTree(actorA, syntheticBootstrap());
      const endpointA = await loadEndpoint(actorA, 'feed_a');
      const endpointB = await loadEndpoint(actorA, 'feed_b');

      const ownerEntered = deferred<void>();
      ownerPromise = execute(
        actorA,
        endpointA,
        'execution-a-owner',
        fetcher(async () => {
          ownerEntered.resolve();
          await releaseOwner.promise;
          return contentResult();
        }),
      );
      await ownerEntered.promise;

      let contendingFetchCalls = 0;
      const contended = await execute(
        actorB,
        endpointA,
        'execution-a-contended',
        fetcher(async () => {
          contendingFetchCalls += 1;
          return contentResult();
        }),
      );
      assert.deepEqual(contended, {
        status: 'blocked',
        stage: 'lock',
        reason: 'endpoint_locked',
      });
      assert.equal(contendingFetchCalls, 0);
      assert.equal(await runCount(actorB, endpointA.endpoint.id), 1);

      const independent = await execute(
        actorB,
        endpointB,
        'execution-b-success',
        fetcher(async () => contentResult()),
      );
      assert.equal(independent.status, 'succeeded');

      releaseOwner.resolve();
      assert.equal((await ownerPromise).status, 'succeeded');
      ownerPromise = undefined;

      const fetchFailure = await execute(
        actorB,
        endpointA,
        'execution-a-fetch-failure',
        fetcher(async () => failureResult()),
      );
      assert.equal(fetchFailure.status, 'failed');

      const parserFailure = await execute(
        actorA,
        endpointA,
        'execution-a-parser-failure',
        fetcher(async () => contentResult(Buffer.from('<rss>'))),
      );
      assert.equal(parserFailure.status, 'failed');

      const safetyFailure = await execute(
        actorB,
        endpointA,
        'execution-a-safety-failure',
        fetcher(async () => ({
          status: 'blocked',
          stage: 'network_safety',
          context: 'initial',
          reason: 'unsafe_resolved_address',
        })),
      );
      assert.equal(safetyFailure.status, 'failed');

      const unexpectedFetchFailure = await execute(
        actorB,
        endpointA,
        'execution-a-unexpected-fetch-failure',
        fetcher(async () => {
          throw new Error('synthetic unexpected fetch boundary failure');
        }),
      );
      assert.equal(unexpectedFetchFailure.status, 'failed');
      if (unexpectedFetchFailure.status === 'failed') {
        assert.equal(unexpectedFetchFailure.outcome, 'fetch_failed');
        assert.equal(unexpectedFetchFailure.reason, 'fetch_execution_failed');
      }

      const recovered = await execute(
        actorA,
        endpointA,
        'execution-a-recovered',
        fetcher(async () => contentResult()),
      );
      assert.equal(recovered.status, 'succeeded');

      const persisted = await actorA.query<{
        execution_id: string;
        run_status: string;
        transport_status: string;
        parser_status: string;
        raw_item_count: number;
        error_code: string | null;
      }>(
        `SELECT execution_id, run_status, transport_status, parser_status,
                raw_item_count, error_code
         FROM collection_runs
         ORDER BY started_at, execution_id`,
      );
      assert.equal(persisted.rows.length, 7);
      assert.deepEqual(
        persisted.rows.map((row) => [
          row.execution_id,
          row.run_status,
          row.transport_status,
          row.parser_status,
          Number(row.raw_item_count),
          row.error_code,
        ]),
        [
          ['execution-a-owner', 'succeeded', 'succeeded', 'succeeded', 1, null],
          [
            'execution-b-success',
            'succeeded',
            'succeeded',
            'succeeded',
            1,
            null,
          ],
          [
            'execution-a-fetch-failure',
            'failed',
            'failed',
            'not_run',
            0,
            'connect_timeout',
          ],
          [
            'execution-a-parser-failure',
            'failed',
            'succeeded',
            'failed',
            0,
            'malformed_xml',
          ],
          [
            'execution-a-safety-failure',
            'failed',
            'not_run',
            'not_run',
            0,
            'unsafe_resolved_address',
          ],
          [
            'execution-a-unexpected-fetch-failure',
            'failed',
            'failed',
            'not_run',
            0,
            'fetch_execution_failed',
          ],
          [
            'execution-a-recovered',
            'succeeded',
            'succeeded',
            'succeeded',
            1,
            null,
          ],
        ],
      );
      assert.equal(await runCount(actorA, endpointA.endpoint.id), 6);
      assert.equal(await runCount(actorA, endpointB.endpoint.id), 1);
    } finally {
      releaseOwner.resolve();
      await ownerPromise?.catch(() => undefined);
      await Promise.all([actorA.close(), actorB.close()]);
    }
  });
});

function execute(
  database: Database,
  configuration: EndpointConfigurationAggregate,
  executionId: string,
  endpointFetcher: HttpFetcher,
) {
  return collectEndpoint(configuration, {
    lockRunner: createEndpointExecutionLockRunner(database),
    runs: createCollectionRunStore(database),
    fetcher: endpointFetcher,
    rssAtomParser: new RssAtomParser(),
    normalizeArticleCandidate,
    applyArticleLinkPolicy,
    async loadRelevanceConfiguration() {
      return { rules: [] };
    },
    evaluateRelevance,
    async processIncludedArticle() {
      return {
        outcome: 'created',
        duplicateReviewCreatedCount: 0,
        duplicateGroupedCount: 0,
      } as IncludedArticleProcessingResult;
    },
    async persistExcludedArticle() {
      throw new Error('default-include fixture cannot be excluded');
    },
    observationTime: () => new Date('2026-08-10T12:00:00.000Z'),
    executionId: () => executionId,
  });
}

function fetcher(result: () => Promise<HttpFetcherResult>): HttpFetcher {
  return Object.freeze({ fetch: result });
}

function contentResult(
  content = Buffer.from(
    '<rss><channel><item><guid>fixture-1</guid><title>Fixture</title></item></channel></rss>',
  ),
): HttpFetcherResult {
  return Object.freeze({
    outcome: 'content',
    content,
    mediaType: 'application/rss+xml',
    response: Object.freeze({ contentType: 'application/rss+xml' }),
    finalUrl: 'https://feeds.synthetic.example/feed.xml',
    redirectCount: 0,
    metrics: metrics(200, content.byteLength, content.byteLength),
  });
}

function failureResult(): HttpFetcherResult {
  return Object.freeze({
    outcome: 'failure',
    reason: 'connect_timeout',
    retry: 'transient',
    detail: 'Connection establishment exceeded the configured timeout.',
    finalUrl: 'https://feeds.synthetic.example/feed.xml',
    redirectCount: 0,
    metrics: metrics(undefined, 0, 0),
  });
}

function metrics(
  httpStatus: number | undefined,
  wireBytes: number,
  decompressedBytes: number,
) {
  return Object.freeze({
    elapsedMilliseconds: 5,
    hopCount: 1,
    wireBytes,
    decompressedBytes,
    hops: Object.freeze([
      Object.freeze({
        elapsedMilliseconds: 5,
        ...(httpStatus === undefined ? {} : { httpStatus }),
        wireBytes,
        decompressedBytes,
        selectedAddress: '8.8.8.8',
        selectedAddressFamily: 4 as const,
      }),
    ]),
  });
}

async function loadEndpoint(database: Database, endpointConfigKey: string) {
  const endpoint = await findEndpointConfigurationByKeys(
    database,
    'synthetic_source',
    endpointConfigKey,
  );
  assert.ok(endpoint);
  return endpoint;
}

async function runCount(database: Database, endpointId: string) {
  const result = await database.query<{ count: string }>(
    'SELECT count(*) AS count FROM collection_runs WHERE source_endpoint_id = $1',
    [endpointId],
  );
  return Number(result.rows[0]?.count);
}

function syntheticBootstrap() {
  return parseBootstrapDocument(
    JSON.stringify({
      publication: {
        name: 'Generic collection news',
        activeForCollection: true,
        publicStatus: 'private',
      },
      sources: [
        {
          configKey: 'synthetic_source',
          displayName: 'Synthetic Source',
          siteUrl: 'https://synthetic.example/',
          approvalState: 'approved',
          lifecycleState: 'active',
          operationalState: 'enabled',
          domainRules: [
            { hostname: 'synthetic.example', includeSubdomains: true },
          ],
          endpoints: [
            endpointBootstrap('feed_a', 'a'),
            endpointBootstrap('feed_b', 'b'),
          ],
        },
      ],
    }),
  );
}

function endpointBootstrap(configKey: string, path: string) {
  return {
    configKey,
    endpointUrl: `https://feeds.synthetic.example/${path}.xml`,
    endpointType: 'rss_atom',
    approvalState: 'approved',
    lifecycleState: 'active',
    operationalState: 'enabled',
    pollIntervalSeconds: 300,
    endpointDomainRules: [{ hostname: 'feeds.synthetic.example' }],
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
