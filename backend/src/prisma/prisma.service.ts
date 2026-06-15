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
      if (
        params.model &&
        ['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(params.action)
      ) {
        PrismaService.realtimeEvents.emit('db.changed', {
          model: params.model,
          action: params.action,
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
