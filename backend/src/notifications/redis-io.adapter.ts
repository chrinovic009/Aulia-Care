import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import { ServerOptions } from 'socket.io';

/**
 * Shares Socket.IO rooms between backend instances. It is intentionally opt-in:
 * local development remains dependency-free until REDIS_URL is configured.
 */
export class RedisIoAdapter extends IoAdapter {
  private pubClient?: RedisClientType;
  private subClient?: RedisClientType;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connect(url: string) {
    this.pubClient = createClient({ url });
    this.subClient = this.pubClient.duplicate();
    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.pubClient && this.subClient) server.adapter(createAdapter(this.pubClient, this.subClient));
    return server;
  }

  async close() {
    await Promise.all([this.pubClient?.quit(), this.subClient?.quit()]);
  }
}
