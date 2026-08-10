import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ArticlePersistenceError,
  persistIncludedArticle,
} from '../../src/articles/repository.ts';
import type { ArticleCandidate } from '../../src/collection/normalization/article-candidate.ts';
import type { Database } from '../../src/database/database.ts';

const CANDIDATE: ArticleCandidate = Object.freeze({
  externalId: 'publisher-item-1',
  displayTitle: 'Display title',
  normalizedTitle: 'display title',
  originalUrl: 'https://publisher.example/article',
  canonicalIdentityUrl: 'https://publisher.example/article',
  publishedAt: Object.freeze({
    status: 'missing',
    fallback: 'first_seen',
  }),
  updatedAt: Object.freeze({ status: 'missing' }),
  provenance: Object.freeze({
    publicationId: '11111111-1111-4111-8111-111111111111',
    sourceId: '22222222-2222-4222-8222-222222222222',
    sourceEndpointId: '33333333-3333-4333-8333-333333333333',
    collectionRunId: '44444444-4444-4444-8444-444444444444',
  }),
});
const OBSERVATION_TIME = new Date('2026-08-10T12:00:00.000Z');

test('maps only governed identity uniqueness constraints to a bounded item conflict', async () => {
  for (const constraint of [
    'articles_source_external_id_digest_unique',
    'articles_fallback_canonical_digest_unique',
  ]) {
    const database = failingTransactionDatabase(
      Object.assign(new Error('synthetic database detail'), {
        code: '23505',
        constraint,
      }),
    );
    assert.deepEqual(
      await persistIncludedArticle(database, CANDIDATE, OBSERVATION_TIME),
      { outcome: 'failed', reason: 'identity_conflict' },
    );
  }
});

test('wraps unexpected transaction failures without exposing database detail', async () => {
  const databaseDetail = 'synthetic SQL and credential-like detail';
  await assert.rejects(
    persistIncludedArticle(
      failingTransactionDatabase(new Error(databaseDetail)),
      CANDIDATE,
      OBSERVATION_TIME,
    ),
    (error: unknown) => {
      assert.ok(error instanceof ArticlePersistenceError);
      assert.equal(error.reason, 'transaction_failed');
      assert.equal(
        error.message,
        'Article persistence failed: transaction_failed.',
      );
      assert.equal(error.message.includes(databaseDetail), false);
      return true;
    },
  );
});

function failingTransactionDatabase(
  error: unknown,
): Pick<Database, 'transaction'> {
  return {
    async transaction(): Promise<never> {
      throw error;
    },
  };
}
