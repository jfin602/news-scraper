import {
  isArticleIdentityConstraintConflict,
  persistIncludedArticleInTransaction,
  type ArticlePersistenceFailure,
  type ArticlePersistenceSuccess,
} from '../articles/repository.ts';
import type { ArticleCandidate } from './normalization/article-candidate.ts';
import type { RelevanceDecision } from './relevance/evaluator.ts';
import type { Database, QueryExecutor } from '../database/database.ts';
import {
  detectDuplicateReviewsInTransaction,
  type DuplicateReviewDetectionResult,
} from '../deduplication/repository.ts';
import {
  groupStrongDuplicateCandidateInTransaction,
  type DuplicateGroupingResult,
} from '../deduplication/grouping.ts';
import type { CanonicalArticlePair } from '../deduplication/evidence.ts';
import { ArticlePersistenceError } from '../articles/repository.ts';

export interface IncludedArticleProcessingEffects {
  readonly duplicateReviewCreatedCount: number;
  readonly duplicateGroupedCount: number;
}

export type IncludedArticleProcessingSuccess = ArticlePersistenceSuccess &
  IncludedArticleProcessingEffects;

export type IncludedArticleProcessingResult =
  IncludedArticleProcessingSuccess | ArticlePersistenceFailure;

export interface IncludedArticleDuplicateDependencies {
  readonly detectDuplicateReviews: (
    executor: QueryExecutor,
    articleId: string,
  ) => Promise<DuplicateReviewDetectionResult>;
  readonly groupStrongDuplicateCandidate: (
    executor: QueryExecutor,
    pair: CanonicalArticlePair,
  ) => Promise<DuplicateGroupingResult>;
}

const DEFAULT_DUPLICATE_DEPENDENCIES: IncludedArticleDuplicateDependencies =
  Object.freeze({
    detectDuplicateReviews: detectDuplicateReviewsInTransaction,
    groupStrongDuplicateCandidate: groupStrongDuplicateCandidateInTransaction,
  });

/**
 * Composes included Article persistence and duplicate processing in one
 * caller-owned candidate transaction. Duplicate failures therefore roll
 * back the Article, observation, category, review, and group changes for the
 * current candidate together.
 */
export async function processIncludedArticle(
  database: Pick<Database, 'transaction'>,
  candidate: ArticleCandidate,
  observationTime: Date,
  decision: Extract<RelevanceDecision, { readonly included: true }>,
  duplicateDependencies: IncludedArticleDuplicateDependencies = DEFAULT_DUPLICATE_DEPENDENCIES,
): Promise<IncludedArticleProcessingResult> {
  try {
    return await database.transaction(async (transaction) => {
      const persistence = await persistIncludedArticleInTransaction(
        transaction,
        candidate,
        observationTime,
        decision,
      );
      if (persistence.outcome === 'failed') return persistence;

      const detection = await duplicateDependencies.detectDuplicateReviews(
        transaction,
        persistence.article.id,
      );
      let duplicateGroupedCount = 0;
      const strongCandidates = [...detection.strongPendingCandidates].sort(
        compareCanonicalArticlePairs,
      );
      for (const pair of strongCandidates) {
        const grouping =
          await duplicateDependencies.groupStrongDuplicateCandidate(
            transaction,
            pair,
          );
        duplicateGroupedCount += grouping.duplicateGroupedCount;
      }

      return Object.freeze({
        ...persistence,
        duplicateReviewCreatedCount: detection.newlyCreatedCount,
        duplicateGroupedCount,
      });
    });
  } catch (error) {
    if (isArticleIdentityConstraintConflict(error)) {
      return { outcome: 'failed', reason: 'identity_conflict' };
    }
    if (error instanceof ArticlePersistenceError) throw error;
    throw new ArticlePersistenceError('transaction_failed', { cause: error });
  }
}

function compareCanonicalArticlePairs(
  first: CanonicalArticlePair,
  second: CanonicalArticlePair,
): number {
  const low = first.articleLowId.localeCompare(second.articleLowId);
  return low === 0
    ? first.articleHighId.localeCompare(second.articleHighId)
    : low;
}
