import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ArticleAdministrationError,
  decodeArticleModerationCursor,
  encodeArticleModerationCursor,
  normalizeArticleModerationSearchRequest,
} from '../../src/admin/article-administration.ts';

test('normalizes bounded moderation criteria and binds cursors to all criteria', () => {
  const request = normalizeArticleModerationSearchRequest({
    q: '  source update  ',
    sourceConfigKey: 'source_one',
    visibilityState: 'hidden',
    duplicateReviewParticipating: true,
    pageSize: 25,
  });
  assert.deepEqual(request.criteria, {
    query: 'source update',
    sourceConfigKey: 'source_one',
    visibilityState: 'hidden',
    duplicateReviewParticipating: true,
    pageSize: 25,
  });

  const position = {
    lastSeenAt: '2026-08-14T00:00:01.000000Z',
    articleId: '64000000-0000-4000-8000-000000000001',
  } as const;
  const cursor = encodeArticleModerationCursor(request.criteria, position);
  assert.match(cursor, /^[A-Za-z0-9_-]+$/u);
  assert.deepEqual(
    decodeArticleModerationCursor(cursor, request.criteria),
    position,
  );
  assert.throws(
    () =>
      decodeArticleModerationCursor(cursor, {
        ...request.criteria,
        visibilityState: 'visible',
      }),
    (error: unknown) =>
      error instanceof ArticleAdministrationError &&
      error.code === 'invalid_request',
  );
});

test('rejects unknown, repeated-shape, malformed, and out-of-bound moderation criteria', () => {
  for (const input of [
    { q: 'headline', unexpected: true },
    { q: 'x'.repeat(201) },
    { sourceConfigKey: 'not-valid' },
    { duplicateReviewParticipating: 'true' },
    { pageSize: 0 },
    { pageSize: 101 },
    { cursor: 'not-a-cursor' },
  ]) {
    assert.throws(
      () => normalizeArticleModerationSearchRequest(input),
      (error: unknown) =>
        error instanceof ArticleAdministrationError &&
        error.code === 'invalid_request',
    );
  }
});
