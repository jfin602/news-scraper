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

test('normalizes optional Publication presentation values and preserves absence', () => {
  const populated = normalizePublicationConfiguration({
    name: 'General news',
    activeForCollection: true,
    publicStatus: 'public',
    description: '  Independent reporting.  ',
    logoPath: '  /assets/logo.svg  ',
    accentColor: '  #aBc123  ',
  });
  assert.deepEqual(populated, {
    name: 'General news',
    activeForCollection: true,
    publicStatus: 'public',
    description: 'Independent reporting.',
    logoPath: '/assets/logo.svg',
    accentColor: '#ABC123',
  });
  assert.equal(Object.isFrozen(populated), true);

  const absent = normalizePublicationConfiguration({
    name: 'General news',
    activeForCollection: true,
    publicStatus: 'public',
    description: ' \t ',
    logoPath: '  ',
    accentColor: '\n',
  });
  assert.deepEqual(absent, {
    name: 'General news',
    activeForCollection: true,
    publicStatus: 'public',
  });
});

test('normalizes supported IANA presentation timezones and uses UTC when absent', () => {
  assert.equal(
    normalizePublicationConfiguration({
      name: 'General news',
      activeForCollection: true,
      publicStatus: 'public',
      presentationTimezone: '  America/Los_Angeles  ',
    }).presentationTimezone,
    'America/Los_Angeles',
  );
  assert.equal(
    normalizePublicationConfiguration({
      name: 'General news',
      activeForCollection: true,
      publicStatus: 'public',
      presentationTimezone: 'US/Eastern',
    }).presentationTimezone,
    'America/New_York',
  );
  assert.equal(
    normalizePublicationConfiguration({
      name: 'General news',
      activeForCollection: true,
      publicStatus: 'public',
    }).presentationTimezone,
    undefined,
  );
});

test('rejects unsupported or malformed presentation timezones', () => {
  for (const presentationTimezone of [
    'Mars/Olympus',
    'not-a-time-zone',
    42,
    null,
  ]) {
    assertConfigurationFailure(() =>
      normalizePublicationConfiguration({
        name: 'General news',
        activeForCollection: true,
        publicStatus: 'public',
        presentationTimezone,
      }),
    );
  }
});

test('enforces description bounds by Unicode code point rather than UTF-16 length', () => {
  const atBoundary = '😀'.repeat(500);
  assert.equal(
    normalizePublicationConfiguration({
      name: 'General news',
      activeForCollection: true,
      publicStatus: 'public',
      description: atBoundary,
    }).description,
    atBoundary,
  );
  assertConfigurationFailure(() =>
    normalizePublicationConfiguration({
      name: 'General news',
      activeForCollection: true,
      publicStatus: 'public',
      description: '😀'.repeat(501),
    }),
  );
});

test('accepts only safe same-origin logo paths', () => {
  for (const logoPath of ['/logo.svg', '/assets/publication/logo.svg']) {
    assert.equal(
      normalizePublicationConfiguration({
        name: 'General news',
        activeForCollection: true,
        publicStatus: 'public',
        logoPath,
      }).logoPath,
      logoPath,
    );
  }

  for (const logoPath of [
    'https://example.com/logo.svg',
    'javascript:alert(1)',
    '//example.com/logo.svg',
    '/logo.svg?cache=1',
    '/logo.svg#fragment',
    '/\\example.com/logo.svg',
    '/logo\u0000.svg',
    `/${'a'.repeat(1024)}`,
  ]) {
    assertConfigurationFailure(() =>
      normalizePublicationConfiguration({
        name: 'General news',
        activeForCollection: true,
        publicStatus: 'public',
        logoPath,
      }),
    );
  }
});

test('accepts only canonical six-digit sRGB accent colors', () => {
  assert.equal(
    normalizePublicationConfiguration({
      name: 'General news',
      activeForCollection: true,
      publicStatus: 'public',
      accentColor: '#aBc123',
    }).accentColor,
    '#ABC123',
  );

  for (const accentColor of [
    '#abc',
    '#12345678',
    'rgb(1, 2, 3)',
    'red',
    'var(--accent)',
    '#ABC12G',
  ]) {
    assertConfigurationFailure(() =>
      normalizePublicationConfiguration({
        name: 'General news',
        activeForCollection: true,
        publicStatus: 'public',
        accentColor,
      }),
    );
  }
});

test('requires supplied presentation values to be strings', () => {
  for (const field of ['description', 'logoPath', 'accentColor'] as const) {
    assertConfigurationFailure(() =>
      normalizePublicationConfiguration({
        name: 'General news',
        activeForCollection: true,
        publicStatus: 'public',
        [field]: null,
      }),
    );
  }
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
