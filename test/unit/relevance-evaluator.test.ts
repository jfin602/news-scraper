import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  evaluateRelevance,
  type RelevanceDecision,
} from '../../src/collection/relevance/evaluator.ts';
import type { ArticleCandidate } from '../../src/collection/normalization/article-candidate.ts';

describe('evaluateRelevance', () => {
  it('returns the canonical default include decision and retains the candidate', () => {
    const candidate = articleCandidate();

    const decision = evaluateRelevance(candidate);

    assert.deepEqual(decision, {
      included: true,
      reason: 'default_include',
      candidate,
    });
    assert.equal(decision.candidate, candidate);
  });

  it('is deterministic and does not mutate candidate metadata or provenance', () => {
    const candidate = articleCandidate({
      displayTitle: 'A current topic headline',
      normalizedTitle: 'a current topic headline',
      sourceCategories: ['News', 'Analysis'],
    });
    const snapshot = structuredClone(candidate);

    const first = evaluateRelevance(candidate);
    const second = evaluateRelevance(candidate);

    assert.deepEqual(first, second);
    assert.deepEqual(candidate, snapshot);
  });

  it('returns frozen decisions without mutating the supplied candidate', () => {
    const candidate = articleCandidate();
    const decision = evaluateRelevance(candidate);

    assert.equal(Object.isFrozen(decision), true);
    assert.equal(Object.isFrozen(candidate), false);
    assert.equal(Object.isFrozen(candidate.provenance), false);
  });

  it('includes candidates from unrelated Source identities', () => {
    const first = evaluateRelevance(
      articleCandidate({
        provenance: {
          sourceId: 'city-desk',
          sourceEndpointId: 'city-feed',
          collectionRunId: 'city-run',
        },
      }),
    );
    const second = evaluateRelevance(
      articleCandidate({
        provenance: {
          sourceId: 'space-desk',
          sourceEndpointId: 'space-feed',
          collectionRunId: 'space-run',
        },
      }),
    );

    assert.deepEqual(decisionSemantics(first), decisionSemantics(second));
  });

  it('does not use candidate metadata or ambient state to alter default inclusion', () => {
    const ordinary = articleCandidate({
      displayTitle: 'Municipal transit opens a new route',
      normalizedTitle: 'municipal transit opens a new route',
      sourceCategories: ['Transit'],
    });
    const publishing = articleCandidate({
      displayTitle: 'Indie authors discuss publishing news',
      normalizedTitle: 'indie authors discuss publishing news',
      sourceCategories: ['Publishing', 'Indie authors'],
    });
    const originalNow = Date.now;
    const originalRandom = Math.random;
    const originalEnvironment = process.env.NEWS_SCRAPER_RELEVANCE_TEST;

    try {
      Date.now = () => 0;
      Math.random = () => 0;
      process.env.NEWS_SCRAPER_RELEVANCE_TEST = 'first';
      const first = evaluateRelevance(ordinary);

      Date.now = () => Number.MAX_SAFE_INTEGER;
      Math.random = () => 0.9999999999999999;
      process.env.NEWS_SCRAPER_RELEVANCE_TEST = 'second';
      const second = evaluateRelevance(publishing);

      assert.deepEqual(decisionSemantics(first), decisionSemantics(second));
    } finally {
      Date.now = originalNow;
      Math.random = originalRandom;
      if (originalEnvironment === undefined) {
        delete process.env.NEWS_SCRAPER_RELEVANCE_TEST;
      } else {
        process.env.NEWS_SCRAPER_RELEVANCE_TEST = originalEnvironment;
      }
    }
  });
});

function articleCandidate(
  overrides: Partial<ArticleCandidate> = {},
): ArticleCandidate {
  return {
    displayTitle: 'A generic article',
    normalizedTitle: 'a generic article',
    originalUrl: 'https://publisher.example/articles/generic',
    canonicalIdentityUrl: 'https://publisher.example/articles/generic',
    publishedAt: { status: 'missing', fallback: 'first_seen' },
    updatedAt: { status: 'missing' },
    provenance: {
      sourceId: 'source-1',
      sourceEndpointId: 'endpoint-1',
      collectionRunId: 'run-1',
    },
    ...overrides,
  };
}

function decisionSemantics(
  decision: RelevanceDecision,
): Omit<RelevanceDecision, 'candidate'> {
  return { included: decision.included, reason: decision.reason };
}
