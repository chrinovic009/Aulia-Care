import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IDEMPOTENCY_RETENTION_DAYS } from './idempotency';

const HOUR_MS = 3_600_000;

/** Stored write results hold clinical data: they are kept only as long as a replay is plausible. */
@Injectable()
export class IdempotencyRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdempotencyRetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.purge(), HOUR_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async purge(now = new Date()) {
    try {
      const { count } = await this.prisma.idempotencyRecord.deleteMany({
        where: { createdAt: { lt: new Date(now.getTime() - IDEMPOTENCY_RETENTION_DAYS * 24 * HOUR_MS) } },
      });
      if (count) this.logger.log(`${count} résultat(s) d’idempotence expiré(s) supprimé(s).`);
    } catch (error) {
      this.logger.warn(`Purge des résultats d’idempotence impossible : ${error instanceof Error ? error.message : error}`);
    }
  }
}
