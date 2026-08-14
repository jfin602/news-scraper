import assert from 'node:assert/strict';
import test from 'node:test';

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
    phase = 9,
    taskNumber = number,
    title = closeout ? 'Phase 9 closeout validation' : `Task ${number}`,
  }: {
    closeout?: boolean;
    config?: string;
    version?: string;
    body?: string;
    phase?: number;
    taskNumber?: number;
    title?: string;
  } = {},
) {
  return {
    filename: `P${number}-${closeout ? 'phase-9-closeout' : `task-${number}`}.txt`,
    text: `TASK: Phase ${phase} / P${taskNumber} — ${title}\n\nMODEL / REASONING / USAGE\n- Recommended configuration: \`${config}\`.\n\nVERSIONING\n- This prompt's assigned project version is \`${version}\`.\n\nGOAL\n${body}\n`,
  };
}

function correctionPrompt(
  number: number,
  {
    closeout = false,
    config = 'Terra High',
    version = '0.10.0',
    body = 'Implement the correction.',
    phase = 10,
    taskNumber = number,
    title = closeout
      ? 'Single-Publication correction closeout'
      : `Correction ${number}`,
  }: {
    closeout?: boolean;
    config?: string;
    version?: string;
    body?: string;
    phase?: number;
    taskNumber?: number;
    title?: string;
  } = {},
) {
  return {
    filename: `P${number}-${closeout ? 'correction-closeout' : `correction-${number}`}.txt`,
    text: `TASK: Correction ${phase} / P${taskNumber} — ${title}\n\nMODEL / REASONING / USAGE\n- Recommended configuration: \`${config}\`.\n\nVERSIONING\n- Required unchanged project version: \`${version}\`.\n\nGOAL\n${body}\n`,
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

test('filenames use canonical one-based lower-kebab prompt form', () => {
  const entry = prompt(1);

  for (const filename of [
    'P01-task-1.txt',
    'p1-task-1.txt',
    'P1-Task-1.txt',
    'P1-task_1.txt',
    'P1-task-1.md',
  ]) {
    assert.throws(
      () => parsePrompt(filename, entry.text),
      /Prompt filename must have the form/,
    );
  }
});

test('TASK metadata is canonical and agrees with filename and folder', () => {
  const entry = prompt(1);
  const malformed = entry.text.replace(
    'TASK: Phase 9 / P1 — Task 1',
    'TASK: Phase 9 P1 - Task 1',
  );
  assert.throws(
    () => parsePrompt(entry.filename, malformed),
    /TASK title must have the form/,
  );

  const wrongPromptNumber = prompt(1, { taskNumber: 2 });
  assert.throws(
    () => parsePrompt(wrongPromptNumber.filename, wrongPromptNumber.text),
    /does not match filename P1/,
  );

  const wrongPhase = prompt(1, { phase: 8 });
  const closeout = prompt(2, { closeout: true });
  assert.throws(
    () => buildPlan([wrongPhase, closeout], 'p9'),
    /TASK phase 8 does not match folder phase 9/,
  );
});

test('phase plan grammar fails closed on malformed parsed metadata', () => {
  const p1 = prompt(1);
  const p2 = prompt(2, { closeout: true });
  const plan = buildPlan([p2, p1], 'p9');

  assert.equal(plan.mode, 'phase');
  if (plan.mode !== 'phase') throw new Error('Expected a phase plan.');
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

  for (const folderName of ['phase-9', 'P9', 'p09']) {
    assert.throws(() => buildPlan([p1, p2], folderName), /form p<number>/);
  }
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
    'TASK: Phase 9 / P1 — Task 1\nTASK: Phase 9 / P1 — Duplicate',
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

  const malformedRecommendation = p1.text.replace(
    '- Recommended configuration: `Terra High`.',
    'Recommended configuration: `Terra High`',
  );
  assert.throws(
    () => parsePrompt(p1.filename, malformedRecommendation),
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

test('valid correction stacks expose explicit fixed-version plan semantics', () => {
  const p1 = correctionPrompt(1);
  const p2 = correctionPrompt(2, { closeout: true });
  const plan = buildPlan([p2, p1], 'c10-single-publication');

  assert.equal(plan.mode, 'correction');
  if (plan.mode !== 'correction')
    throw new Error('Expected a correction plan.');
  assert.equal(plan.phase, 10);
  assert.equal(plan.folderName, 'c10-single-publication');
  assert.equal(plan.correctionSlug, 'single-publication');
  assert.equal(plan.unchangedVersion, '0.10.0');
  assert.deepEqual(
    plan.prompts.map(({ number, mode, kind, unchangedVersion }) => ({
      number,
      mode,
      kind,
      unchangedVersion,
    })),
    [
      {
        number: 1,
        mode: 'correction',
        kind: 'implementation',
        unchangedVersion: '0.10.0',
      },
      {
        number: 2,
        mode: 'correction',
        kind: 'closeout',
        unchangedVersion: '0.10.0',
      },
    ],
  );
  assert.equal('targetVersion' in plan.prompts[0], false);
});

test('correction folders and TASK metadata fail closed unless canonical and agreeing', () => {
  const p1 = correctionPrompt(1);
  const closeout = correctionPrompt(2, { closeout: true });
  for (const folderName of [
    'c10',
    'C10-single-publication',
    'c010-single-publication',
    'c10-Single-publication',
    'c10-single_publication',
    'c10-',
  ]) {
    assert.throws(
      () => buildPlan([p1, closeout], folderName),
      /c<phase>-<lower-kebab-slug>/,
    );
  }

  assert.throws(
    () =>
      buildPlan(
        [correctionPrompt(1, { phase: 9 }), closeout],
        'c10-single-publication',
      ),
    /TASK phase 9 does not match folder phase 10/,
  );
  assert.throws(
    () =>
      buildPlan(
        [
          prompt(1, { phase: 10, version: '0.10.1' }),
          prompt(2, { closeout: true, phase: 10, version: '0.10.2' }),
        ],
        'c10-correction',
      ),
    /TASK stack mode phase does not match folder stack mode correction/,
  );
  assert.throws(
    () =>
      buildPlan(
        [correctionPrompt(1), correctionPrompt(2, { closeout: true })],
        'p10',
      ),
    /TASK stack mode correction does not match folder stack mode phase/,
  );
  const wrongNumber = correctionPrompt(1, { taskNumber: 2 });
  assert.throws(
    () => parsePrompt(wrongNumber.filename, wrongNumber.text),
    /does not match filename P1/,
  );
});

test('phase and correction version metadata cannot be mixed or malformed', () => {
  const phasePrompt = prompt(1);
  const correction = correctionPrompt(1);
  const closeout = correctionPrompt(2, { closeout: true });

  assert.throws(
    () =>
      parsePrompt(
        phasePrompt.filename,
        `${phasePrompt.text}- Required unchanged project version: \`0.9.0\`.\n`,
      ),
    /must not contain correction unchanged-version metadata/,
  );
  assert.throws(
    () =>
      parsePrompt(
        correction.filename,
        `${correction.text}This prompt's assigned project version is \`0.10.1\`.\n`,
      ),
    /must not contain assigned project version metadata/,
  );
  assert.throws(
    () =>
      parsePrompt(
        correction.filename,
        correction.text.replace(
          '- Required unchanged project version: `0.10.0`.',
          'Version remains `0.10.0`.',
        ),
      ),
    /exactly one required unchanged project version; found 0/,
  );
  assert.throws(
    () =>
      parsePrompt(
        correction.filename,
        correction.text.replace(
          '- Required unchanged project version: `0.10.0`.',
          '- Required unchanged project version: `0.10.0`.\n- Required unchanged project version: `0.10.0`.',
        ),
      ),
    /exactly one required unchanged project version; found 2/,
  );
  assert.throws(
    () =>
      parsePrompt(
        correction.filename,
        correction.text.replace('`0.10.0`', '`0.10`'),
      ),
    /must be a semantic version/,
  );
  assert.throws(
    () =>
      parsePrompt(
        correction.filename,
        correction.text.replace('`0.10.0`', '`0.010.0`'),
      ),
    /must be a semantic version/,
  );
  assert.throws(
    () =>
      parsePrompt(
        correction.filename,
        correction.text.replace(
          '- Required unchanged project version: `0.10.0`.',
          '- Required unchanged project version: `0.10.0`',
        ),
      ),
    /exactly one required unchanged project version; found 0/,
  );
  assert.throws(
    () =>
      buildPlan(
        [
          correction,
          correctionPrompt(2, { closeout: true, version: '0.10.1' }),
        ],
        'c10-single-publication',
      ),
    /unchanged version 0\.10\.1 does not match stack version 0\.10\.0/,
  );
  assert.equal(
    buildPlan([correction, closeout], 'c10-single-publication').mode,
    'correction',
  );
});

test('correction closeout classification uses only agreeing filename and TASK title signals', () => {
  const implementation = correctionPrompt(1, {
    body: 'Prepare evidence for the later closeout.',
  });
  assert.equal(
    parsePrompt(implementation.filename, implementation.text).kind,
    'implementation',
  );
  assert.throws(
    () => parsePrompt('P1-correction-closeout.txt', implementation.text),
    /Ambiguous closeout classification/,
  );

  const closeout = correctionPrompt(2, { closeout: true });
  assert.throws(
    () => parsePrompt('P2-correction-task.txt', closeout.text),
    /Ambiguous closeout classification/,
  );
  assert.equal(parsePrompt(closeout.filename, closeout.text).kind, 'closeout');
});

test('documented runner model labels stay explicit and finite', () => {
  assert.deepEqual(Object.keys(MODEL_CONFIGS), [
    'Luna Low',
    'Luna Medium',
    'Luna High',
    'Terra Medium',
    'Terra High',
    'Terra Ultra',
    'Sol Light',
    'Sol Medium',
    'Sol High',
    'Sol Ultra',
  ]);
});

test('Luna and Medium recommendation labels parse without broadening unknown labels', () => {
  for (const config of [
    'Luna Low',
    'Luna Medium',
    'Luna High',
    'Terra Medium',
    'Sol Medium',
  ]) {
    assert.equal(
      parsePrompt(prompt(1, { config }).filename, prompt(1, { config }).text)
        .recommendation,
      config,
    );
  }
  assert.throws(
    () =>
      parsePrompt(
        prompt(1, { config: 'Terra Max' }).filename,
        prompt(1, { config: 'Terra Max' }).text,
      ),
    /Unknown recommended configuration/,
  );
});
