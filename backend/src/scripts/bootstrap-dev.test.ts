import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDevBootstrapPermitted } from './bootstrap-dev';

test('DEV bootstrap is forbidden in public demo mode', () => {
  assert.throws(
    () => assertDevBootstrapPermitted({ AULIA_APP_MODE: 'demo' }),
    /Bootstrap DEV refusé/,
  );
  assert.doesNotThrow(() => assertDevBootstrapPermitted({ AULIA_APP_MODE: 'standard' }));
});
