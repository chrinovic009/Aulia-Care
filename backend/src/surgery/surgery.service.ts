import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClinicContextService } from '../core/clinic-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../core/public-user-select';
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
        consultation: { include: { provider: { select: PUBLIC_USER_SELECT } } },
        operatingRoom: true,
        surgeon: { select: PUBLIC_USER_SELECT },
        anesthesiologist: { select: PUBLIC_USER_SELECT },
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
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`surgery-schedule:${actor.clinicId}`}))`);
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`patient-workflow:${actor.clinicId}:${data.patientId}`}))`);
      const reservations = await tx.surgery.findMany({ where: { deletedAt: null, patient: { clinicId: actor.clinicId }, status: { in: ['PLANNED', 'PREOP', 'IN_PROGRESS'] }, OR: [{ operatingRoomId: operatingRoom.id }, { surgeonId: actor.id }, ...(data.anesthesiologistId ? [{ anesthesiologistId: data.anesthesiologistId }] : [])] } });
      for (const reservation of reservations) {
        if (!reservation.scheduledAt) continue;
        const link = await tx.careEvent.findFirst({ where: { clinicId: actor.clinicId, type: 'SURGERY_SCHEDULED', payload: { path: ['surgeryId'], equals: reservation.id } } });
        const duration = Number((link?.payload as { durationMinutes?: number } | null)?.durationMinutes ?? 120);
        if (reservation.scheduledAt.getTime() < scheduledAt.getTime() + 120 * 60_000 && scheduledAt.getTime() < reservation.scheduledAt.getTime() + duration * 60_000) throw new BadRequestException('Conflit de créneau : salle ou professionnel déjà réservé.');
      }
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
        include: { patient: true, operatingRoom: true, surgeon: { select: PUBLIC_USER_SELECT }, consultation: true },
      });
      const unit = await tx.careUnit.findFirst({ where: { clinicId: actor.clinicId, kind: 'SURGERY', active: true, assignments: { some: { userId: actor.id, active: true, startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }], unitRole: { in: ['MEMBER', 'LEAD'] } } } } });
      if (unit) {
        const existingEpisode = await tx.careEpisode.findFirst({ where: { clinicId: actor.clinicId, careUnitId: unit.id, patientId: data.patientId, status: { in: ['PLANNED', 'IN_PROGRESS', 'ON_HOLD'] } } });
        if (existingEpisode) throw new BadRequestException('Ce patient a déjà une prise en charge chirurgicale ouverte.');
        const episode = await tx.careEpisode.create({ data: { clinicId: actor.clinicId, patientId: data.patientId, careUnitId: unit.id, status: 'PLANNED', stage: 'SCHEDULED', plannedAt: scheduledAt, responsibleUserId: actor.id, createdById: actor.id, reason: data.procedureName } });
        await tx.careEvent.create({ data: { clinicId: actor.clinicId, careUnitId: unit.id, patientId: data.patientId, episodeId: episode.id, type: 'SURGERY_SCHEDULED', occurredAt: new Date(), summary: `Programmé : ${data.procedureName}`, authorId: actor.id, authorRole: actor.primaryRole ?? 'PHYSICIAN', payload: { operationId: randomUUID(), surgeryId: surgery.id, operatingRoomId: operatingRoom.id, procedure: data.procedureName, room: operatingRoom.name, surgeonId: actor.id, surgeon: actor.id, start: scheduledAt.toISOString(), durationMinutes: 120 } } });
      }
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
      include: { patient: true, consultation: true, operatingRoom: true, surgeon: { select: PUBLIC_USER_SELECT }, anesthesiologist: { select: PUBLIC_USER_SELECT } },
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
