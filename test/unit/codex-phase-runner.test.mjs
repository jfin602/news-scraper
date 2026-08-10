import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MODEL_CONFIGS,
  assertPostPrompt,
  assertVersionCompatible,
  buildPlan,
  hasCursorControls,
  interpretEvent,
  isAscii,
  parsePrompt,
} from '../../scripts/codex-phase-core.mjs';

const prompt = (
  number,
  { config = 'Terra High', version = `0.8.${number}`, closeout = false } = {},
) => ({
  filename: `P${number}-${closeout ? 'phase-8-closeout' : `task-${number}`}.txt`,
  text: `TASK: Phase 8 / P${number} - ${closeout ? 'Phase 8 closeout validation' : `Task ${number}`}\n\nMODEL / REASONING / USAGE\n- Recommended configuration: \`${config}\`.\n\nVERSIONING\n- This prompt's assigned project version is \`${version}\`.\n\nGOAL\n${closeout ? 'Perform Phase 8 closeout.' : 'Implement the task.'}\n`,
});

test('orders prompt numbers numerically and excludes closeout from executable count', () => {
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

test('parses current metadata and explicit model mapping', () => {
  const parsed = parsePrompt(
    prompt(1, { config: 'Sol High' }).filename,
    prompt(1, { config: 'Sol High' }).text,
  );
  assert.equal(parsed.targetVersion, '0.8.1');
  assert.deepEqual(
    { model: parsed.model, reasoning: parsed.reasoning },
    MODEL_CONFIGS['Sol High'],
  );
});

test('fails closed for missing, ambiguous, or unknown recommendations', () => {
  assert.throws(
    () =>
      parsePrompt(
        'P1-task.txt',
        prompt(1).text.replace(/- Recommended.+\n/, ''),
      ),
    /exactly one/,
  );
  assert.throws(
    () =>
      parsePrompt(
        'P1-task.txt',
        prompt(1).text.replace(
          'VERSIONING',
          '- Recommended configuration: `Sol High`.\nVERSIONING',
        ),
      ),
    /found 2/,
  );
  assert.throws(
    () => parsePrompt('P1-task.txt', prompt(1, { config: 'Terra Max' }).text),
    /Unknown/,
  );
});

test('detects closeout and rejects ambiguous closeout classification', () => {
  assert.equal(
    parsePrompt(
      prompt(1, { closeout: true }).filename,
      prompt(1, { closeout: true }).text,
    ).kind,
    'closeout',
  );
  assert.throws(
    () => parsePrompt('P1-closeout.txt', prompt(1).text),
    /Ambiguous/,
  );
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

test('final closeout handoff is a valid plan and remains manual', () => {
  const plan = buildPlan([prompt(1), prompt(2, { closeout: true })], 'p8');
  assert.equal(plan.closeout.kind, 'closeout');
  assert.equal(plan.implementations.length, 1);
});

test('event filtering is compact by default and expanded in verbose mode', () => {
  const event = {
    item: { type: 'agent_message', text: 'Observable response' },
  };
  assert.equal(interpretEvent(event, false).visible, false);
  assert.equal(interpretEvent(event, true).visible, true);
  assert.equal(
    interpretEvent(
      { item: { type: 'command_execution', command: 'npm test' } },
      false,
    ).command,
    true,
  );
});

test('runner-owned fallback text is ASCII and non-TTY text needs no cursor controls', () => {
  const output =
    '[ ] WAITING\n[>] RUNNING\n[+] PASSED\n[X] FAILED\n[M] MANUAL / CLOSEOUT';
  assert.equal(isAscii(output), true);
  assert.equal(hasCursorControls(output), false);
});
