import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService, private readonly usersService: UsersService) {}

  private async assertConversationAllowed(userId: string, contactId: string) {
    if (!await this.usersService.isDirectMessagingAllowed(userId, contactId)) {
      throw new ForbiddenException('Cette conversation n’est pas autorisée pour votre rôle et votre parcours de soins.');
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
