import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CLINICAL_AI_CLIENT, ClinicalAIClient } from '../contracts/clinical-ai.contract';
import { ClinicalAIEngineModule } from './clinical-ai-engine.module';
import { ClinicalAIEngineService } from './clinical-ai-engine.service';
import { RemoteClinicalAIClient } from './remote-clinical-ai.client';

/**
 * Core selects either its local portable engine or the exact same contract over
 * HTTPS to a separately deployed IA process. No caller needs to change.
 */
@Module({
  imports: [ConfigModule, ClinicalAIEngineModule],
  providers: [
    {
      provide: CLINICAL_AI_CLIENT,
      inject: [ConfigService, ClinicalAIEngineService],
      useFactory: (config: ConfigService, local: ClinicalAIEngineService): ClinicalAIClient => {
        const endpoint = config.get<string>('AULIA_CLINICAL_AI_URL')?.trim();
        if (!endpoint) return local;
        const secret = config.get<string>('CLINICAL_AI_SERVICE_SECRET');
        if (!secret) throw new Error('CLINICAL_AI_SERVICE_SECRET est requis avec AULIA_CLINICAL_AI_URL.');
        return new RemoteClinicalAIClient(endpoint, secret);
      },
    },
  ],
  exports: [CLINICAL_AI_CLIENT],
})
export class ClinicalAIClientModule {}
