import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  evaluateRelevance,
  type EffectiveRelevanceConfiguration,
  type RelevanceRuleForEvaluation,
} from '../../src/collection/relevance/evaluator.ts';
import type { ArticleCandidate } from '../../src/collection/normalization/article-candidate.ts';

describe('evaluateRelevance predicates', () => {
  it('matches title substrings case-insensitively and rejects title non-matches', () => {
    assert.equal(
      decision('Breaking BOOK News', [rule({ pattern: 'book' })]).included,
      true,
    );
    assert.equal(
      decision('Breaking BOOK News', [
        rule({ pattern: 'magazine', action: 'exclude' }),
      ]).included,
      true,
    );
  });

  it('matches summary substrings and treats a missing summary as no match', () => {
    assert.equal(
      decision(
        'Title',
        [rule({ predicateType: 'summary_contains', pattern: 'newsletter' })],
        {
          summary: 'A weekly Newsletter roundup',
        },
      ).decisionReason.kind,
      'rule_include',
    );
    assert.equal(
      decision('Title', [
        rule({
          predicateType: 'summary_contains',
          pattern: 'newsletter',
          action: 'exclude',
        }),
      ]).included,
      true,
    );
  });

  it('matches source categories by case-insensitive equality, never substring', () => {
    const rules = [
      rule({ predicateType: 'source_category_equals', pattern: 'analysis' }),
    ];
    assert.equal(
      decision('Title', rules, { sourceCategories: ['ANALYSIS'] })
        .decisionReason.kind,
      'rule_include',
    );
    assert.equal(
      decision('Title', rules, { sourceCategories: ['analysis-news'] })
        .decisionReason.kind,
      'default_include',
    );
  });

  it('treats missing source categories and regex/glob-looking patterns literally', () => {
    assert.equal(
      decision('Title', [
        rule({ predicateType: 'source_category_equals', pattern: 'news' }),
      ]).decisionReason.kind,
      'default_include',
    );
    assert.equal(
      decision('book.* review', [
        rule({ pattern: 'book.*', action: 'exclude' }),
      ]).included,
      false,
    );
    assert.equal(
      decision('bookish review', [
        rule({ pattern: 'book.*', action: 'exclude' }),
      ]).included,
      true,
    );
  });

  it('does not inspect unrelated candidate fields', () => {
    const rules = [rule({ pattern: 'report', action: 'exclude' })];
    const baseline = decision('ordinary item', rules);
    const changed = decision('ordinary item', rules, {
      author: 'report',
      originalUrl: 'https://report.example/report',
      canonicalIdentityUrl: 'https://report.example/report',
      language: 'report',
    });
    assert.deepEqual(semantics(changed), semantics(baseline));
  });
});

describe('evaluateRelevance include/exclude precedence', () => {
  it('selects higher priority even when the lower rule excludes', () => {
    const result = decision('match', [
      rule({ configKey: 'low-exclude', action: 'exclude', priority: 1 }),
      rule({ configKey: 'high-include', priority: 2 }),
    ]);
    assert.equal(result.included, true);
    assertRuleReason(result, 'rule_include', 'high-include');
  });

  it('selects a Source-scoped rule over an installation-wide rule at equal priority', () => {
    const result = decision('match', [
      rule({ configKey: 'installation-exclude', action: 'exclude' }),
      rule({ configKey: 'source-include', sourceId: 'source-1' }),
    ]);
    assertRuleReason(result, 'rule_include', 'source-include');
  });

  it('selects exclude over include at equal priority and scope', () => {
    const result = decision('match', [
      rule({ configKey: 'include' }),
      rule({ configKey: 'exclude', action: 'exclude' }),
    ]);
    assertRuleReason(result, 'rule_exclude', 'exclude');
  });

  it('selects the lexically lower config key for an otherwise equal tie', () => {
    const result = decision('match', [
      rule({ configKey: 'z-last', reason: 'z reason' }),
      rule({ configKey: 'a-first', reason: 'a reason' }),
    ]);
    assertRuleReason(result, 'rule_include', 'a-first');
  });

  it('ignores disabled rules and rules scoped to another Source', () => {
    const result = decision('match', [
      rule({
        configKey: 'disabled-exclude',
        action: 'exclude',
        enabled: false,
      }),
      rule({
        configKey: 'other-source-exclude',
        action: 'exclude',
        sourceId: 'source-2',
      }),
    ]);
    assert.equal(result.included, true);
    assert.equal(result.decisionReason.kind, 'default_include');
  });

  it('defaults to include when no include/exclude rule matches', () => {
    const result = decision('match', [
      rule({ pattern: 'missing', action: 'exclude' }),
    ]);
    assert.equal(result.included, true);
    assert.deepEqual(result.decisionReason, { kind: 'default_include' });
  });
});

describe('evaluateRelevance categorization', () => {
  it('assigns the Category from one matching categorize rule', () => {
    const result = decision('match', [
      categorize({ category: category('news') }),
    ]);
    assert.deepEqual(
      result.categoryAssignments.map((value) => value.configKey),
      ['news'],
    );
    assert.deepEqual(
      result.categoryReasons.map((value) => value.kind),
      ['rule'],
    );
  });

  it('assigns every Category from multiple matching categorize rules', () => {
    const result = decision('match', [
      categorize({ configKey: 'alpha-rule', category: category('alpha') }),
      categorize({ configKey: 'beta-rule', category: category('beta') }),
    ]);
    assert.deepEqual(
      result.categoryAssignments.map((value) => value.configKey),
      ['alpha', 'beta'],
    );
  });

  it('deduplicates Category assignments while retaining both rule reasons', () => {
    const result = decision('match', [
      categorize({
        configKey: 'second',
        priority: 1,
        category: category('news'),
      }),
      categorize({
        configKey: 'first',
        priority: 2,
        category: category('news'),
      }),
    ]);
    assert.deepEqual(
      result.categoryAssignments.map((value) => value.configKey),
      ['news'],
    );
    assert.deepEqual(result.categoryReasons.map(ruleReasonKey), [
      'first',
      'second',
    ]);
  });

  it('does not let categorize priority suppress another Category', () => {
    const result = decision('match', [
      categorize({
        configKey: 'high',
        priority: 100,
        category: category('high'),
      }),
      categorize({
        configKey: 'low',
        priority: -100,
        category: category('low'),
      }),
    ]);
    assert.deepEqual(
      result.categoryAssignments.map((value) => value.configKey),
      ['high', 'low'],
    );
  });

  it('orders category reasons by priority, Source scope, then config key', () => {
    const result = decision('match', [
      categorize({
        configKey: 'z-installation',
        priority: 2,
        category: category('one'),
      }),
      categorize({
        configKey: 'a-installation',
        priority: 2,
        category: category('two'),
      }),
      categorize({
        configKey: 'source',
        priority: 2,
        sourceId: 'source-1',
        category: category('three'),
      }),
      categorize({
        configKey: 'lower',
        priority: 1,
        category: category('four'),
      }),
    ]);
    assert.deepEqual(result.categoryReasons.map(ruleReasonKey), [
      'source',
      'a-installation',
      'z-installation',
      'lower',
    ]);
  });

  it('orders Category assignments by config key independently of reason order', () => {
    const result = decision('match', [
      categorize({
        configKey: 'first',
        priority: 2,
        category: category('zebra'),
      }),
      categorize({
        configKey: 'second',
        priority: 1,
        category: category('apple'),
      }),
    ]);
    assert.deepEqual(
      result.categoryAssignments.map((value) => value.configKey),
      ['apple', 'zebra'],
    );
  });

  it('uses the endpoint default only when no categorize rule matches', () => {
    const endpoint = category('endpoint');
    const result = decision(
      'no match',
      [categorize({ pattern: 'other', category: category('rule') })],
      {},
      { endpointDefaultCategory: endpoint },
    );
    assert.deepEqual(result.categoryAssignments, [endpoint]);
    assert.deepEqual(
      result.categoryReasons.map((value) => value.kind),
      ['endpoint_default'],
    );
  });

  it('uses the Source default when no rule and no endpoint default apply', () => {
    const source = category('source');
    const result = decision(
      'no match',
      [],
      {},
      { sourceDefaultCategory: source },
    );
    assert.deepEqual(result.categoryAssignments, [source]);
    assert.deepEqual(
      result.categoryReasons.map((value) => value.kind),
      ['source_default'],
    );
  });

  it('selects the endpoint default over the Source default', () => {
    const result = decision(
      'no match',
      [],
      {},
      {
        endpointDefaultCategory: category('endpoint'),
        sourceDefaultCategory: category('source'),
      },
    );
    assert.deepEqual(
      result.categoryAssignments.map((value) => value.configKey),
      ['endpoint'],
    );
  });

  it('suppresses defaults whenever a categorize rule matches, even for the same Category', () => {
    const news = category('news');
    const result = decision(
      'match',
      [categorize({ category: news })],
      {},
      {
        endpointDefaultCategory: news,
        sourceDefaultCategory: category('source'),
      },
    );
    assert.deepEqual(
      result.categoryReasons.map((value) => value.kind),
      ['rule'],
    );
  });

  it('allows an included Article to remain uncategorized', () => {
    const result = decision('no match', []);
    assert.equal(result.included, true);
    assert.deepEqual(result.categoryAssignments, []);
    assert.deepEqual(result.categoryReasons, []);
  });
});

describe('evaluateRelevance determinism and topic independence', () => {
  it('returns deeply equal output for identical inputs and does not mutate either input', () => {
    const candidate = articleCandidate({
      summary: 'match',
      sourceCategories: ['News'],
    });
    const configuration = snapshot([
      categorize({ category: category('news') }),
      rule({ pattern: 'match' }),
    ]);
    const candidateBefore = structuredClone(candidate);
    const configurationBefore = structuredClone(configuration);
    const first = evaluateRelevance(candidate, configuration);
    const second = evaluateRelevance(candidate, configuration);
    assert.deepEqual(first, second);
    assert.deepEqual(candidate, candidateBefore);
    assert.deepEqual(configuration, configurationBefore);
  });

  it('returns frozen result structures while preserving the candidate reference when included', () => {
    const candidate = articleCandidate();
    const result = evaluateRelevance(
      candidate,
      snapshot([categorize({ category: category('news') })]),
    );
    assert.equal(result.included, true);
    assert.equal(result.candidate, candidate);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.decisionReason), true);
    assert.equal(Object.isFrozen(result.categoryAssignments), true);
    assert.equal(
      Object.isFrozen(result.categoryAssignments[0] as object),
      true,
    );
    assert.equal(Object.isFrozen(result.categoryReasons), true);
  });

  it('does not depend on clock, randomness, environment, or locale-sensitive comparison', () => {
    const originalNow = Date.now;
    const originalRandom = Math.random;
    const originalEnvironment = process.env.NEWS_SCRAPER_RELEVANCE_TEST;
    const originalLocaleCompare = String.prototype.localeCompare;
    try {
      Date.now = () => 0;
      Math.random = () => 0;
      process.env.NEWS_SCRAPER_RELEVANCE_TEST = 'first';
      String.prototype.localeCompare = () => -1;
      const first = decision('MATCH', [
        rule({ pattern: 'match', configKey: 'z' }),
        rule({ pattern: 'match', configKey: 'a' }),
      ]);
      Date.now = () => Number.MAX_SAFE_INTEGER;
      Math.random = () => 0.9999999999999999;
      process.env.NEWS_SCRAPER_RELEVANCE_TEST = 'second';
      String.prototype.localeCompare = () => 1;
      const second = decision('MATCH', [
        rule({ pattern: 'match', configKey: 'z' }),
        rule({ pattern: 'match', configKey: 'a' }),
      ]);
      assert.deepEqual(semantics(first), semantics(second));
      assertRuleReason(first, 'rule_include', 'a');
    } finally {
      Date.now = originalNow;
      Math.random = originalRandom;
      String.prototype.localeCompare = originalLocaleCompare;
      if (originalEnvironment === undefined)
        delete process.env.NEWS_SCRAPER_RELEVANCE_TEST;
      else process.env.NEWS_SCRAPER_RELEVANCE_TEST = originalEnvironment;
    }
  });

  it('uses identical mechanics for unrelated-topic and publishing vocabulary without hardcoded keywords', () => {
    const publishing = decision('Indie author report', [
      rule({ pattern: 'author', action: 'exclude' }),
    ]);
    const transit = decision('Transit route report', [
      rule({ pattern: 'route', action: 'exclude' }),
    ]);
    assert.equal(publishing.included, false);
    assert.equal(transit.included, false);
    assert.equal(publishing.decisionReason.kind, transit.decisionReason.kind);
  });
});

function decision(
  title: string,
  rules: readonly RelevanceRuleForEvaluation[],
  candidateOverrides: Partial<ArticleCandidate> = {},
  configurationOverrides: Omit<EffectiveRelevanceConfiguration, 'rules'> = {},
) {
  return evaluateRelevance(
    articleCandidate({ normalizedTitle: title, ...candidateOverrides }),
    snapshot(rules, configurationOverrides),
  );
}

function snapshot(
  rules: readonly RelevanceRuleForEvaluation[],
  overrides: Omit<EffectiveRelevanceConfiguration, 'rules'> = {},
): EffectiveRelevanceConfiguration {
  return { rules, ...overrides };
}

function rule(
  overrides: Partial<RelevanceRuleForEvaluation> = {},
): RelevanceRuleForEvaluation {
  return {
    configKey: 'rule',
    predicateType: 'title_contains',
    pattern: 'match',
    action: 'include',
    priority: 0,
    enabled: true,
    reason: 'Matched rule',
    ...overrides,
  };
}

function categorize(
  options: Omit<
    Partial<RelevanceRuleForEvaluation>,
    'action' | 'categoryTarget'
  > & {
    readonly category: {
      readonly configKey: string;
      readonly displayName: string;
    };
  },
): RelevanceRuleForEvaluation {
  return rule({
    ...options,
    action: 'categorize',
    categoryTarget: options.category,
  });
}

function category(configKey: string) {
  return { configKey, displayName: `${configKey} display` };
}

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

function assertRuleReason(
  result: ReturnType<typeof decision>,
  kind: 'rule_include' | 'rule_exclude',
  configKey: string,
): void {
  assert.equal(result.decisionReason.kind, kind);
  assert.equal(result.decisionReason.ruleConfigKey, configKey);
}

function ruleReasonKey(
  reason: ReturnType<typeof decision>['categoryReasons'][number],
): string {
  if (reason.kind !== 'rule') assert.fail('Expected rule reason');
  return reason.ruleConfigKey;
}

function semantics(result: ReturnType<typeof decision>) {
  return {
    included: result.included,
    decisionReason: result.decisionReason,
    categoryAssignments: result.categoryAssignments,
    categoryReasons: result.categoryReasons,
  };
}
