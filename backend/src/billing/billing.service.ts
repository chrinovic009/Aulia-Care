import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PatientWorkflowStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService, private readonly gateway: NotificationsGateway) {}

  async financialForecast() {
    const since = new Date(); since.setMonth(since.getMonth() - 5); since.setDate(1); since.setHours(0, 0, 0, 0);
    const invoices = await this.prisma.invoice.findMany({ where: { issuedAt: { gte: since }, deletedAt: null }, select: { issuedAt: true, totalAmount: true, balanceDue: true } });
    const buckets = new Map<string, { billed: number; outstanding: number }>();
    invoices.forEach((invoice) => { const key = `${invoice.issuedAt.getFullYear()}-${String(invoice.issuedAt.getMonth() + 1).padStart(2, '0')}`; const current = buckets.get(key) || { billed: 0, outstanding: 0 }; current.billed += Number(invoice.totalAmount); current.outstanding += Number(invoice.balanceDue); buckets.set(key, current); });
    const months = Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, values]) => ({ month, ...values }));
    const average = months.length ? months.reduce((sum, month) => sum + month.billed, 0) / months.length : 0;
    const trend = months.length > 1 ? months[months.length - 1].billed - months[0].billed : 0;
    return { months, forecastNextMonth: Math.max(0, Math.round(average + trend / Math.max(months.length - 1, 1))), outstandingBalance: months.reduce((sum, month) => sum + month.outstanding, 0), method: 'Moyenne mobile simple : aide au pilotage, non prévision comptable certifiée.' };
  }

  async findInvoices() {
    const invoices = await this.prisma.invoice.findMany({
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

  async findPayments() {
    const payments = await this.prisma.payment.findMany({
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

  async findPayment(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
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

  async getPatientBillingSummary(patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
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
    this.gateway.notify('discount.requested', request);
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
    }).then((result: any) => { this.gateway.notify('discount.reviewed', result); if (result?.request?.requestedById) this.gateway.notifyToUser(result.request.requestedById, 'discount.reviewed', result); return result; });
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
