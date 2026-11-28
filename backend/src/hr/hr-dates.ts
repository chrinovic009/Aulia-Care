import { BadRequestException } from '@nestjs/common';

/** Calendar date "YYYY-MM-DD" ↔ Date at UTC midnight (contracts and leave are calendar dates). */
export function parseCalendarDate(value: unknown, label: string): Date {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim()) : null;
  if (!match) throw new BadRequestException(`${label} : date attendue au format AAAA-MM-JJ.`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCDate() !== Number(match[3])) throw new BadRequestException(`${label} : date invalide.`);
  return date;
}
export const calendarIso = (date: Date) => date.toISOString().slice(0, 10);
export const daySerial = (date: Date) => Math.floor(date.getTime() / 86_400_000);
export function assertMonth(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new BadRequestException('Mois attendu au format AAAA-MM.');
  return value;
}
