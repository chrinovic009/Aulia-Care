import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsultationStatus, PatientWorkflowStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';

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

  async create(createConsultationDto: CreateConsultationDto) {
    const consultation = await this.prisma.consultation.create({ data: createConsultationDto as any });

    await this.prisma.appointment.update({
      where: { id: createConsultationDto.appointmentId },
      data: { status: 'CHECKED_IN' },
    });

    await this.prisma.patient.update({
      where: { id: createConsultationDto.patientId },
      data: { workflowStatus: PatientWorkflowStatus.EN_CONSULTATION },
    });

    this.notificationsGateway.notify('patient.updated', {
      id: createConsultationDto.patientId,
      workflowStatus: PatientWorkflowStatus.EN_CONSULTATION,
    });

    return consultation;
  }

  findAll() {
    return this.prisma.consultation.findMany({
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

  async findOne(id: string) {
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
    return consultation;
  }

  async update(id: string, updateConsultationDto: UpdateConsultationDto, actorId?: string) {
    const consultation = await this.findOne(id);
    await this.ensureWriteAccess(consultation.providerId, actorId);
    const updated = await this.prisma.consultation.update({ where: { id }, data: updateConsultationDto as any });
    if (updated.status === ConsultationStatus.FINALIZED) {
      await this.prisma.appointment.update({ where: { id: updated.appointmentId }, data: { status: 'COMPLETED' } });
    }
    return updated;
  }

  async saveClinicalSections(id: string, dto: any, actorId?: string) {
    const consultation = await this.findOne(id);
    await this.ensureWriteAccess(consultation.providerId, actorId);
    const payload = dto.clinicalSummary && typeof dto.clinicalSummary === 'object' && !Array.isArray(dto.clinicalSummary)
      ? dto.clinicalSummary
      : null;
    const consultationModule = dto.consultationModule || payload?.consultationModule || null;
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

    const requestedStatus = dto.status || dto.consultationStatus || consultation.status;
    const normalizedStatus = this.normalizeConsultationStatus(requestedStatus);

    const updated = await this.prisma.consultation.update({
      where: { id },
      data: {
        chiefComplaint: dto.chiefComplaint ?? consultation.chiefComplaint,
        clinicalSummary: typeof dto.clinicalSummary === 'string' ? dto.clinicalSummary : JSON.stringify(structured),
        diagnosis: dto.diagnosis?.principal || dto.diagnosis?.main || dto.diagnosisText || consultation.diagnosis,
        assessment: dto.diagnosis?.hypotheses ? JSON.stringify(dto.diagnosis.hypotheses) : consultation.assessment,
        plan: dto.treatmentPlan ? JSON.stringify(dto.treatmentPlan) : consultation.plan,
        status: normalizedStatus,
      } as any,
      include: { patient: true, provider: true },
    });

    if (normalizedStatus === ConsultationStatus.FINALIZED) {
      await this.prisma.appointment.update({ where: { id: updated.appointmentId }, data: { status: 'COMPLETED' } });
    }

    await this.prisma.medicalHistory.create({
      data: {
        patientId: consultation.patientId,
        kind: 'MEDICAL_CONSULTATION',
        details: JSON.stringify({
          ...structured,
          consultationId: id,
          consultationStatus: normalizedStatus,
          chiefComplaint: updated.chiefComplaint,
          savedAt: new Date().toISOString(),
        }),
        createdById: actorId,
      },
    });

    return updated;
  }

  async createLabRequest(id: string, dto: any, actorId?: string) {
    const consultation = await this.findOne(id);
    await this.ensureWriteAccess(consultation.providerId, actorId);
    const request = await this.prisma.$transaction(async (tx) => {
      const trimmedExamName = typeof dto.examName === 'string' ? dto.examName.trim() : '';
      let labTest = null;

      if (dto.labTestId) {
        labTest = await tx.labTest.findUnique({ where: { id: dto.labTestId } });
      }

      if (!labTest && trimmedExamName) {
        labTest = await tx.labTest.findFirst({
          where: {
            active: true,
            OR: [
              { name: { equals: trimmedExamName, mode: 'insensitive' } },
              { code: { equals: trimmedExamName, mode: 'insensitive' } },
            ],
          },
          orderBy: { name: 'asc' },
        });
      }

      if (!labTest && trimmedExamName) {
        labTest = await tx.labTest.findFirst({
          where: {
            active: true,
            name: { contains: trimmedExamName, mode: 'insensitive' },
          },
          orderBy: { name: 'asc' },
        });
      }

      if (!labTest) {
        throw new BadRequestException('Veuillez choisir un examen du catalogue laboratoire avec un tarif valide.');
      }

      const examPrice = Number(labTest.price || 0);
      if (examPrice <= 0) {
        throw new BadRequestException('Cet examen laboratoire n a pas encore de prix valide.');
      }

      const created = await tx.labRequest.create({
        data: {
          consultationId: id,
          patientId: consultation.patientId,
          requestedById: actorId,
          specimenType: dto.specimenType || labTest.name || dto.examName || 'Examen',
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
          totalAmount: examPrice,
          balanceDue: examPrice,
          remarks: `LabRequest:${created.id} - Demande laboratoire ${created.id} - ${labTest.name}`,
        },
      });

      await tx.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          label: `Examen laboratoire - ${labTest.name}`,
          quantity: 1,
          unitPrice: examPrice,
          totalAmount: examPrice,
        },
      });

      const handledBySubscription = await this.recordSubscriptionChargeForInvoice(
        tx,
        consultation.patientId,
        invoice.id,
        `Examen laboratoire - ${labTest.name}`,
        examPrice,
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
          details: JSON.stringify({ labRequestId: created.id, invoiceId: invoice.id, labTestId: labTest.id, examName: labTest.name, price: examPrice, currency: 'CDF', ...dto }),
          createdById: actorId,
        },
      });

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

      return { ...created, invoice, labTest };
    });

    const cashiers = await this.prisma.user.findMany({
      where: {
        OR: [
          { primaryRole: 'CASHIER' as any },
          { roles: { some: { role: { slug: 'CASHIER' as any } } } },
        ],
      },
    });

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
            message: `Valider ${request.labTest.name} pour ${consultation.patient.firstName} ${consultation.patient.lastName}: ${Number(request.invoice.totalAmount).toLocaleString('fr-FR')} CDF.`,
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

  async createPrescription(id: string, dto: any, actorId?: string) {
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
      const explicitPrice = Number(line.unitPrice ?? 0);
      const stockPrice = Number(latestLot?.purchasePrice ?? 0);
      const unitPrice = explicitPrice > 0 ? explicitPrice : stockPrice;

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
