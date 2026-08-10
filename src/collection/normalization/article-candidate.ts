export const ARTICLE_CANDIDATE_LIMITS = Object.freeze({
  externalId: 2_048,
  title: 2_048,
  url: 8_192,
  author: 1_024,
  summary: 32_768,
  imageUrl: 8_192,
  language: 128,
  sourceCategories: 64,
  sourceCategory: 512,
  contextId: 512,
  failureDetail: 160,
});

export interface ArticleCandidateProvenance {
  readonly publicationId: string;
  readonly sourceId: string;
  readonly sourceEndpointId: string;
  readonly collectionRunId: string;
}

export type SourceDateMetadata =
  | Readonly<{ status: 'parsed'; value: string }>
  | Readonly<{ status: 'missing' }>
  | Readonly<{ status: 'invalid' }>;

export type PublicationDateMetadata = SourceDateMetadata &
  Readonly<{ fallback: 'first_seen' }>;

export interface ArticleCandidate {
  readonly externalId?: string;
  readonly displayTitle: string;
  readonly normalizedTitle: string;
  readonly originalUrl: string;
  readonly canonicalIdentityUrl: string;
  readonly author?: string;
  readonly summary?: string;
  readonly imageUrl?: string;
  readonly sourceCategories?: readonly string[];
  readonly language?: string;
  readonly publishedAt: PublicationDateMetadata;
  readonly updatedAt: SourceDateMetadata;
  readonly provenance: ArticleCandidateProvenance;
}

export interface ArticleNormalizationContext extends ArticleCandidateProvenance {
  readonly terminalFeedUrl: string;
}

export type ArticleNormalizationFailureReason =
  'invalid_context' | 'unusable_title' | 'unusable_article_url';

export type ArticleNormalizationResult =
  | Readonly<{ ok: true; candidate: ArticleCandidate }>
  | Readonly<{
      ok: false;
      reason: ArticleNormalizationFailureReason;
      detail: string;
    }>;
