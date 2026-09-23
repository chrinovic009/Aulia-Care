import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { DiagnosticAgentRequest } from '../contracts/diagnostic-agent.contract';
import { isDiagnosticAgentRequest } from '../contracts/contract-validation';
import { DiagnosticAgentEngineService } from './diagnostic-agent-engine.service';
import { DiagnosticAgentServiceGuard } from './diagnostic-agent-service.guard';

/** HTTP adapter for the independently deployable Diagnostic Agent layer. */
@Controller('api/v1/diagnostic-agent')
export class DiagnosticAgentStandaloneController {
  constructor(private readonly engine: DiagnosticAgentEngineService) {}

  /** Liveness only: no configuration, request data or model state is exposed. */
  @Get('health/live')
  live() {
    return { status: 'ok', service: 'diagnostic-agent' };
  }

  @Post('execute')
  @UseGuards(DiagnosticAgentServiceGuard)
  execute(@Body() request: DiagnosticAgentRequest) {
    if (!isDiagnosticAgentRequest(request)) {
      throw new BadRequestException('Contrat Diagnostic Agent invalide ou non compatible.');
    }
    return this.engine.execute(request);
  }
}
