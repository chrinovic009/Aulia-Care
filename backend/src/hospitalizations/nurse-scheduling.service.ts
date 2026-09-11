import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseClockTime, resolveNursePatientCapacity } from '../core/operational-policy';
import { clinicDate, clinicDateFromSerial, clinicDaySerial, clinicMinuteOfDay, clinicWallClockToUtc } from '../core/clinic-time';

type Coverage = 'DAY' | 'NIGHT';

export type ScheduledCoverage = {
  startAt: Date;
  endAt: Date;
};

/**
 * Single owner for operational nursing availability. It deliberately remains
 * inside the hospitalisation module: this is a refactoring boundary, not a
 * microservice. Explicit Shift records always override the cyclic rota.
 */
@Injectable()
export class NurseSchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  async nurseCapacity(clinicId: string, serviceUnitId?: string | null): Promise<number> {
    const [clinic, unit] = await Promise.all([
      this.prisma.clinic.findUnique({ where: { id: clinicId }, select: { defaultNursePatientCapacity: true } }),
      serviceUnitId
        ? this.prisma.serviceUnit.findFirst({ where: { id: serviceUnitId, clinicId, deletedAt: null }, select: { nursePatientCapacity: true } })
        : Promise.resolve(null),
    ]);
    return resolveNursePatientCapacity(unit?.nursePatientCapacity, clinic?.defaultNursePatientCapacity);
  }

  private async shiftClockForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { clinic: { select: { timezone: true, dayShiftStart: true, dayShiftEnd: true, nightShiftStart: true, nightShiftEnd: true } } },
    });
    return {
      timezone: user?.clinic?.timezone || 'Africa/Lubumbashi',
      dayStart: parseClockTime(user?.clinic?.dayShiftStart, '07:30'),
      dayEnd: parseClockTime(user?.clinic?.dayShiftEnd, '17:30'),
      nightStart: parseClockTime(user?.clinic?.nightShiftStart, '17:30'),
      nightEnd: parseClockTime(user?.clinic?.nightShiftEnd, '07:30'),
    };
  }

  async activeShiftForUser(userId?: string | null, serviceUnitId?: string | null) {
    if (!userId) return null;
    const now = new Date();
    const clock = await this.shiftClockForUser(userId);
    const registeredShift = await this.prisma.shift.findFirst({
      where: { startAt: { lte: now }, endAt: { gte: now }, employee: { userId, status: 'ACTIVE', ...(serviceUnitId ? { OR: [{ serviceUnitId }, { serviceUnitId: null }] } : {}) } },
      include: { employee: { include: { user: true, serviceUnit: true } } }, orderBy: { startAt: 'desc' },
    });
    if (registeredShift) return registeredShift;
    const employee = await this.prisma.employee.findFirst({ where: { userId, status: 'ACTIVE', ...(serviceUnitId ? { OR: [{ serviceUnitId }, { serviceUnitId: null }] } : {}) }, include: { user: true, serviceUnit: true } });
    if (!employee || employee.shiftPattern === 'MANUAL') return null;
    const today = clinicDate(now, clock.timezone);
    const todaySerial = clinicDaySerial(today);
    const minuteOfDay = clinicMinuteOfDay(now, clock.timezone);
    const isPermanentDay = employee.shiftPattern === 'PERMANENT_DAY';
    if (!isPermanentDay && !employee.rotationAnchorAt) return null;
    const anchor = clinicDate(employee.rotationAnchorAt || now, clock.timezone);
    const dayIndex = todaySerial - clinicDaySerial(anchor);
    if (!isPermanentDay && dayIndex < 0) return null;
    const rotationDays = Math.min(31, Math.max(1, employee.rotationDays || 3));
    const phase = ((dayIndex % (rotationDays * 3)) + (rotationDays * 3)) % (rotationDays * 3);
    const previousPhase = (((dayIndex - 1) % (rotationDays * 3)) + (rotationDays * 3)) % (rotationDays * 3);
    const permanentEnd = parseClockTime(employee.permanentShiftEndTime, `${clock.dayEnd.hour.toString().padStart(2, '0')}:${clock.dayEnd.minute.toString().padStart(2, '0')}`);
    const dayStartMinutes = clock.dayStart.hour * 60 + clock.dayStart.minute;
    const nightStartMinutes = clock.nightStart.hour * 60 + clock.nightStart.minute;
    const nightEndMinutes = clock.nightEnd.hour * 60 + clock.nightEnd.minute;
    const permanentEndMinutes = permanentEnd.hour * 60 + permanentEnd.minute;
    if ((isPermanentDay || phase < rotationDays) && minuteOfDay >= dayStartMinutes && minuteOfDay < permanentEndMinutes) {
      return { startAt: clinicWallClockToUtc(today, clock.dayStart.hour, clock.dayStart.minute, clock.timezone), endAt: clinicWallClockToUtc(today, permanentEnd.hour, permanentEnd.minute, clock.timezone), employee };
    }
    const isNightDay = !isPermanentDay && phase >= rotationDays && phase < rotationDays * 2;
    const continuesPreviousNight = !isPermanentDay && previousPhase >= rotationDays && previousPhase < rotationDays * 2;
    if ((isNightDay && minuteOfDay >= nightStartMinutes) || (continuesPreviousNight && minuteOfDay < nightEndMinutes)) {
      const startDate = clinicDateFromSerial(todaySerial + (minuteOfDay < nightEndMinutes ? -1 : 0));
      const endDate = clinicDateFromSerial(todaySerial + (minuteOfDay < nightEndMinutes ? 0 : 1));
      return { startAt: clinicWallClockToUtc(startDate, clock.nightStart.hour, clock.nightStart.minute, clock.timezone), endAt: clinicWallClockToUtc(endDate, clock.nightEnd.hour, clock.nightEnd.minute, clock.timezone), employee };
    }
    return null;
  }

  async scheduledShiftForCoverage(userId: string, coverage: 'DAY' | 'NIGHT', serviceUnitId?: string | null) {
    const now = new Date();
    const clock = await this.shiftClockForUser(userId);
    const day = clinicDate(now, clock.timezone);
    const daySerial = clinicDaySerial(day);
    const startClock = coverage === 'DAY' ? clock.dayStart : clock.nightStart;
    const endClock = coverage === 'DAY' ? clock.dayEnd : clock.nightEnd;
    const start = clinicWallClockToUtc(day, startClock.hour, startClock.minute, clock.timezone);
    const end = clinicWallClockToUtc(coverage === 'DAY' ? day : clinicDateFromSerial(daySerial + 1), endClock.hour, endClock.minute, clock.timezone);
    const explicit = await this.prisma.shift.findFirst({ where: { employee: { userId, status: 'ACTIVE', ...(serviceUnitId ? { OR: [{ serviceUnitId }, { serviceUnitId: null }] } : {}) }, startAt: { lte: start }, endAt: { gte: end } }, include: { employee: { include: { user: true, serviceUnit: true } } }, orderBy: { startAt: 'desc' } });
    if (explicit) return explicit;
    const employee = await this.prisma.employee.findFirst({ where: { userId, status: 'ACTIVE', ...(serviceUnitId ? { OR: [{ serviceUnitId }, { serviceUnitId: null }] } : {}) }, include: { user: true, serviceUnit: true } });
    if (!employee || employee.shiftPattern === 'MANUAL') return null;
    if (employee.shiftPattern === 'PERMANENT_DAY') {
      if (coverage !== 'DAY') return null;
      const permanentEnd = parseClockTime(employee.permanentShiftEndTime, `${clock.dayEnd.hour.toString().padStart(2, '0')}:${clock.dayEnd.minute.toString().padStart(2, '0')}`);
      return { startAt: start, endAt: clinicWallClockToUtc(day, permanentEnd.hour, permanentEnd.minute, clock.timezone), employee };
    }
    if (!employee.rotationAnchorAt) return null;
    const dayIndex = daySerial - clinicDaySerial(clinicDate(employee.rotationAnchorAt, clock.timezone));
    if (dayIndex < 0) return null;
    const days = Math.min(31, Math.max(1, employee.rotationDays || 3));
    const phase = dayIndex % (days * 3);
    return (coverage === 'DAY' ? phase < days : phase >= days && phase < days * 2) ? { startAt: start, endAt: end, employee } : null;
  }

  /**
   * Resolves all requested coverage slots in three queries (clinic, employees,
   * explicit shifts), instead of two queries per nurse.  It intentionally
   * mirrors `scheduledShiftForCoverage`: explicit shifts win over a rotation
   * and a manual employee has no implicit coverage.
   */
  async scheduledShiftsForCoverage(
    userIds: string[],
    clinicId: string,
    serviceUnitId?: string | null,
  ): Promise<Map<string, Partial<Record<Coverage, ScheduledCoverage>>>> {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (!uniqueUserIds.length) return new Map();

    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        timezone: true,
        dayShiftStart: true,
        dayShiftEnd: true,
        nightShiftStart: true,
        nightShiftEnd: true,
      },
    });
    const timezone = clinic?.timezone || 'Africa/Lubumbashi';
    const dayStart = parseClockTime(clinic?.dayShiftStart, '07:30');
    const dayEnd = parseClockTime(clinic?.dayShiftEnd, '17:30');
    const nightStart = parseClockTime(clinic?.nightShiftStart, '17:30');
    const nightEnd = parseClockTime(clinic?.nightShiftEnd, '07:30');
    const day = clinicDate(new Date(), timezone);
    const daySerial = clinicDaySerial(day);
    const coverageWindows: Record<Coverage, ScheduledCoverage> = {
      DAY: {
        startAt: clinicWallClockToUtc(day, dayStart.hour, dayStart.minute, timezone),
        endAt: clinicWallClockToUtc(day, dayEnd.hour, dayEnd.minute, timezone),
      },
      NIGHT: {
        startAt: clinicWallClockToUtc(day, nightStart.hour, nightStart.minute, timezone),
        endAt: clinicWallClockToUtc(
          clinicDateFromSerial(daySerial + 1),
          nightEnd.hour,
          nightEnd.minute,
          timezone,
        ),
      },
    };

    const employeeScope = {
      userId: { in: uniqueUserIds },
      clinicId,
      status: 'ACTIVE' as const,
      ...(serviceUnitId
        ? { OR: [{ serviceUnitId }, { serviceUnitId: null }] }
        : {}),
    };
    const [employees, explicitShifts] = await Promise.all([
      this.prisma.employee.findMany({
        where: employeeScope,
        select: {
          userId: true,
          shiftPattern: true,
          rotationAnchorAt: true,
          rotationDays: true,
          permanentShiftEndTime: true,
        },
      }),
      this.prisma.shift.findMany({
        where: {
          employee: employeeScope,
          OR: (['DAY', 'NIGHT'] as const).map((coverage) => ({
            startAt: { lte: coverageWindows[coverage].startAt },
            endAt: { gte: coverageWindows[coverage].endAt },
          })),
        },
        select: {
          startAt: true,
          endAt: true,
          employee: { select: { userId: true } },
        },
        orderBy: { startAt: 'desc' },
      }),
    ]);

    const explicitByUser = new Map<string, typeof explicitShifts>();
    for (const shift of explicitShifts) {
      const userShifts = explicitByUser.get(shift.employee.userId) || [];
      userShifts.push(shift);
      explicitByUser.set(shift.employee.userId, userShifts);
    }

    const result = new Map<string, Partial<Record<Coverage, ScheduledCoverage>>>();
    for (const employee of employees) {
      const coverage: Partial<Record<Coverage, ScheduledCoverage>> = {};
      for (const kind of ['DAY', 'NIGHT'] as const) {
        const window = coverageWindows[kind];
        const explicit = (explicitByUser.get(employee.userId) || []).find(
          (shift) => shift.startAt <= window.startAt && shift.endAt >= window.endAt,
        );
        if (explicit) {
          coverage[kind] = { startAt: explicit.startAt, endAt: explicit.endAt };
          continue;
        }
        if (employee.shiftPattern === 'MANUAL') continue;
        if (employee.shiftPattern === 'PERMANENT_DAY') {
          if (kind === 'DAY') {
            const permanentEnd = parseClockTime(
              employee.permanentShiftEndTime,
              `${dayEnd.hour.toString().padStart(2, '0')}:${dayEnd.minute.toString().padStart(2, '0')}`,
            );
            coverage.DAY = {
              startAt: window.startAt,
              endAt: clinicWallClockToUtc(day, permanentEnd.hour, permanentEnd.minute, timezone),
            };
          }
          continue;
        }
        if (!employee.rotationAnchorAt) continue;
        const dayIndex = daySerial - clinicDaySerial(clinicDate(employee.rotationAnchorAt, timezone));
        if (dayIndex < 0) continue;
        const days = Math.min(31, Math.max(1, employee.rotationDays || 3));
        const phase = dayIndex % (days * 3);
        if ((kind === 'DAY' && phase < days) || (kind === 'NIGHT' && phase >= days && phase < days * 2)) {
          coverage[kind] = window;
        }
      }
      if (coverage.DAY || coverage.NIGHT) result.set(employee.userId, coverage);
    }

    return result;
  }
}
