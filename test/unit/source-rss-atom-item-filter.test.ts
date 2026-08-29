import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isSourceRssAtomItemAdmitted } from '../../src/collection/admission/source-rss-atom-item-filter.ts';
import { normalizeArticleCandidate } from '../../src/collection/normalization/normalizer.ts';
import type { RawItem } from '../../src/collection/raw-item.ts';

function policy(
  include: readonly string[] = [],
  exclude: readonly string[] = [],
) {
  return {
    rssAtomAdmissionIncludePhrases: include,
    rssAtomAdmissionExcludePhrases: exclude,
  };
}

describe('Source RSS/Atom item admission filter', () => {
  it('admits every item when both lists are empty', () => {
    assert.equal(isSourceRssAtomItemAdmitted({}, policy()), true);
    assert.equal(
      isSourceRssAtomItemAdmitted({ title: 'Anything at all' }, policy()),
      true,
    );
  });

  it('uses literal case-insensitive ANY matching over title, content, and categories', () => {
    const fields: readonly [RawItem, string][] = [
      [{ title: 'The INDIE publishing report' }, 'indie publishing'],
      [{ content: '<p>A visible Editorial update.</p>' }, 'EDITORIAL'],
      [{ categories: ['Business', 'Rights News'] }, 'rights'],
    ];
    for (const [rawItem, phrase] of fields) {
      assert.equal(
        isSourceRssAtomItemAdmitted(rawItem, policy([phrase])),
        true,
      );
    }
    assert.equal(
      isSourceRssAtomItemAdmitted(
        { title: 'A matching second phrase' },
        policy(['absent first phrase', 'SECOND PHRASE', 'absent third phrase']),
      ),
      true,
    );
  });

  it('applies Exclude against the same fields and gives it precedence', () => {
    assert.equal(
      isSourceRssAtomItemAdmitted(
        { title: 'Excluded story' },
        policy([], ['excluded']),
      ),
      false,
    );
    assert.equal(
      isSourceRssAtomItemAdmitted(
        { content: '<p>Included but excluded story</p>' },
        policy(['included'], ['excluded']),
      ),
      false,
    );
    assert.equal(
      isSourceRssAtomItemAdmitted(
        { categories: ['Included'] },
        policy(['included'], ['excluded']),
      ),
      true,
    );
    assert.equal(
      isSourceRssAtomItemAdmitted({ title: 'Not included' }, policy(['other'])),
      false,
    );
  });

  it('normalizes Unicode NFKC deterministically', () => {
    assert.equal(
      isSourceRssAtomItemAdmitted(
        { title: 'Ｆｕｌｌ Width News' },
        policy(['full width']),
      ),
      true,
    );
  });

  it('treats missing fields and non-editorial Raw-item values as non-matches', () => {
    const rawItem: RawItem = {
      externalId: 'needle',
      url: 'https://needle.example/article',
      publishedAtRaw: 'needle',
      updatedAtRaw: 'needle',
      author: 'needle',
      imageUrl: 'https://needle.example/image',
      language: 'needle',
      diagnostics: { needle: 'needle' },
    };
    assert.equal(
      isSourceRssAtomItemAdmitted(rawItem, policy(['needle'])),
      false,
    );
    assert.equal(isSourceRssAtomItemAdmitted({}, policy(['needle'])), false);
  });

  it('treats regex and glob-looking phrase characters as ordinary literals', () => {
    assert.equal(
      isSourceRssAtomItemAdmitted(
        { title: 'Literal .* and [draft] markers' },
        policy(['.*']),
      ),
      true,
    );
    assert.equal(
      isSourceRssAtomItemAdmitted({ title: 'AxxB story' }, policy(['A.*B'])),
      false,
    );
    assert.equal(
      isSourceRssAtomItemAdmitted(
        { title: 'published story' },
        policy(['publish*']),
      ),
      false,
    );
  });

  it('matches only visible plain text, not markup, attributes, comments, scripts, styles, or entity spelling', () => {
    const rawItem = {
      content:
        '<section class="attribute-needle"><!-- comment-needle --><script>script-needle</script><style>.style-needle{}</style>Visible &amp; copy</section>',
    };
    for (const artificial of [
      'section',
      'attribute-needle',
      'comment-needle',
      'script-needle',
      'style-needle',
      'amp',
    ]) {
      assert.equal(
        isSourceRssAtomItemAdmitted(rawItem, policy([artificial])),
        false,
        artificial,
      );
    }
    assert.equal(
      isSourceRssAtomItemAdmitted(rawItem, policy(['visible & copy'])),
      true,
    );
  });

  it('reuses the same CDATA, entity, markup, and whitespace preparation as Article normalization', () => {
    const content =
      '<![CDATA[<p> Human&nbsp; editorial &#x74;ext </p>]]><script>ignored</script>';
    assert.equal(
      isSourceRssAtomItemAdmitted(
        { content },
        policy(['human editorial text']),
      ),
      true,
    );
    const normalized = normalizeArticleCandidate(
      { title: 'Article', url: '/article', content },
      {
        sourceId: 'source',
        sourceEndpointId: 'endpoint',
        collectionRunId: 'run',
        terminalFeedUrl: 'https://publisher.example/feed.xml',
      },
    );
    assert.equal(normalized.ok, true);
    if (normalized.ok)
      assert.equal(normalized.candidate.summary, 'Human editorial text');
  });
});
