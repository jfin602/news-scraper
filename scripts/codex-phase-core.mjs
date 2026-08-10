export const MODEL_CONFIGS = Object.freeze({
  'Terra High': Object.freeze({ model: 'gpt-5.6-terra', reasoning: 'high' }),
  'Terra Ultra': Object.freeze({ model: 'gpt-5.6-terra', reasoning: 'ultra' }),
  'Sol Light': Object.freeze({ model: 'gpt-5.6-sol', reasoning: 'low' }),
  'Sol High': Object.freeze({ model: 'gpt-5.6-sol', reasoning: 'high' }),
  'Sol Ultra': Object.freeze({ model: 'gpt-5.6-sol', reasoning: 'ultra' }),
});

const VALID_CONCRETE_CONFIGS = Object.freeze({
  'gpt-5.6-terra': Object.freeze(new Set(['high', 'ultra'])),
  'gpt-5.6-sol': Object.freeze(new Set(['low', 'high', 'ultra'])),
});

export function resolveModelConfig(recommendation) {
  const config = MODEL_CONFIGS[recommendation];
  const validEfforts = config && VALID_CONCRETE_CONFIGS[config.model];
  if (!config || !validEfforts?.has(config.reasoning)) {
    throw new Error(`Unknown recommended configuration: ${recommendation}`);
  }
  return config;
}

function oneMatch(text, expression, label) {
  const matches = [...text.matchAll(expression)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label}; found ${matches.length}.`);
  }
  return matches[0][1].trim();
}

export function parsePrompt(filename, text) {
  const fileMatch = /^P(\d+)-.+\.txt$/i.exec(filename);
  if (!fileMatch || Number(fileMatch[1]) < 1) {
    throw new Error(
      `Prompt filename is not one-based P<number>-*.txt: ${filename}`,
    );
  }
  const number = Number(fileMatch[1]);
  const task = oneMatch(text, /^TASK:\s*(.+)$/gim, 'TASK title');
  const recommendation = oneMatch(
    text,
    /^\s*-\s*Recommended configuration:\s*`([^`]+)`\.?\s*$/gim,
    'recommended configuration',
  );
  const config = resolveModelConfig(recommendation);
  const targetVersion = oneMatch(
    text,
    /assigned project version is\s*`(\d+\.\d+\.\d+)`/gi,
    'assigned project version',
  );

  const filenameSignal = /closeout/i.test(filename);
  const titleSignal = /closeout/i.test(task);
  const contentSignal =
    /^\s*(?:GOAL|PHASE CLOSEOUT|CLOSEOUT)\s*$[\s\S]{0,500}\bcloseout\b/im.test(
      text,
    );
  const signals = [filenameSignal, titleSignal, contentSignal].filter(
    Boolean,
  ).length;
  if (signals > 0 && signals < 2) {
    throw new Error(`Ambiguous closeout classification for ${filename}.`);
  }

  return Object.freeze({
    number,
    filename,
    task,
    title: task.replace(/^Phase\s+\d+\s*\/\s*P\d+\s*[—-]\s*/i, ''),
    recommendation,
    ...config,
    targetVersion,
    kind: signals >= 2 ? 'closeout' : 'implementation',
    text,
  });
}

export function buildPlan(entries, folderName) {
  if (!/^p[1-9]\d*$/i.test(folderName)) {
    throw new Error('Task folder must have the form p<number>.');
  }
  if (entries.length === 0) throw new Error('No prompt files were found.');
  const prompts = entries.map(({ filename, text }) =>
    parsePrompt(filename, text),
  );
  prompts.sort((left, right) => left.number - right.number);
  for (let index = 0; index < prompts.length; index += 1) {
    const prompt = prompts[index];
    if (index && prompt.number === prompts[index - 1].number) {
      throw new Error(`Duplicate prompt number P${prompt.number}.`);
    }
    if (prompt.number !== index + 1) {
      throw new Error(
        `Prompt numbering must be contiguous from P1; expected P${index + 1}.`,
      );
    }
  }
  const closeouts = prompts.filter((prompt) => prompt.kind === 'closeout');
  if (closeouts.length !== 1 || prompts.at(-1).kind !== 'closeout') {
    throw new Error(
      'Exactly one unambiguous final closeout prompt is required.',
    );
  }
  const phase = Number(folderName.slice(1));
  for (const prompt of prompts) {
    const expected = `0.${phase}.${prompt.number}`;
    if (prompt.targetVersion !== expected) {
      throw new Error(
        `P${prompt.number} target ${prompt.targetVersion} does not match ${expected}.`,
      );
    }
  }
  const immutablePrompts = Object.freeze(prompts);
  return Object.freeze({
    phase,
    folderName,
    prompts: immutablePrompts,
    implementations: Object.freeze(immutablePrompts.slice(0, -1)),
    closeout: immutablePrompts.at(-1),
  });
}

export function assertVersionCompatible(actual, prompt, previousVersion) {
  if (actual !== previousVersion && actual !== prompt.targetVersion) {
    throw new Error(
      `P${prompt.number} expected package version ${previousVersion} (or ${prompt.targetVersion} for a rerun); found ${actual}.`,
    );
  }
}

export function assertPostPrompt({
  exitCode,
  version,
  prompt,
  packageLockExists,
  coherent = true,
}) {
  if (exitCode !== 0) throw new Error(`Codex exited with status ${exitCode}.`);
  if (version !== prompt.targetVersion) {
    throw new Error(
      `Expected package version ${prompt.targetVersion}; found ${version}.`,
    );
  }
  if (packageLockExists) throw new Error('package-lock.json was created.');
  if (!coherent)
    throw new Error('Repository state is not coherent enough to continue.');
}

export function interpretEvent(event, verbose = false) {
  const item = event.item ?? event;
  const type = item.type ?? event.type ?? '';
  if (type === 'command_execution') {
    const command = item.command ?? item.cmd ?? 'command';
    const lifecycle = event.type ?? item.status ?? '';
    const completed =
      lifecycle === 'item.completed' || item.status === 'completed';
    return {
      visible: true,
      activity: `${completed ? '[+]' : '[>]'} ${completed ? 'Ran' : 'Running'}: ${command}`,
      command: {
        id: item.id,
        text: command,
        lifecycle,
        started: lifecycle === 'item.started' || item.status === 'in_progress',
        completed,
      },
    };
  }
  if (type === 'file_change') {
    const changes = item.changes ?? [item];
    const names = changes
      .map((change) => change.path ?? change.file_path)
      .filter(Boolean);
    return {
      visible: true,
      activity: names.map((name) => `[+] Modified ${name}`).join(' | '),
      files: names,
    };
  }
  if (type === 'agent_message') {
    const message = item.text ?? item.message ?? '';
    return { visible: Boolean(message) && verbose, activity: message };
  }
  if (type === 'turn.completed')
    return {
      visible: true,
      activity: '[.] Codex turn completed',
      usage: event.usage,
    };
  if (type.includes('error') || event.error)
    return {
      visible: true,
      activity: `[X] ${event.message ?? event.error?.message ?? 'Codex error'}`,
    };
  return {
    visible: verbose && Boolean(type),
    activity: type ? `[.] ${type}` : '',
  };
}

export function createEventTracker() {
  return {
    commands: 0,
    commandIds: new Set(),
    anonymousCommands: new Map(),
    activeCommands: new Map(),
    files: new Set(),
  };
}

export function applyEventObservation(tracker, observation, now = Date.now()) {
  for (const file of observation.files ?? []) tracker.files.add(file);
  const command = observation.command;
  if (!command) return;

  if (command.id) {
    if (!tracker.commandIds.has(command.id)) {
      tracker.commandIds.add(command.id);
      tracker.commands += 1;
    }
    if (command.started) {
      tracker.activeCommands.set(command.id, {
        text: command.text,
        startedAt: now,
      });
    }
    if (command.completed) tracker.activeCommands.delete(command.id);
    return;
  }

  const anonymousKey = String(command.text);
  if (command.started) {
    if (!tracker.anonymousCommands.has(anonymousKey)) tracker.commands += 1;
    tracker.anonymousCommands.set(anonymousKey, now);
    tracker.activeCommands.set(anonymousKey, {
      text: command.text,
      startedAt: now,
    });
  } else if (command.completed) {
    if (!tracker.anonymousCommands.has(anonymousKey)) tracker.commands += 1;
    tracker.anonymousCommands.delete(anonymousKey);
    tracker.activeCommands.delete(anonymousKey);
  }
}

export function createStructuredEventProcessor({ appendLine, onEvent }) {
  let buffer = '';
  let queue = Promise.resolve();
  let parseFailure;

  const enqueue = (line) => {
    if (!line.trim()) return;
    queue = queue.then(async () => {
      await appendLine(`${line}\n`);
      let event;
      try {
        event = JSON.parse(line);
      } catch (error) {
        parseFailure ??= new Error(
          `Unusable structured Codex output: ${error.message}`,
        );
        return;
      }
      await onEvent(event);
    });
  };

  return Object.freeze({
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) enqueue(line);
    },
    async finish() {
      if (buffer) enqueue(buffer);
      buffer = '';
      await queue;
      if (parseFailure) throw parseFailure;
    },
  });
}

export function printableAscii(value) {
  const replacements = new Map([
    ['—', '-'],
    ['–', '-'],
    ['‘', "'"],
    ['’', "'"],
    ['“', '"'],
    ['”', '"'],
    ['…', '...'],
    ['→', '->'],
  ]);
  return [...String(value)]
    .map((character) => {
      const replacement = replacements.get(character);
      if (replacement !== undefined) return replacement;
      const code = character.charCodeAt(0);
      return code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 && code <= 126)
        ? character
        : '?';
    })
    .join('');
}

export function formatElapsed(durationMs) {
  const seconds = Math.floor(Math.max(0, durationMs) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatUsage(usage) {
  if (!usage) return [];
  const fields = [
    ['Input', usage.input_tokens],
    ['Cached', usage.cached_input_tokens],
    ['Output', usage.output_tokens],
    ['Reasoning', usage.reasoning_output_tokens],
  ].filter(([, value]) => Number.isFinite(value));
  if (fields.length === 0) return [];
  return [
    'Usage:',
    ...fields.map(
      ([label, value]) =>
        `  ${String(label).padEnd(10)} ${String(value).padStart(8)}`,
    ),
  ];
}

function stateLabel(prompt, state) {
  if (prompt.kind === 'closeout') return '[M] MANUAL / CLOSEOUT';
  if (state?.status === 'passed') return '[+] PASSED';
  if (state?.status === 'running') return '[>] RUNNING';
  if (state?.status === 'failed') return '[X] FAILED';
  if (state?.status === 'interrupted') return '[X] INTERRUPTED';
  return '[ ] WAITING';
}

export function renderDashboard({
  plan,
  states,
  current,
  activity,
  tracker,
  startedAt,
  now = Date.now(),
}) {
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
    const state = states.get(prompt.number);
    const duration =
      state?.status === 'passed' && Number.isFinite(state.durationMs)
        ? `  ${formatElapsed(state.durationMs)}`
        : '';
    lines.push(
      `  ${stateLabel(prompt, state)} P${prompt.number}  ${prompt.title}  ${prompt.recommendation}  ${prompt.kind === 'closeout' ? 'MANUAL' : prompt.targetVersion}${duration}`,
    );
    if (state?.status === 'passed') {
      const usageLines = formatUsage(state.usage);
      if (usageLines.length > 0)
        lines.push(...usageLines.map((line) => `    ${line}`));
    }
  }
  const complete = [...states.values()].filter(
    (state) => state.status === 'passed',
  ).length;
  lines.push(
    '',
    `Overall: ${complete} / ${plan.implementations.length} implementation prompts complete`,
  );
  if (current) {
    const activeCommand = [...tracker.activeCommands.values()].at(-1);
    lines.push(
      '',
      '-'.repeat(60),
      `CURRENT - P${current.number} / ${plan.implementations.length}`,
      current.title,
      '',
      `Model:         ${current.recommendation.split(' ')[0]}`,
      `Reasoning:     ${current.recommendation.split(' ')[1]}`,
      `Target:        ${current.targetVersion}`,
      `Elapsed:       ${formatElapsed(now - startedAt)}`,
      '',
      'Activity:',
      `  ${activeCommand ? `[>] Running: ${activeCommand.text}` : activity || '[.] Waiting for Codex response'}`,
    );
    if (activeCommand)
      lines.push(`    elapsed ${formatElapsed(now - activeCommand.startedAt)}`);
    lines.push(
      '',
      `Files changed: ${tracker.files.size}`,
      `Commands run:  ${tracker.commands}`,
    );
  }
  lines.push('-'.repeat(60));
  return `${printableAscii(lines.join('\n'))}\n`;
}

export function terminalDashboardOutput(output, interactive) {
  return interactive ? `\x1b[2J\x1b[H${output}` : output;
}

export function startElapsedRedraw(
  redraw,
  {
    intervalMs = 1000,
    setIntervalFunction = globalThis.setInterval,
    clearIntervalFunction = globalThis.clearInterval,
  } = {},
) {
  const timer = setIntervalFunction(redraw, intervalMs);
  return () => clearIntervalFunction(timer);
}

export function renderFailureSummary({ plan, states, failedPrompt, reason }) {
  const lines = ['', '='.repeat(60), 'PHASE RUN STOPPED', '='.repeat(60), ''];
  if (failedPrompt)
    lines.push(`[X] P${failedPrompt.number} - ${failedPrompt.title}`, '');
  lines.push('Reason:', `  ${reason}`, '', 'Completed:');
  const completed = plan?.implementations.filter(
    (prompt) => states.get(prompt.number)?.status === 'passed',
  );
  if (completed?.length)
    lines.push(...completed.map((prompt) => `  [+] P${prompt.number}`));
  else lines.push('  (none)');
  lines.push('', 'Not executed:');
  const notExecuted = plan?.implementations.filter(
    (prompt) =>
      prompt.number !== failedPrompt?.number &&
      !['passed', 'running', 'failed', 'interrupted'].includes(
        states.get(prompt.number)?.status,
      ),
  );
  if (notExecuted?.length)
    lines.push(...notExecuted.map((prompt) => `  [ ] P${prompt.number}`));
  else lines.push('  (none)');
  lines.push('', 'Closeout:');
  if (plan?.closeout)
    lines.push(
      `  [M] P${plan.closeout.number} - ${plan.closeout.title} - NOT EXECUTED`,
    );
  else lines.push('  [M] NOT EXECUTED');
  lines.push('', 'No later Codex prompts were started.');
  return `${printableAscii(lines.join('\n'))}\n`;
}

export function renderSuccessHandoff(plan, runDirectory) {
  return printableAscii(
    `\n${'='.repeat(60)}\nPHASE ${plan.phase} IMPLEMENTATION PROMPTS COMPLETE\n${'='.repeat(60)}\n\nAutomation stopped by design.\n[M] P${plan.closeout.number} - ${plan.closeout.title}\n    Recommended: ${plan.closeout.recommendation}\n    Target:      ${plan.closeout.targetVersion}\n    Execution:   MANUAL\n\nRun the closeout prompt manually when ready.\nLogs: ${runDirectory}\n`,
  );
}

export function hasCursorControls(text) {
  return new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`).test(text);
}

export function isAscii(text) {
  return [...text].every((character) => character.charCodeAt(0) <= 127);
}
