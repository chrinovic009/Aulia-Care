import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSurgeryDto } from './dto/create-surgery.dto';
import { UpsertSurgerySafetyChecklistDto } from './dto/upsert-surgery-safety-checklist.dto';

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

  async create(data: CreateSurgeryDto, surgeonId?: string) {
    if (!surgeonId) throw new ForbiddenException('Chirurgien authentifié requis.');
    const consultation = await this.prisma.consultation.findUnique({ where: { id: data.consultationId } });
    if (!consultation || consultation.patientId !== data.patientId || consultation.providerId !== surgeonId) {
      throw new ForbiddenException('La consultation source doit appartenir au patient et au médecin connecté.');
    }
    const operatingRoom = await this.prisma.operatingRoom.findUnique({ where: { id: data.operatingRoomId } });
    if (!operatingRoom || !operatingRoom.active || operatingRoom.deletedAt) throw new BadRequestException('Salle opératoire indisponible.');
    const scheduledAt = new Date(data.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) throw new BadRequestException('Programmez l’intervention à une date future.');
    const twoHours = 2 * 60 * 60 * 1000;
    const conflictingSurgery = await this.prisma.surgery.findFirst({
      where: { operatingRoomId: data.operatingRoomId, deletedAt: null, status: { in: ['PLANNED', 'PREOP', 'IN_PROGRESS'] }, scheduledAt: { gte: new Date(scheduledAt.getTime() - twoHours), lte: new Date(scheduledAt.getTime() + twoHours) } },
    });
    if (conflictingSurgery) throw new BadRequestException('Conflit de créneau : cette salle est déjà réservée dans la fenêtre opératoire de sécurité.');
    const created = await this.prisma.$transaction(async (tx) => {
      const surgery = await tx.surgery.create({
        data: {
          patientId: data.patientId,
          consultationId: data.consultationId,
          operatingRoomId: data.operatingRoomId,
          surgeonId,
          anesthesiologistId: data.anesthesiologistId || null,
          scheduledAt,
          procedureName: data.procedureName,
          indication: data.indication,
          status: 'PLANNED',
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

  async upsertSafetyChecklist(id: string, dto: UpsertSurgerySafetyChecklistDto, actorId?: string) {
    const surgery = await this.findOne(id);
    if (!actorId || surgery.surgeonId !== actorId) throw new ForbiddenException('Seul le chirurgien responsable peut signer la checklist.');
    const allConfirmed = [dto.identityConfirmed, dto.procedureSiteConfirmed, dto.consentConfirmed, dto.anesthesiaCheckDone, dto.antibioticProphylaxis, dto.imagingAvailable].every(Boolean);
    if (!allConfirmed) throw new BadRequestException('La checklist OMS Sign In / Time Out doit être complète avant validation.');
    const now = new Date();
    return this.prisma.surgerySafetyChecklist.upsert({
      where: { surgeryId: id },
      create: { surgeryId: id, ...dto, signInAt: now, timeOutAt: now, signOutAt: dto.instrumentCountCorrect && dto.specimenLabelled ? now : null, completedById: actorId },
      update: { ...dto, timeOutAt: now, signOutAt: dto.instrumentCountCorrect && dto.specimenLabelled ? now : null, completedById: actorId },
    });
  }
}
