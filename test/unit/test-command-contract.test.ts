import assert from 'node:assert/strict';
import { globSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const packageJson = JSON.parse(
  await readFile(join(root, 'package.json'), 'utf8'),
) as { scripts: Record<string, string> };

describe('test command contract', () => {
  it('keeps the ordinary aggregate portable and preserves the PHP runner', () => {
    const test = script('test');
    const check = script('check');

    for (const pattern of [
      'test/unit/**/*.test.ts',
      'test/integration/**/*.test.ts',
      'test/collection/**/*.test.ts',
    ]) {
      assert.match(test, new RegExp(`"${escapeRegExp(pattern)}"`, 'u'));
    }
    assert.doesNotMatch(test, /test:php|php/iu);

    assert.deepEqual(check.split(' && '), [
      'npm run format:check',
      'npm run lint',
      'npm run typecheck',
      'npm test',
    ]);
    assert.doesNotMatch(check, /php|browser|live-sources|gemini|deployment/iu);
    assert.match(script('test:php'), /scripts\/run-php-tests\.mjs/u);
  });

  it('assigns ordinary and PHP-backed browser files to disjoint, non-empty commands', () => {
    const ordinaryFiles = selectedTestFiles('test:browser');
    const phpFiles = selectedTestFiles('test:browser:php');
    const movedPhpCustomerTest =
      'test/browser-php/php-customer-example.test.ts';

    assert.ok(
      ordinaryFiles.length > 0,
      'ordinary browser selection must not be empty',
    );
    assert.ok(phpFiles.length > 0, 'PHP browser selection must not be empty');
    assert.equal(ordinaryFiles.includes(movedPhpCustomerTest), false);
    assert.equal(phpFiles.includes(movedPhpCustomerTest), true);
    assert.deepEqual(
      ordinaryFiles.filter((file) => phpFiles.includes(file)),
      [],
    );
  });
});

function script(name: string): string {
  const value = packageJson.scripts[name];
  if (typeof value !== 'string') {
    throw new Error(`Missing package script: ${name}`);
  }
  return value;
}

function selectedTestFiles(name: string): string[] {
  const patterns = [...script(name).matchAll(/"([^"\r\n]+\.test\.ts)"/gu)].map(
    (match) => match[1]!,
  );
  assert.ok(patterns.length > 0, `${name} must select test files`);
  return [
    ...new Set(
      patterns.flatMap((pattern) =>
        globSync(pattern, { cwd: root, exclude: ['node_modules/**'] }).map(
          (file) => file.replaceAll('\\', '/'),
        ),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right, 'en'));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
