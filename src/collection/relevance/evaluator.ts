import type { ArticleCandidate } from '../normalization/article-candidate.ts';

export type RelevanceDecision = Readonly<{
  included: true;
  reason: 'default_include';
  candidate: ArticleCandidate;
}>;

export function evaluateRelevance(
  candidate: ArticleCandidate,
): RelevanceDecision {
  return Object.freeze({
    included: true,
    reason: 'default_include',
    candidate,
  });
}
