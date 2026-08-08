import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ConfigurationValidationError,
  normalizePublicationConfiguration,
  normalizePublicationPublicStatus,
} from '../../src/publications/configuration.ts';

test('normalizes the bounded Publication configuration shape', () => {
  const configuration = normalizePublicationConfiguration({
    name: '  General news  ',
    slug: 'general-news',
    activeForCollection: true,
    publicStatus: 'public',
  });

  assert.deepEqual(configuration, {
    name: 'General news',
    slug: 'general-news',
    activeForCollection: true,
    publicStatus: 'public',
  });
  assert.equal(Object.isFrozen(configuration), true);
});

test('rejects invalid Publication names and slugs', () => {
  for (const name of ['', ' '.repeat(2), 'a'.repeat(201)]) {
    assertConfigurationFailure(() =>
      normalizePublicationConfiguration({
        name,
        slug: 'valid-slug',
        activeForCollection: true,
        publicStatus: 'private',
      }),
    );
  }

  for (const slug of [
    'Uppercase',
    'has space',
    'has_underscore',
    '-start',
    'end-',
  ]) {
    assertConfigurationFailure(() =>
      normalizePublicationConfiguration({
        name: 'Valid',
        slug,
        activeForCollection: true,
        publicStatus: 'private',
      }),
    );
  }

  assert.equal(
    normalizePublicationConfiguration({
      name: 'Valid',
      slug: `a${'-a'.repeat(49)}`,
      activeForCollection: false,
      publicStatus: 'private',
    }).slug.length,
    99,
  );
});

test('accepts only canonical Publication public statuses', () => {
  assert.equal(normalizePublicationPublicStatus('private'), 'private');
  assert.equal(normalizePublicationPublicStatus('public'), 'public');
  assertConfigurationFailure(() => normalizePublicationPublicStatus('hidden'));
});

function assertConfigurationFailure(operation: () => unknown): void {
  assert.throws(
    operation,
    (error: unknown) => error instanceof ConfigurationValidationError,
  );
}
