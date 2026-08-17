import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService, private readonly gateway: NotificationsGateway) {}

  async findAll(recipientId?: string, requestedPage?: number, requestedLimit?: number) {
    if (!recipientId) throw new NotFoundException('Utilisateur non identifié.');
    const page = Number.isFinite(requestedPage) && requestedPage! > 0 ? Math.floor(requestedPage!) : 1;
    const limit = Number.isFinite(requestedLimit) && requestedLimit! > 0 ? Math.min(Math.floor(requestedLimit!), 50) : 10;
    const where = { recipientId, deletedAt: null };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async findOne(id: string, recipientId?: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, recipientId } });
    if (!notification) {
      throw new NotFoundException('Notification introuvable');
    }
    return notification;
  }

  async createAndEmit(data: any) {
    const created = await this.prisma.notification.create({ data });
    try {
      if (created.recipientId) this.gateway.notifyToUser(created.recipientId, 'notification.created', created);
      else if (created.patientId) this.gateway.notifyToPatient(created.patientId, 'notification.created', created);
    } catch (e) {
      // ignore emit errors
    }
    return created;
  }
}
