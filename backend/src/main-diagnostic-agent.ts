import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { DiagnosticAgentStandaloneModule } from './platform/diagnostic-agent/diagnostic-agent-standalone.module';

async function bootstrap() {
  const app = await NestFactory.create(
    DiagnosticAgentStandaloneModule,
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
    process.env.DIAGNOSTIC_AGENT_PORT || 3100,
  );

  await app.listen(
    port,
    '0.0.0.0',
  );

  console.log(
    `Aulia Care Diagnostic Agent running on port ${port}`,
  );
}

bootstrap().catch((error) => {
  console.error(
    'Failed to start Aulia Care Diagnostic Agent:',
    error,
  );

  process.exitCode = 1;
});
