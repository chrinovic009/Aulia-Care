import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ClinicalIntelligenceService } from './clinical-intelligence.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clinical-intelligence')
export class ClinicalIntelligenceController {
  constructor(private readonly service: ClinicalIntelligenceService) {}
  @Get('consultations/:id/suggestions')
  @Roles('SUPER_ADMIN', 'PHYSICIAN')
  suggestions(@Param('id') id: string) { return this.service.suggestionsForConsultation(id); }
}
