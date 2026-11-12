import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationPriority, NotificationType, Prisma, RoleSlug } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

type CareWorkflowPayload = {
  careUnitId?: string | null;
  recipientUserIds?: string[];
  excludeUserId?: string;
  patientId?: string | null;
  title: string;
  message: string;
  relatedEntity: string;
  relatedId: string;
};

type PrescriptionRoutingPayload = {
  patientId: string;
  prescriptionId: string;
  invoiceId: string;
  covered: boolean;
};

/**
 * Durable notification delivery. This deliberately handles only events written
 * by the current Core workflows; other legacy notifications retain their
 * existing behaviour until migrated individually.
 */
@Injectable()
export class NotificationOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationOutboxService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.drain(), 5_000);
    this.timer.unref();
    void this.drain();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      // A worker interrupted while processing is safely reclaimed later.
      const staleBefore = new Date(Date.now() - 60_000);
      await this.prisma.notificationOutbox.updateMany({
        where: { status: 'PROCESSING', updatedAt: { lt: staleBefore } },
        data: { status: 'PENDING', availableAt: new Date() },
      });

      const events = await this.prisma.notificationOutbox.findMany({
        where: { status: 'PENDING', availableAt: { lte: new Date() } },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const event of events) await this.deliver(event.id);
    } finally {
      this.running = false;
    }
  }

  private async deliver(eventId: string) {
    const claimed = await this.prisma.notificationOutbox.updateMany({
      where: { id: eventId, status: 'PENDING', availableAt: { lte: new Date() } },
      data: { status: 'PROCESSING', attempts: { increment: 1 }, lastError: null },
    });
    if (claimed.count !== 1) return;

    try {
      const notifications = await this.prisma.$transaction(async (tx) => {
        const event = await tx.notificationOutbox.findUniqueOrThrow({ where: { id: eventId } });
        if (event.eventType === 'CARE_WORKFLOW') return this.deliverCareWorkflow(tx, event);
        if (event.eventType !== 'PRESCRIPTION_ROUTING') {
          // Never leave an unknown event cycling between PENDING and PROCESSING.
          await tx.notificationOutbox.update({
            where: { id: event.id },
            data: { status: 'FAILED', processedAt: new Date(), lastError: `Type d'événement non pris en charge : ${event.eventType}` },
          });
          return [];
        }
        const payload = event.payload as unknown as PrescriptionRoutingPayload;
        const targetRole = payload.covered ? RoleSlug.PHARMACIST : RoleSlug.CASHIER;
        const recipients = await tx.user.findMany({
          where: {
            clinicId: event.clinicId,
            status: 'ACTIVE', deletedAt: null,
            OR: [{ primaryRole: targetRole }, { roles: { some: { role: { slug: targetRole } } } }],
          },
          select: { id: true },
        });
        const pharmacistsOrCashiers = recipients.map((recipient) => recipient.id);
        const receptionistIds = payload.covered
          ? (await tx.user.findMany({
            where: {
              clinicId: event.clinicId,
              status: 'ACTIVE', deletedAt: null,
              OR: [{ primaryRole: RoleSlug.RECEPTIONIST }, { roles: { some: { role: { slug: RoleSlug.RECEPTIONIST } } } }],
            }, select: { id: true },
          })).map((recipient) => recipient.id)
          : [];

        const uniqueRecipientIds = [...new Set([...pharmacistsOrCashiers, ...receptionistIds])];
        const persisted = [];
        for (const recipientId of uniqueRecipientIds) {
          const isReception = receptionistIds.includes(recipientId) && !pharmacistsOrCashiers.includes(recipientId);
          const notification = await tx.notification.upsert({
            where: { outboxEventId_recipientId: { outboxEventId: event.id, recipientId } },
            create: {
              outboxEventId: event.id, recipientId, patientId: payload.patientId,
              type: isReception ? NotificationType.SYSTEM : NotificationType.TASK,
              priority: NotificationPriority.MEDIUM,
              title: isReception ? 'Ordonnance prise en charge par abonnement' : payload.covered ? 'Ordonnance prise en charge' : 'Paiement ordonnance requis',
              message: isReception
                ? 'L’ordonnance a été transmise à la pharmacie et ajoutée à la facture entreprise.'
                : payload.covered
                ? 'Une ordonnance prise en charge est disponible à la pharmacie.'
                : 'Une ordonnance est en attente de paiement à la caisse.',
              relatedEntity: 'Prescription', relatedId: payload.prescriptionId,
            }, update: {},
          });
          persisted.push(notification);
        }
        await tx.notificationOutbox.update({ where: { id: event.id }, data: { status: 'DELIVERED', processedAt: new Date() } });
        return persisted;
      });
      for (const notification of notifications) {
        try {
          this.gateway.notifyToUser(notification.recipientId!, 'notification.created', notification);
        } catch {
          // The persistent notification is the source of truth. A reconnect
          // will fetch it even when the best-effort live socket is unavailable.
        }
      }
    } catch (error) {
      const attempts = await this.prisma.notificationOutbox.findUnique({ where: { id: eventId }, select: { attempts: true } });
      const retryMs = Math.min(300_000, 1_000 * 2 ** Math.min(8, attempts?.attempts || 1));
      await this.prisma.notificationOutbox.update({
        where: { id: eventId },
        data: {
          status: (attempts?.attempts || 0) >= 10 ? 'FAILED' : 'PENDING',
          availableAt: new Date(Date.now() + retryMs),
          lastError: error instanceof Error ? error.message.slice(0, 1_000) : 'Unknown delivery error',
        },
      });
      this.logger.warn(`Notification outbox event ${eventId} will be retried.`);
    }
  }

  /**
   * Care Workflow Engine notification: explicit recipients and/or every active
   * member of the target unit, never the author of the action.
   */
  private async deliverCareWorkflow(
    tx: Prisma.TransactionClient,
    event: { id: string; clinicId: string; payload: Prisma.JsonValue },
  ) {
    const payload = event.payload as unknown as CareWorkflowPayload;
    const now = new Date();
    const unitMembers = payload.careUnitId
      ? (await tx.careUnitAssignment.findMany({
        where: {
          careUnitId: payload.careUnitId, clinicId: event.clinicId, active: true,
          unitRole: { in: ['MEMBER', 'LEAD'] }, startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        select: { userId: true },
      })).map((assignment) => assignment.userId)
      : [];
    const candidates = [...new Set([...(payload.recipientUserIds ?? []), ...unitMembers])]
      .filter((userId) => userId && userId !== payload.excludeUserId);
    const recipients = candidates.length
      ? await tx.user.findMany({
        where: { id: { in: candidates }, clinicId: event.clinicId, status: 'ACTIVE', deletedAt: null },
        select: { id: true },
      })
      : [];
    const persisted = [];
    for (const { id: recipientId } of recipients) {
      persisted.push(await tx.notification.upsert({
        where: { outboxEventId_recipientId: { outboxEventId: event.id, recipientId } },
        create: {
          outboxEventId: event.id, recipientId, patientId: payload.patientId ?? undefined,
          type: NotificationType.TASK, priority: NotificationPriority.MEDIUM,
          title: payload.title.slice(0, 255), message: payload.message,
          relatedEntity: payload.relatedEntity, relatedId: payload.relatedId,
        },
        update: {},
      }));
    }
    await tx.notificationOutbox.update({ where: { id: event.id }, data: { status: 'DELIVERED', processedAt: new Date() } });
    return persisted;
  }
}
