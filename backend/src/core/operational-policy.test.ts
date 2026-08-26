import assert from 'node:assert/strict';
import test from 'node:test';
import { parseClockTime, resolveNursePatientCapacity } from './operational-policy';

test('uses the clinic capacity when no unit override exists', () => {
  assert.equal(resolveNursePatientCapacity(null, 7), 7);
});

test('uses the unit capacity before the clinic default', () => {
  assert.equal(resolveNursePatientCapacity(3, 7), 3);
});

test('falls back safely for invalid capacity values', () => {
  assert.equal(resolveNursePatientCapacity(0, -1), 5);
  assert.equal(resolveNursePatientCapacity(150, 4), 100);
});

test('parses configurable shift clocks and falls back safely', () => {
  assert.deepEqual(parseClockTime('06:45', '07:30'), { hour: 6, minute: 45 });
  assert.deepEqual(parseClockTime('invalid', '07:30'), { hour: 7, minute: 30 });
});
