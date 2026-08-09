import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  RSS_ATOM_LIMITS,
  RssAtomParser,
} from '../../src/collection/parsers/rss-atom-parser.ts';

const parser = new RssAtomParser();

describe('RssAtomParser', () => {
  it('detects RSS and preserves minimally interpreted Source-shaped values', async () => {
    const result = parser.parse({
      content: await fixture('rss/representative-rss-2.0.xml'),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.dialect, 'rss');
    assert.deepEqual(result.feed, { language: 'en-US' });
    assert.deepEqual(result.items, [
      {
        externalId: 'source-item-1',
        title: 'First & unnormalized headline',
        url: 'https://news.example/articles/first?utm_source=feed#section',
        publishedAtRaw: 'Tue, 05 Aug 2026 12:34:56 GMT',
        author: 'Alex Example',
        content: '<p>Untrusted <strong>summary</strong>.</p>',
        imageUrl: 'https://cdn.example/first.jpg',
        categories: ['Industry', 'Updates'],
        language: 'en-US',
      },
      {
        externalId: 'source-item-2',
        title: 'Second headline',
        url: '/relative/second',
        content: 'Plain summary',
        categories: ['Single category'],
        language: 'en-US',
      },
    ]);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.items), true);
    assert.equal(Object.isFrozen(result.items[0]), true);
    assert.equal(Object.isFrozen(result.items[0]?.categories), true);
  });

  it('detects Atom and applies only standard link and feed-language fallbacks', async () => {
    const result = parser.parse({
      content: await fixture('atom/representative-atom-1.0.xml'),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.dialect, 'atom');
    assert.deepEqual(result.items, [
      {
        externalId: 'tag:example.test,2026:one',
        title: 'First Atom headline',
        url: 'https://news.example/atom/one?ref=feed#top',
        publishedAtRaw: '2026-08-05T11:00:00-05:00',
        updatedAtRaw: '2026-08-05T12:00:00-05:00',
        author: 'Jordan Example',
        content: '<p>Untrusted Atom summary.</p>',
        categories: ['Analysis', 'Updates'],
        language: 'en-GB',
      },
      {
        externalId: 'tag:example.test,2026:two',
        url: '/atom/two',
        content: 'Content without a fabricated title.',
        categories: ['Single'],
        language: 'fr',
      },
    ]);
  });

  it('accepts valid zero-item feeds and missing optional item fields', () => {
    const rss = parser.parse({
      content: '<rss version="2.0"><channel /></rss>',
    });
    const atom = parser.parse({
      content:
        '<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>x</id></entry></feed>',
    });
    assert.deepEqual(rss, { ok: true, dialect: 'rss', items: [] });
    assert.deepEqual(atom, {
      ok: true,
      dialect: 'atom',
      items: [{ externalId: 'x' }],
    });
  });

  it('returns stable failures for empty, malformed, and unsupported documents', async () => {
    assert.deepEqual(parser.parse({ content: '  \n' }), {
      ok: false,
      reason: 'empty_content',
      detail: 'Feed content is empty.',
    });
    assert.equal(
      failureReason(
        parser.parse({ content: await fixture('malformed/malformed.xml') }),
      ),
      'malformed_xml',
    );
    assert.equal(
      failureReason(
        parser.parse({ content: await fixture('malformed/unsupported.xml') }),
      ),
      'unsupported_feed',
    );
  });

  it('rejects DOCTYPE and entity declarations without echoing hostile content', () => {
    const secret = 'SECRET_RESPONSE_BODY_SHOULD_NOT_LEAK';
    const result = parser.parse({
      content: `<!DOCTYPE rss [<!ENTITY x "${secret}">]><rss><channel><item><title>&x;</title></item></channel></rss>`,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, 'security_rejection');
    assert.equal(result.detail.includes(secret), false);
    assert.ok(result.detail.length <= RSS_ATOM_LIMITS.errorDetail);
  });

  it('enforces input, nesting, item-count, field, and category bounds', () => {
    for (const bytes of [
      RSS_ATOM_LIMITS.inputBytes - 1,
      RSS_ATOM_LIMITS.inputBytes,
    ]) {
      const result = parser.parse({ content: rssDocumentWithBytes(bytes) });
      assert.equal(result.ok, true, `expected ${String(bytes)} bytes to parse`);
    }

    const aboveOldLimit = parser.parse({
      content: rssDocumentWithBytes(1_048_576 + 1),
    });
    assert.equal(aboveOldLimit.ok, true);

    assert.equal(
      failureReason(
        parser.parse({ content: ' '.repeat(RSS_ATOM_LIMITS.inputBytes + 1) }),
      ),
      'input_limit',
    );

    const nested = `${'<n>'.repeat(RSS_ATOM_LIMITS.nestingDepth + 1)}x${'</n>'.repeat(RSS_ATOM_LIMITS.nestingDepth + 1)}`;
    const nestedResult = parser.parse({
      content: `<rss><channel>${nested}</channel></rss>`,
    });
    assert.equal(nestedResult.ok, false);
    if (!nestedResult.ok) assert.equal(nestedResult.reason, 'structure_limit');

    const tooMany = '<item />'.repeat(RSS_ATOM_LIMITS.items + 1);
    assert.equal(
      failureReason(
        parser.parse({ content: `<rss><channel>${tooMany}</channel></rss>` }),
      ),
      'structure_limit',
    );

    const longTitle = 'x'.repeat(RSS_ATOM_LIMITS.title + 1);
    assert.equal(
      failureReason(
        parser.parse({
          content: `<rss><channel><item><title>${longTitle}</title></item></channel></rss>`,
        }),
      ),
      'field_limit',
    );

    const tooManyCategories = '<category>x</category>'.repeat(
      RSS_ATOM_LIMITS.categories + 1,
    );
    assert.equal(
      failureReason(
        parser.parse({
          content: `<rss><channel><item>${tooManyCategories}</item></channel></rss>`,
        }),
      ),
      'field_limit',
    );
  });

  it('produces deeply equal output on repeated parsing and accepts bounded UTF-8 bytes', async () => {
    const xml = await fixture('rss/representative-rss-2.0.xml');
    const first = parser.parse({ content: xml });
    const second = parser.parse({ content: new TextEncoder().encode(xml) });
    assert.deepEqual(second, first);
  });
});

async function fixture(relativePath: string): Promise<string> {
  return readFile(
    new URL(`../fixtures/collection/${relativePath}`, import.meta.url),
    'utf8',
  );
}

function failureReason(
  result: ReturnType<RssAtomParser['parse']>,
): string | undefined {
  return result.ok ? undefined : result.reason;
}

function rssDocumentWithBytes(bytes: number): string {
  const prefix = '<rss version="2.0"><channel><!--';
  const suffix = '--></channel></rss>';
  assert.ok(bytes >= prefix.length + suffix.length);
  return `${prefix}${'x'.repeat(bytes - prefix.length - suffix.length)}${suffix}`;
}
