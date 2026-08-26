import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidClockTime, isValidIanaTimezone, parseClockTime, resolveNursePatientCapacity, SYSTEM_MAX_NURSE_PATIENT_CAPACITY } from './operational-policy';

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

test('caps an accidental capacity above the documented technical safeguard', () => {
  assert.equal(resolveNursePatientCapacity(SYSTEM_MAX_NURSE_PATIENT_CAPACITY + 1, 3), SYSTEM_MAX_NURSE_PATIENT_CAPACITY);
});

test('accepts only strict operational clocks and IANA timezones', () => {
  assert.equal(isValidClockTime('07:30'), true);
  assert.equal(isValidClockTime('7h30'), false);
  assert.equal(isValidClockTime('25:70'), false);
  assert.equal(isValidIanaTimezone('Africa/Lubumbashi'), true);
  assert.equal(isValidIanaTimezone('Europe/Paris'), true);
  assert.equal(isValidIanaTimezone('GMT+2-custom'), false);
});

test('parses configurable shift clocks and falls back safely', () => {
  assert.deepEqual(parseClockTime('06:45', '07:30'), { hour: 6, minute: 45 });
  assert.deepEqual(parseClockTime('invalid', '07:30'), { hour: 7, minute: 30 });
});
