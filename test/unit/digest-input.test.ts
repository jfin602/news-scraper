import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDigestInputServiceFromDependencies,
  digestInputIdentity,
} from '../../src/distribution/digests/input.ts';
import type { DistributionProfileSnapshotService } from '../../src/distribution/profile-snapshot.ts';
import type { ProfileAiSettings } from '../../src/distribution/digests/repository.ts';

const profileId = '00000000-0000-0000-0000-000000000001';

test('digest input preserves canonical order, applies the inclusive rolling cutoff, and bounds only after filtering', async () => {
  const service = createDigestInputServiceFromDependencies({
    snapshots: snapshotService([
      article('a', '2026-08-10T00:00:00.000Z'),
      article('b', '2026-08-03T00:00:00.000Z'),
      article('c', '2026-08-02T23:59:59.999Z'),
    ]),
    readSettings: async () => settings(2),
  });
  const result = await service.read(
    'books',
    new Date('2026-08-10T00:00:00.000Z'),
  );
  assert.equal(result.kind, 'active');
  if (result.kind !== 'active') throw new Error();
  assert.deepEqual(
    result.input.articles.map((item) => item.articleId),
    ['a', 'b'],
  );
  assert.equal(result.input.articles[0]?.summary, 'Persisted summary');
  assert.equal('imageUrl' in result.input.articles[0]!, false);
});

test('digest input supports zero, one, twenty, and over-limit canonical Article sets without topic branches', async () => {
  for (const count of [0, 1, 20, 21]) {
    const service = createDigestInputServiceFromDependencies({
      snapshots: snapshotService(
        Array.from({ length: count }, (_, index) =>
          article(`article-${index}`, '2026-08-10T00:00:00.000Z'),
        ),
      ),
      readSettings: async () => settings(20),
    });
    const result = await service.read(
      'books',
      new Date('2026-08-10T00:00:00.000Z'),
    );
    assert.equal(result.kind, 'active');
    if (result.kind === 'active')
      assert.equal(result.input.articles.length, Math.min(count, 20));
  }
});

test('digest input identity is stable and distinguishes Profile settings and ordered Article IDs', () => {
  const base = {
    profileConfigKey: 'books',
    settings: settings(20),
    orderedArticleIds: ['a', 'b'],
  };
  assert.equal(
    digestInputIdentity(base),
    digestInputIdentity({ ...base, orderedArticleIds: ['a', 'b'] }),
  );
  assert.notEqual(
    digestInputIdentity(base),
    digestInputIdentity({ ...base, orderedArticleIds: ['b', 'a'] }),
  );
  assert.notEqual(
    digestInputIdentity(base),
    digestInputIdentity({ ...base, profileConfigKey: 'film' }),
  );
  assert.notEqual(
    digestInputIdentity(base),
    digestInputIdentity({
      ...base,
      settings: { ...settings(20), digestLookbackDays: 8 },
    }),
  );
});

function settings(maximum: number): ProfileAiSettings {
  return Object.freeze({
    profileId,
    profileConfigKey: 'books',
    digestEnabled: false,
    digestLookbackDays: 7,
    digestMaxArticleCount: maximum,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });
}

function snapshotService(
  articles: readonly ReturnType<typeof article>[],
): DistributionProfileSnapshotService {
  return {
    async read() {
      return Object.freeze({
        kind: 'active' as const,
        snapshot: Object.freeze({
          profile: Object.freeze({ configKey: 'books', displayName: 'Books' }),
          publication: Object.freeze({ name: 'Publication' }),
          articles: Object.freeze(articles),
          internal: Object.freeze({
            profile: Object.freeze({ id: profileId }),
            orderPositions: Object.freeze([]),
          }),
        }),
      }) as never;
    },
  };
}

function article(articleId: string, effectiveFeedDate: string) {
  return Object.freeze({
    articleId,
    headline: `Headline ${articleId}`,
    originalUrl: `https://example.test/${articleId}`,
    effectiveFeedDate: new Date(effectiveFeedDate),
    feedDateSource: 'published_at' as const,
    publishedAt: null,
    author: null,
    summary: 'Persisted summary',
    imageUrl: 'https://example.test/image.jpg',
    source: Object.freeze({ configKey: 'source', displayName: 'Source' }),
    categories: Object.freeze([
      Object.freeze({ configKey: 'books', displayName: 'Books' }),
    ]),
    orderPosition: Object.freeze({
      effectiveFeedDate: effectiveFeedDate.replace('.000Z', '.000000Z'),
      firstSeenAt: '2026-08-01T00:00:00.000000Z',
      articleId,
    }),
  });
}
