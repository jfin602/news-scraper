import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error The runner intentionally ships as native ESM JavaScript.
import {
  MODEL_CONFIGS,
  buildPlan,
  parsePrompt,
} from '../../scripts/codex-phase-core.mjs';

function prompt(
  number: number,
  {
    closeout = false,
    config = 'Terra High',
    version = `0.9.${number}`,
    body = 'Implement the task.',
  }: {
    closeout?: boolean;
    config?: string;
    version?: string;
    body?: string;
  } = {},
) {
  const label = closeout ? 'Phase 9 closeout validation' : `Task ${number}`;
  return {
    filename: `P${number}-${closeout ? 'phase-9-closeout' : `task-${number}`}.txt`,
    text: `TASK: Phase 9 / P${number} — ${label}\n\nMODEL / REASONING / USAGE\n- Recommended configuration: \`${config}\`.\n\nVERSIONING\n- This prompt's assigned project version is \`${version}\`.\n\nGOAL\n${body}\n`,
  };
}

test('implementation prose may mention closeout without changing prompt kind', () => {
  const entry = prompt(1, {
    body: 'Prepare repeatable evidence before closeout so the final closeout can consume it.',
  });

  assert.equal(parsePrompt(entry.filename, entry.text).kind, 'implementation');
});

test('closeout classification depends only on agreeing filename and TASK title signals', () => {
  const implementation = prompt(1);
  assert.throws(
    () => parsePrompt('P1-closeout.txt', implementation.text),
    /Ambiguous closeout classification/,
  );

  const closeout = prompt(2, { closeout: true });
  assert.throws(
    () => parsePrompt('P2-task-2.txt', closeout.text),
    /Ambiguous closeout classification/,
  );
  assert.equal(parsePrompt(closeout.filename, closeout.text).kind, 'closeout');
});

test('phase plan grammar fails closed on malformed parsed metadata', () => {
  const p1 = prompt(1);
  const p2 = prompt(2, { closeout: true });
  const plan = buildPlan([p2, p1], 'p9');

  assert.equal(plan.phase, 9);
  assert.deepEqual(
    plan.prompts.map(({ number, kind, targetVersion }) => ({
      number,
      kind,
      targetVersion,
    })),
    [
      { number: 1, kind: 'implementation', targetVersion: '0.9.1' },
      { number: 2, kind: 'closeout', targetVersion: '0.9.2' },
    ],
  );

  assert.throws(() => buildPlan([p1, p2], 'phase-9'), /form p<number>/);
  assert.throws(
    () => buildPlan([prompt(1, { version: '0.9.8' }), p2], 'p9'),
    /does not match 0\.9\.1/,
  );
  assert.throws(
    () => parsePrompt(p1.filename, prompt(1, { config: 'Terra Max' }).text),
    /Unknown recommended configuration/,
  );

  const duplicateTask = p1.text.replace(
    'TASK: Phase 9 / P1 — Task 1',
    'TASK: Phase 9 / P1 — Task 1\nTASK: duplicate',
  );
  assert.throws(
    () => parsePrompt(p1.filename, duplicateTask),
    /exactly one TASK title/,
  );

  const duplicateRecommendation = p1.text.replace(
    '- Recommended configuration: `Terra High`.',
    '- Recommended configuration: `Terra High`.\n- Recommended configuration: `Sol Light`.',
  );
  assert.throws(
    () => parsePrompt(p1.filename, duplicateRecommendation),
    /exactly one recommended configuration/,
  );

  const duplicateVersion = p1.text.replace(
    "This prompt's assigned project version is `0.9.1`.",
    "This prompt's assigned project version is `0.9.1`.\nAnother assigned project version is `0.9.1`.",
  );
  assert.throws(
    () => parsePrompt(p1.filename, duplicateVersion),
    /exactly one assigned project version/,
  );
});

test('documented runner model labels stay explicit and finite', () => {
  assert.deepEqual(Object.keys(MODEL_CONFIGS), [
    'Terra High',
    'Terra Ultra',
    'Sol Light',
    'Sol High',
    'Sol Ultra',
  ]);
});
