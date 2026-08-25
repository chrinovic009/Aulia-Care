import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClinicalAIStandaloneModule } from './platform/clinical-ai/clinical-ai-standalone.module';

async function bootstrap() {
  const app = await NestFactory.create(ClinicalAIStandaloneModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors({ origin: false });
  await app.listen(Number(process.env.CLINICAL_AI_PORT || 3100));
}

bootstrap();
