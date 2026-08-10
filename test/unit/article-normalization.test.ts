import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RawItem } from '../../src/collection/raw-item.ts';
import {
  ARTICLE_CANDIDATE_LIMITS,
  type ArticleNormalizationContext,
} from '../../src/collection/normalization/article-candidate.ts';
import { normalizeArticleCandidate } from '../../src/collection/normalization/normalizer.ts';

const context: ArticleNormalizationContext = Object.freeze({
  publicationId: 'publication-1',
  sourceId: 'source-1',
  sourceEndpointId: 'endpoint-1',
  collectionRunId: 'run-1',
  terminalFeedUrl: 'https://publisher.example/feeds/news/index.xml',
});

describe('normalizeArticleCandidate', () => {
  it('produces deterministic deeply frozen output without mutating input', () => {
    const raw: RawItem = {
      externalId: ' Case-Sensitive ID ',
      title: '  A <em>Readable</em> Headline!  ',
      url: '../articles/one?utm_source=feed&story=1#section',
      content: '<p>A summary</p>',
      categories: [' News ', '<b>Analysis</b>'],
    };
    const snapshot = structuredClone(raw);
    const first = normalizeArticleCandidate(raw, context);
    const second = normalizeArticleCandidate(raw, context);

    assert.deepEqual(first, second);
    assert.deepEqual(raw, snapshot);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(Object.isFrozen(first.candidate), true);
    assert.equal(Object.isFrozen(first.candidate.provenance), true);
    assert.equal(Object.isFrozen(first.candidate.sourceCategories), true);
    assert.equal(Object.isFrozen(first.candidate.publishedAt), true);
    assert.equal(first.candidate.externalId, 'Case-Sensitive ID');
    assert.equal(first.candidate.displayTitle, 'A Readable Headline!');
    assert.equal(first.candidate.normalizedTitle, 'a readable headline!');
  });

  it('rejects missing, blank, and oversized required titles at exact boundaries', () => {
    assert.equal(normalizeArticleCandidate({ url: '/a' }, context).ok, false);
    for (const title of [' ', '<script>x</script>']) {
      assert.equal(
        normalizeArticleCandidate({ title, url: '/a' }, context).ok,
        false,
      );
    }
    for (const length of [
      ARTICLE_CANDIDATE_LIMITS.title - 1,
      ARTICLE_CANDIDATE_LIMITS.title,
    ]) {
      assert.equal(
        normalizeArticleCandidate(
          { title: 'x'.repeat(length), url: '/a' },
          context,
        ).ok,
        true,
      );
    }
    const above = normalizeArticleCandidate(
      { title: 'x'.repeat(ARTICLE_CANDIDATE_LIMITS.title + 1), url: '/a' },
      context,
    );
    assert.deepEqual(above, {
      ok: false,
      reason: 'unusable_title',
      detail: 'Article title is missing or out of bounds.',
    });
  });

  it('turns markup, CDATA-like text, entities, and whitespace into safe readable text', () => {
    const result = candidate({
      title:
        '<![CDATA[ Hello&nbsp; <strong>world</strong> &#33; &#x1F642; ]]><script>alert(1)</script><style>.x{}',
      url: '/a',
      content: '<p>First &amp; second</p>\n<div>third</div>',
    });
    assert.equal(result.displayTitle, 'Hello world ! 🙂');
    assert.equal(result.summary, 'First & second third');
    assert.equal(result.displayTitle.includes('alert'), false);
  });

  it('uses conservative NFKC, case, and whitespace title normalization', () => {
    const result = candidate({ title: "  Ａ — Don't Stop!  ", url: '/a' });
    assert.equal(result.displayTitle, "Ａ — Don't Stop!");
    assert.equal(result.normalizedTitle, "a — don't stop!");
  });

  it('resolves links against the supplied terminal feed URL', () => {
    assert.equal(
      candidate({ title: 'A', url: 'story' }).originalUrl,
      'https://publisher.example/feeds/news/story',
    );
    const redirected = candidate(
      { title: 'A', url: '../story' },
      { ...context, terminalFeedUrl: 'https://cdn.example/new/path/feed.xml' },
    );
    assert.equal(redirected.originalUrl, 'https://cdn.example/new/story');
    assert.equal(
      candidate({ title: 'A', url: 'https://other.example/x' }).originalUrl,
      'https://other.example/x',
    );
  });

  it('rejects missing, malformed, non-http, credential-bearing, and oversized Article URLs', () => {
    assert.equal(normalizeArticleCandidate({ title: 'A' }, context).ok, false);
    for (const url of [
      ' ',
      'https://',
      'mailto:a@example.com',
      'https://user:secret@example.com/a',
      `https://example.com/${'x'.repeat(ARTICLE_CANDIDATE_LIMITS.url)}`,
    ]) {
      const result = normalizeArticleCandidate({ title: 'A', url }, context);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, 'unusable_article_url');
    }
  });

  it('preserves the original destination and removes only exact governed identity noise', () => {
    const trackers = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'utm_id',
      'gclid',
      'dclid',
      'fbclid',
      'msclkid',
      'mc_cid',
      'mc_eid',
    ];
    const query = [
      ...trackers.map((key) => `${key}=x`),
      'utm_sourceish=keep',
      'ref=feed',
      'tag=a',
      'tag=b',
    ].join('&');
    const result = candidate({ title: 'A', url: `/story/?${query}#part` });
    assert.equal(result.originalUrl.endsWith(`#part`), true);
    assert.equal(
      result.canonicalIdentityUrl,
      'https://publisher.example/story/?utm_sourceish=keep&ref=feed&tag=a&tag=b',
    );
  });

  it('does not rewrite path or trailing-slash semantics', () => {
    assert.equal(
      candidate({ title: 'A', url: '/a/' }).canonicalIdentityUrl,
      'https://publisher.example/a/',
    );
    assert.equal(
      candidate({ title: 'A', url: '/a' }).canonicalIdentityUrl,
      'https://publisher.example/a',
    );
  });

  it('parses recognized ISO/Atom and RSS/RFC timestamps into UTC', () => {
    const result = candidate({
      title: 'A',
      url: '/a',
      publishedAtRaw: '2026-08-05T11:00:00-05:00',
      updatedAtRaw: 'Tue, 05 Aug 2026 12:34:56 GMT',
    });
    assert.deepEqual(result.publishedAt, {
      status: 'parsed',
      value: '2026-08-05T16:00:00.000Z',
      fallback: 'first_seen',
    });
    assert.deepEqual(result.updatedAt, {
      status: 'parsed',
      value: '2026-08-05T12:34:56.000Z',
    });
  });

  it('distinguishes missing, invalid, impossible, and ambiguous dates without generating time', () => {
    assert.deepEqual(candidate({ title: 'A', url: '/a' }).publishedAt, {
      status: 'missing',
      fallback: 'first_seen',
    });
    for (const publishedAtRaw of [
      '08/05/2026',
      '2026-02-30T00:00:00Z',
      'not a date',
    ]) {
      assert.deepEqual(
        candidate({ title: 'A', url: '/a', publishedAtRaw }).publishedAt,
        { status: 'invalid', fallback: 'first_seen' },
      );
    }
    assert.equal(
      JSON.stringify(candidate({ title: 'A', url: '/a' })).includes(
        new Date().getUTCFullYear().toString(),
      ),
      false,
    );
  });

  it('bounds optional summary, image, external id, categories, and language deterministically', () => {
    const result = candidate({
      title: 'A',
      url: '/a',
      externalId: 'X'.repeat(ARTICLE_CANDIDATE_LIMITS.externalId + 1),
      content: `<p>${'s'.repeat(ARTICLE_CANDIDATE_LIMITS.summary + 1)}</p>`,
      imageUrl: 'https://user:secret@example.com/image.jpg',
      categories: [
        'valid',
        'x'.repeat(ARTICLE_CANDIDATE_LIMITS.sourceCategory + 1),
        ...Array.from(
          { length: ARTICLE_CANDIDATE_LIMITS.sourceCategories + 5 },
          (_, index) => `c${index}`,
        ),
      ],
      language: 'x'.repeat(ARTICLE_CANDIDATE_LIMITS.language + 1),
    });
    assert.equal(result.externalId, undefined);
    assert.equal(result.summary?.length, ARTICLE_CANDIDATE_LIMITS.summary);
    assert.equal(result.imageUrl, undefined);
    assert.equal(result.language, undefined);
    assert.equal(result.sourceCategories, undefined);
  });

  it('preserves category and summary behavior below and at their bounds', () => {
    for (const length of [
      ARTICLE_CANDIDATE_LIMITS.summary - 1,
      ARTICLE_CANDIDATE_LIMITS.summary,
      ARTICLE_CANDIDATE_LIMITS.summary + 1,
    ]) {
      assert.equal(
        candidate({ title: 'A', url: '/a', content: 's'.repeat(length) })
          .summary?.length,
        Math.min(length, ARTICLE_CANDIDATE_LIMITS.summary),
      );
    }
    const categories = Array.from(
      { length: ARTICLE_CANDIDATE_LIMITS.sourceCategories },
      (_, index) =>
        index === 0
          ? 'x'.repeat(ARTICLE_CANDIDATE_LIMITS.sourceCategory)
          : `c${index}`,
    );
    assert.deepEqual(
      candidate({ title: 'A', url: '/a', categories }).sourceCategories,
      categories,
    );
    assert.deepEqual(
      candidate({ title: 'A', url: '/a', categories: categories.slice(1) })
        .sourceCategories,
      categories.slice(1),
    );
  });

  it('resolves a valid optional relative image and attaches explicit provenance', () => {
    const result = candidate({
      title: 'A',
      url: '/a',
      imageUrl: '../image.jpg',
    });
    assert.equal(result.imageUrl, 'https://publisher.example/feeds/image.jpg');
    assert.deepEqual(result.provenance, {
      publicationId: 'publication-1',
      sourceId: 'source-1',
      sourceEndpointId: 'endpoint-1',
      collectionRunId: 'run-1',
    });
  });

  it('returns a bounded stable failure for malformed context', () => {
    const result = normalizeArticleCandidate(
      { title: 'A', url: '/a' },
      { ...context, publicationId: ' ', terminalFeedUrl: 'file:///feed.xml' },
    );
    assert.deepEqual(result, {
      ok: false,
      reason: 'invalid_context',
      detail: 'Normalization context is invalid.',
    });
    if (!result.ok)
      assert.ok(result.detail.length <= ARTICLE_CANDIDATE_LIMITS.failureDetail);
  });
});

function candidate(
  raw: RawItem,
  override: ArticleNormalizationContext = context,
) {
  const result = normalizeArticleCandidate(raw, override);
  assert.equal(result.ok, true);
  if (result.ok) return result.candidate;
  throw new Error('Expected normalization success.');
}
