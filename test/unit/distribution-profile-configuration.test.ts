import assert from 'node:assert/strict';
import test from 'node:test';

import { ConfigurationValidationError } from '../../src/publication/configuration.ts';
import {
  DEFAULT_DISTRIBUTION_PROFILE_RESULT_LIMIT,
  normalizeDistributionProfileConfiguration,
  normalizeDistributionProfileSourceFilters,
} from '../../src/distribution/profiles/configuration.ts';

test('normalizes bounded Distribution Profile configuration using the shared config-key authority', () => {
  assert.deepEqual(
    normalizeDistributionProfileConfiguration({
      configKey: 'publisher_news',
      displayName: '  Publisher news  ',
    }),
    {
      configKey: 'publisher_news',
      displayName: 'Publisher news',
      lifecycle: 'draft',
      resultLimit: DEFAULT_DISTRIBUTION_PROFILE_RESULT_LIMIT,
    },
  );
  assert.throws(
    () =>
      normalizeDistributionProfileConfiguration({
        configKey: 'Not_a_shared_key',
        displayName: 'Invalid',
      }),
    ConfigurationValidationError,
  );
  assert.throws(
    () =>
      normalizeDistributionProfileConfiguration({
        configKey: 'valid_key',
        displayName: 'Valid',
        resultLimit: 1001,
      }),
    ConfigurationValidationError,
  );
});

test('normalizes ordered association filters and rejects only duplicates within each dimension', () => {
  assert.deepEqual(
    normalizeDistributionProfileSourceFilters({
      includeAnyPhrases: ['  Books ', 'Publishing'],
      excludeAnyPhrases: ['books'],
      categoryConfigKeys: ['industry', 'fiction'],
    }),
    {
      includeAnyPhrases: ['Books', 'Publishing'],
      excludeAnyPhrases: ['books'],
      categoryConfigKeys: ['industry', 'fiction'],
    },
  );
  assert.throws(
    () =>
      normalizeDistributionProfileSourceFilters({
        includeAnyPhrases: ['Books', 'books'],
      }),
    ConfigurationValidationError,
  );
  assert.throws(
    () =>
      normalizeDistributionProfileSourceFilters({
        categoryConfigKeys: ['industry', 'industry'],
      }),
    ConfigurationValidationError,
  );
  assert.throws(
    () =>
      normalizeDistributionProfileSourceFilters({
        excludeAnyPhrases: [String.fromCharCode(10)],
      }),
    ConfigurationValidationError,
  );
});
