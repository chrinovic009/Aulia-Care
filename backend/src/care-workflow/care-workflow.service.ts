import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CareTaskStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuthenticatedActor, OperationalClinicActor } from '../core/clinic-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { CareAccessService, Db } from './care-access.service';
import {
  ENTERED_IN_ERROR_EVENT,
  assertClosable,
  assertCorrection,
  assertReassignment,
  assertTransition,
  closureRequirementsFromSettings,
  isTerminal,
} from './domain/workflow-rules';
import {
  AssignTaskDto,
  CancelTransferDto,
  ChangeEpisodeStatusDto,
  ChangeServiceRequestStatusDto,
  ChangeTaskStatusDto,
  CorrectCareEventDto,
  CreateServiceRequestDto,
  CARE_PRIORITIES as CARE_PRIORITY_VALUES,
  DecideTransferDto,
  MergeProvisionalPatientDto,
  OpenEpisodeDto,
  RegisterArrivalDto,
  RecordCareEventDto,
  SendTransferDto,
  UpdateEpisodeDto,
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
  ) {}

  // ======================================================================= helpers

  private run<T>(actorInput: AuthenticatedActor | undefined, work: (tx: Db, actor: OperationalClinicActor) => Promise<T>): Promise<T> {
    return this.access.actor(actorInput).then((actor) => this.prisma.$transaction((tx) => work(tx, actor)));
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
            events: { where: { type: 'TRIAGE' }, select: { id: true, payload: true, occurredAt: true }, orderBy: { occurredAt: 'desc' }, take: 1 },
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

  // ======================================================================= episodes

  openEpisode(dto: OpenEpisodeDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const { unit } = await this.access.requireUnit(tx, actor, dto.careUnitId, 'write');
      await this.access.requirePatient(tx, actor, dto.patientId);
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
      const reason = assertTransition('episode', episode.status, dto.status, dto.reason);
      if (dto.status === 'COMPLETED') {
        const events = await tx.careEvent.findMany({ where: { episodeId: episode.id }, select: { id: true, type: true, correctsEventId: true } });
        assertClosable(closureRequirementsFromSettings(unit.settings), events);
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

      const data: Prisma.CareEpisodeUncheckedUpdateManyInput = {};
      const changes: Record<string, unknown> = {};
      if (dto.stage !== undefined && dto.stage !== episode.stage) {
        const stages = (unit.settings as { stages?: unknown } | null)?.stages;
        if (Array.isArray(stages) && stages.length && !stages.includes(dto.stage)) {
          throw new BadRequestException(`Étape « ${dto.stage} » non prévue par la configuration de l’unité.`);
        }
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
      const draft = dto.draft ?? false;
      const request = await tx.serviceRequest.create({
        data: {
          clinicId: actor.clinicId,
          patientId: dto.patientId,
          episodeId: dto.episodeId ?? null,
          requesterId: actor.id,
          requesterUnitId: dto.requesterUnitId ?? null,
          performerUnitId: performer.id,
          category: dto.category.trim(),
          code: dto.code.trim(),
          label: dto.label.trim(),
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
      if (!draft) await this.dispatchRequest(tx, actor, request, performer.name);
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

      if (dto.status === 'REVOKED' || dto.status === 'ENTERED_IN_ERROR') {
        for (const task of openTasks) {
          await tx.careTask.update({
            where: { id: task.id },
            data: { status: 'CANCELLED', statusReason: `Demande annulée : ${reason}`, version: { increment: 1 } },
          });
        }
      }
      const performer = await this.access.findUnit(tx, actor, request.performerUnitId);
      if (request.status === 'DRAFT' && dto.status === 'ACTIVE') {
        await this.dispatchRequest(tx, actor, request, performer.name);
      }
      await this.recordEvent(tx, actor, {
        careUnitId: dto.status === 'COMPLETED' ? request.performerUnitId : request.requesterUnitId,
        patientId: request.patientId, episodeId: request.episodeId, requestId: id,
        type: 'REQUEST_STATUS_CHANGED',
        summary: `Demande « ${request.label} » : ${request.status} → ${dto.status}.`,
        payload: { from: request.status, to: dto.status, reason, cancelledTasks: openTasks.map((task) => task.id) } as Prisma.InputJsonValue,
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
      if (patientId) await this.access.requirePatient(tx, actor, patientId);
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
      return this.recordEvent(tx, actor, {
        careUnitId: unit.id, patientId, episodeId: dto.episodeId, requestId: dto.requestId, taskId: dto.taskId,
        type: dto.type,
        summary: dto.summary.trim(),
        payload,
        occurredAt: this.occurredAt(dto.occurredAt),
        requiresValidation: dto.requiresValidation ?? false,
      });
    });
  }

  /** Stage / priority / location change carried by an event, under optimistic versioning. */
  private async progressEpisode(
    tx: Db,
    actor: OperationalClinicActor,
    unit: { id: string; settings: Prisma.JsonValue | null },
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
      if (!original!.careUnitId) throw new ForbiddenException('Cet événement système ne peut pas être corrigé manuellement.');
      await this.access.requireUnit(tx, actor, original!.careUnitId, 'write');
      const alreadyCorrected = await tx.careEvent.findFirst({ where: { correctsEventId: id }, select: { id: true } });
      if (alreadyCorrected) throw new ConflictException('Cet événement a déjà été corrigé : corrigez la dernière version.');
      if (!dto.retract && !dto.summary) throw new BadRequestException('Une correction doit contenir la nouvelle information.');
      return this.recordEvent(tx, actor, {
        careUnitId: original!.careUnitId, patientId: original!.patientId, episodeId: original!.episodeId,
        requestId: original!.requestId, taskId: original!.taskId, transferId: original!.transferId,
        type: dto.retract ? ENTERED_IN_ERROR_EVENT : original!.type,
        summary: dto.retract ? `Saisie retirée : ${original!.summary}` : dto.summary!.trim(),
        payload: dto.retract ? undefined : (dto.payload as Prisma.InputJsonValue | undefined) ?? (original!.payload as Prisma.InputJsonValue | undefined),
        occurredAt: original!.occurredAt,
        requiresValidation: dto.retract ? false : original!.requiresValidation,
        correctsEventId: id,
        correctionReason: reason,
      });
    });
  }

  validateCareEvent(id: string, dto: ValidateCareEventDto, actorInput?: AuthenticatedActor) {
    return this.run(actorInput, async (tx, actor) => {
      const original = await tx.careEvent.findFirst({ where: { id, clinicId: actor.clinicId } });
      if (!original) throw new NotFoundException('Événement introuvable.');
      if (!original.requiresValidation) throw new BadRequestException('Cet événement ne requiert pas de validation.');
      if (!original.careUnitId) throw new ForbiddenException('Événement sans unité : validation impossible.');
      await this.access.requireUnit(tx, actor, original.careUnitId, 'validate');
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
        summary: dto.provisional ? `Arrivée sous identité provisoire dans l’unité ${unit.name}.` : `Arrivée dans l’unité ${unit.name}.`,
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
}
