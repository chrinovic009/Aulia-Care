export type LocalClinicDate = { year: number; month: number; day: number };

function partsFor(date: Date, timeZone: string, includeTime = false): Record<string, number> {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' as const } : {}),
  });
  return formatter.formatToParts(date).reduce<Record<string, number>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
    return result;
  }, {});
}

export function clinicDate(date: Date, timeZone: string): LocalClinicDate {
  const value = partsFor(date, timeZone);
  return { year: value.year, month: value.month, day: value.day };
}

export function clinicMinuteOfDay(date: Date, timeZone: string): number {
  const value = partsFor(date, timeZone, true);
  return value.hour * 60 + value.minute;
}

export function clinicDaySerial(date: LocalClinicDate): number {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / 86_400_000);
}

export function clinicDateFromSerial(serial: number): LocalClinicDate {
  const date = new Date(serial * 86_400_000);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function offsetAt(date: Date, timeZone: string): number {
  const local = partsFor(date, timeZone, true);
  return Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second || 0) - date.getTime();
}

/** Converts a clinic wall-clock value to its UTC timestamp. A second pass
 * handles timezone offset changes around DST boundaries. */
export function clinicWallClockToUtc(date: LocalClinicDate, hour: number, minute: number, timeZone: string): Date {
  const wallClock = Date.UTC(date.year, date.month - 1, date.day, hour, minute, 0);
  let result = new Date(wallClock - offsetAt(new Date(wallClock), timeZone));
  result = new Date(wallClock - offsetAt(result, timeZone));
  return result;
}
