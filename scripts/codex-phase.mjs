#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
  appendFile,
  access,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  assertPostPrompt,
  assertVersionCompatible,
  buildPlan,
  interpretEvent,
  promptPath,
} from './codex-phase-core.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const positional = args.filter((argument) => argument !== '--verbose');
if (
  positional.length !== 1 ||
  args.some((argument) => argument.startsWith('--') && argument !== '--verbose')
) {
  console.error('Usage: npm run codex:phase -- <task-folder> [--verbose]');
  process.exit(2);
}

let activeChild;
let interrupted = false;
let activeRun;
let saveActiveRun;
process.on('SIGINT', () => {
  interrupted = true;
  if (activeChild) activeChild.kill('SIGINT');
});

const exists = async (file) =>
  access(file).then(
    () => true,
    () => false,
  );
const packageVersion = async () =>
  JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const elapsed = (start) => {
  const seconds = Math.floor((Date.now() - start) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
const git = (...gitArgs) =>
  spawnSync('git', gitArgs, { cwd: root, encoding: 'utf8' });
const printableAscii = (value) =>
  [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 && code <= 126)
        ? character
        : '?';
    })
    .join('');
const withoutPromptText = (prompt) => {
  const copy = { ...prompt };
  delete copy.text;
  return copy;
};

function render(plan, states, current, activity, counts, startedAt) {
  const lines = [
    'NEWS SCRAPER - CODEX PHASE RUNNER',
    '-'.repeat(60),
    '',
    `Phase:        ${plan.phase}`,
    `Task folder:  docs/tasks/${plan.folderName}`,
    'Mode:         Implementation prompts only',
    'Closeout:     MANUAL',
    '',
    'Prompts:',
  ];
  for (const prompt of plan.prompts) {
    const state =
      prompt.kind === 'closeout'
        ? '[M] MANUAL / CLOSEOUT'
        : (states.get(prompt.number) ?? '[ ] WAITING');
    lines.push(
      `  ${state} P${prompt.number}  ${prompt.title}  ${prompt.recommendation}  ${prompt.kind === 'closeout' ? 'MANUAL' : prompt.targetVersion}`,
    );
  }
  const complete = [...states.values()].filter(
    (state) => state === '[+] PASSED',
  ).length;
  lines.push(
    '',
    `Overall: ${complete} / ${plan.implementations.length} implementation prompts complete`,
  );
  if (current)
    lines.push(
      '',
      '-'.repeat(60),
      `CURRENT - P${current.number} / ${plan.implementations.length}`,
      current.title,
      '',
      `Model:         ${current.recommendation.split(' ')[0]}`,
      `Reasoning:     ${current.recommendation.split(' ')[1]}`,
      `Target:        ${current.targetVersion}`,
      `Elapsed:       ${elapsed(startedAt)}`,
      '',
      'Activity:',
      `  ${activity || '[.] Waiting for Codex response'}`,
      '',
      `Files changed: ${counts.files.size}`,
      `Commands run:  ${counts.commands}`,
    );
  lines.push('-'.repeat(60));
  const output = `${lines.join('\n')}\n`;
  if (process.stdout.isTTY && !verbose)
    process.stdout.write(`\x1b[2J\x1b[H${output}`);
  else process.stdout.write(output);
}

async function runCodex(prompt, taskDirectory, runDirectory, onEvent) {
  const eventsFile = path.join(runDirectory, `P${prompt.number}.events.jsonl`);
  const finalFile = path.join(runDirectory, `P${prompt.number}.final.txt`);
  await writeFile(eventsFile, '');
  const childArgs = [
    'exec',
    '--json',
    '--model',
    prompt.model,
    '-c',
    `model_reasoning_effort="${prompt.reasoning}"`,
    '-C',
    root,
    '-',
  ];
  const child = spawn('codex', childArgs, {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });
  activeChild = child;
  child.stdin.end(await readFile(promptPath(taskDirectory, prompt), 'utf8'));
  let buffer = '';
  let finalResponse = '';
  let parseFailure;
  const consume = async (line) => {
    if (!line.trim()) return;
    await appendFile(eventsFile, `${line}\n`);
    try {
      const event = JSON.parse(line);
      const item = event.item ?? event;
      if ((item.type ?? event.type) === 'agent_message')
        finalResponse = item.text ?? item.message ?? finalResponse;
      onEvent(event);
    } catch (error) {
      parseFailure = `Unusable structured Codex output: ${error.message}`;
    }
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) void consume(line);
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    if (verbose) process.stderr.write(chunk);
  });
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  if (buffer) await consume(buffer);
  activeChild = undefined;
  await writeFile(finalFile, finalResponse || stderr);
  if (parseFailure) throw new Error(parseFailure);
  return { ...result, finalResponse };
}

async function main() {
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
  const states = new Map();
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
    assertVersionCompatible(await packageVersion(), prompt, previousVersion);
    states.set(prompt.number, '[>] RUNNING');
    const record = run.prompts.find((item) => item.number === prompt.number);
    record.status = 'running';
    record.startedAt = new Date().toISOString();
    const startedAt = Date.now();
    const counts = { commands: 0, files: new Set() };
    let latest = '[.] Waiting for Codex response';
    render(plan, states, prompt, latest, counts, startedAt);
    const result = await runCodex(
      prompt,
      taskDirectory,
      runDirectory,
      (event) => {
        const observation = interpretEvent(event, verbose);
        if (observation.command) counts.commands += 1;
        for (const file of observation.files ?? []) counts.files.add(file);
        if (observation.usage) record.usage = observation.usage;
        if (observation.visible && observation.activity) {
          latest = printableAscii(observation.activity);
          if (verbose) process.stdout.write(`${latest}\n`);
          else render(plan, states, prompt, latest, counts, startedAt);
        }
      },
    );
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
    record.status = 'passed';
    record.endedAt = new Date().toISOString();
    record.durationMs = Date.now() - startedAt;
    states.set(prompt.number, '[+] PASSED');
    previousVersion = prompt.targetVersion;
    await saveRun();
  }
  run.status = 'implementation_complete';
  run.endedAt = new Date().toISOString();
  await saveRun();
  activeRun = undefined;
  saveActiveRun = undefined;
  render(
    plan,
    states,
    undefined,
    '',
    { commands: 0, files: new Set() },
    Date.now(),
  );
  console.log(
    `\n${'='.repeat(60)}\nPHASE ${plan.phase} IMPLEMENTATION PROMPTS COMPLETE\n${'='.repeat(60)}\n\nAutomation stopped by design.\n[M] P${plan.closeout.number} - ${plan.closeout.title}\n    Recommended: ${plan.closeout.recommendation}\n    Target:      ${plan.closeout.targetVersion}\n    Execution:   MANUAL\n\nRun the closeout prompt manually when ready.\nLogs: ${path.relative(root, runDirectory)}`,
  );
}

main().catch(async (error) => {
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
      console.error(`Unable to finalize run log: ${logError.message}`);
    }
  }
  console.error(
    `\n${'='.repeat(60)}\nPHASE RUN STOPPED\n${'='.repeat(60)}\n\n[X] ${error.message}\n\nNo further Codex prompts were started.`,
  );
  process.exitCode = 1;
});
