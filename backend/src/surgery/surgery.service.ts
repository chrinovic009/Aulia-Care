import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClinicContextService } from '../core/clinic-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSurgeryDto } from './dto/create-surgery.dto';
import { UpsertSurgerySafetyChecklistDto } from './dto/upsert-surgery-safety-checklist.dto';

@Injectable()
export class SurgeryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicContext: ClinicContextService,
  ) {}

  private requireClinic(actorId?: string) {
    return this.clinicContext.requireOperationalActor({ userId: actorId });
  }

  async findAll(actorId?: string) {
    const actor = await this.requireClinic(actorId);
    return this.prisma.surgery.findMany({
      where: { deletedAt: null, patient: { clinicId: actor.clinicId } },
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

  async operatingRooms(actorId?: string) {
    const actor = await this.requireClinic(actorId);
    return this.prisma.operatingRoom.findMany({
      where: { clinicId: actor.clinicId, deletedAt: null, active: true },
      include: {
        surgeries: {
          where: { deletedAt: null, patient: { clinicId: actor.clinicId } },
          orderBy: { scheduledAt: 'asc' },
          take: 20,
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(data: CreateSurgeryDto, surgeonId?: string) {
    const actor = await this.requireClinic(surgeonId);
    const consultation = await this.prisma.consultation.findFirst({
      where: {
        id: data.consultationId,
        patientId: data.patientId,
        providerId: actor.id,
        clinicId: actor.clinicId,
        deletedAt: null,
      },
    });
    if (!consultation) {
      throw new ForbiddenException('La consultation source doit appartenir au patient et au médecin connecté.');
    }
    const operatingRoom = await this.prisma.operatingRoom.findFirst({
      where: { id: data.operatingRoomId, clinicId: actor.clinicId, active: true, deletedAt: null },
    });
    if (!operatingRoom) throw new BadRequestException('Salle opératoire indisponible.');
    const scheduledAt = new Date(data.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      throw new BadRequestException('Programmez l’intervention à une date future.');
    }
    if (data.anesthesiologistId) {
      const anesthesiologist = await this.prisma.user.findFirst({
        where: { id: data.anesthesiologistId, clinicId: actor.clinicId, status: 'ACTIVE', deletedAt: null },
        select: { id: true },
      });
      if (!anesthesiologist) throw new BadRequestException('Anesthésiste introuvable dans cet établissement.');
    }
    const twoHours = 2 * 60 * 60 * 1000;
    const conflictingSurgery = await this.prisma.surgery.findFirst({
      where: {
        operatingRoomId: operatingRoom.id,
        deletedAt: null,
        patient: { clinicId: actor.clinicId },
        status: { in: ['PLANNED', 'PREOP', 'IN_PROGRESS'] },
        scheduledAt: {
          gte: new Date(scheduledAt.getTime() - twoHours),
          lte: new Date(scheduledAt.getTime() + twoHours),
        },
      },
    });
    if (conflictingSurgery) {
      throw new BadRequestException('Conflit de créneau : cette salle est déjà réservée dans la fenêtre opératoire de sécurité.');
    }
    return this.prisma.$transaction(async (tx) => {
      const surgery = await tx.surgery.create({
        data: {
          patientId: data.patientId,
          consultationId: consultation.id,
          operatingRoomId: operatingRoom.id,
          surgeonId: actor.id,
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
            clinicId: actor.clinicId,
            procedureName: surgery.procedureName,
            indication: surgery.indication,
            scheduledAt: surgery.scheduledAt,
            operatingRoom: surgery.operatingRoom?.name || null,
          }),
          createdById: actor.id,
        },
      });
      return surgery;
    });
  }

  async findOne(id: string, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const surgery = await this.prisma.surgery.findFirst({
      where: { id, deletedAt: null, patient: { clinicId: actor.clinicId } },
      include: { patient: true, consultation: true, operatingRoom: true, surgeon: true, anesthesiologist: true },
    });
    if (!surgery) throw new NotFoundException('Intervention chirurgicale introuvable dans cet établissement.');
    return surgery;
  }

  async upsertSafetyChecklist(id: string, dto: UpsertSurgerySafetyChecklistDto, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const surgery = await this.findOne(id, actor.id);
    if (surgery.surgeonId !== actor.id) {
      throw new ForbiddenException('Seul le chirurgien responsable peut signer la checklist.');
    }
    const allConfirmed = [
      dto.identityConfirmed,
      dto.procedureSiteConfirmed,
      dto.consentConfirmed,
      dto.anesthesiaCheckDone,
      dto.antibioticProphylaxis,
      dto.imagingAvailable,
    ].every(Boolean);
    if (!allConfirmed) throw new BadRequestException('La checklist OMS Sign In / Time Out doit être complète avant validation.');
    const now = new Date();
    return this.prisma.surgerySafetyChecklist.upsert({
      where: { surgeryId: id },
      create: {
        surgeryId: id,
        ...dto,
        signInAt: now,
        timeOutAt: now,
        signOutAt: dto.instrumentCountCorrect && dto.specimenLabelled ? now : null,
        completedById: actor.id,
      },
      update: {
        ...dto,
        timeOutAt: now,
        signOutAt: dto.instrumentCountCorrect && dto.specimenLabelled ? now : null,
        completedById: actor.id,
      },
    });
  }
}
