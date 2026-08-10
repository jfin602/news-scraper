import path from 'node:path';

export const MODEL_CONFIGS = Object.freeze({
  'Terra High': Object.freeze({ model: 'gpt-5.6-terra', reasoning: 'high' }),
  'Terra Ultra': Object.freeze({ model: 'gpt-5.6-terra', reasoning: 'ultra' }),
  'Sol Light': Object.freeze({ model: 'gpt-5.6-sol', reasoning: 'low' }),
  'Sol High': Object.freeze({ model: 'gpt-5.6-sol', reasoning: 'high' }),
  'Sol Ultra': Object.freeze({ model: 'gpt-5.6-sol', reasoning: 'ultra' }),
});

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
  const config = MODEL_CONFIGS[recommendation];
  if (!config)
    throw new Error(`Unknown recommended configuration: ${recommendation}`);
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
  return Object.freeze({
    phase,
    folderName,
    prompts,
    implementations: prompts.slice(0, -1),
    closeout: prompts.at(-1),
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
    return {
      visible: true,
      activity: `${item.status === 'completed' ? '[+]' : '[>]'} Running: ${command}`,
      command: true,
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

export function hasCursorControls(text) {
  return new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`).test(text);
}

export function isAscii(text) {
  return [...text].every((character) => character.charCodeAt(0) <= 127);
}

export function promptPath(taskDirectory, prompt) {
  return path.join(taskDirectory, prompt.filename);
}
