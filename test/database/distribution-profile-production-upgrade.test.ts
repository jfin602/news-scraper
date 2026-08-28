import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createDatabase } from '../../src/database/database.ts';
import {
  discoverMigrations,
  migrateDatabase,
} from '../../src/database/migrations.ts';
import {
  createDistributionProfile,
  findDistributionProfileByConfigKey,
  replaceDistributionProfileSourceAssociation,
} from '../../src/distribution/profiles/repository.ts';
import { issueDistributionCredential } from '../../src/distribution/credentials/repository.ts';
import { enqueueEndpointCollectionJob } from '../../src/jobs/endpoint-collection-job-repository.ts';
import { withDisposableDatabase } from '../support/database/disposable-database.ts';

const ACCEPTED_FILENAMES = Array.from(
  { length: 14 },
  (_, index) => `${String(index + 1).padStart(4, '0')}_`,
);

test('the accepted production state upgrades additively through Profiles, credentials, and the Article summary bound', async () => {
  await withDisposableDatabase(async ({ databaseUrl }) => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'news-scraper-baseline-'),
    );
    try {
      const current = await discoverMigrations('migrations');
      const accepted = current.filter((migration) =>
        ACCEPTED_FILENAMES.some((prefix) =>
          migration.filename.startsWith(prefix),
        ),
      );
      assert.equal(accepted.length, 14);
      for (const migration of accepted) {
        await writeFile(
          path.join(directory, migration.filename),
          migration.sql,
          'utf8',
        );
      }
      const preservedBytes = await Promise.all(
        current
          .filter(
            (migration) =>
              migration.filename !== '0017_article_summary_bound.sql',
          )
          .map(
            async (migration) =>
              [
                migration.filename,
                await readFile(
                  path.join('migrations', migration.filename),
                  'utf8',
                ),
              ] as const,
          ),
      );
      assert.deepEqual(
        await migrateDatabase({ connectionString: databaseUrl }, directory),
        accepted.map((migration) => migration.filename),
      );
      const seeded = await seedAcceptedBaseline(databaseUrl);
      const addMigration = async (filename: string) => {
        const migration = current.find(
          (candidate) => candidate.filename === filename,
        );
        assert.ok(migration !== undefined);
        await writeFile(
          path.join(directory, migration.filename),
          migration.sql,
          'utf8',
        );
        assert.deepEqual(
          await migrateDatabase({ connectionString: databaseUrl }, directory),
          [filename],
        );
      };
      await addMigration('0015_distribution_profiles.sql');
      const before = await governedSnapshot(databaseUrl, seeded.articleId);
      await addMigration('0016_distribution_credentials.sql');
      assert.deepEqual(
        await governedSnapshot(databaseUrl, seeded.articleId),
        before,
      );
      await addMigration('0017_article_summary_bound.sql');
      const after = await governedSnapshot(databaseUrl, seeded.articleId);
      assert.deepEqual(
        after.governedRelationships,
        before.governedRelationships,
      );
      assert.deepEqual(after.jobs, before.jobs);
      assert.deepEqual(
        after.articleState.map((article) => ({
          ...article,
          summary: undefined,
        })),
        before.articleState.map((article) => ({
          ...article,
          summary: undefined,
        })),
      );
      assert.deepEqual(
        new Map(
          after.articleState.map((article) => [article.id, article.summary]),
        ),
        new Map([
          [seeded.articleId, `${'a'.repeat(3_990)}...`],
          [seeded.unchangedArticleId, seeded.unchangedSummary],
          [seeded.noBoundaryArticleId, `${'🙂'.repeat(3_997)}...`],
          [seeded.exactBoundaryArticleId, `${'c'.repeat(3_997)}...`],
        ]),
      );
      await Promise.all(
        preservedBytes.map(async ([filename, bytes]) => {
          assert.equal(
            await readFile(path.join('migrations', filename), 'utf8'),
            bytes,
          );
        }),
      );

      const database = createDatabase({ connectionString: databaseUrl });
      try {
        const profile = await createDistributionProfile(database, {
          configKey: 'upgraded_profile',
          displayName: 'Upgraded Profile',
          lifecycle: 'draft',
          resultLimit: 77,
        });
        await database.transaction(async (transaction) => {
          await replaceDistributionProfileSourceAssociation(
            transaction,
            profile.configKey,
            'upgrade_source',
            {
              includeAnyPhrases: ['Upgrade include'],
              excludeAnyPhrases: ['Upgrade exclude'],
              categoryConfigKeys: ['upgrade_category'],
            },
          );
        });
        assert.deepEqual(
          (
            await findDistributionProfileByConfigKey(
              database,
              profile.configKey,
            )
          )?.sources,
          [
            {
              sourceId: seeded.sourceId,
              sourceConfigKey: 'upgrade_source',
              sourceDisplayName: 'Upgrade Source',
              sourceApprovalState: 'approved',
              sourceLifecycleState: 'active',
              includeAnyPhrases: ['Upgrade include'],
              excludeAnyPhrases: ['Upgrade exclude'],
              categoryConfigKeys: ['upgrade_category'],
            },
          ],
        );
        const ledger = await database.query<{ readonly filename: string }>(
          'SELECT filename FROM news_scraper_schema_migrations ORDER BY filename',
        );
        assert.deepEqual(
          ledger.rows.map((row) => row.filename),
          current.map((migration) => migration.filename),
        );
        const issued = await issueDistributionCredential(database, {
          label: 'Upgrade credential',
          expiresAt: '2027-01-02T03:04:05.006Z',
        });
        assert.equal(issued.credential.label, 'Upgrade credential');
      } finally {
        await database.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

async function seedAcceptedBaseline(databaseUrl: string) {
  const database = createDatabase({ connectionString: databaseUrl });
  const sourceId = randomUUID();
  const endpointId = randomUUID();
  const articleId = randomUUID();
  const unchangedArticleId = randomUUID();
  const noBoundaryArticleId = randomUUID();
  const exactBoundaryArticleId = randomUUID();
  const categoryId = randomUUID();
  const runId = randomUUID();
  const groupId = randomUUID();
  const unchangedSummary = 'Preserved summary';
  const multiWordSummary = `${'a'.repeat(3_990)} ${'b'.repeat(20)}`;
  const noBoundarySummary = '🙂'.repeat(4_001);
  const exactBoundarySummary = `${'c'.repeat(3_997)} ${'d'.repeat(20)}`;
  try {
    await database.query(
      `INSERT INTO publication_settings (name, active_for_collection, public_status, description, accent_color, presentation_timezone)
       VALUES ('Upgrade Publication', false, 'public', 'Preserved presentation', '#123456', 'America/Chicago')`,
    );
    await database.query(
      `INSERT INTO sources (id, config_key, display_name, site_url, approval_state, lifecycle_state, operational_state, priority)
       VALUES ($1, 'upgrade_source', 'Upgrade Source', 'https://upgrade.example/', 'approved', 'active', 'enabled', 9)`,
      [sourceId],
    );
    await database.query(
      `INSERT INTO source_approved_domain_rules (source_id, hostname, include_subdomains)
       VALUES ($1, 'upgrade.example', true)`,
      [sourceId],
    );
    await database.query(
      `INSERT INTO source_endpoints (id, source_id, config_key, endpoint_url, endpoint_type, approval_state, lifecycle_state, operational_state, poll_interval_seconds, etag, next_due_at)
       VALUES ($1, $2, 'upgrade_feed', 'https://upgrade.example/feed', 'rss_atom', 'approved', 'active', 'enabled', 300, '"upgrade"', '2026-08-15T13:00:00Z')`,
      [endpointId, sourceId],
    );
    await database.query(
      `INSERT INTO categories (id, config_key, display_name)
       VALUES ($1, 'upgrade_category', 'Upgrade Category')`,
      [categoryId],
    );
    await database.query(
      `INSERT INTO relevance_rules (id, config_key, action, predicate_type, pattern, priority, source_id, category_id, reason)
       VALUES ($1, 'upgrade_rule', 'categorize', 'title_contains', 'upgrade', 10, $2, $3, 'Upgrade category')`,
      [randomUUID(), sourceId, categoryId],
    );
    await database.query(
      `INSERT INTO articles (id, source_id, external_id, original_url, canonical_identity_url, display_title, normalized_title, summary, published_at_status, published_at, source_updated_at_status, first_seen_at, last_seen_at, display_title_override)
       VALUES ($1, $2, 'external-upgrade', 'https://upgrade.example/a', 'https://upgrade.example/a', 'Upgrade headline', 'upgrade headline', $3, 'parsed', '2026-08-15T10:00:00Z', 'missing', '2026-08-15T10:01:00Z', '2026-08-15T10:02:00Z', 'Operator headline')`,
      [articleId, sourceId, multiWordSummary],
    );
    await database.query(
      `INSERT INTO articles (id, source_id, external_id, original_url, canonical_identity_url, display_title, normalized_title, summary, published_at_status, source_updated_at_status, first_seen_at, last_seen_at)
       VALUES ($1, $2, 'external-unchanged', 'https://upgrade.example/unchanged', 'https://upgrade.example/unchanged', 'Unchanged headline', 'unchanged headline', $3, 'missing', 'missing', '2026-08-15T10:01:00Z', '2026-08-15T10:02:00Z'),
              ($4, $2, 'external-no-boundary', 'https://upgrade.example/no-boundary', 'https://upgrade.example/no-boundary', 'No boundary headline', 'no boundary headline', $5, 'missing', 'missing', '2026-08-15T10:01:00Z', '2026-08-15T10:02:00Z')`,
      [
        unchangedArticleId,
        sourceId,
        unchangedSummary,
        noBoundaryArticleId,
        noBoundarySummary,
      ],
    );
    await database.query(
      `INSERT INTO articles (id, source_id, external_id, original_url, canonical_identity_url, display_title, normalized_title, summary, published_at_status, source_updated_at_status, first_seen_at, last_seen_at)
       VALUES ($1, $2, 'external-exact-boundary', 'https://upgrade.example/exact-boundary', 'https://upgrade.example/exact-boundary', 'Exact boundary headline', 'exact boundary headline', $3, 'missing', 'missing', '2026-08-15T10:01:00Z', '2026-08-15T10:02:00Z')`,
      [exactBoundaryArticleId, sourceId, exactBoundarySummary],
    );
    await database.query(
      'INSERT INTO article_categories (article_id, category_id) VALUES ($1, $2)',
      [articleId, categoryId],
    );
    await database.query(
      'INSERT INTO article_category_overrides(article_id) VALUES ($1)',
      [articleId],
    );
    await database.query(
      'INSERT INTO article_category_override_memberships(article_id, category_id) VALUES ($1, $2)',
      [articleId, categoryId],
    );
    await database.query(
      `INSERT INTO collection_runs (id, source_endpoint_id, execution_id, trigger_kind, started_at, finished_at, run_status, transport_status, parser_status, normalization_status, processing_status)
       VALUES ($1, $2, $3, 'scheduled', '2026-08-15T10:00:00Z', '2026-08-15T10:01:00Z', 'succeeded', 'succeeded', 'succeeded', 'succeeded', 'succeeded')`,
      [runId, endpointId, randomUUID()],
    );
    await database.query(
      `INSERT INTO article_observations (id, source_id, source_endpoint_id, collection_run_id, article_id, processing_outcome, observed_external_id, observed_canonical_identity_url)
       VALUES ($1, $2, $3, $4, $5, 'created', 'external-upgrade', 'https://upgrade.example/a')`,
      [randomUUID(), sourceId, endpointId, runId, articleId],
    );
    await database.transaction(async (transaction) => {
      await transaction.query(
        'SET CONSTRAINTS duplicate_groups_primary_membership_fk DEFERRED',
      );
      await transaction.query(
        `INSERT INTO duplicate_groups (id, primary_article_id, primary_selection_origin)
         VALUES ($1, $2, 'manual')`,
        [groupId, articleId],
      );
      await transaction.query(
        'INSERT INTO duplicate_group_memberships (group_id, article_id) VALUES ($1, $2)',
        [groupId, articleId],
      );
    });
    await database.query(
      `INSERT INTO audit_events (id, action, target_type, target_id, reason, prior_state, new_state)
       VALUES ($1, 'article_title_changed', 'article', $2, 'Upgrade proof', '{"title":"old"}', '{"title":"Operator headline"}')`,
      [randomUUID(), articleId],
    );
    await enqueueEndpointCollectionJob(database, {
      sourceEndpointId: endpointId,
      triggerKind: 'manual',
      availableAt: new Date('2026-08-15T12:00:00Z'),
      attemptNumber: 1,
    });
    return {
      sourceId,
      articleId,
      unchangedArticleId,
      noBoundaryArticleId,
      exactBoundaryArticleId,
      unchangedSummary,
      multiWordSummary,
      noBoundarySummary,
      exactBoundarySummary,
    };
  } finally {
    await database.close();
  }
}

async function governedSnapshot(databaseUrl: string, articleId: string) {
  const database = createDatabase({ connectionString: databaseUrl });
  try {
    const result = await database.query(
      `SELECT p.name AS publication_name, p.description, p.accent_color, s.config_key AS source_key,
              d.hostname AS approved_domain, e.etag, c.config_key AS category_key, r.config_key AS rule_key,
              a.display_title_override, o.processing_outcome, g.primary_selection_origin, ae.action AS audit_action
         FROM publication_settings p, sources s
         JOIN source_approved_domain_rules d ON d.source_id = s.id
         JOIN source_endpoints e ON e.source_id = s.id
         JOIN relevance_rules r ON r.source_id = s.id
         JOIN categories c ON c.id = r.category_id
         JOIN articles a ON a.source_id = s.id
         JOIN article_observations o ON o.article_id = a.id
         JOIN duplicate_group_memberships gm ON gm.article_id = a.id
         JOIN duplicate_groups g ON g.id = gm.group_id
         JOIN audit_events ae ON ae.target_id = a.id
        WHERE a.id = $1`,
      [articleId],
    );
    const jobs = await database.query(
      `SELECT status, trigger_kind, attempt_number
         FROM endpoint_collection_jobs
        ORDER BY enqueued_at ASC`,
    );
    const articles = await database.query<{
      readonly id: string;
      readonly source_id: string;
      readonly original_url: string;
      readonly canonical_identity_url: string;
      readonly display_title: string;
      readonly normalized_title: string;
      readonly summary: string | null;
      readonly display_title_override: string | null;
      readonly visibility_state: string;
      readonly published_at: Date | null;
      readonly first_seen_at: Date;
      readonly last_seen_at: Date;
      readonly created_at: Date;
      readonly updated_at: Date;
    }>(
      `SELECT id, source_id, original_url, canonical_identity_url, display_title,
              normalized_title, summary, display_title_override, visibility_state,
              published_at, first_seen_at, last_seen_at, created_at, updated_at
         FROM articles
        ORDER BY id`,
    );
    return {
      governedRelationships: result.rows,
      jobs: jobs.rows,
      articleState: articles.rows,
    };
  } finally {
    await database.close();
  }
}
