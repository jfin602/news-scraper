import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';

import { runCollectEndpointCommand } from '../../src/app/worker/collect-main.ts';
import type { EndpointCollectionAttemptResult } from '../../src/collection/collect-endpoint.ts';
import type { Database } from '../../src/database/database.ts';
import type { EndpointConfigurationAggregate } from '../../src/sources/repository.ts';

const execFileAsync = promisify(execFile);
const KEYS = ['generic-news', 'generic_source', 'main_feed'] as const;

describe('manual Worker endpoint collection command', () => {
  it('rejects missing and extra arguments before creating database dependencies', async () => {
    for (const args of [KEYS.slice(0, 2), [...KEYS, 'extra']]) {
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
            'collect:endpoint -- <publication-slug> <source-config-key> <endpoint-config-key>',
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
    let collectionCalls = 0;
    const exitCode = await runCollectEndpointCommand({
      args: KEYS,
      environment: validEnvironment(),
      stdout: output,
      dependencies: {
        createDatabase: () => fake.database,
        async findEndpointConfiguration() {
          return undefined;
        },
        async execute() {
          collectionCalls += 1;
          throw new Error('unreachable');
        },
      },
    });

    assert.equal(exitCode, 1);
    assert.equal(collectionCalls, 0);
    assert.equal(fake.closeCalls, 1);
    assert.deepEqual(output.events(), [
      {
        event: 'endpoint_collection.result',
        role: 'worker',
        publicationSlug: KEYS[0],
        sourceConfigKey: KEYS[1],
        endpointConfigKey: KEYS[2],
        status: 'blocked',
        reason: 'endpoint_not_found',
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
        async findEndpointConfiguration() {
          return configuration;
        },
        async execute(_configuration, dependencies) {
          assert.equal(dependencies.executionId(), 'controlled-execution-id');
          return successfulResult();
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
      publicationSlug: KEYS[0],
      sourceConfigKey: KEYS[1],
      endpointConfigKey: KEYS[2],
      publicationId: configuration.publication.id,
      sourceId: configuration.source.id,
      endpointId: configuration.endpoint.id,
      status: 'succeeded',
      outcome: 'content',
      collectionRunId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      executionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      runStatus: 'succeeded',
      transportStatus: 'succeeded',
      parserStatus: 'succeeded',
      rawItemCount: 1,
      normalizationStatus: 'not_run',
      normalizedCandidateCount: 0,
      normalizationFailureCount: 0,
      articleLinkRejectionCount: 0,
      httpStatusCode: 200,
      wireByteCount: 100,
      decompressedByteCount: 200,
      redirectCount: 0,
      elapsedMilliseconds: 10,
    });
    assert.doesNotMatch(output.text, /Raw item body/u);
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
        async findEndpointConfiguration() {
          return aggregate();
        },
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
    rawItemCount: 1,
    normalizationStatus: 'not_run',
    normalizedCandidateCount: 0,
    normalizationFailureCount: 0,
    articleLinkRejectionCount: 0,
    rawItems: Object.freeze([{ content: 'Raw item body' }]),
    httpStatusCode: 200,
    wireByteCount: 100,
    decompressedByteCount: 200,
    redirectCount: 0,
    elapsedMilliseconds: 10,
  });
}

function aggregate(): EndpointConfigurationAggregate {
  const timestamp = new Date('2026-08-08T00:00:00.000Z');
  return {
    publication: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Generic news',
      slug: KEYS[0],
      activeForCollection: true,
      publicStatus: 'private',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    source: {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      publicationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      configKey: KEYS[1],
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
      configKey: KEYS[2],
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
