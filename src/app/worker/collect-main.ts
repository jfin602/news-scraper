import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import {
  collectEndpoint,
  createCollectionRunStore,
  type CollectEndpointResult,
} from '../../collection/collect-endpoint.ts';
import { persistIncludedArticle } from '../../articles/repository.ts';
import { createEndpointExecutionLockRunner } from '../../collection/execution.ts';
import { applyArticleLinkPolicy } from '../../collection/article-links/policy.ts';
import {
  createHttpFetcher,
  type HttpFetcher,
} from '../../collection/fetchers/http-fetcher.ts';
import { RssAtomParser } from '../../collection/parsers/rss-atom-parser.ts';
import { normalizeArticleCandidate } from '../../collection/normalization/normalizer.ts';
import { evaluateRelevance } from '../../collection/relevance/evaluator.ts';
import { createNodeResolver } from '../../collection/safety/resolver.ts';
import { parseDatabaseConfig } from '../../database/config.ts';
import { createDatabase, type Database } from '../../database/database.ts';
import { parseRuntimeConfig } from '../../shared/runtime-config.ts';
import {
  findEndpointConfigurationByKeys,
  type EndpointConfigurationAggregate,
} from '../../sources/repository.ts';

const CONFIGURATION_KEY_MAX_LENGTH = 200;

interface CommandOutput {
  write(value: string): unknown;
}

export interface CollectEndpointCommandDependencies {
  readonly createDatabase: typeof createDatabase;
  readonly findEndpointConfiguration: typeof findEndpointConfigurationByKeys;
  readonly createFetcher: () => HttpFetcher;
  readonly execute: typeof collectEndpoint;
  readonly executionId: () => string;
}

export interface CollectEndpointCommandOptions {
  readonly args?: readonly string[];
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly stdout?: CommandOutput;
  readonly stderr?: CommandOutput;
  readonly dependencies?: Partial<CollectEndpointCommandDependencies>;
}

const DEFAULT_DEPENDENCIES: CollectEndpointCommandDependencies = Object.freeze({
  createDatabase,
  findEndpointConfiguration: findEndpointConfigurationByKeys,
  createFetcher: () => createHttpFetcher({ resolver: createNodeResolver() }),
  execute: collectEndpoint,
  executionId: randomUUID,
});

export async function runCollectEndpointCommand(
  options: CollectEndpointCommandOptions = {},
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const args = parseArguments(options.args ?? process.argv.slice(2));
  if (args === undefined) {
    writeJson(stderr, {
      event: 'endpoint_collection.invocation_failed',
      role: 'worker',
      reason: 'invalid_arguments',
      usage:
        'collect:endpoint -- <publication-slug> <source-config-key> <endpoint-config-key>',
    });
    return 2;
  }

  const environment = options.environment ?? process.env;
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...options.dependencies };
  let database: Database | undefined;
  try {
    parseRuntimeConfig(environment);
    const databaseConfig = parseDatabaseConfig(environment);
    database = dependencies.createDatabase(databaseConfig);
    await database.ping();
  } catch {
    await database?.close().catch(() => undefined);
    writeJson(stderr, {
      event: 'endpoint_collection.start_failed',
      role: 'worker',
      reason: 'startup_failed',
    });
    return 1;
  }

  let exitCode: number;
  try {
    const configuration = await dependencies.findEndpointConfiguration(
      database,
      args.publicationSlug,
      args.sourceConfigKey,
      args.endpointConfigKey,
    );
    if (configuration === undefined) {
      writeJson(stdout, {
        event: 'endpoint_collection.result',
        role: 'worker',
        ...args,
        status: 'blocked',
        reason: 'endpoint_not_found',
      });
      exitCode = 1;
    } else {
      const result = await executeConfiguredEndpoint(
        database,
        configuration,
        dependencies,
      );
      writeJson(stdout, commandResult(args, configuration, result));
      exitCode = result.status === 'succeeded' ? 0 : 1;
    }
  } catch {
    writeJson(stderr, {
      event: 'endpoint_collection.failed',
      role: 'worker',
      ...args,
      reason: 'collection_execution_failed',
    });
    exitCode = 1;
  } finally {
    try {
      await database.close();
    } catch {
      writeJson(stderr, {
        event: 'endpoint_collection.close_failed',
        role: 'worker',
        reason: 'resource_close_failed',
      });
      exitCode = 1;
    }
  }
  return exitCode;
}

async function executeConfiguredEndpoint(
  database: Database,
  configuration: EndpointConfigurationAggregate,
  dependencies: CollectEndpointCommandDependencies,
): Promise<CollectEndpointResult> {
  return dependencies.execute(configuration, {
    lockRunner: createEndpointExecutionLockRunner(database),
    runs: createCollectionRunStore(database),
    fetcher: dependencies.createFetcher(),
    rssAtomParser: new RssAtomParser(),
    normalizeArticleCandidate,
    applyArticleLinkPolicy,
    evaluateRelevance,
    persistArticle: (candidate, observationTime) =>
      persistIncludedArticle(database, candidate, observationTime),
    observationTime: () => new Date(),
    executionId: dependencies.executionId,
  });
}

function parseArguments(args: readonly string[]):
  | Readonly<{
      publicationSlug: string;
      sourceConfigKey: string;
      endpointConfigKey: string;
    }>
  | undefined {
  if (args.length !== 3) return undefined;
  const [publicationSlug, sourceConfigKey, endpointConfigKey] = args;
  if (
    publicationSlug === undefined ||
    sourceConfigKey === undefined ||
    endpointConfigKey === undefined ||
    !validArgument(publicationSlug) ||
    !validArgument(sourceConfigKey) ||
    !validArgument(endpointConfigKey)
  ) {
    return undefined;
  }
  return Object.freeze({ publicationSlug, sourceConfigKey, endpointConfigKey });
}

function validArgument(value: string): boolean {
  return (
    value === value.trim() &&
    value.length > 0 &&
    value.length <= CONFIGURATION_KEY_MAX_LENGTH
  );
}

function commandResult(
  keys: Readonly<{
    publicationSlug: string;
    sourceConfigKey: string;
    endpointConfigKey: string;
  }>,
  configuration: EndpointConfigurationAggregate,
  result: CollectEndpointResult,
): Readonly<Record<string, unknown>> {
  if (result.status === 'blocked') {
    return Object.freeze({
      event: 'endpoint_collection.result',
      role: 'worker',
      ...keys,
      publicationId: configuration.publication.id,
      sourceId: configuration.source.id,
      endpointId: configuration.endpoint.id,
      status: result.status,
      stage: result.stage,
      reason: result.reason,
    });
  }
  return Object.freeze({
    event: 'endpoint_collection.result',
    role: 'worker',
    ...keys,
    publicationId: configuration.publication.id,
    sourceId: configuration.source.id,
    endpointId: result.endpointId,
    status: result.status,
    outcome: result.outcome,
    collectionRunId: result.collectionRunId,
    executionId: result.executionId,
    runStatus: result.runStatus,
    transportStatus: result.transportStatus,
    parserStatus: result.parserStatus,
    rawItemCount: result.rawItemCount,
    normalizationStatus: result.normalizationStatus,
    processingStatus: result.processingStatus,
    normalizedCandidateCount: result.normalizedCandidateCount,
    normalizationFailureCount: result.normalizationFailureCount,
    articleLinkRejectionCount: result.articleLinkRejectionCount,
    createdCount: result.createdCount,
    updatedCount: result.updatedCount,
    unchangedCount: result.unchangedCount,
    rejectedCount: result.rejectedCount,
    excludedCount: result.excludedCount,
    failedCount: result.failedCount,
    ...(result.status === 'succeeded' &&
    result.outcome === 'content' &&
    result.candidates !== undefined &&
    result.candidates.length > 0
      ? {
          candidateSample: result.candidates.slice(0, 3).map((candidate) =>
            Object.freeze({
              displayTitle: candidate.displayTitle,
              originalUrl: candidate.originalUrl,
              canonicalIdentityUrl: candidate.canonicalIdentityUrl,
              publishedAt: candidate.publishedAt,
              publicationId: candidate.provenance.publicationId,
              sourceId: candidate.provenance.sourceId,
              endpointId: candidate.provenance.sourceEndpointId,
              collectionRunId: candidate.provenance.collectionRunId,
            }),
          ),
        }
      : {}),
    ...(result.reason === undefined ? {} : { reason: result.reason }),
    ...(result.safetyContext === undefined
      ? {}
      : { safetyContext: result.safetyContext }),
    ...(result.httpStatusCode === undefined
      ? {}
      : { httpStatusCode: result.httpStatusCode }),
    ...(result.wireByteCount === undefined
      ? {}
      : { wireByteCount: result.wireByteCount }),
    ...(result.decompressedByteCount === undefined
      ? {}
      : { decompressedByteCount: result.decompressedByteCount }),
    ...(result.redirectCount === undefined
      ? {}
      : { redirectCount: result.redirectCount }),
    ...(result.elapsedMilliseconds === undefined
      ? {}
      : { elapsedMilliseconds: result.elapsedMilliseconds }),
  });
}

function writeJson(output: CommandOutput, value: object): void {
  output.write(`${JSON.stringify(value)}\n`);
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  import.meta.url === pathToFileURL(entrypoint).href
) {
  process.exitCode = await runCollectEndpointCommand();
}
