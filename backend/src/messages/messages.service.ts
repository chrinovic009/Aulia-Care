import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertConversationAllowed(userId: string, contactId: string) {
    const [user, contact] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { primaryRole: true } }),
      this.prisma.user.findUnique({ where: { id: contactId }, select: { primaryRole: true } }),
    ]);
    const roles = [String(user?.primaryRole || '').toUpperCase(), String(contact?.primaryRole || '').toUpperCase()];
    if (roles.includes('PATIENT') && roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN')) {
      throw new ForbiddenException('La messagerie directe entre administration et patient est interdite.');
    }
  }

  async findConversation(userId: string, contactId: string) {
    await this.assertConversationAllowed(userId, contactId);
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
