import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDigestInputServiceFromDependencies,
  digestInputIdentity,
} from '../../src/distribution/digests/input.ts';
import type { DistributionProfileSnapshotService } from '../../src/distribution/profile-snapshot.ts';
import {
  normalizeDigestStyleGuidance,
  type ProfileAiSettings,
} from '../../src/distribution/digests/repository.ts';
import { createHash } from 'node:crypto';

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

test('lifecycle input returns the bounded provider projection and all canonical Profile Articles from one snapshot', async () => {
  let reads = 0;
  const canonicalArticles = Object.freeze([
    article('current', '2026-08-10T00:00:00.000Z'),
    article('outside-input', '2026-08-09T00:00:00.000Z'),
  ]);
  const service = createDigestInputServiceFromDependencies({
    snapshots: {
      async read() {
        reads += 1;
        return Object.freeze({
          kind: 'active' as const,
          snapshot: Object.freeze({
            profile: Object.freeze({
              configKey: 'books',
              displayName: 'Books',
            }),
            publication: Object.freeze({ name: 'Publication' }),
            articles: canonicalArticles,
            internal: Object.freeze({
              profile: Object.freeze({ id: profileId }),
              orderPositions: Object.freeze([]),
            }),
          }),
        }) as never;
      },
    },
    readSettings: async () => settings(1),
  });

  const result = await service.readForLifecycle(
    'books',
    new Date('2026-08-10T00:00:00.000Z'),
  );

  assert.equal(result.kind, 'active');
  if (result.kind !== 'active') throw new Error();
  assert.equal(reads, 1);
  assert.deepEqual(
    result.input.articles.map((item) => item.articleId),
    ['current'],
  );
  assert.deepEqual(
    result.canonicalArticles.map((item) => item.articleId),
    ['current', 'outside-input'],
  );
  assert.equal(
    result.canonicalArticles[1]?.imageUrl,
    'https://example.test/image.jpg',
  );
  assert.equal('imageUrl' in result.input.articles[0]!, false);
});

test('digest input identity is stable, preserves the legacy null-style v1 hash, and distinguishes Profile settings and ordered Article IDs', () => {
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
  assert.equal(digestInputIdentity(base), legacyV1Identity(base));
  const customStyle = {
    ...base,
    settings: { ...settings(20), digestStyleGuidance: 'Write for librarians.' },
  };
  assert.notEqual(digestInputIdentity(base), digestInputIdentity(customStyle));
  assert.notEqual(
    digestInputIdentity(customStyle),
    digestInputIdentity({
      ...customStyle,
      settings: {
        ...customStyle.settings,
        digestStyleGuidance: 'Write for new authors.',
      },
    }),
  );
  assert.equal(
    digestInputIdentity({
      ...customStyle,
      settings: { ...customStyle.settings, digestStyleGuidance: null },
    }),
    legacyV1Identity(base),
  );
});

test('digest writing style normalization is Unicode code-point bounded and canonicalizes blank input', () => {
  assert.equal(normalizeDigestStyleGuidance(null), null);
  assert.equal(normalizeDigestStyleGuidance(' \n  '), null);
  assert.equal(
    normalizeDigestStyleGuidance('  Friendly\nfor readers  '),
    'Friendly\nfor readers',
  );
  assert.equal(
    normalizeDigestStyleGuidance('🙂'.repeat(500)),
    '🙂'.repeat(500),
  );
  assert.throws(() => normalizeDigestStyleGuidance('🙂'.repeat(501)));
  assert.throws(() => normalizeDigestStyleGuidance({ style: 'friendly' }));
});

function legacyV1Identity(
  input: Readonly<{
    profileConfigKey: string;
    settings: Pick<
      ProfileAiSettings,
      'digestEnabled' | 'digestLookbackDays' | 'digestMaxArticleCount'
    >;
    orderedArticleIds: readonly string[];
  }>,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: 'v1',
        profileKey: input.profileConfigKey,
        settings: {
          digestEnabled: input.settings.digestEnabled,
          digestLookbackDays: input.settings.digestLookbackDays,
          digestMaxArticleCount: input.settings.digestMaxArticleCount,
        },
        articleIds: [...input.orderedArticleIds],
      }),
      'utf8',
    )
    .digest('hex');
}

function settings(maximum: number): ProfileAiSettings {
  return Object.freeze({
    profileId,
    profileConfigKey: 'books',
    digestEnabled: false,
    digestLookbackDays: 7,
    digestMaxArticleCount: maximum,
    digestStyleGuidance: null,
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
