import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditRead } from '../audit/audit-read.decorator';
import { ClinicalSafetyService } from './clinical-safety.service';
import {
  CheckPrescriptionDto,
  ProposeInteractionRuleDto,
  RecordAllergyDto,
  ResolveAllergyDto,
  RetireRuleDto,
  RuleDecisionDto,
  UpdateMedicationIdentityDto,
} from './dto/clinical-safety.dto';

type AuthedRequest = { user?: { userId?: string; id?: string; role?: string | null } };

const CLINICAL_STAFF = [
  'NURSE', 'PHYSICIAN', 'SURGEON', 'ANESTHESIOLOGIST', 'MIDWIFE', 'PARAMEDIC', 'PHARMACIST',
] as const;

/** Allergies, interaction rules and medication identity. Finer role checks live in the service. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...CLINICAL_STAFF)
@Controller('clinical-safety')
export class ClinicalSafetyController {
  constructor(private readonly safety: ClinicalSafetyService) {}

  @AuditRead('Patient', 'patientId')
  @Get('patients/:patientId/allergies')
  allergies(@Param('patientId', ParseUUIDPipe) patientId: string, @Request() req: AuthedRequest) {
    return this.safety.listAllergies(patientId, req.user);
  }

  @Post('patients/:patientId/allergies')
  recordAllergy(@Param('patientId', ParseUUIDPipe) patientId: string, @Body() dto: RecordAllergyDto, @Request() req: AuthedRequest) {
    return this.safety.recordAllergy(patientId, dto, req.user);
  }

  @Patch('allergies/:id/resolve')
  resolveAllergy(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveAllergyDto, @Request() req: AuthedRequest) {
    return this.safety.resolveAllergy(id, dto, req.user);
  }

  @Post('patients/:patientId/check')
  check(@Param('patientId', ParseUUIDPipe) patientId: string, @Body() dto: CheckPrescriptionDto, @Request() req: AuthedRequest) {
    return this.safety.check(patientId, dto, req.user);
  }

  @Get('interaction-rules')
  rules(@Query('status') status: string | undefined, @Request() req: AuthedRequest) {
    return this.safety.listRules(req.user, status);
  }

  @Post('interaction-rules')
  proposeRule(@Body() dto: ProposeInteractionRuleDto, @Request() req: AuthedRequest) {
    return this.safety.proposeRule(dto, req.user);
  }

  @Patch('interaction-rules/:id/validate')
  validateRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RuleDecisionDto, @Request() req: AuthedRequest) {
    return this.safety.validateRule(id, dto, req.user);
  }

  @Patch('interaction-rules/:id/retire')
  retireRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RetireRuleDto, @Request() req: AuthedRequest) {
    return this.safety.retireRule(id, dto, req.user);
  }

  @Get('medications')
  medications(@Query('search') search: string | undefined, @Request() req: AuthedRequest) {
    return this.safety.listMedicationIdentities(req.user, search);
  }

  @Patch('medications/:id')
  updateMedication(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMedicationIdentityDto, @Request() req: AuthedRequest) {
    return this.safety.updateMedicationIdentity(id, dto, req.user);
  }
}
