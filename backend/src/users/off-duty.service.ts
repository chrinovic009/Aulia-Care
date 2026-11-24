import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

/** Staff whose presence is clocked; administrators, the platform and patients are never put off duty. */
const CLOCKED_ROLES = new Set([
  'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'LAB_MANAGER', 'LAB_TECHNICIAN', 'RADIOLOGIST', 'PHARMACIST', 'CASHIER', 'FINANCE',
  'SURGEON', 'ANESTHESIOLOGIST', 'MIDWIFE', 'PARAMEDIC', 'DISPATCHER',
]);
/** After a validated departure, the session stays readable at most this long (then the next arrival reopens it). */
const OFF_DUTY_MAX_MS = 14 * 3_600_000;
/** Writes still allowed off duty: signing in or out, the clock and the shift hand-over themselves. */
const ALWAYS_ALLOWED = [/^\/api\/auth\//, /^\/api\/users\/me\/(clock-in|clock-out|shift-handover|work-mode)/];

export type WorkMode = { readOnly: boolean; since?: Date; until?: Date };

/**
 * Off-duty read-only mode. Once an employee has validated their departure at
 * the end of their shift, their session is not closed: they keep reading
 * (results, files, messages) but can no longer write anything, until their
 * next planned shift starts.
 */
@Injectable()
export class OffDutyService {
  private readonly cache = new Map<string, { at: number; mode: WorkMode }>();

  constructor(private readonly prisma: PrismaService, private readonly users: UsersService) {}

  forget(userId: string) { this.cache.delete(userId); }

  async workMode(userId: string, now = new Date()): Promise<WorkMode> {
    const cached = this.cache.get(userId);
    if (cached && now.getTime() - cached.at < 20_000) return cached.mode;
    const mode = await this.compute(userId, now);
    this.cache.set(userId, { at: now.getTime(), mode });
    if (this.cache.size > 5_000) this.cache.clear();
    return mode;
  }

  private async compute(userId: string, now: Date): Promise<WorkMode> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { primaryRole: true } });
    if (!user?.primaryRole || !CLOCKED_ROLES.has(user.primaryRole)) return { readOnly: false };
    const employee = await this.prisma.employee.findFirst({
      where: { userId, status: 'ACTIVE' },
      select: { id: true, clinicId: true, shiftPattern: true, rotationAnchorAt: true, rotationDays: true, permanentShiftEndTime: true },
    });
    if (!employee) return { readOnly: false };
    const open = await this.prisma.attendance.findFirst({ where: { employeeId: employee.id, clockOutAt: null, clockInAt: { not: null } }, select: { id: true } });
    if (open) return { readOnly: false };
    const last = await this.prisma.attendance.findFirst({
      where: { employeeId: employee.id, clockOutAt: { not: null }, status: { not: 'ABSENT' } },
      orderBy: { clockOutAt: 'desc' }, select: { clockOutAt: true },
    });
    if (!last?.clockOutAt || now.getTime() - last.clockOutAt.getTime() > OFF_DUTY_MAX_MS || last.clockOutAt > now) return { readOnly: false };
    // A new planned shift has started since the departure: the next clock-in reopens writing.
    const planned = await this.users.resolvePlannedShift(employee, now);
    if (planned && planned.startAt > last.clockOutAt) return { readOnly: false };
    return { readOnly: true, since: last.clockOutAt, until: new Date(last.clockOutAt.getTime() + OFF_DUTY_MAX_MS) };
  }

  /** Clock-in that never reopens a shift the employee has just left. */
  async clockIn(userId: string) {
    const mode = await this.workMode(userId);
    if (mode.readOnly) return { readOnly: true, since: mode.since, until: mode.until };
    const result = await this.users.clockIn(userId);
    this.forget(userId);
    return result;
  }
}

type HttpRequest = { method?: string; originalUrl?: string; url?: string; user?: { userId?: string } };

/** Refuses every write of an off-duty session, whichever endpoint it targets. */
@Injectable()
export class OffDutyReadOnlyInterceptor implements NestInterceptor {
  constructor(private readonly offDuty: OffDutyService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const method = (request.method ?? 'GET').toUpperCase();
    const userId = request.user?.userId;
    if (!userId || ['GET', 'HEAD', 'OPTIONS'].includes(method)) return next.handle();
    const path = (request.originalUrl ?? request.url ?? '').split('?')[0];
    if (ALWAYS_ALLOWED.some((pattern) => pattern.test(path))) return next.handle();
    if ((await this.offDuty.workMode(userId)).readOnly) {
      throw new ForbiddenException('Votre poste est terminé : votre session est en lecture seule jusqu’à votre prochain poste.');
    }
    return next.handle();
  }
}
