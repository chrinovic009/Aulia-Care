import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, AuditAction, PatientWorkflowStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly notificationsGateway: NotificationsGateway) {}

  async createPayment(createPaymentDto: CreatePaymentDto, actorId?: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: createPaymentDto.invoiceId },
      include: { patient: true },
    });

    if (!invoice) {
      throw new NotFoundException('Facture introuvable');
    }

    if (invoice.status === 'PAID') {
      throw new BadRequestException('Cette facture est déjà payée.');
    }

    const amount = Number(createPaymentDto.amount);
    const balanceDue = Number(invoice.balanceDue.toString());
    if (amount < balanceDue) {
      throw new BadRequestException('Le montant doit couvrir le solde dû.');
    }

    const result = await this.prisma.$transaction(async (prisma) => {
      const payment = await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount,
          method: createPaymentDto.method,
          reference: createPaymentDto.reference,
          note: createPaymentDto.note,
          paidById: actorId,
          paidAt: new Date(),
        },
      });

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          balanceDue: 0,
          updatedAt: new Date(),
        },
      });

      const updatedPatient = await prisma.patient.update({
        where: { id: invoice.patientId },
        data: {
          workflowStatus: PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE,
        },
      });

      const nurseUsers = await prisma.user.findMany({
        where: {
          OR: [
            { primaryRole: 'NURSE' },
            { roles: { some: { role: { slug: 'NURSE' } } } },
          ],
        },
      });

      const notifications = await Promise.all(
        nurseUsers.map((user) =>
          prisma.notification.create({
            data: {
              recipientId: user.id,
              type: 'ALERT',
              status: 'UNREAD',
              priority: 'HIGH',
              title: 'Patient prêt pour l’infirmerie',
              message: `Le patient ${updatedPatient.firstName} ${updatedPatient.lastName} est en attente de l’infirmerie après paiement.`,
              relatedEntity: 'Patient',
              relatedId: updatedPatient.id,
              sendAt: new Date(),
            },
          }),
        ),
      );

      let hospitalization = null;
      if (invoice.patient?.admissionType?.toLowerCase() === 'hospitalisation') {
        hospitalization = await prisma.hospitalization.create({
          data: {
            patientId: invoice.patientId,
            admittedAt: new Date(),
            status: 'ADMITTED',
            admissionReason: 'Admission hospitalière validée après paiement',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }

      await prisma.auditLog.create({
        data: {
          actorId,
          patientId: invoice.patientId,
          action: AuditAction.APPROVE,
          entity: 'Invoice',
          entityId: invoice.id,
          summary: 'Paiement enregistré et statut patient mis à jour.',
          metadata: {
            paymentId: payment.id,
            invoiceId: invoice.id,
            hospitalizationId: hospitalization?.id,
          },
        },
      });

      return { payment, updatedInvoice, updatedPatient, notifications, hospitalization };
    });

    result.notifications.forEach((notification) => {
      this.notificationsGateway.notify('notification.created', notification);
    });

    return {
      payment: result.payment,
      invoice: result.updatedInvoice,
      patient: result.updatedPatient,
      hospitalization: result.hospitalization,
    };
  }
}
