import { Module } from '@nestjs/common';
import { DiagnosticAgentEngineService } from './diagnostic-agent-engine.service';

/** Standalone Diagnostic Agent module: no Prisma, Core module or frontend dependency. */
@Module({
  providers: [DiagnosticAgentEngineService],
  exports: [DiagnosticAgentEngineService],
})
export class DiagnosticAgentEngineModule {}
