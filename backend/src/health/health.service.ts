import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Socket } from 'node:net';
import { URL } from 'node:url';

@Injectable()
export class HealthService {
  private readonly dependencyTimeoutMs = 2000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`Healthcheck timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([
        operation,
        timeoutPromise,
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.withTimeout(
        this.prisma.$queryRaw`SELECT 1`,
        this.dependencyTimeoutMs,
      );

      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (!redisUrl) {
      return false;
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(redisUrl);
    } catch {
      return false;
    }

    const host = parsedUrl.hostname;
    const port = Number(parsedUrl.port || 6379);

    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      const socket = new Socket();

      let settled = false;

      const finish = (result: boolean) => {
        if (settled) {
          return;
        }

        settled = true;

        socket.removeAllListeners();
        socket.destroy();

        resolve(result);
      };

      socket.setTimeout(this.dependencyTimeoutMs);

      socket.once('connect', () => {
        finish(true);
      });

      socket.once('timeout', () => {
        finish(false);
      });

      socket.once('error', () => {
        finish(false);
      });

      try {
        socket.connect({
          host,
          port,
        });
      } catch {
        finish(false);
      }
    });
  }

  async checkReadiness() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const ready = database && redis;

    return {
      status: ready ? 'ready' : 'not_ready',
      service: 'aulia-care-backend',
      checks: {
        database,
        redis,
      },
      timestamp: new Date().toISOString(),
    };
  }
}