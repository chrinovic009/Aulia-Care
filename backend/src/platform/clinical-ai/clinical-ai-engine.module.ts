import { Module } from '@nestjs/common';
import { ClinicalAIEngineService } from './clinical-ai-engine.service';

/** Standalone IA module: no Prisma, Core module or frontend dependency. */
@Module({
  providers: [ClinicalAIEngineService],
  exports: [ClinicalAIEngineService],
})
export class ClinicalAIEngineModule {}
