import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DiagnosticAgentClientModule } from '../platform/diagnostic-agent/diagnostic-agent-client.module';
import { IntelligenceController } from './intelligence.controller';
import { IntelligenceService } from './intelligence.service';

@Module({ imports: [PrismaModule, DiagnosticAgentClientModule], controllers: [IntelligenceController], providers: [IntelligenceService] })
export class IntelligenceModule {}
