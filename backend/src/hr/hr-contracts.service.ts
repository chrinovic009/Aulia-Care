import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ContractType } from '@prisma/client';
import { AuthenticatedActor } from '../core/clinic-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { HR_ROLES, HrAccess } from './hr-access';
import { calendarIso, daySerial, parseCalendarDate } from './hr-dates';

const CONTRACT_TYPES = Object.values(ContractType) as string[];
const money = (value: unknown, label: string) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e10) throw new BadRequestException(`${label} : montant invalide.`);
  return Math.round(amount * 100) / 100;
};

/**
 * Employment contracts and salaries. A salary can change at any time: the
 * current contract version is closed the day before the new salary applies
 * and a new version starts, so the history stays readable and a payroll
 * already paid is never altered.
 */
@Injectable()
export class HrContractsService {
  constructor(private readonly prisma: PrismaService, private readonly access: HrAccess) {}

  async employees(actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.readers, 'Liste du personnel réservée à la finance et à l’administration.');
    const today = daySerial(new Date());
    const employees = await this.prisma.employee.findMany({
      where: { clinicId: actor.clinicId },
      select: {
        id: true, firstName: true, lastName: true, position: true, status: true, hireDate: true, terminationDate: true, shiftPattern: true,
        department: { select: { name: true } }, user: { select: { primaryRole: true, displayName: true } },
        contracts: { where: { active: true }, orderBy: { startDate: 'desc' }, take: 1 },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 2_000,
    });
    return {
      canEdit: this.access.hasRole(actor, HR_ROLES.contracts),
      employees: employees.map((employee) => {
        const contract = employee.contracts[0] ?? null;
        const endsInDays = contract?.endDate ? daySerial(contract.endDate) - today : null;
        return {
          id: employee.id, name: `${employee.firstName} ${employee.lastName}`, position: employee.position, status: employee.status,
          role: employee.user?.primaryRole ?? null, department: employee.department?.name ?? null,
          hireDate: employee.hireDate, terminationDate: employee.terminationDate, shiftPattern: employee.shiftPattern,
          contract: contract && { id: contract.id, type: contract.type, startDate: calendarIso(contract.startDate), endDate: contract.endDate ? calendarIso(contract.endDate) : null, salary: contract.salary === null ? null : Number(contract.salary), currency: contract.currency ?? 'CDF', reason: contract.reason },
          contractEndsInDays: endsInDays,
          alert: !contract ? 'NO_CONTRACT' : contract.salary === null ? 'NO_SALARY' : endsInDays !== null && endsInDays < 0 ? 'EXPIRED' : endsInDays !== null && endsInDays <= 30 ? 'ENDING_SOON' : null,
        };
      }),
    };
  }

  async history(employeeId: string, actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.readers, 'Contrats réservés à la finance et à l’administration.');
    await this.access.employeeOfClinic(actor.clinicId, employeeId);
    const contracts = await this.prisma.employeeContract.findMany({ where: { employeeId }, orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }] });
    return contracts.map((contract) => ({
      id: contract.id, type: contract.type, active: contract.active, reason: contract.reason, createdAt: contract.createdAt,
      startDate: calendarIso(contract.startDate), endDate: contract.endDate ? calendarIso(contract.endDate) : null,
      salary: contract.salary === null ? null : Number(contract.salary), currency: contract.currency ?? 'CDF', frequency: contract.frequency,
    }));
  }

  /** New contract (hiring, renewal, change of type). The previous active contract ends the day before. */
  async create(employeeId: string, input: { type?: string; startDate: string; endDate?: string | null; salary: number; currency?: string; reason?: string }, actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.contracts, 'Les contrats sont gérés par la finance et l’administration.');
    await this.access.employeeOfClinic(actor.clinicId, employeeId);
    const type = input.type ?? 'PERMANENT';
    if (!CONTRACT_TYPES.includes(type)) throw new BadRequestException('Type de contrat inconnu.');
    const startDate = parseCalendarDate(input.startDate, 'Début du contrat');
    const endDate = input.endDate ? parseCalendarDate(input.endDate, 'Fin du contrat') : null;
    if (endDate && endDate < startDate) throw new BadRequestException('La fin du contrat précède son début.');
    if (type !== 'PERMANENT' && !endDate) throw new BadRequestException('Un contrat à durée déterminée ou de prestation doit avoir une date de fin.');
    const salary = money(input.salary, 'Salaire');
    const currency = (input.currency || (await this.access.clock(actor.clinicId)).currency).toUpperCase().slice(0, 3);
    const created = await this.prisma.$transaction(async (tx) => {
      const current = await tx.employeeContract.findFirst({ where: { employeeId, active: true }, orderBy: { startDate: 'desc' } });
      if (current) {
        if (startDate <= current.startDate) throw new ConflictException('Le nouveau contrat doit commencer après le début du contrat en cours.');
        await tx.employeeContract.update({ where: { id: current.id }, data: { active: false, endDate: current.endDate && current.endDate < startDate ? current.endDate : new Date(startDate.getTime() - 86_400_000) } });
      }
      return tx.employeeContract.create({ data: { employeeId, type: type as ContractType, startDate, endDate, salary, currency, frequency: 'MONTHLY', reason: input.reason?.trim() || 'Nouveau contrat', createdById: actor.id } });
    });
    await this.access.audit(actor.id, 'EmployeeContract', created.id, 'CREATE', { event: 'CONTRACT_CREATED', employeeId, type, salary, currency, startDate: input.startDate });
    return created;
  }

  /** Salary change, effective from a date: may be done at any time, never alters a paid payroll. */
  async changeSalary(employeeId: string, input: { salary: number; effectiveDate: string; reason?: string }, actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.contracts, 'Les salaires sont gérés par la finance et l’administration.');
    await this.access.employeeOfClinic(actor.clinicId, employeeId);
    const salary = money(input.salary, 'Salaire');
    const effective = parseCalendarDate(input.effectiveDate, 'Date d’effet');
    const reason = input.reason?.trim();
    if (!reason) throw new BadRequestException('Indiquez le motif du changement de salaire.');
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.employeeContract.findFirst({ where: { employeeId, active: true }, orderBy: { startDate: 'desc' } });
      if (!current) throw new NotFoundException('Aucun contrat en cours : créez d’abord un contrat.');
      if (current.endDate && effective > current.endDate) throw new BadRequestException('Le contrat se termine avant cette date : créez un nouveau contrat.');
      // Same start date: a correction of the current version rather than a new one.
      if (effective <= current.startDate) {
        const updated = await tx.employeeContract.update({ where: { id: current.id }, data: { salary, reason } });
        return { contract: updated, previousSalary: current.salary === null ? null : Number(current.salary) };
      }
      await tx.employeeContract.update({ where: { id: current.id }, data: { active: false, endDate: new Date(effective.getTime() - 86_400_000) } });
      const next = await tx.employeeContract.create({
        data: { employeeId, type: current.type, startDate: effective, endDate: current.endDate, salary, currency: current.currency, frequency: current.frequency ?? 'MONTHLY', reason, createdById: actor.id },
      });
      return { contract: next, previousSalary: current.salary === null ? null : Number(current.salary) };
    });
    await this.access.audit(actor.id, 'EmployeeContract', result.contract.id, 'UPDATE', { event: 'SALARY_CHANGED', employeeId, salary, effectiveDate: input.effectiveDate, reason }, { salary: result.previousSalary });
    return result.contract;
  }

  /** Ends a contract (end date) or changes its type. */
  async update(contractId: string, input: { endDate?: string | null; type?: string }, actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.contracts, 'Les contrats sont gérés par la finance et l’administration.');
    const contract = await this.prisma.employeeContract.findFirst({ where: { id: contractId, employee: { clinicId: actor.clinicId } } });
    if (!contract) throw new NotFoundException('Contrat introuvable dans votre établissement.');
    const data: { endDate?: Date | null; type?: ContractType } = {};
    if (input.endDate !== undefined) {
      data.endDate = input.endDate ? parseCalendarDate(input.endDate, 'Fin du contrat') : null;
      if (data.endDate && data.endDate < contract.startDate) throw new BadRequestException('La fin du contrat précède son début.');
    }
    if (input.type !== undefined) {
      if (!CONTRACT_TYPES.includes(input.type)) throw new BadRequestException('Type de contrat inconnu.');
      data.type = input.type as ContractType;
    }
    const updated = await this.prisma.employeeContract.update({ where: { id: contractId }, data });
    await this.access.audit(actor.id, 'EmployeeContract', contractId, 'UPDATE', { event: 'CONTRACT_UPDATED', ...input }, { endDate: contract.endDate ? calendarIso(contract.endDate) : null, type: contract.type });
    return updated;
  }
}
