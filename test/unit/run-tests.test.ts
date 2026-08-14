import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { runTests } from '../../scripts/run-tests.mjs';

describe('run-tests wrapper', () => {
  it('defaults to serial execution and preserves deterministic de-duplicated selection', () => {
    const invocation = invokeRunner({
      arguments_: ['first', 'second'],
      glob(pattern) {
        return pattern === 'first'
          ? ['test\\fixtures\\run-tests\\pass-z.fixture.test.mjs']
          : [
              'test/fixtures/run-tests/pass-a.fixture.test.mjs',
              'test/fixtures/run-tests/pass-z.fixture.test.mjs',
            ];
      },
      environment: { NODE_TEST_CONTEXT: 'inherited-context' },
    });

    assert.equal(invocation.exitCode, 0);
    assert.deepEqual(invocation.arguments, [
      '--test',
      '--test-concurrency=1',
      'test/fixtures/run-tests/pass-a.fixture.test.mjs',
      'test/fixtures/run-tests/pass-z.fixture.test.mjs',
    ]);
    assert.equal(invocation.environment.NODE_TEST_CONTEXT, undefined);
  });

  it('passes one explicit valid concurrency option to the Node child', () => {
    const invocation = invokeRunner({
      arguments_: [
        '--test-concurrency=4',
        'test/fixtures/run-tests/pass-a.fixture.test.mjs',
      ],
      glob: (pattern) => [pattern],
    });

    assert.equal(invocation.exitCode, 0);
    assert.deepEqual(invocation.arguments, [
      '--test',
      '--test-concurrency=4',
      'test/fixtures/run-tests/pass-a.fixture.test.mjs',
    ]);
  });

  it('rejects malformed or duplicate concurrency options before launching Node', () => {
    for (const arguments_ of [
      ['--test-concurrency=', 'fixture'],
      ['--test-concurrency', 'fixture'],
      ['--test-concurrency=0', 'fixture'],
      ['--test-concurrency=-1', 'fixture'],
      ['--test-concurrency=1.5', 'fixture'],
      ['--test-concurrency=not-a-number', 'fixture'],
      ['--test-concurrency=1', '--test-concurrency=2', 'fixture'],
    ]) {
      const invocation = invokeRunner({ arguments_ });

      assert.equal(invocation.exitCode, 1, arguments_.join(' '));
      assert.equal(invocation.spawned, false, arguments_.join(' '));
      assert.match(invocation.errors.join('\n'), /Test concurrency/u);
    }
  });

  it('fails clearly when no patterns or no test files match', () => {
    const noPatterns = runWrapper();
    const noMatches = runWrapper('test/does-not-exist/**/*.test.ts');

    assert.notEqual(noPatterns.status, 0);
    assert.match(noPatterns.stderr, /No test glob patterns were provided/u);
    assert.notEqual(noMatches.status, 0);
    assert.match(noMatches.stderr, /No test files matched/u);
  });

  it('rejects duplicate global setup options and forwards one configured setup', () => {
    const duplicate = invokeRunner({
      arguments_: [
        '--test-global-setup=first.mjs',
        '--test-global-setup=second.mjs',
        'fixture',
      ],
    });
    const configured = invokeRunner({
      arguments_: ['--test-global-setup=first.mjs', 'fixture'],
    });

    assert.equal(duplicate.exitCode, 1);
    assert.equal(duplicate.spawned, false);
    assert.match(duplicate.errors.join('\n'), /global setup/u);
    assert.deepEqual(configured.arguments, [
      '--test',
      '--test-concurrency=1',
      '--test-global-setup=first.mjs',
      'fixture',
    ]);
  });

  it('runs configured global setup before selected test files', () => {
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

  it('propagates child nonzero statuses and launch errors', () => {
    const failedTest = runWrapper(
      'test/fixtures/run-tests/failure.fixture.test.mjs',
    );
    const statusFailure = invokeRunner({
      arguments_: ['fixture'],
      result: { status: 17 },
    });
    const launchFailure = invokeRunner({
      arguments_: ['fixture'],
      result: { error: new Error('fixture launch failure'), status: null },
    });

    assert.notEqual(failedTest.status, 0);
    assert.match(failedTest.stdout, /expected fixture failure/u);
    assert.equal(statusFailure.exitCode, 17);
    assert.equal(launchFailure.exitCode, 1);
    assert.match(
      launchFailure.errors.join('\n'),
      /Unable to start the test runner: fixture launch failure/u,
    );
  });

  it('allows independently selected files to overlap without asserting completion order', async () => {
    const barrierDirectory = await mkdtemp(
      join(tmpdir(), 'run-tests-barrier-'),
    );
    try {
      const result = runWrapper(
        '--test-concurrency=2',
        'test/fixtures/run-tests/concurrent-*.fixture.test.mjs',
        {
          RUN_TESTS_BARRIER_DIRECTORY: barrierDirectory,
        },
      );

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /concurrent fixture a observed both/u);
      assert.match(result.stdout, /concurrent fixture z observed both/u);
    } finally {
      await rm(barrierDirectory, { force: true, recursive: true });
    }
  });
});

function invokeRunner({
  arguments_,
  glob = () => ['fixture'],
  environment = {},
  result = { status: 0 },
}: {
  arguments_: string[];
  glob?: (pattern: string) => string[];
  environment?: NodeJS.ProcessEnv;
  result?: { error?: Error; status: number | null };
}) {
  const errors: string[] = [];
  let invocation:
    | {
        readonly arguments: readonly string[];
        readonly environment: NodeJS.ProcessEnv;
      }
    | undefined;
  const exitCode = runTests({
    arguments_,
    environment,
    glob,
    spawn(
      _command: string,
      childArguments: readonly string[],
      options: SpawnSyncOptions,
    ) {
      invocation = {
        arguments: childArguments,
        environment: (options.env ?? {}) as NodeJS.ProcessEnv,
      };
      return result;
    },
    writeError(message: string) {
      errors.push(message);
    },
  });

  return {
    exitCode,
    errors,
    spawned: invocation !== undefined,
    arguments: invocation?.arguments,
    environment: invocation?.environment ?? {},
  };
}

function runWrapper(...values: Array<string | NodeJS.ProcessEnv>) {
  const lastValue = values.at(-1);
  const environment = typeof lastValue === 'string' ? undefined : lastValue;
  const arguments_ = values.filter(
    (value): value is string => typeof value === 'string',
  );
  return spawnSync(process.execPath, ['scripts/run-tests.mjs', ...arguments_], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env:
      environment === undefined
        ? undefined
        : { ...process.env, ...environment },
  });
}
