import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Verifies that both users are allowed to communicate and returns
   * the clinic tenant derived from the authenticated user.
   *
   * The clinicId is always resolved server-side and is never trusted
   * from a client request.
   */
  private async assertConversationAllowed(
    userId: string,
    contactId: string,
  ): Promise<string> {
    const allowed = await this.usersService.isDirectMessagingAllowed(
      userId,
      contactId,
    );

    if (!allowed) {
      throw new ForbiddenException(
        'Cette conversation n’est pas autorisée pour votre rôle, votre établissement ou votre parcours de soins.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        clinicId: true,
        status: true,
        deletedAt: true,
      },
    });

    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.deletedAt !== null ||
      !user.clinicId
    ) {
      throw new ForbiddenException(
        'Aucun établissement actif n’est associé à cet utilisateur.',
      );
    }

    return user.clinicId;
  }

  async findConversation(userId: string, contactId: string) {
    const clinicId = await this.assertConversationAllowed(
      userId,
      contactId,
    );

    return this.prisma.chatMessage.findMany({
      where: {
        clinicId,
        deletedAt: null,
        OR: [
          {
            senderId: userId,
            recipientId: contactId,
          },
          {
            senderId: contactId,
            recipientId: userId,
          },
        ],
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            username: true,
          },
        },
        recipient: {
          select: {
            id: true,
            displayName: true,
            username: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 200,
    });
  }

  async findUnread(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        clinicId: true,
        status: true,
        deletedAt: true,
      },
    });

    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.deletedAt !== null ||
      !user.clinicId
    ) {
      throw new ForbiddenException(
        'Aucun établissement actif n’est associé à cet utilisateur.',
      );
    }

    const unread = await this.prisma.chatMessage.findMany({
      where: {
        clinicId: user.clinicId,
        recipientId: userId,
        status: {
          in: ['SENT', 'DELIVERED'],
        },
        deletedAt: null,
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            username: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    const allowed = await Promise.all(
      unread.map(async (message) => ({
        message,
        permitted:
          await this.usersService.isDirectMessagingAllowed(
            userId,
            message.senderId,
          ),
      })),
    );

    return allowed
      .filter((item) => item.permitted)
      .map((item) => item.message);
  }

  async markRead(
    userId: string,
    senderId: string,
    messageIds?: string[],
  ) {
    const clinicId = await this.assertConversationAllowed(
      userId,
      senderId,
    );

    return this.prisma.chatMessage.updateMany({
      where: {
        clinicId,
        recipientId: userId,
        senderId,
        ...(messageIds?.length
          ? {
              id: {
                in: messageIds,
              },
            }
          : {}),
        status: {
          not: 'READ',
        },
        deletedAt: null,
      },
      data: {
        status: 'READ',
        readAt: new Date(),
      },
    });
  }
}