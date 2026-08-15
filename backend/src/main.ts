import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api");

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

  // Cookies authenticate browser requests. State-changing requests must originate
  // from the configured frontend. API clients send the per-session CSRF value;
  // it is validated whenever present while older internal screens are migrated.
  app.use((req, res, next) => {
    const unsafeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const hasSessionCookie = String(req.headers.cookie || '').includes('aulia_access_token=');
    const exemptPath = ['/api/auth/login', '/api/auth/refresh'].includes(req.path);
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
      (csrfHeader !== undefined && (!csrfCookie || csrfHeader !== csrfCookie))
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
