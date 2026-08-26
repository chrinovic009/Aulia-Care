import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, InvoiceType, PatientWorkflowStatus, RoleSlug } from '@prisma/client';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { CapitalInvestmentStatus, FinanceBudgetStatus } from '@prisma/client';
import {
  CreateBudgetAllocationDto,
  CreateAccountingJournalEntryDto,
  CreateBankAccountDto,
  CreateBankReconciliationDto,
  CreateBankStatementEntryDto,
  CreateCapitalInvestmentDto,
  CreateFinanceBudgetDto,
  CreateRefundRequestDto,
  ReviewBankReconciliationDto,
  ReviewRefundDto,
  UpdateBankAccountStatusDto,
  UpdateBudgetStatusDto,
  UpdateCapitalInvestmentStatusDto,
} from './dto/finance.dto';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService, private readonly gateway: NotificationsGateway) {}

  async financialForecast(userId?: string) {
    const clinicId = await this.financeClinicId(userId);
    const since = new Date(); since.setMonth(since.getMonth() - 5); since.setDate(1); since.setHours(0, 0, 0, 0);
    const invoices = await this.prisma.invoice.findMany({ where: { clinicId, issuedAt: { gte: since }, deletedAt: null }, select: { issuedAt: true, totalAmount: true, balanceDue: true } });
    const buckets = new Map<string, { billed: number; outstanding: number }>();
    invoices.forEach((invoice) => { const key = `${invoice.issuedAt.getFullYear()}-${String(invoice.issuedAt.getMonth() + 1).padStart(2, '0')}`; const current = buckets.get(key) || { billed: 0, outstanding: 0 }; current.billed += Number(invoice.totalAmount); current.outstanding += Number(invoice.balanceDue); buckets.set(key, current); });
    const months = Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, values]) => ({ month, ...values }));
    const average = months.length ? months.reduce((sum, month) => sum + month.billed, 0) / months.length : 0;
    const trend = months.length > 1 ? months[months.length - 1].billed - months[0].billed : 0;
    return { months, forecastNextMonth: Math.max(0, Math.round(average + trend / Math.max(months.length - 1, 1))), outstandingBalance: months.reduce((sum, month) => sum + month.outstanding, 0), method: 'Moyenne mobile simple : aide au pilotage, non prévision comptable certifiée.' };
  }

  private monthKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private async financeClinicId(userId?: string) {
    if (!userId) throw new BadRequestException('Session finance introuvable.');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { clinicId: true } });
    if (!user?.clinicId) throw new BadRequestException('Le compte Finance doit être rattaché à un établissement avant d’accéder à la comptabilité.');
    return user.clinicId;
  }

  private async financeActor(userId?: string) {
    if (!userId) throw new BadRequestException('Session Finance introuvable.');
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, clinicId: true, primaryRole: true },
    });
    if (!actor?.clinicId) throw new BadRequestException('Le compte Finance doit être rattaché à un établissement.');
    return actor;
  }

  /** Approval of a bank account, reconciliation, refund or posting cannot be
   * self-approved. Only an administrator/super-administrator may act as the
   * second controller for bank-facing actions. */
  private async requireSecondController(userId: string | undefined, authorId: string) {
    const actor = await this.financeActor(userId);
    if (actor.id === authorId) throw new ForbiddenException('Une action financière ne peut pas être approuvée par son auteur.');
    if (actor.primaryRole !== RoleSlug.ADMIN && actor.primaryRole !== RoleSlug.SUPER_ADMIN) {
      throw new ForbiddenException('Cette validation exige un administrateur distinct du préparateur.');
    }
    return actor;
  }

  private bankEncryptionKey() {
    const raw = process.env.FINANCE_BANK_ENCRYPTION_KEY;
    if (!raw) throw new BadRequestException('La liaison bancaire exige FINANCE_BANK_ENCRYPTION_KEY (clé AES-256 encodée en base64).');
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new BadRequestException('FINANCE_BANK_ENCRYPTION_KEY doit contenir exactement 32 octets AES-256 en base64.');
    return key;
  }

  private encryptBankIdentifier(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.bankEncryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
  }

  private journalHash(previousHash: string | null, value: Record<string, unknown>) {
    return createHash('sha256').update(`${previousHash || ''}|${JSON.stringify(value)}`).digest('hex');
  }

  private async canSafelyReadUnscopedLegacyAccounting() {
    const clinics = await this.prisma.clinic.count({ where: { deletedAt: null, status: 'ACTIVE' } });
    return clinics === 1;
  }

  private async auditFinance(
    actorId: string | undefined,
    clinicId: string,
    action: AuditAction,
    entity: string,
    entityId: string,
    after: Record<string, unknown>,
  ) {
    if (!actorId) return;
    await this.prisma.auditTrail.create({
      data: { actorId, entity, entityId, action, after: { clinicId, ...after } },
    });
  }

  private emitFinanceChange(clinicId: string, resource: 'budget' | 'allocation' | 'investment') {
    // The browser receives only a scoped refresh signal: no amount, patient,
    // invoice or provider metadata is exposed through WebSocket.
    this.gateway.notifyFinanceClinic(clinicId, { resource });
  }

  private async financeData(userId?: string) {
    const clinicId = await this.financeClinicId(userId);
    const from = new Date();
    from.setMonth(from.getMonth() - 11, 1);
    from.setHours(0, 0, 0, 0);
    const allowLegacy = await this.canSafelyReadUnscopedLegacyAccounting();

    // Les premières écritures de caisse pouvaient avoir été créées avant
    // l'introduction de clinicId. Elles ne peuvent être reprises que dans une
    // installation mono-établissement : dans une installation multi-cliniques,
    // les données non rattachées restent volontairement invisibles afin de ne
    // jamais mélanger les comptabilités.
    const clinicScopedOrLegacy = allowLegacy
      ? { OR: [{ clinicId }, { clinicId: null }] }
      : { clinicId };

    const [invoices, payments, payrolls, supplierInvoices, supplierPayments, expenses, budgets, investments, departments, rejectedClaims] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { ...clinicScopedOrLegacy, deletedAt: null },
        select: { id: true, type: true, status: true, totalAmount: true, balanceDue: true, issuedAt: true, dueDate: true, patient: { select: { firstName: true, lastName: true, insuranceProvider: true } } },
        orderBy: { issuedAt: 'desc' }, take: 1000,
      }),
      this.prisma.payment.findMany({ where: { ...clinicScopedOrLegacy, deletedAt: null, paidAt: { gte: from } }, select: { amount: true, paidAt: true, method: true }, orderBy: { paidAt: 'desc' }, take: 2000 }),
      (this.prisma as any).payroll.findMany({ where: { employee: { clinicId }, periodEnd: { gte: from } }, include: { employee: { select: { firstName: true, lastName: true, department: { select: { name: true } } } } }, orderBy: { periodEnd: 'desc' }, take: 1000 }),
      (this.prisma as any).supplierInvoice.findMany({ where: { purchaseOrder: { is: { clinicId } } }, include: { supplier: true, SupplierPayment: true }, orderBy: { dueDate: 'asc' }, take: 500 }),
      (this.prisma as any).supplierPayment.findMany({ where: { supplierInvoice: { is: { purchaseOrder: { is: { clinicId } } } }, paidAt: { gte: from } }, select: { amount: true, paidAt: true, method: true }, orderBy: { paidAt: 'desc' }, take: 1000 }),
      allowLegacy ? (this.prisma as any).expense.findMany({ where: { deletedAt: null, paidAt: { gte: from } }, orderBy: { paidAt: 'desc' }, take: 1000 }) : Promise.resolve([]),
      (this.prisma as any).financeBudget.findMany({ where: { clinicId, archivedAt: null }, include: { allocations: { orderBy: { occurredAt: 'desc' } } }, orderBy: [{ fiscalYear: 'desc' }, { createdAt: 'desc' }] }),
      (this.prisma as any).capitalInvestment.findMany({ where: { clinicId, archivedAt: null }, orderBy: [{ plannedAt: 'asc' }, { createdAt: 'desc' }] }),
      this.prisma.department.findMany({ where: { clinicId, deletedAt: null }, select: { id: true, name: true, type: true }, orderBy: { name: 'asc' } }),
      (this.prisma as any).insuranceClaim.findMany({ where: { patient: { is: { clinicId } }, status: 'REJECTED', deletedAt: null }, select: { id: true, amountClaimed: true, rejectionReason: true, patient: { select: { firstName: true, lastName: true } } }, orderBy: { updatedAt: 'desc' }, take: 50 }),
    ]);
    return { clinicId, from, allowLegacy, invoices, payments, payrolls, supplierInvoices, supplierPayments, expenses, budgets, investments, departments, rejectedClaims };
  }

  async financeDashboard(userId?: string) {
    const data = await this.financeData(userId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousEnd = monthStart;
    const priorYearStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const priorYearEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
    const amount = (value: unknown) => Number(value || 0);
    const paidPayroll = data.payrolls.filter((entry: any) => entry.status === 'PAID');
    const supplierOutflows = data.supplierPayments.reduce((sum: number, item: any) => sum + amount(item.amount), 0);
    const payrollOutflows = paidPayroll.reduce((sum: number, item: any) => sum + amount(item.netAmount), 0);
    const expenseOutflows = data.expenses.reduce((sum: number, item: any) => sum + amount(item.amount), 0);
    const recordedInflows = data.payments.reduce((sum, item) => sum + amount(item.amount), 0);
    const currentRevenue = data.invoices.filter((invoice) => invoice.issuedAt >= monthStart).reduce((sum, invoice) => sum + amount(invoice.totalAmount), 0);
    const previousRevenue = data.invoices.filter((invoice) => invoice.issuedAt >= previousStart && invoice.issuedAt < previousEnd).reduce((sum, invoice) => sum + amount(invoice.totalAmount), 0);
    const previousYearRevenue = data.invoices.filter((invoice) => invoice.issuedAt >= priorYearStart && invoice.issuedAt < priorYearEnd).reduce((sum, invoice) => sum + amount(invoice.totalAmount), 0);
    const revenueObjective = data.budgets
      .filter((budget: any) => budget.type === 'REVENUE_TARGET' && budget.fiscalYear === now.getFullYear() && budget.status === 'APPROVED')
      .reduce((sum: number, budget: any) => sum + amount(budget.allocatedAmount) / 12, 0);
    const receivables = data.invoices.filter((invoice) => amount(invoice.balanceDue) > 0 && invoice.status !== 'CANCELLED');
    const outstanding = receivables.reduce((sum, invoice) => sum + amount(invoice.balanceDue), 0);
    const netCashFlow = recordedInflows - supplierOutflows - payrollOutflows - expenseOutflows;
    const netMargin = currentRevenue ? ((currentRevenue - supplierOutflows - payrollOutflows - expenseOutflows) / currentRevenue) * 100 : 0;

    const buckets = new Map<string, { inflows: number; outflows: number }>();
    for (let i = 11; i >= 0; i -= 1) { const date = new Date(now.getFullYear(), now.getMonth() - i, 1); buckets.set(this.monthKey(date), { inflows: 0, outflows: 0 }); }
    data.payments.forEach((item) => { const bucket = buckets.get(this.monthKey(item.paidAt)); if (bucket) bucket.inflows += amount(item.amount); });
    data.supplierPayments.forEach((item: any) => { const bucket = buckets.get(this.monthKey(item.paidAt)); if (bucket) bucket.outflows += amount(item.amount); });
    paidPayroll.forEach((item: any) => { const bucket = buckets.get(this.monthKey(item.periodEnd)); if (bucket) bucket.outflows += amount(item.netAmount); });
    data.expenses.forEach((item: any) => { const bucket = buckets.get(this.monthKey(item.paidAt)); if (bucket) bucket.outflows += amount(item.amount); });

    const revenueByPole = new Map<string, number>();
    const poleName: Record<string, string> = { PHARMACY: 'Pharmacie', LABORATORY: 'Laboratoire', RADIOLOGY: 'Radiologie', SURGERY: 'Chirurgie', SERVICE: 'Services médicaux', ADMISSION_FEE: 'Admissions', SUBSCRIPTION_MONTHLY: 'Abonnements', OTHER: 'Autres' };
    data.invoices.filter((invoice) => invoice.issuedAt >= monthStart).forEach((invoice) => revenueByPole.set(poleName[invoice.type] || invoice.type, (revenueByPole.get(poleName[invoice.type] || invoice.type) || 0) + amount(invoice.totalAmount)));

    const urgentReceivables = receivables.filter((invoice) => Math.floor((now.getTime() - invoice.issuedAt.getTime()) / 86_400_000) > 90).reduce((sum, invoice) => sum + amount(invoice.balanceDue), 0);
    const supplierAlerts = data.supplierInvoices.filter((invoice: any) => {
      const paid = (invoice.SupplierPayment || []).reduce((sum: number, payment: any) => sum + amount(payment.amount), 0);
      const days = invoice.dueDate ? Math.ceil((new Date(invoice.dueDate).getTime() - now.getTime()) / 86_400_000) : null;
      return amount(invoice.amount) > paid && days !== null && days <= 14;
    }).slice(0, 10).map((invoice: any) => ({ id: invoice.id, label: `Fournisseur : ${invoice.supplier?.name || 'Non renseigné'}`, dueDate: invoice.dueDate, amount: Math.max(amount(invoice.amount) - (invoice.SupplierPayment || []).reduce((sum: number, payment: any) => sum + amount(payment.amount), 0), 0) }));
    const budgetAlerts = data.budgets.map((budget: any) => ({ budget, consumed: (budget.allocations || []).reduce((sum: number, allocation: any) => sum + amount(allocation.amount), 0) })).filter(({ budget, consumed }) => consumed > amount(budget.allocatedAmount)).map(({ budget, consumed }) => ({ id: budget.id, label: budget.name, allocatedAmount: amount(budget.allocatedAmount), consumedAmount: consumed }));

    return {
      kpis: { operationalCashEstimate: netCashFlow, monthlyRevenue: currentRevenue, previousMonthRevenue: previousRevenue, previousYearRevenue, revenueObjective: revenueObjective || null, receivables: outstanding, urgentReceivables, netMarginPercent: Math.round(netMargin * 10) / 10 },
      cashFlow: Array.from(buckets.entries()).map(([month, values]) => ({ month, ...values, net: values.inflows - values.outflows })),
      revenueByPole: Array.from(revenueByPole.entries()).map(([name, value]) => ({ name, value })),
      alerts: { supplierInvoices: supplierAlerts, budgetOverruns: budgetAlerts, insuranceRejections: data.rejectedClaims.map((claim: any) => ({ id: claim.id, patient: `${claim.patient?.firstName || ''} ${claim.patient?.lastName || ''}`.trim() || 'Patient', amount: amount(claim.amountClaimed), reason: claim.rejectionReason || 'Motif non renseigné' })) },
      dataQuality: { unscopedLegacyExpensesIncluded: data.allowLegacy, note: data.allowLegacy ? 'Les écritures historiques de caisse sans établissement sont incluses car un seul établissement actif est configuré. Elles restent exclues dès qu’un second établissement existe. La trésorerie affichée est opérationnelle, non un solde bancaire rapproché.' : 'Les écritures historiques sans établissement sont exclues afin de protéger la séparation entre établissements. La trésorerie affichée est opérationnelle et non bancaire.' },
    };
  }

  async financeTreasury(userId?: string) {
    const data = await this.financeData(userId);
    const now = new Date(); const amount = (value: unknown) => Number(value || 0);
    const receivables = data.invoices.filter((invoice) => amount(invoice.balanceDue) > 0 && invoice.status !== 'CANCELLED').map((invoice) => {
      const ageDays = Math.max(0, Math.floor((now.getTime() - invoice.issuedAt.getTime()) / 86_400_000));
      return { id: invoice.id, debtor: invoice.patient?.insuranceProvider || `${invoice.patient?.firstName || ''} ${invoice.patient?.lastName || ''}`.trim() || 'Patient non renseigné', invoiceType: invoice.type, issuedAt: invoice.issuedAt, dueDate: invoice.dueDate, amount: amount(invoice.balanceDue), ageDays, bucket: ageDays <= 30 ? '0-30 j' : ageDays <= 60 ? '31-60 j' : ageDays <= 90 ? '61-90 j' : '> 90 j' };
    }).sort((a, b) => b.ageDays - a.ageDays || b.amount - a.amount);
    const agedReceivables = ['0-30 j', '31-60 j', '61-90 j', '> 90 j'].map((bucket) => ({ bucket, amount: receivables.filter((item) => item.bucket === bucket).reduce((sum, item) => sum + item.amount, 0), count: receivables.filter((item) => item.bucket === bucket).length }));
    const supplierInvoices = data.supplierInvoices.map((invoice: any) => { const paid = (invoice.SupplierPayment || []).reduce((sum: number, p: any) => sum + amount(p.amount), 0); return { id: invoice.id, supplier: invoice.supplier?.name || 'Fournisseur non renseigné', invoiceNumber: invoice.supplierInvoiceNumber || 'Sans référence', dueDate: invoice.dueDate, status: invoice.status, amount: amount(invoice.amount), paidAmount: paid, balanceDue: Math.max(amount(invoice.amount) - paid, 0) }; }).filter((item: any) => item.balanceDue > 0);
    const payroll = data.payrolls.map((item: any) => ({ id: item.id, employee: `${item.employee?.firstName || ''} ${item.employee?.lastName || ''}`.trim() || 'Employé', department: item.employee?.department?.name || 'Non affecté', periodEnd: item.periodEnd, grossAmount: amount(item.grossAmount), netAmount: amount(item.netAmount), status: item.status }));
    return { receivables, agedReceivables, supplierInvoices, payroll, canSendReminder: false, reminderNotice: 'Les relances automatiques ne sont activées qu’après configuration d’un canal e-mail/SMS certifié. Aucun rappel n’est envoyé sans validation humaine.' };
  }

  async financeBudgets(userId?: string) {
    const data = await this.financeData(userId); const amount = (value: unknown) => Number(value || 0);
    const budgets = data.budgets.map((budget: any) => { const consumedAmount = (budget.allocations || []).reduce((sum: number, allocation: any) => sum + amount(allocation.amount), 0); const allocatedAmount = amount(budget.allocatedAmount); return { ...budget, allocatedAmount, consumedAmount, availableAmount: allocatedAmount - consumedAmount, consumptionRate: allocatedAmount ? Math.round((consumedAmount / allocatedAmount) * 1000) / 10 : 0 }; });
    const investments = data.investments.map((investment: any) => ({ ...investment, plannedAmount: amount(investment.plannedAmount), acquiredAmount: investment.acquiredAmount === null ? null : amount(investment.acquiredAmount), expectedAnnualReturn: investment.expectedAnnualReturn === null ? null : amount(investment.expectedAnnualReturn), monthlyDepreciation: investment.acquiredAmount && investment.usefulLifeMonths ? amount(investment.acquiredAmount) / investment.usefulLifeMonths : null }));
    const revenueByPole = data.invoices.reduce((map: Map<string, number>, invoice) => { map.set(invoice.type, (map.get(invoice.type) || 0) + amount(invoice.totalAmount)); return map; }, new Map<string, number>());
    const costsByPole = new Map<string, number>();
    budgets.forEach((budget: any) => (budget.allocations || []).forEach((allocation: any) => {
      if (allocation.revenuePole) costsByPole.set(allocation.revenuePole, (costsByPole.get(allocation.revenuePole) || 0) + amount(allocation.amount));
    }));
    investments.forEach((investment: any) => {
      if (investment.revenuePole && investment.monthlyDepreciation) costsByPole.set(investment.revenuePole, (costsByPole.get(investment.revenuePole) || 0) + investment.monthlyDepreciation);
    });
    const poles = new Set([...revenueByPole.keys(), ...costsByPole.keys()]);
    const supplierSources = data.supplierInvoices.map((invoice: any) => ({ id: invoice.id, label: `${invoice.supplier?.name || 'Fournisseur'} · ${invoice.supplierInvoiceNumber || 'Sans référence'}`, reference: invoice.supplierInvoiceNumber || invoice.id }));
    const expenseSources = data.allowLegacy ? data.expenses.map((expense: any) => ({ id: expense.id, label: expense.label, reference: expense.id })) : [];
    return { departments: data.departments, budgets, investments, supplierSources, expenseSources, profitability: Array.from(poles).map((pole) => { const revenue = revenueByPole.get(pole) || 0; const cost = costsByPole.get(pole); return { pole, revenue, cost: cost ?? null, margin: cost === undefined ? null : revenue - cost }; }), dataNotice: 'Les coûts proviennent uniquement des imputations sourcées et amortissements CAPEX affectés à un pôle. Une marge sans coût imputé reste explicitement non disponible.' };
  }

  async createFinanceBudget(userId: string | undefined, dto: CreateFinanceBudgetDto) {
    const clinicId = await this.financeClinicId(userId);
    if (dto.departmentId) { const department = await this.prisma.department.findFirst({ where: { id: dto.departmentId, clinicId, deletedAt: null } }); if (!department) throw new NotFoundException('Département introuvable dans cet établissement.'); }
    const duplicate = await (this.prisma as any).financeBudget.findFirst({ where: { clinicId, departmentId: dto.departmentId || null, name: dto.name.trim(), fiscalYear: dto.fiscalYear, archivedAt: null } });
    if (duplicate) throw new BadRequestException('Un budget actif avec ce libellé, ce département et cette année existe déjà.');
    const created = await (this.prisma as any).financeBudget.create({ data: { clinicId, departmentId: dto.departmentId || null, name: dto.name.trim(), fiscalYear: dto.fiscalYear, type: dto.type || 'OPERATING', allocatedAmount: dto.allocatedAmount, notes: dto.notes?.trim() || null, createdById: userId } });
    await this.auditFinance(userId, clinicId, AuditAction.CREATE, 'FinanceBudget', created.id, { name: created.name, fiscalYear: created.fiscalYear, type: created.type, allocatedAmount: String(created.allocatedAmount) });
    this.emitFinanceChange(clinicId, 'budget');
    return created;
  }

  async updateFinanceBudgetStatus(userId: string | undefined, budgetId: string, dto: UpdateBudgetStatusDto) {
    const clinicId = await this.financeClinicId(userId);
    const budget = await (this.prisma as any).financeBudget.findFirst({ where: { id: budgetId, clinicId, archivedAt: null } });
    if (!budget) throw new NotFoundException('Budget introuvable.');
    const allowedTransitions: Record<string, string[]> = { DRAFT: ['APPROVED', 'ARCHIVED'], APPROVED: ['CLOSED', 'ARCHIVED'], CLOSED: ['ARCHIVED'], ARCHIVED: [] };
    if (!allowedTransitions[budget.status]?.includes(dto.status)) throw new BadRequestException('Transition de statut budgétaire non autorisée.');
    if (dto.status === 'APPROVED') await this.requireSecondController(userId, budget.createdById);
    const updated = await (this.prisma as any).financeBudget.update({ where: { id: budgetId }, data: { status: dto.status as FinanceBudgetStatus, ...(dto.status === 'APPROVED' ? { approvedById: userId, approvedAt: new Date() } : {}), ...(dto.status === 'ARCHIVED' ? { archivedAt: new Date() } : {}) } });
    await this.auditFinance(userId, clinicId, dto.status === 'ARCHIVED' ? AuditAction.DELETE : AuditAction.APPROVE, 'FinanceBudget', updated.id, { previousStatus: budget.status, status: updated.status });
    this.emitFinanceChange(clinicId, 'budget');
    return updated;
  }

  async createBudgetAllocation(userId: string | undefined, budgetId: string, dto: CreateBudgetAllocationDto) {
    const clinicId = await this.financeClinicId(userId);
    const budget = await (this.prisma as any).financeBudget.findFirst({ where: { id: budgetId, clinicId, archivedAt: null } });
    if (!budget) throw new NotFoundException('Budget introuvable.');
    if (budget.status !== 'APPROVED') throw new BadRequestException('Seul un budget approuvé peut recevoir une imputation.');
    if (dto.sourceKind === 'SUPPLIER_INVOICE') {
      if (!dto.supplierInvoiceId) throw new BadRequestException('Sélectionnez la facture fournisseur source.');
      const supplierInvoice = await (this.prisma as any).supplierInvoice.findFirst({ where: { id: dto.supplierInvoiceId, purchaseOrder: { is: { clinicId } } }, select: { id: true } });
      if (!supplierInvoice) throw new NotFoundException('Facture fournisseur introuvable dans cet établissement.');
    }
    if (dto.sourceKind === 'EXPENSE') {
      if (!dto.expenseId) throw new BadRequestException('Sélectionnez la dépense source.');
      if (!await this.canSafelyReadUnscopedLegacyAccounting()) throw new BadRequestException('Les dépenses historiques non rattachées à une clinique ne peuvent pas être imputées dans un environnement multi-établissement.');
      const expense = await this.prisma.expense.findFirst({ where: { id: dto.expenseId, deletedAt: null }, select: { id: true } });
      if (!expense) throw new NotFoundException('Dépense source introuvable.');
    }
    if (dto.sourceKind === 'SUPPORTING_DOCUMENT' && !dto.supportingDocumentUrl?.trim()) throw new BadRequestException('Une pièce justificative est obligatoire pour une imputation documentaire.');
    const created = await (this.prisma as any).financeBudgetAllocation.create({ data: { budgetId, expenseId: dto.expenseId || null, supplierInvoiceId: dto.supplierInvoiceId || null, sourceKind: dto.sourceKind, sourceReference: dto.sourceReference.trim(), supportingDocumentUrl: dto.supportingDocumentUrl?.trim() || null, revenuePole: dto.revenuePole as InvoiceType | undefined, amount: dto.amount, label: dto.label.trim(), occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(), note: dto.note?.trim() || null, createdById: userId } });
    await this.auditFinance(userId, clinicId, AuditAction.CREATE, 'FinanceBudgetAllocation', created.id, { budgetId, sourceKind: created.sourceKind, sourceReference: created.sourceReference, revenuePole: created.revenuePole, amount: String(created.amount) });
    this.emitFinanceChange(clinicId, 'allocation');
    return created;
  }

  async createCapitalInvestment(userId: string | undefined, dto: CreateCapitalInvestmentDto) {
    const clinicId = await this.financeClinicId(userId);
    const created = await (this.prisma as any).capitalInvestment.create({ data: { clinicId, label: dto.label.trim(), category: dto.category.trim(), revenuePole: dto.revenuePole as InvoiceType | undefined, plannedAmount: dto.plannedAmount, acquiredAmount: dto.acquiredAmount ?? null, plannedAt: dto.plannedAt ? new Date(dto.plannedAt) : null, acquiredAt: dto.acquiredAt ? new Date(dto.acquiredAt) : null, usefulLifeMonths: dto.usefulLifeMonths ?? null, expectedAnnualReturn: dto.expectedAnnualReturn ?? null, notes: dto.notes?.trim() || null, createdById: userId } });
    await this.auditFinance(userId, clinicId, AuditAction.CREATE, 'CapitalInvestment', created.id, { label: created.label, revenuePole: created.revenuePole, plannedAmount: String(created.plannedAmount) });
    this.emitFinanceChange(clinicId, 'investment');
    return created;
  }

  async updateCapitalInvestmentStatus(userId: string | undefined, investmentId: string, dto: UpdateCapitalInvestmentStatusDto) {
    const clinicId = await this.financeClinicId(userId);
    const investment = await (this.prisma as any).capitalInvestment.findFirst({ where: { id: investmentId, clinicId, archivedAt: null } });
    if (!investment) throw new NotFoundException('Investissement introuvable.');
    const allowedTransitions: Record<string, string[]> = { PLANNED: ['APPROVED', 'CANCELLED', 'ARCHIVED'], APPROVED: ['ACQUIRED', 'CANCELLED', 'ARCHIVED'], ACQUIRED: ['IN_SERVICE', 'ARCHIVED'], IN_SERVICE: ['ARCHIVED'], CANCELLED: ['ARCHIVED'], ARCHIVED: [] };
    if (!allowedTransitions[investment.status]?.includes(dto.status)) throw new BadRequestException('Transition de statut CAPEX non autorisée.');
    if (dto.status === 'APPROVED') await this.requireSecondController(userId, investment.createdById);
    const updated = await (this.prisma as any).capitalInvestment.update({ where: { id: investmentId }, data: { status: dto.status as CapitalInvestmentStatus, ...(dto.status === 'ARCHIVED' ? { archivedAt: new Date() } : {}) } });
    await this.auditFinance(userId, clinicId, dto.status === 'ARCHIVED' ? AuditAction.DELETE : AuditAction.UPDATE, 'CapitalInvestment', updated.id, { previousStatus: investment.status, status: updated.status });
    this.emitFinanceChange(clinicId, 'investment');
    return updated;
  }

  async bankingOverview(userId?: string) {
    const clinicId = await this.financeClinicId(userId);
    const [accounts, payments] = await Promise.all([
      (this.prisma as any).bankAccount.findMany({
      where: { clinicId },
      include: { statementEntries: { orderBy: { transactionAt: 'desc' }, take: 10 } },
      orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.findMany({ where: { clinicId, deletedAt: null }, select: { id: true, amount: true, paidAt: true, reference: true, invoiceId: true }, orderBy: { paidAt: 'desc' }, take: 200 }),
    ]);
    const reconciliations = await (this.prisma as any).bankReconciliation.findMany({
      where: { bankAccount: { clinicId } },
      include: { bankStatementEntry: true, bankAccount: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      accounts: accounts.map((account: any) => ({
        id: account.id,
        bankName: account.bankName,
        accountName: account.accountName,
        maskedAccountNumber: `•••• ${account.accountNumberLast4}`,
        currency: account.currency,
        status: account.status,
        openingBalance: Number(account.openingBalance),
        openingBalanceAt: account.openingBalanceAt,
        pendingStatementCount: account.statementEntries.filter((entry: any) => entry.status === 'UNMATCHED').length,
        recentEntries: account.statementEntries.map((entry: any) => ({ id: entry.id, externalReference: entry.externalReference, transactionAt: entry.transactionAt, amount: Number(entry.amount), description: entry.description, status: entry.status })),
      })),
      reconciliations: reconciliations.map((item: any) => ({ id: item.id, status: item.status, bankName: item.bankAccount.bankName, accountName: item.bankAccount.accountName, statementReference: item.bankStatementEntry.externalReference, amount: Number(item.bankStatementEntry.amount), transactionAt: item.bankStatementEntry.transactionAt, note: item.note, createdAt: item.createdAt })),
      paymentCandidates: payments.map((payment) => ({ id: payment.id, amount: Number(payment.amount), paidAt: payment.paidAt, reference: payment.reference || `Paiement ${payment.invoiceId.slice(0, 8)}` })),
    };
  }

  async createBankAccount(userId: string | undefined, dto: CreateBankAccountDto) {
    const actor = await this.financeActor(userId);
    const accountNumber = dto.accountNumber.replace(/\s+/g, '');
    if (accountNumber.length < 6) throw new BadRequestException('Le numéro de compte doit contenir au moins six caractères.');
    const currency = (dto.currency || 'CDF').trim().toUpperCase();
    if (currency !== 'CDF') throw new BadRequestException('Cette installation Aulia Care est configurée exclusivement en CDF.');
    const created = await (this.prisma as any).bankAccount.create({
      data: {
        clinicId: actor.clinicId,
        bankName: dto.bankName.trim(),
        accountName: dto.accountName.trim(),
        currency,
        accountNumberCiphertext: this.encryptBankIdentifier(accountNumber),
        accountNumberLast4: accountNumber.slice(-4),
        openingBalance: dto.openingBalance || 0,
        openingBalanceAt: dto.openingBalanceAt ? new Date(dto.openingBalanceAt) : new Date(),
        createdById: actor.id,
      },
    });
    await this.auditFinance(actor.id, actor.clinicId, AuditAction.CREATE, 'BankAccount', created.id, { bankName: created.bankName, accountName: created.accountName, maskedAccount: `•••• ${created.accountNumberLast4}`, status: created.status });
    this.gateway.notifyFinanceClinic(actor.clinicId, { resource: 'bank-account' });
    return { id: created.id, status: created.status, maskedAccountNumber: `•••• ${created.accountNumberLast4}` };
  }

  async updateBankAccountStatus(userId: string | undefined, bankAccountId: string, dto: UpdateBankAccountStatusDto) {
    const actor = await this.financeActor(userId);
    const account = await (this.prisma as any).bankAccount.findFirst({ where: { id: bankAccountId, clinicId: actor.clinicId } });
    if (!account) throw new NotFoundException('Compte bancaire introuvable.');
    if (dto.status === 'ACTIVE') await this.requireSecondController(actor.id, account.createdById);
    if (account.status === 'CLOSED') throw new BadRequestException('Un compte bancaire clôturé ne peut pas être réactivé.');
    const updated = await (this.prisma as any).bankAccount.update({ where: { id: account.id }, data: { status: dto.status, ...(dto.status === 'ACTIVE' ? { approvedById: actor.id, approvedAt: new Date() } : {}), ...(dto.status === 'CLOSED' ? { deactivatedAt: new Date() } : {}) } });
    await this.auditFinance(actor.id, actor.clinicId, AuditAction.APPROVE, 'BankAccount', updated.id, { previousStatus: account.status, status: updated.status });
    this.gateway.notifyFinanceClinic(actor.clinicId, { resource: 'bank-account' });
    return { id: updated.id, status: updated.status };
  }

  async importBankStatementEntry(userId: string | undefined, bankAccountId: string, dto: CreateBankStatementEntryDto) {
    const actor = await this.financeActor(userId);
    const account = await (this.prisma as any).bankAccount.findFirst({ where: { id: bankAccountId, clinicId: actor.clinicId, status: 'ACTIVE' } });
    if (!account) throw new NotFoundException('Compte bancaire actif introuvable.');
    const created = await (this.prisma as any).bankStatementEntry.create({ data: { bankAccountId: account.id, externalReference: dto.externalReference.trim(), transactionAt: new Date(dto.transactionAt), amount: dto.amount, description: dto.description.trim(), rawPayload: dto.rawPayload || undefined, importedById: actor.id } });
    await this.auditFinance(actor.id, actor.clinicId, AuditAction.CREATE, 'BankStatementEntry', created.id, { bankAccountId, externalReference: created.externalReference, amount: String(created.amount) });
    this.gateway.notifyFinanceClinic(actor.clinicId, { resource: 'bank-statement' });
    return created;
  }

  async proposeBankReconciliation(userId: string | undefined, bankAccountId: string, dto: CreateBankReconciliationDto) {
    const actor = await this.financeActor(userId);
    if (Boolean(dto.paymentId) === Boolean(dto.supplierPaymentId)) throw new BadRequestException('Rapprochez exactement un paiement patient ou un paiement fournisseur.');
    const statement = await (this.prisma as any).bankStatementEntry.findFirst({ where: { id: dto.bankStatementEntryId, bankAccountId, bankAccount: { clinicId: actor.clinicId }, status: 'UNMATCHED' } });
    if (!statement) throw new NotFoundException('Ligne de relevé bancaire non rapprochée introuvable.');
    if (dto.paymentId) {
      const payment = await this.prisma.payment.findFirst({ where: { id: dto.paymentId, clinicId: actor.clinicId, deletedAt: null } });
      if (!payment) throw new NotFoundException('Paiement patient introuvable dans cet établissement.');
      if (Number(payment.amount) !== Math.abs(Number(statement.amount))) throw new BadRequestException('Le montant du paiement ne correspond pas à la ligne bancaire.');
    }
    if (dto.supplierPaymentId) {
      const supplierPayment = await (this.prisma as any).supplierPayment.findFirst({ where: { id: dto.supplierPaymentId, supplierInvoice: { is: { purchaseOrder: { is: { clinicId: actor.clinicId } } } } } });
      if (!supplierPayment) throw new NotFoundException('Paiement fournisseur introuvable dans cet établissement.');
      if (Number(supplierPayment.amount) !== Math.abs(Number(statement.amount))) throw new BadRequestException('Le montant fournisseur ne correspond pas à la ligne bancaire.');
    }
    const created = await (this.prisma as any).bankReconciliation.create({ data: { bankAccountId, bankStatementEntryId: statement.id, paymentId: dto.paymentId || null, supplierPaymentId: dto.supplierPaymentId || null, note: dto.note?.trim() || null, proposedById: actor.id } });
    await this.auditFinance(actor.id, actor.clinicId, AuditAction.CREATE, 'BankReconciliation', created.id, { bankAccountId, bankStatementEntryId: statement.id });
    this.gateway.notifyFinanceClinic(actor.clinicId, { resource: 'bank-reconciliation' });
    return created;
  }

  async reviewBankReconciliation(userId: string | undefined, reconciliationId: string, dto: ReviewBankReconciliationDto) {
    const actor = await this.financeActor(userId);
    const reconciliation = await (this.prisma as any).bankReconciliation.findFirst({ where: { id: reconciliationId, bankAccount: { clinicId: actor.clinicId } }, include: { bankStatementEntry: true } });
    if (!reconciliation) throw new NotFoundException('Rapprochement introuvable.');
    if (reconciliation.status !== 'PENDING_APPROVAL') throw new BadRequestException('Ce rapprochement a déjà été traité.');
    await this.requireSecondController(actor.id, reconciliation.proposedById);
    await this.prisma.$transaction(async (tx) => {
      await (tx as any).bankReconciliation.update({ where: { id: reconciliation.id }, data: { status: dto.status, note: dto.note?.trim() || reconciliation.note, approvedById: actor.id, approvedAt: new Date() } });
      if (dto.status === 'APPROVED') await (tx as any).bankStatementEntry.update({ where: { id: reconciliation.bankStatementEntryId }, data: { status: 'MATCHED' } });
    });
    await this.auditFinance(actor.id, actor.clinicId, dto.status === 'APPROVED' ? AuditAction.APPROVE : AuditAction.REJECT, 'BankReconciliation', reconciliation.id, { status: dto.status });
    this.gateway.notifyFinanceClinic(actor.clinicId, { resource: 'bank-reconciliation' });
    return { id: reconciliation.id, status: dto.status };
  }

  async accountingJournal(userId?: string) {
    const clinicId = await this.financeClinicId(userId);
    const entries = await (this.prisma as any).accountingJournalEntry.findMany({ where: { clinicId }, include: { lines: true }, orderBy: { occurredAt: 'desc' }, take: 200 });
    return entries.map((entry: any) => ({ ...entry, lines: entry.lines.map((line: any) => ({ ...line, debit: Number(line.debit), credit: Number(line.credit) })) }));
  }

  async createAccountingJournalEntry(userId: string | undefined, dto: CreateAccountingJournalEntryDto) {
    const actor = await this.financeActor(userId);
    if (dto.lines.length < 2) throw new BadRequestException('Une écriture doit comporter au moins deux lignes.');
    const lines = dto.lines.map((line) => ({ account: line.account.trim(), label: line.label.trim(), debit: Number(line.debit || 0), credit: Number(line.credit || 0) }));
    if (lines.some((line) => !line.account || !line.label || (line.debit <= 0 && line.credit <= 0) || (line.debit > 0 && line.credit > 0))) {
      throw new BadRequestException('Chaque ligne doit contenir un compte, un libellé et un seul sens : débit ou crédit.');
    }
    const debit = lines.reduce((sum, line) => sum + line.debit, 0);
    const credit = lines.reduce((sum, line) => sum + line.credit, 0);
    if (Math.round(debit * 100) !== Math.round(credit * 100)) throw new BadRequestException('L’écriture n’est pas équilibrée : le total débit doit être égal au total crédit.');
    const previous = await (this.prisma as any).accountingJournalEntry.findFirst({ where: { clinicId: actor.clinicId, status: 'POSTED' }, orderBy: { postedAt: 'desc' }, select: { entryHash: true } });
    const reference = dto.reference.trim();
    const entryHash = this.journalHash(previous?.entryHash || null, { clinicId: actor.clinicId, reference, occurredAt: dto.occurredAt, sourceType: dto.sourceType, lines });
    const entry = await (this.prisma as any).accountingJournalEntry.create({ data: { clinicId: actor.clinicId, reference, occurredAt: new Date(dto.occurredAt), description: dto.description.trim(), sourceType: dto.sourceType, sourceId: dto.sourceId?.trim() || null, previousHash: previous?.entryHash || null, entryHash, createdById: actor.id, lines: { create: lines } }, include: { lines: true } });
    await this.auditFinance(actor.id, actor.clinicId, AuditAction.CREATE, 'AccountingJournalEntry', entry.id, { reference, sourceType: entry.sourceType, debit, credit, entryHash });
    this.gateway.notifyFinanceClinic(actor.clinicId, { resource: 'journal' });
    return entry;
  }

  async postAccountingJournalEntry(userId: string | undefined, entryId: string) {
    const actor = await this.financeActor(userId);
    const entry = await (this.prisma as any).accountingJournalEntry.findFirst({ where: { id: entryId, clinicId: actor.clinicId }, include: { lines: true } });
    if (!entry) throw new NotFoundException('Écriture comptable introuvable.');
    if (entry.status !== 'DRAFT') throw new BadRequestException('Seule une écriture brouillon peut être comptabilisée.');
    await this.requireSecondController(actor.id, entry.createdById);
    const debit = entry.lines.reduce((sum: number, line: any) => sum + Number(line.debit), 0);
    const credit = entry.lines.reduce((sum: number, line: any) => sum + Number(line.credit), 0);
    if (Math.round(debit * 100) !== Math.round(credit * 100)) throw new BadRequestException('L’écriture n’est plus équilibrée et ne peut pas être comptabilisée.');
    const updated = await (this.prisma as any).accountingJournalEntry.update({ where: { id: entry.id }, data: { status: 'POSTED', postedById: actor.id, postedAt: new Date() } });
    await this.auditFinance(actor.id, actor.clinicId, AuditAction.APPROVE, 'AccountingJournalEntry', entry.id, { status: 'POSTED', debit, credit, entryHash: entry.entryHash });
    this.gateway.notifyFinanceClinic(actor.clinicId, { resource: 'journal' });
    return updated;
  }

  async createRefundRequest(userId: string | undefined, dto: CreateRefundRequestDto) {
    const actor = await this.financeActor(userId);
    const invoice = await this.prisma.invoice.findFirst({ where: { id: dto.invoiceId, clinicId: actor.clinicId, deletedAt: null }, include: { payments: { where: { deletedAt: null } } } });
    if (!invoice) throw new NotFoundException('Facture introuvable dans cet établissement.');
    if (dto.paymentId && !invoice.payments.some((payment) => payment.id === dto.paymentId)) throw new BadRequestException('Le paiement indiqué n’appartient pas à cette facture.');
    const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const existingRefunds = await (this.prisma as any).refundRequest.aggregate({ where: { invoiceId: invoice.id, status: { in: ['PENDING_APPROVAL', 'APPROVED', 'EXECUTED'] } }, _sum: { amount: true } });
    if (dto.amount + Number(existingRefunds._sum.amount || 0) > paid) throw new BadRequestException('Le remboursement demandé dépasse le montant réellement encaissé et non déjà remboursé.');
    const created = await (this.prisma as any).refundRequest.create({ data: { clinicId: actor.clinicId, invoiceId: invoice.id, paymentId: dto.paymentId || null, amount: dto.amount, reason: dto.reason.trim(), requestedById: actor.id } });
    await this.auditFinance(actor.id, actor.clinicId, AuditAction.CREATE, 'RefundRequest', created.id, { invoiceId: invoice.id, paymentId: dto.paymentId || null, amount: String(created.amount), reason: created.reason });
    this.gateway.notifyFinanceClinic(actor.clinicId, { resource: 'refund' });
    return created;
  }

  async reviewRefundRequest(userId: string | undefined, refundId: string, dto: ReviewRefundDto) {
    const actor = await this.financeActor(userId);
    const request = await (this.prisma as any).refundRequest.findFirst({ where: { id: refundId, clinicId: actor.clinicId } });
    if (!request) throw new NotFoundException('Demande d’avoir ou remboursement introuvable.');
    const transitions: Record<string, string[]> = { PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'CANCELLED'], APPROVED: ['EXECUTED', 'CANCELLED'], REJECTED: [], EXECUTED: [], CANCELLED: [] };
    if (!transitions[request.status]?.includes(dto.status)) throw new BadRequestException('Transition de remboursement non autorisée.');
    if (dto.status === 'APPROVED' || dto.status === 'EXECUTED') await this.requireSecondController(actor.id, request.requestedById);
    const updated = await (this.prisma as any).refundRequest.update({ where: { id: request.id }, data: { status: dto.status, ...(dto.status === 'APPROVED' ? { approvedById: actor.id, approvedAt: new Date() } : {}), ...(dto.status === 'EXECUTED' ? { executedById: actor.id, executedAt: new Date() } : {}) } });
    await this.auditFinance(actor.id, actor.clinicId, dto.status === 'APPROVED' ? AuditAction.APPROVE : AuditAction.UPDATE, 'RefundRequest', updated.id, { previousStatus: request.status, status: updated.status, amount: String(updated.amount) });
    this.gateway.notifyFinanceClinic(actor.clinicId, { resource: 'refund' });
    return updated;
  }

  async findInvoices(userId?: string) {
    const clinicId = await this.financeClinicId(userId);
    // Legacy rows without clinicId are readable only in a confirmed
    // single-clinic installation.  This preserves isolation as soon as more
    // than one establishment exists.
    const clinicCount = await (this.prisma as any).clinic.count();
    const invoiceScope = clinicCount === 1
      ? { OR: [{ clinicId }, { clinicId: null }] }
      : { clinicId };
    const invoices = await this.prisma.invoice.findMany({
      where: { ...invoiceScope, deletedAt: null },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            insuranceProvider: true,
            workflowStatus: true,
          },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            method: true,
            paidAt: true,
            reference: true,
          },
          orderBy: {
            paidAt: 'desc',
          },
        },
      },
      orderBy: {
        issuedAt: 'desc',
      },
    });

    const invoiceIds = invoices.map((invoice) => invoice.id);
    const invoiceLines = invoiceIds.length
      ? await this.prisma.invoiceLine.findMany({
          where: {
            invoiceId: {
              in: invoiceIds,
            },
            deletedAt: null,
          },
          select: {
            id: true,
            invoiceId: true,
            label: true,
            quantity: true,
            unitPrice: true,
            totalAmount: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        })
      : [];

    const linesByInvoiceId = invoiceLines.reduce<Record<string, typeof invoiceLines>>((acc, line) => {
      if (!acc[line.invoiceId]) {
        acc[line.invoiceId] = [];
      }
      acc[line.invoiceId].push(line);
      return acc;
    }, {});

    return invoices.map((inv) => ({
      id: inv.id,
      patientId: inv.patientId,
      patientName: inv.patient ? `${inv.patient.firstName} ${inv.patient.lastName}` : 'Unknown',
      patientPhone: inv.patient?.phone,
      patientEmail: inv.patient?.email,
      patientCompany: inv.patient?.insuranceProvider || null,
      patientWorkflowStatus: inv.patient?.workflowStatus || null,
      type: inv.type,
      status: inv.status,
      totalAmount: Number(inv.totalAmount),
      balanceDue: Number(inv.balanceDue),
      issuedAt: inv.issuedAt,
      dueDate: inv.dueDate,
      remarks: inv.remarks,
      payments: inv.payments.map((payment) => ({
        ...payment,
        amount: Number(payment.amount),
      })),
      invoiceLines: (linesByInvoiceId[inv.id] || []).map((line) => ({
        id: line.id,
        label: line.label,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        totalAmount: Number(line.totalAmount),
      })),
      createdAt: inv.createdAt,
    }));
  }

  async findPayments(userId?: string) {
    const clinicId = await this.financeClinicId(userId);
    const payments = await this.prisma.payment.findMany({
      where: { clinicId, deletedAt: null },
      include: {
        invoice: {
          select: {
            id: true,
            type: true,
            patientId: true,
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
                insuranceProvider: true,
              },
            },
          },
        },
      },
      orderBy: {
        paidAt: 'desc',
      },
    });

    return payments.map((payment) => ({
      id: payment.id,
      patientId: payment.invoice?.patientId,
      patientName: payment.invoice?.patient
        ? `${payment.invoice.patient.firstName} ${payment.invoice.patient.lastName}`
        : 'Unknown',
      patientPhone: payment.invoice?.patient?.phone,
      patientEmail: payment.invoice?.patient?.email,
      patientCompany: payment.invoice?.patient?.insuranceProvider || null,
      invoiceId: payment.invoiceId,
      invoiceType: payment.invoice?.type,
      amount: Number(payment.amount),
      method: payment.method,
      paidAt: payment.paidAt,
      reference: payment.reference,
      createdAt: payment.createdAt,
    }));
  }

  async findPayment(id: string, userId?: string) {
    const clinicId = await this.financeClinicId(userId);
    const payment = await this.prisma.payment.findFirst({
      where: { id, clinicId, deletedAt: null },
      include: {
        invoice: {
          include: {
            patient: true,
          },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException('Paiement introuvable');
    }
    return payment;
  }

  async getPatientBillingSummary(patientId: string, userId?: string) {
    const clinicId = await this.financeClinicId(userId);
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        workflowStatus: true,
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient introuvable');
    }

    const invoices = await this.prisma.invoice.findMany({
      where: {
        patientId,
        clinicId,
        deletedAt: null,
      },
      include: {
        payments: true,
      },
      orderBy: {
        issuedAt: 'asc',
      },
    });

    const lines = invoices.map((invoice) => {
      const paidAmount = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      return {
        id: invoice.id,
        type: invoice.type,
        status: invoice.status,
        totalAmount: Number(invoice.totalAmount),
        paidAmount,
        balanceDue: Number(invoice.balanceDue),
        issuedAt: invoice.issuedAt,
        dueDate: invoice.dueDate,
        remarks: invoice.remarks,
      };
    });

    return {
      patient: {
        ...patient,
        name: `${patient.firstName} ${patient.lastName}`,
      },
      invoices: lines,
      totalAmount: lines.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
      totalPaid: lines.reduce((sum, invoice) => sum + invoice.paidAmount, 0),
      balanceDue: lines.reduce((sum, invoice) => sum + invoice.balanceDue, 0),
    };
  }

  async applyInvoiceDiscount(invoiceId: string, amount: number, reason?: string) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Le montant de la reduction est invalide.');
    }

    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable');
    }

    const currentBalance = Number(invoice.balanceDue);
    const currentTotal = Number(invoice.totalAmount);
    const discount = Math.min(amount, currentBalance);
    const nextBalance = Math.max(currentBalance - discount, 0);
    const nextTotal = Math.max(currentTotal - discount, 0);

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        totalAmount: nextTotal,
        balanceDue: nextBalance,
        status: nextBalance === 0 ? 'PAID' : 'PARTIALLY_PAID',
        remarks: [invoice.remarks, `Reduction caisse: ${discount} FC${reason ? ` - ${reason}` : ''}`]
          .filter(Boolean)
          .join('\n'),
      },
    });
  }

  async requestInvoiceDiscount(invoiceId: string, amount: number, reason: string, requesterId?: string) {
    if (!requesterId || !Number.isFinite(amount) || amount <= 0 || !reason?.trim()) throw new BadRequestException('Montant, motif et demandeur sont requis.');
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Facture introuvable.');
    if (amount > Number(invoice.balanceDue)) throw new BadRequestException('La réduction ne peut pas dépasser le solde restant.');
    const request = await this.prisma.invoiceDiscountRequest.create({ data: { invoiceId, requestedById: requesterId, amount, reason: reason.trim() } });
    const financeRecipients = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', primaryRole: { in: ['ADMIN', 'SUPER_ADMIN', 'FINANCE'] } },
      select: { id: true },
    });
    financeRecipients.forEach(({ id }) => this.gateway.notifyToUser(id, 'discount.requested', request));
    return request;
  }

  async reviewInvoiceDiscount(requestId: string, approved: boolean, reviewerId?: string, reviewNote?: string) {
    if (!reviewerId) throw new BadRequestException('Administrateur non identifié.');
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.invoiceDiscountRequest.findUnique({ where: { id: requestId }, include: { invoice: true } });
      if (!request) throw new NotFoundException('Demande de réduction introuvable.');
      if (request.status !== 'PENDING') throw new BadRequestException('Cette demande a déjà été traitée.');
      if (!approved) return tx.invoiceDiscountRequest.update({ where: { id: requestId }, data: { status: 'REJECTED', reviewedById: reviewerId, reviewedAt: new Date(), reviewNote: reviewNote || null } });
      const discount = Math.min(Number(request.amount), Number(request.invoice.balanceDue));
      const invoice = await tx.invoice.update({ where: { id: request.invoiceId }, data: { totalAmount: Math.max(Number(request.invoice.totalAmount) - discount, 0), balanceDue: Math.max(Number(request.invoice.balanceDue) - discount, 0), remarks: [request.invoice.remarks, `Réduction approuvée: ${discount} FC - ${request.reason}`].filter(Boolean).join('\n') } });
      const reviewed = await tx.invoiceDiscountRequest.update({ where: { id: requestId }, data: { status: 'APPROVED', reviewedById: reviewerId, reviewedAt: new Date(), reviewNote: reviewNote || null } });
      return { request: reviewed, invoice };
    }).then((result: any) => { if (result?.request?.requestedById) this.gateway.notifyToUser(result.request.requestedById, 'discount.reviewed', result); return result; });
  }

  async authorizePatientDischarge(patientId: string) {
    const summary = await this.getPatientBillingSummary(patientId);
    if (summary.balanceDue > 0) {
      throw new BadRequestException('Impossible d’autoriser la sortie: le patient a encore un solde a payer.');
    }

    const patient = await this.prisma.patient.update({
      where: { id: patientId },
      data: {
        workflowStatus: PatientWorkflowStatus.TERMINE,
      },
    });

    return {
      authorized: true,
      patient,
      summary,
    };
  }
}
