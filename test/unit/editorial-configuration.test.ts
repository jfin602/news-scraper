import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { ConfigurationValidationError } from '../../src/publication/configuration.ts';
import {
  EditorialConfigurationError,
  normalizeEditorialConfigurationDocument,
  parseEditorialConfigurationDocument,
} from '../../src/collection/relevance/operator-configuration.ts';

const execFileAsync = promisify(execFile);

test('parses full and empty editorial sections deterministically', () => {
  const full = normalizeEditorialConfigurationDocument({
    categories: [{ configKey: 'industry_news', displayName: 'Industry news' }],
    rules: [ruleInput()],
    sourceDefaults: [
      { sourceConfigKey: 'source_one', categoryConfigKey: null },
    ],
    endpointDefaults: [
      {
        sourceConfigKey: 'source_one',
        endpointConfigKey: 'main_feed',
        categoryConfigKey: 'industry_news',
      },
    ],
  });
  assert.deepEqual(full.sourceDefaults, [{ sourceConfigKey: 'source_one' }]);
  assert.equal(Object.isFrozen(full), true);
  assert.deepEqual(
    normalizeEditorialConfigurationDocument({
      categories: [],
      rules: [],
      sourceDefaults: [],
      endpointDefaults: [],
    }),
    { categories: [], rules: [], sourceDefaults: [], endpointDefaults: [] },
  );
});

test('rejects unknown and missing strict document fields and ambiguous targets', () => {
  for (const input of [
    {
      categories: [],
      rules: [],
      sourceDefaults: [],
      endpointDefaults: [],
      extra: true,
    },
    { categories: [], rules: [], sourceDefaults: [] },
    {
      categories: [
        { configKey: 'same', displayName: 'One' },
        { configKey: 'same', displayName: 'Two' },
      ],
      rules: [],
      sourceDefaults: [],
      endpointDefaults: [],
    },
    {
      categories: [],
      rules: [],
      sourceDefaults: [],
      endpointDefaults: [
        {
          sourceConfigKey: 'source_one',
          endpointConfigKey: 'main_feed',
          categoryConfigKey: null,
        },
        {
          sourceConfigKey: 'source_one',
          endpointConfigKey: 'main_feed',
          categoryConfigKey: null,
        },
      ],
    },
    {
      categories: [],
      rules: [ruleInput(), ruleInput()],
      sourceDefaults: [],
      endpointDefaults: [],
    },
    {
      categories: [],
      rules: [],
      sourceDefaults: [
        { sourceConfigKey: 'source_one', categoryConfigKey: null },
        { sourceConfigKey: 'source_one', categoryConfigKey: null },
      ],
      endpointDefaults: [],
    },
  ]) {
    assert.throws(
      () => normalizeEditorialConfigurationDocument(input),
      EditorialConfigurationError,
    );
  }
  assert.throws(
    () =>
      normalizeEditorialConfigurationDocument({
        categories: [],
        rules: [],
        sourceDefaults: [],
        endpointDefaults: [
          {
            sourceConfigKey: 'source_one',
            endpointConfigKey: 'main_feed',
            categoryConfigKey: null,
            unexpected: true,
          },
        ],
      }),
    EditorialConfigurationError,
  );
});

test('delegates Category and rule validity to the canonical P2 validators', () => {
  assert.throws(
    () =>
      normalizeEditorialConfigurationDocument({
        categories: [{ configKey: 'industry_news', displayName: ' Industry' }],
        rules: [],
        sourceDefaults: [],
        endpointDefaults: [],
      }),
    ConfigurationValidationError,
  );
  assert.throws(
    () =>
      normalizeEditorialConfigurationDocument({
        categories: [],
        rules: [ruleInput({ action: 'categorize' })],
        sourceDefaults: [],
        endpointDefaults: [],
      }),
    ConfigurationValidationError,
  );
});

test('committed initial editorial configuration contains only the documented categories', async () => {
  const document = parseEditorialConfigurationDocument(
    await readFile('config/editorial.json', 'utf8'),
  );
  assert.deepEqual(
    document.categories.map((category) => [
      category.configKey,
      category.displayName,
    ]),
    [
      ['platforms_and_retailers', 'Platforms and Retailers'],
      ['publishing_industry', 'Publishing Industry'],
      ['author_business', 'Author Business'],
      ['marketing', 'Marketing'],
      ['audiobooks', 'Audiobooks'],
      ['artificial_intelligence', 'Artificial Intelligence'],
      ['copyright_and_legal', 'Copyright and Legal'],
      ['tools_and_technology', 'Tools and Technology'],
      ['general', 'General'],
    ],
  );
  assert.deepEqual(document.rules, []);
  assert.deepEqual(document.sourceDefaults, []);
  assert.deepEqual(document.endpointDefaults, []);
});

test('operator command reports file and malformed-document failures safely', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      'scripts/apply-editorial-configuration.ts',
      'test/fixtures/missing-editorial.json',
    ]),
    (error: unknown) => {
      const result = error as { stderr?: string };
      assert.equal(
        result.stderr,
        'Editorial configuration file could not be read.\n',
      );
      return true;
    },
  );
  const directory = await mkdtemp(join(tmpdir(), 'news-scraper-editorial-'));
  const malformedPath = join(directory, 'malformed.json');
  try {
    await writeFile(malformedPath, '{', 'utf8');
    await assert.rejects(
      execFileAsync(process.execPath, [
        'scripts/apply-editorial-configuration.ts',
        malformedPath,
      ]),
      (error: unknown) => {
        const result = error as { stderr?: string };
        assert.equal(
          result.stderr,
          'Invalid editorial configuration: invalid_json\n',
        );
        return true;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const secret = 'not-for-output';
  await assert.rejects(
    execFileAsync(
      process.execPath,
      ['scripts/apply-editorial-configuration.ts', 'config/editorial.json'],
      {
        env: {
          ...process.env,
          NEWS_SCRAPER_DATABASE_URL: `postgresql://invalid:${secret}@127.0.0.1:1/missing`,
        },
      },
    ),
    (error: unknown) => {
      const result = error as {
        message?: string;
        stdout?: string;
        stderr?: string;
      };
      assert.doesNotMatch(
        `${result.message ?? ''}${result.stdout ?? ''}${result.stderr ?? ''}`,
        new RegExp(secret, 'u'),
      );
      assert.equal(result.stderr, 'Database operation failed.\n');
      return true;
    },
  );
});

function ruleInput(overrides: Record<string, unknown> = {}) {
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
