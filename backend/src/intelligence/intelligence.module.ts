import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClinicalAIClientModule } from '../platform/clinical-ai/clinical-ai-client.module';
import { IntelligenceController } from './intelligence.controller';
import { IntelligenceService } from './intelligence.service';

@Module({ imports: [PrismaModule, ClinicalAIClientModule], controllers: [IntelligenceController], providers: [IntelligenceService] })
export class IntelligenceModule {}
