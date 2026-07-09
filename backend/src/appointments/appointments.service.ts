import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  create(createAppointmentDto: CreateAppointmentDto) {
    const data: any = { ...(createAppointmentDto as any) };
    if (typeof data.scheduledAt === 'string') {
      const dt = new Date(data.scheduledAt);
      if (!isNaN(dt.getTime())) data.scheduledAt = dt;
    }

    // Defensive checks: ensure referenced foreign keys exist to return clearer errors
    return (async () => {
      // log incoming payload for debugging (temporary)
      try { console.debug('Creating appointment with payload:', { ...data, scheduledAt: data.scheduledAt }); } catch (e) {}

      // patient must exist
      const patient = await this.prisma.patient.findUnique({ where: { id: data.patientId } });
      if (!patient) throw new NotFoundException(`Patient not found: ${data.patientId}`);

      // if requestedById provided, ensure user exists
      if (data.requestedById) {
        const user = await this.prisma.user.findUnique({ where: { id: data.requestedById } });
        if (!user) throw new NotFoundException(`RequestedBy user not found: ${data.requestedById}`);
      }

      // if serviceUnitId provided, ensure service unit exists
      if (data.serviceUnitId) {
        const svc = await this.prisma.serviceUnit.findUnique({ where: { id: data.serviceUnitId } });
        if (!svc) throw new NotFoundException(`ServiceUnit not found: ${data.serviceUnitId}`);
      }

      const created = await this.prisma.appointment.create({ data });

      // If caller requested a recipient (selected personnel), create a notification so they get the patient
      try {
        if (data.recipientId) {
          await this.notifications.createAndEmit({
            recipientId: data.recipientId,
            title: 'Nouveau rendez-vous',
            body: `Vous avez un nouveau rendez-vous pour le patient ${patient.firstName || patient.name || patient.id}`,
            data: { patientId: data.patientId, appointmentId: created.id },
          });
        }
      } catch (e) {
        // ignore notification errors
      }

      return created;
    })();
  }

  findAll() {
    return this.prisma.appointment.findMany({ include: { patient: true, serviceUnit: true } });
  }

  async findOne(id: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id }, include: { patient: true, serviceUnit: true } });
    if (!appointment) {
      throw new NotFoundException('Rendez-vous introuvable');
    }
    return appointment;
  }

  async update(id: string, updateAppointmentDto: UpdateAppointmentDto) {
    await this.findOne(id);
    return this.prisma.appointment.update({
      where: { id },
      data: updateAppointmentDto as any,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.appointment.delete({ where: { id } });
    return { deleted: true };
  }
}
