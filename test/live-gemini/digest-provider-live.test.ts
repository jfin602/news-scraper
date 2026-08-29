import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeminiDigestProvider } from '../../src/distribution/digests/provider.ts';
import type { ResolvedDigestInput } from '../../src/distribution/digests/input.ts';

test('live Gemini Interactions URL Context proof returns a validated bounded candidate', async () => {
  const apiKey = process.env.NEWS_SCRAPER_GEMINI_API_KEY;
  const testUrl = process.env.NEWS_SCRAPER_GEMINI_TEST_URL;
  if (
    apiKey === undefined ||
    apiKey.trim() === '' ||
    testUrl === undefined ||
    testUrl.trim() === ''
  ) {
    throw new Error(
      'test:live-gemini requires NEWS_SCRAPER_GEMINI_API_KEY and NEWS_SCRAPER_GEMINI_TEST_URL.',
    );
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(testUrl);
  } catch {
    throw new Error(
      'NEWS_SCRAPER_GEMINI_TEST_URL must be an absolute HTTPS URL.',
    );
  }
  if (parsedUrl.protocol !== 'https:')
    throw new Error(
      'NEWS_SCRAPER_GEMINI_TEST_URL must be an absolute HTTPS URL.',
    );

  const result = await createGeminiDigestProvider({
    environment: {
      NEWS_SCRAPER_GEMINI_API_KEY: apiKey,
    },
  }).generate(liveInput(parsedUrl.toString()));
  assert.equal(
    result.kind,
    'success',
    `live Gemini returned bounded ${result.kind === 'failure' ? result.category : 'success'} result`,
  );
  if (result.kind !== 'success') return;
  console.log(
    JSON.stringify({
      provider: result.candidate.provider,
      model: result.candidate.model,
      retrieval: result.candidate.urlContext ?? null,
    }),
  );
});

function liveInput(originalUrl: string): ResolvedDigestInput {
  return {
    profile: { configKey: 'live-proof', displayName: 'Live proof' },
    settings: {
      profileId: '00000000-0000-0000-0000-000000000001',
      profileConfigKey: 'live-proof',
      digestEnabled: true,
      digestLookbackDays: 7,
      digestMaxArticleCount: 1,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
    resolvedAt: new Date(),
    digestInputIdentity: 'a'.repeat(64),
    articles: [
      {
        articleId: 'live-proof-article',
        headline: 'Public test URL',
        sourceDisplayName: 'Live proof',
        effectiveFeedDate: new Date(),
        publishedAt: null,
        author: null,
        summary:
          'Use this supplied safe public URL only as bounded reference data.',
        categories: [],
        originalUrl,
      },
    ],
  };
}
