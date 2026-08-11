import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyArticleLinkPolicy,
  type ArticleLinkPolicyContext,
  type ArticleLinkPolicyRejectionReason,
} from '../../src/collection/article-links/policy.ts';
import type { ArticleCandidate } from '../../src/collection/normalization/article-candidate.ts';
import { normalizeArticleCandidate } from '../../src/collection/normalization/normalizer.ts';
import { ConfigurationValidationError } from '../../src/publication/configuration.ts';

const sourceExact: ArticleLinkPolicyContext = Object.freeze({
  sourceDomainRules: Object.freeze([
    Object.freeze({ hostname: 'publisher.example', includeSubdomains: false }),
  ]),
});

describe('applyArticleLinkPolicy', () => {
  it('accepts exact approved HTTP and HTTPS hosts without changing URL semantics', () => {
    for (const originalUrl of [
      'https://publisher.example/story?ref=feed#section',
      'http://publisher.example:8080/story',
    ]) {
      const candidate = candidateWithUrls(originalUrl);
      const decision = applyArticleLinkPolicy(candidate, sourceExact);

      assert.deepEqual(decision, { accepted: true, candidate });
      assert.equal(
        decision.accepted && decision.candidate.originalUrl,
        originalUrl,
      );
    }
  });

  it('matches case-insensitive, proper subdomain, and IDN hosts through shared normalization', () => {
    const subtree = policy('Example.COM', true);
    assert.equal(
      applyArticleLinkPolicy(
        candidateWithUrls('https://NEWS.EXAMPLE.COM/story'),
        subtree,
      ).accepted,
      true,
    );
    assert.equal(
      applyArticleLinkPolicy(
        candidateWithUrls('https://bücher.example/story'),
        policy('bücher.example', false),
      ).accepted,
      true,
    );
  });

  it('rejects sibling and suffix-confusion hosts', () => {
    const subtree = policy('example.com', true);
    for (const hostname of [
      'example.net',
      'evil-example.com',
      'example.com.evil.test',
    ]) {
      assertRejection(
        applyArticleLinkPolicy(
          candidateWithUrls(`https://${hostname}/story`),
          subtree,
        ),
        'article_domain_not_approved',
      );
    }
  });

  it('uses endpoint narrowing while empty or absent endpoint policy inherits Source policy', () => {
    const sourceDomainRules = Object.freeze([
      Object.freeze({ hostname: 'example.com', includeSubdomains: true }),
    ]);
    const news = candidateWithUrls('https://news.example.com/story');
    const blog = candidateWithUrls('https://blog.example.com/story');

    assert.equal(
      applyArticleLinkPolicy(news, { sourceDomainRules }).accepted,
      true,
    );
    assert.equal(
      applyArticleLinkPolicy(news, {
        sourceDomainRules,
        endpointDomainRules: [],
      }).accepted,
      true,
    );
    const narrowed = {
      sourceDomainRules,
      endpointDomainRules: [
        { hostname: 'news.example.com', includeSubdomains: false },
      ],
    };
    assert.equal(applyArticleLinkPolicy(news, narrowed).accepted, true);
    assertRejection(
      applyArticleLinkPolicy(blog, narrowed),
      'article_domain_not_approved',
    );
  });

  it('fails explicitly when corrupt endpoint policy would widen Source policy', () => {
    assert.throws(
      () =>
        applyArticleLinkPolicy(
          candidateWithUrls('https://outside.example/story'),
          {
            sourceDomainRules: [
              { hostname: 'publisher.example', includeSubdomains: false },
            ],
            endpointDomainRules: [
              { hostname: 'outside.example', includeSubdomains: false },
            ],
          },
        ),
      ConfigurationValidationError,
    );
  });

  it('returns stable structural rejection reasons', () => {
    const cases: readonly [string, ArticleLinkPolicyRejectionReason][] = [
      ['not a URL', 'invalid_article_url'],
      ['https://', 'invalid_article_url'],
      ['ftp://publisher.example/story', 'unsupported_article_scheme'],
      ['file:///story', 'unsupported_article_scheme'],
      ['javascript:alert(1)', 'unsupported_article_scheme'],
      ['data:text/plain,story', 'unsupported_article_scheme'],
      [
        'https://user:secret@publisher.example/story',
        'article_url_credentials_not_allowed',
      ],
    ];
    for (const [originalUrl, reason] of cases) {
      const first = applyArticleLinkPolicy(
        candidateWithUrls(originalUrl),
        sourceExact,
      );
      const second = applyArticleLinkPolicy(
        candidateWithUrls(originalUrl),
        sourceExact,
      );
      assertRejection(first, reason);
      assert.deepEqual(first, second);
    }
  });

  it('validates originalUrl rather than canonicalIdentityUrl', () => {
    assertRejection(
      applyArticleLinkPolicy(
        candidateWithUrls(
          'https://outside.example/original?utm_source=feed#part',
          'https://publisher.example/canonical',
        ),
        sourceExact,
      ),
      'article_domain_not_approved',
    );
  });

  it('returns immutable decisions and preserves the immutable normalized candidate', () => {
    const candidate = normalizedCandidate();
    const accepted = applyArticleLinkPolicy(candidate, sourceExact);
    const rejected = applyArticleLinkPolicy(
      candidateWithUrls('https://outside.example/story'),
      sourceExact,
    );

    assert.equal(Object.isFrozen(accepted), true);
    assert.equal(Object.isFrozen(rejected), true);
    assert.equal(Object.isFrozen(candidate), true);
    assert.equal(Object.isFrozen(candidate.provenance), true);
    assert.equal(accepted.accepted && accepted.candidate === candidate, true);
  });
});

function policy(
  hostname: string,
  includeSubdomains: boolean,
): ArticleLinkPolicyContext {
  return { sourceDomainRules: [{ hostname, includeSubdomains }] };
}

function normalizedCandidate(): ArticleCandidate {
  const result = normalizeArticleCandidate(
    { title: 'A generic headline', url: 'https://publisher.example/story' },
    {
      sourceId: 'source-1',
      sourceEndpointId: 'endpoint-1',
      collectionRunId: 'run-1',
      terminalFeedUrl: 'https://publisher.example/feed.xml',
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('Expected normalization success.');
  return result.candidate;
}

function candidateWithUrls(
  originalUrl: string,
  canonicalIdentityUrl = originalUrl,
): ArticleCandidate {
  return Object.freeze({
    ...normalizedCandidate(),
    originalUrl,
    canonicalIdentityUrl,
  });
}

function assertRejection(
  decision: ReturnType<typeof applyArticleLinkPolicy>,
  reason: ArticleLinkPolicyRejectionReason,
): void {
  assert.deepEqual(decision, {
    accepted: false,
    stage: 'article_link_policy',
    reason,
  });
}
