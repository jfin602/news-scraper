import { globSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const globalSetupPrefix = '--test-global-setup=';
const concurrencyPrefix = '--test-concurrency=';

export function runTests({
  arguments_,
  cwd = process.cwd(),
  environment = process.env,
  glob = globSync,
  spawn = spawnSync,
  writeError = (message) => console.error(message),
}) {
  const globalSetupValues = arguments_
    .filter((argument) => argument.startsWith(globalSetupPrefix))
    .map((argument) => argument.slice(globalSetupPrefix.length));
  const concurrencyOptions = arguments_.filter(
    (argument) =>
      argument === '--test-concurrency' ||
      argument.startsWith(concurrencyPrefix),
  );
  const patterns = arguments_.filter(
    (argument) =>
      !argument.startsWith(globalSetupPrefix) &&
      argument !== '--test-concurrency' &&
      !argument.startsWith(concurrencyPrefix),
  );

  if (globalSetupValues.length > 1 || globalSetupValues[0] === '') {
    writeError('At most one non-empty test global setup module is allowed.');
    return 1;
  }
  if (concurrencyOptions.length > 1) {
    writeError('Test concurrency may be supplied at most once.');
    return 1;
  }

  const concurrencyValue = concurrencyOptions[0]?.slice(
    concurrencyPrefix.length,
  );
  if (
    concurrencyOptions.length === 1 &&
    (concurrencyValue === undefined || !/^[1-9]\d*$/u.test(concurrencyValue))
  ) {
    writeError('Test concurrency must be a positive integer.');
    return 1;
  }
  const concurrency =
    concurrencyValue === undefined ? 1 : Number(concurrencyValue);
  if (!Number.isSafeInteger(concurrency)) {
    writeError('Test concurrency must be a positive safe integer.');
    return 1;
  }
  if (patterns.length === 0) {
    writeError('No test glob patterns were provided.');
    return 1;
  }

  const testFiles = [
    ...new Set(
      patterns.flatMap((pattern) =>
        glob(pattern, {
          cwd,
          exclude: ['node_modules/**'],
        }).map((path) => path.replaceAll('\\', '/')),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right, 'en'));

  if (testFiles.length === 0) {
    writeError(`No test files matched: ${patterns.join(', ')}`);
    return 1;
  }

  const childEnvironment = { ...environment };
  delete childEnvironment.NODE_TEST_CONTEXT;
  const testArguments = ['--test', `--test-concurrency=${String(concurrency)}`];
  if (globalSetupValues[0] !== undefined) {
    testArguments.push(`${globalSetupPrefix}${globalSetupValues[0]}`);
  }
  testArguments.push(...testFiles);

  const result = spawn(process.execPath, testArguments, {
    env: childEnvironment,
    stdio: 'inherit',
  });

  if (result.error) {
    writeError(`Unable to start the test runner: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = runTests({ arguments_: process.argv.slice(2) });
}
