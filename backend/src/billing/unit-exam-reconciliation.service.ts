import { ForbiddenException, Injectable } from '@nestjs/common';
import { RoleSlug } from '@prisma/client';
import { ClinicContextService } from '../core/clinic-context.service';
import { PrismaService } from '../prisma/prisma.service';

const READERS: readonly RoleSlug[] = [RoleSlug.FINANCE, RoleSlug.ADMIN, RoleSlug.SUPER_ADMIN, RoleSlug.CASHIER];
const PERFORMED_LAB = new Set(['TECHNICAL_VALIDATION', 'BIOLOGICAL_VALIDATION', 'AVAILABLE', 'SENT', 'COMPLETED', 'VERIFIED']);
const PERFORMED_IMAGING = new Set(['COMPLETED', 'VERIFIED']);
const DAY = 86_400_000;

export type ReconciliationLine = {
  kind: 'LABORATORY' | 'IMAGING'; examId: string; exam: string; patient: string; patientId: string; requesterUnit: string;
  requestedAt: string; performed: boolean; examStatus: string;
  invoiceId: string | null; invoiceStatus: string | null; amount: number; balanceDue: number; ageDays: number;
  issue: 'PERFORMED_UNPAID' | 'UNPAID' | 'NO_INVOICE' | null;
};

/**
 * Care units perform exams before payment (emergency care does not wait for
 * the cashier), while consultations are paid first. This report reconciles
 * every exam requested by a unit with its invoice, so that no performed exam
 * stays unbilled or unpaid without anybody noticing.
 */
@Injectable()
export class UnitExamReconciliationService {
  constructor(private readonly prisma: PrismaService, private readonly clinicContext: ClinicContextService) {}

  async report(days: number, actorInput?: { userId?: string }) {
    const actor = await this.clinicContext.requireOperationalActor(actorInput);
    if (!actor.primaryRole || !READERS.includes(actor.primaryRole)) throw new ForbiddenException('Rapport réservé à la finance, à la caisse et à l’administration.');
    const since = new Date(Date.now() - Math.min(Math.max(days, 1), 366) * DAY);
    const [labs, imaging] = await Promise.all([
      this.prisma.labRequest.findMany({
        where: { clinicId: actor.clinicId, serviceRequestId: { not: null }, requestedAt: { gte: since }, deletedAt: null },
        select: {
          id: true, status: true, requestedAt: true, externalReference: true, specimenType: true, patientId: true,
          patient: { select: { firstName: true, lastName: true } },
          serviceRequest: { select: { requesterUnit: { select: { name: true } } } },
        },
        orderBy: { requestedAt: 'desc' },
        take: 2000,
      }),
      this.prisma.imagingRequest.findMany({
        where: { clinicId: actor.clinicId, serviceRequestId: { not: null }, createdAt: { gte: since }, deletedAt: null },
        select: {
          id: true, status: true, createdAt: true, bodyPart: true, patientId: true,
          patient: { select: { firstName: true, lastName: true } },
          serviceRequest: { select: { requesterUnit: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
    ]);
    const labInvoiceIds = labs.map((item) => item.externalReference).filter((id): id is string => Boolean(id));
    const [labInvoices, imagingInvoices] = await Promise.all([
      this.prisma.invoice.findMany({ where: { id: { in: labInvoiceIds }, clinicId: actor.clinicId }, select: { id: true, status: true, totalAmount: true, balanceDue: true } }),
      imaging.length
        ? this.prisma.invoice.findMany({
          where: { clinicId: actor.clinicId, type: 'RADIOLOGY', OR: imaging.map((item) => ({ remarks: { startsWith: `ImagingRequest:${item.id} ` } })) },
          select: { id: true, status: true, totalAmount: true, balanceDue: true, remarks: true },
        })
        : Promise.resolve([]),
    ]);
    const labInvoiceById = new Map(labInvoices.map((invoice) => [invoice.id, invoice]));
    const imagingInvoiceByExam = new Map(imagingInvoices.map((invoice) => [String(invoice.remarks ?? '').split(' ')[0].replace('ImagingRequest:', ''), invoice]));
    const now = Date.now();
    const line = (input: Omit<ReconciliationLine, 'issue' | 'ageDays'>): ReconciliationLine => {
      const unpaid = input.invoiceStatus === 'PENDING' || input.invoiceStatus === 'PARTIALLY_PAID' || input.invoiceStatus === 'ISSUED';
      const cancelledExam = input.examStatus === 'CANCELLED';
      const issue = cancelledExam ? null
        : !input.invoiceId ? 'NO_INVOICE'
        : unpaid && input.performed ? 'PERFORMED_UNPAID'
        : unpaid ? 'UNPAID' : null;
      return { ...input, ageDays: Math.floor((now - new Date(input.requestedAt).getTime()) / DAY), issue };
    };
    const name = (patient: { firstName: string; lastName: string }) => `${patient.lastName} ${patient.firstName}`.trim();
    const lines: ReconciliationLine[] = [
      ...labs.map((item) => {
        const invoice = item.externalReference ? labInvoiceById.get(item.externalReference) : undefined;
        return line({
          kind: 'LABORATORY', examId: item.id, exam: item.specimenType ?? 'Examen de laboratoire', patient: name(item.patient), patientId: item.patientId,
          requesterUnit: item.serviceRequest?.requesterUnit?.name ?? '—', requestedAt: item.requestedAt.toISOString(),
          performed: PERFORMED_LAB.has(item.status), examStatus: item.status,
          invoiceId: invoice?.id ?? null, invoiceStatus: invoice?.status ?? null, amount: Number(invoice?.totalAmount ?? 0), balanceDue: Number(invoice?.balanceDue ?? 0),
        });
      }),
      ...imaging.map((item) => {
        const invoice = imagingInvoiceByExam.get(item.id);
        return line({
          kind: 'IMAGING', examId: item.id, exam: item.bodyPart, patient: name(item.patient), patientId: item.patientId,
          requesterUnit: item.serviceRequest?.requesterUnit?.name ?? '—', requestedAt: item.createdAt.toISOString(),
          performed: PERFORMED_IMAGING.has(item.status), examStatus: item.status,
          invoiceId: invoice?.id ?? null, invoiceStatus: invoice?.status ?? null, amount: Number(invoice?.totalAmount ?? 0), balanceDue: Number(invoice?.balanceDue ?? 0),
        });
      }),
    ].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    const sum = (rows: ReconciliationLine[], pick: (row: ReconciliationLine) => number) => rows.reduce((total, row) => total + pick(row), 0);
    const active = lines.filter((row) => row.examStatus !== 'CANCELLED');
    return {
      since: since.toISOString(),
      totals: {
        exams: active.length,
        billed: sum(active, (row) => row.amount),
        paid: sum(active.filter((row) => row.invoiceStatus === 'PAID'), (row) => row.amount),
        covered: sum(active.filter((row) => row.invoiceStatus === 'COVERED'), (row) => row.amount),
        outstanding: sum(active, (row) => (row.invoiceStatus === 'CANCELLED' ? 0 : row.balanceDue)),
        performedUnpaid: active.filter((row) => row.issue === 'PERFORMED_UNPAID').length,
        performedUnpaidAmount: sum(active.filter((row) => row.issue === 'PERFORMED_UNPAID'), (row) => row.balanceDue),
        withoutInvoice: active.filter((row) => row.issue === 'NO_INVOICE').length,
        cancelled: lines.length - active.length,
      },
      lines,
    };
  }
}
