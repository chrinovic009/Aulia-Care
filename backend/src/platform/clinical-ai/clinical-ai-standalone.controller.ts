import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ClinicalAIRequest } from '../contracts/clinical-ai.contract';
import { isClinicalAIRequest } from '../contracts/contract-validation';
import { ClinicalAIEngineService } from './clinical-ai-engine.service';
import { ClinicalAIServiceGuard } from './clinical-ai-service.guard';

/** HTTP adapter for the independently deployable IA layer. */
@Controller('api/v1/clinical-ai')
@UseGuards(ClinicalAIServiceGuard)
export class ClinicalAIStandaloneController {
  constructor(private readonly engine: ClinicalAIEngineService) {}

  @Post('execute')
  execute(@Body() request: ClinicalAIRequest) {
    if (!isClinicalAIRequest(request)) throw new BadRequestException('Contrat Clinical AI invalide ou non compatible.');
    return this.engine.execute(request);
  }
}
