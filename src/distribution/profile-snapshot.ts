import type {
  Database,
  QueryExecutor,
  RepeatableReadDatabase,
} from '../database/database.ts';
import {
  readCanonicalOutwardArticlesForProfileSource,
  type CanonicalOutwardArticle,
  type CanonicalOutwardOrderPosition,
} from './canonical-outward-articles.ts';
import { readPublicationSettings } from '../publication/repository.ts';
import { normalizeConfigKey } from '../sources/configuration.ts';
import {
  findDistributionProfileByConfigKey,
  type PersistedDistributionProfile,
  type PersistedDistributionProfileSource,
} from './profiles/repository.ts';

export interface DistributionProfileSnapshot {
  readonly profile: Readonly<{ configKey: string; displayName: string }>;
  readonly publication: Readonly<{ name: string }>;
  readonly articles: readonly CanonicalOutwardArticle[];
  /** P3-only material; never serialize this directly. */
  readonly internal: Readonly<{
    readonly profile: PersistedDistributionProfile;
    readonly orderPositions: readonly CanonicalOutwardOrderPosition[];
  }>;
}

export type DistributionProfileReadOutcome =
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'draft'; profile: PersistedDistributionProfile }>
  | Readonly<{ kind: 'disabled'; profile: PersistedDistributionProfile }>
  | Readonly<{ kind: 'active'; snapshot: DistributionProfileSnapshot }>
  | Readonly<{ kind: 'read_failed' }>;

export interface DistributionProfileSnapshotService {
  read(profileConfigKey: unknown): Promise<DistributionProfileReadOutcome>;
}

export function createDistributionProfileSnapshotService(
  database: Database,
): DistributionProfileSnapshotService {
  const repeatableReadDatabase = database as RepeatableReadDatabase;
  return Object.freeze({
    async read(
      profileConfigKey: unknown,
    ): Promise<DistributionProfileReadOutcome> {
      let key: string;
      try {
        key = normalizeConfigKey(profileConfigKey);
      } catch {
        return Object.freeze({ kind: 'not_found' });
      }
      try {
        if (
          repeatableReadDatabase.readOnlyRepeatableReadTransaction === undefined
        ) {
          throw new Error('repeatable-read transaction is unavailable');
        }
        return await repeatableReadDatabase.readOnlyRepeatableReadTransaction(
          (transaction) =>
            readDistributionProfileSnapshotInTransaction(transaction, key),
        );
      } catch {
        return Object.freeze({ kind: 'read_failed' });
      }
    },
  });
}

/**
 * The caller owns transaction scope. This keeps the P1 canonical Article
 * producer independently reusable by digest generation and outward consumers.
 */
export async function readDistributionProfileSnapshotInTransaction(
  transaction: QueryExecutor,
  profileConfigKey: unknown,
): Promise<DistributionProfileReadOutcome> {
  const key = normalizeConfigKey(profileConfigKey);
  const profile = await findDistributionProfileByConfigKey(transaction, key);
  if (profile === undefined) return Object.freeze({ kind: 'not_found' });
  if (profile.lifecycle === 'draft')
    return Object.freeze({ kind: 'draft', profile });
  if (profile.lifecycle === 'disabled')
    return Object.freeze({ kind: 'disabled', profile });
  const publication = await readPublicationSettings(transaction);
  if (publication === undefined) throw new Error('missing publication');
  const candidates = await Promise.all(
    profile.sources.map((source) =>
      readSource(transaction, source, profile.resultLimit),
    ),
  );
  const articles = Object.freeze(
    candidates.flat().sort(compareArticles).slice(0, profile.resultLimit),
  );
  return Object.freeze({
    kind: 'active',
    snapshot: Object.freeze({
      profile: Object.freeze({
        configKey: profile.configKey,
        displayName: profile.displayName,
      }),
      publication: Object.freeze({ name: publication.name }),
      articles,
      internal: Object.freeze({
        profile,
        orderPositions: Object.freeze(
          articles.map((article) => article.orderPosition),
        ),
      }),
    }),
  });
}

async function readSource(
  transaction: Parameters<
    typeof readCanonicalOutwardArticlesForProfileSource
  >[0],
  source: PersistedDistributionProfileSource,
  limit: number,
) {
  return readCanonicalOutwardArticlesForProfileSource(transaction, {
    sourceConfigKey: source.sourceConfigKey,
    includeAnyPhrases: source.includeAnyPhrases,
    excludeAnyPhrases: source.excludeAnyPhrases,
    categoryConfigKeys: source.categoryConfigKeys,
    limit,
  });
}

function compareArticles(
  left: CanonicalOutwardArticle,
  right: CanonicalOutwardArticle,
): number {
  const leftPosition = left.orderPosition;
  const rightPosition = right.orderPosition;
  return (
    rightPosition.effectiveFeedDate.localeCompare(
      leftPosition.effectiveFeedDate,
    ) ||
    rightPosition.firstSeenAt.localeCompare(leftPosition.firstSeenAt) ||
    leftPosition.articleId.localeCompare(rightPosition.articleId)
  );
}
