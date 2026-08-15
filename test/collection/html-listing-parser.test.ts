import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  HtmlListingParser,
  HTML_LISTING_PARSER_LIMITS,
  HTML_LISTING_PARSER_VERSION,
} from '../../src/collection/parsers/html-listing-parser.ts';
import {
  HtmlListingProfileValidationError,
  HTML_LISTING_PROFILE_LIMITS,
  normalizeHtmlListingProfile,
} from '../../src/collection/parsers/html-listing-profile.ts';
import { previewHtmlListing } from '../../src/collection/parsers/html-listing-preview.ts';

const profileInput = {
  itemSelector: ' .listing > article.card[data-kind="news"] ',
  title: { selector: '.headline' },
  articleLink: { selector: '.headline a' },
  publishedAt: { selector: 'time', mode: 'attribute', attribute: 'datetime' },
  updatedAt: { selector: '.updated', mode: 'text' },
  author: { selector: '.author' },
  summary: { selector: '.summary' },
  categories: { selector: '.category' },
};

describe('HTML listing profile and parser', () => {
  it('normalizes the canonical JSON-serializable profile representation', () => {
    const profile = normalizeHtmlListingProfile(profileInput);
    assert.deepEqual(profile, {
      itemSelector: '.listing > article.card[data-kind="news"]',
      title: { selector: '.headline' },
      articleLink: { selector: '.headline a' },
      publishedAt: {
        selector: 'time',
        mode: 'attribute',
        attribute: 'datetime',
      },
      updatedAt: { selector: '.updated', mode: 'text' },
      author: { selector: '.author' },
      summary: { selector: '.summary' },
      categories: { selector: '.category' },
    });
    assert.equal(Object.isFrozen(profile), true);
    assert.equal(Object.isFrozen(profile.title), true);
    assert.equal(
      JSON.stringify(profile),
      JSON.stringify(normalizeHtmlListingProfile(profileInput)),
    );
  });

  it('rejects invalid shape, descriptors, selectors, and complexity deterministically', () => {
    const invalids: unknown[] = [
      { ...profileInput, unexpected: true },
      { ...profileInput, title: undefined },
      { ...profileInput, title: { selector: '.headline', mode: 'text' } },
      {
        ...profileInput,
        publishedAt: {
          selector: 'time',
          mode: 'attribute',
          attribute: 'onclick',
        },
      },
      { ...profileInput, itemSelector: 'article:has(a)' },
      { ...profileInput, itemSelector: 'article::before' },
      { ...profileInput, itemSelector: 'article + article' },
      {
        ...profileInput,
        itemSelector: 'a'.repeat(
          HTML_LISTING_PROFILE_LIMITS.selectorLength + 1,
        ),
      },
      {
        ...profileInput,
        itemSelector: '.x'.repeat(
          HTML_LISTING_PROFILE_LIMITS.selectorTokens + 1,
        ),
      },
    ];
    for (const input of invalids) {
      assert.throws(
        () => normalizeHtmlListingProfile(input),
        HtmlListingProfileValidationError,
      );
    }
    assert.throws(
      () =>
        normalizeHtmlListingProfile({
          ...profileInput,
          summary: {
            selector: 'x'.repeat(HTML_LISTING_PROFILE_LIMITS.serializedBytes),
          },
        }),
      HtmlListingProfileValidationError,
    );
  });

  it('extracts ordered RawItems, preserves relative URLs, and never synthesizes external IDs', async () => {
    const parser = new HtmlListingParser(
      normalizeHtmlListingProfile(profileInput),
    );
    const result = parser.parse({
      content: await fixture('html/representative-listing.html'),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.adapter, {
      kind: 'html_listing',
      version: HTML_LISTING_PARSER_VERSION,
    });
    assert.equal(result.dialect, undefined);
    assert.deepEqual(result.items, [
      {
        title: 'First static headline',
        url: '/articles/first',
        publishedAtRaw: '2026-08-15T12:00:00Z',
        updatedAtRaw: 'Updated August 16',
        author: 'Alex Example',
        content: 'A bounded summary.',
        categories: ['Industry', 'Updates'],
      },
      {
        title: 'Second headline',
        url: 'https://publisher.example/second',
        content: 'Second summary',
      },
    ]);
    assert.equal(
      result.items.some((item) => 'externalId' in item),
      false,
    );
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.items), true);
    assert.equal(Object.isFrozen(result.items[0]), true);
  });

  it('treats scripts and event markup as inert parser input', () => {
    const parser = new HtmlListingParser(
      normalizeHtmlListingProfile({
        itemSelector: '.item',
        title: { selector: '.title' },
        articleLink: { selector: 'a' },
      }),
    );
    const result = parser.parse({
      content:
        '<article class="item"><script>globalThis.HTML_PARSER_RAN = true</script><h2 class="title">Safe title</h2><a href="/safe" onclick="throw new Error(1)">link</a></article>',
    });
    assert.equal(
      (globalThis as { HTML_PARSER_RAN?: boolean }).HTML_PARSER_RAN,
      undefined,
    );
    assert.equal(result.ok, true);
    if (result.ok)
      assert.deepEqual(result.items, [{ title: 'Safe title', url: '/safe' }]);
  });

  it('returns stable failures for zero matches and all-invalid rows', () => {
    const parser = new HtmlListingParser(
      normalizeHtmlListingProfile({
        itemSelector: '.item',
        title: { selector: '.title' },
        articleLink: { selector: 'a' },
      }),
    );
    const zero = parser.parse({ content: '<p>nothing here</p>' });
    assert.equal(zero.ok, false);
    if (!zero.ok) assert.equal(zero.reason, 'no_matching_items');

    const allInvalid = parser.parse({
      content: '<article class="item"><h2 class="title">No link</h2></article>',
    });
    assert.equal(allInvalid.ok, false);
    if (!allInvalid.ok) {
      assert.equal(allInvalid.reason, 'no_valid_items');
      assert.deepEqual(allInvalid.diagnostics, {
        rejectedItemCount: 1,
        malformedOptionalFieldCount: 0,
        samples: [
          {
            code: 'required_field_missing',
            detail: 'A matched item is missing a required extracted value.',
          },
        ],
      });
    }
  });

  it('continues after bad rows with bounded safe diagnostics', () => {
    const parser = basicParser();
    const result = parser.parse({
      content: [
        '<article class="item"><h2 class="title">Good</h2><a href="/good">Good</a></article>',
        '<article class="item"><h2 class="title">No link</h2></article>',
        '<article class="item"><a href="/no-title">No title</a></article>',
      ].join(''),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.items, [{ title: 'Good', url: '/good' }]);
    assert.deepEqual(result.diagnostics, {
      rejectedItemCount: 2,
      malformedOptionalFieldCount: 0,
      samples: [
        {
          code: 'required_field_missing',
          detail: 'A matched item is missing a required extracted value.',
        },
        {
          code: 'required_field_missing',
          detail: 'A matched item is missing a required extracted value.',
        },
      ],
    });
  });

  it('enforces document, item, field, category, and diagnostic bounds without leaking input', () => {
    const parser = basicParser();
    assert.equal(
      failureReason(
        parser.parse({
          content: 'x'.repeat(HTML_LISTING_PARSER_LIMITS.inputBytes + 1),
        }),
      ),
      'input_limit',
    );
    assert.equal(
      failureReason(
        parser.parse({
          content:
            '<article class="item"><h2 class="title">x</h2><a href="/x">x</a></article>'.repeat(
              HTML_LISTING_PARSER_LIMITS.matchedItems + 1,
            ),
        }),
      ),
      'structure_limit',
    );
    assert.equal(
      failureReason(
        parser.parse({
          content: `<article class="item"><h2 class="title">${'x'.repeat(HTML_LISTING_PARSER_LIMITS.title + 1)}</h2><a href="/x">x</a></article>`,
        }),
      ),
      'no_valid_items',
    );
    assert.equal(
      failureReason(
        parser.parse({ content: Uint8Array.from([0xff, 0xfe, 0xfd]) }),
      ),
      'malformed_html',
    );

    const withCategories = new HtmlListingParser(
      normalizeHtmlListingProfile({
        itemSelector: '.item',
        title: { selector: '.title' },
        articleLink: { selector: 'a' },
        categories: { selector: '.category' },
      }),
    );
    const categoryResult = withCategories.parse({
      content: `<article class="item"><h2 class="title">Good</h2><a href="/good">Good</a>${'<span class="category">x</span>'.repeat(HTML_LISTING_PARSER_LIMITS.categories + 1)}</article>`,
    });
    assert.equal(categoryResult.ok, true);
    if (categoryResult.ok) {
      assert.deepEqual(categoryResult.items, [{ title: 'Good', url: '/good' }]);
      assert.equal(categoryResult.diagnostics?.malformedOptionalFieldCount, 1);
    }

    const secret = 'SECRET_RESPONSE_BODY_SHOULD_NOT_LEAK';
    const hostile = parser.parse({
      content: `<article class="item">${secret}</article>`,
    });
    assert.equal(hostile.ok, false);
    if (!hostile.ok) {
      assert.equal(hostile.detail.includes(secret), false);
      assert.equal(
        hostile.diagnostics?.samples.every(
          (sample) => !sample.detail.includes(secret),
        ),
        true,
      );
      assert.ok(
        hostile.detail.length <= HTML_LISTING_PARSER_LIMITS.diagnosticDetail,
      );
    }
    const manyRejected = parser.parse({
      content:
        '<article class="item"><h2 class="title">No link</h2></article>'.repeat(
          HTML_LISTING_PARSER_LIMITS.diagnosticSamples + 1,
        ),
    });
    assert.equal(manyRejected.ok, false);
    if (!manyRejected.ok)
      assert.equal(
        manyRejected.diagnostics?.samples.length,
        HTML_LISTING_PARSER_LIMITS.diagnosticSamples,
      );
  });

  it('is deterministic and provides a bounded no-I/O preview producer', () => {
    const html =
      '<article class="item"><h2 class="title">Preview</h2><a href="/preview">Preview</a></article>';
    const profile = {
      itemSelector: '.item',
      title: { selector: '.title' },
      articleLink: { selector: 'a' },
    };
    const parser = new HtmlListingParser(normalizeHtmlListingProfile(profile));
    assert.deepEqual(
      parser.parse({ content: html }),
      parser.parse({ content: html }),
    );

    const originalFetch = globalThis.fetch;
    Object.assign(globalThis, {
      fetch: () => {
        throw new Error('preview must not make a network request');
      },
    });
    try {
      const preview = previewHtmlListing({ html, profile });
      assert.deepEqual(preview, {
        ok: true,
        items: [{ title: 'Preview', url: '/preview' }],
      });
      const badPreview = previewHtmlListing({
        html: 'SECRET_HTML_SAMPLE_SHOULD_NOT_ECHO',
        profile: { ...profile, itemSelector: ':has(article)' },
      });
      assert.equal(
        JSON.stringify(badPreview).includes(
          'SECRET_HTML_SAMPLE_SHOULD_NOT_ECHO',
        ),
        false,
      );
      const overLimitPreview = previewHtmlListing({
        html: 'x'.repeat(HTML_LISTING_PARSER_LIMITS.inputBytes + 1),
        profile,
      });
      assert.equal(overLimitPreview.ok, false);
      if (!overLimitPreview.ok)
        assert.equal(overLimitPreview.reason, 'input_limit');
    } finally {
      Object.assign(globalThis, { fetch: originalFetch });
    }
  });
});

function basicParser(): HtmlListingParser {
  return new HtmlListingParser(
    normalizeHtmlListingProfile({
      itemSelector: '.item',
      title: { selector: '.title' },
      articleLink: { selector: 'a' },
    }),
  );
}

function failureReason(result: ReturnType<HtmlListingParser['parse']>): string {
  assert.equal(result.ok, false);
  return result.reason;
}

async function fixture(path: string): Promise<string> {
  return readFile(
    new URL(`../fixtures/collection/${path}`, import.meta.url),
    'utf8',
  );
}
