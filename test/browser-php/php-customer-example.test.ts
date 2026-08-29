import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';

const root = resolve(import.meta.dirname, '../..');
const php = process.platform === 'win32' ? 'php.exe' : 'php';
let browser: Browser | undefined;

describe('PHP customer-style local-only example', () => {
  after(async () => await browser?.close());

  for (const scenario of [
    'populated',
    'empty',
    'stale',
    'never',
    'cutoff',
    'disabled',
    'unavailable',
  ] as const) {
    it(`renders ${scenario} local state through a credential-free PHP server`, async () => {
      await withExample(scenario, async ({ base, open, logs }) => {
        const requests: string[] = [];
        const page = await open(false, requests);
        await page.goto(base);
        const text = await page.locator('body').innerText();
        assert.doesNotMatch(
          text,
          /manifest\.json|news-scraper-php-test|Authorization|bearer/i,
        );
        assert.deepEqual(requests, []);
        if (scenario === 'populated') {
          assert.equal(await page.locator('.news-scraper-article').count(), 2);
          assert.equal(
            await page.locator('h1').innerText(),
            'Profile <em>Name</em>',
          );
          assert.deepEqual(
            await page
              .locator('.news-scraper-article h2 a')
              .evaluateAll((links) =>
                links.map((link) => link.getAttribute('href')),
              ),
            [
              'https://publisher.example.test/first?quoted="yes"&x=1',
              'https://publisher.example.test/second',
            ],
          );
          assert.equal(await page.evaluate(() => 'pwned' in globalThis), false);
          assert.equal(await page.locator('script').count(), 0);
          assert.doesNotMatch(
            logs(),
            /Authorization|Bearer|NEWS_SCRAPER_BEARER_TOKEN/i,
          );
        } else if (scenario === 'empty') {
          assert.match(text, /No articles are currently available/);
          assert.equal(await page.locator('a').count(), 0);
        } else if (scenario === 'stale') {
          assert.match(text, /Local content is stale/);
          assert.equal(await page.locator('.news-scraper-article').count(), 2);
        } else {
          assert.equal(await page.locator('a').count(), 0);
          assert.match(
            text,
            scenario === 'never'
              ? /initializing/
              : scenario === 'cutoff'
                ? /too old/
                : scenario === 'disabled'
                  ? /disabled/
                  : /temporarily unavailable/,
          );
        }
        await page.context().close();
      });
    });
  }

  it('serves synchronized publisher links and content without JavaScript', async () => {
    await withExample('populated', async ({ base, open }) => {
      const page = await open(false, []);
      await page.goto(base);
      assert.equal(await page.locator('.news-scraper-article h2 a').count(), 2);
      assert.equal(
        await page
          .locator('.news-scraper-article h2 a')
          .first()
          .getAttribute('href'),
        'https://publisher.example.test/first?quoted="yes"&x=1',
      );
      await page.context().close();
    });
  });
});

async function withExample(
  scenario: string,
  run: (value: {
    base: string;
    logs: () => string;
    open: (
      javaScriptEnabled: boolean,
      requests: string[],
    ) => Promise<import('playwright').Page>;
  }) => Promise<void>,
) {
  const installation = await mkdtemp(
    join(tmpdir(), 'news-scraper-php-browser-'),
  );
  const packageRoot = join(installation, 'ns-integration');
  const privateRoot = join(installation, 'ns-private');
  const state = join(privateRoot, 'state');
  let process: ChildProcess | undefined;
  try {
    await cp(join(root, 'integrations/php'), packageRoot, { recursive: true });
    await mkdir(privateRoot, { recursive: true });
    await runPhp([
      join(root, 'integrations/php/tests/example-state.php'),
      state,
      scenario,
    ]);
    await writeFile(
      join(privateRoot, 'local-read.env'),
      [
        'NEWS_SCRAPER_PROFILE_KEY=weekly-desk',
        `NEWS_SCRAPER_STATE_ROOT=${state}`,
        `NEWS_SCRAPER_SYNC_CADENCE_SECONDS=${
          scenario === 'stale' || scenario === 'cutoff' ? '900' : '3600'
        }`,
        ...(scenario === 'cutoff'
          ? ['NEWS_SCRAPER_MAX_STALE_AGE_SECONDS=900']
          : []),
        '',
      ].join('\n'),
    );
    const port = await freePort();
    const env = processEnvWithoutIntegrationConfiguration();
    const output: string[] = [];
    process = spawn(
      php,
      ['-S', `127.0.0.1:${port}`, '-t', join(packageRoot, 'example')],
      { cwd: packageRoot, env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    process.stdout?.on('data', (value: Buffer) =>
      output.push(value.toString().slice(0, 4096)),
    );
    process.stderr?.on('data', (value: Buffer) =>
      output.push(value.toString().slice(0, 4096)),
    );
    const base = `http://127.0.0.1:${port}`;
    await ready(base, process, output);
    await run({
      base,
      logs: () => output.join('').slice(0, 8192),
      open: async (javaScriptEnabled, requests) => {
        browser ??= await chromium.launch({ headless: true });
        const context = await browser.newContext({ javaScriptEnabled });
        const page = await context.newPage();
        page.on('request', (request) => {
          if (!request.url().startsWith(base)) requests.push(request.url());
        });
        return page;
      },
    });
  } finally {
    process?.kill();
    await new Promise<void>(
      (resolveDone) =>
        process?.once('exit', () => resolveDone()) ?? resolveDone(),
    );
    await rm(installation, { recursive: true, force: true });
  }
}

function processEnvWithoutIntegrationConfiguration() {
  const env = { ...process.env };
  delete env.NEWS_SCRAPER_BASE_URL;
  delete env.NEWS_SCRAPER_BEARER_TOKEN;
  delete env.NEWS_SCRAPER_PROFILE_KEY;
  delete env.NEWS_SCRAPER_STATE_ROOT;
  delete env.NEWS_SCRAPER_SYNC_CADENCE_SECONDS;
  delete env.NEWS_SCRAPER_MAX_STALE_AGE_SECONDS;
  return env;
}
function runPhp(args: string[]) {
  return new Promise<void>((resolveRun, reject) => {
    const child = spawn(php, args, { cwd: root });
    let error = '';
    child.stderr.on(
      'data',
      (value: Buffer) => (error += value.toString().slice(0, 4096)),
    );
    child.on('error', () =>
      reject(new Error('PHP CLI/server prerequisite unavailable.')),
    );
    child.on('exit', (code) =>
      code === 0
        ? resolveRun()
        : reject(new Error(`PHP state setup failed (${code}): ${error}`)),
    );
  });
}
function freePort() {
  return new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) =>
        error
          ? reject(error)
          : typeof address === 'object' && address
            ? resolvePort(address.port)
            : reject(new Error('No loopback port available.')),
      );
    });
  });
}
async function ready(base: string, process: ChildProcess, output: string[]) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    if (process.exitCode !== null)
      throw new Error(`PHP server stopped: ${output.join('').slice(0, 4096)}`);
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {
      // The process can accept connections a moment after it has been spawned.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(
    `PHP server readiness timed out: ${output.join('').slice(0, 4096)}`,
  );
}
