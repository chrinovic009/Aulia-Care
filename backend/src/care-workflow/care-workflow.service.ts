import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CareTaskStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { SPECIALTY_STAGES, assertEventProfession, assertStageProgress, assertSpecialtyClosable, activeDialysisPrescription } from './domain/specialty-rules';
import { PATHWAY_EVENT_TYPE, PATHWAY_LABELS, PatientWorkflowService } from '../core/patient-workflow.service';
import { BedAssignmentService } from '../hospitalizations/bed-assignment.service';
import { AuthenticatedActor, OperationalClinicActor } from '../core/clinic-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertExamReleased, cancelImagingExam, cancelLabExam, findImagingExam, findLabTest, openExam, recordImagingReport, recordLabResult } from './domain/exam-bridge';
import { CareAccessService, Db } from './care-access.service';
import {
  ENTERED_IN_ERROR_EVENT,
  assertClosable,
  assertCorrection,
  assertReassignment,
  assertTransition,
  closureRequirementsFromSettings,
  isTerminal,
  eventsInForce,
} from './domain/workflow-rules';
import { PROTOCOLS, ProtocolValidation, fingerprint, hasContent, protocolsOf, withProtocolValidation } from './domain/protocol-validation';
import {
  AssignTaskDto,
  CancelTransferDto,
  ChangeEpisodeStatusDto,
  ChangeServiceRequestStatusDto,
  ChangeTaskStatusDto,
  CorrectCareEventDto,
  CreateCareResourceDto,
  CreatePregnancyDto,
  CreateServiceRequestDto,
  CARE_PRIORITIES as CARE_PRIORITY_VALUES,
  DecideTransferDto,
  MergeProvisionalPatientDto,
  OpenEpisodeDto,
  RegisterArrivalDto,
  RegisterNewbornDto,
  RegisterDeliveryDto,
  ScheduleSpecialtySurgeryDto,
  ReportTaskResultDto,
  ValidateProtocolDto,
  RecordCareEventDto,
  SendTransferDto,
  UpdateCareResourceDto,
  UpdateEpisodeDto,
  UpdatePregnancyDto,
  ValidateCareEventDto,
  VersionOnlyDto,
} from './dto/care-workflow.dto';

const OPEN_EPISODE = ['PLANNED', 'IN_PROGRESS', 'ON_HOLD'] as const;
const OPEN_TASK: CareTaskStatus[] = ['REQUESTED', 'RECEIVED', 'ACCEPTED', 'READY', 'IN_PROGRESS', 'ON_HOLD'];
/** Accept a few minutes of clock drift between devices, never future documentation. */
const MAX_FUTURE_MS = 5 * 60_000;

const patientSummary = {
  select: { id: true, firstName: true, lastName: true, dateOfBirth: true, gender: true, identityStatus: true, dateOfBirthEstimated: true },
} as const;
const userSummary = { select: { id: true, firstName: true, lastName: true, primaryRole: true } } as const;

interface EventInput {
  careUnitId?: string | null;
  patientId?: string | null;
  episodeId?: string | null;
  requestId?: string | null;
  taskId?: string | null;
  transferId?: string | null;
  type: string;
  summary: string;
  payload?: Prisma.InputJsonValue;
  occurredAt?: Date;
  requiresValidation?: boolean;
  correctsEventId?: string | null;
  correctionReason?: string | null;
  validatesEventId?: string | null;
}

interface NotifyInput {
  careUnitId?: string | null;
  recipientUserIds?: string[];
  patientId?: string | null;
  title: string;
  message: string;
  relatedEntity: string;
  relatedId: string;
}

/**
 * Care Workflow Engine application service. It organises and traces what
 * professionals decide (requests, tasks, hand-offs, stays and events); it never
 * makes a clinical decision itself.
 */
@Injectable()
export class CareWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CareAccessService,
    private readonly patientWorkflow: PatientWorkflowService = new PatientWorkflowService(),
  ) {}

  // ======================================================================= helpers

  private run<T>(actorInput: AuthenticatedActor | undefined, work: (tx: Db, actor: OperationalClinicActor) => Promise<T>): Promise<T> {
    return this.access.actor(actorInput).then((actor) => this.prisma.$transaction((tx) => work(tx, actor)));
  }

  private async lockPatient(tx: Db, actor: OperationalClinicActor, patientId: string) {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`patient-workflow:${actor.clinicId}:${patientId}`}))`);
  }

  private requireMaternity(unit: { kind: string }) {
    if (unit.kind !== 'MATERNITY') throw new BadRequestException('Cette action exige une unité de maternité.');
  }

  private recordEvent(tx: Db, actor: OperationalClinicActor, input: EventInput) {
    return tx.careEvent.create({
      data: {
        clinicId: actor.clinicId,
        careUnitId: input.careUnitId ?? null,
        patientId: input.patientId ?? null,
        episodeId: input.episodeId ?? null,
        requestId: input.requestId ?? null,
        taskId: input.taskId ?? null,
        transferId: input.transferId ?? null,
        type: input.type,
        summary: input.summary,
        payload: input.payload ?? Prisma.JsonNull,
        occurredAt: input.occurredAt ?? new Date(),
        authorId: actor.id,
        authorRole: actor.primaryRole ?? 'UNKNOWN',
        requiresValidation: input.requiresValidation ?? false,
        correctsEventId: input.correctsEventId ?? null,
        correctionReason: input.correctionReason ?? null,
        validatesEventId: input.validatesEventId ?? null,
      },
    });
  }

  /** Durable notification, delivered by the outbox worker after commit. */
  private notify(tx: Db, actor: OperationalClinicActor, input: NotifyInput) {
    return tx.notificationOutbox.create({
      data: {
        clinicId: actor.clinicId,
        eventType: 'CARE_WORKFLOW',
        deduplicationKey: `care-workflow:${randomUUID()}`,
        payload: { ...input, excludeUserId: actor.id } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private conflictIfStale(count: number) {
    if (count !== 1) {
      throw new ConflictException('Cet élément a été modifié par quelqu’un d’autre entre-temps. Rechargez-le avant de recommencer.');
    }
  }

  private occurredAt(value?: string) {
    if (!value) return new Date();
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Date et heure invalides.');
    if (date.getTime() > Date.now() + MAX_FUTURE_MS) {
      throw new BadRequestException('Un événement ne peut pas être documenté dans le futur.');
    }
    return date;
  }

  private async findEpisode(tx: Db, actor: OperationalClinicActor, id: string) {
    const episode = await tx.careEpisode.findFirst({ where: { id, clinicId: actor.clinicId } });
    if (!episode) throw new NotFoundException('Prise en charge introuvable.');
    return episode;
  }

  private async findRequest(tx: Db, actor: OperationalClinicActor, id: string) {
    const request = await tx.serviceRequest.findFirst({ where: { id, clinicId: actor.clinicId } });
    if (!request) throw new NotFoundException('Demande introuvable.');
    return request;
  }

  private async findTask(tx: Db, actor: OperationalClinicActor, id: string) {
    const task = await tx.careTask.findFirst({ where: { id, clinicId: actor.clinicId } });
    if (!task) throw new NotFoundException('Tâche introuvable.');
    return task;
  }

  private async findTransfer(tx: Db, actor: OperationalClinicActor, id: string) {
    const transfer = await tx.careTransfer.findFirst({ where: { id, clinicId: actor.clinicId } });
    if (!transfer) throw new NotFoundException('Transfert introuvable.');
    return transfer;
  }

  private async requireUnitWriter(tx: Db, careUnitId: string, userId: string, label: string) {
    const role = await this.access.activeUnitRole(tx, userId, careUnitId);
    if (role !== 'MEMBER' && role !== 'LEAD') {
      throw new BadRequestException(`${label} doit être affecté à l’unité avec un droit d’action.`);
    }
  }

  // ======================================================================= reading

  myUnits(actorInput?: AuthenticatedActor) {
    return this.access.actor(actorInput).then((actor) => {
      const now = new Date();
      return this.prisma.careUnitAssignment.findMany({
        where: {
          userId: actor.id, clinicId: actor.clinicId, active: true, startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          careUnit: { active: true },
        },
        select: { unitRole: true, careUnit: { select: { id: true, kind: true, code: true, name: true, settings: true } } },
        orderBy: { careUnit: { name: 'asc' } },
      });
    });
  }

  /** Everything a unit has to handle now: open stays, open tasks, incoming hand-offs and requests. */
  worklist(careUnitId: string, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const { unit, unitRole } = await this.access.requireUnit(tx, actor, careUnitId, 'read');
      const [episodes, tasks, incomingTransfers, incomingRequests, outgoingRequests] = await Promise.all([
        tx.careEpisode.findMany({
          where: { clinicId: actor.clinicId, careUnitId, status: { in: [...OPEN_EPISODE] } },
          include: {
            patient: patientSummary,
            responsible: userSummary,
            // Latest triage documented by a professional (the engine never computes one).
            events: {
              where: { type: { in: ['TRIAGE', 'MISSION_STEP', 'SURGERY_STEP', 'SURGERY_SCHEDULED', 'DIALYSIS_STEP'] }, corrections: { none: {} } },
              select: { id: true, type: true, payload: true, occurredAt: true }, orderBy: [{ occurredAt: 'desc' }, { recordedAt: 'desc' }, { id: 'desc' }],
            },
            resources: { select: { id: true, kind: true, code: true, label: true } },
          },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
          take: 300,
        }),
        tx.careTask.findMany({
          where: { clinicId: actor.clinicId, careUnitId, status: { in: OPEN_TASK } },
          include: { patient: patientSummary, owner: userSummary, request: { select: { id: true, label: true, category: true, code: true } } },
          orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
          take: 300,
        }),
        tx.careTransfer.findMany({
          where: { clinicId: actor.clinicId, toUnitId: careUnitId, status: { in: ['SENT', 'RECEIVED'] } },
          include: { patient: patientSummary, sender: userSummary, fromUnit: { select: { id: true, name: true, kind: true } } },
          orderBy: { sentAt: 'asc' },
          take: 100,
        }),
        tx.serviceRequest.findMany({
          where: { clinicId: actor.clinicId, performerUnitId: careUnitId, status: { in: ['ACTIVE', 'ON_HOLD'] } },
          include: { patient: patientSummary, requester: userSummary, requesterUnit: { select: { id: true, name: true } } },
          orderBy: [{ priority: 'desc' }, { authoredAt: 'asc' }],
          take: 300,
        }),
        // What this unit asked of others and is still waiting for (or has to review).
        tx.serviceRequest.findMany({
          where: { clinicId: actor.clinicId, requesterUnitId: careUnitId, status: { in: ['DRAFT', 'ACTIVE', 'ON_HOLD'] } },
          include: {
            patient: patientSummary,
            requester: userSummary,
            performerUnit: { select: { id: true, name: true } },
            tasks: { select: { id: true, status: true, version: true }, orderBy: { createdAt: 'desc' } },
            events: { where: { type: 'RESULT_REVIEWED' }, select: { id: true } },
          },
          orderBy: [{ priority: 'desc' }, { authoredAt: 'asc' }],
          take: 300,
        }),
      ]);
      return { unit, unitRole, episodes, tasks, incomingTransfers, incomingRequests, outgoingRequests, generatedAt: new Date().toISOString() };
    });
  }

  episodeDetail(id: string, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const episode = await this.findEpisode(tx, actor, id);
      await this.access.requireUnit(tx, actor, episode.careUnitId, 'read');
      return tx.careEpisode.findFirstOrThrow({
        where: { id, clinicId: actor.clinicId },
        include: {
          patient: patientSummary,
          careUnit: { select: { id: true, name: true, kind: true, settings: true } },
          responsible: userSummary,
          requests: {
            include: {
              performerUnit: { select: { id: true, name: true } },
              tasks: { select: { id: true, status: true, version: true }, orderBy: { createdAt: 'desc' } },
            },
            orderBy: { authoredAt: 'desc' },
          },
          tasks: { include: { owner: userSummary }, orderBy: { createdAt: 'desc' } },
          events: { include: { author: userSummary }, orderBy: [{ occurredAt: 'asc' }, { recordedAt: 'asc' }] },
          transfersOut: { include: { toUnit: { select: { id: true, name: true } } } },
          transfersIn: { include: { fromUnit: { select: { id: true, name: true } } } },
        },
      });
    });
  }

  /**
   * Shared chronology of one patient across every unit. Allowed to a member of a
   * unit that currently or previously took care of this patient.
   */
  patientTimeline(patientId: string, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId: actor.clinicId, deletedAt: null },
        select: { id: true, mergedFrom: { select: { id: true } } },
      });
      if (!patient) throw new NotFoundException('Patient introuvable dans votre établissement.');
      const patientIds = [patient.id, ...patient.mergedFrom.map((item) => item.id)];
      const now = new Date();
      const linked = await tx.careEpisode.count({
        where: {
          clinicId: actor.clinicId,
          patientId: { in: patientIds },
          careUnit: {
            assignments: {
              some: { userId: actor.id, active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            },
          },
        },
      });
      if (!linked) throw new ForbiddenException('Aucune de vos unités ne prend en charge ce patient.');
      return tx.careEvent.findMany({
        where: { clinicId: actor.clinicId, patientId: { in: patientIds } },
        include: { author: userSummary, careUnit: { select: { id: true, name: true, kind: true } } },
        orderBy: [{ occurredAt: 'asc' }, { recordedAt: 'asc' }],
        take: 2_000,
      });
    });
  }

  /**
   * One answer to "where is the patient?", whichever circuit cares for them:
   * the reception → consultation pathway status and every open stay in a care
   * unit, with the last step of each. Open to the clinic's care staff.
   */
  patientLocation(patientId: string, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, clinicId: actor.clinicId, deletedAt: null },
        select: { id: true, firstName: true, lastName: true, workflowStatus: true },
      });
      if (!patient) throw new NotFoundException('Patient introuvable dans votre établissement.');
      const [stays, lastPathwayStep] = await Promise.all([
        tx.careEpisode.findMany({
          where: { clinicId: actor.clinicId, patientId, status: { in: [...OPEN_EPISODE] } },
          select: { id: true, status: true, stage: true, startedAt: true, careUnit: { select: { id: true, name: true, kind: true } } },
          orderBy: { startedAt: 'desc' },
          take: 20,
        }),
        tx.careEvent.findFirst({
          where: { clinicId: actor.clinicId, patientId, type: PATHWAY_EVENT_TYPE },
          select: { occurredAt: true, summary: true, author: userSummary },
          orderBy: { occurredAt: 'desc' },
        }),
      ]);
      const pathwayOpen = !['TERMINE', 'ANNULE'].includes(patient.workflowStatus);
      return {
        patient: { id: patient.id, firstName: patient.firstName, lastName: patient.lastName },
        pathway: { status: patient.workflowStatus, label: PATHWAY_LABELS[patient.workflowStatus], open: pathwayOpen, lastStep: lastPathwayStep },
        stays: stays.map((stay) => ({ episodeId: stay.id, status: stay.status, stage: stay.stage, since: stay.startedAt, unit: stay.careUnit })),
        summary: [
          ...(pathwayOpen ? [`Parcours : ${PATHWAY_LABELS[patient.workflowStatus]}`] : []),
          ...stays.map((stay) => `${stay.careUnit.name} (${stay.status === 'ON_HOLD' ? 'en attente' : stay.status === 'PLANNED' ? 'prévu' : 'en cours'})`),
        ].join(' · ') || 'Aucune prise en charge en cours',
      };
    });
  }

  // ======================================================================= episodes

  openEpisode(dto: OpenEpisodeDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const { unit } = await this.access.requireUnit(tx, actor, dto.careUnitId, 'write');
      await this.access.requirePatient(tx, actor, dto.patientId);
      await this.lockPatient(tx, actor, dto.patientId);
      if (unit.kind === 'DIALYSIS') {
        const prescriptions = await tx.careEvent.findMany({ where: { clinicId: actor.clinicId, careUnitId: unit.id, patientId: dto.patientId, type: 'DIALYSIS_PRESCRIPTION', corrections: { none: {} } }, orderBy: [{ occurredAt: 'desc' }, { recordedAt: 'desc' }], take: 1 });
        if (!activeDialysisPrescription(prescriptions[0]?.payload)) throw new ConflictException('Une prescription de dialyse active est obligatoire.');
      }
      if (dto.sourceRequestId) {
        const request = await this.findRequest(tx, actor, dto.sourceRequestId);
        if (request.performerUnitId !== unit.id || request.patientId !== dto.patientId) {
          throw new BadRequestException('La demande d’origine ne concerne pas ce patient dans cette unité.');
        }
      }
      if (dto.parentEpisodeId) {
        const parent = await this.findEpisode(tx, actor, dto.parentEpisodeId);
        if (parent.patientId !== dto.patientId) throw new BadRequestException('La prise en charge parente concerne un autre patient.');
      }
      const existing = await tx.careEpisode.findFirst({
        where: { clinicId: actor.clinicId, careUnitId: unit.id, patientId: dto.patientId, status: { in: [...OPEN_EPISODE] } },
        select: { id: true },
      });
      if (existing) throw new ConflictException('Ce patient a déjà une prise en charge ouverte dans cette unité.');

      if (SPECIALTY_STAGES[unit.kind] && dto.stage && dto.stage !== SPECIALTY_STAGES[unit.kind][0]) throw new BadRequestException('Commencez à la première étape du parcours spécialisé.');
      const start = dto.start ?? false;
      const episode = await tx.careEpisode.create({
        data: {
          clinicId: actor.clinicId,
          patientId: dto.patientId,
          careUnitId: unit.id,
          status: start ? 'IN_PROGRESS' : 'PLANNED',
          stage: dto.stage ?? null,
          priority: dto.priority ?? 'ROUTINE',
          reason: dto.reason?.trim() || null,
          locationLabel: dto.locationLabel?.trim() || null,
          plannedAt: dto.plannedAt ? new Date(dto.plannedAt) : null,
          startedAt: start ? new Date() : null,
          sourceRequestId: dto.sourceRequestId ?? null,
          parentEpisodeId: dto.parentEpisodeId ?? null,
          createdById: actor.id,
        },
      });
      await this.recordEvent(tx, actor, {
        careUnitId: unit.id, patientId: dto.patientId, episodeId: episode.id, requestId: dto.sourceRequestId,
        type: 'EPISODE_OPENED',
        summary: `Prise en charge ouverte dans l’unité ${unit.name}.`,
        payload: { status: episode.status, priority: episode.priority, reason: episode.reason },
      });
      return episode;
    });
  }

  changeEpisodeStatus(id: string, dto: ChangeEpisodeStatusDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const episode = await this.findEpisode(tx, actor, id);
      const { unit } = await this.access.requireUnit(tx, actor, episode.careUnitId, 'write');
      await this.lockPatient(tx, actor, episode.patientId);
      const reason = assertTransition('episode', episode.status, dto.status, dto.reason);
      if (dto.status === 'COMPLETED') {
        const events = await tx.careEvent.findMany({ where: { episodeId: episode.id }, orderBy: [{ occurredAt: 'asc' }, { recordedAt: 'asc' }] });
        assertClosable(closureRequirementsFromSettings(unit.settings), events);
        assertSpecialtyClosable(unit.kind, unit.settings, events);
        if (unit.kind === 'EMERGENCY') {
          const orientation = eventsInForce(events).filter(e => e.type === 'ORIENTATION').at(-1);
          if ((orientation?.payload as { outcome?: string } | null)?.outcome === 'HOSPITALIZATION') {
            const admission = await tx.hospitalization.findFirst({ where: { patientId: episode.patientId, clinicId: actor.clinicId, status: { in: ['ADMITTED', 'TRANSFERRED'] }, deletedAt: null }, select: { id: true } });
            if (!admission) throw new ConflictException('Créez l’admission et attribuez un lit avant de clôturer les urgences.');
          }
        }
      }
      const now = new Date();
      const ending = isTerminal('episode', dto.status);
      const updated = await tx.careEpisode.updateMany({
        where: { id, clinicId: actor.clinicId, version: dto.version, status: episode.status },
        data: {
          status: dto.status,
          startedAt: dto.status === 'IN_PROGRESS' && !episode.startedAt ? now : undefined,
          endedAt: ending ? now : undefined,
          outcome: dto.outcome?.trim() || undefined,
          outcomeDetail: dto.outcomeDetail ? (dto.outcomeDetail as Prisma.InputJsonValue) : undefined,
          version: { increment: 1 },
        },
      });
      this.conflictIfStale(updated.count);
      if (ending && unit.kind === 'SURGERY') {
        const link = await tx.careEvent.findFirst({ where: { episodeId: id, type: 'SURGERY_SCHEDULED', corrections: { none: {} } } });
        const surgeryId = (link?.payload as { surgeryId?: string } | null)?.surgeryId;
        if (surgeryId) await tx.surgery.updateMany({ where: { id: surgeryId, patient: { clinicId: actor.clinicId } }, data: { status: dto.status === 'COMPLETED' ? 'COMPLETED' : 'CANCELLED', completedAt: dto.status === 'COMPLETED' ? now : undefined } });
      }
      if (ending) {
        // A closed stay never keeps a vehicle, a room or a machine engaged.
        await tx.careResource.updateMany({
          where: { clinicId: actor.clinicId, assignedEpisodeId: id },
          data: { assignedEpisodeId: null, status: 'AVAILABLE', statusReason: null, version: { increment: 1 } },
        });
      }
      await this.recordEvent(tx, actor, {
        careUnitId: unit.id, patientId: episode.patientId, episodeId: id,
        type: 'EPISODE_STATUS_CHANGED',
        summary: `Prise en charge : ${episode.status} → ${dto.status}.`,
        payload: { from: episode.status, to: dto.status, reason, outcome: dto.outcome ?? null } as Prisma.InputJsonValue,
      });
      return tx.careEpisode.findFirstOrThrow({ where: { id } });
    });
  }

  updateEpisode(id: string, dto: UpdateEpisodeDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const episode = await this.findEpisode(tx, actor, id);
      const { unit } = await this.access.requireUnit(tx, actor, episode.careUnitId, 'write');
      if (isTerminal('episode', episode.status)) throw new ConflictException('Cette prise en charge est clôturée.');

      await this.lockPatient(tx, actor, episode.patientId);
      const data: Prisma.CareEpisodeUncheckedUpdateManyInput = {};
      const changes: Record<string, unknown> = {};
      if (dto.stage !== undefined && dto.stage !== episode.stage) {
        const stages = (unit.settings as { stages?: unknown } | null)?.stages;
        if (Array.isArray(stages) && stages.length && !stages.includes(dto.stage)) {
          throw new BadRequestException(`Étape « ${dto.stage} » non prévue par la configuration de l’unité.`);
        }
        if (['AMBULANCE', 'DIALYSIS', 'SURGERY'].includes(unit.kind)) throw new BadRequestException('Documentez une étape pour faire progresser cette prise en charge.');
        assertStageProgress(unit.kind, episode.stage, dto.stage, Array.isArray(stages) ? stages as string[] : undefined);
        data.stage = dto.stage;
        changes.stage = { from: episode.stage, to: dto.stage };
      }
      if (dto.priority && dto.priority !== episode.priority) {
        data.priority = dto.priority;
        changes.priority = { from: episode.priority, to: dto.priority };
      }
      if (dto.locationLabel !== undefined && dto.locationLabel !== episode.locationLabel) {
        data.locationLabel = dto.locationLabel?.trim() || null;
        changes.locationLabel = { from: episode.locationLabel, to: data.locationLabel };
      }
      const nextResponsible = dto.releaseResponsible ? null : dto.responsibleUserId;
      let reason: string | null = null;
      if (nextResponsible !== undefined && nextResponsible !== episode.responsibleUserId) {
        reason = assertReassignment(episode.responsibleUserId, nextResponsible, dto.reason);
        if (nextResponsible) await this.requireUnitWriter(tx, unit.id, nextResponsible, 'Le responsable');
        data.responsibleUserId = nextResponsible;
        changes.responsible = { from: episode.responsibleUserId, to: nextResponsible };
      }
      if (!Object.keys(changes).length) throw new BadRequestException('Aucune modification demandée.');

      const updated = await tx.careEpisode.updateMany({
        where: { id, clinicId: actor.clinicId, version: dto.version },
        data: { ...data, version: { increment: 1 } },
      });
      this.conflictIfStale(updated.count);
      await this.recordEvent(tx, actor, {
        careUnitId: unit.id, patientId: episode.patientId, episodeId: id,
        type: changes.responsible ? 'EPISODE_RESPONSIBLE_CHANGED' : 'EPISODE_UPDATED',
        summary: 'Prise en charge mise à jour.',
        payload: { changes, reason } as Prisma.InputJsonValue,
      });
      if (changes.responsible && nextResponsible) {
        await this.notify(tx, actor, {
          recipientUserIds: [nextResponsible], patientId: episode.patientId,
          title: 'Prise en charge confiée', message: `Vous êtes responsable d’une prise en charge dans l’unité ${unit.name}.`,
          relatedEntity: 'CareEpisode', relatedId: id,
        });
      }
      return tx.careEpisode.findFirstOrThrow({ where: { id } });
    });
  }

  // ======================================================================= service requests

  createRequest(dto: CreateServiceRequestDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const performer = await this.access.findUnit(tx, actor, dto.performerUnitId);
      if (!performer.active) throw new BadRequestException(`L’unité « ${performer.name} » est désactivée.`);
      if (dto.requesterUnitId) {
        await this.access.requireUnit(tx, actor, dto.requesterUnitId, 'write');
      } else {
        this.access.requireClinicalRequester(actor);
      }
      await this.access.requirePatient(tx, actor, dto.patientId);
      if (dto.episodeId) {
        const episode = await this.findEpisode(tx, actor, dto.episodeId);
        if (episode.patientId !== dto.patientId) throw new BadRequestException('La prise en charge indiquée concerne un autre patient.');
        if (dto.requesterUnitId && episode.careUnitId !== dto.requesterUnitId) {
          throw new BadRequestException('La prise en charge indiquée n’appartient pas à l’unité émettrice.');
        }
      }
      await this.lockPatient(tx, actor, dto.patientId);
      const draft = dto.draft ?? false;
      // An exam for the laboratory must be a catalogue exam: it carries the billed price.
      const labTest = performer.kind === 'LABORATORY' ? await findLabTest(tx, actor, dto.code)
        : performer.kind === 'IMAGING' ? await findImagingExam(tx, actor, dto.code) : null;
      const request = await tx.serviceRequest.create({
        data: {
          clinicId: actor.clinicId,
          patientId: dto.patientId,
          episodeId: dto.episodeId ?? null,
          requesterId: actor.id,
          requesterUnitId: dto.requesterUnitId ?? null,
          performerUnitId: performer.id,
          category: dto.category.trim(),
          code: labTest?.code ?? dto.code.trim(),
          label: dto.label.trim() || labTest?.name || dto.code.trim(),
          reason: dto.reason?.trim() || null,
          priority: dto.priority ?? 'ROUTINE',
          intent: dto.intent ?? 'ORDER',
          status: draft ? 'DRAFT' : 'ACTIVE',
          desiredAt: dto.desiredAt ? new Date(dto.desiredAt) : null,
          details: dto.details ? (dto.details as Prisma.InputJsonValue) : undefined,
        },
      });
      await this.recordEvent(tx, actor, {
        careUnitId: dto.requesterUnitId ?? null, patientId: dto.patientId, episodeId: dto.episodeId, requestId: request.id,
        type: draft ? 'REQUEST_DRAFTED' : 'REQUEST_SENT',
        summary: `Demande « ${request.label} » ${draft ? 'enregistrée en brouillon' : `adressée à ${performer.name}`}.`,
        payload: { category: request.category, code: request.code, priority: request.priority },
      });
      if (!draft) {
        await this.dispatchRequest(tx, actor, request, performer.name);
        if (labTest) await openExam(tx, actor, performer.kind, request);
      }
      return request;
    });
  }

  /** An active request becomes a task for the performing unit and notifies it. */
  private async dispatchRequest(
    tx: Db,
    actor: OperationalClinicActor,
    request: { id: string; patientId: string; episodeId: string | null; performerUnitId: string; label: string; reason: string | null; priority: 'ROUTINE' | 'URGENT' | 'ASAP' | 'STAT'; desiredAt: Date | null },
    performerName: string,
  ) {
    const task = await tx.careTask.create({
      data: {
        clinicId: actor.clinicId,
        patientId: request.patientId,
        careUnitId: request.performerUnitId,
        requestId: request.id,
        title: request.label,
        description: request.reason,
        priority: request.priority,
        dueAt: request.desiredAt,
        createdById: actor.id,
      },
    });
    await this.notify(tx, actor, {
      careUnitId: request.performerUnitId, patientId: request.patientId,
      title: request.priority === 'ROUTINE' ? 'Nouvelle demande' : `Nouvelle demande ${request.priority}`,
      message: `${request.label} — à traiter par ${performerName}.`,
      relatedEntity: 'CareTask', relatedId: task.id,
    });
    return task;
  }

  changeRequestStatus(id: string, dto: ChangeServiceRequestStatusDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const request = await this.findRequest(tx, actor, id);
      if (dto.status === 'COMPLETED') {
        await this.access.requireUnit(tx, actor, request.performerUnitId, 'write');
      } else if (request.requesterId !== actor.id && !(await this.access.canUnit(tx, actor, request.requesterUnitId, 'write'))) {
        throw new ForbiddenException('Seul l’auteur de la demande ou son unité peut la modifier.');
      }
      const reason = assertTransition('serviceRequest', request.status, dto.status, dto.reason);

      const openTasks = await tx.careTask.findMany({ where: { requestId: id, status: { in: OPEN_TASK } } });
      if (dto.status === 'COMPLETED' && openTasks.length) {
        throw new ConflictException('Des tâches de cette demande sont encore ouvertes : terminez-les ou annulez-les d’abord.');
      }
      if ((dto.status === 'REVOKED' || dto.status === 'ENTERED_IN_ERROR') && openTasks.some((task) => task.status === 'IN_PROGRESS')) {
        throw new ConflictException('L’exécution a commencé : l’unité exécutante doit d’abord suspendre ou terminer la tâche.');
      }

      const updated = await tx.serviceRequest.updateMany({
        where: { id, clinicId: actor.clinicId, version: dto.version, status: request.status },
        data: { status: dto.status, statusReason: reason, version: { increment: 1 } },
      });
      this.conflictIfStale(updated.count);

      const performer = await this.access.findUnit(tx, actor, request.performerUnitId);
      let labCancellation: { invoiceCancelled: boolean } | null = null;
      if (dto.status === 'REVOKED' || dto.status === 'ENTERED_IN_ERROR') {
        labCancellation = performer.kind === 'IMAGING'
          ? await cancelImagingExam(tx, actor, id, reason ?? null)
          : await cancelLabExam(tx, id, reason ?? null);
        for (const task of openTasks) {
          await tx.careTask.update({
            where: { id: task.id },
            data: { status: 'CANCELLED', statusReason: `Demande annulée : ${reason}`, version: { increment: 1 } },
          });
        }
      }
      if (request.status === 'DRAFT' && dto.status === 'ACTIVE') {
        await this.dispatchRequest(tx, actor, request, performer.name);
        await openExam(tx, actor, performer.kind, request);
      }
      await this.recordEvent(tx, actor, {
        careUnitId: dto.status === 'COMPLETED' ? request.performerUnitId : request.requesterUnitId,
        patientId: request.patientId, episodeId: request.episodeId, requestId: id,
        type: 'REQUEST_STATUS_CHANGED',
        summary: `Demande « ${request.label} » : ${request.status} → ${dto.status}.`,
        payload: { from: request.status, to: dto.status, reason, cancelledTasks: openTasks.map((task) => task.id), exam: labCancellation } as Prisma.InputJsonValue,
      });
      if (dto.status !== 'ACTIVE') {
        const toPerformer = dto.status !== 'COMPLETED';
        await this.notify(tx, actor, {
          careUnitId: toPerformer ? request.performerUnitId : null,
          recipientUserIds: toPerformer ? undefined : [request.requesterId],
          patientId: request.patientId,
          title: `Demande ${dto.status === 'COMPLETED' ? 'terminée' : 'modifiée'}`,
          message: `${request.label} : ${reason ?? dto.status}.`,
          relatedEntity: 'ServiceRequest', relatedId: id,
        });
      }
      return tx.serviceRequest.findFirstOrThrow({ where: { id } });
    });
  }

  // ======================================================================= tasks

  changeTaskStatus(id: string, dto: ChangeTaskStatusDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const task = await this.findTask(tx, actor, id);
      const { unit } = await this.access.requireUnit(tx, actor, task.careUnitId, 'write');
      const reason = assertTransition('task', task.status, dto.status, dto.reason);
      const now = new Date();
      const updated = await tx.careTask.updateMany({
        where: { id, clinicId: actor.clinicId, version: dto.version, status: task.status },
        data: {
          status: dto.status,
          statusReason: reason,
          startedAt: dto.status === 'IN_PROGRESS' && !task.startedAt ? now : undefined,
          completedAt: dto.status === 'COMPLETED' ? now : undefined,
          version: { increment: 1 },
        },
      });
      this.conflictIfStale(updated.count);
      await this.recordEvent(tx, actor, {
        careUnitId: unit.id, patientId: task.patientId, episodeId: task.episodeId, requestId: task.requestId, taskId: id,
        type: 'TASK_STATUS_CHANGED',
        summary: `Tâche « ${task.title} » : ${task.status} → ${dto.status}.`,
        payload: { from: task.status, to: dto.status, reason } as Prisma.InputJsonValue,
      });
      if (task.requestId && ['ACCEPTED', 'REJECTED', 'COMPLETED', 'FAILED'].includes(dto.status)) {
        const request = await tx.serviceRequest.findUniqueOrThrow({ where: { id: task.requestId }, select: { requesterId: true, label: true } });
        await this.notify(tx, actor, {
          recipientUserIds: [request.requesterId], patientId: task.patientId,
          title: `Demande ${({ ACCEPTED: 'acceptée', REJECTED: 'refusée', COMPLETED: 'exécutée', FAILED: 'non exécutée' } as Record<string, string>)[dto.status]}`,
          message: `${request.label} — ${unit.name}${reason ? ` : ${reason}` : ''}.`,
          relatedEntity: 'ServiceRequest', relatedId: task.requestId,
        });
      }
      return tx.careTask.findFirstOrThrow({ where: { id } });
    });
  }

  assignTask(id: string, dto: AssignTaskDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const task = await this.findTask(tx, actor, id);
      const nextOwner = dto.ownerUserId ?? null;
      const takingFreeTask = !task.ownerUserId && nextOwner === actor.id;
      const { unit } = await this.access.requireUnit(tx, actor, task.careUnitId, takingFreeTask ? 'write' : 'reassign');
      if (isTerminal('task', task.status)) throw new ConflictException('Cette tâche est terminée.');
      if (nextOwner === task.ownerUserId) throw new BadRequestException('Cette personne est déjà responsable de la tâche.');
      const reason = assertReassignment(task.ownerUserId, nextOwner, dto.reason);
      if (nextOwner) await this.requireUnitWriter(tx, unit.id, nextOwner, 'Le nouveau responsable');

      const updated = await tx.careTask.updateMany({
        where: { id, clinicId: actor.clinicId, version: dto.version },
        data: { ownerUserId: nextOwner, version: { increment: 1 } },
      });
      this.conflictIfStale(updated.count);
      await this.recordEvent(tx, actor, {
        careUnitId: unit.id, patientId: task.patientId, episodeId: task.episodeId, requestId: task.requestId, taskId: id,
        type: 'TASK_ASSIGNED',
        summary: `Tâche « ${task.title} » ${nextOwner ? 'affectée' : 'libérée'}.`,
        payload: { from: task.ownerUserId, to: nextOwner, reason } as Prisma.InputJsonValue,
      });
      if (nextOwner && nextOwner !== actor.id) {
        await this.notify(tx, actor, {
          recipientUserIds: [nextOwner], patientId: task.patientId,
          title: 'Tâche affectée', message: `${task.title} — ${unit.name}.`,
          relatedEntity: 'CareTask', relatedId: id,
        });
      }
      return tx.careTask.findFirstOrThrow({ where: { id } });
    });
  }

  // ======================================================================= events

  recordCareEvent(dto: RecordCareEventDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const { unit } = await this.access.requireUnit(tx, actor, dto.careUnitId, 'write');
      assertEventProfession(actor.primaryRole, dto.type, dto.payload);
      if (dto.type === 'DELIVERY' || dto.type === 'BIRTH' || dto.type === 'NEWBORN_REGISTERED' || dto.type === 'SURGERY_SCHEDULED' || dto.type === 'DISCHARGE_AUTHORIZED') throw new BadRequestException('Utilisez l’opération dédiée pour cet événement composite.');
      let patientId = dto.patientId ?? null;
      const adopt = (linkedPatientId: string | null, label: string) => {
        if (!linkedPatientId) return;
        if (patientId && patientId !== linkedPatientId) throw new BadRequestException(`${label} concerne un autre patient.`);
        patientId = linkedPatientId;
      };
      if (dto.episodeId) {
        const episode = await this.findEpisode(tx, actor, dto.episodeId);
        if (episode.careUnitId !== unit.id) throw new BadRequestException('La prise en charge appartient à une autre unité.');
        if (isTerminal('episode', episode.status)) {
          throw new ConflictException('Prise en charge clôturée : documentez une correction ou rouvrez une nouvelle prise en charge.');
        }
        adopt(episode.patientId, 'La prise en charge');
      }
      if (dto.taskId) {
        const task = await this.findTask(tx, actor, dto.taskId);
        if (task.careUnitId !== unit.id) throw new BadRequestException('La tâche appartient à une autre unité.');
        adopt(task.patientId, 'La tâche');
      }
      if (dto.requestId) {
        const request = await this.findRequest(tx, actor, dto.requestId);
        if (request.performerUnitId !== unit.id && request.requesterUnitId !== unit.id) {
          throw new BadRequestException('La demande ne concerne pas cette unité.');
        }
        adopt(request.patientId, 'La demande');
      }
      if (patientId) { await this.lockPatient(tx, actor, patientId); await this.access.requirePatient(tx, actor, patientId); }
      if (dto.type === ENTERED_IN_ERROR_EVENT) {
        throw new BadRequestException('Utilisez la correction d’un événement pour le déclarer saisi en erreur.');
      }
      let episodeChanges: Record<string, unknown> | null = null;
      if (dto.episodeUpdate) {
        if (!dto.episodeId) throw new BadRequestException('Une mise à jour de prise en charge exige la prise en charge concernée.');
        episodeChanges = await this.progressEpisode(tx, actor, unit, dto.episodeId, dto.episodeUpdate);
      }
      const payload = episodeChanges
        ? ({ ...(dto.payload ?? {}), episodeChanges } as Prisma.InputJsonValue)
        : (dto.payload as Prisma.InputJsonValue | undefined);
      const occurredAt = this.occurredAt(dto.occurredAt);
      const event = await this.recordEvent(tx, actor, {
        careUnitId: unit.id, patientId, episodeId: dto.episodeId, requestId: dto.requestId, taskId: dto.taskId,
        type: dto.type,
        summary: dto.summary.trim(),
        payload,
        occurredAt,
        requiresValidation: dto.requiresValidation ?? false,
      });
      if (dto.episodeId) await this.applyStageEvent(tx, actor, unit, dto.episodeId, dto.type, dto.payload, occurredAt, event.id);
      return event;
    });
  }

  /**
   * Units whose progress is documented step by step (ambulance missions...)
   * declare settings.stageEventType: such an event moves the stay to
   * payload.stage unless a later step was already documented. No version is
   * needed, so these steps can be entered offline and replayed in any order.
   */
  private async applyStageEvent(
    tx: Db,
    actor: OperationalClinicActor,
    unit: { id: string; kind: string; settings: Prisma.JsonValue | null },
    episodeId: string,
    type: string,
    payload: Record<string, unknown> | undefined,
    occurredAt: Date,
    eventId: string,
  ) {
    const settings = (unit.settings ?? {}) as { stageEventType?: unknown; stages?: string[] };
    if (!settings.stageEventType || settings.stageEventType !== type) return;
    const stage = payload?.stage;
    if (typeof stage !== 'string' || !stage) throw new BadRequestException('Étape manquante (payload.stage).');
    const episode = await this.findEpisode(tx, actor, episodeId);
    await this.lockPatient(tx, actor, episode.patientId);
    const events = await tx.careEvent.findMany({ where: { episodeId, type, corrections: { none: {} } }, orderBy: [{ occurredAt: 'asc' }, { recordedAt: 'asc' }, { id: 'asc' }] });
    const effective = eventsInForce(events);
    const candidateIndex = effective.findIndex(e => e.id === eventId);
    const previous = effective[candidateIndex - 1];
    const priorStage = previous ? (previous.payload as { stage?: string } | null)?.stage ?? null : settings.stages?.[0] ?? null;
    assertStageProgress(unit.kind, priorStage, stage, settings.stages);
    if (unit.kind === 'DIALYSIS' && ['CONNECTION', 'START'].includes(stage)) {
      const prescription = await tx.careEvent.findFirst({ where: { clinicId: actor.clinicId, careUnitId: unit.id, patientId: episode.patientId, type: 'DIALYSIS_PRESCRIPTION', corrections: { none: {} } }, orderBy: [{ occurredAt: 'desc' }, { recordedAt: 'desc' }] });
      if (!activeDialysisPrescription(prescription?.payload)) throw new ConflictException('La prescription est suspendue ou arrêtée.');
      const machine = await tx.careResource.findFirst({ where: { clinicId: actor.clinicId, careUnitId: unit.id, assignedEpisodeId: episodeId, kind: 'MACHINE', status: 'ENGAGED' } });
      if (!machine) throw new ConflictException('Attribuez un générateur disponible à cette séance avant le branchement.');
    }
    if (unit.kind === 'SURGERY' && ['ANESTHESIA', 'INCISION', 'OUT_OF_ROOM'].includes(stage)) {
      const phase = stage === 'ANESTHESIA' ? ['SIGN_IN'] : stage === 'INCISION' ? ['SIGN_IN', 'TIME_OUT'] : ['SIGN_IN', 'TIME_OUT', 'SIGN_OUT'];
      const cfg = unit.settings as { checklist?: Array<{ phase: string; items: string[] }> } | null;
      const all = await tx.careEvent.findMany({ where: { episodeId }, orderBy: [{ occurredAt: 'asc' }, { recordedAt: 'asc' }] });
      assertSpecialtyClosable('SURGERY', { checklist: cfg?.checklist?.filter(p => phase.includes(p.phase)) }, all);
    }
    const latest = effective.at(-1);
    const latestStage = (latest?.payload as { stage?: string } | null)?.stage ?? settings.stages?.[0] ?? null;
    await tx.careEpisode.updateMany({ where: { id: episodeId, clinicId: actor.clinicId, status: { in: [...OPEN_EPISODE] } }, data: { stage: latestStage, status: episode.status === 'PLANNED' && latestStage !== 'SCHEDULED' ? 'IN_PROGRESS' : undefined, startedAt: episode.status === 'PLANNED' && latestStage !== 'SCHEDULED' ? new Date() : undefined, version: { increment: 1 } } });
    const link = await tx.careEvent.findFirst({ where: { episodeId, type: 'SURGERY_SCHEDULED', corrections: { none: {} } } });
    const surgeryId = (link?.payload as { surgeryId?: string } | null)?.surgeryId;
    if (surgeryId && unit.kind === 'SURGERY') await tx.surgery.updateMany({ where: { id: surgeryId, patient: { clinicId: actor.clinicId } }, data: { status: latestStage === 'PREOP' ? 'PREOP' : ['IN_ROOM', 'ANESTHESIA', 'INCISION', 'CLOSURE'].includes(latestStage ?? '') ? 'IN_PROGRESS' : ['OUT_OF_ROOM', 'RECOVERY', 'POSTOP'].includes(latestStage ?? '') ? 'COMPLETED' : 'PLANNED' } });
  }

  /** Stage / priority / location change carried by an event, under optimistic versioning. */
  private async progressEpisode(
    tx: Db,
    actor: OperationalClinicActor,
    unit: { id: string; kind: string; settings: Prisma.JsonValue | null },
    episodeId: string,
    update: { version: number; stage?: string; priority?: (typeof CARE_PRIORITY_VALUES)[number]; locationLabel?: string },
  ) {
    const episode = await this.findEpisode(tx, actor, episodeId);
    const data: Prisma.CareEpisodeUncheckedUpdateManyInput = {};
    const changes: Record<string, unknown> = {};
    if (update.stage !== undefined && update.stage !== episode.stage) {
      const stages = (unit.settings as { stages?: unknown } | null)?.stages;
      if (Array.isArray(stages) && stages.length && !stages.includes(update.stage)) {
        throw new BadRequestException(`Étape « ${update.stage} » non prévue par la configuration de l’unité.`);
      }
      if (['AMBULANCE', 'DIALYSIS', 'SURGERY'].includes(unit.kind)) throw new BadRequestException('Documentez une étape pour faire progresser cette prise en charge.');
      assertStageProgress(unit.kind, episode.stage, update.stage, Array.isArray(stages) ? stages as string[] : undefined);
      data.stage = update.stage;
      changes.stage = { from: episode.stage, to: update.stage };
    }
    if (update.priority && update.priority !== episode.priority) {
      data.priority = update.priority;
      changes.priority = { from: episode.priority, to: update.priority };
    }
    if (update.locationLabel !== undefined && (update.locationLabel.trim() || null) !== episode.locationLabel) {
      data.locationLabel = update.locationLabel.trim() || null;
      changes.locationLabel = { from: episode.locationLabel, to: data.locationLabel };
    }
    if (!Object.keys(changes).length) return null;
    const updated = await tx.careEpisode.updateMany({
      where: { id: episodeId, clinicId: actor.clinicId, version: update.version, status: { in: [...OPEN_EPISODE] } },
      data: { ...data, version: { increment: 1 } },
    });
    this.conflictIfStale(updated.count);
    return changes;
  }

  correctCareEvent(id: string, dto: CorrectCareEventDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const original = await tx.careEvent.findFirst({ where: { id, clinicId: actor.clinicId } });
      const reason = assertCorrection(original, dto.reason);
      if (!original?.careUnitId) throw new ForbiddenException('Cet événement système ne peut pas être corrigé manuellement.');
      const { unit } = await this.access.requireUnit(tx, actor, original.careUnitId, 'write');
      assertEventProfession(actor.primaryRole, original.type, dto.payload ?? original.payload as Record<string, unknown> | null);
      if (['DELIVERY', 'BIRTH', 'NEWBORN_REGISTERED', 'SURGERY_SCHEDULED', 'DISCHARGE_AUTHORIZED'].includes(original.type)) throw new ConflictException('Cet événement est lié à des dossiers métier : une correction composite est requise.');
      if (original.episodeId && ['MISSION_STEP', 'DIALYSIS_STEP', 'SURGERY_STEP'].includes(original.type)) { const episode = await this.findEpisode(tx, actor, original.episodeId); if (isTerminal('episode', episode.status)) throw new ConflictException('Une étape d’un épisode clôturé exige une réouverture contrôlée.'); }
      if (original.patientId) await this.lockPatient(tx, actor, original.patientId);
      if (await tx.careEvent.findFirst({ where: { correctsEventId: id }, select: { id: true } })) throw new ConflictException('Cet événement a déjà été corrigé : corrigez la dernière version.');
      if (!dto.retract && !dto.summary) throw new BadRequestException('Une correction doit contenir la nouvelle information.');
      const event = await this.recordEvent(tx, actor, {
        careUnitId: original.careUnitId, patientId: original.patientId, episodeId: original.episodeId,
        requestId: original.requestId, taskId: original.taskId, transferId: original.transferId,
        type: dto.retract ? ENTERED_IN_ERROR_EVENT : original.type,
        summary: dto.retract ? `Saisie retirée : ${original.summary}` : dto.summary?.trim() ?? '',
        payload: dto.retract ? undefined : dto.payload as Prisma.InputJsonValue | undefined ?? original.payload as Prisma.InputJsonValue,
        occurredAt: original.occurredAt, requiresValidation: dto.retract ? false : original.requiresValidation,
        correctsEventId: id, correctionReason: reason,
      });
      const settings = unit.settings as { stageEventType?: string; stages?: string[] } | null;
      if (original.episodeId && settings?.stageEventType === original.type) {
        if (!dto.retract && (!dto.payload?.stage || !settings.stages?.includes(String(dto.payload.stage)))) throw new BadRequestException('Étape corrigée invalide.');
        const events = await tx.careEvent.findMany({ where: { episodeId: original.episodeId, type: original.type, corrections: { none: {} } }, orderBy: [{ occurredAt: 'asc' }, { recordedAt: 'asc' }, { id: 'asc' }] });
        const effective = eventsInForce(events);
        if (!dto.retract) { const index = effective.findIndex(e => e.id === event.id); const previous = effective[index - 1]; const previousStage = (previous?.payload as { stage?: string } | null)?.stage ?? settings.stages?.[0] ?? null; assertStageProgress(unit.kind, previousStage, String(dto.payload?.stage), settings.stages); }
        const latest = effective.at(-1);
        const stage = (latest?.payload as { stage?: string } | null)?.stage ?? settings.stages?.[0] ?? null;
        await tx.careEpisode.updateMany({ where: { id: original.episodeId, clinicId: actor.clinicId }, data: { stage, version: { increment: 1 } } });
      }
      return event;
    });
  }

  validateCareEvent(id: string, dto: ValidateCareEventDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const original = await tx.careEvent.findFirst({ where: { id, clinicId: actor.clinicId } });
      if (!original) throw new NotFoundException('Événement introuvable.');
      if (!original.requiresValidation) throw new BadRequestException('Cet événement ne requiert pas de validation.');
      if (!original.careUnitId) throw new ForbiddenException('Événement sans unité : validation impossible.');
      await this.access.requireUnit(tx, actor, original.careUnitId, 'validate');
      assertEventProfession(actor.primaryRole, original.type, original.payload as Record<string, unknown> | null);
      if (original.authorId === actor.id) throw new ForbiddenException('Un événement ne peut pas être validé par son auteur.');
      const [validated, corrected] = await Promise.all([
        tx.careEvent.findFirst({ where: { validatesEventId: id }, select: { id: true } }),
        tx.careEvent.findFirst({ where: { correctsEventId: id }, select: { id: true } }),
      ]);
      if (validated) throw new ConflictException('Cet événement est déjà validé.');
      if (corrected) throw new ConflictException('Cet événement a été corrigé : validez la version corrigée.');
      return this.recordEvent(tx, actor, {
        careUnitId: original.careUnitId, patientId: original.patientId, episodeId: original.episodeId,
        requestId: original.requestId, taskId: original.taskId,
        type: 'VALIDATION',
        summary: `Validation : ${original.summary}`,
        payload: dto.comment ? { comment: dto.comment.trim() } : undefined,
        validatesEventId: id,
      });
    });
  }

  // ======================================================================= transfers

  sendTransfer(dto: SendTransferDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      if (dto.fromUnitId) await this.access.requireUnit(tx, actor, dto.fromUnitId, 'write');
      else this.access.requireClinicalRequester(actor);
      const target = await this.access.findUnit(tx, actor, dto.toUnitId);
      if (!target.active) throw new BadRequestException(`L’unité « ${target.name} » est désactivée.`);
      if (dto.fromUnitId === dto.toUnitId) throw new BadRequestException('Un transfert doit viser une autre unité.');
      await this.access.requirePatient(tx, actor, dto.patientId);
      if (dto.fromEpisodeId) {
        const episode = await this.findEpisode(tx, actor, dto.fromEpisodeId);
        if (episode.patientId !== dto.patientId || episode.careUnitId !== dto.fromUnitId) {
          throw new BadRequestException('La prise en charge d’origine ne correspond pas au patient ou à l’unité émettrice.');
        }
      }
      if (dto.requestId) {
        const request = await this.findRequest(tx, actor, dto.requestId);
        if (request.patientId !== dto.patientId) throw new BadRequestException('La demande concerne un autre patient.');
      }
      if (!Object.keys(dto.summary).length) throw new BadRequestException('La transmission doit contenir des informations.');
      const transfer = await tx.careTransfer.create({
        data: {
          clinicId: actor.clinicId,
          patientId: dto.patientId,
          fromUnitId: dto.fromUnitId ?? null,
          fromEpisodeId: dto.fromEpisodeId ?? null,
          toUnitId: target.id,
          requestId: dto.requestId ?? null,
          senderId: actor.id,
          reason: dto.reason.trim(),
          summary: dto.summary as Prisma.InputJsonValue,
        },
      });
      await this.recordEvent(tx, actor, {
        careUnitId: dto.fromUnitId ?? null, patientId: dto.patientId, episodeId: dto.fromEpisodeId, requestId: dto.requestId,
        transferId: transfer.id,
        type: 'TRANSFER_SENT',
        summary: `Transmission envoyée à ${target.name}.`,
        payload: { reason: transfer.reason },
      });
      await this.notify(tx, actor, {
        careUnitId: target.id, patientId: dto.patientId,
        title: 'Transmission entrante', message: `Un patient vous est transmis : ${transfer.reason}.`,
        relatedEntity: 'CareTransfer', relatedId: transfer.id,
      });
      return transfer;
    });
  }

  acknowledgeTransfer(id: string, dto: VersionOnlyDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const transfer = await this.findTransfer(tx, actor, id);
      await this.access.requireUnit(tx, actor, transfer.toUnitId, 'write');
      assertTransition('transfer', transfer.status, 'RECEIVED');
      const updated = await tx.careTransfer.updateMany({
        where: { id, clinicId: actor.clinicId, version: dto.version, status: transfer.status },
        data: { status: 'RECEIVED', receivedAt: new Date(), receiverId: actor.id, version: { increment: 1 } },
      });
      this.conflictIfStale(updated.count);
      await this.recordEvent(tx, actor, {
        careUnitId: transfer.toUnitId, patientId: transfer.patientId, transferId: id,
        type: 'TRANSFER_RECEIVED', summary: 'Réception de la transmission confirmée.',
      });
      await this.notify(tx, actor, {
        recipientUserIds: [transfer.senderId], patientId: transfer.patientId,
        title: 'Transmission reçue', message: 'L’unité destinataire a confirmé la réception.',
        relatedEntity: 'CareTransfer', relatedId: id,
      });
      return tx.careTransfer.findFirstOrThrow({ where: { id } });
    });
  }

  decideTransfer(id: string, dto: DecideTransferDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const transfer = await this.findTransfer(tx, actor, id);
      const { unit } = await this.access.requireUnit(tx, actor, transfer.toUnitId, 'write');
      const target = dto.decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
      const reason = assertTransition('transfer', transfer.status, target, dto.reason);
      const now = new Date();

      let toEpisodeId: string | null = null;
      if (target === 'ACCEPTED') {
        const open = await tx.careEpisode.findFirst({
          where: { clinicId: actor.clinicId, careUnitId: unit.id, patientId: transfer.patientId, status: { in: [...OPEN_EPISODE] } },
          select: { id: true },
        });
        toEpisodeId = open?.id ?? (await tx.careEpisode.create({
          data: {
            clinicId: actor.clinicId,
            patientId: transfer.patientId,
            careUnitId: unit.id,
            status: 'IN_PROGRESS',
            startedAt: now,
            priority: dto.episode?.priority ?? 'ROUTINE',
            reason: dto.episode?.reason?.trim() || transfer.reason,
            locationLabel: dto.episode?.locationLabel?.trim() || null,
            parentEpisodeId: transfer.fromEpisodeId,
            sourceRequestId: transfer.requestId,
            createdById: actor.id,
          },
        })).id;
      }
      const updated = await tx.careTransfer.updateMany({
        where: { id, clinicId: actor.clinicId, version: dto.version, status: transfer.status },
        data: {
          status: target,
          decidedAt: now,
          decisionReason: reason,
          receiverId: actor.id,
          receivedAt: transfer.receivedAt ?? now,
          toEpisodeId,
          version: { increment: 1 },
        },
      });
      this.conflictIfStale(updated.count);
      await this.recordEvent(tx, actor, {
        careUnitId: unit.id, patientId: transfer.patientId, episodeId: toEpisodeId, transferId: id,
        type: target === 'ACCEPTED' ? 'TRANSFER_ACCEPTED' : 'TRANSFER_REJECTED',
        summary: target === 'ACCEPTED' ? `Patient accepté par ${unit.name}.` : `Transmission refusée par ${unit.name}.`,
        payload: { reason, toEpisodeId } as Prisma.InputJsonValue,
      });
      await this.notify(tx, actor, {
        recipientUserIds: [transfer.senderId], patientId: transfer.patientId,
        title: target === 'ACCEPTED' ? 'Transmission acceptée' : 'Transmission refusée',
        message: `${unit.name}${reason ? ` : ${reason}` : ''}.`,
        relatedEntity: 'CareTransfer', relatedId: id,
      });
      return tx.careTransfer.findFirstOrThrow({ where: { id } });
    });
  }

  cancelTransfer(id: string, dto: CancelTransferDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const transfer = await this.findTransfer(tx, actor, id);
      if (transfer.senderId !== actor.id && !(await this.access.canUnit(tx, actor, transfer.fromUnitId, 'write'))) {
        throw new ForbiddenException('Seul l’émetteur ou son unité peut annuler ce transfert.');
      }
      const reason = assertTransition('transfer', transfer.status, 'CANCELLED', dto.reason);
      const updated = await tx.careTransfer.updateMany({
        where: { id, clinicId: actor.clinicId, version: dto.version, status: transfer.status },
        data: { status: 'CANCELLED', decidedAt: new Date(), decisionReason: reason, version: { increment: 1 } },
      });
      this.conflictIfStale(updated.count);
      await this.recordEvent(tx, actor, {
        careUnitId: transfer.fromUnitId, patientId: transfer.patientId, transferId: id,
        type: 'TRANSFER_CANCELLED', summary: 'Transmission annulée par l’émetteur.', payload: { reason },
      });
      await this.notify(tx, actor, {
        careUnitId: transfer.toUnitId, patientId: transfer.patientId,
        title: 'Transmission annulée', message: reason ?? 'Transmission annulée.',
        relatedEntity: 'CareTransfer', relatedId: id,
      });
      return tx.careTransfer.findFirstOrThrow({ where: { id } });
    });
  }

  // ======================================================================= directory, arrivals, identity

  /** Active units of the establishment, to address a request or a hand-off. */
  clinicUnits(actorInput?: AuthenticatedActor) {
    return this.access.actor(actorInput).then((actor) =>
      this.prisma.careUnit.findMany({
        where: { clinicId: actor.clinicId, active: true },
        select: { id: true, kind: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }));
  }

  /** Quick identity search, restricted to people who belong to at least one care unit. */
  searchPatients(query: string, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const term = query?.trim() ?? '';
      if (term.length < 2) return [];
      const now = new Date();
      const assigned = await tx.careUnitAssignment.count({
        where: { userId: actor.id, active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      });
      if (!assigned) throw new ForbiddenException('Vous n’êtes affecté à aucune unité de soins.');
      const words = term.split(/\s+/).slice(0, 3);
      return tx.patient.findMany({
        where: {
          clinicId: actor.clinicId,
          deletedAt: null,
          identityStatus: { not: 'MERGED' },
          AND: words.map((word) => ({
            OR: [
              { firstName: { contains: word, mode: 'insensitive' as const } },
              { lastName: { contains: word, mode: 'insensitive' as const } },
              { middleName: { contains: word, mode: 'insensitive' as const } },
              { phone: { contains: word } },
              { externalId: { contains: word, mode: 'insensitive' as const } },
            ],
          })),
        },
        select: { ...patientSummary.select, middleName: true, externalId: true, phone: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: 20,
      });
    });
  }

  /** Stays of the unit closed during the last days. */
  unitHistory(careUnitId: string, days: number, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      await this.access.requireUnit(tx, actor, careUnitId, 'read');
      const span = Math.min(Math.max(Math.trunc(days) || 7, 1), 90);
      return tx.careEpisode.findMany({
        where: {
          clinicId: actor.clinicId,
          careUnitId,
          status: { in: ['COMPLETED', 'CANCELLED', 'ENTERED_IN_ERROR'] },
          endedAt: { gte: new Date(Date.now() - span * 86_400_000) },
        },
        include: { patient: patientSummary, responsible: userSummary },
        orderBy: { endedAt: 'desc' },
        take: 500,
      });
    });
  }

  /**
   * Arrival in a unit: an existing record, or a provisional identity when the
   * person cannot be identified. Never a second record for a known patient.
   */
  registerArrival(careUnitId: string, dto: RegisterArrivalDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const { unit } = await this.access.requireUnit(tx, actor, careUnitId, 'write');
      if (!!dto.patientId === !!dto.provisional) {
        throw new BadRequestException('Choisissez un dossier existant ou une identité provisoire (pas les deux).');
      }
      const arrivedAt = this.occurredAt(dto.arrivedAt);
      let patientId = dto.patientId ?? null;
      if (patientId) {
        await this.access.requirePatient(tx, actor, patientId);
      } else {
        const provisional = dto.provisional!;
        const year = new Date().getUTCFullYear() - (provisional.estimatedAgeYears ?? 0);
        const stamp = arrivedAt.toISOString().slice(0, 10).replace(/-/g, '');
        const created = await tx.patient.create({
          data: {
            clinicId: actor.clinicId,
            firstName: 'Inconnu',
            lastName: `${unit.code}-${stamp}-${randomUUID().slice(0, 6).toUpperCase()}`,
            gender: provisional.gender,
            dateOfBirth: new Date(Date.UTC(provisional.estimatedAgeYears === undefined ? 1900 : year, 0, 1)),
            dateOfBirthEstimated: true,
            identityStatus: 'PROVISIONAL',
          },
          select: { id: true },
        });
        patientId = created.id;
      }
      const existing = await tx.careEpisode.findFirst({
        where: { clinicId: actor.clinicId, careUnitId: unit.id, patientId, status: { in: [...OPEN_EPISODE] } },
        select: { id: true },
      });
      if (existing) throw new ConflictException('Ce patient est déjà présent dans cette unité.');
      const stages = (unit.settings as { stages?: unknown } | null)?.stages;
      const firstStage = Array.isArray(stages) && typeof stages[0] === 'string' ? (stages[0] as string) : 'ARRIVAL';
      const episode = await tx.careEpisode.create({
        data: {
          clinicId: actor.clinicId,
          patientId,
          careUnitId: unit.id,
          status: 'IN_PROGRESS',
          stage: firstStage,
          priority: 'ROUTINE',
          reason: dto.reason?.trim() || null,
          locationLabel: dto.locationLabel?.trim() || null,
          startedAt: arrivedAt,
          createdById: actor.id,
        },
      });
      await this.recordEvent(tx, actor, {
        careUnitId: unit.id, patientId, episodeId: episode.id,
        type: 'ARRIVAL',
        summary: dto.arrivalMode === 'CALL'
          ? `Appel enregistré par l’unité ${unit.name}${dto.provisional ? ' (identité provisoire)' : ''}.`
          : dto.provisional ? `Arrivée sous identité provisoire dans l’unité ${unit.name}.` : `Arrivée dans l’unité ${unit.name}.`,
        payload: {
          arrivalMode: dto.arrivalMode ?? null,
          reason: dto.reason ?? null,
          provisional: dto.provisional ? { ...dto.provisional } : null,
        } as Prisma.InputJsonValue,
        occurredAt: arrivedAt,
      });
      return tx.careEpisode.findFirstOrThrow({ where: { id: episode.id }, include: { patient: patientSummary } });
    });
  }

  /**
   * Attaches a provisional record to the person's definitive record once
   * identified. Events stay immutable on the provisional record and are shown
   * in the definitive record's chronology; open work moves to it.
   */
  mergeProvisionalPatient(provisionalId: string, dto: MergeProvisionalPatientDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      if (provisionalId === dto.targetPatientId) throw new BadRequestException('Choisissez un autre dossier.');
      const [provisional, target] = await Promise.all([
        tx.patient.findFirst({ where: { id: provisionalId, clinicId: actor.clinicId, deletedAt: null }, select: { id: true, identityStatus: true } }),
        tx.patient.findFirst({ where: { id: dto.targetPatientId, clinicId: actor.clinicId, deletedAt: null }, select: { id: true, identityStatus: true, firstName: true, lastName: true } }),
      ]);
      if (!provisional || !target) throw new NotFoundException('Dossier introuvable dans votre établissement.');
      if (provisional.identityStatus !== 'PROVISIONAL') throw new ConflictException('Seul un dossier provisoire peut être rattaché.');
      if (target.identityStatus === 'MERGED') throw new ConflictException('Le dossier cible est lui-même fusionné.');

      const openEpisodes = await tx.careEpisode.findMany({
        where: { clinicId: actor.clinicId, patientId: provisionalId, status: { in: [...OPEN_EPISODE] } },
        select: { id: true, careUnitId: true },
      });
      if (!openEpisodes.length) throw new ForbiddenException('Le rattachement se fait depuis l’unité qui prend le patient en charge.');
      let writable = false;
      for (const episode of openEpisodes) {
        const role = await this.access.activeUnitRole(tx, actor.id, episode.careUnitId);
        if (role === 'MEMBER' || role === 'LEAD') writable = true;
      }
      if (!writable) throw new ForbiddenException('Vous devez agir dans une unité qui prend ce patient en charge.');
      const clash = await tx.careEpisode.findFirst({
        where: {
          clinicId: actor.clinicId, patientId: target.id, status: { in: [...OPEN_EPISODE] },
          careUnitId: { in: openEpisodes.map((episode) => episode.careUnitId) },
        },
        select: { id: true },
      });
      if (clash) throw new ConflictException('Le dossier définitif a déjà une prise en charge ouverte dans la même unité.');

      const marked = await tx.patient.updateMany({
        where: { id: provisionalId, identityStatus: 'PROVISIONAL' },
        data: { identityStatus: 'MERGED', mergedIntoPatientId: target.id },
      });
      this.conflictIfStale(marked.count);
      const moved = { clinicId: actor.clinicId, patientId: provisionalId };
      await tx.careEpisode.updateMany({ where: { ...moved, status: { in: [...OPEN_EPISODE] } }, data: { patientId: target.id, version: { increment: 1 } } });
      await tx.serviceRequest.updateMany({ where: { ...moved, status: { in: ['DRAFT', 'ACTIVE', 'ON_HOLD'] } }, data: { patientId: target.id } });
      await tx.careTask.updateMany({ where: { ...moved, status: { in: OPEN_TASK } }, data: { patientId: target.id } });
      await tx.careTransfer.updateMany({ where: { ...moved, status: { in: ['SENT', 'RECEIVED'] } }, data: { patientId: target.id } });
      for (const episode of openEpisodes) {
        await this.recordEvent(tx, actor, {
          careUnitId: episode.careUnitId, patientId: target.id, episodeId: episode.id,
          type: 'IDENTITY_MERGED',
          summary: `Identité confirmée : dossier provisoire rattaché au dossier de ${target.firstName} ${target.lastName}.`,
          payload: { provisionalPatientId: provisionalId, targetPatientId: target.id, reason: dto.reason.trim() },
        });
      }
      return { mergedPatientId: provisionalId, targetPatientId: target.id, movedEpisodes: openEpisodes.length };
    });
  }

  // ======================================================================= resources

  listResources(careUnitId: string, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      await this.access.requireUnit(tx, actor, careUnitId, 'read');
      return tx.careResource.findMany({
        where: { clinicId: actor.clinicId, careUnitId, status: { not: 'RETIRED' } },
        include: { assignedEpisode: { select: { id: true, stage: true, priority: true, patient: patientSummary } } },
        orderBy: [{ kind: 'asc' }, { code: 'asc' }],
      });
    });
  }

  createResource(careUnitId: string, dto: CreateCareResourceDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const { unit } = await this.access.requireUnit(tx, actor, careUnitId, 'configure');
      const code = dto.code.trim().toUpperCase();
      const existing = await tx.careResource.findFirst({ where: { careUnitId: unit.id, code }, select: { id: true } });
      if (existing) throw new ConflictException(`Le code ${code} existe déjà dans cette unité.`);
      const resource = await tx.careResource.create({
        data: {
          clinicId: actor.clinicId, careUnitId: unit.id, kind: dto.kind, code, label: dto.label.trim(),
          details: dto.details ? (dto.details as Prisma.InputJsonValue) : undefined,
        },
      });
      await this.recordEvent(tx, actor, {
        careUnitId: unit.id, type: 'RESOURCE_CREATED', summary: `Ressource ${code} (${resource.label}) ajoutée.`,
        payload: { resourceId: resource.id, kind: dto.kind },
      });
      return resource;
    });
  }

  updateResource(id: string, dto: UpdateCareResourceDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const resource = await tx.careResource.findFirst({ where: { id, clinicId: actor.clinicId } });
      if (!resource) throw new NotFoundException('Ressource introuvable.');
      const configuring = dto.label !== undefined || dto.details !== undefined || dto.status === 'RETIRED';
      const { unit } = await this.access.requireUnit(tx, actor, resource.careUnitId, configuring ? 'configure' : 'write');

      const data: Prisma.CareResourceUncheckedUpdateManyInput = {};
      let eventType = 'RESOURCE_UPDATED';
      let summary = `Ressource ${resource.code} mise à jour.`;
      let episodeId: string | null = null;
      let patientId: string | null = null;

      if (dto.assignedEpisodeId) {
        if (dto.release) throw new BadRequestException('Engager ou libérer, pas les deux.');
        if (resource.status !== 'AVAILABLE') throw new ConflictException(`${resource.code} n’est pas disponible (${resource.status}).`);
        const episode = await this.findEpisode(tx, actor, dto.assignedEpisodeId);
        if (episode.careUnitId !== unit.id || isTerminal('episode', episode.status)) {
          throw new BadRequestException('La prise en charge doit être ouverte dans la même unité.');
        }
        Object.assign(data, { assignedEpisodeId: episode.id, status: 'ENGAGED', statusReason: null });
        eventType = 'RESOURCE_ENGAGED'; summary = `${resource.label} (${resource.code}) engagé.`;
        episodeId = episode.id; patientId = episode.patientId;
      } else if (dto.release) {
        if (!resource.assignedEpisodeId) throw new ConflictException(`${resource.code} n’est engagé sur aucune prise en charge.`);
        const episode = await this.findEpisode(tx, actor, resource.assignedEpisodeId);
        Object.assign(data, { assignedEpisodeId: null, status: 'AVAILABLE', statusReason: null });
        eventType = 'RESOURCE_RELEASED'; summary = `${resource.label} (${resource.code}) libéré.`;
        episodeId = isTerminal('episode', episode.status) ? null : episode.id; patientId = episode.patientId;
      } else if (dto.status && dto.status !== resource.status) {
        if (dto.status === 'ENGAGED') throw new BadRequestException('Une ressource est engagée en la rattachant à une prise en charge.');
        if (resource.assignedEpisodeId) throw new ConflictException(`${resource.code} est engagé : libérez-le d’abord.`);
        const reason = dto.statusReason?.trim();
        if (dto.status !== 'AVAILABLE' && (!reason || reason.length < 2)) throw new BadRequestException('Indiquez le motif de l’indisponibilité.');
        Object.assign(data, { status: dto.status, statusReason: dto.status === 'AVAILABLE' ? null : reason });
        eventType = 'RESOURCE_STATUS_CHANGED'; summary = `${resource.code} : ${resource.status} → ${dto.status}${reason ? ` (${reason})` : ''}.`;
      }
      if (dto.label !== undefined) data.label = dto.label.trim();
      if (dto.details !== undefined) data.details = dto.details as Prisma.InputJsonValue;
      if (!Object.keys(data).length) throw new BadRequestException('Aucune modification demandée.');

      const updated = await tx.careResource.updateMany({ where: { id, version: dto.version }, data: { ...data, version: { increment: 1 } } });
      this.conflictIfStale(updated.count);
      await this.recordEvent(tx, actor, {
        careUnitId: unit.id, episodeId, patientId, type: eventType, summary,
        payload: { resourceId: id, code: resource.code, from: resource.status, to: data.status ?? resource.status },
      });
      return tx.careResource.findFirstOrThrow({ where: { id }, include: { assignedEpisode: { select: { id: true, stage: true, priority: true, patient: patientSummary } } } });
    });
  }

  // ======================================================================= results

  /**
   * The performing unit reports the result of a requested act (examination,
   * opinion...). It is recorded as an immutable event on the requester's stay,
   * the task is completed and the requester is notified. Corrections go
   * through the usual event correction, never by overwriting.
   */
  reportTaskResult(taskId: string, dto: ReportTaskResultDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const task = await this.findTask(tx, actor, taskId);
      const { unit } = await this.access.requireUnit(tx, actor, task.careUnitId, 'write');
      if (!task.requestId) throw new BadRequestException('Seule une tâche issue d’une demande reçoit un résultat.');
      if (!['ACCEPTED', 'READY', 'IN_PROGRESS'].includes(task.status)) {
        throw new ConflictException('Le résultat se saisit sur une demande acceptée ou en cours.');
      }
      const request = await tx.serviceRequest.findUniqueOrThrow({ where: { id: task.requestId } });
      const updated = await tx.careTask.updateMany({
        where: { id: taskId, clinicId: actor.clinicId, version: dto.version, status: task.status },
        data: { status: 'COMPLETED', completedAt: new Date(), startedAt: task.startedAt ?? new Date(), version: { increment: 1 } },
      });
      this.conflictIfStale(updated.count);
      if (unit.kind === 'LABORATORY' || unit.kind === 'IMAGING') await assertExamReleased(tx, request.id);
      const laboratory = unit.kind === 'LABORATORY' ? await recordLabResult(tx, actor, request.id, dto) : null;
      const imaging = unit.kind === 'IMAGING' ? await recordImagingReport(tx, actor, request.id, dto) : null;
      const event = await this.recordEvent(tx, actor, {
        careUnitId: unit.id, patientId: task.patientId, episodeId: request.episodeId, requestId: request.id, taskId,
        type: 'RESULT_REPORTED',
        summary: `Résultat — ${request.label} : ${dto.summary.trim()}`,
        payload: {
          label: request.label, code: request.code, performerUnit: unit.name,
          observations: (dto.observations ?? []).map((item) => ({ ...item })),
          conclusion: dto.conclusion?.trim() || null,
          laboratory: laboratory ? { ...laboratory, validation: 'PENDING_SECOND_SIGNATURE' } : null,
          imaging: imaging ? { ...imaging, radiologistVerification: 'PENDING' } : null,
        } as Prisma.InputJsonValue,
      });
      await this.notify(tx, actor, {
        recipientUserIds: [request.requesterId], patientId: task.patientId,
        title: 'Résultat disponible',
        message: `${request.label} — ${unit.name}.`,
        relatedEntity: 'ServiceRequest', relatedId: request.id,
      });
      return event;
    });
  }

  // ======================================================================= clinical protocols
  /** The unit's protocols (triage scale, partogram, checklist) with their validation state. */
  unitProtocols(careUnitId: string, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const { unit } = await this.access.requireUnit(tx, actor, careUnitId, 'read');
      const settings = (unit.settings ?? {}) as Record<string, unknown>;
      const recorded = (settings.protocolValidations ?? {}) as Record<string, ProtocolValidation>;
      return protocolsOf(unit.kind).map((code) => {
        const content = PROTOCOLS[code].content(settings);
        const current = fingerprint(content);
        const validation = recorded[code] && recorded[code].fingerprint === current ? recorded[code] : null;
        return { code, label: PROTOCOLS[code].label, clinicianRoles: PROTOCOLS[code].clinicianRoles, content: content ?? null, defined: hasContent(content), fingerprint: current, validation };
      });
    });
  }

  /**
   * A clinician leading the unit adopts the protocol as written, for the
   * establishment. The approval is tied to that exact content and recorded in
   * the unit's journal; a later change by the administration lifts it.
   */
  validateProtocol(careUnitId: string, dto: ValidateProtocolDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const { unit, unitRole } = await this.access.requireUnit(tx, actor, careUnitId, 'write');
      const protocol = PROTOCOLS[dto.protocol];
      if (!protocol || protocol.unitKind !== unit.kind) throw new BadRequestException('Ce protocole ne concerne pas cette unité.');
      if (unitRole !== 'LEAD' || !protocol.clinicianRoles.includes(String(actor.primaryRole))) {
        throw new ForbiddenException(`La validation revient à un responsable clinique de l’unité (${protocol.clinicianRoles.join(', ')}, rôle « responsable » dans l’unité).`);
      }
      const settings = (unit.settings ?? {}) as Record<string, unknown>;
      const content = protocol.content(settings);
      if (!hasContent(content)) throw new BadRequestException(`${protocol.label} : rien à valider, le protocole n’est pas défini.`);
      if (fingerprint(content) !== dto.fingerprint) throw new ConflictException('Le protocole a été modifié depuis votre lecture : relisez-le avant de le valider.');
      const person = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { firstName: true, lastName: true } });
      const validatedByName = `${person.firstName} ${person.lastName}`.trim();
      const next = withProtocolValidation(settings, dto.protocol, {
        validatedById: actor.id, validatedByName, validatedByRole: String(actor.primaryRole), validatedAt: new Date().toISOString(), comment: dto.comment?.trim() || null,
      });
      await tx.careUnit.update({ where: { id: unit.id }, data: { settings: next as Prisma.InputJsonValue } });
      await this.recordEvent(tx, actor, {
        careUnitId: unit.id, type: 'PROTOCOL_VALIDATED',
        summary: `${protocol.label} validé(e) pour l’établissement par ${validatedByName}.`,
        payload: { protocol: dto.protocol, fingerprint: dto.fingerprint, content, comment: dto.comment?.trim() || null } as Prisma.InputJsonValue,
      });
      return { code: dto.protocol, validated: true, validatedByName };
    });
  }

  // ================================================================ exam catalogues (bridge: domain/exam-bridge.ts)
  /** Imaging catalogue the requesting units choose from (code, name, price). */
  imagingCatalogue(actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) =>
      tx.imagingCatalogue.findMany({
        where: { clinicId: actor.clinicId, active: true, deletedAt: null },
        select: { id: true, code: true, name: true, price: true, modality: true },
        orderBy: { name: 'asc' },
        take: 2_000,
      }));
  }

  /** Laboratory catalogue the requesting units choose from (code, name, price). */
  laboratoryCatalogue(actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) =>
      tx.labTest.findMany({
        where: { clinicId: actor.clinicId, active: true },
        select: { id: true, code: true, name: true, price: true },
        orderBy: { name: 'asc' },
        take: 2_000,
      }));
  }

  scheduleSurgery(careUnitId: string, dto: ScheduleSpecialtySurgeryDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const { unit } = await this.access.requireUnit(tx, actor, careUnitId, 'write');
      if (unit.kind !== 'SURGERY') throw new BadRequestException('Unité de chirurgie requise.');
      assertEventProfession(actor.primaryRole, 'SURGERY_SCHEDULED');
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`surgery-schedule:${actor.clinicId}`}))`);
      await this.lockPatient(tx, actor, dto.patientId); await this.access.requirePatient(tx, actor, dto.patientId);
      const prior = await tx.careEvent.findFirst({ where: { clinicId: actor.clinicId, type: 'SURGERY_SCHEDULED', payload: { path: ['operationId'], equals: dto.operationId } } });
      if (prior?.episodeId) return tx.careEpisode.findFirstOrThrow({ where: { id: prior.episodeId, patientId: dto.patientId } });
      const at = new Date(dto.scheduledAt); const end = at.getTime() + dto.durationMinutes * 60_000;
      if (!Number.isFinite(end) || at <= new Date()) throw new BadRequestException('Date future et durée positive requises.');
      const resource = await tx.careResource.findFirst({ where: { clinicId: actor.clinicId, careUnitId, kind: 'ROOM', code: dto.room } });
      if (!resource || ['UNAVAILABLE', 'MAINTENANCE', 'RETIRED'].includes(resource.status)) throw new ConflictException('Salle indisponible.');
      const configuredRoomId = (resource.details as { operatingRoomId?: string } | null)?.operatingRoomId;
      let room = await tx.operatingRoom.findFirst({ where: { clinicId: actor.clinicId, active: true, deletedAt: null, ...(configuredRoomId ? { id: configuredRoomId } : { name: resource.code }) } });
      if (!room && !configuredRoomId) room = await tx.operatingRoom.create({ data: { clinicId: actor.clinicId, name: resource.code, location: resource.label } });
      if (!room) throw new ConflictException('La salle opératoire configurée est inactive ou introuvable.');
      const existing = await tx.surgery.findMany({ where: { patient: { clinicId: actor.clinicId }, deletedAt: null, status: { in: ['PLANNED', 'PREOP', 'IN_PROGRESS'] }, OR: [{ operatingRoomId: room.id }, { surgeonId: actor.id }] } });
      for (const item of existing) {
        if (!item.scheduledAt) continue;
        const link = await tx.careEvent.findFirst({ where: { clinicId: actor.clinicId, type: 'SURGERY_SCHEDULED', payload: { path: ['surgeryId'], equals: item.id } } });
        const duration = Number((link?.payload as { durationMinutes?: number } | null)?.durationMinutes ?? 120);
        if (item.scheduledAt.getTime() < end && at.getTime() < item.scheduledAt.getTime() + duration * 60_000) throw new ConflictException('Salle ou chirurgien déjà réservé sur ce créneau.');
      }
      if (await tx.careEpisode.findFirst({ where: { clinicId: actor.clinicId, careUnitId, patientId: dto.patientId, status: { in: [...OPEN_EPISODE] } } })) throw new ConflictException('Prise en charge déjà ouverte dans cette unité.');
      if (dto.sourceRequestId) {
        const request = await this.findRequest(tx, actor, dto.sourceRequestId);
        if (request.patientId !== dto.patientId || request.performerUnitId !== careUnitId) throw new BadRequestException('Demande source incompatible.');
      }
      const surgery = await tx.surgery.create({ data: { patientId: dto.patientId, operatingRoomId: room.id, surgeonId: actor.id, scheduledAt: at, procedureName: dto.procedure, indication: String(dto.details?.notes ?? dto.procedure) } });
      const episode = await tx.careEpisode.create({ data: { clinicId: actor.clinicId, patientId: dto.patientId, careUnitId, status: 'PLANNED', stage: 'SCHEDULED', plannedAt: at, responsibleUserId: actor.id, priority: dto.priority ?? 'ROUTINE', sourceRequestId: dto.sourceRequestId, createdById: actor.id, reason: dto.procedure } });
      await this.recordEvent(tx, actor, { careUnitId, patientId: dto.patientId, episodeId: episode.id, type: 'SURGERY_SCHEDULED', summary: `Programmé : ${dto.procedure}`, payload: { ...dto.details, operationId: dto.operationId, surgeryId: surgery.id, operatingRoomId: room.id, roomResourceId: resource.id, surgeonId: actor.id, surgeon: actor.id, procedure: dto.procedure, room: resource.code, start: at.toISOString(), durationMinutes: dto.durationMinutes } });
      return episode;
    });
  }

  admitFromEmergency(id: string, version: number, bedId: string, reason: string, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      if (actor.primaryRole !== 'PHYSICIAN') throw new ForbiddenException('Seul le médecin peut hospitaliser.');
      const episode = await this.findEpisode(tx, actor, id);
      const { unit } = await this.access.requireUnit(tx, actor, episode.careUnitId, 'write');
      if (unit.kind !== 'EMERGENCY' || isTerminal('episode', episode.status)) throw new ConflictException('Prise en charge aux urgences active requise.');
      await this.lockPatient(tx, actor, episode.patientId);
      if (await tx.hospitalization.findFirst({ where: { clinicId: actor.clinicId, patientId: episode.patientId, status: { in: ['ADMITTED', 'TRANSFERRED'] }, deletedAt: null } })) throw new ConflictException('Patient déjà hospitalisé.');
      const beds = new BedAssignmentService(); await beds.assertAvailable(tx, bedId, actor.clinicId);
      const bed = await tx.bed.findFirstOrThrow({ where: { id: bedId }, include: { room: true } });
      const admission = await tx.hospitalization.create({ data: { clinicId: actor.clinicId, patientId: episode.patientId, physicianId: actor.id, serviceUnitId: bed.room.serviceUnitId, admissionReason: reason, bedNumber: bed.code } });
      await beds.claim(tx, bedId, admission.id);
      const updated = await tx.careEpisode.updateMany({ where: { id, version }, data: { stage: 'DISPOSITION', version: { increment: 1 } } }); this.conflictIfStale(updated.count);
      const workflow = await this.patientWorkflow.transitionDetailed(tx, episode.patientId, 'HOSPITALISE', actor.clinicId);
      if (workflow.outcome === 'blocked' || workflow.outcome === 'not_found') throw new ConflictException('Statut patient incompatible avec l’admission.');
      await this.recordEvent(tx, actor, { careUnitId: unit.id, patientId: episode.patientId, episodeId: id, type: 'ORIENTATION', summary: reason, payload: { outcome: 'HOSPITALIZATION', hospitalizationId: admission.id, bedId } });
      return admission;
    });
  }

  availableAdmissionBeds(careUnitId: string, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      await this.access.requireUnit(tx, actor, careUnitId, 'read');
      return tx.bed.findMany({ where: { status: 'FREE', hospitalizationId: null, room: { serviceUnit: { clinicId: actor.clinicId, category: 'OTHER_CLINICAL', active: true, deletedAt: null } } }, select: { id: true, code: true, room: { select: { name: true } } } });
    });
  }

  registerDelivery(careUnitId: string, dto: RegisterDeliveryDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const { unit } = await this.access.requireUnit(tx, actor, careUnitId, 'write');
      this.requireMaternity(unit); assertEventProfession(actor.primaryRole, 'DELIVERY');
      const motherEpisode = await this.findEpisode(tx, actor, dto.motherEpisodeId);
      if (motherEpisode.careUnitId !== unit.id) throw new BadRequestException('La mère doit être prise en charge dans cette maternité.');
      await this.lockPatient(tx, actor, motherEpisode.patientId);
      const prior = await tx.careEvent.findFirst({ where: { episodeId: motherEpisode.id, type: 'DELIVERY' } });
      if (prior) {
        if ((prior.payload as { operationId?: string } | null)?.operationId !== dto.operationId) throw new ConflictException('Accouchement déjà enregistré.');
        return tx.careEpisode.findMany({ where: { parentEpisodeId: motherEpisode.id }, include: { patient: patientSummary } });
      }
      if (isTerminal('episode', motherEpisode.status)) throw new ConflictException('Prise en charge de la mère clôturée.');
      const mother = await tx.patient.findFirstOrThrow({ where: { id: motherEpisode.patientId, clinicId: actor.clinicId } });
      const at = this.occurredAt(dto.birthAt);
      const updated = await tx.careEpisode.updateMany({ where: { id: motherEpisode.id, version: dto.version }, data: { stage: 'POSTPARTUM', version: { increment: 1 } } });
      this.conflictIfStale(updated.count);
      await this.recordEvent(tx, actor, { careUnitId, patientId: mother.id, episodeId: motherEpisode.id, type: 'DELIVERY', summary: dto.summary, occurredAt: at, payload: { ...dto.details, births: dto.babies.length, operationId: dto.operationId } });
      const babies = [];
      for (const [index, baby] of dto.babies.entries()) {
        const patient = await tx.patient.create({ data: { clinicId: actor.clinicId, firstName: baby.firstName?.trim() || `Nouveau-né ${index + 1}`, lastName: mother.lastName, gender: baby.sex, dateOfBirth: at, motherPatientId: mother.id } });
        const episode = await tx.careEpisode.create({ data: { clinicId: actor.clinicId, patientId: patient.id, careUnitId, status: 'IN_PROGRESS', stage: 'NEWBORN', priority: motherEpisode.priority, startedAt: at, parentEpisodeId: motherEpisode.id, createdById: actor.id } });
        const payload = { birthOrder: index + 1, motherPatientId: mother.id, newbornPatientId: patient.id, newbornEpisodeId: episode.id, measurements: baby.measurements ?? {}, operationId: dto.operationId } as Prisma.InputJsonValue;
        await this.recordEvent(tx, actor, { careUnitId, patientId: patient.id, episodeId: episode.id, type: 'NEWBORN_REGISTERED', summary: 'Naissance enregistrée.', payload, occurredAt: at });
        await this.recordEvent(tx, actor, { careUnitId, patientId: mother.id, episodeId: motherEpisode.id, type: 'BIRTH', summary: `Naissance ${index + 1} enregistrée.`, payload, occurredAt: at });
        babies.push({ ...episode, patient });
      }
      await tx.pregnancy.updateMany({ where: { clinicId: actor.clinicId, patientId: mother.id, status: 'ONGOING' }, data: { status: 'DELIVERED', outcome: 'Accouchement', endedAt: at, version: { increment: 1 } } });
      return babies;
    });
  }

  authorizeClinicalDischarge(patientId: string, careUnitId: string, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      await this.access.requireUnit(tx, actor, careUnitId, 'write');
      if (actor.primaryRole !== 'PHYSICIAN') throw new ForbiddenException('Le médecin doit autoriser la sortie clinique globale.');
      await this.lockPatient(tx, actor, patientId); await this.access.requirePatient(tx, actor, patientId);
      const linked = await tx.careEpisode.count({ where: { clinicId: actor.clinicId, patientId, careUnitId } });
      if (!linked) throw new ForbiddenException('Le patient n’a pas été pris en charge dans cette unité.');
      const pending = await tx.careEpisode.count({ where: { clinicId: actor.clinicId, patientId, status: { in: [...OPEN_EPISODE] } } });
      const tasks = await tx.careTask.count({ where: { clinicId: actor.clinicId, patientId, status: { in: OPEN_TASK } } });
      const requests = await tx.serviceRequest.count({ where: { clinicId: actor.clinicId, patientId, status: { in: ['DRAFT', 'ACTIVE', 'ON_HOLD'] } } });
      const stays = await tx.hospitalization.count({ where: { clinicId: actor.clinicId, patientId, deletedAt: null, status: { in: ['ADMITTED', 'TRANSFERRED'] } } });
      if (pending || tasks || requests || stays) throw new ConflictException('Des soins, demandes ou hospitalisations sont encore ouverts.');
      const patient = await tx.patient.findFirstOrThrow({ where: { id: patientId, clinicId: actor.clinicId } });
      const target = patient.workflowStatus === 'HOSPITALISE' ? 'HOSPITALISE' : 'EN_ATTENTE_VALIDATION_CAISSE';
      const workflow = await this.patientWorkflow.transitionDetailed(tx, patientId, target, actor.clinicId);
      if (workflow.outcome === 'blocked' || workflow.outcome === 'not_found') throw new ConflictException('Le statut patient ne permet pas cette sortie.');
      return this.recordEvent(tx, actor, { careUnitId, patientId, type: 'DISCHARGE_AUTHORIZED', summary: 'Sortie clinique autorisée par le médecin. Caisse en attente.' });
    });
  }

  // ======================================================================= maternity

  private pregnancyData(dto: Partial<CreatePregnancyDto>) {
    const date = (value?: string) => (value === undefined ? undefined : value ? new Date(value) : null);
    const text = (value?: string) => (value === undefined ? undefined : value.trim() || null);
    return {
      lastMenstrualPeriod: date(dto.lastMenstrualPeriod), expectedDeliveryDate: date(dto.expectedDeliveryDate),
      gravida: dto.gravida, parity: dto.parity, riskLevel: text(dto.riskLevel), riskFactors: text(dto.riskFactors),
      bloodGroup: text(dto.bloodGroup), notes: text(dto.notes),
    };
  }

  listPregnancies(careUnitId: string, status: string | undefined, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const { unit } = await this.access.requireUnit(tx, actor, careUnitId, 'read');
      this.requireMaternity(unit);
      const where: Prisma.PregnancyWhereInput = { clinicId: actor.clinicId };
      if (status === 'ONGOING' || status === 'DELIVERED' || status === 'ENDED') where.status = status;
      return tx.pregnancy.findMany({
        where, include: { patient: patientSummary }, orderBy: [{ status: 'asc' }, { expectedDeliveryDate: 'asc' }], take: 500,
      });
    });
  }

  createPregnancy(careUnitId: string, dto: CreatePregnancyDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const { unit } = await this.access.requireUnit(tx, actor, careUnitId, 'write');
      this.requireMaternity(unit);
      assertEventProfession(actor.primaryRole, 'BIRTH');
      await this.access.requirePatient(tx, actor, dto.patientId);
      await this.lockPatient(tx, actor, dto.patientId);
      const ongoing = await tx.pregnancy.findFirst({ where: { clinicId: actor.clinicId, patientId: dto.patientId, status: 'ONGOING' }, select: { id: true } });
      if (ongoing) throw new ConflictException('Cette patiente a déjà une grossesse en cours de suivi.');
      const pregnancy = await tx.pregnancy.create({
        data: { ...this.pregnancyData(dto), clinicId: actor.clinicId, patientId: dto.patientId, createdById: actor.id },
        include: { patient: patientSummary },
      });
      await this.recordEvent(tx, actor, {
        careUnitId: unit.id, patientId: dto.patientId, type: 'PREGNANCY_OPENED', summary: 'Suivi de grossesse ouvert.',
        payload: { pregnancyId: pregnancy.id, expectedDeliveryDate: dto.expectedDeliveryDate ?? null },
      });
      return pregnancy;
    });
  }

  updatePregnancy(careUnitId: string, id: string, dto: UpdatePregnancyDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const { unit } = await this.access.requireUnit(tx, actor, careUnitId, 'write');
      this.requireMaternity(unit);
      assertEventProfession(actor.primaryRole, 'BIRTH');
      const pregnancy = await tx.pregnancy.findFirst({ where: { id, clinicId: actor.clinicId } });
      if (!pregnancy) throw new NotFoundException('Grossesse introuvable.');
      const ending = Boolean(dto.status && dto.status !== 'ONGOING');
      if (ending && !dto.outcome?.trim()) throw new BadRequestException('Indiquez l’issue de la grossesse.');
      const { version: _version, status, outcome, ...fields } = dto;
      void _version;
      const updated = await tx.pregnancy.updateMany({
        where: { id, version: dto.version },
        data: {
          ...this.pregnancyData(fields),
          ...(status ? { status, endedAt: ending ? new Date() : null } : {}),
          ...(outcome !== undefined ? { outcome: outcome.trim() || null } : {}),
          version: { increment: 1 },
        },
      });
      this.conflictIfStale(updated.count);
      await this.recordEvent(tx, actor, {
        careUnitId: unit.id, patientId: pregnancy.patientId, type: 'PREGNANCY_UPDATED',
        summary: ending ? `Grossesse clôturée : ${outcome!.trim()}.` : 'Suivi de grossesse mis à jour.',
        payload: { pregnancyId: id, status: status ?? pregnancy.status },
      });
      return tx.pregnancy.findFirstOrThrow({ where: { id }, include: { patient: patientSummary } });
    });
  }

  /**
   * A newborn always gets its own record, linked to the mother's, and its own
   * stay in the unit. The birth is documented on both stays.
   */
  registerNewborn(careUnitId: string, dto: RegisterNewbornDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const { unit } = await this.access.requireUnit(tx, actor, careUnitId, 'write');
      this.requireMaternity(unit);
      assertEventProfession(actor.primaryRole, 'BIRTH');
      const motherEpisode = await this.findEpisode(tx, actor, dto.motherEpisodeId);
      if (motherEpisode.careUnitId !== unit.id || isTerminal('episode', motherEpisode.status)) {
        throw new BadRequestException('La mère doit être prise en charge dans cette unité.');
      }
      await this.lockPatient(tx, actor, motherEpisode.patientId);
      const existing = await tx.careEvent.findFirst({ where: { episodeId: motherEpisode.id, type: 'BIRTH', payload: { path: ['birthOrder'], equals: dto.birthOrder ?? 1 } } });
      if (existing) throw new ConflictException('Cette naissance est déjà enregistrée pour cette prise en charge.');
      const mother = await tx.patient.findFirstOrThrow({ where: { id: motherEpisode.patientId }, select: { id: true, lastName: true, firstName: true } });
      const birthAt = this.occurredAt(dto.birthAt);
      const order = dto.birthOrder && dto.birthOrder > 1 ? ` ${dto.birthOrder}` : '';
      const sexLabel = dto.sex === 'MALE' ? 'garçon' : dto.sex === 'FEMALE' ? 'fille' : 'sexe à préciser';
      const newborn = await tx.patient.create({
        data: {
          clinicId: actor.clinicId,
          firstName: dto.firstName?.trim() || `Nouveau-né${order}`,
          lastName: mother.lastName,
          gender: dto.sex,
          dateOfBirth: birthAt,
          motherPatientId: mother.id,
        },
        select: { id: true },
      });
      const episode = await tx.careEpisode.create({
        data: {
          clinicId: actor.clinicId, patientId: newborn.id, careUnitId: unit.id, status: 'IN_PROGRESS', stage: 'NEWBORN',
          priority: motherEpisode.priority, startedAt: birthAt, parentEpisodeId: motherEpisode.id, createdById: actor.id,
          reason: `Né(e) de ${mother.firstName} ${mother.lastName}`,
        },
      });
      const measurements = (dto.measurements ?? {}) as Prisma.InputJsonValue;
      await this.recordEvent(tx, actor, {
        careUnitId: unit.id, patientId: newborn.id, episodeId: episode.id, type: 'NEWBORN_REGISTERED',
        summary: `Naissance enregistrée (${sexLabel}).`,
        payload: { motherPatientId: mother.id, motherEpisodeId: motherEpisode.id, birthOrder: dto.birthOrder ?? 1, measurements }, occurredAt: birthAt,
      });
      await this.recordEvent(tx, actor, {
        careUnitId: unit.id, patientId: mother.id, episodeId: motherEpisode.id, type: 'BIRTH',
        summary: `Naissance${order} : ${sexLabel}.`,
        payload: { newbornPatientId: newborn.id, newbornEpisodeId: episode.id, sex: dto.sex, birthOrder: dto.birthOrder ?? 1, measurements }, occurredAt: birthAt,
      });
      if (dto.closePregnancy) {
        await tx.pregnancy.updateMany({
          where: { clinicId: actor.clinicId, patientId: mother.id, status: 'ONGOING' },
          data: { status: 'DELIVERED', outcome: 'Accouchement', endedAt: birthAt, version: { increment: 1 } },
        });
      }
      return tx.careEpisode.findFirstOrThrow({ where: { id: episode.id }, include: { patient: patientSummary } });
    });
  }

  /** Birth and delivery register of the unit over a period (what was documented, nothing derived). */
  maternityRegister(careUnitId: string, from: string | undefined, to: string | undefined, actorInput?: AuthenticatedActor, types?: string, patientId?: string) {
    return this.run(actorInput, async (tx, actor) => {
      await this.access.requireUnit(tx, actor, careUnitId, 'read');
      // Documented clinical events a unit can list over a period (registers, follow-up history, reports).
      const allowed = [
        'DELIVERY', 'BIRTH', 'PRENATAL_VISIT', 'PARTOGRAM_ENTRY', 'POSTPARTUM_CHECK', 'NEWBORN_ASSESSMENT', 'NEWBORN_CARE', 'RESULT_REPORTED',
        'DIALYSIS_PRESCRIPTION', 'DIALYSIS_MONITORING', 'DIALYSIS_INCIDENT', 'MACHINE_MAINTENANCE', 'CONSUMABLE_USED',
        'OPERATIVE_REPORT', 'CHECKLIST_ITEM', 'IMPLANT_USED',
      ];
      const requested = (types ?? 'DELIVERY,BIRTH').split(',').map((item) => item.trim()).filter((item) => allowed.includes(item));
      if (!requested.length) throw new BadRequestException('Types d’événements non pris en charge.');
      const end = to ? new Date(to) : new Date();
      const start = from ? new Date(from) : new Date(end.getTime() - 30 * 86_400_000);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new BadRequestException('Période invalide.');
      return tx.careEvent.findMany({
        where: {
          clinicId: actor.clinicId, careUnitId, type: { in: requested }, correctsEventId: null,
          occurredAt: { gte: start, lte: end }, ...(patientId ? { patientId } : {}),
          // An event later declared erroneous is left out of the register.
          corrections: { none: {} },
        },
        include: { patient: patientSummary, author: userSummary },
        orderBy: { occurredAt: 'asc' },
        take: 2_000,
      });
    });
  }
}
