import test from 'node:test';

test('expected fixture failure', () => {
  throw new Error('expected fixture failure');
});
