import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';

import { chromium } from 'playwright';
import { Client } from 'pg';

import { createDatabase } from '../../src/database/database.ts';
import {
  readPublicFeed,
  type PublicFeed,
  type PublicFeedItem,
} from '../../src/public-feed/repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';
import {
  cleanupChild,
  disconnectTestIpc,
  sendGracefulTermination,
  spawnRole,
  waitForExit,
  waitForJsonEvent,
} from '../support/process.ts';
import { boundedChildProcessFailure } from '../support/process/bounded-child-process-error.ts';

const execFileAsync = promisify(execFile);
const PUBLICATION_NAME = 'Indie Author Publishing News';
const REQUIRED_ENDPOINTS = [
  {
    sourceName: 'Author Media',
    sourceConfigKey: 'author_media',
    endpointConfigKey: 'site_rss',
    endpointUrl: 'https://www.authormedia.com/feed/',
  },
  {
    sourceName: 'The Creative Penn',
    sourceConfigKey: 'the_creative_penn',
    endpointConfigKey: 'podcast_rss',
    endpointUrl: 'https://www.thecreativepenn.com/feed/podcast/',
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
  processingStatus: string;
  rawItemCount: number;
  normalizedCandidateCount: number;
  normalizationFailureCount: number;
  articleLinkRejectionCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  rejectedCount: number;
  excludedCount: number;
  failedCount: number;
}

interface PersistedIdentity {
  id: string;
  source_id: string;
  external_id: string | null;
  canonical_identity_url: string;
  original_url: string;
  display_title: string;
}

describe('Phase 9 approved live-Source public tech demo', () => {
  it('collects two approved Sources twice, reads their feed, and renders their original links in Chromium', async () => {
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      throw new Error(
        'Playwright-managed Chromium is required. Run "npx playwright install chromium".',
        { cause: error },
      );
    }

    try {
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
        await assertApprovedConfiguration(databaseUrl);

        const firstRuns = new Map<string, CollectionOutput>();
        const firstIdentities = new Map<string, readonly PersistedIdentity[]>();
        const firstFailures: unknown[] = [];
        for (const endpoint of REQUIRED_ENDPOINTS) {
          try {
            const output = await collect(endpoint, environment);
            await assertPersistedRun(databaseUrl, output, true);
            const identities = await readSuccessfulRunArticles(
              databaseUrl,
              output,
            );
            assert.ok(
              identities.length > 0,
              `${endpoint.sourceName} persisted no attributable Articles`,
            );
            firstRuns.set(endpoint.sourceConfigKey, output);
            firstIdentities.set(endpoint.sourceConfigKey, identities);
          } catch (error) {
            firstFailures.push(
              new Error(`First live run failed for ${endpoint.sourceName}.`, {
                cause: error,
              }),
            );
          }
        }
        if (firstFailures.length > 0) {
          throw new AggregateError(
            firstFailures,
            'Required first live runs failed.',
          );
        }

        const secondRuns = new Map<string, CollectionOutput>();
        const secondFailures: unknown[] = [];
        for (const endpoint of REQUIRED_ENDPOINTS) {
          try {
            const output = await collect(endpoint, environment);
            await assertPersistedRun(databaseUrl, output, false);
            await assertIdentityConvergence(
              databaseUrl,
              firstIdentities.get(endpoint.sourceConfigKey) ?? [],
            );
            secondRuns.set(endpoint.sourceConfigKey, output);
          } catch (error) {
            secondFailures.push(
              new Error(`Second live run failed for ${endpoint.sourceName}.`, {
                cause: error,
              }),
            );
          }
        }
        if (secondFailures.length > 0) {
          throw new AggregateError(
            secondFailures,
            'Required second live runs failed.',
          );
        }

        const database = createDatabase({ connectionString: databaseUrl });
        let feed: PublicFeed | undefined;
        try {
          feed = await readPublicFeed(database);
        } finally {
          await database.close();
        }
        assert.ok(feed);
        assert.equal(feed.publication.name, PUBLICATION_NAME);

        const representatives = new Map<string, PublicFeedItem>();
        for (const endpoint of REQUIRED_ENDPOINTS) {
          const item: PublicFeedItem | undefined = feed.items.find(
            (candidate) => candidate.sourceName === endpoint.sourceName,
          );
          assert.ok(
            item,
            `${endpoint.sourceName} is absent from the public feed`,
          );
          const persisted = await readArticle(databaseUrl, item.articleId);
          assert.equal(item.headline, persisted.display_title);
          assert.equal(item.originalUrl, persisted.original_url);
          assert.ok(item.effectiveFeedDate instanceof Date);
          assert.ok(
            item.feedDateSource === 'published_at' ||
              item.feedDateSource === 'first_seen_at',
          );
          representatives.set(endpoint.sourceName, item);
        }

        const web = spawnRole('web', {
          ...environment,
          NEWS_SCRAPER_WEB_HOST: '127.0.0.1',
          NEWS_SCRAPER_WEB_PORT: '0',
        });
        try {
          const listening = await waitForJsonEvent(
            web,
            'stdout',
            'web.listening',
          );
          assert.equal(typeof listening.port, 'number');
          const page = await browser.newPage();
          try {
            const response = await page.goto(
              `http://127.0.0.1:${String(listening.port)}/`,
            );
            assert.equal(response?.status(), 200);
            await page.waitForSelector(
              '[data-feed-content][data-state="populated"]',
            );
            assert.equal(
              await page.locator('h1').innerText(),
              PUBLICATION_NAME,
            );
            for (const endpoint of REQUIRED_ENDPOINTS) {
              const item = representatives.get(endpoint.sourceName);
              assert.ok(item);
              const link = page
                .locator('.feed-headline-link')
                .filter({ hasText: item.headline });
              assert.equal(await link.count(), 1);
              assert.equal(await link.getAttribute('href'), item.originalUrl);
            }
          } finally {
            await page.close();
          }
          const webStopped = waitForJsonEvent(web, 'stdout', 'web.stopped');
          sendGracefulTermination(web);
          await webStopped;
          disconnectTestIpc(web);
          assert.deepEqual(await waitForExit(web), {
            code: 0,
            signal: null,
          });
        } finally {
          await cleanupChild(web);
        }

        console.log(
          JSON.stringify({
            event: 'phase_9.public_tech_demo',
            sources: REQUIRED_ENDPOINTS.map((endpoint) => ({
              sourceName: endpoint.sourceName,
              endpointUrl: endpoint.endpointUrl,
              firstRunId: firstRuns.get(endpoint.sourceConfigKey)
                ?.collectionRunId,
              secondRunId: secondRuns.get(endpoint.sourceConfigKey)
                ?.collectionRunId,
              firstRunIdentityCount: firstIdentities.get(
                endpoint.sourceConfigKey,
              )?.length,
            })),
          }),
        );
      });
    } finally {
      await browser.close();
    }
  });
});

async function assertApprovedConfiguration(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const publication = await client.query<{
      name: string;
      active_for_collection: boolean;
      public_status: string;
    }>(
      'SELECT name, active_for_collection, public_status FROM publication_settings',
    );
    assert.deepEqual(publication.rows, [
      {
        name: PUBLICATION_NAME,
        active_for_collection: true,
        public_status: 'public',
      },
    ]);
    const configured = await client.query<{
      source_name: string;
      source_config_key: string;
      source_approval: string;
      source_lifecycle: string;
      source_operational: string;
      endpoint_config_key: string;
      endpoint_url: string;
      endpoint_type: string;
      endpoint_approval: string;
      endpoint_lifecycle: string;
      endpoint_operational: string;
    }>(
      `SELECT s.display_name AS source_name, s.config_key AS source_config_key,
              s.approval_state AS source_approval, s.lifecycle_state AS source_lifecycle,
              s.operational_state AS source_operational,
              e.config_key AS endpoint_config_key, e.endpoint_url, e.endpoint_type,
              e.approval_state AS endpoint_approval, e.lifecycle_state AS endpoint_lifecycle,
              e.operational_state AS endpoint_operational
       FROM sources s
       JOIN source_endpoints e ON e.source_id = s.id
       ORDER BY s.config_key, e.config_key`,
    );
    assert.equal(configured.rowCount, REQUIRED_ENDPOINTS.length);
    for (const endpoint of REQUIRED_ENDPOINTS) {
      const row = configured.rows.find(
        (candidate) => candidate.source_config_key === endpoint.sourceConfigKey,
      );
      assert.ok(row);
      assert.equal(row.source_name, endpoint.sourceName);
      assert.equal(row.endpoint_config_key, endpoint.endpointConfigKey);
      assert.equal(row.endpoint_url, endpoint.endpointUrl);
      assert.equal(row.endpoint_type, 'rss_atom');
      assert.equal(row.source_approval, 'approved');
      assert.equal(row.source_lifecycle, 'active');
      assert.equal(row.source_operational, 'enabled');
      assert.equal(row.endpoint_approval, 'approved');
      assert.equal(row.endpoint_lifecycle, 'active');
      assert.equal(row.endpoint_operational, 'enabled');
    }
  } finally {
    await client.end();
  }
}

async function collect(
  endpoint: (typeof REQUIRED_ENDPOINTS)[number],
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
  assert.ok(output.outcome === 'content' || output.outcome === 'not_modified');
  return output;
}

async function assertPersistedRun(
  databaseUrl: string,
  output: CollectionOutput,
  requireContent: boolean,
): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const result = await client.query<CollectionOutput & { id: string }>(
      `SELECT id, run_status AS "runStatus", transport_status AS "transportStatus",
              parser_status AS "parserStatus", normalization_status AS "normalizationStatus",
              processing_status AS "processingStatus", raw_item_count AS "rawItemCount",
              normalized_candidate_count AS "normalizedCandidateCount",
              normalization_failure_count AS "normalizationFailureCount",
              article_link_rejection_count AS "articleLinkRejectionCount",
              created_count AS "createdCount", updated_count AS "updatedCount",
              unchanged_count AS "unchangedCount", rejected_count AS "rejectedCount",
              excluded_count AS "excludedCount", failed_count AS "failedCount"
       FROM collection_runs WHERE id = $1`,
      [output.collectionRunId],
    );
    assert.equal(result.rowCount, 1);
    const row = result.rows[0]!;
    for (const key of [
      'runStatus',
      'transportStatus',
      'parserStatus',
      'normalizationStatus',
      'processingStatus',
      'rawItemCount',
      'normalizedCandidateCount',
      'normalizationFailureCount',
      'articleLinkRejectionCount',
      'createdCount',
      'updatedCount',
      'unchangedCount',
      'rejectedCount',
      'excludedCount',
      'failedCount',
    ] as const)
      assert.equal(row[key], output[key]);
    assert.equal(output.runStatus, 'succeeded');
    if (output.outcome === 'not_modified') {
      assert.equal(requireContent, false, 'first run must return content');
      assert.equal(output.transportStatus, 'not_modified');
      return;
    }
    assert.equal(output.transportStatus, 'succeeded');
    assert.equal(output.parserStatus, 'succeeded');
    assert.equal(output.normalizationStatus, 'succeeded');
    assert.equal(output.processingStatus, 'succeeded');
    assert.ok(output.rawItemCount > 0);
    assert.equal(
      output.rawItemCount,
      output.normalizedCandidateCount + output.normalizationFailureCount,
    );
    assert.equal(
      output.normalizedCandidateCount,
      output.createdCount +
        output.updatedCount +
        output.unchangedCount +
        output.rejectedCount +
        output.excludedCount +
        output.failedCount,
    );
    assert.equal(
      output.excludedCount,
      0,
      'default Relevance must include safe candidates',
    );
    assert.equal(output.failedCount, 0);
    if (requireContent)
      assert.ok(
        output.createdCount + output.updatedCount + output.unchangedCount > 0,
      );
  } finally {
    await client.end();
  }
}

async function readSuccessfulRunArticles(
  databaseUrl: string,
  output: CollectionOutput,
): Promise<readonly PersistedIdentity[]> {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const result = await client.query<PersistedIdentity>(
      `SELECT DISTINCT a.id, a.source_id, a.external_id, a.canonical_identity_url,
              a.original_url, a.display_title
       FROM article_observations o JOIN articles a ON a.id = o.article_id
       WHERE o.collection_run_id = $1
         AND o.source_id = $2 AND o.source_endpoint_id = $3
         AND o.processing_outcome IN ('created', 'updated', 'unchanged')`,
      [output.collectionRunId, output.sourceId, output.endpointId],
    );
    const observations = await client.query<{ count: string }>(
      'SELECT count(*) FROM article_observations WHERE collection_run_id = $1',
      [output.collectionRunId],
    );
    assert.equal(
      Number(observations.rows[0]?.count),
      output.normalizedCandidateCount,
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

async function assertIdentityConvergence(
  databaseUrl: string,
  identities: readonly PersistedIdentity[],
): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    for (const identity of identities) {
      const result =
        identity.external_id === null
          ? await client.query<{ id: string }>(
              'SELECT id FROM articles WHERE source_id = $1 AND external_id IS NULL AND canonical_identity_url = $2',
              [identity.source_id, identity.canonical_identity_url],
            )
          : await client.query<{ id: string }>(
              'SELECT id FROM articles WHERE source_id = $1 AND external_id = $2',
              [identity.source_id, identity.external_id],
            );
      assert.deepEqual(result.rows, [{ id: identity.id }]);
    }
  } finally {
    await client.end();
  }
}

async function readArticle(
  databaseUrl: string,
  articleId: string,
): Promise<PersistedIdentity> {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const result = await client.query<PersistedIdentity>(
      `SELECT id, source_id, external_id, canonical_identity_url, original_url, display_title
       FROM articles WHERE id = $1`,
      [articleId],
    );
    assert.equal(result.rowCount, 1);
    return result.rows[0]!;
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
