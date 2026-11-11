import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DiagnosticAgentClientModule } from '../platform/diagnostic-agent/diagnostic-agent-client.module';
import { IntelligenceController } from './intelligence.controller';
import { IntelligenceService } from './intelligence.service';
import { ClinicContextService } from '../core/clinic-context.service';

@Module({ imports: [PrismaModule, DiagnosticAgentClientModule], controllers: [IntelligenceController], providers: [IntelligenceService, ClinicContextService] })
export class IntelligenceModule {}
