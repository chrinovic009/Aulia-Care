import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoleSlug } from '@prisma/client';
import { AuthenticatedActor, ClinicContextService, OperationalClinicActor } from '../core/clinic-context.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_HR_RULES, HrRules } from './domain/hr-rules';

/** Who may do what in human resources. */
export const HR_ROLES = {
  /** Payroll is managed by finance only. */
  payroll: [RoleSlug.FINANCE],
  /** Contracts and salaries: finance and the establishment's administration. */
  contracts: [RoleSlug.FINANCE, RoleSlug.ADMIN],
  /** Leave, replacements and attendance corrections are decided by the administration. */
  decisions: [RoleSlug.ADMIN],
  /** Everything HR is visible to finance, the administration and the super administration. */
  readers: [RoleSlug.FINANCE, RoleSlug.ADMIN, RoleSlug.SUPER_ADMIN],
  /** HR rules (pay date, tolerance, leave entitlement). */
  policy: [RoleSlug.FINANCE, RoleSlug.ADMIN],
} as const;

export type ClinicClock = { timezone: string; dayShiftStart: string | null; dayShiftEnd: string | null; nightShiftStart: string | null; nightShiftEnd: string | null; currency: string };

@Injectable()
export class HrAccess {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicContext: ClinicContextService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The actor, refused unless one of their roles is allowed. */
  async actor(input: AuthenticatedActor | undefined, allowed: readonly RoleSlug[], message: string): Promise<OperationalClinicActor> {
    const actor = await this.clinicContext.requireOperationalActor(input);
    const roles = new Set<RoleSlug>([...(actor.primaryRole ? [actor.primaryRole] : []), ...actor.roles]);
    if (!allowed.some((role) => roles.has(role))) throw new ForbiddenException(message);
    return actor;
  }

  hasRole(actor: OperationalClinicActor, allowed: readonly RoleSlug[]) {
    return allowed.some((role) => actor.primaryRole === role || actor.roles.includes(role));
  }

  /** The connected person's own employee record (self-service). */
  async self(input: AuthenticatedActor | undefined) {
    const actor = await this.clinicContext.requireOperationalActor(input);
    const employee = await this.prisma.employee.findFirst({
      where: { userId: actor.id, clinicId: actor.clinicId, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, position: true, hireDate: true, clinicId: true, shiftPattern: true, rotationAnchorAt: true, rotationDays: true, permanentShiftEndTime: true },
    });
    if (!employee) throw new NotFoundException('Votre fiche employé n’existe pas encore : demandez à l’administration de la créer.');
    return { actor, employee };
  }

  async employeeOfClinic(clinicId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, clinicId }, select: { id: true, firstName: true, lastName: true, userId: true, hireDate: true, status: true } });
    if (!employee) throw new NotFoundException('Employé introuvable dans votre établissement.');
    return employee;
  }

  async rules(clinicId: string): Promise<HrRules> {
    const policy = await this.prisma.hrPolicy.findUnique({ where: { clinicId } });
    if (!policy) return DEFAULT_HR_RULES;
    return {
      payDay: policy.payDay, lateGraceMinutes: policy.lateGraceMinutes,
      monthlyWorkingHours: Number(policy.monthlyWorkingHours), workingDaysPerMonth: policy.workingDaysPerMonth,
      leaveDaysPerMonth: Number(policy.leaveDaysPerMonth), seniorityBonusYears: policy.seniorityBonusYears,
      workWeekDays: policy.workWeekDays.split(',').map(Number).filter((day) => day >= 1 && day <= 7),
    };
  }

  async clock(clinicId: string): Promise<ClinicClock> {
    const clinic = await this.prisma.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: { timezone: true, dayShiftStart: true, dayShiftEnd: true, nightShiftStart: true, nightShiftEnd: true, currency: true } });
    return { ...clinic, timezone: clinic.timezone || 'Africa/Lubumbashi', currency: clinic.currency || 'CDF' };
  }

  async administratorIds(clinicId: string) {
    const users = await this.prisma.user.findMany({ where: { clinicId, primaryRole: RoleSlug.ADMIN, status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    return users.map((user) => user.id);
  }

  /** Best-effort notification: an HR decision is never undone because a message failed. */
  async notify(recipientIds: Array<string | null | undefined>, title: string, message: string, relatedEntity: string, relatedId: string, priority: 'MEDIUM' | 'HIGH' = 'MEDIUM') {
    for (const recipientId of new Set(recipientIds.filter((id): id is string => Boolean(id)))) {
      await this.notifications.createAndEmit({ recipientId, title, message, relatedEntity, relatedId, type: 'SYSTEM', priority }).catch(() => undefined);
    }
  }

  audit(actorId: string, entity: string, entityId: string, action: 'CREATE' | 'UPDATE' | 'APPROVE' | 'REJECT', after: Prisma.InputJsonValue, before?: Prisma.InputJsonValue) {
    return this.prisma.auditTrail.create({ data: { actorId, entity, entityId, action, after, ...(before !== undefined ? { before } : {}) } });
  }
}
