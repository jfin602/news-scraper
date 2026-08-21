import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decodeDistributionCursor,
  encodeDistributionCursor,
  DistributionCursorInputError,
  DISTRIBUTION_CURSOR_MAX_ENCODED_LENGTH,
} from '../../src/distribution/cursor.ts';
import { createDistributionProfilePageServiceFromSnapshotService } from '../../src/distribution/profile-page.ts';
import type {
  DistributionProfileSnapshot,
  DistributionProfileSnapshotService,
} from '../../src/distribution/profile-snapshot.ts';
import type { CanonicalOutwardOrderPosition } from '../../src/distribution/canonical-outward-articles.ts';
import { distributionSnapshotRevision } from '../../src/distribution/snapshot-revision.ts';

const POSITION = Object.freeze({
  effectiveFeedDate: '2026-08-12T10:11:12.123456Z',
  firstSeenAt: '2026-08-12T10:10:09.654321Z',
  articleId: '12345678-1234-4234-8234-123456789abc',
});
const REVISION = 'a'.repeat(64);

test('distribution revisions are deterministic and include governed semantics only', () => {
  const snapshot = makeSnapshot();
  assert.equal(
    distributionSnapshotRevision(snapshot),
    distributionSnapshotRevision(snapshot),
  );

  const irrelevant = makeSnapshot();
  assert.equal(
    distributionSnapshotRevision(snapshot),
    distributionSnapshotRevision(irrelevant),
  );
  assert.notEqual(
    distributionSnapshotRevision(snapshot),
    distributionSnapshotRevision(
      makeSnapshot({ profileDisplayName: 'Changed' }),
    ),
  );
  assert.notEqual(
    distributionSnapshotRevision(snapshot),
    distributionSnapshotRevision(makeSnapshot({ includeAnyPhrases: ['book'] })),
  );
  assert.notEqual(
    distributionSnapshotRevision(snapshot),
    distributionSnapshotRevision(makeSnapshot({ headline: 'Changed' })),
  );
  assert.notEqual(
    distributionSnapshotRevision(snapshot),
    distributionSnapshotRevision(makeSnapshot({ publicationName: 'Changed' })),
  );
  assert.notEqual(
    distributionSnapshotRevision(snapshot),
    distributionSnapshotRevision(
      makeSnapshot({
        orderPosition: {
          ...POSITION,
          firstSeenAt: '2026-08-12T10:10:09.654322Z',
        },
      }),
    ),
  );
});

test('distribution cursor is deterministic, opaque, versioned, and microsecond-safe', () => {
  const cursor = encodeDistributionCursor('books', REVISION, POSITION);
  assert.match(cursor, /^[A-Za-z0-9_-]+$/u);
  assert.equal(encodeDistributionCursor('books', REVISION, POSITION), cursor);
  assert.deepEqual(decodeDistributionCursor(cursor, 'books'), {
    version: 1,
    profileConfigKey: 'books',
    snapshotRevision: REVISION,
    ...POSITION,
  });
  assert.equal(
    encodeDistributionCursor(
      'books',
      REVISION,
      decodeDistributionCursor(cursor, 'books'),
    ),
    cursor,
  );
  assert.throws(
    () => decodeDistributionCursor(cursor, 'other'),
    isInvalidCursor,
  );

  const payload = {
    version: 1,
    profileConfigKey: 'books',
    snapshotRevision: REVISION,
    ...POSITION,
  };
  for (const encoded of [
    '***',
    'a'.repeat(DISTRIBUTION_CURSOR_MAX_ENCODED_LENGTH + 1),
    encodePayload({ ...payload, version: 2 }),
    encodePayload({ ...payload, articleId: 'not-a-uuid' }),
    encodePayload({
      ...payload,
      effectiveFeedDate: POSITION.effectiveFeedDate.slice(0, -2),
    }),
    encodePayload({ ...payload, extra: true }),
  ]) {
    assert.throws(
      () => decodeDistributionCursor(encoded, 'books'),
      isInvalidCursor,
    );
  }
});

test('page service traverses static snapshots with keyset cursors and no repetition', async () => {
  const snapshot = makeSnapshot({ articleCount: 205 });
  const service = createDistributionProfilePageServiceFromSnapshotService(
    fixedSnapshotService(snapshot),
  );
  const seen: string[] = [];
  let cursor: string | null = null;
  let revision: string | undefined;
  for (;;) {
    const page = await service.read('books', cursor ?? undefined);
    assert.equal(page.kind, 'active');
    if (page.kind !== 'active') throw new Error();
    revision ??= page.snapshotRevision;
    assert.equal(page.snapshotRevision, revision);
    seen.push(...page.items.map((item) => item.articleId));
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  assert.equal(seen.length, 205);
  assert.equal(new Set(seen).size, 205);
  assert.deepEqual(
    seen,
    snapshot.articles.map((article) => article.articleId),
  );
});

test('empty and exact-page-boundary snapshots exhaust without a cursor', async () => {
  for (const articleCount of [0, 1, 100]) {
    const page = await createDistributionProfilePageServiceFromSnapshotService(
      fixedSnapshotService(makeSnapshot({ articleCount })),
    ).read('books');
    assert.equal(page.kind, 'active');
    if (page.kind !== 'active') throw new Error();
    assert.equal(page.items.length, articleCount);
    assert.equal(page.nextCursor, null);
  }
});

test('page service rejects stale, tampered, and malformed continuations', async () => {
  const before = makeSnapshot({ articleCount: 101 });
  const beforeService = createDistributionProfilePageServiceFromSnapshotService(
    fixedSnapshotService(before),
  );
  const first = await beforeService.read('books');
  assert.equal(first.kind, 'active');
  if (first.kind !== 'active' || first.nextCursor === null) throw new Error();

  const changed = makeSnapshot({ articleCount: 101, headline: 'Changed' });
  const changedService =
    createDistributionProfilePageServiceFromSnapshotService(
      fixedSnapshotService(changed),
    );
  assert.deepEqual(await changedService.read('books', first.nextCursor), {
    kind: 'snapshot_changed',
  });
  assert.deepEqual(await beforeService.read('books', '***'), {
    kind: 'invalid_input',
  });

  const tampered = encodeDistributionCursor(
    'books',
    distributionSnapshotRevision(before),
    {
      ...POSITION,
      articleId: '12345678-1234-4234-8234-000000000000',
    },
  );
  assert.deepEqual(await beforeService.read('books', tampered), {
    kind: 'invalid_input',
  });
});

test('page service preserves producer-owned lifecycle and dependency outcomes', async () => {
  for (const outcome of [
    { kind: 'not_found' as const },
    { kind: 'draft' as const },
    { kind: 'disabled' as const },
    { kind: 'read_failed' as const },
  ]) {
    const snapshots: DistributionProfileSnapshotService = {
      read: async () =>
        outcome.kind === 'draft' || outcome.kind === 'disabled'
          ? { ...outcome, profile: makeSnapshot().internal.profile }
          : outcome,
    };
    const result =
      await createDistributionProfilePageServiceFromSnapshotService(
        snapshots,
      ).read('books');
    assert.deepEqual(result, outcome);
  }
  assert.deepEqual(
    await createDistributionProfilePageServiceFromSnapshotService(
      fixedSnapshotService(makeSnapshot()),
    ).read('not a key'),
    { kind: 'invalid_input' },
  );
});

function fixedSnapshotService(
  snapshot: DistributionProfileSnapshot,
): DistributionProfileSnapshotService {
  return {
    read: async () => Object.freeze({ kind: 'active' as const, snapshot }),
  };
}

function makeSnapshot(
  options: {
    articleCount?: number;
    profileDisplayName?: string;
    includeAnyPhrases?: readonly string[];
    headline?: string;
    publicationName?: string;
    orderPosition?: CanonicalOutwardOrderPosition;
  } = {},
): DistributionProfileSnapshot {
  const articleCount = options.articleCount ?? 1;
  const articles = Object.freeze(
    Array.from({ length: articleCount }, (_, index) => {
      const articleId = `12345678-1234-4234-8234-${index.toString(16).padStart(12, '0')}`;
      const orderPosition =
        options.orderPosition === undefined
          ? {
              effectiveFeedDate: '2026-08-12T10:11:12.123456Z',
              firstSeenAt: `2026-08-12T10:10:09.${String(index + 1).padStart(6, '0')}Z`,
              articleId,
            }
          : { ...options.orderPosition, articleId };
      return Object.freeze({
        articleId,
        headline: options.headline ?? `Headline ${index}`,
        originalUrl: `https://reader.example/${index}`,
        effectiveFeedDate: new Date('2026-08-12T10:11:12.123Z'),
        feedDateSource: 'first_seen_at' as const,
        publishedAt: null,
        author: null,
        summary: null,
        imageUrl: null,
        source: Object.freeze({ configKey: 'alpha', displayName: 'Alpha' }),
        categories: Object.freeze([]),
        orderPosition: Object.freeze(orderPosition),
      });
    }),
  );
  const profile = Object.freeze({
    id: '12345678-1234-4234-8234-ffffffffffff',
    configKey: 'books',
    displayName: options.profileDisplayName ?? 'Books',
    lifecycle: 'active' as const,
    resultLimit: 1000,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    sources: Object.freeze([
      Object.freeze({
        sourceId: '12345678-1234-4234-8234-eeeeeeeeeeee',
        sourceConfigKey: 'alpha',
        sourceDisplayName: 'Alpha',
        sourceApprovalState: 'approved' as const,
        sourceLifecycleState: 'active' as const,
        includeAnyPhrases: Object.freeze([
          ...(options.includeAnyPhrases ?? []),
        ]),
        excludeAnyPhrases: Object.freeze([]),
        categoryConfigKeys: Object.freeze([]),
      }),
    ]),
  });
  return Object.freeze({
    profile: Object.freeze({
      configKey: 'books',
      displayName: profile.displayName,
    }),
    publication: Object.freeze({
      name: options.publicationName ?? 'Publication',
    }),
    articles,
    internal: Object.freeze({
      profile,
      orderPositions: Object.freeze(
        articles.map((article) => article.orderPosition),
      ),
    }),
  });
}

function encodePayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function isInvalidCursor(error: unknown): boolean {
  return (
    error instanceof DistributionCursorInputError &&
    error.reason === 'invalid_cursor'
  );
}
