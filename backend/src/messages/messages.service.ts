import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatMessage, MessageKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { MediaUpload, MessageMediaService } from './message-media.service';

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, displayName: true, username: true } },
  recipient: { select: { id: true, displayName: true, username: true } },
} satisfies Prisma.ChatMessageInclude;

const IMAGING_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true, portalUserId: true } },
  requestedBy: { select: { id: true, displayName: true } },
  imagingCatalogue: { select: { name: true } },
  report: {
    select: {
      verified: true,
      findings: true,
      impression: true,
      recommendations: true,
      dicomStudyInstanceUid: true,
      imagePaths: true,
      interpretedById: true,
      radiologistId: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.ImagingRequestInclude;

type ChatWithPeople = Prisma.ChatMessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;
type ImagingWithReport = Prisma.ImagingRequestGetPayload<{ include: typeof IMAGING_INCLUDE }>;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly media: MessageMediaService,
  ) {}

  private async requireActiveActor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { clinicId: true, primaryRole: true, status: true, deletedAt: true },
    });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt !== null || !user.clinicId) {
      throw new ForbiddenException('Aucun établissement actif n’est associé à cet utilisateur.');
    }
    return user;
  }

  /** The tenant and the care relationship are always resolved server-side. */
  private async assertConversationAllowed(userId: string, contactId: string): Promise<string> {
    const allowed = await this.usersService.isDirectMessagingAllowed(userId, contactId);
    if (!allowed) {
      throw new ForbiddenException('Cette conversation n’est pas autorisée pour votre rôle, votre établissement ou votre parcours de soins.');
    }
    return (await this.requireActiveActor(userId)).clinicId!;
  }

  private serializeMessage(message: ChatMessage, imaging: Awaited<ReturnType<MessagesService['serializeImaging']>> | null = null) {
    return {
      id: message.id,
      senderId: message.senderId,
      recipientId: message.recipientId,
      recipientType: message.recipientType,
      text: message.text,
      kind: message.kind,
      status: message.status,
      createdAt: message.createdAt,
      deliveredAt: message.deliveredAt,
      readAt: message.readAt,
      attachmentUrl: message.kind === 'PHOTO' || message.kind === 'VOICE' || imaging?.hasPreview
        ? `/messages/${message.id}/attachment`
        : null,
      attachmentName: message.attachmentOriginalName,
      attachmentMimeType: message.attachmentMimeType,
      attachmentSizeBytes: message.attachmentSizeBytes,
      audioDurationMs: message.audioDurationMs,
      imaging,
    };
  }

  private async serializeImaging(request: ImagingWithReport) {
    return {
      id: request.id,
      modality: request.modality,
      bodyPart: request.bodyPart,
      examName: request.imagingCatalogue?.name || request.examSubType || request.bodyPart,
      status: request.status,
      patientName: [request.patient.firstName, request.patient.lastName].filter(Boolean).join(' '),
      requestedByName: request.requestedBy?.displayName || 'Médecin demandeur',
      verified: Boolean(request.report?.verified),
      findings: request.report?.findings || null,
      impression: request.report?.impression || null,
      recommendations: request.report?.recommendations || null,
      dicomStudyInstanceUid: request.report?.dicomStudyInstanceUid || null,
      hasPreview: await this.media.hasClinicPacsPreview(request.clinicId, request.report?.imagePaths || [], request.report?.dicomStudyInstanceUid),
    };
  }

  private async imagingByIds(clinicId: string, ids: string[]) {
    if (!ids.length) return new Map<string, Awaited<ReturnType<MessagesService['serializeImaging']>>>();
    const requests = await this.prisma.imagingRequest.findMany({
      where: { id: { in: ids }, clinicId, deletedAt: null },
      include: IMAGING_INCLUDE,
    });
    return new Map(await Promise.all(requests.map(async request => [request.id, await this.serializeImaging(request)] as const)));
  }

  async findConversation(userId: string, contactId: string) {
    const clinicId = await this.assertConversationAllowed(userId, contactId);
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        clinicId,
        deletedAt: null,
        OR: [
          { senderId: userId, recipientId: contactId },
          { senderId: contactId, recipientId: userId },
        ],
      },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const actor = await this.requireActiveActor(userId);
    const visibleRows = actor.primaryRole === 'PATIENT'
      ? rows.filter(row => row.kind !== 'IMAGING' || (row.recipientId === userId && Boolean(row.patientShareAuthorizedAt)))
      : rows;
    const imaging = await this.imagingByIds(clinicId, [...new Set(visibleRows.map(row => row.imagingRequestId).filter((id): id is string => Boolean(id)))]);
    return visibleRows.map(row => this.serializeMessage(row, row.imagingRequestId ? imaging.get(row.imagingRequestId) || null : null));
  }

  async findUnread(userId: string) {
    const user = await this.requireActiveActor(userId);
    const unread = await this.prisma.chatMessage.findMany({
      where: { clinicId: user.clinicId!, recipientId: userId, status: { in: ['SENT', 'DELIVERED'] }, deletedAt: null },
      include: { sender: MESSAGE_INCLUDE.sender },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const allowed = await Promise.all(unread.map(async message => ({
      message,
      permitted: await this.usersService.isDirectMessagingAllowed(userId, message.senderId),
    })));
    return allowed.filter(item => item.permitted).map(item => this.serializeMessage(item.message));
  }

  async createMediaMessage(userId: string, contactId: string, upload: MediaUpload, rawKind: string, caption = '', durationMs?: number) {
    const kind = String(rawKind || '').toUpperCase();
    if (kind !== 'PHOTO' && kind !== 'VOICE') throw new BadRequestException('Seules les photos et les notes vocales utilisent ce canal.');
    if (caption.length > 2000) throw new BadRequestException('La légende ne doit pas dépasser 2 000 caractères.');
    const clinicId = await this.assertConversationAllowed(userId, contactId);
    const recipient = await this.requireActiveActor(contactId);
    if (recipient.clinicId !== clinicId) throw new ForbiddenException('Destinataire hors établissement.');
    const savedMedia = await this.media.save(upload, kind, durationMs);
    try {
      const saved = await this.prisma.$transaction(async tx => {
        const message = await tx.chatMessage.create({
          data: {
            clinicId,
            senderId: userId,
            recipientId: contactId,
            recipientType: recipient.primaryRole === 'PATIENT' ? 'PATIENT' : 'USER',
            text: caption.trim(),
            kind: kind as MessageKind,
            attachmentStorageKey: savedMedia.storageKey,
            attachmentOriginalName: savedMedia.originalName,
            attachmentMimeType: savedMedia.mimeType,
            attachmentSizeBytes: savedMedia.sizeBytes,
            audioDurationMs: savedMedia.durationMs,
          },
          include: MESSAGE_INCLUDE,
        });
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: 'CREATE',
            entity: 'ChatMessage',
            entityId: message.id,
            summary: kind === 'PHOTO' ? 'Envoi d’une photo privée' : 'Envoi d’une note vocale privée',
            metadata: { kind, recipientId: contactId, sizeBytes: savedMedia.sizeBytes },
          },
        });
        return message;
      });
      this.publishMedia(saved);
      return this.serializeMessage(saved);
    } catch (error) {
      await this.media.discard(savedMedia.storageKey);
      throw error;
    }
  }

  async findAvailableImaging(userId: string, contactId: string) {
    const clinicId = await this.assertConversationAllowed(userId, contactId);
    const recipient = await this.requireActiveActor(contactId);
    const requests = await this.prisma.imagingRequest.findMany({
      where: {
        clinicId,
        deletedAt: null,
        status: { in: ['COMPLETED', 'VERIFIED'] },
        report: { is: { deletedAt: null } },
        OR: [
          { requestedById: userId },
          { report: { is: { OR: [{ interpretedById: userId }, { radiologistId: userId }] } } },
        ],
      },
      include: IMAGING_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return Promise.all(requests
      .filter(request => recipient.primaryRole === 'PATIENT'
        ? request.patient.portalUserId === contactId && request.report?.verified
        : this.isRequestProfessional(request, contactId))
      .map(request => this.serializeImaging(request)));
  }

  async createImagingMessage(userId: string, contactId: string, imagingRequestId: string, caption = '', authorizePatient = false) {
    if (!imagingRequestId) throw new BadRequestException('Choisissez un examen d’imagerie.');
    if (caption.length > 2000) throw new BadRequestException('Le commentaire ne doit pas dépasser 2 000 caractères.');
    const clinicId = await this.assertConversationAllowed(userId, contactId);
    const recipient = await this.requireActiveActor(contactId);
    if (recipient.clinicId !== clinicId) throw new ForbiddenException('Destinataire hors établissement.');
    const request = await this.prisma.imagingRequest.findFirst({
      where: { id: imagingRequestId, clinicId, deletedAt: null, report: { is: { deletedAt: null } } },
      include: IMAGING_INCLUDE,
    });
    if (!request || !this.isRequestProfessional(request, userId)) {
      throw new ForbiddenException('Seuls le médecin demandeur et le radiologue de cet examen peuvent le partager.');
    }

    const forPatient = recipient.primaryRole === 'PATIENT';
    if (forPatient) {
      if (!authorizePatient) throw new ForbiddenException('Une autorisation explicite est requise avant le partage au patient.');
      if (request.patient.portalUserId !== contactId) throw new ForbiddenException('Cette imagerie appartient à un autre patient.');
      if (!request.report?.verified) throw new ForbiddenException('Seule une imagerie avec compte rendu vérifié peut être partagée au patient.');
    } else if (!this.isRequestProfessional(request, contactId)) {
      throw new ForbiddenException('Le destinataire doit être le médecin demandeur ou le radiologue de cet examen.');
    }

    const saved = await this.prisma.$transaction(async tx => {
      const message = await tx.chatMessage.create({
        data: {
          clinicId,
          senderId: userId,
          recipientId: contactId,
          recipientType: forPatient ? 'PATIENT' : 'USER',
          text: caption.trim(),
          kind: 'IMAGING',
          imagingRequestId: request.id,
          patientShareAuthorizedById: forPatient ? userId : null,
          patientShareAuthorizedAt: forPatient ? new Date() : null,
        },
        include: MESSAGE_INCLUDE,
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          patientId: request.patient.id,
          action: 'CREATE',
          entity: 'ChatMessage',
          entityId: message.id,
          summary: forPatient ? 'Partage autorisé d’une imagerie au patient' : 'Partage d’une imagerie entre professionnels de l’examen',
          metadata: { imagingRequestId: request.id, recipientId: contactId, patientShareAuthorized: forPatient },
        },
      });
      return message;
    });
    const imaging = await this.serializeImaging(request);
    this.publishMedia(saved, imaging);
    return this.serializeMessage(saved, imaging);
  }

  async getAttachment(userId: string, messageId: string) {
    const actor = await this.requireActiveActor(userId);
    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        clinicId: actor.clinicId!,
        deletedAt: null,
        OR: [{ senderId: userId }, { recipientId: userId }],
      },
    });
    if (!message) throw new NotFoundException('Pièce jointe introuvable.');
    const contactId = message.senderId === userId ? message.recipientId : message.senderId;
    await this.assertConversationAllowed(userId, contactId);
    if (actor.primaryRole === 'PATIENT' && message.kind === 'IMAGING' && (message.recipientId !== userId || !message.patientShareAuthorizedAt)) {
      throw new ForbiddenException('Cette imagerie n’a pas été autorisée pour ce patient.');
    }

    if (message.kind === 'PHOTO' || message.kind === 'VOICE') {
      if (!message.attachmentStorageKey || !message.attachmentMimeType) throw new NotFoundException('Pièce jointe introuvable.');
      const opened = await this.media.open(message.attachmentStorageKey);
      return { ...opened, mimeType: message.attachmentMimeType, filename: message.attachmentOriginalName || 'piece-jointe' };
    }
    if (message.kind === 'IMAGING' && message.imagingRequestId) {
      const request = await this.prisma.imagingRequest.findFirst({
        where: { id: message.imagingRequestId, clinicId: actor.clinicId!, deletedAt: null },
        include: IMAGING_INCLUDE,
      });
      const preview = request?.report?.imagePaths.find(value => /\.(?:jpe?g|png|webp)$/i.test(value));
      const hasPreview = request ? await this.media.hasClinicPacsPreview(request.clinicId, request.report?.imagePaths || [], request.report?.dicomStudyInstanceUid) : false;
      if (!request || !hasPreview || !this.isRequestProfessional(request, userId) && actor.primaryRole !== 'PATIENT') {
        throw new NotFoundException('Aucun aperçu PACS partageable pour cet examen.');
      }
      if (actor.primaryRole === 'PATIENT' && request.patient.portalUserId !== userId) {
        throw new ForbiddenException('Cette imagerie appartient à un autre patient.');
      }
      const opened = await this.media.openPacsPreview(preview, request.report?.dicomStudyInstanceUid, request.clinicId);
      return { ...opened, filename: `imagerie-${request.id}.jpg` };
    }
    throw new NotFoundException('Ce message ne contient aucune pièce jointe.');
  }

  async markRead(userId: string, senderId: string, messageIds?: string[]) {
    const clinicId = await this.assertConversationAllowed(userId, senderId);
    return this.prisma.chatMessage.updateMany({
      where: {
        clinicId,
        recipientId: userId,
        senderId,
        ...(messageIds?.length ? { id: { in: messageIds } } : {}),
        status: { not: 'READ' },
        deletedAt: null,
      },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  private isRequestProfessional(request: ImagingWithReport, userId: string) {
    return request.requestedById === userId || request.report?.interpretedById === userId || request.report?.radiologistId === userId;
  }

  private publishMedia(message: ChatWithPeople, imaging: Awaited<ReturnType<MessagesService['serializeImaging']>> | null = null) {
    PrismaService.realtimeEvents.emit('message.media.created', {
      ...this.serializeMessage(message, imaging),
      senderName: message.sender.displayName || message.sender.username,
      recipientName: message.recipient.displayName || message.recipient.username,
      sentAt: message.createdAt.toISOString(),
    });
  }
}
