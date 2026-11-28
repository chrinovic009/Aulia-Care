import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedActor } from '../core/clinic-context.service';
import { clinicDate, clinicDaySerial, clinicWallClockToUtc } from '../core/clinic-time';
import { PrismaService } from '../prisma/prisma.service';
import { formatDuration, lateMinutes, LEAVE_TYPES, isLeaveType, monthPeriod, plannedWindows, workingDaysBetween } from './domain/hr-rules';
import { HR_ROLES, HrAccess } from './hr-access';

const HOUR = 3_600_000;
const isoDay = (date: Date, timeZone: string) => {
  const local = clinicDate(date, timeZone);
  return `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
};
const utcIso = (date: Date) => date.toISOString().slice(0, 10);

export type LateEntry = { attendanceId: string; date: string; plannedStartAt: Date; clockInAt: Date; minutes: number; duration: string; justified: boolean; note: string | null };
export type AbsenceEntry = { date: string; attendanceId: string | null; source: 'DETECTED' | 'RECORDED'; justified: boolean; note: string | null };
export type MonthFacts = {
  employeeId: string;
  plannedShifts: number; presentShifts: number;
  lateEntries: LateEntry[]; lateMinutes: number; lateMinutesJustified: number;
  absences: AbsenceEntry[]; absentDays: number;
  leaveDays: Record<string, number>; unpaidLeaveDays: number;
};

/**
 * Attendance facts of a month for each employee: lateness (from the clock-in
 * against the planned start), absences (a planned shift without any clock-in,
 * or an absence recorded by the administration) and approved leave. The same
 * facts feed the reports and the payroll proposal.
 */
@Injectable()
export class HrAttendanceService {
  constructor(private readonly prisma: PrismaService, private readonly access: HrAccess) {}

  async monthFacts(clinicId: string, month: string, employeeIds?: string[], now = new Date()): Promise<Map<string, MonthFacts>> {
    const [clock, rules] = await Promise.all([this.access.clock(clinicId), this.access.rules(clinicId)]);
    const period = monthPeriod(month, clock.timezone);
    const upper = period.end < now ? period.end : now;
    const employeeWhere = { clinicId, ...(employeeIds ? { id: { in: employeeIds } } : {}) };
    const [employees, attendances, shifts, leaves] = await Promise.all([
      this.prisma.employee.findMany({ where: employeeWhere, select: { id: true, hireDate: true, terminationDate: true, shiftPattern: true, rotationAnchorAt: true, rotationDays: true, permanentShiftEndTime: true } }),
      this.prisma.attendance.findMany({
        where: { employee: employeeWhere, OR: [{ plannedStartAt: { gte: period.start, lt: period.end } }, { plannedStartAt: null, OR: [{ clockInAt: { gte: period.start, lt: period.end } }, { clockInAt: null, createdAt: { gte: period.start, lt: period.end } }] }] },
        select: { id: true, employeeId: true, shiftId: true, plannedStartAt: true, clockInAt: true, status: true, justified: true, note: true, createdAt: true },
      }),
      this.prisma.shift.findMany({ where: { employee: employeeWhere, startAt: { gte: period.start, lt: period.end } }, select: { id: true, employeeId: true, startAt: true, endAt: true } }),
      this.prisma.leaveRequest.findMany({ where: { employee: employeeWhere, status: 'APPROVED', startDate: { lt: period.end }, endDate: { gte: new Date(period.start.getTime() - 24 * HOUR) } }, select: { employeeId: true, leaveType: true, startDate: true, endDate: true } }),
    ]);
    const monthFirst = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
    const monthLast = utcIso(new Date(Date.UTC(period.year, period.month, 0)));
    const result = new Map<string, MonthFacts>();
    for (const employee of employees) {
      const own = attendances.filter((row) => row.employeeId === employee.id);
      const ownLeaves = leaves.filter((row) => row.employeeId === employee.id);
      // Days covered by approved leave are never absences.
      const leaveDates = new Set<string>();
      const leaveDays: Record<string, number> = {};
      let unpaidLeaveDays = 0;
      for (const leave of ownLeaves) {
        const from = utcIso(leave.startDate) > monthFirst ? utcIso(leave.startDate) : monthFirst;
        const to = utcIso(leave.endDate) < monthLast ? utcIso(leave.endDate) : monthLast;
        if (to < from) continue;
        for (let serial = clinicDaySerial(parse(from)); serial <= clinicDaySerial(parse(to)); serial += 1) leaveDates.add(utcIso(new Date(serial * 86_400_000)));
        const days = workingDaysBetween(from, to);
        leaveDays[leave.leaveType] = (leaveDays[leave.leaveType] ?? 0) + days;
        if (isLeaveType(leave.leaveType) && LEAVE_TYPES[leave.leaveType].unpaid) unpaidLeaveDays += days;
      }
      const explicit = shifts.filter((row) => row.employeeId === employee.id && row.startAt < upper);
      const explicitDays = new Set(explicit.map((row) => isoDay(row.startAt, clock.timezone)));
      const pattern = plannedWindows(employee, clock, rules.workWeekDays, period.start, upper)
        .filter((window) => !explicitDays.has(isoDay(window.startAt, clock.timezone)));
      const windows = [...explicit.map((row) => ({ id: row.id as string | null, startAt: row.startAt, endAt: row.endAt })), ...pattern.map((row) => ({ id: null as string | null, ...row }))]
        .filter((window) => window.endAt <= upper)
        .filter((window) => (!employee.hireDate || window.startAt >= employee.hireDate) && (!employee.terminationDate || window.startAt <= employee.terminationDate))
        .filter((window) => !leaveDates.has(isoDay(window.startAt, clock.timezone)));
      const recorded = own.filter((row) => row.status === 'ABSENT');
      const recordedDates = new Map(recorded.map((row) => [isoDay(row.plannedStartAt ?? row.createdAt, clock.timezone), row]));
      const clockIns = own.filter((row) => row.clockInAt && row.status !== 'ABSENT');
      let present = 0;
      const absences: AbsenceEntry[] = [];
      for (const window of windows) {
        const matched = clockIns.some((row) => (window.id && row.shiftId === window.id) || (row.clockInAt! >= new Date(window.startAt.getTime() - 3 * HOUR) && row.clockInAt! <= window.endAt));
        if (matched) { present += 1; continue; }
        const date = isoDay(window.startAt, clock.timezone);
        if (!recordedDates.has(date) && !absences.some((absence) => absence.date === date)) absences.push({ date, attendanceId: null, source: 'DETECTED', justified: false, note: null });
      }
      for (const [date, row] of recordedDates) absences.push({ date, attendanceId: row.id, source: 'RECORDED', justified: row.justified, note: row.note });
      absences.sort((a, b) => a.date.localeCompare(b.date));
      const lateEntries: LateEntry[] = clockIns
        .map((row) => ({ row, minutes: lateMinutes(row.plannedStartAt, row.clockInAt, rules.lateGraceMinutes) }))
        .filter(({ minutes }) => minutes > 0)
        .map(({ row, minutes }) => ({ attendanceId: row.id, date: isoDay(row.plannedStartAt!, clock.timezone), plannedStartAt: row.plannedStartAt!, clockInAt: row.clockInAt!, minutes, duration: formatDuration(minutes), justified: row.justified, note: row.note }))
        .sort((a, b) => b.minutes - a.minutes);
      result.set(employee.id, {
        employeeId: employee.id, plannedShifts: windows.length, presentShifts: present,
        lateEntries, lateMinutes: lateEntries.filter((entry) => !entry.justified).reduce((sum, entry) => sum + entry.minutes, 0),
        lateMinutesJustified: lateEntries.filter((entry) => entry.justified).reduce((sum, entry) => sum + entry.minutes, 0),
        absences, absentDays: absences.filter((absence) => !absence.justified).length,
        leaveDays, unpaidLeaveDays,
      });
    }
    return result;
  }

  /** Monthly attendance report: lateness (in h/min beyond 60 min), absences and leave, per employee. */
  async report(month: string, actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.readers, 'Présences réservées à la finance et à l’administration.');
    const facts = await this.monthFacts(actor.clinicId, month);
    const employees = await this.prisma.employee.findMany({ where: { clinicId: actor.clinicId }, select: { id: true, firstName: true, lastName: true, position: true, status: true, department: { select: { name: true } } } });
    const rows = employees.map((employee) => {
      const fact = facts.get(employee.id)!;
      return {
        employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}`, position: employee.position, department: employee.department?.name ?? null, status: employee.status },
        plannedShifts: fact.plannedShifts, presentShifts: fact.presentShifts,
        lateCount: fact.lateEntries.length, lateMinutes: fact.lateMinutes, lateDuration: formatDuration(fact.lateMinutes),
        lateMinutesJustified: fact.lateMinutesJustified, longestLate: fact.lateEntries[0] ?? null,
        absentDays: fact.absentDays, absences: fact.absences, leaveDays: fact.leaveDays, lateEntries: fact.lateEntries,
      };
    }).sort((a, b) => b.lateMinutes - a.lateMinutes || b.absentDays - a.absentDays);
    const biggestLate = rows.flatMap((row) => row.lateEntries.map((entry) => ({ ...entry, employee: row.employee.name, employeeId: row.employee.id }))).sort((a, b) => b.minutes - a.minutes).slice(0, 20);
    const totalLate = rows.reduce((sum, row) => sum + row.lateMinutes, 0);
    return {
      month, rows, biggestLate,
      totals: { lateMinutes: totalLate, lateDuration: formatDuration(totalLate), lateCount: rows.reduce((sum, row) => sum + row.lateCount, 0), absentDays: rows.reduce((sum, row) => sum + row.absentDays, 0) },
      canEdit: this.access.hasRole(actor, HR_ROLES.decisions),
    };
  }

  /** The administration records an absence (justified or not) for a planned day. */
  async recordAbsence(input: { employeeId: string; date: string; justified?: boolean; note?: string }, actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.decisions, 'Seule l’administration enregistre une absence.');
    await this.access.employeeOfClinic(actor.clinicId, input.employeeId);
    const clock = await this.access.clock(actor.clinicId);
    const day = parse(input.date);
    const at = clinicWallClockToUtc(day, 12, 0, clock.timezone);
    if (at.getTime() > Date.now() + 24 * HOUR) throw new BadRequestException('Une absence ne peut pas être enregistrée à l’avance : utilisez une demande de congé.');
    const existing = await this.prisma.attendance.findFirst({ where: { employeeId: input.employeeId, status: 'ABSENT', plannedStartAt: { gte: new Date(at.getTime() - 12 * HOUR), lt: new Date(at.getTime() + 12 * HOUR) } } });
    const data = { justified: Boolean(input.justified), note: input.note?.trim() || null, recordedById: actor.id };
    const saved = existing
      ? await this.prisma.attendance.update({ where: { id: existing.id }, data })
      : await this.prisma.attendance.create({ data: { employeeId: input.employeeId, status: 'ABSENT', plannedStartAt: at, handoverState: 'COMPLETED', ...data } });
    await this.access.audit(actor.id, 'Attendance', saved.id, existing ? 'UPDATE' : 'CREATE', { event: 'ABSENCE_RECORDED', date: input.date, justified: data.justified });
    return saved;
  }

  /** Justifies (or un-justifies) a lateness or an absence: a justified one is never deducted. */
  async justify(attendanceId: string, input: { justified: boolean; note?: string }, actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.decisions, 'Seule l’administration justifie un retard ou une absence.');
    const attendance = await this.prisma.attendance.findFirst({ where: { id: attendanceId, employee: { clinicId: actor.clinicId } }, select: { id: true, justified: true } });
    if (!attendance) throw new NotFoundException('Pointage introuvable dans votre établissement.');
    const saved = await this.prisma.attendance.update({ where: { id: attendanceId }, data: { justified: input.justified, note: input.note?.trim() || null, recordedById: actor.id } });
    await this.access.audit(actor.id, 'Attendance', attendanceId, 'UPDATE', { event: 'ATTENDANCE_JUSTIFIED', justified: input.justified }, { justified: attendance.justified });
    return saved;
  }
}

function parse(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new BadRequestException('Date attendue au format AAAA-MM-JJ.');
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}
