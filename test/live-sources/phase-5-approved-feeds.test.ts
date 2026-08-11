import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';
import { Client } from 'pg';

import { withDisposableDatabase } from '../support/database/disposable-database.ts';
import { boundedChildProcessFailure } from '../support/process/bounded-child-process-error.ts';

const execFileAsync = promisify(execFile);
const APPROVED_ENDPOINTS = [
  {
    sourceName: 'Author Media',
    sourceConfigKey: 'author_media',
    endpointConfigKey: 'site_rss',
    expectedUrl: 'https://www.authormedia.com/feed/',
  },
  {
    sourceName: 'The Creative Penn',
    sourceConfigKey: 'the_creative_penn',
    endpointConfigKey: 'podcast_rss',
    expectedUrl: 'https://www.thecreativepenn.com/feed/podcast/',
  },
] as const;

interface CollectionOutput {
  event: string;
  status: string;
  outcome: string;
  collectionRunId: string;
  sourceId: string;
  endpointId: string;
  runStatus: string;
  transportStatus: string;
  parserStatus: string;
  normalizationStatus: string;
  rawItemCount: number;
  normalizedCandidateCount: number;
  normalizationFailureCount: number;
  articleLinkRejectionCount: number;
  candidateSample?: readonly {
    displayTitle: string;
    originalUrl: string;
    canonicalIdentityUrl: string;
    sourceId: string;
    endpointId: string;
    collectionRunId: string;
  }[];
  httpStatusCode?: number;
  wireByteCount?: number;
  decompressedByteCount?: number;
  redirectCount?: number;
  elapsedMilliseconds?: number;
}

describe('approved live feed collection pipeline', () => {
  it('fetches both approved endpoints independently through the manual Worker path with persisted runs', async () => {
    await withDisposableDatabase(async ({ databaseUrl }) => {
      const environment = {
        ...process.env,
        NODE_ENV: 'test',
        NEWS_SCRAPER_DATABASE_URL: databaseUrl,
      };

      await run('scripts/migrate-database.ts', [], environment);
      await run(
        'scripts/bootstrap-database.ts',
        ['config/publication.json'],
        environment,
      );

      const results: Array<{
        source: string;
        endpointUrl: string;
        first: CollectionOutput;
        second: CollectionOutput;
      }> = [];
      const failures: unknown[] = [];

      for (const endpoint of APPROVED_ENDPOINTS) {
        try {
          const configuredUrl = await readConfiguredUrl(
            databaseUrl,
            endpoint.sourceConfigKey,
            endpoint.endpointConfigKey,
          );
          assert.equal(configuredUrl, endpoint.expectedUrl);
          const first = await collect(endpoint, environment);
          const second = await collect(endpoint, environment);
          await assertPersistedRuns(databaseUrl, [first, second]);
          results.push({
            source: endpoint.sourceName,
            endpointUrl: configuredUrl,
            first,
            second,
          });
        } catch (error) {
          failures.push(
            new Error(`Live collection failed for ${endpoint.sourceName}.`, {
              cause: error,
            }),
          );
        }
      }

      console.log(JSON.stringify({ event: 'phase_5.live_sources', results }));
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          'One or more approved feeds failed.',
        );
      }
      assert.equal(results.length, APPROVED_ENDPOINTS.length);
    });
  });
});

async function collect(
  endpoint: (typeof APPROVED_ENDPOINTS)[number],
  environment: NodeJS.ProcessEnv,
): Promise<CollectionOutput> {
  const { stdout } = await run(
    'src/app/worker/collect-main.ts',
    [endpoint.sourceConfigKey, endpoint.endpointConfigKey],
    environment,
  );
  const output = JSON.parse(stdout.trim()) as CollectionOutput;
  assert.equal(output.event, 'endpoint_collection.result');
  assert.equal(output.status, 'succeeded');
  assert.equal(output.outcome, 'content');
  assert.equal(output.runStatus, 'succeeded');
  assert.equal(output.transportStatus, 'succeeded');
  assert.equal(output.parserStatus, 'succeeded');
  assert.equal(output.normalizationStatus, 'succeeded');
  assert.ok(output.rawItemCount > 0);
  assert.equal(
    output.rawItemCount,
    output.normalizedCandidateCount + output.normalizationFailureCount,
  );
  assert.ok(output.candidateSample);
  assert.ok(output.candidateSample.length > 0);
  assert.ok(output.candidateSample.length <= 3);
  for (const candidate of output.candidateSample) {
    assert.ok(candidate.displayTitle.length > 0);
    assert.match(candidate.originalUrl, /^https?:\/\//u);
    assert.match(candidate.canonicalIdentityUrl, /^https?:\/\//u);
    assert.equal(candidate.sourceId, output.sourceId);
    assert.equal(candidate.endpointId, output.endpointId);
    assert.equal(candidate.collectionRunId, output.collectionRunId);
  }
  assert.equal(output.httpStatusCode, 200);
  return output;
}

async function assertPersistedRuns(
  databaseUrl: string,
  outputs: readonly CollectionOutput[],
): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const result = await client.query<{
      id: string;
      run_status: string;
      transport_status: string;
      parser_status: string;
      normalization_status: string;
      raw_item_count: number;
      normalized_candidate_count: number;
      normalization_failure_count: number;
      article_link_rejection_count: number;
    }>(
      `SELECT id, run_status, transport_status, parser_status,
              normalization_status, raw_item_count, normalized_candidate_count,
              normalization_failure_count, article_link_rejection_count
       FROM collection_runs WHERE id = ANY($1::uuid[])`,
      [outputs.map((output) => output.collectionRunId)],
    );
    assert.equal(result.rowCount, outputs.length);
    for (const output of outputs) {
      const row = result.rows.find(
        (candidate) => candidate.id === output.collectionRunId,
      );
      assert.ok(row);
      assert.equal(row.run_status, output.runStatus);
      assert.equal(row.transport_status, output.transportStatus);
      assert.equal(row.parser_status, output.parserStatus);
      assert.equal(row.normalization_status, output.normalizationStatus);
      assert.equal(row.raw_item_count, output.rawItemCount);
      assert.equal(
        row.normalized_candidate_count,
        output.normalizedCandidateCount,
      );
      assert.equal(
        row.normalization_failure_count,
        output.normalizationFailureCount,
      );
      assert.equal(
        row.article_link_rejection_count,
        output.articleLinkRejectionCount,
      );
    }
  } finally {
    await client.end();
  }
}

async function readConfiguredUrl(
  databaseUrl: string,
  sourceConfigKey: string,
  endpointConfigKey: string,
): Promise<string> {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const result = await client.query<{ endpoint_url: string }>(
      `SELECT se.endpoint_url
       FROM sources s
       JOIN source_endpoints se ON se.source_id = s.id
       WHERE s.config_key = $1 AND se.config_key = $2`,
      [sourceConfigKey, endpointConfigKey],
    );
    assert.equal(result.rowCount, 1);
    return result.rows[0]?.endpoint_url ?? '';
  } finally {
    await client.end();
  }
}

async function run(
  entrypoint: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync(process.execPath, [entrypoint, ...args], {
      cwd: process.cwd(),
      env: environment,
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    throw boundedChildProcessFailure(error);
  }
}
