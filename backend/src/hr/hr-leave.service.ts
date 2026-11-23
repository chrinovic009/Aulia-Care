import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedActor } from '../core/clinic-context.service';
import { clinicDate, clinicWallClockToUtc } from '../core/clinic-time';
import { PrismaService } from '../prisma/prisma.service';
import { formatDuration, isLeaveType, leaveEntitlement, LEAVE_TYPES, workingDaysBetween } from './domain/hr-rules';
import { HrAttendanceService } from './hr-attendance.service';
import { HR_ROLES, HrAccess } from './hr-access';
import { calendarIso, parseCalendarDate } from './hr-dates';
import { HrPayrollService } from './hr-payroll.service';

const OPEN_REPLACEMENT = ['PENDING_COLLEAGUE', 'PENDING_ADMIN'];
const employeeName = (employee: { firstName: string; lastName: string }) => `${employee.firstName} ${employee.lastName}`;
const parseInstant = (value: unknown, label: string) => {
  const date = typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} : date et heure invalides.`);
  return date;
};

/**
 * Leave and replacements. Every employee asks from their own space (annual
 * leave, illness, bereavement and other events) and may propose a colleague
 * to replace them; the colleague accepts, the administration decides. Annual
 * leave is taken from a balance acquired month by month (RDC labour code).
 */
@Injectable()
export class HrLeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HrAccess,
    private readonly attendance: HrAttendanceService,
    private readonly payroll: HrPayrollService,
  ) {}

  /** Annual leave balance of the current year. */
  async balance(clinicId: string, employee: { id: string; hireDate: Date | null }, now = new Date()) {
    const rules = await this.access.rules(clinicId);
    const year = now.getUTCFullYear();
    const entitlement = leaveEntitlement({ hireDate: employee.hireDate, asOf: now, year, rules });
    const annual = await this.prisma.leaveRequest.findMany({
      where: { employeeId: employee.id, leaveType: 'ANNUAL', status: { in: ['APPROVED', 'PENDING'] }, startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
      select: { status: true, days: true },
    });
    const taken = annual.filter((row) => row.status === 'APPROVED').reduce((sum, row) => sum + Number(row.days ?? 0), 0);
    const pending = annual.filter((row) => row.status === 'PENDING').reduce((sum, row) => sum + Number(row.days ?? 0), 0);
    return { year, ...entitlement, taken, pending, remaining: Math.round((entitlement.acquired - taken) * 2) / 2 };
  }

  // ------------------------------------------------------------------ self-service

  async mySpace(actorInput?: AuthenticatedActor) {
    const { actor, employee } = await this.access.self(actorInput);
    const clock = await this.access.clock(actor.clinicId);
    const local = clinicDate(new Date(), clock.timezone);
    const month = `${local.year}-${String(local.month).padStart(2, '0')}`;
    const [balance, leaves, asked, askedOfMe, facts, payslips] = await Promise.all([
      this.balance(actor.clinicId, employee),
      this.prisma.leaveRequest.findMany({ where: { employeeId: employee.id }, orderBy: { requestedAt: 'desc' }, take: 50 }),
      this.prisma.replacementRequest.findMany({ where: { requesterId: employee.id }, include: { replacer: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.replacementRequest.findMany({ where: { replacerId: employee.id }, include: { requester: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.attendance.monthFacts(actor.clinicId, month, [employee.id]),
      this.payroll.mine(employee.id),
    ]);
    const fact = facts.get(employee.id);
    return {
      employee: { id: employee.id, name: employeeName(employee), position: employee.position, hireDate: employee.hireDate },
      leaveTypes: Object.entries(LEAVE_TYPES).map(([code, type]) => ({ code, label: type.label, deductsBalance: type.deductsBalance })),
      balance,
      leaves: leaves.map((leave) => this.leaveView(leave)),
      replacementsAsked: asked.map((row) => ({ ...this.replacementView(row), colleague: employeeName(row.replacer) })),
      replacementsAskedOfMe: askedOfMe.map((row) => ({ ...this.replacementView(row), colleague: employeeName(row.requester) })),
      attendance: fact && {
        month, plannedShifts: fact.plannedShifts, presentShifts: fact.presentShifts,
        lateCount: fact.lateEntries.length, lateDuration: formatDuration(fact.lateMinutes), lateEntries: fact.lateEntries, absences: fact.absences,
      },
      payslips,
    };
  }

  async colleagues(actorInput?: AuthenticatedActor) {
    const { actor, employee } = await this.access.self(actorInput);
    const rows = await this.prisma.employee.findMany({
      where: { clinicId: actor.clinicId, status: 'ACTIVE', id: { not: employee.id } },
      select: { id: true, firstName: true, lastName: true, position: true, department: { select: { name: true } } },
      orderBy: [{ lastName: 'asc' }], take: 2_000,
    });
    return rows.map((row) => ({ id: row.id, name: employeeName(row), position: row.position, department: row.department?.name ?? null }));
  }

  async requestLeave(input: { type: string; startDate: string; endDate: string; reason?: string; replacementEmployeeId?: string | null }, actorInput?: AuthenticatedActor) {
    const { actor, employee } = await this.access.self(actorInput);
    if (!isLeaveType(input.type)) throw new BadRequestException('Type de congé inconnu.');
    const startDate = parseCalendarDate(input.startDate, 'Début');
    const endDate = parseCalendarDate(input.endDate, 'Fin');
    let days: number;
    try { days = workingDaysBetween(input.startDate, input.endDate); } catch (error) { throw new BadRequestException((error as Error).message); }
    if (days === 0) throw new BadRequestException('Cette période ne compte aucun jour ouvrable.');
    const reason = input.reason?.trim() || null;
    if (input.type !== 'ANNUAL' && !reason) throw new BadRequestException('Précisez le motif (ex. : décès d’un proche, certificat médical…).');
    const overlap = await this.prisma.leaveRequest.findFirst({ where: { employeeId: employee.id, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: endDate }, endDate: { gte: startDate } } });
    if (overlap) throw new ConflictException('Vous avez déjà une demande sur cette période.');
    let replacer: { id: string; firstName: string; lastName: string; userId: string | null } | null = null;
    if (input.replacementEmployeeId) {
      if (input.replacementEmployeeId === employee.id) throw new BadRequestException('Vous ne pouvez pas vous remplacer vous-même.');
      replacer = await this.access.employeeOfClinic(actor.clinicId, input.replacementEmployeeId);
    }
    const leave = await this.prisma.leaveRequest.create({
      data: { employeeId: employee.id, leaveType: input.type, startDate, endDate, reason, days, deductsBalance: LEAVE_TYPES[input.type].deductsBalance, replacementEmployeeId: replacer?.id ?? null },
    });
    if (replacer) {
      const clock = await this.access.clock(actor.clinicId);
      const toLocal = (date: Date) => ({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
      const replacement = await this.prisma.replacementRequest.create({
        data: {
          clinicId: actor.clinicId, requesterId: employee.id, replacerId: replacer.id, leaveRequestId: leave.id,
          startAt: clinicWallClockToUtc(toLocal(startDate), 0, 0, clock.timezone), endAt: clinicWallClockToUtc(toLocal(endDate), 23, 59, clock.timezone),
          reason: `${LEAVE_TYPES[input.type].label}${reason ? ` — ${reason}` : ''}`,
        },
      });
      await this.access.notify([replacer.userId], 'Demande de remplacement', `${employeeName(employee)} vous demande de le remplacer du ${input.startDate} au ${input.endDate}.`, 'replacement-request', replacement.id);
    }
    await this.access.notify(await this.access.administratorIds(actor.clinicId), `Demande : ${LEAVE_TYPES[input.type].label}`, `${employeeName(employee)} — du ${input.startDate} au ${input.endDate} (${days} j).`, 'leave-request', leave.id);
    return this.leaveView(leave);
  }

  async cancelLeave(leaveId: string, actorInput?: AuthenticatedActor) {
    const { employee } = await this.access.self(actorInput);
    const leave = await this.prisma.leaveRequest.findFirst({ where: { id: leaveId, employeeId: employee.id } });
    if (!leave) throw new NotFoundException('Demande introuvable.');
    if (leave.status !== 'PENDING') throw new ConflictException('Seule une demande en attente peut être annulée ; une décision prise se modifie avec l’administration.');
    await this.prisma.$transaction([
      this.prisma.leaveRequest.update({ where: { id: leaveId }, data: { status: 'CANCELLED' } }),
      this.prisma.replacementRequest.updateMany({ where: { leaveRequestId: leaveId, status: { in: OPEN_REPLACEMENT } }, data: { status: 'CANCELLED' } }),
    ]);
    return { cancelled: true };
  }

  async requestReplacement(input: { replacerId: string; startAt: string; endAt: string; reason?: string }, actorInput?: AuthenticatedActor) {
    const { actor, employee } = await this.access.self(actorInput);
    if (input.replacerId === employee.id) throw new BadRequestException('Vous ne pouvez pas vous remplacer vous-même.');
    const replacer = await this.access.employeeOfClinic(actor.clinicId, input.replacerId);
    const startAt = parseInstant(input.startAt, 'Début');
    const endAt = parseInstant(input.endAt, 'Fin');
    if (endAt <= startAt) throw new BadRequestException('La fin du remplacement doit suivre son début.');
    if (endAt.getTime() - startAt.getTime() > 31 * 86_400_000) throw new BadRequestException('Un remplacement couvre 31 jours au plus : faites une demande de congé pour une absence plus longue.');
    const reason = input.reason?.trim();
    if (!reason) throw new BadRequestException('Précisez le motif du remplacement.');
    const row = await this.prisma.replacementRequest.create({ data: { clinicId: actor.clinicId, requesterId: employee.id, replacerId: replacer.id, startAt, endAt, reason } });
    await this.access.notify([replacer.userId], 'Demande de remplacement', `${employeeName(employee)} vous demande de le remplacer : ${reason}.`, 'replacement-request', row.id);
    return this.replacementView(row);
  }

  async respondReplacement(id: string, input: { accept: boolean; note?: string }, actorInput?: AuthenticatedActor) {
    const { actor, employee } = await this.access.self(actorInput);
    const row = await this.prisma.replacementRequest.findFirst({ where: { id, replacerId: employee.id }, include: { requester: { select: { userId: true, firstName: true, lastName: true } } } });
    if (!row) throw new NotFoundException('Demande de remplacement introuvable.');
    if (row.status !== 'PENDING_COLLEAGUE') throw new ConflictException('Vous avez déjà répondu à cette demande.');
    const status = input.accept ? 'PENDING_ADMIN' : 'DECLINED';
    const updated = await this.prisma.replacementRequest.update({ where: { id }, data: { status, colleagueNote: input.note?.trim() || null, colleagueRespondedAt: new Date() } });
    await this.access.notify([row.requester.userId], input.accept ? 'Remplacement accepté' : 'Remplacement refusé', `${employeeName(employee)} ${input.accept ? 'accepte' : 'refuse'} de vous remplacer${input.accept ? ' ; l’administration doit encore valider' : ''}.`, 'replacement-request', id);
    if (input.accept) await this.access.notify(await this.access.administratorIds(actor.clinicId), 'Remplacement à valider', `${employeeName(employee)} remplacera ${employeeName(row.requester)}.`, 'replacement-request', id);
    return this.replacementView(updated);
  }

  async cancelReplacement(id: string, actorInput?: AuthenticatedActor) {
    const { employee } = await this.access.self(actorInput);
    const updated = await this.prisma.replacementRequest.updateMany({ where: { id, requesterId: employee.id, status: { in: OPEN_REPLACEMENT } }, data: { status: 'CANCELLED' } });
    if (!updated.count) throw new ConflictException('Cette demande n’est plus en attente.');
    return { cancelled: true };
  }

  // ------------------------------------------------------------------ administration

  async leaves(status: string | undefined, actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.readers, 'Congés réservés à la finance et à l’administration.');
    const rows = await this.prisma.leaveRequest.findMany({
      where: { employee: { clinicId: actor.clinicId }, ...(status ? { status: status as 'PENDING' } : {}) },
      include: { employee: { select: { id: true, firstName: true, lastName: true, position: true, hireDate: true, department: { select: { name: true } } } }, decidedBy: { select: { displayName: true, firstName: true, lastName: true } } },
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }], take: 500,
    });
    const balances = new Map<string, Awaited<ReturnType<HrLeaveService['balance']>>>();
    for (const row of rows) if (row.leaveType === 'ANNUAL' && row.status === 'PENDING' && !balances.has(row.employeeId)) balances.set(row.employeeId, await this.balance(actor.clinicId, row.employee));
    return {
      canDecide: this.access.hasRole(actor, HR_ROLES.decisions),
      leaves: rows.map((row) => ({
        ...this.leaveView(row),
        employee: { id: row.employee.id, name: employeeName(row.employee), position: row.employee.position, department: row.employee.department?.name ?? null },
        decidedBy: row.decidedBy ? row.decidedBy.displayName || `${row.decidedBy.firstName} ${row.decidedBy.lastName}` : null,
        balance: balances.get(row.employeeId) ?? null,
      })),
    };
  }

  async decideLeave(id: string, input: { decision: 'APPROVE' | 'REJECT'; note?: string; force?: boolean }, actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.decisions, 'Seule l’administration accorde ou refuse un congé.');
    const leave = await this.prisma.leaveRequest.findFirst({ where: { id, employee: { clinicId: actor.clinicId } }, include: { employee: { select: { id: true, userId: true, hireDate: true, firstName: true, lastName: true } } } });
    if (!leave) throw new NotFoundException('Demande introuvable dans votre établissement.');
    if (leave.status !== 'PENDING') throw new ConflictException('Cette demande a déjà été traitée.');
    if (leave.employee.userId === actor.id) throw new ForbiddenException('Votre propre demande doit être décidée par un autre administrateur.');
    if (!['APPROVE', 'REJECT'].includes(input.decision)) throw new BadRequestException('Décision attendue : APPROVE ou REJECT.');
    const note = input.note?.trim() || null;
    if (input.decision === 'REJECT' && !note) throw new BadRequestException('Indiquez la raison du refus.');
    if (input.decision === 'APPROVE' && leave.deductsBalance) {
      const balance = await this.balance(actor.clinicId, leave.employee);
      if (Number(leave.days ?? 0) > balance.remaining && !input.force) {
        throw new ConflictException(`Solde insuffisant : ${balance.remaining} j restants pour ${Number(leave.days)} j demandés. Confirmez pour accorder quand même.`);
      }
    }
    const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const updated = await this.prisma.leaveRequest.update({ where: { id }, data: { status, decidedAt: new Date(), decidedById: actor.id, decisionNote: note } });
    if (status === 'REJECTED') await this.prisma.replacementRequest.updateMany({ where: { leaveRequestId: id, status: { in: OPEN_REPLACEMENT } }, data: { status: 'CANCELLED' } });
    await this.access.audit(actor.id, 'LeaveRequest', id, status === 'APPROVED' ? 'APPROVE' : 'REJECT', { event: 'LEAVE_DECIDED', status, note, forced: Boolean(input.force) });
    const label = isLeaveType(leave.leaveType) ? LEAVE_TYPES[leave.leaveType].label : leave.leaveType;
    await this.access.notify([leave.employee.userId], status === 'APPROVED' ? 'Congé accordé' : 'Congé refusé', `${label} du ${calendarIso(leave.startDate)} au ${calendarIso(leave.endDate)}${note ? ` — ${note}` : ''}.`, 'leave-request', id, status === 'REJECTED' ? 'HIGH' : 'MEDIUM');
    return this.leaveView(updated);
  }

  async replacements(status: string | undefined, actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.readers, 'Remplacements réservés à la finance et à l’administration.');
    const rows = await this.prisma.replacementRequest.findMany({
      where: { clinicId: actor.clinicId, ...(status ? { status } : {}) },
      include: { requester: { select: { firstName: true, lastName: true, position: true } }, replacer: { select: { firstName: true, lastName: true, position: true } } },
      orderBy: { createdAt: 'desc' }, take: 500,
    });
    return {
      canDecide: this.access.hasRole(actor, HR_ROLES.decisions),
      replacements: rows.map((row) => ({ ...this.replacementView(row), requester: employeeName(row.requester), requesterPosition: row.requester.position, replacer: employeeName(row.replacer), replacerPosition: row.replacer.position })),
    };
  }

  /** Approving a replacement gives the colleague a planned shift over the period (so their access and attendance follow). */
  async decideReplacement(id: string, input: { decision: 'APPROVE' | 'REJECT'; note?: string }, actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.decisions, 'Seule l’administration valide un remplacement.');
    const row = await this.prisma.replacementRequest.findFirst({ where: { id, clinicId: actor.clinicId }, include: { requester: { select: { userId: true, firstName: true, lastName: true } }, replacer: { select: { id: true, userId: true, firstName: true, lastName: true } } } });
    if (!row) throw new NotFoundException('Remplacement introuvable dans votre établissement.');
    if (row.status !== 'PENDING_ADMIN') throw new ConflictException(row.status === 'PENDING_COLLEAGUE' ? 'Le collègue n’a pas encore accepté.' : 'Ce remplacement a déjà été traité.');
    const note = input.note?.trim() || null;
    if (input.decision === 'REJECT' && !note) throw new BadRequestException('Indiquez la raison du refus.');
    let shiftId: string | null = null;
    if (input.decision === 'APPROVE') {
      const clock = await this.access.clock(actor.clinicId);
      const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: clock.timezone, hour: '2-digit', hourCycle: 'h23' }).format(row.startAt));
      const shift = await this.prisma.shift.create({ data: { employeeId: row.replacerId, startAt: row.startAt, endAt: row.endAt, type: hour >= 17 || hour < 6 ? 'NIGHT' : 'DAY' } });
      shiftId = shift.id;
    }
    const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const updated = await this.prisma.replacementRequest.update({ where: { id }, data: { status, decidedById: actor.id, decidedAt: new Date(), decisionNote: note, shiftId } });
    await this.access.audit(actor.id, 'ReplacementRequest', id, status === 'APPROVED' ? 'APPROVE' : 'REJECT', { event: 'REPLACEMENT_DECIDED', status, note, shiftId });
    const text = `${employeeName(row.replacer)} remplace ${employeeName(row.requester)} : ${status === 'APPROVED' ? 'validé' : `refusé${note ? ` (${note})` : ''}`}.`;
    await this.access.notify([row.requester.userId, row.replacer.userId], status === 'APPROVED' ? 'Remplacement validé' : 'Remplacement refusé', text, 'replacement-request', id);
    return this.replacementView(updated);
  }

  private leaveView(leave: { id: string; leaveType: string; startDate: Date; endDate: Date; reason: string | null; status: string; requestedAt: Date; decidedAt: Date | null; days: unknown; deductsBalance: boolean; decisionNote: string | null; replacementEmployeeId: string | null }) {
    return {
      id: leave.id, type: leave.leaveType, typeLabel: isLeaveType(leave.leaveType) ? LEAVE_TYPES[leave.leaveType].label : leave.leaveType,
      startDate: calendarIso(leave.startDate), endDate: calendarIso(leave.endDate), days: leave.days === null ? null : Number(leave.days),
      reason: leave.reason, status: leave.status, requestedAt: leave.requestedAt, decidedAt: leave.decidedAt, decisionNote: leave.decisionNote,
      deductsBalance: leave.deductsBalance, replacementEmployeeId: leave.replacementEmployeeId,
    };
  }

  private replacementView(row: { id: string; startAt: Date; endAt: Date; reason: string | null; status: string; colleagueNote: string | null; decisionNote: string | null; createdAt: Date; leaveRequestId: string | null }) {
    return { id: row.id, startAt: row.startAt, endAt: row.endAt, reason: row.reason, status: row.status, colleagueNote: row.colleagueNote, decisionNote: row.decisionNote, createdAt: row.createdAt, leaveRequestId: row.leaveRequestId };
  }
}
