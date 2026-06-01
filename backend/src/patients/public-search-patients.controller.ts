import { Controller, Get, Query } from '@nestjs/common';
import { PatientsService } from './patients.service';

/**
 * Public controller for patient search operations
 * These routes do NOT require authentication
 */
@Controller('public/patients')
export class PublicSearchPatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  /**
   * Public patient search endpoint - no authentication required
   * Allows searching for existing patients by name, email, or phone
   */
  @Get('search')
  async search(
    @Query('email') email?: string,
    @Query('phone') phone?: string,
    @Query('name') name?: string
  ) {
    return this.patientsService.search({ email, phone, name });
  }
}
