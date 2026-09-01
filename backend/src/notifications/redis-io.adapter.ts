import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);

  private pubClient?: RedisClientType;
  private subClient?: RedisClientType;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connect(url: string) {
    this.pubClient = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => {
          const delay = Math.min(retries * 500, 5000);
          return delay;
        },
      },
    });

    this.subClient = this.pubClient.duplicate();

    this.pubClient.on('error', (error) => {
      this.logger.error(
        `Redis publisher error: ${error.message}`,
      );
    });

    this.subClient.on('error', (error) => {
      this.logger.error(
        `Redis subscriber error: ${error.message}`,
      );
    });

    this.pubClient.on('reconnecting', () => {
      this.logger.warn('Redis publisher reconnecting...');
    });

    this.subClient.on('reconnecting', () => {
      this.logger.warn('Redis subscriber reconnecting...');
    });

    this.pubClient.on('ready', () => {
      this.logger.log('Redis publisher ready');
    });

    this.subClient.on('ready', () => {
      this.logger.log('Redis subscriber ready');
    });

    await Promise.all([
      this.pubClient.connect(),
      this.subClient.connect(),
    ]);

    this.logger.log('Socket.IO Redis adapter connected');
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);

    if (this.pubClient && this.subClient) {
      server.adapter(
        createAdapter(
          this.pubClient,
          this.subClient,
        ),
      );
    }

    return server;
  }

  async close() {
    const clients = [
      this.pubClient,
      this.subClient,
    ].filter(
      (client): client is RedisClientType => Boolean(client),
    );

    await Promise.allSettled(
      clients.map(async (client) => {
        if (client.isOpen) {
          await client.quit();
        }
      }),
    );

    this.pubClient = undefined;
    this.subClient = undefined;

    this.logger.log('Socket.IO Redis adapter disconnected');
  }
}