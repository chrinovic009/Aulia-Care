import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import { ServerOptions } from 'socket.io';

const STARTUP_CONNECTION_TIMEOUT_MS = 10_000;

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);

  private pubClient?: RedisClientType;
  private subClient?: RedisClientType;

  private closing = false;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  private destroyClient(client?: RedisClientType) {
    // destroy() also cancels a pending reconnect. Calling quit() here would
    // wait for a connection that is precisely the dependency unavailable at
    // startup.
    client?.destroy();
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
      this.logger.warn(
        'Redis publisher reconnecting...',
      );
    });

    this.subClient.on('reconnecting', () => {
      this.logger.warn(
        'Redis subscriber reconnecting...',
      );
    });

    this.pubClient.on('ready', () => {
      this.logger.log(
        'Redis publisher ready',
      );
    });

    this.subClient.on('ready', () => {
      this.logger.log(
        'Redis subscriber ready',
      );
    });

    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.all([
          this.pubClient.connect(),
          this.subClient.connect(),
        ]),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`Redis Socket.IO adapter did not connect within ${STARTUP_CONNECTION_TIMEOUT_MS}ms.`)),
            STARTUP_CONNECTION_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (error) {
      this.destroyClient(this.pubClient);
      this.destroyClient(this.subClient);
      this.pubClient = undefined;
      this.subClient = undefined;
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    this.logger.log(
      'Socket.IO Redis adapter connected',
    );
  }

  createIOServer(
    port: number,
    options?: ServerOptions,
  ) {
    const server = super.createIOServer(
      port,
      options,
    );

    if (
      this.pubClient &&
      this.subClient
    ) {
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
    if (this.closing) {
      return;
    }

    this.closing = true;

    const clients = [
      this.pubClient,
      this.subClient,
    ].filter(
      (
        client,
      ): client is RedisClientType =>
        Boolean(client),
    );

    try {
      await Promise.allSettled(
        clients.map(async (client) => {
          if (client.isOpen) {
            await client.quit();
          }
        }),
      );

      this.pubClient = undefined;
      this.subClient = undefined;

      this.logger.log(
        'Socket.IO Redis adapter disconnected',
      );
    } finally {
      this.closing = false;
    }
  }
}
