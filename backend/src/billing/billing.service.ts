import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PatientWorkflowStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

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

    return invoices.map((inv) => ({
      id: inv.id,
      patientId: inv.patientId,
      patientName: inv.patient ? `${inv.patient.firstName} ${inv.patient.lastName}` : 'Unknown',
      patientPhone: inv.patient?.phone,
      patientEmail: inv.patient?.email,
      patientCompany: inv.patient?.insuranceProvider || null,
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
