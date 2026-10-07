// backend/src/consultations/consultations.services.ts
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConsultationStatus, InvoiceType, ImagingRequestStatus, PatientWorkflowStatus, PrescriptionReplacementFinancialHandling, Prisma, RoleSlug } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../core/public-user-select';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { OpenPatientConsultationDto } from './dto/open-patient-consultation.dto';
import { CreateImagingRequestDto } from './dto/create-imaging-request.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { ClinicalSectionsDto } from './dto/clinical-sections.dto';
import { CreateLabRequestDto } from './dto/create-lab-request.dto';
import { CreatePrescriptionDto, RequestPrescriptionReplacementDto, ReviewPrescriptionReplacementDto } from './dto/create-prescription.dto';
import { TelehealthTranscriptEntryDto } from './dto/save-telehealth-transcript.dto';
import { PatientWorkflowService } from '../core/patient-workflow.service';

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly patientWorkflow: PatientWorkflowService,
  ) {}

  private async recordSubscriptionChargeForInvoice(
    tx: any,
    patientId: string,
    clinicId: string,
    invoiceId: string,
    label: string,
    amount: number | Prisma.Decimal,
    serviceId?: string | null,
  ) {
    const employee = await tx.subscriptionEmployee.findFirst({
      where: {
        patientId,
        deletedAt: null,
        status: 'ACTIVE',
        patient: { clinicId, deletedAt: null },
        company: { clinicId, status: 'ACTIVE', deletedAt: null },
      },
      include: { company: true },
    });
    if (!employee) return false;
    if (!employee.company.coversAllServices) return false;

    // The company lock protects both credit-limit decisions and monthly
    // consolidation from concurrent charges for this establishment.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscription-company:${employee.companyId}`}))`;

    // The invoice is the immutable origin of a corporate charge. Replaying an
    // order must not add the same expense twice to the monthly statement.
    const existingCharge = await tx.subscriptionCharge.findFirst({
      where: { sourceInvoiceId: invoiceId, companyId: employee.companyId, deletedAt: null },
      select: { id: true },
    });
    if (existingCharge) return true;

    if (employee.company.creditLimit !== null) {
      const [unbilled, billed] = await Promise.all([
        tx.subscriptionCharge.aggregate({
          where: { companyId: employee.companyId, status: 'PENDING_MONTHLY_INVOICE', deletedAt: null },
          _sum: { amount: true },
        }),
        tx.invoice.aggregate({
          where: {
            clinicId,
            type: 'SUBSCRIPTION_MONTHLY',
            deletedAt: null,
            status: { not: 'CANCELLED' },
            monthlySubscriptionInvoices: { some: { companyId: employee.companyId, deletedAt: null } },
          },
          _sum: { balanceDue: true },
        }),
      ]);
      const exposure = new Prisma.Decimal(unbilled._sum.amount || 0)
        .plus(billed._sum.balanceDue || 0)
        .plus(amount);
      if (exposure.gt(employee.company.creditLimit)) return false;
    }

    const serviceDate = new Date();
    await tx.subscriptionCharge.create({
      data: {
        companyId: employee.companyId,
        employeeId: employee.id,
        patientId,
        invoiceId,
        sourceInvoiceId: invoiceId,
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
        // Coverage authorizes service, but is not money collected by a cashier.
        status: 'COVERED',
        balanceDue: 0,
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
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { primaryRole: true, clinicId: true, deletedAt: true, status: true },
    });
    if (actor?.primaryRole !== 'PHYSICIAN') throw new ForbiddenException('Seul un médecin peut ouvrir une consultation.');
    if (!actor.clinicId || actor.deletedAt || actor.status !== 'ACTIVE') {
      throw new ForbiddenException('Le médecin doit être actif et rattaché à un établissement.');
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: { id: createConsultationDto.appointmentId, clinicId: actor.clinicId, deletedAt: null },
    });
    if (!appointment || appointment.patientId !== createConsultationDto.patientId) {
      throw new BadRequestException('Le rendez-vous sélectionné ne correspond pas au patient.');
    }
    if (appointment.status === 'COMPLETED' || appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW') {
      throw new BadRequestException('Ce rendez-vous ne peut pas être ouvert en consultation.');
    }

    const patient = await this.prisma.patient.findFirst({
      where: { id: createConsultationDto.patientId, clinicId: actor.clinicId, deletedAt: null },
      select: { id: true },
    });
    if (!patient) throw new ForbiddenException('Patient non accessible dans cet établissement.');
    if (createConsultationDto.hospitalizationId) {
      const hospitalization = await this.prisma.hospitalization.findFirst({
        where: {
          id: createConsultationDto.hospitalizationId,
          patientId: patient.id,
          deletedAt: null,
          status: { in: ['ADMITTED', 'TRANSFERRED'] },
        },
        select: { id: true, patient: { select: { clinicId: true } } },
      });
      if (!hospitalization || hospitalization.patient.clinicId !== actor.clinicId) {
        throw new BadRequestException('L’hospitalisation sélectionnée ne correspond pas à ce patient dans votre établissement.');
      }
    }

    const consultation = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.consultation.findUnique({ where: { appointmentId: createConsultationDto.appointmentId } });
      if (existing) throw new BadRequestException('Une consultation existe déjà pour ce rendez-vous.');
      const created = await tx.consultation.create({
        // Provider, clinic and encounter links are server-owned, never client input.
        data: {
          patientId: patient.id,
          appointmentId: appointment.id,
          hospitalizationId: createConsultationDto.hospitalizationId || null,
          providerId: actorId,
          clinicId: actor.clinicId,
          status: createConsultationDto.status || ConsultationStatus.IN_PROGRESS,
          encounterType: createConsultationDto.encounterType,
          chiefComplaint: createConsultationDto.chiefComplaint,
          clinicalSummary: createConsultationDto.clinicalSummary,
          diagnosis: createConsultationDto.diagnosis,
          assessment: createConsultationDto.assessment,
          plan: createConsultationDto.plan,
        },
      });
      await tx.appointment.update({ where: { id: createConsultationDto.appointmentId }, data: { status: 'CHECKED_IN' } });
      await tx.patientVisit.updateMany({
        where: { appointmentId: createConsultationDto.appointmentId, status: { in: ['REGISTERED', 'ORIENTED'] } },
        data: { status: 'IN_CONSULTATION', orientedAt: new Date() },
      });
      await this.patientWorkflow.transition(tx, createConsultationDto.patientId, PatientWorkflowStatus.EN_CONSULTATION, actor.clinicId);
      return created;
    });

    this.notificationsGateway.notify('patient.updated', {
      id: createConsultationDto.patientId,
      workflowStatus: PatientWorkflowStatus.EN_CONSULTATION,
    });

    return consultation;
  }

  /**
   * Opens a fresh encounter for a returning patient. The browser never chooses
   * the physician, appointment or status: all three are established here.
   */
  async openForPatient(dto: OpenPatientConsultationDto, actorId?: string) {
    if (!actorId) throw new ForbiddenException('Médecin authentifié requis.');
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { primaryRole: true, clinicId: true } });
    if (actor?.primaryRole !== 'PHYSICIAN') throw new ForbiddenException('Seul un médecin peut ouvrir une consultation.');
    if (!actor.clinicId) throw new ForbiddenException('Le médecin doit être rattaché à un établissement.');

    const patient = await this.prisma.patient.findFirst({
      where: {
        id: dto.patientId,
        deletedAt: null,
        clinicId: actor.clinicId,
        OR: [
          { consultations: { some: { providerId: actorId, deletedAt: null } } },
          { hospitalizations: { some: { physicianId: actorId, deletedAt: null } } },
          { workflowStatus: PatientWorkflowStatus.EN_ATTENTE_MEDECIN },
        ],
      },
      select: { id: true },
    });
    if (!patient) throw new ForbiddenException('Ce patient n’est pas visible par ce médecin.');

    const consultation = await this.prisma.$transaction(async (tx) => {
      // Serialize opening an encounter for one doctor/patient pair. This avoids
      // duplicate drafts when two clicks or two browser tabs arrive together.
      // pg_advisory_xact_lock returns PostgreSQL's `void` type. Prisma cannot
      // deserialize that type through $queryRaw, which used to abort opening a
      // consultation (and surface as an authentication-looking browser error).
      // executeRaw intentionally ignores the result while retaining the lock.
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`consultation:${dto.patientId}:${actorId}`}))`);
      const current = await tx.consultation.findFirst({
        where: { patientId: dto.patientId, providerId: actorId, status: { in: [ConsultationStatus.DRAFT, ConsultationStatus.IN_PROGRESS] }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (current) return current;

      const appointment = await tx.appointment.create({
        data: {
          patientId: dto.patientId,
          clinicId: actor.clinicId,
          requestedById: actorId,
          scheduledAt: new Date(),
          durationMinutes: 30,
          reason: 'Nouvelle consultation clinique ouverte par le médecin',
          status: 'CHECKED_IN',
        },
      });
      const created = await tx.consultation.create({
        data: {
          patientId: dto.patientId,
          appointmentId: appointment.id,
          providerId: actorId,
          clinicId: actor.clinicId,
          status: ConsultationStatus.DRAFT,
          chiefComplaint: dto.chiefComplaint?.trim() || null,
        },
      });
      const receptionVisit = await (tx as any).patientVisit.findFirst({
        where: { patientId: dto.patientId, appointmentId: null, status: 'ORIENTED' },
        orderBy: { arrivedAt: 'desc' },
        select: { id: true },
      });
      if (receptionVisit) {
        await (tx as any).patientVisit.update({
          where: { id: receptionVisit.id },
          data: { appointmentId: appointment.id, status: 'IN_CONSULTATION', orientedAt: new Date() },
        });
      } else {
        await (tx as any).patientVisit.create({
          data: {
            patientId: dto.patientId,
            // The patient was already checked against the authenticated doctor
            // clinic before entering this transaction. Never derive a nullable
            // tenant from a second unrestricted lookup.
            clinicId: actor.clinicId,
            appointmentId: appointment.id,
            visitType: 'CONSULTATION_NON_PROGRAMMEE',
            reason: dto.chiefComplaint?.trim() || 'Consultation clinique ouverte par le médecin',
            status: 'IN_CONSULTATION',
            orientedAt: new Date(),
          },
        });
      }
      await this.patientWorkflow.transition(tx, dto.patientId, PatientWorkflowStatus.EN_CONSULTATION, actor.clinicId);
      return created;
    });

    this.notificationsGateway.notify('consultation.created', consultation);
    this.notificationsGateway.notify('patient.updated', { id: dto.patientId, workflowStatus: PatientWorkflowStatus.EN_CONSULTATION });
    return consultation;
  }

  async findAll(actorId?: string, actorRole?: string) {
    if (!actorId) throw new ForbiddenException('Utilisateur non identifié.');
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { clinicId: true } });
    if (!actor?.clinicId) throw new ForbiddenException('Utilisateur non rattaché à un établissement.');
    return this.prisma.consultation.findMany({
      where: {
        clinicId: actor.clinicId,
        ...(actorRole === 'PHYSICIAN' ? { providerId: actorId } : {}),
      },
      include: {
        patient: true,
        provider: { select: PUBLIC_USER_SELECT },
        prescriptions: {
          include: {
            prescriber: { select: PUBLIC_USER_SELECT },
            lineItems: {
              include: {
                medication: true,
              },
            },
            pharmacyDispenses: {
              include: {
                dispensedBy: { select: PUBLIC_USER_SELECT },
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

  /**
   * Deliberately separate from findAll: the regular consultation list remains
   * limited to the physician author.  A clinician following the same patient
   * may read an unfinished note, but cannot take ownership of it or edit it.
   */
  async findDraftsForPhysician(actorId?: string) {
    if (!actorId) throw new ForbiddenException('Médecin non identifié.');
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { clinicId: true } });
    if (!actor?.clinicId) throw new ForbiddenException('Médecin non rattaché à un établissement.');

    const visiblePatients = await this.prisma.patient.findMany({
      where: {
        deletedAt: null,
        clinicId: actor.clinicId,
        OR: [
          { consultations: { some: { providerId: actorId, deletedAt: null } } },
          { hospitalizations: { some: { physicianId: actorId, deletedAt: null } } },
        ],
      },
      select: { id: true },
    });
    const patientIds = visiblePatients.map((patient) => patient.id);
    if (patientIds.length === 0) return [];

    const drafts = await this.prisma.consultation.findMany({
      where: {
        patientId: { in: patientIds },
        deletedAt: null,
        status: { in: [ConsultationStatus.DRAFT, ConsultationStatus.IN_PROGRESS] },
      },
      select: {
        id: true,
        patientId: true,
        providerId: true,
        status: true,
        chiefComplaint: true,
        createdAt: true,
        updatedAt: true,
        patient: { select: { firstName: true, middleName: true, lastName: true } },
        provider: { select: { firstName: true, lastName: true, displayName: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return drafts.map((draft) => ({ ...draft, canWrite: draft.providerId === actorId }));
  }

  async findDraftDetailForPhysician(id: string, actorId?: string) {
    if (!actorId) throw new ForbiddenException('Médecin non identifié.');
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, firstName: true, middleName: true, lastName: true, dateOfBirth: true, gender: true } },
        provider: { select: { id: true, firstName: true, lastName: true, displayName: true } },
      },
    });
    if (!consultation || consultation.deletedAt || (consultation.status !== ConsultationStatus.DRAFT && consultation.status !== ConsultationStatus.IN_PROGRESS)) {
      throw new NotFoundException('Brouillon introuvable.');
    }
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { clinicId: true } });
    if (!actor?.clinicId || consultation.clinicId !== actor.clinicId) throw new ForbiddenException('Accès à ce brouillon non autorisé.');
    const canRead = await this.prisma.patient.count({
      where: {
        id: consultation.patientId,
        deletedAt: null,
        clinicId: actor.clinicId,
        OR: [
          { consultations: { some: { providerId: actorId, deletedAt: null } } },
          { hospitalizations: { some: { physicianId: actorId, deletedAt: null } } },
        ],
      },
    });
    if (!canRead) throw new ForbiddenException('Accès à ce brouillon non autorisé.');
    return { ...consultation, canWrite: consultation.providerId === actorId };
  }

  /** Archives, rather than physically deletes, the author's unfinished note. */
  async archiveOwnDraft(id: string, actorId?: string) {
    if (!actorId) throw new ForbiddenException('Médecin non identifié.');
    const draft = await this.prisma.consultation.findUnique({ where: { id }, select: { id: true, providerId: true, status: true } });
    if (!draft) throw new NotFoundException('Brouillon introuvable.');
    if (draft.providerId !== actorId) throw new ForbiddenException('Seul le médecin responsable peut supprimer ce brouillon.');
    if (draft.status !== ConsultationStatus.DRAFT && draft.status !== ConsultationStatus.IN_PROGRESS) {
      throw new BadRequestException('Seul un brouillon non finalisé peut être supprimé.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.consultation.update({ where: { id }, data: { status: ConsultationStatus.CANCELLED, deletedAt: new Date(), version: { increment: 1 } } });
      await tx.consultationNote.create({ data: { consultationId: id, authorId: actorId, noteType: 'DRAFT_ARCHIVED_BY_AUTHOR', content: 'Brouillon archivé à la demande de son médecin responsable.' } });
    });
    return { archived: true };
  }

  async findOne(id: string, actorId?: string, actorRole?: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
        patient: true,
        provider: { select: PUBLIC_USER_SELECT },
        prescriptions: {
          include: {
            prescriber: { select: PUBLIC_USER_SELECT },
            lineItems: { include: { medication: true } },
            pharmacyDispenses: { include: { dispensedBy: { select: PUBLIC_USER_SELECT }, lines: { include: { medication: true } } } },
          },
        },
      },
    });
    if (!consultation) {
      throw new NotFoundException('Consultation introuvable');
    }
    if (!actorId) throw new ForbiddenException('Utilisateur non identifié.');
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { clinicId: true } });
    if (!actor?.clinicId || consultation.clinicId !== actor.clinicId) {
      throw new ForbiddenException('Accès à cette consultation non autorisé.');
    }
    if (actorRole === 'PHYSICIAN' && consultation.providerId !== actorId) {
      throw new ForbiddenException('Accès à cette consultation non autorisé.');
    }
    return consultation;
  }

  async update(id: string, updateConsultationDto: UpdateConsultationDto, actorId?: string) {
    const consultation = await this.findOne(id, actorId);
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

  async saveTelehealthTranscript(id: string, sessionId: string, entries: TelehealthTranscriptEntryDto[], actorId?: string) {
    const consultation = await this.findOne(id, actorId);
    await this.ensureWriteAccess(consultation.providerId, actorId);
    if (consultation.status === ConsultationStatus.FINALIZED) {
      throw new BadRequestException('Une consultation finalisée ne peut pas recevoir de transcription sans avenant.');
    }
    const session = await (this.prisma as any).telehealthSession.findFirst({
      where: { id: sessionId, consultationId: id, doctorId: actorId, status: { in: ['ACTIVE', 'ENDED'] } },
      select: { id: true, transcriptionConsentAt: true, patientConsentAt: true },
    });
    if (!session?.patientConsentAt || !session.transcriptionConsentAt) {
      throw new ForbiddenException('La transcription exige le consentement explicite du patient pour cette session.');
    }
    const boundedEntries = entries.slice(-500).map((entry) => ({
      speaker: entry.speaker,
      text: entry.text.trim(),
      at: entry.at,
    })).filter((entry) => entry.text.length > 0);
    let summary: Record<string, any> = {};
    try {
      summary = consultation.clinicalSummary ? JSON.parse(consultation.clinicalSummary) : {};
    } catch {
      summary = {};
    }
    const module = summary.consultationModule && typeof summary.consultationModule === 'object'
      ? summary.consultationModule
      : {};
    summary.consultationModule = { ...module, telehealthTranscript: boundedEntries };
    summary.telehealth = {
      sessionId,
      transcript: boundedEntries,
      capturedAt: new Date().toISOString(),
      disclaimer: 'Transcription automatisée à relire et valider par le médecin.',
    };
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.consultation.update({
        where: { id },
        data: { clinicalSummary: JSON.stringify(summary), version: { increment: 1 } },
      });
      await tx.consultationNote.create({
        data: {
          consultationId: id,
          authorId: actorId,
          noteType: 'TELEHEALTH_TRANSCRIPT_DRAFT',
          content: `Transcription de télésanté enregistrée (${boundedEntries.length} extrait(s)) — à valider par le médecin.`,
        },
      });
      return updated;
    });
  }

  async saveClinicalSections(id: string, dto: ClinicalSectionsDto, actorId?: string) {
    const consultation = await this.findOne(id, actorId);
    await this.ensureWriteAccess(consultation.providerId, actorId);

    const amendmentReason = dto.amendmentReason?.trim();
    const isAmendment = consultation.status === ConsultationStatus.FINALIZED;
    if (isAmendment && !amendmentReason) {
      throw new BadRequestException(
        'Une consultation finalisée est protégée : indiquez le motif de l’avenant.',
      );
    }

    const payload: Record<string, any> | null =
      dto.clinicalSummary &&
      typeof dto.clinicalSummary === 'object' &&
      !Array.isArray(dto.clinicalSummary)
        ? dto.clinicalSummary
        : null;

    const consultationModule: Record<string, any> | null =
      dto.consultationModule || payload?.consultationModule || null;

    const currentMedicationValue =
      dto.medicalHistory?.currentMedications ||
      payload?.medicalHistory?.currentMedications ||
      (Array.isArray(consultationModule?.currentMedications)
        ? consultationModule.currentMedications
        : null);

    const followUpNotes =
      dto.followUp?.notes ||
      payload?.followUp?.notes ||
      (consultationModule?.followUp
        ? [
            consultationModule.followUp.recommendedInterval,
            consultationModule.followUp.specificDate,
          ]
            .filter(Boolean)
            .join(' | ')
        : null);

    const structured = {
      medicalHistory: {
        ...(dto.medicalHistory || payload?.medicalHistory || {}),
        currentMedications: currentMedicationValue,
      },
      currentSymptoms: dto.currentSymptoms || payload?.currentSymptoms || null,
      clinicalExam: dto.clinicalExam || payload?.clinicalExam || null,
      diagnosis: dto.diagnosis || payload?.diagnosis || null,
      complementaryExams:
        dto.complementaryExams ||
        payload?.complementaryExams ||
        (consultationModule?.orderedExams
          ? { orderedExams: consultationModule.orderedExams }
          : null),
      treatmentPlan:
        dto.treatmentPlan ||
        payload?.treatmentPlan || {
          notes:
            dto.treatmentPlan?.notes ||
            dto.treatmentPlan?.description ||
            consultationModule?.safetyConsignes ||
            null,
          description:
            dto.treatmentPlan?.description ||
            consultationModule?.safetyConsignes ||
            null,
          safetyConsignes: consultationModule?.safetyConsignes || null,
          sickLeave: consultationModule?.sickLeave || null,
          followUp: consultationModule?.followUp || null,
        },
      followUp:
        dto.followUp ||
        payload?.followUp || {
          notes: followUpNotes,
          recommendedInterval:
            consultationModule?.followUp?.recommendedInterval || null,
          specificDate: consultationModule?.followUp?.specificDate || null,
        },
      consultationModule,
      complementaryAnamnesis:
        dto.complementaryAnamnesis ||
        payload?.complementaryAnamnesis ||
        null,
    };

    const requestedStatus = dto.status || consultation.status;
    const normalizedStatus = this.normalizeConsultationStatus(requestedStatus);

    if (
      !isAmendment &&
      normalizedStatus === ConsultationStatus.FINALIZED &&
      dto.attestation !== true
    ) {
      throw new BadRequestException(
        'La validation exige l’attestation explicite du médecin.',
      );
    }

    const clinicId = consultation.clinicId || consultation.patient?.clinicId;
    if (!clinicId) {
      throw new ForbiddenException(
        'La consultation doit être rattachée à un établissement actif.',
      );
    }

    const orderedExams = Array.isArray(consultationModule?.orderedExams)
      ? consultationModule.orderedExams
      : [];

    const hasPendingOrderedExams = orderedExams.length > 0
      ? await this.prisma.$transaction(async (tx) => {
          for (const exam of orderedExams) {
            if (!exam || typeof exam !== 'object') return true;
            const category = String(exam.category || '').toUpperCase();
            const catalogueItemId = typeof exam.catalogueItemId === 'string' ? exam.catalogueItemId.trim() : '';
            if (!category || !catalogueItemId) return true;

            if (category === 'LABORATORY') {
              const request = await tx.labRequest.findFirst({
                where: {
                  consultationId: id,
                  patientId: consultation.patientId,
                  clinicId,
                  deletedAt: null,
                },
                include: {
                  items: {
                    where: { deletedAt: null },
                    select: { labTestId: true, status: true },
                  },
                },
              });
              const hasFinalResult = request?.items.some(
                (item) => item.labTestId === catalogueItemId && ['AVAILABLE', 'SENT', 'COMPLETED', 'VERIFIED'].includes(String(item.status || '')),
              );
              if (!hasFinalResult) return true;
            }

            if (category === 'IMAGING') {
              const imagingRequest = await tx.imagingRequest.findFirst({
                where: {
                  consultationId: id,
                  patientId: consultation.patientId,
                  clinicId,
                  imagingCatalogueId: catalogueItemId,
                  deletedAt: null,
                  status: { in: ['COMPLETED', 'VERIFIED'] },
                },
                select: { report: true },
              });
              if (!imagingRequest?.report) return true;
            }
          }
          return false;
        })
      : false;

    if (!isAmendment && normalizedStatus === ConsultationStatus.FINALIZED && hasPendingOrderedExams) {
      throw new BadRequestException('La consultation ne peut être finalisée que lorsque tous les examens complémentaires commandés n’ont pas de résultat final valide.');
    }

    const transactionResult = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.consultation.update({
        where: { id },
        data: {
          chiefComplaint: dto.chiefComplaint ?? consultation.chiefComplaint,
          clinicalSummary:
            typeof dto.clinicalSummary === 'string'
              ? dto.clinicalSummary
              : JSON.stringify(structured),
          diagnosis:
            dto.diagnosis?.principal ||
            dto.diagnosis?.main ||
            dto.diagnosisText ||
            consultation.diagnosis,
          assessment: dto.diagnosis?.hypotheses
            ? JSON.stringify(dto.diagnosis.hypotheses)
            : consultation.assessment,
          plan: dto.treatmentPlan
            ? JSON.stringify(dto.treatmentPlan)
            : consultation.plan,
          status: isAmendment
            ? ConsultationStatus.FINALIZED
            : normalizedStatus,
          version: { increment: 1 },
        } as any,
        include: { patient: true, provider: { select: PUBLIC_USER_SELECT } },
      });

      let materialized: Array<{
        invoiceId: string;
        invoiceStatus: string;
        invoiceTotal: number;
        kind: 'LABORATORY' | 'IMAGING';
        label: string;
        priority: string;
      }> = [];

      // AUTO_DRAFT ne matérialise rien. Seul l'enregistrement volontaire
      // IN_PROGRESS transforme les examens du brouillon en demandes réelles.
      if (
        !isAmendment &&
        normalizedStatus === ConsultationStatus.IN_PROGRESS &&
        orderedExams.length > 0
      ) {
        materialized = await this.materializeOrderedExamsInTransaction(
          tx,
          {
            id,
            patientId: consultation.patientId,
            clinicId,
          },
          orderedExams,
          actorId,
        );
      }

      if (normalizedStatus === ConsultationStatus.FINALIZED) {
        await tx.appointment.update({
          where: { id: updated.appointmentId },
          data: { status: 'COMPLETED' },
        });

        await tx.patientVisit.updateMany({
          where: {
            appointmentId: updated.appointmentId,
            status: 'IN_CONSULTATION',
          },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      }

      // DRAFT et IN_PROGRESS restent uniquement dans la consultation.
      // L'historique longitudinal définitif est écrit à la signature.
      if (!isAmendment && normalizedStatus !== ConsultationStatus.FINALIZED) {
        return { updated, materialized };
      }

      await tx.consultationNote.create({
        data: {
          consultationId: id,
          authorId: actorId,
          noteType: isAmendment ? 'AMENDMENT' : 'FINALIZATION_SIGNATURE',
          content: isAmendment
            ? `Avenant v${updated.version}: ${amendmentReason}`
            : 'Consultation relue et validée par le médecin responsable.',
        },
      });

      await tx.medicalHistory.create({
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

      return { updated, materialized };
    });

    // Les notifications sont des effets externes : on les émet uniquement
    // après le commit. Une transaction annulée ne doit jamais annoncer une
    // facture qui n'existe pas.
    if (transactionResult.materialized.length > 0) {
      try {
        await this.notifyMaterializedExamInvoices(
          clinicId,
          consultation.patientId,
          consultation.patient.firstName,
          consultation.patient.lastName,
          transactionResult.materialized,
        );
      } catch (error) {
        // The clinical order and invoice are already committed. Returning a
        // creation error here would invite the client to retry a real order.
        this.logger.warn(`Post-commit exam notification failed for consultation ${id}: ${error instanceof Error ? error.name : 'unknown error'}`);
      }
    }

    return transactionResult.updated;
  }

  private async materializeOrderedExamsInTransaction(
    tx: Prisma.TransactionClient,
    consultation: {
      id: string;
      patientId: string;
      clinicId: string;
    },
    orderedExams: Array<any>,
    actorId?: string,
  ): Promise<
    Array<{
      invoiceId: string;
      invoiceStatus: string;
      invoiceTotal: number;
      kind: 'LABORATORY' | 'IMAGING';
      label: string;
      priority: string;
    }>
  > {
    const createdInvoices: Array<{
      invoiceId: string;
      invoiceStatus: string;
      invoiceTotal: number;
      kind: 'LABORATORY' | 'IMAGING';
      label: string;
      priority: string;
    }> = [];

    // Une suggestion IA libre sans catalogueItemId reste dans le brouillon
    // clinique. Elle ne devient jamais silencieusement une demande facturable.
    const normalizedOrders = orderedExams
      .filter(
        (exam) =>
          exam &&
          typeof exam === 'object' &&
          typeof exam.catalogueItemId === 'string' &&
          Boolean(exam.catalogueItemId.trim()) &&
          ['LABORATORY', 'IMAGING'].includes(
            String(exam.category || '').toUpperCase(),
          ),
      )
      .map((exam) => ({
        category: String(exam.category).toUpperCase() as
          | 'LABORATORY'
          | 'IMAGING',
        catalogueItemId: exam.catalogueItemId.trim(),
        urgency:
          typeof exam.urgency === 'string' && exam.urgency.trim()
            ? exam.urgency.trim().toUpperCase()
            : 'ROUTINE',
        clinicalIndication:
          typeof exam.clinicalIndication === 'string'
            ? exam.clinicalIndication.trim()
            : '',
      }))
      .filter(
        (exam, index, collection) =>
          collection.findIndex(
            (candidate) =>
              candidate.category === exam.category &&
              candidate.catalogueItemId === exam.catalogueItemId,
          ) === index,
      );

    const labOrders = normalizedOrders.filter(
      (exam) => exam.category === 'LABORATORY',
    );

    const newLabTests: Array<{
      order: (typeof labOrders)[number];
      labTest: any;
    }> = [];

    for (const order of labOrders) {
      const labTest = await tx.labTest.findFirst({
        where: {
          id: order.catalogueItemId,
          clinicId: consultation.clinicId,
          active: true,
        },
      });

      if (!labTest) {
        throw new BadRequestException(
          'Un examen laboratoire sélectionné est introuvable ou inactif dans cet établissement.',
        );
      }

      if (
        labTest.price === null ||
        labTest.price === undefined ||
        Number(labTest.price) <= 0
      ) {
        throw new BadRequestException(
          `Le tarif de l'examen laboratoire "${labTest.name}" n'est pas valide.`,
        );
      }

      const existingItem = await tx.labRequestItem.findFirst({
        where: {
          labTestId: labTest.id,
          deletedAt: null,
          labRequest: {
            consultationId: consultation.id,
            clinicId: consultation.clinicId,
            patientId: consultation.patientId,
            deletedAt: null,
            status: { not: 'CANCELLED' },
          },
        },
        select: { id: true },
      });

      if (!existingItem) {
        newLabTests.push({ order, labTest });
      }
    }

    if (newLabTests.length > 0) {
      const total = newLabTests.reduce(
        (sum, item) => sum + Number(item.labTest.price),
        0,
      );
      const label = newLabTests
        .map((item) => item.labTest.name)
        .join(', ');
      const priority = newLabTests.some(
        (item) => item.order.urgency === 'URGENT',
      )
        ? 'URGENT'
        : 'NORMAL';

      const labRequest = await tx.labRequest.create({
        data: {
          consultationId: consultation.id,
          patientId: consultation.patientId,
          requestedById: actorId || null,
          clinicId: consultation.clinicId,
          specimenType:
            newLabTests.length > 1
              ? label
              : newLabTests[0].labTest.name,
          priority,
          notes:
            newLabTests
              .map((item) => item.order.clinicalIndication)
              .filter(Boolean)
              .join(' | ') || null,
          status: 'AWAITING_PAYMENT',
        },
      });

      const invoice = await tx.invoice.create({
        data: {
          patientId: consultation.patientId,
          issuedById: actorId || null,
          clinicId: consultation.clinicId,
          type: InvoiceType.LABORATORY,
          status: 'PENDING',
          totalAmount: total,
          balanceDue: total,
          remarks: `LabRequest:${labRequest.id} - Demande laboratoire ${labRequest.id} - ${label}`,
        },
      });

      for (const { order, labTest } of newLabTests) {
        const price = Number(labTest.price);

        await tx.invoiceLine.create({
          data: {
            invoiceId: invoice.id,
            label: `Examen laboratoire - ${labTest.name}`,
            quantity: 1,
            unitPrice: price,
            totalAmount: price,
          },
        });

        await tx.labRequestItem.create({
          data: {
            labRequestId: labRequest.id,
            labTestId: labTest.id,
            status: 'AWAITING_PAYMENT',
            requestedAt: labRequest.requestedAt,
            specimenLabel: labTest.name,
            notes: order.clinicalIndication || null,
          },
        });
      }

      const handledBySubscription =
        await this.recordSubscriptionChargeForInvoice(
          tx,
          consultation.patientId,
          consultation.clinicId,
          invoice.id,
          newLabTests.length > 1
            ? `Examens laboratoire - ${label}`
            : `Examen laboratoire - ${label}`,
          total,
          null,
        );

      await tx.labRequest.update({
        where: { id: labRequest.id },
        data: {
          externalReference: invoice.id,
          status: handledBySubscription
            ? 'REQUESTED'
            : 'AWAITING_PAYMENT',
        },
      });

      if (handledBySubscription) {
        await tx.labRequestItem.updateMany({
          where: {
            labRequestId: labRequest.id,
            status: 'AWAITING_PAYMENT',
            deletedAt: null,
          },
          data: { status: 'REQUESTED' },
        });
      }

      await tx.medicalHistory.create({
        data: {
          patientId: consultation.patientId,
          kind: 'LAB_REQUEST',
          details: JSON.stringify({
            consultationId: consultation.id,
            labRequestId: labRequest.id,
            invoiceId: invoice.id,
            labTestIds: newLabTests.map((item) => item.labTest.id),
            examNames: newLabTests.map((item) => item.labTest.name),
            price: total,
            currency: 'CDF',
            source: 'CONSULTATION_IN_PROGRESS',
          }),
          createdById: actorId,
        },
      });

      const finalInvoice = handledBySubscription
        ? await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
        : invoice;

      createdInvoices.push({
        invoiceId: invoice.id,
        invoiceStatus: finalInvoice.status,
        invoiceTotal: Number(finalInvoice.totalAmount),
        kind: 'LABORATORY',
        label,
        priority,
      });
    }

    const imagingOrders = normalizedOrders.filter(
      (exam) => exam.category === 'IMAGING',
    );

    for (const order of imagingOrders) {
      const imagingCatalogue = await tx.imagingCatalogue.findFirst({
        where: {
          id: order.catalogueItemId,
          clinicId: consultation.clinicId,
          active: true,
          deletedAt: null,
        },
      });

      if (!imagingCatalogue) {
        throw new BadRequestException(
          'Un examen d’imagerie sélectionné est introuvable ou inactif dans cet établissement.',
        );
      }

      const price = Number(imagingCatalogue.price || 0);
      if (price <= 0) {
        throw new BadRequestException(
          `Le tarif de l'examen d'imagerie "${imagingCatalogue.name}" n'est pas valide.`,
        );
      }

      const existingRequest = await tx.imagingRequest.findFirst({
        where: {
          consultationId: consultation.id,
          patientId: consultation.patientId,
          clinicId: consultation.clinicId,
          imagingCatalogueId: imagingCatalogue.id,
          deletedAt: null,
          status: { not: 'CANCELLED' },
        },
        select: { id: true },
      });

      if (existingRequest) {
        continue;
      }

      const imagingRequest = await tx.imagingRequest.create({
        data: {
          consultationId: consultation.id,
          patientId: consultation.patientId,
          requestedById: actorId || null,
          clinicId: consultation.clinicId,
          imagingCatalogueId: imagingCatalogue.id,
          modality: imagingCatalogue.modality,
          bodyPart: imagingCatalogue.name,
          urgency: order.urgency,
          clinicalIndication: order.clinicalIndication || null,
          status: ImagingRequestStatus.AWAITING_PAYMENT,
        },
      });

      const invoice = await tx.invoice.create({
        data: {
          patientId: consultation.patientId,
          issuedById: actorId || null,
          clinicId: consultation.clinicId,
          type: InvoiceType.RADIOLOGY,
          status: 'PENDING',
          totalAmount: price,
          balanceDue: price,
          remarks: `ImagingRequest:${imagingRequest.id} - Demande imagerie ${imagingCatalogue.name}`,
        },
      });

      await tx.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          label: `Examen d'imagerie - ${imagingCatalogue.name}`,
          quantity: 1,
          unitPrice: price,
          totalAmount: price,
        },
      });

      const handledBySubscription =
        await this.recordSubscriptionChargeForInvoice(
          tx,
          consultation.patientId,
          consultation.clinicId,
          invoice.id,
          `Examen d'imagerie - ${imagingCatalogue.name}`,
          price,
          null,
        );

      if (handledBySubscription) {
        await tx.imagingRequest.update({
          where: { id: imagingRequest.id },
          data: { status: ImagingRequestStatus.REQUESTED },
        });
      }

      await tx.medicalHistory.create({
        data: {
          patientId: consultation.patientId,
          kind: 'IMAGING_REQUEST',
          details: JSON.stringify({
            consultationId: consultation.id,
            imagingRequestId: imagingRequest.id,
            invoiceId: invoice.id,
            imagingCatalogueId: imagingCatalogue.id,
            examName: imagingCatalogue.name,
            clinicalIndication: order.clinicalIndication || null,
            urgency: order.urgency,
            price,
            currency: 'CDF',
            source: 'CONSULTATION_IN_PROGRESS',
          }),
          createdById: actorId,
        },
      });

      const finalInvoice = handledBySubscription
        ? await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
        : invoice;

      createdInvoices.push({
        invoiceId: invoice.id,
        invoiceStatus: finalInvoice.status,
        invoiceTotal: Number(finalInvoice.totalAmount),
        kind: 'IMAGING',
        label: imagingCatalogue.name,
        priority: order.urgency,
      });
    }

    if (createdInvoices.length > 0) {
      const hasUnpaidInvoice = createdInvoices.some(
        (invoice) => invoice.invoiceStatus !== 'COVERED',
      );

      if (hasUnpaidInvoice) {
        await this.patientWorkflow.transition(
          tx,
          consultation.patientId,
          PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
          consultation.clinicId,
        );
      } else {
        const hasLab = createdInvoices.some(
          (invoice) => invoice.kind === 'LABORATORY',
        );
        const hasImaging = createdInvoices.some(
          (invoice) => invoice.kind === 'IMAGING',
        );

        await this.patientWorkflow.transition(
          tx,
          consultation.patientId,
          hasLab
            ? PatientWorkflowStatus.EN_LABORATOIRE
            : hasImaging
              ? PatientWorkflowStatus.EN_RADIOLOGIE
              : PatientWorkflowStatus.EN_CONSULTATION,
          consultation.clinicId,
        );
      }
    }

    return createdInvoices;
  }

  private async notifyMaterializedExamInvoices(
    clinicId: string,
    patientId: string,
    patientFirstName: string,
    patientLastName: string,
    materialized: Array<{
      invoiceId: string;
      invoiceStatus: string;
      invoiceTotal: number;
      kind: 'LABORATORY' | 'IMAGING';
      label: string;
      priority: string;
    }>,
  ) {
    const unpaidInvoices = materialized.filter(
      (invoice) => invoice.invoiceStatus !== 'COVERED',
    );
    const coveredInvoices = materialized.filter(
      (invoice) => invoice.invoiceStatus === 'COVERED',
    );

    for (const invoice of coveredInvoices) {
      const serviceRoles = invoice.kind === 'LABORATORY'
        ? [RoleSlug.LAB_MANAGER, RoleSlug.LAB_TECHNICIAN]
        : [RoleSlug.RADIOLOGIST];
      const staff = await this.prisma.user.findMany({
        where: {
          clinicId,
          status: 'ACTIVE',
          deletedAt: null,
          OR: [
            { primaryRole: { in: serviceRoles } },
            { roles: { some: { role: { slug: { in: serviceRoles } } } } },
          ],
        },
        select: { id: true },
      });
      for (const user of staff) {
        const notification = await this.prisma.notification.create({
          data: {
            recipientId: user.id,
            patientId,
            type: 'TASK',
            status: 'UNREAD',
            priority: invoice.priority === 'URGENT' ? 'HIGH' : 'MEDIUM',
            title: invoice.kind === 'LABORATORY' ? 'Examen laboratoire pris en charge' : 'Examen imagerie pris en charge',
            message: `La demande ${invoice.label} est disponible dans votre service.`,
            relatedEntity: 'Invoice',
            relatedId: invoice.invoiceId,
          },
        });
        this.notificationsGateway.notifyToUser(user.id, 'notification.created', notification);
        if (invoice.kind === 'LABORATORY') {
          this.notificationsGateway.notifyToUser(user.id, 'lab.request.created', { patientId });
        }
      }
    }

    if (unpaidInvoices.length > 0) {
      const cashiers = await this.prisma.user.findMany({
        where: {
          clinicId,
          status: 'ACTIVE',
          deletedAt: null,
          OR: [
            { primaryRole: 'CASHIER' as any },
            { roles: { some: { role: { slug: 'CASHIER' as any } } } },
          ],
        },
        select: { id: true },
      });

      for (const invoice of unpaidInvoices) {
        const notifications = await Promise.all(
          cashiers.map((cashier) =>
            this.prisma.notification.create({
              data: {
                recipientId: cashier.id,
                patientId,
                type: 'TASK',
                status: 'UNREAD',
                priority:
                  invoice.priority === 'URGENT' ? 'HIGH' : 'MEDIUM',
                title:
                  invoice.kind === 'LABORATORY'
                    ? 'Paiement examen laboratoire'
                    : 'Paiement examen d imagerie',
                message: `Valider ${invoice.label} pour ${patientFirstName} ${patientLastName}: ${invoice.invoiceTotal.toLocaleString('fr-FR')} CDF.`,
                relatedEntity: 'Invoice',
                relatedId: invoice.invoiceId,
                sendAt: new Date(),
              },
            }),
          ),
        );

        notifications.forEach((notification) => {
          this.notificationsGateway.notifyToUser(
            notification.recipientId,
            'notification.created',
            notification,
          );
        });

        this.notificationsGateway.notify('invoice.created', {
          id: invoice.invoiceId,
        });
      }

      this.notificationsGateway.notify('patient.updated', {
        id: patientId,
        workflowStatus: PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
      });
    }

    // Prévenir la réception pour chaque examen couvert, y compris dans une
    // consultation mêlant factures particulières et prises en charge.
    if (coveredInvoices.length > 0) {
      const receptionists = await this.prisma.user.findMany({
        where: {
          clinicId,
          status: 'ACTIVE',
          deletedAt: null,
          OR: [
            { primaryRole: RoleSlug.RECEPTIONIST },
            { roles: { some: { role: { slug: RoleSlug.RECEPTIONIST } } } },
          ],
        },
        select: { id: true },
      });
      const labels = coveredInvoices.map((invoice) => invoice.label).join(', ');
      const receptionNotifications = await Promise.all(receptionists.map((user) =>
        this.prisma.notification.create({
          data: {
            recipientId: user.id,
            patientId,
            type: 'SYSTEM',
            status: 'UNREAD',
            priority: 'MEDIUM',
            title: 'Examens pris en charge par abonnement',
            message: `${labels} est transmis directement au service concerné ; le montant est ajouté à la facture entreprise.`,
            relatedEntity: 'Invoice',
            relatedId: coveredInvoices[0].invoiceId,
          },
        }),
      ));
      receptionNotifications.forEach((notification) =>
        this.notificationsGateway.notifyToUser(notification.recipientId, 'notification.created', notification),
      );
    }

    const hasLab = coveredInvoices.some(
      (invoice) => invoice.kind === 'LABORATORY',
    );
    const hasImaging = coveredInvoices.some(
      (invoice) => invoice.kind === 'IMAGING',
    );

    if (unpaidInvoices.length === 0) {
      this.notificationsGateway.notify('patient.updated', {
        id: patientId,
        workflowStatus: hasLab
          ? PatientWorkflowStatus.EN_LABORATOIRE
          : hasImaging
            ? PatientWorkflowStatus.EN_RADIOLOGIE
            : PatientWorkflowStatus.EN_CONSULTATION,
      });
    }
  }

  async createLabRequest(id: string, dto: CreateLabRequestDto, actorId?: string) {
    const consultation = await this.findOne(id, actorId);
    await this.ensureWriteAccess(consultation.providerId, actorId);
    const clinicId = consultation.clinicId || consultation.patient?.clinicId;
    if (!clinicId) {
      throw new ForbiddenException('La consultation doit être rattachée à un établissement actif.');
    }
    const request = await this.prisma.$transaction(async (tx) => {
      const trimmedExamName = typeof dto.examName === 'string' ? dto.examName.trim() : '';
      const requestedLabTestIds = Array.isArray(dto.labTestIds)
        ? dto.labTestIds.filter((value: unknown): value is string => typeof value === 'string' && Boolean(value))
        : dto.labTestId
          ? [dto.labTestId]
          : [];

      let selectedLabTests: Array<any> = [];

      const labTestInclude = {
        section: true,
        category: true,
        parameterTemplates: { where: { clinicId, active: true, archivedAt: null } },
        sampleRequirements: { where: { clinicId, archivedAt: null }, include: { labSampleType: true } },
        consumableRequirements: { where: { clinicId, archivedAt: null }, include: { labConsumable: true } },
      } as const;

      if (requestedLabTestIds.length > 0) {
        for (const labTestId of requestedLabTestIds) {
          const labTest = await tx.labTest.findFirst({
            where: {
              id: labTestId,
              clinicId,
              active: true,
            },
            include: labTestInclude,
          });

          if (!labTest) {
            throw new BadRequestException(
              'Un examen du catalogue laboratoire est introuvable dans cet établissement ou inactif.',
            );
          }

          selectedLabTests.push(labTest);
        }
      }

      if (!selectedLabTests.length && trimmedExamName) {
        const exactMatch = await tx.labTest.findFirst({
          where: {
            clinicId,
            active: true,
            OR: [
              { name: { equals: trimmedExamName, mode: 'insensitive' } },
              { code: { equals: trimmedExamName, mode: 'insensitive' } },
            ],
          },
          include: labTestInclude,
          orderBy: { name: 'asc' },
        });

        if (exactMatch) {
          selectedLabTests.push(exactMatch);
        }
      }

      if (!selectedLabTests.length && trimmedExamName) {
        const containsMatch = await tx.labTest.findFirst({
          where: {
            clinicId,
            active: true,
            name: { contains: trimmedExamName, mode: 'insensitive' },
          },
          include: labTestInclude,
          orderBy: { name: 'asc' },
        });

        if (containsMatch) {
          selectedLabTests.push(containsMatch);
        }
      }

      selectedLabTests = selectedLabTests.filter(
        (labTest, index, collection) =>
          collection.findIndex((item) => item.id === labTest.id) === index,
      );

      if (!selectedLabTests.length) {
        throw new BadRequestException(
          'Veuillez choisir un examen laboratoire actif de cet établissement.',
        );
      }

      const invalidLabTests = selectedLabTests.filter((labTest) =>
        labTest.price === null || labTest.price === undefined || Number(labTest.price) <= 0,
      );

      if (invalidLabTests.length > 0) {
        throw new BadRequestException(
          'Un ou plusieurs examens laboratoire n ont pas encore de tarif valide pour cet établissement.',
        );
      }

      const examPriceTotal = selectedLabTests.reduce(
        (total, labTest) => total + Number(labTest.price),
        0,
      );
      const requestLabel = selectedLabTests.map((labTest) => labTest.name).join(', ');
      const specimenTypeLabel = dto.specimenType || (selectedLabTests.length > 1 ? requestLabel : selectedLabTests[0]?.name || trimmedExamName || 'Examen');

      const created = await tx.labRequest.create({
        data: {
          consultationId: id,
          patientId: consultation.patientId,
          requestedById: actorId,
          clinicId,
          specimenType: specimenTypeLabel,
          priority: dto.priority || 'NORMAL',
          notes: dto.notes || null,
          status: 'AWAITING_PAYMENT',
        },
        include: { patient: true, requestedBy: { select: PUBLIC_USER_SELECT }, consultation: true, results: true },
      });

      const invoice = await tx.invoice.create({
        data: {
          patientId: consultation.patientId,
          issuedById: actorId,
          clinicId,
          type: 'LABORATORY',
          status: 'PENDING',
          totalAmount: examPriceTotal,
          balanceDue: examPriceTotal,
          remarks: `LabRequest:${created.id} - Demande laboratoire ${created.id} - ${requestLabel}`,
        },
      });

      for (const labTest of selectedLabTests) {
        const examPrice = Number(labTest.price);
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

      const handledBySubscription = await this.recordSubscriptionChargeForInvoice(
        tx,
        consultation.patientId,
        consultation.clinicId,
        invoice.id,
        selectedLabTests.length > 1 ? `Examens laboratoire - ${requestLabel}` : `Examen laboratoire - ${requestLabel}`,
        examPriceTotal,
        null,
      );

      await tx.labRequest.update({
        where: { id: created.id },
        data: {
          externalReference: invoice.id,
          status: handledBySubscription
            ? 'REQUESTED'
            : 'AWAITING_PAYMENT',
        },
      });

      await this.patientWorkflow.transition(
        tx,
        consultation.patientId,
        handledBySubscription ? PatientWorkflowStatus.EN_LABORATOIRE : PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
        clinicId,
      );

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
            status: handledBySubscription
            ? 'REQUESTED'
            : 'AWAITING_PAYMENT',
            requestedAt: created.requestedAt,
            specimenLabel: created.specimenType || labTest.name,
            notes: dto.notes || null,
          },
        });
      }

      const finalInvoice = handledBySubscription
        ? await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
        : invoice;

      return {
        ...created,
        invoice: finalInvoice,
        labTests: selectedLabTests,
        labTest: selectedLabTests[0],
        handledBySubscription,
      };
    });

    const cashiers = request.handledBySubscription
      ? []
      : await this.prisma.user.findMany({
      where: {
        clinicId,
        status: 'ACTIVE',
        deletedAt: null,
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
    if (request.handledBySubscription) {
      const receptionists = await this.prisma.user.findMany({
        where: {
          clinicId,
          status: 'ACTIVE',
          deletedAt: null,
          OR: [
            { primaryRole: 'RECEPTIONIST' as any },
            { roles: { some: { role: { slug: 'RECEPTIONIST' as any } } } },
          ],
        },
        select: { id: true },
      });
      const receptionNotifications = await Promise.all(receptionists.map((user) =>
        this.prisma.notification.create({
          data: {
            recipientId: user.id,
            patientId: consultation.patientId,
            type: 'SYSTEM',
            status: 'UNREAD',
            priority: 'MEDIUM',
            title: 'Examen pris en charge par abonnement',
            message: `${requestLabel} est transmis directement au laboratoire ; son montant est ajouté à la facture entreprise.`,
            relatedEntity: 'LabRequest',
            relatedId: request.id,
          },
        }),
      ));
      receptionNotifications.forEach((notification) =>
        this.notificationsGateway.notifyToUser(notification.recipientId, 'notification.created', notification),
      );
    }
    this.notificationsGateway.notify('patient.updated', {
      id: consultation.patientId,
      workflowStatus: request.handledBySubscription
        ? PatientWorkflowStatus.EN_LABORATOIRE
        : PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
    });
    this.notificationsGateway.notify('invoice.created', request.invoice);

    return request;
  }

  async createImagingRequest(id: string, dto: CreateImagingRequestDto, actorId?: string) {
    const consultation = await this.findOne(id, actorId);
    await this.ensureWriteAccess(consultation.providerId, actorId);
    const clinicId = consultation.clinicId || consultation.patient?.clinicId;
    if (!clinicId) {
      throw new ForbiddenException('La consultation doit être rattachée à un établissement actif.');
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const trimmedExamName = typeof dto.examName === 'string' ? dto.examName.trim() : '';
      const imagingCatalogueId = typeof dto.imagingCatalogueId === 'string' && dto.imagingCatalogueId ? dto.imagingCatalogueId : null;

      let imagingCatalogue: any = null;
      if (imagingCatalogueId) {
        imagingCatalogue = await tx.imagingCatalogue.findFirst({
          where: { id: imagingCatalogueId, clinicId, active: true, deletedAt: null },
        });
        if (!imagingCatalogue) {
          throw new BadRequestException('Un examen du catalogue d imagerie est introuvable.');
        }
      } else if (trimmedExamName) {
        imagingCatalogue = await tx.imagingCatalogue.findFirst({
          where: {
            clinicId,
            active: true,
            deletedAt: null,
            OR: [
              { name: { equals: trimmedExamName, mode: 'insensitive' } },
              { code: { equals: trimmedExamName, mode: 'insensitive' } },
            ],
          },
        });

        if (!imagingCatalogue) {
          imagingCatalogue = await tx.imagingCatalogue.findFirst({
            where: {
              clinicId,
              active: true,
              deletedAt: null,
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
          status: {
            in: [
              'AWAITING_PAYMENT',
              'REQUESTED',
              'SCHEDULED',
              'IN_PROGRESS',
              'COMPLETED',
              'VERIFIED',
            ],
          },
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
      if (machineId) {
        const machine = await tx.imagingMachine.findFirst({
          where: {
            id: machineId,
            clinicId,
            deletedAt: null,
            isOperational: true,
          },
          select: { id: true },
        });
        if (!machine) {
          throw new BadRequestException('L’équipement d’imagerie sélectionné est indisponible dans cet établissement.');
        }
      }
      const scheduledAt = typeof dto.scheduledAt === 'string' && dto.scheduledAt.trim() ? new Date(dto.scheduledAt) : null;
      const status: ImagingRequestStatus = 'AWAITING_PAYMENT';

      const created = await tx.imagingRequest.create({
        data: {
          consultationId: id,
          patientId: consultation.patientId,
          requestedById: actorId || null,
          clinicId,
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
        include: { patient: true, requestedBy: { select: PUBLIC_USER_SELECT }, consultation: true, imagingCatalogue: true, report: true },
      });

      const invoice = await tx.invoice.create({
        data: {
          patientId: consultation.patientId,
          issuedById: actorId,
          clinicId,
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
        consultation.clinicId,
        invoice.id,
        `Examen d'imagerie - ${requestLabel}`,
        price,
        null,
      );

      if (handledBySubscription) {
        await tx.imagingRequest.update({
          where: { id: created.id },
          data: { status: ImagingRequestStatus.REQUESTED },
        });
      }

      await this.patientWorkflow.transition(
        tx,
        consultation.patientId,
        handledBySubscription ? PatientWorkflowStatus.EN_RADIOLOGIE : PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
        clinicId,
      );

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

      const finalInvoice = handledBySubscription
        ? await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
        : invoice;
      return { ...created, invoice: finalInvoice, handledBySubscription };
    });

    const cashiers = request.handledBySubscription
      ? []
      : await this.prisma.user.findMany({
      where: {
        clinicId,
        status: 'ACTIVE',
        deletedAt: null,
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
    if (request.handledBySubscription) {
      const receptionists = await this.prisma.user.findMany({
        where: {
          clinicId,
          status: 'ACTIVE',
          deletedAt: null,
          OR: [
            { primaryRole: 'RECEPTIONIST' as any },
            { roles: { some: { role: { slug: 'RECEPTIONIST' as any } } } },
          ],
        },
        select: { id: true },
      });
      const receptionNotifications = await Promise.all(receptionists.map((user) =>
        this.prisma.notification.create({
          data: {
            recipientId: user.id,
            patientId: consultation.patientId,
            type: 'SYSTEM',
            status: 'UNREAD',
            priority: 'MEDIUM',
            title: 'Examen pris en charge par abonnement',
            message: `${requestLabel} est transmis directement à l’imagerie ; son montant est ajouté à la facture entreprise.`,
            relatedEntity: 'ImagingRequest',
            relatedId: request.id,
          },
        }),
      ));
      receptionNotifications.forEach((notification) =>
        this.notificationsGateway.notifyToUser(notification.recipientId, 'notification.created', notification),
      );
    }
    this.notificationsGateway.notify('patient.updated', {
      id: consultation.patientId,
      workflowStatus: request.handledBySubscription
        ? PatientWorkflowStatus.EN_RADIOLOGIE
        : PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
    });
    this.notificationsGateway.notify('invoice.created', request.invoice);

    return request;
  }

  private async resolveSectionConsumableUsage(tx: any, selectedLabTests: Array<any>) {
    const usageByKey = new Map<string, { sectionId: string; sectionName: string; labConsumableId: string; consumableName: string; quantity: number; unit?: string | null }>();

    for (const labTest of selectedLabTests) {
      const sectionId = labTest.section?.id || labTest.sectionId;
      if (!sectionId) continue;

      const requirements = await tx.labTestConsumableRequirement.findMany({
        where: { clinicId: labTest.clinicId, labTestId: labTest.id, archivedAt: null },
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
    const consultation = await this.findOne(id, actorId);
    await this.ensureWriteAccess(consultation.providerId, actorId);
    const clinicId = consultation.clinicId || consultation.patient?.clinicId;
    if (!clinicId) {
      throw new ForbiddenException('La consultation doit être rattachée à un établissement actif.');
    }
    const lines = Array.isArray(dto.lines) ? dto.lines : [];
    if (!lines.length) {
      throw new BadRequestException('Aucun medicament prescrit.');
    }

    const medicationIds = lines.map((line: any) => line.medicationId).filter(Boolean);
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const [medications, salePrices] = await Promise.all([
      this.prisma.medication.findMany({
        where: { id: { in: medicationIds }, deletedAt: null },
        include: {
          // The medication catalogue may be shared; the billable stock is not.
          StockLot: { where: { clinicId, quantity: { gt: 0 }, expiryDate: { gte: todayUtc } } },
        },
      }),
      this.prisma.medicationSalePrice.findMany({
        where: { clinicId, medicationId: { in: medicationIds }, currency: 'CDF' },
      }),
    ]);
    const medicationById = new Map(medications.map((item) => [item.id, item]));
    const priceByMedicationId = new Map(salePrices.map((price) => [price.medicationId, price.amount]));

    const enrichedLines = lines.map((line: any) => {
      const medication = medicationById.get(line.medicationId);
      if (!medication) throw new BadRequestException('Medicament introuvable.');
      const available = medication.StockLot.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
      const quantity = Number(line.quantity || 1);
      if (!Number.isSafeInteger(quantity) || quantity < 1) throw new BadRequestException('Quantité prescrite invalide.');
      if (available < quantity) {
        throw new BadRequestException(`Stock insuffisant pour ${medication.name}.`);
      }
      const unitPrice = priceByMedicationId.get(line.medicationId);
      if (!unitPrice || unitPrice.lte(0)) {
        throw new BadRequestException(`Aucun tarif de vente CDF n'est configuré pour ${medication.name} dans cet établissement.`);
      }

      return { ...line, quantity, unitPrice, medication };
    });

    const total = enrichedLines.reduce(
      (sum: Prisma.Decimal, line: { unitPrice: Prisma.Decimal; quantity: number }) => sum.plus(line.unitPrice.times(line.quantity)),
      new Prisma.Decimal(0),
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const prescription = await tx.prescription.create({
        data: {
          consultationId: id,
          patientId: consultation.patientId,
          prescriberId: actorId,
          clinicId,
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
        include: { lineItems: { include: { medication: true } }, patient: true, prescriber: { select: PUBLIC_USER_SELECT } },
      });

      const invoice = await tx.invoice.create({
        data: {
          patientId: consultation.patientId,
          issuedById: actorId,
          clinicId,
          type: 'PHARMACY',
          prescriptionId: prescription.id,
          prescriptionVersion: prescription.version,
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
              totalAmount: line.unitPrice.times(line.quantity),
            },
          }),
        ),
      );

      const handledBySubscription = await this.recordSubscriptionChargeForInvoice(
        tx,
        consultation.patientId,
        consultation.clinicId,
        invoice.id,
        `Prescription ${prescription.id}`,
        total,
        null,
      );

      await this.patientWorkflow.transition(
        tx,
        consultation.patientId,
        handledBySubscription ? PatientWorkflowStatus.EN_PHARMACIE : PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
        consultation.clinicId || consultation.patient?.clinicId || undefined,
      );

      await tx.medicalHistory.create({
        data: {
          patientId: consultation.patientId,
          kind: 'PRESCRIPTION_CREATED',
          details: JSON.stringify({ prescriptionId: prescription.id, invoiceId: invoice.id, total }),
          createdById: actorId,
        },
      });

      await tx.notificationOutbox.create({
        data: {
          clinicId,
          eventType: 'PRESCRIPTION_ROUTING',
          deduplicationKey: `prescription-routing:${prescription.id}:v${prescription.version}`,
          payload: {
            patientId: consultation.patientId,
            prescriptionId: prescription.id,
            invoiceId: invoice.id,
            covered: handledBySubscription,
          },
        },
      });

      const finalInvoice = handledBySubscription
        ? await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
        : invoice;
      return { prescription, invoice: finalInvoice };
    });

    // The outbox row is committed with the prescription. A delivery failure
    // therefore never makes the physician retry an already billed command.
    return result;
  }

  private async notifyPrescriptionRouting(
    clinicId: string,
    patientId: string,
    prescriptionId: string,
    invoiceId: string,
    covered: boolean,
  ) {
    const role = covered ? RoleSlug.PHARMACIST : RoleSlug.CASHIER;
    const recipients = await this.prisma.user.findMany({
      where: {
        clinicId,
        status: 'ACTIVE',
        deletedAt: null,
        OR: [
          { primaryRole: role },
          { roles: { some: { role: { slug: role } } } },
        ],
      },
      select: { id: true },
    });
    const title = covered ? 'Ordonnance prise en charge' : 'Paiement ordonnance requis';
    const message = covered
      ? 'Une ordonnance prise en charge est disponible à la pharmacie.'
      : 'Une ordonnance est en attente de paiement à la caisse.';
    for (const recipient of recipients) {
      const notification = await this.prisma.notification.create({
        data: {
          recipientId: recipient.id,
          patientId,
          type: 'TASK',
          status: 'UNREAD',
          priority: 'MEDIUM',
          title,
          message,
          relatedEntity: 'Prescription',
          relatedId: prescriptionId,
        },
      });
      this.notificationsGateway.notifyToUser(recipient.id, 'notification.created', notification);
      if (covered) {
        this.notificationsGateway.notifyToUser(recipient.id, 'prescription.created', {
          prescriptionId,
          invoiceId,
          patientId,
          covered: true,
        });
      }
    }

    if (covered) {
      const receptionists = await this.prisma.user.findMany({
        where: {
          clinicId,
          status: 'ACTIVE',
          deletedAt: null,
          OR: [
            { primaryRole: RoleSlug.RECEPTIONIST },
            { roles: { some: { role: { slug: RoleSlug.RECEPTIONIST } } } },
          ],
        },
        select: { id: true },
      });
      for (const receptionist of receptionists) {
        const notification = await this.prisma.notification.create({
          data: {
            recipientId: receptionist.id,
            patientId,
            type: 'SYSTEM',
            status: 'UNREAD',
            priority: 'MEDIUM',
            title: 'Ordonnance prise en charge par abonnement',
            message: 'L’ordonnance a été transmise à la pharmacie et ajoutée à la facture entreprise.',
            relatedEntity: 'Invoice',
            relatedId: invoiceId,
          },
        });
        this.notificationsGateway.notifyToUser(receptionist.id, 'notification.created', notification);
      }
    }
  }

  async updatePrescription(consultationId: string, prescriptionId: string, dto: CreatePrescriptionDto, actorId?: string) {
    const consultation = await this.findOne(consultationId, actorId);
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
    if (prescription.clinicId !== consultation.clinicId || prescription.patientId !== consultation.patientId) {
      throw new NotFoundException('Prescription introuvable dans cet établissement.');
    }

    // An invoice snapshots the prescribed lines. Until a versioned financial
    // replacement workflow exists, never mutate those lines behind a cashier's
    // back (including when the invoice is only partially paid).
    const billedInvoice = await this.prisma.invoice.findFirst({
      where: {
        clinicId: prescription.clinicId,
        patientId: prescription.patientId,
        type: 'PHARMACY',
        OR: [
          { prescriptionId: prescription.id },
          { prescriptionId: null, remarks: `Prescription:${prescription.id}` },
        ],
      },
      select: { id: true },
    });
    if (billedInvoice) {
      throw new ConflictException('Cette ordonnance est déjà facturée. Une modification exige un remplacement clinique et financier tracé.');
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
      include: { StockLot: { where: { clinicId: consultation.clinicId } } },
    });
    const medicationById = new Map(medications.map((item) => [item.id, item]));

    const enrichedLines = lines.map((line: any) => {
      const medication = medicationById.get(line.medicationId);
      if (!medication) throw new BadRequestException('Medicament introuvable.');
      const quantity = Number(line.quantity || 1);
      const available = medication.StockLot.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
      if (available < quantity) throw new BadRequestException(`Stock insuffisant pour ${medication.name}.`);
      return {
        ...line,
        quantity,
      };
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.medicalHistory.create({
        data: {
          patientId: prescription.patientId,
          kind: 'PRESCRIPTION_VERSION_REPLACED',
          details: JSON.stringify({ prescriptionId, previousVersion: prescription.version, instruction: prescription.instruction, lines: prescription.lineItems }),
          createdById: actorId,
        },
      });
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
        include: { lineItems: { include: { medication: true } }, patient: true, prescriber: { select: PUBLIC_USER_SELECT }, consultation: true },
      });

      return { updated: true, prescriptionId };
    });
  }

  /**
   * A billed prescription is never changed in place. This registers the
   * requested clinical correction and the financial path that must be applied
   * before a replacement can be issued. The tenant is always derived from the
   * consultation resolved for the authenticated clinician.
   */
  async requestPrescriptionReplacement(
    consultationId: string,
    prescriptionId: string,
    dto: RequestPrescriptionReplacementDto,
    actorId?: string,
  ) {
    const consultation = await this.findOne(consultationId, actorId);
    await this.ensureWriteAccess(consultation.providerId, actorId);

    const prescription = await this.prisma.prescription.findFirst({
      where: {
        id: prescriptionId,
        consultationId,
        clinicId: consultation.clinicId,
        patientId: consultation.patientId,
        deletedAt: null,
      },
      include: {
        pharmacyDispenses: { where: { status: { in: ['DISPENSED', 'PARTIALLY_DISPENSED'] } } },
        billingInvoices: {
          where: { clinicId: consultation.clinicId, deletedAt: null, type: InvoiceType.PHARMACY },
          include: {
            payments: { where: { deletedAt: null }, select: { id: true, amount: true } },
            subscriptionCharges: { where: { deletedAt: null }, select: { id: true, status: true, monthlyInvoiceId: true } },
          },
          orderBy: { issuedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!prescription) {
      throw new NotFoundException('Ordonnance introuvable dans cet établissement.');
    }
    const invoice = prescription.billingInvoices[0];
    if (!invoice) {
      throw new ConflictException('Cette ordonnance non facturée doit être modifiée par le parcours de modification standard.');
    }

    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('Le motif clinique du remplacement est obligatoire.');
    if (prescription.pharmacyDispenses.length > 0) {
      // A new clinical order can still be evaluated, but no stock is ever put
      // back automatically. The pharmacist must validate a physical return.
      throw new ConflictException('Cette ordonnance a déjà été délivrée. Une restitution pharmaceutique validée est requise avant tout remplacement.');
    }

    const hasPayment = invoice.payments.length > 0 || invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID';
    const charge = invoice.subscriptionCharges[0];
    const financialHandling = charge
      ? charge.monthlyInvoiceId || charge.status === 'INVOICED'
        ? PrescriptionReplacementFinancialHandling.SUBSCRIPTION_NEXT_PERIOD_ADJUSTMENT
        : PrescriptionReplacementFinancialHandling.SUBSCRIPTION_REVERSE
      : hasPayment
        ? PrescriptionReplacementFinancialHandling.REFUND_REQUIRED
        : PrescriptionReplacementFinancialHandling.CANCEL_UNPAID;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.prescriptionReplacement.findFirst({
        where: {
          originalPrescriptionId: prescription.id,
          status: { in: ['PENDING_FINANCE', 'APPROVED'] },
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('Un remplacement est déjà en cours pour cette ordonnance.');
      }

      const replacement = await tx.prescriptionReplacement.create({
        data: {
          clinicId: consultation.clinicId,
          originalPrescriptionId: prescription.id,
          originalInvoiceId: invoice.id,
          reason,
          requestedPayload: {
            instruction: dto.instruction || null,
            lines: dto.lines.map((line) => ({
              medicationId: line.medicationId,
              dosage: line.dosage || null,
              route: line.route || null,
              frequency: line.frequency || null,
              quantity: line.quantity,
              durationDays: line.durationDays || null,
              notes: line.notes || null,
            })),
            dispensedOriginal: false,
          },
          financialHandling,
          requestedById: actorId!,
        },
      });
      await tx.medicalHistory.create({
        data: {
          patientId: prescription.patientId,
          kind: 'PRESCRIPTION_REPLACEMENT_REQUESTED',
          details: JSON.stringify({
            replacementId: replacement.id,
            originalPrescriptionId: prescription.id,
            originalInvoiceId: invoice.id,
            financialHandling,
            reason,
          }),
          createdById: actorId,
        },
      });
      return replacement;
    });
  }

  async reviewPrescriptionReplacement(
    consultationId: string,
    prescriptionId: string,
    replacementId: string,
    dto: ReviewPrescriptionReplacementDto,
    actorId?: string,
  ) {
    if (!actorId) throw new ForbiddenException('Utilisateur authentifié requis.');
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, clinicId: true, primaryRole: true, status: true, deletedAt: true },
    });
    if (!actor || actor.deletedAt || actor.status !== 'ACTIVE' || !actor.clinicId || !['FINANCE', 'ADMIN', 'SUPER_ADMIN'].includes(String(actor.primaryRole))) {
      throw new ForbiddenException('Une validation finance ou administrative de cet établissement est requise.');
    }

    const reviewed = await this.prisma.$transaction(async (tx) => {
      const replacement = await tx.prescriptionReplacement.findFirst({
        where: {
          id: replacementId,
          clinicId: actor.clinicId,
          originalPrescriptionId: prescriptionId,
          originalPrescription: { consultationId, clinicId: actor.clinicId },
          status: 'PENDING_FINANCE',
        },
        include: { originalInvoice: { include: { payments: { where: { deletedAt: null } } } }, originalPrescription: true },
      });
      if (!replacement) throw new NotFoundException('Demande de remplacement introuvable dans cet établissement.');
      if (replacement.requestedById === actor.id && actor.primaryRole === 'FINANCE') {
        throw new ForbiddenException('La finance ne peut pas valider sa propre demande.');
      }

      const status = dto.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
      const updated = await tx.prescriptionReplacement.update({
        where: { id: replacement.id },
        data: {
          status,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          reviewNote: dto.note?.trim() || null,
        },
      });
      await tx.medicalHistory.create({
        data: {
          patientId: replacement.originalPrescription.patientId,
          kind: 'PRESCRIPTION_REPLACEMENT_REVIEWED',
          details: JSON.stringify({ replacementId: replacement.id, decision: dto.decision, financialHandling: replacement.financialHandling, note: dto.note?.trim() || null }),
          createdById: actor.id,
        },
      });
      return updated;
    });

    if (dto.decision === 'REJECTED') return reviewed;

    const payload = reviewed.requestedPayload as unknown as {
      instruction?: string | null;
      lines?: CreatePrescriptionDto['lines'];
    };
    if (!payload.lines?.length) {
      throw new BadRequestException('La demande approuvée ne contient aucune ligne de remplacement.');
    }

    // Reuse the ordinary prescription path: sale prices, subscription
    // eligibility, tenant checks, workflow transition and durable outbox are
    // therefore identical to a new clinical prescription.
    const created = await this.createPrescription(
      consultationId,
      { instruction: payload.instruction || undefined, lines: payload.lines },
      reviewed.requestedById,
    );

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.prescriptionReplacement.findFirst({
        where: { id: reviewed.id, clinicId: actor.clinicId, status: 'APPROVED' },
        include: { originalInvoice: { include: { payments: { where: { deletedAt: null } } } } },
      });
      if (!current) throw new ConflictException('La demande de remplacement a déjà été finalisée.');

      if (current.financialHandling === PrescriptionReplacementFinancialHandling.CANCEL_UNPAID) {
        await tx.invoice.update({
          where: { id: current.originalInvoiceId },
          data: { status: 'CANCELLED', balanceDue: new Prisma.Decimal(0), remarks: `${current.originalInvoice.remarks || ''}\nAnnulée par remplacement ${current.id}`.trim() },
        });
        await tx.prescription.update({
          where: { id: current.originalPrescriptionId },
          data: { status: 'CANCELLED' },
        });
      }

      if (current.financialHandling === PrescriptionReplacementFinancialHandling.REFUND_REQUIRED) {
        const paid = current.originalInvoice.payments.reduce(
          (sum: Prisma.Decimal, payment: { amount: Prisma.Decimal }) => sum.plus(payment.amount),
          new Prisma.Decimal(0),
        );
        if (paid.gt(0)) {
          await tx.refundRequest.create({
            data: {
              clinicId: actor.clinicId,
              invoiceId: current.originalInvoiceId,
              amount: paid,
              reason: `Remplacement d'ordonnance ${current.id}: ${current.reason}`,
              requestedById: actor.id,
            },
          });
        }
      }

      if (current.financialHandling === PrescriptionReplacementFinancialHandling.SUBSCRIPTION_REVERSE) {
        await tx.subscriptionCharge.updateMany({
          where: {
            sourceInvoiceId: current.originalInvoiceId,
            status: 'PENDING_MONTHLY_INVOICE',
            deletedAt: null,
          },
          data: { status: 'CANCELLED' },
        });
        await tx.invoice.update({
          where: { id: current.originalInvoiceId },
          data: { status: 'CANCELLED', balanceDue: new Prisma.Decimal(0), remarks: `${current.originalInvoice.remarks || ''}\nAnnulée par remplacement ${current.id}`.trim() },
        });
        await tx.prescription.update({ where: { id: current.originalPrescriptionId }, data: { status: 'CANCELLED' } });
      }

      if (current.financialHandling === PrescriptionReplacementFinancialHandling.SUBSCRIPTION_NEXT_PERIOD_ADJUSTMENT) {
        const originalCharge = await tx.subscriptionCharge.findFirst({
          where: {
            sourceInvoiceId: current.originalInvoiceId,
            status: 'INVOICED',
            deletedAt: null,
          },
          select: { companyId: true, employeeId: true, patientId: true, amount: true, monthlyInvoiceId: true },
        });
        if (!originalCharge?.monthlyInvoiceId) {
          throw new ConflictException('La charge entreprise consolidée d’origine est introuvable. Aucune régularisation ne peut être devinée.');
        }
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscription-company:${originalCharge.companyId}`}))`;
        const closedPeriod = await tx.monthlySubscriptionInvoice.findFirst({
          where: { companyId: originalCharge.companyId, invoiceId: originalCharge.monthlyInvoiceId, deletedAt: null },
          select: { month: true, year: true },
        });
        if (!closedPeriod) {
          throw new ConflictException('La période consolidée d’origine est introuvable. Aucune régularisation ne peut être créée.');
        }

        let year = closedPeriod.year;
        let month = closedPeriod.month;
        do {
          month += 1;
          if (month > 12) {
            month = 1;
            year += 1;
          }
        } while (await tx.monthlySubscriptionInvoice.findFirst({
          where: { companyId: originalCharge.companyId, year, month, deletedAt: null },
          select: { id: true },
        }));

        const replacementCharge = await tx.subscriptionCharge.findFirst({
          where: {
            sourceInvoiceId: created.invoice.id,
            companyId: originalCharge.companyId,
            status: 'PENDING_MONTHLY_INVOICE',
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!replacementCharge) {
          throw new ConflictException('La nouvelle ordonnance n’est plus couverte par cette entreprise. Finance doit traiter explicitement l’écart de couverture.');
        }

        // Both sides are placed in the first open period. The original monthly
        // invoice remains untouched while the next statement shows a clear
        // credit and the replacement service separately.
        await tx.subscriptionCharge.update({
          where: { id: replacementCharge.id },
          data: { month, year },
        });
        await tx.subscriptionCharge.create({
          data: {
            companyId: originalCharge.companyId,
            employeeId: originalCharge.employeeId,
            patientId: originalCharge.patientId,
            invoiceId: current.originalInvoiceId,
            label: `Régularisation remplacement ordonnance ${current.originalPrescriptionId}`,
            amount: new Prisma.Decimal(originalCharge.amount).negated(),
            currency: 'CDF',
            serviceDate: new Date(),
            month,
            year,
            prescriptionReplacementId: current.id,
          },
        });
      }

      const completed = await tx.prescriptionReplacement.update({
        where: { id: current.id },
        data: {
          status: 'COMPLETED',
          replacementPrescriptionId: created.prescription.id,
          replacementInvoiceId: created.invoice.id,
        },
      });
      await tx.medicalHistory.create({
        data: {
          patientId: current.originalInvoice.patientId,
          kind: 'PRESCRIPTION_REPLACED',
          details: JSON.stringify({
            replacementId: current.id,
            originalPrescriptionId: current.originalPrescriptionId,
            replacementPrescriptionId: created.prescription.id,
            originalInvoiceId: current.originalInvoiceId,
            replacementInvoiceId: created.invoice.id,
            financialHandling: current.financialHandling,
          }),
          createdById: actor.id,
        },
      });
      return completed;
    });
  }

  async remove(id: string, actorId?: string) {
    const consultation = await this.findOne(id, actorId);
    if (consultation.status === ConsultationStatus.FINALIZED) {
      throw new BadRequestException('Une consultation finalisée est un document médical : elle ne peut pas être supprimée. Créez un avenant ou une annulation motivée.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.consultation.update({
        where: { id },
        data: { status: ConsultationStatus.CANCELLED, deletedAt: new Date(), version: { increment: 1 } },
      });
      await tx.consultationNote.create({
        data: { consultationId: id, authorId: actorId || null, noteType: 'ARCHIVED_BY_ADMIN', content: 'Consultation annulée et archivée administrativement ; aucune donnée clinique n’a été effacée.' },
      });
      await (tx as any).patientVisit.updateMany({
        where: { appointmentId: consultation.appointmentId, status: { in: ['REGISTERED', 'ORIENTED', 'IN_CONSULTATION'] } },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'Consultation annulée et archivée.' },
      });
    });
    return { archived: true };
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
