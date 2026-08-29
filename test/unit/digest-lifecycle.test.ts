import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generationRequired,
  normalizeDigestScheduledSlot,
  persistedFailureCategory,
} from '../../src/distribution/digests/lifecycle.ts';
import { digestInputIdentity } from '../../src/distribution/digests/input.ts';
import type { ProfileAiSettings } from '../../src/distribution/digests/repository.ts';

const profileConfigKey = 'industry_updates';
const settings = profileSettings();

test('scheduled generation requires a newly entering bounded Article or settings change, not natural age-out', () => {
  const active = activeDigest(['article-a', 'article-b', 'article-c']);
  const unchanged = input(['article-a', 'article-b', 'article-c']);
  const naturalAgeOut = input(['article-a', 'article-b']);
  const newlyEntering = input(['article-d', 'article-a', 'article-b']);
  const changedSettings = input(['article-a', 'article-b', 'article-c'], {
    ...settings,
    digestLookbackDays: 14,
  });

  assert.equal(generationRequired(active, unchanged, false), false);
  assert.equal(generationRequired(active, naturalAgeOut, false), false);
  assert.equal(generationRequired(active, newlyEntering, false), true);
  assert.equal(generationRequired(active, changedSettings, false), true);
  assert.equal(generationRequired(active, unchanged, true), true);
});

test('scheduled digest slots allow only exact UTC half-day starts', () => {
  assert.equal(
    normalizeDigestScheduledSlot(
      new Date('2026-08-28T00:00:00.000Z'),
    ).toISOString(),
    '2026-08-28T00:00:00.000Z',
  );
  assert.equal(
    normalizeDigestScheduledSlot(
      new Date('2026-08-28T12:00:00.000Z'),
    ).toISOString(),
    '2026-08-28T12:00:00.000Z',
  );
  assert.throws(
    () => normalizeDigestScheduledSlot(new Date('2026-08-28T12:00:00.001Z')),
    /UTC half-day/u,
  );
  assert.throws(
    () => normalizeDigestScheduledSlot(new Date('2026-08-28T06:00:00.000Z')),
    /UTC half-day/u,
  );
});

test('provider failures become bounded repository-safe attempt diagnostics', () => {
  assert.equal(
    persistedFailureCategory('provider_unconfigured'),
    'dependency_failure',
  );
  assert.equal(persistedFailureCategory('provider_timeout'), 'timeout');
  assert.equal(persistedFailureCategory('provider_rate_limited'), 'rate_limit');
  assert.equal(
    persistedFailureCategory('provider_safety_rejected'),
    'safety_rejection',
  );
  assert.equal(
    persistedFailureCategory('provider_invalid_response'),
    'malformed_output',
  );
  assert.equal(
    persistedFailureCategory('provider_transport_failure'),
    'provider_failure',
  );
});

function activeDigest(articleIds: readonly string[]) {
  return Object.freeze({
    profileConfigKey,
    inputArticleIds: Object.freeze([...articleIds]),
    digestInputIdentity: digestInputIdentity({
      profileConfigKey,
      settings,
      orderedArticleIds: articleIds,
    }),
  });
}

function input(articleIds: readonly string[], inputSettings = settings) {
  return Object.freeze({
    profile: Object.freeze({ configKey: profileConfigKey }),
    settings: inputSettings,
    articles: Object.freeze(articleIds.map((articleId) => ({ articleId }))),
  });
}

function profileSettings(): ProfileAiSettings {
  return Object.freeze({
    profileId: '00000000-0000-4000-8000-000000000001',
    profileConfigKey,
    digestEnabled: true,
    digestLookbackDays: 7,
    digestMaxArticleCount: 20,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  });
}
