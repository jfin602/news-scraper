import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  HTML_LISTING_PREVIEW_HTML_MAX_BYTES,
  HtmlListingPreviewError,
  previewHtmlListingSample,
} from '../../src/admin/html-listing-preview.ts';

const profile = Object.freeze({
  itemSelector: '.item',
  title: { selector: 'h2' },
  articleLink: { selector: 'a' },
  summary: { selector: '.summary' },
});

describe('HTML listing administration preview', () => {
  it('is a bounded pure projection of the canonical parser preview', () => {
    const preview = previewHtmlListingSample({
      html: '<article class="item"><h2>Example</h2><a href="/story">Read</a><p class="summary">Summary</p></article>',
      profile,
    });

    assert.deepEqual(preview, {
      rows: [
        {
          title: 'Example',
          url: '/story',
          summary: 'Summary',
        },
      ],
      diagnostics: null,
    });
  });

  it('fails closed for malformed, failing, and oversize draft input without echoing sample content', () => {
    const sentinel = 'preview-secret-sentinel';
    for (const input of [
      { html: `<p>${sentinel}</p>`, profile },
      {
        html: '<article class="item"><a href="/story">Read</a></article>',
        profile,
      },
      { html: 'x'.repeat(HTML_LISTING_PREVIEW_HTML_MAX_BYTES + 1), profile },
      { html: '<p>example</p>', profile, unknown: true },
      { html: '<p>example</p>', profile: { itemSelector: '.item' } },
    ]) {
      assert.throws(
        () => previewHtmlListingSample(input),
        (error: unknown) => {
          assert.ok(error instanceof HtmlListingPreviewError);
          assert.doesNotMatch(error.message, new RegExp(sentinel, 'u'));
          return true;
        },
      );
    }
  });
});
