import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { ConnectedCareStandaloneModule } from './platform/connected-care/connected-care-standalone.module';

async function bootstrap() {
  const app = await NestFactory.create(
    ConnectedCareStandaloneModule,
  );

  // ==========================================================
  // GRACEFUL SHUTDOWN
  // ==========================================================

  app.enableShutdownHooks([
    'SIGTERM',
    'SIGINT',
  ]);

  // ==========================================================
  // VALIDATION
  // ==========================================================

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Service interne uniquement.
  app.enableCors({
    origin: false,
  });

  // ==========================================================
  // SERVER
  // ==========================================================

  const port = Number(
    process.env.CONNECTED_CARE_PORT || 3200,
  );

  await app.listen(
    port,
    '0.0.0.0',
  );

  console.log(
    `Connected Care running on port ${port}`,
  );
}

bootstrap().catch((error) => {
  console.error(
    'Failed to start Connected Care:',
    error,
  );

  process.exitCode = 1;
});