import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DIAGNOSTIC_AGENT_CLIENT, DiagnosticAgentClient } from '../contracts/diagnostic-agent.contract';
import { DiagnosticAgentEngineModule } from './diagnostic-agent-engine.module';
import { DiagnosticAgentEngineService } from './diagnostic-agent-engine.service';
import { RemoteDiagnosticAgentClient } from './remote-diagnostic-agent.client';

/**
 * Core selects either its local portable engine or the exact same contract over
 * HTTPS to a separately deployed Diagnostic Agent process. No caller needs to change.
 */
@Module({
  imports: [ConfigModule, DiagnosticAgentEngineModule],
  providers: [
    {
      provide: DIAGNOSTIC_AGENT_CLIENT,
      inject: [ConfigService, DiagnosticAgentEngineService],
      useFactory: (config: ConfigService, local: DiagnosticAgentEngineService): DiagnosticAgentClient => {
        const endpoint = config.get<string>('AULIA_DIAGNOSTIC_AGENT_URL')?.trim();
        if (!endpoint) return local;
        const secret = config.get<string>('DIAGNOSTIC_AGENT_SERVICE_SECRET');
        if (!secret) throw new Error('DIAGNOSTIC_AGENT_SERVICE_SECRET est requis avec AULIA_DIAGNOSTIC_AGENT_URL.');
        return new RemoteDiagnosticAgentClient(endpoint, secret);
      },
    },
  ],
  exports: [DIAGNOSTIC_AGENT_CLIENT],
})
export class DiagnosticAgentClientModule {}
