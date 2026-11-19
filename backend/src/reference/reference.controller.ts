import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MEDICAL_SPECIALTY_GROUPS } from './medical-specialties';

/** Reference lists shared by every screen (no patient data). */
@UseGuards(JwtAuthGuard)
@Controller('reference')
export class ReferenceController {
  @Get('medical-specialties')
  specialties() {
    return MEDICAL_SPECIALTY_GROUPS;
  }
}
