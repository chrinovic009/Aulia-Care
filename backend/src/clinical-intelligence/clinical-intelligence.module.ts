import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DiagnosticAgentClientModule } from '../platform/diagnostic-agent/diagnostic-agent-client.module';
import { ClinicalIntelligenceController } from './clinical-intelligence.controller';
import { CoreConsultationSnapshotService } from './core-consultation-snapshot.service';
import { ClinicalIntelligenceService } from './clinical-intelligence.service';

@Module({
  imports: [PrismaModule, DiagnosticAgentClientModule],
  controllers: [ClinicalIntelligenceController],
  providers: [CoreConsultationSnapshotService, ClinicalIntelligenceService],
})
export class ClinicalIntelligenceModule {}
