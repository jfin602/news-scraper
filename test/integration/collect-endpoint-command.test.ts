import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';

import { runCollectEndpointCommand } from '../../src/app/worker/collect-main.ts';
import type { EndpointCollectionAttemptResult } from '../../src/collection/collect-endpoint.ts';
import type { ArticleCandidate } from '../../src/collection/normalization/article-candidate.ts';
import type { Database } from '../../src/database/database.ts';
import type { EndpointConfigurationAggregate } from '../../src/sources/repository.ts';

const execFileAsync = promisify(execFile);
const KEYS = ['generic_source', 'main_feed'] as const;

describe('manual Worker endpoint collection command', () => {
  it('rejects missing and extra arguments before creating database dependencies', async () => {
    for (const args of [KEYS.slice(0, 1), ['legacy-slug', ...KEYS]]) {
      const stderr = sink();
      let databaseCreated = false;
      const exitCode = await runCollectEndpointCommand({
        args,
        stderr,
        dependencies: {
          createDatabase() {
            databaseCreated = true;
            return fakeDatabase().database;
          },
        },
      });

      assert.equal(exitCode, 2);
      assert.equal(databaseCreated, false);
      assert.deepEqual(stderr.events(), [
        {
          event: 'endpoint_collection.invocation_failed',
          role: 'worker',
          reason: 'invalid_arguments',
          usage:
            'collect:endpoint -- <source-config-key> <endpoint-config-key>',
        },
      ]);
    }
  });

  it('bounds startup failures and never exposes database configuration', async () => {
    const secret = 'SYNTHETIC_DATABASE_SECRET';
    const stderr = sink();
    const exitCode = await runCollectEndpointCommand({
      args: KEYS,
      environment: {
        NODE_ENV: 'test',
        NEWS_SCRAPER_DATABASE_URL: `postgresql://user:${secret}@db.invalid/news`,
      },
      stderr,
      dependencies: {
        createDatabase() {
          return fakeDatabase({ pingFailure: new Error(secret) }).database;
        },
      },
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(stderr.events(), [
      {
        event: 'endpoint_collection.start_failed',
        role: 'worker',
        reason: 'startup_failed',
      },
    ]);
    assert.doesNotMatch(stderr.text, new RegExp(secret, 'u'));
  });

  it('reports unknown endpoint keys without collection/network work and closes the database', async () => {
    const output = sink();
    const fake = fakeDatabase();
    let serviceCalls = 0;
    const exitCode = await runCollectEndpointCommand({
      args: KEYS,
      environment: validEnvironment(),
      stdout: output,
      dependencies: {
        createDatabase: () => fake.database,
        async execute() {
          serviceCalls += 1;
          return { status: 'not_found', reason: 'endpoint_not_found' };
        },
      },
    });

    assert.equal(exitCode, 1);
    assert.equal(serviceCalls, 1);
    assert.equal(fake.closeCalls, 1);
    assert.deepEqual(output.events(), [
      {
        event: 'endpoint_collection.result',
        role: 'worker',
        sourceConfigKey: KEYS[0],
        endpointConfigKey: KEYS[1],
        status: 'blocked',
        reason: 'endpoint_not_found',
      },
    ]);
  });

  it('reports capacity contention as a bounded machine-readable failure', async () => {
    const output = sink();
    const fake = fakeDatabase();
    const configuration = aggregate();
    const exitCode = await runCollectEndpointCommand({
      args: KEYS,
      environment: validEnvironment(),
      stdout: output,
      dependencies: {
        createDatabase: () => fake.database,
        async execute() {
          return {
            status: 'capacity_blocked',
            stage: 'capacity',
            reason: 'collection_capacity_limited',
            limitingScope: 'host',
            sourceId: configuration.source.id,
            endpointId: configuration.endpoint.id,
          };
        },
      },
    });

    assert.equal(exitCode, 1);
    assert.equal(fake.closeCalls, 1);
    assert.deepEqual(output.events(), [
      {
        event: 'endpoint_collection.result',
        role: 'worker',
        sourceConfigKey: KEYS[0],
        endpointConfigKey: KEYS[1],
        sourceId: configuration.source.id,
        endpointId: configuration.endpoint.id,
        status: 'blocked',
        stage: 'capacity',
        reason: 'collection_capacity_limited',
        limitingScope: 'host',
      },
    ]);
  });

  it('emits a bounded successful result without Raw-item bodies and closes resources', async () => {
    const output = sink();
    const fake = fakeDatabase();
    const configuration = aggregate();
    const exitCode = await runCollectEndpointCommand({
      args: KEYS,
      environment: validEnvironment(),
      stdout: output,
      dependencies: {
        createDatabase: () => fake.database,
        async execute(_database, request) {
          assert.equal(request.triggerKind, 'manual');
          if (request.triggerKind !== 'manual') throw new Error('unexpected');
          assert.equal(request.executionId, 'controlled-execution-id');
          assert.equal(request.sourceConfigKey, KEYS[0]);
          assert.equal(request.endpointConfigKey, KEYS[1]);
          return {
            status: 'resolved',
            sourceId: configuration.source.id,
            endpointId: configuration.endpoint.id,
            collection: successfulResult(),
          };
        },
        executionId: () => 'controlled-execution-id',
      },
    });

    assert.equal(exitCode, 0);
    assert.equal(fake.closeCalls, 1);
    assert.equal(output.events().length, 1);
    assert.deepEqual(output.events()[0], {
      event: 'endpoint_collection.result',
      role: 'worker',
      sourceConfigKey: KEYS[0],
      endpointConfigKey: KEYS[1],
      sourceId: configuration.source.id,
      endpointId: configuration.endpoint.id,
      status: 'succeeded',
      outcome: 'content',
      collectionRunId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      executionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      runStatus: 'succeeded',
      transportStatus: 'succeeded',
      parserStatus: 'succeeded',
      rawItemCount: 5,
      normalizationStatus: 'succeeded',
      normalizedCandidateCount: 4,
      normalizationFailureCount: 1,
      articleLinkRejectionCount: 1,
      processingStatus: 'succeeded',
      createdCount: 1,
      updatedCount: 1,
      unchangedCount: 1,
      rejectedCount: 1,
      excludedCount: 0,
      failedCount: 0,
      candidateSample: [0, 1, 2].map((index) => ({
        displayTitle: `Candidate ${String(index + 1)}`,
        originalUrl: `https://example.test/articles/${String(index + 1)}?utm_source=fixture`,
        canonicalIdentityUrl: `https://example.test/articles/${String(index + 1)}`,
        publishedAt: {
          status: 'parsed',
          value: '2026-08-10T12:00:00.000Z',
          fallback: 'first_seen',
        },
        sourceId: configuration.source.id,
        endpointId: configuration.endpoint.id,
        collectionRunId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      })),
      httpStatusCode: 200,
      wireByteCount: 100,
      decompressedByteCount: 200,
      redirectCount: 0,
      elapsedMilliseconds: 10,
    });
    assert.doesNotMatch(output.text, /Raw item body/u);
    assert.doesNotMatch(output.text, /SYNTHETIC_CANDIDATE_SUMMARY_SECRET/u);
    const candidateSample = output.events()[0]?.candidateSample as unknown[];
    assert.equal(candidateSample.length, 3);
  });

  it('omits candidate samples on failed, no-change, and no-safe-candidate results without leaking details', async () => {
    const cases: EndpointCollectionAttemptResult[] = [
      {
        ...baseAttemptResult(),
        status: 'failed',
        outcome: 'normalization_failed',
        runStatus: 'failed',
        normalizationStatus: 'failed',
        rawItemCount: 1,
        reason: 'normalization_execution_failed',
        detail: 'SYNTHETIC_NORMALIZATION_FAILURE_SECRET',
      },
      {
        ...baseAttemptResult(),
        status: 'succeeded',
        outcome: 'not_modified',
        transportStatus: 'not_modified',
        parserStatus: 'not_run',
      },
      {
        ...baseAttemptResult(),
        status: 'succeeded',
        outcome: 'content',
        transportStatus: 'succeeded',
        parserStatus: 'succeeded',
        normalizationStatus: 'succeeded',
        rawItemCount: 1,
        normalizedCandidateCount: 1,
        articleLinkRejectionCount: 1,
        candidates: Object.freeze([]),
      },
    ];

    for (const result of cases) {
      const output = sink();
      const exitCode = await runCollectEndpointCommand({
        args: KEYS,
        environment: validEnvironment(),
        stdout: output,
        dependencies: {
          createDatabase: () => fakeDatabase().database,
          async execute() {
            const configuration = aggregate();
            return Object.freeze({
              status: 'resolved' as const,
              sourceId: configuration.source.id,
              endpointId: configuration.endpoint.id,
              collection: Object.freeze(result),
            });
          },
        },
      });
      assert.equal(exitCode, result.status === 'succeeded' ? 0 : 1);
      assert.equal(output.events()[0]?.candidateSample, undefined);
      assert.doesNotMatch(
        output.text,
        /SYNTHETIC_NORMALIZATION_FAILURE_SECRET/u,
      );
    }
  });

  it('redacts thrown collection details and still closes the database', async () => {
    const secret = 'SYNTHETIC_REMOTE_OR_DATABASE_SECRET';
    const stderr = sink();
    const fake = fakeDatabase();
    const exitCode = await runCollectEndpointCommand({
      args: KEYS,
      environment: validEnvironment(),
      stderr,
      dependencies: {
        createDatabase: () => fake.database,
        async execute() {
          throw new Error(secret);
        },
      },
    });

    assert.equal(exitCode, 1);
    assert.equal(fake.closeCalls, 1);
    assert.doesNotMatch(stderr.text, new RegExp(secret, 'u'));
    assert.equal(stderr.events()[0]?.reason, 'collection_execution_failed');
  });

  it('process entrypoint rejects invalid invocation and missing database environment', async () => {
    const invalidArguments = await processFailure([], {
      NODE_ENV: 'test',
      NEWS_SCRAPER_DATABASE_URL: undefined,
    });
    assert.equal(invalidArguments.code, 2);
    assert.equal(
      JSON.parse(invalidArguments.stderr).reason,
      'invalid_arguments',
    );

    const missingDatabase = await processFailure([...KEYS], {
      NODE_ENV: 'test',
      NEWS_SCRAPER_DATABASE_URL: undefined,
    });
    assert.equal(missingDatabase.code, 1);
    assert.equal(JSON.parse(missingDatabase.stderr).reason, 'startup_failed');
    assert.equal(missingDatabase.stdout, '');
  });
});

function sink(): {
  readonly text: string;
  write(value: string): void;
  events(): Record<string, unknown>[];
} {
  let text = '';
  return {
    get text() {
      return text;
    },
    write(value) {
      text += value;
    },
    events() {
      return text
        .trim()
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
  };
}

function fakeDatabase(options: { readonly pingFailure?: Error } = {}): {
  readonly database: Database;
  readonly closeCalls: number;
} {
  let closeCalls = 0;
  const database = {
    async ping() {
      if (options.pingFailure !== undefined) throw options.pingFailure;
    },
    async close() {
      closeCalls += 1;
    },
  } as unknown as Database;
  return {
    database,
    get closeCalls() {
      return closeCalls;
    },
  };
}

function validEnvironment() {
  return {
    NODE_ENV: 'test',
    NEWS_SCRAPER_DATABASE_URL: 'postgresql://test.invalid/news',
  } as const;
}

function successfulResult(): EndpointCollectionAttemptResult {
  return Object.freeze({
    status: 'succeeded',
    outcome: 'content',
    endpointId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    collectionRunId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    executionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    runStatus: 'succeeded',
    transportStatus: 'succeeded',
    parserStatus: 'succeeded',
    rawItemCount: 5,
    normalizationStatus: 'succeeded',
    normalizedCandidateCount: 4,
    normalizationFailureCount: 1,
    articleLinkRejectionCount: 1,
    processingStatus: 'succeeded',
    createdCount: 1,
    updatedCount: 1,
    unchangedCount: 1,
    rejectedCount: 1,
    excludedCount: 0,
    failedCount: 0,
    candidates: Object.freeze([0, 1, 2].map(candidate)),
    httpStatusCode: 200,
    wireByteCount: 100,
    decompressedByteCount: 200,
    redirectCount: 0,
    elapsedMilliseconds: 10,
  });
}

function baseAttemptResult(): EndpointCollectionAttemptResult {
  return {
    status: 'succeeded',
    outcome: 'not_modified',
    endpointId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    collectionRunId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    executionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    runStatus: 'succeeded',
    transportStatus: 'not_modified',
    parserStatus: 'not_run',
    normalizationStatus: 'not_run',
    rawItemCount: 0,
    normalizedCandidateCount: 0,
    normalizationFailureCount: 0,
    articleLinkRejectionCount: 0,
    processingStatus: 'not_run',
    createdCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    rejectedCount: 0,
    excludedCount: 0,
    failedCount: 0,
  };
}

function candidate(index: number): ArticleCandidate {
  const number = String(index + 1);
  return Object.freeze({
    displayTitle: `Candidate ${number}`,
    normalizedTitle: `candidate ${number}`,
    originalUrl: `https://example.test/articles/${number}?utm_source=fixture`,
    canonicalIdentityUrl: `https://example.test/articles/${number}`,
    summary: 'SYNTHETIC_CANDIDATE_SUMMARY_SECRET Raw item body',
    publishedAt: Object.freeze({
      status: 'parsed',
      value: '2026-08-10T12:00:00.000Z',
      fallback: 'first_seen',
    }),
    updatedAt: Object.freeze({ status: 'missing' }),
    provenance: Object.freeze({
      sourceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      sourceEndpointId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      collectionRunId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    }),
  });
}

function aggregate(): EndpointConfigurationAggregate {
  const timestamp = new Date('2026-08-08T00:00:00.000Z');
  return {
    publication: {
      name: 'Generic news',
      activeForCollection: true,
      publicStatus: 'private',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    source: {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      configKey: KEYS[0],
      displayName: 'Generic source',
      siteUrl: { value: 'https://example.test/', hostname: 'example.test' },
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    sourceDomainRules: [{ hostname: 'example.test', includeSubdomains: true }],
    endpoint: {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      sourceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      configKey: KEYS[1],
      endpointUrl: {
        value: 'https://feeds.example.test/feed.xml',
        hostname: 'feeds.example.test',
      },
      endpointType: 'rss_atom',
      approvalState: 'approved',
      lifecycleState: 'active',
      operationalState: 'enabled',
      pollIntervalSeconds: 300,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    endpointDomainRules: [
      { hostname: 'feeds.example.test', includeSubdomains: false },
    ],
  };
}

async function processFailure(
  args: string[],
  overrides: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const environment = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete environment[key];
    else environment[key] = value;
  }
  try {
    await execFileAsync(
      process.execPath,
      ['src/app/worker/collect-main.ts', ...args],
      { cwd: process.cwd(), env: environment },
    );
  } catch (error) {
    const failure = error as Error & {
      code: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: failure.code,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    };
  }
  throw new Error('Expected collection process to fail.');
}
