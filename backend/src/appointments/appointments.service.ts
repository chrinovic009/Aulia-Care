import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PatientWorkflowStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  private normalizeText(value?: string | null) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private workflowForService(serviceName?: string | null) {
    const name = this.normalizeText(serviceName);
    if (name.includes('laboratoire') || name.includes('labo')) return PatientWorkflowStatus.EN_LABORATOIRE;
    if (name.includes('radio') || name.includes('imagerie') || name.includes('scanner') || name.includes('echographie')) {
      return PatientWorkflowStatus.EN_RADIOLOGIE;
    }
    if (name.includes('pharmacie')) return PatientWorkflowStatus.EN_PHARMACIE;
    return PatientWorkflowStatus.EN_ATTENTE_MEDECIN;
  }

  private async resolveServiceSelection(serviceId?: string | null, serviceUnitId?: string | null) {
    const selectedId = serviceId || serviceUnitId;
    if (!selectedId) return { service: null, serviceUnit: null };

    const serviceUnitById = await this.prisma.serviceUnit.findUnique({
      where: { id: selectedId },
      include: { department: true },
    });
    if (serviceUnitById) {
      const service = await this.prisma.service.findFirst({
        where: { name: { equals: serviceUnitById.name, mode: 'insensitive' } },
        include: { responsables: { where: { actif: true }, include: { user: true } }, staff: { where: { actif: true }, include: { user: true } } },
      } as any);
      return { service, serviceUnit: serviceUnitById };
    }

    const service = await this.prisma.service.findUnique({
      where: { id: selectedId },
      include: { responsables: { where: { actif: true }, include: { user: true } }, staff: { where: { actif: true }, include: { user: true } } },
    });
    if (!service) {
      throw new BadRequestException('Service de destination introuvable.');
    }

    const serviceUnit = await this.prisma.serviceUnit.findFirst({
      where: { name: { equals: service.name, mode: 'insensitive' } },
      include: { department: true },
    });
    return { service, serviceUnit };
  }

  async create(createAppointmentDto: CreateAppointmentDto, actorId?: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: createAppointmentDto.patientId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!patient) throw new NotFoundException('Patient introuvable');

    const { service, serviceUnit } = await this.resolveServiceSelection(
      createAppointmentDto.serviceId,
      createAppointmentDto.serviceUnitId,
    );
    const workflowStatus = this.workflowForService(service?.name || serviceUnit?.name);
    const serviceName = service?.name || serviceUnit?.name || 'Service clinique';
    const scheduledAt = new Date(createAppointmentDto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Date de rendez-vous invalide.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.create({
        data: {
          patientId: createAppointmentDto.patientId,
          requestedById: createAppointmentDto.requestedById || actorId || null,
          serviceUnitId: serviceUnit?.id || null,
          scheduledAt,
          durationMinutes: createAppointmentDto.durationMinutes || 30,
          reason: createAppointmentDto.reason || 'Nouvelle visite',
          status: createAppointmentDto.status || 'SCHEDULED',
        } as any,
        include: { patient: true, serviceUnit: { include: { department: true } } },
      });

      const updatedPatient = await tx.patient.update({
        where: { id: createAppointmentDto.patientId },
        data: {
          workflowStatus,
          ...(service?.id ? { serviceId: service.id } : {}),
        },
        include: { service: true },
      });

      const history = await tx.medicalHistory.create({
        data: {
          patientId: createAppointmentDto.patientId,
          kind: 'NOUVELLE_VISITE',
          createdById: createAppointmentDto.requestedById || actorId || null,
          details: JSON.stringify({
            serviceId: service?.id || null,
            serviceUnitId: serviceUnit?.id || null,
            serviceName,
            scheduledAt: scheduledAt.toISOString(),
            reason: createAppointmentDto.reason || 'Nouvelle visite',
            workflowStatus,
          }),
        },
      });

      const serviceUsers = [
        ...((service as any)?.responsables || []).map((item: any) => item.user).filter(Boolean),
        ...((service as any)?.staff || []).map((item: any) => item.user).filter(Boolean),
      ];
      const uniqueRecipients = Array.from(new Map(serviceUsers.map((user: any) => [user.id, user])).values());
      const notifications = await Promise.all(
        uniqueRecipients.map((user: any) =>
          tx.notification.create({
            data: {
              recipientId: user.id,
              authorId: createAppointmentDto.requestedById || actorId || null,
              patientId: createAppointmentDto.patientId,
              type: 'TASK',
              priority: workflowStatus === PatientWorkflowStatus.EN_LABORATOIRE || workflowStatus === PatientWorkflowStatus.EN_RADIOLOGIE ? 'HIGH' : 'MEDIUM',
              title: 'Nouvelle visite orientee',
              message: `${patient.firstName} ${patient.lastName} est oriente(e) vers ${serviceName}.`,
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
        this.notificationsGateway.notifyToUser(notification.recipientId, 'notification.created', notification);
      }
    });

    return result.appointment;
  }

  findAll() {
    return this.prisma.appointment.findMany({
      include: { patient: true, serviceUnit: true, consultation: { select: { id: true, status: true, createdAt: true } } },
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { patient: true, serviceUnit: true, consultation: { select: { id: true, status: true, createdAt: true } } },
    });
    if (!appointment) {
      throw new NotFoundException('Rendez-vous introuvable');
    }
    return appointment;
  }

  async update(id: string, updateAppointmentDto: UpdateAppointmentDto) {
    await this.findOne(id);
    const data: any = { ...updateAppointmentDto };
    const normalizedStatus = this.normalizeText(String(data.status || ''));
    if (normalizedStatus === 'confirme' || normalizedStatus === 'confirmed') data.status = 'CONFIRMED';
    if (normalizedStatus === 'refuse' || normalizedStatus === 'cancelled' || normalizedStatus === 'canceled') data.status = 'CANCELLED';
    if (normalizedStatus === 'reprogramme' || normalizedStatus === 'scheduled') data.status = 'SCHEDULED';
    if (data.dateRequested && !data.scheduledAt) {
      const scheduledAt = new Date(data.dateRequested);
      if (!Number.isNaN(scheduledAt.getTime())) data.scheduledAt = scheduledAt;
      delete data.dateRequested;
    }
    return this.prisma.appointment.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.appointment.delete({ where: { id } });
    return { deleted: true };
  }
}
