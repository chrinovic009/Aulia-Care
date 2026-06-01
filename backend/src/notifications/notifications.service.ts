import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService, private readonly gateway: NotificationsGateway) {}

  findAll() {
    return this.prisma.notification.findMany();
  }

  async findOne(id: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) {
      throw new NotFoundException('Notification introuvable');
    }
    return notification;
  }

  async createAndEmit(data: any) {
    const created = await this.prisma.notification.create({ data });
    try {
      this.gateway.notify('notification.created', created);
    } catch (e) {
      // ignore emit errors
    }
    return created;
  }
}
