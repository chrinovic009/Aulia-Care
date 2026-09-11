import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  AuditAction,
  PatientWorkflowStatus,
  Prisma,
  RoleSlug,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { CreateOwnAppointmentDto } from './dto/create-own-appointment.dto';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import {
  AuthenticatedActor,
  ClinicContextService,
  OperationalClinicActor,
} from '../core/clinic-context.service';
import { PatientWorkflowService } from '../core/patient-workflow.service';

const serviceUserSelect = {
  id: true,
  displayName: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

const APPOINTMENT_INITIAL_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
];
const APPOINTMENT_RECEPTION_CLOSED_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.COMPLETED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];
const APPOINTMENT_RECEPTION_ALLOWED_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.CANCELLED,
];

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly clinicContext: ClinicContextService,
    private readonly patientWorkflow: PatientWorkflowService,
  ) {}

  private requireClinic(actorId?: string): Promise<OperationalClinicActor> {
    return this.clinicContext.requireOperationalActor({ userId: actorId });
  }

  /** A portal account schedules only for its explicitly linked patient record. */
  private async requireAppointmentActor(
    actorId: string | undefined,
    patientId: string,
  ): Promise<OperationalClinicActor> {
    if (!actorId) {
      throw new ForbiddenException('Utilisateur authentifié requis.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, primaryRole: true, status: true, deletedAt: true },
    });
    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new ForbiddenException('Compte actif requis.');
    }
    if (user.primaryRole !== RoleSlug.PATIENT) {
      return this.requireClinic(actorId);
    }

    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        portalUserId: user.id,
        clinicId: { not: null },
        deletedAt: null,
      },
      select: { clinicId: true },
    });
    if (!patient?.clinicId) {
      throw new ForbiddenException(
        'Le portail patient ne peut créer un rendez-vous que pour son propre dossier.',
      );
    }
    return { id: user.id, clinicId: patient.clinicId, primaryRole: user.primaryRole };
  }

  private normalizeText(value?: string | null) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private workflowForService(serviceName?: string | null) {
    const name = this.normalizeText(serviceName);
    if (name.includes('laboratoire') || name.includes('labo')) {
      return PatientWorkflowStatus.EN_LABORATOIRE;
    }
    if (
      name.includes('radio') ||
      name.includes('imagerie') ||
      name.includes('scanner') ||
      name.includes('echographie')
    ) {
      return PatientWorkflowStatus.EN_RADIOLOGIE;
    }
    if (name.includes('pharmacie')) return PatientWorkflowStatus.EN_PHARMACIE;
    return PatientWorkflowStatus.EN_ATTENTE_MEDECIN;
  }

  private async syncPatientWorkflowFromAppointments(
    tx: Prisma.TransactionClient,
    patientId: string,
    clinicId: string,
    fallbackStatus?: PatientWorkflowStatus,
  ) {
    const patient = await tx.patient.findFirst({
      where: { id: patientId, clinicId, deletedAt: null },
      select: { workflowStatus: true },
    });
    if (!patient) return;

    const activeAppointment = await tx.appointment.findFirst({
      where: {
        patientId,
        clinicId,
        deletedAt: null,
        status: {
          in: [
            AppointmentStatus.SCHEDULED,
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.CHECKED_IN,
          ],
        },
      },
      orderBy: { scheduledAt: 'asc' },
      include: { serviceUnit: { select: { name: true } } },
    });

    const nextStatus = activeAppointment
      ? this.workflowForService(activeAppointment.serviceUnit?.name)
      : fallbackStatus;
    if (!nextStatus || nextStatus === patient.workflowStatus) return;

    await this.patientWorkflow.transition(tx, patientId, nextStatus, clinicId);
  }

  private isAdministrativeDestination(
    name?: string | null,
    department?: { type?: string | null; name?: string | null } | null,
  ) {
    const normalized = this.normalizeText(name).replace(/[^a-z0-9]/g, '');
    const departmentName = this.normalizeText(department?.name);
    return (
      department?.type === 'ADMINISTRATION' ||
      departmentName.includes('administration') ||
      [
        'reception',
        'accueil',
        'caisse',
        'cashier',
        'finance',
        'comptabilite',
        'secretariat',
        'gestion',
      ].some((keyword) => normalized.includes(keyword))
    );
  }

  private serviceInclude(clinicId: string) {
    return Prisma.validator<Prisma.ServiceInclude>()({
      responsables: {
        where: {
          actif: true,
          user: { clinicId, status: 'ACTIVE', deletedAt: null },
        },
        select: { user: { select: serviceUserSelect } },
      },
      staff: {
        where: {
          actif: true,
          user: { clinicId, status: 'ACTIVE', deletedAt: null },
        },
        select: { user: { select: serviceUserSelect } },
      },
    });
  }

  private async resolveServiceSelection(
    clinicId: string,
    serviceId?: string | null,
    serviceUnitId?: string | null,
  ) {
    const selectedId = serviceId || serviceUnitId;
    if (!selectedId) return { service: null, serviceUnit: null };

    const serviceUnitById = await this.prisma.serviceUnit.findFirst({
      where: { id: selectedId, clinicId, deletedAt: null, active: true },
      include: { department: true },
    });
    if (serviceUnitById) {
      if (
        this.isAdministrativeDestination(
          serviceUnitById.name,
          serviceUnitById.department,
        )
      ) {
        throw new BadRequestException(
          'Une unité administrative ne peut pas être sélectionnée pour un rendez-vous patient.',
        );
      }
      const service = await this.prisma.service.findFirst({
        where: {
          clinicId,
          active: true,
          name: { equals: serviceUnitById.name, mode: 'insensitive' },
        },
        include: this.serviceInclude(clinicId),
      });
      return { service, serviceUnit: serviceUnitById };
    }

    const service = await this.prisma.service.findFirst({
      where: { id: selectedId, clinicId, active: true },
      include: this.serviceInclude(clinicId),
    });
    if (!service) {
      throw new BadRequestException('Service de destination introuvable.');
    }

    const serviceUnit = await this.prisma.serviceUnit.findFirst({
      where: {
        clinicId,
        name: { equals: service.name, mode: 'insensitive' },
        deletedAt: null,
        active: true,
      },
      include: { department: true },
    });
    if (this.isAdministrativeDestination(service.name, serviceUnit?.department)) {
      throw new BadRequestException(
        'Un service administratif ne peut pas être sélectionné pour un rendez-vous patient.',
      );
    }
    return { service, serviceUnit };
  }

  async getBookingOptions(userId?: string) {
    if (!userId) throw new ForbiddenException('Compte patient non authentifié.');
    const patient = await this.prisma.patient.findFirst({
      where: { portalUserId: userId, deletedAt: null, clinicId: { not: null } },
      select: { clinicId: true },
    });
    if (!patient?.clinicId) {
      throw new ForbiddenException('Compte patient non rattaché à un établissement.');
    }
    const services = await this.prisma.service.findMany({
      where: { clinicId: patient.clinicId, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true, isParamedical: true },
    });
    const units = await this.prisma.serviceUnit.findMany({
      where: {
        clinicId: patient.clinicId,
        deletedAt: null,
        active: true,
        name: { in: services.map((service) => service.name) },
      },
      include: { department: true },
    });
    return services.filter((service) => {
      const unit = units.find(
        (item) => this.normalizeText(item.name) === this.normalizeText(service.name),
      );
      return !this.isAdministrativeDestination(service.name, unit?.department);
    });
  }

  async createOwn(dto: CreateOwnAppointmentDto, userId?: string) {
    if (!userId) throw new ForbiddenException('Compte patient non authentifié.');
    const patient = await this.prisma.patient.findFirst({
      where: { portalUserId: userId, deletedAt: null, clinicId: { not: null } },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('Fiche patient introuvable pour ce compte.');
    }
    return this.create(
      {
        patientId: patient.id,
        serviceId: dto.serviceId,
        scheduledAt: dto.scheduledAt,
        durationMinutes: dto.durationMinutes,
        reason: dto.reason?.trim() || 'Demande de rendez-vous patient',
        status: AppointmentStatus.SCHEDULED,
      },
      userId,
    );
  }

  private async assertNoServiceUnitCollision(
    prisma: PrismaService | Prisma.TransactionClient,
    clinicId: string,
    serviceUnitId: string | null | undefined,
    scheduledAt: Date,
    durationMinutes: number,
    excludeAppointmentId?: string,
  ) {
    if (!serviceUnitId) return;
    await prisma.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`appointments:${clinicId}:${serviceUnitId}`}))`,
    );
    const windowStart = new Date(scheduledAt.getTime() - 8 * 60 * 60 * 1000);
    const windowEnd = new Date(scheduledAt.getTime() + durationMinutes * 60 * 1000);
    const candidates = await prisma.appointment.findMany({
      where: {
        clinicId,
        serviceUnitId,
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        status: {
          in: [
            AppointmentStatus.SCHEDULED,
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.CHECKED_IN,
          ],
        },
        scheduledAt: { gte: windowStart, lt: windowEnd },
        deletedAt: null,
      },
      select: { id: true, scheduledAt: true, durationMinutes: true },
    });
    const collision = candidates.some((item) => {
      const existingStart = item.scheduledAt.getTime();
      const existingEnd = existingStart + item.durationMinutes * 60 * 1000;
      return existingStart < windowEnd.getTime() && scheduledAt.getTime() < existingEnd;
    });
    if (collision) {
      throw new BadRequestException(
        'Ce créneau est déjà occupé dans le service de destination.',
      );
    }
  }

  async create(createAppointmentDto: CreateAppointmentDto, actorId?: string) {
    const actor = await this.requireAppointmentActor(actorId, createAppointmentDto.patientId);
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: createAppointmentDto.patientId,
        clinicId: actor.clinicId,
        deletedAt: null,
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!patient) {
      throw new NotFoundException('Patient introuvable dans cet établissement.');
    }

    const { service, serviceUnit } = await this.resolveServiceSelection(
      actor.clinicId,
      createAppointmentDto.serviceId,
      createAppointmentDto.serviceUnitId,
    );
    const workflowStatus = this.workflowForService(service?.name || serviceUnit?.name);
    const serviceName = service?.name || serviceUnit?.name || 'Service clinique';
    const scheduledAt = new Date(createAppointmentDto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Date de rendez-vous invalide.');
    }
    const durationMinutes = createAppointmentDto.durationMinutes || 30;
    const initialStatus = createAppointmentDto.status || AppointmentStatus.SCHEDULED;
    if (
      !APPOINTMENT_INITIAL_STATUSES.includes(initialStatus)
    ) {
      throw new BadRequestException('Statut initial de rendez-vous non autorisé.');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      await this.assertNoServiceUnitCollision(
        tx,
        actor.clinicId,
        serviceUnit?.id,
        scheduledAt,
        durationMinutes,
      );
      const appointment = await tx.appointment.create({
        data: {
          patientId: patient.id,
          requestedById: actor.id,
          serviceUnitId: serviceUnit?.id || null,
          clinicId: actor.clinicId,
          scheduledAt,
          durationMinutes,
          reason: createAppointmentDto.reason?.trim() || 'Nouvelle visite',
          status: initialStatus,
        } satisfies Prisma.AppointmentUncheckedCreateInput,
        include: { patient: true, serviceUnit: { include: { department: true } } },
      });
      const patientMutation = await tx.patient.updateMany({
        where: { id: patient.id, clinicId: actor.clinicId, deletedAt: null },
        data: {
          workflowStatus,
          ...(service?.id ? { serviceId: service.id } : {}),
        },
      });
      if (patientMutation.count !== 1) {
        throw new NotFoundException('Patient introuvable dans cet établissement.');
      }
      const updatedPatient = await tx.patient.findFirstOrThrow({
        where: { id: patient.id, clinicId: actor.clinicId, deletedAt: null },
        include: { service: true },
      });
      const history = await tx.medicalHistory.create({
        data: {
          patientId: patient.id,
          kind: 'NOUVELLE_VISITE',
          createdById: actor.id,
          details: JSON.stringify({
            serviceId: service?.id || null,
            serviceUnitId: serviceUnit?.id || null,
            serviceName,
            scheduledAt: scheduledAt.toISOString(),
            reason: createAppointmentDto.reason?.trim() || 'Nouvelle visite',
            workflowStatus,
          }),
        },
      });
      await tx.patientVisit.create({
        data: {
          patientId: patient.id,
          receptionistId: actor.id,
          clinicId: actor.clinicId,
          appointmentId: appointment.id,
          serviceId: service?.id || null,
          visitType: 'RENDEZ_VOUS',
          reason: createAppointmentDto.reason?.trim() || 'Nouvelle visite',
          status: 'REGISTERED',
          arrivedAt: scheduledAt,
          metadata: { appointmentStatus: appointment.status },
        } satisfies Prisma.PatientVisitUncheckedCreateInput,
      });

      const serviceUsers = service
        ? [
            ...service.responsables.map((item) => item.user),
            ...service.staff.map((item) => item.user),
          ]
        : [];
      const uniqueRecipients = Array.from(
        new Map(serviceUsers.map((user) => [user.id, user])).values(),
      );
      const notifications = await Promise.all(
        uniqueRecipients.map((user) =>
          tx.notification.create({
            data: {
              recipientId: user.id,
              authorId: actor.id,
              patientId: patient.id,
              type: 'TASK',
              priority:
                workflowStatus === PatientWorkflowStatus.EN_LABORATOIRE ||
                workflowStatus === PatientWorkflowStatus.EN_RADIOLOGIE
                  ? 'HIGH'
                  : 'MEDIUM',
              title: 'Nouvelle visite orientée',
              message: `${patient.firstName} ${patient.lastName} est orienté(e) vers ${serviceName}.`,
              relatedEntity: 'Appointment',
              relatedId: appointment.id,
            },
          }),
        ),
      );
      return { appointment, updatedPatient, history, notifications };
    });

    this.notificationsGateway.notify('appointment.created', result.appointment);
    this.notificationsGateway.notify('patient.updated', result.updatedPatient);
    this.notificationsGateway.notify('medical-history.created', result.history);
    result.notifications.forEach((notification) => {
      if (notification.recipientId) {
        this.notificationsGateway.notifyToUser(
          notification.recipientId,
          'notification.created',
          notification,
        );
      }
    });
    return result.appointment;
  }

  async findAll(actorId?: string) {
    const actor = await this.requireClinic(actorId);
    return this.prisma.appointment.findMany({
      where: { clinicId: actor.clinicId, deletedAt: null },
      include: {
        patient: true,
        serviceUnit: true,
        consultation: { select: { id: true, status: true, createdAt: true } },
      },
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async findOne(id: string, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, clinicId: actor.clinicId, deletedAt: null },
      include: {
        patient: true,
        serviceUnit: true,
        consultation: { select: { id: true, status: true, createdAt: true } },
      },
    });
    if (!appointment) {
      throw new NotFoundException('Rendez-vous introuvable dans cet établissement.');
    }
    return appointment;
  }

  async update(
    id: string,
    updateAppointmentDto: UpdateAppointmentDto,
    currentUser?: AuthenticatedActor,
  ) {
    const actor = await this.requireClinic(currentUser?.userId || currentUser?.id);
    const existing = await this.findOne(id, actor.id);
    const isReceptionist = actor.primaryRole === RoleSlug.RECEPTIONIST;
    if (
      isReceptionist &&
      APPOINTMENT_RECEPTION_CLOSED_STATUSES.includes(existing.status)
    ) {
      throw new ForbiddenException(
        'Un rendez-vous clôturé, annulé ou absent ne peut plus être modifié par la réception.',
      );
    }

    const data: Prisma.AppointmentUncheckedUpdateInput = {};
    if (updateAppointmentDto.patientId) {
      if (isReceptionist) {
        throw new ForbiddenException('La réception ne peut pas changer le patient d’un rendez-vous.');
      }
      const nextPatient = await this.prisma.patient.findFirst({
        where: {
          id: updateAppointmentDto.patientId,
          clinicId: actor.clinicId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!nextPatient) {
        throw new NotFoundException('Patient introuvable dans cet établissement.');
      }
      data.patientId = nextPatient.id;
    }

    let selectedServiceName: string | null = null;
    if (updateAppointmentDto.serviceId || updateAppointmentDto.serviceUnitId) {
      const { service, serviceUnit } = await this.resolveServiceSelection(
        actor.clinicId,
        updateAppointmentDto.serviceId,
        updateAppointmentDto.serviceUnitId,
      );
      data.serviceUnitId = serviceUnit?.id || null;
      selectedServiceName = service?.name || serviceUnit?.name || null;
    }
    if (updateAppointmentDto.scheduledAt) {
      const scheduledAt = new Date(updateAppointmentDto.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new BadRequestException('Date de rendez-vous invalide.');
      }
      data.scheduledAt = scheduledAt;
    }
    if (updateAppointmentDto.durationMinutes !== undefined) {
      data.durationMinutes = updateAppointmentDto.durationMinutes;
    }
    if (updateAppointmentDto.reason !== undefined) {
      data.reason = updateAppointmentDto.reason.trim() || null;
    }
    if (updateAppointmentDto.statusReason !== undefined) {
      data.statusReason = updateAppointmentDto.statusReason.trim() || null;
    }
    if (updateAppointmentDto.status) {
      const status = updateAppointmentDto.status;
      if (
        isReceptionist &&
        !APPOINTMENT_RECEPTION_ALLOWED_STATUSES.includes(status)
      ) {
        throw new ForbiddenException('Transition de rendez-vous non autorisée pour la réception.');
      }
      data.status = status;
    }
    if (data.status === AppointmentStatus.CANCELLED) {
      if (!data.statusReason) {
        throw new BadRequestException(
          'Un motif est obligatoire pour annuler ou refuser un rendez-vous.',
        );
      }
      data.cancelledAt = new Date();
      data.cancelledById = actor.id;
    }
    if (Object.keys(data).length === 0) {
      throw new ForbiddenException('Modification de rendez-vous non autorisée.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (
        data.scheduledAt ||
        data.durationMinutes !== undefined ||
        data.serviceUnitId !== undefined
      ) {
        await this.assertNoServiceUnitCollision(
          tx,
          actor.clinicId,
          typeof data.serviceUnitId === 'string' ? data.serviceUnitId : existing.serviceUnitId,
          data.scheduledAt instanceof Date ? data.scheduledAt : existing.scheduledAt,
          typeof data.durationMinutes === 'number'
            ? data.durationMinutes
            : existing.durationMinutes,
          id,
        );
      }
      const mutation = await tx.appointment.updateMany({
        where: { id, clinicId: actor.clinicId, deletedAt: null },
        data,
      });
      if (mutation.count !== 1) {
        throw new NotFoundException('Rendez-vous introuvable dans cet établissement.');
      }
      if (data.status === AppointmentStatus.CANCELLED) {
        await tx.patientVisit.updateMany({
          where: { appointmentId: id, clinicId: actor.clinicId },
          data: {
            status: 'CANCELLED',
            cancelledAt: data.cancelledAt as Date,
            cancellationReason: data.statusReason as string,
          },
        });
      }
      const appointment = await tx.appointment.findFirstOrThrow({
        where: { id, clinicId: actor.clinicId, deletedAt: null },
      });
      const cancellationFallback =
        appointment.status === AppointmentStatus.CANCELLED
          ? PatientWorkflowStatus.ANNULE
          : undefined;
      await this.syncPatientWorkflowFromAppointments(
        tx,
        appointment.patientId,
        actor.clinicId,
        cancellationFallback,
      );
      if (existing.patientId !== appointment.patientId) {
        await this.syncPatientWorkflowFromAppointments(tx, existing.patientId, actor.clinicId);
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          patientId: appointment.patientId,
          action: AuditAction.UPDATE,
          entity: 'Appointment',
          entityId: id,
          summary: 'Rendez-vous modifié.',
          metadata: {
            fields: Object.keys(data),
            beforeStatus: existing.status,
            afterStatus: appointment.status,
            service: selectedServiceName,
          },
        },
      });
      return appointment;
    });
    this.notificationsGateway.notify('appointment.updated', updated);
    return updated;
  }

  async remove(id: string, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const deleted = await this.prisma.appointment.deleteMany({
      where: { id, clinicId: actor.clinicId, deletedAt: null },
    });
    if (deleted.count !== 1) {
      throw new NotFoundException('Rendez-vous introuvable dans cet établissement.');
    }
    return { deleted: true };
  }
}
