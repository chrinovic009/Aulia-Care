import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PatientWorkflowStatus } from '@prisma/client';
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

  async create(createConsultationDto: CreateConsultationDto) {
    const consultation = await this.prisma.consultation.create({ data: createConsultationDto as any });

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
    return this.prisma.consultation.update({ where: { id }, data: updateConsultationDto as any });
  }

  async saveClinicalSections(id: string, dto: any, actorId?: string) {
    const consultation = await this.findOne(id);
    await this.ensureWriteAccess(consultation.providerId, actorId);
    const structured = {
      medicalHistory: dto.medicalHistory || null,
      currentSymptoms: dto.currentSymptoms || null,
      clinicalExam: dto.clinicalExam || null,
      diagnosis: dto.diagnosis || null,
      complementaryExams: dto.complementaryExams || null,
      treatmentPlan: dto.treatmentPlan || null,
      followUp: dto.followUp || null,
    };

    const updated = await this.prisma.consultation.update({
      where: { id },
      data: {
        chiefComplaint: dto.chiefComplaint ?? consultation.chiefComplaint,
        clinicalSummary: JSON.stringify(structured),
        diagnosis: dto.diagnosis?.principal || dto.diagnosis?.main || dto.diagnosisText || consultation.diagnosis,
        assessment: dto.diagnosis?.hypotheses ? JSON.stringify(dto.diagnosis.hypotheses) : consultation.assessment,
        plan: dto.treatmentPlan ? JSON.stringify(dto.treatmentPlan) : consultation.plan,
        status: dto.status || 'IN_PROGRESS',
      } as any,
      include: { patient: true, provider: true },
    });

    await this.prisma.medicalHistory.create({
      data: {
        patientId: consultation.patientId,
        kind: 'MEDICAL_CONSULTATION',
        details: JSON.stringify(structured),
        createdById: actorId,
      },
    });

    return updated;
  }

  async createLabRequest(id: string, dto: any, actorId?: string) {
    const consultation = await this.findOne(id);
    await this.ensureWriteAccess(consultation.providerId, actorId);
    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.labRequest.create({
        data: {
          consultationId: id,
          patientId: consultation.patientId,
          requestedById: actorId,
          specimenType: dto.specimenType || dto.examName || 'Examen',
          priority: dto.priority || 'NORMAL',
          notes: dto.notes || null,
          status: 'REQUESTED',
        },
        include: { patient: true, requestedBy: true, consultation: true, results: true },
      });

      await tx.patient.update({
        where: { id: consultation.patientId },
        data: { workflowStatus: PatientWorkflowStatus.EN_LABORATOIRE },
      });

      await tx.medicalHistory.create({
        data: {
          patientId: consultation.patientId,
          kind: 'LAB_REQUEST',
          details: JSON.stringify({ labRequestId: created.id, ...dto }),
          createdById: actorId,
        },
      });

      return created;
    });

    const labUsers = await this.prisma.user.findMany({
      where: {
        OR: [
          { primaryRole: 'LAB_TECHNICIAN' as any },
          { roles: { some: { role: { slug: 'LAB_TECHNICIAN' as any } } } },
        ],
      },
    });

    const notifications = await Promise.all(
      labUsers.map((user) =>
        this.prisma.notification.create({
          data: {
            recipientId: user.id,
            patientId: consultation.patientId,
            type: 'TASK',
            status: 'UNREAD',
            priority: request.priority === 'CRITICAL' ? 'CRITICAL' : request.priority === 'URGENT' ? 'HIGH' : 'MEDIUM',
            title: 'Nouvelle demande laboratoire',
            message: `Demande ${request.specimenType || 'laboratoire'} pour ${consultation.patient.firstName} ${consultation.patient.lastName}.`,
            relatedEntity: 'LabRequest',
            relatedId: request.id,
            sendAt: new Date(),
          },
        }),
      ),
    );

    notifications.forEach((notification) => {
      this.notificationsGateway.notifyToUser(notification.recipientId, 'notification.created', notification);
    });
    this.notificationsGateway.notify('patient.updated', { id: consultation.patientId, workflowStatus: PatientWorkflowStatus.EN_LABORATOIRE });
    this.notificationsGateway.notify('lab.request.created', request);

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
      const unitPrice = Number(line.unitPrice || latestLot?.purchasePrice || 0);
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
          remarks: `Prescription ${prescription.id}`,
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

      await tx.patient.update({
        where: { id: consultation.patientId },
        data: { workflowStatus: PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT },
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
