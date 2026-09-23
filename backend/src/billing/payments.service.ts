import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, AuditAction, InvoiceType, PatientWorkflowStatus, PaymentMethod, RoleSlug } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { CreatePaymentDto } from './dto/create-payment.dto';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PatientWorkflowService } from '../core/patient-workflow.service';

interface PatientPortalIdentity {
  id: string;
  clinicId: string;
  portalUserId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  city: string | null;
  address: string | null;
  createdAt: Date;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly patientWorkflow: PatientWorkflowService,
  ) {}

  async createPayment(createPaymentDto: CreatePaymentDto, actorId?: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: createPaymentDto.invoiceId },
      include: { patient: { include: { service: { include: { responsables: { where: { actif: true }, include: { user: true } }, staff: { where: { actif: true }, include: { user: true } } } } } } },
    });

    if (!invoice) {
      throw new NotFoundException('Facture introuvable');
    }

    // Legacy invoices without a tenant must be repaired explicitly. They must
    // never become payable from a cashier's clinic because a filter was omitted.
    const invoiceClinicId = invoice.clinicId;
    if (!invoiceClinicId || invoice.patient.clinicId !== invoiceClinicId) {
      throw new ForbiddenException(
        'La facture ou son patient n’est pas rattaché de façon cohérente à un établissement.',
      );
    }

    if (actorId) {
      const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { clinicId: true, primaryRole: true } });
      if (!actor?.clinicId) throw new ForbiddenException('Utilisateur de caisse rattaché à un établissement requis.');
      if (actor.clinicId !== invoiceClinicId) {
        throw new ForbiddenException('Cette facture appartient à un autre établissement.');
      }
    }

    if (invoice.status === 'PAID') {
      throw new BadRequestException('Cette facture est déjà payée.');
    }

    // A monthly corporate statement can only be settled during the two days
    // preceding its contractual deadline. This is server-side so a forged
    // request cannot bypass the cashier UI.
    if (invoice.type === InvoiceType.SUBSCRIPTION_MONTHLY && invoice.dueDate) {
      const paymentWindowStartsAt = new Date(invoice.dueDate);
      paymentWindowStartsAt.setDate(paymentWindowStartsAt.getDate() - 2);
      if (new Date() < paymentWindowStartsAt) {
        throw new ForbiddenException('Le règlement entreprise est disponible deux jours avant son échéance.');
      }
    }

    const amount = Number(createPaymentDto.amount);
    const balanceDue = Number(invoice.balanceDue.toString());
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Le montant payé doit être positif.');
    if (amount > balanceDue) throw new BadRequestException('Le montant payé ne peut pas dépasser le solde dû sans avoir validé.');

    const result = await this.prisma.$transaction(async (prisma) => {
      await prisma.$executeRaw(
        Prisma.sql`SELECT id FROM "Invoice" WHERE id = ${createPaymentDto.invoiceId} FOR UPDATE`,
      );
      const invoice = await prisma.invoice.findUnique({
        where: { id: createPaymentDto.invoiceId },
        include: {
          patient: {
            include: {
              service: {
                include: {
                  responsables: {
                    where: { actif: true },
                    include: { user: true },
                  },
                  staff: {
                    where: { actif: true },
                    include: { user: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!invoice || invoice.deletedAt || invoice.clinicId !== invoiceClinicId || invoice.patient.clinicId !== invoiceClinicId) {
        throw new ForbiddenException('La facture ou son patient n’est pas rattaché de façon cohérente à un établissement.');
      }
      if (invoice.status === 'PAID' || Number(invoice.balanceDue) <= 0) {
        throw new BadRequestException('Cette facture est déjà payée.');
      }
      const balanceDue = Number(invoice.balanceDue.toString());
      if (amount > balanceDue) {
        throw new BadRequestException('Le montant payé ne peut pas dépasser le solde dû sans avoir validé.');
      }
      const payment = await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount,
          method: createPaymentDto.method,
          reference: createPaymentDto.reference,
          note: createPaymentDto.note,
          paidById: actorId,
          // Un paiement appartient toujours au même établissement que sa
          // facture. Le client ne choisit jamais cette valeur.
          clinicId: invoiceClinicId,
          paidAt: new Date(),
        },
      });

      // Accounting is deliberately created as a balanced DRAFT. A cashier may
      // collect a payment, but a second Finance/Admin controller must post the
      // journal entry; a payment never silently becomes a certified bank entry.
      if (actorId) {
        const previous = await prisma.accountingJournalEntry.findFirst({
          where: { clinicId: invoiceClinicId, status: 'POSTED' },
          orderBy: { postedAt: 'desc' },
          select: { entryHash: true },
        });
        const account = createPaymentDto.method === PaymentMethod.CASH ? '571-CAISSE' : '512-BANQUE-À-RAPPROCHER';
        const lines = [
          { account, label: `Encaissement facture ${invoice.id}`, debit: amount, credit: 0 },
          { account: '411-CLIENTS', label: `Règlement facture ${invoice.id}`, debit: 0, credit: amount },
        ];
        const entryHash = createHash('sha256').update(`${previous?.entryHash || ''}|${JSON.stringify({ clinicId: invoiceClinicId, paymentId: payment.id, lines })}`).digest('hex');
        await prisma.accountingJournalEntry.create({
          data: {
            clinicId: invoiceClinicId,
            reference: `PAY-${payment.id}`,
            occurredAt: payment.paidAt,
            description: `Encaissement ${createPaymentDto.method} de la facture ${invoice.id}`,
            sourceType: 'PAYMENT',
            sourceId: payment.id,
            previousHash: previous?.entryHash || null,
            entryHash,
            createdById: actorId,
            lines: { create: lines },
          },
        });
      }

      const remainingBalance = Math.max(0, balanceDue - amount);
      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: remainingBalance === 0 ? 'PAID' : 'PARTIALLY_PAID',
          balanceDue: remainingBalance,
          updatedAt: new Date(),
        },
      });

      const nextWorkflowStatus = remainingBalance > 0
        ? PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT
        :
        invoice.type === 'PHARMACY' || invoice.patient?.service?.category === 'PHARMACY'
          ? PatientWorkflowStatus.EN_PHARMACIE
          : invoice.type === 'LABORATORY' || invoice.patient?.service?.category === 'LABORATORY'
            ? PatientWorkflowStatus.EN_LABORATOIRE
            : invoice.type === 'RADIOLOGY' || invoice.patient?.service?.category === 'IMAGING'
              ? PatientWorkflowStatus.EN_RADIOLOGIE
              : invoice.type === 'SERVICE'
                ? PatientWorkflowStatus.EN_ATTENTE_MEDECIN
                : PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE;

      await this.patientWorkflow.transition(
        prisma,
        invoice.patientId,
        nextWorkflowStatus,
        invoiceClinicId,
      );
      const updatedPatient = await prisma.patient.findFirstOrThrow({
        where: { id: invoice.patientId, clinicId: invoiceClinicId, deletedAt: null },
      });

      // The visit linked to the invoice leaves the reception-payment stage
      // only after the balance is settled.
      if (remainingBalance === 0) {
        await prisma.patientVisit.updateMany({
          where: { invoiceId: invoice.id, status: 'AWAITING_PAYMENT' },
          data: { status: 'ORIENTED', orientedAt: new Date() },
        });
      }

      // Les demandes d'examens restent bloquées tant que la facture n'est pas
      // intégralement réglée. La caisse libère une demande en REQUESTED ;
      // elle ne la marque jamais RECEIVED, état réservé au service clinique.
      let labRequest: any = null;
      let imagingRequest: any = null;

      if (remainingBalance === 0 && invoice.type === 'LABORATORY') {
        let matchingLabRequest = await prisma.labRequest.findFirst({
          where: {
            externalReference: invoice.id,
            clinicId: invoiceClinicId,
            patientId: invoice.patientId,
            deletedAt: null,
          },
          include: {
            patient: true,
            requestedBy: true,
            items: { include: { labTest: true } },
          },
        });

        // Compatibilité avec les anciennes factures qui n'avaient pas encore
        // externalReference comme lien canonique.
        if (!matchingLabRequest) {
          const labRequestMatch = invoice.remarks?.match(
            /(?:LabRequest|Demande laboratoire):?\s*([a-zA-Z0-9-]+)/i,
          );
          if (labRequestMatch?.[1]) {
            matchingLabRequest = await prisma.labRequest.findFirst({
              where: {
                id: labRequestMatch[1],
                clinicId: invoiceClinicId,
                patientId: invoice.patientId,
                deletedAt: null,
              },
              include: {
                patient: true,
                requestedBy: true,
                items: { include: { labTest: true } },
              },
            });
          }
        }

        if (matchingLabRequest) {
          labRequest = await prisma.labRequest.update({
            where: { id: matchingLabRequest.id },
            data: { status: 'REQUESTED', receivedAt: null },
            include: {
              patient: true,
              requestedBy: true,
              items: { include: { labTest: true } },
            },
          });

          await prisma.labRequestItem.updateMany({
            where: {
              labRequestId: matchingLabRequest.id,
              status: 'AWAITING_PAYMENT',
              deletedAt: null,
            },
            data: { status: 'REQUESTED' },
          });
        }
      }

      if (remainingBalance === 0 && invoice.type === 'RADIOLOGY') {
        const imagingRequestMatch = invoice.remarks?.match(
          /ImagingRequest:?\s*([a-zA-Z0-9-]+)/i,
        );

        if (imagingRequestMatch?.[1]) {
          const matchingImagingRequest = await prisma.imagingRequest.findFirst({
            where: {
              id: imagingRequestMatch[1],
              clinicId: invoiceClinicId,
              patientId: invoice.patientId,
              deletedAt: null,
            },
          });

          if (matchingImagingRequest) {
            imagingRequest = await prisma.imagingRequest.update({
              where: { id: matchingImagingRequest.id },
              data: { status: 'REQUESTED' },
            });
          }
        }
      }

      if (remainingBalance === 0 && invoice.type === 'PHARMACY') {
        const prescriptionMatch = invoice.remarks?.match(/Prescription:([a-zA-Z0-9-]+)/);
        if (prescriptionMatch?.[1]) {
          const matchingPrescription = await prisma.prescription.findFirst({
            where: {
              id: prescriptionMatch[1],
              patientId: invoice.patientId,
              patient: { clinicId: invoiceClinicId, deletedAt: null },
            },
            select: { id: true },
          });
          if (matchingPrescription) {
            await prisma.prescription.update({
              where: { id: matchingPrescription.id },
              data: { status: 'PRESCRIBED' },
            });
          }
        }
      }

      // Payment is deliberately independent from portal provisioning. It
      // cannot create, reissue, or reset patient credentials or activation
      // tokens. Those actions belong to the explicit patient-portal flow.
      const receptionistMessage = null;

      const targetRole: RoleSlug = invoice.type === 'PHARMACY'
        ? RoleSlug.PHARMACIST
        : invoice.type === 'LABORATORY'
          ? RoleSlug.LAB_TECHNICIAN
          : invoice.type === 'RADIOLOGY'
            ? RoleSlug.RADIOLOGIST
            : RoleSlug.NURSE;

      const serviceUserIds = invoice.type === 'SERVICE'
        ? [
            ...(invoice.patient?.service?.responsables || []).map((item) => item.userId || item.user?.id),
            ...(invoice.patient?.service?.staff || []).map((item) => item.userId || item.user?.id),
          ].filter((id): id is string => Boolean(id))
        : [];

      const targetUsers = remainingBalance > 0 ? [] : await prisma.user.findMany({
        where: {
          clinicId: invoiceClinicId,
          ...(serviceUserIds.length ? { id: { in: serviceUserIds } } : {}),
          OR: serviceUserIds.length
            ? undefined
            : invoice.type === 'LABORATORY'
              ? [
                  { primaryRole: RoleSlug.LAB_TECHNICIAN },
                  { primaryRole: RoleSlug.LAB_MANAGER },
                  { roles: { some: { role: { slug: RoleSlug.LAB_TECHNICIAN } } } },
                  { roles: { some: { role: { slug: RoleSlug.LAB_MANAGER } } } },
                ]
              : [
                  { primaryRole: targetRole },
                  { roles: { some: { role: { slug: targetRole } } } },
                ],
        },
      });

      const notifications = await Promise.all(
        targetUsers.map((user) =>
          prisma.notification.create({
            data: {
              recipientId: user.id,
              type: 'ALERT',
              status: 'UNREAD',
              priority: 'HIGH',
              title: invoice.type === 'PHARMACY'
                ? 'Prescription payee'
                : invoice.type === 'LABORATORY'
                  ? 'Examen laboratoire paye'
                  : invoice.type === 'RADIOLOGY'
                    ? 'Examen d imagerie paye'
                    : 'Patient pret pour infirmerie',
              message:
                invoice.type === 'PHARMACY'
                  ? `Le patient ${updatedPatient.firstName} ${updatedPatient.lastName} a paye sa prescription et attend la pharmacie.`
                  : invoice.type === 'LABORATORY'
                    ? `Le patient ${updatedPatient.firstName} ${updatedPatient.lastName} a paye son examen laboratoire. Vous pouvez traiter la demande.`
                    : invoice.type === 'RADIOLOGY'
                      ? `Le patient ${updatedPatient.firstName} ${updatedPatient.lastName} a paye son examen d imagerie. Vous pouvez le programmer.`
                    : invoice.type === 'SERVICE'
                      ? `Le patient ${updatedPatient.firstName} ${updatedPatient.lastName} a paye ${invoice.patient?.service?.name || 'le service demande'} et attend votre prise en charge.`
                    : `Le patient ${updatedPatient.firstName} ${updatedPatient.lastName} est en attente de l'infirmerie apres paiement.`,
              relatedEntity: invoice.type === 'LABORATORY' ? 'LabRequest' : invoice.type === 'RADIOLOGY' ? 'ImagingRequest' : 'Patient',
              relatedId: invoice.type === 'LABORATORY'
                ? labRequest?.id || invoice.id
                : invoice.type === 'RADIOLOGY'
                  ? imagingRequest?.id || invoice.id
                  : updatedPatient.id,
              sendAt: new Date(),
            },
          }),
        ),
      );

      const hospitalization = null;

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
            patientUserId: updatedPatient.portalUserId ?? null,
            labRequestId: labRequest?.id,
            imagingRequestId: imagingRequest?.id,
          },
        },
      });

      return { payment, updatedInvoice, updatedPatient, notifications, hospitalization, receptionistMessage, labRequest, imagingRequest };
    });

    result.notifications.forEach((notification) => {
      this.notificationsGateway?.notify?.('notification.created', notification);
    });
    this.notificationsGateway?.notify?.('patient.updated', result.updatedPatient);
    if (invoiceClinicId) {
      // Signal minimal et isolé à l'établissement : l'interface Finance
      // recharge ses totaux sans recevoir de données de patient par socket.
      this.notificationsGateway?.notifyFinanceClinic?.(invoiceClinicId, { resource: 'payment' });
    }
    
    if (result.labRequest) {
      this.notificationsGateway?.notify?.('lab.request.created', result.labRequest);
    }
    if (result.imagingRequest) {
      this.notificationsGateway?.notify?.('imaging.request.paid', { id: result.imagingRequest.id, clinicId: invoiceClinicId });
    }

    if (result.receptionistMessage) {
      this.notificationsGateway?.notifyToUser?.(result.receptionistMessage.recipientId, 'message.received', {
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

  private generateActivationToken() {
    return randomBytes(32).toString('hex');
  }

  private async ensurePatientUserAccess(prisma: Prisma.TransactionClient, patient: PatientPortalIdentity) {
    if (!patient.clinicId) {
      throw new ForbiddenException('Le dossier patient doit être rattaché à un établissement avant la création du portail.');
    }
    const usernameBase = this.normalizeUsername(`${patient.firstName}_${patient.lastName}`);
    const email = patient.email?.trim().toLowerCase() || `${patient.id}@patients.aulia.local`;
    const existing = patient.portalUserId
      ? await prisma.user.findFirst({
          where: {
            id: patient.portalUserId,
            primaryRole: 'PATIENT',
            status: 'ACTIVE',
            deletedAt: null,
          },
        })
      : null;

    const activationToken = this.generateActivationToken();
    const activationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const activationTokenHash = await bcrypt.hash(activationToken, 12);

    if (existing) {
      const linkedPatient = await prisma.patient.findFirst({
        where: { portalUserId: existing.id },
        select: { id: true },
      });
      if (linkedPatient && linkedPatient.id !== patient.id) {
        throw new BadRequestException('Le compte portail trouvé est déjà lié à un autre dossier patient.');
      }
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
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
      await prisma.passwordResetToken.create({
        data: {
          userId: updated.id,
          tokenHash: activationTokenHash,
          expiresAt: activationExpiresAt,
        },
      });
      await prisma.patient.update({ where: { id: patient.id }, data: { portalUserId: updated.id } });
      return {
        user: updated,
        username: updated.username,
        password: null,
        activationToken,
        activationExpiresAt,
        isNew: false,
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
        passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
        primaryRole: 'PATIENT',
        phone: patient.phone,
        nationality: patient.nationality,
        addressCity: patient.city,
        addressStreet: patient.address,
        status: 'ACTIVE',
      },
    });

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: activationTokenHash,
        expiresAt: activationExpiresAt,
      },
    });
    await prisma.patient.update({ where: { id: patient.id }, data: { portalUserId: user.id } });
    return { user, username, password: null, activationToken, activationExpiresAt, isNew: true };
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

    while (true) {
      const existing = prisma.user?.findUnique
        ? await prisma.user.findUnique({ where: { username } })
        : await prisma.user.findFirst({ where: { username } });

      if (!existing) {
        return username;
      }

      suffix += 1;
      username = `${base}_${suffix}`;
    }
  }

  async findAll(actorId?: string) {
    const actor = actorId
      ? await this.prisma.user.findUnique({ where: { id: actorId }, select: { clinicId: true, primaryRole: true } })
      : null;
    if (!actor?.clinicId) throw new ForbiddenException('Utilisateur de caisse rattaché à un établissement requis.');
    const where = { clinicId: actor.clinicId };
    const payments = await this.prisma.payment.findMany({
      where,
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
