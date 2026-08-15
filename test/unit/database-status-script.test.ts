import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

test('schema status command fails closed on missing configuration without secret output', async () => {
  const sentinel = 'SCHEMA_STATUS_SECRET_SENTINEL';
  const result = await runStatus({
    ...process.env,
    NEWS_SCRAPER_DATABASE_URL: undefined,
    UNUSED_SECRET: sentinel,
  });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /configuration is invalid or missing/u);
  assert.doesNotMatch(
    `${result.stdout}${result.stderr}`,
    new RegExp(sentinel, 'u'),
  );
});

function runStatus(
  environment: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/database-status.ts'], {
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '',
      stderr = '';
    child.stdout
      .setEncoding('utf8')
      .on('data', (chunk: string) => (stdout += chunk));
    child.stderr
      .setEncoding('utf8')
      .on('data', (chunk: string) => (stderr += chunk));
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}
