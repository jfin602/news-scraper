import { normalizeConfigKey } from '../sources/configuration.ts';
import type { CanonicalOutwardArticle } from './canonical-outward-articles.ts';
import {
  decodeDistributionCursor,
  encodeDistributionCursor,
  type DistributionCursor,
} from './cursor.ts';
import { distributionSnapshotRevision } from './snapshot-revision.ts';
import {
  createDistributionProfileSnapshotService,
  type DistributionProfileReadOutcome,
  type DistributionProfileSnapshotService,
} from './profile-snapshot.ts';
import type { Database } from '../database/database.ts';

export const DISTRIBUTION_PAGE_SIZE = 100;

export type DistributionProfilePageOutcome =
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'draft' }>
  | Readonly<{ kind: 'disabled' }>
  | Readonly<{
      kind: 'active';
      snapshotRevision: string;
      profile: Readonly<{ configKey: string; displayName: string }>;
      publication: Readonly<{ name: string }>;
      items: readonly DistributionProfilePageItem[];
      nextCursor: string | null;
    }>
  | Readonly<{ kind: 'invalid_input' }>
  | Readonly<{ kind: 'snapshot_changed' }>
  | Readonly<{ kind: 'read_failed' }>;

export interface DistributionProfilePageItem {
  readonly articleId: string;
  readonly headline: string;
  readonly originalUrl: string;
  readonly effectiveFeedDate: Date;
  readonly feedDateSource: CanonicalOutwardArticle['feedDateSource'];
  readonly publishedAt: Date | null;
  readonly author: string | null;
  readonly summary: string | null;
  readonly imageUrl: string | null;
  readonly source: Readonly<{ configKey: string; displayName: string }>;
  readonly categories: readonly Readonly<{
    configKey: string;
    displayName: string;
  }>[];
}

export interface DistributionProfilePageService {
  read(
    profileConfigKey: unknown,
    cursor?: unknown,
  ): Promise<DistributionProfilePageOutcome>;
}

export function createDistributionProfilePageService(
  database: Database,
): DistributionProfilePageService {
  return createDistributionProfilePageServiceFromSnapshotService(
    createDistributionProfileSnapshotService(database),
  );
}

export function createDistributionProfilePageServiceFromSnapshotService(
  snapshots: DistributionProfileSnapshotService,
): DistributionProfilePageService {
  return Object.freeze({
    async read(
      profileConfigKey: unknown,
      encodedCursor?: unknown,
    ): Promise<DistributionProfilePageOutcome> {
      let key: string;
      try {
        key = normalizeConfigKey(profileConfigKey);
      } catch {
        return Object.freeze({ kind: 'invalid_input' });
      }

      let outcome: DistributionProfileReadOutcome;
      try {
        outcome = await snapshots.read(key);
      } catch {
        return Object.freeze({ kind: 'read_failed' });
      }
      if (outcome.kind !== 'active') return mapNonActiveOutcome(outcome);
      if (encodedCursor !== undefined && typeof encodedCursor !== 'string') {
        return Object.freeze({ kind: 'invalid_input' });
      }

      let revision: string;
      try {
        revision = distributionSnapshotRevision(outcome.snapshot);
      } catch {
        return Object.freeze({ kind: 'read_failed' });
      }
      let cursor: DistributionCursor | undefined;
      if (encodedCursor !== undefined) {
        try {
          cursor = decodeDistributionCursor(encodedCursor, key);
        } catch {
          return Object.freeze({ kind: 'invalid_input' });
        }
        if (cursor.snapshotRevision !== revision) {
          return Object.freeze({ kind: 'snapshot_changed' });
        }
      }

      const startIndex =
        cursor === undefined
          ? 0
          : continuationIndex(outcome.snapshot.articles, cursor);
      if (startIndex === undefined) {
        return Object.freeze({ kind: 'invalid_input' });
      }
      const articles = outcome.snapshot.articles.slice(
        startIndex,
        startIndex + DISTRIBUTION_PAGE_SIZE,
      );
      const hasMore =
        startIndex + articles.length < outcome.snapshot.articles.length;
      let nextCursor: string | null = null;
      if (hasMore) {
        try {
          nextCursor = encodeDistributionCursor(
            key,
            revision,
            articles[articles.length - 1]!.orderPosition,
          );
        } catch {
          return Object.freeze({ kind: 'read_failed' });
        }
      }

      return Object.freeze({
        kind: 'active' as const,
        snapshotRevision: revision,
        profile: Object.freeze({ ...outcome.snapshot.profile }),
        publication: Object.freeze({ ...outcome.snapshot.publication }),
        items: Object.freeze(articles.map(toPageItem)),
        nextCursor,
      });
    },
  });
}

function mapNonActiveOutcome(
  outcome: Exclude<DistributionProfileReadOutcome, { kind: 'active' }>,
): Exclude<
  DistributionProfilePageOutcome,
  { kind: 'active' | 'invalid_input' | 'snapshot_changed' }
> {
  if (outcome.kind === 'not_found') return Object.freeze({ kind: 'not_found' });
  if (outcome.kind === 'draft') return Object.freeze({ kind: 'draft' });
  if (outcome.kind === 'disabled') return Object.freeze({ kind: 'disabled' });
  return Object.freeze({ kind: 'read_failed' });
}

function continuationIndex(
  articles: readonly CanonicalOutwardArticle[],
  cursor: DistributionCursor,
): number | undefined {
  const index = articles.findIndex(
    (article) =>
      article.orderPosition.effectiveFeedDate === cursor.effectiveFeedDate &&
      article.orderPosition.firstSeenAt === cursor.firstSeenAt &&
      article.orderPosition.articleId === cursor.articleId,
  );
  return index === -1 ? undefined : index + 1;
}

function toPageItem(
  article: CanonicalOutwardArticle,
): DistributionProfilePageItem {
  return Object.freeze({
    articleId: article.articleId,
    headline: article.headline,
    originalUrl: article.originalUrl,
    effectiveFeedDate: new Date(article.effectiveFeedDate.getTime()),
    feedDateSource: article.feedDateSource,
    publishedAt:
      article.publishedAt === null
        ? null
        : new Date(article.publishedAt.getTime()),
    author: article.author,
    summary: article.summary,
    imageUrl: article.imageUrl,
    source: Object.freeze({ ...article.source }),
    categories: Object.freeze(
      article.categories.map((category) => Object.freeze({ ...category })),
    ),
  });
}
