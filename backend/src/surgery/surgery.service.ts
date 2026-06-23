import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SurgeryService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.surgery.findMany({
      where: { deletedAt: null },
      include: {
        patient: true,
        consultation: { include: { provider: true } },
        operatingRoom: true,
        surgeon: true,
        anesthesiologist: true,
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  operatingRooms() {
    return this.prisma.operatingRoom.findMany({
      where: { deletedAt: null, active: true },
      include: { surgeries: { where: { deletedAt: null }, orderBy: { scheduledAt: 'asc' }, take: 20 } },
      orderBy: { name: 'asc' },
    });
  }

  async create(data: any, surgeonId?: string) {
    const created = await this.prisma.$transaction(async (tx) => {
      const surgery = await tx.surgery.create({
        data: {
          patientId: data.patientId,
          consultationId: data.consultationId || null,
          operatingRoomId: data.operatingRoomId || null,
          surgeonId: surgeonId || data.surgeonId || null,
          anesthesiologistId: data.anesthesiologistId || null,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
          procedureName: data.procedureName,
          indication: data.indication,
          status: data.status || 'PLANNED',
          postoperativePlan: data.postoperativePlan || null,
        },
        include: { patient: true, operatingRoom: true, surgeon: true, consultation: true },
      });
      await tx.medicalHistory.create({
        data: {
          patientId: data.patientId,
          kind: 'SURGERY_PLANNED',
          details: JSON.stringify({
            surgeryId: surgery.id,
            procedureName: surgery.procedureName,
            indication: surgery.indication,
            scheduledAt: surgery.scheduledAt,
            operatingRoom: surgery.operatingRoom?.name || null,
          }),
          createdById: surgeonId || null,
        },
      });
      return surgery;
    });
    return created;
  }

  async findOne(id: string) {
    const surgery = await this.prisma.surgery.findUnique({
      where: { id },
      include: { patient: true, consultation: true, operatingRoom: true, surgeon: true, anesthesiologist: true },
    });
    if (!surgery) {
      throw new NotFoundException('Intervention chirurgicale introuvable');
    }
    return surgery;
  }
}
