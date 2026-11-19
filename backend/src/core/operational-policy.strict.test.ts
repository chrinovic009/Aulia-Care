import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidClockTime, isValidIanaTimezone, parseClockTime, resolveNursePatientCapacity } from './operational-policy';

test('accepts UTC and refuses inverted fixed-offset zones', () => {
  assert.equal(isValidIanaTimezone('UTC'), true);
  assert.equal(isValidIanaTimezone('Etc/GMT+3'), false);
  assert.equal(isValidIanaTimezone('Mars/Olympus'), false);
});

test('parseClockTime applies the same strict rule as isValidClockTime', () => {
  assert.equal(isValidClockTime('7:5'), false);
  assert.deepEqual(parseClockTime('7:5', '07:30'), { hour: 7, minute: 30 });
  assert.deepEqual(parseClockTime(null, 'bad'), { hour: 0, minute: 0 });
});

test('an invalid nurse capacity is reported, not silently replaced', () => {
  const reasons: string[] = [];
  assert.equal(resolveNursePatientCapacity(0, null, (r) => reasons.push(r)), 5);
  assert.equal(resolveNursePatientCapacity(150, null, (r) => reasons.push(r)), 100);
  assert.equal(resolveNursePatientCapacity(4, null, (r) => reasons.push(r)), 4);
  assert.equal(reasons.length, 2);
});
