import { globSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const patterns = process.argv.slice(2);

if (patterns.length === 0) {
  console.error('No test glob patterns were provided.');
  process.exitCode = 1;
} else {
  const testFiles = [
    ...new Set(
      patterns.flatMap((pattern) =>
        globSync(pattern, {
          cwd: process.cwd(),
          exclude: ['node_modules/**'],
        }).map((path) => path.replaceAll('\\', '/')),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right, 'en'));

  if (testFiles.length === 0) {
    console.error(`No test files matched: ${patterns.join(', ')}`);
    process.exitCode = 1;
  } else {
    const childEnvironment = { ...process.env };
    delete childEnvironment.NODE_TEST_CONTEXT;
    const result = spawnSync(
      process.execPath,
      ['--test', '--test-concurrency=1', ...testFiles],
      { env: childEnvironment, stdio: 'inherit' },
    );

    if (result.error) {
      console.error(`Unable to start the test runner: ${result.error.message}`);
      process.exitCode = 1;
    } else {
      process.exitCode = result.status ?? 1;
    }
  }
}
