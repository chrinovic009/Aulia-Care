import { clinicDate, clinicDateFromSerial, clinicDaySerial, clinicWallClockToUtc, LocalClinicDate } from '../../core/clinic-time';
import { parseClockTime } from '../../core/operational-policy';

/** Leave and events an employee can declare. Only annual leave is taken from the balance. */
export const LEAVE_TYPES = {
  ANNUAL: { label: 'Congé annuel', deductsBalance: true, unpaid: false },
  SICK: { label: 'Maladie', deductsBalance: false, unpaid: false },
  BEREAVEMENT: { label: 'Deuil', deductsBalance: false, unpaid: false },
  FAMILY_EVENT: { label: 'Événement familial (mariage, naissance…)', deductsBalance: false, unpaid: false },
  MATERNITY: { label: 'Maternité', deductsBalance: false, unpaid: false },
  PATERNITY: { label: 'Paternité', deductsBalance: false, unpaid: false },
  UNPAID: { label: 'Congé sans solde', deductsBalance: false, unpaid: true },
  OTHER: { label: 'Autre motif', deductsBalance: false, unpaid: false },
} as const;
export type LeaveType = keyof typeof LEAVE_TYPES;
export const isLeaveType = (value: unknown): value is LeaveType => typeof value === 'string' && value in LEAVE_TYPES;

export type HrRules = {
  payDay: number;
  lateGraceMinutes: number;
  monthlyWorkingHours: number;
  workingDaysPerMonth: number;
  leaveDaysPerMonth: number;
  seniorityBonusYears: number;
  workWeekDays: number[];
};
export const DEFAULT_HR_RULES: HrRules = {
  payDay: 5, lateGraceMinutes: 5, monthlyWorkingHours: 195, workingDaysPerMonth: 26,
  leaveDaysPerMonth: 1, seniorityBonusYears: 5, workWeekDays: [1, 2, 3, 4, 5, 6],
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const roundHalf = (value: number) => Math.round(value * 2) / 2;

/** Lateness as people read it: "45 min" below one hour, "3 h 46 min" (or "2 h") beyond. */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** "YYYY-MM" → first instant of the month and of the next month, in the clinic's time. */
export function monthPeriod(month: string, timeZone: string): { start: Date; end: Date; year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error('Mois attendu au format AAAA-MM.');
  const year = Number(match[1]);
  const index = Number(match[2]);
  if (index < 1 || index > 12) throw new Error('Mois invalide.');
  const next = index === 12 ? { year: year + 1, month: 1 } : { year, month: index + 1 };
  return {
    start: clinicWallClockToUtc({ year, month: index, day: 1 }, 0, 0, timeZone),
    end: clinicWallClockToUtc({ year: next.year, month: next.month, day: 1 }, 0, 0, timeZone),
    year, month: index,
  };
}

/** Pay date of a month: the policy's day of the following month, at 23:59 clinic time. */
export function payrollDueDate(year: number, month: number, payDay: number, timeZone: string): Date {
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const lastDay = new Date(Date.UTC(next.year, next.month, 0)).getUTCDate();
  return clinicWallClockToUtc({ ...next, day: Math.min(Math.max(1, payDay), lastDay) }, 23, 59, timeZone);
}

const serialOfIso = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) throw new Error('Date attendue au format AAAA-MM-JJ.');
  return clinicDaySerial({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) });
};
/** ISO weekday (1 = Monday … 7 = Sunday) of a day serial. */
const weekday = (serial: number) => ((new Date(serial * 86_400_000).getUTCDay() + 6) % 7) + 1;

/** Working days of a leave, both ends included, Sundays excluded (RDC: jours ouvrables). */
export function workingDaysBetween(startIso: string, endIso: string): number {
  const start = serialOfIso(startIso);
  const end = serialOfIso(endIso);
  if (end < start) throw new Error('La date de fin précède la date de début.');
  let days = 0;
  for (let serial = start; serial <= end; serial += 1) if (weekday(serial) !== 7) days += 1;
  return days;
}

/**
 * Paid leave acquired in a calendar year: `leaveDaysPerMonth` per complete
 * month of service, plus one day per `seniorityBonusYears` years of seniority
 * (spread over the year). Rounded to the half day.
 */
export function leaveEntitlement(input: { hireDate: Date | null; asOf: Date; year: number; rules: Pick<HrRules, 'leaveDaysPerMonth' | 'seniorityBonusYears'> }): { months: number; acquired: number; seniorityYears: number } {
  const hire = input.hireDate ?? new Date(Date.UTC(input.year, 0, 1));
  const from = hire > new Date(Date.UTC(input.year, 0, 1)) ? hire : new Date(Date.UTC(input.year, 0, 1));
  const yearEnd = new Date(Date.UTC(input.year + 1, 0, 1));
  const to = input.asOf < yearEnd ? input.asOf : yearEnd;
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  months = Math.max(0, Math.min(12, months));
  const seniorityYears = Math.max(0, Math.floor((input.asOf.getTime() - hire.getTime()) / (365.25 * 86_400_000)));
  const bonus = input.rules.seniorityBonusYears > 0 ? Math.floor(seniorityYears / input.rules.seniorityBonusYears) : 0;
  return { months, seniorityYears, acquired: roundHalf(months * input.rules.leaveDaysPerMonth + (bonus * months) / 12) };
}

export type PayrollLine = { kind: 'LATE' | 'ABSENCE' | 'UNPAID_LEAVE' | 'ADVANCE' | 'BONUS' | 'OTHER'; label: string; amount: number };

/**
 * Proposed payroll of a month: the monthly salary (pro rata of the days the
 * contract covers) and the deductions Aulia suggests from lateness, absences
 * and unpaid leave. Finance keeps, changes or removes them at payment.
 */
export function proposePayroll(input: {
  monthlySalary: number; daysInMonth: number; coveredDays: number;
  lateMinutes: number; absentDays: number; unpaidLeaveDays: number;
  rules: Pick<HrRules, 'monthlyWorkingHours' | 'workingDaysPerMonth'>;
}): { gross: number; lines: PayrollLine[]; net: number } {
  const gross = round2(input.monthlySalary * Math.min(1, Math.max(0, input.coveredDays / input.daysInMonth)));
  const hourly = input.rules.monthlyWorkingHours > 0 ? input.monthlySalary / input.rules.monthlyWorkingHours : 0;
  const daily = input.rules.workingDaysPerMonth > 0 ? input.monthlySalary / input.rules.workingDaysPerMonth : 0;
  const lines: PayrollLine[] = [];
  if (input.lateMinutes > 0) lines.push({ kind: 'LATE', label: `Retards (${formatDuration(input.lateMinutes)})`, amount: -round2((hourly * input.lateMinutes) / 60) });
  if (input.absentDays > 0) lines.push({ kind: 'ABSENCE', label: `Absences non justifiées (${input.absentDays} j)`, amount: -round2(daily * input.absentDays) });
  if (input.unpaidLeaveDays > 0) lines.push({ kind: 'UNPAID_LEAVE', label: `Congé sans solde (${input.unpaidLeaveDays} j)`, amount: -round2(daily * input.unpaidLeaveDays) });
  // Deductions never exceed the month's pay.
  let remaining = gross;
  for (const line of lines) {
    const capped = Math.max(line.amount, -remaining);
    remaining = round2(remaining + capped);
    line.amount = round2(capped);
  }
  return { gross, lines, net: netOf(gross, lines) };
}

export function netOf(gross: number, lines: Array<Pick<PayrollLine, 'amount'>>): number {
  return round2(gross + lines.reduce((sum, line) => sum + line.amount, 0));
}

/** Where a payroll stands: paid, late (unpaid after its pay date) or still to pay. */
export function payrollState(payroll: { status: string; dueDate: Date | null }, now = new Date()): 'PAID' | 'LATE' | 'TO_PAY' {
  if (payroll.status === 'PAID') return 'PAID';
  return payroll.dueDate && payroll.dueDate.getTime() < now.getTime() ? 'LATE' : 'TO_PAY';
}

type ClinicShiftClock = { timezone?: string | null; dayShiftStart?: string | null; dayShiftEnd?: string | null; nightShiftStart?: string | null; nightShiftEnd?: string | null };
type EmployeeRota = { shiftPattern: string; rotationAnchorAt: Date | null; rotationDays: number | null; permanentShiftEndTime: string | null };

/**
 * Shifts an employee was expected to work in [from, to), from the same rota
 * rules as the clock-in (permanent day on the policy's working days, or the
 * 3 days / 3 nights / 3 rest rotation). Manual rotas only have explicit shifts.
 */
export function plannedWindows(employee: EmployeeRota, clinic: ClinicShiftClock, workWeekDays: number[], from: Date, to: Date): Array<{ startAt: Date; endAt: Date }> {
  if (employee.shiftPattern === 'MANUAL') return [];
  const timeZone = clinic.timezone || 'Africa/Lubumbashi';
  const dayStart = parseClockTime(clinic.dayShiftStart, '07:30');
  const dayEnd = parseClockTime(clinic.dayShiftEnd, '17:30');
  const nightStart = parseClockTime(clinic.nightShiftStart, '17:30');
  const nightEnd = parseClockTime(clinic.nightShiftEnd, '07:30');
  const first = clinicDaySerial(clinicDate(from, timeZone));
  const last = clinicDaySerial(clinicDate(new Date(to.getTime() - 1), timeZone));
  const windows: Array<{ startAt: Date; endAt: Date }> = [];
  const add = (startDay: LocalClinicDate, start: { hour: number; minute: number }, endDay: LocalClinicDate, end: { hour: number; minute: number }) => {
    const startAt = clinicWallClockToUtc(startDay, start.hour, start.minute, timeZone);
    if (startAt >= from && startAt < to) windows.push({ startAt, endAt: clinicWallClockToUtc(endDay, end.hour, end.minute, timeZone) });
  };
  for (let serial = first; serial <= last; serial += 1) {
    const day = clinicDateFromSerial(serial);
    if (employee.shiftPattern === 'PERMANENT_DAY') {
      if (workWeekDays.includes(weekday(serial))) add(day, dayStart, day, parseClockTime(employee.permanentShiftEndTime, '17:30'));
      continue;
    }
    if (!employee.rotationAnchorAt) continue;
    const index = serial - clinicDaySerial(clinicDate(employee.rotationAnchorAt, timeZone));
    if (index < 0) continue;
    const phaseDays = Math.min(31, Math.max(1, employee.rotationDays || 3));
    const phase = index % (phaseDays * 3);
    if (phase < phaseDays) add(day, dayStart, day, dayEnd);
    else if (phase < phaseDays * 2) add(day, nightStart, clinicDateFromSerial(serial + 1), nightEnd);
  }
  return windows;
}

/** Minutes late at clock-in beyond the tolerance (0 when on time or within tolerance). */
export function lateMinutes(plannedStartAt: Date | null, clockInAt: Date | null, graceMinutes: number): number {
  if (!plannedStartAt || !clockInAt) return 0;
  const minutes = Math.floor((clockInAt.getTime() - plannedStartAt.getTime()) / 60_000);
  return minutes > graceMinutes ? minutes : 0;
}
