import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHospitalizationDto } from './dto/create-hospitalization.dto';
import { UpdateHospitalizationDto } from './dto/update-hospitalization.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class HospitalizationsService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  async create(createHospitalizationDto: CreateHospitalizationDto) {
    const created = await this.prisma.hospitalization.create({ data: createHospitalizationDto });
    try {
      await this.notifications.createAndEmit({
        title: `Hospitalisation: ${created.id}`,
        body: `Patient hospitalisé`,
        meta: { hospitalizationId: created.id, patientId: created.patientId },
      });
    } catch {}
    return created;
  }

  findAll() {
    return this.prisma.hospitalization.findMany({ include: { patient: true, serviceUnit: true } });
  }

  async findOne(id: string) {
    const hospitalization = await this.prisma.hospitalization.findUnique({ where: { id }, include: { patient: true, serviceUnit: true } });
    if (!hospitalization) {
      throw new NotFoundException('Hospitalisation introuvable');
    }
    return hospitalization;
  }

  async update(id: string, updateHospitalizationDto: UpdateHospitalizationDto) {
    await this.findOne(id);
    const updated = await this.prisma.hospitalization.update({ where: { id }, data: updateHospitalizationDto });
    try {
      await this.notifications.createAndEmit({
        title: `Hospitalisation mise à jour: ${updated.id}`,
        body: `Détails modifiés`,
        meta: { hospitalizationId: updated.id, patientId: updated.patientId },
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
        meta: { hospitalizationId: id },
      });
    } catch {}
    return { deleted: true };
  }
}
