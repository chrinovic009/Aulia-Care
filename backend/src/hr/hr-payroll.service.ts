import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedActor } from '../core/clinic-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { monthPeriod, netOf, payrollDueDate, payrollState, PayrollLine, proposePayroll } from './domain/hr-rules';
import { HrAttendanceService } from './hr-attendance.service';
import { HR_ROLES, HrAccess } from './hr-access';
import { assertMonth, daySerial } from './hr-dates';

const LINE_KINDS: PayrollLine['kind'][] = ['LATE', 'ABSENCE', 'UNPAID_LEAVE', 'ADVANCE', 'BONUS', 'OTHER'];
const asLines = (value: Prisma.JsonValue | null): PayrollLine[] => (Array.isArray(value) ? (value as PayrollLine[]) : []);
const payrollSelect = {
  id: true, employeeId: true, periodStart: true, periodEnd: true, grossAmount: true, netAmount: true, baseSalary: true, currency: true,
  dueDate: true, proposedDeductions: true, adjustments: true, status: true, paidAt: true, paidById: true, paymentMethod: true,
  paymentReference: true, notes: true, version: true, deductions: true,
  employee: { select: { firstName: true, lastName: true, position: true, userId: true, department: { select: { name: true } } } },
} satisfies Prisma.PayrollSelect;
type PayrollRow = Prisma.PayrollGetPayload<{ select: typeof payrollSelect }>;

/**
 * Monthly payroll, managed by finance and visible to the administration and
 * the super administration. Aulia proposes the month's pay and the deductions
 * for lateness and absences; at payment, finance keeps, changes or removes
 * them and may add bonuses or advances. These adjustments only concern the
 * month being paid. Unpaid payrolls past their pay date are late.
 */
@Injectable()
export class HrPayrollService {
  constructor(private readonly prisma: PrismaService, private readonly access: HrAccess, private readonly attendance: HrAttendanceService) {}

  private view(row: PayrollRow, now = new Date()) {
    const proposed = asLines(row.proposedDeductions);
    const applied = row.status === 'PAID' ? asLines(row.adjustments) : null;
    return {
      id: row.id, employeeId: row.employeeId, version: row.version,
      employee: { name: `${row.employee.firstName} ${row.employee.lastName}`, position: row.employee.position, department: row.employee.department?.name ?? null },
      // The middle of the period is inside the month whatever the clinic's time zone.
      month: new Date((row.periodStart.getTime() + row.periodEnd.getTime()) / 2).toISOString().slice(0, 7),
      periodStart: row.periodStart, periodEnd: row.periodEnd,
      baseSalary: row.baseSalary === null ? null : Number(row.baseSalary), gross: Number(row.grossAmount), currency: row.currency,
      proposedLines: proposed, proposedNet: netOf(Number(row.grossAmount), proposed),
      appliedLines: applied, net: Number(row.netAmount),
      status: row.status, state: payrollState(row, now), dueDate: row.dueDate,
      daysLate: row.status !== 'PAID' && row.dueDate && row.dueDate < now ? Math.floor((now.getTime() - row.dueDate.getTime()) / 86_400_000) : 0,
      paidAt: row.paidAt, paymentMethod: row.paymentMethod, paymentReference: row.paymentReference, notes: row.notes,
      facts: (row.deductions as Record<string, unknown> | null) ?? null,
    };
  }

  /** Payroll of a month, with the employees whose payroll is not generated yet. */
  async list(month: string, actorInput?: AuthenticatedActor) {
    assertMonth(month);
    const actor = await this.access.actor(actorInput, HR_ROLES.readers, 'Paie réservée à la finance et à l’administration.');
    const clock = await this.access.clock(actor.clinicId);
    const period = monthPeriod(month, clock.timezone);
    const [rows, salaried] = await Promise.all([
      this.prisma.payroll.findMany({ where: { employee: { clinicId: actor.clinicId }, periodStart: period.start }, select: payrollSelect, orderBy: { employee: { lastName: 'asc' } } }),
      this.salariedContracts(actor.clinicId, period.year, period.month),
    ]);
    const now = new Date();
    const payrolls = rows.map((row) => this.view(row, now));
    const generated = new Set(payrolls.map((row) => row.employeeId));
    const missing = [...new Set(salaried.map((contract) => contract.employeeId))].filter((id) => !generated.has(id)).length;
    const sum = (filter: (row: ReturnType<HrPayrollService['view']>) => boolean, pick: (row: ReturnType<HrPayrollService['view']>) => number) => Math.round(payrolls.filter(filter).reduce((total, row) => total + pick(row), 0) * 100) / 100;
    return {
      month, currency: clock.currency, payrolls, missing,
      canManage: this.access.hasRole(actor, HR_ROLES.payroll),
      totals: {
        gross: sum(() => true, (row) => row.gross),
        paid: sum((row) => row.state === 'PAID', (row) => row.net),
        toPay: sum((row) => row.state !== 'PAID', (row) => row.proposedNet),
        late: payrolls.filter((row) => row.state === 'LATE').length,
        unpaid: payrolls.filter((row) => row.state !== 'PAID').length,
      },
    };
  }

  /** Every unpaid payroll, all months together: late first. */
  async overview(actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.readers, 'Paie réservée à la finance et à l’administration.');
    const rows = await this.prisma.payroll.findMany({ where: { employee: { clinicId: actor.clinicId }, status: { not: 'PAID' } }, select: payrollSelect, orderBy: [{ dueDate: 'asc' }], take: 2_000 });
    const now = new Date();
    const payrolls = rows.map((row) => this.view(row, now));
    return {
      late: payrolls.filter((row) => row.state === 'LATE'),
      toPay: payrolls.filter((row) => row.state === 'TO_PAY'),
      totals: {
        late: payrolls.filter((row) => row.state === 'LATE').length,
        lateAmount: Math.round(payrolls.filter((row) => row.state === 'LATE').reduce((total, row) => total + row.proposedNet, 0) * 100) / 100,
        unpaid: payrolls.length,
        unpaidAmount: Math.round(payrolls.reduce((total, row) => total + row.proposedNet, 0) * 100) / 100,
      },
    };
  }

  private salariedContracts(clinicId: string, year: number, month: number) {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const last = new Date(Date.UTC(year, month, 0));
    return this.prisma.employeeContract.findMany({
      where: { employee: { clinicId }, salary: { not: null }, startDate: { lte: last }, AND: [{ OR: [{ endDate: null, active: true }, { endDate: { gte: first } }] }] },
      orderBy: { startDate: 'asc' },
    });
  }

  /** Creates (or refreshes, while unpaid) the payroll of every salaried employee for a month. */
  async generate(month: string, actorInput?: AuthenticatedActor, employeeIds?: string[]) {
    assertMonth(month);
    const actor = await this.access.actor(actorInput, HR_ROLES.payroll, 'La paie est gérée par la finance.');
    const [clock, rules] = await Promise.all([this.access.clock(actor.clinicId), this.access.rules(actor.clinicId)]);
    const period = monthPeriod(month, clock.timezone);
    const contracts = (await this.salariedContracts(actor.clinicId, period.year, period.month)).filter((contract) => !employeeIds || employeeIds.includes(contract.employeeId));
    const byEmployee = new Map<string, typeof contracts>();
    for (const contract of contracts) byEmployee.set(contract.employeeId, [...(byEmployee.get(contract.employeeId) ?? []), contract]);
    const facts = await this.attendance.monthFacts(actor.clinicId, month, [...byEmployee.keys()]);
    const firstSerial = daySerial(new Date(Date.UTC(period.year, period.month - 1, 1)));
    const lastSerial = daySerial(new Date(Date.UTC(period.year, period.month, 0)));
    const daysInMonth = lastSerial - firstSerial + 1;
    const dueDate = payrollDueDate(period.year, period.month, rules.payDay, clock.timezone);
    let created = 0, refreshed = 0, skipped = 0;
    for (const [employeeId, versions] of byEmployee) {
      // Salary changed during the month: each version counts for the days it covers.
      let coveredDays = 0, weighted = 0;
      for (const version of versions) {
        const from = Math.max(daySerial(version.startDate), firstSerial);
        const to = Math.min(version.endDate ? daySerial(version.endDate) : lastSerial, lastSerial);
        if (to < from) continue;
        coveredDays += to - from + 1;
        weighted += Number(version.salary) * (to - from + 1);
      }
      if (!coveredDays) continue;
      const monthlySalary = weighted / coveredDays;
      const fact = facts.get(employeeId);
      const proposal = proposePayroll({ monthlySalary, daysInMonth, coveredDays, lateMinutes: fact?.lateMinutes ?? 0, absentDays: fact?.absentDays ?? 0, unpaidLeaveDays: fact?.unpaidLeaveDays ?? 0, rules });
      const latest = versions[versions.length - 1];
      const data = {
        periodEnd: new Date(period.end.getTime() - 1), grossAmount: proposal.gross, netAmount: proposal.net,
        baseSalary: Number(latest.salary), currency: latest.currency ?? clock.currency, dueDate,
        proposedDeductions: proposal.lines as unknown as Prisma.InputJsonValue,
        deductions: { lateMinutes: fact?.lateMinutes ?? 0, absentDays: fact?.absentDays ?? 0, unpaidLeaveDays: fact?.unpaidLeaveDays ?? 0, coveredDays, daysInMonth } as Prisma.InputJsonValue,
      };
      const existing = await this.prisma.payroll.findUnique({ where: { employeeId_periodStart: { employeeId, periodStart: period.start } }, select: { id: true, status: true } });
      if (existing?.status === 'PAID') { skipped += 1; continue; }
      if (existing) {
        await this.prisma.payroll.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } });
        refreshed += 1;
      } else {
        await this.prisma.payroll.create({ data: { employeeId, periodStart: period.start, status: 'DRAFT', ...data } });
        created += 1;
      }
    }
    await this.access.audit(actor.id, 'Payroll', `${actor.clinicId}:${month}`, 'UPDATE', { event: 'PAYROLL_GENERATED', month, created, refreshed, skipped });
    return { month, created, refreshed, skipped };
  }

  /** Recomputes one unpaid payroll (after a salary change, a justified absence…). */
  async recompute(payrollId: string, actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.payroll, 'La paie est gérée par la finance.');
    const payroll = await this.prisma.payroll.findFirst({ where: { id: payrollId, employee: { clinicId: actor.clinicId } }, select: { employeeId: true, periodEnd: true, status: true } });
    if (!payroll) throw new NotFoundException('Paie introuvable dans votre établissement.');
    if (payroll.status === 'PAID') throw new ConflictException('Cette paie est déjà payée : elle ne change plus.');
    const clock = await this.access.clock(actor.clinicId);
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: clock.timezone, year: 'numeric', month: '2-digit' }).format(payroll.periodEnd);
    await this.generate(local.slice(0, 7), actorInput, [payroll.employeeId]);
    const row = await this.prisma.payroll.findUniqueOrThrow({ where: { id: payrollId }, select: payrollSelect });
    return this.view(row);
  }

  /**
   * Pays a month. The lines given here (deductions kept or changed, bonuses,
   * advances) apply to this month only; a change from the proposal needs a reason.
   */
  async pay(payrollId: string, input: { version: number; lines: Array<{ kind: string; label: string; amount: number }>; paymentMethod?: string; paymentReference?: string; notes?: string }, actorInput?: AuthenticatedActor) {
    const actor = await this.access.actor(actorInput, HR_ROLES.payroll, 'La paie est payée par la finance.');
    const payroll = await this.prisma.payroll.findFirst({ where: { id: payrollId, employee: { clinicId: actor.clinicId } }, select: payrollSelect });
    if (!payroll) throw new NotFoundException('Paie introuvable dans votre établissement.');
    if (payroll.status === 'PAID') throw new ConflictException('Cette paie est déjà payée.');
    if (payroll.version !== input.version) throw new ConflictException('La paie a été recalculée entre-temps : rechargez-la avant de payer.');
    if (!Array.isArray(input.lines) || input.lines.length > 30) throw new BadRequestException('Lignes de paie invalides.');
    const lines: PayrollLine[] = input.lines.map((line) => {
      if (!LINE_KINDS.includes(line.kind as PayrollLine['kind'])) throw new BadRequestException('Type de ligne de paie inconnu.');
      const amount = Math.round(Number(line.amount) * 100) / 100;
      if (!Number.isFinite(amount) || Math.abs(amount) > 1e10) throw new BadRequestException('Montant de ligne invalide.');
      const label = String(line.label ?? '').trim();
      if (!label || label.length > 200) throw new BadRequestException('Chaque ligne doit avoir un libellé.');
      const deduction = ['LATE', 'ABSENCE', 'UNPAID_LEAVE', 'ADVANCE'].includes(line.kind);
      return { kind: line.kind as PayrollLine['kind'], label, amount: deduction ? -Math.abs(amount) : line.kind === 'BONUS' ? Math.abs(amount) : amount };
    });
    const gross = Number(payroll.grossAmount);
    const net = netOf(gross, lines);
    if (net < 0) throw new BadRequestException('Le net à payer ne peut pas être négatif.');
    const proposed = asLines(payroll.proposedDeductions);
    const changed = JSON.stringify(proposed.map((line) => [line.kind, line.amount])) !== JSON.stringify(lines.map((line) => [line.kind, line.amount]));
    const notes = input.notes?.trim() || null;
    if (changed && !notes) throw new BadRequestException('Indiquez la raison de l’ajustement de ce mois (retenue modifiée, prime, avance…).');
    const now = new Date();
    const updated = await this.prisma.payroll.updateMany({
      where: { id: payrollId, version: input.version, status: { not: 'PAID' } },
      data: {
        status: 'PAID', netAmount: net, adjustments: lines as unknown as Prisma.InputJsonValue, paidAt: now, paidById: actor.id,
        processedAt: now, processedById: actor.id, paymentMethod: input.paymentMethod?.trim().slice(0, 60) || null,
        paymentReference: input.paymentReference?.trim().slice(0, 120) || null, notes, version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new ConflictException('La paie a changé entre-temps : rechargez-la.');
    await this.access.audit(actor.id, 'Payroll', payrollId, 'APPROVE', { event: 'PAYROLL_PAID', net, lines: lines as unknown as Prisma.InputJsonValue, adjusted: changed, notes }, { proposedNet: netOf(gross, proposed) });
    await this.access.notify([payroll.employee.userId], 'Salaire payé', `Votre salaire de ${payroll.periodEnd.toISOString().slice(0, 7)} a été payé : ${net} ${payroll.currency}.`, 'payroll', payrollId);
    return this.view(await this.prisma.payroll.findUniqueOrThrow({ where: { id: payrollId }, select: payrollSelect }));
  }

  /** The connected employee's own payslips. */
  async mine(employeeId: string) {
    const rows = await this.prisma.payroll.findMany({ where: { employeeId }, select: payrollSelect, orderBy: { periodStart: 'desc' }, take: 24 });
    return rows.map((row) => this.view(row));
  }
}
