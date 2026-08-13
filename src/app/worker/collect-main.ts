import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import {
  executeEndpointCollection,
  type EndpointCollectionServiceResult,
} from '../../collection/endpoint-collection-service.ts';
import { parseDatabaseConfig } from '../../database/config.ts';
import { createDatabase, type Database } from '../../database/database.ts';
import { parseRuntimeConfig } from '../../shared/runtime-config.ts';

const CONFIGURATION_KEY_MAX_LENGTH = 200;

interface CommandOutput {
  write(value: string): unknown;
}

export interface CollectEndpointCommandDependencies {
  readonly createDatabase: typeof createDatabase;
  readonly execute: typeof executeEndpointCollection;
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
  execute: executeEndpointCollection,
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
      usage: 'collect:endpoint -- <source-config-key> <endpoint-config-key>',
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
    const result = await dependencies.execute(database, {
      triggerKind: 'manual',
      executionId: dependencies.executionId(),
      sourceConfigKey: args.sourceConfigKey,
      endpointConfigKey: args.endpointConfigKey,
    });
    if (result.status === 'not_found') {
      writeJson(stdout, {
        event: 'endpoint_collection.result',
        role: 'worker',
        ...args,
        status: 'blocked',
        reason: result.reason,
      });
      exitCode = 1;
    } else if (result.status === 'skipped') {
      writeJson(stdout, {
        event: 'endpoint_collection.result',
        role: 'worker',
        ...args,
        endpointId: result.endpointId,
        status: 'blocked',
        reason: result.reason,
      });
      exitCode = 1;
    } else if (result.status === 'capacity_blocked') {
      writeJson(stdout, {
        event: 'endpoint_collection.result',
        role: 'worker',
        ...args,
        sourceId: result.sourceId,
        endpointId: result.endpointId,
        status: 'blocked',
        stage: result.stage,
        reason: result.reason,
        limitingScope: result.limitingScope,
      });
      exitCode = 1;
    } else {
      writeJson(stdout, commandResult(args, result));
      exitCode = result.collection.status === 'succeeded' ? 0 : 1;
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

function parseArguments(args: readonly string[]):
  | Readonly<{
      sourceConfigKey: string;
      endpointConfigKey: string;
    }>
  | undefined {
  if (args.length !== 2) return undefined;
  const [sourceConfigKey, endpointConfigKey] = args;
  if (
    sourceConfigKey === undefined ||
    endpointConfigKey === undefined ||
    !validArgument(sourceConfigKey) ||
    !validArgument(endpointConfigKey)
  ) {
    return undefined;
  }
  return Object.freeze({ sourceConfigKey, endpointConfigKey });
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
    sourceConfigKey: string;
    endpointConfigKey: string;
  }>,
  serviceResult: Extract<
    EndpointCollectionServiceResult,
    { status: 'resolved' }
  >,
): Readonly<Record<string, unknown>> {
  const result = serviceResult.collection;
  if (result.status === 'blocked') {
    return Object.freeze({
      event: 'endpoint_collection.result',
      role: 'worker',
      ...keys,
      sourceId: serviceResult.sourceId,
      endpointId: serviceResult.endpointId,
      status: result.status,
      stage: result.stage,
      reason: result.reason,
    });
  }
  return Object.freeze({
    event: 'endpoint_collection.result',
    role: 'worker',
    ...keys,
    sourceId: serviceResult.sourceId,
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
    ...(result.retryClassification === undefined
      ? {}
      : { retryClassification: result.retryClassification }),
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
