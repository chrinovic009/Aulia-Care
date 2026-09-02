import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import helmet from 'helmet';

import { AppModule } from './app.module';
import { RedisIoAdapter } from './notifications/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.use(
    helmet({
      // A strict CSP is introduced after the legacy document-print components
      // are migrated away from inline document.write scripts.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const configService = app.get(ConfigService);

  // ==========================================================
  // REDIS / SOCKET.IO
  // ==========================================================

  const redisUrl = configService.get<string>('REDIS_URL');

  let redisAdapter: RedisIoAdapter | undefined;

  if (redisUrl) {
    redisAdapter = new RedisIoAdapter(app);

    await redisAdapter.connect(redisUrl);

    app.useWebSocketAdapter(redisAdapter);
  }

  // ==========================================================
  // CORS
  // ==========================================================

  const corsOrigins = configService
    .getOrThrow<string>('CORS_ORIGIN')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // ==========================================================
  // CSRF PROTECTION
  // ==========================================================

  // Cookies authenticate browser requests. Every state-changing
  // browser request must also carry the non-HttpOnly per-session
  // CSRF value.
  app.use((req, res, next) => {
    const unsafeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
      req.method,
    );

    // Protect refreshes too: otherwise an expired access cookie
    // would make the browser's refresh operation the only
    // state-changing cookie request that bypasses CSRF verification.
    const cookieHeader = String(req.headers.cookie || '');

    const hasSessionCookie =
      cookieHeader.includes('aulia_access_token=') ||
      cookieHeader.includes('aulia_refresh_token=');

    const exemptPath = ['/api/auth/login'].includes(req.path);

    if (!unsafeMethod || !hasSessionCookie || exemptPath) {
      return next();
    }

    const origin = req.headers.origin;

    const hostOrigin = `${req.protocol}://${req.get('host')}`;

    const csrfCookie = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('aulia_csrf_token='))
      ?.slice('aulia_csrf_token='.length);

    const csrfHeader = req.headers['x-csrf-token'];

    if (
      !origin ||
      (!corsOrigins.includes(origin) && origin !== hostOrigin) ||
      !csrfHeader ||
      !csrfCookie ||
      csrfHeader !== csrfCookie
    ) {
      return res.status(403).json({
        message: 'Requête CSRF refusée',
      });
    }

    return next();
  });

  // ==========================================================
  // SERVER
  // ==========================================================

  const port = configService.get<number>('PORT') || 3000;

  await app.listen(port, '0.0.0.0');

  console.log(`Backend running on port ${port}`);

  // ==========================================================
  // GRACEFUL SHUTDOWN
  // ==========================================================

  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    console.log(`Received ${signal}. Shutting down gracefully...`);

    try {
      if (redisAdapter) {
        await redisAdapter.close()
      }
      
      await app.close();

      console.log('Backend shutdown completed');
    } catch (error) {
      console.error('Error during backend shutdown:', error);

      process.exitCode = 1;
    }
  };

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start backend:', error);

  process.exitCode = 1;
});