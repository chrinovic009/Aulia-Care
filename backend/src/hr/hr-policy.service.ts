import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthenticatedActor } from '../core/clinic-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { HR_ROLES, HrAccess } from './hr-access';

const integer = (value: unknown, label: string, min: number, max: number) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new BadRequestException(`${label} : valeur entre ${min} et ${max} attendue.`);
  return number;
};
const decimal = (value: unknown, label: string, min: number, max: number) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new BadRequestException(`${label} : valeur entre ${min} et ${max} attendue.`);
  return Math.round(number * 100) / 100;
};

/** The establishment's HR rules: pay date, lateness tolerance, deduction bases, leave entitlement. */
@Injectable()
export class HrPolicyService {
  constructor(private readonly prisma: PrismaService, private readonly access: HrAccess) {}

  async get(actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.readers, 'Règles RH réservées à la finance et à l’administration.');
    return { ...(await this.access.rules(actor.clinicId)), canEdit: this.access.hasRole(actor, HR_ROLES.policy) };
  }

  async update(input: Record<string, unknown>, actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.policy, 'Les règles RH sont fixées par la finance et l’administration.');
    const days = Array.isArray(input.workWeekDays) ? [...new Set(input.workWeekDays.map(Number))].filter((day) => Number.isInteger(day) && day >= 1 && day <= 7).sort() : null;
    if (!days?.length) throw new BadRequestException('Choisissez au moins un jour de travail.');
    const data = {
      payDay: integer(input.payDay, 'Jour de paie', 1, 31),
      lateGraceMinutes: integer(input.lateGraceMinutes, 'Tolérance de retard (minutes)', 0, 120),
      monthlyWorkingHours: decimal(input.monthlyWorkingHours, 'Heures de travail par mois', 1, 400),
      workingDaysPerMonth: integer(input.workingDaysPerMonth, 'Jours de travail par mois', 1, 31),
      leaveDaysPerMonth: decimal(input.leaveDaysPerMonth, 'Jours de congé acquis par mois', 0, 5),
      seniorityBonusYears: integer(input.seniorityBonusYears, 'Années d’ancienneté par jour de congé supplémentaire', 0, 50),
      workWeekDays: days.join(','),
      updatedById: actor.id,
    };
    await this.prisma.hrPolicy.upsert({ where: { clinicId: actor.clinicId }, create: { clinicId: actor.clinicId, ...data }, update: data });
    await this.access.audit(actor.id, 'HrPolicy', actor.clinicId, 'UPDATE', { event: 'HR_POLICY_UPDATED', ...data });
    return this.get(actorInput);
  }
}
