import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, AuditAction, PatientWorkflowStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { CreatePaymentDto } from './dto/create-payment.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly notificationsGateway: NotificationsGateway) {}

  async createPayment(createPaymentDto: CreatePaymentDto, actorId?: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: createPaymentDto.invoiceId },
      include: { patient: { include: { service: { include: { responsables: { where: { actif: true }, include: { user: true } }, staff: { where: { actif: true }, include: { user: true } } } } } } },
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

      const normalizedServiceName = String(invoice.patient?.service?.name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      const nextWorkflowStatus =
        invoice.type === 'PHARMACY'
          ? PatientWorkflowStatus.EN_PHARMACIE
          : invoice.type === 'LABORATORY' || normalizedServiceName.includes('laboratoire')
            ? PatientWorkflowStatus.EN_LABORATOIRE
            : normalizedServiceName.includes('radio') || normalizedServiceName.includes('imagerie')
              ? PatientWorkflowStatus.EN_RADIOLOGIE
              : invoice.type === 'SERVICE'
                ? PatientWorkflowStatus.EN_ATTENTE_MEDECIN
                : PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE;

      const updatedPatient = await prisma.patient.update({
        where: { id: invoice.patientId },
        data: {
          workflowStatus: nextWorkflowStatus,
        },
      });

      const patientUserAccess = await this.ensurePatientUserAccess(prisma, updatedPatient);

      let receptionistMessage = null;
      if (updatedPatient.receptionistId) {
        const accessText = [
          `Acces patient crees pour ${updatedPatient.firstName} ${updatedPatient.lastName}.`,
          `Nom utilisateur: ${patientUserAccess.username}`,
          `Mot de passe: ${patientUserAccess.password}`,
          `Veuillez remettre ces acces au patient pour son espace personnel.`,
        ].join('\n');

        receptionistMessage = await prisma.chatMessage.create({
          data: {
            senderId: patientUserAccess.user.id,
            recipientId: updatedPatient.receptionistId,
            recipientType: 'USER',
            text: accessText,
            status: 'SENT',
          },
          include: {
            sender: { select: { id: true, displayName: true, username: true } },
          },
        });

        await prisma.notification.create({
          data: {
            recipientId: updatedPatient.receptionistId,
            patientId: updatedPatient.id,
            type: 'SYSTEM',
            status: 'UNREAD',
            priority: 'HIGH',
            title: 'Acces patient disponibles',
            message: `Les acces du patient ${updatedPatient.firstName} ${updatedPatient.lastName} sont disponibles dans vos messages.`,
            relatedEntity: 'Patient',
            relatedId: updatedPatient.id,
            sendAt: new Date(),
          },
        });
      }

      const targetRole = invoice.type === 'PHARMACY' ? 'PHARMACIST' : invoice.type === 'LABORATORY' ? 'LAB_TECHNICIAN' : 'NURSE';
      const serviceUserIds = invoice.type === 'SERVICE'
        ? [
            ...(invoice.patient?.service?.responsables || []).map((item: any) => item.userId || item.user?.id),
            ...(invoice.patient?.service?.staff || []).map((item: any) => item.userId || item.user?.id),
          ].filter(Boolean)
        : [];
      const targetUsers = await prisma.user.findMany({
        where: {
          ...(serviceUserIds.length ? { id: { in: serviceUserIds } } : {}),
          OR: serviceUserIds.length
            ? undefined
            : invoice.type === 'LABORATORY'
            ? [
                { primaryRole: 'LAB_TECHNICIAN' as any },
                { primaryRole: 'LAB_MANAGER' as any },
                { roles: { some: { role: { slug: 'LAB_TECHNICIAN' as any } } } },
                { roles: { some: { role: { slug: 'LAB_MANAGER' as any } } } },
              ]
            : [
                { primaryRole: targetRole as any },
                { roles: { some: { role: { slug: targetRole as any } } } },
              ],
        },
      });

      const labRequest = invoice.type === 'LABORATORY'
        ? await prisma.labRequest.findFirst({
            where: { externalReference: invoice.id, deletedAt: null },
            include: { patient: true, requestedBy: true, items: { include: { labTest: true } } },
          })
        : null;

      if (labRequest) {
        await prisma.labRequest.update({
          where: { id: labRequest.id },
          data: { status: 'RECEIVED', receivedAt: new Date() },
        });
      }

      const notifications = await Promise.all(
        targetUsers.map((user) =>
          prisma.notification.create({
            data: {
              recipientId: user.id,
              type: 'ALERT',
              status: 'UNREAD',
              priority: 'HIGH',
              title: invoice.type === 'PHARMACY' ? 'Prescription payee' : invoice.type === 'LABORATORY' ? 'Examen laboratoire paye' : 'Patient pret pour infirmerie',
              message:
                invoice.type === 'PHARMACY'
                  ? `Le patient ${updatedPatient.firstName} ${updatedPatient.lastName} a paye sa prescription et attend la pharmacie.`
                  : invoice.type === 'LABORATORY'
                    ? `Le patient ${updatedPatient.firstName} ${updatedPatient.lastName} a paye son examen laboratoire. Vous pouvez traiter la demande.`
                    : invoice.type === 'SERVICE'
                      ? `Le patient ${updatedPatient.firstName} ${updatedPatient.lastName} a paye ${invoice.patient?.service?.name || 'le service demande'} et attend votre prise en charge.`
                    : `Le patient ${updatedPatient.firstName} ${updatedPatient.lastName} est en attente de l'infirmerie apres paiement.`,
              relatedEntity: invoice.type === 'LABORATORY' ? 'LabRequest' : 'Patient',
              relatedId: invoice.type === 'LABORATORY' ? labRequest?.id || invoice.id : updatedPatient.id,
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
            patientUserId: patientUserAccess.user.id,
            labRequestId: labRequest?.id,
          },
        },
      });

      return { payment, updatedInvoice, updatedPatient, notifications, hospitalization, receptionistMessage, labRequest };
    });

    result.notifications.forEach((notification) => {
      this.notificationsGateway.notify('notification.created', notification);
    });
    this.notificationsGateway.notify('patient.updated', result.updatedPatient);
    if (result.labRequest) {
      this.notificationsGateway.notify('lab.request.created', result.labRequest);
    }

    if (result.receptionistMessage) {
      this.notificationsGateway.notifyToUser(result.receptionistMessage.recipientId, 'message.received', {
        id: result.receptionistMessage.id,
        senderId: result.receptionistMessage.senderId,
        senderName:
          result.receptionistMessage.sender?.displayName ||
          result.receptionistMessage.sender?.username ||
          'Patient',
        recipientId: result.receptionistMessage.recipientId,
        recipientType: 'USER',
        text: result.receptionistMessage.text,
        sentAt: result.receptionistMessage.createdAt.toISOString(),
      });
    }

    return {
      payment: result.payment,
      invoice: result.updatedInvoice,
      patient: result.updatedPatient,
      hospitalization: result.hospitalization,
    };
  }

  private async ensurePatientUserAccess(prisma: Prisma.TransactionClient, patient: any) {
    const usernameBase = this.normalizeUsername(`${patient.firstName}_${patient.lastName}`);
    const email = patient.email?.trim().toLowerCase() || `${patient.id}@patients.d7.local`;
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username: usernameBase }],
      },
    });

    const patientPosition = await prisma.patient.count({
      where: {
        createdAt: { lte: patient.createdAt },
      },
    });
    const initials = `${patient.firstName?.[0] || 'P'}${patient.lastName?.[0] || 'D'}`.toUpperCase();
    const year = new Date().getFullYear();
    const password = `D7P-${initials}${patientPosition}${year}`;
    const passwordHash = await bcrypt.hash(password, 10);

    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          primaryRole: 'PATIENT',
          firstName: patient.firstName,
          lastName: patient.lastName,
          displayName: `${patient.firstName} ${patient.lastName}`.trim(),
          phone: patient.phone,
          nationality: patient.nationality,
          addressCity: patient.city,
          addressStreet: patient.address,
          status: 'ACTIVE',
        },
      });
      return {
        user: updated,
        username: updated.username,
        password,
      };
    }

    const username = await this.makeUniqueUsername(prisma, usernameBase);
    const user = await prisma.user.create({
      data: {
        email,
        username,
        displayName: `${patient.firstName} ${patient.lastName}`.trim(),
        firstName: patient.firstName,
        lastName: patient.lastName,
        passwordHash,
        primaryRole: 'PATIENT',
        phone: patient.phone,
        nationality: patient.nationality,
        addressCity: patient.city,
        addressStreet: patient.address,
        status: 'ACTIVE',
      },
    });

    return { user, username, password };
  }

  private normalizeUsername(value: string) {
    const normalized = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return normalized || `patient_${Date.now()}`;
  }

  private async makeUniqueUsername(prisma: Prisma.TransactionClient, base: string) {
    let username = base;
    let suffix = 1;
    while (await prisma.user.findUnique({ where: { username } })) {
      suffix += 1;
      username = `${base}_${suffix}`;
    }
    return username;
  }

  async findAll() {
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
      invoiceId: payment.invoiceId,
      invoiceType: payment.invoice?.type,
      amount: payment.amount,
      method: payment.method,
      reference: payment.reference,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
    }));
  }
}
