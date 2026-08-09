const CHILD_STDOUT_LIMIT = 8_192;

export function boundedChildProcessFailure(error: unknown): Error {
  const stdout = childStdout(error).slice(0, CHILD_STDOUT_LIMIT);
  const suffix =
    stdout.length === 0 ? '' : `\nBounded child stdout:\n${stdout}`;
  return new Error(`Child process failed.${suffix}`);
}

function childStdout(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('stdout' in error)) {
    return '';
  }
  const stdout = error.stdout;
  if (typeof stdout === 'string') return stdout;
  return Buffer.isBuffer(stdout) ? stdout.toString('utf8') : '';
}
