import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ConfigurationValidationError } from '../../src/publication/configuration.ts';
import {
  normalizeCategoryConfiguration,
  normalizeRelevanceRuleConfiguration,
} from '../../src/collection/relevance/configuration.ts';

test('normalizes canonical Category and Relevance configuration with immutable config keys', () => {
  const category = normalizeCategoryConfiguration({
    configKey: 'industry_news',
    displayName: 'Industry news',
  });
  const rule = normalizeRelevanceRuleConfiguration({
    configKey: 'publisher_titles',
    predicateType: 'title_contains',
    pattern: 'publisher',
    action: 'categorize',
    categoryConfigKey: 'industry_news',
    priority: 10,
    enabled: true,
    reason: 'Publisher coverage',
    sourceConfigKey: 'primary_source',
  });

  assert.deepEqual(category, {
    configKey: 'industry_news',
    displayName: 'Industry news',
  });
  assert.equal(Object.isFrozen(category), true);
  assert.equal(Object.isFrozen(rule), true);
  assert.deepEqual(rule, {
    configKey: 'publisher_titles',
    predicateType: 'title_contains',
    pattern: 'publisher',
    action: 'categorize',
    categoryConfigKey: 'industry_news',
    priority: 10,
    enabled: true,
    reason: 'Publisher coverage',
    sourceConfigKey: 'primary_source',
  });
});

test('uses the existing canonical config-key grammar for Categories and rules', () => {
  for (const configKey of ['Uppercase', 'two__segments', 'a'.repeat(101)]) {
    assertConfigurationFailure(() =>
      normalizeCategoryConfiguration({ configKey, displayName: 'Valid' }),
    );
    assertConfigurationFailure(() =>
      normalizeRelevanceRuleConfiguration(ruleInput({ configKey })),
    );
  }
});

test('rejects unsupported literal semantics and invalid bounded fields', () => {
  for (const input of [
    ruleInput({ predicateType: 'regex' }),
    ruleInput({ action: 'boost' }),
    ruleInput({ pattern: '' }),
    ruleInput({ pattern: ' padded' }),
    ruleInput({ pattern: 'a'.repeat(2001) }),
    ruleInput({ reason: '' }),
    ruleInput({ reason: ' Reason' }),
    ruleInput({ reason: 'a'.repeat(161) }),
    ruleInput({ priority: 1.5 }),
    ruleInput({ enabled: 'yes' }),
  ]) {
    assertConfigurationFailure(() =>
      normalizeRelevanceRuleConfiguration(input),
    );
  }
  for (const displayName of ['', ' Padded', 'a'.repeat(201)]) {
    assertConfigurationFailure(() =>
      normalizeCategoryConfiguration({ configKey: 'valid', displayName }),
    );
  }
});

test('requires Category targets exactly for categorize rules', () => {
  assertConfigurationFailure(() =>
    normalizeRelevanceRuleConfiguration(
      ruleInput({ action: 'categorize', categoryConfigKey: undefined }),
    ),
  );
  for (const action of ['include', 'exclude']) {
    assertConfigurationFailure(() =>
      normalizeRelevanceRuleConfiguration(
        ruleInput({ action, categoryConfigKey: 'industry_news' }),
      ),
    );
  }
});

function ruleInput(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    configKey: 'literal_rule',
    predicateType: 'title_contains',
    pattern: 'literal',
    action: 'include',
    priority: 10,
    enabled: true,
    reason: 'Literal rule',
    ...overrides,
  };
}

function assertConfigurationFailure(operation: () => unknown): void {
  assert.throws(
    operation,
    (error: unknown) => error instanceof ConfigurationValidationError,
  );
}
