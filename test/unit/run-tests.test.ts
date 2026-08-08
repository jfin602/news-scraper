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

  it('runs a configured global setup before selected test files', () => {
    const result = runWrapper(
      '--test-global-setup=test/fixtures/run-tests/global-setup.fixture.mjs',
      'test/fixtures/run-tests/pass-*.fixture.test.mjs',
    );

    assert.equal(result.status, 0, result.stderr);
    assert.ok(
      result.stdout.indexOf('global setup fixture') <
        result.stdout.indexOf('fixture-a'),
    );
  });
});

function runWrapper(...arguments_: string[]) {
  return spawnSync(process.execPath, ['scripts/run-tests.mjs', ...arguments_], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}
