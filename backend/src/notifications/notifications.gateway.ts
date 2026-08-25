import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = (process.env.CORS_ORIGIN || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      // Non-browser clients do not send Origin; browser origins must be explicitly allowed.
      callback(null, !origin || allowedOrigins.includes(origin));
    },
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly socketsByUser = new Map<string, Set<string>>();
  /** Audio/video never reaches this server. Lifecycle state is persisted in
   * PostgreSQL so a Redis-adapted Socket.IO cluster can handle either endpoint. */

  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit() {
    PrismaService.realtimeEvents.on('db.changed', (payload) => {
      void this.publishDatabaseChange(payload);
    });
  }

  async handleConnection(client: Socket) {
    const cookieToken = String(client.handshake.headers.cookie || '')
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('aulia_access_token='))
      ?.slice('aulia_access_token='.length);
    const rawToken = cookieToken || client.handshake.headers.authorization;
    const token = typeof rawToken === 'string' ? rawToken.replace(/^Bearer\s+/i, '').trim() : '';
    if (!token) return client.disconnect(true);

    try {
      const payload = await this.jwtService.verifyAsync<{ sub?: string; type?: string }>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
      if (!payload.sub || payload.type === 'refresh') return client.disconnect(true);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, status: true, deletedAt: true, clinicId: true, primaryRole: true },
      });
      if (!user || user.deletedAt || user.status !== 'ACTIVE') return client.disconnect(true);
      await this.registerClient(client, user);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (typeof userId !== 'string') return;

    const sockets = this.socketsByUser.get(userId);
    if (!sockets) return;

    sockets.delete(client.id);
    if (sockets.size === 0) {
      this.socketsByUser.delete(userId);
      // Presence is metadata. It is deliberately only visible to the user’s own
      // authenticated sessions, never broadcast to every connected client.
      this.server.to(this.userRoom(userId)).emit('user.presence', { online: false });
    }
  }

  @SubscribeMessage('user.join')
  handleUserJoin(@ConnectedSocket() client: Socket) {
    if (!client.data.userId) throw new WsException('Connexion WebSocket non authentifiée');
  }

  @SubscribeMessage('message.send')
  async handleMessageSend(
    @MessageBody()
    payload: {
      id?: string;
      senderId: string;
      senderName: string;
      recipientId: string;
      recipientName?: string;
      recipientType?: 'USER' | 'PATIENT';
      text: string;
      sentAt?: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const authenticatedSenderId = client.data.userId as string | undefined;
    if (!authenticatedSenderId || !payload?.recipientId || !payload?.text?.trim()) {
      throw new WsException('Message invalide');
    }

    // The sender identity always comes from the verified socket, never from the browser payload.
    payload.senderId = authenticatedSenderId;

    const sender = await this.usersService.findOne(payload.senderId);
    const recipient = await this.usersService.findOne(payload.recipientId);
    const senderRole = String(sender.primaryRole || '').toUpperCase();
    const recipientRole = String(recipient.primaryRole || '').toUpperCase();
    const isAdminPatientConversation =
      (['ADMIN', 'SUPER_ADMIN'].includes(senderRole) && recipientRole === 'PATIENT') ||
      (['ADMIN', 'SUPER_ADMIN'].includes(recipientRole) && senderRole === 'PATIENT');
    if (isAdminPatientConversation) {
      throw new WsException('La messagerie directe entre administration et patient est interdite. Utilisez le canal clinique approprié.');
    }
    if (!await this.usersService.isDirectMessagingAllowed(sender.id, payload.recipientId)) {
      throw new WsException('Destinataire non autorise');
    }

    const delivered = await this.isUserOnline(payload.recipientId);
    const saved = await this.prisma.chatMessage.create({
      data: {
        ...(payload.id ? { id: payload.id } : {}),
        senderId: payload.senderId,
        recipientId: payload.recipientId,
        recipientType: payload.recipientType || 'USER',
        text: payload.text.trim(),
        status: delivered ? 'DELIVERED' : 'SENT',
        deliveredAt: delivered ? new Date() : null,
        createdAt: payload.sentAt ? new Date(payload.sentAt) : new Date(),
      },
    });

    const message = {
      id: saved.id,
      senderId: payload.senderId,
      senderName: payload.senderName,
      recipientId: payload.recipientId,
      recipientName: payload.recipientName,
      recipientType: payload.recipientType || 'USER',
      text: saved.text,
      sentAt: saved.createdAt.toISOString(),
    };

    this.server.to(this.userRoom(payload.recipientId)).emit('message.received', message);
    client.emit('message.sent', { ...message, status: delivered ? 'delivered' : 'sent' });
    client.emit('message.status', {
      messageId: message.id,
      contactId: payload.recipientId,
      status: delivered ? 'delivered' : 'sent',
    });
    return { ...message, status: delivered ? 'delivered' : 'sent' };
  }

  @SubscribeMessage('message.read')
  handleMessageRead(
    @MessageBody() payload: { readerId?: string; senderId?: string; messageIds?: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    const readerId = client.data.userId as string | undefined;
    if (!readerId || !payload?.senderId) return;

    if (payload.messageIds?.length) {
      this.prisma.chatMessage
        .updateMany({
          where: {
            id: { in: payload.messageIds },
            senderId: payload.senderId,
            recipientId: readerId,
          },
          data: {
            status: 'READ',
            readAt: new Date(),
          },
        })
        .catch(() => undefined);
    }

    this.server.to(this.userRoom(payload.senderId)).emit('message.read', {
      readerId,
      messageIds: payload.messageIds || [],
      readAt: new Date().toISOString(),
    });
  }

  @SubscribeMessage('message.typing')
  async handleTyping(
    @MessageBody() payload: { senderId?: string; recipientId?: string; isTyping?: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const senderId = client.data.userId as string | undefined;
    if (!senderId || !payload?.recipientId) return;
    if (!await this.usersService.isDirectMessagingAllowed(senderId, payload.recipientId)) {
      throw new WsException('Destinataire non autorisé');
    }

    this.server.to(this.userRoom(payload.recipientId)).emit('message.typing', {
      senderId,
      isTyping: Boolean(payload.isTyping),
    });
  }

  @SubscribeMessage('telehealth.start')
  async startTelehealthCall(
    @MessageBody() payload: { consultationId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const doctorId = client.data.userId as string | undefined;
    if (!doctorId || !payload?.consultationId) throw new WsException('Consultation requise.');
    const consultation: any = await (this.prisma as any).consultation.findUnique({
      where: { id: payload.consultationId },
      select: {
        id: true,
        providerId: true,
        status: true,
        encounterType: true,
        deletedAt: true,
        patient: { select: { id: true, portalUserId: true, firstName: true, lastName: true } },
        provider: { select: { displayName: true } },
      },
    });
    const doctor = await this.prisma.user.findUnique({ where: { id: doctorId }, select: { primaryRole: true, status: true, deletedAt: true } });
    if (!doctor || doctor.primaryRole !== 'PHYSICIAN' || doctor.status !== 'ACTIVE' || doctor.deletedAt) {
      throw new WsException('Seul le médecin connecté et actif peut lancer une téléconsultation.');
    }
    if (!consultation || consultation.deletedAt || consultation.providerId !== doctorId) {
      throw new WsException('Cette consultation ne vous appartient pas.');
    }
    if (consultation.status === 'FINALIZED' || consultation.status === 'CANCELLED' || consultation.encounterType !== 'TELEHEALTH') {
      throw new WsException('Cette consultation n’est pas une télésanté active.');
    }
    if (!consultation.patient.portalUserId) throw new WsException('Le patient ne possède pas de compte de télésanté explicitement lié.');
    const patientUser = await this.prisma.user.findUnique({ where: { id: consultation.patient.portalUserId }, select: { id: true, primaryRole: true, status: true, deletedAt: true } });
    if (!patientUser || patientUser.primaryRole !== 'PATIENT' || patientUser.status !== 'ACTIVE' || patientUser.deletedAt) throw new WsException('Le compte patient lié n’est pas actif.');

    const now = new Date();
    const call = await (this.prisma as any).telehealthSession.create({
      data: {
        id: randomUUID(), consultationId: consultation.id, doctorId, patientId: consultation.patient.id,
        patientUserId: patientUser.id, status: 'RINGING', expiresAt: new Date(now.getTime() + 90_000),
      },
    });
    this.scheduleTelehealthExpiry(call.id, call.expiresAt);
    this.server.to(this.userRoom(patientUser.id)).emit('telehealth.incoming', {
      callId: call.id,
      consultationId: call.consultationId,
      doctorName: consultation.provider?.displayName || 'Votre médecin',
      expiresAt: call.expiresAt.toISOString(),
    });
    client.emit('telehealth.ringing', { callId: call.id, expiresAt: call.expiresAt.toISOString() });
    return { callId: call.id, expiresAt: call.expiresAt.toISOString() };
  }

  @SubscribeMessage('telehealth.accept')
  async acceptTelehealthCall(@MessageBody() payload: { callId?: string; transcriptionConsent?: boolean }, @ConnectedSocket() client: Socket) {
    const call = await this.getTelehealthCall(payload?.callId, client.data.userId);
    if (call.patientUserId !== client.data.userId) throw new WsException('Acceptation non autorisée.');
    const updated = await (this.prisma as any).telehealthSession.updateMany({
      where: { id: call.id, patientUserId: client.data.userId, status: 'RINGING', expiresAt: { gt: new Date() } },
      data: { status: 'ACTIVE', acceptedAt: new Date(), patientConsentAt: new Date(), transcriptionConsentAt: payload?.transcriptionConsent ? new Date() : null, expiresAt: new Date(Date.now() + 60 * 60_000) },
    });
    if (updated.count !== 1) throw new WsException('Appel expiré ou déjà traité.');
    this.scheduleTelehealthExpiry(call.id, new Date(Date.now() + 60 * 60_000));
    this.server.to(this.userRoom(call.doctorId)).emit('telehealth.accepted', { callId: call.id });
    return { callId: call.id };
  }

  @SubscribeMessage('telehealth.decline')
  async declineTelehealthCall(@MessageBody() payload: { callId?: string; reason?: string }, @ConnectedSocket() client: Socket) {
    const call = await this.getTelehealthCall(payload?.callId, client.data.userId);
    if (call.patientUserId !== client.data.userId) throw new WsException('Refus non autorisé.');
    await this.closeTelehealthCall(call, 'DECLINED', payload.reason, client.data.userId);
  }

  @SubscribeMessage('telehealth.signal')
  async relayTelehealthSignal(@MessageBody() payload: { callId?: string; signal?: unknown }, @ConnectedSocket() client: Socket) {
    const senderId = client.data.userId as string | undefined;
    const call = await this.getTelehealthCall(payload?.callId, senderId);
    if (!senderId || call.status !== 'ACTIVE' || !payload.signal || (senderId !== call.doctorId && senderId !== call.patientUserId)) {
      throw new WsException('Signal de télésanté non autorisé.');
    }
    const signal = normalizeTelehealthSignal(payload.signal);
    if (!signal) throw new WsException('Signal WebRTC invalide ou trop volumineux.');
    const recipientId = senderId === call.doctorId ? call.patientUserId : call.doctorId;
    this.server.to(this.userRoom(recipientId)).emit('telehealth.signal', { callId: call.id, signal });
  }

  @SubscribeMessage('telehealth.end')
  async endTelehealthCall(@MessageBody() payload: { callId?: string }, @ConnectedSocket() client: Socket) {
    const call = await this.getTelehealthCall(payload?.callId, client.data.userId);
    const actorId = client.data.userId as string | undefined;
    if (!actorId || (actorId !== call.doctorId && actorId !== call.patientUserId)) throw new WsException('Fin d’appel non autorisée.');
    await this.closeTelehealthCall(call, 'ENDED', undefined, actorId);
  }

  private async getTelehealthCall(callId?: string, userId?: string): Promise<TelehealthCall> {
    const call = callId ? await (this.prisma as any).telehealthSession.findUnique({ where: { id: callId } }) : null;
    if (!call || !userId || new Date(call.expiresAt).getTime() < Date.now()) {
      if (call) await this.closeTelehealthCall(call, 'EXPIRED', 'TIMEOUT');
      throw new WsException('Appel de télésanté expiré ou introuvable.');
    }
    if (call.status !== 'RINGING' && call.status !== 'ACTIVE') throw new WsException('Cet appel est déjà terminé.');
    return call;
  }

  private async closeTelehealthCall(call: TelehealthCall, status: 'DECLINED' | 'ENDED' | 'EXPIRED' | 'FAILED', reason?: string, endedById?: string) {
    const result = await (this.prisma as any).telehealthSession.updateMany({
      where: { id: call.id, status: { in: ['RINGING', 'ACTIVE'] } },
      data: { status, endedAt: new Date(), endedById: endedById || null, endReason: reason || status },
    });
    if (!result.count) return;
    const payload = { callId: call.id, status: status.toLowerCase(), reason: reason || undefined };
    this.server.to(this.userRoom(call.doctorId)).emit('telehealth.ended', payload);
    this.server.to(this.userRoom(call.patientUserId)).emit('telehealth.ended', payload);
  }

  private scheduleTelehealthExpiry(callId: string, expiresAt: Date) {
    const delay = Math.max(0, Math.min(expiresAt.getTime() - Date.now(), 2_147_000_000));
    setTimeout(() => {
      void (this.prisma as any).telehealthSession.findUnique({ where: { id: callId } })
        .then((call: TelehealthCall | null) => call && this.closeTelehealthCall(call, 'EXPIRED', 'TIMEOUT'))
        .catch(() => undefined);
    }, delay);
  }

  notifyPatientEvent(patientId: string, event: string, payload: unknown) {
    this.notifyToPatient(patientId, event, payload);
  }

  /**
   * Compatibility bridge for legacy services. Unlike the former implementation,
   * it never broadcasts to all sockets: an explicit recipient or patient scope is
   * required. New code must call notifyToUser/notifyToPatient directly.
   */
  notify(event: string, payload: Record<string, unknown> = {}) {
    const recipientId = typeof payload.recipientId === 'string'
      ? payload.recipientId
      : typeof payload.userId === 'string'
        ? payload.userId
        : typeof payload.requestedById === 'string'
          ? payload.requestedById
          : undefined;
    const patientId = typeof payload.patientId === 'string' ? payload.patientId : undefined;
    if (recipientId) return this.notifyToUser(recipientId, event, payload);
    if (patientId) return this.notifyToPatient(patientId, event, payload);
  }

  notifyToUser(userId: string, event: string, payload: any) {
    try {
      if (this.server) this.server.to(this.userRoom(userId)).emit(event, payload);
    } catch (e) {
      // best-effort emit
    }
  }

  notifyToPatient(patientId: string, event: string, payload: unknown) {
    try {
      if (this.server) this.server.to(this.patientRoom(patientId)).emit(event, payload);
    } catch {
      // best-effort emit
    }
  }

  /** A finance signal carries no financial or patient data. Only authenticated
   * users in the correct clinic + finance domain receive it. */
  notifyFinanceClinic(clinicId: string, payload: { resource: 'budget' | 'allocation' | 'investment' | 'payment' | 'invoice' | 'bank-account' | 'bank-statement' | 'bank-reconciliation' | 'journal' | 'refund' }) {
    try {
      if (this.server) this.server.to(this.clinicDomainRoom(clinicId, 'finance')).emit('finance.updated', payload);
    } catch {
      // WebSocket delivery is best-effort; the auditable write remains valid.
    }
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private clinicDomainRoom(clinicId: string, domain: RealtimeDomain) {
    return `clinic:${clinicId}:domain:${domain}`;
  }

  private patientRoom(patientId: string) {
    return `patient:${patientId}`;
  }

  private async registerClient(
    client: Socket,
    user: { id: string; email: string; clinicId: string | null; primaryRole: string | null },
  ) {
    const userId = user.id;
    const wasOffline = !this.socketsByUser.has(userId);
    client.data.userId = userId;
    client.join(this.userRoom(userId));
    const domains = domainsForRole(user.primaryRole);
    if (user.clinicId) {
      domains.forEach((domain) => client.join(this.clinicDomainRoom(user.clinicId!, domain)));
    }

    if (String(user.primaryRole || '').toUpperCase() === 'PATIENT') {
      const ownPatient = user.email
        ? await this.prisma.patient.findUnique({ where: { email: user.email }, select: { id: true } })
        : null;
      if (ownPatient) client.join(this.patientRoom(ownPatient.id));
      const children = await this.prisma.parentChildLink.findMany({
        where: { parentUserId: userId, status: 'ACTIVE', revokedAt: null },
        select: { childPatientId: true },
      });
      children.forEach(({ childPatientId }) => client.join(this.patientRoom(childPatientId)));
    }

    const sockets = this.socketsByUser.get(userId) || new Set<string>();
    sockets.add(client.id);
    this.socketsByUser.set(userId, sockets);

    if (wasOffline) client.emit('user.presence', { online: true });
  }

  private async isUserOnline(userId: string) {
    if (!this.server) return false;
    // allSockets() is adapter-aware: with Redis it queries every backend node,
    // so message delivery state is not incorrectly decided by one local process.
    const sockets = await this.server.in(this.userRoom(userId)).allSockets();
    return sockets.size > 0;
  }

  private async publishDatabaseChange(payload: { model?: string; action?: string; recordId?: string; at?: string }) {
    if (!payload.model || !payload.recordId || !this.server) return;
    const audience = await this.resolveAudience(payload.model, payload.recordId);
    const domain = domainForModel(payload.model);
    const event = {
      model: payload.model,
      action: payload.action || 'update',
      at: payload.at || new Date().toISOString(),
    };
    if (audience.clinicId) this.server.to(this.clinicDomainRoom(audience.clinicId, domain)).emit('realtime.update', event);
    if (audience.patientId) this.server.to(this.patientRoom(audience.patientId)).emit('realtime.update', event);
    audience.userIds.forEach((userId) => this.server.to(this.userRoom(userId)).emit('realtime.update', event));
  }

  private async resolveAudience(model: string, recordId: string): Promise<RealtimeAudience> {
    const none = (): RealtimeAudience => ({ userIds: [] });
    try {
      switch (model) {
        case 'Patient': {
          const item = await this.prisma.patient.findUnique({ where: { id: recordId }, select: { id: true, clinicId: true, receptionistId: true } });
          return item ? { clinicId: item.clinicId || undefined, patientId: item.id, userIds: item.receptionistId ? [item.receptionistId] : [] } : none();
        }
        case 'Appointment': {
          const item = await this.prisma.appointment.findUnique({ where: { id: recordId }, select: { patientId: true, clinicId: true, requestedById: true } });
          return item ? { clinicId: item.clinicId || undefined, patientId: item.patientId, userIds: item.requestedById ? [item.requestedById] : [] } : none();
        }
        case 'Consultation': {
          const item = await this.prisma.consultation.findUnique({ where: { id: recordId }, select: { patientId: true, clinicId: true, providerId: true } });
          return item ? { clinicId: item.clinicId || undefined, patientId: item.patientId, userIds: item.providerId ? [item.providerId] : [] } : none();
        }
        case 'Prescription': {
          const item = await this.prisma.prescription.findUnique({ where: { id: recordId }, select: { patientId: true, clinicId: true, prescriberId: true } });
          return item ? { clinicId: item.clinicId || undefined, patientId: item.patientId, userIds: item.prescriberId ? [item.prescriberId] : [] } : none();
        }
        case 'Hospitalization': {
          const item = await this.prisma.hospitalization.findUnique({ where: { id: recordId }, select: { patientId: true, physicianId: true, nurseInChargeId: true, patient: { select: { clinicId: true } } } });
          return item ? { clinicId: item.patient.clinicId || undefined, patientId: item.patientId, userIds: [item.physicianId, item.nurseInChargeId].filter((id): id is string => Boolean(id)) } : none();
        }
        case 'LabRequest': {
          const item = await this.prisma.labRequest.findUnique({ where: { id: recordId }, select: { patientId: true, clinicId: true, requestedById: true } });
          return item ? { clinicId: item.clinicId || undefined, patientId: item.patientId, userIds: item.requestedById ? [item.requestedById] : [] } : none();
        }
        case 'LabRequestItem': {
          const item = await this.prisma.labRequestItem.findUnique({ where: { id: recordId }, select: { labRequest: { select: { patientId: true, clinicId: true, requestedById: true } }, assignedToId: true } });
          return item ? { clinicId: item.labRequest.clinicId || undefined, patientId: item.labRequest.patientId, userIds: [item.labRequest.requestedById, item.assignedToId].filter((id): id is string => Boolean(id)) } : none();
        }
        case 'LabResult': {
          const item = await this.prisma.labResult.findUnique({ where: { id: recordId }, select: { reportedById: true, labRequest: { select: { patientId: true, clinicId: true, requestedById: true } } } });
          return item ? { clinicId: item.labRequest.clinicId || undefined, patientId: item.labRequest.patientId, userIds: [item.labRequest.requestedById, item.reportedById].filter((id): id is string => Boolean(id)) } : none();
        }
        case 'LabSample': {
          const item = await this.prisma.labSample.findUnique({ where: { id: recordId }, select: { collectedById: true, labRequest: { select: { patientId: true, clinicId: true, requestedById: true } } } });
          return item ? { clinicId: item.labRequest.clinicId || undefined, patientId: item.labRequest.patientId, userIds: [item.labRequest.requestedById, item.collectedById].filter((id): id is string => Boolean(id)) } : none();
        }
        case 'LabReport': {
          const item = await this.prisma.labReport.findUnique({ where: { id: recordId }, select: { issuedById: true, labRequest: { select: { patientId: true, clinicId: true, requestedById: true } } } });
          return item ? { clinicId: item.labRequest.clinicId || undefined, patientId: item.labRequest.patientId, userIds: [item.labRequest.requestedById, item.issuedById].filter((id): id is string => Boolean(id)) } : none();
        }
        case 'ImagingRequest': {
          const item = await this.prisma.imagingRequest.findUnique({ where: { id: recordId }, select: { patientId: true, requestedById: true, patient: { select: { clinicId: true } } } });
          return item ? { clinicId: item.patient.clinicId || undefined, patientId: item.patientId, userIds: item.requestedById ? [item.requestedById] : [] } : none();
        }
        case 'ImagingReport': {
          const item = await this.prisma.imagingReport.findUnique({ where: { id: recordId }, select: { interpretedById: true, imagingRequest: { select: { patientId: true, requestedById: true, patient: { select: { clinicId: true } } } } } });
          return item ? { clinicId: item.imagingRequest.patient.clinicId || undefined, patientId: item.imagingRequest.patientId, userIds: [item.imagingRequest.requestedById, item.interpretedById].filter((id): id is string => Boolean(id)) } : none();
        }
        case 'VitalSign': {
          const item = await this.prisma.vitalSign.findUnique({ where: { id: recordId }, select: { patientId: true, recordedById: true, patient: { select: { clinicId: true } } } });
          return item ? { clinicId: item.patient.clinicId || undefined, patientId: item.patientId, userIds: item.recordedById ? [item.recordedById] : [] } : none();
        }
        case 'NursingCareTask': {
          const item = await this.prisma.nursingCareTask.findUnique({ where: { id: recordId }, select: { assignedNurseId: true, hospitalization: { select: { patientId: true, physicianId: true, patient: { select: { clinicId: true } } } } } });
          return item ? { clinicId: item.hospitalization.patient.clinicId || undefined, patientId: item.hospitalization.patientId, userIds: [item.assignedNurseId, item.hospitalization.physicianId].filter((id): id is string => Boolean(id)) } : none();
        }
        case 'MedicationAdministration': {
          const item = await this.prisma.medicationAdministration.findUnique({ where: { id: recordId }, select: { administeredById: true, hospitalization: { select: { patientId: true, physicianId: true, patient: { select: { clinicId: true } } } } } });
          return item ? { clinicId: item.hospitalization.patient.clinicId || undefined, patientId: item.hospitalization.patientId, userIds: [item.administeredById, item.hospitalization.physicianId].filter((id): id is string => Boolean(id)) } : none();
        }
        case 'Invoice': {
          const item = await this.prisma.invoice.findUnique({ where: { id: recordId }, select: { patientId: true, clinicId: true, issuedById: true } });
          return item ? { clinicId: item.clinicId || undefined, patientId: item.patientId, userIds: item.issuedById ? [item.issuedById] : [] } : none();
        }
        case 'Payment': {
          const item = await this.prisma.payment.findUnique({ where: { id: recordId }, select: { clinicId: true, paidById: true, invoice: { select: { patientId: true } } } });
          return item ? { clinicId: item.clinicId || undefined, patientId: item.invoice.patientId, userIds: item.paidById ? [item.paidById] : [] } : none();
        }
        case 'PharmacyDispense': {
          const item = await this.prisma.pharmacyDispense.findUnique({ where: { id: recordId }, select: { clinicId: true, dispensedById: true, prescription: { select: { patientId: true } } } });
          return item ? { clinicId: item.clinicId || undefined, patientId: item.prescription.patientId, userIds: item.dispensedById ? [item.dispensedById] : [] } : none();
        }
        case 'InvoiceLine': {
          const line = await this.prisma.invoiceLine.findUnique({ where: { id: recordId }, select: { invoiceId: true } });
          if (!line) return none();
          const invoice = await this.prisma.invoice.findUnique({ where: { id: line.invoiceId }, select: { patientId: true, clinicId: true, issuedById: true } });
          return invoice ? { clinicId: invoice.clinicId || undefined, patientId: invoice.patientId, userIds: invoice.issuedById ? [invoice.issuedById] : [] } : none();
        }
        case 'InvoiceDiscountRequest': {
          const item = await this.prisma.invoiceDiscountRequest.findUnique({ where: { id: recordId }, select: { requestedById: true, reviewedById: true, invoice: { select: { patientId: true, clinicId: true } } } });
          return item ? { clinicId: item.invoice.clinicId || undefined, patientId: item.invoice.patientId, userIds: [item.requestedById, item.reviewedById].filter((id): id is string => Boolean(id)) } : none();
        }
        case 'MedicationStock': {
          const item = await this.prisma.medicationStock.findUnique({ where: { id: recordId }, select: { clinicId: true } });
          return item ? { clinicId: item.clinicId || undefined, userIds: [] } : none();
        }
        case 'StockLot': {
          const item = await this.prisma.stockLot.findUnique({ where: { id: recordId }, select: { clinicId: true } });
          return item ? { clinicId: item.clinicId || undefined, userIds: [] } : none();
        }
        case 'StockTransaction': {
          const item = await this.prisma.stockTransaction.findUnique({ where: { id: recordId }, select: { clinicId: true, performedById: true } });
          return item ? { clinicId: item.clinicId || undefined, userIds: item.performedById ? [item.performedById] : [] } : none();
        }
        case 'Employee': {
          const item = await this.prisma.employee.findUnique({ where: { id: recordId }, select: { clinicId: true, userId: true } });
          return item ? { clinicId: item.clinicId || undefined, userIds: item.userId ? [item.userId] : [] } : none();
        }
        case 'Department': {
          const item = await this.prisma.department.findUnique({ where: { id: recordId }, select: { clinicId: true } });
          return item ? { clinicId: item.clinicId || undefined, userIds: [] } : none();
        }
        case 'Service': {
          const item = await this.prisma.service.findUnique({ where: { id: recordId }, select: { clinicId: true } });
          return item ? { clinicId: item.clinicId || undefined, userIds: [] } : none();
        }
        case 'ServiceUnit': {
          const item = await this.prisma.serviceUnit.findUnique({ where: { id: recordId }, select: { clinicId: true } });
          return item ? { clinicId: item.clinicId || undefined, userIds: [] } : none();
        }
        case 'User': {
          const item = await this.prisma.user.findUnique({ where: { id: recordId }, select: { clinicId: true } });
          return item ? { clinicId: item.clinicId || undefined, userIds: [recordId] } : none();
        }
        default:
          return none();
      }
    } catch {
      return none();
    }
  }
}

type RealtimeDomain = 'reception' | 'clinical' | 'laboratory' | 'radiology' | 'pharmacy' | 'billing' | 'finance' | 'administration';
type RealtimeAudience = { clinicId?: string; patientId?: string; userIds: string[] };
type TelehealthCall = {
  id: string;
  consultationId: string;
  doctorId: string;
  patientId: string;
  patientUserId: string;
  status: 'RINGING' | 'ACTIVE' | 'DECLINED' | 'ENDED' | 'EXPIRED' | 'FAILED';
  expiresAt: Date;
};

type SafeTelehealthSignal =
  | { type: 'offer' | 'answer'; sdp: string }
  | { type: 'candidate'; candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null } };

/** Signals are opaque to business logic, but not unbounded or arbitrary JSON. */
function normalizeTelehealthSignal(value: unknown): SafeTelehealthSignal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const signal = value as Record<string, unknown>;
  if ((signal.type === 'offer' || signal.type === 'answer') && typeof signal.sdp === 'string' && signal.sdp.length > 0 && signal.sdp.length <= 100_000) {
    return { type: signal.type, sdp: signal.sdp };
  }
  if (signal.type === 'candidate' && signal.candidate && typeof signal.candidate === 'object' && !Array.isArray(signal.candidate)) {
    const candidate = signal.candidate as Record<string, unknown>;
    if (typeof candidate.candidate !== 'string' || candidate.candidate.length === 0 || candidate.candidate.length > 4_000) return null;
    const candidateValue = candidate.candidate as string;
    const optionalString = (key: string): string | null | undefined =>
      typeof candidate[key] === 'string' ? candidate[key] as string : candidate[key] == null ? null : undefined;
    const optionalNumber = (key: string): number | null | undefined =>
      typeof candidate[key] === 'number' && Number.isInteger(candidate[key]) ? candidate[key] as number : candidate[key] == null ? null : undefined;
    const sdpMid = optionalString('sdpMid');
    const sdpMLineIndex = optionalNumber('sdpMLineIndex');
    const usernameFragment = optionalString('usernameFragment');
    if (sdpMid === undefined || sdpMLineIndex === undefined || usernameFragment === undefined) return null;
    return { type: 'candidate', candidate: { candidate: candidateValue, sdpMid, sdpMLineIndex, usernameFragment } };
  }
  return null;
}

const domainForModel = (model: string): RealtimeDomain => {
  if (['LabRequest', 'LabRequestItem', 'LabResult', 'LabSample', 'LabReport'].includes(model)) return 'laboratory';
  if (['ImagingRequest', 'ImagingReport', 'ImagingCatalogue', 'ImagingEquipment'].includes(model)) return 'radiology';
  if (['Prescription', 'PharmacyDispense', 'Medication', 'MedicationStock', 'StockLot', 'StockTransaction'].includes(model)) return 'pharmacy';
  if (['Invoice', 'InvoiceLine', 'Payment', 'Revenue', 'Expense', 'CashRegister', 'InvoiceDiscountRequest'].includes(model)) return 'billing';
  if (['Patient', 'PatientVisit', 'Appointment'].includes(model)) return 'reception';
  if (['Consultation', 'Hospitalization', 'VitalSign', 'NursingCareTask', 'MedicationAdministration', 'Surgery'].includes(model)) return 'clinical';
  return 'administration';
};

const domainsForRole = (role?: string | null): RealtimeDomain[] => {
  switch (String(role || '').toUpperCase()) {
    case 'SUPER_ADMIN':
    case 'ADMIN': return ['reception', 'clinical', 'laboratory', 'radiology', 'pharmacy', 'billing', 'finance', 'administration'];
    case 'RECEPTIONIST': return ['reception', 'clinical'];
    case 'CASHIER': return ['billing'];
    case 'FINANCE': return ['billing', 'finance'];
    case 'NURSE':
    case 'PHYSICIAN':
    case 'SURGEON':
    case 'ANESTHESIOLOGIST': return ['clinical'];
    case 'LAB_MANAGER':
    case 'LAB_TECHNICIAN': return ['laboratory'];
    case 'RADIOLOGIST': return ['radiology'];
    case 'PHARMACIST': return ['pharmacy'];
    default: return [];
  }
};
