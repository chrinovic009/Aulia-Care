import assert from 'node:assert/strict';
import test from 'node:test';
import { clinicDate, clinicDaySerial, clinicMinuteOfDay, clinicWallClockToUtc } from './clinic-time';

test('interprets a clinic day independently from the server timezone', () => {
  const utc = clinicWallClockToUtc({ year: 2026, month: 8, day: 27 }, 7, 30, 'Africa/Lubumbashi');
  assert.deepEqual(clinicDate(utc, 'Africa/Lubumbashi'), { year: 2026, month: 8, day: 27 });
  assert.equal(clinicMinuteOfDay(utc, 'Africa/Lubumbashi'), 450);
  assert.equal(clinicDaySerial({ year: 2026, month: 8, day: 27 }) - clinicDaySerial({ year: 2026, month: 8, day: 26 }), 1);
});

test('converts day and night shifts across positive and negative timezone offsets', () => {
  const lubumbashiDay = clinicWallClockToUtc({ year: 2026, month: 8, day: 27 }, 7, 30, 'Africa/Lubumbashi');
  const newYorkNight = clinicWallClockToUtc({ year: 2026, month: 8, day: 27 }, 17, 30, 'America/New_York');
  const parisNightEnd = clinicWallClockToUtc({ year: 2026, month: 8, day: 28 }, 7, 30, 'Europe/Paris');
  assert.equal(clinicMinuteOfDay(lubumbashiDay, 'Africa/Lubumbashi'), 450);
  assert.equal(clinicMinuteOfDay(newYorkNight, 'America/New_York'), 1050);
  assert.equal(clinicMinuteOfDay(parisNightEnd, 'Europe/Paris'), 450);
  assert.deepEqual(clinicDate(newYorkNight, 'America/New_York'), { year: 2026, month: 8, day: 27 });
  assert.deepEqual(clinicDate(parisNightEnd, 'Europe/Paris'), { year: 2026, month: 8, day: 28 });
});

test('rejects nonexistent and ambiguous DST wall-clock times instead of guessing', () => {
  assert.throws(() => clinicWallClockToUtc({ year: 2026, month: 3, day: 29 }, 2, 30, 'Europe/Paris'), /inexistante/i);
  assert.throws(() => clinicWallClockToUtc({ year: 2026, month: 10, day: 25 }, 2, 30, 'Europe/Paris'), /ambiguë/i);
  assert.throws(() => clinicWallClockToUtc({ year: 2026, month: 11, day: 1 }, 1, 30, 'America/New_York'), /ambiguë/i);
});
