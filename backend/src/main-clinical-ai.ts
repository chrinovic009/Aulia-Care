import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { ClinicalAIStandaloneModule } from './platform/clinical-ai/clinical-ai-standalone.module';

async function bootstrap() {
  const app = await NestFactory.create(
    ClinicalAIStandaloneModule,
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
    process.env.CLINICAL_AI_PORT || 3100,
  );

  await app.listen(
    port,
    '0.0.0.0',
  );

  console.log(
    `Clinical AI running on port ${port}`,
  );
}

bootstrap().catch((error) => {
  console.error(
    'Failed to start Clinical AI:',
    error,
  );

  process.exitCode = 1;
});