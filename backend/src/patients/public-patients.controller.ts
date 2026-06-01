import { Body, Controller, Get, Post, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { CreateAdmissionDto } from './dto/create-admission.dto';

/**
 * Public controller for patient reception operations
 * These routes do NOT require authentication
 */
@Controller('public/patients')
export class PublicPatientsController {
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

  /**
   * Public admission endpoint - no authentication required
   */
  @HttpCode(HttpStatus.CREATED)
  @Post('admissions')
  async createAdmission(@Body() createAdmissionDto: CreateAdmissionDto) {
    return this.patientsService.createAdmission(createAdmissionDto, null);
  }
}

