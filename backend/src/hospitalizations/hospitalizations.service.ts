import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PatientWorkflowStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHospitalizationDto } from './dto/create-hospitalization.dto';
import { UpdateHospitalizationDto } from './dto/update-hospitalization.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateNursingCareTaskDto } from './dto/create-nursing-care-task.dto';
import { UpdateNursingCareTaskDto } from './dto/update-nursing-care-task.dto';
import { RecordMedicationAdministrationDto } from './dto/record-medication-administration.dto';

@Injectable()
export class HospitalizationsService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  private hospitalizationInclude = {
    patient: true,
    ServiceUnit: { include: { department: true } },
    bed: { include: { room: { include: { serviceUnit: true } } } },
    physician: true,
    nurseInCharge: true,
    nurseAssignments: { include: { nurse: true } },
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
    const registeredShift = await this.prisma.shift.findFirst({
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
    if (registeredShift) return registeredShift;

    // A rotation is used only when no explicit Shift overrides it.
    const employee = await this.prisma.employee.findFirst({
      where: { userId, status: 'ACTIVE', ...(serviceUnitId ? { serviceUnitId } : {}) },
      include: { user: true, serviceUnit: true },
    });
    if (!employee || employee.shiftPattern === 'MANUAL') return null;

    const at = (date: Date, hour: number, minute: number) => {
      const result = new Date(date);
      result.setHours(hour, minute, 0, 0);
      return result;
    };
    const today = at(now, 0, 0);
    const minuteOfDay = now.getHours() * 60 + now.getMinutes();
    const isPermanentDay = employee.shiftPattern === 'PERMANENT_DAY';
    if (!isPermanentDay && !employee.rotationAnchorAt) return null;
    const anchor = at(employee.rotationAnchorAt || today, 0, 0);
    const dayIndex = Math.floor((today.getTime() - anchor.getTime()) / 86_400_000);
    // The configured anchor is day 1. A rota must never grant access before it.
    if (!isPermanentDay && dayIndex < 0) return null;
    const rotationDays = Math.min(31, Math.max(1, employee.rotationDays || 3));
    const cycleDays = rotationDays * 3;
    const phase = ((dayIndex % cycleDays) + cycleDays) % cycleDays;
    const previousPhase = (((dayIndex - 1) % cycleDays) + cycleDays) % cycleDays;
    const [permanentEndHour, permanentEndMinute] = String(employee.permanentShiftEndTime || '17:30')
      .split(':')
      .map((value) => Number(value));
    const permanentEndMinutes = Number.isInteger(permanentEndHour) && Number.isInteger(permanentEndMinute)
      ? permanentEndHour * 60 + permanentEndMinute
      : 17 * 60 + 30;

    if ((isPermanentDay || phase < rotationDays) && minuteOfDay >= 7 * 60 + 30 && minuteOfDay < permanentEndMinutes) {
      return { startAt: at(today, 7, 30), endAt: at(today, Math.floor(permanentEndMinutes / 60), permanentEndMinutes % 60), employee };
    }
    const isNightDay = !isPermanentDay && phase >= rotationDays && phase < rotationDays * 2;
    const continuesPreviousNight = !isPermanentDay && previousPhase >= rotationDays && previousPhase < rotationDays * 2;
    if ((isNightDay && minuteOfDay >= 17 * 60 + 30) || (continuesPreviousNight && minuteOfDay < 7 * 60 + 30)) {
      const startDate = minuteOfDay < 7 * 60 + 30 ? new Date(today.getTime() - 86_400_000) : today;
      const endDate = minuteOfDay < 7 * 60 + 30 ? today : new Date(today.getTime() + 86_400_000);
      return { startAt: at(startDate, 17, 30), endAt: at(endDate, 7, 30), employee };
    }
    return null;
  }

  private async buildNurseAccess(hospitalization: any, userId?: string | null) {
    if (!userId) {
      return { mode: 'READ_ONLY', canWrite: false, reason: 'Utilisateur non identifie' };
    }

    const assignments = hospitalization.nurseAssignments || [];
    const assignedToCoverage = assignments.some((assignment: any) => assignment.nurseId === userId && !assignment.releasedAt);
    const [assignedShift, currentShift] = await Promise.all([
      this.activeShiftForUser(hospitalization.nurseInChargeId, hospitalization.serviceUnitId),
      this.activeShiftForUser(userId, hospitalization.serviceUnitId),
    ]);

    if (hospitalization.nurseInChargeId === userId || assignedToCoverage) {
      if (!currentShift) {
        return { mode: 'READ_ONLY', canWrite: false, reason: 'Votre shift actif n est pas ouvert' };
      }
      return { mode: 'WRITE', canWrite: true, reason: 'Infirmier responsable en shift actif' };
    }

    if (!assignedShift && assignments.length === 0 && currentShift) {
      return { mode: 'WRITE', canWrite: true, reason: 'Relai automatique: responsable hors shift' };
    }

    return { mode: 'READ_ONLY', canWrite: false, reason: 'Lecture clinique autorisee' };
  }

  /** Nurses actually on duty now, with their live active workload.
   * The roster is based on registered Employee/Shift records; it never infers availability from a name alone.
   */
  async getAvailableNurses(serviceUnitId?: string) {
    const nurses = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        primaryRole: 'NURSE',
        Employee: { some: { status: 'ACTIVE', ...(serviceUnitId ? { serviceUnitId } : {}) } },
      },
      select: { id: true, displayName: true, firstName: true, lastName: true, specialty: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const available = await Promise.all(nurses.map(async (nurse) => {
      const shift = await this.activeShiftForUser(nurse.id, serviceUnitId);
      if (!shift) return null;
      const activePatients = await (this.prisma as any).hospitalizationNurseAssignment.count({
        where: { nurseId: nurse.id, releasedAt: null, hospitalization: { status: { in: ['ADMITTED', 'TRANSFERRED'] } } },
      });
      const hour = shift.startAt.getHours();
      return {
        ...nurse,
        coverage: hour >= 17 || hour < 7 ? 'NIGHT' : 'DAY',
        shiftStartAt: shift.startAt,
        shiftEndAt: shift.endAt,
        activePatients,
        remainingCapacity: Math.max(0, 5 - activePatients),
        available: activePatients < 5,
      };
    }));

    return available.filter(Boolean);
  }

  async create(createHospitalizationDto: CreateHospitalizationDto, actorId?: string) {
    if (!actorId) throw new ForbiddenException('Médecin authentifié requis.');
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { primaryRole: true } });
    if (actor?.primaryRole !== 'PHYSICIAN') throw new ForbiddenException('Seul le médecin responsable peut hospitaliser.');
    const sourceConsultation = await this.prisma.consultation.findUnique({ where: { id: createHospitalizationDto.consultationId } });
    if (!sourceConsultation || sourceConsultation.patientId !== createHospitalizationDto.patientId || sourceConsultation.providerId !== actorId) {
      throw new BadRequestException('La consultation source doit appartenir au patient et au médecin connecté.');
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const bedId = createHospitalizationDto.bedId;
      let assignedBed: any = null;

      if (bedId) {
        assignedBed = await tx.bed.findUnique({ where: { id: bedId } });
        if (!assignedBed) {
          throw new BadRequestException('Le lit selectionne est introuvable');
        }
        if (assignedBed.status !== 'FREE') {
          throw new BadRequestException('Le lit selectionne n est plus disponible');
        }
      }

      const { bedId: _bedId, consultationId: _consultationId, physicianId: _physicianId, dayNurseId, nightNurseId, ...hospitalizationData } = createHospitalizationDto as any;
      const requestedAssignments = [
        dayNurseId ? { nurseId: dayNurseId, coverage: 'DAY' as const } : null,
        nightNurseId ? { nurseId: nightNurseId, coverage: 'NIGHT' as const } : null,
      ].filter(Boolean) as Array<{ nurseId: string; coverage: 'DAY' | 'NIGHT' }>;
      for (const assignment of requestedAssignments) {
        const nurse = await tx.user.findFirst({ where: { id: assignment.nurseId, status: 'ACTIVE', primaryRole: 'NURSE' } });
        if (!nurse) throw new BadRequestException(`Infirmier ${assignment.coverage === 'DAY' ? 'de jour' : 'de nuit'} indisponible.`);
        const activeShift = await this.activeShiftForUser(assignment.nurseId, hospitalizationData.serviceUnitId);
        if (!activeShift) throw new BadRequestException(`L'infirmier ${assignment.coverage === 'DAY' ? 'de jour' : 'de nuit'} n'est pas en shift actif.`);
        const actualCoverage = activeShift.startAt.getHours() >= 17 || activeShift.startAt.getHours() < 7 ? 'NIGHT' : 'DAY';
        if (actualCoverage !== assignment.coverage) throw new BadRequestException(`Cet infirmier n'est pas disponible pour la couverture ${assignment.coverage === 'DAY' ? 'de jour' : 'de nuit'}.`);
        const activeLoad = await (tx as any).hospitalizationNurseAssignment.count({ where: { nurseId: assignment.nurseId, releasedAt: null, hospitalization: { status: { in: ['ADMITTED', 'TRANSFERRED'] } } } });
        if (activeLoad >= 5) throw new BadRequestException('Cet infirmier a déjà atteint la limite de 5 patients hospitalisés.');
      }
      const hospitalization = await tx.hospitalization.create({ data: { ...hospitalizationData, physicianId: actorId } });
      await tx.consultation.update({ where: { id: createHospitalizationDto.consultationId }, data: { hospitalizationId: hospitalization.id } });
      if (requestedAssignments.length) {
        await (tx as any).hospitalizationNurseAssignment.createMany({ data: requestedAssignments.map((assignment) => ({ ...assignment, hospitalizationId: hospitalization.id, assignedById: createHospitalizationDto.physicianId || null })) });
      }

      if (assignedBed) {
        await tx.bed.update({
          where: { id: bedId },
          data: {
            status: 'OCCUPIED',
            hospitalizationId: hospitalization.id,
          },
        });
      }

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
            consultationId: createHospitalizationDto.consultationId,
            physicianId: actorId,
            nurseInChargeId: createHospitalizationDto.nurseInChargeId || null,
          }),
          createdById: actorId,
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

  private async clinicScope(currentUser?: any) {
    const role = String(currentUser?.primaryRole || currentUser?.role || '').toUpperCase();
    if (role === 'SUPER_ADMIN') return {};
    const actorId = currentUser?.userId || currentUser?.id;
    if (!actorId) throw new ForbiddenException('Utilisateur authentifié requis.');
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { clinicId: true } });
    return actor?.clinicId ? { patient: { clinicId: actor.clinicId } } : {};
  }

  async findAll(currentUser?: any, requestedLimit = 100) {
    const take = Math.min(Math.max(requestedLimit, 1), 250);
    const scope = await this.clinicScope(currentUser);
    return this.prisma.hospitalization.findMany({
      where: scope,
      include: this.hospitalizationInclude,
      orderBy: { admittedAt: 'desc' },
      take,
    });
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
    if (!userId) throw new ForbiddenException('Utilisateur authentifié requis.');
    const hospitalizations = await this.getNurseHospitalizations(userId);
    const now = new Date();
    const byId = new Map(hospitalizations.map((item: any) => [item.id, item]));
    if (!byId.size) return [];
    const tasks = await this.prisma.nursingCareTask.findMany({
      where: {
        hospitalizationId: { in: [...byId.keys()] },
        status: { not: 'CANCELLED' },
      },
      orderBy: { dueAt: 'asc' },
      take: 250,
    });

    return tasks.map((task) => {
      const hospitalization: any = byId.get(task.hospitalizationId);
      const overdue = task.status === 'PENDING' && task.dueAt.getTime() < now.getTime();
      return {
        id: task.id,
        hospitalizationId: task.hospitalizationId,
        patientId: hospitalization.patientId,
        scheduledAt: task.dueAt,
        patient: [hospitalization.patient?.firstName, hospitalization.patient?.middleName, hospitalization.patient?.lastName].filter(Boolean).join(' ') || 'Patient non identifié',
        room: hospitalization.bed?.room?.number || hospitalization.bedNumber || 'Non assignée',
        bed: hospitalization.bed?.code || hospitalization.bedNumber || null,
        title: task.title,
        instructions: task.instructions,
        priority: task.status === 'ESCALATED' || /urgence|critique|critical/i.test(task.title + ' ' + (task.instructions || '')) ? 'HIGH' : 'NORMAL',
        status: overdue ? 'OVERDUE' : task.status,
        completedAt: task.completedAt,
        escalationReason: task.escalationReason,
        updatedAt: task.updatedAt,
        service: hospitalization.ServiceUnit?.name || null,
        access: hospitalization.access,
      };
    });
  }

  async updateNurseCareTask(taskId: string, dto: UpdateNursingCareTaskDto, userId?: string) {
    if (!userId) throw new ForbiddenException('Utilisateur authentifié requis.');
    const task = await this.prisma.nursingCareTask.findUnique({
      where: { id: taskId },
      include: { hospitalization: { include: this.hospitalizationInclude } },
    });
    if (!task || ['CANCELLED', 'COMPLETED'].includes(task.status)) {
      throw new BadRequestException('Tâche introuvable ou déjà clôturée.');
    }
    const access = await this.buildNurseAccess(task.hospitalization, userId);
    const isAssigned = task.assignedNurseId === userId;
    if (!access.canWrite || (!isAssigned && task.assignedNurseId !== null)) {
      throw new ForbiddenException('Cette tâche n’est pas attribuée à l’infirmier connecté ou son shift est inactif.');
    }
    const observation = dto.observation?.trim();
    const escalationReason = dto.escalationReason?.trim();
    if (dto.status === 'COMPLETED' && !observation) {
      throw new BadRequestException('Une observation est obligatoire pour attester l’exécution du soin.');
    }
    if (dto.status === 'ESCALATED' && !(escalationReason || observation)) {
      throw new BadRequestException('Le motif de l’escalade est obligatoire.');
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const careTask = await tx.nursingCareTask.update({
        where: { id: taskId },
        data: {
          status: dto.status,
          completedAt: dto.status === 'COMPLETED' ? now : null,
          completedById: dto.status === 'COMPLETED' ? userId : null,
          escalationReason: dto.status === 'ESCALATED' ? escalationReason || observation || null : null,
        },
      });
      await tx.medicalHistory.create({
        data: {
          patientId: task.hospitalization.patientId,
          kind: 'NURSING_CARE_TASK',
          details: JSON.stringify({
            taskId,
            hospitalizationId: task.hospitalizationId,
            status: dto.status,
            observation: observation || null,
            escalationReason: escalationReason || null,
            performedAt: now.toISOString(),
          }),
          createdById: userId,
        },
      });
      return careTask;
    });
    if (dto.status === 'ESCALATED' && task.hospitalization.physicianId) {
      await this.notifications.createAndEmit({
        recipientId: task.hospitalization.physicianId,
        patientId: task.hospitalization.patientId,
        relatedEntity: 'nursing-care-task',
        relatedId: taskId,
        title: 'Escalade de soin infirmier',
        body: escalationReason || observation || task.title,
        type: 'ALERT',
        priority: 'HIGH',
      });
    }
    return updated;
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

  async createCareTask(id: string, dto: CreateNursingCareTaskDto, actorId?: string) {
    const hospitalization = await this.findOne(id);
    if (!actorId || hospitalization.physicianId !== actorId) {
      throw new ForbiddenException('Seul le médecin responsable peut planifier un soin.');
    }
    const dueAt = new Date(dto.dueAt);
    if (Number.isNaN(dueAt.getTime()) || dueAt <= new Date()) throw new BadRequestException('L’échéance du soin doit être future.');
    if (dto.assignedNurseId) {
      const assignment = hospitalization.nurseAssignments?.find((item: any) => item.nurseId === dto.assignedNurseId && !item.releasedAt);
      if (!assignment) throw new BadRequestException('L’infirmier choisi n’est pas affecté à cette hospitalisation.');
    }
    if (dto.prescriptionLineId) {
      const line = await this.prisma.prescriptionLine.findFirst({ where: { id: dto.prescriptionLineId, prescription: { patientId: hospitalization.patientId } } });
      if (!line) throw new BadRequestException('La ligne de prescription ne correspond pas au patient hospitalisé.');
    }
    return this.prisma.nursingCareTask.create({
      data: { hospitalizationId: id, assignedNurseId: dto.assignedNurseId || null, prescriptionLineId: dto.prescriptionLineId || null, title: dto.title.trim(), instructions: dto.instructions || null, dueAt },
    });
  }

  async recordMedicationAdministration(id: string, dto: RecordMedicationAdministrationDto, userId?: string) {
    const hospitalization = await this.findOne(id);
    const access = await this.buildNurseAccess(hospitalization, userId);
    if (!access.canWrite || !userId) throw new ForbiddenException('Administration non autorisée pour cette hospitalisation.');
    const line = await this.prisma.prescriptionLine.findFirst({ where: { id: dto.prescriptionLineId, prescription: { patientId: hospitalization.patientId, status: { in: ['PRESCRIBED', 'PARTIALLY_DISPENSED'] } } } });
    if (!line) throw new BadRequestException('Prescription active introuvable pour ce patient.');
    if (dto.status !== 'ADMINISTERED' && !dto.reason?.trim()) throw new BadRequestException('Un motif est obligatoire pour une dose refusée, suspendue ou manquée.');
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const administration = await tx.medicationAdministration.create({
        data: { hospitalizationId: id, prescriptionLineId: line.id, administeredById: userId, scheduledAt: now, administeredAt: dto.status === 'ADMINISTERED' ? now : null, status: dto.status, doseGiven: dto.doseGiven || null, reason: dto.reason || null, observation: dto.observation || null },
      });
      await tx.medicalHistory.create({
        data: { patientId: hospitalization.patientId, kind: 'MEDICATION_ADMINISTRATION', details: JSON.stringify({ administrationId: administration.id, hospitalizationId: id, prescriptionLineId: line.id, status: dto.status, reason: dto.reason || null }), createdById: userId },
      });
      return administration;
    });
  }

  async search(query: string, currentUser?: any) {
    const normalized = query?.trim();
    if (!normalized) {
      throw new BadRequestException('Un critère de recherche est obligatoire.');
    }
    const scope = await this.clinicScope(currentUser);

    return this.prisma.hospitalization.findMany({
      where: {
        ...scope,
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

  async getStats(currentUser?: any) {
    const scope = await this.clinicScope(currentUser);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const [hospitalized, availableRooms, totalBeds, occupiedBeds, admissionsToday, emergencyAdmissions] = await Promise.all([
      this.prisma.hospitalization.count({ where: { ...scope, status: { in: ['ADMITTED', 'TRANSFERRED'] } } }),
      this.prisma.room.count({ where: { status: 'AVAILABLE' } }),
      this.prisma.bed.count(),
      this.prisma.bed.count({ where: { status: 'OCCUPIED' } }),
      this.prisma.hospitalization.count({ where: { ...scope, admittedAt: { gte: today, lt: tomorrow } } }),
      this.prisma.hospitalization.count({
        where: {
          ...scope,
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

  async getRoomInventory(_currentUser?: any) {
    const rooms = await this.prisma.room.findMany({
      include: {
        serviceUnit: true,
        beds: {
          select: {
            id: true,
            code: true,
            status: true,
          },
        },
      },
    });
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
        beds: room.beds,
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

  async findOneForActor(id: string, currentUser?: any) {
    const scope = await this.clinicScope(currentUser);
    const hospitalization = await this.prisma.hospitalization.findFirst({
      where: { id, ...scope },
      include: this.hospitalizationInclude,
    });
    if (!hospitalization) throw new NotFoundException('Hospitalisation introuvable.');
    return hospitalization;
  }

  async getTimeline(id: string, currentUser?: any) {
    await this.findOneForActor(id, currentUser);
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

  async update(id: string, updateHospitalizationDto: UpdateHospitalizationDto, actorId?: string) {
    const current = await this.findOne(id);
    if (!actorId || current.physicianId !== actorId) throw new ForbiddenException('Seul le médecin responsable peut modifier cette hospitalisation.');
    const { patientId: _patientId, physicianId: _physicianId, ...safeUpdate } = updateHospitalizationDto;
    const updated = await this.prisma.hospitalization.update({ where: { id }, data: { ...safeUpdate, version: { increment: 1 } } as any });
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
