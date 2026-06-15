import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async findConversation(userId: string, contactId: string) {
    return this.prisma.chatMessage.findMany({
      where: {
        deletedAt: null,
        OR: [
          { senderId: userId, recipientId: contactId },
          { senderId: contactId, recipientId: userId },
        ],
      },
      include: {
        sender: { select: { id: true, displayName: true, username: true } },
        recipient: { select: { id: true, displayName: true, username: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }

  async findUnread(userId: string) {
    return this.prisma.chatMessage.findMany({
      where: {
        recipientId: userId,
        status: { in: ['SENT', 'DELIVERED'] },
        deletedAt: null,
      },
      include: {
        sender: { select: { id: true, displayName: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(userId: string, senderId: string, messageIds?: string[]) {
    return this.prisma.chatMessage.updateMany({
      where: {
        recipientId: userId,
        senderId,
        ...(messageIds?.length ? { id: { in: messageIds } } : {}),
        status: { not: 'READ' },
      },
      data: {
        status: 'READ',
        readAt: new Date(),
      },
    });
  }
}
