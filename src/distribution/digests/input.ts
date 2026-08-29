import { createHash } from 'node:crypto';

import type {
  DistributionProfileReadOutcome,
  DistributionProfileSnapshotService,
} from '../profile-snapshot.ts';
import { createDistributionProfileSnapshotService } from '../profile-snapshot.ts';
import type { CanonicalOutwardArticle } from '../canonical-outward-articles.ts';
import { readProfileAiSettings, type ProfileAiSettings } from './repository.ts';
import type { Database } from '../../database/database.ts';

export const DIGEST_INPUT_IDENTITY_VERSION = 'v1';

export interface DigestInputArticle {
  readonly articleId: string;
  readonly headline: string;
  readonly sourceDisplayName: string;
  readonly effectiveFeedDate: Date;
  readonly publishedAt: Date | null;
  readonly author: string | null;
  readonly summary: string | null;
  readonly categories: readonly Readonly<{
    configKey: string;
    displayName: string;
  }>[];
  readonly originalUrl: string;
}

export interface ResolvedDigestInput {
  readonly profile: Readonly<{ configKey: string; displayName: string }>;
  readonly settings: ProfileAiSettings;
  readonly resolvedAt: Date;
  readonly articles: readonly DigestInputArticle[];
  readonly digestInputIdentity: string;
}

export type DigestInputReadOutcome =
  | Exclude<DistributionProfileReadOutcome, { kind: 'active' }>
  | Readonly<{ kind: 'active'; input: ResolvedDigestInput }>;

/**
 * Lifecycle-only view of one canonical Profile snapshot. The bounded `input`
 * remains the provider-facing projection; `canonicalArticles` lets lifecycle
 * code validate persisted digest provenance against the same governed snapshot
 * without reconstructing Profile eligibility.
 */
export type DigestLifecycleInputReadOutcome =
  | Exclude<DistributionProfileReadOutcome, { kind: 'active' }>
  | Readonly<{
      kind: 'active';
      input: ResolvedDigestInput;
      canonicalArticles: readonly CanonicalOutwardArticle[];
    }>;

export interface DigestInputService {
  read(profileConfigKey: unknown, now: Date): Promise<DigestInputReadOutcome>;
  readForLifecycle(
    profileConfigKey: unknown,
    now: Date,
  ): Promise<DigestLifecycleInputReadOutcome>;
}

interface DigestInputDependencies {
  readonly snapshots: DistributionProfileSnapshotService;
  readonly readSettings: (
    profileConfigKey: unknown,
  ) => Promise<ProfileAiSettings | undefined>;
}

/**
 * Hashes the version-tagged canonical JSON representation below. It deliberately
 * omits outward snapshotRevision, model output, provider state, and Article data
 * other than the exact ordered IDs. A change in canonical order is significant.
 */
export function digestInputIdentity(
  input: Readonly<{
    profileConfigKey: string;
    settings: Pick<
      ProfileAiSettings,
      'digestEnabled' | 'digestLookbackDays' | 'digestMaxArticleCount'
    >;
    orderedArticleIds: readonly string[];
  }>,
): string {
  const representation = JSON.stringify({
    version: DIGEST_INPUT_IDENTITY_VERSION,
    profileKey: input.profileConfigKey,
    settings: {
      digestEnabled: input.settings.digestEnabled,
      digestLookbackDays: input.settings.digestLookbackDays,
      digestMaxArticleCount: input.settings.digestMaxArticleCount,
    },
    articleIds: [...input.orderedArticleIds],
  });
  return createHash('sha256').update(representation, 'utf8').digest('hex');
}

export function createDigestInputService(
  database: Database,
): DigestInputService {
  return createDigestInputServiceFromDependencies({
    snapshots: createDistributionProfileSnapshotService(database),
    readSettings: (profileConfigKey) =>
      readProfileAiSettings(database, profileConfigKey),
  });
}

/** Exported to keep unit tests and later orchestration consumers SQL-free. */
export function createDigestInputServiceFromDependencies(
  dependencies: DigestInputDependencies,
): DigestInputService {
  return Object.freeze({
    async read(
      profileConfigKey: unknown,
      now: Date,
    ): Promise<DigestInputReadOutcome> {
      const lifecycle = await readForLifecycle(
        dependencies,
        profileConfigKey,
        now,
      );
      if (lifecycle.kind !== 'active') return lifecycle;
      return Object.freeze({ kind: 'active', input: lifecycle.input });
    },
    async readForLifecycle(
      profileConfigKey: unknown,
      now: Date,
    ): Promise<DigestLifecycleInputReadOutcome> {
      return readForLifecycle(dependencies, profileConfigKey, now);
    },
  });
}

async function readForLifecycle(
  dependencies: DigestInputDependencies,
  profileConfigKey: unknown,
  now: Date,
): Promise<DigestLifecycleInputReadOutcome> {
  const snapshot = await dependencies.snapshots.read(profileConfigKey);
  if (snapshot.kind !== 'active') return snapshot;
  const settings = await dependencies.readSettings(
    snapshot.snapshot.profile.configKey,
  );
  if (
    settings === undefined ||
    settings.profileId !== snapshot.snapshot.internal.profile.id
  )
    return Object.freeze({ kind: 'read_failed' });
  return Object.freeze({
    kind: 'active',
    ...resolveDigestLifecycleInputFromSnapshot(
      snapshot.snapshot,
      settings,
      now,
    ),
  });
}

/** P3's caller-snapshot seam; it never opens or changes a canonical snapshot. */
export function resolveDigestLifecycleInputFromSnapshot(
  snapshot: Extract<
    DistributionProfileReadOutcome,
    { kind: 'active' }
  >['snapshot'],
  settings: ProfileAiSettings,
  now: Date,
): Readonly<{
  input: ResolvedDigestInput;
  canonicalArticles: readonly CanonicalOutwardArticle[];
}> {
  const resolvedAt = validNow(now);
  if (settings.profileId !== snapshot.internal.profile.id)
    throw new Error('Profile AI settings do not match the canonical Profile.');
  const cutoff = new Date(
    resolvedAt.getTime() - settings.digestLookbackDays * 24 * 60 * 60 * 1000,
  );
  const articles = Object.freeze(
    snapshot.articles
      .filter(
        (article) => article.effectiveFeedDate.getTime() >= cutoff.getTime(),
      )
      .slice(0, settings.digestMaxArticleCount)
      .map(projectArticle),
  );
  return Object.freeze({
    input: Object.freeze({
      profile: Object.freeze({ ...snapshot.profile }),
      settings,
      resolvedAt,
      articles,
      digestInputIdentity: digestInputIdentity({
        profileConfigKey: snapshot.profile.configKey,
        settings,
        orderedArticleIds: articles.map((article) => article.articleId),
      }),
    }),
    canonicalArticles: snapshot.articles,
  });
}

function projectArticle(article: CanonicalOutwardArticle): DigestInputArticle {
  return Object.freeze({
    articleId: article.articleId,
    headline: article.headline,
    sourceDisplayName: article.source.displayName,
    effectiveFeedDate: new Date(article.effectiveFeedDate.getTime()),
    publishedAt:
      article.publishedAt === null
        ? null
        : new Date(article.publishedAt.getTime()),
    author: article.author,
    summary: article.summary,
    categories: Object.freeze(
      article.categories.map((category) => Object.freeze({ ...category })),
    ),
    originalUrl: article.originalUrl,
  });
}

function validNow(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime()))
    throw new Error('Digest input clock is invalid.');
  return new Date(value.getTime());
}
