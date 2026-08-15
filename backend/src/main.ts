import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api");
  app.use(helmet({
    // A strict CSP is introduced after the legacy document-print components
    // are migrated away from inline document.write scripts.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const configService = app.get(ConfigService);
  const corsOrigins = configService
    .getOrThrow<string>('CORS_ORIGIN')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Cookies authenticate browser requests. Every state-changing browser request
  // must also carry the non-HttpOnly per-session CSRF value.
  app.use((req, res, next) => {
    const unsafeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const hasSessionCookie = String(req.headers.cookie || '').includes('aulia_access_token=');
    const exemptPath = ['/api/auth/login'].includes(req.path);
    if (!unsafeMethod || !hasSessionCookie || exemptPath) {
      return next();
    }

    const origin = req.headers.origin;
    const hostOrigin = `${req.protocol}://${req.get('host')}`;
    const csrfCookie = String(req.headers.cookie || '')
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
      return res.status(403).json({ message: 'Requête CSRF refusée' });
    }
    return next();
  });

  const port = configService.get<number>('PORT') || 3000;

  await app.listen(port, "0.0.0.0");

  console.log(`Backend running on port ${port}`);
}

bootstrap();
