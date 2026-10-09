import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DiagnosticAgentEngineModule } from './diagnostic-agent-engine.module';
import { DiagnosticAgentStandaloneController } from './diagnostic-agent-standalone.controller';
import { DiagnosticAgentServiceGuard } from './diagnostic-agent-service.guard';

/** Dedicated service: no Core module, Prisma client or clinical table. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'service', ttl: 60_000, limit: 60, blockDuration: 60_000 }],
    }),
    DiagnosticAgentEngineModule,
  ],
  controllers: [DiagnosticAgentStandaloneController],
  providers: [
    DiagnosticAgentServiceGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class DiagnosticAgentStandaloneModule {}
