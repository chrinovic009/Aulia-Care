import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PatientWorkflowStatus } from '@prisma/client';
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
    Consultation: {
      include: {
        provider: true,
        prescriptions: { include: { lineItems: { include: { medication: true } } } },
        labRequests: { include: { results: true } },
      },
    },
  } as const;

  private async activeShiftForUser(userId?: string | null, serviceUnitId?: string | null) {
    if (!userId) return null;
    const now = new Date();
    return this.prisma.shift.findFirst({
      where: {
        startAt: { lte: now },
        endAt: { gte: now },
        employee: {
          userId,
          status: 'ACTIVE',
          ...(serviceUnitId ? { serviceUnitId } : {}),
        },
      },
      include: { employee: { include: { user: true, serviceUnit: true } } },
      orderBy: { startAt: 'desc' },
    });
  }

  private async buildNurseAccess(hospitalization: any, userId?: string | null) {
    if (!userId) {
      return { mode: 'READ_ONLY', canWrite: false, reason: 'Utilisateur non identifie' };
    }

    const [assignedShift, currentShift] = await Promise.all([
      this.activeShiftForUser(hospitalization.nurseInChargeId, hospitalization.serviceUnitId),
      this.activeShiftForUser(userId, hospitalization.serviceUnitId),
    ]);

    if (hospitalization.nurseInChargeId === userId) {
      if (!currentShift) {
        return { mode: 'READ_ONLY', canWrite: false, reason: 'Votre shift actif n est pas ouvert' };
      }
      return { mode: 'WRITE', canWrite: true, reason: 'Infirmier responsable en shift actif' };
    }

    if (!assignedShift && currentShift) {
      return { mode: 'WRITE', canWrite: true, reason: 'Relai automatique: responsable hors shift' };
    }

    return { mode: 'READ_ONLY', canWrite: false, reason: 'Lecture clinique autorisee' };
  }

  async create(createHospitalizationDto: CreateHospitalizationDto) {
    const created = await this.prisma.$transaction(async (tx) => {
      const hospitalization = await tx.hospitalization.create({ data: createHospitalizationDto as any });
      await tx.patient.update({
        where: { id: createHospitalizationDto.patientId },
        data: { workflowStatus: PatientWorkflowStatus.HOSPITALISE },
      });
      await tx.medicalHistory.create({
        data: {
          patientId: createHospitalizationDto.patientId,
          kind: 'HOSPITALIZATION_DECLARED',
          details: JSON.stringify({
            hospitalizationId: hospitalization.id,
            admissionReason: createHospitalizationDto.admissionReason,
            bedNumber: createHospitalizationDto.bedNumber || null,
            serviceUnitId: createHospitalizationDto.serviceUnitId || null,
            physicianId: createHospitalizationDto.physicianId || null,
            nurseInChargeId: createHospitalizationDto.nurseInChargeId || null,
          }),
          createdById: createHospitalizationDto.physicianId || createHospitalizationDto.nurseInChargeId || null,
        },
      });
      return hospitalization;
    });
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

  async getNurseHospitalizations(userId?: string) {
    const hospitalizations = await this.prisma.hospitalization.findMany({
      where: { status: { in: ['ADMITTED', 'TRANSFERRED'] } },
      include: {
        ...this.hospitalizationInclude,
        patient: {
          include: {
            vitalSigns: { orderBy: { recordedAt: 'desc' }, take: 20, include: { recordedBy: true } },
            medicalHistories: { orderBy: { eventDate: 'desc' }, take: 50, include: { createdBy: true } },
          },
        },
      },
      orderBy: { admittedAt: 'desc' },
    });

    const hospitalizationsWithAccess = await Promise.all(
      hospitalizations.map(async (hospitalization) => ({
        hospitalization,
        access: await this.buildNurseAccess(hospitalization, userId),
      })),
    );

    return hospitalizationsWithAccess
      .filter(({ hospitalization, access }) => access.canWrite || hospitalization.nurseInChargeId === userId)
      .map(({ hospitalization, access }) => ({
        ...hospitalization,
        access,
      }));
  }

  async getNurseRounds(userId?: string) {
    const hospitalizations = await this.getNurseHospitalizations(userId);
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);

    return hospitalizations.map((hospitalization: any) => {
      const histories = hospitalization.patient?.medicalHistories || [];
      const latestRound = histories.find((history) => ['NURSE_ROUND_DONE', 'NURSE_OBSERVATION', 'NURSE_PROBLEM'].includes(history.kind));
      const roundDoneToday = histories.some((history) => history.kind === 'NURSE_ROUND_DONE' && new Date(history.eventDate).toISOString().slice(0, 10) === todayKey);
      const problemToday = histories.some((history) => history.kind === 'NURSE_PROBLEM' && new Date(history.eventDate).toISOString().slice(0, 10) === todayKey);
      const scheduledAt = hospitalization.admittedAt || now;
      const overdue = !roundDoneToday && new Date(scheduledAt).getTime() + 4 * 60 * 60 * 1000 < now.getTime();

      return {
        id: hospitalization.id,
        hospitalizationId: hospitalization.id,
        patientId: hospitalization.patientId,
        scheduledAt,
        patient: [hospitalization.patient?.firstName, hospitalization.patient?.middleName, hospitalization.patient?.lastName].filter(Boolean).join(' ') || 'Patient',
        room: hospitalization.bed?.room?.number || hospitalization.bedNumber || 'Non assigne',
        bed: hospitalization.bed?.code || hospitalization.bedNumber || null,
        type: 'Tournee infirmiere hospitalisation',
        priority: problemToday || /urgence|critique|critical/i.test(hospitalization.admissionReason || '') ? 'High' : 'Normal',
        status: roundDoneToday ? 'Termine' : overdue ? 'En retard' : 'A faire',
        note: latestRound?.details || hospitalization.admissionReason || null,
        service: hospitalization.ServiceUnit?.name || null,
        nurseInCharge: hospitalization.nurseInCharge?.displayName || null,
        nurseInChargeId: hospitalization.nurseInChargeId || null,
        lastUpdated: latestRound?.eventDate || hospitalization.updatedAt || hospitalization.admittedAt,
        access: hospitalization.access,
      };
    });
  }

  async recordNurseRound(id: string, userId: string | undefined, body: any) {
    const hospitalization = await this.findOne(id);
    const access = await this.buildNurseAccess(hospitalization, userId);
    if (!access.canWrite) {
      throw new ForbiddenException('Ecriture non autorisee pour cette hospitalisation');
    }

    const action = body?.action || 'observation';
    const kind =
      action === 'done'
        ? 'NURSE_ROUND_DONE'
        : action === 'problem'
          ? 'NURSE_PROBLEM'
          : 'NURSE_OBSERVATION';

    const history = await this.prisma.medicalHistory.create({
      data: {
        patientId: hospitalization.patientId,
        kind,
        details: JSON.stringify({
          hospitalizationId: id,
          observation: body?.observation || body?.notes || null,
          problem: body?.problem || null,
          escalated: Boolean(body?.escalated),
          accessReason: access.reason,
        }),
        createdById: userId || null,
      },
      include: { createdBy: true },
    });

    if (kind === 'NURSE_PROBLEM') {
      try {
        await this.notifications.createAndEmit({
          title: 'Probleme infirmier signale',
          body: body?.problem || body?.observation || 'Probleme signale pendant la tournee',
          relatedEntity: 'hospitalization',
          relatedId: id,
          patientId: hospitalization.patientId,
          type: 'SYSTEM',
          priority: body?.escalated ? 'HIGH' : 'MEDIUM',
        });
      } catch {}
    }

    return history;
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
    const updated = await this.prisma.hospitalization.update({ where: { id }, data: updateHospitalizationDto as any });
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
