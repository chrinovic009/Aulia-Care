import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConnectedCareStandaloneModule } from './platform/connected-care/connected-care-standalone.module';

async function bootstrap() {
  const app = await NestFactory.create(ConnectedCareStandaloneModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors({ origin: false });
  await app.listen(Number(process.env.CONNECTED_CARE_PORT || 3200));
}

bootstrap();
