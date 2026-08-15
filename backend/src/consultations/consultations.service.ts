import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsultationStatus, InvoiceType, ImagingRequestStatus, PatientWorkflowStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { CreateImagingRequestDto } from './dto/create-imaging-request.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { ClinicalSectionsDto } from './dto/clinical-sections.dto';
import { CreateLabRequestDto } from './dto/create-lab-request.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';

@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  private async recordSubscriptionChargeForInvoice(
    tx: any,
    patientId: string,
    invoiceId: string,
    label: string,
    amount: number,
    serviceId?: string | null,
  ) {
    const employee = await tx.subscriptionEmployee.findFirst({
      where: { patientId, deletedAt: null, status: 'ACTIVE', company: { status: 'ACTIVE', deletedAt: null } },
      include: { company: true },
    });
    if (!employee) return false;

    const serviceDate = new Date();
    await tx.subscriptionCharge.create({
      data: {
        companyId: employee.companyId,
        employeeId: employee.id,
        patientId,
        invoiceId,
        serviceId: serviceId || null,
        label,
        amount,
        currency: 'CDF',
        serviceDate,
        month: serviceDate.getMonth() + 1,
        year: serviceDate.getFullYear(),
      },
    });

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAID',
        balanceDue: 0,
        remarks: `${label} - pris en charge par abonnement entreprise ${employee.company.name}`,
      },
    });

    return true;
  }

  private normalizeConsultationStatus(status?: string | null): ConsultationStatus {
    const normalized = String(status || '').trim().toUpperCase();

    switch (normalized) {
      case 'DRAFT':
        return ConsultationStatus.DRAFT;
      case 'IN_PROGRESS':
      case 'INPROGRESS':
        return ConsultationStatus.IN_PROGRESS;
      case 'FINALIZED':
      case 'VALIDATED':
      case 'COMPLETED':
        return ConsultationStatus.FINALIZED;
      case 'CANCELLED':
      case 'CANCELED':
        return ConsultationStatus.CANCELLED;
      default:
        return ConsultationStatus.IN_PROGRESS;
    }
  }

  async create(createConsultationDto: CreateConsultationDto, actorId?: string) {
    if (!actorId) throw new ForbiddenException('Médecin authentifié requis.');
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { primaryRole: true } });
    if (actor?.primaryRole !== 'PHYSICIAN') throw new ForbiddenException('Seul un médecin peut ouvrir une consultation.');

    const appointment = await this.prisma.appointment.findUnique({ where: { id: createConsultationDto.appointmentId } });
    if (!appointment || appointment.patientId !== createConsultationDto.patientId) {
      throw new BadRequestException('Le rendez-vous sélectionné ne correspond pas au patient.');
    }
    if (appointment.status === 'COMPLETED' || appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW') {
      throw new BadRequestException('Ce rendez-vous ne peut pas être ouvert en consultation.');
    }

    const consultation = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.consultation.findUnique({ where: { appointmentId: createConsultationDto.appointmentId } });
      if (existing) throw new BadRequestException('Une consultation existe déjà pour ce rendez-vous.');
      const created = await tx.consultation.create({
        data: { ...createConsultationDto, providerId: actorId } as any,
      });
      await tx.appointment.update({ where: { id: createConsultationDto.appointmentId }, data: { status: 'CHECKED_IN' } });
      await tx.patient.update({ where: { id: createConsultationDto.patientId }, data: { workflowStatus: PatientWorkflowStatus.EN_CONSULTATION } });
      return created;
    });

    this.notificationsGateway.notify('patient.updated', {
      id: createConsultationDto.patientId,
      workflowStatus: PatientWorkflowStatus.EN_CONSULTATION,
    });

    return consultation;
  }

  findAll(actorId?: string, actorRole?: string) {
    return this.prisma.consultation.findMany({
      where: actorRole === 'PHYSICIAN' ? { providerId: actorId } : undefined,
      include: {
        patient: true,
        provider: true,
        prescriptions: {
          include: {
            prescriber: true,
            lineItems: {
              include: {
                medication: true,
              },
            },
            pharmacyDispenses: {
              include: {
                dispensedBy: true,
                lines: {
                  include: {
                    medication: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, actorId?: string, actorRole?: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
        patient: true,
        provider: true,
        prescriptions: {
          include: {
            prescriber: true,
            lineItems: { include: { medication: true } },
            pharmacyDispenses: { include: { dispensedBy: true, lines: { include: { medication: true } } } },
          },
        },
      },
    });
    if (!consultation) {
      throw new NotFoundException('Consultation introuvable');
    }
    if (actorRole === 'PHYSICIAN' && consultation.providerId !== actorId) {
      throw new ForbiddenException('Accès à cette consultation non autorisé.');
    }
    return consultation;
  }

  async update(id: string, updateConsultationDto: UpdateConsultationDto, actorId?: string) {
    const consultation = await this.findOne(id);
    await this.ensureWriteAccess(consultation.providerId, actorId);
    if (consultation.status === ConsultationStatus.FINALIZED) {
      throw new BadRequestException('Consultation finalisée : utilisez la procédure d’avenant documentée.');
    }
    // A clinical note update must never silently reassign its patient, encounter,
    // hospitalization or author. Those links are established by admission/creation workflows.
    const { patientId: _patientId, appointmentId: _appointmentId, hospitalizationId: _hospitalizationId, providerId: _providerId, ...clinicalUpdate } = updateConsultationDto;
    const updated = await this.prisma.consultation.update({
      where: { id },
      data: { ...clinicalUpdate, version: { increment: 1 } } as any,
    });
    if (updated.status === ConsultationStatus.FINALIZED) {
      await this.prisma.appointment.update({ where: { id: updated.appointmentId }, data: { status: 'COMPLETED' } });
    }
    return updated;
  }

  async saveClinicalSections(id: string, dto: ClinicalSectionsDto, actorId?: string) {
    const consultation = await this.findOne(id);
    await this.ensureWriteAccess(consultation.providerId, actorId);
    const amendmentReason = dto.amendmentReason?.trim();
    const isAmendment = consultation.status === ConsultationStatus.FINALIZED;
    if (isAmendment && !amendmentReason) {
      throw new BadRequestException('Une consultation finalisée est protégée : indiquez le motif de l’avenant.');
    }
    // DTO validation owns the HTTP boundary; this compatibility view supports
    // existing JSON clinical drafts until their fields are fully normalised.
    const payload: Record<string, any> | null = dto.clinicalSummary && typeof dto.clinicalSummary === 'object' && !Array.isArray(dto.clinicalSummary)
      ? dto.clinicalSummary
      : null;
    const consultationModule: Record<string, any> | null = dto.consultationModule || payload?.consultationModule || null;
    const currentMedicationValue = dto.medicalHistory?.currentMedications
      || payload?.medicalHistory?.currentMedications
      || (Array.isArray(consultationModule?.currentMedications) ? consultationModule.currentMedications : null);
    const followUpNotes = dto.followUp?.notes
      || payload?.followUp?.notes
      || (consultationModule?.followUp ? [consultationModule.followUp.recommendedInterval, consultationModule.followUp.specificDate].filter(Boolean).join(' | ') : null);
    const structured = {
      medicalHistory: {
        ...(dto.medicalHistory || payload?.medicalHistory || {}),
        currentMedications: currentMedicationValue,
      },
      currentSymptoms: dto.currentSymptoms || payload?.currentSymptoms || null,
      clinicalExam: dto.clinicalExam || payload?.clinicalExam || null,
      diagnosis: dto.diagnosis || payload?.diagnosis || null,
      complementaryExams: dto.complementaryExams || payload?.complementaryExams || (consultationModule?.orderedExams ? { orderedExams: consultationModule.orderedExams } : null),
      treatmentPlan: dto.treatmentPlan || payload?.treatmentPlan || {
        notes: dto.treatmentPlan?.notes || dto.treatmentPlan?.description || consultationModule?.safetyConsignes || null,
        description: dto.treatmentPlan?.description || consultationModule?.safetyConsignes || null,
        safetyConsignes: consultationModule?.safetyConsignes || null,
        sickLeave: consultationModule?.sickLeave || null,
        followUp: consultationModule?.followUp || null,
      },
      followUp: dto.followUp || payload?.followUp || {
        notes: followUpNotes,
        recommendedInterval: consultationModule?.followUp?.recommendedInterval || null,
        specificDate: consultationModule?.followUp?.specificDate || null,
      },
      consultationModule,
      complementaryAnamnesis: dto.complementaryAnamnesis || payload?.complementaryAnamnesis || null,
    };

    const requestedStatus = dto.status || consultation.status;
    const normalizedStatus = this.normalizeConsultationStatus(requestedStatus);
    if (!isAmendment && normalizedStatus === ConsultationStatus.FINALIZED && dto.attestation !== true) {
      throw new BadRequestException('La validation exige l’attestation explicite du médecin.');
    }

    const updated = await this.prisma.consultation.update({
      where: { id },
      data: {
        chiefComplaint: dto.chiefComplaint ?? consultation.chiefComplaint,
        clinicalSummary: typeof dto.clinicalSummary === 'string' ? dto.clinicalSummary : JSON.stringify(structured),
        diagnosis: dto.diagnosis?.principal || dto.diagnosis?.main || dto.diagnosisText || consultation.diagnosis,
        assessment: dto.diagnosis?.hypotheses ? JSON.stringify(dto.diagnosis.hypotheses) : consultation.assessment,
        plan: dto.treatmentPlan ? JSON.stringify(dto.treatmentPlan) : consultation.plan,
        status: isAmendment ? ConsultationStatus.FINALIZED : normalizedStatus,
        version: { increment: 1 },
      } as any,
      include: { patient: true, provider: true },
    });

    if (normalizedStatus === ConsultationStatus.FINALIZED) {
      await this.prisma.appointment.update({ where: { id: updated.appointmentId }, data: { status: 'COMPLETED' } });
    }

    // A draft is visible through its consultation only. It is not duplicated in
    // the longitudinal patient history until the doctor signs it.
    if (!isAmendment && normalizedStatus !== ConsultationStatus.FINALIZED) return updated;

    await this.prisma.consultationNote.create({
      data: {
        consultationId: id,
        authorId: actorId,
        noteType: isAmendment ? 'AMENDMENT' : 'FINALIZATION_SIGNATURE',
        content: isAmendment
          ? `Avenant v${updated.version}: ${amendmentReason}`
          : 'Consultation relue et validée par le médecin responsable.',
      },
    });

    await this.prisma.medicalHistory.create({
      data: {
        patientId: consultation.patientId,
        kind: 'MEDICAL_CONSULTATION',
        details: JSON.stringify({
          ...structured,
          consultationId: id,
          consultationStatus: updated.status,
          chiefComplaint: updated.chiefComplaint,
          savedAt: new Date().toISOString(),
          amendmentReason: amendmentReason || null,
          consultationVersion: updated.version,
        }),
        createdById: actorId,
      },
    });

    return updated;
  }

  async createLabRequest(id: string, dto: CreateLabRequestDto, actorId?: string) {
    const consultation = await this.findOne(id);
    await this.ensureWriteAccess(consultation.providerId, actorId);
    const request = await this.prisma.$transaction(async (tx) => {
      const trimmedExamName = typeof dto.examName === 'string' ? dto.examName.trim() : '';
      const requestedLabTestIds = Array.isArray(dto.labTestIds)
        ? dto.labTestIds.filter((value: unknown): value is string => typeof value === 'string' && Boolean(value))
        : dto.labTestId
          ? [dto.labTestId]
          : [];

      let selectedLabTests: Array<any> = [];

      if (requestedLabTestIds.length > 0) {
        for (const labTestId of requestedLabTestIds) {
          const labTest = await tx.labTest.findUnique({
            where: { id: labTestId },
            include: { section: true, category: true },
          });

          if (!labTest) {
            throw new BadRequestException('Un examen du catalogue laboratoire est introuvable.');
          }

          selectedLabTests.push(labTest);
        }
      }

      if (!selectedLabTests.length && trimmedExamName) {
        const exactMatch = await tx.labTest.findFirst({
          where: {
            active: true,
            OR: [
              { name: { equals: trimmedExamName, mode: 'insensitive' } },
              { code: { equals: trimmedExamName, mode: 'insensitive' } },
            ],
          },
          include: { section: true, category: true },
          orderBy: { name: 'asc' },
        });

        if (exactMatch) {
          selectedLabTests.push(exactMatch);
        }
      }

      if (!selectedLabTests.length && trimmedExamName) {
        const containsMatch = await tx.labTest.findFirst({
          where: {
            active: true,
            name: { contains: trimmedExamName, mode: 'insensitive' },
          },
          include: { section: true, category: true },
          orderBy: { name: 'asc' },
        });

        if (containsMatch) {
          selectedLabTests.push(containsMatch);
        }
      }

      selectedLabTests = selectedLabTests.filter((labTest, index, collection) => collection.findIndex((item) => item.id === labTest.id) === index);

      if (!selectedLabTests.length) {
        throw new BadRequestException('Veuillez choisir un examen du catalogue laboratoire avec un tarif valide.');
      }

      const invalidLabTests = selectedLabTests.filter((labTest) => Number(labTest.price || 0) <= 0);
      if (invalidLabTests.length > 0) {
        throw new BadRequestException('Un ou plusieurs examens laboratoire n ont pas encore de prix valide.');
      }

      const examPriceTotal = selectedLabTests.reduce((total, labTest) => total + Number(labTest.price || 0), 0);
      const requestLabel = selectedLabTests.map((labTest) => labTest.name).join(', ');
      const specimenTypeLabel = dto.specimenType || (selectedLabTests.length > 1 ? requestLabel : selectedLabTests[0]?.name || trimmedExamName || 'Examen');

      const created = await tx.labRequest.create({
        data: {
          consultationId: id,
          patientId: consultation.patientId,
          requestedById: actorId,
          specimenType: specimenTypeLabel,
          priority: dto.priority || 'NORMAL',
          notes: dto.notes || null,
          status: 'REQUESTED',
        },
        include: { patient: true, requestedBy: true, consultation: true, results: true },
      });

      const invoice = await tx.invoice.create({
        data: {
          patientId: consultation.patientId,
          issuedById: actorId,
          type: 'LABORATORY',
          status: 'PENDING',
          totalAmount: examPriceTotal,
          balanceDue: examPriceTotal,
          remarks: `LabRequest:${created.id} - Demande laboratoire ${created.id} - ${requestLabel}`,
        },
      });

      for (const labTest of selectedLabTests) {
        const examPrice = Number(labTest.price || 0);
        await tx.invoiceLine.create({
          data: {
            invoiceId: invoice.id,
            label: `Examen laboratoire - ${labTest.name}`,
            quantity: 1,
            unitPrice: examPrice,
            totalAmount: examPrice,
          },
        });
      }

      const sectionConsumableUsage = await this.resolveSectionConsumableUsage(tx, selectedLabTests);
      if (sectionConsumableUsage.length > 0) {
        for (const usage of sectionConsumableUsage) {
          const availableStock = await tx.labConsumableStock.findFirst({
            where: { labConsumableId: usage.labConsumableId },
            select: { id: true, quantity: true },
          });
          const currentQty = Number(availableStock?.quantity || 0);
          const requiredQty = Number(usage.quantity || 0);
          if (currentQty < requiredQty) {
            throw new BadRequestException(`Stock insuffisant pour ${usage.consumableName}.`);
          }
          if (availableStock) {
            await tx.labConsumableStock.update({
              where: { id: availableStock.id },
              data: { quantity: currentQty - requiredQty, lastUpdatedAt: new Date() },
            });
          }
          await tx.labConsumableTransaction.create({
            data: {
              labConsumableId: usage.labConsumableId,
              type: 'OUT',
              quantity: requiredQty,
              unit: usage.unit || 'unité',
              reference: created.id,
              note: `Consommation pour demande laboratoire ${created.id} - ${usage.sectionName}`,
              performedById: actorId || null,
            },
          });
        }
      }

      const handledBySubscription = await this.recordSubscriptionChargeForInvoice(
        tx,
        consultation.patientId,
        invoice.id,
        selectedLabTests.length > 1 ? `Examens laboratoire - ${requestLabel}` : `Examen laboratoire - ${requestLabel}`,
        examPriceTotal,
        null,
      );

      await tx.labRequest.update({
        where: { id: created.id },
        data: { externalReference: invoice.id },
      });

      await tx.patient.update({
        where: { id: consultation.patientId },
        data: { workflowStatus: handledBySubscription ? PatientWorkflowStatus.EN_LABORATOIRE : PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT },
      });

      await tx.medicalHistory.create({
        data: {
          patientId: consultation.patientId,
          kind: 'LAB_REQUEST',
          details: JSON.stringify({
            labRequestId: created.id,
            invoiceId: invoice.id,
            labTestIds: selectedLabTests.map((labTest) => labTest.id),
            examNames: selectedLabTests.map((labTest) => labTest.name),
            price: examPriceTotal,
            currency: 'CDF',
            ...dto,
          }),
          createdById: actorId,
        },
      });

      for (const labTest of selectedLabTests) {
        await tx.labRequestItem.create({
          data: {
            labRequestId: created.id,
            labTestId: labTest.id,
            status: 'REQUESTED',
            requestedAt: created.requestedAt,
            specimenLabel: created.specimenType || labTest.name,
            notes: dto.notes || null,
          },
        });
      }

      return { ...created, invoice, labTests: selectedLabTests, labTest: selectedLabTests[0] };
    });

    const cashiers = await this.prisma.user.findMany({
      where: {
        OR: [
          { primaryRole: 'CASHIER' as any },
          { roles: { some: { role: { slug: 'CASHIER' as any } } } },
        ],
      },
    });

    const requestLabel = request.labTests?.length
      ? request.labTests.map((labTest: any) => labTest.name).join(', ')
      : request.labTest?.name || 'examen laboratoire';

    const notifications = await Promise.all(
      cashiers.map((user) =>
        this.prisma.notification.create({
          data: {
            recipientId: user.id,
            patientId: consultation.patientId,
            type: 'TASK',
            status: 'UNREAD',
            priority: request.priority === 'CRITICAL' ? 'CRITICAL' : request.priority === 'URGENT' ? 'HIGH' : 'MEDIUM',
            title: 'Paiement examen laboratoire',
            message: `Valider ${requestLabel} pour ${consultation.patient.firstName} ${consultation.patient.lastName}: ${Number(request.invoice.totalAmount).toLocaleString('fr-FR')} CDF.`,
            relatedEntity: 'Invoice',
            relatedId: request.invoice.id,
            sendAt: new Date(),
          },
        }),
      ),
    );

    notifications.forEach((notification) => {
      this.notificationsGateway.notifyToUser(notification.recipientId, 'notification.created', notification);
    });
    this.notificationsGateway.notify('patient.updated', { id: consultation.patientId, workflowStatus: PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT });
    this.notificationsGateway.notify('invoice.created', request.invoice);

    return request;
  }

  async createImagingRequest(id: string, dto: CreateImagingRequestDto, actorId?: string) {
    const consultation = await this.findOne(id);
    await this.ensureWriteAccess(consultation.providerId, actorId);

    const request = await this.prisma.$transaction(async (tx) => {
      const trimmedExamName = typeof dto.examName === 'string' ? dto.examName.trim() : '';
      const imagingCatalogueId = typeof dto.imagingCatalogueId === 'string' && dto.imagingCatalogueId ? dto.imagingCatalogueId : null;

      let imagingCatalogue: any = null;
      if (imagingCatalogueId) {
        imagingCatalogue = await tx.imagingCatalogue.findUnique({ where: { id: imagingCatalogueId } });
        if (!imagingCatalogue) {
          throw new BadRequestException('Un examen du catalogue d imagerie est introuvable.');
        }
      } else if (trimmedExamName) {
        imagingCatalogue = await tx.imagingCatalogue.findFirst({
          where: {
            active: true,
            OR: [
              { name: { equals: trimmedExamName, mode: 'insensitive' } },
              { code: { equals: trimmedExamName, mode: 'insensitive' } },
            ],
          },
        });

        if (!imagingCatalogue) {
          imagingCatalogue = await tx.imagingCatalogue.findFirst({
            where: {
              active: true,
              name: { contains: trimmedExamName, mode: 'insensitive' },
            },
            orderBy: { name: 'asc' },
          });
        }

        if (!imagingCatalogue) {
          throw new BadRequestException('Veuillez choisir un examen du catalogue d imagerie valide.');
        }
      } else {
        throw new BadRequestException('Un examen d imagerie du catalogue est requis.');
      }

      const price = Number(imagingCatalogue.price || 0);
      if (price <= 0) {
        throw new BadRequestException('Le prix de l examen d imagerie n est pas valide.');
      }
      if (dto.contrastAgentUsed && (!dto.informedConsentConfirmed || !dto.pregnancyScreened || !dto.renalFunctionVerified)) {
        throw new BadRequestException('Avant contraste : consentement, dépistage grossesse et fonction rénale doivent être confirmés.');
      }
      const duplicate = await tx.imagingRequest.findFirst({
        where: {
          consultationId: id,
          imagingCatalogueId: imagingCatalogue.id,
          deletedAt: null,
          status: { in: ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED'] },
        },
      });
      if (duplicate && !dto.duplicateOverrideReason?.trim()) {
        throw new BadRequestException('Demande d’imagerie similaire déjà active. Documentez le motif clinique de répétition.');
      }

      const selectedIncidences = Array.isArray(dto.availableIncidences)
        ? dto.availableIncidences.filter((value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()))
        : [];

      const requestLabel = imagingCatalogue.name;
      const bodyPart = typeof dto.bodyPart === 'string' && dto.bodyPart.trim() ? dto.bodyPart.trim() : imagingCatalogue.name;
      const urgency = typeof dto.urgency === 'string' && dto.urgency.trim() ? dto.urgency.toUpperCase() : 'ROUTINE';
      const machineId = typeof dto.machineId === 'string' && dto.machineId ? dto.machineId : null;
      const scheduledAt = typeof dto.scheduledAt === 'string' && dto.scheduledAt.trim() ? new Date(dto.scheduledAt) : null;
      const status = typeof dto.status === 'string' && dto.status.trim() ? dto.status.toUpperCase() as ImagingRequestStatus : 'REQUESTED';

      const created = await tx.imagingRequest.create({
        data: {
          consultationId: id,
          patientId: consultation.patientId,
          requestedById: actorId || null,
          imagingCatalogueId: imagingCatalogue.id,
          modality: imagingCatalogue.modality,
          bodyPart,
          urgency,
          examSubType: dto.examSubType || null,
          laterality: dto.laterality || null,
          clinicalIndication: dto.clinicalIndication || null,
          contraindications: dto.contraindications || null,
          contrastAgentUsed: Boolean(dto.contrastAgentUsed),
          contrastDetails: dto.contrastDetails || null,
          notes: [dto.notes, dto.duplicateOverrideReason ? `Répétition justifiée: ${dto.duplicateOverrideReason}` : ''].filter(Boolean).join('\n') || null,
          selectedIncidences,
          protocolNotes: dto.protocolNotes || null,
          
          machineId,
          scheduledAt,
          status,
        },
        include: { patient: true, requestedBy: true, consultation: true, imagingCatalogue: true, report: true },
      });

      const invoice = await tx.invoice.create({
        data: {
          patientId: consultation.patientId,
          issuedById: actorId,
          type: InvoiceType.RADIOLOGY,
          status: 'PENDING',
          totalAmount: price,
          balanceDue: price,
          remarks: `ImagingRequest:${created.id} - Demande imagerie ${requestLabel}`,
        },
      });

      await tx.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          label: `Examen d'imagerie - ${requestLabel}`,
          quantity: 1,
          unitPrice: price,
          totalAmount: price,
        },
      });

      const handledBySubscription = await this.recordSubscriptionChargeForInvoice(
        tx,
        consultation.patientId,
        invoice.id,
        `Examen d'imagerie - ${requestLabel}`,
        price,
        imagingCatalogue.id,
      );

      await tx.patient.update({
        where: { id: consultation.patientId },
        data: { workflowStatus: handledBySubscription ? PatientWorkflowStatus.EN_RADIOLOGIE : PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT },
      });

      await tx.medicalHistory.create({
        data: {
          patientId: consultation.patientId,
          kind: 'IMAGING_REQUEST',
          details: JSON.stringify({
            imagingRequestId: created.id,
            invoiceId: invoice.id,
            imagingCatalogueId: imagingCatalogue.id,
            examName: imagingCatalogue.name,
            examSubType: dto.examSubType || null,
            laterality: dto.laterality || null,
            clinicalIndication: dto.clinicalIndication || null,
            contraindications: dto.contraindications || null,
            bodyPart,
            urgency,
            scheduledAt: scheduledAt?.toISOString() || null,
            machineId,
            selectedIncidences,
            protocolNotes: dto.protocolNotes || null,
            price,
            currency: 'CDF',
            notes: dto.notes || null,
          }),
          createdById: actorId,
        },
      });

      return { ...created, invoice };
    });

    const cashiers = await this.prisma.user.findMany({
      where: {
        OR: [
          { primaryRole: 'CASHIER' as any },
          { roles: { some: { role: { slug: 'CASHIER' as any } } } },
        ],
      },
    });

    const requestLabel = request.imagingCatalogue?.name || 'examen d imagerie';
    const notificationMessage = `Valider ${requestLabel} pour ${consultation.patient.firstName} ${consultation.patient.lastName}: ${Number(request.invoice.totalAmount).toLocaleString('fr-FR')} CDF.`;

    const notifications = await Promise.all(
      cashiers.map((user) =>
        this.prisma.notification.create({
          data: {
            recipientId: user.id,
            patientId: consultation.patientId,
            type: 'TASK',
            status: 'UNREAD',
            priority: 'MEDIUM',
            title: 'Paiement examen d imagerie',
            message: notificationMessage,
            relatedEntity: 'Invoice',
            relatedId: request.invoice.id,
            sendAt: new Date(),
          },
        }),
      ),
    );

    notifications.forEach((notification) => {
      this.notificationsGateway.notifyToUser(notification.recipientId, 'notification.created', notification);
    });
    this.notificationsGateway.notify('patient.updated', { id: consultation.patientId, workflowStatus: PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT });
    this.notificationsGateway.notify('invoice.created', request.invoice);

    return request;
  }

  private async resolveSectionConsumableUsage(tx: any, selectedLabTests: Array<any>) {
    const usageByKey = new Map<string, { sectionId: string; sectionName: string; labConsumableId: string; consumableName: string; quantity: number; unit?: string | null }>();

    for (const labTest of selectedLabTests) {
      const sectionId = labTest.section?.id || labTest.sectionId;
      if (!sectionId) continue;

      const requirements = await tx.labTestConsumableRequirement.findMany({
        where: { labTestId: labTest.id },
        include: { labConsumable: true },
      });

      for (const requirement of requirements) {
        const key = `${sectionId}:${requirement.labConsumableId}`;
        const quantity = Number(requirement.quantity || 0);
        if (!quantity) continue;
        if (!usageByKey.has(key)) {
          usageByKey.set(key, {
            sectionId,
            sectionName: labTest.section?.name || 'Section laboratoire',
            labConsumableId: requirement.labConsumableId,
            consumableName: requirement.labConsumable?.name || 'Consommable',
            quantity,
            unit: requirement.unit || requirement.labConsumable?.unit || null,
          });
          continue;
        }
        const existing = usageByKey.get(key)!;
        existing.quantity += quantity;
      }
    }

    return Array.from(usageByKey.values());
  }

  async createPrescription(id: string, dto: CreatePrescriptionDto, actorId?: string) {
    const consultation = await this.findOne(id);
    await this.ensureWriteAccess(consultation.providerId, actorId);
    const lines = Array.isArray(dto.lines) ? dto.lines : [];
    if (!lines.length) {
      throw new BadRequestException('Aucun medicament prescrit.');
    }

    const medicationIds = lines.map((line: any) => line.medicationId).filter(Boolean);
    const medications = await this.prisma.medication.findMany({
      where: { id: { in: medicationIds }, deletedAt: null },
      include: { StockLot: true },
    });
    const medicationById = new Map(medications.map((item) => [item.id, item]));

    const enrichedLines = lines.map((line: any) => {
      const medication = medicationById.get(line.medicationId);
      if (!medication) throw new BadRequestException('Medicament introuvable.');
      const available = medication.StockLot.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
      const quantity = Number(line.quantity || 1);
      if (available < quantity) {
        throw new BadRequestException(`Stock insuffisant pour ${medication.name}.`);
      }

      const latestLot = medication.StockLot
        .slice()
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0];
      const stockPrice = Number(latestLot?.purchasePrice ?? 0);
      // Billing values are computed by the server; a browser must never set a price.
      const unitPrice = stockPrice;

      return { ...line, quantity, unitPrice, medication };
    });

    const total = enrichedLines.reduce((sum: number, line: any) => sum + Number(line.unitPrice || 0) * Number(line.quantity || 1), 0);

    return this.prisma.$transaction(async (tx) => {
      const prescription = await tx.prescription.create({
        data: {
          consultationId: id,
          patientId: consultation.patientId,
          prescriberId: actorId,
          instruction: dto.instruction || null,
          status: 'PRESCRIBED',
          lineItems: {
            create: enrichedLines.map((line: any) => ({
              medicationId: line.medicationId,
              dosage: line.dosage || 'A preciser',
              route: line.route || 'ORAL',
              frequency: line.frequency || 'DAILY',
              quantity: line.quantity,
              durationDays: line.durationDays ? Number(line.durationDays) : null,
              notes: line.notes || null,
            })),
          },
        },
        include: { lineItems: { include: { medication: true } }, patient: true, prescriber: true },
      });

      const invoice = await tx.invoice.create({
        data: {
          patientId: consultation.patientId,
          issuedById: actorId,
          type: 'PHARMACY',
          status: 'PENDING',
          totalAmount: total,
          balanceDue: total,
          remarks: `Prescription:${prescription.id}`,
        },
      });

      await Promise.all(
        enrichedLines.map((line: any) =>
          tx.invoiceLine.create({
            data: {
              invoiceId: invoice.id,
              label: `${line.medication.name} ${line.dosage || ''}`.trim(),
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              totalAmount: line.unitPrice * line.quantity,
            },
          }),
        ),
      );

      const handledBySubscription = await this.recordSubscriptionChargeForInvoice(
        tx,
        consultation.patientId,
        invoice.id,
        `Prescription ${prescription.id}`,
        total,
        null,
      );

      await tx.patient.update({
        where: { id: consultation.patientId },
        data: { workflowStatus: handledBySubscription ? PatientWorkflowStatus.EN_PHARMACIE : PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT },
      });

      await tx.medicalHistory.create({
        data: {
          patientId: consultation.patientId,
          kind: 'PRESCRIPTION_CREATED',
          details: JSON.stringify({ prescriptionId: prescription.id, invoiceId: invoice.id, total }),
          createdById: actorId,
        },
      });

      return { prescription, invoice };
    });
  }

  async updatePrescription(consultationId: string, prescriptionId: string, dto: CreatePrescriptionDto, actorId?: string) {
    const consultation = await this.findOne(consultationId);
    await this.ensureWriteAccess(consultation.providerId, actorId);

    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        consultation: true,
        lineItems: true,
        pharmacyDispenses: true,
      },
    });

    if (!prescription || prescription.consultationId !== consultationId) {
      throw new NotFoundException('Prescription introuvable pour cette consultation.');
    }

    const now = new Date();
    const createdAt = new Date(prescription.createdAt);
    const freshnessWindowMs = 24 * 60 * 60 * 1000;
    if (now.getTime() - createdAt.getTime() > freshnessWindowMs) {
      throw new BadRequestException('La prescription ne peut plus être modifiée après 24h.');
    }

    if (prescription.status === 'DISPENSED' || prescription.pharmacyDispenses.some((dispense) => dispense.status === 'DISPENSED')) {
      throw new BadRequestException('Cette prescription a déjà été délivrée.');
    }

    const lines = Array.isArray(dto.lines) ? dto.lines : [];
    if (!lines.length) {
      throw new BadRequestException('Aucune ligne de prescription fournie.');
    }

    const medicationIds = lines.map((line: any) => line.medicationId).filter(Boolean);
    const medications = await this.prisma.medication.findMany({
      where: { id: { in: medicationIds }, deletedAt: null },
      include: { StockLot: true },
    });
    const medicationById = new Map(medications.map((item) => [item.id, item]));

    const enrichedLines = lines.map((line: any) => {
      const medication = medicationById.get(line.medicationId);
      if (!medication) throw new BadRequestException('Medicament introuvable.');
      const quantity = Number(line.quantity || 1);
      const available = medication.StockLot.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
      if (available < quantity) throw new BadRequestException(`Stock insuffisant pour ${medication.name}.`);
      const latestLot = medication.StockLot.slice().sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0];
      const stockPrice = Number(latestLot?.purchasePrice ?? 0);
      return {
        ...line,
        quantity,
        unitPrice: stockPrice,
      };
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.prescriptionLine.deleteMany({ where: { prescriptionId } });
      await tx.prescription.update({
        where: { id: prescriptionId },
        data: {
          instruction: dto.instruction ?? prescription.instruction,
          status: 'PRESCRIBED',
          version: { increment: 1 },
          lineItems: {
            create: enrichedLines.map((line: any) => ({
              medicationId: line.medicationId,
              dosage: line.dosage || 'A preciser',
              route: line.route || 'ORAL',
              frequency: line.frequency || 'DAILY',
              quantity: line.quantity,
              durationDays: line.durationDays ? Number(line.durationDays) : null,
              notes: line.notes || null,
            })),
          },
        },
        include: { lineItems: { include: { medication: true } }, patient: true, prescriber: true, consultation: true },
      });

      return { updated: true, prescriptionId };
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.consultation.delete({ where: { id } });
    return { deleted: true };
  }

  private async ensureWriteAccess(assignedDoctorId?: string | null, actorId?: string | null) {
    if (!actorId) {
      throw new BadRequestException('Medecin non identifie.');
    }
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { primaryRole: true },
    });
    if (actor?.primaryRole === 'SUPER_ADMIN' || actor?.primaryRole === 'ADMIN') return;
    if (assignedDoctorId === actorId) return;

    const now = new Date();
    const [assignedActiveShift, replacementActiveShift] = await Promise.all([
      assignedDoctorId
        ? this.prisma.shift.findFirst({
            where: {
              employee: { userId: assignedDoctorId, status: 'ACTIVE' },
              startAt: { lte: now },
              endAt: { gte: now },
            },
          })
        : null,
      this.prisma.shift.findFirst({
        where: {
          employee: { userId: actorId, status: 'ACTIVE' },
          startAt: { lte: now },
          endAt: { gte: now },
        },
      }),
    ]);

    if (!assignedActiveShift && replacementActiveShift) return;
    throw new BadRequestException('Dossier en lecture seule: ce patient est actuellement sous la responsabilite du medecin assigne.');
  }
}
