import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { boundedChildProcessFailure } from '../support/process/bounded-child-process-error.ts';

describe('bounded child-process validation errors', () => {
  it('preserves bounded stdout without surfacing stderr', () => {
    const error = boundedChildProcessFailure({
      stdout: `worker-result:${'x'.repeat(10_000)}`,
      stderr: 'postgres://user:secret@example.test/database',
    });

    assert.match(error.message, /worker-result:/u);
    assert.equal(error.message.includes('secret'), false);
    assert.ok(error.message.length < 8_300);
    assert.equal(error.cause, undefined);
  });
});
