import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

describe('run-tests wrapper', () => {
  it('executes selected tests in deterministic path order', () => {
    const result = runWrapper(
      'test/fixtures/run-tests/pass-*.fixture.test.mjs',
    );

    assert.equal(result.status, 0, result.stderr);
    const firstPosition = result.stdout.indexOf('fixture-a');
    const secondPosition = result.stdout.indexOf('fixture-z');
    assert.ok(firstPosition >= 0);
    assert.ok(secondPosition > firstPosition);
  });

  it('fails clearly when no test files match', () => {
    const result = runWrapper('test/does-not-exist/**/*.test.ts');

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /No test files matched/);
  });

  it('propagates a selected child test failure', () => {
    const result = runWrapper(
      'test/fixtures/run-tests/failure.fixture.test.mjs',
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /expected fixture failure/);
  });
});

function runWrapper(pattern: string) {
  return spawnSync(process.execPath, ['scripts/run-tests.mjs', pattern], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}
