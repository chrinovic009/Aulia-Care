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
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly socketsByUser = new Map<string, Set<string>>();

  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit() {
    PrismaService.realtimeEvents.on('db.changed', (payload) => {
      this.server?.emit('db.changed', payload);
    });
  }

  handleConnection(client: Socket) {
    const userId = client.handshake.auth?.userId || client.handshake.query?.userId;
    if (typeof userId === 'string' && userId) {
      this.registerClient(client, userId);
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
      this.server.emit('user.presence', { userId, online: false });
    }
  }

  @SubscribeMessage('user.join')
  handleUserJoin(@MessageBody() payload: { userId?: string }, @ConnectedSocket() client: Socket) {
    if (payload?.userId) {
      this.registerClient(client, payload.userId);
    }
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
    if (!payload?.senderId || !payload?.recipientId || !payload?.text?.trim()) {
      throw new WsException('Message invalide');
    }

    if (client.data.userId && client.data.userId !== payload.senderId) {
      throw new WsException('Expediteur non autorise');
    }

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
    const contacts = await this.usersService.findContactsForRole(sender.primaryRole, sender.id);
    const isAllowedRecipient = contacts.some(
      (contact) => contact.id === payload.recipientId && contact.type === (payload.recipientType || 'USER'),
    );

    if (!isAllowedRecipient) {
      throw new WsException('Destinataire non autorise');
    }

    const delivered = this.isUserOnline(payload.recipientId);
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
    const readerId = payload?.readerId || client.data.userId;
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
  handleTyping(
    @MessageBody() payload: { senderId?: string; recipientId?: string; isTyping?: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const senderId = payload?.senderId || client.data.userId;
    if (!senderId || !payload?.recipientId) return;
    if (client.data.userId && client.data.userId !== senderId) return;

    this.server.to(this.userRoom(payload.recipientId)).emit('message.typing', {
      senderId,
      isTyping: Boolean(payload.isTyping),
    });
  }

  notify(event: string, payload: any) {
    try {
      if (this.server) this.server.emit(event, payload);
    } catch (e) {
      // best-effort emit
    }
  }

  notifyToUser(userId: string, event: string, payload: any) {
    try {
      if (this.server) this.server.to(this.userRoom(userId)).emit(event, payload);
    } catch (e) {
      // best-effort emit
    }
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private registerClient(client: Socket, userId: string) {
    const wasOffline = !this.socketsByUser.has(userId);
    client.data.userId = userId;
    client.join(this.userRoom(userId));

    const sockets = this.socketsByUser.get(userId) || new Set<string>();
    sockets.add(client.id);
    this.socketsByUser.set(userId, sockets);

    if (wasOffline) {
      this.server.emit('user.presence', { userId, online: true });
    }
  }

  private isUserOnline(userId: string) {
    return (this.socketsByUser.get(userId)?.size || 0) > 0;
  }
}
