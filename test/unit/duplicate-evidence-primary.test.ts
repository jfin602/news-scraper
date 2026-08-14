import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { PersistedArticle } from '../../src/articles/repository.ts';
import {
  canonicalizeArticlePair,
  DUPLICATE_REASON_CODES,
  evaluateDuplicateEvidence,
} from '../../src/deduplication/evidence.ts';
import { selectPrimary } from '../../src/deduplication/primary.ts';

const ids = {
  a: '40000000-0000-4000-8000-000000000001',
  b: '40000000-0000-4000-8000-000000000002',
  c: '40000000-0000-4000-8000-000000000003',
};

test('canonical article pairs are unordered and reject invalid/self IDs', () => {
  assert.deepEqual(canonicalizeArticlePair(ids.b, ids.a), {
    articleLowId: ids.a,
    articleHighId: ids.b,
  });
  assert.throws(() => canonicalizeArticlePair(ids.a, ids.a));
  assert.throws(() => canonicalizeArticlePair('not-a-uuid', ids.a));
});

test('duplicate evidence is conservative, exact, ordered, and fingerprinted', () => {
  const first = article({ id: ids.a, sourceId: 'source-a' });
  const second = article({
    id: ids.b,
    sourceId: 'source-b',
    canonicalIdentityUrl: first.canonicalIdentityUrl,
    normalizedTitle: first.normalizedTitle,
  });
  const evidence = evaluateDuplicateEvidence(first, second)!;
  assert.equal(evidence.strength, 'strong');
  assert.equal(evidence.confidence, 100);
  assert.deepEqual(evidence.signals, [
    {
      reasonCode: DUPLICATE_REASON_CODES.canonicalIdentityUrlEqual,
      strength: 'strong',
    },
    {
      reasonCode: DUPLICATE_REASON_CODES.normalizedTitleEqual,
      strength: 'weak',
    },
  ]);
  assert.deepEqual(evaluateDuplicateEvidence(second, first), evidence);
  assert.equal(
    evaluateDuplicateEvidence(
      first,
      article({
        id: ids.b,
        sourceId: 'source-b',
        canonicalIdentityUrl: 'https://publisher.test/other',
        normalizedTitle: first.normalizedTitle,
      }),
    )?.strength,
    'weak',
  );
  assert.notEqual(
    evidence.evidenceFingerprint,
    evaluateDuplicateEvidence(
      first,
      article({
        id: ids.b,
        sourceId: 'source-b',
        canonicalIdentityUrl: first.canonicalIdentityUrl,
        normalizedTitle: 'a different title',
      }),
    )?.evidenceFingerprint,
  );
  assert.equal(
    evaluateDuplicateEvidence(
      first,
      article({ id: ids.b, sourceId: 'source-a' }),
    ),
    undefined,
  );
  assert.equal(
    evaluateDuplicateEvidence(
      first,
      article({
        id: ids.b,
        sourceId: 'source-b',
        canonicalIdentityUrl: 'https://publisher.test/other',
        normalizedTitle: 'different title',
      }),
    ),
    undefined,
  );
});

test('Primary selection is order-independent and follows the governed criteria', () => {
  const priorities = {
    priorities: new Map([
      ['source-a', 10],
      ['source-b', 10],
    ]),
  };
  const sparseHttp = article({
    id: ids.a,
    sourceId: 'source-a',
    originalUrl: 'http://source.test/a',
    firstSeenAt: '2020-01-01',
    createdAt: '2020-01-01',
  });
  const completeHttps = article({
    id: ids.b,
    sourceId: 'source-b',
    originalUrl: 'https://source.test/b',
    author: 'A',
    summary: 'S',
    imageUrl: 'I',
    language: 'en',
    firstSeenAt: '2030-01-01',
    createdAt: '2030-01-01',
  });
  assert.equal(
    selectPrimary([sparseHttp, completeHttps], priorities).id,
    ids.b,
  );

  const higherPriority = article({ id: ids.c, sourceId: 'source-a' });
  assert.equal(
    selectPrimary([completeHttps, higherPriority], {
      priorities: new Map([
        ['source-a', 11],
        ['source-b', 10],
      ]),
    }).id,
    ids.c,
  );

  const parsedEarlier = article({
    id: ids.c,
    sourceId: 'source-b',
    publishedAtStatus: 'parsed',
    publishedAt: '2021-01-01',
  });
  const parsedLater = article({
    id: ids.a,
    sourceId: 'source-a',
    publishedAtStatus: 'parsed',
    publishedAt: '2022-01-01',
  });
  assert.equal(
    selectPrimary([parsedLater, parsedEarlier], priorities).id,
    ids.c,
  );

  const fallbackOld = article({
    id: ids.a,
    sourceId: 'source-a',
    firstSeenAt: '2020-01-01',
  });
  const fallbackNew = article({
    id: ids.b,
    sourceId: 'source-b',
    firstSeenAt: '2021-01-01',
  });
  assert.equal(selectPrimary([fallbackNew, fallbackOld], priorities).id, ids.a);
  const oldCreated = article({
    id: ids.a,
    sourceId: 'source-a',
    firstSeenAt: '2020-01-01',
    createdAt: '2020-01-02',
  });
  const newCreated = article({
    id: ids.b,
    sourceId: 'source-b',
    firstSeenAt: '2020-01-01',
    createdAt: '2020-01-03',
  });
  assert.equal(selectPrimary([newCreated, oldCreated], priorities).id, ids.a);
  const invalidDate = article({
    id: ids.a,
    sourceId: 'source-a',
    publishedAtStatus: 'invalid',
    publishedAt: '2020-01-01',
    firstSeenAt: '2020-01-01',
  });
  const missingDate = article({
    id: ids.b,
    sourceId: 'source-b',
    firstSeenAt: '2021-01-01',
  });
  assert.equal(selectPrimary([missingDate, invalidDate], priorities).id, ids.a);
  const http = article({
    id: ids.a,
    sourceId: 'source-a',
    originalUrl: 'http://source.test/item',
  });
  const https = article({
    id: ids.b,
    sourceId: 'source-b',
    originalUrl: 'https://source.test/item',
  });
  assert.equal(selectPrimary([http, https], priorities).id, ids.b);
  assert.equal(
    selectPrimary(
      [
        article({ id: ids.b, sourceId: 'source-b' }),
        article({ id: ids.a, sourceId: 'source-a' }),
      ],
      priorities,
    ).id,
    ids.a,
  );
});

function article(
  overrides: Partial<{
    [K in keyof PersistedArticle]: PersistedArticle[K] | string | undefined;
  }> & { id: string; sourceId: string },
): PersistedArticle {
  const date = (value: unknown, fallback: string): Date =>
    new Date(
      typeof value === 'string'
        ? value
        : ((value as Date | undefined) ?? fallback),
    );
  return {
    id: overrides.id,
    sourceId: overrides.sourceId,
    externalId: undefined,
    originalUrl:
      (overrides.originalUrl as string | undefined) ??
      'https://source.test/item',
    canonicalIdentityUrl:
      (overrides.canonicalIdentityUrl as string | undefined) ??
      'https://publisher.test/item',
    displayTitle: 'Display title',
    normalizedTitle:
      (overrides.normalizedTitle as string | undefined) ?? 'display title',
    author: (overrides.author as string | undefined) ?? undefined,
    summary: (overrides.summary as string | undefined) ?? undefined,
    imageUrl: (overrides.imageUrl as string | undefined) ?? undefined,
    language: (overrides.language as string | undefined) ?? undefined,
    publishedAtStatus:
      (overrides.publishedAtStatus as
        PersistedArticle['publishedAtStatus'] | undefined) ?? 'missing',
    publishedAt:
      overrides.publishedAt === undefined
        ? undefined
        : date(overrides.publishedAt, '2020-01-01'),
    sourceUpdatedAtStatus: 'missing',
    sourceUpdatedAt: undefined,
    visibilityState: 'visible',
    firstSeenAt: date(overrides.firstSeenAt, '2020-01-01'),
    lastSeenAt: date('2020-01-01', '2020-01-01'),
    createdAt: date(overrides.createdAt, '2020-01-01'),
    updatedAt: date('2020-01-01', '2020-01-01'),
  };
}
