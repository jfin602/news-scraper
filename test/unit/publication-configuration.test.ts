import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ConfigurationValidationError,
  normalizePublicationConfiguration,
  normalizePublicationPublicStatus,
} from '../../src/publication/configuration.ts';

test('normalizes the bounded Publication configuration shape', () => {
  const configuration = normalizePublicationConfiguration({
    name: '  General news  ',
    activeForCollection: true,
    publicStatus: 'public',
  });

  assert.deepEqual(configuration, {
    name: 'General news',
    activeForCollection: true,
    publicStatus: 'public',
  });
  assert.equal(Object.isFrozen(configuration), true);
});

test('rejects invalid Publication names and collection-active state', () => {
  for (const name of ['', ' '.repeat(2), 'a'.repeat(201)]) {
    assertConfigurationFailure(() =>
      normalizePublicationConfiguration({
        name,
        activeForCollection: true,
        publicStatus: 'private',
      }),
    );
  }

  assertConfigurationFailure(() =>
    normalizePublicationConfiguration({
      name: 'Valid',
      activeForCollection: 'yes',
      publicStatus: 'private',
    }),
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
