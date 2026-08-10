#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import {
  access,
  appendFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  applyEventObservation,
  assertPostPrompt,
  assertVersionCompatible,
  buildPlan,
  createEventTracker,
  createStructuredEventProcessor,
  interpretEvent,
  printableAscii,
  renderDashboard,
  renderFailureSummary,
  renderSuccessHandoff,
  startElapsedRedraw,
  terminalDashboardOutput,
} from './codex-phase-core.mjs';

const root = process.cwd();
let activeChild;
let interrupted = false;
let activeRun;
let saveActiveRun;
let activePlan;
let activeStates = new Map();
let activePrompt;
let stopActiveRedraw;

const exists = async (file) =>
  access(file).then(
    () => true,
    () => false,
  );
const packageVersion = async () =>
  JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const git = (...gitArgs) =>
  spawnSync('git', gitArgs, { cwd: root, encoding: 'utf8' });
const withoutPromptText = (prompt) => {
  const copy = { ...prompt };
  delete copy.text;
  return copy;
};

function writeDashboard(options, verbose) {
  const output = renderDashboard(options);
  process.stdout.write(
    terminalDashboardOutput(output, Boolean(process.stdout.isTTY && !verbose)),
  );
}

export function buildCodexArguments(prompt, rootDirectory, finalFile) {
  return [
    'exec',
    '--json',
    '--model',
    prompt.model,
    '-c',
    `model_reasoning_effort="${prompt.reasoning}"`,
    '--output-last-message',
    finalFile,
    '-C',
    rootDirectory,
    '-',
  ];
}

export async function runCodex(
  prompt,
  runDirectory,
  onEvent,
  { rootDirectory = root, spawnProcess = spawn, verbose = false } = {},
) {
  const eventsFile = path.join(runDirectory, `P${prompt.number}.events.jsonl`);
  const finalFile = path.join(runDirectory, `P${prompt.number}.final.txt`);
  await Promise.all([writeFile(eventsFile, ''), writeFile(finalFile, '')]);
  const childArgs = buildCodexArguments(prompt, rootDirectory, finalFile);
  const child = spawnProcess('codex', childArgs, {
    cwd: rootDirectory,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });
  activeChild = child;

  const processor = createStructuredEventProcessor({
    appendLine: (line) => appendFile(eventsFile, line),
    onEvent,
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => processor.push(chunk));
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    if (verbose) process.stderr.write(chunk);
  });

  child.stdin.end(prompt.text);
  let processFailure;
  const result = await new Promise((resolve) => {
    child.once('error', (error) => {
      processFailure = error;
    });
    child.once('close', (code, signal) => resolve({ code, signal }));
  });

  let eventFailure;
  try {
    await processor.finish();
  } catch (error) {
    eventFailure = error;
  } finally {
    activeChild = undefined;
  }
  if (eventFailure) throw eventFailure;
  if (processFailure) throw processFailure;

  const finalResponse = await readFile(finalFile, 'utf8');
  return { ...result, finalResponse, stderr, childArgs };
}

export async function runCli(argv = process.argv.slice(2)) {
  const verbose = argv.includes('--verbose');
  const positional = argv.filter((argument) => argument !== '--verbose');
  if (
    positional.length !== 1 ||
    argv.some(
      (argument) => argument.startsWith('--') && argument !== '--verbose',
    )
  ) {
    throw new Error('Usage: npm run codex:phase -- <task-folder> [--verbose]');
  }

  const folderName = positional[0];
  const taskDirectory = path.join(root, 'docs', 'tasks', folderName);
  if (!(await exists(taskDirectory)))
    throw new Error(`Task folder does not exist: docs/tasks/${folderName}`);
  const names = await readdir(taskDirectory);
  const textFiles = names.filter((name) => name.toLowerCase().endsWith('.txt'));
  const entries = await Promise.all(
    textFiles.map(async (filename) => ({
      filename,
      text: await readFile(path.join(taskDirectory, filename), 'utf8'),
    })),
  );
  const plan = buildPlan(entries, folderName);
  const states = new Map();
  activePlan = plan;
  activeStates = states;

  if (!(await exists(path.join(root, 'package.json'))))
    throw new Error('package.json does not exist.');
  if (await exists(path.join(root, 'package-lock.json')))
    throw new Error('package-lock.json exists before the run.');
  const initialStatus = git('status', '--porcelain=v1');
  if (initialStatus.status !== 0)
    throw new Error(
      `Unable to inspect repository state: ${initialStatus.stderr.trim()}`,
    );
  if (initialStatus.stdout.trim())
    throw new Error(
      'Repository has uncommitted changes; start from an intentional clean phase baseline.',
    );
  const cli = spawnSync('codex', ['--version'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  if (cli.error || cli.status !== 0)
    throw new Error(
      `Codex CLI cannot be invoked${cli.error ? `: ${cli.error.message}` : '.'}`,
    );

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDirectory = path.join(root, '.codex-runs', folderName, stamp);
  await mkdir(runDirectory, { recursive: true });
  const run = {
    phase: plan.phase,
    taskFolder: folderName,
    startedAt: new Date().toISOString(),
    codexVersion: cli.stdout.trim(),
    status: 'running',
    prompts: plan.prompts.map((prompt) => ({
      ...withoutPromptText(prompt),
      status: prompt.kind === 'closeout' ? 'manual' : 'waiting',
    })),
  };
  const saveRun = () =>
    writeFile(
      path.join(runDirectory, 'run.json'),
      `${JSON.stringify(run, null, 2)}\n`,
    );
  activeRun = run;
  saveActiveRun = saveRun;
  await saveRun();

  let previousVersion = `0.${plan.phase}.0`;
  for (const prompt of plan.implementations) {
    if (interrupted) throw new Error('Phase run was interrupted.');
    activePrompt = prompt;
    assertVersionCompatible(await packageVersion(), prompt, previousVersion);
    const state = { status: 'running' };
    states.set(prompt.number, state);
    const record = run.prompts.find((item) => item.number === prompt.number);
    record.status = 'running';
    record.startedAt = new Date().toISOString();
    const startedAt = Date.now();
    const tracker = createEventTracker();
    let latest = '[.] Waiting for Codex response';
    const redraw = () =>
      writeDashboard(
        {
          plan,
          states,
          current: prompt,
          activity: latest,
          tracker,
          startedAt,
        },
        verbose,
      );
    redraw();
    if (process.stdout.isTTY && !verbose) {
      stopActiveRedraw = startElapsedRedraw(redraw);
    }

    let result;
    try {
      result = await runCodex(
        prompt,
        runDirectory,
        (event) => {
          const observation = interpretEvent(event, verbose);
          applyEventObservation(tracker, observation);
          if (observation.usage) {
            record.usage = observation.usage;
            state.usage = observation.usage;
          }
          if (observation.visible && observation.activity) {
            latest = printableAscii(observation.activity);
            if (verbose) process.stdout.write(`${latest}\n`);
            else redraw();
          }
        },
        { verbose },
      );
    } finally {
      stopActiveRedraw?.();
      stopActiveRedraw = undefined;
    }
    if (interrupted || result.signal)
      throw new Error('Phase run was interrupted.');
    const conflicts = git('diff', '--check');
    assertPostPrompt({
      exitCode: result.code,
      version: await packageVersion(),
      prompt,
      packageLockExists: await exists(path.join(root, 'package-lock.json')),
      coherent: conflicts.status === 0,
    });
    const durationMs = Date.now() - startedAt;
    record.status = 'passed';
    record.endedAt = new Date().toISOString();
    record.durationMs = durationMs;
    states.set(prompt.number, {
      status: 'passed',
      durationMs,
      ...(record.usage ? { usage: record.usage } : {}),
    });
    activePrompt = undefined;
    previousVersion = prompt.targetVersion;
    await saveRun();
  }
  run.status = 'implementation_complete';
  run.endedAt = new Date().toISOString();
  await saveRun();
  activeRun = undefined;
  saveActiveRun = undefined;
  writeDashboard(
    {
      plan,
      states,
      current: undefined,
      activity: '',
      tracker: createEventTracker(),
      startedAt: Date.now(),
    },
    verbose,
  );
  process.stdout.write(
    renderSuccessHandoff(plan, path.relative(root, runDirectory)),
  );
  return 0;
}

async function handleFailure(error) {
  stopActiveRedraw?.();
  stopActiveRedraw = undefined;
  if (activePrompt) {
    activeStates.set(activePrompt.number, {
      status: interrupted ? 'interrupted' : 'failed',
    });
  }
  if (activeRun && saveActiveRun) {
    activeRun.status = interrupted ? 'interrupted' : 'failed';
    activeRun.endedAt = new Date().toISOString();
    activeRun.error = error.message;
    const running = activeRun.prompts.find(
      (prompt) => prompt.status === 'running',
    );
    if (running) {
      running.status = interrupted ? 'interrupted' : 'failed';
      running.endedAt = activeRun.endedAt;
    }
    try {
      await saveActiveRun();
    } catch (logError) {
      process.stderr.write(
        `${printableAscii(`Unable to finalize run log: ${logError.message}`)}\n`,
      );
    }
  }
  process.stderr.write(
    renderFailureSummary({
      plan: activePlan,
      states: activeStates,
      failedPrompt: activePrompt,
      reason: error.message,
    }),
  );
  process.exitCode = 1;
}

function interrupt() {
  interrupted = true;
  stopActiveRedraw?.();
  stopActiveRedraw = undefined;
  if (activeChild) activeChild.kill('SIGINT');
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  process.on('SIGINT', interrupt);
  runCli().catch(handleFailure);
}
