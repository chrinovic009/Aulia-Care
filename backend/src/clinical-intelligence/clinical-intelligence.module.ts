import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClinicalAIClientModule } from '../platform/clinical-ai/clinical-ai-client.module';
import { ClinicalIntelligenceController } from './clinical-intelligence.controller';
import { CoreConsultationSnapshotService } from './core-consultation-snapshot.service';
import { ClinicalIntelligenceService } from './clinical-intelligence.service';

@Module({
  imports: [PrismaModule, ClinicalAIClientModule],
  controllers: [ClinicalIntelligenceController],
  providers: [CoreConsultationSnapshotService, ClinicalIntelligenceService],
})
export class ClinicalIntelligenceModule {}
