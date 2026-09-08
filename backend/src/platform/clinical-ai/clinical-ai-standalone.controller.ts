import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ClinicalAIRequest } from '../contracts/clinical-ai.contract';
import { isClinicalAIRequest } from '../contracts/contract-validation';
import { ClinicalAIEngineService } from './clinical-ai-engine.service';
import { ClinicalAIServiceGuard } from './clinical-ai-service.guard';

/** HTTP adapter for the independently deployable IA layer. */
@Controller('api/v1/clinical-ai')
export class ClinicalAIStandaloneController {
  constructor(private readonly engine: ClinicalAIEngineService) {}

  /** Liveness only: no configuration, request data or model state is exposed. */
  @Get('health/live')
  live() {
    return { status: 'ok', service: 'clinical-ai' };
  }

  @Post('execute')
  @UseGuards(ClinicalAIServiceGuard)
  execute(@Body() request: ClinicalAIRequest) {
    if (!isClinicalAIRequest(request)) throw new BadRequestException('Contrat Clinical AI invalide ou non compatible.');
    return this.engine.execute(request);
  }
}
