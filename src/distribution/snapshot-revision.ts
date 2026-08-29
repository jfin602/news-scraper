import { createHash } from 'node:crypto';

import type { DistributionProfileSnapshot } from './profile-snapshot.ts';
import type { ActiveProfileDigest } from './digests/lifecycle.ts';

export const DISTRIBUTION_SNAPSHOT_REVISION_VERSION = 2;
export const DISTRIBUTION_SNAPSHOT_REVISION_DOMAIN =
  'news-scraper:distribution-profile-snapshot';

/**
 * The revision representation is deliberately assembled field by field.  It
 * is not a fingerprint of the persistence objects: IDs, timestamps, and
 * operational state which cannot change the governed output are excluded.
 */
export function distributionSnapshotRevision(
  snapshot: DistributionProfileSnapshot & {
    readonly digest?: ActiveProfileDigest | null;
  },
): string {
  const profile = snapshot.internal.profile;
  const representation = {
    version: DISTRIBUTION_SNAPSHOT_REVISION_VERSION,
    domain: DISTRIBUTION_SNAPSHOT_REVISION_DOMAIN,
    profile: {
      configKey: profile.configKey,
      displayName: profile.displayName,
      lifecycle: profile.lifecycle,
      resultLimit: profile.resultLimit,
      sources: profile.sources
        .slice()
        .sort((left, right) =>
          left.sourceConfigKey.localeCompare(right.sourceConfigKey),
        )
        .map((source) => ({
          configKey: source.sourceConfigKey,
          displayName: source.sourceDisplayName,
          approvalState: source.sourceApprovalState,
          lifecycleState: source.sourceLifecycleState,
          includeAnyPhrases: [...source.includeAnyPhrases],
          excludeAnyPhrases: [...source.excludeAnyPhrases],
          categoryConfigKeys: [...source.categoryConfigKeys],
        })),
    },
    publication: {
      name: snapshot.publication.name,
    },
    digest: revisionDigest(snapshot.digest ?? null),
    articles: snapshot.articles.map((article) => ({
      articleId: article.articleId,
      headline: article.headline,
      originalUrl: article.originalUrl,
      effectiveFeedDate: article.effectiveFeedDate.toISOString(),
      feedDateSource: article.feedDateSource,
      publishedAt: article.publishedAt?.toISOString() ?? null,
      author: article.author,
      summary: article.summary,
      imageUrl: article.imageUrl,
      source: {
        configKey: article.source.configKey,
        displayName: article.source.displayName,
      },
      categories: article.categories.map((category) => ({
        configKey: category.configKey,
        displayName: category.displayName,
      })),
      orderPosition: {
        effectiveFeedDate: article.orderPosition.effectiveFeedDate,
        firstSeenAt: article.orderPosition.firstSeenAt,
        articleId: article.orderPosition.articleId,
      },
    })),
  };

  return createHash('sha256')
    .update(JSON.stringify(representation), 'utf8')
    .digest('hex');
}

function revisionDigest(digest: ActiveProfileDigest | null) {
  if (digest === null) return null;
  return {
    generatedAt: digest.generatedAt.toISOString(),
    freshness: digest.freshness,
    inputArticleCount: digest.inputArticleCount,
    provider: digest.provider,
    model: digest.model,
    overview: digest.overview,
    highlights: digest.highlights.map((highlight) => ({
      title: highlight.title,
      explanation: highlight.explanation,
      supportingArticles: highlight.supportingArticles.map((article) => ({
        articleId: article.articleId,
        headline: article.headline,
        source: { displayName: article.sourceDisplayName },
        effectiveFeedDate: article.effectiveFeedDate.toISOString(),
        originalUrl: article.originalUrl,
      })),
    })),
  };
}
