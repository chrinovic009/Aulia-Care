import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHospitalizationDto } from './dto/create-hospitalization.dto';
import { UpdateHospitalizationDto } from './dto/update-hospitalization.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class HospitalizationsService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  private hospitalizationInclude = {
    patient: true,
    ServiceUnit: { include: { department: true } },
    bed: { include: { room: { include: { serviceUnit: true } } } },
    physician: true,
    nurseInCharge: true,
  } as const;

  async create(createHospitalizationDto: CreateHospitalizationDto) {
    const created = await this.prisma.hospitalization.create({ data: createHospitalizationDto });
    try {
      await this.notifications.createAndEmit({
        title: `Hospitalisation: ${created.id}`,
        body: `Patient hospitalisé`,
        relatedEntity: 'hospitalization',
        relatedId: created.id,
        patientId: created.patientId,
        type: 'SYSTEM',
        priority: 'MEDIUM',
      });
    } catch {}
    return created;
  }

  findAll() {
    return this.prisma.hospitalization.findMany({ include: this.hospitalizationInclude });
  }

  async search(query: string) {
    const normalized = query?.trim();
    if (!normalized) {
      return this.findAll();
    }

    return this.prisma.hospitalization.findMany({
      where: {
        OR: [
          { patient: { firstName: { contains: normalized, mode: 'insensitive' } } },
          { patient: { lastName: { contains: normalized, mode: 'insensitive' } } },
          { patient: { externalId: { contains: normalized, mode: 'insensitive' } } },
          { ServiceUnit: { name: { contains: normalized, mode: 'insensitive' } } },
          { bed: { room: { number: { contains: normalized, mode: 'insensitive' } } } },
          { admissionReason: { contains: normalized, mode: 'insensitive' } },
        ],
      },
      include: this.hospitalizationInclude,
    });
  }

  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const [hospitalized, availableRooms, totalBeds, occupiedBeds, admissionsToday, emergencyAdmissions] = await Promise.all([
      this.prisma.hospitalization.count({ where: { status: { in: ['ADMITTED', 'TRANSFERRED'] } } }),
      this.prisma.room.count({ where: { status: 'AVAILABLE' } }),
      this.prisma.bed.count(),
      this.prisma.bed.count({ where: { status: 'OCCUPIED' } }),
      this.prisma.hospitalization.count({ where: { admittedAt: { gte: today, lt: tomorrow } } }),
      this.prisma.hospitalization.count({
        where: {
          OR: [
            { admissionReason: { contains: 'urgence', mode: 'insensitive' } },
            { ServiceUnit: { name: { contains: 'urgence', mode: 'insensitive' } } },
          ],
        },
      }),
    ]);

    return {
      hospitalized,
      availableRooms,
      capacityRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
      admissionsToday,
      emergencyAdmissions,
      totalBeds,
      occupiedBeds,
    };
  }

  async getRoomInventory() {
    const rooms = await this.prisma.room.findMany({ include: { serviceUnit: true, beds: true } });
    return rooms.map((room) => {
      const totalBeds = room.beds.length;
      const occupiedBeds = room.beds.filter((bed) => bed.status === 'OCCUPIED').length;
      return {
        id: room.id,
        number: room.number,
        service: room.serviceUnit.name,
        totalBeds,
        occupiedBeds,
        availableBeds: totalBeds - occupiedBeds,
        status: room.status,
      };
    });
  }

  async findOne(id: string) {
    const hospitalization = await this.prisma.hospitalization.findUnique({ where: { id }, include: this.hospitalizationInclude });
    if (!hospitalization) {
      throw new NotFoundException('Hospitalisation introuvable');
    }
    return hospitalization;
  }

  async getTimeline(id: string) {
    const events = await this.prisma.notification.findMany({
      where: { relatedEntity: 'hospitalization', relatedId: id },
      orderBy: { sendAt: 'desc' },
    });
    return events.map((event) => ({
      id: event.id,
      date: event.sendAt?.toISOString() ?? event.createdAt.toISOString(),
      event: `${event.title} - ${event.message}`,
      type: event.priority,
    }));
  }

  async update(id: string, updateHospitalizationDto: UpdateHospitalizationDto) {
    await this.findOne(id);
    const updated = await this.prisma.hospitalization.update({ where: { id }, data: updateHospitalizationDto });
    try {
      await this.notifications.createAndEmit({
        title: `Hospitalisation mise à jour: ${updated.id}`,
        body: `Détails modifiés`,
        relatedEntity: 'hospitalization',
        relatedId: updated.id,
        patientId: updated.patientId,
        type: 'SYSTEM',
        priority: 'MEDIUM',
      });
    } catch {}
    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.hospitalization.delete({ where: { id } });
    try {
      await this.notifications.createAndEmit({
        title: `Hospitalisation supprimée`,
        body: `Hospitalisation ${id} supprimée`,
        relatedEntity: 'hospitalization',
        relatedId: id,
        type: 'SYSTEM',
        priority: 'MEDIUM',
      });
    } catch {}
    return { deleted: true };
  }
}
