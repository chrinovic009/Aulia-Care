import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseClockTime, resolveNursePatientCapacity } from '../core/operational-policy';
import { clinicDate, clinicDateFromSerial, clinicDaySerial, clinicMinuteOfDay, clinicWallClockToUtc } from '../core/clinic-time';

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
}
