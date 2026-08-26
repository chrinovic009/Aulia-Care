import assert from 'node:assert/strict';
import test from 'node:test';
import { clinicDate, clinicDaySerial, clinicMinuteOfDay, clinicWallClockToUtc } from './clinic-time';

test('interprets a clinic day independently from the server timezone', () => {
  const utc = clinicWallClockToUtc({ year: 2026, month: 8, day: 27 }, 7, 30, 'Africa/Lubumbashi');
  assert.deepEqual(clinicDate(utc, 'Africa/Lubumbashi'), { year: 2026, month: 8, day: 27 });
  assert.equal(clinicMinuteOfDay(utc, 'Africa/Lubumbashi'), 450);
  assert.equal(clinicDaySerial({ year: 2026, month: 8, day: 27 }) - clinicDaySerial({ year: 2026, month: 8, day: 26 }), 1);
});
