import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldDeferRealtimeRefresh } from './realtime-refresh';

test('an open clinical modal is preserved even when a button has focus', () => {
  assert.equal(shouldDeferRealtimeRefresh('BUTTON', true), true);
  assert.equal(shouldDeferRealtimeRefresh('BUTTON', false), false);
});

test('editing an input still defers realtime remounts without a modal', () => {
  assert.equal(shouldDeferRealtimeRefresh('INPUT', false), true);
  assert.equal(shouldDeferRealtimeRefresh('TEXTAREA', false), true);
  assert.equal(shouldDeferRealtimeRefresh('DIV', false), false);
});
