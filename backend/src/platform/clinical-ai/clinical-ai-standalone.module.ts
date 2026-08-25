import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ClinicalAIEngineModule } from './clinical-ai-engine.module';
import { ClinicalAIStandaloneController } from './clinical-ai-standalone.controller';
import { ClinicalAIServiceGuard } from './clinical-ai-service.guard';

/**
 * A deployable IA application: no Core module, Prisma client or clinical table.
 * Start it with `src/main-clinical-ai.ts` in a dedicated process/container.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({ throttlers: [{ name: 'service', ttl: 60_000, limit: 60, blockDuration: 60_000 }] }),
    ClinicalAIEngineModule,
  ],
  controllers: [ClinicalAIStandaloneController],
  providers: [ClinicalAIServiceGuard, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ClinicalAIStandaloneModule {}
