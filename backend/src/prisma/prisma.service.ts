import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  static readonly realtimeEvents = new EventEmitter();

  async onModuleInit() {
    await this.$connect();
    this.$use(async (params, next) => {
      const result = await next(params);
      const recordId = typeof (result as { id?: unknown } | null)?.id === 'string'
        ? (result as { id: string }).id
        : typeof (params.args as { where?: { id?: unknown } } | undefined)?.where?.id === 'string'
          ? String((params.args as { where: { id: string } }).where.id)
          : null;
      if (params.model && recordId && ['create', 'update', 'upsert', 'delete'].includes(params.action)) {
        PrismaService.realtimeEvents.emit('db.changed', {
          model: params.model,
          action: params.action,
          recordId,
          at: new Date().toISOString(),
        });
      }
      return result;
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
