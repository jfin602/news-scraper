import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
// @ts-expect-error The runner intentionally ships as native ESM JavaScript.
import * as core from '../../scripts/codex-phase-core.mjs';
// @ts-expect-error The runner intentionally ships as native ESM JavaScript.
import * as cli from '../../scripts/codex-phase.mjs';

const {
  MODEL_CONFIGS,
  applyEventObservation,
  assertPostPrompt,
  assertVersionCompatible,
  buildPlan,
  createEventTracker,
  createStructuredEventProcessor,
  formatUsage,
  hasCursorControls,
  interpretEvent,
  isAscii,
  parsePrompt,
  printableAscii,
  renderDashboard,
  renderFailureSummary,
  renderSuccessHandoff,
  resolveModelConfig,
  startElapsedRedraw,
  terminalDashboardOutput,
} = core;
const { buildCodexArguments, runCodex } = cli;

interface PromptOptions {
  closeout?: boolean;
  config?: string;
  title?: string;
  version?: string;
}

const prompt = (
  number: number,
  {
    config = 'Terra High',
    version = `0.8.${number}`,
    closeout = false,
    title = closeout ? 'Phase 8 closeout validation' : `Task ${number}`,
  }: PromptOptions = {},
) => ({
  filename: `P${number}-${closeout ? 'phase-8-closeout' : `task-${number}`}.txt`,
  text: `TASK: Phase 8 / P${number} — ${title}\n\nMODEL / REASONING / USAGE\n- Recommended configuration: \`${config}\`.\n\nVERSIONING\n- This prompt's assigned project version is \`${version}\`.\n\nGOAL\n${closeout ? 'Perform Phase 8 closeout.' : 'Implement the task.'}\n`,
});

test('resolves every repository recommendation to its verified concrete CLI configuration', () => {
  const expected: Record<string, { model: string; reasoning: string }> = {
    'Terra High': { model: 'gpt-5.6-terra', reasoning: 'high' },
    'Terra Ultra': { model: 'gpt-5.6-terra', reasoning: 'ultra' },
    'Sol Light': { model: 'gpt-5.6-sol', reasoning: 'low' },
    'Sol High': { model: 'gpt-5.6-sol', reasoning: 'high' },
    'Sol Ultra': { model: 'gpt-5.6-sol', reasoning: 'ultra' },
  };

  assert.deepEqual(Object.keys(MODEL_CONFIGS), Object.keys(expected));
  for (const [label, config] of Object.entries(expected)) {
    assert.deepEqual(resolveModelConfig(label), config);
    assert.deepEqual(MODEL_CONFIGS[label], config);
  }
});

test('unknown recommendations still fail closed', () => {
  assert.throws(() => resolveModelConfig('Terra Max'), /Unknown/);
  assert.throws(
    () => parsePrompt('P1-task.txt', prompt(1, { config: 'Terra Max' }).text),
    /Unknown/,
  );
});

test('orders prompt numbers numerically and excludes closeout from execution', () => {
  const plan = buildPlan(
    [
      prompt(10, { closeout: true }),
      ...Array.from({ length: 9 }, (_, index) => prompt(index + 1)),
    ].reverse(),
    'p8',
  );
  assert.equal(plan.prompts[1].number, 2);
  assert.equal(plan.prompts.at(-1).number, 10);
  assert.equal(plan.implementations.length, 9);
  assert.equal(plan.closeout.kind, 'closeout');
  assert.equal(Object.isFrozen(plan.prompts), true);
  assert.equal(Object.isFrozen(plan.implementations), true);
});

test('rejects duplicate, missing, and malformed prompt numbers', () => {
  assert.throws(
    () =>
      buildPlan(
        [
          prompt(1),
          { ...prompt(1), filename: 'P1-other.txt' },
          prompt(2, { closeout: true }),
        ],
        'p8',
      ),
    /Duplicate/,
  );
  assert.throws(
    () => buildPlan([prompt(1), prompt(3, { closeout: true })], 'p8'),
    /contiguous/,
  );
  assert.throws(
    () => buildPlan([{ filename: 'task.txt', text: prompt(1).text }], 'p8'),
    /one-based/,
  );
});

test('requires exactly one unambiguous final closeout', () => {
  assert.throws(() => buildPlan([prompt(1), prompt(2)], 'p8'), /Exactly one/);
  assert.throws(
    () =>
      parsePrompt(
        'P1-closeout.txt',
        prompt(1, { title: 'Implementation task' }).text,
      ),
    /Ambiguous/,
  );
  const plan = buildPlan([prompt(1), prompt(2, { closeout: true })], 'p8');
  assert.equal(plan.implementations.length, 1);
  assert.equal(plan.closeout.number, 2);
});

test('version and package-lock invariants fail closed', () => {
  const parsed = parsePrompt(prompt(1).filename, prompt(1).text);
  assert.throws(
    () => assertVersionCompatible('0.8.9', parsed, '0.8.0'),
    /expected package version/i,
  );
  assert.throws(
    () =>
      assertPostPrompt({
        exitCode: 0,
        version: '0.8.1',
        prompt: parsed,
        packageLockExists: true,
      }),
    /package-lock/,
  );
  assert.throws(
    () =>
      assertPostPrompt({
        exitCode: 0,
        version: '0.8.0',
        prompt: parsed,
        packageLockExists: false,
      }),
    /Expected package version/,
  );
});

test('structured event lines are appended and observed in arrival order', async () => {
  const appended: string[] = [];
  const observed: number[] = [];
  let releaseFirst: (() => void) | undefined;
  const firstAppendBlocked = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const processor = createStructuredEventProcessor({
    appendLine: async (line: string) => {
      if (line.includes('"sequence":1')) await firstAppendBlocked;
      appended.push(line.trim());
    },
    onEvent: async (event: { sequence: number }) => {
      observed.push(event.sequence);
    },
  });

  processor.push('{"sequence":1}\n{"sequence":2}\n');
  const finished = processor.finish();
  await Promise.resolve();
  assert.deepEqual(appended, []);
  releaseFirst?.();
  await finished;
  assert.deepEqual(appended, ['{"sequence":1}', '{"sequence":2}']);
  assert.deepEqual(observed, [1, 2]);
});

test('event processing fully settles before completion', async () => {
  let settled = false;
  let releaseEvent: (() => void) | undefined;
  const eventBlocked = new Promise<void>((resolve) => {
    releaseEvent = resolve;
  });
  const processor = createStructuredEventProcessor({
    appendLine: async () => undefined,
    onEvent: async () => {
      await eventBlocked;
      settled = true;
    },
  });
  processor.push('{"type":"turn.completed"}\n');
  let finishReturned = false;
  const finishing = processor.finish().then(() => {
    finishReturned = true;
  });
  await Promise.resolve();
  assert.equal(finishReturned, false);
  releaseEvent?.();
  await finishing;
  assert.equal(settled, true);
  assert.equal(finishReturned, true);
});

test('a malformed final partial JSONL event fails before completion', async () => {
  const processor = createStructuredEventProcessor({
    appendLine: async () => undefined,
    onEvent: async () => undefined,
  });
  processor.push('{"type":"turn.completed"}\n{"malformed"');
  await assert.rejects(processor.finish(), /Unusable structured Codex output/);
});

test('runCodex sends the preflight snapshot and uses native final-response capture', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'news-scraper-runner-test-'),
  );
  try {
    const taskFile = path.join(temporaryDirectory, 'P1-task.txt');
    const originalText = 'captured preflight prompt';
    await writeFile(taskFile, originalText);
    const parsedPrompt = {
      number: 1,
      model: 'gpt-5.6-terra',
      reasoning: 'high',
      text: await readFile(taskFile, 'utf8'),
    };
    await writeFile(taskFile, 'mutated after preflight');

    let stdinText = '';
    let invocationArguments: string[] = [];
    const spawnProcess = (_command: string, childArguments: string[]) => {
      invocationArguments = childArguments;
      const child = new EventEmitter() as EventEmitter & {
        stdin: { end(value: string): void };
        stdout: PassThrough;
        stderr: PassThrough;
      };
      child.stdin = {
        end(value: string) {
          stdinText = value;
        },
      };
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      queueMicrotask(() => {
        void (async () => {
          const outputIndex = childArguments.indexOf('--output-last-message');
          await writeFile(childArguments[outputIndex + 1]!, 'native final');
          child.stdout.write(
            '{"type":"turn.completed","usage":{"input_tokens":3}}\n',
          );
          child.emit('close', 0, null);
        })();
      });
      return child;
    };

    const seen: unknown[] = [];
    const result = await runCodex(
      parsedPrompt,
      temporaryDirectory,
      async (event: unknown) => {
        seen.push(event);
      },
      { rootDirectory: temporaryDirectory, spawnProcess },
    );

    assert.equal(stdinText, originalText);
    assert.notEqual(stdinText, await readFile(taskFile, 'utf8'));
    assert.equal(result.finalResponse, 'native final');
    assert.equal(seen.length, 1);
    const outputIndex = invocationArguments.indexOf('--output-last-message');
    assert.notEqual(outputIndex, -1);
    assert.equal(invocationArguments.includes('--json'), true);
    assert.equal(
      await readFile(path.join(temporaryDirectory, 'P1.events.jsonl'), 'utf8'),
      '{"type":"turn.completed","usage":{"input_tokens":3}}\n',
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('runCodex rejects malformed output emitted immediately before child close', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'news-scraper-runner-test-'),
  );
  try {
    const parsedPrompt = {
      number: 1,
      model: 'gpt-5.6-sol',
      reasoning: 'high',
      text: 'safe test prompt',
    };
    const spawnProcess = (_command: string, childArguments: string[]) => {
      const child = new EventEmitter() as EventEmitter & {
        stdin: { end(): void };
        stdout: PassThrough;
        stderr: PassThrough;
      };
      child.stdin = { end() {} };
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      queueMicrotask(() => {
        void (async () => {
          const outputIndex = childArguments.indexOf('--output-last-message');
          await writeFile(childArguments[outputIndex + 1]!, 'unused final');
          child.stdout.write('{"malformed"');
          child.emit('close', 0, null);
        })();
      });
      return child;
    };

    await assert.rejects(
      runCodex(parsedPrompt, temporaryDirectory, async () => undefined, {
        rootDirectory: temporaryDirectory,
        spawnProcess,
      }),
      /Unusable structured Codex output/,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('Codex arguments retain JSON events, exact model effort, and native final output', () => {
  const parsed = parsePrompt(
    prompt(1, { config: 'Sol Ultra' }).filename,
    prompt(1, { config: 'Sol Ultra' }).text,
  );
  const arguments_ = buildCodexArguments(
    parsed,
    'C:\\repo',
    'C:\\run\\final.txt',
  );
  assert.deepEqual(arguments_.slice(0, 6), [
    'exec',
    '--json',
    '--model',
    'gpt-5.6-sol',
    '-c',
    'model_reasoning_effort="ultra"',
  ]);
  assert.deepEqual(arguments_.slice(6, 8), [
    '--output-last-message',
    'C:\\run\\final.txt',
  ]);
});

test('command lifecycle counts one logical command and tracks active elapsed time', () => {
  const tracker = createEventTracker();
  const started = interpretEvent({
    type: 'item.started',
    item: {
      id: 'cmd-1',
      type: 'command_execution',
      command: 'npm run test:integration',
      status: 'in_progress',
    },
  });
  applyEventObservation(tracker, started, 1_000);
  assert.equal(tracker.commands, 1);
  assert.equal(tracker.activeCommands.get('cmd-1').startedAt, 1_000);

  const plan = buildPlan([prompt(1), prompt(2, { closeout: true })], 'p8');
  const states = new Map([[1, { status: 'running' }]]);
  const output = renderDashboard({
    plan,
    states,
    current: plan.implementations[0],
    activity: '',
    tracker,
    startedAt: 1_000,
    now: 39_000,
  });
  assert.match(output, /Running: npm run test:integration/);
  assert.match(output, /elapsed 00:38/);

  const completed = interpretEvent({
    type: 'item.completed',
    item: {
      id: 'cmd-1',
      type: 'command_execution',
      command: 'npm run test:integration',
      status: 'completed',
    },
  });
  applyEventObservation(tracker, completed, 40_000);
  assert.equal(tracker.commands, 1);
  assert.equal(tracker.activeCommands.size, 0);
});

test('completed prompt durations and observed usage remain rendered', () => {
  const plan = buildPlan([prompt(1), prompt(2, { closeout: true })], 'p8');
  const states = new Map([
    [
      1,
      {
        status: 'passed',
        durationMs: 402_000,
        usage: {
          input_tokens: 182_440,
          cached_input_tokens: 151_392,
          output_tokens: 8_714,
          reasoning_output_tokens: 5_821,
        },
      },
    ],
  ]);
  const output = renderDashboard({
    plan,
    states,
    current: undefined,
    activity: '',
    tracker: createEventTracker(),
    startedAt: 0,
    now: 0,
  });
  assert.match(output, /P1.+06:42/);
  assert.match(output, /Usage:/);
  assert.match(output, /Input\s+182440/);
  assert.match(output, /Cached\s+151392/);
  assert.match(output, /Output\s+8714/);
  assert.match(output, /Reasoning\s+5821/);
});

test('missing usage metadata is tolerated and omitted', () => {
  assert.deepEqual(formatUsage(undefined), []);
  assert.deepEqual(formatUsage({}), []);
  assert.deepEqual(formatUsage({ output_tokens: 9 }), [
    'Usage:',
    '  Output            9',
  ]);
});

test('elapsed redraw timer ticks and cleans up through injected timing functions', () => {
  let callback: (() => void) | undefined;
  let interval = 0;
  let cleared: unknown;
  let redraws = 0;
  const stop = startElapsedRedraw(
    () => {
      redraws += 1;
    },
    {
      setIntervalFunction: (next: () => void, milliseconds: number) => {
        callback = next;
        interval = milliseconds;
        return 'timer-id';
      },
      clearIntervalFunction: (timer: unknown) => {
        cleared = timer;
      },
    },
  );
  assert.equal(interval, 1_000);
  callback?.();
  callback?.();
  assert.equal(redraws, 2);
  stop();
  assert.equal(cleared, 'timer-id');
});

test('failure summary names failed, completed, not executed, and manual closeout prompts', () => {
  const plan = buildPlan(
    [prompt(1), prompt(2), prompt(3), prompt(4, { closeout: true })],
    'p8',
  );
  const states = new Map([
    [1, { status: 'passed', durationMs: 10 }],
    [2, { status: 'failed' }],
  ]);
  const output = renderFailureSummary({
    plan,
    states,
    failedPrompt: plan.prompts[1],
    reason: 'Expected package version: 0.8.2 — actual 0.8.1',
  });
  assert.match(output, /\[X\] P2 - Task 2/);
  assert.match(output, /Completed:\n\s{2}\[\+\] P1/);
  assert.match(output, /Not executed:\n\s{2}\[ \] P3/);
  assert.match(output, /\[M\] P4 - Phase 8 closeout validation - NOT EXECUTED/);
  assert.match(output, /No later Codex prompts were started/);
  assert.equal(isAscii(output), true);
});

test('runner-owned metadata, activity, errors, and paths are ASCII-safe', () => {
  const plan = buildPlan(
    [
      prompt(1, { title: 'Pagination — café “résumé”' }),
      prompt(2, { closeout: true, title: 'Clôseout…' }),
    ],
    'p8',
  );
  const output = renderDashboard({
    plan,
    states: new Map([[1, { status: 'running' }]]),
    current: plan.implementations[0],
    activity: '[>] Télémetry → running',
    tracker: createEventTracker(),
    startedAt: 0,
    now: 1_000,
  });
  const success = renderSuccessHandoff(plan, '.codex-runs/été');
  const failure = renderFailureSummary({
    plan,
    states: new Map(),
    failedPrompt: plan.implementations[0],
    reason: 'Échec — malformed…',
  });
  assert.equal(isAscii(output), true);
  assert.equal(isAscii(success), true);
  assert.equal(isAscii(failure), true);
  assert.equal(isAscii(printableAscii('“quoted” — café → done…')), true);
});

test('non-TTY dashboard output contains no cursor controls', () => {
  const output = terminalDashboardOutput('ASCII dashboard\n', false);
  assert.equal(hasCursorControls(output), false);
  assert.equal(output, 'ASCII dashboard\n');
  assert.equal(hasCursorControls(terminalDashboardOutput(output, true)), true);
});

test('successful handoff preserves exit-success manual-closeout semantics', () => {
  const plan = buildPlan([prompt(1), prompt(2, { closeout: true })], 'p8');
  const output = renderSuccessHandoff(plan, '.codex-runs/p8/test');
  assert.match(output, /IMPLEMENTATION PROMPTS COMPLETE/);
  assert.match(output, /Execution:\s+MANUAL/);
  assert.match(output, /Automation stopped by design/);
  assert.doesNotMatch(output, /executing closeout/i);
});
