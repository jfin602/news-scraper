import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decodePublicDiscoveryCursor,
  encodePublicDiscoveryCursor,
  parsePublicDiscoveryRequest,
  publicDiscoveryCriteriaFingerprint,
  PublicDiscoveryInputError,
  PUBLIC_DISCOVERY_LIMITS,
  type PublicDiscoveryCriteria,
  type PublicDiscoveryCursorPosition,
} from '../../src/public-feed/discovery.ts';

const POSITION: PublicDiscoveryCursorPosition = Object.freeze({
  effectiveFeedDate: '2026-08-12T10:11:12.123456Z',
  firstSeenAt: '2026-08-12T10:10:09.654321Z',
  articleId: '12345678-1234-4234-8234-123456789abc',
});

test('parses empty and valid canonical public discovery criteria', () => {
  assert.deepEqual(parsePublicDiscoveryRequest(''), {});
  assert.deepEqual(parsePublicDiscoveryRequest('q=Book+News'), {
    keywordQuery: 'Book News',
  });
  assert.deepEqual(parsePublicDiscoveryRequest('source=publisher_news'), {
    sourceConfigKey: 'publisher_news',
  });
  assert.deepEqual(parsePublicDiscoveryRequest('category=industry_news'), {
    categoryConfigKey: 'industry_news',
  });
  assert.deepEqual(
    parsePublicDiscoveryRequest(
      'q=Publishing&source=publisher_news&category=industry_news',
    ),
    {
      keywordQuery: 'Publishing',
      sourceConfigKey: 'publisher_news',
      categoryConfigKey: 'industry_news',
    },
  );
});

test('rejects repeated, unknown, and malformed raw query forms', () => {
  for (const rawQuery of [
    'q=one&q=one',
    'source=first&source=first',
    'category=first&category=first',
    'cursor=first&cursor=first',
    'q=one&%71=two',
    'unexpected=value',
    'q=%',
    'q=%E0%A4%A',
    'q=one&&source=publisher_news',
    'publication=indie_authors',
  ]) {
    assertDiscoveryFailure(() => parsePublicDiscoveryRequest(rawQuery));
  }
  assert.deepEqual(parsePublicDiscoveryRequest('q=hello+world'), {
    keywordQuery: 'hello world',
  });
  assertDiscoveryFailure(() =>
    parsePublicDiscoveryRequest('q='.padEnd(8193, 'a')),
  );
});

test('normalizes keyword criteria and validates immutable config keys', () => {
  assert.deepEqual(parsePublicDiscoveryRequest('q=%20%20Book%20News%20%20'), {
    keywordQuery: 'Book News',
  });
  assert.deepEqual(parsePublicDiscoveryRequest('q=%20%09%20'), {});
  const encodedEmoji = '%F0%9F%98%80';
  assert.deepEqual(
    parsePublicDiscoveryRequest(
      `q=${encodedEmoji.repeat(PUBLIC_DISCOVERY_LIMITS.maxKeywordCodePoints)}`,
    ),
    {
      keywordQuery: String.fromCodePoint(0x1f600).repeat(
        PUBLIC_DISCOVERY_LIMITS.maxKeywordCodePoints,
      ),
    },
  );
  assertDiscoveryFailure(() =>
    parsePublicDiscoveryRequest(
      `q=${encodedEmoji.repeat(PUBLIC_DISCOVERY_LIMITS.maxKeywordCodePoints + 1)}`,
    ),
  );
  assert.deepEqual(
    parsePublicDiscoveryRequest(
      `q=${'😀'.repeat(PUBLIC_DISCOVERY_LIMITS.maxKeywordCodePoints)}`,
    ),
    { keywordQuery: '😀'.repeat(PUBLIC_DISCOVERY_LIMITS.maxKeywordCodePoints) },
  );
  assertDiscoveryFailure(() =>
    parsePublicDiscoveryRequest(
      `q=${'😀'.repeat(PUBLIC_DISCOVERY_LIMITS.maxKeywordCodePoints + 1)}`,
    ),
  );

  const maximumKey = 'a'.repeat(PUBLIC_DISCOVERY_LIMITS.maxConfigKeyLength);
  assert.deepEqual(
    parsePublicDiscoveryRequest(`source=${maximumKey}&category=${maximumKey}`),
    { sourceConfigKey: maximumKey, categoryConfigKey: maximumKey },
  );
  for (const value of [
    '',
    'Uppercase',
    'hyphen-key',
    'double__underscore',
    '_leading',
    'trailing_',
    'a'.repeat(PUBLIC_DISCOVERY_LIMITS.maxConfigKeyLength + 1),
  ]) {
    assertDiscoveryFailure(() =>
      parsePublicDiscoveryRequest(`source=${value}`),
    );
    assertDiscoveryFailure(() =>
      parsePublicDiscoveryRequest(`category=${value}`),
    );
  }
});

test('encodes and decodes deterministic, criteria-bound high-precision cursors', () => {
  const criteria: PublicDiscoveryCriteria = Object.freeze({
    keywordQuery: 'Publishing News',
    sourceConfigKey: 'publisher_news',
    categoryConfigKey: 'industry_news',
  });
  const cursor = encodePublicDiscoveryCursor(criteria, POSITION);
  assert.match(cursor, /^[A-Za-z0-9_-]+$/u);
  assert.equal(encodePublicDiscoveryCursor(criteria, POSITION), cursor);
  assert.deepEqual(decodePublicDiscoveryCursor(cursor, criteria), POSITION);
  assert.equal(
    encodePublicDiscoveryCursor(
      criteria,
      decodePublicDiscoveryCursor(cursor, criteria),
    ),
    cursor,
  );
  assert.deepEqual(
    parsePublicDiscoveryRequest(
      `q=Publishing+News&source=publisher_news&category=industry_news&cursor=${cursor}`,
    ),
    { ...criteria, cursorPosition: POSITION },
  );
  assert.equal(Object.isFrozen(parsePublicDiscoveryRequest('q=one')), true);
  assert.equal(
    Object.isFrozen(
      parsePublicDiscoveryRequest(
        `q=Publishing+News&source=publisher_news&category=industry_news&cursor=${cursor}`,
      ).cursorPosition,
    ),
    true,
  );
});

test('fails closed for malformed cursor formats and payloads', () => {
  const criteria: PublicDiscoveryCriteria = Object.freeze({
    keywordQuery: 'News',
  });
  const malformedPayloads: unknown[] = [
    '{',
    [],
    {
      version: 1,
      criteriaFingerprint: publicDiscoveryCriteriaFingerprint(criteria),
      effectiveFeedDate: POSITION.effectiveFeedDate,
      firstSeenAt: POSITION.firstSeenAt,
      articleId: POSITION.articleId,
      extra: 'no',
    },
    {
      version: 1,
      criteriaFingerprint: publicDiscoveryCriteriaFingerprint(criteria),
      effectiveFeedDate: POSITION.effectiveFeedDate,
      firstSeenAt: POSITION.firstSeenAt,
    },
    {
      version: 2,
      criteriaFingerprint: publicDiscoveryCriteriaFingerprint(criteria),
      effectiveFeedDate: POSITION.effectiveFeedDate,
      firstSeenAt: POSITION.firstSeenAt,
      articleId: POSITION.articleId,
    },
    {
      version: 1,
      criteriaFingerprint: 'z'.repeat(64),
      effectiveFeedDate: POSITION.effectiveFeedDate,
      firstSeenAt: POSITION.firstSeenAt,
      articleId: POSITION.articleId,
    },
    {
      version: 1,
      criteriaFingerprint: publicDiscoveryCriteriaFingerprint(criteria),
      effectiveFeedDate: '2026-08-12T10:11:12.123Z',
      firstSeenAt: POSITION.firstSeenAt,
      articleId: POSITION.articleId,
    },
    {
      version: 1,
      criteriaFingerprint: publicDiscoveryCriteriaFingerprint(criteria),
      effectiveFeedDate: POSITION.effectiveFeedDate,
      firstSeenAt: '2026-02-30T10:10:09.654321Z',
      articleId: POSITION.articleId,
    },
    {
      version: 1,
      criteriaFingerprint: publicDiscoveryCriteriaFingerprint(criteria),
      effectiveFeedDate: POSITION.effectiveFeedDate,
      firstSeenAt: POSITION.firstSeenAt,
      articleId: 'not-a-uuid',
    },
  ];
  for (const payload of malformedPayloads) {
    assertDiscoveryFailure(() =>
      decodePublicDiscoveryCursor(encodePayload(payload), criteria),
    );
  }
  for (const cursor of [
    '***',
    'a'.repeat(PUBLIC_DISCOVERY_LIMITS.maxEncodedCursorLength + 1),
    encodeRawText('{'),
  ]) {
    assertDiscoveryFailure(() => decodePublicDiscoveryCursor(cursor, criteria));
  }
});

test('rejects cursors reused with different criteria while case-equivalent keywords bind', () => {
  const cursor = encodePublicDiscoveryCursor(
    { keywordQuery: 'Publishing News', sourceConfigKey: 'publisher_news' },
    POSITION,
  );
  assert.deepEqual(
    decodePublicDiscoveryCursor(cursor, {
      keywordQuery: 'PUBLISHING NEWS',
      sourceConfigKey: 'publisher_news',
    }),
    POSITION,
  );
  for (const criteria of [
    { keywordQuery: 'different news', sourceConfigKey: 'publisher_news' },
    { keywordQuery: 'publishing news', sourceConfigKey: 'other_source' },
    {
      keywordQuery: 'publishing news',
      sourceConfigKey: 'publisher_news',
      categoryConfigKey: 'industry_news',
    },
  ]) {
    assertDiscoveryFailure(() => decodePublicDiscoveryCursor(cursor, criteria));
  }
});

test('is topic-independent and unaffected by ambient process state', () => {
  const before = parsePublicDiscoveryRequest(
    'q=Quantum+Gardening&source=regional_press&category=field_notes',
  );
  const originalTimezone = process.env.TZ;
  const originalNow = Date.now;
  const originalRandom = Math.random;
  process.env.TZ = 'Pacific/Auckland';
  Date.now = () => 0;
  Math.random = () => 0;
  try {
    assert.deepEqual(
      parsePublicDiscoveryRequest(
        'q=Quantum+Gardening&source=regional_press&category=field_notes',
      ),
      before,
    );
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

function encodePayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function encodeRawText(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function assertDiscoveryFailure(operation: () => unknown): void {
  assert.throws(
    operation,
    (error: unknown) =>
      error instanceof PublicDiscoveryInputError &&
      error.reason === 'invalid_discovery_input' &&
      error.message === 'Invalid public discovery input.',
  );
}
