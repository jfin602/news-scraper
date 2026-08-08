import { globSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const globalSetupPrefix = '--test-global-setup=';
const arguments_ = process.argv.slice(2);
const globalSetupValues = arguments_
  .filter((argument) => argument.startsWith(globalSetupPrefix))
  .map((argument) => argument.slice(globalSetupPrefix.length));
const patterns = arguments_.filter(
  (argument) => !argument.startsWith(globalSetupPrefix),
);

if (globalSetupValues.length > 1 || globalSetupValues[0] === '') {
  console.error('At most one non-empty test global setup module is allowed.');
  process.exitCode = 1;
} else if (patterns.length === 0) {
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
    const testArguments = ['--test', '--test-concurrency=1'];
    if (globalSetupValues[0] !== undefined) {
      testArguments.push(`${globalSetupPrefix}${globalSetupValues[0]}`);
    }
    testArguments.push(...testFiles);

    const result = spawnSync(process.execPath, testArguments, {
      env: childEnvironment,
      stdio: 'inherit',
    });

    if (result.error) {
      console.error(`Unable to start the test runner: ${result.error.message}`);
      process.exitCode = 1;
    } else {
      process.exitCode = result.status ?? 1;
    }
  }
}
