import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClinicalIntelligenceController } from './clinical-intelligence.controller';
import { ClinicalIntelligenceService } from './clinical-intelligence.service';

@Module({ imports: [PrismaModule], controllers: [ClinicalIntelligenceController], providers: [ClinicalIntelligenceService] })
export class ClinicalIntelligenceModule {}
