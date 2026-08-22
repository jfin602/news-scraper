import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const phpCommand = process.platform === 'win32' ? 'php.exe' : 'php';

const version = spawnSync(phpCommand, ['-v'], { encoding: 'utf8' });
if (version.error || version.status !== 0) {
  console.error(
    'PHP test prerequisite unavailable: the PHP CLI executable was not found or could not start.',
  );
  process.exitCode = 1;
} else {
  const phpFiles = listPhpFiles(join(root, 'integrations', 'php'));
  for (const file of phpFiles) {
    const syntax = spawnSync(phpCommand, ['-l', file], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'inherit',
    });
    if (syntax.error || syntax.status !== 0) {
      process.exitCode = syntax.status ?? 1;
      break;
    }
  }

  if (process.exitCode === undefined) {
    const tests = spawnSync(
      phpCommand,
      [join(root, 'integrations', 'php', 'tests', 'run.php')],
      { cwd: root, stdio: 'inherit' },
    );
    process.exitCode = tests.status ?? 1;
  }
}

function listPhpFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listPhpFiles(path));
    else if (entry.isFile() && path.endsWith('.php')) files.push(path);
  }
  return files.sort((left, right) => left.localeCompare(right));
}
