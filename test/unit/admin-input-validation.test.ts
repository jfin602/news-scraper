import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateAdminInputRecord } from '../../src/admin/input-validation.ts';

test('validates exact admin request-object keys without domain errors', () => {
  const allowed = { required: 'value', optional: true };
  assert.equal(
    validateAdminInputRecord(allowed, ['required'], ['optional']),
    allowed,
  );
  assert.deepEqual(validateAdminInputRecord({}, [], ['optional']), {});

  for (const input of [null, [], 'request', 1, true, undefined]) {
    assert.equal(validateAdminInputRecord(input, ['required']), undefined);
  }
  assert.equal(validateAdminInputRecord({}, ['required']), undefined);
  assert.equal(
    validateAdminInputRecord({ required: 'value', extra: true }, ['required']),
    undefined,
  );
});

test('does not treat inherited properties as request-object keys', () => {
  const inheritedRequired = Object.create({ required: 'value' }) as Record<
    string,
    unknown
  >;
  assert.equal(
    validateAdminInputRecord(inheritedRequired, ['required']),
    undefined,
  );
});
