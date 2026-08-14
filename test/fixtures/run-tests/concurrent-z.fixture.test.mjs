import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

test('concurrent fixture z', async () => {
  await meetAtBarrier('z', 'a');
});

async function meetAtBarrier(self, peer) {
  const directory = process.env.RUN_TESTS_BARRIER_DIRECTORY;
  if (!directory) throw new Error('RUN_TESTS_BARRIER_DIRECTORY is required');
  await writeFile(join(directory, `${self}.ready`), 'ready');
  await waitForFile(join(directory, `${peer}.ready`));
  console.log(`concurrent fixture ${self} observed both`);
}

async function waitForFile(path) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await delay(20);
    }
  }
  throw new Error('Concurrent fixture peer did not reach the barrier.');
}
